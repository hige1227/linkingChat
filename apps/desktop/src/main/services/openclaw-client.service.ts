import { OpenClawWsClient } from './openclaw-ws-client';
import { app } from 'electron';
import { join } from 'path';

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

  /**
   * 连接到 OpenClaw Gateway
   */
  async connect(config: GatewayConnectionConfig): Promise<void> {
    if (this.client && this.isConnected) {
      console.log('[OpenClaw] Already connected');
      return;
    }

    this.connectionConfig = config;

    console.log(`[OpenClaw] Connecting to Gateway at ${config.url} (token: ${config.token.slice(0, 8)}...)`);

    this.client = new OpenClawWsClient({
      url: config.url,
      token: config.token,
      deviceIdentityPath: join(app.getPath('userData'), '.openclaw', 'device-identity.json'),
    });

    try {
      const helloOk = await this.client.connect();
      this.isConnected = true;
      console.log(`[OpenClaw] Connected to Gateway successfully (v${helloOk.server?.version ?? '?'})`);
    } catch (error) {
      this.isConnected = false;
      this.client = null;
      console.error('[OpenClaw] Failed to connect:', error);
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
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
   * 获取底层客户端（供高级用例使用）
   */
  getClient(): OpenClawWsClient | null {
    return this.client;
  }
}

// 单例实例
export const openClawClientService = new OpenClawClientService();
