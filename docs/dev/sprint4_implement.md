# Sprint 4：社交增强 + 生产化

> **目标**：从 "localhost 可用" 到 "可以给真实用户使用" — 补全富媒体消息、推送通知、消息搜索、i18n，以及生产环境部署、性能优化、安全审计
>
> **前置条件**：[Sprint 3](./sprint3_implement.md) 已完成（AI 三模式、群聊、Bot 间通信、权限系统）
>
> **不包含**：语音/视频通话、Ghost Text 灰体补全、自定义 Bot 创建（v2.0）、微服务拆分
>
> **参考**：[tech-decisions-v2.md](../decisions/tech-decisions-v2.md) §五 | [project-brief.md](../decisions/project-brief.md)

---

## 并行策略

```
线 A — 社交增强                              线 B — 生产化
  Phase 0: 文件/图片/语音消息                   Phase 5: 云端部署 (SSL + WSS)
  Phase 1: 消息撤回增强                         Phase 6: Nginx 反向代理
  Phase 2: 消息搜索                             Phase 7: 水平扩展验证
  Phase 3: 推送通知                             Phase 8: 性能优化
  Phase 4: i18n 国际化                          Phase 9: 安全审计 + 监控

       线 B 可在线 A 进行到 Phase 1 后启动
```

### 人员分配建议

| 开发者 | 负责 | 说明 |
|--------|------|------|
| A（后端） | Phase 0-2 → Phase 5-7 | 先做后端功能，再做基础设施 |
| B（桌面端 / DevOps） | Phase 5-9 | 生产化全流程 |
| C（移动端） | Phase 0、3、4 的 Flutter 部分 | 富媒体 + 推送 + i18n |

---

## 线 A — 社交增强

### Phase 0: 文件/图片/语音消息

**目标**：支持富媒体消息类型 — 图片、文件、语音。使用 S3 兼容存储（开发用 MinIO，生产用 AWS S3 / 阿里 OSS）。

| # | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| 0.1 | 配置 S3 存储服务 | `apps/server/src/storage/storage.service.ts` | 开发环境连 MinIO，生产连 AWS S3 |
| 0.2 | 预签名上传 URL | GET `/api/v1/upload/presign` | 返回预签名 URL + 文件 key |
| 0.3 | 上传完成回调 | POST `/api/v1/upload/confirm` | 验证文件存在 → 创建 Attachment 记录 |
| 0.4 | 图片消息 | MessageType.IMAGE | 缩略图生成（sharp 库，宽度限制 300px） |
| 0.5 | 文件消息 | MessageType.FILE | 显示文件名 + 大小 + 下载链接 |
| 0.6 | 语音消息 | MessageType.VOICE | 录制 + 播放 + 时长显示 |
| 0.7 | 头像上传 | PATCH `/api/v1/users/avatar` | sharp 裁剪为 256x256 |
| 0.8 | 群组头像上传 | PATCH `/api/v1/groups/:id/icon` | 同上 |
| 0.9 | 文件大小限制 | 配置 MAX_FILE_SIZE | 图片 10MB，文件 50MB，语音 5MB |
| 0.10 | Flutter 图片/文件选择器 | image_picker + file_picker 插件 | 选择 → 上传 → 发送消息 |
| 0.11 | Flutter 语音录制 | record 插件 | 按住录制 → 松开发送 |
| 0.12 | Flutter 图片预览 | 点击图片全屏查看 + 缩放 | photo_view 插件 |
| 0.13 | Desktop 文件拖拽上传 | Electron drag & drop | 拖拽文件到聊天框 → 上传 |
| 0.14 | Desktop 语音录制 | Web Audio API | 录制 + 播放 |

**上传流程**：

```
客户端                         Cloud Brain                    MinIO / S3
  │                               │                              │
  ├── GET /upload/presign ────────>│                              │
  │   { filename, mimeType }      │                              │
  │                               ├── 生成预签名 URL ──────────────>│
  │<── { uploadUrl, fileKey } ────│                              │
  │                               │                              │
  ├── PUT uploadUrl ──────────────────────────────────────────────>│ (直传 S3)
  │                               │                              │
  ├── POST /upload/confirm ──────>│                              │
  │   { fileKey, messageData }    │                              │
  │                               ├── 验证文件存在                  │
  │                               ├── 生成缩略图 (图片)             │
  │                               ├── INSERT attachment            │
  │                               ├── INSERT message               │
  │                               ├── WS: message:new ───────────>│
  │<── 201 { message } ──────────│                              │
```

**关键文件**：

```
apps/server/src/storage/
  ├── storage.module.ts
  ├── storage.service.ts        # S3 客户端 (aws-sdk v3)
  ├── storage.controller.ts     # presign + confirm
  └── processors/
      └── image.processor.ts    # sharp 缩略图 + 头像裁剪

packages/shared/src/constants/
  └── limits.ts                 # MAX_IMAGE_SIZE, MAX_FILE_SIZE, MAX_VOICE_SIZE
```

**Attachment 表结构**（已在 Sprint 2 Schema 中定义）：

```prisma
model Attachment {
  id        String  @id @default(cuid())
  messageId String
  url       String          // S3 URL
  filename  String
  mimeType  String
  size      Int?            // bytes
  width     Int?            // 图片宽度
  height    Int?            // 图片高度
  duration  Int?            // 语音时长 (秒)
  thumbnailUrl String?      // 缩略图 URL

  message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
  @@map("attachments")
}
```

**验收标准**：
- 图片消息：选择图片 → 上传 → 聊天中显示缩略图 → 点击查看大图
- 文件消息：选择文件 → 上传 → 聊天中显示文件卡片 → 点击下载
- 语音消息：按住录制 → 松开发送 → 对方可播放 + 显示时长
- 头像上传后正确裁剪为 256x256
- 超过大小限制的文件被拒绝（返回 413）

---

### Phase 1: 消息撤回增强

**目标**：在 Sprint 2 的软删除基础上，增加时间限制和管理员权限。

| # | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| 1.1 | 撤回时间限制 | 普通用户 2 分钟内可撤回 | 超时返回 403 |
| 1.2 | 管理员撤回 | 群管理员可撤回任何人的消息 | 需要 DELETE_MESSAGES 权限 |
| 1.3 | 撤回 UI 反馈 | 客户端显示 "XX 撤回了一条消息" | 占位消息 + 灰色文字 |
| 1.4 | 撤回附件清理 | 撤回消息时删除 S3 文件 | 异步清理，不阻塞撤回操作 |

**验收标准**：
- 2 分钟内撤回成功，对方看到 "[已撤回]" 占位
- 超过 2 分钟撤回失败（403）
- 管理员可撤回任何消息（无时间限制）
- S3 上的附件文件在撤回后异步删除

---

### Phase 2: 消息搜索

**目标**：基于 PostgreSQL 全文搜索的消息检索。

| # | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| 2.1 | PostgreSQL 全文搜索配置 | tsvector 列 + GIN 索引 | migration 添加搜索字段 |
| 2.2 | 中文分词支持 | zhparser 或 pg_jieba 扩展 | 中文搜索能正确分词 |
| 2.3 | GET `/api/v1/messages/search` | 搜索 API | 支持关键词 + converseId 过滤 + 分页 |
| 2.4 | 搜索结果高亮 | ts_headline 函数 | 关键词在结果中高亮显示 |
| 2.5 | 搜索 UI — Flutter | 搜索页面 | 输入关键词 → 结果列表 → 点击跳转到消息位置 |
| 2.6 | 搜索 UI — Desktop | 同上 | Ctrl+F 快捷键打开搜索 |

**全文搜索实现**：

```sql
-- Migration: 添加 tsvector 列和 GIN 索引
ALTER TABLE messages ADD COLUMN search_vector tsvector;
CREATE INDEX idx_messages_search ON messages USING GIN(search_vector);

-- 触发器: 消息插入/更新时自动更新 search_vector
CREATE FUNCTION messages_search_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', COALESCE(NEW.content, ''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_search_update
  BEFORE INSERT OR UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION messages_search_trigger();
```

```typescript
// messages.service.ts
async search(userId: string, query: string, converseId?: string, limit = 20, offset = 0) {
  return this.prisma.$queryRaw`
    SELECT m.*, ts_headline('simple', m.content, plainto_tsquery('simple', ${query})) as highlight
    FROM messages m
    JOIN converse_members cm ON cm."converseId" = m."converseId" AND cm."userId" = ${userId}
    WHERE m.search_vector @@ plainto_tsquery('simple', ${query})
      AND m."deletedAt" IS NULL
      ${converseId ? Prisma.sql`AND m."converseId" = ${converseId}` : Prisma.empty}
    ORDER BY ts_rank(m.search_vector, plainto_tsquery('simple', ${query})) DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}
```

**验收标准**：
- 搜索中文关键词能正确返回结果
- 搜索结果中关键词高亮
- 点击搜索结果可跳转到消息在聊天中的位置
- 仅搜索用户有权限访问的会话

---

### Phase 3: 推送通知

**目标**：FCM（Android）+ APNs（iOS）推送，确保用户不在线时也能收到重要消息。

| # | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| 3.1 | 推送服务 | `apps/server/src/notifications/push.service.ts` | 统一推送接口 |
| 3.2 | FCM 集成 | firebase-admin SDK | Android 推送 |
| 3.3 | APNs 集成 | apns2 或 node-apn | iOS 推送 |
| 3.4 | 设备 Token 注册 | POST `/api/v1/notifications/register` | 存储 FCM/APNs token |
| 3.5 | 推送触发逻辑 | 用户离线 + 收到消息 → 推送 | 在线用户不推送（已有 WS） |
| 3.6 | 推送内容格式 | 标题: 发送者名称，内容: 消息预览 | 图片消息显示 "[图片]"，语音显示 "[语音]" |
| 3.7 | 推送静默模式 | 用户可对特定会话静音 | 静音会话不推送 |
| 3.8 | 推送点击跳转 | 点击通知 → 打开对应会话 | Flutter deep link |
| 3.9 | Flutter 推送集成 | firebase_messaging + flutter_local_notifications | 前台 + 后台 + 关闭状态 |
| 3.10 | 推送频率限制 | 同一会话 1 分钟内最多 1 条推送 | 合并多条消息 "XX 发送了 N 条消息" |

**推送决策逻辑**：

```typescript
// notifications/push.service.ts
async shouldPush(userId: string, converseId: string): Promise<boolean> {
  // 1. 用户是否在线（PresenceService）
  if (await this.presenceService.isOnline(userId)) return false;

  // 2. 用户是否在该会话房间中（即正在看这个聊天）
  if (await this.isInConverseRoom(userId, converseId)) return false;

  // 3. 该会话是否被静音
  if (await this.isMuted(userId, converseId)) return false;

  // 4. 频率限制（1 分钟内已推送过同一会话）
  if (await this.isRateLimited(userId, converseId)) return false;

  return true;
}
```

**关键文件**：

```
apps/server/src/notifications/
  ├── notifications.module.ts
  ├── push.service.ts            # 统一推送接口
  ├── providers/
  │   ├── fcm.provider.ts        # Firebase Cloud Messaging
  │   └── apns.provider.ts       # Apple Push Notification
  └── dto/
      └── register-device.dto.ts  # { token, platform, deviceId }
```

**验收标准**：
- App 关闭时收到消息 → 系统推送通知
- 点击通知 → 打开 App 并跳转到对应会话
- 在线用户不会收到重复推送
- 静音会话不推送
- 连续消息合并为 "XX 发送了 N 条消息"

---

### Phase 4: i18n 国际化

**目标**：支持中文和英文双语，所有用户可见的文本均可切换语言。

| # | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| 4.1 | 服务端 i18n | nestjs-i18n 或自建 | API 错误信息支持中英文 |
| 4.2 | Flutter i18n | flutter_localizations + intl | 所有 UI 文本多语言 |
| 4.3 | Desktop i18n | i18next + react-i18next | 所有 UI 文本多语言 |
| 4.4 | 中文语言包 | zh_CN.json / zh_CN.arb | 覆盖所有页面 |
| 4.5 | 英文语言包 | en_US.json / en_US.arb | 覆盖所有页面 |
| 4.6 | 语言切换 UI | 设置页面 | 选择语言 → 立即生效（无需重启） |
| 4.7 | Bot 消息多语言 | 欢迎消息、通知卡片 | 根据用户语言偏好返回 |
| 4.8 | 系统消息多语言 | "XX 加入了群组" 等 | 根据接收方语言显示 |

**i18n 目录结构**：

```
# Flutter
apps/mobile/lib/l10n/
  ├── app_zh.arb          # 中文
  └── app_en.arb          # 英文

# Desktop (React)
apps/desktop/src/renderer/i18n/
  ├── zh_CN.json
  └── en_US.json

# Server
apps/server/src/i18n/
  ├── zh_CN.json          # API 错误信息
  └── en_US.json
```

**验收标准**：
- 切换语言后所有 UI 文本立即更新
- API 错误信息跟随请求头 Accept-Language
- Bot 欢迎消息根据用户语言偏好发送
- 没有硬编码的中文字符串残留

---

## 线 B — 生产化

### Phase 5: 云端部署

**目标**：从 localhost 迁移到云端服务器，配置 SSL/TLS 和 WSS。

| # | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| 5.1 | 选择云服务商 | 阿里云 / AWS / DigitalOcean | 至少 2C4G 实例 |
| 5.2 | Docker 化部署 | docker-compose.prod.yaml | 一键部署所有服务 |
| 5.3 | SSL 证书 | Let's Encrypt + certbot | HTTPS + WSS |
| 5.4 | 域名配置 | api.linkingchat.com | A 记录指向服务器 |
| 5.5 | 环境变量管理 | .env.production | 敏感信息不入仓库 |
| 5.6 | 数据库备份 | pg_dump 定时备份 | cron 每日凌晨备份 |
| 5.7 | Redis 持久化 | RDB + AOF | 防止重启丢失 session |
| 5.8 | S3 生产配置 | AWS S3 / 阿里 OSS | 替换 MinIO |
| 5.9 | 健康检查 | GET `/health` | Docker HEALTHCHECK + 外部监控 |

**docker-compose.prod.yaml 核心**：

```yaml
services:
  server:
    image: linkingchat/server:latest
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://...
      - REDIS_URL=redis://...
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3008/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  postgres:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_PASSWORD=${DB_PASSWORD}

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redisdata:/data
```

**验收标准**：
- `https://api.linkingchat.com/health` 返回 200
- `wss://api.linkingchat.com/chat` WebSocket 连接成功
- 移动端和桌面端可以连接到云端服务
- 数据库备份正常执行

---

### Phase 6: Nginx 反向代理

**目标**：Nginx 作为 WebSocket 反向代理，处理 SSL 终止和负载均衡。

| # | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| 6.1 | Nginx 配置 | nginx.conf | HTTPS + WSS 代理 |
| 6.2 | WebSocket 升级 | proxy_set_header Upgrade | WS 连接稳定 |
| 6.3 | 超时配置 | proxy_read_timeout 120s | > pingInterval + pingTimeout (85s) |
| 6.4 | 请求限流 | limit_req_zone | 防止 API 滥用 |
| 6.5 | 静态文件代理 | S3 CDN 或 Nginx 直接服务 | 头像 / 上传文件 |
| 6.6 | CORS 配置 | 允许移动端和桌面端域名 | 跨域请求正常 |
| 6.7 | 访问日志 | access.log + error.log | 日志轮转 |

**Nginx 关键配置**（参考 [websocket-protocol.md](../dev-plan/websocket-protocol.md) §9.3）：

```nginx
upstream backend {
    server server:3008;
}

server {
    listen 443 ssl http2;
    server_name api.linkingchat.com;

    ssl_certificate /etc/letsencrypt/live/api.linkingchat.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.linkingchat.com/privkey.pem;

    # REST API
    location /api/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        limit_req zone=api burst=20 nodelay;
    }

    # WebSocket
    location /socket.io/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

**验收标准**：
- HTTPS 正常终止，后端收到 HTTP
- WebSocket 连接稳定，不会被 Nginx 超时断开
- 限流生效：单 IP 超频返回 429

---

### Phase 7: 水平扩展验证

**目标**：验证多实例部署下 WebSocket 消息同步正确性（Redis 适配器）。

| # | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| 7.1 | 多实例部署 | docker-compose scale server=2 | 2 个 NestJS 实例 |
| 7.2 | Nginx 负载均衡 | upstream 配置 | ip_hash 或 least_conn |
| 7.3 | Redis 适配器验证 | Socket.IO Redis adapter | 跨实例消息同步 |
| 7.4 | 会话亲和性测试 | WebSocket 连接稳定 | 不因负载均衡断开 |
| 7.5 | 状态同步验证 | Presence 跨实例一致 | 实例 A 的用户状态 → 实例 B 可查询 |
| 7.6 | 压力测试 | Artillery / k6 | 1000 并发 WebSocket + 500 并发 REST |

**Redis 适配器跨实例消息流**：

```
用户 A (连接到实例 1)  发消息
    → 实例 1: INSERT message + PUBLISH to Redis
    → Redis Pub/Sub 广播
    → 实例 2: 接收 PUBLISH → 推送到实例 2 上的所有在该房间的客户端
用户 B (连接到实例 2)  收到消息
```

**验收标准**：
- 用户 A 连实例 1，用户 B 连实例 2，消息互通无延迟
- 设备控制命令跨实例正确路由
- 1000 并发 WebSocket 连接稳定
- 在线状态跨实例一致

---

### Phase 8: 性能优化

**目标**：达到项目性能目标 — 消息延迟 <2s，@ai 建议 <2s，远程执行 <3s。

| # | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| 8.1 | 消息延迟监控 | 端到端延迟打点 | 从发送到接收 <2 秒 |
| 8.2 | @ai 延迟优化 | LLM 调用链路优化 | 从 @ai 到建议展示 <2 秒 |
| 8.3 | 远程执行延迟 | 命令全链路监控 | 从手机发送到桌面执行完成 <3 秒 |
| 8.4 | 数据库查询优化 | 慢查询日志分析 + EXPLAIN | 核心查询 <50ms |
| 8.5 | Redis 缓存策略 | 会话列表、好友列表 | 热数据缓存，减少 DB 查询 |
| 8.6 | WebSocket 消息压缩 | perMessageDeflate | 减少传输量 |
| 8.7 | 图片加载优化 | 缩略图 + 懒加载 + CDN | 图片加载 <500ms |
| 8.8 | Flutter 列表优化 | ListView.builder + 虚拟化 | 1000 条消息滚动流畅 |

**延迟打点实现**：

```typescript
// 消息端到端延迟
interface MessageLatencyMetric {
  messageId: string;
  timestamps: {
    clientSend: number;       // 客户端发送时间
    serverReceive: number;    // 服务端收到时间
    dbWrite: number;          // DB 写入完成时间
    wsBroadcast: number;      // WS 广播时间
    clientReceive: number;    // 对方客户端收到时间
  };
  totalLatencyMs: number;     // 端到端延迟
}
```

**性能目标对照**：

| 指标 | 目标 | 监控方式 |
|------|------|---------|
| 消息镜像延迟 | <2 秒 | WS 事件时间戳差值 |
| @ai 建议延迟 | <2 秒 | 从 @ai 消息到 whisper:suggestions |
| 远程命令执行 | <3 秒 | 从 command:send 到 result:delivered |
| API P99 响应时间 | <200ms | Nginx access log 分析 |
| 数据库查询 P95 | <50ms | Prisma query event |

**验收标准**：
- 消息发送到对方收到 <2 秒（P95）
- @ai 触发到建议展示 <2 秒（P95）
- 远程命令全链路 <3 秒（P95）
- 1000 条消息的聊天页面滚动 60fps

---

### Phase 9: 安全审计 + 监控

**目标**：全面安全检查 + 运行时监控，确保生产环境安全可靠。

| # | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| 9.1 | 命令黑名单审查 | isDangerousCommand 扩展 | 覆盖 Windows + macOS + Linux 危险命令 |
| 9.2 | JWT 过期策略 | access token 15min，refresh token 7d | 过期 token 无法使用 |
| 9.3 | API 速率限制 | @nestjs/throttler | 全局 + 按路由限流 |
| 9.4 | 输入验证 | Zod + class-validator | 所有 API 输入验证 |
| 9.5 | SQL 注入防护 | Prisma 参数化查询 | 无原始 SQL 拼接 |
| 9.6 | XSS 防护 | 消息内容 HTML 转义 | DOMPurify (客户端) |
| 9.7 | CORS 加固 | 仅允许已知域名 | 非白名单域名返回 403 |
| 9.8 | 敏感信息脱敏 | 日志中不输出密码、token | 检查所有日志输出 |
| 9.9 | 运行时监控 | Prometheus metrics | 连接数、消息量、错误率 |
| 9.10 | 日志聚合 | Winston + 结构化日志 | JSON 格式，可接入 ELK |
| 9.11 | 告警 | 错误率 > 1% 或延迟 > 5s | 邮件 / Webhook 通知 |
| 9.12 | 定期安全扫描 | npm audit + Snyk | CI 中自动运行 |

**速率限制策略**：

```typescript
// 全局限流
@Module({
  imports: [
    ThrottlerModule.forRoot({
      ttl: 60,    // 60 秒窗口
      limit: 100, // 100 次请求
    }),
  ],
})

// 按路由限流
@Throttle({ default: { ttl: 60, limit: 5 } })  // 登录尝试: 5次/分钟
@Post('auth/login')
async login() { ... }

@Throttle({ default: { ttl: 60, limit: 30 } }) // 发消息: 30条/分钟
@Post('messages')
async createMessage() { ... }

@Throttle({ default: { ttl: 60, limit: 10 } }) // AI 建议: 10次/分钟
@Post('ai/whisper')
async requestWhisper() { ... }
```

**黑名单扩展**（跨平台）：

```typescript
const DANGEROUS_COMMANDS = [
  // Unix/Linux/macOS
  /^rm\s+(-rf?|--recursive)\s+\//,
  /^rm\s+-rf?\s+~/,
  /^mkfs\./,
  /^dd\s+if=/,
  /shutdown|reboot|halt|poweroff/i,
  /^chmod\s+(-R\s+)?777\s+\//,

  // Windows
  /^format\s/i,
  /^del\s+\/s\s+\/q\s+[A-Z]:\\/i,
  /^rd\s+\/s\s+\/q\s+[A-Z]:\\/i,
  /^rmdir\s+\/s\s+\/q/i,
  /^reg\s+delete/i,
  /^bcdedit/i,
  /^diskpart/i,

  // 通用
  /:\(\)\{.*\|.*&\s*\}\s*;/,         // Fork bomb
  />\s*\/dev\/(sda|hda|nvme)/,        // 写入磁盘设备
  /\|\s*base64\s+-d\s*\|.*sh/,        // 编码执行
];
```

**Prometheus 指标**：

```typescript
// 关键监控指标
const metrics = {
  ws_connections_total:     Counter,   // WebSocket 连接总数
  ws_connections_active:    Gauge,     // 当前活跃连接
  messages_sent_total:      Counter,   // 消息发送总数
  commands_executed_total:  Counter,   // 命令执行总数
  llm_requests_total:       Counter,   // LLM 调用次数
  llm_latency_seconds:      Histogram, // LLM 响应延迟
  message_latency_seconds:  Histogram, // 消息端到端延迟
  api_request_duration:     Histogram, // API 请求延迟
  error_rate:               Gauge,     // 错误率
};
```

**验收标准**：
- 所有 API 限流生效，超频返回 429
- JWT 过期后无法访问任何 API
- 消息内容不包含可执行的 HTML/JS
- Prometheus 指标端点 `/metrics` 可访问
- 错误率 > 1% 时触发告警
- npm audit 无 high/critical 漏洞

---

## 交付物总览

| 交付物 | 描述 | 对应 Phase |
|--------|------|-----------|
| 富媒体消息 | 图片 + 文件 + 语音，S3 直传 | Phase 0 |
| 消息撤回增强 | 2 分钟限制 + 管理员权限 + 附件清理 | Phase 1 |
| 消息搜索 | PostgreSQL 全文搜索 + 中文分词 | Phase 2 |
| 推送通知 | FCM + APNs + 静音 + 频率限制 | Phase 3 |
| i18n | 中英双语全覆盖 | Phase 4 |
| 云端部署 | SSL + WSS + Docker + 备份 | Phase 5 |
| Nginx 代理 | WS 升级 + 限流 + CORS | Phase 6 |
| 水平扩展 | 多实例 + Redis adapter + 压力测试 | Phase 7 |
| 性能达标 | 消息 <2s，@ai <2s，命令 <3s | Phase 8 |
| 安全加固 | 黑名单 + JWT + 限流 + XSS + 监控 | Phase 9 |

## 新增 REST API 端点

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/v1/upload/presign` | 获取预签名上传 URL |
| POST | `/api/v1/upload/confirm` | 确认上传完成 |
| PATCH | `/api/v1/users/avatar` | 上传头像 |
| PATCH | `/api/v1/groups/:id/icon` | 上传群头像 |
| GET | `/api/v1/messages/search` | 消息搜索 |
| POST | `/api/v1/notifications/register` | 注册推送 token |
| DELETE | `/api/v1/notifications/unregister` | 注销推送 token |
| GET | `/health` | 健康检查 |
| GET | `/metrics` | Prometheus 指标 |

## 里程碑检查点

| 检查点 | 验收内容 | 对应 Phase |
|--------|---------|-----------|
| **M1** | 富媒体可用：图片 + 文件 + 语音消息正常收发 | Phase 0 |
| **M2** | 搜索可用：中文关键词搜索 + 结果高亮 + 跳转 | Phase 2 |
| **M3** | 推送可用：离线收到推送 → 点击跳转到聊天 | Phase 3 |
| **M4** | 双语可用：中英文切换所有界面正确 | Phase 4 |
| **M5** | 云端可访问：https://api.linkingchat.com 可用 | Phase 5-6 |
| **M6** | 扩展验证：2 实例 + 1000 并发 + 消息互通 | Phase 7 |
| **M7** | 性能达标：三项延迟指标全部达标 | Phase 8 |
| **M8** | 安全通过：限流 + 审计 + 监控 + 告警全部就绪 | Phase 9 |

---

## Sprint 4 完成后的状态

Sprint 4 完成后，LinkingChat 达到 **MVP 可发布状态**：

| 维度 | 状态 |
|------|------|
| 社交功能 | 好友 + 1对1聊天 + 群聊 + 富媒体 + 推送 + 搜索 + 已读 |
| AI 功能 | @ai Whisper + Draft & Verify + Predictive Actions |
| 远程控制 | OpenClaw 集成 + 安全模型 + Bot 框架 |
| 基础设施 | 云端部署 + SSL + 水平扩展 + 监控 + 告警 |
| 国际化 | 中英双语 |
| 安全 | JWT + 限流 + 黑名单 + XSS 防护 |

### 不在 MVP 范围内（v2.0+）

| 功能 | 原因 |
|------|------|
| 语音/视频通话 | 明确排除出 MVP (Q4) |
| Ghost Text 灰体补全 | 需要本地小模型，技术风险高 |
| 自定义 Bot 创建 | v2.0 开放 |
| 端到端加密 | 复杂度高，MVP 优先可用性 |
| 微服务拆分 | 单体优先，瓶颈出现后再拆 |
| 桌面端跨设备控制 | MVP: 控制自己的桌面 |
