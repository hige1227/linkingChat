# OpenClaw Bot Chat Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Desktop Bot chat windows (Supervisor / Coding Bot) to the local OpenClaw Gateway so messages route through local Agent execution with real-time streaming reply display.

**Architecture:** User message in a Bot converse → Renderer IPC → Main process (openclaw.ipc.ts) → OpenClaw WS client (`chat.send`) → streams `stream=assistant` / `stream=tool` chunks back → Renderer renders streaming bubble → on `lifecycle phase=end`, persist bot reply via `POST /api/v1/bots/:botId/reply` to Server.

**Tech Stack:** NestJS (server), React + Zustand (desktop renderer), Electron IPC, OpenClaw WS client (existing), Jest (tests)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/server/src/bots/bots.service.ts` | Modify | Add `saveBotReply()` method |
| `apps/server/src/bots/bots.controller.ts` | Modify | Add `POST :botId/reply` endpoint |
| `apps/server/src/bots/bots.module.ts` | Modify | Import `ConversesModule` + inject `BroadcastService` |
| `apps/server/src/bots/bots.service.spec.ts` | Modify | Add test for `saveBotReply()` |
| `apps/desktop/src/main/ipc/openclaw.ipc.ts` | Modify | Add `openclaw:stream-start` and `openclaw:stream-cancel` IPC handlers |
| `apps/desktop/src/preload/index.ts` | Modify | Expose `openClawStartStream`, `openClawCancelStream`, `onOpenClawStreamChunk`, `offOpenClawStreamChunk` |
| `apps/desktop/src/renderer/stores/chatStore.ts` | Modify | Add `StreamingMessage` type + `streamingMessages` state + `addStreamingMessage`, `appendStreamChunk`, `removeStreamingMessage` actions |
| `apps/desktop/src/renderer/hooks/useOpenClawChat.ts` | Create | React hook: chunk listener + `sendMessage` + `cancel` |
| `apps/desktop/src/renderer/components/chat/MessageInput.tsx` | Modify | Bot converse detection → OpenClaw routing branch + offline hint |
| `apps/desktop/src/renderer/components/chat/ChatThread.tsx` | Modify | Render streaming bot reply bubbles |
| `apps/desktop/src/renderer/styles/chat.css` | Modify | Streaming cursor, tool-call indicator, bot offline hint styles |

---

## Task 1: Server — `saveBotReply()` Service Method

**Files:**
- Modify: `apps/server/src/bots/bots.service.ts`
- Modify: `apps/server/src/bots/bots.module.ts`

### Understanding the existing pattern

`BotCommunicationService.sendBotMessage()` (in `bot-communication.service.ts`) already persists messages as bot users. We follow the same pattern: use `bot.userId` as `authorId`, then call `broadcastService.toRoom()`.

The current `BotsService` constructor only injects `PrismaService`. We need to also inject `BroadcastService` and `ConversesService`.

`bots.module.ts` currently imports only `AiModule`. `ConversesModule` must be added so `ConversesService` is available.

- [ ] **Step 1: Write the failing test for `saveBotReply()`**

Add to `apps/server/src/bots/bots.service.spec.ts` — after existing tests, before the closing `});`:

```typescript
describe('saveBotReply()', () => {
  const mockConverseService = {
    verifyMembership: jest.fn().mockResolvedValue(undefined),
  };
  const mockBroadcastService = {
    toRoom: jest.fn(),
  };

  const replyDto = { converseId: 'converse-001', content: 'Bot reply text' };

  const mockSavedMessage = {
    id: 'msg-999',
    content: 'Bot reply text',
    converseId: 'converse-001',
    authorId: 'bot-user-001',
    author: { id: 'bot-user-001', username: 'bot_test', displayName: 'Test Bot', avatarUrl: null },
    type: 'TEXT',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    // Override module with extra providers
    mockPrisma.bot.findFirst.mockResolvedValue(mockBot);
    mockPrisma.message.create.mockResolvedValue(mockSavedMessage);
    jest.spyOn(mockConverseService, 'verifyMembership');
    jest.spyOn(mockBroadcastService, 'toRoom');
  });

  it('should persist bot reply message and broadcast it', async () => {
    // We'll test the service when wired with ConversesService and BroadcastService
    const module = await Test.createTestingModule({
      providers: [
        BotsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: 'ConversesService', useValue: mockConverseService },
        { provide: BroadcastService, useValue: mockBroadcastService },
      ],
    }).compile();
    const svc = module.get<BotsService>(BotsService);

    const result = await svc.saveBotReply(mockOwnerId, 'bot-001', replyDto);

    expect(mockPrisma.bot.findFirst).toHaveBeenCalledWith({
      where: { id: 'bot-001', ownerId: mockOwnerId },
    });
    expect(mockConverseService.verifyMembership).toHaveBeenCalledWith(
      'converse-001', mockOwnerId,
    );
    expect(mockPrisma.message.create).toHaveBeenCalledWith({
      data: {
        content: 'Bot reply text',
        converseId: 'converse-001',
        authorId: 'bot-user-001',
      },
      include: {
        author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
    expect(mockBroadcastService.toRoom).toHaveBeenCalledWith(
      'converse-001', 'message:new', mockSavedMessage,
    );
    expect(result).toEqual(mockSavedMessage);
  });

  it('should throw NotFoundException when bot does not belong to user', async () => {
    mockPrisma.bot.findFirst.mockResolvedValue(null);
    const module = await Test.createTestingModule({
      providers: [
        BotsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: 'ConversesService', useValue: mockConverseService },
        { provide: BroadcastService, useValue: mockBroadcastService },
      ],
    }).compile();
    const svc = module.get<BotsService>(BotsService);

    await expect(svc.saveBotReply(mockOwnerId, 'bad-bot', replyDto)).rejects.toThrow(
      NotFoundException,
    );
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/ZenoWang/Documents/project/linkingChat
pnpm --filter @linkingchat/server test -- --testPathPattern=bots.service.spec --no-coverage
```

Expected: FAIL — `saveBotReply is not a function`

- [ ] **Step 3: Update `bots.module.ts` to import ConversesModule**

In `apps/server/src/bots/bots.module.ts`, update the imports array:

```typescript
import { Module } from '@nestjs/common';
import { BotsController } from './bots.controller';
import { BotsService } from './bots.service';
import { BotInitService } from './bot-init.service';
import { BotCommunicationService } from './bot-communication.service';
import { AiModule } from '../ai/ai.module';
import { ConversesModule } from '../converses/converses.module';

@Module({
  imports: [AiModule, ConversesModule],
  controllers: [BotsController],
  providers: [BotsService, BotInitService, BotCommunicationService],
  exports: [BotsService, BotInitService, BotCommunicationService],
})
export class BotsModule {}
```

- [ ] **Step 4: Check that ConversesModule exports ConversesService**

Read `apps/server/src/converses/converses.module.ts` and verify `ConversesService` is in its `exports` array. If not, add it.

Expected content should include:
```typescript
exports: [ConversesService],
```

- [ ] **Step 5: Add `saveBotReply()` to `bots.service.ts`**

Update the constructor and add the new method. The constructor currently only has `PrismaService`. Update to:

```typescript
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { agentConfigSchema } from '@linkingchat/shared';
import { BroadcastService } from '../gateway/broadcast.service';
import { ConversesService } from '../converses/converses.service';

@Injectable()
export class BotsService {
  private readonly logger = new Logger(BotsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcastService: BroadcastService,
    @Inject(forwardRef(() => ConversesService))
    private readonly conversesService: ConversesService,
  ) {}
```

Then add the new method at the end of the class, before the closing `}`:

```typescript
  /**
   * Persist a bot reply message (called from Desktop after OpenClaw streaming completes)
   *
   * Flow:
   * 1. Validate bot belongs to user
   * 2. Validate user is a converse member
   * 3. Persist message as bot user (Bot-as-User pattern)
   * 4. Broadcast message:new to converse room
   */
  async saveBotReply(
    userId: string,
    botId: string,
    dto: { converseId: string; content: string },
  ) {
    const bot = await this.prisma.bot.findFirst({
      where: { id: botId, ownerId: userId },
    });
    if (!bot) throw new NotFoundException('Bot not found');

    await this.conversesService.verifyMembership(dto.converseId, userId);

    const message = await this.prisma.message.create({
      data: {
        content: dto.content,
        converseId: dto.converseId,
        authorId: bot.userId,
      },
      include: {
        author: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
    });

    this.broadcastService.toRoom(dto.converseId, 'message:new', message);

    return message;
  }
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern=bots.service.spec --no-coverage
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /Users/ZenoWang/Documents/project/linkingChat
git add apps/server/src/bots/bots.service.ts \
        apps/server/src/bots/bots.service.spec.ts \
        apps/server/src/bots/bots.module.ts
git commit -m "feat(bots): add saveBotReply() method + ConversesModule import"
```

---

## Task 2: Server — `POST /api/v1/bots/:botId/reply` Endpoint

**Files:**
- Modify: `apps/server/src/bots/bots.controller.ts`

- [ ] **Step 1: Write the failing test (controller-level)**

In `apps/server/src/bots/bots.service.spec.ts`, add a note that controller-level routing is verified via integration — the unit tests above for `saveBotReply()` cover the business logic. For the controller, we verify it wires correctly in the existing test setup (NestJS controller tests share the same spec pattern).

Add to the bottom of `apps/server/src/bots/bots.service.spec.ts`:

```typescript
describe('BotsController - POST :botId/reply (routing wire-up)', () => {
  it('delegates to botsService.saveBotReply with userId, botId, and body', async () => {
    const mockBotsService = {
      saveBotReply: jest.fn().mockResolvedValue({ id: 'msg-001' }),
    };
    const mockBotCommService = { sendBotMessage: jest.fn(), routeViaSupervisor: jest.fn() };

    const { BotsController } = await import('./bots.controller');
    const ctrl = new BotsController(
      mockBotsService as any,
      mockBotCommService as any,
    );

    const result = await (ctrl as any).saveBotReply(
      'user-001',
      'bot-001',
      { converseId: 'conv-001', content: 'hello' },
    );

    expect(mockBotsService.saveBotReply).toHaveBeenCalledWith(
      'user-001', 'bot-001', { converseId: 'conv-001', content: 'hello' },
    );
    expect(result).toEqual({ id: 'msg-001' });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern=bots.service.spec --no-coverage
```

Expected: FAIL — `(ctrl as any).saveBotReply is not a function`

- [ ] **Step 3: Add `saveBotReply` endpoint to `bots.controller.ts`**

Add the import for `Throttle` and the endpoint. In `apps/server/src/bots/bots.controller.ts`:

Add `Throttle` to import from `@nestjs/throttler`:
```typescript
import { Throttle } from '@nestjs/throttler';
```

Add the endpoint after the `DELETE` handler and before the `// Test-only endpoints` section:

```typescript
  /** POST /api/v1/bots/:botId/reply — Desktop 持久化 OpenClaw Bot 回复 */
  @Post(':botId/reply')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  saveBotReply(
    @CurrentUser('userId') userId: string,
    @Param('botId') botId: string,
    @Body() dto: { converseId: string; content: string },
  ) {
    return this.botsService.saveBotReply(userId, botId, dto);
  }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern=bots.service.spec --no-coverage
```

Expected: PASS

- [ ] **Step 5: Verify full server test suite still passes**

```bash
pnpm --filter @linkingchat/server test -- --no-coverage
```

Expected: All existing test suites still pass

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/bots/bots.controller.ts apps/server/src/bots/bots.service.spec.ts
git commit -m "feat(bots): add POST :botId/reply endpoint for Desktop bot persistence"
```

---

## Task 3: Main Process — Streaming IPC Handlers

**Files:**
- Modify: `apps/desktop/src/main/ipc/openclaw.ipc.ts`

This task adds two new IPC handlers to the existing `registerOpenClawIpc()` function:
- `openclaw:stream-start` — starts a fire-and-forget `chat.send` loop, pushes chunks to renderer
- `openclaw:stream-cancel` — cancels a running stream

Key detail: `openClawClientService` already has a `sendMessage()` method, but it awaits the full response. We need to call `client.chat()` directly from the WS client which returns an async iterator. Check `openclaw-client.service.ts` for the exact method name.

- [ ] **Step 1: Verify the method name on the WS client**

Read `apps/desktop/src/main/services/openclaw-client.service.ts` and find the method used for streaming chat (it should expose `sendMessage` or a generator-based `chat()` method).

```bash
grep -n "chat\|stream\|generator\|for await" apps/desktop/src/main/services/openclaw-client.service.ts
```

Note the exact method signature. The integration report says `client.chat(message, { sessionKey })` returns an async iterator yielding `{ type, text }` objects.

- [ ] **Step 2: Read `openclaw-ws-client.ts` to understand the `chat()` iterator interface**

```bash
grep -n "async \*chat\|yield\|type.*text\|stream=assistant\|stream=tool" apps/desktop/src/main/services/openclaw-ws-client.ts | head -40
```

Note the exact chunk shape: `{ type: 'text' | 'tool_use' | 'tool_result' | 'done' | 'error', text: string }`

- [ ] **Step 3: Add streaming IPC handlers to `openclaw.ipc.ts`**

At the end of the `registerOpenClawIpc()` function body, before the closing `}`:

```typescript
  // ── Streaming chat (for Bot conversations) ──
  const activeStreams = new Map<string, { cancelled: boolean }>();

  ipcMain.handle(
    'openclaw:stream-start',
    async (event, message: string, sessionKey: string): Promise<{ requestId: string }> => {
      if (!openClawClientService.isClientConnected()) {
        throw new Error('Not connected to OpenClaw Gateway');
      }
      const client = openClawClientService.getClient();
      if (!client) throw new Error('No OpenClaw client available');

      const requestId = `str-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const control = { cancelled: false };
      activeStreams.set(requestId, control);
      const win = BrowserWindow.fromWebContents(event.sender);

      // Fire-and-forget: runs in background, pushes chunks to renderer
      (async () => {
        try {
          for await (const chunk of client.chat(message, { sessionKey })) {
            if (control.cancelled) break;
            win?.webContents.send('openclaw:stream-chunk', { requestId, chunk });
          }
        } catch (err) {
          if (!control.cancelled) {
            win?.webContents.send('openclaw:stream-chunk', {
              requestId,
              chunk: {
                type: 'error',
                text: err instanceof Error ? err.message : 'Stream error',
              },
            });
          }
        } finally {
          activeStreams.delete(requestId);
        }
      })();

      return { requestId };
    },
  );

  ipcMain.handle(
    'openclaw:stream-cancel',
    (_event, requestId: string): { cancelled: boolean } => {
      const ctrl = activeStreams.get(requestId);
      if (ctrl) {
        ctrl.cancelled = true;
        activeStreams.delete(requestId);
      }
      return { cancelled: true };
    },
  );
```

**If `getClient()` does not exist on `openClawClientService`:** Check `openclaw-client.service.ts` for the actual method that exposes the raw WS client instance, or use `sendMessage` with a different approach. The integration report references `client.chat()` so there should be a `getClient()` accessor. If it's called something else (e.g., `getWsClient()`), use that name instead.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm --filter @linkingchat/desktop type-check 2>&1 | head -30
```

Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc/openclaw.ipc.ts
git commit -m "feat(desktop/ipc): add openclaw:stream-start and openclaw:stream-cancel handlers"
```

---

## Task 4: Preload — Expose Streaming API to Renderer

**Files:**
- Modify: `apps/desktop/src/preload/index.ts`

- [ ] **Step 1: Add streaming API to preload**

In `apps/desktop/src/preload/index.ts`, add four new entries to the `electronAPI` object, after the `onOpenClawStatusChanged` entry:

```typescript
  // OpenClaw streaming chat (for Bot conversations)
  openClawStartStream: (message: string, sessionKey: string) =>
    ipcRenderer.invoke('openclaw:stream-start', message, sessionKey),
  openClawCancelStream: (requestId: string) =>
    ipcRenderer.invoke('openclaw:stream-cancel', requestId),
  onOpenClawStreamChunk: (
    callback: (data: { requestId: string; chunk: { type: string; text: string } }) => void,
  ) => {
    ipcRenderer.on('openclaw:stream-chunk', (_event, data) => callback(data));
  },
  offOpenClawStreamChunk: (
    callback: (data: { requestId: string; chunk: { type: string; text: string } }) => void,
  ) => {
    ipcRenderer.removeListener('openclaw:stream-chunk', callback as never);
  },
```

- [ ] **Step 2: Update `env.d.ts` type declaration for `window.electronAPI`**

Read `apps/desktop/src/renderer/env.d.ts` and add the four new methods to the `ElectronAPI` interface:

```typescript
openClawStartStream: (message: string, sessionKey: string) => Promise<{ requestId: string }>;
openClawCancelStream: (requestId: string) => Promise<{ cancelled: boolean }>;
onOpenClawStreamChunk: (
  callback: (data: { requestId: string; chunk: { type: string; text: string } }) => void,
) => void;
offOpenClawStreamChunk: (
  callback: (data: { requestId: string; chunk: { type: string; text: string } }) => void,
) => void;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @linkingchat/desktop type-check 2>&1 | head -30
```

Expected: No new errors from preload or env.d.ts changes

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/preload/index.ts apps/desktop/src/renderer/env.d.ts
git commit -m "feat(desktop/preload): expose OpenClaw streaming IPC to renderer"
```

---

## Task 5: chatStore — Streaming Message State

**Files:**
- Modify: `apps/desktop/src/renderer/stores/chatStore.ts`

- [ ] **Step 1: Add `StreamingMessage` type and new state + actions**

In `apps/desktop/src/renderer/stores/chatStore.ts`, add the type definition before the `ChatState` interface:

```typescript
export interface StreamingMessage {
  requestId: string;
  converseId: string;
  text: string;          // Accumulated full text
  toolCalls: string[];   // Currently active tool names
  status: 'streaming' | 'done' | 'error';
  errorText?: string;
  createdAt: string;     // ISO timestamp when streaming began
}
```

Add to the `ChatState` interface:

```typescript
  streamingMessages: Record<string, StreamingMessage>; // keyed by requestId

  addStreamingMessage: (converseId: string, requestId: string) => void;
  appendStreamChunk: (requestId: string, chunk: { type: string; text: string }) => void;
  removeStreamingMessage: (requestId: string) => void;
```

Add the initial state in `create<ChatState>((set) => ({`:

```typescript
  streamingMessages: {},
```

Add the three action implementations (immutable pattern using `set`):

```typescript
  addStreamingMessage: (converseId, requestId) =>
    set((state) => ({
      streamingMessages: {
        ...state.streamingMessages,
        [requestId]: {
          requestId,
          converseId,
          text: '',
          toolCalls: [],
          status: 'streaming',
          createdAt: new Date().toISOString(),
        },
      },
    })),

  appendStreamChunk: (requestId, chunk) =>
    set((state) => {
      const sm = state.streamingMessages[requestId];
      if (!sm) return state;

      let updated: StreamingMessage;

      if (chunk.type === 'text') {
        updated = { ...sm, text: sm.text + chunk.text };
      } else if (chunk.type === 'tool_use') {
        updated = { ...sm, toolCalls: [...sm.toolCalls, chunk.text] };
      } else if (chunk.type === 'tool_result') {
        updated = {
          ...sm,
          toolCalls: sm.toolCalls.filter((t) => t !== chunk.text),
        };
      } else if (chunk.type === 'done') {
        updated = { ...sm, status: 'done' };
      } else if (chunk.type === 'error') {
        updated = { ...sm, status: 'error', errorText: chunk.text };
      } else {
        return state;
      }

      return {
        streamingMessages: { ...state.streamingMessages, [requestId]: updated },
      };
    }),

  removeStreamingMessage: (requestId) =>
    set((state) => {
      const { [requestId]: _removed, ...rest } = state.streamingMessages;
      return { streamingMessages: rest };
    }),
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @linkingchat/desktop type-check 2>&1 | head -30
```

Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/stores/chatStore.ts
git commit -m "feat(desktop/store): add StreamingMessage state and actions to chatStore"
```

---

## Task 6: New Hook — `useOpenClawChat`

**Files:**
- Create: `apps/desktop/src/renderer/hooks/useOpenClawChat.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '../stores/chatStore';

const API_URL = 'http://localhost:3008/api/v1';

export function useOpenClawChat(converseId: string) {
  const activeRequestRef = useRef<string | null>(null);

  // Register global chunk listener once per mount
  useEffect(() => {
    const handler = (data: {
      requestId: string;
      chunk: { type: string; text: string };
    }) => {
      useChatStore.getState().appendStreamChunk(data.requestId, data.chunk);
    };
    window.electronAPI.onOpenClawStreamChunk(handler);
    return () => window.electronAPI.offOpenClawStreamChunk(handler);
  }, []);

  const sendMessage = useCallback(
    async (message: string, botId: string, token: string): Promise<void> => {
      const sessionKey = `bot_converse_${converseId}`;

      // 1. Start stream → returns requestId immediately
      const { requestId } = await window.electronAPI.openClawStartStream(
        message,
        sessionKey,
      );
      activeRequestRef.current = requestId;

      // 2. Add streaming placeholder bubble in store
      useChatStore.getState().addStreamingMessage(converseId, requestId);

      // 3. Wait for streaming to complete (done or error)
      await new Promise<void>((resolve) => {
        const unsubscribe = useChatStore.subscribe((state) => {
          const sm = state.streamingMessages[requestId];
          if (!sm || sm.status === 'done' || sm.status === 'error') {
            unsubscribe();
            resolve();
          }
        });
      });

      // 4. Persist bot reply to server
      const finalState = useChatStore.getState().streamingMessages[requestId];
      if (finalState?.status === 'done' && finalState.text) {
        try {
          await fetch(`${API_URL}/bots/${botId}/reply`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ converseId, content: finalState.text }),
          });
        } catch (err) {
          // Log but do not re-throw: user already saw the streaming reply
          console.error('[Bot] Failed to persist bot reply:', err);
        }
      }

      // 5. Remove placeholder — persisted message arrives via socket as message:new
      useChatStore.getState().removeStreamingMessage(requestId);
      activeRequestRef.current = null;
    },
    [converseId],
  );

  const cancel = useCallback((): void => {
    if (activeRequestRef.current) {
      window.electronAPI.openClawCancelStream(activeRequestRef.current);
      useChatStore.getState().removeStreamingMessage(activeRequestRef.current);
      activeRequestRef.current = null;
    }
  }, []);

  return { sendMessage, cancel };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @linkingchat/desktop type-check 2>&1 | head -30
```

Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/hooks/useOpenClawChat.ts
git commit -m "feat(desktop/hooks): add useOpenClawChat hook for streaming bot conversations"
```

---

## Task 7: MessageInput — Bot Routing Branch

**Files:**
- Modify: `apps/desktop/src/renderer/components/chat/MessageInput.tsx`

The plan's converse data includes `isBot: boolean` and `botInfo: { id, name, type } | null` (added server-side by `converses.service.ts`). These are stored in `chatStore.converses` as `(ConverseResponse & { isBot: boolean; botInfo: ... })`.

- [ ] **Step 1: Add bot detection state at the top of `MessageInput`**

After the existing `useState` declarations (around line 22), add:

```typescript
  // Bot converse detection
  const converse = useChatStore((s) => s.converses.find((c) => c.id === converseId));
  const isBotConverse = Boolean((converse as any)?.isBot);
  const botId: string | undefined = (converse as any)?.botInfo?.id;

  // OpenClaw connection state (for offline hint)
  const [openClawConnected, setOpenClawConnected] = useState(false);

  // Streaming send hook
  const { sendMessage: sendOpenClawMessage } = useOpenClawChat(converseId);
```

Add the import at the top of the file:
```typescript
import { useOpenClawChat } from '../../hooks/useOpenClawChat';
```

- [ ] **Step 2: Add OpenClaw status effect**

After the existing `useEffect` for `converseId` reset (around line 40), add:

```typescript
  // Track OpenClaw connection state for offline hint
  useEffect(() => {
    window.electronAPI.getOpenClawStatus().then((s) => {
      setOpenClawConnected(s.connected);
    });
    window.electronAPI.onOpenClawStatusChanged(setOpenClawConnected);
  }, []);
```

- [ ] **Step 3: Add bot routing branch in `handleSend`**

In `handleSend`, after the `showAiHint` block (around line 136), add the bot routing branch. Insert before `setText('')`:

```typescript
    // Bot converse: route to local OpenClaw Gateway
    if (isBotConverse && botId) {
      const content = text.trim();
      if (!content || sending) return;

      setText('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';

      const token = await window.electronAPI.getToken();
      if (!token) return;

      // Persist user message via normal REST (echoes back via socket)
      try {
        await fetch(`${API_URL}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ converseId, content }),
        });
      } catch (err) {
        console.error('[Bot] Failed to persist user message:', err);
      }

      // Fire OpenClaw stream non-blocking
      sendOpenClawMessage(content, botId, token).catch((err) => {
        console.error('[Bot] OpenClaw chat failed:', err);
      });

      textareaRef.current?.focus();
      return;
    }
```

Add the `API_URL` constant near the top of the file (after imports):
```typescript
const API_URL = 'http://localhost:3008/api/v1';
```

Also replace the existing hardcoded URL `'http://localhost:3008/api/v1/messages'` (line 149) with `` `${API_URL}/messages` `` to stay consistent.

- [ ] **Step 4: Add offline hint to render output**

In the `return` JSX, after the `showAiHint` block and before `<div className="message-input-wrapper">`, add:

```tsx
      {isBotConverse && !openClawConnected && (
        <div className="bot-offline-hint">
          ⚠ AI assistant offline — restart Desktop to reconnect
        </div>
      )}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
pnpm --filter @linkingchat/desktop type-check 2>&1 | head -30
```

Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/components/chat/MessageInput.tsx
git commit -m "feat(desktop/chat): route Bot converse messages through OpenClaw Gateway"
```

---

## Task 8: ChatThread — Render Streaming Bubbles

**Files:**
- Modify: `apps/desktop/src/renderer/components/chat/ChatThread.tsx`

- [ ] **Step 1: Add streaming messages selector**

In `ChatThread`, after the `const readReceipts = ...` line (around line 29), add:

```typescript
  const streamingMessages = useChatStore((s) =>
    Object.values(s.streamingMessages).filter((sm) => sm.converseId === converseId),
  );
```

Add the `StreamingMessage` type import:
```typescript
import type { StreamingMessage } from '../../stores/chatStore';
```

- [ ] **Step 2: Add streaming bubbles to the render output**

In the `return` JSX, after the `typing.length > 0` block and before `<div ref={bottomRef} />`, add:

```tsx
        {/* Streaming bot reply bubbles */}
        {streamingMessages.map((sm) => (
          <div key={sm.requestId} className="chat-message other with-avatar streaming-message">
            <div className="chat-message-avatar">AI</div>
            <div className="chat-message-body">
              <div className="chat-message-bubble">
                <div className="chat-message-content">
                  {sm.toolCalls.length > 0 && (
                    <div className="tool-call-indicator">
                      🔧 {sm.toolCalls[sm.toolCalls.length - 1]}...
                    </div>
                  )}
                  <span className="streaming-text">
                    {sm.text || '\u00a0'}
                  </span>
                  {sm.status === 'streaming' && (
                    <span className="streaming-cursor" aria-hidden="true" />
                  )}
                  {sm.status === 'error' && (
                    <span className="streaming-error">⚠ {sm.errorText}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
```

- [ ] **Step 3: Scroll to bottom when streaming starts**

The existing scroll logic in `useEffect` watches `msgs.length`. Streaming messages are separate, so add a second effect:

```typescript
  // Also scroll to bottom when streaming messages appear/change
  useEffect(() => {
    if (wasAtBottomRef.current && streamingMessages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamingMessages.length]);
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm --filter @linkingchat/desktop type-check 2>&1 | head -30
```

Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/components/chat/ChatThread.tsx
git commit -m "feat(desktop/chat): render streaming bot reply bubbles in ChatThread"
```

---

## Task 9: CSS — Streaming Styles

**Files:**
- Modify: `apps/desktop/src/renderer/styles/chat.css`

- [ ] **Step 1: Append streaming styles**

At the end of `apps/desktop/src/renderer/styles/chat.css`, append:

```css
/* ── OpenClaw Streaming Chat ── */

/* Blinking cursor — WeChat style: thin bar */
.streaming-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: #999;
  vertical-align: text-bottom;
  animation: blink 1s step-end infinite;
  margin-left: 2px;
}
@keyframes blink {
  50% { opacity: 0; }
}

/* Tool call indicator — subtle italic inside bubble */
.tool-call-indicator {
  font-size: 11px;
  color: #aaa;
  font-style: italic;
  padding-bottom: 4px;
  display: block;
}

/* Streaming message bubble (same as 'other' side) */
.streaming-message .chat-message-bubble {
  background: #f5f5f5;
  border-radius: 4px 12px 12px 12px;
}

/* Error state text */
.streaming-error {
  color: #e53e3e;
  font-size: 12px;
  display: block;
  margin-top: 4px;
}

/* Bot offline hint bar above input */
.bot-offline-hint {
  font-size: 12px;
  color: #e53e3e;
  text-align: center;
  padding: 4px 8px;
  background: #fff5f5;
  border-top: 1px solid #fed7d7;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/styles/chat.css
git commit -m "feat(desktop/styles): add streaming bubble, cursor, and bot-offline-hint CSS"
```

---

## Task 10: End-to-End Verification

- [ ] **Step 1: Start the full stack**

```bash
# Terminal 1
pnpm docker:up

# Terminal 2
pnpm dev:server
# Wait for: [Nest] Application is running on: http://localhost:3008/api/v1

# Terminal 3
pnpm dev:desktop
# Wait for: [OpenClaw] Connected to Gateway successfully
```

- [ ] **Step 2: Basic streaming verification**

Open Supervisor Bot chat → type "你好" → press Enter

Expected sequence:
1. User message bubble appears
2. Bot bubble appears immediately with blinking cursor
3. Text accumulates character by character
4. Cursor disappears when complete
5. Refresh page → bot reply still visible (persisted to DB)

- [ ] **Step 3: Tool call verification**

In Supervisor Bot → type "帮我运行 ls -la"

Expected:
1. "🔧 shell..." appears inside bot bubble
2. Tool indicator disappears after execution
3. Command output text appears

- [ ] **Step 4: Session isolation verification**

In Supervisor Bot → type "我的名字是 Alice"
Switch to Coding Bot → type "我叫什么名字？"

Expected: Coding Bot does not know "Alice" (different sessionKey)

- [ ] **Step 5: Offline degradation verification**

In Electron DevTools console:
```js
await window.electronAPI.disconnectOpenClaw()
```

Then try sending a bot message.

Expected: Orange "⚠ AI assistant offline — restart Desktop to reconnect" banner appears above input

- [ ] **Step 6: Run full server test suite**

```bash
pnpm --filter @linkingchat/server test -- --no-coverage
```

Expected: All 30+ suites pass, no regressions

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: complete OpenClaw Bot chat window integration (streaming + persistence)"
```

---

## Error Handling Matrix

| Scenario | Handling |
|---|---|
| Gateway disconnected | `openClawStartStream` throws → `MessageInput` catch logs error; offline hint shows |
| API key expired / 401 | `chunk.type === 'error'` with "401" text → streaming bubble shows error text |
| 30s stream timeout | WS client emits `type: 'error'` → bubble shows errorText |
| Bot reply persist fails | `console.error`, user already saw streaming reply — no UX break |
| `botId` missing from converse | Falls through to normal message send logic |
| Stream cancelled by user | `cancel()` → IPC cancel → `control.cancelled = true` → placeholder removed |

---

## Out of Scope (Future Sprints)

- Markdown rendering in bot reply bubbles (currently plain text)
- Image/file attachments in Bot conversations
- Concurrent parallel streams (currently one at a time per converse)
- Bot conversation history recovery from OpenClaw session (currently Server DB only)
- Left sidebar device control panel
