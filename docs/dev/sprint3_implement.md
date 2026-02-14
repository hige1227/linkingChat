# Sprint 3：AI 三模式 + 群聊

> **目标**：让 Bot 真正"智能" — 实现 LLM 路由、@ai Whisper 建议、Draft & Verify 草稿确认、Predictive Actions 预测执行，同时扩展群聊功能
>
> **前置条件**：[Sprint 2](./sprint2_implement.md) 已完成（好友系统、1 对 1 聊天、在线状态、已读回执、Bot 框架、OpenClaw 集成）
>
> **不包含**：文件/图片/语音消息、推送通知、消息搜索、生产部署、i18n
>
> **参考**：[websocket-protocol.md](../dev-plan/websocket-protocol.md) §七 | [tech-decisions-v2.md](../decisions/tech-decisions-v2.md) §八 | [project-brief.md](../decisions/project-brief.md)

---

## 并行策略

```
线 A — AI 模块（后端为主）                 线 B — 群聊（后端 + 全端）
  Phase 0: LLM Router 服务                  Phase 5: Group + Channel + Member model
  Phase 1: @ai Whisper 触发                  Phase 6: 群组 CRUD + 邀请系统
  Phase 2: Draft & Verify 状态机             Phase 7: 群消息（频道广播）
  Phase 3: Predictive Actions                Phase 8: Bot 进群
  Phase 4: Bot 间通信                        Phase 9: 群权限系统

       线 A 和线 B 完全独立，可同时开发
```

### 人员分配建议

| 开发者 | 负责 | 说明 |
|--------|------|------|
| A（后端 / AI） | Phase 0 → 1 → 2 → 3 → 4 | AI 全链路，需要对接 LLM API |
| B（后端 / 全栈） | Phase 5 → 6 → 7 → 8 → 9 | 群聊系统，参考 Sprint 2 社交模式 |
| C（移动端） | 跟进两条线的 Flutter UI | @ai 交互、草稿卡片、群聊界面 |

---

## 线 A — AI 模块

### Phase 0: LLM Router 服务

**目标**：多供应商 LLM 路由，根据任务复杂度自动选择模型 — DeepSeek 处理轻量任务，Kimi 2.5 处理复杂任务。

| # | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| 0.1 | 创建 AiModule + LlmRouterService | `apps/server/src/ai/` | 模块可注入 |
| 0.2 | DeepSeek API 客户端 | `ai/providers/deepseek.provider.ts` | 文本补全 + 流式响应 |
| 0.3 | Kimi 2.5 API 客户端 | `ai/providers/kimi.provider.ts` | 文本补全 + 流式响应 |
| 0.4 | 路由策略实现 | LlmRouterService.route() | 根据 taskType 自动选择 provider |
| 0.5 | Provider 降级逻辑 | 主 provider 超时/失败 → 切换备选 | 3 秒超时自动降级 |
| 0.6 | 调用计量 + 日志 | 记录每次 LLM 调用的 provider、耗时、token 数 | 日志可查询 |
| 0.7 | 环境变量配置 | .env.example 更新 | DEEPSEEK_API_KEY, KIMI_API_KEY |
| 0.8 | 单元测试 | llm-router.service.spec.ts | Mock provider 测试路由逻辑 |

**路由策略**：

```typescript
// ai/services/llm-router.service.ts
export class LlmRouterService {
  async complete(request: LlmRequest): Promise<LlmResponse> {
    const provider = this.selectProvider(request.taskType);
    try {
      return await provider.complete(request, { timeout: 3000 });
    } catch (error) {
      // 降级：DeepSeek 失败 → Kimi，Kimi 失败 → DeepSeek
      return await this.fallbackProvider(provider).complete(request);
    }
  }

  private selectProvider(taskType: LlmTaskType): LlmProvider {
    switch (taskType) {
      case 'whisper':        return this.deepseek;  // 低延迟优先
      case 'draft':          return this.kimi;      // 质量优先
      case 'predictive':     return this.deepseek;  // 低延迟优先
      case 'chat':           return this.deepseek;  // 日常对话
      case 'complex_analysis': return this.kimi;    // 复杂分析
      default:               return this.deepseek;
    }
  }
}
```

**LLM Provider 接口**：

```typescript
interface LlmProvider {
  name: string;
  complete(request: LlmRequest, options?: LlmOptions): Promise<LlmResponse>;
  stream(request: LlmRequest, options?: LlmOptions): AsyncIterable<LlmChunk>;
}

interface LlmRequest {
  taskType: LlmTaskType;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
}

type LlmTaskType = 'whisper' | 'draft' | 'predictive' | 'chat' | 'complex_analysis';
```

**关键文件**：

```
apps/server/src/ai/
  ├── ai.module.ts
  ├── ai.controller.ts
  ├── services/
  │   └── llm-router.service.ts     # 多 provider 路由
  ├── providers/
  │   ├── llm-provider.interface.ts  # Provider 接口
  │   ├── deepseek.provider.ts       # DeepSeek API
  │   └── kimi.provider.ts           # Kimi 2.5 API
  └── dto/
      └── llm-request.dto.ts
```

**验收标准**：
- DeepSeek 和 Kimi 两个 provider 均可正常调用
- whisper 类型请求自动路由到 DeepSeek
- DeepSeek 超时后 3 秒内自动降级到 Kimi
- 每次调用有 provider 名称 + 耗时 + token 数日志

---

### Phase 1: @ai Whisper 触发

**目标**：用户在聊天中输入 `@ai` 后，LLM 生成 1 个主推荐 + 2 个备选回复建议，<2 秒内返回。

| # | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| 1.1 | 创建 WhisperService | `ai/services/whisper.service.ts` | 接收触发消息 → 返回建议 |
| 1.2 | @ai 触发词识别 | MessageListener | POST /messages 中检测 content 包含 @ai |
| 1.3 | 聊天上下文提取 | 最近 20 条消息作为 LLM 上下文 | 包含消息内容 + 发送者信息 |
| 1.4 | LLM 调用生成建议 | 1 主推荐 + 2 备选 | 使用 DeepSeek（低延迟） |
| 1.5 | WS 推送 ai:whisper:suggestions | 建议推送到触发用户 | 推送到 u-{userId} |
| 1.6 | WS 接收 ai:whisper:accept | 用户采纳建议 | 记录采纳的 suggestionId + selectedIndex |
| 1.7 | AiSuggestion 持久化 | 写入 ai_suggestions 表 (type=WHISPER) | 可追溯建议历史 |
| 1.8 | 超时处理 | >2 秒未返回则放弃 | 客户端不显示过期建议 |
| 1.9 | Flutter UI：建议展示 | 主推荐预填入输入框 + `...` 展开备选 | Tab 采纳，Esc 忽略 |
| 1.10 | Desktop UI：建议展示 | 同上 | 同上 |
| 1.11 | 单元测试 | whisper.service.spec.ts | Mock LLM 测试建议生成 |

**Whisper 交互流程**：

```
用户发送 "@ai" 消息:
  POST /api/v1/messages { converseId, content: "@ai", type: TEXT }
    │
    ├── DB: INSERT message (正常存储)
    ├── WS: message:new → {converseId} 房间 (广播给所有人)
    │
    └── 异步触发 WhisperService:
          ├── 提取最近 20 条消息上下文
          ├── 调用 LlmRouterService.complete({ taskType: 'whisper', ... })
          ├── 生成: { primary: "...", alternatives: ["...", "..."] }
          ├── DB: INSERT ai_suggestions (type=WHISPER)
          └── WS: ai:whisper:suggestions → u-{userId}

用户采纳建议:
  WS: ai:whisper:accept { suggestionId, selectedIndex: 0 }
    → 客户端用建议内容替换输入框 → 用户点发送 → 走正常 POST /messages
```

**客户端 UI 交互**：

```
输入框区域:
  ┌──────────────────────────────────────────┐
  │ 我觉得这个方案可以，但需要调整一下时间线。  │  ← 主推荐（灰色预填）
  │                                [发送] [×] │
  └──────────────────────────────────────────┘
  [···]  ← 点击展开备选

  展开后:
  ┌──────────────────────────────────────────┐
  │ ① 我觉得这个方案可以，但需要调整一下时间线。│  ← 主推荐
  │ ② 时间上有点紧，能延后一周吗？             │  ← 备选 1
  │ ③ 同意，我这边开始准备。                   │  ← 备选 2
  └──────────────────────────────────────────┘
```

**验收标准**：
- 用户发送 "@ai" → 2 秒内收到 1 主 + 2 备选建议
- 主推荐以灰色文字预填入输入框
- 点击 `...` 可展开查看备选
- 选择任意建议后可直接发送
- 超过 2 秒未返回，客户端不显示建议

---

### Phase 2: Draft & Verify 状态机

**目标**：AI 生成操作草稿（消息草稿或命令草稿），用户确认后才执行。Bot 永远不自主行动。

| # | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| 2.1 | 创建 DraftService | `ai/services/draft.service.ts` | 草稿状态机管理 |
| 2.2 | AiDraft model + migration | ai_drafts 表 | DraftStatus enum: PENDING → APPROVED / REJECTED / EXPIRED |
| 2.3 | 草稿生成触发 | Bot 回复用户意图时生成草稿 | 使用 Kimi 2.5（质量优先） |
| 2.4 | WS 推送 ai:draft:created | 草稿卡片推送到用户 | 包含 draftContent + expiresAt |
| 2.5 | WS 接收 ai:draft:approve | 用户批准 → 执行 | 消息草稿 → POST /messages，命令草稿 → device:command:send |
| 2.6 | WS 接收 ai:draft:reject | 用户拒绝 → 标记 REJECTED | 可附带拒绝原因 |
| 2.7 | WS 接收 ai:draft:edit | 用户编辑后批准 | 用编辑内容替换原草稿再执行 |
| 2.8 | TTL 过期机制 | 5 分钟未操作 → EXPIRED | Redis TTL + 定时任务检查 |
| 2.9 | WS 推送 ai:draft:expired | 过期通知 | 客户端移除过期草稿卡片 |
| 2.10 | Flutter 草稿卡片 UI | 批准 / 拒绝 / 编辑 按钮 | 过期后灰显不可操作 |
| 2.11 | Desktop 草稿卡片 UI | 同上 | 同上 |
| 2.12 | 与 OpenClaw ask 模式对接 | 命令草稿批准后通过 OpenClaw 执行 | exec-approvals: ask |
| 2.13 | 单元测试 | draft.service.spec.ts | 状态转换测试 + TTL 过期测试 |

**状态机**：

```
                  ┌─────────┐
  草稿生成 ──────>│ PENDING │
                  └────┬────┘
                       │
            ┌──────────┼──────────┐
            │          │          │
            ▼          ▼          ▼
     ┌──────────┐ ┌──────────┐ ┌──────────┐
     │ APPROVED │ │ REJECTED │ │ EXPIRED  │
     └──────────┘ └──────────┘ └──────────┘
         │                         ▲
         ▼                         │
     执行动作                  5 分钟 TTL
    (发消息/执行命令)
```

**草稿卡片 UI**：

```
Bot 聊天框:
  ┌──────────────────────────────────────────┐
  │ 📝 草稿                                  │
  │                                          │
  │ 你想执行: git pull origin main           │
  │                                          │
  │ ⏱ 4:32 后过期                            │
  │                                          │
  │ [✓ 批准]  [✏ 编辑]  [✗ 拒绝]             │
  └──────────────────────────────────────────┘
```

**验收标准**：
- 用户向 Bot 表达意图 → Bot 生成草稿卡片 → 用户确认后执行
- 草稿 5 分钟未操作自动过期，客户端卡片灰显
- 编辑草稿后批准，使用编辑后的内容执行
- 命令草稿批准后通过 OpenClaw 执行（非 child_process.exec）
- Bot 永远不自主执行任何操作

---

### Phase 3: Predictive Actions

**目标**：分析对话上下文（如 Shell 错误输出），智能推荐操作卡片，标注危险等级。

| # | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| 3.1 | 创建 PredictiveService | `ai/services/predictive.service.ts` | 上下文分析 → 动作生成 |
| 3.2 | 上下文触发器 | MessageListener | 检测特定模式：错误输出、异常堆栈、构建失败 |
| 3.3 | 动作生成 | LLM 分析上下文 → 生成 action cards | 使用 DeepSeek（低延迟） |
| 3.4 | 危险等级分类 | safe / warning / dangerous | dangerous 级别命令交叉验证黑名单 |
| 3.5 | WS 推送 ai:predictive:action | 动作卡片推送 | PredictivePayload 格式 |
| 3.6 | WS 接收 ai:predictive:execute | 用户选择执行 | 走 Draft & Verify 流程（非直接执行） |
| 3.7 | WS 接收 ai:predictive:dismiss | 用户忽略 | 记录忽略事件，优化后续推荐 |
| 3.8 | AiSuggestion 持久化 | ai_suggestions 表 (type=PREDICTIVE) | 可追溯推荐历史 |
| 3.9 | 黑名单协同 | dangerous 命令拦截 | 引用 Sprint 1 的 isDangerousCommand |
| 3.10 | Flutter 动作卡片 UI | 带颜色的操作按钮 | 绿(safe) / 黄(warning) / 红(dangerous) |
| 3.11 | Desktop 动作卡片 UI | 同上 | 同上 |
| 3.12 | 单元测试 | predictive.service.spec.ts | 上下文匹配 + 危险分级测试 |

**上下文触发示例**：

```
设备执行结果返回错误:
  device:result:complete { status: 'error', data: { output: "npm ERR! missing script: start" } }
    │
    └── PredictiveService.analyze(context)
          ├── 识别: npm 脚本缺失错误
          ├── 分析 package.json 上下文
          └── 生成动作卡片:
                actions: [
                  { type: 'shell', action: 'cat package.json | jq .scripts',
                    description: '查看可用 scripts', dangerLevel: 'safe' },
                  { type: 'shell', action: 'npm run dev',
                    description: '尝试运行 dev 脚本', dangerLevel: 'safe' },
                  { type: 'shell', action: 'npm init -y',
                    description: '初始化 package.json', dangerLevel: 'warning' },
                ]
```

**动作卡片 UI**：

```
Coding Bot 聊天框:
  ┌──────────────────────────────────────────┐
  │ 💡 检测到 npm 脚本缺失错误               │
  │                                          │
  │ 🟢 查看可用 scripts                      │
  │    cat package.json | jq .scripts        │
  │                                          │
  │ 🟢 尝试运行 dev 脚本                     │
  │    npm run dev                           │
  │                                          │
  │ 🟡 初始化 package.json                   │
  │    npm init -y                           │
  │                                          │
  │ [忽略]                                   │
  └──────────────────────────────────────────┘
```

**验收标准**：
- 命令执行报错 → 2 秒内推送相关操作建议
- 每个操作卡片标注危险等级（颜色区分）
- dangerous 级别的命令不可直接执行（转入 Draft & Verify）
- 选择执行后走 Draft & Verify 确认流程
- 忽略后记录到 ai_suggestions

---

### Phase 4: Bot 间通信

**目标**：启用 OpenClaw 多 Agent 编排能力，Bot 之间可以触发协作，但必须标注触发来源。

| # | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| 4.1 | 触发来源标签模型 | Message.metadata 扩展 | `{ triggerSource: { botId, botName, reason } }` |
| 4.2 | Bot 间消息路由 | BotsService 扩展 | Bot A 可向 Bot B 的 agent 发送请求 |
| 4.3 | Supervisor 协调逻辑 | 用户不确定找谁 → Supervisor 引导 | 分析用户意图，推荐合适的 Bot |
| 4.4 | 跨 Bot 通知卡片 | BOT_NOTIFICATION 扩展 | 卡片显示 "[来自 XX Bot 的协作]" |
| 4.5 | OpenClaw multi-agent 对接 | Agent 层面互通 | 复用 OpenClaw 的编排协议 |
| 4.6 | 限流保护 | Bot 间通信频率限制 | 防止 Bot 互相调用形成死循环 |
| 4.7 | 测试 | bot-communication.spec.ts | A 触发 B → B 通知用户 + 标注来源 |

**跨 Bot 通知示例**：

```
Coding Bot 完成数据爬取 → 触发社媒 Bot:
  社媒 Bot 聊天框:
    ┌──────────────────────────────────────────┐
    │ 🔗 [来自 Coding Bot 的协作]              │
    │                                          │
    │ Coding Bot 完成了数据爬取，发现 3 条热点。│
    │ 需要我帮你写推文吗？                      │
    │                                          │
    │ [查看数据] [写推文] [忽略]                │
    └──────────────────────────────────────────┘
```

**限流规则**：
- 同一 Bot 对另一个 Bot 的调用：最多 5 次/分钟
- 链式调用深度限制：最多 3 层（A → B → C，不允许 C → D）
- 循环检测：A → B → A 直接拒绝

**验收标准**：
- Bot A 完成任务后可通知 Bot B
- 跨 Bot 通知卡片明确标注触发来源
- 循环调用被自动阻止
- Supervisor 可根据用户意图推荐合适的 Bot

---

## 线 B — 群聊

### Phase 5: Group + Channel + GroupMember Models

**目标**：建立群组数据模型，支持 Discord 风格的群组 → 频道嵌套结构。

| # | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| 5.1 | 新增 Group model | groups 表 | 含 inviteCode、ownerId、config JSONB |
| 5.2 | 新增 Channel model | channels 表 | ChannelType: TEXT / SECTION / VOICE / PLUGIN |
| 5.3 | 新增 GroupMember model | group_members 表 | 复合主键 @@id([userId, groupId])，roles[]、muteUntil |
| 5.4 | 新增 GroupRole model | group_roles 表 | permissions: String[] |
| 5.5 | 新增 GroupBan model | group_bans 表 | 复合主键 @@id([userId, groupId]) |
| 5.6 | Channel ↔ Converse 关联 | Channel.converseId FK | TEXT 频道自动关联 Converse(type=GROUP) |
| 5.7 | 执行 migration | prisma/migrations/003_groups/ | `prisma migrate dev --name groups` 成功 |

**关键 Schema**（参考 [database-schema.md](../dev-plan/database-schema.md) §3.2）：

```prisma
model Group {
  id          String   @id @default(cuid())
  name        String
  iconUrl     String?
  description String?  @db.VarChar(120)
  inviteCode  String   @unique @default(cuid())
  ownerId     String
  config      Json     @default("{}")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?

  owner    User          @relation(fields: [ownerId], references: [id])
  channels Channel[]
  members  GroupMember[]
  roles    GroupRole[]
  bans     GroupBan[]

  @@map("groups")
}

model Channel {
  id             String      @id @default(cuid())
  name           String
  type           ChannelType @default(TEXT)
  parentId       String?      // SECTION 分类嵌套
  groupId        String
  converseId     String?      @unique  // TEXT 频道关联 Converse
  sortOrder      Int         @default(0)
  pluginProvider String?
  lastActivityAt DateTime    @default(now())

  group    Group    @relation(fields: [groupId], references: [id])
  converse Converse? @relation(fields: [converseId], references: [id])

  @@index([groupId])
  @@map("channels")
}
```

**验收标准**：
- 所有群组相关表建立成功
- Channel 创建时自动关联 Converse(type=GROUP)
- seed 数据包含 1 个群组 + 2 个频道 + 3 个成员

---

### Phase 6: 群组 CRUD + 邀请系统

**目标**：群组的创建、更新、删除，以及基于 Redis TTL 邀请码的加入机制。

| # | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| 6.1 | 创建 GroupsModule + GroupsService | `apps/server/src/groups/` | 模块可注入 |
| 6.2 | POST `/api/v1/groups` | 创建群组 | 事务：Group + 默认 Channel("general") + Converse + GroupMember(owner) |
| 6.3 | GET `/api/v1/groups` | 用户的群组列表 | 含成员数、最后活跃时间 |
| 6.4 | GET `/api/v1/groups/:id` | 群组详情 | 含频道列表、成员列表 |
| 6.5 | PATCH `/api/v1/groups/:id` | 更新群组信息 | 仅群主或有权限成员 |
| 6.6 | DELETE `/api/v1/groups/:id` | 删除群组 | 软删除，仅群主 |
| 6.7 | POST `/api/v1/groups/:id/invite` | 生成邀请码 | Redis TTL (24h 过期) |
| 6.8 | POST `/api/v1/groups/join/:inviteCode` | 通过邀请码加入 | 验证邀请码 → 创建 GroupMember → 加入频道 Converse |
| 6.9 | DELETE `/api/v1/groups/:id/members/:userId` | 踢出成员 | 需要权限，WS 通知被踢方 |
| 6.10 | POST `/api/v1/groups/:id/leave` | 退出群组 | 群主不可退出（需先转让） |
| 6.11 | Channel CRUD | POST/PATCH/DELETE /groups/:id/channels | 创建频道时自动创建 Converse |
| 6.12 | WS 事件推送 | group:new/updated/deleted, member:joined/left, channel:new/updated/deleted | 广播到 g-{groupId} 房间 |
| 6.13 | 单元测试 | groups.service.spec.ts | 创建 + 邀请 + 加入 + 踢出流程 |

**邀请码机制**：

```typescript
// 生成邀请码
async createInvite(groupId: string, expiresInHours = 24): Promise<string> {
  const code = nanoid(8);  // 短码，如 "xK9m4pQz"
  await this.redis.setex(
    `invite:${code}`,
    expiresInHours * 3600,
    JSON.stringify({ groupId, createdBy: userId }),
  );
  return code;
}

// 使用邀请码加入
async joinByInvite(code: string, userId: string): Promise<Group> {
  const data = await this.redis.get(`invite:${code}`);
  if (!data) throw new NotFoundException('邀请码已过期');
  // ... 创建 GroupMember，加入各频道 Converse
}
```

**关键文件**：

```
apps/server/src/groups/
  ├── groups.module.ts
  ├── groups.controller.ts      # 群组 + 频道 CRUD
  ├── groups.service.ts          # 事务创建、邀请码
  └── dto/
      ├── create-group.dto.ts
      ├── create-channel.dto.ts
      └── group-response.dto.ts
```

**验收标准**：
- 创建群组时自动创建 "general" 频道 + 关联 Converse
- 邀请码 24 小时后过期
- 新成员加入 → g-{groupId} 房间所有人收到 group:member:joined
- 被踢出 → 被踢方收到通知 + 自动离开房间

---

### Phase 7: 群消息（频道广播）

**目标**：群组频道内的消息收发，复用 Sprint 2 的 Message 系统，广播到频道对应的 Converse 房间。

| # | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| 7.1 | 群消息发送 | POST /api/v1/messages（converseId = channel 的 converseId） | 复用现有消息 API |
| 7.2 | 群消息广播 | WS: message:new → {converseId} 房间 | 所有在该频道房间的成员收到 |
| 7.3 | 连接时自动加入群组房间 | handleConnection 中查询用户群组 | 加入 g-{groupId} + 各 {converseId} |
| 7.4 | @提及 | 消息 content 中解析 @userId | metadata 中记录 mentionedUserIds |
| 7.5 | @全体成员 | @everyone / @here | 权限控制：仅管理员可 @everyone |
| 7.6 | 群消息未读 | ConverseMember 机制复用 | 每个群频道独立计数 |
| 7.7 | Flutter 群聊 UI | 左侧频道列表 + 右侧消息 | 类 Discord 布局 |
| 7.8 | Desktop 群聊 UI | 同上 | 同上 |

**验收标准**：
- 群内任意成员发消息 → 所有在线成员实时收到
- 不在频道房间的成员 → 收到 notification:new
- @提及 的用户收到特别通知
- 频道切换时未读数正确更新

---

### Phase 8: Bot 进群

**目标**：Bot 可以被添加为群组成员（Telegram 模式），群内可通过 @Bot 精准调用。

| # | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| 8.1 | Bot 加群 API | POST `/api/v1/groups/:id/bots/:botId` | 将 Bot 的 User 加入 GroupMember |
| 8.2 | Bot 移出群 | DELETE `/api/v1/groups/:id/bots/:botId` | 仅群主/管理员 |
| 8.3 | @Bot 消息路由 | 检测 @CodingBot → 路由到对应 agent | 消息中 @mention 匹配 Bot userId |
| 8.4 | @ai 群聊兜底 | @ai = Supervisor 响应 | Supervisor 可以不在群内也能响应 @ai |
| 8.5 | Bot 回复关联 | Bot 回复携带 replyToMessageId | 明确回复哪条消息 |
| 8.6 | 群内 Bot 列表 | GET `/api/v1/groups/:id` 返回含 Bot 标识 | 成员列表中 Bot 有特殊标识 |

**群聊 Bot 交互示例**：

```
群聊「项目组」（成员：用户, 同事A, @CodingBot）:

  同事A: 这段代码跑不起来
  用户: @CodingBot 帮我看看     ← 精准调用群内 Bot
  CodingBot: [回复同事A] 你缺少 numpy 依赖，建议执行 pip install numpy

  同事B: 周五能搞定吗？
  用户: @ai 帮我回复             ← @ai = Supervisor 兜底
  [ai:whisper:suggestions → 用户]
```

**验收标准**：
- Bot 可被添加到群组
- @CodingBot 消息正确路由到 Coding Bot agent
- @ai 在群聊中触发 Supervisor（即使 Supervisor 不在群内）
- Bot 回复明确关联原始消息

---

### Phase 9: 群权限系统

**目标**：基于角色的权限控制，使用字符串权限列表（学 Tailchat）。

| # | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| 9.1 | 定义权限枚举 | packages/shared | 字符串权限列表 |
| 9.2 | GroupRole CRUD | POST/PATCH/DELETE `/api/v1/groups/:id/roles` | 角色管理 |
| 9.3 | 成员角色分配 | PATCH `/api/v1/groups/:id/members/:userId/roles` | 给成员添加/移除角色 |
| 9.4 | 权限检查 Guard | PermissionGuard | 装饰器 @RequirePermission('MANAGE_CHANNELS') |
| 9.5 | 默认角色 | 新群组自动创建 "管理员" + "成员" 角色 | 群主拥有所有权限 |
| 9.6 | 禁言 | PATCH member.muteUntil | 禁言到期自动解除 |
| 9.7 | 封禁 | POST `/api/v1/groups/:id/bans/:userId` | GroupBan + 踢出 |

**权限列表（学 Tailchat 字符串模式）**：

```typescript
export const GROUP_PERMISSIONS = {
  // 群组管理
  MANAGE_GROUP:    'group.manage',        // 修改群信息
  DELETE_GROUP:    'group.delete',        // 删除群
  MANAGE_ROLES:   'group.manage_roles',   // 管理角色

  // 频道管理
  MANAGE_CHANNELS: 'channel.manage',      // 创建/修改/删除频道

  // 成员管理
  INVITE_MEMBERS:  'member.invite',       // 邀请成员
  KICK_MEMBERS:    'member.kick',         // 踢出成员
  BAN_MEMBERS:     'member.ban',          // 封禁成员
  MUTE_MEMBERS:    'member.mute',         // 禁言成员
  MANAGE_BOTS:     'member.manage_bots',  // 添加/移除 Bot

  // 消息管理
  SEND_MESSAGES:   'message.send',        // 发送消息
  DELETE_MESSAGES: 'message.delete',      // 删除他人消息
  MENTION_ALL:     'message.mention_all', // @everyone / @here
} as const;
```

**权限检查实现**：

```typescript
@Injectable()
export class PermissionGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.get<string>('permission', context.getHandler());
    const userId = request.user.id;
    const groupId = request.params.groupId;

    const member = await this.prisma.groupMember.findUnique({
      where: { userId_groupId: { userId, groupId } },
      include: { group: { include: { roles: true } } },
    });

    // 群主拥有所有权限
    if (member.group.ownerId === userId) return true;

    // 检查成员角色中是否包含所需权限
    const memberRoles = member.group.roles.filter(r => member.roles.includes(r.id));
    return memberRoles.some(r => r.permissions.includes(requiredPermission));
  }
}
```

**验收标准**：
- 默认角色正确创建（管理员有全部权限，成员有基础权限）
- 无权限操作返回 403
- 禁言成员无法发消息，禁言到期自动解除
- 封禁成员自动踢出 + 无法重新加入

---

## 交付物总览

| 交付物 | 描述 | 对应 Phase |
|--------|------|-----------|
| LLM Router | DeepSeek + Kimi 2.5 多 provider 路由 + 降级 | Phase 0 |
| @ai Whisper | 1 主推荐 + 2 备选，<2s | Phase 1 |
| Draft & Verify | PENDING → APPROVED/REJECTED/EXPIRED，5min TTL | Phase 2 |
| Predictive Actions | 上下文分析 → 操作卡片 + 危险分级 | Phase 3 |
| Bot 间通信 | OpenClaw 多 Agent + 触发来源标注 + 限流 | Phase 4 |
| 群组系统 | Group + Channel + Member 全套 CRUD | Phase 5-6 |
| 群消息 | 频道广播 + @提及 + 未读 | Phase 7 |
| Bot 进群 | Telegram 模式 @Bot 调用 + @ai 兜底 | Phase 8 |
| 群权限 | 字符串权限 + 角色 + 禁言/封禁 | Phase 9 |

## 新增 REST API 端点

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/v1/groups` | 创建群组 |
| GET | `/api/v1/groups` | 用户群组列表 |
| GET | `/api/v1/groups/:id` | 群组详情 |
| PATCH | `/api/v1/groups/:id` | 更新群组信息 |
| DELETE | `/api/v1/groups/:id` | 删除群组 |
| POST | `/api/v1/groups/:id/invite` | 生成邀请码 |
| POST | `/api/v1/groups/join/:inviteCode` | 加入群组 |
| POST | `/api/v1/groups/:id/leave` | 退出群组 |
| DELETE | `/api/v1/groups/:id/members/:userId` | 踢出成员 |
| POST | `/api/v1/groups/:id/channels` | 创建频道 |
| PATCH | `/api/v1/groups/:id/channels/:channelId` | 更新频道 |
| DELETE | `/api/v1/groups/:id/channels/:channelId` | 删除频道 |
| POST | `/api/v1/groups/:id/roles` | 创建角色 |
| PATCH | `/api/v1/groups/:id/roles/:roleId` | 更新角色 |
| DELETE | `/api/v1/groups/:id/roles/:roleId` | 删除角色 |
| PATCH | `/api/v1/groups/:id/members/:userId/roles` | 分配角色 |
| POST | `/api/v1/groups/:id/bans/:userId` | 封禁成员 |
| POST | `/api/v1/groups/:id/bots/:botId` | 添加 Bot 到群 |
| DELETE | `/api/v1/groups/:id/bots/:botId` | 移除群内 Bot |

## 新增 WS 事件

| 事件名 | 方向 | 说明 |
|--------|------|------|
| `ai:whisper:suggestions` | S→C | 回复建议推送 |
| `ai:whisper:request` | C→S | 请求 AI 建议（@ai 触发） |
| `ai:whisper:accept` | C→S | 采纳建议 |
| `ai:draft:created` | S→C | 草稿卡片推送 |
| `ai:draft:approve` | C→S | 批准草稿 |
| `ai:draft:reject` | C→S | 拒绝草稿 |
| `ai:draft:edit` | C→S | 编辑后批准 |
| `ai:draft:expired` | S→C | 草稿过期通知 |
| `ai:predictive:action` | S→C | 预测操作卡片 |
| `ai:predictive:execute` | C→S | 执行预测操作 |
| `ai:predictive:dismiss` | C→S | 忽略预测 |
| `group:new` | S→C | 新群组通知 |
| `group:updated` | S→C | 群组更新 |
| `group:deleted` | S→C | 群组删除 |
| `group:member:joined` | S→C | 成员加入 |
| `group:member:left` | S→C | 成员离开 |
| `channel:new` | S→C | 新频道 |
| `channel:updated` | S→C | 频道更新 |
| `channel:deleted` | S→C | 频道删除 |

## 里程碑检查点

| 检查点 | 验收内容 | 对应 Phase |
|--------|---------|-----------|
| **M1** | LLM 可调用：DeepSeek + Kimi 2.5 双 provider + 降级逻辑 | Phase 0 |
| **M2** | @ai 可用：输入 @ai → 2 秒内收到建议 → 采纳后发送 | Phase 1 |
| **M3** | Draft 可用：Bot 生成草稿 → 用户确认 → 执行命令/发消息 | Phase 2 |
| **M4** | Predictive 可用：错误上下文 → 操作卡片 → 确认执行 | Phase 3 |
| **M5** | Bot 互通：A 完成任务 → B 收到协作通知 + 来源标注 | Phase 4 |
| **M6** | 群组可用：创建 → 邀请 → 加入 → 发消息 → 全员收到 | Phase 5-7 |
| **M7** | 群内 Bot：@CodingBot 精准调用 + @ai 兜底 | Phase 8 |
| **M8** | 权限系统：角色分配 + 权限检查 + 禁言/封禁 | Phase 9 |

---

## Sprint 3 不做的事

| 功能 | 原因 | 何时做 |
|------|------|--------|
| 文件/图片/语音消息 | Sprint 3 仍为纯文本 | Sprint 4 |
| 推送通知 (FCM / APNs) | 依赖 WS 实时连接 | Sprint 4 |
| 消息搜索 | PG 全文搜索配置 | Sprint 4 |
| i18n | 硬编码中文 | Sprint 4 |
| 消息撤回（增强） | Sprint 2 已有基础软删除 | Sprint 4（加时间限制） |
| 语音/视频通话 | 明确排除出 MVP | 未规划 |
| 生产部署 | 仍跑 localhost | Sprint 4 |
| Ghost Text (灰体补全) | v2+ 计划，需要本地小模型 | 未规划 |

**完成后进入 → [Sprint 4](./sprint4_implement.md)**
