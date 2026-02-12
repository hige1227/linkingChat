# Sprint 1 实施计划 — 最小全链路 PoC

> **目标**: 手机发一条文字指令 → 云端转发 → 桌面端执行 Shell 命令 → 结果返回手机显示
>
> **不包含**: 好友系统、群聊、AI 功能、文件传输、消息搜索、推送通知
>
> 权威来源：[reference-architecture-guide.md](./reference-architecture-guide.md)
>
> 旧版已归档至 `_archive/sprint-1-plan.md`

---

## 一、Sprint 1 交付物

| 交付物 | 说明 |
|--------|------|
| **Cloud Brain** | NestJS + Prisma 服务端，JWT RS256 认证 + WebSocket /device 命名空间 |
| **Mobile PoC** | Flutter (或 RN Expo) 最小 App：登录 → 设备列表 → 发送命令 → 查看结果 |
| **Desktop PoC** | Electron 最小 App：登录 → 连接 Cloud → 接收命令 → Shell 执行 → 回报结果 |
| **Shared Types** | `@linkingchat/shared` + `@linkingchat/ws-protocol` 类型包 |

### 验收标准

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

## 二、任务分解

### Phase 0: 基础设施搭建

| # | 任务 | 产出 | 依赖 |
|---|------|------|------|
| 0.1 | 初始化 Turborepo + pnpm workspace | 仓库结构、turbo.json、pnpm-workspace.yaml | - |
| 0.2 | 创建 NestJS 项目到 apps/server | 可运行的空 NestJS 服务端 | 0.1 |
| 0.3 | 配置 Docker Compose (PostgreSQL + Redis) | docker/docker-compose.yaml | 0.1 |
| 0.4 | 配置 Prisma + 基础 schema | prisma/schema.prisma (User + Device + Command) | 0.2, 0.3 |
| 0.5 | 初始化 packages/shared + packages/ws-protocol | 两个可构建的 TS 类型包 | 0.1 |
| 0.6 | 验证服务可运行：Prisma migrate + seed | 数据库建表成功 | 0.4, 0.3 |

### Phase 1: 共享类型定义

| # | 任务 | 产出 | 依赖 |
|---|------|------|------|
| 1.1 | 定义设备控制 WS 事件类型 (ws-protocol/) | DeviceCommandPayload, DeviceResultPayload, DeviceStatusPayload | 0.5 |
| 1.2 | 定义 WS 基础类型 (ws-protocol/) | WsEnvelope, WsResponse, WsError, SocketData | 0.5 |
| 1.3 | 定义事件名称常量 (ws-protocol/) | DEVICE_EVENTS enum | 0.5 |
| 1.4 | 定义 Zod schemas (shared/) | 用户、设备 Zod 验证 schema | 0.5 |

### Phase 2: Server — 认证 + 设备管理 + WebSocket Gateway

| # | 任务 | 产出 | 依赖 |
|---|------|------|------|
| 2.1 | 实现 Auth 模块 (JWT RS256) | POST /auth/register, /auth/login, /auth/refresh | 0.4 |
| 2.2 | 实现 Prisma Service (@Global) | PrismaModule + PrismaService | 0.4 |
| 2.3 | 实现 Devices 模块 | REST: GET/PATCH/DELETE /api/v1/devices | 2.2 |
| 2.4 | 实现 Commands Service | 命令记录 CRUD | 2.2 |
| 2.5 | 安装 Socket.IO 依赖 | @nestjs/websockets, @nestjs/platform-socket.io, ioredis, @socket.io/redis-adapter | 0.6 |
| 2.6 | 创建 Redis IO Adapter | gateway/adapters/redis-io.adapter.ts | 2.5 |
| 2.7 | 创建 WS Auth Middleware (RS256) | gateway/middleware/ws-auth.middleware.ts | 2.1, 2.5 |
| 2.8 | 创建 Device Gateway (/device ns) | device:register, device:command:send, device:result:complete | 2.3, 2.6, 2.7, 1.x |
| 2.9 | 创建 BroadcastService (@Global) | 供其他模块推送 WS 事件 | 2.8 |
| 2.10 | E2E 测试：WebSocket 命令流程 | 自动化测试 | 2.8 |

### Phase 3: Desktop — Electron 最小骨架

| # | 任务 | 产出 | 依赖 |
|---|------|------|------|
| 3.1 | 初始化 Electron 项目 (electron-vite) | apps/desktop 可启动 | 0.1 |
| 3.2 | 登录界面 + JWT 存储 | 调用 /auth/login API | 2.1 |
| 3.3 | WebSocket 客户端 (/device) | 连接 Cloud Brain，JWT RS256 认证 | 3.2, 1.x |
| 3.4 | 设备注册逻辑 | 启动时 emit device:register | 3.3 |
| 3.5 | 命令接收 + Shell 执行 | 监听 device:command:execute，child_process.exec() | 3.3 |
| 3.6 | 结果回报 | emit device:result:complete | 3.5 |
| 3.7 | OpenClaw Node 集成 (可选) | spawn openclaw node run | 3.5 |
| 3.8 | 最小 UI：连接状态 + 命令日志 | Electron 主窗口 | 3.1 |

> 3.5: Sprint 1 先用 `child_process.exec()` 直接执行。OpenClaw (3.7) 推迟到 Sprint 2。

### Phase 4: Mobile — 最小骨架

| # | 任务 | 产出 | 依赖 |
|---|------|------|------|
| 4.1 | 初始化移动端项目 | apps/mobile 可运行 | 0.1 |
| 4.2 | 登录页面 | HTTP 客户端，调用 /auth/login | 2.1 |
| 4.3 | JWT Token 管理 | 安全存储 + 自动刷新 | 4.2 |
| 4.4 | WebSocket 客户端 (/device) | Socket.IO 连接 Cloud Brain | 4.3, 1.x |
| 4.5 | 设备列表页面 | GET /api/v1/devices 显示在线设备 | 4.4 |
| 4.6 | 命令输入页面 | 文本输入框 + 设备选择器 + 执行按钮 | 4.5 |
| 4.7 | 命令结果显示 | 监听 device:result:delivered | 4.6 |

### Phase 5: 集成测试

| # | 任务 | 产出 | 依赖 |
|---|------|------|------|
| 5.1 | 全链路手动测试 | 手机 → 云 → 桌面 → 手机 完整流程 | 2.x, 3.x, 4.x |
| 5.2 | Bug 修复 | 稳定可演示的 PoC | 5.1 |
| 5.3 | 黑名单命令过滤 | 服务端拦截危险命令 | 2.8 |

---

## 三、任务依赖图

```
Phase 0 (基础设施)
  0.1 ─┬── 0.2 ─── 0.4 ─── 0.6
       ├── 0.3 ────────── 0.6
       └── 0.5

Phase 1 (类型)                  Phase 2 (Server)
  0.5 ── 1.1 ─┐                  0.4 ── 2.1 ── 2.7
               ├── 1.3            0.4 ── 2.2 ── 2.3 ── 2.4
  0.5 ── 1.2 ─┘                  0.6 ── 2.5 ── 2.6 ─┐
  0.5 ── 1.4                                         ├── 2.8 ── 2.9 ── 2.10
                                  2.1 ── 2.7 ────────┘
                                  2.3 ───────────────┘

Phase 3 (Desktop)               Phase 4 (Mobile)
  0.1 ── 3.1 ── 3.2              0.1 ── 4.1 ── 4.2 ── 4.3
                  │                                     │
                3.3 ─ 3.4                             4.4 ── 4.5 ── 4.6 ── 4.7
                  │
            3.5 ── 3.6
                │
              3.7 (optional)

Phase 5 (集成)
  2.x + 3.x + 4.x ── 5.1 ── 5.2 ── 5.3
```

---

## 四、技术实现要点

### 4.1 Prisma Schema (Sprint 1 子集)

```prisma
// Sprint 1 只需 3 个 model

model User {
  id          String   @id @default(cuid())
  email       String   @unique
  username    String   @unique
  password    String   // argon2 hash
  displayName String
  avatarUrl   String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  devices  Device[]
  tokens   RefreshToken[]

  @@map("users")
}

model Device {
  id         String       @id @default(cuid())
  name       String
  platform   String       // "darwin" | "win32" | "linux"
  status     DeviceStatus @default(OFFLINE)
  lastSeenAt DateTime?
  userId     String
  createdAt  DateTime     @default(now())

  user     User      @relation(fields: [userId], references: [id])
  commands Command[]

  @@index([userId])
  @@map("devices")
}

model Command {
  id          String        @id @default(cuid())
  type        String        // "shell" | "file" | "automation"
  payload     Json
  result      Json?
  status      CommandStatus @default(PENDING)
  deviceId    String
  issuerId    String
  createdAt   DateTime      @default(now())
  completedAt DateTime?

  device Device @relation(fields: [deviceId], references: [id])

  @@index([deviceId, createdAt])
  @@map("commands")
}

model RefreshToken {
  id        String   @id @default(cuid())
  token     String   @unique
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([userId])
  @@map("refresh_tokens")
}

enum DeviceStatus {
  ONLINE
  OFFLINE
}

enum CommandStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
}
```

### 4.2 Server: Device Gateway 核心代码

```typescript
// apps/server/src/gateway/device.gateway.ts

@WebSocketGateway({ namespace: '/device' })
export class DeviceGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {

  @WebSocketServer()
  namespace: Namespace;

  afterInit(server: Namespace) {
    server.use(createWsAuthMiddleware(this.jwtService));  // RS256 公钥验证
  }

  async handleConnection(client: TypedSocket) {
    const userId = client.data.userId;
    client.join(`u-${userId}`);
  }

  async handleDisconnect(client: TypedSocket) {
    // 设备下线 → UPDATE devices SET status = 'OFFLINE'
    // 广播 device:status:changed → u-{userId}
  }

  @SubscribeMessage('device:register')
  async handleRegister(client: TypedSocket, data: DeviceRegisterPayload) {
    // 1. Upsert device 到 DB (Prisma)
    // 2. client.join(`d-${data.deviceId}`)
    // 3. 广播 device:status:changed
  }

  @SubscribeMessage('device:command:send')
  async handleCommandSend(client: TypedSocket, data: WsEnvelope<DeviceCommandPayload>) {
    // 1. 黑名单检查 (isDangerousCommand)
    // 2. prisma.command.create(...)
    // 3. this.namespace.to(`d-${targetDeviceId}`).emit('device:command:execute', ...)
    // 4. ACK 给发送者
  }

  @SubscribeMessage('device:result:complete')
  async handleResult(client: TypedSocket, data: WsEnvelope<DeviceResultPayload>) {
    // 1. prisma.command.update({ status: 'COMPLETED', result: ... })
    // 2. this.namespace.to(`u-${issuerId}`).emit('device:result:delivered', ...)
  }
}
```

### 4.3 Desktop: 命令执行

```typescript
// apps/desktop/src/main/services/command-executor.service.ts

import { exec } from 'child_process';

export class CommandExecutor {
  async execute(command: string, timeout = 30000): Promise<CommandResult> {
    const startTime = Date.now();
    return new Promise((resolve) => {
      exec(command, { timeout }, (error, stdout, stderr) => {
        resolve({
          status: error ? 'error' : 'success',
          data: { output: stdout || stderr, exitCode: error?.code ?? 0 },
          error: error ? { code: 'EXEC_ERROR', message: error.message } : undefined,
          executionTimeMs: Date.now() - startTime,
        });
      });
    });
  }
}
```

### 4.4 黑名单命令过滤

```typescript
const DANGEROUS_COMMANDS = [
  /^rm\s+(-rf?|--recursive)\s+\//,
  /^rm\s+-rf?\s+~/,
  /^format\s/i,
  /^mkfs\./,
  /^dd\s+if=/,
  /^:\(\)\{.*\|.*&\s*\}\s*;/,
  /shutdown|reboot|halt|poweroff/i,
  /^chmod\s+(-R\s+)?777\s+\//,
  /^chown\s+(-R\s+)?.*\s+\//,
];

export function isDangerousCommand(action: string): boolean {
  return DANGEROUS_COMMANDS.some(p => p.test(action.trim()));
}
```

---

## 五、REST API 端点 (Sprint 1)

### Auth

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/v1/auth/register` | 注册 (argon2 hash) |
| POST | `/api/v1/auth/login` | 登录 → JWT RS256 token pair |
| POST | `/api/v1/auth/refresh` | 刷新 access token |
| POST | `/api/v1/auth/logout` | 登出 (删除 refresh token) |

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
| GET | `/api/v1/commands` | 命令历史 (游标分页) |
| GET | `/api/v1/commands/:id` | 单条命令详情 |

---

## 六、Prisma Migration (Sprint 1)

```bash
# 初始化
npx prisma migrate dev --name init

# 生成的文件
prisma/migrations/
  20260213_init/
    migration.sql              # CREATE TABLE users, devices, commands, refresh_tokens
```

---

## 七、里程碑检查点

| 检查点 | 验收内容 | 对应任务 |
|--------|---------|---------|
| M1: Server 可运行 | 注册 → 登录 → 获取 JWT → Swagger 可访问 | Phase 0 + 2.1 |
| M2: WS 可连接 | 客户端用 JWT 连接 /device 命名空间 | Phase 1 + 2.8 |
| M3: 桌面端可执行 | 桌面端接收命令 → 执行 → 返回结果 | Phase 3 |
| M4: 手机端可操控 | 手机端发命令 → 看到结果 | Phase 4 |
| M5: 全链路通 | 手机 → 云 → 桌面 → 手机 < 3 秒 | Phase 5 |

---

## 八、Sprint 1 不做的事

| 功能 | 原因 |
|------|------|
| 好友系统 | 手机直接连自己的电脑，不需要好友 |
| 聊天消息 | Sprint 1 只做设备控制，社交在 Sprint 2+ |
| 群聊 / 频道 | 同上 |
| AI (Draft / Whisper / Predictive) | Sprint 1 直接转发命令，不经过 LLM |
| 文件传输 | Sprint 1 只传文本命令和文本结果 |
| 推送通知 | Sprint 1 依赖 WebSocket 实时连接 |
| i18n | Sprint 1 硬编码，i18n 在 Sprint 2+ |
| OpenClaw 深度集成 | Sprint 1 用 child_process.exec，Sprint 2 对接 OpenClaw |
| 生产部署 | Sprint 1 全部跑 localhost |
