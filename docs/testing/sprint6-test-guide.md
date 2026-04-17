# Sprint 6 增量测试指南

> **基准 commit**: `823f8ea` (Sprint 5 完成后的状态)
> **当前 commit**: `7bdd3f2`
> **新增 commits**: 30 个
> **变更文件**: 41 个源文件 (+1,583 / -132 行)
> **更新日期**: 2026-04-17

---

## 变更概览

自 `823f8ea` 以来，上游新增了两大块功能：

| 批次 | 功能 | 新增/改动文件 | 可测性 |
|------|------|--------------|--------|
| **A. AgentProvider 架构** | Desktop 端 LLM 引擎抽象层 | 10 新文件 | 需要 Hermes 二进制或切 Provider |
| **B. Sprint 6 Wake Up Jarvis** | 三个 AI 服务接入真实流程 | 14 文件修改 | 直接可测 |

---

## A. AgentProvider 架构 (全新代码)

### A1. 新增文件清单

| 文件 | 说明 |
|------|------|
| `apps/desktop/src/main/agents/agent-provider.interface.ts` | AgentProvider 接口 + ChatChunk 类型 + AgentType 联合类型 |
| `apps/desktop/src/main/agents/agent-provider.factory.ts` | 工厂模式，根据 AgentType 创建适配器，electron-store 持久化选择 |
| `apps/desktop/src/main/agents/openclaw.adapter.ts` | OpenClaw 适配器，封装现有 openclaw-client.service WS 客户端 |
| `apps/desktop/src/main/agents/hermes.adapter.ts` | Hermes 适配器，HTTP SSE 连接本地 Hermes 进程 (端口 8765) |
| `apps/desktop/src/main/services/hermes-process.service.ts` | Hermes 子进程生命周期管理 (spawn/stop/restart/health check) |
| `apps/desktop/src/main/services/setup.service.ts` | 首次启动时从 Server 获取 LLM API key |
| `apps/desktop/src/main/ipc/agent.ipc.ts` | IPC handler: `agent:get-type`, `agent:set-type` |
| `apps/server/src/config/config.controller.ts` | `GET /config/agent-key` 返回 LLM API key |
| `apps/server/src/config/config.module.ts` | Config NestJS module |
| `scripts/bundle-agents.sh` | OpenClaw + Hermes 离线打包脚本 |
| `scripts/vendor-hermes.sh` | Hermes 二进制 vendor 脚本 |

### A2. 架构关系

```
                      AgentProvider (统一接口)
                     /                      \
            OpenClawAdapter              HermesAdapter
            (WS 协议，现有)              (HTTP SSE，OpenAI 兼容)
                   |                            |
           本地 OpenClaw Gateway          本地 Hermes 进程 (:8765)
                   |                            |
           MiniMax-M2.7 等               任意 OpenAI 兼容模型
```

**不是替换关系，是共存关系：**
- Desktop 启动时 **两个 sidecar 都会 pre-warm** (`index.ts:52-58`)
- **默认使用 OpenClaw** (`agent-provider.factory.ts:25` — `store.get('agentType', 'openclaw')`)
- Bot 聊天的流式通道已重构为走 `AgentProviderFactory.active()` (`openclaw.ipc.ts:275`)
- 可通过 IPC `agent:set-type` 切换 Provider
- 选择持久化到 electron-store

### A3. openclaw.ipc.ts 重构

**之前 (823f8ea)**: `openclaw:stream-start` 直接调用 `openClawClientService.getClient().chat()`, 含手动 empty-response 重试逻辑 (~78 行)

**之后 (7bdd3f2)**: 调用 `AgentProviderFactory.active().chat()`, 自动走 OpenClaw 或 Hermes (~35 行)

### A4. Hermes 对接测试

#### 前提：获取 Hermes 二进制

Hermes 是一个 OpenAI 兼容的本地 LLM Gateway。当前项目没有内置二进制，需要自行准备：

```bash
# 方案 1: 如果 Hermes 已全局安装
# hermes-process.service.ts 会尝试从 resources/hermes-env/lib/Scripts/hermes.exe 加载
# 开发模式下可能找不到，但不影响 OpenClaw 路径

# 方案 2: 暂时跳过 Hermes，继续用 OpenClaw
# 这是当前推荐的测试路径
```

#### 测试步骤

**A4.1 验证 OpenClaw 路径未受影响**
1. 启动 `pnpm dev:desktop`
2. 登录后观察控制台：应看到 `[Main] OpenClaw Gateway connected`
3. 打开 Jarvis Bot 对话，发一条消息
4. 确认流式回复正常（走 OpenClawAdapter → OpenClaw WS）
5. **预期**: 行为与 823f8ea 完全一致

**A4.2 验证 AgentProvider 切换 (需要 Hermes 二进制)**
1. 确保 Hermes 进程运行在 `http://127.0.0.1:8765`
2. 通过 DevTools Console 执行:
   ```js
   // 查看当前 Provider
   await window.api.getAgentType() // → 'openclaw'

   // 切换到 Hermes
   await window.api.setAgentType('hermes')

   // 确认切换成功
   await window.api.getAgentType() // → 'hermes'
   ```
3. 打开 Jarvis Bot 对话，发消息
4. 确认流式回复走 Hermes (HTTP SSE)
5. 切回 OpenClaw: `await window.api.setAgentType('openclaw')`
6. 重启 Desktop，确认持久化: `await window.api.getAgentType()` 应返回上次选择的值

**A4.3 验证 Hermes 进程管理**
1. 启动 Desktop，检查 Hermes 进程是否被 spawn:
   - 控制台应有 `[Hermes:Process] Started on port 8765` 或 `Hermes binary not found`
   - 二进制不存在时不应崩溃，只 warn 并 fallback 到 OpenClaw
2. 退出 Desktop，确认 Hermes 进程被正确终止

**A4.4 验证 SetupService**
1. 确保 Server 运行且已配置 `DEEPSEEK_API_KEY`
2. 清除 electron-store 中的 setup 标记
3. 启动 Desktop，观察是否调用 `GET /config/agent-key`
4. Server 日志应显示 config 请求

---

## B. Sprint 6: Wake Up Jarvis (核心新功能)

### B1. Whisper 自动触发

**823f8ea 状态**: WhisperService 只能通过手动点击 UI 按钮触发 (`ai:whisper:request` WS 事件)
**7bdd3f2 状态**: DM 收到 TEXT 消息时自动触发 Whisper

#### 代码变更

| 文件 | 变更 |
|------|------|
| `apps/server/src/messages/messages.service.ts` | 新增 WhisperService 注入 + DM TEXT 消息自动触发逻辑 |
| `apps/server/src/ai/services/whisper.service.ts` | 新增 `shouldTrigger()` 质量门控方法 |
| `apps/desktop/src/renderer/components/chat/MessageInput.tsx` | 非群聊/BOT 会话显示 `<WhisperBar>` |
| `apps/desktop/src/renderer/components/chat/WhisperBar.tsx` | 标签 `@ai` → `✨ Jarvis`，新增 dismiss 遥测 |
| `apps/desktop/src/renderer/hooks/useChatSocket.ts` | 新增 `emitWhisperDismiss` 方法 |

#### 测试步骤

**B1.1 DM 消息自动触发 Whisper**
1. 准备两个账号 A 和 B（可用 Desktop + 手机，或两个浏览器）
2. A 打开与 B 的 DM 对话
3. B 给 A 发一条文字消息，例如 "今天下午三点开会"
4. 观察 A 的 Desktop:
   - 输入框下方应出现 `✨ Jarvis` 建议条
   - 建议条显示 1 个主建议 (如 "好的，收到")
   - 右侧有 `···` 按钮可展开 2 个备选建议
5. 点击主建议 → 文字填入输入框 → 可编辑 → 发送
6. 点击 `···` → 展开备选列表 → 点选一个 → 填入输入框

**B1.2 shouldTrigger 质量门控**
以下消息 **不应触发** Whisper：
- 空消息 / null
- 少于 3 个字符的消息 (如 "ok", "好")
- 纯 emoji 消息 (如 "👍🎉")
- 非 TEXT 类型消息 (图片、文件、语音)

以下消息 **应该触发** Whisper：
- "今天下午开会" (>3 字符，有文字内容)
- "Hello, how are you?" (英文正常触发)
- "好的没问题" (包含中文)

**B1.3 仅限 DM 触发**
1. A 和 B 在同一群聊中
2. B 在群里发消息
3. A 不应看到 Whisper 建议条
4. (代码: `converse?.type === ConverseType.DM` 限制)

**B1.4 Dismiss 遥测**
1. 触发 Whisper 后，点击建议条右侧 `×` 关闭
2. 观察 DevTools Network → WS: 应发出 `ai:whisper:dismiss` 事件

---

### B2. SupervisorAgent 意图分类 + Draft 路由

**823f8ea 状态**: SupervisorAgent 收到 @ai 消息后，直接用 LLM 生成文字回复
**7bdd3f2 状态**: 一次 LLM 调用同时做意图分类 (chat/draft) + 生成内容，draft 意图时调用 DraftService

#### 代码变更

| 文件 | 变更 |
|------|------|
| `apps/server/src/agents/impl/supervisor.agent.ts` | 新增 `DraftService` 注入，意图分类 prompt，`parseIntentResponse()`，draft/chat 分支路由 |
| `apps/server/src/ai/ai.controller.ts` | DraftType 从字符串改为枚举引入 |
| `apps/server/src/ai/services/draft.service.ts` | DraftType 改为从 Prisma 枚举引入 |
| `apps/server/prisma/migrations/20260416000000_add_draft_type_enum/` | 新增 DraftType enum migration |
| `apps/desktop/src/renderer/components/chat/ChatThread.tsx` | 渲染 DraftCard + PredictiveActionCard |

#### 测试步骤

**B2.1 普通聊天意图 (chat)**
1. 打开 **Jarvis (Supervisor Bot)** 对话窗口
2. 发送普通问题: "你好" 或 "今天天气怎么样"
3. 预期: Jarvis 直接文字回复 (无 DraftCard)
4. Server 日志: `Chat reply sent to converse xxx`

**B2.2 代写意图 (draft)**
1. 在 Jarvis 对话中发送: "帮我回复张总说周五开会没问题"
2. 预期: 出现 **DraftCard 草稿卡片** (不是直接文字回复)
3. DraftCard 应显示:
   - 草稿内容 (如 "张总您好，周五的会议没问题，我会准时参加。")
   - 倒计时 (5 分钟 TTL)
   - 确认 / 编辑 / 拒绝 按钮
4. Server 日志: `Draft created for user xxx in converse xxx`

**B2.3 更多 draft 触发句式**
以下应识别为 draft 意图:
- "帮我回复李总说项目进展顺利"
- "帮我写一段感谢的话发给王总"
- "替我跟他说下周见"
- "帮我发消息给小明说晚点到"

以下应识别为 chat 意图:
- "你好"
- "今天几号"
- "帮我查一下天气" (不含"回复/发"等关键词)

**B2.4 DraftCard 交互**
1. 触发 draft 后，DraftCard 出现在聊天流中
2. 点 **确认** → 草稿内容发送到目标会话
3. 点 **编辑** → 可修改草稿内容后再确认
4. 点 **拒绝** → 草稿取消，不发送
5. 等 5 分钟 → 草稿自动过期

**B2.5 LLM 返回非法 JSON 时的降级**
1. SupervisorAgent 的 `parseIntentResponse()` 对非 JSON 输出做了降级处理
2. 如果 LLM 返回非 JSON，整段文字作为 chat 回复
3. 不会崩溃或产生未处理异常

---

### B3. Predictive Actions 接线

**823f8ea 状态**: `PredictiveService.detectTrigger()` 从未被任何代码调用
**7bdd3f2 状态**: BotEventListener 中命令执行 error 时自动调用

#### 代码变更

| 文件 | 变更 |
|------|------|
| `apps/server/src/agents/events/bot-event.listener.ts` | 新增 PredictiveService 注入 + Redis 限流 + error 时触发 detectTrigger |
| `apps/desktop/src/renderer/components/chat/ChatThread.tsx` | 渲染 PredictiveActionCard |

#### 测试步骤

**B3.1 命令失败触发 Predictive**
1. 通过手机或 Desktop 执行一个注定失败的命令 (如 `ls /nonexistent_path_12345`)
2. 等待命令返回 error
3. 打开 **Jarvis 对话窗口**
4. 预期: 出现 PredictiveActionCard，显示:
   - 错误分析
   - 建议的修复操作
   - 安全级别标记 (safe/warning/dangerous)

**B3.2 Redis 限流**
1. 连续触发多次命令失败
2. 每 60 秒同一用户+设备只会触发一次 Predictive 分析
3. 不会产生大量 LLM 调用

**B3.3 正常命令不触发**
1. 执行成功的命令 (如 `echo hello`)
2. Jarvis 不应收到 Predictive 通知

---

## C. 其他变更 (非功能测试)

| 变更 | 文件 | 说明 |
|------|------|------|
| DraftType 枚举 | `prisma/schema.prisma` + migration | `draftType` 字段从 String → DraftType enum (MESSAGE/COMMAND) |
| Strict TS | `bot-communication.service.ts`, `bot-init.service.ts` | lambda 参数添加显式类型注解 |
| N+1 修复 | `converses.service.ts` | 未读计数批量查询 |
| 生产安全 | `gateway-manager.service.ts` | 生产环境强制 OPENCLAW_GATEWAY_TOKEN |
| CI | `.github/workflows/ci.yml` | 安全审计 block on high vulnerabilities |

### C1. DraftType Migration 验证

```bash
# 确认 migration 已应用
cd apps/server && npx prisma migrate status

# 确认 enum 存在
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.\$queryRaw\`SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid = pg_enum.enumtypid WHERE typname = 'DraftType'\`
  .then(r => { console.log('DraftType values:', r); p.\$disconnect(); });
"
```

预期输出: `MESSAGE`, `COMMAND`

---

## D. 回归测试清单

以下功能在 `823f8ea` 已验证通过，需确认合并后未受影响:

| # | 功能 | 验证方式 |
|---|------|---------|
| 1 | DM 发消息 | A↔B 发消息，双方收到 |
| 2 | 群聊发消息 | 群内发消息，所有成员收到 |
| 3 | Bot DM 流式回复 | 给 Jarvis 发消息，流式回复正常 |
| 4 | OpenClaw 心跳 | Desktop 控制台显示 `openclawConnected=true` |
| 5 | @ai 群聊触发 | 群里发 "@ai 你好"，SupervisorAgent 回复 |
| 6 | Token 自动刷新 | 长时间使用不因 token 过期断连 |
| 7 | 消息撤回 | 发送后撤回，对方看不到 |
| 8 | 语音消息 | 录制并发送，对方可播放 |
| 9 | 好友添加/删除 | 搜索用户 → 发送请求 → 接受/拒绝 |
| 10 | 设备远程命令 | 手机发命令 → Desktop 执行 → 结果返回 |

---

## E. 已知问题

### E1. ChatThread.tsx 无限循环 (已修复)

**问题**: 上游代码 `useAiStore((s) => s.drafts[converseId] ?? [])` 中 `?? []` 每次渲染创建新数组引用，导致 React 无限重渲染。

**修复**: 已在本地改为 `useMemo` + 去掉 fallback 空数组：
```tsx
const drafts = useAiStore((s) => s.drafts[converseId]) as DraftItem[] | undefined;
const pendingDrafts = useMemo(
  () => (drafts ?? []).filter(d => d.status === 'pending' || ...),
  [drafts],
);
```

### E2. DraftType Migration 列名不匹配

**问题**: migration SQL 中使用 `draft_type` (snake_case)，但 Prisma 实际列名是 `draftType` (camelCase)。且已有数据是小写 `message`，而 enum 定义大写 `MESSAGE`。

**修复**: 已手动执行修正后的 SQL 并标记 migration 为已应用。
