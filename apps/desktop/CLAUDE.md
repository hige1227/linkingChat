# Desktop — Electron + React

Electron 35 + electron-vite 3 + React 19. Full chat UI (Discord-style) + OpenClaw worker.

## Commands

```bash
pnpm dev          # electron-vite dev (hot reload)
pnpm build        # electron-vite build
pnpm type-check   # tsc --noEmit
```

Run from repo root: `pnpm dev:desktop`

## Process Architecture

```
Main Process (Node.js)
├── src/main/
│   ├── index.ts                    # App entry, window creation
│   ├── services/
│   │   ├── openclaw-client.service.ts   # OpenClaw WS client
│   │   └── command-executor.service.ts  # Dual-mode: OpenClaw → child_process fallback
│   └── ipc/
│       ├── auth.ipc.ts             # Login/logout IPC handlers
│       ├── device.ipc.ts           # Device command handlers
│       └── openclaw.ipc.ts         # openclaw:stream-start, openclaw:stream-cancel
│
Preload (Bridge)
└── src/preload/index.ts            # Exposes window.api typed bridge to renderer
    # Key APIs: openClawStartStream, openClawCancelStream, onOpenClawStreamChunk

Renderer Process (React)
└── src/renderer/
    ├── stores/
    │   ├── chatStore.ts            # Messages + streamingMessages state (Zustand)
    │   ├── friendsStore.ts         # Friends list
    │   └── aiStore.ts              # AI/whisper state
    ├── hooks/
    │   ├── useChatSocket.ts        # Socket.IO /chat namespace
    │   └── useOpenClawChat.ts      # OpenClaw streaming: sendMessage + chunk listener
    ├── components/chat/
    │   ├── ChatThread.tsx           # Message list + streaming bot reply bubbles
    │   ├── MessageInput.tsx         # Input: regular vs bot-converse OpenClaw routing
    │   └── ...
    └── pages/                      # Route-level page components
```

## IPC Pattern

```
Renderer: window.api.openClawStartStream({ botId, message })
  → Preload: ipcRenderer.invoke('openclaw:stream-start', ...)
  → Main IPC handler (openclaw.ipc.ts)
  → OpenClawClientService.sendChatMessage()
  → OpenClaw WS → streams chunks back
  → Main: mainWindow.webContents.send('openclaw:stream-chunk', chunk)
  → Renderer: onOpenClawStreamChunk callback → appendStreamChunk in chatStore
```

## Bot Converse Routing

When `MessageInput` detects a BOT converse type:
1. Calls `useOpenClawChat.sendMessage()` instead of the regular socket emit
2. `ChatThread` renders `streamingMessages` from chatStore as streaming bubbles
3. On `lifecycle phase=end`, calls `POST /api/v1/bots/:botId/reply` to persist the reply

## State Management

Zustand stores (no Redux). Stores are in `src/renderer/stores/`.
- `chatStore`: messages per converse + `streamingMessages: Map<converseId, StreamingMessage>`
- Do not mutate store state directly — use actions exported from the store.
