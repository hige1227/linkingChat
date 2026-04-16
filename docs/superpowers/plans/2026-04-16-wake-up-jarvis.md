# Wake Up Jarvis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire WhisperService, DraftService, and PredictiveService into real user flows with quality gates, merged LLM calls, rate limiting, and telemetry from day one.

**Architecture:** Minimal-invasive wiring — insert trigger logic at existing code boundaries (`MessagesService.create()` for Whisper, `SupervisorAgent.handleUserMessage()` for Draft, `BotEventListener.handleDeviceResultComplete()` for Predictive). No new modules, no new WS events. Three platforms: Server + Desktop + Mobile.

**Tech Stack:** NestJS 11, TypeScript 5.7, Prisma 6, Redis (ioredis), Electron 35 + React 19 (Zustand + Socket.IO), Flutter/Dart

---

## File Map

| File | Change |
|------|--------|
| `apps/server/src/ai/services/whisper.service.ts` | Add `shouldTrigger()` quality gate |
| `apps/server/src/ai/services/whisper.service.spec.ts` | Add `shouldTrigger()` tests |
| `apps/server/src/messages/messages.service.ts` | Inject WhisperService + DIRECT/TEXT trigger |
| `apps/server/src/messages/messages.service.spec.ts` | Add Whisper trigger tests |
| `apps/server/src/agents/impl/supervisor.agent.ts` | Merge intent+draft into single LLM call; inject DraftService |
| `apps/server/src/agents/impl/supervisor.agent.spec.ts` | Update USER_MESSAGE tests + add draft intent test |
| `apps/server/src/agents/agents.module.ts` | Add DraftService to providers |
| `apps/server/src/agents/events/bot-event.listener.ts` | Add Predictive trigger + Redis rate limit |
| `apps/server/src/agents/events/bot-event.listener.spec.ts` | Create (new file): Predictive trigger tests |
| `apps/desktop/src/renderer/hooks/useChatSocket.ts` | Add `emitWhisperDismiss` |
| `apps/desktop/src/renderer/components/chat/WhisperBar.tsx` | Call `emitWhisperDismiss` on dismiss |
| `apps/desktop/src/renderer/components/chat/MessageInput.tsx` | Render `<WhisperBar>` for DIRECT converses |
| `apps/desktop/src/renderer/components/chat/ChatThread.tsx` | Render `<DraftCard>` list for current converse |
| `apps/mobile/lib/features/chat/widgets/whisper_suggestions.dart` | Wire socket event → display chips |
| `apps/mobile/lib/features/chat/widgets/draft_card.dart` | Wire socket event → show card + approve/reject |

---

## Task 1: Add `shouldTrigger()` Quality Gate to WhisperService

**Files:**
- Modify: `apps/server/src/ai/services/whisper.service.ts`
- Modify: `apps/server/src/ai/services/whisper.service.spec.ts`

- [ ] **Step 1.1: Write failing tests for `shouldTrigger()`**

Add to `whisper.service.spec.ts` inside the existing `describe('WhisperService')` block:

```typescript
describe('shouldTrigger', () => {
  it('returns false for null content', () => {
    expect(service.shouldTrigger(null)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(service.shouldTrigger('')).toBe(false);
  });

  it('returns false for content shorter than 3 chars', () => {
    expect(service.shouldTrigger('hi')).toBe(false);
    expect(service.shouldTrigger('ok')).toBe(false);
  });

  it('returns false for pure emoji content', () => {
    expect(service.shouldTrigger('👍')).toBe(false);
    expect(service.shouldTrigger('😂😂😂')).toBe(false);
    expect(service.shouldTrigger('  👍  ')).toBe(false);
  });

  it('returns true for normal text', () => {
    expect(service.shouldTrigger('今天开会吗')).toBe(true);
    expect(service.shouldTrigger('好的，明天见')).toBe(true);
    expect(service.shouldTrigger('Hello there')).toBe(true);
  });

  it('returns true for text with emoji mixed in', () => {
    expect(service.shouldTrigger('好的👍')).toBe(true);
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern=whisper.service.spec
```

Expected: FAIL — `service.shouldTrigger is not a function`

- [ ] **Step 1.3: Implement `shouldTrigger()` in `whisper.service.ts`**

Add this method after the `acceptSuggestion()` method (before `extractContext()`):

```typescript
/**
 * Quality gate — determines whether a received message should trigger Whisper.
 * Skips: null/empty content, too-short messages, pure emoji.
 */
shouldTrigger(content: string | null): boolean {
  if (!content) return false;
  const stripped = content.trim();
  if (stripped.length < 3) return false;
  // Pure emoji (no alphabetic or CJK characters)
  if (/^[\p{Emoji}\s]+$/u.test(stripped)) return false;
  return true;
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern=whisper.service.spec
```

Expected: All tests PASS

- [ ] **Step 1.5: Commit**

```bash
git add apps/server/src/ai/services/whisper.service.ts \
        apps/server/src/ai/services/whisper.service.spec.ts
git commit -m "feat(whisper): add shouldTrigger() quality gate"
```

---

## Task 2: Wire Whisper Auto-Trigger into MessagesService

**Files:**
- Modify: `apps/server/src/messages/messages.service.ts`
- Modify: `apps/server/src/messages/messages.service.spec.ts`

- [ ] **Step 2.1: Write failing tests for Whisper trigger**

In `messages.service.spec.ts`, add a `mockWhisperService` mock and add it to the `TestingModule`. Then add tests inside `describe('create')`:

First, add the mock near the top of the describe block (after `mockI18nService`):

```typescript
const mockWhisperService = {
  shouldTrigger: jest.fn().mockReturnValue(true),
  handleWhisperRequest: jest.fn().mockResolvedValue(undefined),
};
```

Add `{ provide: WhisperService, useValue: mockWhisperService }` to the `providers` array in `beforeEach`.

Add the import at the top of the test file:

```typescript
import { WhisperService } from '../ai/services/whisper.service';
```

Then add these tests inside `describe('create')`:

```typescript
describe('Whisper auto-trigger', () => {
  const directDto = { converseId: 'conv1', content: 'Hello there!' };

  beforeEach(() => {
    mockConverses.verifyMembership.mockResolvedValue({});
    mockPrisma.message.create.mockResolvedValue({
      id: 'msg1',
      content: 'Hello there!',
      type: 'TEXT',
      authorId: 'user1',
      converseId: 'conv1',
      replyToId: null,
      metadata: null,
      attachments: [],
      author: { id: 'user1', displayName: 'Alice', avatarUrl: null },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockPrisma.$transaction.mockResolvedValue([null, null]);
    mockPrisma.converse.findUnique.mockResolvedValue({ type: 'DIRECT' });
    mockConverses.getMemberIds.mockResolvedValue(['user1', 'user2']);
  });

  it('triggers Whisper for DIRECT TEXT message (receiver side)', async () => {
    await service.create('user1', directDto);

    expect(mockWhisperService.shouldTrigger).toHaveBeenCalledWith('Hello there!');
    expect(mockWhisperService.handleWhisperRequest).toHaveBeenCalledWith(
      'user2', // receiver, not sender
      'conv1',
    );
  });

  it('does NOT trigger Whisper for GROUP converse', async () => {
    mockPrisma.converse.findUnique.mockResolvedValue({ type: 'GROUP' });

    await service.create('user1', directDto);

    expect(mockWhisperService.handleWhisperRequest).not.toHaveBeenCalled();
  });

  it('does NOT trigger Whisper when shouldTrigger returns false', async () => {
    mockWhisperService.shouldTrigger.mockReturnValueOnce(false);

    await service.create('user1', directDto);

    expect(mockWhisperService.handleWhisperRequest).not.toHaveBeenCalled();
  });

  it('does NOT trigger Whisper for non-TEXT message type', async () => {
    mockPrisma.message.create.mockResolvedValueOnce({
      id: 'msg1',
      content: '',
      type: 'VOICE',
      authorId: 'user1',
      converseId: 'conv1',
      replyToId: null,
      metadata: null,
      attachments: [],
      author: { id: 'user1', displayName: 'Alice', avatarUrl: null },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.create('user1', { converseId: 'conv1', content: '' });

    expect(mockWhisperService.handleWhisperRequest).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern=messages.service.spec
```

Expected: FAIL — `Cannot read properties of undefined (reading 'shouldTrigger')`

- [ ] **Step 2.3: Implement Whisper wiring in `messages.service.ts`**

**Add import** near the top:

```typescript
import { WhisperService } from '../ai/services/whisper.service';
```

**Add to constructor** (after `private readonly i18n: I18nService`):

```typescript
private readonly whisperService: WhisperService,
```

**Add Whisper trigger block** just before `return message;` at the end of `create()`:

```typescript
// Whisper auto-trigger: DIRECT TEXT messages only, fire-and-forget
if (message.type === 'TEXT') {
  const converse = await this.prisma.converse.findUnique({
    where: { id: dto.converseId },
    select: { type: true },
  });
  if (converse?.type === 'DIRECT') {
    const receiverId = memberIds.find((id) => id !== userId);
    if (receiverId && this.whisperService.shouldTrigger(message.content)) {
      this.whisperService
        .handleWhisperRequest(receiverId, dto.converseId)
        .catch((err) =>
          this.logger.error(`Whisper trigger failed: ${err.message}`),
        );
    }
  }
}
```

Note: `memberIds` is already available from the `getMemberIds()` call earlier in `create()`.

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern=messages.service.spec
```

Expected: All tests PASS

- [ ] **Step 2.5: Run full server test suite to check no regressions**

```bash
pnpm --filter @linkingchat/server test
```

Expected: All tests PASS

- [ ] **Step 2.6: Commit**

```bash
git add apps/server/src/messages/messages.service.ts \
        apps/server/src/messages/messages.service.spec.ts
git commit -m "feat(messages): auto-trigger Whisper on DIRECT TEXT messages"
```

---

## Task 3: Merge Draft Intent into SupervisorAgent (Single LLM Call)

**Files:**
- Modify: `apps/server/src/agents/impl/supervisor.agent.ts`
- Modify: `apps/server/src/agents/impl/supervisor.agent.spec.ts`
- Modify: `apps/server/src/agents/agents.module.ts`

- [ ] **Step 3.1: Write failing tests for merged intent routing**

In `supervisor.agent.spec.ts`, add `DraftService` mock. Add import:

```typescript
import { DraftService } from '../../ai/services/draft.service';
import { DraftType } from '@prisma/client';
```

Add mock in `beforeEach` (after `mockPrisma`):

```typescript
mockDraftService = {
  createDraft: jest.fn().mockResolvedValue('draft-id-1'),
};
```

Declare at top of `describe`:

```typescript
let mockDraftService: any;
```

Add `{ provide: DraftService, useValue: mockDraftService }` to the `providers` array.

Then add test cases:

```typescript
describe('handleUserMessage — intent routing', () => {
  const userMessageEvent = (content: string) => ({
    type: 'USER_MESSAGE' as const,
    payload: {
      converseId: 'converse-1',
      content,
      userId: 'user-1',
    },
    timestamp: new Date(),
    source: { userId: 'user-1' },
  });

  it('routes chat intent to bot message reply', async () => {
    mockLlmRouter.complete.mockResolvedValueOnce({
      content: JSON.stringify({ intent: 'chat', response: '明天见！' }),
      model: 'deepseek-chat',
    });
    mockPrisma.message.findMany.mockResolvedValue([]);

    await agent.handleEvent([userMessageEvent('你好')]);

    expect(mockMessagesService.create).toHaveBeenCalledWith(
      'user-supervisor-1',
      expect.objectContaining({ content: '明天见！' }),
      expect.anything(),
    );
    expect(mockDraftService.createDraft).not.toHaveBeenCalled();
  });

  it('routes draft intent to DraftService', async () => {
    mockLlmRouter.complete.mockResolvedValueOnce({
      content: JSON.stringify({
        intent: 'draft',
        draftContent: '张总您好，周五开会没问题，期待与您的交流。',
      }),
      model: 'deepseek-chat',
    });
    mockPrisma.message.findMany.mockResolvedValue([]);

    await agent.handleEvent([userMessageEvent('帮我回复张总说周五开会没问题')]);

    expect(mockDraftService.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        draftType: DraftType.MESSAGE,
        userId: 'user-1',
      }),
    );
    expect(mockMessagesService.create).not.toHaveBeenCalledWith(
      'user-supervisor-1',
      expect.objectContaining({ content: expect.any(String) }),
      expect.anything(),
    );
  });

  it('falls back to chat reply when LLM returns malformed JSON', async () => {
    mockLlmRouter.complete.mockResolvedValueOnce({
      content: '这是一个回复',
      model: 'deepseek-chat',
    });
    mockPrisma.message.findMany.mockResolvedValue([]);

    await agent.handleEvent([userMessageEvent('你好')]);

    // Fallback: send the raw content as chat reply
    expect(mockMessagesService.create).toHaveBeenCalled();
    expect(mockDraftService.createDraft).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3.2: Run tests to verify they fail**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern=supervisor.agent.spec
```

Expected: FAIL — `mockDraftService.createDraft` never called

- [ ] **Step 3.3: Implement merged intent routing in `supervisor.agent.ts`**

**Add import** at the top:

```typescript
import { DraftService } from '../../ai/services/draft.service';
import { DraftType } from '@prisma/client';
```

**Add to constructor** (after `private readonly prisma: PrismaService`):

```typescript
private readonly draftService: DraftService,
```

**Replace `handleUserMessage()` method** entirely:

```typescript
private async handleUserMessage(event: AgentEvent, userId: string): Promise<void> {
  const payload = event.payload as UserMessagePayload;

  const supervisorBot = await this.botsService.findSupervisorByUserId(userId);
  if (!supervisorBot) {
    this.logger.warn(`No Supervisor Bot for user ${userId}`);
    return;
  }

  // Build conversation context (last 20 messages, exclude @ai trigger)
  const recentMessages = await this.prisma.message.findMany({
    where: { converseId: payload.converseId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 21,
    include: { author: { select: { id: true, displayName: true } } },
  });

  const contextMessages = recentMessages
    .reverse()
    .filter((m: (typeof recentMessages)[number]) =>
      m.content && !m.content.match(/(?<!\w)@ai\b/i),
    )
    .slice(-20)
    .map((m: (typeof recentMessages)[number]) => {
      const name = m.author?.displayName ?? 'Unknown';
      return `${name}: ${m.content}`;
    });

  const conversationContext =
    contextMessages.length > 0
      ? `最近的对话记录：\n${contextMessages.join('\n')}\n\n`
      : '';

  // Single LLM call: classify intent + generate response/draft
  const llmResponse = await this.llmRouter.complete({
    taskType: 'chat',
    systemPrompt: SUPERVISOR_INTENT_PROMPT,
    messages: [
      {
        role: 'user',
        content: `${conversationContext}用户的请求：${payload.content.replace(/(?<!\w)@ai\b/i, '').trim()}`,
      },
    ],
    maxTokens: 512,
  });

  // Parse intent from LLM response
  const parsed = this.parseIntentResponse(llmResponse.content);

  if (parsed.intent === 'draft' && parsed.draftContent) {
    // Draft & Verify flow
    await this.draftService.createDraft({
      userId,
      converseId: payload.converseId,
      botId: supervisorBot.id,
      botName: supervisorBot.name,
      draftType: DraftType.MESSAGE,
      userIntent: parsed.draftContent,
    });
    this.logger.log(`Draft created for user ${userId} in converse ${payload.converseId}`);
  } else {
    // Chat reply flow (default)
    const replyContent = parsed.response ?? llmResponse.content;
    await this.messagesService.create(
      supervisorBot.userId,
      {
        converseId: payload.converseId,
        content: replyContent,
        type: MessageType.TEXT,
      },
      { skipMembershipCheck: true },
    );
    this.logger.log(`Chat reply sent to converse ${payload.converseId}`);
  }
}

/**
 * Parse the merged intent+response JSON from LLM.
 * Falls back gracefully to chat intent on malformed output.
 */
private parseIntentResponse(content: string): {
  intent: 'chat' | 'draft';
  response?: string;
  draftContent?: string;
} {
  try {
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    }
    const parsed = JSON.parse(cleaned);
    if (parsed.intent === 'draft') {
      return { intent: 'draft', draftContent: String(parsed.draftContent ?? '') };
    }
    return { intent: 'chat', response: String(parsed.response ?? content) };
  } catch {
    // Malformed JSON → treat entire content as chat reply
    return { intent: 'chat', response: content };
  }
}
```

**Add the system prompt constant** at the bottom of the file (after the class):

```typescript
const SUPERVISOR_INTENT_PROMPT = `你是 Jarvis，用户的智能私人助手。分析用户输入，返回以下 JSON：

{
  "intent": "chat" | "draft",
  "response": "直接回复的内容（intent=chat 时必填）",
  "draftContent": "代为起草的消息内容（intent=draft 时必填）"
}

draft 意图判断标准（满足以下任一）：
- 用户明确要求帮写/帮回复某人某事
- 含关键词：帮我回复、帮我写、替我说、帮我发、draft、write for me、代我回复

其他情况统一使用 chat。

chat 回复要求：简洁友好，不超过 150 字。
draft 内容要求：语言自然流畅，直接可发送，符合商务/社交场景。

直接输出 JSON，不要包裹在 markdown 代码块中。`;
```

- [ ] **Step 3.4: Run tests to verify they pass**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern=supervisor.agent.spec
```

Expected: All tests PASS

- [ ] **Step 3.5: Add DraftService to `agents.module.ts` providers**

In `agents.module.ts`, add `DraftService` import and add to providers array:

```typescript
// Add import at the top
import { DraftService } from '../ai/services/draft.service';

// In @Module providers array, add after SupervisorAgent:
DraftService,
```

Note: `AiModule` is already imported in `AgentsModule`, and `DraftService` is exported from `AiModule`. You need to verify this — check `apps/server/src/ai/ai.module.ts` exports. If `DraftService` is not exported, add it to the `exports` array in `ai.module.ts`.

- [ ] **Step 3.6: Verify AiModule exports DraftService**

```bash
grep -n "DraftService" apps/server/src/ai/ai.module.ts
```

If `DraftService` is not in `exports`, add it. The module should look like:

```typescript
exports: [LlmRouterService, WhisperService, DraftService, PredictiveService],
```

- [ ] **Step 3.7: Run full server tests**

```bash
pnpm --filter @linkingchat/server test
```

Expected: All tests PASS

- [ ] **Step 3.8: Commit**

```bash
git add apps/server/src/agents/impl/supervisor.agent.ts \
        apps/server/src/agents/impl/supervisor.agent.spec.ts \
        apps/server/src/agents/agents.module.ts \
        apps/server/src/ai/ai.module.ts
git commit -m "feat(supervisor): merge intent classification + draft routing (single LLM call)"
```

---

## Task 4: Wire Predictive Actions into BotEventListener

**Files:**
- Modify: `apps/server/src/agents/events/bot-event.listener.ts`
- Create: `apps/server/src/agents/events/bot-event.listener.spec.ts`

- [ ] **Step 4.1: Create test file `bot-event.listener.spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { BotEventListener } from './bot-event.listener';
import { BatchTriggerService } from './batch-trigger.service';
import { BotsService } from '../../bots/bots.service';
import { AgentOrchestratorService } from '../orchestrator/agent-orchestrator.service';
import { PredictiveService } from '../../ai/services/predictive.service';
import type { DeviceResultEvent } from './bot-event.listener';

describe('BotEventListener — Predictive trigger', () => {
  let listener: BotEventListener;
  let mockPredictive: any;
  let mockBotsService: any;
  let mockRedis: any;

  beforeEach(async () => {
    mockPredictive = {
      detectTrigger: jest.fn(),
      analyzeTrigger: jest.fn().mockResolvedValue(undefined),
    };
    mockBotsService = {
      findSupervisorByUserId: jest.fn().mockResolvedValue({
        id: 'bot-1',
        userId: 'bot-user-1',
        name: 'Supervisor',
      }),
      getOrCreateSupervisorConverse: jest.fn().mockResolvedValue({
        id: 'converse-supervisor-1',
      }),
    };
    mockRedis = {
      exists: jest.fn().mockResolvedValue(0),
      setex: jest.fn().mockResolvedValue('OK'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotEventListener,
        { provide: BatchTriggerService, useValue: { addEvent: jest.fn() } },
        { provide: BotsService, useValue: mockBotsService },
        { provide: AgentOrchestratorService, useValue: { dispatchEvent: jest.fn() } },
        { provide: PredictiveService, useValue: mockPredictive },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();

    listener = module.get<BotEventListener>(BotEventListener);
  });

  describe('handleDeviceResultComplete — Predictive', () => {
    const errorPayload: DeviceResultEvent = {
      userId: 'user-1',
      commandId: 'cmd-1',
      command: 'npm install',
      status: 'error',
      output: 'npm ERR! code ENOENT\nnpm ERR! syscall open',
      deviceId: 'device-1',
    };

    it('triggers Predictive on error with matching category', async () => {
      mockPredictive.detectTrigger.mockReturnValue('package_error');

      await listener.handleDeviceResultComplete(errorPayload);

      expect(mockPredictive.detectTrigger).toHaveBeenCalledWith(
        expect.stringContaining('npm ERR!'),
      );
      expect(mockPredictive.analyzeTrigger).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          converseId: 'converse-supervisor-1',
          triggerCategory: 'package_error',
        }),
      );
    });

    it('does NOT trigger Predictive when rate limit key exists', async () => {
      mockRedis.exists.mockResolvedValueOnce(1); // rate limit active
      mockPredictive.detectTrigger.mockReturnValue('package_error');

      await listener.handleDeviceResultComplete(errorPayload);

      expect(mockPredictive.analyzeTrigger).not.toHaveBeenCalled();
    });

    it('does NOT trigger Predictive when detectTrigger returns null', async () => {
      mockPredictive.detectTrigger.mockReturnValue(null);

      await listener.handleDeviceResultComplete(errorPayload);

      expect(mockPredictive.analyzeTrigger).not.toHaveBeenCalled();
    });

    it('does NOT trigger Predictive on success status', async () => {
      await listener.handleDeviceResultComplete({
        ...errorPayload,
        status: 'success',
        output: 'Done.',
        error: undefined,
      });

      expect(mockPredictive.detectTrigger).not.toHaveBeenCalled();
      expect(mockPredictive.analyzeTrigger).not.toHaveBeenCalled();
    });

    it('sets Redis rate limit key with 60s TTL after triggering', async () => {
      mockPredictive.detectTrigger.mockReturnValue('build_error');

      await listener.handleDeviceResultComplete(errorPayload);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'predictive:user-1:device-1',
        60,
        '1',
      );
    });
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern=bot-event.listener.spec
```

Expected: FAIL — compile error (PredictiveService not injected yet)

- [ ] **Step 4.3: Implement Predictive wiring in `bot-event.listener.ts`**

**Add imports** at the top:

```typescript
import { Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { PredictiveService } from '../../ai/services/predictive.service';
```

**Add to constructor** (after `private readonly orchestrator: AgentOrchestratorService`):

```typescript
private readonly predictiveService: PredictiveService,
@Inject('REDIS_CLIENT') private readonly redis: Redis,
```

**Add Predictive trigger block** at the end of `handleDeviceResultComplete()`, after the existing `batchTrigger.addEvent()` call:

```typescript
// Predictive Actions: analyze error output, push to Supervisor converse
if (payload.status === 'error') {
  const rateLimitKey = `predictive:${payload.userId}:${payload.deviceId}`;
  const isRateLimited = await this.redis.exists(rateLimitKey);

  if (!isRateLimited) {
    await this.redis.setex(rateLimitKey, 60, '1');

    const errorOutput = payload.error ?? payload.output ?? '';
    const category = this.predictiveService.detectTrigger(errorOutput);

    if (category) {
      const supervisorConverse =
        await this.botsService.getOrCreateSupervisorConverse(payload.userId);

      this.predictiveService
        .analyzeTrigger({
          userId: payload.userId,
          converseId: supervisorConverse.id,
          triggerOutput: errorOutput,
          triggerCategory: category,
        })
        .catch((err) =>
          this.logger.error(`Predictive analysis failed: ${err.message}`),
        );
    }
  }
}
```

- [ ] **Step 4.4: Run tests to verify they pass**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern=bot-event.listener.spec
```

Expected: All tests PASS

- [ ] **Step 4.5: Run full server tests**

```bash
pnpm --filter @linkingchat/server test
```

Expected: All tests PASS

- [ ] **Step 4.6: Commit**

```bash
git add apps/server/src/agents/events/bot-event.listener.ts \
        apps/server/src/agents/events/bot-event.listener.spec.ts
git commit -m "feat(predictive): wire Predictive trigger in BotEventListener with Redis rate limit"
```

---

## Task 5: Desktop — Add `emitWhisperDismiss` + Render WhisperBar

**Files:**
- Modify: `apps/desktop/src/renderer/hooks/useChatSocket.ts`
- Modify: `apps/desktop/src/renderer/components/chat/WhisperBar.tsx`
- Modify: `apps/desktop/src/renderer/components/chat/MessageInput.tsx`

- [ ] **Step 5.1: Add `emitWhisperDismiss` to `useChatSocket.ts`**

In the `return { ... }` block of `useChatSocket()`, after `emitWhisperAccept`:

```typescript
emitWhisperDismiss: (suggestionId: string) => {
  sharedSocket?.emit('ai:whisper:dismiss', { suggestionId });
},
```

- [ ] **Step 5.2: Update `WhisperBar.tsx` to emit dismiss via WS**

Replace the full file content:

```typescript
import { useAiStore } from '../../stores/aiStore';
import { useChatSocket } from '../../hooks/useChatSocket';

interface WhisperBarProps {
  converseId: string;
  onAccept: (text: string) => void;
}

export function WhisperBar({ converseId, onAccept }: WhisperBarProps) {
  const suggestion = useAiStore((s) => s.whisper[converseId]);
  const { dismissWhisper, toggleWhisperAlternatives } = useAiStore();
  const { emitWhisperAccept, emitWhisperDismiss } = useChatSocket();

  if (!suggestion) return null;

  const handleAccept = (index: number, text: string) => {
    emitWhisperAccept(suggestion.suggestionId, index);
    dismissWhisper(converseId);
    onAccept(text);
  };

  const handleDismiss = () => {
    emitWhisperDismiss(suggestion.suggestionId);
    dismissWhisper(converseId);
  };

  return (
    <div className="whisper-bar">
      <span className="whisper-label">✨ Jarvis</span>
      <div className="whisper-chips">
        <button
          className="whisper-chip whisper-chip-primary"
          onClick={() => handleAccept(0, suggestion.primary)}
          title="Click to pre-fill input"
        >
          {suggestion.primary}
        </button>

        {suggestion.alternatives.length > 0 && (
          <button
            className="whisper-expand-btn"
            onClick={() => toggleWhisperAlternatives(converseId)}
            title={suggestion.showAlternatives ? 'Collapse' : 'Show alternatives'}
          >
            ···
          </button>
        )}

        <button
          className="whisper-dismiss-btn"
          onClick={handleDismiss}
          title="Dismiss"
        >
          ×
        </button>
      </div>

      {suggestion.showAlternatives && suggestion.alternatives.length > 0 && (
        <div className="whisper-alternatives">
          {suggestion.alternatives.map((alt, i) => (
            <button
              key={i}
              className="whisper-chip whisper-chip-alt"
              onClick={() => handleAccept(i + 1, alt)}
            >
              {alt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5.3: Render `<WhisperBar>` inside `MessageInput.tsx`**

In `MessageInput.tsx`:

Add import near the top:

```typescript
import { WhisperBar } from './WhisperBar';
```

Find the `return (` block in `MessageInput`. The component renders a `<div>` containing the textarea and buttons. Add `<WhisperBar>` **above** the main input container, rendering only for non-group non-bot converses:

Locate where the component's JSX starts (look for the outermost `<div className="message-input...`). Add this **just before** it:

```typescript
{!isGroup && !isBotConverse && (
  <WhisperBar
    converseId={converseId}
    onAccept={(text) => {
      setText(text);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }}
  />
)}
```

- [ ] **Step 5.4: Type-check Desktop**

```bash
pnpm --filter @linkingchat/desktop type-check
```

Expected: No type errors

- [ ] **Step 5.5: Commit**

```bash
git add apps/desktop/src/renderer/hooks/useChatSocket.ts \
        apps/desktop/src/renderer/components/chat/WhisperBar.tsx \
        apps/desktop/src/renderer/components/chat/MessageInput.tsx
git commit -m "feat(desktop): render WhisperBar in MessageInput + wire dismiss telemetry"
```

---

## Task 6: Desktop — Render DraftCard in ChatThread

**Files:**
- Modify: `apps/desktop/src/renderer/components/chat/ChatThread.tsx`

- [ ] **Step 6.1: Read how drafts are stored in aiStore**

Drafts are in `aiStore.drafts[converseId]: DraftItem[]`. `DraftCard` component is at `components/chat/DraftCard.tsx` — already fully implemented with approve/reject/edit logic.

- [ ] **Step 6.2: Add DraftCard rendering to `ChatThread.tsx`**

In `ChatThread.tsx`, add import:

```typescript
import { DraftCard } from './DraftCard';
import { useAiStore } from '../../stores/aiStore';
```

Inside the component function, add:

```typescript
const drafts = useAiStore((s) => s.drafts[converseId] ?? []);
const pendingDrafts = drafts.filter((d) => d.status === 'pending' || d.status === 'approved' || d.status === 'rejected');
```

In the JSX, render draft cards **between the message list and the bottom of the thread** (just before the closing tag of the scroll container). Find where the message list ends and add:

```tsx
{/* Draft cards — shown above input area */}
{pendingDrafts.map((draft) => (
  <DraftCard key={draft.draftId} draft={draft} converseId={converseId} />
))}
```

- [ ] **Step 6.3: Type-check Desktop**

```bash
pnpm --filter @linkingchat/desktop type-check
```

Expected: No type errors

- [ ] **Step 6.4: Commit**

```bash
git add apps/desktop/src/renderer/components/chat/ChatThread.tsx
git commit -m "feat(desktop): render DraftCard list in ChatThread"
```

---

## Task 7: Desktop — Verify Predictive Card Rendering in Supervisor Converse

**Files:**
- Modify: `apps/desktop/src/renderer/hooks/useChatSocket.ts` (if needed)

- [ ] **Step 7.1: Verify `ai:predictive:action` handler is complete**

In `useChatSocket.ts`, find the existing `ai:predictive:action` handler (already exists). Verify it calls `useAiStore.getState().addPrediction(data.converseId, ...)`. It should look like:

```typescript
socket.on('ai:predictive:action', (data: {
  suggestionId: string;
  converseId: string;
  trigger: string;
  actions: Array<{
    type: string;
    action: string;
    description: string;
    dangerLevel: 'safe' | 'warning' | 'dangerous';
  }>;
  createdAt: string;
}) => {
  useAiStore.getState().addPrediction(data.converseId, {
    suggestionId: data.suggestionId,
    trigger: data.trigger,
    actions: data.actions as any,
    dismissed: false,
  });
});
```

If this block is already correct, no change needed.

- [ ] **Step 7.2: Verify `PredictiveActionCard` is rendered in ChatThread or Supervisor converse view**

Check `apps/desktop/src/renderer/components/chat/PredictiveActionCard.tsx` — file exists. Verify it is rendered somewhere in `ChatThread.tsx` or the Supervisor bot conversation view.

If `PredictiveActionCard` is NOT rendered anywhere, add to `ChatThread.tsx`:

```typescript
import { PredictiveActionCard } from './PredictiveActionCard';
import { useAiStore } from '../../stores/aiStore'; // (already imported after Task 6)

// Inside component:
const predictions = useAiStore((s) =>
  (s.predictions[converseId] ?? []).filter((p) => !p.dismissed),
);

// In JSX (after draft cards):
{predictions.map((pred) => (
  <PredictiveActionCard key={pred.suggestionId} suggestion={pred} converseId={converseId} />
))}
```

- [ ] **Step 7.3: Type-check and commit if changed**

```bash
pnpm --filter @linkingchat/desktop type-check
```

```bash
git add apps/desktop/src/renderer/components/chat/ChatThread.tsx \
        apps/desktop/src/renderer/hooks/useChatSocket.ts
git commit -m "feat(desktop): verify and wire PredictiveActionCard in ChatThread"
```

---

## Task 8: Mobile — Wire Whisper + Draft WS Events

**Files:**
- Modify: `apps/mobile/lib/features/chat/widgets/whisper_suggestions.dart`
- Modify: `apps/mobile/lib/features/chat/widgets/draft_card.dart`

- [ ] **Step 8.1: Check existing Flutter socket provider**

Find the Flutter Socket.IO provider — typically in a Riverpod provider or a service class. Look for where `socket.on('message:new', ...)` is handled. The file is likely `lib/features/chat/providers/chat_socket_provider.dart` or similar.

```bash
grep -r "message:new\|socket.on" apps/mobile/lib --include="*.dart" -l
```

Note the file — call it `<socket_file>`.

- [ ] **Step 8.2: Add `ai:whisper:suggestions` listener in the socket file**

In `<socket_file>`, after the `message:new` listener, add:

```dart
socket.on('ai:whisper:suggestions', (data) {
  final payload = data as Map<String, dynamic>;
  ref.read(whisperSuggestionsProvider(payload['converseId'] as String).notifier)
     .setSuggestion(
       suggestionId: payload['suggestionId'] as String,
       primary: payload['primary'] as String,
       alternatives: List<String>.from(payload['alternatives'] as List),
     );
});

socket.on('ai:draft:created', (data) {
  final payload = data as Map<String, dynamic>;
  ref.read(draftProvider(payload['converseId'] as String).notifier)
     .addDraft(payload);
});

socket.on('ai:draft:expired', (data) {
  final payload = data as Map<String, dynamic>;
  ref.read(draftListProvider.notifier).expireDraft(payload['draftId'] as String);
});
```

Adapt provider names to match your existing Riverpod/Provider patterns.

- [ ] **Step 8.3: Update `whisper_suggestions.dart` widget**

The widget should read from the whisper state provider and render chips. Ensure:

1. Widget mounts only in `ConversationType.direct` chat screens
2. Shows chips with `AnimatedOpacity` fade-in (200ms)
3. Tap chip → fills input text → emits `ai:whisper:accept` via socket
4. Tap X → emits `ai:whisper:dismiss` → clears local state

Key emit calls:
```dart
// Accept
socket.emit('ai:whisper:accept', {
  'suggestionId': suggestionId,
  'selectedIndex': index,
});

// Dismiss
socket.emit('ai:whisper:dismiss', {
  'suggestionId': suggestionId,
});
```

- [ ] **Step 8.4: Update `draft_card.dart` widget**

Ensure the draft card:
1. Shows editable content text
2. Has Approve / Edit+Approve / Reject buttons
3. Shows 5-min countdown from `expiresAt`
4. Emits correct socket events:

```dart
// Approve
socket.emit('ai:draft:approve', {'draftId': draftId});

// Reject
socket.emit('ai:draft:reject', {'draftId': draftId});

// Edit + Approve
socket.emit('ai:draft:edit', {
  'draftId': draftId,
  'editedContent': {'content': editedText},
});
```

- [ ] **Step 8.5: Build Flutter to verify no compile errors**

```bash
cd apps/mobile && flutter build apk --debug 2>&1 | tail -20
```

Expected: Build succeeds (or shows only expected missing APK signing warnings)

- [ ] **Step 8.6: Commit**

```bash
git add apps/mobile/
git commit -m "feat(mobile): wire Whisper + Draft WS events"
```

---

## Task 9: Server Type-Check + Full Test Run

- [ ] **Step 9.1: TypeScript strict check on server**

```bash
pnpm --filter @linkingchat/server type-check
```

Expected: No errors

- [ ] **Step 9.2: Run all server tests**

```bash
pnpm --filter @linkingchat/server test
```

Expected: All tests pass. Note the count — should be ≥ the count before this sprint.

- [ ] **Step 9.3: Run Desktop type-check**

```bash
pnpm --filter @linkingchat/desktop type-check
```

Expected: No errors

- [ ] **Step 9.4: Commit any final type-check fixes**

If there are minor type errors, fix them and commit:

```bash
git add -p
git commit -m "fix(types): resolve strict type errors from Jarvis wiring"
```

---

## Task 10: Integration Smoke Test + Telemetry Verification

**Prerequisites:** Docker services running (`pnpm docker:up`), server running (`pnpm dev:server`), Desktop running (`pnpm dev:desktop`)

- [ ] **Step 10.1: Test Whisper quality gate (no trigger)**

Open Desktop. In a DIRECT conversation, send a message that is 2 characters or pure emoji (e.g., "ok" or "👍"). Verify: **no WhisperBar appears**.

- [ ] **Step 10.2: Test Whisper auto-trigger (happy path)**

In a DIRECT conversation, send a message of ≥ 3 characters (e.g., "今天开会了吗"). Within 2 seconds, verify: **WhisperBar appears below the input** with suggestions.

- [ ] **Step 10.3: Test Whisper accept + telemetry**

Click a Whisper suggestion chip. Verify: text fills the input. Then run:

```sql
SELECT status, "selectedIndex" FROM "AiSuggestion" WHERE type = 'WHISPER' ORDER BY "createdAt" DESC LIMIT 3;
```

Expected: `status = ACCEPTED`, `selectedIndex` set to the tapped chip index.

- [ ] **Step 10.4: Test Whisper dismiss + telemetry**

Trigger a new Whisper, then click the X. Run the same SQL. Expected: `status = DISMISSED`.

- [ ] **Step 10.5: Test GROUP converse — no Whisper**

Send a message in a GROUP converse. Verify: **no WhisperBar appears**.

- [ ] **Step 10.6: Test Draft — chat intent**

In the Supervisor Bot conversation, send "你好，今天天气如何". Verify: Bot replies with a text message, **no DraftCard appears**.

- [ ] **Step 10.7: Test Draft — draft intent**

In the Supervisor Bot conversation, send "帮我回复张总说周五开会没问题". Verify: **DraftCard appears** with a polished draft message. Click Approve. Verify the message appears in the correct target conversation.

- [ ] **Step 10.8: Test Predictive — rate limit**

Trigger a device command that fails (send a command like `cat /nonexistent_file`). Verify: **Predictive card appears in Supervisor converse** within 3 seconds.

Send the same failing command again immediately. Verify: **no second Predictive card** (rate limit).

- [ ] **Step 10.9: Telemetry summary check**

```sql
SELECT type, status, COUNT(*)
FROM "AiSuggestion"
GROUP BY type, status
ORDER BY type, status;
```

Expected result contains rows for `WHISPER` with `ACCEPTED` and `DISMISSED` statuses. This confirms the learning signal pipeline is working.

- [ ] **Step 10.10: Final commit**

```bash
git add .
git commit -m "test(integration): Sprint 6 Wake Up Jarvis — all three AI flows verified"
```

---

## Summary

| Phase | Tasks | What Gets Wired |
|-------|-------|----------------|
| Server | 1–4 | shouldTrigger gate, Whisper in MessagesService, Draft intent in Supervisor, Predictive in BotEventListener |
| Desktop | 5–7 | WhisperBar rendered + dismiss telemetry, DraftCard in ChatThread, Predictive card verified |
| Mobile | 8 | Whisper + Draft WS events wired in Flutter |
| Verify | 9–10 | Type-check + tests + smoke test + telemetry |

**Expected outcome:** User receives a DIRECT message → WhisperBar appears. User tells Jarvis "帮我回复" → DraftCard appears. Device command fails → Predictive card in Supervisor. All signals write to `AiSuggestion` table from day one.
