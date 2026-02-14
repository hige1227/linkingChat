# Sprint 0：基础设施搭建

> **状态**：✅ 已完成（2026-02-14）
>
> **目标**：团队每个人 `git clone → pnpm install → docker compose up → pnpm dev:server` 能跑起来
>
> **前置条件**：所有开发者本地安装好 Node.js 22+、pnpm 10+、Docker & Docker Compose、Flutter 3.22+、Git 2.40+
>
> **参考**：[dev-environment-setup.md](../dev-plan/dev-environment-setup.md) | [project-skeleton.md](../dev-plan/project-skeleton.md)

---

## 任务清单

| # | 任务 | 产出 | 验收标准 | 状态 |
|---|------|------|---------|------|
| 0.1 | 初始化 Turborepo + pnpm workspace | 仓库骨架 | `pnpm install` 无报错 | ✅ |
| 0.2 | 创建 NestJS 项目 | apps/server 可启动 | `pnpm dev:server` 返回 hello world | ✅ |
| 0.3 | 配置 Docker Compose | PostgreSQL + Redis + MinIO + Adminer + MailDev | `docker compose up -d` 所有服务健康 | ✅ |
| 0.4 | 配置 Prisma + Sprint 1 Schema | prisma/schema.prisma | `prisma migrate dev` 建表成功 | ✅ |
| 0.5 | 初始化共享包 | packages/shared + packages/ws-protocol | `pnpm build` 编译通过 | ✅ |
| 0.6 | 生成 RS256 密钥对 | keys/ 目录 + .env 配置 | JWT 签发和验证测试通过 | ✅ |
| 0.7 | 初始化 Electron 项目 | apps/desktop 可启动 | `pnpm dev:desktop` 打开空窗口 | ✅ |
| 0.8 | 初始化 Flutter 项目 | apps/mobile 可运行 | `flutter run` 显示空白 app | ⚠️ 需安装 Flutter SDK |
| 0.9 | 配置 CI | GitHub Actions | push 触发 lint + type-check + test | ✅ |

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

**turbo.json**（注意：Turbo v2 使用 `tasks` 而非 `pipeline`）：
```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "out/**"]
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
  "devDependencies": {
    "turbo": "^2"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "packageManager": "pnpm@10.22.0",
  "pnpm": {
    "onlyBuiltDependencies": [
      "@nestjs/core", "@prisma/client", "@prisma/engines",
      "argon2", "electron", "esbuild", "prisma"
    ]
  }
}
```

> **注意**：pnpm 10 默认阻止依赖的 postinstall 脚本，需在 `pnpm.onlyBuiltDependencies` 中白名单批准。

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
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  check:
    name: Lint & Type Check & Test
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: linkingchat
          POSTGRES_PASSWORD: linkingchat_dev
          POSTGRES_DB: linkingchat_dev
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build --filter=@linkingchat/shared --filter=@linkingchat/ws-protocol
      - run: pnpm type-check
      - run: pnpm test

  build-desktop:
    name: Build Electron Desktop
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @linkingchat/desktop build
```

---

## 完成标准

Sprint 0 完成后，以下命令全部通过：

```bash
git clone <repo> && cd linkingchat
pnpm install                    # ✅ 无报错（pnpm 10.22.0, turbo 2.8.8）
pnpm docker:up                  # ✅ 5 个服务 running (postgres/redis/minio/adminer/maildev)
pnpm db:migrate                 # ✅ 4 张表创建成功 (users/devices/commands/refresh_tokens)
pnpm dev:server                 # ✅ http://localhost:3008/api/v1 返回 hello
pnpm dev:desktop                # ✅ electron-vite 构建 + Electron 窗口打开
pnpm build                      # ✅ 4 个包全部编译通过
pnpm test                       # ✅ 2 个测试通过
cd apps/mobile && flutter run   # ⚠️ 需先安装 Flutter SDK + flutter create .
```

### Flutter 补完步骤

Flutter SDK 安装后在 `apps/mobile/` 目录执行：

```bash
flutter create . --org com.linkingchat --project-name linkingchat_mobile
flutter pub get
flutter run
```

这将生成 android/ 和 ios/ 平台目录，不会覆盖已有的 `lib/main.dart`。

### 实施备注

- **pnpm 10 breaking change**：默认阻止 postinstall 脚本，需在根 `package.json` 的 `pnpm.onlyBuiltDependencies` 中白名单批准
- **Turbo v2**：使用 `tasks` 键而非 `pipeline`（turbo.json）
- **Electron**：`package.json` 的 `main` 字段指向 `./out/main/index.js`（electron-vite 构建产物），而非源码
- **端口方案**：全部 +8 避免与其他项目冲突（PG:5440, Redis:6387, MinIO:9008/9009, Adminer:8088, MailDev:1088/1033）

**完成后进入 → [Sprint 1](./sprint1_implement.md)**
