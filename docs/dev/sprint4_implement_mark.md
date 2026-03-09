# Sprint 4 实施记录

> **开始日期**：2026-03-07
>
> **当前状态**：✅ 服务端全部完成（客户端 UI 待实施）
>
> **测试状态**：28 suites, 357 tests, all pass | Build: 4/4 packages pass

---

## 完成进度

| Phase | 状态 | 完成内容 |
|-------|------|---------|
| Phase 0: 富媒体消息 | 🔧 后端完成 | 预签名上传、上传确认、附件消息创建/查询、DTO/WS类型更新、文件大小限制常量、上传测试 |
| Phase 1: 消息撤回增强 | ✅ 后端完成 | 2分钟撤回限制、OWNER/ADMIN管理员权限撤回、S3附件异步清理、recalledBy广播、测试 |
| Phase 2: 消息搜索 | 🔧 后端完成 | PostgreSQL tsvector + GIN索引迁移、搜索API（GET /messages/search）、ILIKE中文fallback、分页+total、测试 |
| Phase 3: 推送通知 | ⏭️ 跳过 | 延后至 v2.0+ |
| Phase 4: i18n | ✅ 服务端完成 | I18nService + zh_CN/en_US 翻译文件 + Accept-Language 检测 + 全局 I18nModule |
| Phase 5: 云端部署 | ✅ 配置完成 | Dockerfile多阶段构建、docker-compose.prod.yaml、.env.production模板、数据库备份脚本 |
| Phase 6: Nginx代理 | ✅ 配置完成 | nginx.conf + SSL + WebSocket升级 + 限流 + /metrics保护 + CORS |
| Phase 7: 水平扩展 | ⏭️ 推迟 | Redis Pub/Sub 已配置（Sprint 2），实际压力测试推迟至部署后 |
| Phase 8: 性能优化 | ✅ 核心完成 | LoggingInterceptor（延迟打点+慢请求告警）、WebSocket perMessageDeflate 压缩 |
| Phase 9: 安全审计 | ✅ 完成 | Throttler限流 + 命令黑名单 + Prometheus指标 + Winston结构化日志 + CI npm audit |

---

## 新增文件

### 生产部署
- `apps/server/Dockerfile` — 多阶段构建，含 Prisma generate 和 migrate deploy
- `docker-compose.prod.yaml` — 生产环境编排（server + postgres + redis + nginx）
- `.env.production.template` — 环境变量模板
- `scripts/backup-db.sh` — 数据库备份脚本（保留7天）
- `nginx/nginx.conf` — Nginx 主配置
- `nginx/conf.d/default.conf` — SSL + WebSocket + 限流配置
- `.github/workflows/ci.yml` — CI 流水线（build + test + security audit）

### 服务端代码
- `packages/shared/src/constants/index.ts` — 文件大小限制、MIME类型、bucket名称常量
- `apps/server/src/upload/dto/presign-upload.dto.ts` — 预签名上传 DTO
- `apps/server/src/upload/dto/confirm-upload.dto.ts` — 上传确认 DTO
- `apps/server/src/messages/dto/search-messages.dto.ts` — 搜索消息 DTO
- `apps/server/prisma/migrations/20260307120000_add_message_search_vector/migration.sql` — 全文搜索迁移

### 监控 & 可观测性
- `apps/server/src/metrics/metrics.service.ts` — Prometheus 指标（HTTP/WS/Chat/AI/Upload）
- `apps/server/src/metrics/metrics.controller.ts` — GET /metrics 端点（SkipThrottle）
- `apps/server/src/metrics/metrics.module.ts` — 全局 MetricsModule
- `apps/server/src/common/interceptors/logging.interceptor.ts` — HTTP 延迟打点 + 慢请求告警

### 国际化
- `apps/server/src/i18n/i18n.service.ts` — 翻译服务（t() + detectLocale()）
- `apps/server/src/i18n/i18n.module.ts` — 全局 I18nModule
- `apps/server/src/i18n/zh_CN.json` — 中文翻译（auth/messages/converses/friends/upload/devices/general）
- `apps/server/src/i18n/en_US.json` — 英文翻译

### 测试
- `apps/server/src/metrics/__tests__/metrics.service.spec.ts` — Prometheus 指标测试（11 tests）
- `apps/server/src/common/interceptors/__tests__/logging.interceptor.spec.ts` — 延迟打点测试（6 tests）
- `apps/server/src/i18n/__tests__/i18n.service.spec.ts` — i18n 翻译测试（13 tests）

---

## 修改文件

### 服务端核心
| 文件 | 变更 |
|------|------|
| `apps/server/src/app.module.ts` | 添加 ThrottlerModule、ThrottlerGuard、MetricsModule、I18nModule、LoggingInterceptor |
| `apps/server/src/main.ts` | Winston 结构化日志（生产JSON/开发彩色）替换默认 NestJS logger |
| `apps/server/src/messages/messages.module.ts` | 添加 UploadModule 导入 |
| `apps/server/src/messages/messages.service.ts` | 注入 UploadService；增强 softDelete（时间限制+管理员+S3清理）；新增 search 方法 |
| `apps/server/src/messages/messages.controller.ts` | 新增 GET /search 端点；消息发送限流 30/min |
| `apps/server/src/auth/auth.controller.ts` | 登录/注册限流 5/min |
| `apps/server/src/upload/upload.service.ts` | 完整重写：presignUpload + confirmUpload + deleteFile + uploadBuffer |
| `apps/server/src/upload/upload.controller.ts` | 新增 presign + confirm 端点；上传限流 20/min |
| `apps/server/src/gateway/device.gateway.ts` | 命令黑名单扩展（Windows: del/rd/reg/bcdedit/diskpart） |
| `apps/server/src/gateway/adapters/redis-io.adapter.ts` | WebSocket perMessageDeflate 压缩（threshold: 1024） |
| `apps/server/src/ai/services/predictive.service.ts` | 命令黑名单同步扩展 |
| `packages/shared/src/index.ts` | 导出 constants |
| `packages/ws-protocol/src/payloads/chat.payloads.ts` | 新增 AttachmentPayload 接口 |
| `apps/server/src/messages/dto/create-message.dto.ts` | 新增 AttachmentInput + VOICE类型 + content可选 |
| `apps/server/src/messages/dto/message-response.dto.ts` | 新增 AttachmentResponse 接口 |
| `apps/server/tsconfig.json` | 添加 resolveJsonModule + esModuleInterop（i18n JSON 导入） |
| `.gitignore` | 添加 .env.production 和 backups/ |

### 测试
| 文件 | 变更 |
|------|------|
| `apps/server/src/upload/__tests__/upload.service.spec.ts` | 完整重写：presignUpload + confirmUpload + deleteFile + uploadBuffer 测试（22 tests） |
| `apps/server/src/messages/messages.service.spec.ts` | 添加 UploadService mock；新增 softDelete 增强测试（时间限制、管理员、S3清理）；新增 search 测试 |

---

## 新增 API 端点

| Method | Path | Rate Limit | 说明 |
|--------|------|-----------|------|
| GET | `/api/v1/upload/presign` | 20/min | 获取预签名上传 URL |
| POST | `/api/v1/upload/confirm` | 20/min | 确认上传完成 |
| GET | `/api/v1/messages/search` | 20/min | 消息全文搜索 |
| GET | `/api/v1/metrics` | 无限流 | Prometheus 指标（Nginx 限制内网访问） |

## 速率限制配置

| 端点 | 限制 |
|------|------|
| 全局默认 | 100/min |
| `POST /auth/register` | 5/min |
| `POST /auth/login` | 5/min |
| `POST /auth/refresh` | 20/min |
| `POST /messages` | 30/min |
| `GET /messages/search` | 20/min |
| `GET,POST /upload/*` | 20/min |

## 新增依赖

| 包名 | 版本 | 用途 |
|------|------|------|
| `@nestjs/throttler` | ^6.5.0 | 全局 + 按路由速率限制 |
| `prom-client` | ^15.x | Prometheus 指标收集 |
| `winston` | ^3.x | 结构化日志 |
| `nest-winston` | ^1.x | NestJS Winston 集成 |

---

## 可观测性指标

### Prometheus Metrics

| 指标名 | 类型 | 标签 | 说明 |
|--------|------|------|------|
| `http_request_duration_seconds` | Histogram | method, route, status_code | HTTP 请求延迟 |
| `http_requests_total` | Counter | method, route, status_code | HTTP 请求总数 |
| `ws_connections_active` | Gauge | namespace | 活跃 WebSocket 连接数 |
| `ws_messages_total` | Counter | event, namespace | WebSocket 消息总数 |
| `messages_sent_total` | Counter | — | 聊天消息发送总数 |
| `messages_recalled_total` | Counter | — | 聊天消息撤回总数 |
| `llm_requests_total` | Counter | provider, model, status | LLM API 请求总数 |
| `llm_latency_seconds` | Histogram | provider, model | LLM API 调用延迟 |
| `uploads_total` | Counter | type, status | 文件上传总数 |

### 结构化日志

- **生产环境**：JSON 格式输出（timestamp + level + context + message + meta）
- **开发环境**：彩色控制台输出（HH:mm:ss 时间戳）
- **慢请求告警**：LoggingInterceptor 自动标记 >1s 的请求为 [SLOW]

---

## 待实施

> **已移至专项文档**：以下待办已整理到独立开发文档中，包含详细任务分解和验收标准。

### Sprint 4.1 补丁迭代 → [`sprint4.1_patch.md`](sprint4.1_patch.md)

**Phase A：断裂修复（7 项）** — 标记为已完成但实际存在断裂的功能
- A.1 Mobile 已读回执修复（`markRead()` 从未被调用）
- A.2 已读回执 UI 双勾 ✓✓（两端未渲染）
- A.3 Socket 断线 Token 刷新（从未计划的架构遗漏）
- A.4 Prometheus 指标接入（6/8 指标永远为 0）
- A.5 i18n 服务端接入（I18nService 零调用）
- A.6 Desktop NotificationCard 渲染接入
- A.7 CORS 生产加固（`|| true` 回退）

**Phase B：富媒体消息客户端 UI**（双端同步 — 图片+文件，语音延后）
**Phase C：消息撤回客户端 UI**（双端同步 — 长按/右键菜单 + "[已撤回]" 占位）
**Phase D：消息搜索客户端 UI**（双端同步 — 搜索面板 + Ctrl+F）
**Phase E：头像上传**（双端）

### Sprint 5 → [`sprint5_plan.md`](sprint5_plan.md)

**Phase 1：邮箱验证**（从未计划的设计遗漏）
**Phase 2：忘记密码/重置密码**（从未计划的设计遗漏）
**Phase 3：语音消息**（从 Sprint 4.1 延后）
**Phase 4：i18n 客户端集成**（Flutter + Desktop 语言包 + 切换 UI）

### 低优先级（基础设施验证）
- Phase 7 水平扩展验证（多实例 + 压力测试）— 推迟至实际部署后
