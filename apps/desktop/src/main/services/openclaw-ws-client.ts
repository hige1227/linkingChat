import WebSocket from 'ws';

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

// ── Constants ──

const PROTOCOL_VERSION = 3;
const CONNECT_TIMEOUT = 15_000;
const REQUEST_TIMEOUT = 30_000;

// ── Client ──

export class OpenClawWsClient {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private _isConnected = false;
  private pendingRequests = new Map<string, PendingRequest>();
  private eventListeners = new Map<string, Set<(payload: any) => void>>();

  constructor(options: { url: string; token: string }) {
    this.url = options.url;
    this.token = options.token;
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
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }

        // Challenge → send connect request
        if (msg.type === 'event' && (msg as any).event === 'connect.challenge') {
          this.sendConnectRequest();
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
        this._isConnected = false;
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
      }

      waitResolve?.();
    };

    this.on('agent', onAgentEvent);

    // Send the request
    this.send({
      type: 'req',
      id,
      method: 'agent',
      params: {
        message,
        sessionKey: options?.sessionKey,
        agentId: options?.agentId,
        idempotencyKey: id,
        timeout,
      },
    });

    // Also track the final response
    const completionPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Chat timed out after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve: (res: any) => {
          clearTimeout(timer);
          if (!res.ok && res.error) {
            chunks.push({ type: 'error', text: res.error.message || 'Unknown error' });
          }
          done = true;
          waitResolve?.();
          resolve();
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          chunks.push({ type: 'error', text: err.message });
          done = true;
          waitResolve?.();
          resolve(); // resolve not reject — let the generator yield the error chunk
        },
      });
    });

    // Yield chunks as they arrive
    let cursor = 0;
    let lastText = '';
    while (!done || cursor < chunks.length) {
      if (cursor < chunks.length) {
        const chunk = chunks[cursor++];
        // Delta-encode text (server sends accumulated text)
        if (chunk.type === 'text') {
          const delta = chunk.text.slice(lastText.length);
          lastText = chunk.text;
          if (delta) yield { type: 'text', text: delta };
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
    await completionPromise.catch(() => {}); // ensure cleanup

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

  private sendConnectRequest(): void {
    this.send({
      type: 'req',
      id: this.generateId(),
      method: 'connect',
      params: {
        minProtocol: PROTOCOL_VERSION,
        maxProtocol: PROTOCOL_VERSION,
        client: {
          id: 'gateway-client',
          version: '1.0.0',
          platform: process.platform,
          mode: 'backend',
        },
        role: 'operator',
        scopes: ['operator.read', 'operator.write'],
        caps: [],
        commands: [],
        permissions: {},
        auth: { token: this.token },
        locale:
          Intl.DateTimeFormat().resolvedOptions().locale || 'en-US',
        userAgent: 'linkingchat-desktop/1.0.0',
      },
    });
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
        this.pendingRequests.delete(id);
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
      this.ws.send(JSON.stringify(msg));
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
