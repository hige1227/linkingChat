# Sprint 4 — Phase 7: 水平扩展验证

> **状态**：🔜 待开发
>
> **优先级**：P9（第 9 个工作包，最后执行）
>
> **预估工作量**：1-2 天
>
> **前置条件**：Phase 5-6（云端部署 + Nginx）完成
>
> **参考**：[sprint4_implement.md](../sprint4_implement.md) Phase 7

---

## 目标

验证多实例部署下 WebSocket 消息同步正确性（Redis 适配器已在 Sprint 2 配置）。通过压力测试确认系统在 1000 并发下稳定运行。

---

## 任务清单

| # | 任务 | 产出 | 依赖 | 状态 |
|---|------|------|------|------|
| 7.1 | 多实例部署 | docker-compose scale server=2 | Phase 5 | 🔜 |
| 7.2 | Nginx 负载均衡 | upstream ip_hash | Phase 6 | 🔜 |
| 7.3 | Redis 适配器验证 | 跨实例消息同步 | 7.1 | 🔜 |
| 7.4 | 会话亲和性测试 | WS 连接不因 LB 断开 | 7.2 | 🔜 |
| 7.5 | 状态同步验证 | Presence 跨实例一致 | 7.3 | 🔜 |
| 7.6 | 压力测试 | Artillery / k6 脚本 | 7.1-7.5 | 🔜 |

---

## 跨实例消息流

```
用户 A (连接到实例 1)  发消息
    → 实例 1: INSERT message + PUBLISH to Redis
    → Redis Pub/Sub 广播
    → 实例 2: 接收 PUBLISH → 推送到实例 2 上的所有房间内客户端
用户 B (连接到实例 2)  收到消息
```

---

## 压力测试脚本

> **注意**：Socket.IO 有自己的握手协议（HTTP polling → WebSocket upgrade），不能用原生 WebSocket 引擎。
> 需要安装 Artillery Socket.IO 引擎：`npm install -g artillery-engine-socketio-v3`

```yaml
# artillery.yml — Socket.IO 压力测试
config:
  target: "https://api.yourdomain.com"
  phases:
    - duration: 60
      arrivalRate: 50    # 每秒 50 个新连接
  engines:
    socketio-v3:
      path: "/socket.io/"
      transports: ["websocket"]

scenarios:
  - name: "WebSocket Chat Load Test"
    engine: socketio-v3
    flow:
      - emit:
          channel: "converse:join"
          data: { converseId: "test-room" }
      - think: 2
      - emit:
          channel: "message:send"
          data: { converseId: "test-room", content: "load test" }
      - think: 5
```

```yaml
# artillery-rest.yml — REST API 压力测试
config:
  target: "https://api.yourdomain.com"
  phases:
    - duration: 60
      arrivalRate: 100   # 每秒 100 请求

scenarios:
  - name: "REST API Load Test"
    flow:
      - get:
          url: "/api/v1/converses"
          headers:
            Authorization: "Bearer {{ $env.TEST_TOKEN }}"
```

---

## 验收标准

- [ ] 用户 A 连实例 1，用户 B 连实例 2，消息互通无延迟
- [ ] 设备控制命令跨实例正确路由
- [ ] 1000 并发 WebSocket 连接稳定
- [ ] 在线状态跨实例一致
- [ ] Nginx 负载均衡分配正常
- [ ] 压力测试 P99 延迟 < 5s
