# LinkingChat 参考项目详解

> 按照 LinkingChat 需要解决的**具体问题**组织，说明每个项目能帮我们解决什么。
> 调研日期：2026-02-11

---

## 问题 1：怎么做一个 WebSocket 实时聊天后端？

这是最核心的基建问题。三个项目可以参考，定位完全不同：

### 1.1 Spacebar Server — 最直接的答案（必看）

- **仓库**：https://github.com/spacebarchat/server
- **Stars**：4k+
- **技术栈**：TypeScript + TypeORM + PostgreSQL/MySQL/SQLite

Spacebar 用 TypeScript 把 Discord 后端**完整反向工程**了一遍。我们的云端也是 TypeScript + PostgreSQL，所以它几乎就是一个"可以直接抄作业"的参考。

**帮我们解决的问题：**

| 问题 | Spacebar 怎么做的 |
|------|-------------------|
| WebSocket Gateway 怎么写 | 连接管理、心跳检测、断线重连、事件分发 |
| 消息协议怎么设计 | opcode 机制（0=事件推送，1=心跳，2=认证），事件类型命名（MESSAGE_CREATE, TYPING_START 等） |
| REST API 怎么和 WebSocket 配合 | 查历史消息走 REST，实时推送走 WS |
| 数据库模型怎么设计 | 用户、频道、消息、好友关系的表结构（TypeORM，支持 PostgreSQL） |
| JWT 认证流程 | 登录拿 token → WS 连接后发 Identify 消息 → 服务端验证 |

**局限**：代码量大（完整 Discord 兼容），我们不需要全部。建议只看 `src/gateway/` 和 `src/api/` 核心目录。

---

### 1.2 Rocket.Chat — 生产级参考

- **仓库**：https://github.com/RocketChat/Rocket.Chat
- **Stars**：42k+
- **技术栈**：Node.js + TypeScript + Meteor + MongoDB

42k stars，被德国铁路、美国海军、瑞信等企业实际使用。

**帮我们解决的问题：**

| 问题 | Rocket.Chat 怎么做的 |
|------|---------------------|
| 消息推送怎么做 | 离线消息队列、移动端推送集成（FCM/APNs） |
| 文件上传怎么处理 | S3 兼容存储、文件缩略图生成、上传进度 |
| 搜索怎么做 | 消息全文搜索（基于 MongoDB 或 Elasticsearch） |
| SDK 和插件系统怎么设计 | 完整的 JS SDK，第三方可以通过 API 集成 |

**局限**：用 Meteor 框架（比较老），底层是 MongoDB（我们用 PostgreSQL），不能直接搬代码，但架构思路有价值。

---

### 1.3 Mattermost — PostgreSQL 消息存储参考

- **仓库**：https://github.com/mattermost/mattermost
- **Stars**：31k+
- **技术栈**：Go + React + PostgreSQL

后端用 Go，但**数据库是 PostgreSQL**——和我们一样。

**帮我们解决的问题：**

| 问题 | Mattermost 怎么做的 |
|------|---------------------|
| PostgreSQL 怎么存消息 | 消息表分区策略、索引设计、查询优化 |
| 频道/会话模型怎么设计 | 1对1、群聊、频道的统一数据模型 |
| 消息同步怎么做 | 已读位置追踪、未读计数、消息分页加载 |

**局限**：后端是 Go，代码不能直接用，只能参考数据模型和 SQL schema。

---

## 问题 2：UI 长什么样？前端怎么做得像 Discord？

### 2.1 Revolt / Stoat — UI/UX 参考（推荐）

- **仓库**：https://github.com/revoltchat
- **Stars**：2k+
- **技术栈**：Rust 后端 + MongoDB + Redis + RabbitMQ，前端 TypeScript (Preact/SolidJS)

Revolt 是长得最像 Discord 的开源替代品，几乎像素级复刻了 Discord 的界面布局。

**帮我们解决的问题：**

| 问题 | Revolt 怎么做的 |
|------|----------------|
| 界面布局怎么做 | 左侧服务器列表 → 中间频道列表 → 右侧消息区 → 最右成员面板 |
| 消息列表怎么渲染 | 虚拟滚动、消息分组（同一用户连续消息合并）、时间分隔线 |
| 在线状态怎么展示 | 头像角标（绿色在线、黄色离开、红色勿扰、灰色离线） |
| 输入框交互 | typing 指示器、@提及、表情选择器 |

**局限**：前端用 Preact/SolidJS（不是 React），后端用 Rust + MongoDB。我们桌面端用 Electron + React，移动端用 Flutter，所以只能参考设计思路，不能搬代码。

---

### 2.2 discord-clone — 快速理解全栈实现

- **仓库**：https://github.com/nayak-nirmalya/discord-clone
- **Stars**：1k+
- **技术栈**：Next.js + TypeScript + Socket.io + Prisma + MySQL

一个人写的全栈 Discord 克隆，代码量小，适合快速理解。

**帮我们解决的问题：**

| 问题 | 这个项目怎么做的 |
|------|----------------|
| 快速理解 Discord 核心功能怎么实现 | 频道创建、消息发送、文件上传、实时更新，整套流程代码就几千行 |
| Prisma ORM 怎么用 | 如果我们选 Prisma 做 ORM，这个项目的 schema 设计可以直接参考 |
| Socket.io 实时通信模式 | 房间管理、事件广播、命名空间 |

**局限**：是 Web 项目（Next.js），没有 Electron 桌面端或 Flutter 移动端。

---

## 问题 3：Flutter 怎么和 Node.js 后端通过 WebSocket 通信？

### 3.1 flutter_chat_app_with_nodejs — 与我们技术栈最接近（必看）

- **仓库**：https://github.com/RodrigoBertotti/flutter_chat_app_with_nodejs
- **技术栈**：Flutter + Node.js + MySQL + WebSocket (TypeORM)

这个项目和我们的技术栈**最接近**：Flutter 前端 + Node.js 后端 + WebSocket + 关系型数据库。

**帮我们解决的问题：**

| 问题 | 这个项目怎么做的 |
|------|----------------|
| Flutter 端 WebSocket 连接怎么写 | `web_socket_channel` 包的用法、断线重连逻辑 |
| 消息序列化 | Flutter (Dart) 和 Node.js 之间 JSON 消息的编解码 |
| 实时消息列表 UI | Flutter 的 ListView 实时更新模式 |
| TypeORM 怎么换数据库 | 项目文档明确说可以换成 PostgreSQL |

---

### 3.2 chat_app (gabryelferreira) — 推送通知参考

- **仓库**：https://github.com/gabryelferreira/chat_app
- **技术栈**：Flutter + Node.js + Socket.io + MongoDB + Firebase Messaging

**额外帮我们解决：**

| 问题 | 这个项目怎么做的 |
|------|----------------|
| 移动端推送通知怎么做 | 集成了 Firebase Cloud Messaging (FCM)，移动端离线推送的标准方案 |
| 本地缓存怎么做 | 用 SQLite 缓存消息，离线也能看历史记录 |

---

## 问题 4：远程执行命令（Shell/文件操作）怎么做？安全吗？

### 4.1 OpenClaw — 最完整的 AI + 本地执行方案（必看，但不建议直接集成）

- **仓库**：https://github.com/openclaw/openclaw
- **Stars**：68k+
- **安装**：`npm install -g openclaw@latest`（需 Node >= 22）
- **性质**：开源 AI 个人助手，本地守护进程

**帮我们理解的问题：**

| 问题 | OpenClaw 怎么做的 |
|------|------------------|
| 工具/技能系统怎么设计 | Shell 执行、文件读写、浏览器控制的统一接口抽象 |
| 安全确认模式怎么做 | `exec.ask: "on"` 配置下，每次执行都需用户确认——和 Draft & Verify 完全一致 |
| 多 LLM provider 路由 | 模型无关设计，支持切换不同 AI provider——和 DeepSeek/Kimi 路由需求一致 |

**为什么 MVP 不建议直接集成：**

1. 它是全局安装的 daemon（`npm install -g openclaw`），不是可以 `require()` 引入的库
2. 功能太多（消息桥接 WhatsApp/Telegram/Slack、浏览器控制、100+ 技能），我们 MVP 只需要 Shell + 文件操作
3. 引入它意味着用户必须额外安装和配置 OpenClaw，增加部署复杂度

**建议**：参考它的接口设计，自己写一个 200-300 行的 `TaskExecutor` 模块。

---

### 4.2 Open Interpreter — 安全执行模型参考（推荐）

- **仓库**：https://github.com/openinterpreter/open-interpreter
- **Stars**：62k+
- **技术栈**：Python

让 LLM 在本地执行代码（Python、JS、Shell）。

**帮我们解决的问题：**

| 问题 | Open Interpreter 怎么做的 |
|------|--------------------------|
| 命令执行前的确认机制怎么做 | 默认每次执行都弹确认，`auto_run` 模式可跳过——和 Draft & Verify 一模一样 |
| 危险命令怎么拦截 | 检测 `rm -rf`、`format` 等危险模式 |
| 沙箱执行怎么做 | 支持 Docker 容器内执行，隔离风险 |

**局限**：Python 项目，不能直接用在 Node.js/Electron 里，但安全模型的设计思路完全可以照搬。

---

## 问题 5：三端代码怎么组织在一个仓库里？

### 5.1 electron-vite-monorepo — Electron + Turborepo 参考

- **仓库**：https://github.com/buqiyuan/electron-vite-monorepo
- **技术栈**：Electron + Vue + TypeScript + Turborepo + pnpm

**帮我们解决的问题：**

| 问题 | 这个项目怎么做的 |
|------|----------------|
| Electron 项目在 Turborepo 里怎么配置 | `turbo.json` pipeline、`pnpm-workspace.yaml` 结构 |
| 主进程和渲染进程怎么分包 | Electron main/renderer/preload 的目录组织 |

---

### 5.2 pnpm-monorepo-template — 共享包怎么做

- **仓库**：https://github.com/jkomyno/pnpm-monorepo-template
- **技术栈**：TypeScript + pnpm + Turborepo + Vitest

**帮我们解决的问题：**

| 问题 | 这个项目怎么做的 |
|------|----------------|
| 共享 TypeScript 类型怎么跨包使用 | `packages/shared-types/` 被多个 app 同时引用 |
| Vitest 怎么在 monorepo 里配置 | 每个包独立测试 + 根目录统一运行 |
| tsup 构建怎么配 | 共享包的打包配置 |

**现实情况**：没有任何现成项目同时包含 Flutter + Electron + Node.js。Flutter 用 Dart 工具链（pub），和 pnpm 不兼容。我们的 monorepo 里，Flutter 项目会是一个"独立岛屿"——放在 `apps/mobile/` 目录，但不由 pnpm 管理，构建通过 Turborepo 的自定义脚本触发。

---

## 优先级总结

| 优先级 | 项目 | 看什么 | 解决什么问题 |
|--------|------|--------|-------------|
| **必看** | [Spacebar Server](https://github.com/spacebarchat/server) | `src/gateway/` + `src/api/` | WS 协议 + REST API + 数据模型 + JWT |
| **必看** | [flutter_chat_app_with_nodejs](https://github.com/RodrigoBertotti/flutter_chat_app_with_nodejs) | 整个项目 | Flutter ↔ Node.js WebSocket 通信 |
| **必看** | [OpenClaw](https://github.com/openclaw/openclaw) | 工具接口 + 安全模式 | Shell/File 执行接口设计 + 确认机制 |
| 推荐 | [Revolt](https://github.com/revoltchat) | 前端代码 | Discord 风格 UI/UX 设计 |
| 推荐 | [Open Interpreter](https://github.com/openinterpreter/open-interpreter) | 安全模型 | 危险命令拦截 + 沙箱执行 |
| 推荐 | [discord-clone](https://github.com/nayak-nirmalya/discord-clone) | 全栈代码 | 快速理解 Discord 功能实现 |
| 可选 | [Rocket.Chat](https://github.com/RocketChat/Rocket.Chat) | 推送 + 文件上传 | 生产级消息推送和文件处理 |
| 可选 | [Mattermost](https://github.com/mattermost/mattermost) | SQL schema | PostgreSQL 消息存储设计 |
| 可选 | [electron-vite-monorepo](https://github.com/buqiyuan/electron-vite-monorepo) | 项目结构 | Electron Turborepo 配置 |
| 可选 | [pnpm-monorepo-template](https://github.com/jkomyno/pnpm-monorepo-template) | 共享包配置 | TypeScript 共享类型 + Vitest |

---

*本文档基于 2026-02-11 的公开信息整理。*
