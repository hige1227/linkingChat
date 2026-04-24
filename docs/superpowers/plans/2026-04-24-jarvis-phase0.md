# Jarvis Phase 0 — pi-ai Migration + Whisper Auto-Trigger

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled LLM layer (DeepSeekProvider + KimiProvider + LlmRouterService) with `@mariozechner/pi-ai`, then extend Whisper auto-trigger from DM-only to GROUP @mention.

**Architecture:** Introduce `LlmConfigService` as the single pi-ai wrapper; all AI services (Whisper, Draft, Predictive) inject it instead of `LlmRouterService`. The replacement is a direct substitution — no behavioral changes, existing tests must stay green.

**Tech Stack:** `@mariozechner/pi-ai` (unified LLM), `@mariozechner/pi-agent-core` (installed now, used in Phase 1), NestJS, Jest

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `apps/server/src/ai/llm-config.service.ts` | pi-ai model definitions + `completeText()` helper |
| Create | `apps/server/src/ai/__tests__/llm-config.service.spec.ts` | unit tests |
| Modify | `apps/server/src/ai/services/whisper.service.ts` | swap `llmRouter.complete()` → `llmConfig.completeText()`, add `triggerForMentioned()` |
| Modify | `apps/server/src/ai/services/draft.service.ts` | swap `llmRouter.complete()` → `llmConfig.completeText()` |
| Modify | `apps/server/src/ai/services/predictive.service.ts` | same swap |
| Modify | `apps/server/src/ai/ai.module.ts` | add LlmConfigService, remove old providers |
| Delete | `apps/server/src/ai/providers/deepseek.provider.ts` | replaced by pi-ai |
| Delete | `apps/server/src/ai/providers/kimi.provider.ts` | replaced by pi-ai |
| Delete | `apps/server/src/ai/services/llm-router.service.ts` | replaced by LlmConfigService |
| Delete | `apps/server/src/ai/providers/llm-provider.interface.ts` | no longer needed |
| Modify | `apps/server/src/messages/messages.service.ts` | extend Whisper trigger to GROUP |
| Modify | `apps/server/src/ai/__tests__/whisper.service.spec.ts` | add `triggerForMentioned` tests |
| Modify | `apps/server/src/app.module.ts` | register ScheduleModule |

---

## Task 1: Install packages + smoke-test API key wiring

**Files:**
- Run from: `apps/server/` directory

- [ ] **Step 1: Install pi-ai and pi-agent-core**

```bash
pnpm --filter @linkingchat/server add @mariozechner/pi-ai @mariozechner/pi-agent-core
```

Expected: packages added to `apps/server/package.json`, `pnpm-lock.yaml` updated.

- [ ] **Step 2: Write a minimal smoke test script to verify API key wiring**

Create `apps/server/src/ai/pi-smoke-test.ts` (deleted in Step 4):

```typescript
import { complete, type Context, type Model } from '@mariozechner/pi-ai';

// pi-ai reads API keys from env vars. For custom OpenAI-compatible providers
// the likely conventions are:
//   DEEPSEEK_API_KEY   (existing project var)
//   PI_AI_DEEPSEEK_API_KEY  (pi-ai convention if it uses a prefix)
// Run this to find out which one works, then record it for Task 2.

const model: Model<'openai-completions'> = {
  id: 'deepseek-chat',
  name: 'DeepSeek Chat',
  api: 'openai-completions',
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  reasoning: false,
  input: ['text'],
  cost: { input: 0.27, output: 1.10, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 64000,
  maxTokens: 8000,
};

const ctx: Context = {
  systemPrompt: 'You are a test assistant.',
  messages: [{ role: 'user', content: 'Say "ok" and nothing else.' }],
};

complete(model, ctx)
  .then(r => console.log('PASSED:', r.content))
  .catch(e => console.error('FAILED:', e.message));
```

- [ ] **Step 3: Run the smoke test to discover the correct API key env var**

```bash
cd apps/server
# Try with existing env var name:
DEEPSEEK_API_KEY=$(grep ^DEEPSEEK_API_KEY .env | cut -d= -f2) \
  npx tsx src/ai/pi-smoke-test.ts
```

If it fails with an auth error, try:

```bash
PI_AI_DEEPSEEK_API_KEY=$(grep ^DEEPSEEK_API_KEY .env | cut -d= -f2) \
  npx tsx src/ai/pi-smoke-test.ts
```

Note which env var name worked. Use that exact name in the `getApiKey` callback in Task 2's `LlmConfigService`.

- [ ] **Step 4: Delete the smoke test file**

```bash
rm apps/server/src/ai/pi-smoke-test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/server/package.json pnpm-lock.yaml
git commit -m "chore: install @mariozechner/pi-ai and pi-agent-core"
```

---

## Task 2: Create LlmConfigService

**Files:**
- Create: `apps/server/src/ai/llm-config.service.ts`
- Create: `apps/server/src/ai/__tests__/llm-config.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/ai/__tests__/llm-config.service.spec.ts`:

```typescript
import { ConfigService } from '@nestjs/config';
import { LlmConfigService } from '../llm-config.service';

describe('LlmConfigService', () => {
  let svc: LlmConfigService;

  beforeEach(() => {
    const mockConfig = { get: jest.fn().mockReturnValue('test-key') };
    svc = new LlmConfigService(mockConfig as unknown as ConfigService);
  });

  it('returns deepseek model for whisper tasks', () => {
    const m = svc.getModel('whisper');
    expect(m.provider).toBe('deepseek');
    expect(m.id).toBe('deepseek-chat');
  });

  it('returns kimi model for draft tasks', () => {
    const m = svc.getModel('draft');
    expect(m.provider).toBe('kimi');
  });

  it('returns kimi model for complex_analysis tasks', () => {
    expect(svc.getModel('complex_analysis').provider).toBe('kimi');
  });

  it('returns deepseek model for predictive and chat tasks', () => {
    expect(svc.getModel('predictive').provider).toBe('deepseek');
    expect(svc.getModel('chat').provider).toBe('deepseek');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="llm-config.service.spec"
```

Expected: FAIL — `Cannot find module '../llm-config.service'`

- [ ] **Step 3: Implement LlmConfigService**

Create `apps/server/src/ai/llm-config.service.ts`:

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { complete, type Context, type Model } from '@mariozechner/pi-ai';

export type LlmTaskType = 'whisper' | 'predictive' | 'chat' | 'draft' | 'complex_analysis';

interface TextBlock {
  type: 'text';
  text: string;
}

@Injectable()
export class LlmConfigService implements OnModuleInit {
  private readonly logger = new Logger(LlmConfigService.name);

  private readonly deepseekModel: Model<'openai-completions'> = {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    api: 'openai-completions',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    reasoning: false,
    input: ['text'],
    cost: { input: 0.27, output: 1.10, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 64000,
    maxTokens: 8000,
  };

  private readonly kimiModel: Model<'openai-completions'> = {
    id: 'moonshot-v1-8k',
    name: 'Kimi',
    api: 'openai-completions',
    provider: 'kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    reasoning: false,
    input: ['text'],
    cost: { input: 0.5, output: 1.5, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8000,
    maxTokens: 2048,
  };

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const deepseekKey = this.config.get<string>('DEEPSEEK_API_KEY');
    const kimiKey = this.config.get<string>('KIMI_API_KEY');
    if (!deepseekKey) this.logger.warn('DEEPSEEK_API_KEY not set — DeepSeek calls will fail');
    if (!kimiKey) this.logger.warn('KIMI_API_KEY not set — Kimi calls will fail');
  }

  getModel(taskType: LlmTaskType): Model<'openai-completions'> {
    if (taskType === 'draft' || taskType === 'complex_analysis') {
      return this.kimiModel;
    }
    return this.deepseekModel;
  }

  /**
   * Single-turn text completion via pi-ai.
   * Returns the concatenated text of all text blocks, or null on timeout/error.
   */
  async completeText(
    taskType: LlmTaskType,
    systemPrompt: string,
    userMessage: string,
    options?: { maxTokens?: number; temperature?: number; timeoutMs?: number },
  ): Promise<string | null> {
    const model = this.getModel(taskType);
    const context: Context = {
      systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    };

    const callOptions = {
      ...(options?.maxTokens ? { maxTokens: options.maxTokens } : {}),
      ...(options?.temperature ? { temperature: options.temperature } : {}),
      // NOTE: If Task 1 smoke test showed a different env var name is needed,
      // update the provider key lookups below accordingly.
      getApiKey: async (provider: string): Promise<string> => {
        if (provider === 'deepseek') {
          return this.config.get<string>('DEEPSEEK_API_KEY') ?? '';
        }
        if (provider === 'kimi') {
          return this.config.get<string>('KIMI_API_KEY') ?? '';
        }
        return '';
      },
    };

    const timeout = options?.timeoutMs ?? 10_000;
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), timeout),
    );

    try {
      const result = await Promise.race([complete(model, context, callOptions), timeoutPromise]);
      if (!result) return null;

      return result.content
        .filter((b): b is TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`LLM call failed [${taskType}]: ${msg}`);
      return null;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="llm-config.service.spec"
```

Expected: PASS (4 tests green)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ai/llm-config.service.ts \
        apps/server/src/ai/__tests__/llm-config.service.spec.ts
git commit -m "feat(ai): introduce LlmConfigService wrapping pi-ai"
```

---

## Task 3: Migrate WhisperService to pi-ai

**Files:**
- Modify: `apps/server/src/ai/services/whisper.service.ts`
- Modify: `apps/server/src/ai/__tests__/whisper.service.spec.ts` (or wherever the spec lives)

- [ ] **Step 1: Update imports and constructor in whisper.service.ts**

In `apps/server/src/ai/services/whisper.service.ts`:

```typescript
// REMOVE this import:
import { LlmRouterService } from './llm-router.service';

// ADD this import:
import { LlmConfigService } from '../llm-config.service';
```

In the constructor, replace `private readonly llmRouter: LlmRouterService` with:
```typescript
private readonly llmConfig: LlmConfigService,
```

- [ ] **Step 2: Replace the LLM call in generateSuggestions**

Find the `generateSuggestions` method. Replace the `this.llmRouter.complete(...)` block:

```typescript
// REMOVE:
const response = await this.llmRouter.complete({
  taskType: 'whisper',
  systemPrompt: WHISPER_SYSTEM_PROMPT,
  messages: [{ role: 'user', content: userContent }],
  maxTokens: 512,
  temperature: 0.8,
});
return this.parseSuggestions(response.content);

// ADD:
const text = await this.llmConfig.completeText(
  'whisper',
  WHISPER_SYSTEM_PROMPT,
  userContent,
  { maxTokens: 512, temperature: 0.8, timeoutMs: this.WHISPER_TIMEOUT },
);
if (!text) return null;
return this.parseSuggestions(text);
```

Also remove any separate `Promise.race` timeout wrapper that was around the old LLM call — `completeText` handles the timeout internally now.

- [ ] **Step 3: Update the test mock**

In the whisper service spec, find the mock for `LlmRouterService`:

```typescript
// REMOVE:
const mockLlmRouter = { complete: jest.fn().mockResolvedValue({ content: '...' }) };
// and in providers:
{ provide: LlmRouterService, useValue: mockLlmRouter }

// ADD:
const mockLlmConfig = {
  completeText: jest.fn().mockResolvedValue('1. 好的，没问题\n2. 收到\n3. 明白了'),
  getModel: jest.fn(),
};
// and in providers:
{ provide: LlmConfigService, useValue: mockLlmConfig }
```

- [ ] **Step 4: Run whisper tests**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="whisper.service"
```

Expected: PASS — all existing tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ai/services/whisper.service.ts \
        apps/server/src/ai/__tests__/
git commit -m "refactor(ai): migrate WhisperService to pi-ai via LlmConfigService"
```

---

## Task 4: Migrate DraftService to pi-ai

**Files:**
- Modify: `apps/server/src/ai/services/draft.service.ts`
- Modify: corresponding test file

- [ ] **Step 1: Replace LlmRouterService with LlmConfigService in draft.service.ts**

Find the call around line 252:

```typescript
// REMOVE:
const response = await this.llmRouter.complete({
  taskType: 'draft',
  systemPrompt: DRAFT_SYSTEM_PROMPT,
  messages: [{ role: 'user', content: userContent }],
  maxTokens: 1024,
});
const text = response.content;

// ADD:
const text = await this.llmConfig.completeText(
  'draft',
  DRAFT_SYSTEM_PROMPT,
  userContent,
  { maxTokens: 1024 },
);
if (!text) throw new Error('Draft generation failed: LLM returned null');
```

Replace constructor injection (swap `LlmRouterService` for `LlmConfigService`).

- [ ] **Step 2: Update test mocks (same pattern as Task 3)**

Replace `mockLlmRouter` with:
```typescript
const mockLlmConfig = { completeText: jest.fn().mockResolvedValue('生成的草稿内容') };
```

- [ ] **Step 3: Run draft tests**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="draft.service"
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/ai/services/draft.service.ts apps/server/src/ai/__tests__/
git commit -m "refactor(ai): migrate DraftService to pi-ai via LlmConfigService"
```

---

## Task 5: Migrate PredictiveService to pi-ai

**Files:**
- Modify: `apps/server/src/ai/services/predictive.service.ts`
- Modify: corresponding test file

- [ ] **Step 1: Replace LlmRouterService in predictive.service.ts**

Find the call at line 211:

```typescript
// REMOVE:
const response = await this.llmRouter.complete({
  taskType: 'predictive',
  systemPrompt: PREDICTIVE_SYSTEM_PROMPT,
  messages: [{ role: 'user', content: userContent }],
  maxTokens: 512,
});
const text = response.content;

// ADD:
const text = await this.llmConfig.completeText(
  'predictive',
  PREDICTIVE_SYSTEM_PROMPT,
  userContent,
  { maxTokens: 512 },
);
if (!text) return; // predictive is fire-and-forget; silent skip on failure is fine
```

Replace constructor injection (swap `LlmRouterService` for `LlmConfigService`).

- [ ] **Step 2: Update test mocks**

```typescript
const mockLlmConfig = { completeText: jest.fn().mockResolvedValue('预测动作建议') };
```

- [ ] **Step 3: Run predictive tests**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="predictive.service"
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/ai/services/predictive.service.ts apps/server/src/ai/__tests__/
git commit -m "refactor(ai): migrate PredictiveService to pi-ai via LlmConfigService"
```

---

## Task 6: Delete old LLM layer + wire ai.module.ts

**Files:**
- Delete: `apps/server/src/ai/providers/deepseek.provider.ts`
- Delete: `apps/server/src/ai/providers/kimi.provider.ts`
- Delete: `apps/server/src/ai/services/llm-router.service.ts`
- Delete: `apps/server/src/ai/providers/llm-provider.interface.ts`
- Modify: `apps/server/src/ai/ai.module.ts`

- [ ] **Step 1: Remove the deleted files**

```bash
rm apps/server/src/ai/providers/deepseek.provider.ts
rm apps/server/src/ai/providers/kimi.provider.ts
rm apps/server/src/ai/services/llm-router.service.ts
rm apps/server/src/ai/providers/llm-provider.interface.ts
```

- [ ] **Step 2: Update ai.module.ts**

Open `apps/server/src/ai/ai.module.ts`. Remove all references to the deleted files and add `LlmConfigService`. The final file should look like this (preserve any existing imports for PrismaModule, MetricsModule, etc.):

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmConfigService } from './llm-config.service';
import { WhisperService } from './services/whisper.service';
import { DraftService } from './services/draft.service';
import { PredictiveService } from './services/predictive.service';
// keep any existing imports: PrismaModule, MetricsModule, BroadcastService, etc.

@Module({
  imports: [
    ConfigModule,
    // ...keep existing imports...
  ],
  providers: [LlmConfigService, WhisperService, DraftService, PredictiveService],
  exports: [LlmConfigService, WhisperService, DraftService, PredictiveService],
})
export class AiModule {}
```

- [ ] **Step 3: Run the full server test suite**

```bash
pnpm --filter @linkingchat/server test
```

Expected: All tests PASS. Zero references to `LlmRouterService`, `DeepSeekProvider`, or `KimiProvider`.

- [ ] **Step 4: Type-check**

```bash
pnpm --filter @linkingchat/server type-check
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(ai): delete LlmRouterService + old providers, wire LlmConfigService"
```

---

## Task 7: Extend Whisper auto-trigger to GROUP @mention

The existing trigger fires only for DIRECT conversations. This task adds: when a GROUP message @mentions a human user, that user gets Whisper suggestions to help reply.

**Files:**
- Modify: `apps/server/src/ai/services/whisper.service.ts`
- Modify: `apps/server/src/messages/messages.service.ts`
- Modify: `apps/server/src/ai/__tests__/whisper.service.spec.ts`

- [ ] **Step 1: Write the failing test for triggerForMentioned**

Add to `apps/server/src/ai/__tests__/whisper.service.spec.ts`:

```typescript
describe('triggerForMentioned', () => {
  it('calls handleWhisperRequest for each mentioned user', async () => {
    const handleSpy = jest
      .spyOn(service, 'handleWhisperRequest')
      .mockResolvedValue(undefined);

    await service.triggerForMentioned(['user-1', 'user-2'], 'converse-abc');

    expect(handleSpy).toHaveBeenCalledTimes(2);
    expect(handleSpy).toHaveBeenCalledWith('user-1', 'converse-abc');
    expect(handleSpy).toHaveBeenCalledWith('user-2', 'converse-abc');
  });

  it('does nothing when mentionedUserIds is empty', async () => {
    const handleSpy = jest
      .spyOn(service, 'handleWhisperRequest')
      .mockResolvedValue(undefined);

    await service.triggerForMentioned([], 'converse-abc');

    expect(handleSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="whisper.service"
```

Expected: FAIL — `service.triggerForMentioned is not a function`

- [ ] **Step 3: Add triggerForMentioned to WhisperService**

Add this method to `apps/server/src/ai/services/whisper.service.ts`:

```typescript
/**
 * Trigger Whisper for human users who were @mentioned in a GROUP message.
 * Fires all triggers in parallel; errors per-user are caught and logged.
 */
async triggerForMentioned(
  mentionedUserIds: string[],
  converseId: string,
): Promise<void> {
  if (mentionedUserIds.length === 0) return;
  await Promise.all(
    mentionedUserIds.map((uid) =>
      this.handleWhisperRequest(uid, converseId).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Whisper group trigger failed for user ${uid}: ${msg}`);
      }),
    ),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="whisper.service"
```

Expected: PASS

- [ ] **Step 5: Wire the trigger in messages.service.ts**

In `apps/server/src/messages/messages.service.ts`, find the `create()` method. After the existing DM Whisper block (around line 199–213), add a GROUP block. The final whisper section should look like:

```typescript
// Whisper auto-trigger (fire-and-forget)
if (message.type === 'TEXT') {
  const converseForWhisper = await this.prisma.converse.findUnique({
    where: { id: dto.converseId },
    select: { type: true },
  });

  if (converseForWhisper?.type === ConverseType.DM) {
    // DM: suggest to the receiver
    const receiverId = memberIds.find((id) => id !== userId);
    if (receiverId && this.whisperService.shouldTrigger(message.content)) {
      this.whisperService
        .handleWhisperRequest(receiverId, dto.converseId)
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(`DM Whisper trigger failed: ${msg}`);
        });
    }
  } else if (converseForWhisper?.type === ConverseType.GROUP) {
    // GROUP: suggest to @mentioned human users
    const rawMentions = this.mentionService.parse(message.content);
    const nonAiMentions = rawMentions.filter((m) => m !== 'ai');
    if (nonAiMentions.length > 0 && this.whisperService.shouldTrigger(message.content)) {
      this.mentionService
        .validate(nonAiMentions, dto.converseId)
        .then((validated) => {
          // validated entries have the fields available from MentionService.validate()
          // Filter to human members only (not bots) and not the sender
          const humanIds = validated
            .filter((v) => !v.isBot && v.userId !== userId)
            .map((v) => v.userId);
          return this.whisperService.triggerForMentioned(humanIds, dto.converseId);
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(`GROUP Whisper trigger failed: ${msg}`);
        });
    }
  }
}
```

**Important:** Check `apps/server/src/mentions/mentions.service.ts` to confirm the shape of objects returned by `validate()`. If the field is not `isBot` or `userId`, adapt the filter to match the actual type. The goal is: only trigger for human members who are not the sender.

- [ ] **Step 6: Run the full server test suite**

```bash
pnpm --filter @linkingchat/server test
```

Expected: All PASS

- [ ] **Step 7: Type-check**

```bash
pnpm --filter @linkingchat/server type-check
```

Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/ai/services/whisper.service.ts \
        apps/server/src/messages/messages.service.ts \
        apps/server/src/ai/__tests__/whisper.service.spec.ts
git commit -m "feat(ai): extend Whisper auto-trigger to GROUP @mention"
```

---

## Task 8: Register @nestjs/schedule for Phase 1

**Files:**
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: Install @nestjs/schedule**

```bash
pnpm --filter @linkingchat/server add @nestjs/schedule
```

- [ ] **Step 2: Register ScheduleModule in AppModule**

Open `apps/server/src/app.module.ts`. Add `ScheduleModule.forRoot()` to the imports array:

```typescript
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    // ... existing imports ...
    ScheduleModule.forRoot(),
  ],
})
export class AppModule {}
```

- [ ] **Step 3: Verify the server starts without errors**

```bash
pnpm --filter @linkingchat/server build
```

Expected: Build succeeds with 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/app.module.ts apps/server/package.json pnpm-lock.yaml
git commit -m "chore: register ScheduleModule for Phase 1 reminder cron jobs"
```

---

## Phase 0 Acceptance Checklist

- [ ] `pnpm --filter @linkingchat/server test` — all green
- [ ] `pnpm --filter @linkingchat/server type-check` — 0 errors
- [ ] `LlmRouterService`, `DeepSeekProvider`, `KimiProvider` files deleted
- [ ] `LlmConfigService` is the only LLM entry point in `AiModule`
- [ ] DM: receiving a text message → Whisper suggestions arrive within 2s (manual smoke test)
- [ ] GROUP: @mentioning a user → that user receives Whisper suggestions (manual smoke test)
- [ ] `@nestjs/schedule` registered; server starts cleanly
- [ ] `@mariozechner/pi-agent-core` installed (used in Phase 1)
