# 开发环境搭建指南

> 权威来源：[reference-architecture-guide.md](./reference-architecture-guide.md) + [project-skeleton.md](./project-skeleton.md)
>
> 旧版已归档至 `_archive/dev-environment-setup.md`

---

## 一、前置要求

| 工具 | 版本 | 说明 |
|------|------|------|
| **Node.js** | >= 22.0.0 | 服务端 + 桌面端运行时 |
| **pnpm** | >= 10.0.0 | Monorepo 包管理器（v10 有 breaking changes，见下方注意事项） |
| **Docker & Docker Compose** | 最新稳定版 | 数据库 + Redis + MinIO |
| **Git** | >= 2.40 | 版本控制 |
| **VS Code** 或 **WebStorm** | 最新 | 推荐 IDE |

### 移动端

| 工具 | 用途 |
|------|------|
| **Flutter** >= 3.22 | 移动端框架 (**已确认**) |
| **Xcode** (macOS) | iOS 模拟器 |
| **Android Studio** | Android 模拟器 |

### 可选

| 工具 | 用途 |
|------|------|
| **OpenClaw** | 桌面端设备执行能力 (`npm i -g openclaw@latest`) |

---

## 二、初始化步骤

### Step 1: 克隆仓库

```bash
git clone https://github.com/ZenoWangzy/linkingChat.git
cd linkingChat
```

### Step 2: 创建 Turborepo + pnpm workspace

```bash
# 创建目录结构
mkdir -p apps/{server,web,desktop,mobile}
mkdir -p packages/{shared,ws-protocol,api-client,ui}
mkdir -p docker

# 初始化 pnpm workspace
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - "apps/*"
  - "packages/*"
EOF

# 安装依赖
pnpm install
```

### Step 3: 初始化 Server (NestJS + Prisma)

```bash
cd apps/server

# 创建 NestJS 项目
npx @nestjs/cli new . --package-manager pnpm --skip-git

# 安装 Prisma
pnpm add @prisma/client
pnpm add -D prisma

# 初始化 Prisma
npx prisma init

# 安装认证相关
pnpm add @nestjs/jwt @nestjs/passport passport passport-jwt argon2
pnpm add -D @types/passport-jwt

# 安装 WebSocket 相关
pnpm add @nestjs/websockets @nestjs/platform-socket.io socket.io
pnpm add ioredis @socket.io/redis-adapter

# 安装验证
pnpm add class-validator class-transformer zod

# 修改 package.json
# "name": "@linkingchat/server"
```

### Step 4: 配置 Prisma

```bash
# 编辑 prisma/schema.prisma（参考 reference-architecture-guide.md §1.2）
# 运行 migration
npx prisma migrate dev --name init

# 生成 Prisma Client
npx prisma generate
```

### Step 5: 生成 RS256 密钥对

```bash
# 生成 JWT RS256 密钥对
mkdir -p keys
openssl genrsa -out keys/jwt-private.pem 2048
openssl rsa -in keys/jwt-private.pem -pubout -out keys/jwt-public.pem

# Refresh token 使用独立密钥对
openssl genrsa -out keys/jwt-refresh-private.pem 2048
openssl rsa -in keys/jwt-refresh-private.pem -pubout -out keys/jwt-refresh-public.pem

# 将密钥内容 base64 编码后写入 .env（适合环境变量传递）
echo "AUTH_JWT_PRIVATE_KEY=$(base64 -w 0 keys/jwt-private.pem)" >> .env
echo "AUTH_JWT_PUBLIC_KEY=$(base64 -w 0 keys/jwt-public.pem)" >> .env
echo "AUTH_REFRESH_PRIVATE_KEY=$(base64 -w 0 keys/jwt-refresh-private.pem)" >> .env
echo "AUTH_REFRESH_PUBLIC_KEY=$(base64 -w 0 keys/jwt-refresh-public.pem)" >> .env
```

### Step 6: 初始化 Shared + WS Protocol 包

```bash
# packages/shared
cd packages/shared
pnpm init
pnpm add -D typescript zod
cat > tsconfig.json << 'EOF'
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
EOF

# packages/ws-protocol (同样结构)
cd ../ws-protocol
pnpm init
pnpm add -D typescript
# 复制相同 tsconfig.json
```

### Step 7: 初始化 Electron 桌面端

```bash
cd apps/desktop
pnpm init

# 推荐使用 electron-vite
pnpm add electron electron-builder
pnpm add -D typescript vite @vitejs/plugin-react electron-vite
```

### Step 8: 初始化移动端

**Flutter（已确认）:**
```bash
cd apps/mobile

# 若从零创建（已有 pubspec.yaml 和 lib/main.dart 则跳过 flutter create）
flutter create . --org com.linkingchat --project-name linkingchat_mobile

flutter pub get
flutter pub add dio socket_io_client flutter_riverpod go_router flutter_secure_storage intl
```

---

## 三、Docker 开发环境

### docker/docker-compose.yaml

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: linkingchat-postgres
    environment:
      POSTGRES_USER: linkingchat
      POSTGRES_PASSWORD: linkingchat_dev
      POSTGRES_DB: linkingchat
    ports:
      - "5440:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U linkingchat"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: linkingchat-redis
    ports:
      - "6387:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    container_name: linkingchat-minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: linkingchat
      MINIO_ROOT_PASSWORD: linkingchat_dev
    ports:
      - "9008:9000"
      - "9009:9001"
    volumes:
      - minio_data:/data

  adminer:
    image: adminer:latest
    container_name: linkingchat-adminer
    ports:
      - "8088:8080"

  maildev:
    image: maildev/maildev
    container_name: linkingchat-maildev
    ports:
      - "1088:1080"
      - "1033:1025"

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

### 启动开发环境

```bash
# 启动所有服务
docker compose -f docker/docker-compose.yaml up -d

# 验证服务状态
docker compose -f docker/docker-compose.yaml ps

# 管理界面
# PostgreSQL Adminer:  http://localhost:8088
# MinIO Console:       http://localhost:9009
# MailDev:             http://localhost:1088
```

---

## 四、Server 环境变量 (.env)

```bash
# App
NODE_ENV=development
APP_PORT=3008
APP_NAME="LinkingChat"
API_PREFIX=api
FRONTEND_DOMAIN=http://localhost:5181
BACKEND_DOMAIN=http://localhost:3008

# Database (PostgreSQL + Prisma)
DATABASE_URL="postgresql://linkingchat:linkingchat_dev@localhost:5440/linkingchat?schema=public"

# Redis (Socket.IO adapter + 缓存)
REDIS_URL=redis://localhost:6387

# Auth (JWT RS256 — 非对称密钥对)
AUTH_JWT_PRIVATE_KEY=<base64 encoded private key>
AUTH_JWT_PUBLIC_KEY=<base64 encoded public key>
AUTH_JWT_TOKEN_EXPIRES_IN=15m
AUTH_REFRESH_PRIVATE_KEY=<base64 encoded refresh private key>
AUTH_REFRESH_PUBLIC_KEY=<base64 encoded refresh public key>
AUTH_REFRESH_TOKEN_EXPIRES_IN=30d

# File Storage (MinIO as S3-compatible)
FILE_DRIVER=s3
ACCESS_KEY_ID=linkingchat
SECRET_ACCESS_KEY=linkingchat_dev
AWS_S3_REGION=us-east-1
AWS_DEFAULT_S3_BUCKET=linkingchat-files
AWS_S3_ENDPOINT=http://localhost:9008

# Mail (MailDev for development)
MAIL_HOST=localhost
MAIL_PORT=1033
MAIL_USER=
MAIL_PASSWORD=
MAIL_IGNORE_TLS=true
MAIL_SECURE=false
MAIL_DEFAULT_EMAIL=noreply@linkingchat.com
MAIL_DEFAULT_NAME=LinkingChat
```

> **重要**: JWT 使用 RS256 非对称密钥对，不再使用旧的 `AUTH_JWT_SECRET` 单密钥。
> 见 Step 5 生成密钥对，或参考 reference-architecture-guide.md §三。

---

## 五、日常开发命令

### Server

```bash
# 启动开发服务器 (热重载)
pnpm --filter @linkingchat/server start:dev

# Prisma 操作
pnpm --filter @linkingchat/server prisma migrate dev --name <migration_name>
pnpm --filter @linkingchat/server prisma generate
pnpm --filter @linkingchat/server prisma studio     # 可视化数据库浏览

# 运行测试
pnpm --filter @linkingchat/server test
pnpm --filter @linkingchat/server test:e2e
```

### Desktop

```bash
# 启动 Electron 开发模式
pnpm --filter @linkingchat/desktop dev

# 构建
pnpm --filter @linkingchat/desktop build
```

### Mobile (Flutter)

```bash
cd apps/mobile
flutter run
flutter run -d ios
flutter run -d android
flutter pub run build_runner build
```

### Mobile (RN Expo)

```bash
cd apps/mobile
npx expo start
npx expo start --ios
npx expo start --android
```

### Monorepo

```bash
# Turborepo 全量操作
turbo run build           # 构建所有
turbo run lint            # 全量 lint
turbo run test            # 全量测试
turbo run type-check      # 全量类型检查

# 并行启动 server + desktop
turbo run dev --filter=@linkingchat/server --filter=@linkingchat/desktop

# Docker 环境
pnpm run docker:up
pnpm run docker:down
```

---

## 六、IDE 推荐配置

### VS Code 推荐扩展

```json
// .vscode/extensions.json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "Prisma.prisma",
    "ms-azuretools.vscode-docker",
    "ms-vscode.vscode-typescript-next",
    "Dart-Code.dart-code",
    "Dart-Code.flutter"
  ]
}
```

### VS Code 工作区设置

```json
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.preferences.importModuleSpecifier": "relative",
  "eslint.workingDirectories": [
    "apps/server",
    "apps/web",
    "apps/desktop",
    "packages/shared",
    "packages/ws-protocol"
  ],
  "[prisma]": {
    "editor.defaultFormatter": "Prisma.prisma"
  }
}
```

---

## 七、开发端口分配

| 服务 | 端口 | 说明 |
|------|------|------|
| **NestJS Server** | 3008 | REST API + WebSocket |
| **PostgreSQL** | 5440 | 数据库 |
| **Redis** | 6387 | Socket.IO adapter + 缓存 |
| **MinIO S3** | 9008 | 文件存储 API |
| **MinIO Console** | 9009 | 文件存储管理界面 |
| **Adminer** | 8088 | 数据库管理界面 |
| **MailDev Web** | 1088 | 邮件测试界面 |
| **MailDev SMTP** | 1033 | 邮件测试 SMTP |
| **Electron Dev** | 5181 | 桌面端渲染进程 (Vite) |
| **Web Dev** | 5182 | Web 客户端 (Vite) |
| **Expo Dev** | 8081 | React Native (若选 Expo) |
