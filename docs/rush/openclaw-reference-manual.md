# OpenClaw 参考手册 — LinkChat 开发视角

> 基于 OpenClaw v2026.4.2 官方文档系统性研读，提炼出 LinkChat 集成所需的关键知识。
>
> 生成日期：2026-04-08 | 文档源：`<npm root -g>/openclaw/docs/`

---

## 目录

1. [WS 协议规范](#1-ws-协议规范)
2. [配置完整参考](#2-配置完整参考)
3. [Session 管理](#3-session-管理)
4. [Agent 行为模型](#4-agent-行为模型)
5. [模型与 Provider](#5-模型与-provider)
6. [进程管理](#6-进程管理)
7. [安全与沙箱](#7-安全与沙箱)
8. [踩坑记录与 LinkChat 集成要点](#8-踩坑记录与-linkchat-集成要点)

---

## 1. WS 协议规范

### 1.1 传输层

- **协议**: WebSocket，**仅文本帧**，JSON 载荷
- **第一帧**: 必须是 `connect` 请求
- **协议版本**: 当前 `PROTOCOL_VERSION = 3`
- **Schema 源**: `src/gateway/protocol/schema.ts` (TypeBox)

### 1.2 帧格式

| 帧类型 | 结构 | 方向 |
|--------|------|------|
| `req` | `{ type: "req", id, method, params }` | Client → Gateway |
| `res` | `{ type: "res", id, ok, payload \| error }` | Gateway → Client |
| `event` | `{ type: "event", event, payload, seq?, stateVersion? }` | Gateway → Client |

> 副作用方法需要 **幂等键 (idempotency key)**。

### 1.3 握手流程

#### Step 1 — Gateway → Client: Pre-Connect Challenge

```json
{
  "type": "event",
  "event": "connect.challenge",
  "payload": { "nonce": "…", "ts": 1737264000000 }
}
```

#### Step 2 — Client → Gateway: `connect` 请求

```json
{
  "type": "req",
  "id": "…",
  "method": "connect",
  "params": {
    "minProtocol": 3,
    "maxProtocol": 3,
    "client": {
      "id": "cli",
      "version": "1.2.3",
      "platform": "macos",
      "mode": "operator"
    },
    "role": "operator",
    "scopes": ["operator.read", "operator.write"],
    "caps": [],
    "commands": [],
    "permissions": {},
    "auth": { "token": "…" },
    "locale": "en-US",
    "userAgent": "openclaw-cli/1.2.3",
    "device": {
      "id": "device_fingerprint",
      "publicKey": "…",
      "signature": "…",
      "signedAt": 1737264000000,
      "nonce": "…"
    }
  }
}
```

**Connect 参数字段表:**

| 字段 | 类型 | 说明 |
|------|------|------|
| `minProtocol` / `maxProtocol` | number | 客户端接受的协议版本范围 |
| `client.id` | string | 客户端标识 (e.g. `"cli"`, `"ios-node"`) |
| `client.version` | string | 客户端版本 |
| `client.platform` | string | 平台 (`macos`, `ios`, `android`, `windows`) |
| `client.mode` | string | `"operator"` 或 `"node"` |
| `role` | string | `"operator"` 或 `"node"` |
| `scopes` | string[] | 请求的权限范围 |
| `caps` | string[] | Node 能力类别 (`camera`, `canvas`, `screen`, `location`, `voice`) |
| `commands` | string[] | Node 命令白名单 |
| `permissions` | object | 细粒度权限开关 |
| `auth.token` | string | 共享 token 或设备 token |
| `device.id` | string | 稳定设备指纹 (源自密钥对) |
| `device.publicKey` | string | 设备公钥 |
| `device.signature` | string | 签名后的 challenge |
| `device.nonce` | string | **必须**匹配服务端下发的 nonce |

#### Step 3 — Gateway → Client: `hello-ok` 响应

```json
{
  "type": "res",
  "id": "…",
  "ok": true,
  "payload": {
    "type": "hello-ok",
    "protocol": 3,
    "policy": { "tickIntervalMs": 15000 }
  }
}
```

设备配对成功时还会包含 `auth.deviceToken`。

### 1.4 角色与权限

#### 角色

| 角色 | 说明 |
|------|------|
| `operator` | 控制面客户端 (CLI/UI/自动化) |
| `node` | 能力宿主 (摄像头/屏幕/canvas/system.run) |

#### Operator Scopes

| Scope | 说明 |
|-------|------|
| `operator.read` | 只读访问 |
| `operator.write` | 写入访问 |
| `operator.admin` | 管理级 (持久化 `/config set/unset` 需要) |
| `operator.approvals` | 审批执行请求 |
| `operator.pairing` | 设备 token 轮换/撤销 |

### 1.5 RPC 方法列表

> 下表列出 LinkChat 对接直接相关、且当前 Gateway 运行时可见的核心方法。完整方法面比本文更大，但 session/chat/health/exec 相关方法这里尽量展开到具体名字，避免 `sessions.*` 这类模糊写法。

#### 基础 / Gateway 只读方法

| 方法 | Scope | 说明 |
|------|-------|------|
| `health` | `operator.read` | 获取 Gateway health snapshot |
| `status` | `operator.read` | 获取本地状态摘要 |
| `last-heartbeat` | `operator.read` | 查询最近一次 heartbeat 状态 |
| `system-presence` | `operator.read` | 获取在线设备列表 |

#### Agent / Chat 方法

| 方法 | Scope | 返回值 / 行为 | 说明 |
|------|-------|---------------|------|
| `agent` | `operator.write` | `{ runId, acceptedAt }` | 触发 agent 运行；验证参数、解析 session、立即返回 |
| `agent.wait` | `operator.write` | `{ status, startedAt, endedAt, error? }` | 等待 lifecycle end/error；默认超时 30s |
| `chat.send` | `operator.write` | 发送消息并异步走 event 流 | LinkChat 当前发送消息走这条路径 |
| `chat.abort` | `operator.write` | 中止当前 chat run | 对接“停止生成”按钮时有用 |
| `chat.history` | `operator.read` | 读取 chat 历史 | 调试 UI / 回放时有用 |

**LinkChat 关键**: `openclaw-ws-client.ts` 当前使用 `chat.send` 发消息，完成态仍需看 `event=chat` 中的 lifecycle 流。

#### Session 方法

| 方法 | Scope | 说明 |
|------|-------|------|
| `sessions.list` | `operator.read` | 列出现有 session |
| `sessions.get` | `operator.read` | 读取单个 session 详情 |
| `sessions.resolve` | `operator.read` | 将 label / key 解析为 session |
| `sessions.preview` | `operator.read` | 预览 session 摘要 |
| `sessions.subscribe` / `sessions.unsubscribe` | `operator.read` | 订阅 / 取消订阅 session 级事件 |
| `sessions.messages.subscribe` / `sessions.messages.unsubscribe` | `operator.read` | 订阅 / 取消订阅消息流 |
| `sessions.usage` / `sessions.usage.timeseries` / `sessions.usage.logs` | `operator.read` | usage 与日志分析 |
| `sessions.create` | `operator.write` | 显式创建 session |
| `sessions.send` | `operator.write` | 向指定 session 发送消息 |
| `sessions.steer` | `operator.write` | 向运行中的 session 注入 steering 消息 |
| `sessions.abort` | `operator.write` | 中止 session / subagent 运行 |
| `sessions.patch` | `operator.admin` | 修改 session 元数据 / 配置 |
| `sessions.reset` | `operator.admin` | 重置 session，切新 `sessionId` |
| `sessions.delete` | `operator.admin` | 删除 / 归档 session |
| `sessions.compact` | `operator.admin` | 手动触发 compaction |

#### 工具 / 技能 / 审批相关方法

| 方法 | Scope | 说明 |
|------|-------|------|
| `tools.catalog` | `operator.read` | 获取 agent 维度 runtime 工具目录 |
| `tools.effective` | `operator.read` | 获取 session 维度有效工具清单 |
| `skills.status` | `operator.read` | 查看技能加载状态 |
| `skills.bins` | `operator.read` | 获取技能可执行文件列表 |
| `skills.install` / `skills.update` | `operator.admin` | 技能安装与更新 |
| `exec.approval.request` / `exec.approval.waitDecision` / `exec.approval.resolve` | `operator.approvals` | exec 审批生命周期 |
| `set-heartbeats` | `operator.admin` | 管理 heartbeat 行为 |
| `device.token.rotate` / `device.token.revoke` | `operator.pairing` | 设备 token 轮换 / 撤销 |

### 1.6 Agent 事件流

Agent 运行期间通过三种事件流推送数据：

| 流 | 来源 | 内容 |
|----|------|------|
| `lifecycle` | Gateway | `phase: "start" \| "end" \| "error"` |
| `assistant` | pi-agent-core | 流式文本 delta |
| `tool` | pi-agent-core | 工具 start/update/end 事件 |

**LinkChat 关键**: 
- 完成信号是 lifecycle event `phase=end`（不是 response 消息）
- 流式文本: Gateway 发累积全文，多段回复时重置
- 客户端需做 delta + `startsWith` 重置检测

### 1.7 Agent 投递参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `deliver` | — | `true` 请求外部投递 |
| `bestEffortDeliver=false` | strict | 无法解析投递目标时返回 `INVALID_REQUEST` |
| `bestEffortDeliver=true` | relaxed | 回退到仅 session 执行 |

### 1.8 认证

- **Gateway Token**: `OPENCLAW_GATEWAY_TOKEN` 环境变量或 `--token` CLI 标志
- 如果设置了 token，`connect.params.auth.token` 必须匹配，否则断连
- `--auth none` 时不发 auth 字段，但**必须**发 device identity

**设备认证错误码:**

| 错误消息 | `details.code` |
|---------|----------------|
| `device nonce required` | `DEVICE_AUTH_NONCE_REQUIRED` |
| `device nonce mismatch` | `DEVICE_AUTH_NONCE_MISMATCH` |
| `device signature invalid` | `DEVICE_AUTH_SIGNATURE_INVALID` |
| `device signature expired` | `DEVICE_AUTH_SIGNATURE_EXPIRED` |
| `device identity mismatch` | `DEVICE_AUTH_DEVICE_ID_MISMATCH` |
| `device public key invalid` | `DEVICE_AUTH_PUBLIC_KEY_INVALID` |

**认证失败推荐动作 (`recommendedNextStep`):**
`retry_with_device_token` | `update_auth_configuration` | `update_auth_credentials` | `wait_then_retry` | `review_auth_configuration`

---

## 2. 配置完整参考

> 本节覆盖 LinkChat 直接相关的配置族，重点是 `agents.defaults`、`compaction`、`contextPruning`、`session`、`heartbeat` 与模型路由。它不是对整个 `openclaw.json` 根 schema 的逐键抄录；`channels`、`cron`、`plugins`、`browser` 等旁支仍建议回查官方 `configuration-reference.md`。

### 2.1 配置文件

- **路径**: `~/.openclaw/openclaw.json`
- **格式**: JSON5 (支持注释和尾逗号)
- **严格校验**: 未知键、类型错误或无效值会导致 Gateway **拒绝启动**
- 唯一例外: 根级 `$schema` 字段 (string)

### 2.2 agents.defaults — Agent 默认配置

| 配置键 | 类型 / 形态 | 默认值 | 说明 |
|--------|-------------|--------|------|
| `workspace` | string | `~/.openclaw/workspace` | Agent 工作区路径 |
| `repoRoot` | string | 自动探测 | system prompt Runtime 行展示的仓库根路径 |
| `skipBootstrap` | boolean | `false` | 禁止自动创建 `AGENTS.md` / `SOUL.md` / `TOOLS.md` 等引导文件 |
| `bootstrapMaxChars` | number | `20000` | 单个引导文件注入上限 |
| `bootstrapTotalMaxChars` | number | `150000` | 所有引导文件总注入上限 |
| `bootstrapPromptTruncationWarning` | enum | `"once"` | bootstrap 被截断时是否注入提示 |
| `imageMaxDimensionPx` | number | `1200` | 图片最长边上限，影响 vision token 成本 |
| `userTimezone` | string | 宿主时区 | system prompt 使用的时区 |
| `timeFormat` | enum | `"auto"` | `"auto"` / `"12"` / `"24"` |
| `model` | string 或 `{ primary, fallbacks }` | — | 主文本模型与降级链 |
| `models` | map | — | `/model` 可见模型目录与 alias / params |
| `params` | object | — | 全局 provider 参数基线；会被 per-model / per-agent 覆盖 |
| `imageModel` | string 或 `{ primary, fallbacks }` | — | 图片输入 / vision 路由模型 |
| `imageGenerationModel` | string 或 `{ primary, fallbacks }` | — | `image_generate` 路由模型 |
| `pdfModel` | string 或 `{ primary, fallbacks }` | — | `pdf` 工具路由模型 |
| `pdfMaxBytesMb` | number | `10` | PDF 工具默认大小限制 |
| `pdfMaxPages` | number | `20` | PDF 工具默认页数限制 |
| `thinkingDefault` | enum | 未设置 | 默认 thinking 级别；支持 `off` ~ `xhigh` / `adaptive` |
| `verboseDefault` | enum | `"off"` | `"off"` / `"on"` / `"full"` |
| `elevatedDefault` | enum | `"on"` | `"off"` / `"on"` / `"ask"` / `"full"` |
| `timeoutSeconds` | number | `600` | Agent 运行超时 |
| `mediaMaxMb` | number | `5` | 最大入站媒体 MB |
| `contextTokens` | number | `200000` | Context token 上限 |
| `maxConcurrent` | number | `8` | 跨 session 最大并行 agent 运行数；单 session 仍串行 |

**补充:**
- `model` / `imageModel` / `imageGenerationModel` / `pdfModel` 都接受字符串或 `{ primary, fallbacks }` 对象。
- `params` 合并顺序: `agents.defaults.params` → `agents.defaults.models["provider/model"].params` → `agents.list[].params`。
- `models` 不只是 allowlist，也承载 alias 与 provider 特定参数。

### 2.3 compaction 配置

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `compaction.mode` | string | `"default"` | `"default"` 或 `"safeguard"` (分块长历史) |
| `compaction.timeoutSeconds` | number | `900` | 压缩最大时长 |
| `compaction.identifierPolicy` | enum | `"strict"` | 标识符保留策略；避免 ticket id / host:port / deployment id 被摘要吞掉 |
| `compaction.identifierInstructions` | string | — | `identifierPolicy=custom` 时使用 |
| `compaction.postCompactionSections` | string[] | `["Session Startup", "Red Lines"]` | 压缩后重注入指定 AGENTS.md 章节 |
| `compaction.model` | string | — | 压缩专用模型 |
| `compaction.notifyUser` | boolean | `false` | 压缩开始时通知用户 |
| `compaction.reserveTokensFloor` | number | `20000` | `reserveTokens` 最低强制值；配置示例里常见 `24000`，但深度参考标注运行时默认 floor 为 `20000` |
| `compaction.memoryFlush.enabled` | boolean | `true` | 压缩前静默写入内存 |
| `compaction.memoryFlush.softThresholdTokens` | number | `4000` | 软阈值；`configuration-reference` 示例常见写 `6000` |
| `compaction.memoryFlush.systemPrompt` | string | 内置提示 | memory flush 的附加 system prompt |
| `compaction.memoryFlush.prompt` | string | 内置提示 | memory flush 的用户消息；默认带 `NO_REPLY` 约束 |

Pi 运行时压缩设置:

| 配置键 | 默认值 | 说明 |
|--------|--------|------|
| `compaction.enabled` | `true` | 启用/禁用自动压缩 |
| `compaction.reserveTokens` | `16384` | 为提示 + 输出预留的空间 |
| `compaction.keepRecentTokens` | `20000` | 压缩后保留的近期历史 token 数 |

### 2.4 contextPruning 配置

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `contextPruning.mode` | string | `"off"` | `"off"` 或 `"cache-ttl"` |
| `contextPruning.ttl` | string | `"1h"` | 裁剪运行频率 |
| `contextPruning.keepLastAssistants` | number | `3` | assistant 消息少于此数时跳过裁剪 |
| `contextPruning.softTrimRatio` | number | `0.3` | 软裁剪比例 |
| `contextPruning.hardClearRatio` | number | `0.5` | 硬清除比例 |
| `contextPruning.minPrunableToolChars` | number | `50000` | 触发裁剪的最小字符数 |
| `contextPruning.softTrim.maxChars` | number | `4000` | 软裁剪后允许保留的最大字符数 |
| `contextPruning.softTrim.headChars` | number | `1500` | 头部保留字符数 |
| `contextPruning.softTrim.tailChars` | number | `1500` | 尾部保留字符数 |
| `contextPruning.hardClear.enabled` | boolean | `true` | 启用硬清除 |
| `contextPruning.hardClear.placeholder` | string | `"[Old tool result content cleared]"` | 硬清除占位文本 |
| `contextPruning.tools.deny` | string[] | `[]` | 不参与 pruning 的工具列表 |

### 2.5 session 配置

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `session.scope` | enum | `"per-sender"` | 群聊 / channel 基础分组策略 |
| `session.dmScope` | enum | `"main"` | `"main"` / `"per-peer"` / `"per-channel-peer"` / `"per-account-channel-peer"` |
| `session.identityLinks` | map | — | 跨 channel 身份合并 |
| `session.reset.mode` | enum | `"daily"` | `"daily"` / `"idle"` |
| `session.reset.atHour` | number | `4` | 每日重置小时 |
| `session.reset.idleMinutes` | number | — | 空闲重置时间 |
| `session.resetByType` | object | — | 针对 `direct` / `group` / `thread` 单独覆盖 reset 策略 |
| `session.resetTriggers` | string[] | `["/new", "/reset"]` | 手动 reset 触发命令 |
| `session.store` | string | `~/.openclaw/agents/{agentId}/sessions/sessions.json` | session store 路径模板 |
| `session.parentForkMaxTokens` | number | `100000` | 线程 fork 时允许继承父 transcript 的上限 |
| `session.maintenance.mode` | string | `"warn"` | `"warn"` 或 `"enforce"` |
| `session.maintenance.pruneAfter` | string | `"30d"` | 过期清理阈值 |
| `session.maintenance.maxEntries` | number | `500` | sessions.json 最大条目数 |
| `session.maintenance.rotateBytes` | string | `"10mb"` | 超限后轮转 sessions.json |
| `session.maintenance.resetArchiveRetention` | duration / false | `pruneAfter` | `*.reset.<ts>` 保留时间 |
| `session.maintenance.maxDiskBytes` | string | — | sessions 目录硬预算 |
| `session.maintenance.highWaterBytes` | string | `80% of maxDiskBytes` | 清理回落目标 |
| `session.threadBindings.enabled` | boolean | `true` | 线程绑定总开关 |
| `session.threadBindings.idleHours` | number | `24` | 自动 unfocus 空闲时长；`0` 禁用 |
| `session.threadBindings.maxAgeHours` | number | `0` | 绑定硬上限；`0` 禁用 |
| `session.sendPolicy` | object | `default=allow` | 按 channel / chatType / keyPrefix 做发送策略 |

### 2.6 heartbeat 配置

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `heartbeat.every` | string | `"30m"` / `"1h"` | 间隔；`"0m"` 禁用 |
| `heartbeat.model` | string | — | heartbeat 专用模型 |
| `heartbeat.includeReasoning` | boolean | `false` | 是否单独投递 Reasoning 消息 |
| `heartbeat.lightContext` | boolean | `false` | 仅保留 `HEARTBEAT.md` |
| `heartbeat.isolatedSession` | boolean | `false` | 每次新 session |
| `heartbeat.session` | string | `"main"` | 运行所绑定的 session |
| `heartbeat.target` | string | `"none"` | `none` / `last` / `<channel-id>` |
| `heartbeat.to` | string | — | channel 目标地址 |
| `heartbeat.directPolicy` | enum | `"allow"` | DM 定向投递策略 |
| `heartbeat.prompt` | string | 内置 heartbeat prompt | 会原样作为 user message 发送 |
| `heartbeat.ackMaxChars` | number | `300` | `HEARTBEAT_OK` 后允许残留字符上限 |
| `heartbeat.suppressToolErrorWarnings` | boolean | `false` | 抑制 heartbeat 中工具错误 warning |

**补充:**
- Heartbeat 是**周期性 agent turn**，不是 WS 传输层 ping/pong。
- 一旦任何 `agents.list[]` 定义了 `heartbeat`，则**只有**这些 agent 会运行 heartbeat。
- `target` 默认是 `"none"`；不开显式目标就不会主动往外部 channel 发提醒。

### 2.7 模型与 failover 配置补充

| 配置键 | 说明 |
|--------|------|
| `model.primary` | 默认主模型，格式 `provider/model` |
| `model.fallbacks[]` | 有序故障转移列表 |
| `models["provider/model"].alias` | `/model` 与 UI 里展示的别名 |
| `models["provider/model"].params` | provider 特定参数，如 `temperature` / `maxTokens` / `cacheRetention` |
| `params` | 全局默认 provider 参数 |

**选择顺序:**
1. `agents.defaults.model.primary`
2. `agents.defaults.model.fallbacks[]`
3. 同 provider 内 auth profile 轮换

### 2.8 热重载

```json5
{
  gateway: {
    reload: { mode: "hybrid", debounceMs: 300 },
  },
}
```

| 模式 | 行为 |
|------|------|
| `"hybrid"` (默认) | 安全变更即时热应用；关键变更自动重启 |
| `"hot"` | 仅热应用安全变更；需重启时仅记录警告 |
| `"restart"` | 任何变更都重启 |
| `"off"` | 禁用文件监视 |

**不需要重启的**: channels, agent, models, hooks, cron, session, tools, skills, UI
**需要重启的**: gateway.* (port/bind/auth/TLS), plugins, discovery

---

## 3. Session 管理

### 3.1 Session 生命周期

三种重置机制：

| 机制 | 触发条件 | 配置 |
|------|---------|------|
| 每日重置 | 到达 `session.reset.atHour` 边界后的下一条消息 | `session.reset.mode="daily"` + `atHour` |
| 空闲重置 | 不活跃超时后 | `session.reset.idleMinutes` |
| 手动重置 | 用户输入 `/new` 或 `/reset` | — |

**补充:**
- 默认主策略是 `daily`，`atHour=4`。
- 可以切到 `session.reset.mode="idle"`，也可以用 `session.resetByType` 对 `direct` / `group` / `thread` 单独覆盖。
- 同时配置 daily 和 idle 时，**先到先触发**。

### 3.2 Session Key 格式

| 场景 | 格式 |
|------|------|
| 主/直接聊天 | `agent:<agentId>:<mainKey>` (默认 mainKey = `main`) |
| 群组 | `agent:<agentId>:<channel>:group:<id>` |
| 频道/房间 | `agent:<agentId>:<channel>:channel:<id>` |
| Cron | `cron:<job.id>` |
| Webhook | `hook:<uuid>` |
| 子 Agent | `agent:<agentId>:subagent:<uuid>` |

### 3.3 持久化位置

| 数据 | 路径 |
|------|------|
| Session 存储 | `~/.openclaw/agents/<agentId>/sessions/sessions.json` |
| 对话记录 | `~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl` |

**Session 存储** = K/V 映射: `sessionKey → SessionEntry`，小型、可变、可编辑。
**对话记录** = 追加写入的 JSONL，树结构 (`id` + `parentId`)。

### 3.4 SessionEntry 关键字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `sessionId` | string | 当前对话记录 ID |
| `updatedAt` | timestamp | 最后活跃时间 |
| `chatType` | enum | `"direct"` / `"group"` / `"room"` |
| `inputTokens` / `outputTokens` / `totalTokens` | number | 滚动 token 计数 |
| `contextTokens` | number | 运行时 context token 估计 |
| `compactionCount` | number | 自动压缩完成次数 |

### 3.5 压缩 (Compaction)

- **默认开启**
- **触发条件**: 接近 context 上限时自动触发，或模型返回 context-overflow 错误 → 压缩 → **自动重试**
- **手动触发**: `/compact` 或 `/compact Focus on <topic>`
- 压缩前自动提示 agent 将重要笔记保存到 memory 文件

**自动压缩触发公式 (Pi 运行时)**:
```
contextTokens > contextWindow - reserveTokens
```

**压缩后 context 结构**: 
1. compaction 摘要条目
2. `firstKeptEntryId` 之后的所有消息

### 3.6 裁剪 (Pruning) vs 压缩

| 维度 | 裁剪 (Pruning) | 压缩 (Compaction) |
|------|----------------|-------------------|
| 对象 | 工具结果 | 整个对话 |
| 写入磁盘? | 否 (仅内存，每次请求) | 是 (写入对话记录) |
| 范围 | 仅工具结果 | 完整对话历史 |
| 触发时机 | cache TTL 过期后 | 接近 context 上限时 |

**裁剪算法**:
1. 等待 cache TTL 过期 (默认 5 分钟)
2. 找到旧工具结果
3. **软裁剪**: 保留头尾，中间插入 `...`
4. **硬清除**: 替换为占位文本
5. 重置 TTL

### 3.7 上下文引擎 (Context Engine)

默认引擎: `"legacy"`。可通过插件替换。

**生命周期钩子**:

| 钩子 | 时机 | 用途 |
|------|------|------|
| Ingest | 新消息加入 session | 存储/索引消息 |
| Assemble | 每次模型运行前 | 返回有序消息 + 可选 `systemPromptAddition` |
| Compact | context 满或 `/compact` | 摘要压缩 |
| After turn | 运行完成后 | 持久化状态 |

### 3.8 检查命令

| 命令 | 输出 |
|------|------|
| `openclaw status` | Session 存储路径 + 最近活动 |
| `openclaw sessions --json` | 所有 session |
| `/status` (聊天中) | Context 使用、模型、开关状态 |
| `/context list` (聊天中) | 当前系统提示内容 |

---

## 4. Agent 行为模型

### 4.1 Agent 执行循环

Agentic loop = 完整运行: 接收 → context 组装 → 模型推理 → 工具执行 → 流式回复 → 持久化。每个 session 串行执行。

**入口**: Gateway RPC `agent` / `agent.wait`

**详细步骤**:

1. **`agent` RPC** — 验证参数 → 解析 session → 持久化元数据 → 立即返回 `{ runId, acceptedAt }`
2. **`agentCommand`** — 解析模型 + thinking/verbose 默认值 → 加载技能快照 → 调用 `runEmbeddedPiAgent`
3. **`runEmbeddedPiAgent`** — 通过 per-session + 全局队列串行化 → 解析模型 + auth → 构建 pi session → 订阅事件 → 强制超时 → 返回载荷 + 使用统计
4. **`subscribeEmbeddedPiSession`** — 桥接 pi-agent-core 事件到 OpenClaw agent 流 (tool → `stream:"tool"`, assistant → `stream:"assistant"`, lifecycle)

### 4.2 工作区引导文件

| 文件 | 用途 | 何时注入 |
|------|------|---------|
| `AGENTS.md` | 操作指令 + "记忆" | 每轮 |
| `SOUL.md` | 人格、边界、语气 | 每轮 |
| `TOOLS.md` | 用户维护的工具说明 | 每轮 |
| `IDENTITY.md` | Agent 名称 / 风格 | 每轮 |
| `USER.md` | 用户档案 | 每轮 |
| `BOOTSTRAP.md` | 一次性首次运行 | 仅新工作区 |
| `MEMORY.md` | 长期记忆 | 存在时注入 |

**子 Agent session**: 仅注入 `AGENTS.md` + `TOOLS.md`。

### 4.3 Exec 工具规范

#### 参数列表

| 参数 | 必填 | 类型 | 默认值 | 说明 |
|------|------|------|--------|------|
| `command` | 是 | string | — | Shell 命令 |
| `workdir` | 否 | string | `cwd` | 工作目录 |
| `env` | 否 | object | — | 环境变量覆盖 |
| `yieldMs` | 否 | number | `10000` | 延迟后自动转后台 (ms) |
| `background` | 否 | bool | — | 立即后台执行 |
| `timeout` | 否 | number (秒) | `1800` | 超时后终止进程 |
| `pty` | 否 | bool | — | 伪终端模式 |
| `host` | 否 | enum | `auto` | 执行位置: `auto \| sandbox \| gateway \| node` |
| `security` | 否 | enum | — | 安全模式: `deny \| allowlist \| full` |
| `ask` | 否 | enum | — | 审批提示: `off \| on-miss \| always` |
| `node` | 否 | string | — | Node id/名称 (当 `host=node`) |
| `elevated` | 否 | bool | — | 请求提升权限 |

#### host 路由逻辑

| 值 | 行为 |
|----|------|
| `auto` | 默认。沙箱活跃时路由到 `sandbox`，否则 `gateway` |
| `sandbox` | 强制沙箱。沙箱不活跃时**失败** (不降级到 gateway) |
| `gateway` | 强制 Gateway 宿主 |
| `node` | 在配对的 Node 上执行 |

#### Shell 选择逻辑

- **非 Windows**: 使用 `SHELL` 环境变量 (fish 时优先 bash)
- **Windows**: 优先 PowerShell 7 (`pwsh`)，降级 Windows PowerShell 5.1

#### 安全规则

- `env.PATH` 和加载器覆盖 (`LD_*`/`DYLD_*`) 在宿主执行时被**拒绝**
- `OPENCLAW_SHELL=exec` 被设置在 spawned 命令环境中

#### 审批流程

1. exec 需要审批 → 工具立即返回 `status: "approval-pending"` + approval id
2. 审批/拒绝/超时后 → Gateway 发出系统事件: `Exec finished` / `Exec denied`

### 4.4 技能系统

#### 加载位置与优先级 (从高到低)

| 优先级 | 位置 | 范围 |
|--------|------|------|
| 1 (最高) | `<workspace>/skills/` | 每 Agent |
| 2 | `<workspace>/.agents/skills/` | 项目 Agent |
| 3 | `~/.agents/skills/` | 个人 Agent (跨工作区) |
| 4 | `~/.openclaw/skills/` | 本地管理 (所有 Agent) |
| 5 | 内置技能 | npm 包自带 |
| 6 (最低) | `skills.load.extraDirs` | 自定义共享目录 |

#### SKILL.md 格式

```markdown
---
name: image-lab
description: Generate or edit images
---

技能指令内容...
```

**关键前置信息字段**:

| 字段 | 说明 |
|------|------|
| `user-invocable` | `true` = 暴露为斜杠命令 |
| `disable-model-invocation` | `true` = 不注入模型提示 |
| `command-dispatch: "tool"` | 直接分发到工具 (绕过模型) |
| `metadata.openclaw.requires.bins` | 要求 PATH 中存在的二进制文件 |
| `metadata.openclaw.requires.env` | 要求存在的环境变量 |

### 4.5 子 Agent (Subagents)

#### `sessions_spawn` 参数

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `task` | 是 | — | 任务提示 |
| `label` | 否 | — | 可选标签 |
| `model` | 否 | 继承调用者 | 覆盖模型 |
| `thinking` | 否 | 继承调用者 | 覆盖 thinking 级别 |
| `runTimeoutSeconds` | 否 | `0` | 超时终止 (0=无超时) |
| `cleanup` | 否 | `"keep"` | `"delete"` = 完成后立即归档 |

#### 嵌套深度

| 深度 | Session Key | 角色 |
|------|------------|------|
| 0 | `agent:<id>:main` | 主 Agent |
| 1 | `agent:<id>:subagent:<uuid>` | 子 Agent |
| 2 | `agent:<id>:subagent:<uuid>:subagent:<uuid>` | 子子 Agent (叶工作者) |

最大支持深度: **2** (`maxSpawnDepth` 默认 1，最大可配 2)

### 4.6 插件钩子

| 钩子 | 阶段 / 用途 |
|------|-------------|
| `before_model_resolve` | 确定性覆盖 provider/model |
| `before_prompt_build` | 注入 `prependContext`, `systemPrompt` |
| `before_agent_reply` | 可声明 turn、返回合成回复、静默 turn |
| `agent_end` | 检查最终消息列表和运行元数据 |
| `before_tool_call` / `after_tool_call` | 拦截工具参数/结果 |
| `before_compaction` / `after_compaction` | 观察压缩周期 |
| `message_received` | 入站消息 |
| `message_sending` | 出站消息 (可取消) |

### 4.7 NO_REPLY 约定

- Assistant 输出以 `NO_REPLY` 开头 → 表示"不投递给用户"
- OpenClaw 在投递层过滤此标记
- 2026.1.10 起也抑制部分流式输出 (避免泄漏 `NO_REPLY` 前缀)

### 4.8 超时

| 超时类型 | 值 | 说明 |
|---------|-----|------|
| `agent.wait` 默认 | 30 秒 | 仅等待；`timeoutMs` 覆盖 |
| Agent 运行时 | 172800 秒 (48 小时) | `agents.defaults.timeoutSeconds` |

---

## 5. 模型与 Provider

### 5.1 模型引用格式

- 格式: `provider/model` (按第一个 `/` 分割)
- 所有引用**标准化为小写**
- OpenRouter 风格嵌套 ID: 必须包含 provider 前缀, 如 `openrouter/moonshotai/kimi-k2`

### 5.2 模型选择优先级

1. **主模型**: `agents.defaults.model.primary`
2. **降级列表**: `agents.defaults.model.fallbacks[]` (按列表顺序)
3. **Provider auth 故障转移**: 在同一 provider 内，先轮换 auth profile 再降级到下一个模型

### 5.3 MiniMax Provider

#### 模型规格

| 模型 ID | reasoning | contextWindow | maxTokens | 输入价格 | 输出价格 |
|---------|-----------|---------------|-----------|---------|---------|
| `MiniMax-M2.7` | true | 200,000 | 8,192 | $0.3/MTok | $1.2/MTok |
| `MiniMax-M2.7-highspeed` | true | 200,000 | 8,192 | $0.3/MTok | $1.2/MTok |
| `image-01` | — | — | — | — | — |

**模型 ID 大小写敏感** (大写 M)

#### 配置示例

```json5
{
  env: { MINIMAX_API_KEY: "sk-..." },
  agents: { defaults: { model: { primary: "minimax/MiniMax-M2.7" } } },
  models: {
    mode: "merge",
    providers: {
      minimax: {
        baseUrl: "https://api.minimax.io/anthropic",
        apiKey: "${MINIMAX_API_KEY}",
        api: "anthropic-messages",
        models: [
          {
            id: "MiniMax-M2.7",
            name: "MiniMax M2.7",
            reasoning: true,
            input: ["text"],
            contextWindow: 200000,
            maxTokens: 8192
          }
        ]
      }
    }
  }
}
```

**API 端点**:
- 国际: `https://api.minimax.io/anthropic` (Anthropic 兼容)
- 中国: `https://api.minimaxi.com` (注意多了个 `i`)

### 5.4 Moonshot/Kimi Provider

**两个独立的 Provider** — 密钥和端点不可互换:

| Provider | 模型前缀 | 环境变量 |
|----------|---------|---------|
| Moonshot API | `moonshot/...` | `MOONSHOT_API_KEY` |
| Kimi Coding | `kimi-coding/...` | `KIMI_API_KEY` |

#### Moonshot 模型

| 模型 ID | reasoning | Context Window | Max Tokens |
|---------|-----------|----------------|------------|
| `kimi-k2.5` | false | 256,000 | 8,192 |
| `kimi-k2-0905-preview` | false | 256,000 | 8,192 |
| `kimi-k2-turbo-preview` | false | 256,000 | 8,192 |
| `kimi-k2-thinking` | true | 256,000 | 8,192 |
| `kimi-k2-thinking-turbo` | true | 256,000 | 8,192 |

**端点**: 国际 `https://api.moonshot.ai/v1` | 中国 `https://api.moonshot.cn/v1`

**Thinking 模式**: 二元开关 (`enabled` / `disabled`)。当 thinking 开启时，`tool_choice` 必须为 `"auto"` 或 `"none"`。

### 5.5 其他内置 Provider

| Provider ID | 环境变量 | 示例模型 |
|-------------|---------|---------|
| `anthropic` | `ANTHROPIC_API_KEY` | `anthropic/claude-opus-4-6` |
| `openai` | `OPENAI_API_KEY` | `openai/gpt-5.4` |
| `google` | `GEMINI_API_KEY` | `google/gemini-3.1-pro-preview` |
| `openrouter` | `OPENROUTER_API_KEY` | `openrouter/anthropic/claude-sonnet-4-6` |
| `zai` | `ZAI_API_KEY` | `zai/glm-5` |
| `ollama` | (无,本地) | `ollama/llama3.3` |
| `deepseek` | `DEEPSEEK_API_KEY` | — |

### 5.6 API Key 轮换

| 环境变量模式 | 优先级 |
|-------------|--------|
| `OPENCLAW_LIVE_<PROVIDER>_KEY` | 最高 |
| `<PROVIDER>_API_KEYS` (逗号分隔) | 第二 |
| `<PROVIDER>_API_KEY` | 第三 |
| `<PROVIDER>_API_KEY_*` (编号) | 第四 |

轮换仅在 **rate-limit 类错误** 时发生，例如 `429`、`rate_limit`、`quota`、`resource exhausted`；其他错误直接失败。

### 5.7 故障转移与冷却

**Auth Profile 冷却 (指数退避)**:

| 第 N 次失败 | 冷却时间 |
|------------|---------|
| 第 1 次 | 1 分钟 |
| 第 2 次 | 5 分钟 |
| 第 3 次 | 25 分钟 |
| 第 4 次+ | 1 小时 (上限) |

**计费禁用**: "insufficient credits" → 初始 5 小时退避，翻倍增长，上限 24 小时。

**模型降级触发条件**: 认证失败、rate limit (profile 轮换耗尽后)、超时。

### 5.8 记忆系统

- **无隐藏状态** — 记忆是磁盘上的 **纯 Markdown 文件**
- `MEMORY.md` = 长期记忆 (每次 DM session 自动加载)
- `memory/YYYY-MM-DD.md` = 每日笔记 (今天和昨天自动加载)

**记忆工具**:
- `memory_search` — 混合向量 + 关键词搜索
- `memory_get` — 读取特定记忆文件

**自动记忆刷新**: 压缩前自动运行静默 turn 提醒 agent 保存重要上下文。

### 5.9 内置记忆引擎

- **关键词搜索**: FTS5 + BM25
- **向量搜索**: 支持 OpenAI, Gemini, Voyage, Mistral, Ollama, Local
- **CJK 支持**: trigram 分词
- **索引文件**: `MEMORY.md` + `memory/*.md`
- **块大小**: ~400 tokens，重叠 80 tokens
- **索引位置**: `~/.openclaw/memory/<agentId>.sqlite`

---

## 6. 进程管理

### 6.1 健康检查

Gateway 提供健康检查端点和通道健康监控:

```json5
{
  gateway: {
    channelHealthCheckMinutes: 5,
    channelStaleEventThresholdMinutes: 30,
    channelMaxRestartsPerHour: 10,
  },
}
```

### 6.2 Agent 心跳 (调度型)

**配置**:
```json5
{
  agents: {
    defaults: {
      heartbeat: {
        every: "30m",        // "0m" 禁用
        target: "last",      // last | none | <channel-id>
      },
    },
  },
}
```

- Heartbeat 是**周期性 agent turn**，用于定时检查 `HEARTBEAT.md`、巡检任务、按需提醒。
- 默认间隔是 `30m`；Anthropic OAuth / setup-token 场景常见为 `1h`。
- `target` 默认是 `"none"`；显式设成 `"last"` 或某个 channel 才会投递到外部。
- `isolatedSession=true` 时，每次 heartbeat 使用新 session，不继承历史对话。

### 6.3 WS 连接 tick / 传输层保活

- 这是 **WS 握手层**策略，不是上面的 heartbeat 调度。
- 来源: `hello-ok.payload.policy.tickIntervalMs`，默认示例值 `15000ms`。
- 作用: 告诉客户端按该 cadence 发送传输层 tick，保持连接活跃。
- **LinkChat 实现**: 客户端应按 `tickIntervalMs` 发送 WS tick / heartbeat 帧来维持连接。

### 6.4 Windows 平台注意事项

| 项目 | 详情 |
|------|------|
| 推荐路径 | WSL2 最稳定；原生 Windows 持续改进中 |
| 服务安装 | 优先使用 Windows Scheduled Tasks，降级到 Startup 文件夹 |
| Shell | 优先 PowerShell 7 (`pwsh`)，降级 Windows PowerShell 5.1 |
| schtasks 问题 | 如果 `schtasks` 卡住，OpenClaw 自动中止并降级 |

**原生 Windows CLI-only 模式**:
```powershell
openclaw onboard --non-interactive --skip-health
openclaw gateway run
```

**WSL2 无头启动**: `loginctl enable-linger` + `openclaw gateway install` + schtasks 启动 WSL

---

## 7. 安全与沙箱

### 7.1 沙箱机制

#### 模式 (`agents.defaults.sandbox.mode`)

| 值 | 行为 |
|----|------|
| `"off"` | 无沙箱 |
| `"non-main"` | 仅非主 session 沙箱化 |
| `"all"` | 所有 session 沙箱化 |

#### 范围 (`agents.defaults.sandbox.scope`)

| 值 | 行为 |
|----|------|
| `"agent"` | 每 Agent 一个容器 (默认) |
| `"session"` | 每 Session 一个容器 |
| `"shared"` | 所有沙箱 session 共享一个容器 |

#### 后端

| 后端 | 说明 |
|------|------|
| `"docker"` | 本地 Docker 沙箱 (默认) |
| `"ssh"` | SSH 远程沙箱 |
| `"openshell"` | OpenShell 托管沙箱 |

### 7.2 命令执行审批

#### 策略层次

审批是**附加于**工具策略和提升权限之上的第二道关卡:

| security 值 | 行为 |
|------------|------|
| `"deny"` | 阻止所有宿主 exec 请求 |
| `"allowlist"` | 仅允许白名单命令 |
| `"full"` | 允许所有 (等同 elevated) |

| ask 值 | 行为 |
|--------|------|
| `"off"` | 不提示 |
| `"on-miss"` | 白名单不匹配时才提示 |
| `"always"` | 每次都提示 |

#### 审批存储

`~/.openclaw/exec-approvals.json`

#### "YOLO" 无审批模式

需要同时打开**两层**策略:

1. **Config** (`openclaw.json`): `tools.exec.security: "full"` + `tools.exec.ask: "off"`
2. **Host approvals** (`exec-approvals.json`): `defaults.security: "full"` + `defaults.ask: "off"` + `defaults.askFallback: "full"`

**默认行为提醒**:
- `gateway` / `node` 宿主 exec 在未显式收紧时，默认就接近无审批模式。
- 真正想启用审批，必须同时收紧 `tools.exec.*` 和 `~/.openclaw/exec-approvals.json` 两层。

### 7.3 认证模式

- Gateway Token: `OPENCLAW_GATEWAY_TOKEN` / `--token`
- 设备配对: 首次连接颁发 `deviceToken`
- `--auth none`: 不发 auth 但必须发 device identity (空 token 签名)
- 签名载荷版本: v3 (推荐，绑定 platform + deviceFamily), v2 (兼容)

### 7.4 安全审计

```bash
openclaw security audit     # 检查 safeBins 等配置安全性
openclaw doctor --fix        # 生成缺失的 safeBinProfiles
```

---

## 8. 踩坑记录与 LinkChat 集成要点

### 8.1 协议陷阱

| 陷阱 | 正确做法 |
|------|---------|
| WS 方法名错误 | 使用 `chat.send` (不是 `agent`) 发送消息 |
| 缺少必填参数 | `chat.send` 必须包含 `message`, `sessionKey`, `idempotencyKey` |
| 完成信号判断错误 | 监听 lifecycle event `phase=end` (不是 response 消息) |
| 流式文本处理 | Gateway 发累积全文；多段回复时文本重置 → 客户端做 delta + `startsWith` 重置检测 |
| 工具事件字段 | 使用 `data.name` (不是 `data.tool`) |
| caps 声明遗漏 | 如需工具事件，connect 时声明 `caps: ['tool-events']` |

### 8.2 MiniMax 特有行为

| 项目 | 值/注意事项 |
|------|------------|
| Context Window | 200,000 tokens (文档标注，非 204,800) |
| Max Output Tokens | 8,192 |
| 模型 ID 大小写 | **严格区分** — `MiniMax-M2.7` (大写 M) |
| Provider 未配置错误 | "Unknown model: minimax/MiniMax-M2.7" → 需要配置 provider 或设置 `MINIMAX_API_KEY` |
| API 类型 | 推荐 `"anthropic-messages"` (不是 `"openai-completions"`) |

### 8.3 Session 管理要点

| 要点 | 说明 |
|------|------|
| `sessions.reset` / `sessions.compact` API | 存在于 session RPC 方法中 |
| compaction / contextPruning 配置 | 在 `agents.defaults` 下 |
| 默认每日重置 | 默认 `session.reset.mode="daily"`，`atHour=4` |
| 空闲重置 | 配置 `session.reset.idleMinutes`；也可用 `resetByType` 覆盖 |

### 8.4 LinkChat 当前集成状态

#### Desktop OpenClaw 客户端 (`openclaw-ws-client.ts`)

- 使用 `chat.send` RPC 方法
- 实现 delta 编码 + 段重置检测
- lifecycle `phase=end` 作为完成信号
- 按 `tickIntervalMs` 发送 WS tick 保活 (openclawConnected=true)
- Token 自动刷新
- 本地 OpenClaw 进程 spawn (全局路径探测 via `npm root -g`)
- Windows 孤儿进程防护 (killSync)

#### 认证模式

- `--auth none` — 不发 auth 字段
- device identity 仍然必须发送 (空 token 签名)

#### 版本锁定

- **v2026.4.2** (v2026.4.5 缺 `@buape/carbon` 依赖, 无法启动)

### 8.5 尚未利用的能力

| 能力 | 说明 | 优先级 |
|------|------|--------|
| `sessions.compact` API | 手动触发压缩 | 中 |
| `contextPruning` | 减少工具结果膨胀 | 中 |
| `memory_search` | 语义搜索 Agent 记忆 | 低 |
| 子 Agent (`sessions_spawn`) | 多 Agent 并行任务 | 低 |
| `exec-approvals` | 细粒度命令审批 | 中 |
| 技能系统 | 自定义技能扩展 Bot 能力 | 高 |
| 模型降级 | `model.fallbacks` 自动故障转移 | 中 |

### 8.6 配置建议

```json5
// LinkChat Desktop 推荐的 OpenClaw 配置
{
  agents: {
    defaults: {
      model: { primary: "minimax/MiniMax-M2.7" },
      contextTokens: 200000,
      compaction: {
        enabled: true,
        reserveTokens: 16384,
        notifyUser: false,
        memoryFlush: { enabled: true },
      },
      contextPruning: {
        mode: "cache-ttl",
        ttl: "5m",
      },
    },
  },
  session: {
    dmScope: "per-channel-peer",  // 每通道每对等方隔离
    reset: {
      mode: "daily",
      atHour: 4,
      idleMinutes: 120,            // 与 daily 同时启用，先到先触发
    },
    maintenance: { mode: "enforce", pruneAfter: "7d" },
  },
}
```

---

> 本手册基于 OpenClaw v2026.4.2 官方文档生成。随着版本更新，部分细节可能变化，建议定期对照官方文档验证。
