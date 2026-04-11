# LinkChat 生产部署方案 (v2)

> **日期**: 2026-04-10 (v2 修订)
> **目标**: 将 LinkChat Server 部署到云服务器，打包 Desktop (Win + macOS)
> **Review 状态**: 已通过 15 项修正审查

---

## 一、部署总览

```
                  ┌─────────────────────────────────────────┐
                  │     Cloud Server (2核4G Ubuntu 24.04)    │
                  │                                         │
Internet ──→     │  Host-level Nginx (:80/:443)             │
                  │    ├── linkchat-api.matrix-ai.com.cn    │
                  │    │     → Docker NestJS (:3008)        │
                  │    └── linkchat-minio.matrix-ai.com.cn  │
                  │          → Docker MinIO (:9000)         │
                  │                                         │
                  │  Docker Compose (内部网络):              │
                  │    ├── server (NestJS :3008)             │
                  │    ├── postgres (PG 16 :5432)            │
                  │    ├── redis (Redis 7 :6379, 256MB)      │
                  │    └── minio (S3 :9000/:9001)            │
                  │                                         │
                  │  Host-level:                             │
                  │    ├── Nginx + Let's Encrypt SSL         │
                  │    └── certbot (自动续签)                 │
                  └─────────────────────────────────────────┘

Desktop 安装包 (Win NSIS / macOS DMG):
  └── 内含 OpenClaw sidecar (Node.js 22 + openclaw@2026.4.2)
```

**Nginx 部署方式**: 宿主机直接安装 (apt)，不在 Docker 中。原因：
1. 简化 Let's Encrypt 证书申请/续签 (certbot 直接管理)
2. 减少 Docker 网络跳转，调试更直观
3. Docker Compose 内部服务不暴露端口到宿主机 (仅 Nginx proxy_pass 到 Docker 映射端口)

---

## 二、Server 端部署步骤 (6 步)

### Step 1: 重写 `docker-compose.prod.yaml`

**当前问题**:
- Nginx 容器 → 移除 (改为宿主机部署)
- 缺少 MinIO 服务
- JWT 环境变量名错误 (`JWT_PRIVATE_KEY` → `AUTH_JWT_PRIVATE_KEY`)
- 缺少 `CORS_ORIGINS` 环境变量
- Redis 缺少 healthcheck
- 缺少日志轮转配置 (json-file 驱动默认无限增长)
- 包含 openclaw 容器 (生产环境 OpenClaw 跑在用户 Desktop)

**修正内容**:

```yaml
# docker-compose.prod.yaml
services:
  server:
    build:
      context: .
      dockerfile: apps/server/Dockerfile
    environment:
      - NODE_ENV=production
      - APP_PORT=3008
      - DATABASE_URL=postgresql://linkingchat:${DB_PASSWORD}@postgres:5432/linkingchat
      - REDIS_URL=redis://redis:6379
      # Auth JWT (注意: 不是 JWT_PRIVATE_KEY)
      - AUTH_JWT_PRIVATE_KEY=${AUTH_JWT_PRIVATE_KEY}
      - AUTH_JWT_PUBLIC_KEY=${AUTH_JWT_PUBLIC_KEY}
      - AUTH_JWT_TOKEN_EXPIRES_IN=15m
      - AUTH_REFRESH_PRIVATE_KEY=${AUTH_REFRESH_PRIVATE_KEY}
      - AUTH_REFRESH_PUBLIC_KEY=${AUTH_REFRESH_PUBLIC_KEY}
      - AUTH_REFRESH_TOKEN_EXPIRES_IN=30d
      # CORS
      - CORS_ORIGINS=https://linkchat-api.matrix-ai.com.cn
      # LLM
      - DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY:-}
      - DEEPSEEK_BASE_URL=https://api.deepseek.com
      - DEEPSEEK_MODEL=deepseek-chat
      - KIMI_API_KEY=${KIMI_API_KEY:-}
      - KIMI_BASE_URL=https://api.moonshot.cn
      - KIMI_MODEL=moonshot-v1-8k
      # MinIO / S3
      - FILE_DRIVER=s3
      - ACCESS_KEY_ID=${S3_ACCESS_KEY}
      - SECRET_ACCESS_KEY=${S3_SECRET_KEY}
      - AWS_S3_REGION=us-east-1
      - AWS_DEFAULT_S3_BUCKET=linkingchat-files
      - AWS_S3_ENDPOINT=http://minio:9000
      - S3_PUBLIC_URL=https://linkchat-minio.matrix-ai.com.cn
      # Mail (可选, 留空禁用)
      - MAIL_HOST=${MAIL_HOST:-}
      - MAIL_PORT=${MAIL_PORT:-587}
      - MAIL_USER=${MAIL_USER:-}
      - MAIL_PASSWORD=${MAIL_PASSWORD:-}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_started
    ports:
      - "127.0.0.1:3008:3008"  # 仅本机可访问, Nginx proxy_pass
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3008/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    mem_limit: 512m

  postgres:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./backups:/backups
    environment:
      POSTGRES_USER: linkingchat
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: linkingchat
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U linkingchat"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    mem_limit: 512m

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "5m"
        max-file: "3"
    mem_limit: 256m

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${S3_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${S3_SECRET_KEY}
    volumes:
      - miniodata:/data
    ports:
      - "127.0.0.1:9000:9000"  # S3 API, Nginx 代理
      - "127.0.0.1:9001:9001"  # MinIO Console, Nginx 可选代理
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "5m"
        max-file: "3"
    mem_limit: 256m

volumes:
  pgdata:
  redisdata:
  miniodata:
```

**关键修正**:
1. ~~JWT_PRIVATE_KEY~~ → `AUTH_JWT_PRIVATE_KEY` (4 个变量)
2. healthcheck 路径: ~~`/health`~~ → `/api/v1/health` (全局前缀 `api/v1`)
3. 添加 `CORS_ORIGINS` 环境变量
4. Redis 添加 `healthcheck: redis-cli ping`
5. 添加 MinIO 服务 (端口 9000/9001)
6. 移除 Nginx 容器
7. 所有服务添加 `logging` + `mem_limit`
8. Server 端口映射: `127.0.0.1:3008` (仅本机)
9. MinIO 端口映射: `127.0.0.1:9000` (仅本机)
10. Server `depends_on` redis 增加 `condition: service_healthy`

### Step 2: 重写 `nginx/conf.d/default.conf`

**当前问题**:
- 域名 `api.linkingchat.com` → 需改为 `linkchat-api.matrix-ai.com.cn`
- health 路径 `= /health` → 404 (实际路径 `/api/v1/health`)
- 缺少 MinIO server block (`linkchat-minio.matrix-ai.com.cn`)
- upstream `server:3008` → 宿主机 Nginx 应 proxy 到 `127.0.0.1:3008`
- Auth 限流 `5r/m burst=3` 过于严格 (正常登录可能被误限)

**修正后**:

```nginx
# /etc/nginx/conf.d/linkchat.conf (宿主机)

# =====================================================
# linkchat-api.matrix-ai.com.cn — API + WebSocket
# =====================================================

# HTTP → HTTPS redirect
server {
    listen 80;
    server_name linkchat-api.matrix-ai.com.cn;

    # Let's Encrypt ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name linkchat-api.matrix-ai.com.cn;

    ssl_certificate /etc/letsencrypt/live/linkchat-api.matrix-ai.com.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/linkchat-api.matrix-ai.com.cn/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Health check (no rate limit) — 注意全局前缀 api/v1
    location = /api/v1/health {
        proxy_pass http://127.0.0.1:3008;
        proxy_set_header Host $host;
    }

    # Prometheus metrics (internal only)
    location /api/v1/metrics {
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        allow 127.0.0.1;
        deny all;
        proxy_pass http://127.0.0.1:3008;
    }

    # Auth endpoints (strict rate limit: 10r/m, 防暴力破解)
    location /api/v1/auth/ {
        limit_req zone=auth burst=5 nodelay;
        proxy_pass http://127.0.0.1:3008;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # REST API
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://127.0.0.1:3008;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket — Socket.IO
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3008;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}

# =====================================================
# linkchat-minio.matrix-ai.com.cn — MinIO S3 API
# =====================================================

server {
    listen 80;
    server_name linkchat-minio.matrix-ai.com.cn;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name linkchat-minio.matrix-ai.com.cn;

    ssl_certificate /etc/letsencrypt/live/linkchat-minio.matrix-ai.com.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/linkchat-minio.matrix-ai.com.cn/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # MinIO S3 API
    location / {
        proxy_pass http://127.0.0.1:9000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # MinIO needs these for large file uploads
        client_max_body_size 100m;
        proxy_connect_timeout 300s;
        proxy_read_timeout 300s;
    }
}
```

**同时更新 `nginx/nginx.conf` 的 auth 限流**:
```nginx
# 修正前: rate=5r/m (过严)
limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;
# 修正后:
limit_req_zone $binary_remote_addr zone=auth:10m rate=10r/m;
```

### Step 3: 创建 `.env.production.example`

**当前问题**: `docker-compose.prod.yaml` 引用了多个环境变量，但没有模板文件。

**创建文件** `.env.production.example`:

```bash
# ==================================================
# LinkChat 生产环境变量模板
# 复制为 .env.production 并填写实际值
# ==================================================

# --- Database ---
DB_PASSWORD=<strong-random-password>

# --- Auth JWT RS256 (base64 encoded) ---
# 生成: openssl genrsa -out private.pem 2048 && base64 -w0 private.pem
AUTH_JWT_PRIVATE_KEY=<base64>
AUTH_JWT_PUBLIC_KEY=<base64>
AUTH_REFRESH_PRIVATE_KEY=<base64>
AUTH_REFRESH_PUBLIC_KEY=<base64>

# --- LLM Providers ---
DEEPSEEK_API_KEY=<your-deepseek-api-key>
KIMI_API_KEY=<your-kimi-api-key>

# --- MinIO / S3 ---
S3_ACCESS_KEY=<minio-access-key>
S3_SECRET_KEY=<minio-secret-key>

# --- Mail (可选, 留空禁用邮箱功能) ---
MAIL_HOST=
MAIL_PORT=587
MAIL_USER=
MAIL_PASSWORD=
```

**注意**: 环境变量名必须与代码一致:
- `AUTH_JWT_PRIVATE_KEY` (不是 `JWT_PRIVATE_KEY`)
- `AUTH_JWT_PUBLIC_KEY`, `AUTH_REFRESH_PRIVATE_KEY`, `AUTH_REFRESH_PUBLIC_KEY`

### Step 4: 修复 `apps/server/Dockerfile`

**当前问题**:
1. `COPY --from=builder /app/apps/server/node_modules` — monorepo hoisted 到根目录，此路径可能为空
2. CMD 合并 migration + start — migration 失败静默杀死容器，无日志
3. 缺少 `NODE_ENV=production`

**修正后**:

```dockerfile
# Multi-stage build for LinkingChat Server
# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/ws-protocol/package.json packages/ws-protocol/

# Install dependencies
RUN corepack enable && pnpm install --frozen-lockfile

# Copy source
COPY packages/ packages/
COPY apps/server/ apps/server/

# Generate Prisma client (must be before build)
RUN cd apps/server && npx prisma generate

# Build shared packages first, then server
RUN pnpm --filter @linkingchat/shared build
RUN pnpm --filter @linkingchat/ws-protocol build
RUN pnpm --filter @linkingchat/server build

# Stage 2: Production
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production

# Copy built output
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/package.json ./
COPY --from=builder /app/apps/server/prisma ./prisma

# Copy production node_modules (monorepo root hoisted)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/ws-protocol/dist ./packages/ws-protocol/dist
COPY --from=builder /app/packages/ws-protocol/package.json ./packages/ws-protocol/

# Prisma engine
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3008

# Migration and server start — separate commands with explicit error handling
CMD ["sh", "-c", "npx prisma migrate deploy --schema=./prisma/schema.prisma || { echo 'Migration FAILED'; exit 1; } && node dist/main.js"]
```

**修正**:
1. 添加 `NODE_ENV=production`
2. 不再 copy `apps/server/node_modules` (monorepo deps hoisted to root)
3. 只 copy `packages/*/dist` + `package.json` (共享包的构建输出)
4. Migration 失败时显式报错退出，不再静默失败

### Step 5: 修复 `apps/server/src/main.ts`

**当前问题**:
1. Swagger 在生产环境无条件启用 (暴露 API 结构)
2. health endpoint 路径确认: `app.setGlobalPrefix('api/v1')` → health 实际路径 `/api/v1/health`

**修正**: 在 Swagger 设置前添加 `isProduction` 检查:

```typescript
// main.ts line 61-68 — 包裹 Swagger
if (!isProduction) {
  const config = new DocumentBuilder()
    .setTitle('LinkingChat API')
    .setDescription('LinkingChat Cloud Brain REST API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
}
```

**Health endpoint**: 无需修改代码。`@Get('health')` 在 `@Controller()` 下，经 `setGlobalPrefix('api/v1')` 后实际路径为 `/api/v1/health`。Nginx 和 Docker healthcheck 使用 `/api/v1/health`。

### Step 6: 创建部署脚本 `scripts/deploy-server.sh`

一键部署脚本，包含:
1. 检查 Docker / Docker Compose 版本
2. 生成 JWT 密钥对 (如果不存在)
3. 创建 `.env.production` (交互式填写)
4. 宿主机安装 Nginx + certbot
5. Let's Encrypt 证书申请
6. `docker compose -f docker-compose.prod.yaml --env-file .env.production up -d --build`
7. `docker compose exec server npx prisma migrate deploy` (首次迁移)
8. MinIO bucket 初始化
9. 健康检查验证
10. 数据库备份 cron 设置

---

## 三、邮箱验证

**确认: 无需代码修改。**

`EmailVerifiedGuard` 已定义但从未被任何 controller 使用 (`@UseGuards`)，也未注册为全局 Guard (只有 `ThrottlerGuard` 是全局的)。邮箱验证功能完全是 opt-in 的，生产环境不启用不会影响任何功能。

---

## 四、Desktop 打包 (Win + macOS)

### Step 7: 重构 Renderer 硬编码 URL

**当前问题**: Desktop renderer 中有 39 处 `localhost:3008` 硬编码，分布:
- `useOpenClawChat.ts` (1), `useChatSocket.ts` (5), `ChatPage.tsx` (2), `uploadService.ts` (2)
- `NotificationCard.tsx` (1), `friendsStore.ts` (1), `ForgotPassword.tsx` (1), `ResetPassword.tsx` (1)
- `Login.tsx` (2), `ChatThread.tsx` (3), `CreateGroupDialog.tsx` (3), `ProfilePage.tsx` (4)
- `GroupPanel.tsx` (11), `MessageInput.tsx` (1), `SearchPanel.tsx` (1)
- Desktop main process: `openclaw.ipc.ts`, `auth.ipc.ts`, `ws-client.service.ts` (共 4 处)

**方案**: 使用 electron-vite 的 Vite 环境变量注入:

1. 创建 `apps/desktop/src/renderer/config.ts`:
```typescript
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3008';
export const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3008';
```

2. 更新 `apps/desktop/electron.vite.config.ts`:
```typescript
export default defineConfig({
  // ...
  renderer: {
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(
        process.env.VITE_API_URL || 'http://localhost:3008'
      ),
      'import.meta.env.VITE_WS_URL': JSON.stringify(
        process.env.VITE_WS_URL || 'http://localhost:3008'
      ),
    },
    // ...
  },
});
```

3. 生产构建命令:
```bash
VITE_API_URL=https://linkchat-api.matrix-ai.com.cn \
VITE_WS_URL=https://linkchat-api.matrix-ai.com.cn \
pnpm --filter @linkingchat/desktop build
```

4. 全局替换 39 处 `localhost:3008` → 引用 `config.ts` 的常量

5. **Main process 硬编码** (4 处): Main 进程不支持 Vite env，使用 `app.isPackaged` 判断:
```typescript
const API_BASE = app.isPackaged
  ? 'https://linkchat-api.matrix-ai.com.cn'
  : 'http://localhost:3008';
```

### Step 8: 创建 OpenClaw sidecar 构建脚本

`scripts/prepare-openclaw-sidecar.sh` + `scripts/prepare-openclaw-sidecar.ps1`:
- 为每个平台 (win-x64, mac-x64, mac-arm64) 下载 Node.js 22 LTS
- `npm install openclaw@2026.4.2` 到 sidecar 目录
- 验证可执行
- 输出目录结构: `sidecar/{platform}/node.exe` + `node_modules/openclaw/`

### Step 9: 更新 `apps/desktop/electron-builder.yaml`

- 添加 `extraResources` 引用 sidecar
- 配置 NSIS (Windows) 和 DMG (macOS) 参数
- 添加 `afterSign` 脚本 (macOS notarize, 可后续)

### Step 10: 打包命令

```bash
# Windows (在 Windows 上执行)
cd apps/desktop
VITE_API_URL=https://linkchat-api.matrix-ai.com.cn \
VITE_WS_URL=https://linkchat-api.matrix-ai.com.cn \
pnpm build
npx electron-builder --win

# macOS (在 macOS 上执行)
cd apps/desktop
VITE_API_URL=https://linkchat-api.matrix-ai.com.cn \
VITE_WS_URL=https://linkchat-api.matrix-ai.com.cn \
pnpm build
npx electron-builder --mac
```

---

## 五、宿主机 Nginx + SSL 部署步骤

```bash
# 1. 安装 Nginx + certbot
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx

# 2. 创建 certbot 验证目录
sudo mkdir -p /var/www/certbot
sudo chown www-data:www-data /var/www/certbot

# 3. 复制 Nginx 配置
sudo cp nginx/conf.d/default.conf /etc/nginx/conf.d/linkchat.conf
sudo cp nginx/nginx.conf /etc/nginx/nginx.conf

# 4. 先用 HTTP-only 配置启动 Nginx (注释掉 SSL 相关块)
sudo nginx -t && sudo systemctl reload nginx

# 5. 申请证书
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d linkchat-api.matrix-ai.com.cn \
  -d linkchat-minio.matrix-ai.com.cn \
  --email your-email@example.com \
  --agree-tos --non-interactive

# 6. 取消注释 SSL 块，reload
sudo nginx -t && sudo systemctl reload nginx

# 7. 验证自动续签
sudo certbot renew --dry-run
```

---

## 六、生产优化 (4G 内存)

| 服务 | 内存限制 | 说明 |
|------|---------|------|
| PostgreSQL | ~512MB | `shared_buffers=128MB` |
| Redis | 256MB | `--maxmemory 256mb` (已配置) |
| MinIO | ~256MB | 轻量存储 |
| NestJS Server | ~512MB | Node.js 默认 |
| Nginx (host) | ~32MB | 静态代理 |
| **总计** | ~1.6GB | 留 ~2.4GB 给 OS + buffer |

### Swap 配置
建议服务器启用 2GB swap 作为安全余量:
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 数据库备份 cron
```bash
# 每天凌晨 3 点备份
0 3 * * * docker exec linkchat-postgres pg_dump -U linkingchat linkingchat | gzip > /backups/linkingchat-$(date +\%Y\%m\%d).sql.gz
# 保留最近 7 天
0 4 * * * find /backups -name "linkingchat-*.sql.gz" -mtime +7 -delete
```

### 防火墙
```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

---

## 七、Review 修正清单 (15 项)

| # | 问题 | 严重度 | 状态 |
|---|------|--------|------|
| 1 | JWT 环境变量名错误 (`JWT_PRIVATE_KEY` → `AUTH_JWT_PRIVATE_KEY`) | 🔴 Critical | 修正 |
| 2 | Docker healthcheck 路径 404 (`/health` → `/api/v1/health`) | 🔴 Critical | 修正 |
| 3 | `CORS_ORIGINS` 缺失 → 生产环境 CORS 失败 | 🔴 Critical | 修正 |
| 4 | 39 处 renderer `localhost:3008` 硬编码 | 🔴 Critical | 方案确定 |
| 5 | Swagger 生产环境暴露 API 结构 | 🟡 Medium | 修正 |
| 6 | Nginx upstream 用 Docker 内部 DNS (`server:3008`) | 🟡 Medium | 改为宿主机 127.0.0.1 |
| 7 | Auth 限流 `5r/m` 过严 (正常登录被限) | 🟡 Medium | 调整为 `10r/m` |
| 8 | Dockerfile 缺少 `NODE_ENV=production` | 🟡 Medium | 修正 |
| 9 | Dockerfile migration 失败静默退出 | 🟡 Medium | 显式错误退出 |
| 10 | Dockerfile `apps/server/node_modules` 可能为空 | 🟡 Medium | 只 copy root node_modules |
| 11 | Redis 缺少 healthcheck | 🟢 Low | 添加 |
| 12 | 缺少日志轮转 (json-file 无限增长) | 🟢 Low | 添加 max-size/max-file |
| 13 | 缺少 MinIO 服务 | 🔴 Critical | 添加 |
| 14 | certbot ACME volume 未挂载 | 🟡 Medium | Nginx 改宿主机解决 |
| 15 | 缺少 `.env.production.example` 模板 | 🟢 Low | 创建 |

---

## 八、文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `docker-compose.prod.yaml` | 重写 | 移除 Nginx 容器, 添加 MinIO, 修正 JWT/CORS/healthcheck/日志 |
| `nginx/conf.d/default.conf` | 重写 | 新域名 + MinIO block + 修正 health 路径 |
| `nginx/nginx.conf` | 修改 | auth 限流 5r/m → 10r/m |
| `.env.production.example` | 新建 | 生产环境变量模板 |
| `apps/server/Dockerfile` | 修复 | NODE_ENV + node_modules 路径 + migration 错误处理 |
| `apps/server/src/main.ts` | 修改 | Swagger 仅 dev 环境 |
| `scripts/deploy-server.sh` | 新建 | 一键部署脚本 |
| `scripts/prepare-openclaw-sidecar.sh` | 新建 | Desktop OpenClaw sidecar 构建 |
| `scripts/prepare-openclaw-sidecar.ps1` | 新建 | Windows 版 sidecar 构建脚本 |
| `apps/desktop/electron-builder.yaml` | 更新 | extraResources + 构建优化 |
| `apps/desktop/electron.vite.config.ts` | 修改 | Vite env 注入 VITE_API_URL/VITE_WS_URL |
| `apps/desktop/src/renderer/config.ts` | 新建 | 集中管理 API URL 常量 |
| `apps/desktop/src/main/index.ts` | 修改 | 生产 API URL (app.isPackaged 判断) |
| Desktop renderer (15 files) | 批量替换 | `localhost:3008` → config 常量 |

---

## 九、实施顺序

**Phase A: Server 部署 (先做)**
1. 重写 `docker-compose.prod.yaml`
2. 重写 `nginx/conf.d/default.conf` + 修正 `nginx.conf` 限流
3. 创建 `.env.production.example`
4. 修复 `apps/server/Dockerfile`
5. 修复 `apps/server/src/main.ts` (Swagger guard)
6. 创建 `scripts/deploy-server.sh`

**Phase B: Desktop 打包 (后做)**
7. 创建 `src/renderer/config.ts` + 更新 `electron.vite.config.ts`
8. 批量替换 39 处 renderer 硬编码 URL
9. 修正 main process 4 处硬编码 URL
10. 创建 sidecar 构建脚本 (sh + ps1)
11. 更新 `electron-builder.yaml` (extraResources)
12. 打包测试 (Win NSIS + macOS DMG)

---

## 十、部署后验证清单

- [ ] `curl https://linkchat-api.matrix-ai.com.cn/api/v1/health` 返回 200
- [ ] `curl https://linkchat-minio.matrix-ai.com.cn/minio/health/live` 返回 200
- [ ] SSL 证书有效 (Let's Encrypt)
- [ ] WebSocket 连接成功 (WSS)
- [ ] 注册新用户 + 登录
- [ ] 发消息 (DM + 群聊)
- [ ] @ai 回复 (SupervisorAgent → DeepSeek)
- [ ] Bot DM 流式回复 (Desktop → OpenClaw)
- [ ] Desktop 连接生产服务器 (非 localhost)
- [ ] Desktop OpenClaw 正常工作
- [ ] 文件上传到 MinIO 成功
- [ ] 数据库备份 cron 正常执行
- [ ] Swap 已启用 (2GB)
- [ ] 防火墙仅开放 22/80/443
