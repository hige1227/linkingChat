# Sprint 3 线 A 实施记录（AI 模块）

> **目标**：实现 AI 全链路 — LLM 多模型路由、@ai 耳语建议、Draft & Verify 草稿确认、预测执行卡片、Bot 间通信
>
> **全部完成**：Phase 0 → 1 → 2 → 3 → 4（共 5 个 Phase）
>
> **完成日期**：2026-02-16
>
> **工作分支**：`feat/sprint3-ai`（基于 main）
>
> **代码统计**：新增 12 个源文件 + 5 个测试文件，修改 10 个已有文件，约 2,500+ 行代码

---

## 当前进度

| Phase | 内容 | 状态 | 新增测试 | Commit |
|-------|------|------|----------|--------|
| Phase 0 | LLM 路由器（DeepSeek + Kimi） | ✅ 完成 | 16 | `580d270` |
| Phase 1 | @ai 耳语建议触发 | ✅ 完成 | 17 | `e369ef8` [SHARED] |
| Phase 2 | Draft & Verify 草稿状态机 | ✅ 完成 | 14 | `a5dd3de` |
| Phase 3 | Predictive Actions 预测执行 | ✅ 完成 | 26 | `a962514` |
| Phase 4 | Bot 间通信 + 限流 | ✅ 完成 | 27 | `5a19174` [SHARED] |

### 构建验证

```
pnpm build    → 4/4 packages 编译通过
pnpm test     → 12 suites, 202 tests passed

  PASS src/app.controller.spec.ts                        (2 tests)
  PASS src/friends/friends.service.spec.ts               (24 tests)
  PASS src/messages/messages.service.spec.ts             (18 tests)  ← +2 (Whisper mock)
  PASS src/gateway/presence.service.spec.ts              (14 tests)
  PASS src/converses/converses.service.spec.ts           (21 tests)
  PASS src/bots/bots.service.spec.ts                     (19 tests)
  PASS src/bots/bot-init.service.spec.ts                 (6 tests)
  PASS src/ai/services/llm-router.service.spec.ts        (16 tests)  ← NEW
  PASS src/ai/services/whisper.service.spec.ts           (17 tests)  ← NEW
  PASS src/ai/services/draft.service.spec.ts             (14 tests)  ← NEW
  PASS src/ai/services/predictive.service.spec.ts        (26 tests)  ← NEW
  PASS src/bots/bot-communication.service.spec.ts        (27 tests)  ← NEW
```

> ⚠️ 已知：DraftService 的 `setTimeout` 会导致 Jest 输出 "worker process failed to exit gracefully" 警告，不影响测试结果。

---

## Phase 0：LLM 路由器

### 一句话总结

实现了多 LLM Provider 的路由框架，支持按任务类型自动选择模型（DeepSeek 低延迟 / Kimi 高质量），主模型 3 秒超时自动回退到备用模型。

### 核心设计

```
                    ┌─────────────────┐
  complete(req) ──→ │  LlmRouterService │
                    │                   │
                    │  taskType 路由：   │
                    │  whisper/predict  │──→ DeepSeek (3s timeout)
                    │  → deepseek       │      ↓ fallback
                    │                   │    Kimi (10s timeout)
                    │  draft/complex   │──→ Kimi (3s timeout)
                    │  → kimi           │      ↓ fallback
                    │                   │    DeepSeek (10s timeout)
                    └─────────────────┘
```

**路由策略**：

| 任务类型 | 主模型 | 原因 |
|----------|--------|------|
| `whisper` | DeepSeek | 需要 <2s 响应，简单补全 |
| `predictive` | DeepSeek | 低延迟优先，生成操作卡片 |
| `chat` | DeepSeek | 一般对话 |
| `draft` | Kimi | 质量优先，生成草稿需要准确 |
| `complex_analysis` | Kimi | 复杂分析任务 |

### 新增文件

```
apps/server/src/ai/
├── providers/
│   ├── llm-provider.interface.ts   # LlmProvider 接口 + LlmRequest/Response/Chunk 类型
│   ├── deepseek.provider.ts        # DeepSeek API 客户端（OpenAI 兼容，原生 fetch + SSE 流）
│   └── kimi.provider.ts            # Kimi/Moonshot API 客户端（同上）
├── dto/
│   └── llm-request.dto.ts          # class-validator 校验 DTO
├── services/
│   ├── llm-router.service.ts       # 路由核心：provider 选择 + 超时回退 + 指标日志
│   └── llm-router.service.spec.ts  # 16 个单测
├── ai.controller.ts                # GET /api/v1/ai/health 健康检查
└── ai.module.ts                    # NestJS 模块注册
```

### 修改文件

| 文件 | 变更 |
|------|------|
| `apps/server/src/app.module.ts` | 导入 `AiModule` |
| `apps/server/.env.example` | 新增 `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, `KIMI_API_KEY`, `KIMI_BASE_URL`, `KIMI_MODEL` |

### 环境变量

```env
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1      # 默认值
DEEPSEEK_MODEL=deepseek-chat                        # 默认值

KIMI_API_KEY=sk-xxx
KIMI_BASE_URL=https://api.moonshot.cn/v1            # 默认值
KIMI_MODEL=moonshot-v1-8k                           # 默认值
```

---

## Phase 1：@ai 耳语建议

### 一句话总结

用户在消息中输入 `@ai` 时自动触发建议生成：提取最近 20 条上下文 → LLM 生成 1 条主建议 + 2 条备选 → WS 实时推送到客户端。

### 触发流程

```
用户发送 "这个方案怎么样？@ai"
        ↓
MessagesService.create()
        ↓ 检测 (?<!\w)@ai\b
        ↓ fire-and-forget（不阻塞消息发送）
WhisperService.handleWhisperTrigger()
        ↓
1. extractContext() — 最近 20 条消息格式化为 "displayName: content"
2. generateSuggestions() — LLM 调用（2s maxTokens: 512）
3. parseSuggestions() — JSON 优先，行解析兜底
4. Prisma 持久化 AiSuggestion (type: WHISPER)
5. BroadcastService.toRoom() → ai:whisper:suggestions
```

### 新增文件

```
apps/server/src/ai/services/
├── whisper.service.ts              # @ai 触发检测 + 上下文提取 + 建议生成
└── whisper.service.spec.ts         # 17 个单测

packages/ws-protocol/src/payloads/
└── ai.payloads.ts                  # WhisperSuggestionsPayload, DraftCreatedPayload, PredictiveActionPayload 等全部 AI WS 类型
```

### 修改文件

| 文件 | 变更 |
|------|------|
| `apps/server/src/messages/messages.service.ts` | 注入 WhisperService，`create()` 方法中检测 `@ai` 触发 |
| `apps/server/src/messages/messages.module.ts` | 导入 `AiModule` |
| `apps/server/src/messages/messages.service.spec.ts` | 添加 WhisperService mock |
| `packages/ws-protocol/src/events.ts` | 新增 `AI_EVENTS` 常量 |
| `packages/ws-protocol/src/typed-socket.ts` | 新增 AI 事件类型签名 |
| `packages/ws-protocol/src/index.ts` | 导出 `ai.payloads` |

### Prisma Schema 变更

新增 2 个枚举 + 2 个模型：

```prisma
enum AiSuggestionType { WHISPER, PREDICTIVE }
enum AiSuggestionStatus { PENDING, ACCEPTED, DISMISSED }
enum DraftStatus { PENDING, APPROVED, REJECTED, EXPIRED }

model AiSuggestion {
  id            String   @id @default(cuid())
  type          AiSuggestionType
  status        AiSuggestionStatus @default(PENDING)
  userId        String
  converseId    String
  messageId     String?
  suggestions   Json
  selectedIndex Int?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model AiDraft {
  id            String   @id @default(cuid())
  status        DraftStatus @default(PENDING)
  userId        String
  converseId    String
  botId         String
  draftType     String
  draftContent  Json
  editedContent Json?
  rejectReason  String?
  expiresAt     DateTime
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

> ⚠️ `prisma generate` 因 Windows DLL 文件锁未成功执行，需要手动重新运行。Schema 变更已写入，测试通过（使用 mock）。

---

## Phase 2：Draft & Verify 草稿确认

### 一句话总结

实现草稿状态机 PENDING → APPROVED / REJECTED / EXPIRED，Bot 生成草稿后用户必须确认才执行。Redis TTL 5 分钟自动过期 + WS 推送过期通知。

### 状态机

```
         ┌──── APPROVED (用户批准)
         │
PENDING ─┼──── REJECTED (用户拒绝，可附原因)
         │
         └──── EXPIRED  (5 分钟 TTL 到期)
```

### 核心方法

| 方法 | 说明 |
|------|------|
| `createDraft()` | LLM 生成 → DB 持久化 → Redis setex(300s) → WS 推送 → 启动过期定时器 |
| `approveDraft()` | 校验 PENDING + 未过期 → APPROVED → 清理 Redis → 返回草稿内容 |
| `rejectDraft()` | REJECTED（可选 reason）→ 清理 Redis |
| `editAndApproveDraft()` | 用户修改内容后批准 → APPROVED + editedContent |
| `expireDraft()` | EXPIRED → WS 通知 `ai:draft:expired` |
| `parseDraftContent()` | 解析 LLM 输出：message 类型返回 `{content}`，command 类型返回 `{content, action, args}` |

### 新增文件

```
apps/server/src/ai/services/
├── draft.service.ts                # 草稿状态机 + Redis TTL + WS 推送
└── draft.service.spec.ts           # 14 个单测
```

---

## Phase 3：Predictive Actions 预测执行

### 一句话总结

分析 shell 错误输出（8 种触发模式）→ LLM 生成修复建议 → 三级危险分类（safe / warning / dangerous）→ WS 推送操作卡片。

### 触发模式（优先级从高到低）

| 类别 | 匹配模式 | 示例 |
|------|----------|------|
| `package_error` | `npm ERR!\|yarn error\|pnpm ERR` | `npm ERR! missing script: start` |
| `build_error` | `build failed\|compile error\|syntax error` | `Build failed with 3 errors` |
| `exception` | `exception\|traceback\|stack trace` | `Traceback (most recent call last)` |
| `permission` | `permission denied\|access denied\|EACCES` | `EACCES: permission denied` |
| `not_found` | `not found\|no such file\|ENOENT` | `ENOENT: no such file or directory` |
| `timeout` | `timeout\|timed out\|ETIMEDOUT` | `ETIMEDOUT: connection timed out` |
| `network` | `ECONNREFUSED\|ECONNRESET\|connection refused` | `ECONNREFUSED 127.0.0.1:5432` |
| `error`（兜底） | `\bErr(?:or)?[\s:!]\|\bfailed\b\|\bfailure\b` | `Error: something went wrong` |

> 注意：触发器按从具体到通用排序，避免 `error` 模式吞掉 `package_error` 等具体类型。`error` 正则经过调整，不会误匹配 `"Build successful. 0 errors."` 这类成功信息。

### 危险等级分类

```
┌─────────────────────────────────────────────────┐
│ dangerous（黑名单，引用 Sprint 1 DANGEROUS_PATTERNS）  │
│   rm -rf /, shutdown, reboot, dd if=, curl|sh   │
├─────────────────────────────────────────────────┤
│ warning（破坏性但非灾难性）                        │
│   rm, git reset, docker prune, kill, DROP TABLE  │
├─────────────────────────────────────────────────┤
│ safe（其他所有命令）                               │
│   cat, ls, npm install, git status              │
└─────────────────────────────────────────────────┘
```

### 新增文件

```
apps/server/src/ai/services/
├── predictive.service.ts           # 触发检测 + LLM 生成 + 危险分类 + WS 推送
└── predictive.service.spec.ts      # 26 个单测
```

---

## Phase 4：Bot 间通信

### 一句话总结

Bot A 完成任务后可通知 Bot B，消息带 `[来自 XX Bot 的协作]` 标签。实现了限流保护（5 次/分钟、3 层链式深度、循环检测）和 Supervisor 意图路由。

### 通信流程

```
Coding Bot 完成数据爬取
        ↓
BotCommunicationService.sendBotMessage()
        ↓
1. 自发检查（不能发给自己）
2. 循环检测（A→B→A 直接拒绝）
3. 链深度检查（最多 3 层：A→B→C）
4. 限流检查（同一 Bot 对另一个 Bot 最多 5次/分钟）
5. 查找双方 Bot 记录
6. 查找目标 Bot 的 DM 会话
7. 构建 triggerSource 元数据
8. 持久化消息（type: BOT_NOTIFICATION, metadata: {triggerSource}）
9. WS 推送 bot:cross:notify 到用户
```

### 限流规则

| 规则 | 限制 |
|------|------|
| 频率限制 | 同一 Bot 对另一 Bot：5 次/分钟（滑动窗口） |
| 链式深度 | 最多 3 层（A→B→C，不允许 C→D） |
| 循环检测 | A→B→A 直接拒绝 |
| 自发消息 | 不允许 Bot 发给自己 |

### Supervisor 意图路由

当用户不确定找谁时，`routeViaSupervisor()` 会：
1. 获取用户所有 Bot 的名称和描述
2. LLM 分析用户意图
3. 返回推荐的 Bot（含 confidence 和 reason）
4. JSON 解析失败时回退到文本匹配

### 新增文件

```
apps/server/src/bots/
├── bot-communication.service.ts    # Bot 间消息路由 + 限流 + Supervisor 路由
└── bot-communication.service.spec.ts # 27 个单测
```

### 修改文件

| 文件 | 变更 |
|------|------|
| `apps/server/src/bots/bots.module.ts` | 导入 `AiModule`，注册 `BotCommunicationService` |
| `packages/ws-protocol/src/payloads/ai.payloads.ts` | 新增 `TriggerSource`, `BotNotificationPayload`, `SupervisorRouteResult` |
| `packages/ws-protocol/src/events.ts` | 新增 `BOT_CROSS_NOTIFY` 事件 |
| `packages/ws-protocol/src/typed-socket.ts` | 新增 `bot:cross:notify` 事件签名 |

### WS 事件

| 事件 | 方向 | 说明 |
|------|------|------|
| `bot:cross:notify` | S→C | 跨 Bot 通知推送到用户 |

### Message.metadata 扩展

```json
{
  "triggerSource": {
    "botId": "bot-coding-001",
    "botName": "Coding Bot",
    "reason": "数据爬取完成"
  }
}
```

---

## 全部新增文件汇总

```
apps/server/src/ai/
├── providers/
│   ├── llm-provider.interface.ts       # LLM 抽象接口 + 类型定义
│   ├── deepseek.provider.ts            # DeepSeek API 客户端
│   └── kimi.provider.ts                # Kimi/Moonshot API 客户端
├── dto/
│   └── llm-request.dto.ts              # LLM 请求 DTO
├── services/
│   ├── llm-router.service.ts           # 多模型路由 + 回退
│   ├── llm-router.service.spec.ts      # 16 tests
│   ├── whisper.service.ts              # @ai 耳语建议
│   ├── whisper.service.spec.ts         # 17 tests
│   ├── draft.service.ts                # Draft & Verify 状态机
│   ├── draft.service.spec.ts           # 14 tests
│   ├── predictive.service.ts           # 预测执行卡片
│   └── predictive.service.spec.ts      # 26 tests
├── ai.controller.ts                    # AI 健康检查端点
└── ai.module.ts                        # AI 模块

apps/server/src/bots/
├── bot-communication.service.ts        # Bot 间通信 + 限流
└── bot-communication.service.spec.ts   # 27 tests

packages/ws-protocol/src/payloads/
└── ai.payloads.ts                      # 全部 AI WS payload 类型
```

## 全部修改文件汇总

| 文件 | Phase | 变更说明 |
|------|-------|----------|
| `apps/server/src/app.module.ts` | 0 | 导入 AiModule |
| `apps/server/.env.example` | 0 | 新增 6 个 LLM 配置项 |
| `apps/server/prisma/schema.prisma` | 1 | 新增 AiSuggestion, AiDraft 模型 + 3 个枚举 |
| `apps/server/src/messages/messages.service.ts` | 1 | 注入 WhisperService，检测 @ai 触发 |
| `apps/server/src/messages/messages.module.ts` | 1 | 导入 AiModule |
| `apps/server/src/messages/messages.service.spec.ts` | 1 | 添加 WhisperService mock |
| `packages/ws-protocol/src/events.ts` | 1, 4 | AI_EVENTS + BOT_CROSS_NOTIFY |
| `packages/ws-protocol/src/index.ts` | 1 | 导出 ai.payloads |
| `packages/ws-protocol/src/typed-socket.ts` | 1, 4 | AI 事件类型签名 + bot:cross:notify |
| `apps/server/src/bots/bots.module.ts` | 4 | 导入 AiModule + BotCommunicationService |

---

## 已知问题 / 待办

| 项目 | 状态 | 说明 |
|------|------|------|
| `prisma generate` | ⚠️ 待执行 | Windows DLL 文件锁导致 EPERM，需关闭所有 Node 进程后重新运行 |
| `prisma migrate dev` | ⚠️ 待执行 | 需要先 generate 成功后执行数据库迁移 |
| Draft 过期机制 | ℹ️ 简易实现 | 当前用 `setTimeout`，生产环境应改用 BullMQ delayed jobs 或 Redis keyspace notifications |
| 限流持久化 | ℹ️ 简易实现 | Bot 间通信限流使用内存 Map，重启清空。生产环境应改用 Redis |
| UI 实现 | 📋 待做 | Flutter + Desktop 的 Whisper 建议、Draft 卡片、Predictive 卡片、跨 Bot 通知 UI 均未实现 |

---

## 手动验证指南

### 1. 运行全量测试

```bash
cd apps/server
npx jest --no-coverage
# 预期：12 suites, 202 tests, 全部 PASS
```

### 2. 运行单模块测试

```bash
npx jest llm-router --no-coverage        # Phase 0
npx jest whisper --no-coverage            # Phase 1
npx jest draft.service --no-coverage      # Phase 2
npx jest predictive --no-coverage         # Phase 3
npx jest bot-communication --no-coverage  # Phase 4
```

### 3. 构建验证

```bash
pnpm build   # 项目根目录，4 个包全部编译通过
```

### 4. Prisma 迁移（首次启动前必须执行）

```bash
cd apps/server
npx prisma generate
npx prisma migrate dev --name sprint3-ai-models
```

### 5. 配置 LLM API 密钥

在 `apps/server/.env` 中填入：

```env
DEEPSEEK_API_KEY=your-key
KIMI_API_KEY=your-key
```

### 6. 健康检查

```bash
pnpm dev:server
curl http://localhost:3008/api/v1/ai/health
```
