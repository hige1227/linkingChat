import Store from 'electron-store';
import { app } from 'electron';

const PROD_API = 'https://linkchat-api.matrix-ai.com.cn';
const API_URL = process.env.API_URL
  || (process.env.VITE_API_URL ? `${process.env.VITE_API_URL}/api/v1` : '')
  || (app.isPackaged ? `${PROD_API}/api/v1` : 'http://localhost:3008/api/v1');

interface SetupStore {
  setupComplete: boolean;
  platformApiKey: string;
}

export class SetupService {
  readonly store = new Store<SetupStore>({ name: 'linkingchat-setup' });

  async initialize(userId: string, accessToken: string): Promise<void> {
    if (this.store.get('setupComplete', false)) return;

    try {
      const apiKey = await this.fetchPlatformApiKey(accessToken);
      this.store.set('platformApiKey', apiKey);
      this.store.set('setupComplete', true);
      console.log('[Setup] First-launch setup complete');
    } catch (error: unknown) {
      console.error('[Setup] First-launch setup failed:', (error as Error).message);
      // Do not set setupComplete — retry next launch
    }
  }

  getPlatformApiKey(): string | undefined {
    return this.store.get('platformApiKey') || undefined;
  }

  private async fetchPlatformApiKey(accessToken: string): Promise<string> {
    const res = await fetch(`${API_URL}/config/agent-key`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch agent key: ${res.status}`);
    }

    const body = await res.json() as { success: boolean; data: { apiKey: string } };
    if (!body.success || !body.data?.apiKey) {
      throw new Error('Invalid agent-key response from server');
    }

    return body.data.apiKey;
  }
}

export const setupService = new SetupService();
