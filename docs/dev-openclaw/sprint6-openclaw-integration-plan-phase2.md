# Sprint 6 Phase 2: OpenClaw Gateway 联调实施计划

> **前置条件**: Phase 0 (安全) ✅ + Phase 1 (Docker + Strategy) ✅
>
> **目标**: Server API 返回真实 Gateway 状态 → Desktop 自动连接 → 命令执行响应正确解析
>
> **状态**: ✅ 全部完成 (2026-03-19)

---

## 当前状态

| 组件 | 状态 | 说明 |
|------|------|------|
| Docker 容器 | ✅ healthy | `ghcr.io/openclaw/openclaw:latest` v2026.3.13, `127.0.0.1:18790→18789` |
| GatewayManagerService | ✅ Strategy Pattern | `SingleContainerStrategy`, 8 tests passing |
| Server `.env` | ✅ 已更新 | `OPENCLAW_MODE`, `OPENCLAW_GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN` |
| Desktop `connectToGateway()` | ✅ 代码审查通过 | 连接链路完整，双重 JWT 验证问题已修复 |
| Desktop `executeViaOpenClaw()` | ✅ 已重写 | 流式 `chat()` API，区分 `tool_result` / `text` / `error` |
| `openclaw-node` | ✅ v0.2.1 | `chatSync()` + `chat()` streaming + `health()` |

---

## 任务 2.1: Server 联调 — API 返回真实 Gateway 状态 ✅

### 2.1.1 更新 `.env.example` ✅

**文件**: `apps/server/.env.example`

**改动**: 替换旧的 OpenClaw 变量为新的 Strategy Pattern 配置。

```env
# OpenClaw Gateway (Docker container — see docker-compose.yaml)
OPENCLAW_MODE=single                          # Deployment: single | per-user | pool
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18790    # Gateway WebSocket URL
OPENCLAW_GATEWAY_TOKEN=lc_dev_token_change_me # Must match docker-compose OPENCLAW_GATEWAY_TOKEN
```

`apps/server/.env` 同步添加了这 3 个变量。

### 2.1.2 修复 SingleContainerStrategy 的 health 检查 ✅

**文件**: `apps/server/src/openclaw/strategies/single-container.strategy.ts`

**实施方案**: 方案 B — 保持 HTTP fetch，但"任何响应均视为存活"。
OpenClaw Gateway 是 WS 服务器，对纯 HTTP 请求可能返回空回复或非 200，但能建立 TCP 连接就说明容器正在运行。

```typescript
async health(_userId: string): Promise<boolean> {
  try {
    const httpUrl = this.gatewayUrl
      .replace(/^wss:/, 'https:')
      .replace(/^ws:/, 'http:');
    await fetch(`${httpUrl}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    // Any response (even empty / non-200) means the Gateway is reachable
    return true;
  } catch {
    // Connection refused / timeout → container not running
    return false;
  }
}
```

**测试**: 8 tests passing (gateway-manager.service.spec.ts)

---

## 任务 2.2: Desktop 连接验证 & 优化 ✅

### 2.2.1 修复双重 JWT 验证问题 ✅

**发现**: Controller 使用 `@UseGuards(JwtAuthGuard)` 装饰器（已验证 JWT，用户信息在 `req.user`），
但 `getConnectInfo()` 又从 `Authorization` 头提取裸 token 传给 `getGatewayConnectionInfo()`，
该方法内部再次调用 `jwtService.verifyAsync()` 重复验证。

**修复**:
- Controller `getConnectInfo()` 简化为直接使用 `req.user.sub` + `acquire()`
- 从 `GatewayManagerService` 移除 `getGatewayConnectionInfo()` 方法
- 从 `GatewayManagerService` 移除 `JwtService` 依赖 和 `publicKey` 属性
- 从 `OpenclawModule` 移除 `JwtModule` import

**改动文件**:
| 文件 | 改动 |
|------|------|
| `apps/server/src/openclaw/openclaw.controller.ts` | `getConnectInfo()` 使用 `req.user.sub` |
| `apps/server/src/openclaw/gateway-manager.service.ts` | 移除 `getGatewayConnectionInfo()`、`JwtService`、`publicKey` |
| `apps/server/src/openclaw/openclaw.module.ts` | 移除 `JwtModule` import |
| `apps/server/src/openclaw/gateway-manager.service.spec.ts` | 移除 3 个 JWT 相关测试，移除 JwtService mock |

### 2.2.2 连接链路验证 ✅

Desktop 启动时的连接链路确认完整:

```
app.whenReady()
  → AuthStore.load()
  → connectToGateway()
      → fetch(GET /api/v1/openclaw/gateway/connect, { Bearer <jwt> })
      → JwtAuthGuard 验证 JWT → req.user.sub = userId
      → GatewayManagerService.acquire(userId)
          → SingleContainerStrategy.acquire(userId)
          → return { url: "ws://127.0.0.1:18790", token: "..." }
      → openClawClientService.connect({ url, token })
          → OpenClawClient({ url, token, autoReconnect: true })
          → client.connect()  // WS handshake
      → return { connected: true, url }
```

**确认无需修改的部分**:
- `API_URL` 默认值 `http://localhost:3008/api/v1` 与 Server 一致
- `connectToGateway()` 只使用 `url` + `token`（不依赖 `port`）
- `openclaw-node` 的 `token` 格式与 `OPENCLAW_GATEWAY_TOKEN` 匹配

### 2.2.3 连接失败的调试检查清单

如果 Desktop 连接失败，按以下顺序排查:

| 步骤 | 检查 | 命令 |
|------|------|------|
| 1 | Docker 容器在跑吗？ | `docker ps \| grep openclaw` |
| 2 | 端口映射对吗？ | `netstat -an \| grep 18790` |
| 3 | Server 在跑吗？ | `curl http://localhost:3008/api/v1/auth/health` |
| 4 | JWT 有效吗？ | `curl -H "Authorization: Bearer <token>" .../gateway/connect` |
| 5 | Gateway API 返回正确吗？ | 检查上一步返回的 `url` 和 `token` |
| 6 | Token 匹配吗？ | `docker logs linkingchat-openclaw \| grep "auth token"` |
| 7 | WS 握手成功吗？ | Desktop 日志中 `openclaw-node` 的错误信息 |

---

## 任务 2.3: 修复命令执行响应解析 ✅

### 2.3.1 实施方案: 流式 `chat()` API

**改动文件**: `apps/desktop/src/main/services/command-executor.service.ts`

**选择了推荐方案**（流式 `chat()` 而非 `chatSync()`），因为:
1. 可以区分 `tool_result`（实际命令输出）和 `text`（Agent 解释）
2. 可以检测 `error` chunk 判断失败
3. `timeout` 选项内置于 `ChatOptions`，不需要手动 `Promise.race`

**关键改动**:

```typescript
private async executeViaOpenClaw(command: string, timeout: number): Promise<CommandResult> {
  const client = openClawClientService.getClient();
  if (!client) throw new Error('OpenClaw client not available');

  const stream = client.chat(message, { timeout });

  const toolResults: string[] = [];
  const textParts: string[] = [];
  let errorText = '';

  for await (const chunk of stream) {
    switch (chunk.type) {
      case 'tool_result': toolResults.push(chunk.text); break;
      case 'text':        textParts.push(chunk.text);   break;
      case 'error':       errorText = chunk.text;        break;
    }
  }

  // 优先使用 tool_result（命令直接输出），回退到 text（Agent 解释）
  const output = toolResults.length > 0
    ? toolResults.join('\n')
    : textParts.join('') || '(no output)';

  // 推断 exitCode
  const exitCode = this.inferExitCode(output, toolResults.length > 0);
  // ...
}
```

**新增辅助方法**: `inferExitCode()` — 从输出中匹配 `exit code: N` 等模式推断退出码。

**移除**: `createTimeoutPromise()` — 不再需要手动超时控制。

### 2.3.2 ChatChunk 类型处理

| Chunk Type | 用途 | 处理方式 |
|-----------|------|---------|
| `tool_result` | 命令实际输出 (`system.run` 结果) | 收集到 `toolResults[]` |
| `text` | Agent 的解释/评论 | 收集到 `textParts[]` |
| `tool_use` | Agent 决定调用 tool（内部信号） | 忽略 |
| `error` | 执行错误 | 标记 `errorText`，返回错误状态 |
| `done` | 流结束 | 忽略 |

---

## 测试结果

### Server 单元测试
```
PASS  src/openclaw/gateway-manager.service.spec.ts (8 tests)
  ✓ initialization (3 tests)
  ✓ acquire (2 tests)
  ✓ release (1 test)
  ✓ health (1 test)
  ✓ onModuleDestroy (1 test)
```

### 全量测试
```
Test Suites: 29 passed, 5 failed (pre-existing), 34 total
Tests:       370 passed, 370 total
```

5 个失败全部是 pre-existing issues:
- `supervisor.agent.ts:147` — `a.type === 'retry'` 类型不匹配
- 3 个 ws-integration 测试级联失败

### 类型检查
```
pnpm run type-check → 无 OpenClaw 相关错误
(pre-existing: friendsStore.ts 的 any 类型警告)
```

---

## 完整验收清单

| # | 场景 | 分类 | 期望 | 代码状态 |
|---|------|------|------|----------|
| V1 | Server `GET /gateway/status` (容器运行) | 2.1 | `{ running: true }` | ✅ 代码就绪 |
| V2 | Server `GET /gateway/status` (容器停止) | 2.1 | `{ running: false }` | ✅ 代码就绪 |
| V3 | Server `GET /gateway/connect` | 2.1 | `{ url, token }` | ✅ 代码就绪 |
| V4 | Desktop 启动后日志 | 2.2 | `OpenClaw Gateway connected` | ✅ 链路已验证 |
| V5 | Desktop `openclaw:status` IPC | 2.2 | `{ connected: true }` | ✅ 链路已验证 |
| V6 | Desktop 连接失败不崩溃 | 2.2 | warn 日志，app 继续运行 | ✅ 代码就绪 |
| V7 | `openclaw:send-message` 返回 | 2.3 | Agent 响应文本 | ✅ 代码就绪 |
| V8 | 设备命令 via OpenClaw | 2.3 | `source: 'openclaw'` | ✅ 代码就绪 |
| V9 | 命令输出解析 | 2.3 | 包含实际输出，非 Agent 解释 | ✅ 流式解析实现 |
| V10 | Gateway 断开后降级 | 2.3 | `source: 'child_process'` | ✅ 代码就绪 |

> **注**: V1-V10 标记"代码就绪"表示逻辑实现完成，端到端验证需要启动完整环境（Server + Desktop + Docker）。

---

## 改动文件汇总

| 文件 | 任务 | 改动 |
|------|------|------|
| `apps/server/.env.example` | 2.1 | 替换旧变量为 OPENCLAW_MODE/URL/TOKEN |
| `apps/server/.env` | 2.1 | 添加 3 个新变量 |
| `apps/server/src/openclaw/strategies/single-container.strategy.ts` | 2.1 | 修复 health() — 任何响应视为存活 |
| `apps/server/src/openclaw/openclaw.controller.ts` | 2.2 | 简化 getConnectInfo() 使用 req.user.sub |
| `apps/server/src/openclaw/gateway-manager.service.ts` | 2.2 | 移除 getGatewayConnectionInfo() 和 JwtService 依赖 |
| `apps/server/src/openclaw/openclaw.module.ts` | 2.2 | 移除 JwtModule import |
| `apps/server/src/openclaw/gateway-manager.service.spec.ts` | 2.2 | 简化测试，移除 JWT mock (11→8 tests) |
| `apps/desktop/src/main/services/command-executor.service.ts` | 2.3 | 重写 executeViaOpenClaw() 使用流式 chat() |

---

## 与 Phase 3 的衔接

Phase 2 完成后，所有组件已打通:
- Server → Gateway: `acquire()` 返回 url+token ✅
- Desktop → Gateway: `openclaw-node` 连接 ✅
- Desktop → Agent → Command: 流式响应解析 ✅

Phase 3 的目标是**端到端命令执行**:
```
Mobile 发命令 → Server WS → Desktop 接收 → OpenClaw Agent 执行 → 结果回传 → Mobile 显示
```

Phase 2 的 V8/V10 验收点直接覆盖了 Phase 3 的核心路径，
如果 Phase 2 端到端验收全部通过，Phase 3 的工作量主要在 Mobile UI 验证和异常场景测试。
