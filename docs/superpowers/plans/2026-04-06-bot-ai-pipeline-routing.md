# Bot → AI Pipeline Routing Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the three missing links so Bot conversations route through the AI pipeline: DM messages to bots dispatch to AgentOrchestrator, SupervisorAgent responds to chat and cross-bot notifications, and @ai in group chats routes to Supervisor instead of Whisper.

**Architecture:** Three changes all on the server side. (1) `MessagesService.detectBotRecipient` emits `agent.dispatch` via EventEmitter2, which `BotEventListener` forwards to `AgentOrchestratorService`. (2) `SupervisorAgent.handleEvent` gains handlers for `USER_MESSAGE` (LLM chat reply in the converse) and `CROSS_BOT_NOTIFY` (BOT_NOTIFICATION card in supervisor DM with "[From X]" attribution). (3) `MentionService.routeToSupervisor` checks converse type: GROUP → dispatch to supervisor agent; DIRECT/BOT → keep existing Whisper flow.

**Tech Stack:** NestJS, EventEmitter2 (`@nestjs/event-emitter`), Jest

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/server/src/messages/messages.service.ts` | Modify | Inject `EventEmitter2`; fix `detectBotRecipient` to emit `agent.dispatch` |
| `apps/server/src/messages/messages.service.spec.ts` | Modify | Add `EventEmitter2` mock; add test for `detectBotRecipient` dispatch |
| `apps/server/src/agents/impl/supervisor.agent.ts` | Modify | Handle `USER_MESSAGE` (LLM reply) and `CROSS_BOT_NOTIFY` (notification card) |
| `apps/server/src/agents/impl/supervisor.agent.spec.ts` | Modify | Add tests for the two new event handlers |
| `apps/server/src/mentions/mentions.service.ts` | Modify | `routeToSupervisor`: GROUP → agent dispatch; non-GROUP → Whisper |
| `apps/server/src/mentions/__tests__/mentions.service.spec.ts` | Modify | Add test for @ai in GROUP converse dispatching to supervisor |

---

## Task 1: Fix `detectBotRecipient` — Dispatch Bot DM Messages to Agent

**Files:**
- Modify: `apps/server/src/messages/messages.service.ts`
- Modify: `apps/server/src/messages/messages.service.spec.ts`

Currently `detectBotRecipient` (line 610) logs the message and does nothing more — the `botPipelineService.processMessage()` call is commented out. The fix is to emit an `agent.dispatch` event via EventEmitter2 using the same pattern as `MentionService.routeToBot`. The `BotEventListener.handleAgentDispatch` listener already handles this event and forwards it to `AgentOrchestratorService.dispatchEvent()`.

For the Supervisor bot, its registered `botId` in the orchestrator is the sentinel string `'supervisor-bot'` (see `supervisor.agent.ts:22` and `agents.module.ts:59`). For other (currently unimplemented) bots, dispatch with their DB `bot.id` — they will not be found in the orchestrator and will log a warning harmlessly.

- [ ] **Step 1: Write the failing test**

Add the following block to `apps/server/src/messages/messages.service.spec.ts`, inside the top-level `describe('MessagesService', ...)` block, after the last `describe` block:

```typescript
describe('detectBotRecipient', () => {
  const mockEventEmitter = { emit: jest.fn() };

  beforeEach(() => {
    mockEventEmitter.emit.mockClear();
  });

  it('should emit agent.dispatch with supervisor-bot sentinel when recipient is Supervisor', async () => {
    // Rebuild service with EventEmitter2 injected
    const { MessagesService: Svc } = await import('./messages.service');
    const { EventEmitter2 } = await import('@nestjs/event-emitter');
    const module = await Test.createTestingModule({
      providers: [
        Svc,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BroadcastService, useValue: mockBroadcast },
        { provide: ConversesService, useValue: mockConverses },
        { provide: WhisperService, useValue: mockWhisper },
        { provide: MentionService, useValue: mockMention },
        { provide: UploadService, useValue: mockUpload },
        { provide: MetricsService, useValue: mockMetricsService },
        { provide: I18nService, useValue: mockI18nService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();
    const svc = module.get<MessagesService>(Svc);

    // Stub: one other member who is a Supervisor bot
    mockPrisma.converseMember.findMany.mockResolvedValueOnce([
      { userId: 'bot-user-1' },
    ]);
    mockPrisma.bot.findUnique.mockResolvedValueOnce({
      id: 'bot-db-uuid-1',
      userId: 'bot-user-1',
      name: 'Supervisor',
    });

    // Call the private method via type cast
    await (svc as any).detectBotRecipient('user-1', 'conv-1', {
      id: 'msg-1',
      content: 'Hello bot',
      type: 'TEXT',
    });

    expect(mockEventEmitter.emit).toHaveBeenCalledWith('agent.dispatch', {
      botId: 'supervisor-bot',
      events: [
        expect.objectContaining({
          type: 'USER_MESSAGE',
          payload: expect.objectContaining({
            userId: 'user-1',
            content: 'Hello bot',
            converseId: 'conv-1',
          }),
        }),
      ],
    });
  });

  it('should emit agent.dispatch with bot db id for non-supervisor bots', async () => {
    const { MessagesService: Svc } = await import('./messages.service');
    const { EventEmitter2 } = await import('@nestjs/event-emitter');
    const module = await Test.createTestingModule({
      providers: [
        Svc,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BroadcastService, useValue: mockBroadcast },
        { provide: ConversesService, useValue: mockConverses },
        { provide: WhisperService, useValue: mockWhisper },
        { provide: MentionService, useValue: mockMention },
        { provide: UploadService, useValue: mockUpload },
        { provide: MetricsService, useValue: mockMetricsService },
        { provide: I18nService, useValue: mockI18nService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();
    const svc = module.get<MessagesService>(Svc);

    mockPrisma.converseMember.findMany.mockResolvedValueOnce([
      { userId: 'coding-user-1' },
    ]);
    mockPrisma.bot.findUnique.mockResolvedValueOnce({
      id: 'coding-bot-uuid',
      userId: 'coding-user-1',
      name: 'Coding',
    });

    await (svc as any).detectBotRecipient('user-1', 'conv-2', {
      id: 'msg-2',
      content: 'Fix this bug',
      type: 'TEXT',
    });

    expect(mockEventEmitter.emit).toHaveBeenCalledWith('agent.dispatch', {
      botId: 'coding-bot-uuid',
      events: [expect.objectContaining({ type: 'USER_MESSAGE' })],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/ZenoWang/Documents/project/linkingChat
pnpm --filter @linkingchat/server test -- --testPathPattern=messages.service.spec --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `Cannot read properties of undefined (reading 'emit')` (EventEmitter2 not yet injected)

- [ ] **Step 3: Inject `EventEmitter2` into `MessagesService` constructor**

In `apps/server/src/messages/messages.service.ts`:

Add import at the top (after the NestJS imports):
```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';
```

Update the constructor (add `EventEmitter2` as the last parameter):
```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcastService: BroadcastService,
    private readonly conversesService: ConversesService,
    private readonly whisperService: WhisperService,
    private readonly mentionService: MentionService,
    private readonly uploadService: UploadService,
    private readonly metricsService: MetricsService,
    private readonly i18n: I18nService,
    private readonly eventEmitter: EventEmitter2,
  ) {}
```

- [ ] **Step 4: Replace the comment in `detectBotRecipient` with the dispatch**

Replace lines 627–634 in `apps/server/src/messages/messages.service.ts` (the `if (bot)` block inside `detectBotRecipient`):

```typescript
      if (bot) {
        this.logger.log(
          `[Bot] Message to ${bot.name} (${bot.id}): ` +
            `type=${message.type}, content="${(message.content ?? '').substring(0, 100)}"`,
        );

        // Supervisor uses a well-known sentinel botId; other bots use their DB id
        const agentBotId =
          bot.name === 'Supervisor' ? 'supervisor-bot' : bot.id;

        const event = {
          type: 'USER_MESSAGE' as const,
          payload: {
            userId: senderId,
            content: message.content ?? '',
            converseId,
          },
          timestamp: new Date(),
          source: { userId: senderId, botId: bot.id },
        };

        this.eventEmitter.emit('agent.dispatch', {
          botId: agentBotId,
          events: [event],
        });

        this.logger.log(
          `[Bot] Dispatched USER_MESSAGE to agent ${agentBotId}`,
        );
      }
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern=messages.service.spec --no-coverage 2>&1 | tail -20
```

Expected: PASS

- [ ] **Step 6: Run full server test suite to check for regressions**

```bash
pnpm --filter @linkingchat/server test -- --no-coverage 2>&1 | tail -10
```

Expected: All suites pass

- [ ] **Step 7: Commit**

```bash
cd /Users/ZenoWang/Documents/project/linkingChat
git add apps/server/src/messages/messages.service.ts \
        apps/server/src/messages/messages.service.spec.ts
git commit -m "feat(messages): dispatch USER_MESSAGE to agent orchestrator via EventEmitter2"
```

---

## Task 2: `SupervisorAgent` — Handle `USER_MESSAGE` (LLM Chat Reply)

**Files:**
- Modify: `apps/server/src/agents/impl/supervisor.agent.ts`
- Modify: `apps/server/src/agents/impl/supervisor.agent.spec.ts`

Currently `handleEvent` only processes `DEVICE_RESULT` events. When a user DMs the Supervisor bot, the dispatched `USER_MESSAGE` event arrives here but is silently ignored. This task adds a handler that generates an LLM reply and posts it back to the same converse.

The `UserMessagePayload` interface already has `{ userId, content, converseId }`. The supervisor replies as its bot user via `messagesService.create(supervisorBot.userId, ...)` — the same pattern used in `sendNotification`.

- [ ] **Step 1: Write the failing test**

Add the following `describe` block in `apps/server/src/agents/impl/supervisor.agent.spec.ts`, inside the top-level `describe('SupervisorAgent', ...)`, after the existing `generateResponse` block:

```typescript
  describe('handleEvent — USER_MESSAGE', () => {
    it('should call llmRouter and create a reply message in the source converse', async () => {
      const events: AgentEvent[] = [
        {
          type: 'USER_MESSAGE',
          payload: {
            userId: 'u1',
            content: 'Hello Supervisor',
            converseId: 'conv-dm-1',
          },
          timestamp: new Date(),
          source: { userId: 'u1' },
        },
      ];

      await agent.handleEvent(events);

      expect(mockLlmRouter.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: 'chat',
          messages: [{ role: 'user', content: 'Hello Supervisor' }],
        }),
      );
      expect(mockMessagesService.create).toHaveBeenCalledWith(
        'user-supervisor-1', // supervisorBot.userId
        expect.objectContaining({
          converseId: 'conv-dm-1',
          content: '任务已完成',
        }),
      );
    });

    it('should skip when no supervisorBot found for user', async () => {
      mockBotsService.findSupervisorByUserId.mockResolvedValueOnce(null);

      const events: AgentEvent[] = [
        {
          type: 'USER_MESSAGE',
          payload: { userId: 'u-unknown', content: 'hi', converseId: 'conv-x' },
          timestamp: new Date(),
          source: { userId: 'u-unknown' },
        },
      ];

      await agent.handleEvent(events);

      expect(mockMessagesService.create).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern=supervisor.agent.spec --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `create` not called (USER_MESSAGE is currently ignored)

- [ ] **Step 3: Refactor `handleEvent` and add `handleUserMessage` in `supervisor.agent.ts`**

First, update the import block at the top of `supervisor.agent.ts` to include `UserMessagePayload` and `CrossBotNotifyPayload`:

```typescript
import {
  AgentEvent,
  AgentResponse,
  AgentAction,
  ConversationContext,
  DeviceResultPayload,
  UserMessagePayload,
  CrossBotNotifyPayload,
  CommandResult,
} from '../interfaces';
```

Then replace the entire `handleEvent` method and add the new private methods. The existing DEVICE_RESULT logic is preserved as batch processing to avoid breaking existing tests:

```typescript
  async handleEvent(events: AgentEvent[]): Promise<void> {
    this.logger.log(`Supervisor handling ${events.length} events`);

    const userId = events[0]?.source.userId;
    if (!userId) {
      this.logger.warn('No userId in events, skipping');
      return;
    }

    const deviceResults: AgentEvent[] = [];

    for (const event of events) {
      try {
        switch (event.type) {
          case 'USER_MESSAGE':
            await this.handleUserMessage(event, userId);
            break;
          case 'CROSS_BOT_NOTIFY':
            await this.handleCrossBotNotify(event, userId);
            break;
          case 'DEVICE_RESULT':
            deviceResults.push(event);
            break;
          default:
            this.logger.debug(`Unhandled event type: ${event.type}`);
        }
      } catch (err) {
        this.logger.error(`Failed to handle ${event.type}:`, err);
      }
    }

    // Batch DEVICE_RESULT processing (preserves original single-call behavior)
    if (deviceResults.length > 0) {
      await this.handleDeviceResults(deviceResults, userId);
    }
  }

  private async handleUserMessage(event: AgentEvent, userId: string): Promise<void> {
    const payload = event.payload as UserMessagePayload;

    const supervisorBot = await this.botsService.findSupervisorByUserId(userId);
    if (!supervisorBot) {
      this.logger.warn(`No Supervisor Bot for user ${userId}`);
      return;
    }

    const llmResponse = await this.llmRouter.complete({
      taskType: 'chat',
      systemPrompt:
        '你是 Supervisor，用户的 AI 助手。请简洁、友好地回答用户的问题，回复不超过 150 字。',
      messages: [{ role: 'user', content: payload.content }],
      maxTokens: 300,
    });

    await this.messagesService.create(supervisorBot.userId, {
      converseId: payload.converseId,
      content: llmResponse.content,
      type: MessageType.TEXT,
    });

    this.logger.log(`Replied to USER_MESSAGE in converse ${payload.converseId}`);
  }

  private async handleDeviceResults(events: AgentEvent[], userId: string): Promise<void> {
    const supervisorBot = await this.botsService.findSupervisorByUserId(userId);
    if (!supervisorBot) return;

    for (const event of events) {
      const payload = event.payload as DeviceResultPayload;
      await this.memoryService.addCommandResult(supervisorBot.id, {
        commandId: payload.commandId,
        command: payload.command,
        status: payload.status,
        output: payload.output,
        error: payload.error,
        completedAt: event.timestamp,
      } as CommandResult);
    }

    const response = await this.generateResponse({ events, userId });
    await this.sendNotification(response, userId, supervisorBot);
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern=supervisor.agent.spec --no-coverage 2>&1 | tail -20
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/agents/impl/supervisor.agent.ts \
        apps/server/src/agents/impl/supervisor.agent.spec.ts
git commit -m "feat(agents): SupervisorAgent handles USER_MESSAGE with LLM chat reply"
```

---

## Task 3: `SupervisorAgent` — Handle `CROSS_BOT_NOTIFY` (Source Attribution Card)

**Files:**
- Modify: `apps/server/src/agents/impl/supervisor.agent.ts`
- Modify: `apps/server/src/agents/impl/supervisor.agent.spec.ts`

When a future Coding Bot (or any other agent) emits a `CROSS_BOT_NOTIFY` event, the Supervisor should post a `BOT_NOTIFICATION` message in the user's supervisor DM converse with `[From {botName}]: ...` attribution and push a `bot:notification` WebSocket event.

The `CrossBotNotifyPayload` interface already has `{ fromBotId, fromBotName, event, data }`.

- [ ] **Step 1: Write the failing test**

Add after the `USER_MESSAGE` describe block in `supervisor.agent.spec.ts`:

```typescript
  describe('handleEvent — CROSS_BOT_NOTIFY', () => {
    it('should create BOT_NOTIFICATION message with [From X] attribution', async () => {
      mockMemoryService.getWorkingMemory.mockResolvedValue({
        pendingActions: [],
        recentResults: [],
      });

      const events: AgentEvent[] = [
        {
          type: 'CROSS_BOT_NOTIFY',
          payload: {
            fromBotId: 'coding-bot-id',
            fromBotName: 'Coding Bot',
            event: 'task_complete',
            data: { content: '已完成代码审查' },
          },
          timestamp: new Date(),
          source: { userId: 'u1' },
        },
      ];

      await agent.handleEvent(events);

      expect(mockMessagesService.create).toHaveBeenCalledWith(
        'user-supervisor-1',
        expect.objectContaining({
          content: '[From Coding Bot]: 已完成代码审查',
          type: 'BOT_NOTIFICATION',
          metadata: expect.objectContaining({
            cardType: 'cross_bot_notify',
            sourceBotName: 'Coding Bot',
          }),
        }),
      );

      expect(mockBroadcastService.toRoom).toHaveBeenCalledWith(
        'u-u1',
        'bot:notification',
        expect.objectContaining({
          fromBotName: 'Coding Bot',
          content: '[From Coding Bot]: 已完成代码审查',
        }),
      );
    });

    it('should fall back to event name when data.content is absent', async () => {
      const events: AgentEvent[] = [
        {
          type: 'CROSS_BOT_NOTIFY',
          payload: {
            fromBotId: 'coding-bot-id',
            fromBotName: 'Coding Bot',
            event: 'file_created',
            data: {},
          },
          timestamp: new Date(),
          source: { userId: 'u1' },
        },
      ];

      await agent.handleEvent(events);

      expect(mockMessagesService.create).toHaveBeenCalledWith(
        'user-supervisor-1',
        expect.objectContaining({
          content: '[From Coding Bot]: file_created',
        }),
      );
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern=supervisor.agent.spec --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `create` not called for CROSS_BOT_NOTIFY (no handler yet)

- [ ] **Step 3: Add `handleCrossBotNotify` private method to `supervisor.agent.ts`**

Add after `handleDeviceResults`:

```typescript
  private async handleCrossBotNotify(event: AgentEvent, userId: string): Promise<void> {
    const payload = event.payload as CrossBotNotifyPayload;

    const supervisorBot = await this.botsService.findSupervisorByUserId(userId);
    if (!supervisorBot) {
      this.logger.warn(`No Supervisor Bot for user ${userId}`);
      return;
    }

    const converse = await this.botsService.getOrCreateSupervisorConverse(userId);
    const contentSuffix = payload.data?.content
      ? String(payload.data.content)
      : payload.event;
    const content = `[From ${payload.fromBotName}]: ${contentSuffix}`;

    const metadata: Record<string, unknown> = {
      cardType: 'cross_bot_notify',
      title: content,
      sourceBotName: payload.fromBotName,
      sourceEvent: payload.event,
    };

    const message = await this.messagesService.create(supervisorBot.userId, {
      converseId: converse.id,
      content,
      type: MessageType.BOT_NOTIFICATION,
      metadata,
    });

    this.broadcastService.toRoom(`u-${userId}`, 'bot:notification', {
      messageId: message.id,
      converseId: converse.id,
      fromBotId: supervisorBot.id,
      fromBotName: payload.fromBotName,
      content,
      createdAt: message.createdAt.toISOString(),
    });

    this.logger.log(
      `CROSS_BOT_NOTIFY from ${payload.fromBotName} forwarded to user ${userId}`,
    );
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern=supervisor.agent.spec --no-coverage 2>&1 | tail -20
```

Expected: PASS — all supervisor tests green

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/agents/impl/supervisor.agent.ts \
        apps/server/src/agents/impl/supervisor.agent.spec.ts
git commit -m "feat(agents): SupervisorAgent handles CROSS_BOT_NOTIFY with source attribution"
```

---

## Task 4: `MentionService` — @ai in GROUP Routes to Supervisor

**Files:**
- Modify: `apps/server/src/mentions/mentions.service.ts`
- Modify: `apps/server/src/mentions/__tests__/mentions.service.spec.ts`

Currently `routeToSupervisor` always calls `WhisperService.handleWhisperTrigger` regardless of converse type. In GROUP chat, @ai should dispatch a `USER_MESSAGE` event to `SupervisorAgent` so it generates a reply posted back to the group. In DIRECT/BOT converses, Whisper (smart reply suggestions) is the right behaviour.

The `route` method already receives the full `message` object which has `content`. We pass `content` down to `routeToSupervisor` as a new parameter.

- [ ] **Step 1: Write the failing test**

Add the following block inside `describe('MentionService', ...)` in `apps/server/src/mentions/__tests__/mentions.service.spec.ts`, after the last existing `describe` block:

```typescript
  describe('routeToSupervisor', () => {
    const mockEmit = jest.fn();

    beforeEach(() => {
      mockEmit.mockClear();
    });

    it('should emit agent.dispatch to supervisor-bot for GROUP converse', async () => {
      // Rebuild with prisma that returns GROUP type
      const mockPrismaLocal = {
        bot: { findMany: jest.fn().mockResolvedValue([]) },
        converseMember: { findMany: jest.fn().mockResolvedValue([]) },
        converse: {
          findUnique: jest.fn().mockResolvedValue({ type: 'GROUP' }),
        },
      };
      const { MentionService: MS } = await import('../mentions.service');
      const { EventEmitter2 } = await import('@nestjs/event-emitter');
      const { PrismaService } = await import('../../prisma/prisma.service');
      const { WhisperService } = await import('../../ai/services/whisper.service');
      const module = await Test.createTestingModule({
        providers: [
          MS,
          { provide: PrismaService, useValue: mockPrismaLocal },
          { provide: WhisperService, useValue: { handleWhisperTrigger: jest.fn() } },
          { provide: EventEmitter2, useValue: { emit: mockEmit } },
        ],
      }).compile();
      const svc = module.get<MentionService>(MS);

      const mentions = [{ type: 'ai' as const, name: 'ai', fullMatch: '@ai' }];
      await svc.route(
        mentions,
        { id: 'msg-1', content: 'Hey @ai help me', converseId: 'group-1' },
        'sender-1',
        'group-1',
      );

      expect(mockEmit).toHaveBeenCalledWith('agent.dispatch', {
        botId: 'supervisor-bot',
        events: [
          expect.objectContaining({
            type: 'USER_MESSAGE',
            payload: expect.objectContaining({
              userId: 'sender-1',
              content: 'Hey @ai help me',
              converseId: 'group-1',
            }),
          }),
        ],
      });
    });

    it('should call WhisperService for non-GROUP converse', async () => {
      const mockWhisperLocal = { handleWhisperTrigger: jest.fn().mockResolvedValue(undefined) };
      const mockPrismaLocal = {
        bot: { findMany: jest.fn().mockResolvedValue([]) },
        converseMember: { findMany: jest.fn().mockResolvedValue([]) },
        converse: {
          findUnique: jest.fn().mockResolvedValue({ type: 'BOT' }),
        },
      };
      const { MentionService: MS } = await import('../mentions.service');
      const { EventEmitter2 } = await import('@nestjs/event-emitter');
      const { PrismaService } = await import('../../prisma/prisma.service');
      const { WhisperService } = await import('../../ai/services/whisper.service');
      const module = await Test.createTestingModule({
        providers: [
          MS,
          { provide: PrismaService, useValue: mockPrismaLocal },
          { provide: WhisperService, useValue: mockWhisperLocal },
          { provide: EventEmitter2, useValue: { emit: mockEmit } },
        ],
      }).compile();
      const svc = module.get<MentionService>(MS);

      const mentions = [{ type: 'ai' as const, name: 'ai', fullMatch: '@ai' }];
      await svc.route(
        mentions,
        { id: 'msg-2', content: 'Hey @ai', converseId: 'dm-1' },
        'sender-1',
        'dm-1',
      );

      expect(mockWhisperLocal.handleWhisperTrigger).toHaveBeenCalledWith(
        'sender-1',
        'dm-1',
        'msg-2',
      );
      expect(mockEmit).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern=mentions.service.spec --no-coverage 2>&1 | tail -20
```

Expected: FAIL — GROUP converse still calls WhisperService, `emit` is not called

- [ ] **Step 3: Update `routeToSupervisor` signature and logic**

In `apps/server/src/mentions/mentions.service.ts`, update the `routeToSupervisor` private method signature and body. Replace the existing method:

```typescript
  /**
   * 路由到 Supervisor
   *
   * - GROUP 群聊：派发 USER_MESSAGE 到 SupervisorAgent，由 Agent 生成回复发回群里
   * - DIRECT / BOT：调用 WhisperService 生成智能回复建议
   */
  private async routeToSupervisor(
    senderId: string,
    converseId: string,
    messageId: string,
    content: string,
  ): Promise<void> {
    const converse = await this.prisma.converse.findUnique({
      where: { id: converseId },
      select: { type: true },
    });

    if (converse?.type === 'GROUP') {
      const event = {
        type: 'USER_MESSAGE' as const,
        payload: { userId: senderId, content, converseId },
        timestamp: new Date(),
        source: { userId: senderId },
      };
      // 'supervisor-bot' is the well-known sentinel botId for SupervisorAgent
      this.eventEmitter.emit('agent.dispatch', {
        botId: 'supervisor-bot',
        events: [event],
      });
      this.logger.log(
        `Routed @ai in group ${converseId} to SupervisorAgent`,
      );
    } else {
      await this.whisperService.handleWhisperTrigger(
        senderId,
        converseId,
        messageId,
      );
      this.logger.log(
        `Routed @ai to WhisperService for message ${messageId}`,
      );
    }
  }
```

- [ ] **Step 4: Update the call site in `route` to pass `content`**

In `mentions.service.ts`, inside the `route` method, update the `case 'ai'` branch:

```typescript
          case 'ai':
            await this.routeToSupervisor(
              senderId,
              converseId,
              message.id,
              message.content ?? '',
            );
            break;
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern=mentions.service.spec --no-coverage 2>&1 | tail -20
```

Expected: PASS

- [ ] **Step 6: Run full server test suite**

```bash
pnpm --filter @linkingchat/server test -- --no-coverage 2>&1 | tail -10
```

Expected: All suites pass (406+ tests)

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/mentions/mentions.service.ts \
        apps/server/src/mentions/__tests__/mentions.service.spec.ts
git commit -m "feat(mentions): route @ai in GROUP chat to SupervisorAgent instead of Whisper"
```

---

## Task 5: End-to-End Smoke Test

- [ ] **Step 1: Start the full stack**

```bash
# Terminal 1
cd /Users/ZenoWang/Documents/project/linkingChat
pnpm docker:up

# Terminal 2
pnpm dev:server
# Wait for: [Nest] Application is running on: http://localhost:3008/api/v1
```

- [ ] **Step 2: Verify Bot DM reply (Task 1 + 2)**

Using any HTTP client (or the Desktop app), send a message to a BOT converse (Supervisor DM):

```bash
# Replace TOKEN and CONVERSE_ID with real values from a logged-in session
curl -X POST http://localhost:3008/api/v1/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"converseId": "$SUPERVISOR_CONVERSE_ID", "content": "你好，我需要帮助"}'
```

Expected in server logs:
```
[Bot] Message to Supervisor (bot-uuid): type=TEXT, content="你好，我需要帮助"
[Bot] Dispatched USER_MESSAGE to agent supervisor-bot
Supervisor handling 1 events
Replied to USER_MESSAGE in converse <converseId>
```

Expected result: A second message appears in the converse from the Supervisor bot user.

- [ ] **Step 3: Verify @ai in group chat (Task 4)**

Send a message containing `@ai` to a GROUP converse:

```bash
curl -X POST http://localhost:3008/api/v1/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"converseId": "$GROUP_CONVERSE_ID", "content": "@ai 请问今天天气如何"}'
```

Expected in server logs:
```
Routed @ai in group <converseId> to SupervisorAgent
Supervisor handling 1 events
Replied to USER_MESSAGE in converse <converseId>
```

Expected result: A reply from Supervisor bot appears in the group.

- [ ] **Step 4: Run full test suite one final time**

```bash
pnpm --filter @linkingchat/server test -- --no-coverage 2>&1 | grep -E "Tests:|Test Suites:"
```

Expected output similar to:
```
Test Suites: 34 passed, 34 total
Tests:       406 passed, 406 total
```

---

## Error Handling Notes

| Scenario | Behaviour |
|---|---|
| No `supervisorBot` found for userId | Log warning, return early — no crash |
| LLM provider timeout / error | `llmRouter` throws; caught in `handleEvent` try/catch; logs error; no user-visible crash |
| `CROSS_BOT_NOTIFY` with missing `data.content` | Falls back to `payload.event` string |
| @ai in GROUP, converse not found | `converse?.type` is undefined; falls through to Whisper path |
| Bot dispatch for non-registered agent botId | `AgentOrchestratorService` logs "Agent not found: {id}" and returns; no error propagated |
