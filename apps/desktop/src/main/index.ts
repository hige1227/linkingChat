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
    // Connect to OpenClaw Gateway after WebSocket is ready
    const mode = openClawProcessService.resolveMode();
    connectToGateway().then((status) => {
      if (status.connected) {
        console.log(`[Main] OpenClaw Gateway connected (mode=${mode})`);
      } else {
        console.warn(`[Main] OpenClaw Gateway not available (mode=${mode}):`, status.error);
      }
    }).catch((err) => {
      console.warn(`[Main] OpenClaw Gateway connection error (mode=${mode}, ignored):`, err.message);
    });
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

app.on('window-all-closed', () => {
  wsClient.disconnect();
  disconnectFromGateway().catch(() => {});
  if (process.platform !== 'darwin') app.quit();
});
