import { ipcMain, BrowserWindow, app } from 'electron';
import { openClawClientService } from '../services/openclaw-client.service';
import { openClawProcessService, type ProcessStatus } from '../services/openclaw-process.service';
import { AuthStore } from '../services/auth-store.service';

const PROD_API = 'https://linkchat-api.matrix-ai.com.cn';
const API_URL = process.env.API_URL || (process.env.VITE_API_URL ? `${process.env.VITE_API_URL}/api/v1` : '') || (app.isPackaged ? `${PROD_API}/api/v1` : 'http://localhost:3008/api/v1');

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
 * Refresh token and retry the gateway connect (called on 401)
 */
async function refreshAndRetry(
  oldTokens: { accessToken: string; refreshToken: string },
): Promise<OpenClawConnectionStatus | null> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: oldTokens.refreshToken }),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { accessToken: string; refreshToken: string };
    AuthStore.save(data);
    console.log('[OpenClaw] Token refreshed, retrying gateway connect');

    // Retry with new token
    const response = await fetch(`${API_URL}/openclaw/gateway/connect`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${data.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) return null;

    const result = await response.json();
    if (!result.success || !result.data) return null;

    const { url, token } = result.data;
    await openClawClientService.connect({ url, token });
    notifyStatusChange(true);
    return { connected: true, url, mode: 'docker' };
  } catch {
    return null;
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

    if (response.status === 401) {
      // Token expired — refresh and retry once
      const refreshed = await refreshAndRetry(tokens);
      if (refreshed) return refreshed;
      throw new Error('Unauthorized after token refresh');
    }

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
  // Wire auto-reconnect status notifications to renderer
  openClawClientService.setStatusChangeHandler(notifyStatusChange);

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

  // Execute command via CommandExecutor (OpenClaw → child_process fallback)
  ipcMain.handle('openclaw:execute-command', async (_event, command: string) => {
    const { commandExecutor } = await import('../services/command-executor.service');
    return commandExecutor.execute(command);
  });

  // ── Streaming chat (for Bot conversations) ──
  const activeStreams = new Map<string, { cancelled: boolean }>();

  ipcMain.handle(
    'openclaw:stream-start',
    async (event, message: string, sessionKey: string): Promise<{ requestId: string }> => {
      if (!openClawClientService.isClientConnected()) {
        throw new Error('Not connected to OpenClaw Gateway');
      }
      const client = openClawClientService.getClient();
      if (!client) throw new Error('No OpenClaw client available');

      const requestId = `str-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const control = { cancelled: false };
      activeStreams.set(requestId, control);
      const win = BrowserWindow.fromWebContents(event.sender);

      // Fire-and-forget: runs in background, pushes chunks to renderer
      (async () => {
        try {
          let hasContent = false;
          let emptyRetried = false;

          const runStream = async (): Promise<void> => {
            hasContent = false;
            for await (const chunk of client.chat(message, { sessionKey, timeout: 300_000 })) {
              if (control.cancelled) break;

              // Track whether we got any real content
              if (chunk.type === 'text' || chunk.type === 'tool_use') {
                hasContent = true;
              }

              // Intercept empty-response error for auto-retry
              if (
                chunk.type === 'error' &&
                !hasContent &&
                !emptyRetried &&
                chunk.text.includes('empty response')
              ) {
                emptyRetried = true;
                console.log('[OpenClaw:Stream] Empty response detected, resetting session and retrying...');
                try {
                  await client.resetSession(sessionKey);
                } catch (resetErr) {
                  console.warn('[OpenClaw:Stream] Session reset failed:', resetErr);
                }
                // Notify renderer that we're retrying
                win?.webContents.send('openclaw:stream-chunk', {
                  requestId,
                  chunk: { type: 'text', text: '' },
                });
                await runStream();
                return;
              }

              win?.webContents.send('openclaw:stream-chunk', { requestId, chunk });
            }
          };

          await runStream();
        } catch (err) {
          if (!control.cancelled) {
            win?.webContents.send('openclaw:stream-chunk', {
              requestId,
              chunk: {
                type: 'error',
                text: err instanceof Error ? err.message : 'Stream error',
              },
            });
          }
        } finally {
          activeStreams.delete(requestId);
        }
      })();

      return { requestId };
    },
  );

  ipcMain.handle(
    'openclaw:stream-cancel',
    (_event, requestId: string): { cancelled: boolean } => {
      const ctrl = activeStreams.get(requestId);
      if (ctrl) {
        ctrl.cancelled = true;
        activeStreams.delete(requestId);
      }
      return { cancelled: true };
    },
  );
}

// Export for use in index.ts and auth.ipc.ts
export { connectToGateway, disconnectFromGateway };
