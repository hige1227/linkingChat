import { io, type Socket } from 'socket.io-client';
import { BrowserWindow, app } from 'electron';
import { AuthStore } from './auth-store.service';
import { openClawClientService } from './openclaw-client.service';
import { CommandExecutor, type CommandResult } from './command-executor.service';

const PROD_API = 'https://linkchat-api.matrix-ai.com.cn';
import { isDangerousCommand } from '../utils/command-blacklist';
import { getDeviceId, getDeviceName, getPlatform } from '../utils/platform';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  DeviceCommandPayload,
  DeviceResultPayload,
  WsEnvelope,
} from '@linkingchat/ws-protocol';

type DeviceSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface CommandLogEntry {
  commandId: string;
  action: string;
  type: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'blocked';
  output?: string;
  exitCode?: number;
  executionTimeMs?: number;
  receivedAt: string;
  completedAt?: string;
}

export class WsClientService {
  private socket: DeviceSocket | null = null;
  private mainWindow: BrowserWindow | null = null;
  private commandLog: CommandLogEntry[] = [];
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' =
    'disconnected';
  private executor = new CommandExecutor();
  private connectErrorCount = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  private deviceId = getDeviceId();
  private deviceName = getDeviceName();
  private platform = getPlatform();

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  getStatus(): string {
    return this.connectionStatus;
  }

  getDeviceInfo() {
    return {
      deviceId: this.deviceId,
      name: this.deviceName,
      platform: this.platform,
    };
  }

  getCommandLog(): CommandLogEntry[] {
    return this.commandLog;
  }

  connect(): void {
    const tokens = AuthStore.load();
    if (!tokens) {
      console.error('[WS] No JWT token found, cannot connect');
      return;
    }

    const WS_URL = process.env.WS_URL || process.env.VITE_WS_URL || (app.isPackaged ? PROD_API : 'http://localhost:3008');

    this.updateStatus('connecting');

    this.socket = io(`${WS_URL}/device`, {
      auth: {
        token: tokens.accessToken,
        deviceId: this.deviceId,
        deviceType: 'desktop',
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      reconnectionAttempts: Infinity,
    }) as DeviceSocket;

    this.setupEventListeners();
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.stopRefreshTimer();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.updateStatus('disconnected');
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.connectErrorCount = 0;
      console.log('[WS] Connected to Cloud Brain');
      this.updateStatus('connected');
      this.registerDevice();
      this.startHeartbeat();
      this.scheduleTokenRefresh();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[WS] Disconnected:', reason);
      this.stopHeartbeat();
      this.updateStatus('disconnected');
    });

    this.socket.on('connect_error', (err) => {
      console.error('[WS] Connection error:', err.message);
      this.updateStatus('disconnected');
      this.connectErrorCount++;
      if (this.connectErrorCount <= 3) {
        this.attemptTokenRefresh();
      }
    });

    this.socket.on('device:command:execute', (data: DeviceCommandPayload) => {
      this.handleCommandExecute(data);
    });

    this.socket.on('system:error', (err) => {
      console.error('[WS] System error:', err.code, err.message);
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('device:heartbeat', {
          deviceId: this.deviceId,
          openclawConnected: openClawClientService.isClientConnected(),
        });
      }
    }, 30_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleTokenRefresh(): void {
    this.stopRefreshTimer();
    const tokens = AuthStore.load();
    if (!tokens?.accessToken) return;

    try {
      const payload = JSON.parse(
        Buffer.from(tokens.accessToken.split('.')[1], 'base64').toString(),
      );
      const exp = payload.exp as number; // seconds since epoch
      const msUntilExpiry = exp * 1000 - Date.now();
      // Refresh 60s before expiry, min 10s
      const delay = Math.max(msUntilExpiry - 60_000, 10_000);

      this.refreshTimer = setTimeout(async () => {
        console.log('[WS] Proactive token refresh triggered');
        await this.attemptTokenRefresh();
        this.scheduleTokenRefresh(); // reschedule with new token
      }, delay);

      console.log(
        `[WS] Token refresh scheduled in ${Math.round(delay / 1000)}s`,
      );
    } catch {
      // Can't decode token — skip scheduling
    }
  }

  private stopRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private async attemptTokenRefresh(): Promise<void> {
    const tokens = AuthStore.load();
    if (!tokens?.refreshToken) return;

    const API_BASE = process.env.API_BASE_URL || process.env.VITE_API_URL || (app.isPackaged ? PROD_API : 'http://localhost:3008');
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });

      if (!res.ok) {
        AuthStore.clear();
        return;
      }

      const data = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
      };
      AuthStore.save(data);

      // Update socket auth for next reconnection
      if (this.socket) {
        (this.socket as any).auth = {
          token: data.accessToken,
          deviceId: this.deviceId,
          deviceType: 'desktop',
        };
        console.log('[WS] Token refreshed for device socket');
      }
    } catch (e) {
      console.error('[WS] Token refresh failed:', e);
    }
  }

  private registerDevice(): void {
    if (!this.socket) return;

    this.socket.emit(
      'device:register',
      {
        deviceId: this.deviceId,
        name: this.deviceName,
        platform: this.platform,
      },
      (response) => {
        if (response.success) {
          console.log('[WS] Device registered successfully');
        } else {
          console.error('[WS] Device registration failed:', response.error);
        }
      },
    );
  }

  private async handleCommandExecute(
    data: DeviceCommandPayload,
  ): Promise<void> {
    const logEntry: CommandLogEntry = {
      commandId: data.commandId,
      action: data.action,
      type: data.type,
      status: 'pending',
      receivedAt: new Date().toISOString(),
    };

    // Client-side blacklist (defense-in-depth)
    if (isDangerousCommand(data.action)) {
      logEntry.status = 'blocked';
      logEntry.output = '[BLOCKED] Dangerous command blocked by client';
      this.addCommandLog(logEntry);

      this.emitResult({
        commandId: data.commandId,
        status: 'error',
        error: {
          code: 'COMMAND_BLOCKED',
          message: 'Client blocked: dangerous command',
        },
        executionTimeMs: 0,
      });
      return;
    }

    // Sprint 1: only shell type
    if (data.type !== 'shell') {
      logEntry.status = 'error';
      logEntry.output = `[ERROR] Unsupported command type: ${data.type}`;
      this.addCommandLog(logEntry);

      this.emitResult({
        commandId: data.commandId,
        status: 'error',
        error: {
          code: 'UNSUPPORTED_TYPE',
          message: `Sprint 1 only supports shell type`,
        },
        executionTimeMs: 0,
      });
      return;
    }

    logEntry.status = 'running';
    this.addCommandLog(logEntry);

    const result: CommandResult = await this.executor.execute(
      data.action,
      data.timeout,
    );

    logEntry.status = result.status === 'success' ? 'success' : 'error';
    logEntry.output = result.data?.output;
    logEntry.exitCode = result.data?.exitCode;
    logEntry.executionTimeMs = result.executionTimeMs;
    logEntry.completedAt = new Date().toISOString();
    this.updateLastCommandLog(logEntry);

    this.emitResult({
      commandId: data.commandId,
      status: result.status === 'success' ? 'success' : 'error',
      data: result.data,
      error: result.error,
      executionTimeMs: result.executionTimeMs,
      source: result.source,
    });
  }

  private emitResult(result: DeviceResultPayload): void {
    if (!this.socket) return;

    const envelope: WsEnvelope<DeviceResultPayload> = {
      requestId: result.commandId,
      timestamp: new Date().toISOString(),
      data: result,
    };

    this.socket.emit('device:result:complete', envelope);
    console.log(
      `[WS] Result sent for command ${result.commandId}: ${result.status}`,
    );
  }

  private updateStatus(
    status: 'disconnected' | 'connecting' | 'connected',
  ): void {
    this.connectionStatus = status;
    this.mainWindow?.webContents.send('device:status-changed', status);
  }

  private addCommandLog(entry: CommandLogEntry): void {
    this.commandLog.unshift(entry);
    if (this.commandLog.length > 100) {
      this.commandLog = this.commandLog.slice(0, 100);
    }
    this.mainWindow?.webContents.send('device:command-received', entry);
  }

  private updateLastCommandLog(entry: CommandLogEntry): void {
    const idx = this.commandLog.findIndex(
      (e) => e.commandId === entry.commandId,
    );
    if (idx !== -1) {
      this.commandLog[idx] = entry;
    }
    this.mainWindow?.webContents.send('device:command-received', entry);
  }
}
