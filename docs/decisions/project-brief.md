# 📄 Project Brief: LinkingChat (v2.0 Refined)

| 属性 | 内容 |
| :--- | :--- |
| **项目名称** | **LinkingChat** (代号: Ghost Mate) |
| **版本** | v2.0 (Refined via Brainstorming) |
| **核心定位** | **The Social-Native AI Operating System** (社交原生 AI 操作系统) |
| **Slogan** | **Chat is your new Command Line.** (聊天即指令，好友即接口) |
| **状态** | ✅ 已确认 (Approved) |

---

## 1. 战略愿景 (Vision)

打造一个打破“通讯”与“工具”界限的下一代 IM 平台。
LinkingChat 不仅仅是一个聊天软件，它通过将 **OpenClaw (Moltbot)** 的设备控制能力无缝融入社交界面，让用户在聊天窗口中不仅能与人交流，还能指挥自己的（或好友的）电脑完成复杂工作。

**核心理念：** 用户不需要在“微信”和“终端”之间切换。你的 Bot 是你的数字替身，它既能帮你回消息，也能帮你跑代码。

---

## 2. 核心痛点与解决方案 (Problem & Solution)

| 当前痛点 | LinkingChat 解决方案 |
| :--- | :--- |
| **割裂的工作流** | 用户需要“一边在 IM 聊需求，一边切到 IDE/终端跑代码”。 | **All-in-Chat:** 聊天窗口即控制台。输入自然语言，Bot 直接在后台调用本地 Node 环境执行。 |
| **AI 恐惧感** | 害怕 AI 自动回复说错话，或自动操作删错文件。 | **Draft & Verify (草稿即正义):** Bot 永远只生成“草稿”或“建议”，必须由用户点击发送或确认。 |
| **配置门槛高** | OpenInterpreter/OpenClaw 需要复杂的本地环境配置。 | **SaaS + Thin Client:** 客户端仅需一个轻量级 Node 运行时，大脑和复杂逻辑全在云端。 |

---

## 3. 三大核心交互模式 (The "Holy Trinity" Experience)

这是本项目区别于传统 IM 和传统 Agent 的关键体验增量：

### 3.1 交互 A: 代理草稿 (Draft & Verify)
* **场景：** 用户通过手机 `@Bot` 下达指令（如“把电脑桌面的 Q3 财报发给王总”）。
* **行为：** Bot **不自动发送**。它会静默连接电脑读取文件，生成一段得体的回复文案，并将“文案 + 附件”挂载到输入框中。
* **用户动作：** 用户确认无误后，点击 **[发送]**。

### 3.2 交互 B: 耳语建议 (The Whisper)
* **场景：** 用户收到好友消息，想借助 AI 回复（如"今晚约饭吗？"）。
* **MVP 行为：** 用户在输入框输入 `@ai` 主动触发。Bot 读取聊天上下文和用户偏好，生成 **1 个最优回复**（预填入输入框），旁边有 `···` 可展开 2 个备选。
* **不做：** 输入框上方自动悬浮建议气泡（已否决，体验太 generic）。
* **用户动作：** 直接编辑/发送预填内容，或展开备选替换。
* **v2+ 演进：** 灰体补全（Ghost Text）——输入框获焦 + 停顿 ≥2 秒时，基于本地小模型意图预测自动显示灰体建议。类似 VS Code Copilot，但需本地小模型保证低延迟和隐私。

### 3.3 交互 C: 预测执行 (Predictive Actions)
* **场景：** Bot 执行完一个任务后（如分析报错日志）。
* **行为：** Bot 自动预判用户的下一步需求，生成 **“下一步行动按钮”**（如 `[点击运行修复命令]`）。
* **用户动作：** 点击按钮，Bot 直接调用本地 Shell 执行。

---

## 4. 技术架构策略 (Technical Strategy)

采用 **"Cloud Brain + Local Hands" (云端大脑 + 本地傀儡)** 架构：

1.  **桌面端 (The Hand):**
    * **极简 Node.js Runtime:** 不安装完整的 OpenClaw/Python 开发环境。
    * **功能:** 仅作为一个 Socket 客户端，接收云端下发的 JSON 指令（如 `fs.readFile`, `child_process.exec`）。
    * **优势:** 实现“下载即用”，无环境依赖。

2.  **云端 (The Brain):**
    * **SaaS Core:** 托管所有 LLM 推理、Context 管理、User Prompt (`Soul.md`)。
    * **OpenClaw Logic:** 将复杂的 Agent 逻辑（工具调用、规划）封装在云端。

3.  **移动端 (The Remote):**
    * 纯粹的 UI 层。通过云端路由，向桌面端发送指令，并接收执行结果反馈。
    * **设计方向 (2026-02-13)**：微信/WhatsApp 风格，less is more。Bot 作为固定置顶的系统级联系人（类似微信"文件传输助手"）。支持多 Bot 框架，用户可创建不同用途的 bot（MVP 仅远程执行能力）。

---

## 5. 成功指标 (Success Metrics)

* **北极星指标 (North Star):** **每日跨设备指令数 (Daily Cross-Device Intents)**
    * 定义：用户用手机指挥电脑执行任务，或用 Bot 辅助发送消息的次数。
* **体验指标:** **Draft-to-Send Rate (草稿发送率)**
    * 定义：Bot 生成的草稿被用户实际采纳（点击发送）的比例。

---

## 6. 下一步行动 (Next Steps)

1.  **更新 PRD:** 将“三大核心交互”详细写入 `prd.md` 的功能需求章节。
2.  **UI 原型:** 为“草稿模式”和“悬浮气泡”设计高保真原型。
3.  **技术验证 (PoC):** 跑通 `手机 App -> 云端 -> 桌面 Node` 的最小链路。