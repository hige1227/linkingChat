# Test Plan — Zero-Friction Onboarding (Task 10)

> 需在 **macOS** 机器上执行。对应计划：`docs/superpowers/plans/2026-04-15-zero-friction-onboarding.md` Task 10。

---

## 前置条件

- macOS arm64 (Apple Silicon) 或 x86_64
- Node.js 22+、pnpm 10、Docker 已安装
- 项目根目录：`~/linkingChat`（或实际路径）
- Docker 服务已启动（`pnpm docker:up`）
- Server 已配置 `.env`（含 `DEEPSEEK_API_KEY`）

---

## Step 1：运行全量测试套件

```bash
pnpm test
```

**期望：** 所有测试通过，包含新增的 desktop Jest 测试（7 个测试套件，共约 20 个测试）

---

## Step 2：打包 Agent 资源（本地模拟）

```bash
bash scripts/bundle-agents.sh darwin arm64
```

**期望输出（最后几行）：**
```
==> Bundle complete. Total size:
xxx  apps/desktop/resources/
```

**验证文件存在：**
```bash
ls apps/desktop/resources/openclaw-sidecar/
ls apps/desktop/resources/hermes-env/lib/bin/hermes
```

---

## Step 3：启动 Dev App，观察主进程日志

```bash
pnpm dev:desktop
```

在 Electron **主进程控制台**（DevTools → Console，或终端输出）中查找：

```
[OpenClaw:Process] Using bundled sidecar: .../resources/openclaw-sidecar/...
[Hermes:Process] Started on port 8765
```

**可接受：** OpenClaw 连接失败（需要服务端运行）；Hermes 应该正常启动。

---

## Step 4：登录并验证 JARVIS 首次问候

1. 启动服务端：`pnpm dev:server`
2. 在 Desktop App 中用测试账号登录
3. 导航到 **Supervisor Bot** 对话
4. 验证：出现欢迎消息 `"你好！我是你的 JARVIS。我已经准备好了，有什么我可以帮你的？"`
5. 发送一条测试消息，验证流式响应正常出现

---

## Step 5：测试 Agent 切换

在 DevTools Console 中执行：

```javascript
await window.electronAPI.getAgentType()
// 期望: "openclaw"

await window.electronAPI.setAgentType('hermes')
// 期望: { success: true }

await window.electronAPI.getAgentType()
// 期望: "hermes"
```

发送一条消息，在**主进程控制台**确认 Hermes 在处理请求（应出现 Hermes 相关日志）。

---

## Step 6：验证持久化

1. 关闭 Desktop App（Cmd+Q）
2. 观察主进程控制台：应出现 `[Hermes:Process] Exited`（graceful shutdown）
3. 重新打开 Desktop App
4. 在 Console 执行：`await window.electronAPI.getAgentType()` → 期望仍为 `"hermes"`

---

## 通过标准

| 检查项 | 期望结果 |
|---|---|
| `pnpm test` | 全部通过 |
| `bundle-agents.sh` 完成 | resources/ 目录存在，含 hermes-env |
| 启动日志 | `[Hermes:Process] Started on port 8765` |
| JARVIS 问候 | 登录后 Supervisor Bot 显示欢迎消息 |
| 流式响应 | 发消息后 bot 有流式文字回复 |
| Agent 切换 | `setAgentType` 成功，重启后持久化 |
| 优雅关闭 | Cmd+Q 后 Hermes 进程退出 |
