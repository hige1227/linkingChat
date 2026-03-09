# Sprint 4 — Phase 9: 安全审计 + 监控

> **状态**：✅ 完成（速率限制 + 命令黑名单 + Prometheus指标 + Winston结构化日志 + CI npm audit）
>
> **优先级**：P5（第 5 个工作包）
>
> **预估工作量**：3-4 天
>
> **前置条件**：Phase 5 + 6（云端部署 + Nginx）完成 — 上线前必须完成安全加固
>
> **参考**：[sprint4_implement.md](../sprint4_implement.md) Phase 9

---

## 目标

全面安全检查 + 运行时监控 + 告警，确保生产环境安全可靠。Sprint 3 安全审计已修复了 14 个 critical/security 问题（见 [`sprint3_lineB_review.md`](../sprint3_lineB_review.md)），本 Phase 在此基础上补充生产级安全策略。

---

## 任务清单

| # | 任务 | 产出 | 依赖 | 状态 |
|---|------|------|------|------|
| 9.1 | 命令黑名单扩展 | isDangerousCommand 跨平台 | — | 🔜 |
| 9.2 | JWT 过期策略 | access 15min / refresh 7d | — | 🔜 |
| 9.3 | API 速率限制 | @nestjs/throttler | Phase 6 | 🔜 |
| 9.4 | 输入验证加固 | Zod / class-validator | — | 🔜 |
| 9.5 | SQL 注入防护 | 审查所有 $queryRaw | — | 🔜 |
| 9.6 | XSS 防护 | 消息内容 HTML 转义 | — | 🔜 |
| 9.7 | CORS 加固 | 仅允许已知域名 | Phase 6 | 🔜 |
| 9.8 | 敏感信息脱敏 | 日志中不输出密码/token | — | 🔜 |
| 9.9 | Prometheus 指标 | `/metrics` 端点 | — | 🔜 |
| 9.10 | 结构化日志 | Winston JSON 格式 | — | 🔜 |
| 9.11 | 告警配置 | 错误率 > 1% / 延迟 > 5s | 9.9 | 🔜 |
| 9.12 | 安全依赖扫描 | npm audit + CI 集成 | — | 🔜 |

---

## 实现细节

### Task 9.1: 命令黑名单（跨平台）

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

### Task 9.3: API 速率限制

```typescript
// app.module.ts
@Module({
  imports: [
    ThrottlerModule.forRoot({
      ttl: 60000,
      limit: 100,
    }),
  ],
})

// 按路由细化
@Throttle({ default: { ttl: 60000, limit: 5 } })   // 登录: 5/min
@Post('auth/login')

@Throttle({ default: { ttl: 60000, limit: 30 } })  // 发消息: 30/min
@Post('messages')

@Throttle({ default: { ttl: 60000, limit: 10 } })  // AI: 10/min
@Post('ai/whisper')
```

### Task 9.9: Prometheus 指标

```typescript
// 关键监控指标
const metrics = {
  ws_connections_total:     Counter,   // WS 连接总数
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

---

## 新增文件

```
apps/server/src/common/guards/throttler.guard.ts     # 自定义 throttler guard
apps/server/src/common/interceptors/logging.interceptor.ts  # 结构化日志
apps/server/src/metrics/
  ├── metrics.module.ts
  ├── metrics.service.ts       # Prometheus 指标注册
  └── metrics.controller.ts    # GET /metrics
apps/server/src/common/filters/sanitize.pipe.ts  # XSS 消毒
```

### 修改文件

| 文件 | 变更 |
|------|------|
| `app.module.ts` | 导入 ThrottlerModule、MetricsModule |
| `chat.gateway.ts` | 添加连接数指标 |
| `messages.service.ts` | 添加消息计数指标 |
| `commands.service.ts` | isDangerousCommand 扩展 |
| `main.ts` | Winston 日志配置 |
| `.github/workflows/ci.yml` | 新增 `npm audit` 步骤 |

---

## 新增 API 端点

| Method | Path | 说明 |
|--------|------|------|
| GET | `/metrics` | Prometheus 指标端点（需限制访问） |

> **安全注意**：`/metrics` 端点不应对公网无限制开放。推荐方案：
> - 在 Nginx 中限制只允许内网 IP 或 Prometheus 服务器 IP 访问
> - 或添加 Bearer Token 认证
>
> ```nginx
> location /metrics {
>     allow 10.0.0.0/8;      # 内网
>     allow 172.16.0.0/12;   # Docker 网络
>     deny all;
>     proxy_pass http://backend;
> }
> ```

---

## 验收标准

- [ ] 所有 API 限流生效，超频返回 429
- [ ] JWT access token 15 分钟过期，refresh token 7 天过期
- [ ] 消息内容不包含可执行的 HTML/JS（XSS 防护）
- [ ] 危险命令被黑名单拦截（Windows + Unix）
- [ ] `/metrics` 端点返回 Prometheus 格式指标
- [ ] 日志为 JSON 结构化格式，不含密码/token
- [ ] 错误率 > 1% 时触发告警
- [ ] `npm audit` 无 high/critical 漏洞
- [ ] `/metrics` 端点不可被公网无认证访问
- [ ] Phase 2 搜索引入的 `$queryRaw` 已纳入 SQL 注入审查（Phase 2 在 P6 完成后回顾）
- [ ] `pnpm build && pnpm test` 通过
