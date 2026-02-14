# LinkingChat 项目骨架结构

> 基于 Turborepo + pnpm workspace，NestJS (Prisma) 后端 + Electron 桌面端 + Flutter/RN 移动端
>
> 权威来源：[reference-architecture-guide.md](./reference-architecture-guide.md) + [tech-route-final-comparison.md](../research/tech-route-final-comparison.md)
>
> 旧版已归档至 `_archive/project-skeleton.md`

---

## 一、Monorepo 顶层结构

```
linkingchat/
├── apps/
│   ├── server/                    # Cloud Brain 后端 (NestJS + Prisma)
│   ├── web/                       # Web 客户端 (React + Vite)
│   ├── desktop/                   # 桌面端 (Electron + TypeScript)
│   └── mobile/                    # 移动端 (Flutter 或 React Native Expo)
│
├── packages/
│   ├── shared/                    # Zod schemas + 常量 + 枚举
│   ├── ws-protocol/               # WebSocket 事件类型定义 + 事件名常量
│   ├── api-client/                # 类型安全 REST API 客户端
│   └── ui/                        # 共享 React 组件 (web + desktop)
│
├── docker/                        # Docker 相关配置
│   ├── docker-compose.yaml        # 开发环境 (PostgreSQL + Redis + MinIO + Maildev)
│   ├── docker-compose.test.yaml   # 测试环境
│   └── docker-compose.prod.yaml   # 生产环境
│
├── docs/                          # 项目文档
│
├── .github/
│   └── workflows/
│       ├── ci.yaml                # CI: lint + test + type-check
│       └── deploy.yaml            # CD: 部署
│
├── package.json                   # Monorepo 根配置
├── pnpm-workspace.yaml            # pnpm workspace 定义
├── turbo.json                     # Turborepo 任务编排
├── tsconfig.base.json             # 共享 TypeScript 配置
├── .env.example                   # 环境变量模板
├── .gitignore
└── README.md
```

### pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "test": {
      "dependsOn": ["build"]
    },
    "type-check": {
      "dependsOn": ["^build"]
    }
  }
}
```

### 根 package.json

```json
{
  "name": "linkingchat",
  "private": true,
  "scripts": {
    "dev:server": "turbo run dev --filter=@linkingchat/server",
    "dev:web": "turbo run dev --filter=@linkingchat/web",
    "dev:desktop": "turbo run dev --filter=@linkingchat/desktop",
    "dev:all": "turbo run dev --parallel",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "type-check": "turbo run type-check",
    "docker:up": "docker compose -f docker/docker-compose.yaml up -d",
    "docker:down": "docker compose -f docker/docker-compose.yaml down",
    "db:migrate": "pnpm --filter @linkingchat/server prisma:migrate",
    "db:seed": "pnpm --filter @linkingchat/server prisma:seed"
  },
  "engines": {
    "node": ">=22.0.0"
  }
}
```

---

## 二、packages/shared/ — Zod Schemas + 常量

```
packages/shared/
├── src/
│   ├── index.ts                           # 统一导出
│   ├── schemas/                           # Zod 验证 schemas（跨端共享）
│   │   ├── user.schema.ts
│   │   ├── message.schema.ts
│   │   ├── device.schema.ts
│   │   └── converse.schema.ts
│   ├── enums/                             # 共享枚举
│   │   ├── device-platform.enum.ts        # darwin | win32 | linux
│   │   ├── message-type.enum.ts           # TEXT | IMAGE | FILE | VOICE | SYSTEM | AI_*
│   │   ├── converse-type.enum.ts          # DM | MULTI | GROUP
│   │   └── command-status.enum.ts         # PENDING | RUNNING | COMPLETED | FAILED | CANCELLED
│   └── constants/                         # 全局常量
│       ├── pagination.ts                  # PAGE_SIZE = 35
│       └── limits.ts                      # MAX_GROUP_MEMBERS, MAX_USERNAME_LENGTH, etc.
│
├── package.json                           # "@linkingchat/shared"
└── tsconfig.json
```

### packages/ws-protocol/ — WebSocket 事件定义

```
packages/ws-protocol/
├── src/
│   ├── index.ts
│   ├── events.ts                          # 事件名称常量 (client→server, server→client)
│   ├── payloads/                          # 每个事件的 Payload 类型
│   │   ├── chat.payloads.ts               # 消息、会话、好友事件
│   │   ├── device.payloads.ts             # 设备控制事件
│   │   └── ai.payloads.ts                 # AI 事件 (Whisper/Draft/Predictive)
│   ├── envelope.ts                        # WsEnvelope, WsResponse, WsError
│   └── typed-socket.ts                    # ClientToServerEvents, ServerToClientEvents, SocketData
│
├── package.json                           # "@linkingchat/ws-protocol"
└── tsconfig.json
```

---

## 三、apps/server/ — Cloud Brain 后端

基于 NestJS + Prisma + PostgreSQL。

```
apps/server/
├── prisma/
│   ├── schema.prisma                      # ★ 数据库 Schema（18 models）
│   ├── migrations/                        # Prisma 迁移文件
│   └── seed.ts                            # 种子数据
│
├── src/
│   ├── main.ts                            # 启动入口：NestFactory + RedisIoAdapter
│   ├── app.module.ts                      # 根模块
│   │
│   ├── config/                            # 全局配置
│   │   ├── app.config.ts
│   │   ├── auth.config.ts                 # JWT RS256 密钥对
│   │   ├── database.config.ts
│   │   └── redis.config.ts
│   │
│   ├── prisma/                            # Prisma 服务
│   │   ├── prisma.module.ts               # @Global
│   │   └── prisma.service.ts              # extends PrismaClient, onModuleInit
│   │
│   ├── auth/                              # 认证模块 (JWT RS256)
│   │   ├── auth.controller.ts             # POST /auth/register, /auth/login, /auth/refresh
│   │   ├── auth.service.ts                # argon2 hash, RS256 sign/verify
│   │   ├── auth.module.ts
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts          # Access token guard
│   │   │   └── jwt-refresh.guard.ts       # Refresh token guard
│   │   ├── strategies/
│   │   │   ├── jwt.strategy.ts            # RS256 public key 验证
│   │   │   └── jwt-refresh.strategy.ts
│   │   └── decorators/
│   │       └── current-user.decorator.ts
│   │
│   ├── users/                             # 用户模块
│   │   ├── users.controller.ts            # GET/PATCH /users
│   │   ├── users.service.ts
│   │   └── users.module.ts
│   │
│   ├── friends/                           # 好友系统
│   │   ├── friends.controller.ts          # POST /friends/request, /friends/accept, DELETE /friends/:id
│   │   ├── friends.service.ts
│   │   └── friends.module.ts
│   │
│   ├── groups/                            # 群组管理
│   │   ├── groups.controller.ts           # CRUD /groups, /groups/:id/channels
│   │   ├── groups.service.ts              # 事务创建 Group + 默认 Channel + Converse
│   │   └── groups.module.ts
│   │
│   ├── converses/                         # 会话管理
│   │   ├── converses.controller.ts        # GET /converses (会话列表 + 未读)
│   │   ├── converses.service.ts
│   │   └── converses.module.ts
│   │
│   ├── messages/                          # 消息
│   │   ├── messages.controller.ts         # POST /messages, GET /messages?cursor=
│   │   ├── messages.service.ts            # 游标分页, 35/page
│   │   └── messages.module.ts
│   │
│   ├── devices/                           # 设备管理 (OpenClaw)
│   │   ├── devices.controller.ts          # GET/PATCH/DELETE /devices
│   │   ├── devices.service.ts
│   │   ├── commands.service.ts
│   │   └── devices.module.ts
│   │
│   ├── bots/                              # 多 Bot 管理 (2026-02-13 新增)
│   │   ├── bots.controller.ts             # CRUD /bots
│   │   ├── bots.service.ts                # Bot ↔ OpenClaw agent config 映射
│   │   └── bots.module.ts
│   │
│   ├── gateway/                           # WebSocket 网关
│   │   ├── adapters/
│   │   │   └── redis-io.adapter.ts        # Redis + Socket.IO 适配器
│   │   ├── middleware/
│   │   │   └── ws-auth.middleware.ts       # JWT RS256 认证
│   │   ├── chat.gateway.ts                # /chat 命名空间
│   │   ├── device.gateway.ts              # /device 命名空间
│   │   ├── broadcast.service.ts           # @Global：任何模块都可推送 WS 事件
│   │   └── gateway.module.ts
│   │
│   ├── ai/                                # AI 模块 (Sprint 2+)
│   │   ├── services/
│   │   │   ├── llm-router.service.ts      # 多 LLM 路由 (DeepSeek / Kimi 2.5)
│   │   │   ├── whisper.service.ts         # @ai 触发回复建议（1主推荐 + 2备选）
│   │   │   ├── draft.service.ts           # Draft & Verify 状态机
│   │   │   └── predictive.service.ts      # Predictive Actions
│   │   ├── listeners/
│   │   │   └── message.listener.ts        # 监听 message:new 触发 AI
│   │   ├── ai.controller.ts
│   │   └── ai.module.ts
│   │
│   └── common/                            # 公共工具
│       ├── filters/ws-exception.filter.ts
│       ├── interceptors/
│       └── utils/result.ts                # Result monad (学 nestjs-chat)
│
├── test/                                  # E2E 测试
│
├── package.json                           # "@linkingchat/server"
├── tsconfig.json
└── .env.example
```

### 模块依赖关系

```
                    app.module
                        │
         ┌──────────────┼──────────────────────┐
         │              │                      │
    基础模块          社交模块            设备 + AI 模块
         │              │                      │
    ├── prisma (G)  ├── friends            ├── devices
    ├── auth        ├── groups             ├── ai (Sprint 2+)
    ├── users       ├── converses          └── gateway (G)
    └── config      └── messages                │
                         │                      │
                         └──────────┬───────────┘
                                    │
                         gateway.module (@Global)
                                    │
                         ┌──────────┼──────────┐
                         │          │          │
                  chat.gateway  device.gateway  broadcast.service
                  (/chat ns)    (/device ns)   (任何模块可调用)
```

### 关键设计决策

1. **Prisma 替代 TypeORM**：声明式 Schema，类型安全，Migration 更可靠。不再使用 Hexagonal Port/Adapter 模式——Prisma Client 本身就是类型安全的 Repository。
2. **BroadcastService (@Global)**：任何业务模块（friends, messages, groups）都可注入它来推送 WebSocket 事件。学 Valkyrie 的 SocketService 但命名更清晰。
3. **REST-First Mutations**：所有数据变更走 REST API，WebSocket 仅广播事件。
4. **双命名空间**：`/chat` 处理社交消息，`/device` 处理设备控制，各自独立连接和认证。
5. **Result Monad**：学 nestjs-chat，Service 层返回 `Result<T, E>` 而非抛异常。

---

## 四、apps/desktop/ — Electron 桌面端

```
apps/desktop/
├── src/
│   ├── main/                              # Electron 主进程
│   │   ├── index.ts                       # Electron app 入口
│   │   ├── window.ts                      # BrowserWindow 管理
│   │   ├── ipc/                           # IPC 通信处理
│   │   │   ├── auth.ipc.ts
│   │   │   └── device.ipc.ts
│   │   ├── services/
│   │   │   ├── ws-client.service.ts       # WebSocket 客户端
│   │   │   ├── openclaw.service.ts        # OpenClaw 子进程管理
│   │   │   └── auth-store.service.ts      # JWT token 本地存储
│   │   └── utils/
│   │       └── platform.ts
│   │
│   ├── renderer/                          # Electron 渲染进程 (React + Vite)
│   │   ├── index.html
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Chat.tsx
│   │   │   └── DevicePanel.tsx
│   │   ├── components/
│   │   └── stores/
│   │
│   └── preload/
│       └── index.ts                       # contextBridge
│
├── package.json                           # "@linkingchat/desktop"
├── tsconfig.json
├── electron-builder.yaml
└── vite.config.ts
```

---

## 五、apps/mobile/ — 移动端

> **已确认使用 Flutter (2026-02-13)**。设计方向：微信/WhatsApp 风格，less is more。
> Bot 作为固定置顶的系统级联系人。支持多 Bot 框架（MVP 仅远程执行能力）。
> Flutter 无法直接使用 TypeScript 共享包，需手动镜像类型到 Dart。

### Flutter 方案

```
apps/mobile/
├── lib/
│   ├── main.dart
│   ├── core/
│   │   ├── network/
│   │   │   ├── api_client.dart            # Dio HTTP 客户端
│   │   │   ├── ws_client.dart             # socket_io_client
│   │   │   └── auth_interceptor.dart
│   │   └── constants/
│   │       └── ws_events.dart             # 手动镜像 ws-protocol 的事件名
│   ├── features/
│   │   ├── auth/
│   │   ├── chat/
│   │   ├── device/
│   │   └── friends/
│   └── l10n/
├── pubspec.yaml
└── test/
```

### React Native (Expo) 方案（备选，未采用）

> 以下保留作为参考。团队已确认使用 Flutter。

```
apps/mobile/
├── src/
│   ├── app/                               # Expo Router
│   ├── features/
│   │   ├── auth/
│   │   ├── chat/
│   │   ├── device/
│   │   └── friends/
│   ├── stores/                            # Zustand / Jotai
│   └── utils/
├── package.json                           # "@linkingchat/mobile"
├── app.json                               # Expo 配置
└── tsconfig.json
```

---

## 六、Monorepo 依赖图

```
@linkingchat/shared          @linkingchat/ws-protocol
    │                              │
    ├── @linkingchat/server ───────┤
    │                              │
    ├── @linkingchat/web ──────────┤
    │                              │
    ├── @linkingchat/desktop ──────┤
    │                              │
    └── @linkingchat/api-client ───┘

@linkingchat/ui
    ├── @linkingchat/web
    └── @linkingchat/desktop

@linkingchat/mobile (Flutter: 独立依赖，手动镜像 TypeScript 类型到 Dart)
```
