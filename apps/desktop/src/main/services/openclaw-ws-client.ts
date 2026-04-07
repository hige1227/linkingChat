import WebSocket from 'ws';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ── Types ──

export interface ChatChunk {
  type: 'text' | 'tool_use' | 'tool_result' | 'done' | 'error';
  text: string;
}

export interface ChatOptions {
  timeout?: number;
  sessionKey?: string;
  agentId?: string;
}

export interface HelloOk {
  protocol: number;
  server?: { version: string; connId: string };
  features?: { methods: string[] };
  auth?: { scopes: string[]; role: string };
}

interface ProtocolMessage {
  type: 'req' | 'res' | 'event';
  [key: string]: unknown;
}

interface PendingRequest {
  resolve: (res: any) => void;
  reject: (err: Error) => void;
}

interface DeviceIdentity {
  deviceId: string;
  publicKeyRaw: Buffer;
  privateKey: crypto.KeyObject;
}

// ── Helpers ──

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// ── Constants ──

const PROTOCOL_VERSION = 3;
const CONNECT_TIMEOUT = 10_000;
const REQUEST_TIMEOUT = 30_000;

// ── Client ──

export class OpenClawWsClient {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private deviceIdentityPath?: string;
  private device: DeviceIdentity | null = null;
  private _isConnected = false;
  private pendingRequests = new Map<string, PendingRequest>();
  private eventListeners = new Map<string, Set<(payload: any) => void>>();

  constructor(options: { url: string; token: string; deviceIdentityPath?: string }) {
    this.url = options.url;
    this.token = options.token;
    this.deviceIdentityPath = options.deviceIdentityPath;
    if (this.deviceIdentityPath) {
      this.device = this.loadOrCreateDeviceIdentity(this.deviceIdentityPath);
    }
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  // ── Connect ──

  connect(): Promise<HelloOk> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.ws?.close();
        reject(new Error(`Connection timed out after ${CONNECT_TIMEOUT}ms`));
      }, CONNECT_TIMEOUT);

      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        console.log('[OpenClaw:WS] Connected, waiting for challenge...');
      });

      this.ws.on('message', (raw: WebSocket.Data) => {
        let msg: ProtocolMessage;
        try {
          const str = typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString('utf8') : raw.toString();
          msg = JSON.parse(str);
        } catch (e) {
          console.error('[OpenClaw:WS] Parse error:', e);
          return;
        }

        // Challenge → send connect request
        if (msg.type === 'event' && (msg as any).event === 'connect.challenge') {
          this.sendConnectRequest((msg as any).payload.nonce);
          return;
        }

        // HelloOk → connection complete
        if (
          msg.type === 'res' &&
          (msg as any).ok &&
          (msg as any).payload?.type === 'hello-ok'
        ) {
          clearTimeout(timeout);
          this._isConnected = true;
          const helloOk = (msg as any).payload as HelloOk;
          console.log(
            `[OpenClaw:WS] Handshake OK (proto=${helloOk.protocol}, scopes=${helloOk.auth?.scopes?.join(',') ?? 'n/a'})`,
          );
          resolve(helloOk);
          return;
        }

        // Connect rejected
        if (msg.type === 'res' && !(msg as any).ok && !this._isConnected) {
          clearTimeout(timeout);
          const err = (msg as any).error;
          reject(new Error(err?.message || 'Connect rejected'));
          return;
        }

        // Route to pending requests / event listeners
        this.handleMessage(msg);
      });

      this.ws.on('close', (code, reason) => {
        const reasonStr = reason?.toString() || 'n/a';
        console.log(`[OpenClaw:WS] Closed: code=${code} reason=${reasonStr}`);
        this._isConnected = false;
        if (!this._isConnected && code === 1008) {
          clearTimeout(timeout);
          reject(new Error(reasonStr || 'pairing required'));
        }
        // Reject all pending requests
        for (const [id, req] of this.pendingRequests) {
          req.reject(new Error(`WebSocket closed (code=${code})`));
          this.pendingRequests.delete(id);
        }
      });

      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  // ── Disconnect ──

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close(1000);
      this.ws = null;
    }
    this._isConnected = false;
  }

  // ── Streaming Chat ──

  async *chat(
    message: string,
    options?: ChatOptions,
  ): AsyncGenerator<ChatChunk> {
    const id = this.generateId();
    const timeout = options?.timeout ?? REQUEST_TIMEOUT;

    // Set up event collector
    const chunks: ChatChunk[] = [];
    let done = false;
    let waitResolve: (() => void) | null = null;

    const onAgentEvent = (payload: any) => {
      if (payload.runId !== id) return;

      const stream = payload.stream as string;
      const data = payload.data as any;

      if (stream === 'assistant' && data?.text != null) {
        chunks.push({ type: 'text', text: data.text });
      } else if (stream === 'tool' && data?.phase === 'start') {
        chunks.push({ type: 'tool_use', text: data.tool || '' });
      } else if (stream === 'tool' && data?.phase === 'end') {
        const output =
          typeof data.output === 'string'
            ? data.output
            : JSON.stringify(data.output ?? '');
        chunks.push({ type: 'tool_result', text: `${data.tool}: ${output}` });
      } else if (stream === 'lifecycle' && (data?.phase === 'end' || data?.phase === 'done' || data?.phase === 'error')) {
        clearTimeout(timer);
        if (data.phase === 'error') {
          chunks.push({ type: 'error', text: data.error || 'Agent error' });
        }
        done = true;
      }

      waitResolve?.();
    };

    this.on('agent', onAgentEvent);

    // Send the request via chat.send (OpenClaw Gateway protocol)
    this.send({
      type: 'req',
      id,
      method: 'chat.send',
      params: {
        message,
        sessionKey: options?.sessionKey || 'default',
        idempotencyKey: id,
      },
    });

    // Track responses (errors, timeout) as backup — lifecycle events are the primary signal
    const timer = setTimeout(() => {
      if (!done) {
        chunks.push({ type: 'error', text: `Chat timed out after ${timeout}ms` });
        done = true;
        this.pendingRequests.delete(id);
        waitResolve?.();
      }
    }, timeout);

    this.pendingRequests.set(id, {
      resolve: (res: any) => {
        // Skip the initial "started"/"in_flight" response — streaming events follow
        if (res.ok && (res.payload?.status === 'started' || res.payload?.status === 'accepted' || res.payload?.status === 'in_flight')) return;
        clearTimeout(timer);
        if (!res.ok && res.error) {
          chunks.push({ type: 'error', text: res.error.message || 'Unknown error' });
        }
        done = true;
        waitResolve?.();
      },
      reject: (err: Error) => {
        clearTimeout(timer);
        chunks.push({ type: 'error', text: err.message });
        done = true;
        waitResolve?.();
      },
    });

    // Yield chunks as they arrive (delta-encode accumulated text from Gateway)
    let cursor = 0;
    let lastText = '';
    while (!done || cursor < chunks.length) {
      if (cursor < chunks.length) {
        const chunk = chunks[cursor++];
        if (chunk.type === 'text') {
          // Gateway sends accumulated text per segment; detect segment reset
          // when new text doesn't start with previous accumulated text
          if (chunk.text.startsWith(lastText)) {
            // Normal accumulation: yield only the new delta
            const delta = chunk.text.slice(lastText.length);
            lastText = chunk.text;
            if (delta) yield { type: 'text', text: delta };
          } else {
            // Segment reset (e.g., after a tool call): yield full new text
            lastText = chunk.text;
            if (chunk.text) yield { type: 'text', text: chunk.text };
          }
        } else {
          yield chunk;
        }
      } else {
        // Wait for more data
        await new Promise<void>((r) => {
          waitResolve = r;
        });
      }
    }

    this.off('agent', onAgentEvent);
    // Clean up pending request (lifecycle end already signals completion)
    this.pendingRequests.delete(id);

    yield { type: 'done', text: '' };
  }

  // ── Sync Chat ──

  async chatSync(message: string, options?: ChatOptions): Promise<string> {
    const parts: string[] = [];
    for await (const chunk of this.chat(message, options)) {
      if (chunk.type === 'text') parts.push(chunk.text);
    }
    return parts.join('');
  }

  // ── Health ──

  async health(): Promise<Record<string, unknown>> {
    return this.request('health', {}, 5_000);
  }

  // ── Internal ──

  private challengeNonce: string | null = null;

  private sendConnectRequest(nonce: string): void {
    this.challengeNonce = nonce;
    const clientId = 'gateway-client';
    const role = 'operator';
    const scopes = ['operator.read', 'operator.write'];

    // Build signed device field if we have an identity.
    // In --auth none mode (token=''), sign with empty token — Gateway still requires device identity.
    let device: Record<string, unknown> | undefined;
    if (this.device) {
      const signedAt = Date.now();
      const payload = [
        'v2', this.device.deviceId, clientId, 'backend', role,
        scopes.join(','), String(signedAt), this.token, nonce,
      ].join('|');
      const signature = crypto.sign(null, Buffer.from(payload, 'utf8'), this.device.privateKey);
      device = {
        id: this.device.deviceId,
        publicKey: base64url(this.device.publicKeyRaw),
        signature: base64url(signature),
        signedAt,
        nonce,
      };
    }

    this.send({
      type: 'req',
      id: this.generateId(),
      method: 'connect',
      params: {
        minProtocol: PROTOCOL_VERSION,
        maxProtocol: PROTOCOL_VERSION,
        client: {
          id: clientId,
          version: '1.0.0',
          platform: process.platform,
          mode: 'backend',
        },
        role,
        scopes,
        caps: [],
        commands: [],
        permissions: {},
        ...(this.token ? { auth: { token: this.token } } : {}),
        locale:
          Intl.DateTimeFormat().resolvedOptions().locale || 'en-US',
        userAgent: 'linkingchat-desktop/1.0.0',
        ...(device && { device }),
      },
    });
  }

  // ── Device Identity ──

  private loadOrCreateDeviceIdentity(filePath: string): DeviceIdentity {
    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (data.version === 1 && data.publicKeyPem && data.privateKeyPem) {
          const publicKey = crypto.createPublicKey(data.publicKeyPem);
          const privateKey = crypto.createPrivateKey(data.privateKeyPem);
          const publicKeyRaw = publicKey.export({ type: 'spki', format: 'der' }).slice(-32);
          return {
            deviceId: data.deviceId,
            publicKeyRaw,
            privateKey,
          };
        }
      }
    } catch (e) {
      console.warn('[OpenClaw:WS] Failed to load device identity, creating new:', e);
    }

    // Generate new ED25519 keypair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const publicKeyRaw = publicKey.export({ type: 'spki', format: 'der' }).slice(-32);
    const deviceId = crypto.createHash('sha256').update(publicKeyRaw).digest('hex');

    const stored = {
      version: 1,
      deviceId,
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      createdAtMs: Date.now(),
    };

    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(stored, null, 2), { mode: 0o600 });
      console.log(`[OpenClaw:WS] Device identity created: ${deviceId.slice(0, 16)}...`);
    } catch (e) {
      console.warn('[OpenClaw:WS] Could not persist device identity:', e);
    }

    return { deviceId, publicKeyRaw, privateKey };
  }

  private handleMessage(msg: ProtocolMessage): void {
    if (msg.type === 'event') {
      const event = (msg as any).event as string;
      const payload = (msg as any).payload;
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        for (const fn of listeners) fn(payload);
      }
      return;
    }

    if (msg.type === 'res') {
      const id = (msg as any).id as string;
      const pending = this.pendingRequests.get(id);
      if (pending) {
        // Don't delete on "started"/"accepted"/"in_flight" — streaming events still coming
        const status = (msg as any).payload?.status;
        const isStreaming = (msg as any).ok && (status === 'started' || status === 'accepted' || status === 'in_flight');
        if (!isStreaming) {
          this.pendingRequests.delete(id);
        }
        if ((msg as any).ok) {
          pending.resolve(msg);
        } else {
          pending.reject(
            new Error((msg as any).error?.message || `Request ${id} failed`),
          );
        }
      }
    }
  }

  private request(
    method: string,
    params: Record<string, unknown>,
    timeout = REQUEST_TIMEOUT,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.generateId();
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out`));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve: (res) => {
          clearTimeout(timer);
          resolve(res.payload ?? res);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.send({ type: 'req', id, method, params });
    });
  }

  private send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const data = JSON.stringify(msg);
      console.log('[OpenClaw:WS] SEND:', data.substring(0, 200));
      this.ws.send(data);
    } else {
      console.error('[OpenClaw:WS] Cannot send, ws not open. readyState:', this.ws?.readyState);
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private on(event: string, fn: (payload: any) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(fn);
  }

  private off(event: string, fn: (payload: any) => void): void {
    this.eventListeners.get(event)?.delete(fn);
  }
}
