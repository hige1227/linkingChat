# Zero-Friction Onboarding Design

**Date:** 2026-04-15
**Status:** Approved
**Author:** CTO (brainstormed with CEO)

## Vision

User downloads installer → double-clicks → logs in → JARVIS proactively says hello.

Zero network required after install. Zero configuration. Zero barrier.

---

## Section 1: Scope

This spec covers:

1. **Offline installer bundling** — all agent dependencies shipped inside the installer
2. **AgentProvider adapter layer** — OpenClaw and Hermes are swappable Lego bricks
3. **SetupService** — first-launch orchestrator in Electron main process
4. **First-launch conversation flow** — JARVIS greets user immediately after login

Out of scope: server-side agent changes, mobile app changes.

---

## Section 2: Offline Bundling Strategy

### What ships inside the installer

```
Installer (~420MB)
├── Electron app (renderer + main process)       ~150MB
└── resources/
    ├── openclaw-sidecar/
    │   └── cli.js                               ~8MB   (npm pack at build time)
    └── hermes-env/
        ├── python3.11                           ~80MB  (python-build-standalone)
        └── lib/                                 ~180MB (pre-installed hermes venv)
            ├── bin/hermes     (macOS/Linux)
            └── Scripts/hermes.exe  (Windows)
```

Size is acceptable: Slack ~260MB, VS Code ~350MB, Notion ~420MB.

### Build-time CI pipeline

```yaml
# electron-builder beforeBuild hook runs:

# 1. Bundle OpenClaw sidecar (pinned version)
npm install openclaw@x.y.z --prefix resources/openclaw-sidecar/

# 2. Download python-build-standalone for target platform
#    Source: https://github.com/indygreg/python-build-standalone/releases
#    Platform variants: cpython-3.11-aarch64-apple-darwin, cpython-3.11-x86_64-apple-darwin, cpython-3.11-x86_64-pc-windows-msvc
python_url="https://github.com/indygreg/python-build-standalone/releases/download/.../cpython-3.11.*.tar.gz"
curl -L $python_url | tar -xz -C resources/hermes-env/

# 3. Pre-download hermes wheels into vendor/ (committed to repo or CI cache)
#    Run once by maintainer: pip download hermes-agent==x.y.z -d vendor/

# 4. Install hermes offline using bundled python + local wheels
./resources/hermes-env/python3.11 -m venv resources/hermes-env/lib
./resources/hermes-env/lib/bin/pip install hermes-agent --no-index --find-links ./vendor/

# 5. electron-builder packages entire resources/ into app bundle
```

### Platform matrix

| Platform | OpenClaw | Python binary | Hermes |
|---|---|---|---|
| macOS arm64 | cli.js (universal) | cpython-3.11-aarch64-apple-darwin | same venv |
| macOS x64 | cli.js (universal) | cpython-3.11-x86_64-apple-darwin | same venv |
| Windows x64 | cli.js (universal) | cpython-3.11-x86_64-pc-windows-msvc | same venv |

CI matrix: 3 jobs, each produces platform-specific installer.

### Version pinning policy

- OpenClaw: pinned in `package.json` `devDependencies` as `"openclaw": "x.y.z"`, update only after testing
- Hermes: pinned in `vendor/requirements.txt` as `hermes-agent==x.y.z`
- Python runtime: pinned SHA256 in CI script
- Upgrades: test in staging installer before updating pins

---

## Section 3: AgentProvider Adapter Layer

### Interface (Desktop main process only)

```typescript
// apps/desktop/src/main/agents/agent-provider.interface.ts

export interface ChatChunk {
  type: 'text' | 'tool_call' | 'done' | 'error'
  content?: string
  error?: string
  requestId: string
}

export interface AgentProvider {
  /** Health check — resolves true if sidecar is ready */
  isReady(): Promise<boolean>

  /** Stream a chat turn. Returns async generator of chunks. */
  chat(params: {
    botId: string
    converseId: string
    message: string
    requestId: string
  }): AsyncGenerator<ChatChunk>

  /** Cancel an in-flight stream */
  cancelStream(requestId: string): void

  /** Human-readable name shown in settings */
  readonly name: string
}
```

### OpenClawAdapter

Thin wrapper over existing `openclaw-ws-client.ts`. Delegates:

| AgentProvider method | OpenClaw implementation |
|---|---|
| `isReady()` | `openClawClientService.isConnected()` |
| `chat()` | `OpenClawWsClient.chat()` AsyncGenerator (already exists) |
| `cancelStream()` | `openClawClientService.cancelStream(requestId)` |

File: `apps/desktop/src/main/agents/openclaw.adapter.ts`

### HermesAdapter

Hermes exposes OpenAI-compatible HTTP SSE on `localhost:8765`.

| AgentProvider method | Hermes implementation |
|---|---|
| `isReady()` | `GET http://localhost:8765/health` |
| `chat()` | `POST /v1/chat/completions` with `stream: true`, parse SSE |
| `cancelStream()` | `AbortController.abort()` |

File: `apps/desktop/src/main/agents/hermes.adapter.ts`

```typescript
// HermesAdapter.chat() core pattern
async *chat({ message, requestId }) {
  const controller = new AbortController()
  this.activeStreams.set(requestId, controller)

  const res = await fetch('http://localhost:8765/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'hermes',
      messages: [{ role: 'user', content: message }],
      stream: true,
    }),
    signal: controller.signal,
  })

  for await (const line of readSSELines(res.body)) {
    if (line === '[DONE]') { yield { type: 'done', requestId }; return }
    const delta = JSON.parse(line).choices[0].delta.content ?? ''
    if (delta) yield { type: 'text', content: delta, requestId }
  }
}
```

### AgentProviderFactory

```typescript
// apps/desktop/src/main/agents/agent-provider.factory.ts

export type AgentType = 'openclaw' | 'hermes'

export class AgentProviderFactory {
  static create(type: AgentType): AgentProvider {
    if (type === 'openclaw') return new OpenClawAdapter()
    if (type === 'hermes') return new HermesAdapter()
    throw new Error(`Unknown agent type: ${type}`)
  }
}
```

User preference stored in `electron-store`:
```typescript
store.get('agentType', 'openclaw')  // default: openclaw
```

---

## Section 4: Sidecar Process Management

### HermesProcessService

Mirrors existing `openclaw-process.service.ts` pattern.

```
apps/desktop/src/main/services/hermes-process.service.ts
```

Responsibilities:
- Spawn: `resources/hermes-env/lib/bin/hermes gateway start --port 8765`
- Health poll: `GET /health` every 3s
- Auto-restart on crash (max 3 attempts, backoff 2s/5s/10s)
- Log rotation: write to `app.getPath('logs')/hermes.log`
- Graceful shutdown on app quit

### Startup pre-warming

Both sidecars start **before** login screen renders. By the time user finishes logging in (~10-30s), sidecars are already warm. Login success → JARVIS greets immediately, no wait.

```typescript
// apps/desktop/src/main/index.ts  (app 'ready' event)
app.whenReady().then(async () => {
  // Start sidecars immediately, before window creation
  openClawProcessService.start()   // non-blocking
  hermesProcessService.start()     // non-blocking
  createWindow()
})
```

---

## Section 5: SetupService — First-Launch Orchestrator

```typescript
// apps/desktop/src/main/services/setup.service.ts

export class SetupService {
  async initialize(userId: string): Promise<void> {
    if (store.get('setupComplete')) return

    // 1. Wait for both sidecars to be healthy (timeout 30s)
    await Promise.all([
      this.waitForReady(openClawProcessService, 30_000),
      this.waitForReady(hermesProcessService, 30_000),
    ])

    // 2. Fetch platform API key from server (authenticated)
    const apiKey = await this.fetchPlatformApiKey(userId)
    store.set('platformApiKey', apiKey)

    // 3. Configure the default agent (OpenClaw) with the API key
    await openClawClientService.configure({ apiKey })

    // 4. Mark setup complete
    store.set('setupComplete', true)

    // 5. Bot welcome message already persisted by server BotInitService.createDefaultBots()
    //    Desktop just opens the bot converse — welcome message appears immediately
  }
}
```

### Platform API Key endpoint (server)

```
GET /api/v1/config/agent-key   (JwtAuthGuard)
Response: { apiKey: string, provider: string }
```

Server manages one shared LLM API key pool — users never need to bring their own key.

---

## Section 6: First-Launch Conversation Flow

```
User registers (server)
  └─ BotInitService.createDefaultBots(userId)
        ├─ Creates Supervisor Bot + BOT converse
        └─ Persists welcome message:
           "你好！我是你的 JARVIS。我已经准备好了，有什么我可以帮你的？"

User installs Desktop app
  └─ App starts → sidecars pre-warm in background (before login screen)

User logs in
  └─ SetupService.initialize() runs once
        ├─ Confirms sidecars healthy
        └─ Fetches & stores platform API key

Renderer loads chat
  └─ Bot converse opens → welcome message visible immediately
        └─ JARVIS is live, ready to respond
```

No polling, no delays from user's perspective. The welcome message was already written to DB at registration — Desktop just opens the conversation.

---

## Section 7: Agent Selection UI

Location: Settings → AI Engine

```
AI Engine
  ● OpenClaw  (默认，推荐)
  ○ Hermes Agent

[切换] 下一条消息生效，无需重启
```

Switching behavior:
- Both sidecars stay running (no restart)
- `AgentProviderFactory.create(newType)` returns new adapter
- `store.set('agentType', newType)`
- IPC handler swaps active provider reference

---

## Section 8: Error Handling

| Failure | Recovery |
|---|---|
| Sidecar fails to start | Show non-blocking toast, retry 3x with backoff |
| API key fetch fails | Retry on next app launch; chat still works if key cached |
| Agent stream error | Show "JARVIS 遇到了问题，请稍后再试" in chat bubble |
| Both sidecars dead | Show status indicator in sidebar, auto-retry every 60s |

User is never blocked from using social chat features. Agent failure degrades gracefully.

---

## Section 9: New Files

```
apps/desktop/src/main/
├── agents/
│   ├── agent-provider.interface.ts   (ChatChunk, AgentProvider interface)
│   ├── openclaw.adapter.ts           (wraps openclaw-ws-client)
│   ├── hermes.adapter.ts             (HTTP SSE fetch)
│   └── agent-provider.factory.ts    (create by AgentType)
├── services/
│   ├── hermes-process.service.ts     (mirrors openclaw-process.service)
│   └── setup.service.ts              (first-launch orchestrator)
└── ipc/
    └── agent.ipc.ts                  (getAgentType, setAgentType IPC)

apps/server/src/config/
└── config.controller.ts              (GET /config/agent-key endpoint)

scripts/
└── bundle-hermes.sh                  (CI: download python + install hermes offline)

resources/  (generated at build time, gitignored)
├── openclaw-sidecar/
└── hermes-env/
```

---

## Section 10: Success Criteria

- [ ] User installs app on a machine with no internet → logs in → JARVIS welcome message visible
- [ ] Switching from OpenClaw to Hermes in settings → next message uses Hermes, no restart
- [ ] Sidecar crash → auto-restarts within 10s, user sees brief status indicator only
- [ ] Both macOS and Windows installers pass offline install test in CI
- [ ] Installer size ≤ 450MB
