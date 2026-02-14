# Sprint 0：基础设施搭建

> **目标**：团队每个人 `git clone → pnpm install → docker compose up → pnpm dev:server` 能跑起来
>
> **前置条件**：所有开发者本地安装好 Node.js 22+、pnpm 9+、Docker & Docker Compose、Flutter 3.22+、Git 2.40+
>
> **参考**：[dev-environment-setup.md](../dev-plan/dev-environment-setup.md) | [project-skeleton.md](../dev-plan/project-skeleton.md)

---

## 任务清单

| # | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| 0.1 | 初始化 Turborepo + pnpm workspace | 仓库骨架 | `pnpm install` 无报错 |
| 0.2 | 创建 NestJS 项目 | apps/server 可启动 | `pnpm dev:server` 返回 hello world |
| 0.3 | 配置 Docker Compose | PostgreSQL + Redis + MinIO + Adminer + MailDev | `docker compose up -d` 所有服务健康 |
| 0.4 | 配置 Prisma + Sprint 1 Schema | prisma/schema.prisma | `prisma migrate dev` 建表成功 |
| 0.5 | 初始化共享包 | packages/shared + packages/ws-protocol | `pnpm build` 编译通过 |
| 0.6 | 生成 RS256 密钥对 | keys/ 目录 + .env 配置 | JWT 签发和验证测试通过 |
| 0.7 | 初始化 Electron 项目 | apps/desktop 可启动 | `pnpm dev:desktop` 打开空窗口 |
| 0.8 | 初始化 Flutter 项目 | apps/mobile 可运行 | `flutter run` 显示空白 app |
| 0.9 | 配置 CI | GitHub Actions | push 触发 lint + type-check |

---

## 0.1 初始化 Turborepo + pnpm workspace

```bash
cd linkingchat  # 项目根目录

# 创建目录结构
mkdir -p apps/{server,desktop,mobile}
mkdir -p packages/{shared,ws-protocol,api-client,ui}
mkdir -p docker
mkdir -p keys
```

**pnpm-workspace.yaml**：
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**turbo.json**：
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

**根 package.json**：
```json
{
  "name": "linkingchat",
  "private": true,
  "scripts": {
    "dev:server": "turbo run dev --filter=@linkingchat/server",
    "dev:desktop": "turbo run dev --filter=@linkingchat/desktop",
    "dev:all": "turbo run dev --parallel",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "type-check": "turbo run type-check",
    "docker:up": "docker compose -f docker/docker-compose.yaml up -d",
    "docker:down": "docker compose -f docker/docker-compose.yaml down",
    "db:migrate": "pnpm --filter @linkingchat/server prisma migrate dev",
    "db:seed": "pnpm --filter @linkingchat/server prisma db seed"
  },
  "engines": {
    "node": ">=22.0.0"
  }
}
```

```bash
pnpm install
```

---

## 0.2 创建 NestJS 项目

```bash
cd apps/server
npx @nestjs/cli new . --package-manager pnpm --skip-git

# 安装核心依赖
pnpm add @prisma/client @nestjs/config @nestjs/swagger
pnpm add -D prisma

# 安装认证依赖
pnpm add @nestjs/jwt @nestjs/passport passport passport-jwt argon2
pnpm add -D @types/passport-jwt

# 安装 WebSocket 依赖
pnpm add @nestjs/websockets @nestjs/platform-socket.io socket.io
pnpm add ioredis @socket.io/redis-adapter

# 安装验证依赖
pnpm add class-validator class-transformer zod
```

修改 `apps/server/package.json`：
```json
{
  "name": "@linkingchat/server",
  ...
}
```

验证：
```bash
cd ../..
pnpm dev:server
# 访问 http://localhost:3008 应返回 Hello World
```

---

## 0.3 配置 Docker Compose

创建 `docker/docker-compose.yaml`（完整内容见 [dev-environment-setup.md §三](../dev-plan/dev-environment-setup.md)）。

```bash
pnpm docker:up
# 验证
docker compose -f docker/docker-compose.yaml ps
# 所有 5 个服务应为 running (healthy)

# 管理界面
# PostgreSQL Adminer: http://localhost:8088
# MinIO Console:      http://localhost:9009
# MailDev:            http://localhost:1088
```

---

## 0.4 配置 Prisma + Sprint 1 Schema

```bash
cd apps/server
npx prisma init
```

编辑 `prisma/schema.prisma`（Sprint 1 只需 4 个 model）：

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

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

  user User @relation(fields: [userId], references: [id])

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

```bash
npx prisma migrate dev --name init
npx prisma generate
```

验证：`npx prisma studio` 打开浏览器，能看到 4 张空表。

---

## 0.5 初始化共享包

### packages/shared

```bash
cd packages/shared
pnpm init  # name: "@linkingchat/shared"
pnpm add -D typescript zod
```

`tsconfig.json`：
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src"]
}
```

`src/index.ts`：
```typescript
export * from './enums';
```

`src/enums/index.ts`：
```typescript
export enum DevicePlatform {
  DARWIN = 'darwin',
  WIN32 = 'win32',
  LINUX = 'linux',
}

export enum CommandStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum DeviceStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
}
```

### packages/ws-protocol

同样结构，`src/index.ts` 导出事件名常量和 payload 类型：

```typescript
// src/events.ts
export const DEVICE_EVENTS = {
  // Client → Server
  REGISTER: 'device:register',
  HEARTBEAT: 'device:heartbeat',
  COMMAND_SEND: 'device:command:send',
  COMMAND_CANCEL: 'device:command:cancel',
  RESULT_COMPLETE: 'device:result:complete',
  RESULT_PROGRESS: 'device:result:progress',

  // Server → Client
  COMMAND_EXECUTE: 'device:command:execute',
  COMMAND_ACK: 'device:command:ack',
  RESULT_DELIVERED: 'device:result:delivered',
  STATUS_CHANGED: 'device:status:changed',
} as const;
```

```bash
cd ../..
pnpm build  # 验证所有包编译通过
```

---

## 0.6 生成 RS256 密钥对

```bash
cd apps/server

# Access token 密钥对
openssl genrsa -out keys/jwt-private.pem 2048
openssl rsa -in keys/jwt-private.pem -pubout -out keys/jwt-public.pem

# Refresh token 密钥对
openssl genrsa -out keys/jwt-refresh-private.pem 2048
openssl rsa -in keys/jwt-refresh-private.pem -pubout -out keys/jwt-refresh-public.pem
```

创建 `.env`（见 [dev-environment-setup.md §四](../dev-plan/dev-environment-setup.md)）。

将 `keys/` 加入 `.gitignore`。

---

## 0.7 初始化 Electron 桌面端

```bash
cd apps/desktop
pnpm init  # name: "@linkingchat/desktop"
pnpm add electron
pnpm add -D typescript electron-vite vite @vitejs/plugin-react react react-dom
pnpm add -D @types/react @types/react-dom
```

最小骨架：主进程 `src/main/index.ts` 创建 BrowserWindow，渲染进程 `src/renderer/App.tsx` 显示空白页。

---

## 0.8 初始化 Flutter 移动端

```bash
cd apps
flutter create --org com.linkingchat --project-name linkingchat_mobile mobile
cd mobile
flutter pub add dio socket_io_client flutter_riverpod go_router flutter_secure_storage intl
```

验证：`flutter run` 能在模拟器上显示默认 Flutter 页面。

---

## 0.9 配置 GitHub Actions CI

`.github/workflows/ci.yaml`：

```yaml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm type-check
      - run: pnpm test
```

---

## 完成标准

Sprint 0 完成后，以下命令全部通过：

```bash
git clone <repo> && cd linkingchat
pnpm install                    # ✅ 无报错
pnpm docker:up                  # ✅ 5 个服务 healthy
pnpm db:migrate                 # ✅ 4 张表创建成功
pnpm dev:server                 # ✅ http://localhost:3008 可访问
pnpm dev:desktop                # ✅ Electron 窗口打开
cd apps/mobile && flutter run   # ✅ 模拟器显示 app
```

**完成后进入 → [Sprint 1](./sprint1_implement.md)**
