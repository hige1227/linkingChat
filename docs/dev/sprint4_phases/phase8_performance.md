# Sprint 4 — Phase 8: 性能优化

> **状态**：✅ 核心完成（LoggingInterceptor 延迟打点 + 慢请求告警 + WS perMessageDeflate 压缩）
>
> **优先级**：P8（第 8 个工作包）
>
> **预估工作量**：2-3 天
>
> **前置条件**：Phase 5-6（云端部署）完成，有真实环境数据后优化更有针对性
>
> **参考**：[sprint4_implement.md](../sprint4_implement.md) Phase 8

---

## 目标

达到项目性能指标 — 消息延迟 <2s，@ai 建议 <2s，远程执行 <3s。建立端到端延迟监控体系。

---

## 任务清单

| # | 任务 | 产出 | 依赖 | 状态 |
|---|------|------|------|------|
| 8.1 | 消息延迟监控 | 端到端延迟打点 | — | 🔜 |
| 8.2 | @ai 延迟优化 | LLM 调用链路优化 | — | 🔜 |
| 8.3 | 远程执行延迟 | 命令全链路监控 | — | 🔜 |
| 8.4 | 数据库查询优化 | 慢查询日志 + EXPLAIN | — | 🔜 |
| 8.5 | Redis 缓存策略 | 会话列表、好友列表缓存 | — | 🔜 |
| 8.6 | WebSocket 消息压缩 | perMessageDeflate | — | 🔜 |
| 8.7 | 图片加载优化 | 缩略图 + 懒加载 | Phase 0 | 🔜 |
| 8.8 | Flutter 列表优化 | ListView.builder 虚拟化 | — | 🔜 |

---

## 性能指标

| 指标 | 目标 | 监控方式 |
|------|------|---------|
| 消息镜像延迟 | <2 秒 (P95) | WS 事件时间戳差值 |
| @ai 建议延迟 | <2 秒 (P95) | 从 @ai 消息到 whisper:suggestions |
| 远程命令执行 | <3 秒 (P95) | 从 command:send 到 result:delivered |
| API P99 响应时间 | <200ms | Nginx access log |
| 数据库查询 P95 | <50ms | Prisma query event |
| 1000 条消息滚动 | 60fps | Flutter/Desktop profiler |

---

## 实现要点

### 延迟打点

```typescript
interface MessageLatencyMetric {
  messageId: string;
  timestamps: {
    clientSend: number;
    serverReceive: number;
    dbWrite: number;
    wsBroadcast: number;
    clientReceive: number;
  };
  totalLatencyMs: number;
}
```

### Redis 缓存策略

| 数据 | TTL | 失效策略 |
|------|-----|---------|
| 会话列表 | 5 min | 会话更新时删除 |
| 好友列表 | 10 min | 好友变更时删除 |
| 用户资料 | 15 min | 资料更新时删除 |

### WebSocket 压缩

```typescript
// main.ts Socket.IO 配置
const io = new Server(server, {
  perMessageDeflate: {
    threshold: 1024,  // 仅压缩 > 1KB 的消息
  },
});
```

---

## 新增文件

```
apps/server/src/common/interceptors/latency.interceptor.ts   # API 请求延迟打点
apps/server/src/common/middleware/ws-latency.middleware.ts     # WS 消息延迟打点
scripts/k6-latency-test.js                                    # 延迟基准测试脚本
```

### 修改文件

| 文件 | 变更 |
|------|------|
| `apps/server/src/main.ts` | 启用 perMessageDeflate + Prisma query event 日志 |
| `apps/server/src/gateway/chat.gateway.ts` | WS 消息延迟打点（clientSend → serverReceive） |
| `apps/server/src/messages/messages.service.ts` | DB 写入延迟打点 |
| `apps/server/src/ai/services/whisper.service.ts` | LLM 调用延迟打点 |
| `apps/mobile/lib/features/chat/pages/chat_thread_page.dart` | ListView.builder 优化（如尚未使用） |
| `apps/desktop/src/renderer/components/chat/ChatThread.tsx` | 虚拟化滚动（react-window 或类似） |

---

## 验收标准

- [ ] 消息发送到对方收到 <2 秒（P95）
- [ ] @ai 触发到建议展示 <2 秒（P95）
- [ ] 远程命令全链路 <3 秒（P95）
- [ ] 1000 条消息的聊天页面滚动流畅（60fps）
- [ ] 核心查询 <50ms（EXPLAIN ANALYZE 验证）
- [ ] Redis 缓存命中率 > 80%
- [ ] `pnpm build && pnpm test` 通过
