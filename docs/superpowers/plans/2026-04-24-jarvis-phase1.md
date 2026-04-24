# Jarvis Phase 1 — Agent Core + Relationship Graph

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade SupervisorAgent to a full pi-agent-core `Agent` (stateful, multi-turn, tool-calling), build the Relationship Graph data layer (Prisma models, incremental metrics, content event extraction), and wire a daily reminder engine.

**Architecture:** `JarvisAgentService` holds per-user `Agent` instances from pi-agent-core; tools are registered in `JarvisToolRegistry`; state is persisted via `JarvisMemoryService` (Redis cache + Prisma snapshot). `RelationshipModule` owns the graph independently — it reads messages via EventEmitter2 and pushes reminders through Jarvis. `BotEventListener` is updated to route to `JarvisAgentService` instead of the old orchestrator.

**Tech Stack:** `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, NestJS, Prisma (PostgreSQL), Redis, `@nestjs/schedule`, Jest

**Prerequisite:** Phase 0 plan complete (LlmConfigService in place, `@nestjs/schedule` registered).

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `apps/server/src/jarvis/jarvis.module.ts` | NestJS module wiring all Jarvis services |
| Create | `apps/server/src/jarvis/jarvis-tool.registry.ts` | Defines & builds L3 tool objects for pi-agent-core |
| Create | `apps/server/src/jarvis/jarvis-agent.service.ts` | Per-user Agent lifecycle, prompt/steer/confirm API |
| Create | `apps/server/src/jarvis/jarvis-memory.service.ts` | Redis cache + Prisma JarvisState snapshot |
| Create | `apps/server/src/jarvis/__tests__/jarvis-agent.service.spec.ts` | Unit tests |
| Create | `apps/server/src/jarvis/__tests__/jarvis-memory.service.spec.ts` | Unit tests |
| Create | `apps/server/src/jarvis/__tests__/jarvis-tool.registry.spec.ts` | Unit tests |
| Create | `apps/server/src/relationship/relationship.module.ts` | NestJS module for graph + reminders |
| Create | `apps/server/src/relationship/relationship-graph.service.ts` | Incremental metric updates |
| Create | `apps/server/src/relationship/content-analyzer.service.ts` | Rule filter + LLM event extraction |
| Create | `apps/server/src/relationship/relationship-event.listener.ts` | EventEmitter2 → graph + analyzer |
| Create | `apps/server/src/relationship/reminder-engine.service.ts` | Silence/cooling/pending-reply evaluation |
| Create | `apps/server/src/relationship/relationship-scheduler.service.ts` | Daily cron + Redis distributed lock |
| Create | `apps/server/src/relationship/relationships.controller.ts` | REST CRUD for RelationshipProfile |
| Create | `apps/server/src/relationship/dto/update-relationship.dto.ts` | PATCH body validation |
| Create | `apps/server/src/relationship/dto/relationship-response.dto.ts` | Response shape |
| Create | `apps/server/src/relationship/__tests__/*.spec.ts` | Unit tests |
| Modify | `apps/server/prisma/schema.prisma` | Add RelationshipProfile, RelationshipEvent, JarvisState |
| Modify | `apps/server/src/agents/events/bot-event.listener.ts` | Route to JarvisAgentService |
| Modify | `apps/server/src/friends/friends.service.ts` | Auto-create/delete RelationshipProfile on accept/remove |
| Modify | `apps/server/src/messages/messages.service.ts` | Emit message.created.relationship event |
| Modify | `apps/server/src/app.module.ts` | Import JarvisModule, RelationshipModule |

---

## Task 1: Prisma migration — RelationshipProfile, RelationshipEvent, JarvisState

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- Run: `pnpm db:migrate`

- [ ] **Step 1: Write a test that confirms the new models exist in the Prisma client**

Create `apps/server/src/relationship/__tests__/prisma-schema.spec.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

describe('Prisma schema — relationship models', () => {
  it('RelationshipProfile model exists on PrismaClient', () => {
    const prisma = new PrismaClient();
    expect(typeof prisma.relationshipProfile).toBe('object');
    prisma.$disconnect();
  });

  it('RelationshipEvent model exists on PrismaClient', () => {
    const prisma = new PrismaClient();
    expect(typeof prisma.relationshipEvent).toBe('object');
    prisma.$disconnect();
  });

  it('JarvisState model exists on PrismaClient', () => {
    const prisma = new PrismaClient();
    expect(typeof prisma.jarvisState).toBe('object');
    prisma.$disconnect();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="prisma-schema.spec"
```

Expected: FAIL — `prisma.relationshipProfile is not defined`

- [ ] **Step 3: Add models to schema.prisma**

Open `apps/server/prisma/schema.prisma`. Append the following after all existing models:

```prisma
// ─── Relationship Graph ───────────────────────────────────────────────────────

enum RelationshipTier {
  CORE
  IMPORTANT
  EXTENDED
}

enum SentimentTrend {
  WARMING
  STABLE
  COOLING
}

model RelationshipProfile {
  id                       String           @id @default(cuid())
  userId                   String
  contactId                String

  tier                     RelationshipTier @default(IMPORTANT)
  label                    String?
  notes                    String?
  isMuted                  Boolean          @default(false)
  customSilenceDays        Int?
  isUrgentReply            Boolean          @default(false)

  lastInteractionAt        DateTime?
  weeklyMessageCount       Int              @default(0)
  prevWeeklyMessageCount   Int?
  avgResponseMinutes       Float?
  initiationScore          Float?
  groupInteractionCount    Int              @default(0)

  lastKeyEventSummary      String?
  sentimentTrend           SentimentTrend?

  silenceReminderSentAt    DateTime?
  coolingReminderSentAt    DateTime?
  pendingReplyReminderAt   DateTime?

  createdAt                DateTime         @default(now())
  updatedAt                DateTime         @updatedAt

  user    User @relation("RelationshipOwner",   fields: [userId],    references: [id])
  contact User @relation("RelationshipContact", fields: [contactId], references: [id])
  events  RelationshipEvent[]

  @@unique([userId, contactId])
  @@index([userId, isMuted])
  @@index([userId, lastInteractionAt])
}

model RelationshipEvent {
  id              String   @id @default(cuid())
  profileId       String
  type            String   // life_event | commitment | emotional | milestone
  summary         String
  sourceMessageId String?
  extractedAt     DateTime @default(now())
  isActive        Boolean  @default(true)

  profile RelationshipProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@index([profileId, isActive])
}

// ─── Jarvis Agent State ───────────────────────────────────────────────────────

model JarvisState {
  id         String   @id @default(cuid())
  userId     String   @unique
  messages   Json
  metadata   Json?
  snapshotAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
}
```

Also add the new relations inside the existing `User` model block:

```prisma
  // Add these three lines inside the User model:
  ownedRelationships    RelationshipProfile[] @relation("RelationshipOwner")
  contactRelationships  RelationshipProfile[] @relation("RelationshipContact")
  jarvisState           JarvisState?
```

- [ ] **Step 4: Generate and apply the migration**

```bash
pnpm db:migrate -- --name add-relationship-graph-and-jarvis-state
```

Expected: New migration file under `prisma/migrations/`, Prisma client regenerated.

- [ ] **Step 5: Run the schema test to verify it passes**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="prisma-schema.spec"
```

Expected: PASS (3 tests green)

- [ ] **Step 6: Run full test suite for regressions**

```bash
pnpm --filter @linkingchat/server test
```

Expected: All existing tests still PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/prisma/ \
        apps/server/src/relationship/__tests__/prisma-schema.spec.ts
git commit -m "feat(db): add RelationshipProfile, RelationshipEvent, JarvisState Prisma models"
```

---

## Task 2: JarvisToolRegistry — L3 tool definitions

**Files:**
- Create: `apps/server/src/jarvis/jarvis-tool.registry.ts`
- Create: `apps/server/src/jarvis/__tests__/jarvis-tool.registry.spec.ts`

pi-agent-core tools use TypeBox schemas from `@mariozechner/pi-ai` for argument validation.

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/jarvis/__tests__/jarvis-tool.registry.spec.ts`:

```typescript
import { JarvisToolRegistry } from '../jarvis-tool.registry';

describe('JarvisToolRegistry', () => {
  let registry: JarvisToolRegistry;

  beforeEach(() => {
    const mockPrisma = { relationshipProfile: { findUnique: jest.fn(), findMany: jest.fn() }, message: { findMany: jest.fn() } };
    const mockBots = { getOrCreateSupervisorConverse: jest.fn() };
    const mockBroadcast = { toRoom: jest.fn() };
    registry = new JarvisToolRegistry(
      mockPrisma as any,
      mockBots as any,
      mockBroadcast as any,
    );
  });

  it('buildTools returns the 4 L3 tools', () => {
    const tools = registry.buildTools('user-123');
    const names = tools.map((t: any) => t.name);
    expect(names).toContain('query_relationship');
    expect(names).toContain('list_relationships');
    expect(names).toContain('search_messages');
    expect(names).toContain('send_nudge');
    expect(tools).toHaveLength(4);
  });

  it('each tool has name, description, and execute function', () => {
    const tools = registry.buildTools('user-123');
    for (const tool of tools) {
      expect(typeof (tool as any).name).toBe('string');
      expect(typeof (tool as any).description).toBe('string');
      expect(typeof (tool as any).execute).toBe('function');
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="jarvis-tool.registry.spec"
```

Expected: FAIL — `Cannot find module '../jarvis-tool.registry'`

- [ ] **Step 3: Implement JarvisToolRegistry**

Create `apps/server/src/jarvis/jarvis-tool.registry.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { PrismaService } from '../prisma/prisma.service';
import { BotsService } from '../bots/bots.service';
import { BroadcastService } from '../gateway/broadcast.service';

@Injectable()
export class JarvisToolRegistry {
  constructor(
    private readonly prisma: PrismaService,
    private readonly botsService: BotsService,
    private readonly broadcastService: BroadcastService,
  ) {}

  buildTools(userId: string): AgentTool<any>[] {
    return [
      this.buildQueryRelationship(userId),
      this.buildListRelationships(userId),
      this.buildSearchMessages(),
      this.buildSendNudge(userId),
    ];
  }

  private buildQueryRelationship(userId: string): AgentTool<any> {
    return {
      name: 'query_relationship',
      description: '查询某联系人的关系 profile：tier、标签、关键事件、最近互动时间',
      input: Type.Object({
        contactId: Type.String({ description: '联系人的 userId' }),
      }),
      execute: async ({ contactId }: { contactId: string }) => {
        const profile = await this.prisma.relationshipProfile.findUnique({
          where: { userId_contactId: { userId, contactId } },
          include: { events: { where: { isActive: true }, take: 5, orderBy: { extractedAt: 'desc' } } },
        });
        if (!profile) {
          return { found: false, message: `No relationship profile for contact ${contactId}` };
        }
        return {
          found: true,
          tier: profile.tier,
          label: profile.label,
          notes: profile.notes,
          lastInteractionAt: profile.lastInteractionAt?.toISOString() ?? null,
          weeklyMessageCount: profile.weeklyMessageCount,
          sentimentTrend: profile.sentimentTrend,
          recentEvents: profile.events.map((e) => ({ type: e.type, summary: e.summary })),
        };
      },
    };
  }

  private buildListRelationships(userId: string): AgentTool<any> {
    return {
      name: 'list_relationships',
      description: '按条件列出关系（如所有沉默超 N 天的 CORE 联系人）',
      input: Type.Object({
        tier: Type.Optional(
          Type.Union([Type.Literal('CORE'), Type.Literal('IMPORTANT'), Type.Literal('EXTENDED')]),
        ),
        silentDaysMin: Type.Optional(Type.Number({ description: '沉默天数下限' })),
        limit: Type.Optional(Type.Number({ description: '最多返回条数，默认 10' })),
      }),
      execute: async (args: { tier?: string; silentDaysMin?: number; limit?: number }) => {
        const cutoff = args.silentDaysMin
          ? new Date(Date.now() - args.silentDaysMin * 86_400_000)
          : undefined;

        const profiles = await this.prisma.relationshipProfile.findMany({
          where: {
            userId,
            isMuted: false,
            ...(args.tier ? { tier: args.tier as any } : {}),
            ...(cutoff ? { lastInteractionAt: { lt: cutoff } } : {}),
          },
          orderBy: { lastInteractionAt: 'asc' },
          take: args.limit ?? 10,
          include: { contact: { select: { displayName: true } } },
        });

        return profiles.map((p) => ({
          contactId: p.contactId,
          contactName: p.contact.displayName,
          tier: p.tier,
          lastInteractionAt: p.lastInteractionAt?.toISOString() ?? null,
          weeklyMessageCount: p.weeklyMessageCount,
        }));
      },
    };
  }

  private buildSearchMessages(): AgentTool<any> {
    return {
      name: 'search_messages',
      description: '搜索某对话的历史消息（关键词/时间范围）',
      input: Type.Object({
        converseId: Type.String(),
        keyword: Type.Optional(Type.String()),
        limit: Type.Optional(Type.Number({ description: '返回条数，默认 20' })),
      }),
      execute: async (args: { converseId: string; keyword?: string; limit?: number }) => {
        const messages = await this.prisma.message.findMany({
          where: {
            converseId: args.converseId,
            deletedAt: null,
            ...(args.keyword
              ? { content: { contains: args.keyword, mode: 'insensitive' } }
              : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: args.limit ?? 20,
          select: {
            id: true,
            content: true,
            createdAt: true,
            author: { select: { displayName: true } },
          },
        });
        return messages.reverse().map((m) => ({
          id: m.id,
          author: m.author.displayName,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        }));
      },
    };
  }

  private buildSendNudge(userId: string): AgentTool<any> {
    return {
      name: 'send_nudge',
      description: '向 Supervisor Bot 对话推送关系提醒卡片',
      input: Type.Object({
        contactId: Type.String(),
        message: Type.String({ description: '提醒内容，简洁，中文' }),
        reason: Type.String({ description: 'silence | cooling | pending_reply' }),
      }),
      execute: async (args: { contactId: string; message: string; reason: string }) => {
        const supervisorConverse =
          await this.botsService.getOrCreateSupervisorConverse(userId);

        this.broadcastService.toRoom(`u-${userId}`, 'bot:message', {
          converseId: supervisorConverse.id,
          type: 'NUDGE_CARD',
          contactId: args.contactId,
          message: args.message,
          reason: args.reason,
          createdAt: new Date().toISOString(),
        });

        return { sent: true, converseId: supervisorConverse.id };
      },
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="jarvis-tool.registry.spec"
```

Expected: PASS (2 tests green)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/jarvis/
git commit -m "feat(jarvis): JarvisToolRegistry with L3 tool definitions"
```

---

## Task 3: JarvisMemoryService — Redis cache + Prisma snapshot

**Files:**
- Create: `apps/server/src/jarvis/jarvis-memory.service.ts`
- Create: `apps/server/src/jarvis/__tests__/jarvis-memory.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/jarvis/__tests__/jarvis-memory.service.spec.ts`:

```typescript
import { JarvisMemoryService } from '../jarvis-memory.service';

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn(),
};
const mockPrisma = {
  jarvisState: {
    upsert: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn(),
  },
};

describe('JarvisMemoryService', () => {
  let svc: JarvisMemoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new JarvisMemoryService(mockRedis as any, mockPrisma as any);
  });

  it('save() writes to Redis with 1h TTL and upserts Prisma JarvisState', async () => {
    const messages = [{ role: 'user', content: 'hello' }];

    await svc.save('user-1', messages);

    expect(mockRedis.setex).toHaveBeenCalledWith(
      'jarvis:state:user-1',
      3600,
      JSON.stringify(messages),
    );
    expect(mockPrisma.jarvisState.upsert).toHaveBeenCalled();
  });

  it('restore() returns parsed messages from Redis when cache hit', async () => {
    const messages = [{ role: 'assistant', content: 'hi' }];
    mockRedis.get.mockResolvedValue(JSON.stringify(messages));

    const result = await svc.restore('user-1');

    expect(result).toEqual(messages);
    expect(mockPrisma.jarvisState.findUnique).not.toHaveBeenCalled();
  });

  it('restore() falls back to Prisma on Redis cache miss', async () => {
    const messages = [{ role: 'user', content: 'from db' }];
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.jarvisState.findUnique.mockResolvedValue({ messages });

    const result = await svc.restore('user-1');

    expect(result).toEqual(messages);
  });

  it('restore() returns null when neither Redis nor Prisma has state', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.jarvisState.findUnique.mockResolvedValue(null);

    const result = await svc.restore('user-1');

    expect(result).toBeNull();
  });

  it('compactContext() keeps last N messages', () => {
    const msgs = Array.from({ length: 60 }, (_, i) => ({ role: 'user', content: `msg ${i}` }));

    const compacted = svc.compactContext(msgs, 50);

    expect(compacted).toHaveLength(50);
    expect(compacted[0].content).toBe('msg 10');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="jarvis-memory.service.spec"
```

Expected: FAIL

- [ ] **Step 3: Implement JarvisMemoryService**

Create `apps/server/src/jarvis/jarvis-memory.service.ts`:

```typescript
import { Injectable, Inject, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

type AgentMessage = { role: string; content: unknown };

const STATE_TTL_SECONDS = 3600;

@Injectable()
export class JarvisMemoryService {
  private readonly logger = new Logger(JarvisMemoryService.name);

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  private cacheKey(userId: string): string {
    return `jarvis:state:${userId}`;
  }

  async save(userId: string, messages: AgentMessage[]): Promise<void> {
    await Promise.all([
      this.redis.setex(this.cacheKey(userId), STATE_TTL_SECONDS, JSON.stringify(messages)),
      this.prisma.jarvisState.upsert({
        where: { userId },
        create: { userId, messages: messages as any },
        update: { messages: messages as any, snapshotAt: new Date() },
      }),
    ]);
  }

  async restore(userId: string): Promise<AgentMessage[] | null> {
    const cached = await this.redis.get(this.cacheKey(userId));
    if (cached) {
      try {
        return JSON.parse(cached) as AgentMessage[];
      } catch {
        this.logger.warn(`Failed to parse cached Jarvis state for user ${userId}`);
      }
    }

    const record = await this.prisma.jarvisState.findUnique({ where: { userId } });
    return record ? (record.messages as AgentMessage[]) : null;
  }

  /**
   * Trim messages to the last N, preserving recency.
   */
  compactContext(messages: AgentMessage[], keepLast: number): AgentMessage[] {
    if (messages.length <= keepLast) return messages;
    return messages.slice(messages.length - keepLast);
  }

  async logToolUse(
    userId: string,
    toolName: string,
    _result: unknown,
    isError: boolean,
  ): Promise<void> {
    this.logger.debug(`Tool use — user=${userId} tool=${toolName} error=${isError}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="jarvis-memory.service.spec"
```

Expected: PASS (5 tests green)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/jarvis/
git commit -m "feat(jarvis): JarvisMemoryService with Redis cache + Prisma snapshot"
```

---

## Task 4: JarvisAgentService — per-user Agent lifecycle

**Files:**
- Create: `apps/server/src/jarvis/jarvis-agent.service.ts`
- Create: `apps/server/src/jarvis/__tests__/jarvis-agent.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/jarvis/__tests__/jarvis-agent.service.spec.ts`:

```typescript
import { JarvisAgentService } from '../jarvis-agent.service';

const mockToolRegistry = { buildTools: jest.fn().mockReturnValue([]) };
const mockMemoryService = {
  restore: jest.fn().mockResolvedValue(null),
  save: jest.fn().mockResolvedValue(undefined),
  compactContext: jest.fn((msgs: any[]) => msgs),
  logToolUse: jest.fn().mockResolvedValue(undefined),
};
const mockBroadcast = { toRoom: jest.fn() };
const mockLlmConfig = {
  getModel: jest.fn().mockReturnValue({ id: 'deepseek-chat', provider: 'deepseek' }),
};

describe('JarvisAgentService', () => {
  let svc: JarvisAgentService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new JarvisAgentService(
      mockToolRegistry as any,
      mockMemoryService as any,
      mockBroadcast as any,
      mockLlmConfig as any,
    );
  });

  afterEach(() => svc.onModuleDestroy());

  it('getOrCreate() returns the same Agent instance on repeated calls', async () => {
    const a1 = await svc.getOrCreate('user-1');
    const a2 = await svc.getOrCreate('user-1');
    expect(a1).toBe(a2);
  });

  it('getOrCreate() returns distinct instances for different users', async () => {
    const a1 = await svc.getOrCreate('user-1');
    const a2 = await svc.getOrCreate('user-2');
    expect(a1).not.toBe(a2);
  });

  it('getOrCreate() calls restore() to load saved messages', async () => {
    const saved = [{ role: 'user', content: 'previous message' }];
    mockMemoryService.restore.mockResolvedValueOnce(saved);

    await svc.getOrCreate('user-with-history');

    expect(mockMemoryService.restore).toHaveBeenCalledWith('user-with-history');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="jarvis-agent.service.spec"
```

Expected: FAIL

- [ ] **Step 3: Implement JarvisAgentService**

Create `apps/server/src/jarvis/jarvis-agent.service.ts`:

```typescript
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Agent } from '@mariozechner/pi-agent-core';
import { JarvisToolRegistry } from './jarvis-tool.registry';
import { JarvisMemoryService } from './jarvis-memory.service';
import { BroadcastService } from '../gateway/broadcast.service';
import { LlmConfigService } from '../ai/llm-config.service';

const SYSTEM_PROMPT = `你是贾维斯（Jarvis），用户的私人 AI 社交助理。
职责：帮助用户维护社交关系、主动提醒沉默联系人、生成高情商消息草稿。
原则：回复简洁（中文），每步操作都告知用户，send_message 等危险操作必须等用户确认。`;

const INACTIVE_EVICT_MS = 60 * 60 * 1000;

interface AgentEntry {
  agent: Agent;
  lastActiveAt: number;
}

@Injectable()
export class JarvisAgentService implements OnModuleDestroy {
  private readonly logger = new Logger(JarvisAgentService.name);
  private readonly agents = new Map<string, AgentEntry>();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    private readonly toolRegistry: JarvisToolRegistry,
    private readonly memoryService: JarvisMemoryService,
    private readonly broadcastService: BroadcastService,
    private readonly llmConfig: LlmConfigService,
  ) {
    this.cleanupInterval = setInterval(() => this.evictInactive(), 30 * 60 * 1000);
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupInterval);
  }

  async getOrCreate(userId: string): Promise<Agent> {
    const existing = this.agents.get(userId);
    if (existing) {
      existing.lastActiveAt = Date.now();
      return existing.agent;
    }

    const savedMessages = await this.memoryService.restore(userId);
    const tools = this.toolRegistry.buildTools(userId);

    const agent = new Agent({
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
        model: this.llmConfig.getModel('chat'),
        tools,
        messages: (savedMessages ?? []) as any,
      },
      transformContext: async (messages: any) =>
        this.memoryService.compactContext(messages, 50) as any,
      beforeToolCall: async ({ toolCall, args }: { toolCall: { name: string; id: string }; args: unknown }) => {
        const DANGEROUS = ['send_message', 'execute_device_command'];
        if (DANGEROUS.includes(toolCall.name)) {
          this.broadcastService.toRoom(`u-${userId}`, 'jarvis:confirm', {
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            args,
          });
          return { block: true, reason: 'awaiting_user_confirmation' };
        }
        return undefined;
      },
      afterToolCall: async ({ toolCall, isError }: { toolCall: { name: string }; result: unknown; isError: boolean }) => {
        await this.memoryService.logToolUse(userId, toolCall.name, undefined, isError);
      },
    });

    agent.subscribe(async (event: { type: string; [k: string]: unknown }) => {
      this.broadcastService.toRoom(`u-${userId}`, 'jarvis:event', {
        type: event.type,
        ...(event.type === 'message_update' ? { delta: event.assistantMessageEvent } : {}),
      });

      if (event.type === 'turn_end') {
        await this.memoryService.save(userId, (agent.state as any).messages);
      }
    });

    this.agents.set(userId, { agent, lastActiveAt: Date.now() });
    return agent;
  }

  async prompt(userId: string, message: string): Promise<void> {
    const agent = await this.getOrCreate(userId);
    await agent.prompt(message);
  }

  async systemTrigger(
    userId: string,
    eventType: string,
    payload: unknown,
  ): Promise<void> {
    const agent = await this.getOrCreate(userId);
    (agent as any).followUp({
      role: 'user',
      content: `[SYSTEM] ${eventType}: ${JSON.stringify(payload)}`,
    });
  }

  async confirmToolCall(
    userId: string,
    _toolCallId: string,
    approved: boolean,
  ): Promise<void> {
    const entry = this.agents.get(userId);
    if (!entry) {
      this.logger.warn(`No active agent for user ${userId}`);
      return;
    }
    if (approved) {
      await entry.agent.continue();
    } else {
      (entry.agent as any).steer({
        role: 'user',
        content: '用户拒绝了这个操作，请换一种方式或询问用户意图。',
      });
    }
  }

  private async evictInactive(): Promise<void> {
    const cutoff = Date.now() - INACTIVE_EVICT_MS;
    for (const [userId, entry] of this.agents.entries()) {
      if (entry.lastActiveAt < cutoff) {
        await this.memoryService.save(userId, (entry.agent.state as any).messages);
        this.agents.delete(userId);
        this.logger.debug(`Evicted inactive agent for user ${userId}`);
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="jarvis-agent.service.spec"
```

Expected: PASS (3 tests green)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/jarvis/
git commit -m "feat(jarvis): JarvisAgentService with per-user Agent lifecycle"
```

---

## Task 5: JarvisModule + update BotEventListener routing

**Files:**
- Create: `apps/server/src/jarvis/jarvis.module.ts`
- Modify: `apps/server/src/agents/events/bot-event.listener.ts`
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: Create JarvisModule**

Create `apps/server/src/jarvis/jarvis.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JarvisAgentService } from './jarvis-agent.service';
import { JarvisToolRegistry } from './jarvis-tool.registry';
import { JarvisMemoryService } from './jarvis-memory.service';
import { AiModule } from '../ai/ai.module';
import { BotsModule } from '../bots/bots.module';
import { RedisModule } from '../redis/redis.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ConfigModule, AiModule, BotsModule, RedisModule, PrismaModule],
  providers: [JarvisAgentService, JarvisToolRegistry, JarvisMemoryService],
  exports: [JarvisAgentService],
})
export class JarvisModule {}
```

> Note: Do not import MessagesModule here — MessagesService is not needed by JarvisToolRegistry (it queries Prisma directly). Avoid circular imports.

- [ ] **Step 2: Update BotEventListener to route to JarvisAgentService**

Open `apps/server/src/agents/events/bot-event.listener.ts`.

Add `JarvisAgentService` import and constructor param, then update `handleAgentDispatch`:

```typescript
// Add import:
import { JarvisAgentService } from '../../jarvis/jarvis-agent.service';

// Add to constructor:
private readonly jarvisAgent: JarvisAgentService,

// Replace handleAgentDispatch body:
@OnEvent('agent.dispatch')
async handleAgentDispatch(payload: AgentDispatchEvent): Promise<void> {
  this.logger.debug(`Received agent.dispatch for bot ${payload.botId}`);

  const userMessageEvent = payload.events.find((e) => e.type === 'USER_MESSAGE');
  if (userMessageEvent) {
    const userId = userMessageEvent.source?.userId;
    const content = userMessageEvent.payload?.content as string | undefined;
    if (userId && content) {
      await this.jarvisAgent.prompt(userId, content);
      return;
    }
  }

  // Fallback: keep old orchestrator for any non-USER_MESSAGE events
  await this.orchestrator.dispatchEvent(payload.botId, payload.events);
}
```

- [ ] **Step 3: Add JarvisModule to AppModule**

In `apps/server/src/app.module.ts`:

```typescript
import { JarvisModule } from './jarvis/jarvis.module';

@Module({
  imports: [
    // ...existing imports...
    JarvisModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 4: Run full test suite**

```bash
pnpm --filter @linkingchat/server test
```

Expected: All PASS

- [ ] **Step 5: Type-check**

```bash
pnpm --filter @linkingchat/server type-check
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/jarvis/jarvis.module.ts \
        apps/server/src/agents/events/bot-event.listener.ts \
        apps/server/src/app.module.ts
git commit -m "feat(jarvis): wire JarvisModule, route agent.dispatch to JarvisAgentService"
```

---

## Task 6: RelationshipGraphService — incremental metric updates

**Files:**
- Create: `apps/server/src/relationship/relationship-graph.service.ts`
- Create: `apps/server/src/relationship/__tests__/relationship-graph.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/relationship/__tests__/relationship-graph.service.spec.ts`:

```typescript
import { RelationshipGraphService } from '../relationship-graph.service';

const mockPrisma = {
  relationshipProfile: {
    upsert: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({}),
  },
};

describe('RelationshipGraphService', () => {
  let svc: RelationshipGraphService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new RelationshipGraphService(mockPrisma as any);
  });

  it('onMessageEvent() upserts profile for both sender→receiver and receiver→sender', async () => {
    await svc.onMessageEvent({
      senderId: 'user-a',
      receiverId: 'user-b',
      converseType: 'DM',
      messageId: 'msg-1',
      sentAt: new Date(),
    });

    expect(mockPrisma.relationshipProfile.upsert).toHaveBeenCalledTimes(2);
  });

  it('onMessageEvent() increments weeklyMessageCount for sender→receiver direction', async () => {
    await svc.onMessageEvent({
      senderId: 'user-a',
      receiverId: 'user-b',
      converseType: 'DM',
      messageId: 'msg-2',
      sentAt: new Date(),
    });

    const firstCall = mockPrisma.relationshipProfile.upsert.mock.calls[0][0];
    expect(firstCall.update).toMatchObject({ weeklyMessageCount: { increment: 1 } });
  });

  it('weeklyDecay() saves prevWeeklyMessageCount and resets weeklyMessageCount to 0', async () => {
    mockPrisma.relationshipProfile.findMany.mockResolvedValue([
      { id: 'p-1', weeklyMessageCount: 5 },
    ]);

    await svc.weeklyDecay();

    expect(mockPrisma.relationshipProfile.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { prevWeeklyMessageCount: 5, weeklyMessageCount: 0 },
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="relationship-graph.service.spec"
```

Expected: FAIL

- [ ] **Step 3: Implement RelationshipGraphService**

Create `apps/server/src/relationship/relationship-graph.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface MessageEvent {
  senderId: string;
  receiverId: string;
  converseType: 'DM' | 'GROUP';
  messageId: string;
  sentAt: Date;
}

@Injectable()
export class RelationshipGraphService {
  private readonly logger = new Logger(RelationshipGraphService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onMessageEvent(event: MessageEvent): Promise<void> {
    const { senderId, receiverId, sentAt } = event;

    await Promise.all([
      // Sender's profile of the receiver: they sent a message → interaction happened
      this.prisma.relationshipProfile.upsert({
        where: { userId_contactId: { userId: senderId, contactId: receiverId } },
        create: { userId: senderId, contactId: receiverId, lastInteractionAt: sentAt, weeklyMessageCount: 1 },
        update: { lastInteractionAt: sentAt, weeklyMessageCount: { increment: 1 } },
      }),
      // Receiver's profile of the sender: update lastInteractionAt only
      this.prisma.relationshipProfile.upsert({
        where: { userId_contactId: { userId: receiverId, contactId: senderId } },
        create: { userId: receiverId, contactId: senderId, lastInteractionAt: sentAt },
        update: { lastInteractionAt: sentAt },
      }),
    ]);
  }

  async weeklyDecay(): Promise<void> {
    const profiles = await this.prisma.relationshipProfile.findMany({
      select: { id: true, weeklyMessageCount: true },
    });

    await Promise.all(
      profiles.map((p) =>
        this.prisma.relationshipProfile.update({
          where: { id: p.id },
          data: { prevWeeklyMessageCount: p.weeklyMessageCount, weeklyMessageCount: 0 },
        }),
      ),
    );

    this.logger.log(`Weekly decay applied to ${profiles.length} profiles`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="relationship-graph.service.spec"
```

Expected: PASS (3 tests green)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/relationship/
git commit -m "feat(relationship): RelationshipGraphService with incremental metric updates"
```

---

## Task 7: ContentAnalyzerService — rule filter + LLM event extraction

**Files:**
- Create: `apps/server/src/relationship/content-analyzer.service.ts`
- Create: `apps/server/src/relationship/__tests__/content-analyzer.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/relationship/__tests__/content-analyzer.service.spec.ts`:

```typescript
import { ContentAnalyzerService } from '../content-analyzer.service';

const mockLlmConfig = { completeText: jest.fn() };

describe('ContentAnalyzerService', () => {
  let svc: ContentAnalyzerService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new ContentAnalyzerService(mockLlmConfig as any);
  });

  describe('ruleFilter', () => {
    it('returns false for very short messages', () => {
      expect(svc.ruleFilter('ok')).toBe(false);
    });

    it('returns false for pure emoji', () => {
      expect(svc.ruleFilter('😊👍')).toBe(false);
    });

    it('returns true for life-event keyword', () => {
      expect(svc.ruleFilter('我妈妈住院了')).toBe(true);
    });

    it('returns true for commitment keyword', () => {
      expect(svc.ruleFilter('我答应你下周一定来')).toBe(true);
    });
  });

  describe('extractEvents', () => {
    it('parses JSON array returned by LLM', async () => {
      mockLlmConfig.completeText.mockResolvedValue(
        JSON.stringify([{ type: 'life_event', summary: '妈妈住院了' }]),
      );

      const events = await svc.extractEvents('我妈妈住院了', 'msg-1');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('life_event');
      expect(events[0].sourceMessageId).toBe('msg-1');
    });

    it('returns empty array when LLM returns null', async () => {
      mockLlmConfig.completeText.mockResolvedValue(null);
      expect(await svc.extractEvents('text', 'msg-2')).toEqual([]);
    });

    it('returns empty array when LLM returns invalid JSON', async () => {
      mockLlmConfig.completeText.mockResolvedValue('not json');
      expect(await svc.extractEvents('text', 'msg-3')).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="content-analyzer.service.spec"
```

Expected: FAIL

- [ ] **Step 3: Implement ContentAnalyzerService**

Create `apps/server/src/relationship/content-analyzer.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { LlmConfigService } from '../ai/llm-config.service';

export interface ExtractedEvent {
  type: 'life_event' | 'commitment' | 'emotional' | 'milestone';
  summary: string;
  sourceMessageId?: string;
}

const LIFE_KEYWORDS = ['住院', '手术', '去世', '离职', '结婚', '生孩子', '怀孕', '毕业', '搬家', '分手', '离婚'];
const COMMITMENT_KEYWORDS = ['我答应', '我保证', '我一定', '下次请你', '我请你'];

const EXTRACT_SYSTEM_PROMPT = `你是关系事件提取器。分析聊天消息，提取重要关系事件。
返回 JSON 数组，格式：[{"type": "life_event|commitment|emotional|milestone", "summary": "简短描述"}]
无事件则返回 []。只返回 JSON。`;

@Injectable()
export class ContentAnalyzerService {
  private readonly logger = new Logger(ContentAnalyzerService.name);

  constructor(private readonly llmConfig: LlmConfigService) {}

  ruleFilter(content: string): boolean {
    if (!content || content.trim().length < 8) return false;
    if (/^[\p{Emoji}\s]+$/u.test(content.trim())) return false;
    if (LIFE_KEYWORDS.some((kw) => content.includes(kw))) return true;
    if (COMMITMENT_KEYWORDS.some((kw) => content.includes(kw))) return true;
    if (/[!！]{2,}/.test(content)) return true;
    if (content.includes('太感动') || content.includes('谢谢你')) return true;
    return false;
  }

  async extractEvents(content: string, messageId: string): Promise<ExtractedEvent[]> {
    const text = await this.llmConfig.completeText(
      'complex_analysis',
      EXTRACT_SYSTEM_PROMPT,
      content,
      { maxTokens: 256 },
    );
    if (!text) return [];

    try {
      const cleaned = text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
      const parsed = JSON.parse(cleaned) as ExtractedEvent[];
      if (!Array.isArray(parsed)) return [];
      return parsed.map((e) => ({ ...e, sourceMessageId: messageId }));
    } catch {
      this.logger.warn(`Failed to parse event extraction: ${text.substring(0, 80)}`);
      return [];
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="content-analyzer.service.spec"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/relationship/
git commit -m "feat(relationship): ContentAnalyzerService with rule filter + LLM extraction"
```

---

## Task 8: RelationshipEventListener + message emission + FriendsService hooks

**Files:**
- Create: `apps/server/src/relationship/relationship-event.listener.ts`
- Create: `apps/server/src/relationship/__tests__/relationship-event.listener.spec.ts`
- Modify: `apps/server/src/messages/messages.service.ts`
- Modify: `apps/server/src/friends/friends.service.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/relationship/__tests__/relationship-event.listener.spec.ts`:

```typescript
import { RelationshipEventListener } from '../relationship-event.listener';

const mockGraph = { onMessageEvent: jest.fn().mockResolvedValue(undefined) };
const mockAnalyzer = {
  ruleFilter: jest.fn().mockReturnValue(false),
  extractEvents: jest.fn().mockResolvedValue([]),
};
const mockPrisma = { relationshipEvent: { createMany: jest.fn().mockResolvedValue({}) } };

describe('RelationshipEventListener', () => {
  let listener: RelationshipEventListener;

  beforeEach(() => {
    jest.clearAllMocks();
    listener = new RelationshipEventListener(mockGraph as any, mockAnalyzer as any, mockPrisma as any);
  });

  it('calls onMessageEvent for every message', async () => {
    await listener.handleMessageCreated({
      messageId: 'msg-1', senderId: 'user-a', receiverId: 'user-b',
      converseType: 'DM', content: 'hello', sentAt: new Date(), profileId: 'p-1',
    });
    expect(mockGraph.onMessageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: 'user-a', receiverId: 'user-b' }),
    );
  });

  it('skips LLM extraction when ruleFilter returns false', async () => {
    mockAnalyzer.ruleFilter.mockReturnValue(false);
    await listener.handleMessageCreated({
      messageId: 'msg-2', senderId: 'u', receiverId: 'c',
      converseType: 'DM', content: 'ok', sentAt: new Date(), profileId: 'p-2',
    });
    expect(mockAnalyzer.extractEvents).not.toHaveBeenCalled();
  });

  it('persists extracted events when ruleFilter passes', async () => {
    mockAnalyzer.ruleFilter.mockReturnValue(true);
    mockAnalyzer.extractEvents.mockResolvedValue([
      { type: 'life_event', summary: '住院了', sourceMessageId: 'msg-3' },
    ]);
    await listener.handleMessageCreated({
      messageId: 'msg-3', senderId: 'u', receiverId: 'c',
      converseType: 'DM', content: '我妈住院了', sentAt: new Date(), profileId: 'p-3',
    });
    // Wait for fire-and-forget
    await new Promise((r) => setTimeout(r, 10));
    expect(mockPrisma.relationshipEvent.createMany).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="relationship-event.listener.spec"
```

Expected: FAIL

- [ ] **Step 3: Implement RelationshipEventListener**

Create `apps/server/src/relationship/relationship-event.listener.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { RelationshipGraphService, type MessageEvent } from './relationship-graph.service';
import { ContentAnalyzerService } from './content-analyzer.service';

export interface MessageCreatedRelationshipEvent {
  messageId: string;
  senderId: string;
  receiverId: string;
  converseType: 'DM' | 'GROUP';
  content: string | null;
  sentAt: Date;
  profileId?: string;
}

@Injectable()
export class RelationshipEventListener {
  private readonly logger = new Logger(RelationshipEventListener.name);

  constructor(
    private readonly graphService: RelationshipGraphService,
    private readonly analyzer: ContentAnalyzerService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent('message.created.relationship')
  async handleMessageCreated(event: MessageCreatedRelationshipEvent): Promise<void> {
    await this.graphService.onMessageEvent({
      senderId: event.senderId,
      receiverId: event.receiverId,
      converseType: event.converseType,
      messageId: event.messageId,
      sentAt: event.sentAt,
    });

    if (event.content && event.profileId && this.analyzer.ruleFilter(event.content)) {
      this.analyzer
        .extractEvents(event.content, event.messageId)
        .then(async (events) => {
          if (events.length === 0) return;
          await this.prisma.relationshipEvent.createMany({
            data: events.map((e) => ({
              profileId: event.profileId!,
              type: e.type,
              summary: e.summary,
              sourceMessageId: e.sourceMessageId,
            })),
          });
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(`Event extraction failed for message ${event.messageId}: ${msg}`);
        });
    }
  }
}
```

- [ ] **Step 4: Emit relationship event in MessagesService**

In `apps/server/src/messages/messages.service.ts`, find the `create()` method. After broadcasting `message:new` (around line 175), add a fire-and-forget relationship event emission:

```typescript
// After the message:new broadcast, fire relationship event for DM/GROUP:
if (message.type === 'TEXT') {
  const otherMemberId = memberIds.find((id) => id !== userId);
  if (otherMemberId) {
    this.prisma.relationshipProfile
      .findUnique({
        where: { userId_contactId: { userId, contactId: otherMemberId } },
        select: { id: true },
      })
      .then((profile) => {
        this.eventEmitter.emit('message.created.relationship', {
          messageId: message.id,
          senderId: userId,
          receiverId: otherMemberId,
          converseType: 'DM',
          content: message.content,
          sentAt: message.createdAt,
          profileId: profile?.id,
        });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Relationship event emit failed: ${msg}`);
      });
  }
}
```

- [ ] **Step 5: Add friendship hooks in FriendsService**

Open `apps/server/src/friends/friends.service.ts`. Find the `accept()` method. After the Friendship record is created, add:

```typescript
// Auto-create mutual RelationshipProfiles when friends are accepted
await Promise.all([
  this.prisma.relationshipProfile.upsert({
    where: { userId_contactId: { userId: requesterId, contactId: addresseeId } },
    create: { userId: requesterId, contactId: addresseeId },
    update: {},
  }),
  this.prisma.relationshipProfile.upsert({
    where: { userId_contactId: { userId: addresseeId, contactId: requesterId } },
    create: { userId: addresseeId, contactId: requesterId },
    update: {},
  }),
]);
```

Find the `removeFriend()` or `unfriend()` method. After the Friendship is deleted, soft-mute both profiles:

```typescript
// Soft-mute profiles on unfriend (don't delete — historical data is valuable)
await this.prisma.relationshipProfile.updateMany({
  where: {
    OR: [
      { userId: userAId, contactId: userBId },
      { userId: userBId, contactId: userAId },
    ],
  },
  data: { isMuted: true },
});
```

**Important:** Check the actual parameter names in `removeFriend()` — use whatever variable names hold the two user IDs in that method.

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="relationship-event.listener.spec"
pnpm --filter @linkingchat/server test -- --testPathPattern="messages.service"
pnpm --filter @linkingchat/server test -- --testPathPattern="friends.service"
```

Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/relationship/ \
        apps/server/src/messages/messages.service.ts \
        apps/server/src/friends/friends.service.ts
git commit -m "feat(relationship): event listener, message emission, friendship hooks"
```

---

## Task 9: ReminderEngine + RelationshipScheduler

**Files:**
- Create: `apps/server/src/relationship/reminder-engine.service.ts`
- Create: `apps/server/src/relationship/relationship-scheduler.service.ts`
- Create: `apps/server/src/relationship/__tests__/reminder-engine.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/relationship/__tests__/reminder-engine.service.spec.ts`:

```typescript
import { ReminderEngineService } from '../reminder-engine.service';

const mockPrisma = {
  relationshipProfile: {
    findMany: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({}),
  },
};
const mockJarvis = { systemTrigger: jest.fn().mockResolvedValue(undefined) };

describe('ReminderEngineService', () => {
  let svc: ReminderEngineService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new ReminderEngineService(mockPrisma as any, mockJarvis as any);
  });

  it('triggers Jarvis for a CORE contact silent for 8 days', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000);
    mockPrisma.relationshipProfile.findMany.mockResolvedValue([{
      id: 'p-1', userId: 'user-a', contactId: 'contact-b',
      tier: 'CORE', isMuted: false, customSilenceDays: null,
      silenceReminderSentAt: null, lastInteractionAt: eightDaysAgo,
      label: null, lastKeyEventSummary: null,
    }]);

    await svc.runDailyEvaluation();

    expect(mockJarvis.systemTrigger).toHaveBeenCalledWith(
      'user-a', 'SILENCE_REMINDER',
      expect.objectContaining({ contactId: 'contact-b' }),
    );
  });

  it('skips muted profiles', async () => {
    mockPrisma.relationshipProfile.findMany.mockResolvedValue([{
      id: 'p-2', userId: 'user-a', contactId: 'contact-c',
      tier: 'CORE', isMuted: true, customSilenceDays: null,
      silenceReminderSentAt: null, lastInteractionAt: new Date(Date.now() - 10 * 86_400_000),
      label: null, lastKeyEventSummary: null,
    }]);

    await svc.runDailyEvaluation();

    expect(mockJarvis.systemTrigger).not.toHaveBeenCalled();
  });

  it('caps reminders at 3 per user per day', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000);
    const profiles = Array.from({ length: 5 }, (_, i) => ({
      id: `p-${i}`, userId: 'user-a', contactId: `c-${i}`,
      tier: 'CORE', isMuted: false, customSilenceDays: null,
      silenceReminderSentAt: null, lastInteractionAt: eightDaysAgo,
      label: null, lastKeyEventSummary: null,
    }));
    mockPrisma.relationshipProfile.findMany.mockResolvedValue(profiles);

    await svc.runDailyEvaluation();

    expect(mockJarvis.systemTrigger).toHaveBeenCalledTimes(3);
  });

  describe('isSilent', () => {
    it('CORE: silent after 7 days', () => {
      expect(svc.isSilent({ tier: 'CORE', customSilenceDays: null, lastInteractionAt: new Date(Date.now() - 8 * 86_400_000) } as any)).toBe(true);
    });

    it('IMPORTANT: not silent at 10 days (threshold is 21)', () => {
      expect(svc.isSilent({ tier: 'IMPORTANT', customSilenceDays: null, lastInteractionAt: new Date(Date.now() - 10 * 86_400_000) } as any)).toBe(false);
    });

    it('EXTENDED: never silent', () => {
      expect(svc.isSilent({ tier: 'EXTENDED', customSilenceDays: null, lastInteractionAt: new Date(Date.now() - 60 * 86_400_000) } as any)).toBe(false);
    });

    it('respects customSilenceDays over tier default', () => {
      expect(svc.isSilent({ tier: 'IMPORTANT', customSilenceDays: 5, lastInteractionAt: new Date(Date.now() - 6 * 86_400_000) } as any)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="reminder-engine.service.spec"
```

Expected: FAIL

- [ ] **Step 3: Implement ReminderEngineService**

Create `apps/server/src/relationship/reminder-engine.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JarvisAgentService } from '../jarvis/jarvis-agent.service';
import type { RelationshipProfile } from '@prisma/client';

const SILENCE_THRESHOLD: Record<string, number | null> = {
  CORE: 7,
  IMPORTANT: 21,
  EXTENDED: null,
};

const DAILY_CAP = 3;
const DEDUP_DAYS = 7;
const QUIET_START = 22;
const QUIET_END = 8;

@Injectable()
export class ReminderEngineService {
  private readonly logger = new Logger(ReminderEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jarvisAgent: JarvisAgentService,
  ) {}

  async runDailyEvaluation(): Promise<void> {
    if (this.isQuietHours(new Date())) {
      this.logger.log('Reminder evaluation skipped — quiet hours');
      return;
    }

    const profiles = await this.prisma.relationshipProfile.findMany({
      where: { isMuted: false },
    });

    const byUser = new Map<string, typeof profiles>();
    for (const p of profiles) {
      const list = byUser.get(p.userId) ?? [];
      list.push(p);
      byUser.set(p.userId, list);
    }

    for (const [userId, userProfiles] of byUser.entries()) {
      const sorted = [...userProfiles].sort((a, b) => {
        const order: Record<string, number> = { CORE: 0, IMPORTANT: 1, EXTENDED: 2 };
        const tierDiff = (order[a.tier] ?? 2) - (order[b.tier] ?? 2);
        if (tierDiff !== 0) return tierDiff;
        return (a.lastInteractionAt?.getTime() ?? 0) - (b.lastInteractionAt?.getTime() ?? 0);
      });

      let sent = 0;
      for (const profile of sorted) {
        if (sent >= DAILY_CAP) break;
        if (this.isSilent(profile) && this.notRecentlySent(profile.silenceReminderSentAt)) {
          await this.jarvisAgent.systemTrigger(userId, 'SILENCE_REMINDER', {
            contactId: profile.contactId,
            daysSilent: Math.floor(this.daysSince(profile.lastInteractionAt)),
            tier: profile.tier,
            label: profile.label,
            lastKeyEvent: profile.lastKeyEventSummary,
          });

          await this.prisma.relationshipProfile.updateMany({
            where: { id: profile.id },
            data: { silenceReminderSentAt: new Date() },
          });

          sent++;
        }
      }
    }
  }

  isSilent(
    profile: Pick<RelationshipProfile, 'tier' | 'customSilenceDays' | 'lastInteractionAt'>,
  ): boolean {
    const threshold = profile.customSilenceDays ?? SILENCE_THRESHOLD[profile.tier];
    if (threshold == null) return false;
    return this.daysSince(profile.lastInteractionAt) >= threshold;
  }

  private notRecentlySent(sentAt: Date | null): boolean {
    return !sentAt || this.daysSince(sentAt) >= DEDUP_DAYS;
  }

  private daysSince(date: Date | null | undefined): number {
    if (!date) return Infinity;
    return (Date.now() - date.getTime()) / 86_400_000;
  }

  private isQuietHours(now: Date): boolean {
    const h = now.getHours();
    return h >= QUIET_START || h < QUIET_END;
  }
}
```

- [ ] **Step 4: Create RelationshipSchedulerService**

Create `apps/server/src/relationship/relationship-scheduler.service.ts`:

```typescript
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Redis } from 'ioredis';
import { ReminderEngineService } from './reminder-engine.service';
import { RelationshipGraphService } from './relationship-graph.service';

@Injectable()
export class RelationshipSchedulerService {
  private readonly logger = new Logger(RelationshipSchedulerService.name);

  constructor(
    private readonly reminderEngine: ReminderEngineService,
    private readonly graphService: RelationshipGraphService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  @Cron('0 9 * * *') // Daily at 09:00
  async runDailyReminders(): Promise<void> {
    const acquired = await this.redis.set('relationship:daily:lock', '1', 'EX', 3600, 'NX');
    if (!acquired) return;
    try {
      this.logger.log('Running daily reminder evaluation');
      await this.reminderEngine.runDailyEvaluation();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Daily reminder failed: ${msg}`);
    } finally {
      await this.redis.del('relationship:daily:lock');
    }
  }

  @Cron('0 2 * * 1') // Every Monday at 02:00
  async runWeeklyDecay(): Promise<void> {
    const acquired = await this.redis.set('relationship:weekly:lock', '1', 'EX', 3600, 'NX');
    if (!acquired) return;
    try {
      await this.graphService.weeklyDecay();
    } finally {
      await this.redis.del('relationship:weekly:lock');
    }
  }
}
```

- [ ] **Step 5: Run reminder tests**

```bash
pnpm --filter @linkingchat/server test -- --testPathPattern="reminder-engine.service.spec"
```

Expected: PASS (7 tests green)

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/relationship/
git commit -m "feat(relationship): ReminderEngine + RelationshipScheduler cron"
```

---

## Task 10: RelationshipsController REST API + RelationshipModule wiring

**Files:**
- Create: `apps/server/src/relationship/dto/update-relationship.dto.ts`
- Create: `apps/server/src/relationship/dto/relationship-response.dto.ts`
- Create: `apps/server/src/relationship/relationships.controller.ts`
- Create: `apps/server/src/relationship/relationship.module.ts`
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: Create DTOs**

Create `apps/server/src/relationship/dto/update-relationship.dto.ts`:

```typescript
import { IsEnum, IsOptional, IsString, IsBoolean, IsInt, Min } from 'class-validator';

export class UpdateRelationshipDto {
  @IsOptional()
  @IsEnum(['CORE', 'IMPORTANT', 'EXTENDED'])
  tier?: 'CORE' | 'IMPORTANT' | 'EXTENDED';

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isMuted?: boolean;

  @IsOptional()
  @IsBoolean()
  isUrgentReply?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  customSilenceDays?: number;
}
```

Create `apps/server/src/relationship/dto/relationship-response.dto.ts`:

```typescript
export class RelationshipResponseDto {
  id!: string;
  contactId!: string;
  tier!: string;
  label!: string | null;
  notes!: string | null;
  isMuted!: boolean;
  isUrgentReply!: boolean;
  lastInteractionAt!: string | null;
  weeklyMessageCount!: number;
  sentimentTrend!: string | null;
  lastKeyEventSummary!: string | null;
  recentEvents!: { type: string; summary: string }[];
}
```

- [ ] **Step 2: Create RelationshipsController**

Create `apps/server/src/relationship/relationships.controller.ts`:

```typescript
import { Controller, Get, Patch, Param, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateRelationshipDto } from './dto/update-relationship.dto';
import type { RelationshipResponseDto } from './dto/relationship-response.dto';

@Controller('relationships')
@UseGuards(JwtAuthGuard, EmailVerifiedGuard)
export class RelationshipsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async findAll(@Request() req: { user: { id: string } }): Promise<RelationshipResponseDto[]> {
    const profiles = await this.prisma.relationshipProfile.findMany({
      where: { userId: req.user.id },
      orderBy: [{ tier: 'asc' }, { lastInteractionAt: 'desc' }],
      include: {
        events: { where: { isActive: true }, take: 3, orderBy: { extractedAt: 'desc' } },
      },
    });

    return profiles.map((p) => ({
      id: p.id,
      contactId: p.contactId,
      tier: p.tier,
      label: p.label,
      notes: p.notes,
      isMuted: p.isMuted,
      isUrgentReply: p.isUrgentReply,
      lastInteractionAt: p.lastInteractionAt?.toISOString() ?? null,
      weeklyMessageCount: p.weeklyMessageCount,
      sentimentTrend: p.sentimentTrend,
      lastKeyEventSummary: p.lastKeyEventSummary,
      recentEvents: p.events.map((e) => ({ type: e.type, summary: e.summary })),
    }));
  }

  @Patch(':contactId')
  async update(
    @Request() req: { user: { id: string } },
    @Param('contactId') contactId: string,
    @Body() dto: UpdateRelationshipDto,
  ): Promise<RelationshipResponseDto> {
    const profile = await this.prisma.relationshipProfile.upsert({
      where: { userId_contactId: { userId: req.user.id, contactId } },
      create: { userId: req.user.id, contactId, ...dto },
      update: dto,
      include: { events: { where: { isActive: true }, take: 3 } },
    });

    return {
      id: profile.id,
      contactId: profile.contactId,
      tier: profile.tier,
      label: profile.label,
      notes: profile.notes,
      isMuted: profile.isMuted,
      isUrgentReply: profile.isUrgentReply,
      lastInteractionAt: profile.lastInteractionAt?.toISOString() ?? null,
      weeklyMessageCount: profile.weeklyMessageCount,
      sentimentTrend: profile.sentimentTrend,
      lastKeyEventSummary: profile.lastKeyEventSummary,
      recentEvents: profile.events.map((e) => ({ type: e.type, summary: e.summary })),
    };
  }
}
```

- [ ] **Step 3: Create RelationshipModule**

Create `apps/server/src/relationship/relationship.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { RelationshipGraphService } from './relationship-graph.service';
import { ContentAnalyzerService } from './content-analyzer.service';
import { RelationshipEventListener } from './relationship-event.listener';
import { ReminderEngineService } from './reminder-engine.service';
import { RelationshipSchedulerService } from './relationship-scheduler.service';
import { RelationshipsController } from './relationships.controller';
import { AiModule } from '../ai/ai.module';
import { JarvisModule } from '../jarvis/jarvis.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [AiModule, JarvisModule, PrismaModule, RedisModule],
  controllers: [RelationshipsController],
  providers: [
    RelationshipGraphService,
    ContentAnalyzerService,
    RelationshipEventListener,
    ReminderEngineService,
    RelationshipSchedulerService,
  ],
  exports: [RelationshipGraphService],
})
export class RelationshipModule {}
```

- [ ] **Step 4: Add RelationshipModule to AppModule**

In `apps/server/src/app.module.ts`:

```typescript
import { RelationshipModule } from './relationship/relationship.module';

@Module({
  imports: [
    // ...existing imports, JarvisModule already added in Task 5...
    RelationshipModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 5: Run the full test suite**

```bash
pnpm --filter @linkingchat/server test
```

Expected: All PASS

- [ ] **Step 6: Type-check and build**

```bash
pnpm --filter @linkingchat/server type-check
pnpm --filter @linkingchat/server build
```

Expected: 0 errors, clean build.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/relationship/ apps/server/src/app.module.ts
git commit -m "feat(relationship): RelationshipsController REST API + RelationshipModule wiring"
```

---

## Phase 1 Acceptance Checklist

- [ ] `pnpm --filter @linkingchat/server test` — all green
- [ ] `pnpm --filter @linkingchat/server type-check` — 0 errors
- [ ] `pnpm --filter @linkingchat/server build` — clean build
- [ ] DB migration applied: `relationship_profile`, `relationship_event`, `jarvis_state` tables exist
- [ ] Manual: `@ai 我和李明关系怎么样` in Bot DM → Jarvis calls `query_relationship` → structured response in chat
- [ ] Manual: send DM → DB `weeklyMessageCount` incremented
- [ ] Manual: `GET /api/v1/relationships` with JWT → returns relationship list
- [ ] Manual: `PATCH /api/v1/relationships/:contactId` with `{ "tier": "CORE" }` → profile updated
- [ ] Manual: call `reminderEngine.runDailyEvaluation()` from a test endpoint → Jarvis `systemTrigger` fires for silent CORE contact
- [ ] Old orchestrator/SupervisorAgent code still present but bypassed — safe to remove in Phase 2 cleanup
