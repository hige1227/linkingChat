import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { registerAuthIpc } from './ipc/auth.ipc';
import { registerDeviceIpc } from './ipc/device.ipc';
import { registerOpenClawIpc, connectToGateway, disconnectFromGateway } from './ipc/openclaw.ipc';
import { openClawProcessService } from './services/openclaw-process.service';
import { WsClientService } from './services/ws-client.service';
import { AuthStore } from './services/auth-store.service';

// Prevent uncaught errors from showing Electron error dialogs (e.g. OpenClaw connection failures)
process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled rejection:', reason);
});

let mainWindow: BrowserWindow | null = null;
const wsClient = new WsClientService();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    title: 'LinkingChat',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });

  wsClient.setMainWindow(mainWindow);

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  registerAuthIpc(wsClient);
  registerDeviceIpc(wsClient);
  registerOpenClawIpc();

  createWindow();

  // Auto-connect if tokens exist
  const tokens = AuthStore.load();
  if (tokens) {
    wsClient.connect();
    // Connect to OpenClaw Gateway with retry
    const mode = openClawProcessService.resolveMode();
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 5_000;
    (async () => {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const status = await connectToGateway();
          if (status.connected) {
            console.log(`[Main] OpenClaw Gateway connected (mode=${mode}, attempt=${attempt})`);
            return;
          }
          console.warn(`[Main] OpenClaw Gateway attempt ${attempt}/${MAX_RETRIES} failed: ${status.error}`);
        } catch (err) {
          console.warn(`[Main] OpenClaw Gateway attempt ${attempt}/${MAX_RETRIES} error:`, (err as Error).message);
        }
        if (attempt < MAX_RETRIES) {
          console.log(`[Main] Retrying OpenClaw in ${RETRY_DELAY / 1000}s...`);
          await new Promise((r) => setTimeout(r, RETRY_DELAY));
        }
      }
      console.warn(`[Main] OpenClaw Gateway not available after ${MAX_RETRIES} attempts (mode=${mode})`);
    })();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Ensure OpenClaw sidecar is stopped on quit (covers macOS Cmd+Q)
app.on('before-quit', () => {
  openClawProcessService.stop().catch((err) => {
    console.warn('[Main] OpenClaw process stop error on quit:', err);
  });
});

// Last-resort: synchronously kill Gateway on process exit to prevent orphan (Windows)
process.on('exit', () => {
  openClawProcessService.killSync();
});

app.on('window-all-closed', () => {
  wsClient.disconnect();
  disconnectFromGateway().catch(() => {});
  if (process.platform !== 'darwin') app.quit();
});
