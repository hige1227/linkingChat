# Sprint 1 — Phase 4：集成测试 + Bug 修复

> **负责人**：全员
>
> **前置条件**：Phase 1（Server Auth + Device + WS Gateway）、Phase 2（Desktop Electron + WS + Shell 执行）、Phase 3（Mobile Flutter + 登录 + 命令发送）全部完成
>
> **产出**：全链路验证通过，所有里程碑检查点达标，Bug 清零

---

## 任务清单

| # | 任务 | 说明 | 依赖 |
|---|------|------|------|
| 4.1 | 全链路手动测试 | 端到端完整流程验证 | Phase 1-3 |
| 4.2 | 黑名单命令过滤测试 | 验证危险命令被拦截 | Phase 1 |
| 4.3 | 性能测试 | 端到端延迟测量，验证 <3 秒目标 | 4.1 |
| 4.4 | 异常场景测试 | 断连、超时、并发等边界条件 | 4.1 |
| 4.5 | Bug 修复 + 稳定化 | 修复所有测试中发现的问题 | 4.1-4.4 |

---

## 4.1 全链路手动测试

按以下步骤逐一执行，每步确认通过后打勾。这是 Sprint 1 最核心的验收流程。

### 测试前准备

- [ ] 确认 `.env` 配置正确（数据库连接、JWT 密钥路径、Redis 地址）
- [ ] 确认已执行 `pnpm build`，所有 shared packages 编译成功

### 步骤清单

| 步骤 | 操作 | 预期结果 | 通过 |
|------|------|----------|------|
| 1 | 启动 Docker 服务（PostgreSQL + Redis）：`docker compose up -d` | 容器正常运行，`docker compose ps` 显示 healthy | [ ] |
| 2 | 启动 NestJS Server：`pnpm --filter server dev` | 控制台输出 "Application is running on: http://localhost:3008"，Swagger 可访问 `/api/docs` | [ ] |
| 3 | 启动 Electron 桌面端：`pnpm --filter desktop dev` | 窗口启动，显示登录界面 | [ ] |
| 4 | 在桌面端注册/登录账号 | 登录成功，界面跳转到主界面，状态显示"已连接" | [ ] |
| 5 | 启动 Flutter 移动端：`flutter run` | App 启动，显示登录界面 | [ ] |
| 6 | 在移动端使用相同账号登录 | 登录成功，设备列表中可以看到已在线的桌面端设备 | [ ] |
| 7 | 在移动端输入命令 `ls -la`，选择桌面设备，点击"执行" | 桌面端接收并执行命令，执行结果在 **3 秒内**返回移动端显示 | [ ] |
| 7.1 | 检查 Server 控制台日志 | 可看到完整链路：`Command dispatched → device` 和 `Result delivered → user` | [ ] |
| 8 | 检查数据库 `commands` 表 | 存在刚才执行的命令记录，status 为 `COMPLETED`，包含 output 和 executionTimeMs | [ ] |
| 9 | 断开桌面端网络（拔网线或关闭 Wi-Fi），等待心跳超时 | Server 检测到桌面端离线，移动端设备列表状态更新为"离线" | [ ] |
| 10 | 恢复桌面端网络 | 桌面端自动重连，状态恢复为"已连接"，移动端设备列表同步更新 | [ ] |
| 11 | 桌面端离线状态下，从移动端发送命令 | 移动端收到错误提示："目标设备离线" | [ ] |

### 验证 SQL（辅助检查）

```sql
-- 检查命令记录
SELECT id, "userId", "targetDeviceId", action, status, "executionTimeMs", "createdAt"
FROM commands
ORDER BY "createdAt" DESC
LIMIT 10;
```

---

## 4.2 黑名单命令过滤测试

验证服务端 `isDangerousCommand()` 能拦截危险命令。这些命令应在 Server 端被拒绝，**绝不**转发到桌面端执行。

### 测试用例

| # | 输入命令 | 匹配规则 | 预期结果 | 通过 |
|---|---------|----------|----------|------|
| 1 | `rm -rf /` | `^rm\s+(-rf?\|--recursive)\s+\/` | Server 返回错误，code = `COMMAND_BLOCKED` | [ ] |
| 2 | `rm -rf ~/Documents` | `^rm\s+-rf?\s+~\/` | Server 返回错误，code = `COMMAND_BLOCKED` | [ ] |
| 3 | `format C:` | `^format\s` | Server 返回错误，code = `COMMAND_BLOCKED` | [ ] |
| 4 | `shutdown -h now` | `shutdown\|reboot\|halt\|poweroff` | Server 返回错误，code = `COMMAND_BLOCKED` | [ ] |
| 5 | `dd if=/dev/zero of=/dev/sda` | `^dd\s+if=` | Server 返回错误，code = `COMMAND_BLOCKED` | [ ] |
| 6 | `:(){ :\|:& };:` | Fork bomb 模式匹配 | Server 返回错误，code = `COMMAND_BLOCKED` | [ ] |
| 7 | `mkfs.ext4 /dev/sda1` | `^mkfs\.` | Server 返回错误，code = `COMMAND_BLOCKED` | [ ] |
| 8 | `chmod -R 777 /` | `^chmod\s+(-R\s+)?777\s+\/` | Server 返回错误，code = `COMMAND_BLOCKED` | [ ] |
| 9 | `reboot` | `shutdown\|reboot\|halt\|poweroff` | Server 返回错误，code = `COMMAND_BLOCKED` | [ ] |

### 安全命令（应正常放行）

| # | 输入命令 | 预期结果 | 通过 |
|---|---------|----------|------|
| 1 | `ls -la` | 正常转发并执行 | [ ] |
| 2 | `echo hello` | 正常转发并执行 | [ ] |
| 3 | `pwd` | 正常转发并执行 | [ ] |
| 4 | `cat ~/.bashrc` | 正常转发并执行 | [ ] |
| 5 | `node --version` | 正常转发并执行 | [ ] |

### 验证要点

- 危险命令被拦截时，移动端应收到明确的错误信息（包含 `COMMAND_BLOCKED` 错误码）
- 桌面端**不应**收到任何被拦截的命令（可在桌面端日志中确认）
- `commands` 表中被拦截的命令 status 应为 `blocked`

---

## 4.3 性能测试

测量端到端延迟（从移动端发出命令到收到结果），验证 Sprint 1 的 <3 秒性能目标。

### 测试环境

- Server、Desktop、Mobile 全部运行在本地局域网
- PostgreSQL 和 Redis 通过 Docker 运行
- 排除网络抖动干扰，每项测试执行 **5 次**取平均值

### 测试用例

| # | 命令 | 目标延迟 | 测量方式 | 通过 |
|---|------|---------|----------|------|
| 1 | `echo hello` | < 1 秒 | 移动端从发送到显示结果的时间差 | [ ] |
| 2 | `ls -la` | < 2 秒 | 同上 | [ ] |
| 3 | `ls -la /tmp` | < 2 秒 | 同上 | [ ] |
| 4 | `find / -name "*.log" -maxdepth 3` | < 3 秒（或超时机制生效） | 验证 timeout 参数是否工作 | [ ] |
| 5 | `sleep 5`（测试超时） | 应在 timeout 后返回超时错误 | 默认 30 秒超时，可设置自定义 timeout | [ ] |

### 延迟分解

如果端到端延迟超标，需要分段测量定位瓶颈：

```
移动端发送 → Server 接收     : T1（WS 传输）
Server 处理（安全检查 + 转发）: T2（应 < 50ms）
Server → 桌面端接收          : T3（WS 传输）
桌面端执行 Shell             : T4（命令本身耗时）
桌面端回报 → Server 接收     : T5（WS 传输）
Server 转发 → 移动端显示     : T6（WS 传输）

Total = T1 + T2 + T3 + T4 + T5 + T6
目标: Total - T4 < 1 秒（即排除命令执行时间，链路开销应 < 1 秒）
```

### 记录模板

| 测试命令 | 第1次 | 第2次 | 第3次 | 第4次 | 第5次 | 平均值 | 是否达标 |
|---------|-------|-------|-------|-------|-------|--------|---------|
| `echo hello` | | | | | | | |
| `ls -la` | | | | | | | |

---

## 4.4 异常场景测试

验证系统在各种异常条件下的健壮性，确保不会崩溃或产生脏数据。

### 测试用例

| # | 场景 | 操作步骤 | 预期结果 | 通过 |
|---|------|---------|----------|------|
| 1 | 桌面端命令执行中断连 | 发送 `sleep 10` → 桌面端立即断网 | 移动端在超时后收到 `COMMAND_TIMEOUT` 错误；`commands` 表 status 更新为 `timeout` | [ ] |
| 2 | 发命令给离线设备 | 桌面端关闭 → 移动端发送命令 | 移动端立即收到 `DEVICE_OFFLINE` 错误；命令不写入 `commands` 表（或 status = `rejected`） | [ ] |
| 3 | 无效 JWT 连接 | 使用过期或伪造的 JWT 连接 WS `/device` | Server 拒绝连接，返回认证错误；客户端收到 `connect_error` | [ ] |
| 4 | 快速重连 | 桌面端快速断开重连 5 次 | Server 设备列表中同一设备始终只有一条记录，无重复注册；在线状态正确 | [ ] |
| 5 | 并发命令 | 移动端同时发送 3 条命令到同一桌面端 | 3 条命令全部执行完成并返回结果；结果与命令一一对应（通过 commandId 匹配） | [ ] |
| 6 | 超长命令输出 | 执行 `seq 1 10000`（产生大量输出） | 结果正常返回或被截断（截断时有明确标识）；不导致 WS 连接断开 | [ ] |
| 7 | 空命令 | 移动端发送空字符串 `""` | Server 返回参数校验错误（Zod validation），命令不被转发 | [ ] |
| 8 | 特殊字符命令 | 发送包含引号、管道符的命令，如 `echo "hello world" \| wc -c` | 命令正常执行，特殊字符不被吞掉或转义错误 | [ ] |
| 9 | Server 重启 | 执行命令过程中重启 NestJS Server | 桌面端和移动端检测到断连 → 自动重连 → 状态恢复正常 | [ ] |

---

## 4.5 Bug 修复 + 稳定化

### Bug 登记表

在 4.1 - 4.4 测试过程中发现的所有问题，统一登记在此表中。

| Bug # | 发现场景 | 描述 | 严重程度 | 修复状态 | 修复人 |
|-------|---------|------|---------|---------|--------|
| B001 | | | P0/P1/P2 | 待修复/已修复 | |
| B002 | | | | | |
| B003 | | | | | |

### 严重程度定义

| 级别 | 定义 | 处理方式 |
|------|------|---------|
| **P0** | 阻塞全链路，核心功能不可用 | 立即修复，Sprint 1 不能完成前必须解决 |
| **P1** | 功能可用但存在明显缺陷 | Sprint 1 内修复 |
| **P2** | 体验问题或边界条件 | 记录，可延迟到 Sprint 2 |

### 稳定化工作

- [ ] 所有 P0 Bug 已修复并验证
- [ ] 所有 P1 Bug 已修复并验证
- [ ] 补充测试过程中发现的缺失错误处理（try-catch、WS error handler 等）
- [ ] 确认日志输出清晰，关键节点有 log（连接、断开、命令收发、执行结果）
- [ ] 确认没有明显内存泄漏（长时间运行桌面端 + 反复发命令不应导致内存持续增长）

---

## Sprint 1 最终验收清单

所有检查点全部通过后，Sprint 1 正式完成。

| 里程碑 | 验收内容 | 通过 |
|--------|---------|------|
| **M1** | `POST /api/v1/auth/register` 返回 201，用户写入数据库 | [ ] |
| **M2** | WS `/device` 命名空间可用 JWT 连接，桌面端注册成功 | [ ] |
| **M3** | 桌面端接收命令 → 执行 Shell → 结果回报 Server | [ ] |
| **M4** | 移动端发送命令 → 选择设备 → 查看执行结果 | [ ] |
| **M5** | 全链路（移动端 → Server → 桌面端 → Server → 移动端）< 3 秒 | [ ] |
| **安全** | 危险命令（rm -rf、format、shutdown 等）被 Server 拦截 | [ ] |
| **重连** | 桌面端断连后自动重连，状态正确恢复 | [ ] |
| **多设备** | 同一用户注册多台桌面设备，移动端可选择任意一台发送命令 | [ ] |

---

## Sprint 1 完成 → 进入 Sprint 2

Sprint 1 验证了最小全链路可行性：**手机发指令 → 云端转发 → 桌面执行 → 结果返回手机**。

Sprint 2 将在此基础上扩展社交能力：

- 好友系统（添加好友、好友列表）
- 聊天消息（1v1 私聊、消息存储与同步）
- Bot 框架初步集成
- OpenClaw 替换 `child_process.exec`
