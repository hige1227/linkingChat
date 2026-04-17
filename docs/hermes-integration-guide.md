# Hermes Agent 集成指南

> **目标**: 在 LinkChat Desktop 中使用 Hermes Agent 替代/共存 OpenClaw 作为 LLM 引擎
> **适用环境**: Windows 11 + WSL2
> **更新日期**: 2026-04-17

---

## 1. Hermes 是什么

[Hermes Agent](https://github.com/Nousresearch/hermes-agent) 是 NousResearch 开发的开源 AI Agent，是 OpenClaw 的继任者。核心特点：

- **OpenAI 兼容 API**: `hermes gateway start --port 8765` 启动后暴露 `/v1/chat/completions` SSE 端点
- **多模型支持**: DeepSeek、Kimi、MiniMax、OpenRouter、Anthropic 等 22+ 提供商
- **自带工具系统**: Web 搜索、终端命令、文件操作等
- **多平台 Gateway**: Telegram/Discord/Slack/WhatsApp 等 30+ 渠道
- **MIT 许可证**

## 2. 架构关系

```
LinkChat Desktop (Electron)
  ├── OpenClawAdapter (WS → 本地 OpenClaw Gateway)  ← 默认
  └── HermesAdapter  (HTTP SSE → 本地 Hermes Gateway)
         │
         ▼
  WSL2: hermes gateway start --port 8765
         │
         ▼
  LLM Provider (DeepSeek / Kimi / MiniMax 等)
```

**关键点**:
- 两个 sidecar 共存，Desktop 启动时都 pre-warm
- 默认走 OpenClaw，可通过 IPC 切换到 Hermes
- Hermes 原生不支持 Windows，必须在 WSL2 中运行
- Desktop `HermesAdapter` 通过 `http://127.0.0.1:8765` 连接 WSL2 中的 Hermes

## 3. 安装步骤

### 3.1 确认 WSL2 可用

```powershell
# PowerShell 中检查
wsl --status

# 如果没有安装
wsl --install
```

### 3.2 在 WSL2 中安装 Hermes

```bash
# 进入 WSL2
wsl

# 一键安装 (包含 Python、Node.js、ripgrep 等所有依赖)
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash

# 重载 shell
source ~/.bashrc
```

安装完成后验证：
```bash
hermes version
hermes doctor
```

### 3.3 配置 LLM Provider

```bash
# 交互式选择模型和提供商
hermes model
```

推荐选择 (你已有 API Key):
- **DeepSeek**: 设置 `DEEPSEEK_API_KEY` (你 Server 端已有)
- **Kimi**: 设置 `KIMI_API_KEY`
- **MiniMax China**: 设置 `MINIMAX_CN_API_KEY` (你 OpenClaw 已在用)

手动设置方式：
```bash
# 方式 1: 交互式
hermes model

# 方式 2: 直接设置 env
echo 'DEEPSEEK_API_KEY=your_key_here' >> ~/.hermes/.env
hermes config set model deepseek/deepseek-chat
```

### 3.4 从 OpenClaw 迁移 (可选)

```bash
# 自动迁移 OpenClaw 的模型配置和 API key
hermes claw migrate
```

## 4. 启动 Gateway

### 4.1 手动启动 (测试用)

```bash
# 在 WSL2 中
hermes gateway start --port 8765
```

验证:
```bash
# 另一个 WSL2 终端
curl http://127.0.0.1:8765/health
# 应返回 OK

curl http://127.0.0.1:8765/v1/models
# 应返回可用模型列表
```

### 4.2 Windows 端口转发

WSL2 的 `127.0.0.1:8765` 通常 **自动映射** 到 Windows 的 `127.0.0.1:8765`。但如果不通：

```powershell
# PowerShell (管理员) — 手动转发
$wslIp = (wsl hostname -I).Trim()
netsh interface portproxy add v4tov4 listenport=8765 listenaddress=127.0.0.1 connectport=8765 connectaddress=$wslIp
```

验证 Windows 端能否访问：
```powershell
# PowerShell
Invoke-WebRequest http://127.0.0.1:8765/health
```

### 4.3 测试 OpenAI 兼容 API

```bash
# 在 WSL2 或 Windows 中
curl -X POST http://127.0.0.1:8765/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "hermes",
    "messages": [{"role": "user", "content": "Hello, 你好"}],
    "stream": true
  }'
```

应返回 SSE 流式数据。

## 5. Desktop 端测试

### 5.1 启动 Desktop

```powershell
# 确保 Hermes Gateway 已在 WSL2 中运行
pnpm dev:desktop
```

### 5.2 验证 Hermes 连通性

启动时控制台应显示：
```
[Hermes:Process] Started on port 8765
```
或 (因为 Windows 没有本地二进制):
```
Hermes binary not found at: ...
```
**这是正常的** — `HermesProcessService` 尝试 spawn 本地 `hermes.exe`，但 Hermes 在 WSL2 运行，不需要 Desktop spawn。关键是 `HermesAdapter` 能通过 HTTP 连到 `127.0.0.1:8765`。

### 5.3 切换到 Hermes

在 Desktop DevTools Console 中：
```js
// 查看当前 Provider
await window.api.getAgentType() // → 'openclaw'

// 切换到 Hermes
await window.api.setAgentType('hermes')

// 确认切换成功
await window.api.getAgentType() // → 'hermes'
```

### 5.4 测试聊天流

1. 打开 Jarvis Bot 对话
2. 发一条消息: "你好，Hermes"
3. 预期: 流式回复走 Hermes HTTP SSE → `HermesAdapter`
4. 观察控制台: 不应有连接错误

### 5.5 切回 OpenClaw

```js
await window.api.setAgentType('openclaw')
```

### 5.6 验证持久化

1. 切到 Hermes 后重启 Desktop
2. `await window.api.getAgentType()` 应返回 `'hermes'`
3. 存储在 `electron-store` 的 `linkingchat-agent` 配置中

## 6. 当前代码的问题和改进方向

### 6.1 HermesProcessService 在 Windows 上无效

**现状**: `HermesProcessService.resolveBinaryPath()` 查找 `resources/hermes-env/lib/Scripts/hermes.exe`，这在 Windows 上不存在。

**实际需要**: 在 Windows + WSL2 环境下，Desktop 不应尝试 spawn Hermes 进程，而是假设 WSL2 中已手动运行。

**改进方案** (需要代码修改):

```typescript
// hermes-process.service.ts
async start(): Promise<boolean> {
  // Windows + dev mode: skip local spawn, assume WSL2 managed
  if (process.platform === 'win32' && !app.isPackaged) {
    console.log('[Hermes:Process] Windows dev mode — skipping local spawn, assuming WSL2 gateway');
    const healthy = await this.checkHealth();
    if (healthy) {
      console.log('[Hermes:Process] Gateway detected on port 8765');
      return true;
    }
    console.warn('[Hermes:Process] No gateway on port 8765 — start manually in WSL2');
    return false;
  }
  // ... existing binary spawn logic for macOS/Linux
}
```

### 6.2 HermesAdapter 硬编码 URL

**现状**: `HERMES_BASE_URL = 'http://127.0.0.1:8765'` 硬编码。

**改进**: 可从 `electron-store` 读取，允许用户配置 Hermes Gateway 地址。

### 6.3 缺少 hermes.config.ts

**现状**: `HERMES_BASE_URL` 直接在 `hermes.adapter.ts` 中定义为常量，没有独立配置文件。

### 6.4 SetupService 与 Hermes 的关系

`SetupService` 在首次启动时从 Server 获取 `DEEPSEEK_API_KEY`，但 Hermes 有自己的配置系统 (`~/.hermes/.env`)。两者是独立的：
- Desktop 的 `SetupService` 是给未来的内嵌 Hermes 用的 (获取 API key 传给子进程)
- 当前 WSL2 方案下，Hermes 用自己的配置，不需要 SetupService

## 7. 生产环境打包

`scripts/bundle-agents.sh` 处理了 CI/打包流程：
1. 下载独立 Python 3.11 运行时
2. 创建 venv，pip install hermes-agent
3. 放入 `resources/hermes-env/`
4. Desktop 启动时 `HermesProcessService.spawn()` 执行

但 **Windows 生产包也会失败** — Hermes 不支持原生 Windows。生产方案：
- Windows 用户: 仍使用 OpenClaw (默认)
- macOS/Linux 用户: 可选择 Hermes
- 或者提供 Docker 化的 Hermes sidecar

## 8. 总结: 你现在需要做的

| 步骤 | 命令 | 说明 |
|------|------|------|
| 1. 安装 WSL2 | `wsl --install` | 如果还没有 |
| 2. 安装 Hermes | `curl -fsSL ... \| bash` | 在 WSL2 中 |
| 3. 配置 Provider | `hermes model` | 选 DeepSeek/Kimi |
| 4. 启动 Gateway | `hermes gateway start --port 8765` | 在 WSL2 中 |
| 5. 验证连通 | `curl http://127.0.0.1:8765/health` | Windows PowerShell |
| 6. 启动 Desktop | `pnpm dev:desktop` | 切换到 hermes 测试 |

---

## 参考资料

- [Hermes Agent 官方文档](https://hermes-agent.nousresearch.com)
- [安装指南](https://hermes-agent.nousresearch.com/docs/getting-started/installation)
- [快速开始](https://hermes-agent.nousresearch.com/docs/getting-started/quickstart)
- [Python Library 用法](https://hermes-agent.nousresearch.com/docs/guides/python-library)
- [GitHub](https://github.com/nousresearch/hermes-agent)
- [Hermes 中文安装踩坑记录](https://www.cnblogs.com/itech/p/19862085)
