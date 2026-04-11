import { OpenClawWsClient } from './openclaw-ws-client';
import { app } from 'electron';
import { join } from 'path';
import { execSync } from 'child_process';

/**
 * OpenClaw Gateway 连接配置
 */
export interface GatewayConnectionConfig {
  url: string;
  token: string;
}

/**
 * OpenClaw Client Service
 *
 * 管理 Desktop 与 OpenClaw Gateway 的连接：
 * - 连接管理
 * - 命令执行
 * - 自动重连
 */
export class OpenClawClientService {
  private client: OpenClawWsClient | null = null;
  private connectionConfig: GatewayConnectionConfig | null = null;
  private isConnected = false;
  private reconnecting = false;
  private onStatusChange: ((connected: boolean) => void) | null = null;

  /** Register a callback for connection status changes (used by IPC layer) */
  setStatusChangeHandler(handler: (connected: boolean) => void): void {
    this.onStatusChange = handler;
  }

  /**
   * 连接到 OpenClaw Gateway
   */
  async connect(config: GatewayConnectionConfig, maxRetries = 5): Promise<void> {
    if (this.client && this.isConnected) {
      console.log('[OpenClaw] Already connected');
      return;
    }

    this.connectionConfig = config;

    console.log(`[OpenClaw] Connecting to Gateway at ${config.url} (auth: ${config.token ? 'token' : 'none'})`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.client = new OpenClawWsClient({
        url: config.url,
        token: config.token,
        deviceIdentityPath: join(app.getPath('userData'), '.openclaw', 'device-identity.json'),
        onClose: () => this.handleUnexpectedClose(),
      });

      try {
        const helloOk = await this.client.connect();
        this.isConnected = true;
        console.log(`[OpenClaw] Connected to Gateway successfully (v${helloOk.server?.version ?? '?'})`);
        return;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);

        // Auto-approve device pairing on first connection
        if (msg.includes('pairing required') || msg.includes('NOT_PAIRED')) {
          console.log('[OpenClaw] Device pairing required, auto-approving...');
          const approved = await this.autoApproveDevice(config);
          if (approved) {
            // Count pairing as an attempt, retry immediately
            continue;
          }
        }

        if (attempt < maxRetries) {
          const delay = attempt * 2000; // 2s, 4s
          console.log(`[OpenClaw] Connect attempt ${attempt}/${maxRetries} failed (${msg}), retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        this.isConnected = false;
        this.client = null;
        console.error('[OpenClaw] Failed to connect after all retries:', error);
        throw error;
      }
    }
  }

  /**
   * 断开连接（用户主动断开，不触发重连）
   */
  async disconnect(): Promise<void> {
    this.reconnecting = false; // prevent auto-reconnect
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch (error) {
        console.error('[OpenClaw] Error during disconnect:', error);
      }
      this.client = null;
      this.isConnected = false;
      console.log('[OpenClaw] Disconnected from Gateway');
    }
  }

  /**
   * Handle unexpected WS close — auto-reconnect with backoff
   */
  private async handleUnexpectedClose(): Promise<void> {
    if (this.reconnecting || !this.connectionConfig) return;
    this.isConnected = false;
    this.client = null;
    this.onStatusChange?.(false);
    console.log('[OpenClaw] Connection lost, will auto-reconnect...');

    this.reconnecting = true;
    const delays = [2000, 5000, 10000, 20000, 30000]; // backoff

    for (let i = 0; i < delays.length; i++) {
      if (!this.reconnecting) return; // disconnect() was called
      console.log(`[OpenClaw] Reconnect attempt ${i + 1}/${delays.length} in ${delays[i] / 1000}s...`);
      await new Promise((r) => setTimeout(r, delays[i]));
      if (!this.reconnecting) return;

      try {
        await this.connect(this.connectionConfig!, 1);
        this.reconnecting = false;
        this.onStatusChange?.(true);
        console.log('[OpenClaw] Reconnected successfully');
        return;
      } catch {
        // continue to next attempt
      }
    }

    this.reconnecting = false;
    console.error('[OpenClaw] Auto-reconnect failed after all attempts');
  }

  /**
   * 检查是否已连接
   */
  isClientConnected(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * 获取当前连接信息
   */
  getConnectionInfo(): { url: string; connected: boolean } | null {
    if (!this.connectionConfig) {
      return null;
    }
    return {
      url: this.connectionConfig.url,
      connected: this.isConnected,
    };
  }

  /**
   * 发送消息给 Agent（用于测试连接）
   */
  async sendMessage(message: string): Promise<string> {
    if (!this.client || !this.isConnected) {
      throw new Error('Not connected to Gateway');
    }

    try {
      const response = await this.client.chatSync(message);
      return response;
    } catch (error) {
      console.error('[OpenClaw] Error sending message:', error);
      throw error;
    }
  }

  /**
   * Auto-approve device pairing via CLI.
   * Only needed on first connection — pairing persists in ~/.openclaw/
   */
  private async autoApproveDevice(config: GatewayConnectionConfig): Promise<boolean> {
    try {
      const cliPath = require.resolve('openclaw').replace(/dist[/\\]index\.js$/, '') + 'openclaw.mjs';
      const wsUrl = config.url.replace(/^http/, 'ws');

      // List pending devices
      const listOutput = execSync(
        `node "${cliPath}" devices list --json --url "${wsUrl}" --token "${config.token}"`,
        { timeout: 10_000, encoding: 'utf8', env: { ...process.env, OPENCLAW_GATEWAY_TOKEN: config.token } },
      );

      const data = JSON.parse(listOutput);
      const pending = data?.pending || [];
      if (pending.length === 0) {
        console.log('[OpenClaw] No pending devices to approve');
        return false;
      }

      // Approve the first pending device (should be ours)
      const requestId = pending[0].requestId;
      console.log(`[OpenClaw] Approving device: ${requestId}`);

      execSync(
        `node "${cliPath}" devices approve "${requestId}" --url "${wsUrl}" --token "${config.token}"`,
        { timeout: 10_000, encoding: 'utf8', env: { ...process.env, OPENCLAW_GATEWAY_TOKEN: config.token } },
      );

      console.log('[OpenClaw] Device approved successfully');
      return true;
    } catch (err) {
      console.error('[OpenClaw] Auto-approve failed:', err instanceof Error ? err.message : err);
      return false;
    }
  }

  /**
   * 获取底层客户端（供高级用例使用）
   */
  getClient(): OpenClawWsClient | null {
    return this.client;
  }
}

// 单例实例
export const openClawClientService = new OpenClawClientService();
