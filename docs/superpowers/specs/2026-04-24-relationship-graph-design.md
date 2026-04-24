# Jarvis Agent Evolution Plan — L1 → L4

**日期**: 2026-04-24
**状态**: 待实施
**版本**: v3（整合 pi-mono，直接规划到 L4）

---

## 愿景

将 Jarvis 从"单次 LLM 调用的伪 Agent"进化为"有记忆、有目标、会规划、能自主执行的真 Agent"。

```
现在                          L4 目标
┌─────────────────────┐      ┌──────────────────────────────────────┐
│ 用户 @ai            │      │ 用户："帮我回复张总，说周五开会没问题"  │
│   → 单次 LLM 调用    │      │   → Jarvis 查关系图谱（张总=CORE）     │
│   → if/else 分发     │  →   │   → 拉取最近对话上下文                 │
│   → 返回文本         │      │   → 生成高情商回复草稿                 │
│                     │      │   → beforeToolCall 拦截 → 用户确认     │
│                     │      │   → 发送 → 安排 2 天后跟进提醒          │
└─────────────────────┘      └──────────────────────────────────────┘
```

---

## 技术选型：pi-mono

采用 [pi-mono](https://github.com/badlogic/pi-mono)（TypeScript, 39K stars, MIT）的两个核心包：

| 包 | 替代什么 | 为什么 |
|----|---------|-------|
| `@mariozechner/pi-ai` | LlmRouterService + DeepSeekProvider + KimiProvider | 统一多 LLM API，支持 OpenAI 兼容模式，内置 token/cost 追踪，省去 ~400 行自建代码 |
| `@mariozechner/pi-agent-core` | SupervisorAgent + AgentOrchestratorService | 有状态 Agent 运行时，多轮工具链，事件流，beforeToolCall 拦截，steering 中断 |

### pi-ai 与现有提供商的映射

```typescript
// 替换前：自建 fetch + SSE 解析（~200 行/provider）
const deepseek = new DeepSeekProvider(configService);
const response = await deepseek.complete(messages, options);

// 替换后：pi-ai custom model（~10 行配置）
import { getModel, complete, stream } from "@mariozechner/pi-ai";

const deepseekModel: Model<'openai-completions'> = {
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

const kimiModel: Model<'openai-completions'> = {
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
```

---

## Jarvis 工具集定义

Agent-native 的核心 = 工具。Jarvis 通过调用工具来感知、思考、行动：

### L3 工具（关系感知 + 提醒）

| 工具 | 描述 | 触发方式 |
|------|------|---------|
| `query_relationship` | 查询某联系人的关系 profile：tier、标签、关键事件、最近互动 | Agent 主动调用 |
| `list_relationships` | 按条件列出关系（如"所有沉默超 7 天的 CORE 联系人"） | Agent / cron |
| `update_relationship` | 更新 tier、标签、备注（用户通过对话指示 Jarvis） | 用户指令 |
| `search_messages` | 搜索某对话的历史消息（关键词/时间范围） | Agent 需要上下文时 |
| `send_nudge` | 向 Supervisor Bot 推送关系提醒卡片 | ReminderEngine |

### L4 工具（自主执行）

| 工具 | 描述 | 确认策略 |
|------|------|---------|
| `draft_message` | 为某联系人生成消息草稿 | 自动执行，结果展示给用户 |
| `send_message` | 发送消息到指定对话 | **beforeToolCall 拦截 → 必须用户确认** |
| `get_conversation_context` | 获取某对话最近 N 条消息 | 自动执行 |
| `schedule_followup` | 安排延时提醒（如"2 天后提醒我跟进张总"） | 自动执行 |
| `execute_device_command` | 远程执行桌面命令 | **beforeToolCall 拦截 → 必须用户确认** |
| `create_calendar_event` | 创建日程提醒（未来） | 自动执行 |

### 确认策略（beforeToolCall）

```typescript
beforeToolCall: async ({ toolCall, args, context }) => {
  const DANGEROUS_TOOLS = ['send_message', 'execute_device_command'];
  if (DANGEROUS_TOOLS.includes(toolCall.name)) {
    // 不直接 block——推送确认卡片到客户端，等待用户响应
    await this.broadcastService.toRoom(userId, 'jarvis:confirm', {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      args,
      preview: await this.generatePreview(toolCall.name, args),
    });
    return { block: true, reason: 'awaiting_user_confirmation' };
  }
}
```

---

## 系统架构（目标态）

```
┌─ 客户端层 ──────────────────────────────────────────────────┐
│  Flutter Mobile / Electron Desktop                          │
│  ├── Chat UI（现有）                                         │
│  ├── WhisperBar（自动建议）                                   │
│  ├── JarvisPanel（Agent 事件流实时展示）           ← 新增     │
│  ├── RelationshipsPage（关系图谱管理）             ← 新增     │
│  └── ConfirmDialog（工具调用确认）                  ← 新增     │
└─────────────────────────────────────────────────────────────┘
                            ↕ Socket.IO (jarvis:event, jarvis:confirm)
┌─ NestJS 服务层 ─────────────────────────────────────────────┐
│                                                              │
│  JarvisAgentService（核心）                        ← 新增     │
│  ├── per-user Agent 实例（pi-agent-core）                     │
│  │   ├── state: systemPrompt + tools + messages              │
│  │   ├── subscribe() → BroadcastService → Socket.IO          │
│  │   ├── beforeToolCall → 危险操作拦截                        │
│  │   └── afterToolCall → 记录 + 学习                         │
│  │                                                           │
│  ├── JarvisToolRegistry                            ← 新增     │
│  │   ├── query_relationship                                   │
│  │   ├── draft_message                                        │
│  │   ├── send_message（需确认）                                │
│  │   ├── search_messages                                      │
│  │   ├── schedule_followup                                    │
│  │   └── execute_device_command（需确认）                      │
│  │                                                           │
│  ├── JarvisMemoryService                           ← 新增     │
│  │   ├── Agent state → Redis（会话级缓存）                     │
│  │   └── Agent state → Prisma（持久化快照）                    │
│  │                                                           │
│  └── LlmConfigService（替代 LlmRouterService）     ← 重写     │
│      ├── pi-ai Model 定义（DeepSeek + Kimi）                  │
│      └── 任务→模型路由逻辑保留                                 │
│                                                              │
│  RelationshipModule                                ← 新增     │
│  ├── RelationshipGraphService（增量指标更新）                   │
│  ├── ContentAnalyzerService（规则快筛 + LLM 事件提取）         │
│  ├── ReminderEngine（触发条件评估）                             │
│  ├── RelationshipScheduler（每日 cron）                        │
│  └── RelationshipEventListener（message.created 监听）        │
│                                                              │
│  现有模块（保留）                                              │
│  ├── MessagesService / ChatGateway                            │
│  ├── WhisperService（调 pi-ai 替代自建 LLM 调用）              │
│  ├── DraftService（成为 Jarvis draft_message 工具的底层）      │
│  ├── PredictiveService（成为 Jarvis 的观察输入）               │
│  └── BotEventListener（事件桥，路由到 JarvisAgentService）     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                            ↕
┌─ 数据层 ────────────────────────────────────────────────────┐
│  PostgreSQL: RelationshipProfile, RelationshipEvent          │
│  Redis: Agent state 缓存, 分布式锁, 确认等待队列              │
└──────────────────────────────────────────────────────────────┘
```

---

## JarvisAgentService 核心设计

```typescript
@Injectable()
export class JarvisAgentService implements OnModuleDestroy {
  private agents = new Map<string, Agent>();

  constructor(
    private readonly toolRegistry: JarvisToolRegistry,
    private readonly memoryService: JarvisMemoryService,
    private readonly broadcastService: BroadcastService,
    private readonly llmConfig: LlmConfigService,
  ) {}

  async getOrCreate(userId: string): Promise<Agent> {
    if (this.agents.has(userId)) return this.agents.get(userId)!;

    const savedState = await this.memoryService.restore(userId);
    const tools = this.toolRegistry.buildTools(userId);

    const agent = new Agent({
      initialState: {
        systemPrompt: this.buildSystemPrompt(userId),
        model: this.llmConfig.getModel('chat'),
        tools,
        messages: savedState?.messages ?? [],
      },
      transformContext: async (messages) => {
        // 保留最近 50 条 + 系统消息，压缩更早的
        return this.memoryService.compactContext(messages, 50);
      },
      beforeToolCall: async ({ toolCall, args }) => {
        return this.toolRegistry.checkConfirmation(userId, toolCall, args);
      },
      afterToolCall: async ({ toolCall, result, isError }) => {
        // 记录工具使用（学习数据）
        await this.memoryService.logToolUse(userId, toolCall, result, isError);
      },
    });

    // 事件流 → Socket.IO
    agent.subscribe(async (event) => {
      this.broadcastService.toRoom(`u-${userId}`, 'jarvis:event', {
        type: event.type,
        ...(event.type === 'message_update'
          ? { delta: event.assistantMessageEvent }
          : {}),
      });

      // 持久化：每轮结束保存状态
      if (event.type === 'turn_end') {
        await this.memoryService.save(userId, agent.state);
      }
    });

    this.agents.set(userId, agent);
    return agent;
  }

  // 用户主动对话（@ai / Bot DM）
  async prompt(userId: string, message: string): Promise<void> {
    const agent = await this.getOrCreate(userId);
    await agent.prompt(message);
  }

  // 系统触发（关系提醒、预测建议等）
  async systemTrigger(userId: string, event: AgentEvent): Promise<void> {
    const agent = await this.getOrCreate(userId);
    // 作为系统消息注入，不打断用户对话
    agent.followUp({
      role: 'user',
      content: `[SYSTEM] ${event.type}: ${JSON.stringify(event.payload)}`,
      timestamp: Date.now(),
    });
  }

  // 用户确认工具执行
  async confirmToolCall(userId: string, toolCallId: string, approved: boolean): Promise<void> {
    const agent = await this.getOrCreate(userId);
    if (approved) {
      await agent.continue(); // 继续被 block 的工具链
    } else {
      agent.steer({
        role: 'user',
        content: '用户拒绝了这个操作，请换一种方式。',
        timestamp: Date.now(),
      });
    }
  }

  // 内存管理：清理不活跃用户的 agent 实例
  private cleanup(): void {
    // 每 30 分钟检查，超过 1 小时无交互的 agent 保存状态后释放
  }
}
```

---

## 数据模型

### RelationshipProfile（关系档案）

```prisma
model RelationshipProfile {
  id                    String           @id @default(cuid())
  userId                String
  contactId             String

  // 用户声明（权重最高）
  tier                  RelationshipTier @default(IMPORTANT)
  label                 String?          // "老板"、"大学同学"
  notes                 String?          // 用户手写备注
  isMuted               Boolean          @default(false)
  customSilenceDays     Int?             // 覆盖 tier 默认沉默阈值
  isUrgentReply         Boolean          @default(false)

  // 行为指标（事件驱动增量更新）
  lastInteractionAt     DateTime?
  weeklyMessageCount    Int              @default(0)
  prevWeeklyMessageCount Int?
  avgResponseMinutes    Float?
  initiationScore       Float?
  groupInteractionCount Int              @default(0)

  // 内容信号
  lastKeyEventSummary   String?
  sentimentTrend        SentimentTrend?

  // 提醒去重
  silenceReminderSentAt DateTime?
  coolingReminderSentAt DateTime?
  pendingReplyReminderAt DateTime?

  createdAt             DateTime         @default(now())
  updatedAt             DateTime         @updatedAt

  user    User @relation("RelationshipOwner",  fields: [userId],    references: [id])
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
  summary         String   // "妈妈住院了"
  sourceMessageId String?
  extractedAt     DateTime @default(now())
  isActive        Boolean  @default(true)

  profile RelationshipProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@index([profileId, isActive])
}

// Jarvis Agent 状态持久化
model JarvisState {
  id            String   @id @default(cuid())
  userId        String   @unique
  messages      Json     // AgentMessage[] 序列化
  metadata      Json?    // 工具使用统计、偏好学习数据
  snapshotAt    DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
}

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
```

---

## 分阶段执行计划

### Phase 0: 基础设施 + Wake up Jarvis（1.5 周）

**目标**：引入 pi-mono，修复 Whisper auto-trigger，Jarvis 开始说话。

#### Week 1 前半：pi-mono 基础设施

| Day | 任务 | 详情 |
|-----|------|------|
| 0.1 | 安装 pi-mono 依赖 | `pnpm --filter @linkingchat/server add @mariozechner/pi-ai @mariozechner/pi-agent-core` |
| 0.2 | 创建 LlmConfigService | 定义 DeepSeek + Kimi 的 pi-ai Model 对象，保留任务→模型路由逻辑 |
| 0.3 | 迁移 WhisperService | 将内部 LLM 调用从 LlmRouterService 切换到 pi-ai `complete()` |
| 0.4 | 迁移 DraftService + PredictiveService | 同上 |
| 0.5 | 删除旧代码 | 移除 DeepSeekProvider、KimiProvider、LlmRouterService（~400 行） |
| 0.5 | 测试 | 确保所有 AI service 的现有 spec 文件全绿 |

#### Week 1 后半：Wake up Jarvis

| Day | 任务 | 详情 |
|-----|------|------|
| 1.1 | 修复 Whisper auto-trigger | `messages.service.ts`: 放宽 `shouldTrigger()` 过滤，GROUP @mention/reply 也触发 |
| 1.2 | Whisper → Draft 链路 | WhisperBar/WhisperSuggestions 增加"Jarvis 帮写"按钮，WS 事件 `ai:draft:from-whisper` |
| 1.3 | 安装 @nestjs/schedule | 注册 ScheduleModule，为 Phase 1 做准备 |
| 1.4 | 冒烟测试 | DM 收消息 → Whisper 弹出 → 点"帮写" → Draft 出现 → 确认发送 |

**Phase 0 验收**：
- [ ] pi-ai 替代自建 LLM 层，所有现有测试通过
- [ ] DM 收到消息 2s 内 Whisper 自动弹出
- [ ] GROUP 中被 @mention 后 Whisper 弹出
- [ ] Whisper → Draft → 确认发送 链路完整

---

### Phase 1: Jarvis Agent Core + 关系图谱（2.5 周）

**目标**：SupervisorAgent → pi-agent-core Agent，关系图谱数据层 + 内容分析上线。

#### Week 2：Jarvis Agent 重构

| Day | 任务 | 详情 |
|-----|------|------|
| 2.1 | JarvisToolRegistry | 定义 L3 工具集：`query_relationship`, `search_messages`, `get_conversation_context`, `send_nudge` |
| 2.2 | JarvisAgentService | pi Agent 包装层：per-user 实例、事件流→Socket.IO、状态生命周期 |
| 2.3 | JarvisMemoryService | Agent 状态持久化：Redis 缓存 + Prisma JarvisState 快照 + 上下文压缩 |
| 2.4 | 迁移 BotEventListener | `agent.dispatch` → `jarvisAgentService.prompt()`，`device.result` → `jarvisAgentService.systemTrigger()` |
| 2.5 | 迁移 SupervisorAgent 逻辑 | USER_MESSAGE 处理 → Jarvis system prompt + 工具调用（不再是 if/else） |
| 2.5 | 删除旧 Agent 代码 | 移除 AgentOrchestratorService、旧 SupervisorAgent、AgentMemoryService |

#### Week 3：关系图谱数据层

| Day | 任务 | 详情 |
|-----|------|------|
| 3.1 | Prisma migration | RelationshipProfile + RelationshipEvent + JarvisState + enums |
| 3.2 | RelationshipGraphService | `onMessageEvent()` 增量更新指标 + 每周一衰减 cron |
| 3.3 | ContentAnalyzerService | 规则快筛（~80% 过滤） + pi-ai LLM 事件提取 |
| 3.4 | RelationshipEventListener | 监听 `message.created` → 调用 GraphService + ContentAnalyzer |
| 3.5 | RelationshipsController + DTO | REST API：CRUD + 批量更新 + 关键事件列表 + insights |
| 3.5 | 好友钩子 | FriendsService accept → 自动创建 profile，removeFriend → soft-delete |

#### Week 4 前半：提醒引擎

| Day | 任务 | 详情 |
|-----|------|------|
| 4.1 | ReminderEngine | 沉默提醒条件 + 去重 + 每日 3 条上限 + 勿扰（22:00-08:00） |
| 4.2 | RelationshipScheduler | 每日 09:00 cron + Redis 分布式锁（多实例安全） |
| 4.3 | `send_nudge` 工具实现 | Jarvis 生成提醒 → Supervisor Bot 对话推送消息卡片 |
| 4.4 | 集成测试 | 消息→增量更新→cron 评估→Jarvis 工具调用→Bot 推送 |

**Phase 1 验收**：
- [ ] Jarvis 是 pi-agent-core Agent 实例，支持多轮工具调用
- [ ] `@ai 我和李明关系怎么样` → Jarvis 调用 `query_relationship` → 返回结构化结果
- [ ] 消息发送触发增量指标更新 + 内容事件提取
- [ ] 每日 cron 评估沉默提醒并通过 Jarvis 推送
- [ ] Agent 状态 Redis 缓存 + Prisma 持久化，重启不丢失

---

### Phase 2: 完整提醒 + UI + L4 工具（2 周）

**目标**：完整提醒引擎 + 双端 UI + L4 自主执行工具集。

#### Week 4 后半 + Week 5 前半：L4 工具 + 提醒增强

| Day | 任务 | 详情 |
|-----|------|------|
| 5.1 | `draft_message` 工具 | Jarvis 调用 → DraftService.createDraft() → 返回草稿 |
| 5.2 | `send_message` 工具 + beforeToolCall 拦截 | 推送确认卡片 → 等待用户确认 → agent.continue() 或 agent.steer() |
| 5.3 | `schedule_followup` 工具 | 延时提醒，Redis delayed queue / @nestjs/schedule |
| 5.4 | 降温提醒 + 待回复提醒 | ReminderEngine 扩展（降温：CORE only，待回复：6h 最低阈值） |
| 5.5 | 确认等待机制 | Redis 确认队列 + WS 事件 `jarvis:confirm` / `jarvis:confirm:response` |
| 5.5 | Jarvis system prompt 优化 | 多轮规划提示词：让 Jarvis 学会组合工具完成复杂任务 |

#### Week 5 后半 + Week 6 前半：UI

| Day | 任务 | 详情 |
|-----|------|------|
| 6.1 | Desktop: JarvisPanel 组件 | Agent 事件流实时展示：思考过程、工具调用、结果 |
| 6.2 | Desktop: ConfirmDialog | 工具调用确认弹窗：预览操作内容 + 确认/拒绝 |
| 6.3 | Desktop: RelationshipsPage | 关系列表（按 tier 分组）+ 编辑 tier/label/notes/mute |
| 6.4 | Desktop: 联系人内嵌增强 | ConversationList tier 标签 + ChatThread 关键事件提示条 |
| 6.5 | Mobile: 对应页面 | RelationshipsPage + ConfirmSheet + JarvisEventStream |
| 6.5 | 首次使用引导 | 批量 tier 设置引导（按频率排序，拖拽/快速分组） |

**Phase 2 验收**：
- [ ] "帮我回复张总说周五开会没问题" → Jarvis 拉上下文 → 拟草稿 → 确认 → 发送
- [ ] 危险操作（send_message, execute_device_command）100% 拦截确认
- [ ] "2 天后提醒我跟进李明" → schedule_followup 工具 → 定时触发
- [ ] Desktop + Mobile 关系管理页面完整可用
- [ ] 降温提醒 + 待回复提醒正确触发
- [ ] Agent 事件流在客户端实时展示

---

### Phase 3: L4 高级场景 + 打磨（1.5 周）

**目标**：复杂多步骤任务链 + 用户反馈学习 + 性能优化。

#### Week 6 后半 + Week 7：

| Day | 任务 | 详情 |
|-----|------|------|
| 7.1 | 多步骤任务链测试 | "帮我约李明下周吃饭" → 查关系 → 查对话 → 拟消息 → 确认 → 发送 → 安排跟进 |
| 7.2 | Steering 集成 | 用户在 Jarvis 执行过程中说"停，换个方式" → agent.steer() |
| 7.3 | 反馈学习 | 用户 dismiss/mute 提醒 → 调整 ReminderEngine 阈值 + 记录到 JarvisState |
| 7.4 | 性能优化 | Agent 实例内存管理 + 上下文压缩策略 + LLM 调用成本监控 |
| 7.5 | 端到端测试 | L1→L4 全路径回归测试 |
| 7.5 | Prometheus 指标 | agent 实例数、工具调用频率、确认率、提醒精准率 |

**Phase 3 验收**：
- [ ] 复杂多步骤任务（约饭、跟进、批量关心）端到端成功
- [ ] Steering 中断 + 重新规划流畅
- [ ] 用户反馈数据被持久化并影响未来行为
- [ ] 单用户 Agent 内存 < 50MB，上下文 token < 8K
- [ ] 每用户每月 LLM 成本 < $0.10

---

## 迁移安全策略

### 渐进替换，不大爆炸

```
Phase 0:
  pi-ai ──────── 替换 ──→ LlmRouterService + providers
  SupervisorAgent ─────→ 保持不变（先只换 LLM 层）

Phase 1:
  pi-agent-core ─ 替换 ──→ SupervisorAgent + AgentOrchestrator
  BotEventListener ────→ 保留，路由目标改为 JarvisAgentService

Phase 2:
  DraftService ────────→ 保留，成为 draft_message 工具的底层实现
  WhisperService ──────→ 保留，独立于 Agent（实时性要求不同）
  PredictiveService ──→ 保留，作为 Jarvis 的观察输入
```

**回滚点**：每个 Phase 结束时打 git tag。如果 Phase 1 Agent 重构失败，可以回退到 Phase 0（pi-ai + 旧 SupervisorAgent），已有功能不受影响。

### WhisperService 为什么不迁入 Agent

Whisper 需要 **2 秒内返回**，是实时热路径。Agent 的多轮 loop 有额外开销（状态恢复、工具注册、事件订阅）。Whisper 保持为独立 service，直接调 pi-ai `complete()`，不经过 Agent。

---

## 删除清单

Phase 完成后可安全删除的文件：

| Phase | 删除文件 | 原因 |
|-------|---------|------|
| Phase 0 | `ai/providers/deepseek.provider.ts` | pi-ai 替代 |
| Phase 0 | `ai/providers/kimi.provider.ts` | pi-ai 替代 |
| Phase 0 | `ai/services/llm-router.service.ts` | LlmConfigService 替代 |
| Phase 1 | `agents/orchestrator/agent-orchestrator.service.ts` | JarvisAgentService 替代 |
| Phase 1 | `agents/impl/supervisor.agent.ts` | Jarvis Agent 替代 |
| Phase 1 | `agents/core/agent-memory.service.ts` | JarvisMemoryService 替代 |
| Phase 1 | `agents/core/agent-workspace.service.ts` | Agent 工具系统替代 |
| Phase 1 | `agents/impl/batch-trigger.service.ts` | Agent followUp 机制替代 |

保留：`agents/events/bot-event.listener.ts`（事件桥，路由目标改为 JarvisAgentService）

---

## 提醒触发条件（完整版）

### 沉默提醒

```
lastInteractionAt 距今 > silenceThreshold
AND isMuted = false
AND silenceReminderSentAt 为 null 或距今 > 7 天

silenceThreshold（customSilenceDays 优先）:
  CORE      → 7 天
  IMPORTANT → 21 天
  EXTENDED  → 不提醒
```

### 降温提醒（Phase 2）

```
weeklyMessageCount < prevWeeklyMessageCount × 0.4
AND weeklyMessageCount < 5
AND tier = CORE
AND coolingReminderSentAt 距今 > 14 天
AND isMuted = false
```

### 待回复提醒（Phase 2）

```
对方最新消息 authorId ≠ userId
AND 距今 > replyThreshold
AND (tier = CORE 或 isUrgentReply = true)
AND pendingReplyReminderAt 距今 > 24h
AND isMuted = false
AND 当前时间不在 22:00-08:00

replyThreshold:
  isUrgentReply → 6h
  CORE          → 12h
```

### 全局约束

- 每日每用户最多 3 条提醒
- 按 tier 优先（CORE > IMPORTANT）
- 有 lastKeyEventSummary 的优先排序

---

## 成功指标

### North Star

**因提醒恢复的沉默关系数**：提醒后 7 天内重新开始对话且持续 ≥ 2 轮。

### L3 指标

| 指标 | 目标 |
|------|------|
| 提醒→对话恢复率 | > 40% |
| 提醒关闭/静音率 | < 15% |
| 内容事件提取准确率 | > 80%（抽样评估） |
| 活跃用户提醒交互率 | > 60% |

### L4 指标

| 指标 | 目标 |
|------|------|
| 多步骤任务完成率 | > 70%（无需人工介入纠正） |
| 工具调用确认通过率 | > 85%（Jarvis 拟的操作大部分被接受） |
| 首次 prompt → 任务完成 平均时间 | < 30s |
| Agent 每轮平均工具调用数 | 2-4（太少=能力不足，太多=效率低） |

### 反指标

| 反指标 | 警戒线 |
|--------|--------|
| 每日提醒推送 / 活跃用户 | < 2 |
| Supervisor Bot 静音率 | < 10% |
| LLM 月成本 / 用户 | < $0.10 |
| Agent 实例内存 / 用户 | < 50MB |

---

## 总时间线

```
Week 1-1.5:  Phase 0 — pi-ai 迁移 + Whisper auto-trigger      → Jarvis 说话了
Week 2-4:    Phase 1 — Agent 重构 + 关系图谱 + 提醒引擎        → Jarvis 有记忆了 (L3)
Week 4-6:    Phase 2 — L4 工具 + 完整提醒 + 双端 UI            → Jarvis 能做事了 (L4)
Week 6-7.5:  Phase 3 — 高级场景 + 打磨 + 性能                  → Jarvis 成熟了

总计: ~7.5 周
```

---

## 未来扩展（不在本轮）

- **L5: Agent-to-Agent** — AgentBridge 通信协议 + 双 Jarvis 协商（约饭、日程）
- **对话式关系查询** — "我和李明关系怎么样？" → Jarvis 综合分析
- **承诺追踪** — "你答应下周请李明吃饭" → 自动创建跟进
- **关系健康仪表盘** — 可视化关系网络 + 健康度评分
- **端侧小模型** — 本地内容分析，零隐私顾虑
