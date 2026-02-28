# Phase 6: Agent Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Agent architecture foundation with Memory, Workspace, and Supervisor Agent that aggregates bot notifications.

**Architecture:** Each Bot is an independent Agent with its own Memory (short-term + working) and Workspace (state + config). Events are batched in 5-second windows before being dispatched to Agents. LLM generates notification messages instead of hardcoded templates.

**Tech Stack:** NestJS 11, TypeScript 5.7+, Redis (ioredis), Socket.IO

---

## Task 1: Agent Interface Definitions

**Files:**
- Create: `apps/server/src/agents/interfaces/agent.interface.ts`
- Create: `apps/server/src/agents/interfaces/memory.interface.ts`
- Create: `apps/server/src/agents/interfaces/workspace.interface.ts`
- Create: `apps/server/src/agents/interfaces/events.interface.ts`
- Create: `apps/server/src/agents/interfaces/index.ts`

**Step 1: Write the agent interface**

```typescript
// apps/server/src/agents/interfaces/agent.interface.ts

export type AgentRole = 'supervisor' | 'coding' | 'social' | 'custom';

export interface IAgent {
  // Identity
  readonly id: string;
  readonly botId: string;
  readonly name: string;
  readonly role: AgentRole;

  // Core capabilities
  handleEvent(events: AgentEvent[]): Promise<void>;
  generateResponse(context: ConversationContext): Promise<AgentResponse>;

  // State access
  getMemory(): AgentMemory;
  getWorkspace(): AgentWorkspace;

  // Tools
  getTools(): AgentTool[];
}

export interface AgentResponse {
  content: string;
  actions?: AgentAction[];
  metadata?: Record<string, unknown>;
}

export interface AgentAction {
  type: 'view' | 'execute' | 'navigate';
  label: string;
  target: string;
  data?: Record<string, unknown>;
}

export interface AgentTool {
  name: string;
  description: string;
  execute: (args: unknown) => Promise<unknown>;
}

export interface ConversationContext {
  events?: AgentEvent[];
  userId?: string;
  converseId?: string;
  userMessage?: string;
}
```

**Step 2: Write the memory interface**

```typescript
// apps/server/src/agents/interfaces/memory.interface.ts

export interface AgentMemory {
  shortTerm: MemoryEntry[];
  longTerm?: LongTermMemoryStore;
  working: WorkingMemory;
}

export interface MemoryEntry {
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface WorkingMemory {
  currentTask?: TaskContext;
  pendingActions: PendingAction[];
  recentResults: CommandResult[];
}

export interface TaskContext {
  taskId: string;
  type: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt: Date;
  data?: Record<string, unknown>;
}

export interface PendingAction {
  actionId: string;
  type: string;
  description: string;
  createdAt: Date;
}

export interface CommandResult {
  commandId: string;
  command: string;
  status: 'success' | 'error';
  output?: string;
  error?: string;
  completedAt: Date;
}

export interface LongTermMemoryStore {
  // Placeholder for future vector store integration
  search(query: string, limit: number): Promise<MemoryEntry[]>;
  add(entry: MemoryEntry): Promise<void>;
}
```

**Step 3: Write the workspace interface**

```typescript
// apps/server/src/agents/interfaces/workspace.interface.ts

export interface AgentWorkspace {
  state: Record<string, unknown>;
  config: BotConfig;
  sessionId: string;
}

export interface BotConfig {
  language: string;
  timezone: string;
  settings: Record<string, unknown>;
  allowedTools: string[];
}
```

**Step 4: Write the events interface**

```typescript
// apps/server/src/agents/interfaces/events.interface.ts

export type AgentEventType =
  | 'DEVICE_RESULT'
  | 'BOT_MESSAGE'
  | 'USER_MESSAGE'
  | 'CROSS_BOT_NOTIFY';

export interface AgentEvent {
  type: AgentEventType;
  payload: DeviceResultPayload | BotMessagePayload | UserMessagePayload | CrossBotNotifyPayload;
  timestamp: Date;
  source: {
    botId?: string;
    userId?: string;
    deviceId?: string;
  };
}

export interface DeviceResultPayload {
  commandId: string;
  command: string;
  status: 'success' | 'error';
  output?: string;
  error?: string;
  deviceId: string;
}

export interface BotMessagePayload {
  botId: string;
  botName: string;
  content: string;
  converseId: string;
}

export interface UserMessagePayload {
  userId: string;
  content: string;
  converseId: string;
}

export interface CrossBotNotifyPayload {
  fromBotId: string;
  fromBotName: string;
  event: string;
  data: Record<string, unknown>;
}
```

**Step 5: Create the barrel export**

```typescript
// apps/server/src/agents/interfaces/index.ts

export * from './agent.interface';
export * from './memory.interface';
export * from './workspace.interface';
export * from './events.interface';
```

**Step 6: Verify interfaces compile**

Run: `cd apps/server && pnpm tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add apps/server/src/agents/interfaces/
git commit -m "feat(agents): add Agent interface definitions"
```

---

## Task 2: Agent Memory Service

**Files:**
- Create: `apps/server/src/agents/core/memory.service.ts`
- Create: `apps/server/src/agents/core/memory.service.spec.ts`

**Step 1: Write the failing test**

```typescript
// apps/server/src/agents/core/memory.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { AgentMemoryService } from './memory.service';
import { MemoryEntry, CommandResult } from '../interfaces';

describe('AgentMemoryService', () => {
  let service: AgentMemoryService;
  let mockRedis: any;

  beforeEach(async () => {
    mockRedis = {
      lrange: jest.fn().mockResolvedValue([]),
      lpush: jest.fn().mockResolvedValue(1),
      ltrim: jest.fn().mockResolvedValue('OK'),
      expire: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentMemoryService,
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AgentMemoryService>(AgentMemoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getShortTermMemory', () => {
    it('should return empty array when no memory exists', async () => {
      mockRedis.lrange.mockResolvedValueOnce([]);
      const result = await service.getShortTermMemory('bot-123');
      expect(result).toEqual([]);
    });

    it('should return parsed memory entries', async () => {
      const entry = { role: 'user', content: 'Hello', timestamp: '2024-01-01T00:00:00Z' };
      mockRedis.lrange.mockResolvedValueOnce([JSON.stringify(entry)]);
      const result = await service.getShortTermMemory('bot-123');
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Hello');
    });
  });

  describe('addShortTermMemory', () => {
    it('should add entry and trim to limit', async () => {
      const entry: MemoryEntry = {
        role: 'user',
        content: 'Test',
        timestamp: new Date(),
      };
      await service.addShortTermMemory('bot-123', entry);
      expect(mockRedis.lpush).toHaveBeenCalled();
      expect(mockRedis.ltrim).toHaveBeenCalledWith(expect.any(String), 0, 19);
    });
  });

  describe('addCommandResult', () => {
    it('should add result to working memory', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        pendingActions: [],
        recentResults: [],
      }));

      const result: CommandResult = {
        commandId: 'cmd-1',
        command: 'ls -la',
        status: 'success',
        output: 'file1.txt',
        completedAt: new Date(),
      };

      await service.addCommandResult('bot-123', result);
      expect(mockRedis.set).toHaveBeenCalled();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/server && pnpm jest --testPathPattern="memory.service.spec" --no-coverage`
Expected: FAIL - Cannot find module './memory.service'

**Step 3: Write the implementation**

```typescript
// apps/server/src/agents/core/memory.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import {
  AgentMemory,
  MemoryEntry,
  WorkingMemory,
  CommandResult,
} from '../interfaces';

@Injectable()
export class AgentMemoryService {
  private readonly logger = new Logger(AgentMemoryService.name);
  private readonly SHORT_TERM_LIMIT = 20;

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async getShortTermMemory(botId: string): Promise<MemoryEntry[]> {
    const key = this.getShortTermKey(botId);
    const data = await this.redis.lrange(key, 0, this.SHORT_TERM_LIMIT - 1);
    return data.map((d) => this.parseEntry(d)).filter(Boolean) as MemoryEntry[];
  }

  async addShortTermMemory(botId: string, entry: MemoryEntry): Promise<void> {
    const key = this.getShortTermKey(botId);
    await this.redis.lpush(key, JSON.stringify(entry));
    await this.redis.ltrim(key, 0, this.SHORT_TERM_LIMIT - 1);
    await this.redis.expire(key, 86400); // 24 hours
  }

  async getWorkingMemory(botId: string): Promise<WorkingMemory> {
    const key = this.getWorkingKey(botId);
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : this.createEmptyWorkingMemory();
  }

  async updateWorkingMemory(botId: string, memory: WorkingMemory): Promise<void> {
    const key = this.getWorkingKey(botId);
    await this.redis.set(key, JSON.stringify(memory), 'EX', 86400);
  }

  async addCommandResult(botId: string, result: CommandResult): Promise<void> {
    const working = await this.getWorkingMemory(botId);
    working.recentResults.push(result);
    if (working.recentResults.length > 10) {
      working.recentResults = working.recentResults.slice(-10);
    }
    await this.updateWorkingMemory(botId, working);
  }

  async clearMemory(botId: string): Promise<void> {
    await this.redis.del(this.getShortTermKey(botId));
    await this.redis.del(this.getWorkingKey(botId));
  }

  private getShortTermKey(botId: string): string {
    return `agent:${botId}:memory:short`;
  }

  private getWorkingKey(botId: string): string {
    return `agent:${botId}:memory:working`;
  }

  private createEmptyWorkingMemory(): WorkingMemory {
    return {
      pendingActions: [],
      recentResults: [],
    };
  }

  private parseEntry(data: string): MemoryEntry | null {
    try {
      const parsed = JSON.parse(data);
      return {
        ...parsed,
        timestamp: new Date(parsed.timestamp),
      };
    } catch {
      return null;
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/server && pnpm jest --testPathPattern="memory.service.spec" --no-coverage`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add apps/server/src/agents/core/memory.service.ts apps/server/src/agents/core/memory.service.spec.ts
git commit -m "feat(agents): implement AgentMemoryService with Redis backing"
```

---

## Task 3: Agent Workspace Service

**Files:**
- Create: `apps/server/src/agents/core/workspace.service.ts`
- Create: `apps/server/src/agents/core/workspace.service.spec.ts`

**Step 1: Write the failing test**

```typescript
// apps/server/src/agents/core/workspace.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { AgentWorkspaceService } from './workspace.service';

describe('AgentWorkspaceService', () => {
  let service: AgentWorkspaceService;
  let mockRedis: any;

  beforeEach(async () => {
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentWorkspaceService,
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AgentWorkspaceService>(AgentWorkspaceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getState', () => {
    it('should return empty object when no state exists', async () => {
      const result = await service.getState('bot-123');
      expect(result).toEqual({});
    });

    it('should return parsed state', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({ foo: 'bar' }));
      const result = await service.getState('bot-123');
      expect(result).toEqual({ foo: 'bar' });
    });
  });

  describe('updateState', () => {
    it('should merge state updates', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({ a: 1 }));
      await service.updateState('bot-123', { b: 2 });
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify({ a: 1, b: 2 })
      );
    });
  });

  describe('getConfig', () => {
    it('should return default config when none exists', async () => {
      const result = await service.getConfig('bot-123');
      expect(result.language).toBe('zh-CN');
      expect(result.timezone).toBe('Asia/Shanghai');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/server && pnpm jest --testPathPattern="workspace.service.spec" --no-coverage`
Expected: FAIL - Cannot find module './workspace.service'

**Step 3: Write the implementation**

```typescript
// apps/server/src/agents/core/workspace.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AgentWorkspace, BotConfig } from '../interfaces';

@Injectable()
export class AgentWorkspaceService {
  private readonly logger = new Logger(AgentWorkspaceService.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async getState(botId: string): Promise<Record<string, unknown>> {
    const key = this.getStateKey(botId);
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : {};
  }

  async setState(botId: string, state: Record<string, unknown>): Promise<void> {
    const key = this.getStateKey(botId);
    await this.redis.set(key, JSON.stringify(state));
  }

  async updateState(botId: string, updates: Record<string, unknown>): Promise<void> {
    const current = await this.getState(botId);
    await this.setState(botId, { ...current, ...updates });
  }

  async getConfig(botId: string): Promise<BotConfig> {
    const key = this.getConfigKey(botId);
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : this.getDefaultConfig();
  }

  async setConfig(botId: string, config: Partial<BotConfig>): Promise<void> {
    const current = await this.getConfig(botId);
    const key = this.getConfigKey(botId);
    await this.redis.set(key, JSON.stringify({ ...current, ...config }));
  }

  async getSessionId(botId: string): Promise<string> {
    const key = this.getSessionKey(botId);
    let sessionId = await this.redis.get(key);
    if (!sessionId) {
      sessionId = `${botId}-${Date.now()}`;
      await this.redis.set(key, sessionId);
    }
    return sessionId;
  }

  async getWorkspace(botId: string): Promise<AgentWorkspace> {
    const [state, config, sessionId] = await Promise.all([
      this.getState(botId),
      this.getConfig(botId),
      this.getSessionId(botId),
    ]);

    return { state, config, sessionId };
  }

  private getStateKey(botId: string): string {
    return `agent:${botId}:workspace:state`;
  }

  private getConfigKey(botId: string): string {
    return `agent:${botId}:workspace:config`;
  }

  private getSessionKey(botId: string): string {
    return `agent:${botId}:workspace:session`;
  }

  private getDefaultConfig(): BotConfig {
    return {
      language: 'zh-CN',
      timezone: 'Asia/Shanghai',
      settings: {},
      allowedTools: [],
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/server && pnpm jest --testPathPattern="workspace.service.spec" --no-coverage`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add apps/server/src/agents/core/workspace.service.ts apps/server/src/agents/core/workspace.service.spec.ts
git commit -m "feat(agents): implement AgentWorkspaceService for state and config"
```

---

## Task 4: Base Agent Class

**Files:**
- Create: `apps/server/src/agents/core/base-agent.ts`

**Step 1: Write the base agent class**

```typescript
// apps/server/src/agents/core/base-agent.ts

import { Logger } from '@nestjs/common';
import {
  IAgent,
  AgentRole,
  AgentMemory,
  AgentWorkspace,
  AgentEvent,
  ConversationContext,
  AgentResponse,
  AgentTool,
} from '../interfaces';
import { AgentMemoryService } from './memory.service';
import { AgentWorkspaceService } from './workspace.service';
import { LlmRouterService } from '../../ai/services/llm-router.service';

export abstract class BaseAgent implements IAgent {
  abstract readonly id: string;
  abstract readonly botId: string;
  abstract readonly name: string;
  abstract readonly role: AgentRole;

  protected readonly logger: Logger;

  constructor(
    protected readonly memoryService: AgentMemoryService,
    protected readonly workspaceService: AgentWorkspaceService,
    protected readonly llmRouter: LlmRouterService,
  ) {
    this.logger = new Logger(this.constructor.name);
  }

  abstract handleEvent(events: AgentEvent[]): Promise<void>;
  abstract generateResponse(context: ConversationContext): Promise<AgentResponse>;

  async getMemory(): Promise<AgentMemory> {
    const [shortTerm, working] = await Promise.all([
      this.memoryService.getShortTermMemory(this.botId),
      this.memoryService.getWorkingMemory(this.botId),
    ]);

    return {
      shortTerm,
      working,
    };
  }

  async getWorkspace(): Promise<AgentWorkspace> {
    return this.workspaceService.getWorkspace(this.botId);
  }

  getTools(): AgentTool[] {
    return [];
  }

  protected async addToMemory(role: 'user' | 'agent' | 'system', content: string): Promise<void> {
    await this.memoryService.addShortTermMemory(this.botId, {
      role,
      content,
      timestamp: new Date(),
    });
  }
}
```

**Step 2: Verify it compiles**

Run: `cd apps/server && pnpm tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/server/src/agents/core/base-agent.ts
git commit -m "feat(agents): add BaseAgent abstract class"
```

---

## Task 5: Batch Trigger Service

**Files:**
- Create: `apps/server/src/agents/events/batch-trigger.service.ts`
- Create: `apps/server/src/agents/events/batch-trigger.service.spec.ts`

**Step 1: Write the failing test**

```typescript
// apps/server/src/agents/events/batch-trigger.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { BatchTriggerService } from './batch-trigger.service';
import { AgentOrchestratorService } from '../orchestrator/agent-orchestrator.service';
import { AgentEvent } from '../interfaces';

describe('BatchTriggerService', () => {
  let service: BatchTriggerService;
  let mockOrchestrator: any;

  beforeEach(async () => {
    mockOrchestrator = {
      dispatchEvent: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchTriggerService,
        { provide: AgentOrchestratorService, useValue: mockOrchestrator },
      ],
    }).compile();

    service = module.get<BatchTriggerService>(BatchTriggerService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addEvent', () => {
    it('should accumulate events for the same bot', () => {
      const event1: AgentEvent = {
        type: 'DEVICE_RESULT',
        payload: { commandId: '1', command: 'ls', status: 'success', deviceId: 'd1' },
        timestamp: new Date(),
        source: { userId: 'u1' },
      };
      const event2: AgentEvent = {
        type: 'DEVICE_RESULT',
        payload: { commandId: '2', command: 'pwd', status: 'success', deviceId: 'd1' },
        timestamp: new Date(),
        source: { userId: 'u1' },
      };

      service.addEvent('bot-1', event1);
      service.addEvent('bot-1', event2);

      // Events should be accumulated, not immediately dispatched
      expect(mockOrchestrator.dispatchEvent).not.toHaveBeenCalled();
    });

    it('should flush events immediately when called', async () => {
      const event: AgentEvent = {
        type: 'DEVICE_RESULT',
        payload: { commandId: '1', command: 'ls', status: 'success', deviceId: 'd1' },
        timestamp: new Date(),
        source: { userId: 'u1' },
      };

      service.addEvent('bot-1', event);
      await service.flushNow('bot-1');

      expect(mockOrchestrator.dispatchEvent).toHaveBeenCalledWith('bot-1', [event]);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/server && pnpm jest --testPathPattern="batch-trigger.service.spec" --no-coverage`
Expected: FAIL - Cannot find module './batch-trigger.service'

**Step 3: Write the implementation**

```typescript
// apps/server/src/agents/events/batch-trigger.service.ts

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { AgentOrchestratorService } from '../orchestrator/agent-orchestrator.service';
import { AgentEvent } from '../interfaces';

@Injectable()
export class BatchTriggerService implements OnModuleDestroy {
  private pendingEvents: Map<string, AgentEvent[]> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private readonly BATCH_WINDOW_MS = 5000;

  private readonly logger = new Logger(BatchTriggerService.name);

  constructor(private readonly orchestrator: AgentOrchestratorService) {}

  onModuleDestroy() {
    // Clear all timers on module destroy
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  addEvent(botId: string, event: AgentEvent): void {
    if (!this.pendingEvents.has(botId)) {
      this.pendingEvents.set(botId, []);
    }
    this.pendingEvents.get(botId)!.push(event);

    this.logger.debug(
      `Event added for ${botId}, total: ${this.pendingEvents.get(botId)!.length}`,
    );

    this.resetTimer(botId);
  }

  async flushNow(botId: string): Promise<void> {
    await this.flushEvents(botId);
  }

  private resetTimer(botId: string): void {
    if (this.timers.has(botId)) {
      clearTimeout(this.timers.get(botId)!);
    }

    this.timers.set(
      botId,
      setTimeout(() => {
        this.flushEvents(botId).catch((err) => {
          this.logger.error(`Failed to flush events for ${botId}:`, err);
        });
      }, this.BATCH_WINDOW_MS),
    );
  }

  private async flushEvents(botId: string): Promise<void> {
    const events = this.pendingEvents.get(botId);
    if (!events || events.length === 0) {
      return;
    }

    this.pendingEvents.delete(botId);
    this.timers.delete(botId);

    this.logger.log(`Flushing ${events.length} events for ${botId}`);

    try {
      await this.orchestrator.dispatchEvent(botId, events);
    } catch (error) {
      this.logger.error(`Failed to dispatch events for ${botId}:`, error);
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/server && pnpm jest --testPathPattern="batch-trigger.service.spec" --no-coverage`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add apps/server/src/agents/events/batch-trigger.service.ts apps/server/src/agents/events/batch-trigger.service.spec.ts
git commit -m "feat(agents): implement BatchTriggerService for event aggregation"
```

---

## Task 6: Agent Orchestrator Service

**Files:**
- Create: `apps/server/src/agents/orchestrator/agent-orchestrator.service.ts`
- Create: `apps/server/src/agents/orchestrator/agent-orchestrator.service.spec.ts`

**Step 1: Write the failing test**

```typescript
// apps/server/src/agents/orchestrator/agent-orchestrator.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { AgentMemoryService } from '../core/memory.service';
import { AgentWorkspaceService } from '../core/workspace.service';
import { LlmRouterService } from '../../ai/services/llm-router.service';
import { IAgent, AgentEvent } from '../interfaces';

describe('AgentOrchestratorService', () => {
  let service: AgentOrchestratorService;
  let mockMemoryService: any;
  let mockWorkspaceService: any;
  let mockLlmRouter: any;

  beforeEach(async () => {
    mockMemoryService = {
      getShortTermMemory: jest.fn().mockResolvedValue([]),
      getWorkingMemory: jest.fn().mockResolvedValue({ pendingActions: [], recentResults: [] }),
    };
    mockWorkspaceService = {
      getWorkspace: jest.fn().mockResolvedValue({ state: {}, config: {}, sessionId: 's1' }),
    };
    mockLlmRouter = {
      generate: jest.fn().mockResolvedValue({ text: 'OK' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentOrchestratorService,
        { provide: AgentMemoryService, useValue: mockMemoryService },
        { provide: AgentWorkspaceService, useValue: mockWorkspaceService },
        { provide: LlmRouterService, useValue: mockLlmRouter },
      ],
    }).compile();

    service = module.get<AgentOrchestratorService>(AgentOrchestratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerAgent', () => {
    it('should register an agent', () => {
      const mockAgent = createMockAgent('bot-1', 'Test Agent');
      service.registerAgent(mockAgent);
      expect(service.getAgent('bot-1')).toBe(mockAgent);
    });
  });

  describe('dispatchEvent', () => {
    it('should call handleEvent on registered agent', async () => {
      const mockAgent = createMockAgent('bot-1', 'Test Agent');
      service.registerAgent(mockAgent);

      const events: AgentEvent[] = [
        {
          type: 'DEVICE_RESULT',
          payload: { commandId: '1', command: 'ls', status: 'success', deviceId: 'd1' },
          timestamp: new Date(),
          source: { userId: 'u1' },
        },
      ];

      await service.dispatchEvent('bot-1', events);
      expect(mockAgent.handleEvent).toHaveBeenCalledWith(events);
    });

    it('should not throw when agent not found', async () => {
      await expect(service.dispatchEvent('unknown-bot', [])).resolves.not.toThrow();
    });
  });
});

function createMockAgent(botId: string, name: string): IAgent {
  return {
    id: `agent-${botId}`,
    botId,
    name,
    role: 'supervisor',
    handleEvent: jest.fn().mockResolvedValue(undefined),
    generateResponse: jest.fn().mockResolvedValue({ content: 'OK' }),
    getMemory: jest.fn().mockReturnValue({ shortTerm: [], working: { pendingActions: [], recentResults: [] } }),
    getWorkspace: jest.fn().mockReturnValue({ state: {}, config: {}, sessionId: 's1' }),
    getTools: jest.fn().mockReturnValue([]),
  };
}
```

**Step 2: Run test to verify it fails**

Run: `cd apps/server && pnpm jest --testPathPattern="agent-orchestrator.service.spec" --no-coverage`
Expected: FAIL - Cannot find module './agent-orchestrator.service'

**Step 3: Write the implementation**

```typescript
// apps/server/src/agents/orchestrator/agent-orchestrator.service.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { IAgent, AgentEvent } from '../interfaces';
import { AgentMemoryService } from '../core/memory.service';
import { AgentWorkspaceService } from '../core/workspace.service';
import { LlmRouterService } from '../../ai/services/llm-router.service';

@Injectable()
export class AgentOrchestratorService implements OnModuleInit {
  private agents: Map<string, IAgent> = new Map();
  private readonly logger = new Logger(AgentOrchestratorService.name);

  constructor(
    private readonly memoryService: AgentMemoryService,
    private readonly workspaceService: AgentWorkspaceService,
    private readonly llmRouter: LlmRouterService,
  ) {}

  async onModuleInit() {
    this.logger.log('AgentOrchestrator initialized');
    // Supervisor Agent will be registered later when its implementation is ready
  }

  registerAgent(agent: IAgent): void {
    this.agents.set(agent.botId, agent);
    this.logger.log(`Agent registered: ${agent.name} (${agent.botId})`);
  }

  unregisterAgent(botId: string): void {
    this.agents.delete(botId);
    this.logger.log(`Agent unregistered: ${botId}`);
  }

  getAgent(botId: string): IAgent | undefined {
    return this.agents.get(botId);
  }

  getAllAgents(): IAgent[] {
    return Array.from(this.agents.values());
  }

  async dispatchEvent(botId: string, events: AgentEvent[]): Promise<void> {
    const agent = this.agents.get(botId);
    if (!agent) {
      this.logger.warn(`Agent not found: ${botId}`);
      return;
    }

    this.logger.debug(`Dispatching ${events.length} events to ${agent.name}`);
    await agent.handleEvent(events);
  }

  async broadcast(events: AgentEvent[]): Promise<void> {
    const promises = this.getAllAgents().map((agent) =>
      agent.handleEvent(events).catch((err) => {
        this.logger.error(`Failed to dispatch to ${agent.name}:`, err);
      }),
    );
    await Promise.all(promises);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/server && pnpm jest --testPathPattern="agent-orchestrator.service.spec" --no-coverage`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add apps/server/src/agents/orchestrator/agent-orchestrator.service.ts apps/server/src/agents/orchestrator/agent-orchestrator.service.spec.ts
git commit -m "feat(agents): implement AgentOrchestratorService for agent coordination"
```

---

## Task 7: Supervisor Agent Implementation

**Files:**
- Create: `apps/server/src/agents/impl/supervisor.agent.ts`
- Create: `apps/server/src/agents/impl/supervisor.agent.spec.ts`

**Step 1: Write the failing test**

```typescript
// apps/server/src/agents/impl/supervisor.agent.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { SupervisorAgent } from './supervisor.agent';
import { AgentMemoryService } from '../core/memory.service';
import { AgentWorkspaceService } from '../core/workspace.service';
import { LlmRouterService } from '../../ai/services/llm-router.service';
import { MessagesService } from '../../messages/messages.service';
import { BroadcastService } from '../../gateway/broadcast.service';
import { BotsService } from '../../bots/bots.service';
import { AgentEvent } from '../interfaces';

describe('SupervisorAgent', () => {
  let agent: SupervisorAgent;
  let mockMemoryService: any;
  let mockWorkspaceService: any;
  let mockLlmRouter: any;
  let mockMessagesService: any;
  let mockBroadcastService: any;
  let mockBotsService: any;

  beforeEach(async () => {
    mockMemoryService = {
      getShortTermMemory: jest.fn().mockResolvedValue([]),
      getWorkingMemory: jest.fn().mockResolvedValue({ pendingActions: [], recentResults: [] }),
      addCommandResult: jest.fn().mockResolvedValue(undefined),
      addShortTermMemory: jest.fn().mockResolvedValue(undefined),
    };
    mockWorkspaceService = {
      getWorkspace: jest.fn().mockResolvedValue({ state: {}, config: {}, sessionId: 's1' }),
    };
    mockLlmRouter = {
      generate: jest.fn().mockResolvedValue({ text: '任务已完成' }),
    };
    mockMessagesService = {
      create: jest.fn().mockResolvedValue({ id: 'msg-1', createdAt: new Date() }),
    };
    mockBroadcastService = {
      toRoom: jest.fn().mockResolvedValue(undefined),
    };
    mockBotsService = {
      getOrCreateSupervisorConverse: jest.fn().mockResolvedValue({ id: 'converse-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupervisorAgent,
        { provide: AgentMemoryService, useValue: mockMemoryService },
        { provide: AgentWorkspaceService, useValue: mockWorkspaceService },
        { provide: LlmRouterService, useValue: mockLlmRouter },
        { provide: MessagesService, useValue: mockMessagesService },
        { provide: BroadcastService, useValue: mockBroadcastService },
        { provide: BotsService, useValue: mockBotsService },
      ],
    }).compile();

    agent = module.get<SupervisorAgent>(SupervisorAgent);
  });

  it('should be defined', () => {
    expect(agent).toBeDefined();
  });

  describe('handleEvent', () => {
    it('should add command results to memory', async () => {
      const events: AgentEvent[] = [
        {
          type: 'DEVICE_RESULT',
          payload: { commandId: 'cmd-1', command: 'ls', status: 'success', deviceId: 'd1' },
          timestamp: new Date(),
          source: { userId: 'u1' },
        },
      ];

      await agent.handleEvent(events);
      expect(mockMemoryService.addCommandResult).toHaveBeenCalled();
    });

    it('should generate and send notification', async () => {
      mockMemoryService.getWorkingMemory.mockResolvedValue({
        pendingActions: [],
        recentResults: [
          { commandId: 'cmd-1', command: 'ls', status: 'success', completedAt: new Date() },
        ],
      });

      const events: AgentEvent[] = [
        {
          type: 'DEVICE_RESULT',
          payload: { commandId: 'cmd-1', command: 'ls', status: 'success', deviceId: 'd1' },
          timestamp: new Date(),
          source: { userId: 'u1' },
        },
      ];

      await agent.handleEvent(events);
      expect(mockLlmRouter.generate).toHaveBeenCalled();
    });
  });

  describe('generateResponse', () => {
    it('should return LLM-generated content', async () => {
      mockMemoryService.getWorkingMemory.mockResolvedValue({
        pendingActions: [],
        recentResults: [
          { commandId: 'cmd-1', command: 'ls', status: 'success', completedAt: new Date() },
        ],
      });

      const response = await agent.generateResponse({ userId: 'u1' });
      expect(response.content).toBe('任务已完成');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/server && pnpm jest --testPathPattern="supervisor.agent.spec" --no-coverage`
Expected: FAIL - Cannot find module './supervisor.agent'

**Step 3: Write the implementation**

```typescript
// apps/server/src/agents/impl/supervisor.agent.ts

import { Injectable, Logger } from '@nestjs/common';
import { BaseAgent } from '../core/base-agent';
import { AgentMemoryService } from '../core/memory.service';
import { AgentWorkspaceService } from '../core/workspace.service';
import { LlmRouterService } from '../../ai/services/llm-router.service';
import { MessagesService } from '../../messages/messages.service';
import { BroadcastService } from '../../gateway/broadcast.service';
import { BotsService } from '../../bots/bots.service';
import {
  AgentEvent,
  AgentResponse,
  AgentAction,
  ConversationContext,
  DeviceResultPayload,
  CommandResult,
} from '../interfaces';

@Injectable()
export class SupervisorAgent extends BaseAgent {
  readonly id = 'supervisor-agent';
  readonly botId = 'supervisor-bot'; // Will be set at runtime
  readonly name = 'Supervisor';
  readonly role = 'supervisor' as const;

  private readonly logger = new Logger(SupervisorAgent.name);

  constructor(
    memoryService: AgentMemoryService,
    workspaceService: AgentWorkspaceService,
    llmRouter: LlmRouterService,
    private readonly messagesService: MessagesService,
    private readonly broadcastService: BroadcastService,
    private readonly botsService: BotsService,
  ) {
    super(memoryService, workspaceService, llmRouter);
  }

  async handleEvent(events: AgentEvent[]): Promise<void> {
    this.logger.log(`Supervisor handling ${events.length} events`);

    // Update working memory with command results
    for (const event of events) {
      if (event.type === 'DEVICE_RESULT') {
        const payload = event.payload as DeviceResultPayload;
        await this.memoryService.addCommandResult(this.botId, {
          commandId: payload.commandId,
          command: payload.command,
          status: payload.status,
          output: payload.output,
          error: payload.error,
          completedAt: event.timestamp,
        });
      }
    }

    // Generate response
    const userId = events[0]?.source.userId;
    if (!userId) {
      this.logger.warn('No userId in events, skipping notification');
      return;
    }

    const response = await this.generateResponse({ events, userId });
    await this.sendNotification(response, userId);
  }

  async generateResponse(context: ConversationContext): Promise<AgentResponse> {
    const working = await this.memoryService.getWorkingMemory(this.botId);
    const results = working.recentResults;

    if (results.length === 0) {
      return { content: '没有新的任务完成。' };
    }

    const prompt = this.buildPrompt(results);
    const llmResponse = await this.llmRouter.generate(prompt, {
      model: 'deepseek-chat',
      maxTokens: 200,
    });

    const actions = this.generateActions(results);

    return {
      content: llmResponse.text,
      actions,
    };
  }

  private buildPrompt(results: CommandResult[]): string {
    const tasksSummary = results
      .map((r, i) => {
        const status = r.status === 'success' ? '✅' : '❌';
        return `${i + 1}. ${status} ${r.command} - ${r.status}`;
      })
      .join('\n');

    return `
你是一个智能助手 Supervisor，负责汇总并通知用户其他 Agent 的活动状态。

最近完成的任务:
${tasksSummary}

请生成一条简洁的通知消息（不超过 50 字），告知用户这些任务的完成情况。
要求:
- 如果只有一个任务，直接说明完成情况
- 如果有多个任务，总结为"完成了 N 个任务"
- 语气友好、简洁
- 使用中文
    `.trim();
  }

  private generateActions(results: CommandResult[]): AgentAction[] {
    return results
      .filter((r) => r.status === 'success')
      .slice(0, 3)
      .map((r) => ({
        type: 'view' as const,
        label: '查看详情',
        target: 'coding-bot',
        data: { commandId: r.commandId },
      }));
  }

  private async sendNotification(
    response: AgentResponse,
    userId: string,
  ): Promise<void> {
    try {
      // Get or create Supervisor's DM Converse
      const converse = await this.botsService.getOrCreateSupervisorConverse(userId);

      // Create message
      const message = await this.messagesService.create({
        converseId: converse.id,
        senderId: this.botId,
        content: response.content,
        metadata: {
          type: 'BOT_NOTIFICATION',
          actions: response.actions,
        },
      });

      // Push notification via WebSocket
      await this.broadcastService.toRoom(`u-${userId}`, 'bot:notification', {
        messageId: message.id,
        converseId: converse.id,
        fromBotId: this.botId,
        fromBotName: this.name,
        content: response.content,
        actions: response.actions,
        createdAt: message.createdAt.toISOString(),
      });

      this.logger.log(`Notification sent to user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to send notification:`, error);
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/server && pnpm jest --testPathPattern="supervisor.agent.spec" --no-coverage`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add apps/server/src/agents/impl/supervisor.agent.ts apps/server/src/agents/impl/supervisor.agent.spec.ts
git commit -m "feat(agents): implement SupervisorAgent with LLM-driven notifications"
```

---

## Task 8: Bot Event Listener

**Files:**
- Create: `apps/server/src/agents/events/bot-event.listener.ts`
- Modify: `apps/server/src/gateway/device.gateway.ts` (add event emission)

**Step 1: Write the event listener**

```typescript
// apps/server/src/agents/events/bot-event.listener.ts

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BatchTriggerService } from './batch-trigger.service';
import { BotsService } from '../../bots/bots.service';
import { AgentEvent } from '../interfaces';

export interface DeviceResultEvent {
  userId: string;
  commandId: string;
  command: string;
  status: 'success' | 'error';
  output?: string;
  error?: string;
  deviceId: string;
}

@Injectable()
export class BotEventListener {
  private readonly logger = new Logger(BotEventListener.name);

  constructor(
    private readonly batchTrigger: BatchTriggerService,
    private readonly botsService: BotsService,
  ) {}

  @OnEvent('device.result.complete')
  async handleDeviceResultComplete(payload: DeviceResultEvent): Promise<void> {
    this.logger.debug(
      `Received device:result:complete for command ${payload.commandId}`,
    );

    // Get Supervisor Bot for this user
    const supervisorBot = await this.botsService.findSupervisorByUserId(
      payload.userId,
    );
    if (!supervisorBot) {
      this.logger.warn(`No Supervisor Bot found for user ${payload.userId}`);
      return;
    }

    // Construct Agent event
    const event: AgentEvent = {
      type: 'DEVICE_RESULT',
      payload: {
        commandId: payload.commandId,
        command: payload.command,
        status: payload.status,
        output: payload.output,
        error: payload.error,
        deviceId: payload.deviceId,
      },
      timestamp: new Date(),
      source: {
        userId: payload.userId,
        deviceId: payload.deviceId,
      },
    };

    // Add to batch trigger
    this.batchTrigger.addEvent(supervisorBot.id, event);
  }
}
```

**Step 2: Add event emission to DeviceGateway**

Find the `handleResultComplete` method in `device.gateway.ts` and add event emission:

```typescript
// In device.gateway.ts, add at the top:
import { EventEmitter2 } from '@nestjs/event-emitter';

// In the constructor, add:
constructor(
  // ... existing dependencies
  private readonly eventEmitter: EventEmitter2,
) {}

// In handleResultComplete, after existing logic, add:
async handleResultComplete(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: ResultCompletePayload,
): Promise<void> {
  // ... existing logic ...

  // Emit event for Agent system
  this.eventEmitter.emit('device.result.complete', {
    userId: socketData.userId,
    commandId: payload.commandId,
    command: payload.command,
    status: payload.status,
    output: payload.output,
    error: payload.error,
    deviceId: socketData.deviceId,
  });
}
```

**Step 3: Verify it compiles**

Run: `cd apps/server && pnpm tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/server/src/agents/events/bot-event.listener.ts apps/server/src/gateway/device.gateway.ts
git commit -m "feat(agents): add BotEventListener for device result events"
```

---

## Task 9: Agents Module

**Files:**
- Create: `apps/server/src/agents/agents.module.ts`
- Create: `apps/server/src/agents/index.ts`
- Modify: `apps/server/src/app.module.ts` (import AgentsModule)

**Step 1: Create the module**

```typescript
// apps/server/src/agents/agents.module.ts

import { Module, OnModuleInit } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { RedisModule } from '../redis/redis.module';
import { AiModule } from '../ai/ai.module';
import { BotsModule } from '../bots/bots.module';
import { MessagesModule } from '../messages/messages.module';
import { GatewayModule } from '../gateway/gateway.module';

// Core
import { AgentMemoryService } from './core/memory.service';
import { AgentWorkspaceService } from './core/workspace.service';

// Orchestrator
import { AgentOrchestratorService } from './orchestrator/agent-orchestrator.service';

// Events
import { BatchTriggerService } from './events/batch-trigger.service';
import { BotEventListener } from './events/bot-event.listener';

// Agents
import { SupervisorAgent } from './impl/supervisor.agent';

@Module({
  imports: [
    RedisModule,
    AiModule,
    BotsModule,
    MessagesModule,
    GatewayModule,
    EventEmitterModule.forRoot(),
  ],
  providers: [
    // Core
    AgentMemoryService,
    AgentWorkspaceService,

    // Orchestrator
    AgentOrchestratorService,

    // Events
    BatchTriggerService,
    BotEventListener,

    // Agents
    SupervisorAgent,
  ],
  exports: [
    AgentOrchestratorService,
    AgentMemoryService,
    AgentWorkspaceService,
  ],
})
export class AgentsModule implements OnModuleInit {
  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    private readonly supervisorAgent: SupervisorAgent,
  ) {}

  onModuleInit() {
    // Register Supervisor Agent
    this.orchestrator.registerAgent(this.supervisorAgent);
  }
}
```

**Step 2: Create barrel export**

```typescript
// apps/server/src/agents/index.ts

export * from './interfaces';
export * from './agents.module';
export * from './core/memory.service';
export * from './core/workspace.service';
export * from './orchestrator/agent-orchestrator.service';
export * from './impl/supervisor.agent';
```

**Step 3: Add to App Module**

```typescript
// In app.module.ts, add to imports:
import { AgentsModule } from './agents/agents.module';

@Module({
  imports: [
    // ... existing imports
    AgentsModule,
  ],
})
export class AppModule {}
```

**Step 4: Verify it compiles**

Run: `cd apps/server && pnpm tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add apps/server/src/agents/agents.module.ts apps/server/src/agents/index.ts apps/server/src/app.module.ts
git commit -m "feat(agents): create AgentsModule and integrate with AppModule"
```

---

## Task 10: Add BotsService Helper Methods

**Files:**
- Modify: `apps/server/src/bots/bots.service.ts`

**Step 1: Add helper methods to BotsService**

```typescript
// Add these methods to bots.service.ts

async findSupervisorByUserId(userId: string): Promise<Bot | null> {
  return this.prisma.bot.findFirst({
    where: {
      ownerId: userId,
      type: 'supervisor',
    },
  });
}

async getOrCreateSupervisorConverse(userId: string): Promise<Converse> {
  const supervisorBot = await this.findSupervisorByUserId(userId);
  if (!supervisorBot) {
    throw new Error('Supervisor bot not found for user');
  }

  // Find existing DM converse
  let converse = await this.prisma.converse.findFirst({
    where: {
      type: 'BOT',
      members: {
        some: {
          userId: userId,
        },
      },
      AND: {
        members: {
          some: {
            userId: supervisorBot.id,
          },
        },
      },
    },
  });

  if (!converse) {
    // Create new DM converse
    converse = await this.prisma.converse.create({
      data: {
        type: 'BOT',
        members: {
          create: [
            { userId, role: 'MEMBER' },
            { userId: supervisorBot.id, role: 'MEMBER' },
          ],
        },
      },
    });
  }

  return converse;
}
```

**Step 2: Verify it compiles**

Run: `cd apps/server && pnpm tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/server/src/bots/bots.service.ts
git commit -m "feat(bots): add findSupervisorByUserId and getOrCreateSupervisorConverse"
```

---

## Task 11: Run All Tests

**Step 1: Run the full test suite**

Run: `cd apps/server && pnpm test`
Expected: All tests pass

**Step 2: Run type check**

Run: `cd apps/server && pnpm tsc --noEmit`
Expected: No errors

**Step 3: Run lint**

Run: `cd apps/server && pnpm lint`
Expected: No errors (fix if needed)

---

## Task 12: Final Commit and Summary

**Step 1: Ensure all changes are committed**

```bash
git status
git add -A
git commit -m "feat(agents): complete Phase 6 Agent Architecture implementation

- Add Agent interface definitions (IAgent, AgentMemory, AgentWorkspace)
- Implement AgentMemoryService with Redis backing
- Implement AgentWorkspaceService for state and config
- Add BaseAgent abstract class
- Implement BatchTriggerService for 5-second event aggregation
- Implement AgentOrchestratorService for agent coordination
- Implement SupervisorAgent with LLM-driven notifications
- Add BotEventListener for device result events
- Create AgentsModule and integrate with AppModule
- Add BotsService helper methods for supervisor bot lookup

Phase 6 establishes the foundation for modular agent architecture."
```

**Step 2: Update design document status**

```bash
# Update the status in docs/plans/2026-02-28-phase6-agent-design.md
# Change: 状态: 📝 设计完成，待实施
# To: 状态: ✅ 实现完成
```

---

## Summary

| Task | Description | Files Created/Modified |
|------|-------------|------------------------|
| 1 | Agent Interfaces | 5 new files |
| 2 | Memory Service | 2 new files |
| 3 | Workspace Service | 2 new files |
| 4 | Base Agent | 1 new file |
| 5 | Batch Trigger | 2 new files |
| 6 | Orchestrator | 2 new files |
| 7 | Supervisor Agent | 2 new files |
| 8 | Event Listener | 1 new, 1 modified |
| 9 | Module Setup | 2 new, 1 modified |
| 10 | BotsService Helpers | 1 modified |
| 11 | Tests | - |
| 12 | Final Commit | - |

**Total: ~18 new files, 3 modified files**
