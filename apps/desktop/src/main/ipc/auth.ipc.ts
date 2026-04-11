import { ipcMain, app } from 'electron';
import { AuthStore } from '../services/auth-store.service';
import type { WsClientService } from '../services/ws-client.service';
import { connectToGateway, disconnectFromGateway } from './openclaw.ipc';

const PROD_API = 'https://linkchat-api.matrix-ai.com.cn';
const API_BASE = process.env.API_BASE_URL || process.env.VITE_API_URL || (app.isPackaged ? PROD_API : 'http://localhost:3008');

export function registerAuthIpc(wsClient: WsClientService): void {
  ipcMain.handle(
    'auth:login',
    async (_event, email: string, password: string) => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
          const err = await res.json();
          return { success: false, error: err.message || 'Login failed' };
        }

        const data = await res.json();
        AuthStore.save({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
        });

        // Connect WS after successful login
        wsClient.connect();

        // Connect to OpenClaw Gateway (non-blocking)
        connectToGateway().catch((err) => {
          console.warn('[Auth] OpenClaw connect after login failed (ignored):', err.message);
        });

        return { success: true, user: data.user };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || 'Network error',
        };
      }
    },
  );

  ipcMain.handle(
    'auth:register',
    async (_event, data: { email: string; username: string; password: string; displayName: string }) => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (!res.ok) {
          const err = await res.json();
          return { success: false, error: err.message || 'Registration failed' };
        }

        const result = await res.json();
        AuthStore.save({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        });

        wsClient.connect();

        // Connect to OpenClaw Gateway (non-blocking)
        connectToGateway().catch((err) => {
          console.warn('[Auth] OpenClaw connect after register failed (ignored):', err.message);
        });

        return { success: true, user: result.user };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || 'Network error',
        };
      }
    },
  );

  ipcMain.handle('auth:logout', async () => {
    wsClient.disconnect();
    // Disconnect OpenClaw (non-blocking)
    disconnectFromGateway().catch(() => {});
    AuthStore.clear();
    return { success: true };
  });

  ipcMain.handle('auth:get-token', async () => {
    const tokens = AuthStore.load();
    return tokens?.accessToken ?? null;
  });

  ipcMain.handle('auth:refresh-token', async () => {
    const tokens = AuthStore.load();
    if (!tokens?.refreshToken) return null;

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });

      if (!res.ok) {
        AuthStore.clear();
        return null;
      }

      const data = await res.json();
      AuthStore.save({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
      return data.accessToken;
    } catch {
      return null;
    }
  });
}
