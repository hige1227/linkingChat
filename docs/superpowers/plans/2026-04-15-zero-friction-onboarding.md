# Zero-Friction Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** User downloads installer, installs, logs in → JARVIS immediately greets them. No network required post-install. Both OpenClaw and Hermes bundled.

**Architecture:** AgentProvider interface in Desktop main process abstracts OpenClaw and Hermes behind identical `chat()` / `isReady()` / `cancelStream()` APIs. HermesProcessService mirrors the existing OpenClawProcessService pattern. SetupService runs once on first login to confirm both sidecars healthy and fetch the platform API key.

**Tech Stack:** Electron 35, TypeScript, electron-store, Node.js child_process, python-build-standalone, electron-builder extraResources, Jest

---

## File Map

### New files (Desktop main process)

| File | Responsibility |
|---|---|
| `apps/desktop/src/main/agents/agent-provider.interface.ts` | `ChatChunk` type + `AgentProvider` interface + `AgentType` union |
| `apps/desktop/src/main/agents/openclaw.adapter.ts` | `AgentProvider` impl — delegates to `openClawClientService` |
| `apps/desktop/src/main/agents/hermes.adapter.ts` | `AgentProvider` impl — HTTP SSE fetch to `localhost:8765` |
| `apps/desktop/src/main/agents/agent-provider.factory.ts` | `AgentProviderFactory.create(type)` + active provider singleton |
| `apps/desktop/src/main/services/hermes-process.service.ts` | Spawn/health/restart Hermes sidecar (mirrors openclaw-process.service) |
| `apps/desktop/src/main/services/setup.service.ts` | First-launch orchestrator: wait for sidecars + fetch API key |
| `apps/desktop/src/main/ipc/agent.ipc.ts` | IPC: `agent:get-type`, `agent:set-type` |

### New files (Server)

| File | Responsibility |
|---|---|
| `apps/server/src/config/config.controller.ts` | `GET /api/v1/config/agent-key` — returns platform LLM API key |
| `apps/server/src/config/config.module.ts` | NestJS module registering ConfigController |

### New files (Build)

| File | Responsibility |
|---|---|
| `scripts/bundle-agents.sh` | CI: download python-build-standalone + install hermes venv offline |
| `scripts/vendor-hermes.sh` | One-time: `pip download hermes-agent` into `vendor/hermes-wheels/` |

### Modified files

| File | What changes |
|---|---|
| `apps/desktop/src/main/index.ts` | Start Hermes sidecar on app ready; call SetupService after login |
| `apps/desktop/src/main/ipc/openclaw.ipc.ts` | Stream handler uses `AgentProviderFactory.active()` instead of direct `openClawClientService` |
| `apps/desktop/electron-builder.yml` | Add `hermes-env/` to `extraResources` |
| `apps/server/src/app.module.ts` | Import `AppConfigModule` |

### Test files

| File | Tests |
|---|---|
| `apps/desktop/src/main/agents/__tests__/agent-provider.interface.spec.ts` | Type-level assertions |
| `apps/desktop/src/main/agents/__tests__/openclaw.adapter.spec.ts` | Adapter delegates to openClawClientService |
| `apps/desktop/src/main/agents/__tests__/hermes.adapter.spec.ts` | SSE parsing, abort on cancel |
| `apps/desktop/src/main/agents/__tests__/agent-provider.factory.spec.ts` | Creates correct adapter, swaps active |
| `apps/desktop/src/main/services/__tests__/hermes-process.service.spec.ts` | Spawn, health poll, restart |
| `apps/desktop/src/main/services/__tests__/setup.service.spec.ts` | Skips on setupComplete, waits for ready, saves apiKey |
| `apps/server/src/config/__tests__/config.controller.spec.ts` | Returns API key, guards work |

---

## Task 1: AgentProvider interface

**Files:**
- Create: `apps/desktop/src/main/agents/agent-provider.interface.ts`
- Test: `apps/desktop/src/main/agents/__tests__/agent-provider.interface.spec.ts`

- [ ] **Step 1: Create the interface file**

```typescript
// apps/desktop/src/main/agents/agent-provider.interface.ts

export interface ChatChunk {
  type: 'text' | 'tool_call' | 'done' | 'error';
  content?: string;
  error?: string;
  requestId: string;
}

export interface AgentChatParams {
  botId: string;
  converseId: string;
  message: string;
  requestId: string;
}

export interface AgentProvider {
  readonly name: string;
  isReady(): Promise<boolean>;
  chat(params: AgentChatParams): AsyncGenerator<ChatChunk>;
  cancelStream(requestId: string): void;
}

export type AgentType = 'openclaw' | 'hermes';
```

- [ ] **Step 2: Write type-check test**

```typescript
// apps/desktop/src/main/agents/__tests__/agent-provider.interface.spec.ts
import type { AgentProvider, ChatChunk, AgentType } from '../agent-provider.interface';

describe('AgentProvider interface types', () => {
  it('ChatChunk type accepts valid done chunk', () => {
    const chunk: ChatChunk = { type: 'done', requestId: 'req-1' };
    expect(chunk.type).toBe('done');
  });

  it('AgentType accepts openclaw and hermes', () => {
    const a: AgentType = 'openclaw';
    const b: AgentType = 'hermes';
    expect(a).toBe('openclaw');
    expect(b).toBe('hermes');
  });
});
```

- [ ] **Step 3: Run test**

```bash
pnpm --filter @linkingchat/desktop test -- --testPathPattern="agent-provider.interface"
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main/agents/agent-provider.interface.ts apps/desktop/src/main/agents/__tests__/agent-provider.interface.spec.ts
git commit -m "feat(desktop): add AgentProvider interface and ChatChunk types"
```

---

## Task 2: OpenClawAdapter

**Files:**
- Create: `apps/desktop/src/main/agents/openclaw.adapter.ts`
- Test: `apps/desktop/src/main/agents/__tests__/openclaw.adapter.spec.ts`

The adapter wraps `openClawClientService`. Maps the existing `ChatChunk` from `openclaw-ws-client.ts` (field `text`) to the interface `ChatChunk` (field `content`).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/desktop/src/main/agents/__tests__/openclaw.adapter.spec.ts
import { OpenClawAdapter } from '../openclaw.adapter';
import type { ChatChunk } from '../agent-provider.interface';

jest.mock('../../services/openclaw-client.service', () => ({
  openClawClientService: {
    isConnected: jest.fn(),
    sendChatMessage: jest.fn(),
    cancelStream: jest.fn(),
  },
}));

import { openClawClientService } from '../../services/openclaw-client.service';

describe('OpenClawAdapter', () => {
  let adapter: OpenClawAdapter;

  beforeEach(() => {
    adapter = new OpenClawAdapter();
    jest.clearAllMocks();
  });

  it('name is "openclaw"', () => {
    expect(adapter.name).toBe('openclaw');
  });

  it('isReady returns true when connected', async () => {
    (openClawClientService.isConnected as jest.Mock).mockReturnValue(true);
    await expect(adapter.isReady()).resolves.toBe(true);
  });

  it('isReady returns false when disconnected', async () => {
    (openClawClientService.isConnected as jest.Mock).mockReturnValue(false);
    await expect(adapter.isReady()).resolves.toBe(false);
  });

  it('chat yields mapped chunks from sendChatMessage', async () => {
    async function* fakeStream() {
      yield { type: 'text' as const, text: 'Hello', requestId: 'req-1' };
      yield { type: 'done' as const, text: '', requestId: 'req-1' };
    }
    (openClawClientService.sendChatMessage as jest.Mock).mockReturnValue(fakeStream());

    const chunks: ChatChunk[] = [];
    for await (const chunk of adapter.chat({ botId: 'b1', converseId: 'c1', message: 'hi', requestId: 'req-1' })) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ type: 'text', content: 'Hello', requestId: 'req-1' });
    expect(chunks[1]).toEqual({ type: 'done', requestId: 'req-1' });
  });

  it('cancelStream delegates to service', () => {
    adapter.cancelStream('req-1');
    expect(openClawClientService.cancelStream).toHaveBeenCalledWith('req-1');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm --filter @linkingchat/desktop test -- --testPathPattern="openclaw.adapter"
```

Expected: FAIL — `Cannot find module '../openclaw.adapter'`

- [ ] **Step 3: Check sendChatMessage signature**

```bash
grep -n "sendChatMessage\|cancelStream\|isConnected" apps/desktop/src/main/services/openclaw-client.service.ts
```

Confirm the method names match what the test mocks. Adjust the adapter if they differ.

- [ ] **Step 4: Implement OpenClawAdapter**

```typescript
// apps/desktop/src/main/agents/openclaw.adapter.ts
import type { AgentProvider, AgentChatParams, ChatChunk } from './agent-provider.interface';
import { openClawClientService } from '../services/openclaw-client.service';

export class OpenClawAdapter implements AgentProvider {
  readonly name = 'openclaw';

  async isReady(): Promise<boolean> {
    return openClawClientService.isConnected();
  }

  async *chat(params: AgentChatParams): AsyncGenerator<ChatChunk> {
    const stream = openClawClientService.sendChatMessage({
      message: params.message,
      requestId: params.requestId,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'text') {
        yield { type: 'text', content: chunk.text, requestId: params.requestId };
      } else if (chunk.type === 'done') {
        yield { type: 'done', requestId: params.requestId };
      } else if (chunk.type === 'error') {
        yield { type: 'error', error: chunk.text, requestId: params.requestId };
      } else {
        yield { type: 'tool_call', content: chunk.text, requestId: params.requestId };
      }
    }
  }

  cancelStream(requestId: string): void {
    openClawClientService.cancelStream(requestId);
  }
}
```

- [ ] **Step 5: Run test — verify it passes**

```bash
pnpm --filter @linkingchat/desktop test -- --testPathPattern="openclaw.adapter"
```

Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/main/agents/openclaw.adapter.ts apps/desktop/src/main/agents/__tests__/openclaw.adapter.spec.ts
git commit -m "feat(desktop): add OpenClawAdapter wrapping existing WS client"
```

---

## Task 3: HermesAdapter

**Files:**
- Create: `apps/desktop/src/main/agents/hermes.adapter.ts`
- Test: `apps/desktop/src/main/agents/__tests__/hermes.adapter.spec.ts`

Hermes runs on `localhost:8765` with OpenAI-compatible SSE. SSE lines look like:
```
data: {"choices":[{"delta":{"content":"Hello"}}]}
data: [DONE]
```

- [ ] **Step 1: Write the failing test**

```typescript
// apps/desktop/src/main/agents/__tests__/hermes.adapter.spec.ts
import { HermesAdapter } from '../hermes.adapter';
import type { ChatChunk } from '../agent-provider.interface';

const HERMES_URL = 'http://127.0.0.1:8765';

describe('HermesAdapter', () => {
  let adapter: HermesAdapter;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    adapter = new HermesAdapter();
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('name is "hermes"', () => {
    expect(adapter.name).toBe('hermes');
  });

  it('isReady returns true when health endpoint 200', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true } as Response);
    await expect(adapter.isReady()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(`${HERMES_URL}/health`);
  });

  it('isReady returns false when health endpoint fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(adapter.isReady()).resolves.toBe(false);
  });

  it('chat parses SSE stream and yields text chunks', async () => {
    const sseLines = [
      'data: {"choices":[{"delta":{"content":"Hi"}}]}',
      'data: {"choices":[{"delta":{"content":"!"}}]}',
      'data: [DONE]',
    ].join('\n');

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseLines));
        controller.close();
      },
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      body: stream,
    } as unknown as Response);

    const chunks: ChatChunk[] = [];
    for await (const chunk of adapter.chat({ botId: 'b1', converseId: 'c1', message: 'hello', requestId: 'req-1' })) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual({ type: 'text', content: 'Hi', requestId: 'req-1' });
    expect(chunks[1]).toEqual({ type: 'text', content: '!', requestId: 'req-1' });
    expect(chunks[2]).toEqual({ type: 'done', requestId: 'req-1' });
  });

  it('cancelStream aborts in-flight stream', () => {
    const ctrl = new AbortController();
    const abortSpy = jest.spyOn(ctrl, 'abort');
    (adapter as any).activeStreams.set('req-2', ctrl);
    adapter.cancelStream('req-2');
    expect(abortSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm --filter @linkingchat/desktop test -- --testPathPattern="hermes.adapter"
```

Expected: FAIL — `Cannot find module '../hermes.adapter'`

- [ ] **Step 3: Implement HermesAdapter**

```typescript
// apps/desktop/src/main/agents/hermes.adapter.ts
import type { AgentProvider, AgentChatParams, ChatChunk } from './agent-provider.interface';

const HERMES_BASE_URL = 'http://127.0.0.1:8765';

async function* readSSELines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) yield trimmed.slice(6);
    }
  }

  if (buffer.trim().startsWith('data: ')) yield buffer.trim().slice(6);
}

export class HermesAdapter implements AgentProvider {
  readonly name = 'hermes';
  readonly activeStreams = new Map<string, AbortController>();

  async isReady(): Promise<boolean> {
    try {
      const res = await fetch(`${HERMES_BASE_URL}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async *chat(params: AgentChatParams): AsyncGenerator<ChatChunk> {
    const controller = new AbortController();
    this.activeStreams.set(params.requestId, controller);

    try {
      const res = await fetch(`${HERMES_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'hermes',
          messages: [{ role: 'user', content: params.message }],
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        yield { type: 'error', error: `Hermes returned ${res.status}`, requestId: params.requestId };
        return;
      }

      for await (const line of readSSELines(res.body)) {
        if (line === '[DONE]') {
          yield { type: 'done', requestId: params.requestId };
          return;
        }
        try {
          const parsed = JSON.parse(line) as { choices: Array<{ delta: { content?: string } }> };
          const delta = parsed.choices[0]?.delta?.content;
          if (delta) yield { type: 'text', content: delta, requestId: params.requestId };
        } catch {
          // Skip malformed SSE lines
        }
      }
    } catch (error: unknown) {
      if ((error as Error).name !== 'AbortError') {
        yield { type: 'error', error: (error as Error).message, requestId: params.requestId };
      }
    } finally {
      this.activeStreams.delete(params.requestId);
    }
  }

  cancelStream(requestId: string): void {
    const ctrl = this.activeStreams.get(requestId);
    if (ctrl) {
      ctrl.abort();
      this.activeStreams.delete(requestId);
    }
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
pnpm --filter @linkingchat/desktop test -- --testPathPattern="hermes.adapter"
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/agents/hermes.adapter.ts apps/desktop/src/main/agents/__tests__/hermes.adapter.spec.ts
git commit -m "feat(desktop): add HermesAdapter with OpenAI-compatible SSE parsing"
```

---

## Task 4: AgentProviderFactory

**Files:**
- Create: `apps/desktop/src/main/agents/agent-provider.factory.ts`
- Test: `apps/desktop/src/main/agents/__tests__/agent-provider.factory.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/desktop/src/main/agents/__tests__/agent-provider.factory.spec.ts
import { AgentProviderFactory } from '../agent-provider.factory';
import { OpenClawAdapter } from '../openclaw.adapter';
import { HermesAdapter } from '../hermes.adapter';

jest.mock('../openclaw.adapter');
jest.mock('../hermes.adapter');
jest.mock('electron-store', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn((key: string, defaultVal?: any) => defaultVal),
    set: jest.fn(),
  }));
});

describe('AgentProviderFactory', () => {
  beforeEach(() => {
    AgentProviderFactory.reset();
  });

  it('create("openclaw") returns OpenClawAdapter', () => {
    const provider = AgentProviderFactory.create('openclaw');
    expect(provider).toBeInstanceOf(OpenClawAdapter);
  });

  it('create("hermes") returns HermesAdapter', () => {
    const provider = AgentProviderFactory.create('hermes');
    expect(provider).toBeInstanceOf(HermesAdapter);
  });

  it('active() returns last created provider', () => {
    AgentProviderFactory.create('openclaw');
    expect(AgentProviderFactory.active()).toBeInstanceOf(OpenClawAdapter);
    AgentProviderFactory.create('hermes');
    expect(AgentProviderFactory.active()).toBeInstanceOf(HermesAdapter);
  });

  it('throws on unknown type', () => {
    expect(() => AgentProviderFactory.create('unknown' as any)).toThrow('Unknown agent type');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm --filter @linkingchat/desktop test -- --testPathPattern="agent-provider.factory"
```

Expected: FAIL — `Cannot find module '../agent-provider.factory'`

- [ ] **Step 3: Implement AgentProviderFactory**

```typescript
// apps/desktop/src/main/agents/agent-provider.factory.ts
import type { AgentProvider, AgentType } from './agent-provider.interface';
import { OpenClawAdapter } from './openclaw.adapter';
import { HermesAdapter } from './hermes.adapter';
import Store from 'electron-store';

const store = new Store<{ agentType: AgentType }>({ name: 'linkingchat-agent' });

let activeProvider: AgentProvider | null = null;

export class AgentProviderFactory {
  static create(type: AgentType): AgentProvider {
    if (type === 'openclaw') {
      activeProvider = new OpenClawAdapter();
    } else if (type === 'hermes') {
      activeProvider = new HermesAdapter();
    } else {
      throw new Error(`Unknown agent type: ${String(type)}`);
    }
    store.set('agentType', type);
    return activeProvider;
  }

  static active(): AgentProvider {
    if (!activeProvider) {
      const saved = store.get('agentType', 'openclaw');
      return AgentProviderFactory.create(saved);
    }
    return activeProvider;
  }

  static getPersistedType(): AgentType {
    return store.get('agentType', 'openclaw');
  }

  /** For testing only */
  static reset(): void {
    activeProvider = null;
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
pnpm --filter @linkingchat/desktop test -- --testPathPattern="agent-provider.factory"
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/agents/agent-provider.factory.ts apps/desktop/src/main/agents/__tests__/agent-provider.factory.spec.ts
git commit -m "feat(desktop): add AgentProviderFactory with electron-store persistence"
```

---

## Task 5: HermesProcessService

**Files:**
- Create: `apps/desktop/src/main/services/hermes-process.service.ts`
- Test: `apps/desktop/src/main/services/__tests__/hermes-process.service.spec.ts`

Mirrors `openclaw-process.service.ts`. Hermes sidecar binary path:
- macOS/Linux: `{resourcesPath}/hermes-env/lib/bin/hermes`
- Windows: `{resourcesPath}/hermes-env/lib/Scripts/hermes.exe`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/desktop/src/main/services/__tests__/hermes-process.service.spec.ts
import { HermesProcessService } from '../hermes-process.service';

jest.mock('child_process', () => ({
  spawn: jest.fn(() => ({
    pid: 12345,
    killed: false,
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn(),
    kill: jest.fn(),
  })),
}));

jest.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/app',
    getPath: (name: string) => `/mock/${name}`,
  },
}));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  accessSync: jest.fn(),
  createWriteStream: jest.fn(() => ({ write: jest.fn(), end: jest.fn() })),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(() => []),
  unlinkSync: jest.fn(),
}));

describe('HermesProcessService', () => {
  let service: HermesProcessService;

  beforeEach(() => {
    service = new HermesProcessService();
    jest.clearAllMocks();
  });

  it('getStatus returns not running initially', () => {
    const status = service.getStatus();
    expect(status.running).toBe(false);
    expect(status.restartCount).toBe(0);
  });

  it('isProcessRunning returns false when no process', () => {
    expect(service.isProcessRunning()).toBe(false);
  });

  it('resolveBinaryPath returns hermes path when sidecar exists', () => {
    const { accessSync } = require('fs');
    (accessSync as jest.Mock).mockImplementation(() => undefined);
    const path = service.resolveBinaryPath();
    expect(path).toMatch(/hermes-env/);
  });

  it('resolveBinaryPath returns null when sidecar missing', () => {
    const { accessSync } = require('fs');
    (accessSync as jest.Mock).mockImplementation(() => { throw new Error('ENOENT'); });
    const path = service.resolveBinaryPath();
    expect(path).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm --filter @linkingchat/desktop test -- --testPathPattern="hermes-process.service"
```

Expected: FAIL — `Cannot find module '../hermes-process.service'`

- [ ] **Step 3: Implement HermesProcessService**

```typescript
// apps/desktop/src/main/services/hermes-process.service.ts
import { spawn, type ChildProcess } from 'child_process';
import { app } from 'electron';
import { join } from 'path';
import { createWriteStream, mkdirSync, readdirSync, unlinkSync, accessSync, type WriteStream } from 'fs';

export interface HermesStatus {
  running: boolean;
  pid?: number;
  restartCount: number;
  lastError?: string;
}

const PORT = 8765;
const HEALTH_POLL_INTERVAL = 500;
const HEALTH_POLL_TIMEOUT = 30_000;
const GRACEFUL_SHUTDOWN_MS = 3_000;
const MAX_RESTART_ATTEMPTS = 3;
const LOG_RETENTION_DAYS = 7;

export class HermesProcessService {
  private process: ChildProcess | null = null;
  private restartCount = 0;
  private lastError: string | undefined;
  private logStream: WriteStream | null = null;
  private stopping = false;

  resolveBinaryPath(): string | null {
    const resourcesPath = (process as any).resourcesPath || join(app.getAppPath(), '..', '..', 'resources');
    const isWin = process.platform === 'win32';
    const binaryName = isWin ? 'hermes.exe' : 'hermes';
    const subdir = isWin ? 'Scripts' : 'bin';
    const candidate = join(resourcesPath, 'hermes-env', 'lib', subdir, binaryName);

    try {
      accessSync(candidate);
      return candidate;
    } catch {
      this.lastError = `Hermes binary not found at: ${candidate}`;
      return null;
    }
  }

  async start(): Promise<boolean> {
    if (this.isProcessRunning()) return true;

    const binaryPath = this.resolveBinaryPath();
    if (!binaryPath) {
      console.error(`[Hermes:Process] ${this.lastError}`);
      return false;
    }

    this.setupLogStream();

    try {
      this.process = spawn(binaryPath, ['gateway', 'start', '--port', String(PORT)], {
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
        windowsHide: true,
      });

      if (this.logStream) {
        this.process.stdout?.on('data', (data: Buffer) => this.logStream?.write(`[stdout] ${data}`));
        this.process.stderr?.on('data', (data: Buffer) => this.logStream?.write(`[stderr] ${data}`));
      }

      this.process.on('exit', (code, signal) => {
        console.log(`[Hermes:Process] Exited code=${code} signal=${signal}`);
        if (!this.stopping && this.restartCount < MAX_RESTART_ATTEMPTS) {
          this.restartCount++;
          this.process = null;
          setTimeout(() => {
            if (!this.stopping) this.start().catch(console.error);
          }, 2000 * this.restartCount);
        } else if (!this.stopping) {
          this.lastError = `Process crashed ${MAX_RESTART_ATTEMPTS} times, giving up`;
        }
      });

      await this.waitForHealth();
      console.log(`[Hermes:Process] Started on port ${PORT}`);
      return true;
    } catch (error: unknown) {
      this.lastError = (error as Error).message;
      return false;
    }
  }

  async stop(): Promise<void> {
    if (!this.process || this.stopping) return;
    this.stopping = true;

    try {
      this.process.kill('SIGTERM');
      await new Promise<void>((resolve) => setTimeout(resolve, GRACEFUL_SHUTDOWN_MS));
    } finally {
      if (this.isProcessRunning()) this.process!.kill('SIGKILL');
      this.process = null;
      this.logStream?.end();
      this.logStream = null;
      this.stopping = false;
    }
  }

  getStatus(): HermesStatus {
    return {
      running: this.isProcessRunning(),
      pid: this.process?.pid,
      restartCount: this.restartCount,
      lastError: this.lastError,
    };
  }

  isProcessRunning(): boolean {
    if (!this.process || this.process.killed) return false;
    try {
      process.kill(this.process.pid!, 0);
      return true;
    } catch {
      return false;
    }
  }

  private async waitForHealth(): Promise<void> {
    const deadline = Date.now() + HEALTH_POLL_TIMEOUT;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/health`);
        if (res.ok) return;
      } catch { /* not ready yet */ }
      await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL));
    }
    throw new Error(`Hermes did not become healthy within ${HEALTH_POLL_TIMEOUT}ms`);
  }

  private setupLogStream(): void {
    try {
      const logDir = join(app.getPath('logs'), 'hermes');
      mkdirSync(logDir, { recursive: true });

      const now = Date.now();
      for (const file of readdirSync(logDir)) {
        const filePath = join(logDir, file);
        try {
          const stat = require('fs').statSync(filePath);
          if (now - stat.mtimeMs > LOG_RETENTION_DAYS * 86400 * 1000) unlinkSync(filePath);
        } catch { /* skip */ }
      }

      const logFile = join(logDir, `hermes-${Date.now()}.log`);
      this.logStream = createWriteStream(logFile, { flags: 'a' });
    } catch (err) {
      console.warn('[Hermes:Process] Failed to setup log stream:', err);
    }
  }
}

export const hermesProcessService = new HermesProcessService();
```

- [ ] **Step 4: Run test — verify it passes**

```bash
pnpm --filter @linkingchat/desktop test -- --testPathPattern="hermes-process.service"
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/services/hermes-process.service.ts apps/desktop/src/main/services/__tests__/hermes-process.service.spec.ts
git commit -m "feat(desktop): add HermesProcessService for sidecar lifecycle management"
```

---

## Task 6: SetupService

**Files:**
- Create: `apps/desktop/src/main/services/setup.service.ts`
- Test: `apps/desktop/src/main/services/__tests__/setup.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/desktop/src/main/services/__tests__/setup.service.spec.ts
import { SetupService } from '../setup.service';

jest.mock('electron-store', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn((key: string, defaultVal?: any) => defaultVal),
    set: jest.fn(),
  }));
});

jest.mock('electron', () => ({
  app: { isPackaged: false },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('SetupService', () => {
  let service: SetupService;
  let mockStore: any;

  beforeEach(() => {
    service = new SetupService();
    mockStore = (service as any).store;
    jest.clearAllMocks();
  });

  it('skips if setupComplete is true', async () => {
    mockStore.get.mockReturnValueOnce(true);
    await service.initialize('user-1', 'token-abc');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches API key and saves to store on first run', async () => {
    mockStore.get.mockReturnValue(false);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { apiKey: 'sk-test-123', provider: 'deepseek' } }),
    });

    await service.initialize('user-1', 'token-abc');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/config/agent-key'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token-abc' }) }),
    );
    expect(mockStore.set).toHaveBeenCalledWith('platformApiKey', 'sk-test-123');
    expect(mockStore.set).toHaveBeenCalledWith('setupComplete', true);
  });

  it('does not set setupComplete if API key fetch fails', async () => {
    mockStore.get.mockReturnValue(false);
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await service.initialize('user-1', 'token-abc');

    const setCalls = mockStore.set.mock.calls.map((c: any[]) => c[0]);
    expect(setCalls).not.toContain('setupComplete');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm --filter @linkingchat/desktop test -- --testPathPattern="setup.service.spec"
```

Expected: FAIL — `Cannot find module '../setup.service'`

- [ ] **Step 3: Implement SetupService**

```typescript
// apps/desktop/src/main/services/setup.service.ts
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
```

- [ ] **Step 4: Run test — verify it passes**

```bash
pnpm --filter @linkingchat/desktop test -- --testPathPattern="setup.service.spec"
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/services/setup.service.ts apps/desktop/src/main/services/__tests__/setup.service.spec.ts
git commit -m "feat(desktop): add SetupService for first-launch API key fetch"
```

---

## Task 7: Server config endpoint

**Files:**
- Create: `apps/server/src/config/config.controller.ts`
- Create: `apps/server/src/config/config.module.ts`
- Modify: `apps/server/src/app.module.ts`
- Test: `apps/server/src/config/__tests__/config.controller.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/server/src/config/__tests__/config.controller.spec.ts
import { Test } from '@nestjs/testing';
import { ConfigController } from '../config.controller';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EmailVerifiedGuard } from '../../auth/guards/email-verified.guard';

describe('ConfigController', () => {
  let controller: ConfigController;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ConfigController],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(EmailVerifiedGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ConfigController);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns apiKey from DEEPSEEK_API_KEY', () => {
    process.env.DEEPSEEK_API_KEY = 'sk-deepseek-test';
    delete process.env.KIMI_API_KEY;

    const result = controller.getAgentKey();

    expect(result).toEqual({
      success: true,
      data: { apiKey: 'sk-deepseek-test', provider: 'deepseek' },
    });
  });

  it('falls back to KIMI_API_KEY when DEEPSEEK missing', () => {
    delete process.env.DEEPSEEK_API_KEY;
    process.env.KIMI_API_KEY = 'sk-kimi-test';

    const result = controller.getAgentKey();

    expect(result).toEqual({
      success: true,
      data: { apiKey: 'sk-kimi-test', provider: 'kimi' },
    });
  });

  it('throws when no API key configured', () => {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.KIMI_API_KEY;

    expect(() => controller.getAgentKey()).toThrow('No LLM API key configured');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="config.controller"
```

Expected: FAIL — `Cannot find module '../config.controller'`

- [ ] **Step 3: Implement ConfigController**

```typescript
// apps/server/src/config/config.controller.ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';

@Controller('config')
export class ConfigController {
  @Get('agent-key')
  @UseGuards(JwtAuthGuard, EmailVerifiedGuard)
  getAgentKey(): { success: boolean; data: { apiKey: string; provider: string } } {
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    const kimiKey = process.env.KIMI_API_KEY;

    if (deepseekKey) {
      return { success: true, data: { apiKey: deepseekKey, provider: 'deepseek' } };
    }
    if (kimiKey) {
      return { success: true, data: { apiKey: kimiKey, provider: 'kimi' } };
    }

    throw new Error('No LLM API key configured on server');
  }
}
```

- [ ] **Step 4: Create ConfigModule**

```typescript
// apps/server/src/config/config.module.ts
import { Module } from '@nestjs/common';
import { ConfigController } from './config.controller';

@Module({
  controllers: [ConfigController],
})
export class AppConfigModule {}
```

- [ ] **Step 5: Register in AppModule**

Open `apps/server/src/app.module.ts`. Add:

```typescript
// At top of file:
import { AppConfigModule } from './config/config.module';

// In @Module({ imports: [...] }):
AppConfigModule,
```

- [ ] **Step 6: Run test — verify it passes**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="config.controller"
```

Expected: PASS (3 tests)

- [ ] **Step 7: Verify server build**

```bash
pnpm --filter @linkingchat/server build
```

Expected: BUILD SUCCESS

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/config/ apps/server/src/app.module.ts
git commit -m "feat(server): add GET /config/agent-key endpoint for platform LLM key"
```

---

## Task 8: Wire everything into app startup

**Files:**
- Create: `apps/desktop/src/main/ipc/agent.ipc.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/main/ipc/openclaw.ipc.ts`

- [ ] **Step 1: Create agent.ipc.ts**

```typescript
// apps/desktop/src/main/ipc/agent.ipc.ts
import { ipcMain } from 'electron';
import { AgentProviderFactory } from '../agents/agent-provider.factory';
import type { AgentType } from '../agents/agent-provider.interface';

export function registerAgentIpc(): void {
  ipcMain.handle('agent:get-type', (): AgentType => {
    return AgentProviderFactory.getPersistedType();
  });

  ipcMain.handle('agent:set-type', (_event, type: AgentType): { success: boolean } => {
    try {
      AgentProviderFactory.create(type);
      return { success: true };
    } catch (error: unknown) {
      console.error('[Agent IPC] Failed to set agent type:', (error as Error).message);
      return { success: false };
    }
  });
}
```

- [ ] **Step 2: Update index.ts — add imports**

Open `apps/desktop/src/main/index.ts`. Add these imports after the existing import block:

```typescript
import { hermesProcessService } from './services/hermes-process.service';
import { setupService } from './services/setup.service';
import { registerAgentIpc } from './ipc/agent.ipc';
import { AgentProviderFactory } from './agents/agent-provider.factory';
```

- [ ] **Step 3: Update index.ts — pre-warm sidecars on app ready**

Inside `app.whenReady().then(async () => {`, before `createWindow()`, add:

```typescript
// Pre-warm both sidecars before login screen (non-blocking)
openClawProcessService.start().catch((err: Error) =>
  console.warn('[Main] OpenClaw sidecar start error:', err.message)
);
hermesProcessService.start().catch((err: Error) =>
  console.warn('[Main] Hermes sidecar start error:', err.message)
);
```

- [ ] **Step 4: Update index.ts — register agent IPC and run setup**

After `registerOpenClawIpc()`, add:

```typescript
registerAgentIpc();
```

Inside the `if (tokens)` block, after `wsClient.connect()`, add:

```typescript
// Initialize agent from persisted preference
AgentProviderFactory.active();

// First-launch setup (no-op if already done)
setupService.initialize('', tokens.accessToken).catch((err: Error) =>
  console.warn('[Main] Setup error:', err.message)
);
```

- [ ] **Step 5: Update index.ts — shut down Hermes on quit**

Find the `app.on('window-all-closed')` or end of the file, add:

```typescript
app.on('before-quit', async () => {
  await hermesProcessService.stop();
});
```

- [ ] **Step 6: Expose agent IPC in preload**

Open `apps/desktop/src/preload/index.ts`. Inside the `contextBridge.exposeInMainWorld('electronAPI', { ... })` call, add:

```typescript
getAgentType: (): Promise<string> =>
  ipcRenderer.invoke('agent:get-type'),
setAgentType: (type: string): Promise<{ success: boolean }> =>
  ipcRenderer.invoke('agent:set-type', type),
```

- [ ] **Step 7: Route openclaw:stream-start through AgentProviderFactory**

Open `apps/desktop/src/main/ipc/openclaw.ipc.ts`. Add import:

```typescript
import { AgentProviderFactory } from '../agents/agent-provider.factory';
```

Find the `ipcMain.handle('openclaw:stream-start', ...)` handler. Replace the call to `openClawClientService.sendChatMessage(...)` (and its `for await` loop) with:

```typescript
const provider = AgentProviderFactory.active();
const stream = provider.chat({ botId, converseId, message, requestId });

for await (const chunk of stream) {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) break;
  win.webContents.send('openclaw:stream-chunk', {
    requestId,
    type: chunk.type,
    content: chunk.content,
    error: chunk.error,
  });
  if (chunk.type === 'done' || chunk.type === 'error') break;
}
```

Find `ipcMain.handle('openclaw:stream-cancel', ...)` and replace its body with:

```typescript
AgentProviderFactory.active().cancelStream(requestId);
```

- [ ] **Step 8: Type-check**

```bash
pnpm --filter @linkingchat/desktop type-check
```

Expected: no errors. Fix any type errors before continuing.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/main/ipc/agent.ipc.ts apps/desktop/src/main/index.ts apps/desktop/src/preload/index.ts apps/desktop/src/main/ipc/openclaw.ipc.ts
git commit -m "feat(desktop): wire HermesProcessService + SetupService + AgentProviderFactory into startup"
```

---

## Task 9: Build scripts for offline bundling

**Files:**
- Create: `scripts/vendor-hermes.sh`
- Create: `scripts/bundle-agents.sh`
- Modify: electron-builder config (`apps/desktop/electron-builder.yml` or `package.json`)

- [ ] **Step 1: Create vendor script**

```bash
# scripts/vendor-hermes.sh
#!/usr/bin/env bash
# Run once by a maintainer when pinning a new hermes-agent version.
# Commit the resulting vendor/hermes-wheels/ directory to the repo.
set -euo pipefail

VENDOR_DIR="vendor/hermes-wheels"
HERMES_VERSION="${1:-0.1.0}"

mkdir -p "$VENDOR_DIR"
pip download "hermes-agent==${HERMES_VERSION}" -d "$VENDOR_DIR"
echo "Done. Commit ${VENDOR_DIR}/ to the repo."
```

```bash
chmod +x scripts/vendor-hermes.sh
```

- [ ] **Step 2: Create bundle script**

```bash
# scripts/bundle-agents.sh
#!/usr/bin/env bash
# Run by CI / electron-builder beforeBuild hook.
# Requires: curl, node/npm available in CI environment.
set -euo pipefail

RESOURCES_DIR="resources"
PLATFORM="${TARGET_PLATFORM:-$(uname -s | tr '[:upper:]' '[:lower:]')}"
ARCH="${TARGET_ARCH:-$(uname -m)}"

echo "==> Bundling OpenClaw sidecar..."
mkdir -p "${RESOURCES_DIR}/openclaw-sidecar"
npm install openclaw@2.0.0 --prefix "${RESOURCES_DIR}/openclaw-sidecar" --no-save
echo "    OpenClaw done."

echo "==> Downloading Python runtime (${PLATFORM}/${ARCH})..."
case "${PLATFORM}-${ARCH}" in
  darwin-arm64|darwin-aarch64)
    PYTHON_URL="https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.11.10+20241016-aarch64-apple-darwin-install_only.tar.gz"
    ;;
  darwin-x86_64)
    PYTHON_URL="https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.11.10+20241016-x86_64-apple-darwin-install_only.tar.gz"
    ;;
  windows-x86_64|mingw*-x86_64)
    PYTHON_URL="https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.11.10+20241016-x86_64-pc-windows-msvc-install_only.tar.gz"
    ;;
  linux-x86_64)
    PYTHON_URL="https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.11.10+20241016-x86_64-unknown-linux-gnu-install_only.tar.gz"
    ;;
  *)
    echo "Unsupported platform: ${PLATFORM}-${ARCH}" >&2; exit 1 ;;
esac

mkdir -p "${RESOURCES_DIR}/hermes-env"
curl -L "$PYTHON_URL" | tar -xz -C "${RESOURCES_DIR}/hermes-env/" --strip-components=1

if [[ "$PLATFORM" == "windows"* ]]; then
  PYTHON_BIN="${RESOURCES_DIR}/hermes-env/python.exe"
  PIP_BIN="${RESOURCES_DIR}/hermes-env/lib/Scripts/pip"
else
  PYTHON_BIN="${RESOURCES_DIR}/hermes-env/bin/python3.11"
  PIP_BIN="${RESOURCES_DIR}/hermes-env/lib/bin/pip"
fi

echo "==> Installing Hermes into venv (offline)..."
"$PYTHON_BIN" -m venv "${RESOURCES_DIR}/hermes-env/lib"
"$PIP_BIN" install hermes-agent --no-index --find-links vendor/hermes-wheels/

echo "==> Bundle complete. Total size:"
du -sh "${RESOURCES_DIR}/"
```

```bash
chmod +x scripts/bundle-agents.sh
```

- [ ] **Step 3: Add resources/ to .gitignore**

```bash
echo "" >> apps/desktop/.gitignore
echo "# Generated by bundle-agents.sh — do not commit" >> apps/desktop/.gitignore
echo "resources/openclaw-sidecar/" >> apps/desktop/.gitignore
echo "resources/hermes-env/" >> apps/desktop/.gitignore
```

- [ ] **Step 4: Find electron-builder config location**

```bash
ls apps/desktop/electron-builder.yml apps/desktop/electron-builder.json 2>/dev/null || echo "Check package.json build key"
```

- [ ] **Step 5: Add extraResources to electron-builder config**

If `electron-builder.yml` exists, add at root level:

```yaml
extraResources:
  - from: "resources/openclaw-sidecar"
    to: "openclaw-sidecar"
    filter:
      - "**/*"
  - from: "resources/hermes-env"
    to: "hermes-env"
    filter:
      - "**/*"
```

If config is in `package.json` under `"build"`:

```json
"extraResources": [
  { "from": "resources/openclaw-sidecar", "to": "openclaw-sidecar", "filter": ["**/*"] },
  { "from": "resources/hermes-env", "to": "hermes-env", "filter": ["**/*"] }
]
```

- [ ] **Step 6: Commit**

```bash
git add scripts/bundle-agents.sh scripts/vendor-hermes.sh apps/desktop/.gitignore
git add apps/desktop/electron-builder.yml  # or package.json
git commit -m "feat(build): add offline bundling scripts for OpenClaw + Hermes sidecars"
```

---

## Task 10: Full integration smoke test

- [ ] **Step 1: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass

- [ ] **Step 2: Bundle resources locally (macOS arm64)**

```bash
bash scripts/bundle-agents.sh darwin arm64
```

Expected output ends with `Bundle complete. Total size:` and shows ~260MB for `resources/`.

Verify files exist:
```bash
ls resources/openclaw-sidecar/node_modules/openclaw/
ls resources/hermes-env/lib/bin/hermes
```

- [ ] **Step 3: Start dev app and check console**

```bash
pnpm dev:desktop
```

In the Electron main process console, look for:
```
[OpenClaw:Process] Using bundled sidecar: .../resources/openclaw-sidecar/...
[Hermes:Process] Started on port 8765
```

- [ ] **Step 4: Log in and verify JARVIS greeting**

1. Log in with a test account
2. Navigate to the Supervisor Bot converse
3. Verify: welcome message "你好！我是你的 JARVIS。我已经准备好了，有什么我可以帮你的？" appears immediately
4. Send a test message, verify streaming response appears

- [ ] **Step 5: Test agent switching**

1. Open Settings (or call from console: `await window.electronAPI.setAgentType('hermes')`)
2. Send a message
3. Confirm main process console shows Hermes handling the request

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat: zero-friction onboarding — OpenClaw + Hermes bundled offline, JARVIS greets on login"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Covered by task |
|---|---|
| Offline bundling — OpenClaw | Task 9 (`bundle-agents.sh` npm install) |
| Offline bundling — Python + Hermes | Task 9 (python-build-standalone + pip offline) |
| Offline bundling — electron-builder config | Task 9 (extraResources) |
| AgentProvider interface | Task 1 |
| OpenClawAdapter | Task 2 |
| HermesAdapter (SSE) | Task 3 |
| AgentProviderFactory + persistence | Task 4 |
| HermesProcessService | Task 5 |
| SetupService — API key fetch | Task 6 |
| Server GET /config/agent-key | Task 7 |
| Pre-warm sidecars on app ready | Task 8 (Step 3) |
| IPC stream routed through AgentProvider | Task 8 (Step 7) |
| Preload bridge for renderer | Task 8 (Step 6) |
| Graceful Hermes shutdown on quit | Task 8 (Step 5) |
| Error handling — sidecar crash auto-restart | Task 5 (exit handler + backoff) |
| Error handling — API key fetch failure | Task 6 (no setupComplete on failure) |
| Error handling — stream error yield | Task 3 (error chunk) |

**No placeholders.** Every step has concrete code.

**Type consistency:**
- `ChatChunk.content` defined Task 1 → used Task 2 (map from `text`), Task 3, Task 8 stream handler ✓
- `AgentType` defined Task 1 → used Tasks 4, 7, 8 ✓
- `AgentProviderFactory.active()` defined Task 4 → called Task 8 Steps 3, 7 ✓
- `hermesProcessService` singleton exported Task 5 → imported Task 8 ✓
- `setupService` singleton exported Task 6 → imported Task 8 ✓
