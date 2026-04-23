import { app } from 'electron';
import Store from 'electron-store';

interface AiGatewayStore {
  llmToken?: string;
  llmTokenExpiry?: number;
}

const store = new Store<AiGatewayStore>({ name: 'linkingchat-ai-gateway' });

const PROD_API = 'https://linkchat-api.matrix-ai.com.cn';
const API_BASE =
  process.env.API_BASE_URL ||
  process.env.VITE_API_URL ||
  (app.isPackaged ? PROD_API : 'http://localhost:3008');

export class AiGatewayService {
  private llmToken: string | null = null;

  async fetchLlmToken(accessToken: string): Promise<string | null> {
    try {
      const res = await fetch(`${API_BASE}/api/v1/ai/llm-token`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        console.warn('[AiGateway] Failed to fetch LLM token:', res.status);
        return null;
      }

      const data = (await res.json()) as { token: string; expiresIn: number };
      this.llmToken = data.token;
      const expiry = Date.now() + data.expiresIn * 1000;
      store.set('llmToken', data.token);
      store.set('llmTokenExpiry', expiry);
      return data.token;
    } catch (err) {
      console.warn('[AiGateway] fetchLlmToken error:', (err as Error).message);
      return null;
    }
  }

  getToken(): string | null {
    if (this.llmToken) return this.llmToken;

    const stored = store.get('llmToken');
    const expiry = store.get('llmTokenExpiry', 0);
    if (stored && expiry > Date.now()) {
      this.llmToken = stored;
      return stored;
    }
    return null;
  }

  clearToken(): void {
    this.llmToken = null;
    store.delete('llmToken');
    store.delete('llmTokenExpiry');
  }

  getApiBase(): string {
    return API_BASE;
  }
}

export const aiGatewayService = new AiGatewayService();
