# Phase 6: Agent 架构 + Supervisor 通知聚合设计文档

> 创建日期: 2026-02-28
> 更新日期: 2026-03-01
> 状态: ✅ 实现完成
> 作者: CTO (Claude)

## 1. 背景

Phase 6 原始需求是 "Supervisor 通知汇总"，但在架构调研中发现更重要的设计方向：

**核心洞察：Linking Chat 中不同的好友（Bot）就是不同的 Agent，每个 Agent 有自己的 workspace、memory 等，可以独立运行。**

因此，Phase 6 不仅仅是通知聚合，而是 **Agent 架构的基础设施搭建**。

### 1.1 设计原则

- **Agent 独立性**：每个 Bot 是独立的 Agent，有独立的记忆和工作空间
- **LLM 驱动**：消息生成由 LLM 完成，而非硬编码模板
- **批量优化**：5 秒窗口批量聚合事件，减少 LLM 调用成本
- **渐进式实现**：先搭建基础设施，后续逐步扩展

### 1.2 与现有架构的关系

```
现有架构 (Sprint 2-3):
├── bots/                    # Bot CRUD + 通信
│   ├── bots.service.ts      # Bot 创建、查询
│   ├── bot-init.service.ts  # Bot 初始化
│   └── bot-communication.service.ts  # Bot 间通信

新增架构 (Phase 6):
├── agents/                  # Agent 架构
│   ├── interfaces/          # 接口定义
│   ├── core/                # 基础服务
│   ├── orchestrator/        # 协调器
│   ├── impl/                # Agent 实现
│   └── events/              # 事件处理

关系：Bot = 数据模型，Agent = 智能实体
每个 Bot 对应一个 Agent 实例，Agent 持有 Bot 的智能能力
```

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Agent Architecture                              │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     AgentOrchestrator                           │   │
│  │  - dispatchEvent(agentId, events[]): Promise<void>             │   │
│  │  - getAgent(botId): IAgent                                      │   │
│  │  - registerAgent(agent: IAgent): void                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                   │                                      │
│         ┌─────────────────────────┼─────────────────────────┐           │
│         │                         │                         │           │
│  ┌──────▼──────┐  ┌───────────────▼───────────────┐  ┌──────▼──────┐   │
│  │ Supervisor  │  │         Coding Agent          │  │  Future     │   │
│  │   Agent     │  │                               │  │  Agent      │   │
│  ├─────────────┤  ├───────────────────────────────┤  ├─────────────┤   │
│  │ Memory      │  │ Memory                        │  │ Memory      │   │
│  │ ├─ Short    │  │ ├─ Short (当前对话)           │  │ ├─ Short    │   │
│  │ ├─ Long     │  │ ├─ Long (持久化记忆)          │  │ ├─ Long     │   │
│  │ └─ Working  │  │ └─ Working (任务上下文)       │  │ └─ Working  │   │
│  ├─────────────┤  ├───────────────────────────────┤  ├─────────────┤   │
│  │ Workspace   │  │ Workspace                     │  │ Workspace   │   │
│  │ ├─ State    │  │ ├─ State (命令历史)           │  │ ├─ State    │   │
│  │ └─ Config   │  │ └─ Config (项目路径等)        │  │ └─ Config   │   │
│  ├─────────────┤  ├───────────────────────────────┤  ├─────────────┤   │
│  │ Tools       │  │ Tools                         │  │ Tools       │   │
│  │ └─ Notify   │  │ ├─ ShellExecute               │  │ └─ ...      │   │
│  │             │  │ ├─ FileRead                   │  │             │   │
│  │             │  │ └─ CodeAnalyze                │  │             │   │
│  └─────────────┘  └───────────────────────────────┘  └─────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
事件源                         处理流程                           输出
───────                       ─────────                        ──────

device:result:complete   ──→  BotEventListener 捕获
                              ↓
                         ──→  BatchTriggerService (5s 窗口)
                              ↓
                         ──→  AgentOrchestrator.dispatchEvent()
                              ↓
                         ──→  SupervisorAgent.handleEvent()
                              │
                              ├─→ Memory.working.recentResults 更新
                              │
                              └─→ generateResponse()
                                   │
                                   ├─→ LLM 生成通知消息
                                   │
                                   └─→ 返回 { content, actions }
                                        ↓
                              ──→ MessageService 创建消息
                                        ↓
                              ──→ BroadcastService 推送
                                        ↓
                                   bot:notification → u-{userId}
```

## 3. 核心接口

### 3.1 Agent 接口

```typescript
// agents/interfaces/agent.interface.ts

export type AgentRole = 'supervisor' | 'coding' | 'social' | 'custom';

export interface IAgent {
  // 身份
  readonly id: string;           // Agent 实例 ID
  readonly botId: string;        // 对应的 Bot ID
  readonly name: string;         // 显示名称
  readonly role: AgentRole;      // 角色类型

  // 核心能力
  handleEvent(events: AgentEvent[]): Promise<void>;
  generateResponse(context: ConversationContext): Promise<AgentResponse>;

  // 状态访问
  getMemory(): AgentMemory;
  getWorkspace(): AgentWorkspace;

  // 工具
  getTools(): AgentTool[];
}

export interface AgentResponse {
  content: string;               // 消息内容
  actions?: AgentAction[];       // 可选的操作建议
  metadata?: Record<string, unknown>;
}

export interface AgentAction {
  type: 'view' | 'execute' | 'navigate';
  label: string;
  target: string;                // Bot ID 或 URL
  data?: Record<string, unknown>;
}
```

### 3.2 记忆接口

```typescript
// agents/interfaces/memory.interface.ts

export interface AgentMemory {
  // 短期记忆（当前会话，最近 N 条消息）
  shortTerm: MemoryEntry[];

  // 长期记忆（向量存储，语义检索）- Phase 6 后续扩展
  longTerm?: LongTermMemoryStore;

  // 工作记忆（当前任务相关）
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

export interface CommandResult {
  commandId: string;
  command: string;
  status: 'success' | 'error';
  output?: string;
  error?: string;
  completedAt: Date;
}
```

### 3.3 工作空间接口

```typescript
// agents/interfaces/workspace.interface.ts

export interface AgentWorkspace {
  // 状态存储（KV 形式）
  state: Record<string, unknown>;

  // 配置（Bot 特有的配置项）
  config: BotConfig;

  // 会话 ID（用于隔离）
  sessionId: string;
}

export interface BotConfig {
  // 通用配置
  language: string;
  timezone: string;

  // Agent 特定配置
  settings: Record<string, unknown>;

  // 工具权限
  allowedTools: string[];
}
```

### 3.4 事件接口

```typescript
// agents/interfaces/events.interface.ts

export type AgentEventType =
  | 'DEVICE_RESULT'      // 设备命令执行结果
  | 'BOT_MESSAGE'        // Bot 发送的消息
  | 'USER_MESSAGE'       // 用户发送的消息
  | 'CROSS_BOT_NOTIFY';  // 跨 Bot 通知

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

// 具体 Payload 类型
export interface DeviceResultPayload {
  commandId: string;
  command: string;
  status: 'success' | 'error';
  output?: string;
  error?: string;
  deviceId: string;
}

export interface CrossBotNotifyPayload {
  fromBotId: string;
  fromBotName: string;
  event: string;
  data: Record<string, unknown>;
}
```

## 4. 核心服务

### 4.1 Agent 协调器

```typescript
// agents/orchestrator/agent-orchestrator.service.ts

@Injectable()
export class AgentOrchestratorService implements OnModuleInit {
  private agents: Map<string, IAgent> = new Map();
  private logger = new Logger(AgentOrchestratorService.name);

  constructor(
    private readonly memoryService: AgentMemoryService,
    private readonly workspaceService: AgentWorkspaceService,
    private readonly llmRouter: LlmRouterService,
  ) {}

  async onModuleInit() {
    // 初始化时注册 Supervisor Agent
    await this.initializeSupervisorAgent();
  }

  registerAgent(agent: IAgent): void {
    this.agents.set(agent.botId, agent);
    this.logger.log(`Agent registered: ${agent.name} (${agent.botId})`);
  }

  getAgent(botId: string): IAgent | undefined {
    return this.agents.get(botId);
  }

  async dispatchEvent(botId: string, events: AgentEvent[]): Promise<void> {
    const agent = this.agents.get(botId);
    if (!agent) {
      this.logger.warn(`Agent not found: ${botId}`);
      return;
    }

    await agent.handleEvent(events);
  }

  private async initializeSupervisorAgent(): Promise<void> {
    // 获取 Supervisor Bot 信息
    // 创建并注册 Supervisor Agent
  }
}
```

### 4.2 记忆服务

```typescript
// agents/core/memory.service.ts

@Injectable()
export class AgentMemoryService {
  private readonly SHORT_TERM_LIMIT = 20;  // 保留最近 20 条消息

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async getShortTermMemory(botId: string): Promise<MemoryEntry[]> {
    const key = `agent:${botId}:memory:short`;
    const data = await this.redis.lrange(key, 0, this.SHORT_TERM_LIMIT - 1);
    return data.map(d => JSON.parse(d));
  }

  async addShortTermMemory(botId: string, entry: MemoryEntry): Promise<void> {
    const key = `agent:${botId}:memory:short`;
    await this.redis.lpush(key, JSON.stringify(entry));
    await this.redis.ltrim(key, 0, this.SHORT_TERM_LIMIT - 1);
    await this.redis.expire(key, 86400); // 24 小时过期
  }

  async getWorkingMemory(botId: string): Promise<WorkingMemory> {
    const key = `agent:${botId}:memory:working`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : this.createEmptyWorkingMemory();
  }

  async updateWorkingMemory(botId: string, memory: WorkingMemory): Promise<void> {
    const key = `agent:${botId}:memory:working`;
    await this.redis.set(key, JSON.stringify(memory), 'EX', 86400);
  }

  async addCommandResult(botId: string, result: CommandResult): Promise<void> {
    const working = await this.getWorkingMemory(botId);
    working.recentResults.push(result);
    // 保留最近 10 条结果
    if (working.recentResults.length > 10) {
      working.recentResults = working.recentResults.slice(-10);
    }
    await this.updateWorkingMemory(botId, working);
  }

  private createEmptyWorkingMemory(): WorkingMemory {
    return {
      pendingActions: [],
      recentResults: [],
    };
  }
}
```

### 4.3 工作空间服务

```typescript
// agents/core/workspace.service.ts

@Injectable()
export class AgentWorkspaceService {
  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async getState(botId: string): Promise<Record<string, unknown>> {
    const key = `agent:${botId}:workspace:state`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : {};
  }

  async setState(botId: string, state: Record<string, unknown>): Promise<void> {
    const key = `agent:${botId}:workspace:state`;
    await this.redis.set(key, JSON.stringify(state));
  }

  async updateState(botId: string, updates: Record<string, unknown>): Promise<void> {
    const current = await this.getState(botId);
    await this.setState(botId, { ...current, ...updates });
  }

  async getConfig(botId: string): Promise<BotConfig> {
    const key = `agent:${botId}:workspace:config`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : this.getDefaultConfig();
  }

  async setConfig(botId: string, config: Partial<BotConfig>): Promise<void> {
    const current = await this.getConfig(botId);
    const key = `agent:${botId}:workspace:config`;
    await this.redis.set(key, JSON.stringify({ ...current, ...config }));
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

### 4.4 批量触发服务

```typescript
// agents/events/batch-trigger.service.ts

@Injectable()
export class BatchTriggerService {
  private pendingEvents: Map<string, AgentEvent[]> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private readonly BATCH_WINDOW_MS = 5000; // 5 秒批量窗口

  private logger = new Logger(BatchTriggerService.name);

  constructor(
    private readonly orchestrator: AgentOrchestratorService,
  ) {}

  addEvent(botId: string, event: AgentEvent): void {
    // 累积事件
    if (!this.pendingEvents.has(botId)) {
      this.pendingEvents.set(botId, []);
    }
    this.pendingEvents.get(botId)!.push(event);

    this.logger.debug(`Event added for ${botId}, total: ${this.pendingEvents.get(botId)!.length}`);

    // 重置/启动批量计时器
    this.resetTimer(botId);
  }

  private resetTimer(botId: string): void {
    // 清除现有计时器
    if (this.timers.has(botId)) {
      clearTimeout(this.timers.get(botId)!);
    }

    // 设置新计时器
    this.timers.set(botId, setTimeout(() => {
      this.flushEvents(botId);
    }, this.BATCH_WINDOW_MS));
  }

  private async flushEvents(botId: string): Promise<void> {
    const events = this.pendingEvents.get(botId);
    if (!events || events.length === 0) {
      return;
    }

    // 清理状态
    this.pendingEvents.delete(botId);
    this.timers.delete(botId);

    this.logger.log(`Flushing ${events.length} events for ${botId}`);

    // 触发 Agent 处理
    try {
      await this.orchestrator.dispatchEvent(botId, events);
    } catch (error) {
      this.logger.error(`Failed to dispatch events for ${botId}:`, error);
    }
  }
}
```

### 4.5 事件监听器

```typescript
// agents/events/bot-event.listener.ts

@WebSocketGateway({ namespace: '/device' })
export class BotEventListener implements OnGatewayConnection {
  private logger = new Logger(BotEventListener.name);

  constructor(
    private readonly batchTrigger: BatchTriggerService,
    private readonly botsService: BotsService,
  ) {}

  @SubscribeMessage('device:result:complete')
  async handleDeviceResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: DeviceResultCompletePayload,
  ): Promise<void> {
    this.logger.debug(`Received device:result:complete for command ${payload.commandId}`);

    // 查找对应的 Bot（根据设备所属用户）
    const bot = await this.botsService.findCodingBotByUserId(payload.userId);
    if (!bot) {
      this.logger.warn(`No Coding Bot found for user ${payload.userId}`);
      return;
    }

    // 构造事件
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

    // 同时通知 Supervisor Agent
    const supervisorBot = await this.botsService.findSupervisorByUserId(payload.userId);
    if (supervisorBot) {
      this.batchTrigger.addEvent(supervisorBot.id, event);
    }
  }
}
```

## 5. Supervisor Agent 实现

### 5.1 基类

```typescript
// agents/core/base-agent.ts

export abstract class BaseAgent implements IAgent {
  abstract readonly id: string;
  abstract readonly botId: string;
  abstract readonly name: string;
  abstract readonly role: AgentRole;

  constructor(
    protected readonly memoryService: AgentMemoryService,
    protected readonly workspaceService: AgentWorkspaceService,
    protected readonly llmRouter: LlmRouterService,
  ) {}

  abstract handleEvent(events: AgentEvent[]): Promise<void>;
  abstract generateResponse(context: ConversationContext): Promise<AgentResponse>;

  getMemory(): AgentMemory {
    // 返回内存中的缓存或从服务获取
    return {
      shortTerm: [],
      working: { pendingActions: [], recentResults: [] },
    };
  }

  getWorkspace(): AgentWorkspace {
    return {
      state: {},
      config: { language: 'zh-CN', timezone: 'Asia/Shanghai', settings: {}, allowedTools: [] },
      sessionId: '',
    };
  }

  getTools(): AgentTool[] {
    return [];
  }
}
```

### 5.2 Supervisor Agent

```typescript
// agents/impl/supervisor.agent.ts

@Injectable()
export class SupervisorAgent extends BaseAgent implements IAgent {
  readonly id = 'supervisor-agent';
  readonly botId: string;  // 运行时从数据库获取
  readonly name = 'Supervisor';
  readonly role: AgentRole = 'supervisor';

  private logger = new Logger(SupervisorAgent.name);

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

    // 更新工作记忆
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

    // 生成响应
    const response = await this.generateResponse({
      events,
      userId: events[0]?.source.userId,
    });

    // 创建消息并发送
    await this.sendNotification(response, events[0]?.source.userId);
  }

  async generateResponse(context: ConversationContext): Promise<AgentResponse> {
    const working = await this.memoryService.getWorkingMemory(this.botId);
    const results = working.recentResults;

    // 构造 LLM Prompt
    const prompt = this.buildPrompt(results);

    // 调用 LLM（使用 DeepSeek 降低成本）
    const llmResponse = await this.llmRouter.generate(prompt, {
      model: 'deepseek-chat',
      maxTokens: 200,
    });

    // 生成操作按钮
    const actions = this.generateActions(results);

    return {
      content: llmResponse.text,
      actions,
    };
  }

  private buildPrompt(results: CommandResult[]): string {
    if (results.length === 0) {
      return '没有新的任务完成。';
    }

    const tasksSummary = results.map((r, i) => {
      const status = r.status === 'success' ? '✅' : '❌';
      return `${i + 1}. ${status} ${r.command} - ${r.status}`;
    }).join('\n');

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
    // 去重，获取涉及的 Bot
    const botIds = new Set<string>();

    return results
      .filter(r => r.status === 'success')
      .slice(0, 3)
      .map(r => ({
        type: 'view' as const,
        label: '查看详情',
        target: 'coding-bot', // 跳转到 Coding Bot
        data: { commandId: r.commandId },
      }));
  }

  private async sendNotification(response: AgentResponse, userId: string): Promise<void> {
    // 获取 Supervisor 的 DM Converse
    const converse = await this.botsService.getOrCreateSupervisorConverse(userId);

    // 创建消息
    const message = await this.messagesService.create({
      converseId: converse.id,
      senderId: this.botId,
      content: response.content,
      metadata: {
        type: 'BOT_NOTIFICATION',
        actions: response.actions,
      },
    });

    // 推送通知
    await this.broadcastService.toRoom(`u-${userId}`, 'bot:notification', {
      messageId: message.id,
      converseId: converse.id,
      fromBotId: this.botId,
      fromBotName: this.name,
      content: response.content,
      actions: response.actions,
      createdAt: message.createdAt.toISOString(),
    });
  }
}
```

## 6. 模块定义

```typescript
// agents/agents.module.ts

@Module({
  imports: [
    RedisModule,
    AiModule,  // LlmRouterService
    BotsModule,
    MessagesModule,
  ],
  providers: [
    // Core Services
    AgentMemoryService,
    AgentWorkspaceService,

    // Orchestrator
    AgentOrchestratorService,

    // Event Handlers
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
export class AgentsModule {}
```

## 7. 目录结构

```
apps/server/src/
├── agents/                          # Agent 架构目录
│   ├── agents.module.ts             # 模块定义
│   │
│   ├── interfaces/
│   │   ├── agent.interface.ts       # IAgent 接口
│   │   ├── memory.interface.ts      # AgentMemory 接口
│   │   ├── workspace.interface.ts   # AgentWorkspace 接口
│   │   └── events.interface.ts      # AgentEvent 类型
│   │
│   ├── core/
│   │   ├── base-agent.ts            # Agent 基类
│   │   ├── memory.service.ts        # 记忆服务
│   │   └── workspace.service.ts     # 工作空间服务
│   │
│   ├── orchestrator/
│   │   └── agent-orchestrator.service.ts  # Agent 协调器
│   │
│   ├── impl/
│   │   └── supervisor.agent.ts      # Supervisor Agent 实现
│   │
│   └── events/
│       ├── bot-event.listener.ts    # 事件监听器
│       └── batch-trigger.service.ts # 批量触发服务
│
└── bots/                            # 现有 Bot 模块
    └── bots.module.ts               # 需要导入 AgentsModule
```

## 8. 任务清单

| # | 任务 | 产出 | 预估 |
|---|------|------|------|
| 6.1 | Agent 接口定义 | `agents/interfaces/*.ts` | 0.5 天 |
| 6.2 | 基础记忆服务 | `memory.service.ts` | 0.5 天 |
| 6.3 | 基础工作空间服务 | `workspace.service.ts` | 0.5 天 |
| 6.4 | Agent 基类 | `base-agent.ts` | 0.5 天 |
| 6.5 | Agent 协调器 | `agent-orchestrator.service.ts` | 1 天 |
| 6.6 | Supervisor Agent | `supervisor.agent.ts` | 1 天 |
| 6.7 | 事件监听器 | `bot-event.listener.ts` | 0.5 天 |
| 6.8 | 批量触发服务 | `batch-trigger.service.ts` | 0.5 天 |
| 6.9 | 模块集成 | `agents.module.ts` + 更新 `bots.module.ts` | 0.5 天 |
| 6.10 | 单元测试 | `*.spec.ts` | 0.5 天 |
| **总计** | | | **6 天** |

## 9. 验收标准

1. **Agent 架构**：IAgent 接口 + Memory + Workspace 基础实现完成
2. **事件捕获**：`device:result:complete` 事件被 `BotEventListener` 正确捕获
3. **批量触发**：5 秒内同一 Agent 的多个事件合并为一次处理
4. **LLM 消息生成**：通知内容由 LLM 生成，而非硬编码模板
5. **WS 推送**：`bot:notification` 事件正确推送到 `u-{userId}` 房间
6. **消息创建**：通知消息正确写入 Supervisor 的 DM Converse
7. **测试覆盖**：核心服务有单元测试覆盖

## 10. 后续扩展

### 10.1 Phase 7+ 扩展方向

- **Coding Agent**：迁移现有 Coding Bot 到 Agent 架构
- **长期记忆**：向量数据库集成（Pinecone/Milvus）
- **工具扩展**：更多 Agent 工具（文件操作、代码分析等）
- **Agent 间协作**：更复杂的多 Agent 协作流程

### 10.2 技术债务

- 记忆持久化策略（当前仅 Redis，需要考虑长期存储）
- Agent 配置热更新
- 监控和日志增强
- 错误恢复机制

## 11. 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| LLM 响应延迟 | 中 | 使用 DeepSeek 低延迟模型 + 超时处理 |
| Redis 内存占用 | 低 | 设置合理的过期时间 + 限制条目数 |
| Agent 数量增长 | 中 | 惰性初始化 + 按需加载 |
| 事件丢失 | 中 | 关键事件持久化 + 重试机制 |
