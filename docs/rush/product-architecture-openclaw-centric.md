# LinkChat 产品架构 — 以 OpenClaw 为核心

> 更新：2026-04-08

## 产品定位

LinkChat 不是一个独立的聊天 App，而是 **OpenClaw 的体验外壳**。

OpenClaw 是核心 AI Agent 引擎，具备工具执行、多模型路由、session 管理、技能系统等能力。但它本身是一个命令行/后端工具，缺乏面向普通用户的界面。LinkChat 的价值是：

1. 用**聊天 App 的形态**包装 OpenClaw 的 Agent 能力
2. 添加**社交层**（好友、群组、消息）让它具有通讯产品形态
3. 通过**多端协同**（手机发指令 → 电脑执行）释放远程控制价值
4. 在 OpenClaw 能力不足的地方**补充 Server 端智能**

## 架构分层（由内向外）

```
┌─────────────────────────────────────────────────────┐
│                  社交壳 (Social Shell)               │
│   好友 · 群组 · 消息 · 通知 · @ai · 多端同步         │
│  ┌───────────────────────────────────────────────┐  │
│  │              体验层 (UX Layer)                 │  │
│  │  流式渲染 · ToolCallBlock · 空回复恢复 ·       │  │
│  │  消息持久化 · session管理 · 错误提示           │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │          对接层 (Bridge Layer)           │  │  │
│  │  │  WS协议 · caps声明 · connect握手 ·      │  │  │
│  │  │  进程生命周期 · device pairing · auth    │  │  │
│  │  │  ┌───────────────────────────────────┐  │  │  │
│  │  │  │    OpenClaw 核心 (Agent Engine)    │  │  │  │
│  │  │  │  Agent运行时 · 工具(exec/read/..) │  │  │  │
│  │  │  │  技能系统 · 模型路由 · session ·   │  │  │  │
│  │  │  │  compaction · context pruning     │  │  │  │
│  │  │  └───────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘

+ Server 增强层：覆盖 OpenClaw 不在场的场景（群聊 @ai、LLM 路由、Draft & Verify）
+ 多端协同层：Mobile → Server → Desktop 的分布式架构
```

## 各层职责详解

### 1. OpenClaw 核心（黑盒，不拥有但必须深度理解）

| 模块 | 说明 | 我们的用法 |
|------|------|-----------|
| Agent 运行时 | 接收消息 → LLM 推理 → 工具调用 → 返回结果 | Desktop Bot DM 的核心链路 |
| 工具系统 | exec (命令执行)、read/write (文件操作)、browser 等 | 远程控制能力的基础 |
| 技能系统 | 可插拔的 SKILL.md 指令集 | 未来可定制 Bot 能力 |
| 模型路由 | 多 provider 支持 (MiniMax, Kimi, Anthropic...) | 当前用 MiniMax-M2.7 |
| Session 管理 | 对话上下文持久化 (JSONL) + compaction + pruning | 每个 Bot converse 一个 session |
| 配置系统 | `~/.openclaw/openclaw.json` | context window、compaction、pruning |

### 2. 对接层（桥梁，踩坑最多的地方）

| 组件 | 文件 | 关注点 |
|------|------|--------|
| WS 客户端 | `openclaw-ws-client.ts` | 协议握手、caps 声明、事件解析、delta 编码 |
| 进程管理 | `openclaw-process.service.ts` | spawn/kill/health check、路径探测、重启 |
| 客户端服务 | `openclaw-client.service.ts` | 连接管理、auto-reconnect、device pairing |
| IPC 桥接 | `openclaw.ipc.ts` | stream-start/cancel、空回复重试 |

**核心挑战**：OpenClaw 是黑盒，协议文档不完整，很多细节（如 `caps: ['tool-events']`、`data.name` vs `data.tool`）要靠读源码或踩坑才知道。

### 3. 体验层（LinkChat 加的核心价值）

| 功能 | 说明 |
|------|------|
| 流式渲染 | 打字效果、Markdown 渲染 |
| 工具调用可视化 | ToolCallBlock 组件（折叠/展开、spinner） |
| 消息持久化 | OpenClaw 流式 → REST 持久化 → WS 广播，无缝衔接 |
| 错误恢复 | 空回复检测 → session reset → 自动重试 |
| Session 映射 | 每个 Bot converse 映射一个 OpenClaw session |

### 4. 社交壳（让 Agent 像聊天 App）

| 功能 | 说明 |
|------|------|
| Bot-as-User | Bot 是特殊 User，有自己的聊天窗口 |
| @ai 路由 | 群聊/私聊中 @ai → SupervisorAgent 回复 |
| 通知聚合 | Supervisor Bot 聚合所有 Bot 事件为通知卡片 |
| 好友/群组 | 标准社交功能，与 Bot 共存 |

### 5. Server 增强层（OpenClaw 不在场时的补充）

| 场景 | 处理方式 |
|------|---------|
| 群聊 @ai | 无 OpenClaw → Server SupervisorAgent + DeepSeek |
| Desktop 不在线 | Server 端独立处理（未来） |
| Draft & Verify | 危险操作审批状态机（搁置，OpenClaw 自身已有安全确认） |
| Whisper | 星号按钮 → Server 代笔建议 |

### 6. 多端协同层

```
Flutter Mobile  ──WSS──→  NestJS Server  ──WSS──→  Electron Desktop
 (发指令)                   (Cloud Brain)            (OpenClaw Worker)
                            ├── 路由分发              ├── Agent 执行
                            ├── LLM 路由              ├── 工具调用
                            └── 消息广播              └── 结果回传
```

## 踩坑经验与对接层知识

详见：
- `docs/realtest/2026-04-07.md` — 首次端到端验证，7 个 bug 修复
- `docs/realtest/2026-04-08.md` — OpenClaw 协议对接（caps、字段映射、session 管理）
- `docs/rush/openclaw-local-integration-report.md` — OpenClaw 本地进程集成实战

## OpenClaw 协议速查

### Connect 握手
```json
{ "method": "connect", "params": { "caps": ["tool-events"], "role": "operator" } }
```

### Agent 事件流
| stream | phase | 含义 |
|--------|-------|------|
| `lifecycle` | `start` / `end` | Agent 开始/结束 |
| `tool` | `start` / `update` / `result` | 工具调用生命周期 |
| `assistant` | — | 文本输出（累积全文） |

### Session 管理 API
| WS 方法 | 作用 |
|---------|------|
| `sessions.reset` | 清空 session，开始新对话 |
| `sessions.compact` | 触发 session 摘要压缩 |
| `sessions.delete` | 删除 session |
