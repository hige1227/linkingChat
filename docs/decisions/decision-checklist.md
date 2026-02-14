# LinkingChat 实施决策清单

> 请在每个问题的 **回答：** 后填写你们的决定。标注 `[必答]` 的问题会阻塞开发启动。

---

## 一、实施策略

### Q1. 起步优先级 `[必答]`

架构文档建议的顺序是 Eye → Hand → Brain，但这预设了 Desktop Client 骨架已存在。实际从零开始，你们打算：

- A. 桌面端优先 — 先搭 Desktop Client 骨架 + Desktop Bridge PoC（验证 GUI 自动化可行性）
- B. 云端优先 — 先搭 WebSocket Gateway + Intent Planner + Draft 状态机
- C. 全链路最小 PoC — 三端同时搭最小骨架，先跑通「手机→云→桌面」一条完整链路
- D. 桌面端+云端 — 先不做移动端，用 CLI 或 Web 测试界面代替手机端
- E. 其他（请说明）

**回答：C. 全链路最小 PoC — 三端同时搭最小骨架，先跑通「手机→云→桌面」一条完整链路**

### Q2. 第一个可演示的里程碑是什么？ `[必答]`

例如：
- "在电脑上读取微信最后一条消息，显示在终端里"
- "从手机发一条指令，电脑上的微信自动发出一条消息"
- "跑通 WebSocket 连接，手机端能看到桌面端在线状态"

**回答：手机app发送个好友电脑端A一个干活的指令，电脑直接干活并且将任务交付，发回给手机端回复已经做完任务**

### Q3. 项目定位澄清

**重要澄清：我们不是要适配微信或其他现有社交app，而是要模仿 Discord/Telegram/WhatsApp 做一个全新的社交app。这是 AI Native 的设计，深度融合 OpenClaw 能力。**

**回答：不是适配，是模仿discord/wechat/telegram/whatsapp做一个社交app，但是是AI native的，深度融合openclaw的**

---

## 二、技术栈选型

### Q4. 开发平台 `[必答]`

你们团队主要用什么操作系统开发？这直接决定 Desktop Bridge 先适配哪个 OS 的 API。

- A. Windows（先做 UIAutomation + SendInput）
- B. macOS（先做 Accessibility API + AppleScript）
- C. 两个都要从一开始就做

**回答：最好2个一起做。如果无法两个一起做，那就先mac后windows**

### Q5. 云端语言和框架 `[必答]`

- A. Node.js / TypeScript — 全栈统一 TS，和桌面端共享类型定义和协议
- B. Python + FastAPI — LLM 生态更成熟，和 Groq/vLLM SDK 集成更自然
- C. Go — 高并发 WebSocket 性能好，但 LLM 生态弱
- D. 其他（请说明）

**回答：A. Node.js / TypeScript (NestJS)** ✅ 已确认

**Rust 曾被讨论但已否决（2026-02-13）**，理由：
- 团队已确认 TypeScript everywhere，前后端共享类型/协议定义是核心效率优势
- 2-3 人团队，Rust 学习曲线会拖垮 MVP 进度
- 性能瓶颈在 LLM API 调用延迟（几百ms~几秒），不在后端框架（NestJS 处理 WebSocket 转发是微秒级）
- NestJS 单实例可扛 5000-10000 WebSocket 并发；加上水平扩展（多实例 + Redis），10万级连接无压力
- 扩展性靠架构（Nginx 负载均衡 + Redis pub/sub + PostgreSQL 分表），不靠语言
- 正确路径：NestJS 快速验证 → 产品成功 → 用数据找真正瓶颈 → 针对性优化（可能是 Rust 重写某个微服务）

### Q6. 移动端技术栈

文档标注了 TBD（React Native / Flutter）：

- A. React Native — JS 生态统一，可和 Node.js 后端共享部分代码/类型
- B. Flutter — UI 性能好，但需要 Dart，和 Node 后端无代码复用
- C. 先用 Web 端（React/Vue/其他）— 降低初期成本，后期再做原生 App
- D. 还没决定，先不做移动端

**回答：待推荐 — 考虑因素：
- Flutter: 一套代码同时支持 iOS 和 Android，UI 性能好，但需要学习 Dart
- React Native: JS 生态统一，可和 Node.js 后端共享代码/类型

**推荐：Flutter** — 因为需要同时支持 iOS 和 Android，Flutter 的跨平台能力和 UI 性能更适合社交app场景**

### Q7. 桌面端打包方式

文档提到"单文件 Node 二进制"，具体用什么方案？

- A. pkg（Vercel）— 打包成单个可执行文件
- B. Electron — 有 GUI 界面，但体积大
- C. 纯 Node.js 脚本 — 开发阶段先不打包，直接 `node` 运行
- D. 其他（如 nexe、Bun 等）

**回答：B. Electron — 桌面端类似桌面版 WhatsApp/Discord，有完整 GUI 界面，并且融合云端 OpenClaw 控制本地 worker。需要同时展示社交界面和本地控制功能**

### Q8. 数据库选型

架构文档定义了 `drafts` 表的 SQL schema，但没有指定具体数据库：

- A. PostgreSQL
- B. MySQL
- C. SQLite（适合早期、单机开发）
- D. MongoDB（NoSQL，schema 灵活）
- E. 其他

**回答：A. PostgreSQL**

### Q9. LLM 服务

文档提到 Groq 和 vLLM，具体：

- 用哪个 LLM 提供商（Groq / OpenAI / Anthropic / 自部署）？
- 用哪个模型？
- 是否需要支持多个 provider 切换？

**回答：需要支持多 provider 切换，并且有灵活路由策略：
- 简单任务：使用便宜模型（如 DeepSeek）
- 复杂任务：使用高智商模型（如 Kimi 2.5）**

---

## 三、项目结构

### Q10. 仓库结构 `[必答]`

- A. Monorepo — 所有组件（desktop / cloud / mobile / shared）在一个仓库里，用 pnpm workspace 或 turborepo 管理
- B. 多仓库 — 每个组件独立仓库
- C. 先 monorepo，后期拆分

**回答：C. 先 monorepo，后期根据需要拆分**

### Q11. 编程语言

桌面端用 TypeScript 还是纯 JavaScript？

- A. TypeScript（推荐，有类型安全，特别是 WebSocket 协议定义）
- B. JavaScript

**回答：A. TypeScript（推荐，有类型安全，特别是 WebSocket 协议定义）**

---

## 四、Desktop Bridge 细节

### Q12. GUI 自动化方案

文档列出了 UIAutomation (Win) / Accessibility API (Mac)，但实现路径有多种：

- A. 用 Node.js FFI（如 `ffi-napi`、`koffi`）直接调用系统 API
- B. 用 Node.js 调用 PowerShell / AppleScript 脚本（shell exec，简单但慢）
- C. 写 C++ Native Addon（性能最好但开发成本高）
- D. 用现有 Node.js 库（如 `robotjs`、`nutjs`、`node-window-manager`）
- E. 混合方案（请说明）

**回答：参考截图确定具体方案**（需查看用户提供的截图来明确技术选型）

### Q13. 微信版本锁定

PC 版微信更新频繁，UI 结构可能变化。你们是否考虑过：

- 锁定特定微信版本？
- 如何应对微信 UI 更新导致自动化失效？
- 是否需要 OCR 作为 fallback（当 Accessibility API 失效时）？

**回答：不适用 — 我们不是要控制微信或适配微信，而是开发一个独立的 AI Native 社交app**

---

## 五、安全与部署

### Q14. 云端部署环境

- A. 自有服务器 / VPS
- B. AWS / GCP / Azure
- C. 国内云（阿里云 / 腾讯云 / 华为云）
- D. 开发阶段先跑本地，不部署

**回答：A/B/C - 云服务部署（具体平台待定，根据项目推进选择合适的云服务商）**

### Q15. WebSocket 认证方案

文档提到 Read-Only Token 和 Full-Access Token，具体用什么认证：

- A. JWT
- B. API Key
- C. OAuth 2.0
- D. 还没想好

**回答：D. 还没想好，你根据项目推进推荐**

### Q16. 桌面端与云端的通信

开发阶段桌面端和云端是否在同一台机器上（localhost），还是从一开始就跨网络？

**回答：这个藻辉看**（由藻辉决定）

---

## 六、团队与流程

### Q17. 团队规模与分工

大概几个人参与开发？是否有前端/后端/桌面端的分工，还是全栈一人搞？这影响代码结构和模块拆分粒度。

**回答：2-3个人参与开发，前后端等都分开**

### Q18. 是否使用 CI/CD

是否需要从一开始就配置 GitHub Actions 或其他 CI？还是先手动构建？

**回答：徐岙cicd**（由徐岙负责 CI/CD）

### Q19. 测试策略

- A. 从一开始写单元测试（Jest / Vitest）
- B. 先写代码，稳定后补测试
- C. 只做集成测试 / E2E 测试
- D. 还没想好

**回答：A. 从一开始写单元测试（Jest / Vitest）**

---

## 七、补充问题

### Q20. Bmad v4 框架

你提到文档是通过 Bmad v4 框架输出的。这个框架是否还会用于后续流程（比如生成更多文档、管理迭代）？是否有其他约束或规范我需要遵循？

**回答：后续使用 Bmad v6**

### Q21. 其他你们认为重要但我没问到的

**回答：重申项目核心定位 — 我们要做一个 **AI Native 社交 App**，模仿 Discord/Telegram/WhatsApp 的形态，但有本质区别：

1. **深度融合 OpenClaw**：云端集成 OpenClaw 能力，可以指挥本地电脑桌面端工作
2. **双重功能**：
   - 社交流功能（聊天、群组、好友）
   - 远程控制功能（通过手机 App 指挥电脑工作）
3. **原生 AI 集成**：
   - 帮助用户社交（智能回复、内容推荐）
   - 帮助用户工作（任务自动化、智能提醒）
   - 主动提醒用户（要不要干什么、要不要发什么）
4. **不是微信**：我们和微信没有关系，是自己做一个全新的社交app

---

*填写完成后请告知，我会基于你们的决策开始搭建项目骨架。*
