# Sprint 4 — Phase 5: 云端部署（腾讯云 CVM）

> **状态**：✅ 配置完成（Dockerfile + docker-compose.prod + Nginx + 备份脚本 + env模板）
>
> **优先级**：P3（第 3 个工作包）
>
> **预估工作量**：2-3 天
>
> **前置条件**：Phase 0 + Phase 1 完成（功能基本可用后再部署）
>
> **参考**：[sprint4_implement.md](../sprint4_implement.md) Phase 5

---

## 目标

从 localhost 迁移到腾讯云 CVM，配置 Docker 化部署 + SSL/TLS（HTTPS + WSS），使移动端和桌面端可通过互联网访问。

---

## 任务清单

| # | 任务 | 产出 | 依赖 | 状态 |
|---|------|------|------|------|
| 5.1 | Dockerfile 编写 | `apps/server/Dockerfile` | — | 🔜 |
| 5.2 | docker-compose.prod.yaml | 生产环境编排 | 5.1 | 🔜 |
| 5.3 | SSL 证书配置 | Let's Encrypt + certbot | 域名已就绪 | 🔜 |
| 5.4 | 域名解析 | A 记录指向 CVM IP | — | 🔜 |
| 5.5 | 环境变量管理 | `.env.production` 模板 | — | 🔜 |
| 5.6 | 数据库备份 | pg_dump 定时脚本 | 5.2 | 🔜 |
| 5.7 | Redis 持久化 | RDB + AOF 配置 | 5.2 | 🔜 |
| 5.8 | S3 生产配置 | 腾讯云 COS 替换 MinIO | Phase 0 | 🔜 |
| 5.9 | 健康检查端点 | GET `/health` | — | 🔜 |

---

## 部署架构

```
腾讯云 CVM (2C4G+)
┌─────────────────────────────────────────────┐
│  Docker Compose                              │
│  ┌─────────────┐  ┌──────────┐  ┌─────────┐ │
│  │ NestJS:3008 │  │ PG:5432  │  │ Redis   │ │
│  │ (server)    │  │          │  │ :6379   │ │
│  └──────┬──────┘  └──────────┘  └─────────┘ │
│         │                                    │
│  ┌──────┴──────┐                             │
│  │ Nginx:443   │ ← SSL 终止                  │
│  │ (反向代理)  │                             │
│  └─────────────┘                             │
└─────────────────────────────────────────────┘
         ↑
   HTTPS / WSS
         ↑
  Flutter App / Desktop App
```

---

## 实现细节

### Task 5.1: Dockerfile

```dockerfile
# apps/server/Dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY packages/ packages/
RUN corepack enable && pnpm install --frozen-lockfile
COPY apps/server/ apps/server/
# Prisma generate 必须在 build 之前执行（生成 @prisma/client 类型）
RUN cd apps/server && npx prisma generate
RUN pnpm --filter @linkingchat/server build
RUN pnpm --filter @linkingchat/server deploy --prod /app/deploy

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/deploy .
# 复制 Prisma schema + generated client（含 query engine）
COPY --from=builder /app/apps/server/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
EXPOSE 3008
# 启动前自动运行 migration，确保数据库 schema 最新
CMD ["sh", "-c", "npx prisma migrate deploy --schema=./prisma/schema.prisma && node dist/main.js"]
```

> **注意**：`pnpm deploy --prod` 可能不包含 Prisma query engine binary（`.prisma/client/`），
> 因此需要额外 `COPY --from=builder` 把 generated client 复制到生产镜像。
> 部署后请验证 `docker exec <container> node -e "const { PrismaClient } = require('@prisma/client'); new PrismaClient()"` 无报错。

### Task 5.2: docker-compose.prod.yaml

```yaml
services:
  server:
    build:
      context: .
      dockerfile: apps/server/Dockerfile
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://linkingchat:${DB_PASSWORD}@postgres:5432/linkingchat
      - REDIS_URL=redis://redis:6379
      - JWT_PRIVATE_KEY=${JWT_PRIVATE_KEY}
      - JWT_PUBLIC_KEY=${JWT_PUBLIC_KEY}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3008/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

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

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redisdata:/data
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - server
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:
```

### Task 5.5: 环境变量模板

```bash
# .env.production.template（不要提交真实值到 git）
DB_PASSWORD=<strong-random-password>
JWT_PRIVATE_KEY=<base64-encoded-rs256-private-key>
JWT_PUBLIC_KEY=<base64-encoded-rs256-public-key>
DEEPSEEK_API_KEY=<optional>
KIMI_API_KEY=<optional>
COS_SECRET_ID=<tencent-cos-secret-id>
COS_SECRET_KEY=<tencent-cos-secret-key>
COS_BUCKET=<bucket-name>
COS_REGION=<ap-region>
```

### Task 5.6: 数据库备份脚本

```bash
#!/bin/bash
# scripts/backup-db.sh
BACKUP_DIR=/backups
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker exec linkingchat-postgres pg_dump -U linkingchat linkingchat | gzip > "$BACKUP_DIR/db_$TIMESTAMP.sql.gz"
# 保留最近 7 天
find "$BACKUP_DIR" -name "db_*.sql.gz" -mtime +7 -delete
```

```bash
# crontab -e
0 3 * * * /opt/linkingchat/scripts/backup-db.sh
```

### Task 5.9: 健康检查端点

```typescript
// app.controller.ts 新增
@Get('health')
health() {
  return { status: 'ok', timestamp: new Date().toISOString() };
}
```

---

## 新增/修改文件汇总

### 新增文件

```
apps/server/Dockerfile
docker-compose.prod.yaml
.env.production.template
nginx/nginx.conf                    # 配合 Phase 6 一起创建
nginx/conf.d/default.conf
scripts/backup-db.sh
scripts/deploy.sh                   # 一键部署脚本
```

### 修改文件

| 文件 | 变更 |
|------|------|
| `apps/server/src/app.controller.ts` | 新增 `/health` 端点 |
| `.gitignore` | 添加 `.env.production`、`backups/` |
| `apps/server/src/storage/storage.service.ts` | 支持腾讯云 COS 配置（Phase 0 已创建） |

---

## 部署步骤

```bash
# 1. SSH 到 CVM
ssh root@your-cvm-ip

# 2. 安装 Docker + Docker Compose
curl -fsSL https://get.docker.com | bash
apt install docker-compose-plugin

# 3. 克隆代码
git clone https://github.com/your-repo/LinkChat_new.git /opt/linkingchat
cd /opt/linkingchat

# 4. 配置环境变量
cp .env.production.template .env.production
vim .env.production  # 填入真实值

# 5. SSL 证书（域名已解析到此 IP）
apt install certbot
certbot certonly --standalone -d api.yourdomain.com

# 6. 启动（CMD 中自动执行 prisma migrate deploy）
docker compose -f docker-compose.prod.yaml --env-file .env.production up -d

# 7. 验证迁移成功
docker logs linkingchat-server | grep -i "migration"
```

---

## 验收标准

- [ ] `https://api.yourdomain.com/health` 返回 200 `{ status: 'ok' }`
- [ ] `wss://api.yourdomain.com/chat` WebSocket 连接成功
- [ ] Flutter App 修改 baseUrl 后可连接到云端
- [ ] Desktop App 修改 baseUrl 后可连接到云端
- [ ] 数据库备份脚本每日执行
- [ ] Redis 数据在重启后恢复
- [ ] 容器异常退出后自动重启
