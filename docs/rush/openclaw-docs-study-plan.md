# OpenClaw 文档系统性研读计划

> 目标：一次性系统性阅读 OpenClaw v2026.4.2 的官方文档，提炼出 LinkChat 开发所需的关键知识，形成可复用的参考手册。
>
> 产出：`docs/rush/openclaw-reference-manual.md` — LinkChat 视角的 OpenClaw 参考手册
>
> 文档源：`<npm root -g>/openclaw/docs/`（702 个 md 文件，约一半是 zh-CN 翻译，实际约 350 个英文文档）

---

## 背景

当前研究 OpenClaw 的方式是"踩坑驱动"——遇到问题才现查打包后的 dist 源码，效率极低。OpenClaw 包内自带完整文档，但我们从未系统性阅读过。本计划旨在一次性投入，建立可复用的知识库。

### 当前已知但通过踩坑获得的知识

| 知识点 | 获取方式 | 耗时 |
|--------|---------|------|
| `caps: ['tool-events']` 声明 | 搜 dist 源码 | ~9 min Agent |
| tool 事件字段 `data.name` 而非 `data.tool` | 对照日志猜测 | 人工 |
| `sessions.reset` / `sessions.compact` API | 搜 dist 源码 | ~22 min Agent |
| compaction / contextPruning 配置 | 搜 dist + docs | ~22 min Agent |
| MiniMax context window = 204800 | 搜 dist 源码 | Agent |
| delta 编码 + 段重置 | 反复试错 | 数小时 |

这些知识如果提前读文档就能直接获得。

---

## 研读范围与优先级

### P0 — 必读（直接影响当前开发）

核心协议与配置，读完后能避免 90% 的对接层踩坑。

| # | 文档路径 | 关注点 | 预期产出 |
|---|---------|--------|---------|
| 1 | `gateway/protocol.md` | **WS 协议完整规范** — 消息格式、事件类型、握手流程、caps | 协议速查表 |
| 2 | `gateway/configuration-reference.md` | **所有配置项** — agents、compaction、pruning、session | 配置速查表 |
| 3 | `gateway/authentication.md` | auth 模式、token、device pairing | 认证流程图 |
| 4 | `concepts/session.md` | session 生命周期、key 格式、持久化 | session 管理指南 |
| 5 | `concepts/session-pruning.md` | context pruning 机制 | pruning 配置建议 |
| 6 | `concepts/compaction.md` | compaction 触发条件、流程 | compaction 原理 |
| 7 | `concepts/context-engine.md` | context window 管理、token 计算 | context 管理策略 |
| 8 | `concepts/streaming.md` | 流式输出协议、delta vs 全文 | 流式处理最佳实践 |
| 9 | `concepts/agent.md` + `concepts/agent-loop.md` | Agent 执行循环、工具调用流程 | Agent 行为模型 |
| 10 | `reference/session-management-compaction.md` | session + compaction 深度参考 | 补充 4/6 |
| 11 | `reference/rpc.md` | **RPC 方法完整列表** — chat.send、sessions.* 等 | API 速查表 |
| 12 | `tools/exec.md` | exec 工具规范 — 参数、安全、输出格式 | 工具行为参考 |
| 13 | `providers/minimax.md` | MiniMax provider 特有配置、限制 | MiniMax 注意事项 |
| 14 | `gateway/health.md` + `gateway/heartbeat.md` | 健康检查、心跳机制 | 进程管理参考 |

### P1 — 应读（影响后续功能开发）

| # | 文档路径 | 关注点 |
|---|---------|--------|
| 15 | `concepts/models.md` + `concepts/model-providers.md` | 模型配置、多 provider 管理 |
| 16 | `concepts/model-failover.md` | 模型故障转移策略 |
| 17 | `concepts/memory.md` + `concepts/memory-builtin.md` | Agent 记忆系统 |
| 18 | `concepts/multi-agent.md` | 多 Agent 编排 |
| 19 | `tools/skills.md` + `tools/creating-skills.md` | 技能系统，定制 Bot 能力 |
| 20 | `tools/subagents.md` | 子 Agent 调用 |
| 21 | `gateway/sandboxing.md` | 沙箱安全机制 |
| 22 | `gateway/bridge-protocol.md` | 桥接协议（可能影响多端架构） |
| 23 | `platforms/windows.md` | Windows 平台特有问题 |
| 24 | `concepts/system-prompt.md` | 系统提示定制 |
| 25 | `tools/exec-approvals.md` | 命令执行审批机制 |
| 26 | `providers/moonshot.md` | Kimi/Moonshot provider 配置 |
| 27 | `gateway/configuration.md` + `gateway/configuration-examples.md` | 配置概述 + 示例 |

### P2 — 了解（扩展能力时参考）

| # | 文档路径 | 关注点 |
|---|---------|--------|
| 28 | `automation/` 目录 | Cron、Webhook、Hooks — 定时任务能力 |
| 29 | `tools/browser.md` | 浏览器工具 — 网页操作能力 |
| 30 | `tools/web-fetch.md` + `tools/web.md` | 网络请求工具 |
| 31 | `concepts/queue.md` | 消息队列机制 |
| 32 | `concepts/presence.md` + `concepts/typing-indicators.md` | 在线状态、打字指示 |
| 33 | `gateway/openai-http-api.md` | OpenAI 兼容 HTTP API |
| 34 | `plugins/` 目录 | 插件系统 — 扩展能力 |
| 35 | `channels/` 目录 | 渠道集成 — 参考其他 channel 实现 |
| 36 | `nodes/` 目录 | 节点系统 — 音频、摄像头、图片 |

### 跳过（与 LinkChat 无关）

- `install/` — 各平台安装指南（我们已安装好）
- `cli/` 大部分 — CLI 命令参考（按需查阅即可）
- `security/` — 威胁模型（太底层）
- `zh-CN/` — 跳过翻译版本，读英文原版
- `start/` — 入门指南（我们已过了入门阶段）
- 各 provider 详情（除 minimax / moonshot 外）

---

## 产出格式

`docs/rush/openclaw-reference-manual.md` 应包含以下章节：

```markdown
# OpenClaw 参考手册 — LinkChat 开发视角

## 1. WS 协议规范
- Connect 握手（完整参数、caps 列表）
- 消息格式（req/res/event）
- Agent 事件流（lifecycle/tool/assistant 完整字段定义）
- RPC 方法列表（chat.send、sessions.*、health 等）

## 2. 配置完整参考
- agents.defaults 所有字段
- compaction 配置
- contextPruning 配置
- session 配置
- 模型配置（contextTokens、failover）

## 3. Session 管理
- session 生命周期
- session key 格式
- compaction 触发条件与流程
- context pruning 机制
- session reset / compact / delete API

## 4. Agent 行为模型
- Agent 执行循环
- 工具调用流程
- exec 工具规范（参数、安全、输出格式）
- 技能系统概述

## 5. 模型与 Provider
- MiniMax 特有配置与限制
- Kimi/Moonshot 配置
- 模型故障转移
- context window 管理

## 6. 进程管理
- 健康检查机制
- 心跳协议
- Windows 平台注意事项

## 7. 安全与沙箱
- 沙箱机制
- 命令执行审批
- auth 模式

## 8. 踩坑记录
- 从 realtest 日志中提取的协议陷阱
- 已知的 MiniMax 行为异常
```

---

## 执行建议

1. **新开上下文窗口**执行，避免当前会话 context 过长
2. **按 P0 顺序逐个读**，每读完一个文档提炼要点写入参考手册对应章节
3. **P0 读完后检查点**：回顾当前代码，看是否有可以基于新知识改进的地方
4. **P1 按需读**：遇到相关功能开发时再补充
5. **读中文还是英文**：推荐读英文原版（zh-CN 可能翻译不完整），但如果某篇英文太长可对照中文版加速

### 估计工作量

| 优先级 | 文档数 | 预计阅读时间 |
|--------|--------|-------------|
| P0 | 14 篇 | 主要工作量 |
| P1 | 13 篇 | 次要工作量 |
| P2 | 9 类目录 | 按需浏览 |

### 给新上下文窗口的启动指令

```
请按照 docs/rush/openclaw-docs-study-plan.md 中的计划，系统性阅读 OpenClaw 文档并生成参考手册。

文档源路径：通过 `npm root -g` 获取全局 node_modules 路径，然后读 openclaw/docs/ 下的文件。

产出文件：docs/rush/openclaw-reference-manual.md

按 P0 优先级顺序逐个读，每读完一篇提炼要点写入参考手册。
```
