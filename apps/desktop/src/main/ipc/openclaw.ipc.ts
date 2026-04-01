import { ipcMain, BrowserWindow } from 'electron';
import { openClawClientService } from '../services/openclaw-client.service';
import { openClawProcessService, type ProcessStatus } from '../services/openclaw-process.service';
import { AuthStore } from '../services/auth-store.service';

const API_URL = process.env.API_URL || 'http://localhost:3008/api/v1';

export interface OpenClawConnectionStatus {
  connected: boolean;
  url?: string;
  error?: string;
  mode?: string;
  process?: ProcessStatus;
}

/**
 * Notify all BrowserWindows of OpenClaw status change
 */
function notifyStatusChange(connected: boolean): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('openclaw:status-changed', connected);
  }
}

/**
 * Connect via Server API (docker mode) — preserves original logic
 */
async function connectViaDocker(): Promise<OpenClawConnectionStatus> {
  const tokens = AuthStore.load();
  if (!tokens) {
    return { connected: false, error: 'No auth token found', mode: 'docker' };
  }

  try {
    const response = await fetch(`${API_URL}/openclaw/gateway/connect`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `Failed to get gateway info: ${response.status}`,
      );
    }

    const result = await response.json();

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Invalid gateway response');
    }

    const { url, token } = result.data;

    console.log(`[OpenClaw] Connecting to Gateway at ${url} (docker mode)`);
    await openClawClientService.connect({ url, token });

    console.log('[OpenClaw] Connected to Gateway successfully (docker mode)');
    notifyStatusChange(true);

    return { connected: true, url, mode: 'docker' };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error('[OpenClaw] Docker connection failed:', errorMessage);
    notifyStatusChange(false);
    return { connected: false, error: errorMessage, mode: 'docker' };
  }
}

/**
 * Connect via local sidecar process or external URL
 */
async function connectViaProcess(): Promise<OpenClawConnectionStatus> {
  try {
    const config = await openClawProcessService.start();
    const mode = openClawProcessService.getMode();

    if (!config) {
      if (mode === 'docker') {
        // Shouldn't reach here, but defensive
        return connectViaDocker();
      }
      const status = openClawProcessService.getStatus();
      return {
        connected: false,
        error: status.lastError || 'Failed to start OpenClaw process',
        mode,
        process: status,
      };
    }

    console.log(`[OpenClaw] Connecting to Gateway at ${config.url} (${mode} mode)`);
    await openClawClientService.connect(config);

    console.log(`[OpenClaw] Connected to Gateway successfully (${mode} mode)`);
    notifyStatusChange(true);

    return {
      connected: true,
      url: config.url,
      mode,
      process: openClawProcessService.getStatus(),
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const mode = openClawProcessService.getMode();
    console.error(`[OpenClaw] ${mode} connection failed:`, errorMessage);
    notifyStatusChange(false);
    return {
      connected: false,
      error: errorMessage,
      mode,
      process: openClawProcessService.getStatus(),
    };
  }
}

/**
 * Connect to OpenClaw Gateway — dispatches based on mode
 */
async function connectToGateway(): Promise<OpenClawConnectionStatus> {
  const mode = openClawProcessService.resolveMode();
  console.log(`[OpenClaw] Connecting with mode: ${mode}`);

  if (mode === 'docker') {
    return connectViaDocker();
  }

  // local or external
  return connectViaProcess();
}

/**
 * Disconnect from OpenClaw Gateway
 */
async function disconnectFromGateway(): Promise<void> {
  await openClawClientService.disconnect();

  // If local mode, also stop the sidecar process
  if (openClawProcessService.getMode() === 'local') {
    await openClawProcessService.stop();
  }

  notifyStatusChange(false);
  console.log('[OpenClaw] Disconnected from Gateway');
}

/**
 * Restart OpenClaw connection (stop + start)
 */
async function restartGateway(): Promise<OpenClawConnectionStatus> {
  console.log('[OpenClaw] Restarting...');
  await disconnectFromGateway();
  return connectToGateway();
}

/**
 * Register OpenClaw IPC handlers
 */
export function registerOpenClawIpc(): void {
  // Connect to Gateway
  ipcMain.handle('openclaw:connect', async (): Promise<OpenClawConnectionStatus> => {
    return connectToGateway();
  });

  // Disconnect
  ipcMain.handle('openclaw:disconnect', async () => {
    await disconnectFromGateway();
    return { success: true };
  });

  // Restart
  ipcMain.handle('openclaw:restart', async (): Promise<OpenClawConnectionStatus> => {
    return restartGateway();
  });

  // Get status (extended with process info)
  ipcMain.handle('openclaw:status', () => {
    const info = openClawClientService.getConnectionInfo();
    return {
      connected: openClawClientService.isClientConnected(),
      mode: openClawProcessService.getMode(),
      process: openClawProcessService.getStatus(),
      ...info,
    };
  });

  // Send message to Agent (test)
  ipcMain.handle('openclaw:send-message', async (_event, message: string) => {
    if (!openClawClientService.isClientConnected()) {
      throw new Error('Not connected to Gateway');
    }

    try {
      const response = await openClawClientService.sendMessage(message);
      return { success: true, response };
    } catch (error) {
      throw new Error(
        `Failed to send message: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
}

// Export for use in index.ts and auth.ipc.ts
export { connectToGateway, disconnectFromGateway };
