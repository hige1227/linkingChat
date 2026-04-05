# OpenClaw 本地进程集成实战报告

> **日期**: 2026-04-05
> **作者**: Claude Code + 开发者
> **前置文档**: `docs/rush/openclaw-desktop-bundling-architecture.md`（架构设计）
> **状态**: Gateway 连接 + 命令执行已通，Bot UI 集成待做

---

## 一、背景与目标

### 1.1 从哪来

Sprint 3 Phase 5 完成了 OpenClaw **云端 Docker 集成**（Server 管理 Gateway 容器）。但实际产品方向是：

- **Desktop 是用户主要使用入口**，不是被动执行端
- OpenClaw Gateway 应该跑在用户电脑上（本地进程），不是云端容器
- Desktop 启动时自动 spawn Gateway，通过 `ws://127.0.0.1:18789` 本地通信

前期已完成 `openclaw-desktop-bundling-architecture.md` 的架构设计和 Phase 1 运行时代码骨架。本次工作是**让它真正跑通端到端**。

### 1.2 目标

1. Desktop spawn 本地 OpenClaw Gateway 进程
2. 通过自定义 WS 客户端连接 Gateway
3. 发送 `chat.send` 命令，Agent 调用 LLM + 工具执行，流式返回结果
4. `CommandExecutor` 优先走 OpenClaw，失败降级到 child_process

---

## 二、最终架构（已验证可用）

### 2.1 组件启停流程

```
用户启动 Desktop (pnpm dev:desktop)
    │
    ├── Electron Main Process 启动
    │   ├── 创建 BrowserWindow
    │   ├── 连接 NestJS Server (Socket.IO)
    │   └── 调用 connectToGateway()
    │       │
    │       ├── openClawProcessService.start()
    │       │   ├── resolveMode() → 'local'
    │       │   ├── 检查已有进程 → 有则复用
    │       │   ├── 检查端口 18789 → 被占则失败
    │       │   ├── resolvePaths() → 找到 openclaw.mjs
    │       │   ├── spawn:
    │       │   │   node openclaw.mjs gateway run \
    │       │   │     --allow-unconfigured \
    │       │   │     --dev \
    │       │   │     --port 18789 \
    │       │   │     --bind loopback \
    │       │   │     --auth none          ← 关键：本地不需要认证
    │       │   │
    │       │   ├── waitForHealth() → TCP 探测端口，最多等 30s
    │       │   └── 返回 { url: 'ws://127.0.0.1:18789', token: '' }
    │       │
    │       └── openClawClientService.connect(config, maxRetries=5)
    │           ├── 第 1 次尝试：可能失败（Gateway 初始化慢）
    │           ├── 等 2s → 第 2 次尝试：通常成功
    │           ├── WS 握手：
    │           │   ① Gateway 发 connect.challenge (nonce)
    │           │   ② Client 发 connect 请求 (device identity + 签名)
    │           │   ③ Gateway 回 hello-ok (protocol=3, scopes=[operator.read, operator.write])
    │           └── 连接成功
    │
    └── 正常运行（心跳 30s 一次）

用户关闭 Desktop
    │
    ├── app.on('before-quit') → openClawProcessService.stop() [async，不可靠]
    ├── process.on('exit') → openClawProcessService.killSync() [同步，保底]
    │   └── execSync('taskkill /PID xxx /F /T')  ← Windows 必须同步杀
    └── Gateway 进程被终止
```

### 2.2 命令执行链路

```
Desktop Console / Bot UI
    │
    ├── commandExecutor.execute('echo hello')
    │   ├── openClawClientService.isClientConnected() → true
    │   ├── executeViaOpenClaw():
    │   │   ├── client.chat(prompt, { timeout: 30000 })
    │   │   │   ├── WS 发送: { method: 'chat.send', params: { message, sessionKey: 'default', idempotencyKey } }
    │   │   │   ├── Gateway 回: { status: 'started', runId }
    │   │   │   ├── 流式事件: stream=lifecycle phase=start
    │   │   │   ├── 流式事件: stream=assistant data={text, delta}  [或 stream=tool]
    │   │   │   ├── 流式事件: stream=lifecycle phase=end
    │   │   │   └── 返回收集到的 text / tool_result
    │   │   └── 返回 { status: 'success', source: 'openclaw', executionTimeMs: ~10s }
    │   │
    │   └── [如果 OpenClaw 不可用] → executeWithChildProcess()
    │       └── child_process.exec() → { source: 'child_process', executionTimeMs: ~22ms }
```

### 2.3 关键文件清单

| 文件 | 职责 |
|------|------|
| `apps/desktop/src/main/services/openclaw-process.service.ts` | Gateway 进程管理（spawn/stop/killSync/health check） |
| `apps/desktop/src/main/services/openclaw-client.service.ts` | Gateway 连接管理（重试、自动配对） |
| `apps/desktop/src/main/services/openclaw-ws-client.ts` | 自定义 WS 客户端（协议 v3、device identity 签名、chat.send 流式） |
| `apps/desktop/src/main/services/command-executor.service.ts` | 命令执行（OpenClaw → child_process 降级） |
| `apps/desktop/src/main/ipc/openclaw.ipc.ts` | IPC 入口（connect/disconnect/restart/send-message/execute-command） |
| `apps/desktop/src/main/index.ts` | 生命周期（before-quit + process.exit 杀进程） |
| `apps/desktop/src/preload/index.ts` | Renderer API 暴露 |

### 2.4 OpenClaw 配置位置

| 文件 | 说明 |
|------|------|
| `~/.openclaw/openclaw.json` | 模型配置（当前 `minimax-cn/MiniMax-M2.7`） |
| `~/.openclaw/agents/main/agent/auth-profiles.json` | LLM API key 存储 |
| `%APPDATA%/linkingchat-desktop/.openclaw/device-identity.json` | 设备身份（ED25519 密钥对） |

---

## 三、完整调试过程

### 3.1 起点：`--auth token` 模式 Token 不一致

**现象**: Desktop spawn Gateway 用 `--auth token --token <随机>`, 但连接时 Gateway 拒绝。

**排查过程**:

1. Desktop 生成随机 token: `crypto.randomBytes(32).toString('hex')`
2. 通过 CLI 参数传给 Gateway: `--auth token --token xxx`
3. 同时设环境变量 `OPENCLAW_GATEWAY_TOKEN=xxx`
4. WS 客户端连接时把同一 token 放在 `auth: { token: xxx }` 和签名 payload 里
5. Gateway 仍然拒绝 — 怀疑 Gateway 内部有自己的 token 解析逻辑（`resolveGatewayCredentialsFromValues`），CLI 参数和环境变量可能有优先级问题

**结论**: 放弃 `--auth token`，改用 `--auth none`。理由：Desktop 和 Gateway 在同一台机器，`--bind loopback` 已保证外部不可达，token 认证是多余的。

### 3.2 `--auth none` 第一个坑：`this.token = ''` 是 falsy

**现象**: 切换到 `--auth none` 后，`getConnectionConfig()` 返回 `null`，上层认为没有可用配置。

**根因**: 
```ts
// openclaw-process.service.ts
this.token = '';  // 空字符串

// getConnectionConfig() 里
if (this.mode === 'local' && this.token && this.isProcessRunning()) {
//                            ^^^^^^^^^ 空字符串是 falsy！返回 false
```

**修复**: `this.token !== null` 替代 `this.token`（truthy 检查）。

### 3.3 `--auth none` 第二个坑：不发 device identity → "device identity required"

**现象**: 去掉签名和 auth 字段后，Gateway 回 `close code=1008 reason=device identity required`。

**排查**: 读 OpenClaw 源码 `gateway-cli-CWpalJNJ.js:26439`：

```js
function evaluateMissingDeviceIdentity(params) {
    if (params.hasDeviceIdentity) return { kind: "allow" };
    // ... 各种检查 ...
    return { kind: "reject-device-required" };  // ← 走到这里
}
```

**结论**: 即使 `--auth none`，Gateway 仍要求 device identity（设备管理/配对需要）。恢复发送 device identity。

### 3.4 `--auth none` 第三个坑：发了 device identity 但 Gateway 静默关闭 code=1000

**现象**: WS 连接成功 → challenge 收到 → connect 请求发出 → Gateway 回 `close code=1000 reason=n/a`（正常关闭，无错误信息）。

**深入排查**（读了大量 OpenClaw 压缩源码）:

1. 追踪 `resolveSignatureToken`: `connectParams.auth?.token ?? null` — 我们不发 auth 字段，得到 `null`
2. 追踪 `buildDeviceAuthPayload`: `const token = params.token ?? ""` — `null` 被转为空字符串 `""`
3. 我们客户端签名时 `this.token` 也是 `""`
4. **两边签名 payload 一致！** 不是签名问题

**真正原因**: Gateway 刚 spawn 就通过了 health check（TCP 端口探测），但内部 WS 处理逻辑还没完全初始化。第一次连接时 Gateway 处理了握手但在某个内部初始化步骤失败，静默关闭了连接。

**证据**: 手动在 DevTools console 调用 `window.electronAPI.connectOpenClaw()` 就能连上——因为此时 Gateway 已完全就绪（多等了几秒）。

**修复**: 添加重试机制，最多 5 次，间隔递增（2s/4s/6s/8s）。实测第 2 次重试即成功。

### 3.5 Windows 孤儿进程：Gateway 不随 Desktop 退出

**现象**: 关闭 Desktop 后，Gateway 进程仍在运行，占着 18789 端口。下次启动发现端口被占用 → 失败。整个调试过程中手动 `taskkill` 了至少 7-8 次。

**根因**: 
- `app.on('before-quit')` 调用 `stop()`（async），但 Electron 不等 async 完成就退出了
- Windows 上 `detached: false` 不保证子进程随父进程退出（不同于 Unix 进程组）
- `process.kill(pid, 'SIGTERM')` 在 Windows 上等同于立即终止，但实际上 Electron 退出太快，来不及执行

**修复**:
```ts
// 同步杀进程 — process.on('exit') 是同步回调，保证执行
killSync(): void {
    if (!this.process?.pid) return;
    try {
        if (process.platform === 'win32') {
            execSync(`taskkill /PID ${this.process.pid} /F /T`, { stdio: 'ignore' });
        } else {
            this.process.kill('SIGKILL');
        }
    } catch { /* 进程可能已退出 */ }
}

// index.ts
process.on('exit', () => {
    openClawProcessService.killSync();
});
```

还添加了进程复用逻辑：`start()` 检测已运行的 Gateway 直接返回配置，避免重复 spawn。

### 3.6 WS 协议对接：`agent` 方法不存在

**现象**: 发送 `{ method: 'agent', params: { message, agentId: 'main' } }`，Gateway 无响应，等到 30s 超时。

**排查**: 读 OpenClaw 源码发现 Gateway 注册的方法列表里没有 `agent`。正确方法是 `chat.send`。

**chat.send 协议要求**:

```json
{
    "type": "req",
    "id": "<unique-id>",
    "method": "chat.send",
    "params": {
        "message": "用户消息",
        "sessionKey": "default",        // 必填
        "idempotencyKey": "<unique-id>"  // 必填，用于去重和 runId 关联
    }
}
```

**响应流程**:
1. 立即返回: `{ ok: true, payload: { runId: "<idempotencyKey>", status: "started" } }`
2. 流式事件: `{ type: "event", event: "agent", payload: { runId, stream, data } }`
   - `stream=lifecycle, data.phase=start` — 开始
   - `stream=assistant, data.text=xxx, data.delta=xxx` — 文本输出
   - `stream=tool, data.phase=start/end` — 工具调用
   - `stream=lifecycle, data.phase=end` — 完成
3. 不会有最终的 response 消息（完成信号只通过 lifecycle event）

### 3.7 lifecycle phase 命名：`"end"` 不是 `"done"`

**现象**: Agent 回复了文本，但 chat generator 不终止，等到 30s 超时才返回。

**排查**: 添加 debug 日志，发现 lifecycle 事件确实到了，`payload.runId` 也匹配。但 `done` 标志没被设置。

**根因**: 代码里检查 `data?.phase === 'done'`，但 Gateway 实际发的是 `data.phase === 'end'`。

**修复**: `phase === 'end' || phase === 'done' || phase === 'error'`

### 3.8 30s 超时的最深层 Bug：`await completionPromise`

**现象**: 修复了 phase 检查后，`done` 被正确设为 `true`，generator 主循环也退出了，但函数仍然等了 30s 才返回。

**根因**（最隐蔽的 bug）:

```ts
// generator 主循环
while (!done || cursor < chunks.length) { ... }  // ← 正确退出了

// 但退出后有这一行：
this.off('agent', onAgentEvent);
await completionPromise.catch(() => {});  // ← 这里阻塞了 30s！
yield { type: 'done', text: '' };
```

`completionPromise` 在等 `pendingRequests` 的 response 回调。但 `chat.send` 的初始 response `{ status: "started" }` 被跳过了（不删除 pendingRequest），后续再没有 response 消息（完成信号是通过 event 来的），所以 pendingRequest 永远不会被 resolve，等到 30s 超时的 `setTimeout` 才 reject。

**修复**: 去掉 `await completionPromise`，改为独立的 `setTimeout` 做超时保底，lifecycle end 事件直接 `clearTimeout` + 删除 pendingRequest。

### 3.9 LLM Provider：Kimi API key 不兼容

**现象**: Gateway 连接成功，`chat.send` 发出，收到 lifecycle start 事件，然后 lifecycle error: `HTTP 401 authentication_error: The API Key appears to be invalid`

**排查**: 
- 用户的 API key 是 `api.moonshot.cn/v1` 平台的
- OpenClaw 内置的 `kimi-coding` provider 用的是 `https://api.kimi.com/coding`（Kimi Coding API）
- 两个是不同的 API 端点，key 不通用

**尝试覆盖 baseUrl**:
```json
// ~/.openclaw/openclaw.json
"models": {
    "kimi-coding/k2p5": {
        "baseUrl": "https://api.moonshot.cn/v1"
    }
}
```
→ Gateway crash（exit code=1），配置格式不被支持。

**最终方案**: 切换到 `minimax-cn/MiniMax-M2.7` provider（`api.minimaxi.com`），用户有该平台的 API key。

```bash
npx openclaw models set minimax-cn/MiniMax-M2.7
npx openclaw models auth paste-token --provider minimax-cn
```

### 3.10 CommandExecutor：Agent 不调工具就降级

**现象**: `executeCommand('echo hello')` 走了 OpenClaw 但返回 `source: 'child_process'`。日志显示 `OpenClaw returned NO_TOOL_EXECUTION, falling back to child_process`。

**根因**: Agent 对简单命令（`echo hello`）只返回文本回答，没有调用 shell 工具。之前的逻辑把"没有 tool_result"视为失败，强制降级。

**修复**: 有 tool_result 用 tool_result，没有就用 text response，两种都算 OpenClaw 成功。只有完全没输出时才降级。

---

## 四、已验证的端到端链路

| 测试 | 结果 | 耗时 |
|------|------|------|
| `sendOpenClawMessage('what is 2+2')` | `"2+2 = **4**"` | ~6s |
| `sendOpenClawMessage('hi')` | `"Hi! 👋"` | 几秒~十几秒 |
| `sendOpenClawMessage('run the command: echo hello from openclaw')` | `{ success: true, response: 'hello from openclaw' }` | ~10s |
| `executeCommand('echo hello from openclaw')` | `{ status: 'success', source: 'openclaw', executionTimeMs: 30007 }` | 30s（修复前） |
| `executeCommand('echo hi')` | `{ status: 'success', source: 'openclaw', executionTimeMs: 10750 }` | ~10s（修复后） |
| Gateway 进程退出后降级 | `{ source: 'child_process', executionTimeMs: 22 }` | <100ms |

---

## 五、当前架构决策总结

### 5.1 认证方案

| 决策 | 选择 | 原因 |
|------|------|------|
| Gateway 认证模式 | `--auth none` | Desktop 和 Gateway 同机 + `--bind loopback`，外部不可达 |
| Device identity | 保留发送 | Gateway 要求，用于设备管理/配对。签名用空 token |
| `auth` 字段 | 不发送 | `--auth none` 模式下不需要 |

### 5.2 进程管理

| 决策 | 选择 | 原因 |
|------|------|------|
| 进程关闭 | `process.on('exit')` + `execSync(taskkill)` | Windows 上 async 不可靠，必须同步杀 |
| 连接重试 | 5 次，间隔 2s/4s/6s/8s | Gateway 首次启动初始化慢 |
| health check 超时 | 30s | Gateway 可能需要较长时间启动 |
| WS 连接超时 | 10s | 每次重试单独计时 |
| 进程复用 | 检测已运行进程直接返回配置 | 防止多次 connectToGateway 调用导致重复 spawn |
| 崩溃重启 | 最多 3 次 | 防止无限重启 |

### 5.3 WS 协议

| 决策 | 选择 | 原因 |
|------|------|------|
| 方法 | `chat.send`（不是 `agent`） | Gateway 注册的正式方法 |
| 完成信号 | lifecycle event `phase=end` | 不是 response 消息 |
| 文本输出 | `stream=assistant, data.text` | delta 编码，需客户端 slice |
| 工具调用 | `stream=tool, data.phase=start/end` | end 时有 `data.output` |

### 5.4 LLM Provider

| 决策 | 选择 | 原因 |
|------|------|------|
| 当前模型 | `minimax-cn/MiniMax-M2.7` | Kimi moonshot key 与 OpenClaw 内置 `kimi-coding` provider 不兼容 |
| 配置方式 | `npx openclaw models set` + `models auth paste-token` | 写入 `~/.openclaw/` |

---

## 六、启动步骤（接手人必读）

### 6.1 前置条件

```bash
# 1. 安装依赖
pnpm install

# 2. 启动基础服务
pnpm docker:up    # PG, Redis, MinIO（不需要 OpenClaw Docker）

# 3. 确认 OpenClaw 模型已配置
npx openclaw models list
# 应显示: minimax-cn/MiniMax-M2.7  ... default,configured

# 4. 如果没配置，手动配置
npx openclaw models set minimax-cn/MiniMax-M2.7
npx openclaw models auth paste-token --provider minimax-cn
# 粘贴 API key 回车
```

### 6.2 启动

```bash
pnpm dev:server    # NestJS
pnpm dev:desktop   # Electron + 自动 spawn OpenClaw Gateway
```

### 6.3 预期日志（正常启动）

```
[OpenClaw] Connecting with mode: local
[OpenClaw:Process] Mode resolved: local
[OpenClaw:Process] Spawning: node ...openclaw.mjs gateway run --allow-unconfigured --port 18789 --bind loopback
[OpenClaw:Process] Spawned PID=xxxxx
[OpenClaw:Process] Ready at ws://127.0.0.1:18789
[OpenClaw] Connecting to Gateway at ws://127.0.0.1:18789 (local mode)
[OpenClaw] Connecting to Gateway at ws://127.0.0.1:18789 (auth: none)
[OpenClaw:WS] Connected, waiting for challenge...
# 第一次可能失败：
[OpenClaw] Connect attempt 1/5 failed (...), retrying in 2000ms...
# 第二次成功：
[OpenClaw:WS] Handshake OK (proto=3, scopes=operator.read,operator.write)
[OpenClaw] Connected to Gateway successfully (v2026.4.2)
[Main] OpenClaw Gateway connected (mode=local)
```

### 6.4 手动测试（DevTools Console）

```js
// 测试 Agent 对话
await window.electronAPI.sendOpenClawMessage('what is 2+2')
// 预期: { success: true, response: '2+2 = **4**' }

// 测试命令执行（走 OpenClaw）
await window.electronAPI.executeCommand('echo hello')
// 预期: { status: 'success', source: 'openclaw', executionTimeMs: ~10s }
```

### 6.5 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| "Port 18789 already in use" | 上次 Gateway 没被杀掉 | `netstat -ano \| grep 18789` 找 PID → `taskkill /PID xxx /F` |
| "Connection timed out" 5 次都失败 | Gateway 启动失败 | 看 `%APPDATA%/linkingchat-desktop/logs/openclaw/` 日志 |
| "HTTP 401 authentication_error" | API key 过期或 provider 不对 | `npx openclaw models auth paste-token --provider minimax-cn` 重新配 |
| Desktop 关闭后 Gateway 残留 | killSync 没执行到 | 手动 taskkill，确认 `process.on('exit')` 代码在 index.ts 里 |

---

## 七、下一步：Bot 聊天窗口集成 OpenClaw

### 7.1 目标

Desktop 的 Supervisor Bot / Coding Bot 聊天窗口发消息时，消息路由到本地 OpenClaw Agent 执行，流式显示回复（打字机效果）。

### 7.2 需要做的

1. **Bot 消息路由** — 当用户在 Bot 聊天窗口发消息时，不走 Server 的 LLM Router，而是直接发给本地 OpenClaw Gateway
2. **流式显示** — `chat.send` 的流式事件（`stream=assistant`）实时渲染到聊天气泡里
3. **工具调用展示** — Agent 调用工具时显示进度/结果（`stream=tool`）
4. **错误处理** — API key 过期、Gateway 断连等异常情况的 UI 反馈
5. **会话管理** — `sessionKey` 管理，每个 Bot 聊天用不同的 session

### 7.3 可选：独立命令面板

类似 VS Code 终端的专门 OpenClaw 面板，直接输入命令。优先级低于 Bot 聊天集成。

---

## 八、与 bundling 架构文档的差异

`openclaw-desktop-bundling-architecture.md` 是早期架构设计，以下内容已被本次实战修正：

| bundling 文档描述 | 实际情况 | 说明 |
|-------------------|----------|------|
| Token: 每次启动生成随机 token | `--auth none`，不用 token | 本地回环不需要认证 |
| `openclaw-node` 客户端 | 自定义 WS 客户端 | `openclaw-node` 有签名兼容问题 |
| Docker 模式为默认开发模式 | Local 模式为默认 | 不再依赖 Docker 容器 |
| 健康检查 HTTP `/health` | TCP 端口探测 | 更轻量，不依赖 HTTP 服务就绪 |
| Windows 退出: IPC channel / HTTP shutdown | `process.on('exit')` + `execSync(taskkill)` | 最可靠的方式 |

bundling 文档的 Phase 2-4（构建打包、CI/CD、签名）仍然有效，待接近发布时实施。

---

## 九、给接手人的注意事项

1. **每次关闭 Desktop 后检查端口** — 如果 `netstat -ano | grep 18789` 有残留进程，手动 kill。`killSync` 已实现但不是 100% 可靠（比如 Desktop crash）
2. **不要改 `--auth none`** — 除非有明确的安全需求。本地回环 + bind loopback 已经足够安全
3. **LLM API 调用有成本** — 每次 `sendOpenClawMessage` / `executeCommand` 都会调 LLM API，调试时注意
4. **OpenClaw 源码是压缩的** — `node_modules/openclaw/dist/gateway-cli-CWpalJNJ.js` 有 2.6 万行，但可以 grep 关键字定位。关键函数：`evaluateMissingDeviceIdentity`、`resolveConnectAuthState`、`resolveSignatureToken`、`buildDeviceAuthPayload`
5. **Device identity 持久化** — 存在 `%APPDATA%/linkingchat-desktop/.openclaw/device-identity.json`，不要删除，否则每次启动都要走首次配对流程
6. **OpenClaw 版本** — 当前使用 `openclaw@2026.4.2`，通过 `pnpm add -w openclaw` 安装在项目根目录。Desktop 通过 `require.resolve('openclaw')` 动态定位 `openclaw.mjs` 入口
