# Sprint 1：最小全链路 PoC

> **目标**：手机发一条文字指令 → 云端转发 → 桌面端执行 Shell 命令 → 结果 <3秒 返回手机显示
>
> **前置条件**：[Sprint 0](./sprint0_implement.md) 已完成
>
> **不包含**：好友系统、群聊、AI 功能、文件传输、消息搜索、推送通知、Bot 框架、OpenClaw 深度集成
>
> **参考**：[sprint-1-plan.md](../dev-plan/sprint-1-plan.md) | [websocket-protocol.md](../dev-plan/websocket-protocol.md)

---

## 交付物

| 交付物 | 说明 |
|--------|------|
| Cloud Brain | NestJS 服务端：JWT RS256 认证 + WebSocket /device 命名空间 + REST API |
| Desktop PoC | Electron App：登录 → 连接 → 接收命令 → Shell 执行 → 回报结果 |
| Mobile PoC | Flutter App：登录 → 设备列表 → 发送命令 → 查看结果 |
| Shared Types | `@linkingchat/shared` + `@linkingchat/ws-protocol` 类型包 |

## 验收标准

```gherkin
GIVEN 用户在手机端和桌面端都已登录同一账号
  AND 桌面端显示 "已连接" 状态
WHEN 用户在手机端输入 Shell 命令 (e.g. "ls -la")
  AND 选择目标桌面设备
  AND 点击 "执行"
THEN 桌面端接收到命令
  AND 执行 Shell 命令
  AND 执行结果在 3 秒内返回手机端显示
  AND commands 表中记录该次执行
```

---

## Phase 分解与并行策略

```
Phase 0 (共享类型)  ──────────────────────────────────┐
                                                       │
Phase 1 (Server: Auth + Device + WS Gateway)  ────────┤
                                                       │
Phase 2 (Desktop: Electron + WS + Shell 执行) ────────┤  ← Phase 1-3 可部分并行
                                                       │    (后端 Auth 完成后前端即可开始)
Phase 3 (Mobile: Flutter + 登录 + 命令发送)   ────────┤
                                                       │
Phase 4 (集成测试 + Bug 修复)  ────────────────────────┘
```

### 人员分配建议（2-3 人）

| 开发者 | 负责 | Phase 文档 |
|--------|------|-----------|
| A（后端） | Phase 0 → Phase 1 | [sprint1_phase0.md](./sprint1_phase0.md) → [sprint1_phase1.md](./sprint1_phase1.md) |
| B（桌面端） | Phase 2 | [sprint1_phase2.md](./sprint1_phase2.md) |
| C（移动端） | Phase 3 | [sprint1_phase3.md](./sprint1_phase3.md) |
| 全员 | Phase 4 | [sprint1_phase4.md](./sprint1_phase4.md) |

> B 和 C 在等后端 Auth API 期间，可以先搭 UI 骨架和本地 mock。

---

## 任务依赖图

```
Phase 0 (共享类型)
  └── 定义 WS 事件类型 + Payload + Zod schemas

Phase 1 (Server)                     Phase 2 (Desktop)         Phase 3 (Mobile)
  Auth 模块 ─────────────────────────> 登录界面                  > 登录页面
       │                               │                         │
  Devices 模块                        WS 客户端连接              WS 客户端连接
       │                               │                         │
  WS Gateway (/device)               设备注册                   设备列表
       │                               │                         │
  Commands Service                   命令接收 + exec()          命令输入 + 发送
       │                               │                         │
  E2E 测试                           结果回报                   结果显示

                        Phase 4 (集成测试)
                          全链路手动测试
                          Bug 修复
                          黑名单命令过滤
```

---

## 里程碑检查点

| 检查点 | 验收内容 | 对应 Phase |
|--------|---------|-----------|
| **M1** | Server 可运行：注册 → 登录 → 获取 JWT → Swagger 可访问 | Phase 1 前半 |
| **M2** | WS 可连接：客户端用 JWT 连接 /device 命名空间 | Phase 1 后半 |
| **M3** | 桌面端可执行：接收命令 → 执行 → 返回结果 | Phase 2 |
| **M4** | 手机端可操控：发命令 → 看到结果 | Phase 3 |
| **M5** | 全链路通：手机 → 云 → 桌面 → 手机 < 3 秒 | Phase 4 |

---

## REST API 端点 (Sprint 1)

### Auth

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/v1/auth/register` | 注册（argon2 hash） |
| POST | `/api/v1/auth/login` | 登录 → JWT RS256 token pair |
| POST | `/api/v1/auth/refresh` | 刷新 access token |
| POST | `/api/v1/auth/logout` | 登出（删除 refresh token） |

### Devices

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/v1/devices` | 当前用户设备列表 |
| GET | `/api/v1/devices/:id` | 单个设备详情 |
| PATCH | `/api/v1/devices/:id` | 更新设备名称 |
| DELETE | `/api/v1/devices/:id` | 删除设备 |

### Commands

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/v1/commands` | 命令历史（游标分页） |
| GET | `/api/v1/commands/:id` | 单条命令详情 |

---

## WebSocket 事件 (Sprint 1，仅 /device 命名空间)

### Client → Server

| 事件名 | 发送方 | Payload | ACK |
|--------|--------|---------|-----|
| `device:register` | Desktop | `{ deviceId, name, platform }` | `WsResponse` |
| `device:heartbeat` | Desktop | `{ deviceId }` | - |
| `device:command:send` | Mobile | `{ targetDeviceId, type, action, timeout? }` | `{ commandId, status }` |
| `device:result:complete` | Desktop | `{ commandId, status, data?, error? }` | - |

### Server → Client

| 事件名 | 目标 | Payload |
|--------|------|---------|
| `device:command:execute` | `d-{deviceId}` | `DeviceCommandPayload` |
| `device:command:ack` | `u-{userId}` | `{ commandId, status }` |
| `device:result:delivered` | `u-{userId}` | `DeviceResultPayload` |
| `device:status:changed` | `u-{userId}` | `DeviceStatusPayload` |

---

## Sprint 1 不做的事

| 功能 | 原因 | 何时做 |
|------|------|--------|
| 好友系统 | 手机直接控制自己的电脑，不需要好友 | Sprint 2 |
| 聊天消息 | Sprint 1 只做设备控制 | Sprint 2 |
| 群聊 / 频道 | 同上 | Sprint 3 |
| AI (Draft / Whisper / Predictive) | Sprint 1 直接转发命令，不经过 LLM | Sprint 3 |
| Bot 框架 | 设备控制直接走 /device 命名空间 | Sprint 2 |
| 文件传输 | Sprint 1 只传文本命令和文本结果 | Sprint 4 |
| 推送通知 | Sprint 1 依赖 WebSocket 实时连接 | Sprint 4 |
| OpenClaw 集成 | Sprint 1 用 child_process.exec | Sprint 2 |
| 生产部署 | Sprint 1 全部跑 localhost | Sprint 4 |

**完成后进入 → [Sprint 2](./sprint2_implement.md)**
