# LinkingChat 端到端测试手册

> 面向：开发者 / QA / 产品验收
>
> 前置条件：本地开发环境 + 一台可运行 Flutter 的手机或模拟器
>
> 预计耗时：60-90 分钟完整走完

---

## 0. 环境准备

### 0.1 启动后端服务

```bash
cd D:\myproject\LinkChat_new

# 1. 启动基础设施（PostgreSQL + Redis + MinIO）
pnpm docker:up

# 2. 数据库迁移（含全文搜索 tsvector 迁移）
pnpm db:migrate

# 3. 数据库种子数据（创建初始 Bot 等）
pnpm db:seed

# 4. 启动 NestJS 服务端
pnpm dev:server
```

确认输出：`Application is running on: http://localhost:3008`

### 0.2 启动客户端

**Flutter 手机端**（推荐先测这个）：
```bash
cd apps/mobile
flutter run
```

**Electron 桌面端**（可选）：
```bash
pnpm dev:desktop
```

### 0.3 创建测试账号

用 curl 或 Postman 注册两个用户：

```bash
# 用户 A（主测试者）
curl -X POST http://localhost:3008/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"alice@test.com","password":"Test1234!"}'

# 用户 B（对话伙伴）
curl -X POST http://localhost:3008/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"bob","email":"bob@test.com","password":"Test1234!"}'
```

> 记下返回的 `accessToken`，后续 curl 测试需要。
> 也可以直接在 Flutter App 里注册 / 登录。

### 0.4 建立好友关系 & 会话

```bash
TOKEN_A="<alice的accessToken>"
TOKEN_B="<bob的accessToken>"

# Alice 发好友请求给 Bob（需要知道 Bob 的 userId）
curl -X POST http://localhost:3008/api/v1/friends/request \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"targetUserId":"<bob-user-id>"}'

# Bob 接受好友请求（需要 requestId）
curl -X POST http://localhost:3008/api/v1/friends/accept/<request-id> \
  -H "Authorization: Bearer $TOKEN_B"
```

> 或者直接在 Flutter App 里操作：好友 → 添加好友 → 搜索 → 发送请求 → 对方接受

---

## 1. 基础聊天功能

### TC-1.1 发送文本消息

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | Alice 打开与 Bob 的对话 | 进入聊天界面，显示空消息列表 |
| 2 | 输入"你好 Bob"，点击发送 | 消息出现在右侧气泡，状态从半透明→不透明 |
| 3 | 切换到 Bob 的设备/App | Bob 收到消息，显示在左侧气泡 |
| 4 | Bob 回复"你好 Alice" | Alice 实时收到消息（<2 秒延迟） |

### TC-1.2 输入状态指示

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | Alice 开始在输入框打字 | Bob 屏幕底部出现 "Alice is typing..." |
| 2 | Alice 停止打字 3 秒 | typing 指示消失 |

### TC-1.3 已读回执

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | Alice 发送消息给 Bob | 消息已送达 |
| 2 | Bob 打开该会话 | Alice 端消息状态更新为"已读" |

---

## 2. AI 功能 — Whisper (@ai 建议)

### TC-2.1 触发 Whisper 建议

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | Alice 在任意对话中发送 `@ai 帮我想个周末计划` | 消息正常发送 |
| 2 | 等待 <2 秒 | 输入框上方出现 Whisper 建议条：<br>- `@ai` 蓝色标签<br>- 一个主建议（蓝色圆角芯片）<br>- `...` 展开按钮<br>- `×` 关闭按钮 |
| 3 | 点击主建议芯片 | 建议文本自动填入输入框（不会覆盖已有文字）<br>建议条消失 |
| 4 | 点击发送 | 填入的建议文本作为新消息发送 |

### TC-2.2 查看备选建议

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 触发 Whisper（发送 `@ai 推荐一个餐厅`） | 建议条出现 |
| 2 | 点击 `...` 按钮 | 展开 2 个备选建议（灰色小芯片） |
| 3 | 点击任意备选芯片 | 该建议填入输入框，建议条消失 |

### TC-2.3 忽略建议

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 触发 Whisper | 建议条出现 |
| 2 | 点击 `×` 关闭按钮 | 建议条消失，输入框不变 |

### TC-2.4 已有输入文字时

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 先在输入框输入"我觉得..." | 输入框有文字 |
| 2 | 触发 Whisper 后点击建议 | **不会覆盖**已有文字，建议被忽略 |

> **注意**：Whisper 需要 `DEEPSEEK_API_KEY` 配置在 `.env` 中才能实际生成建议。
> 如果没有 API Key，服务端会记录错误日志但不会崩溃，客户端不会收到建议。

---

## 3. AI 功能 — Draft & Verify (草稿审核)

### TC-3.1 用测试端点触发草稿

由于 Draft 通常由 Bot 自动生成，我们用测试 API 手动触发：

```bash
# 先获取一个 converseId（Alice 和 Bot 的对话 ID）
# 可以在 App 中点进 Supervisor Bot 对话，从 URL 或调试日志拿到 converseId

curl -X POST http://localhost:3008/api/v1/ai/test/draft \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{
    "converseId": "<converse-id>",
    "botId": "<supervisor-bot-id>",
    "botName": "Supervisor",
    "draftType": "message",
    "userIntent": "帮我写一封请假邮件"
  }'
```

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 发送上述 curl 请求 | 返回 `{ "draftId": "xxx" }` |
| 2 | 查看 Alice 的 App（对应会话） | 消息列表上方出现 Draft 卡片：<br>- 机器人图标 + "Draft from Supervisor"<br>- 草稿内容文本<br>- 倒计时 `04:59`（5 分钟 TTL）<br>- 三个按钮：`Reject`(红) `Edit`(蓝) `Approve`(绿) |

### TC-3.2 批准草稿

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 点击绿色 `Approve` 按钮 | 卡片变为绿色半透明 + "Approved" 标签<br>按钮消失<br>倒计时停止 |
| 2 | 检查服务端日志 | 日志显示 draft approved |

### TC-3.3 拒绝草稿

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 触发一个新草稿（重复 TC-3.1） | 新 Draft 卡片出现 |
| 2 | 点击红色 `Reject` 按钮 | 卡片变灰 + "Rejected" 标签 |

### TC-3.4 编辑草稿

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 触发一个新草稿 | Draft 卡片出现 |
| 2 | 点击蓝色 `Edit` 按钮 | 内容区变为可编辑的 TextField |
| 3 | 修改内容文字 | 可以正常编辑 |
| 4 | 点击 `Save & Approve` | 卡片变为 "Approved"，发送编辑后的内容 |

### TC-3.5 草稿过期

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 触发一个新草稿 | 倒计时开始 |
| 2 | 等待 5 分钟（或修改服务端 TTL 为 10 秒方便测试） | 倒计时归零<br>卡片变灰 + "Expired" 标签<br>按钮消失 |

### TC-3.6 命令类型草稿

```bash
curl -X POST http://localhost:3008/api/v1/ai/test/draft \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{
    "converseId": "<converse-id>",
    "botId": "<coding-bot-id>",
    "botName": "Coding Bot",
    "draftType": "command",
    "userIntent": "清理临时文件"
  }'
```

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 发送命令类型草稿 | Draft 卡片出现 |
| 2 | 观察内容区 | 命令文本用**黑底白字等宽字体**显示（区别于普通消息） |

---

## 4. AI 功能 — Predictive Actions (预测操作)

### TC-4.1 用测试端点触发预测

```bash
curl -X POST http://localhost:3008/api/v1/ai/test/predictive \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{
    "converseId": "<converse-id>",
    "errorOutput": "npm ERR! ENOENT: no such file or directory, open package.json"
  }'
```

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 发送上述请求 | 返回 `{ "triggered": true, "category": "npm_error" }` |
| 2 | 查看 Alice 的 App | 消息列表上方出现 Predictive Action 卡片：<br>- 魔法棒图标 + "Suggested Actions"<br>- 触发描述文本<br>- 多个操作按钮（颜色编码） |

### TC-4.2 安全操作（绿色）

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 找到绿色 `Run` 按钮的操作 | 标记为 `safe` |
| 2 | 点击 `Run` | **立即执行**（无确认弹窗）<br>卡片消失 |

### TC-4.3 警告操作（黄色）

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 找到黄色按钮的操作 | 标记为 `warning` |
| 2 | 点击 `Run` | 弹出确认对话框：<br>- 标题 "Confirm Action"<br>- 显示操作描述和命令<br>- `Cancel` 和 `Confirm` 按钮 |
| 3 | 点击 `Confirm` | 执行操作，卡片消失 |
| 4 | （重新触发）点击 `Cancel` | 对话框关闭，卡片保留 |

### TC-4.4 危险操作（红色）

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 找到红色按钮的操作 | 标记为 `dangerous` |
| 2 | 点击 `Run` | 弹出**带警告文字**的确认对话框 |

### TC-4.5 忽略建议

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 点击卡片右上角 `×` 按钮 | 卡片消失 |

---

## 5. 消息撤回

### TC-5.1 普通用户 2 分钟内撤回

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | Alice 发送一条消息 | 消息出现 |
| 2 | 立即对该消息执行删除（长按 → 删除） | 消息被软删除，对方看到该消息消失 |
| 3 | 检查 API 响应 | 返回包含 `recalledBy` 字段 |

### TC-5.2 超过 2 分钟撤回失败

```bash
# 用 API 测试更方便
# 先发送一条消息，记下 messageId，等 2 分钟后：
curl -X DELETE http://localhost:3008/api/v1/messages/<message-id> \
  -H "Authorization: Bearer $TOKEN_A"
```

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 发送消息后等待 2 分钟以上 | — |
| 2 | 尝试删除该消息 | 返回 403/400 错误："Recall time limit exceeded (2 minutes)" |

### TC-5.3 管理员撤回（群聊）

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 创建群组，Alice 为 OWNER | — |
| 2 | Bob（MEMBER）在群里发一条消息 | 消息出现 |
| 3 | Alice（OWNER）删除 Bob 的消息 | 成功！管理员无时间限制 |
| 4 | 等待 >2 分钟后再试 | 仍然成功（管理员不受时间限制） |

---

## 6. 消息搜索

### TC-6.1 搜索英文消息

```bash
curl "http://localhost:3008/api/v1/messages/search?query=hello&limit=10" \
  -H "Authorization: Bearer $TOKEN_A"
```

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 先发送几条包含 "hello" 的消息 | — |
| 2 | 调用搜索 API | 返回 `{ results: [...], total: N, query: "hello" }` |
| 3 | 检查结果 | 只返回 Alice 有权限访问的会话中的消息 |

### TC-6.2 搜索中文消息

```bash
curl "http://localhost:3008/api/v1/messages/search?query=你好" \
  -H "Authorization: Bearer $TOKEN_A"
```

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 先发送 "你好世界" | — |
| 2 | 搜索 "你好" | 命中（通过 ILIKE fallback） |
| 3 | 搜索 "世界" | 命中 |

### TC-6.3 按会话过滤搜索

```bash
curl "http://localhost:3008/api/v1/messages/search?query=test&converseId=<id>" \
  -H "Authorization: Bearer $TOKEN_A"
```

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 指定 converseId 搜索 | 只返回该会话中匹配的消息 |

### TC-6.4 权限隔离

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | Bob 在他自己的私聊中发消息 "secret" | — |
| 2 | Alice 搜索 "secret" | **搜不到**（Alice 不是该会话成员） |

---

## 7. 速率限制

### TC-7.1 登录限流（5/min）

```bash
# 快速发 6 次登录请求
for i in {1..6}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:3008/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"alice","password":"wrong"}'
done
```

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 连续发 6 次登录 | 前 5 次返回 401（密码错误）<br>第 6 次返回 **429 Too Many Requests** |

### TC-7.2 全局限流（100/min）

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 快速发 >100 个 API 请求 | 超出后返回 429 |

---

## 8. 监控端点

### TC-8.1 健康检查

```bash
curl http://localhost:3008/api/v1/health
```

预期：`{ "status": "ok", "timestamp": "2026-03-07T..." }`

### TC-8.2 AI 健康检查

```bash
curl http://localhost:3008/api/v1/ai/health
```

预期：`{ "status": "ok", "providers": ["deepseek", "kimi"] }`

### TC-8.3 Prometheus 指标

```bash
curl http://localhost:3008/api/v1/metrics
```

预期：返回 Prometheus 文本格式，包含：
- `http_request_duration_seconds` — HTTP 请求延迟直方图
- `http_requests_total` — 请求计数
- `process_cpu_seconds_total` — Node.js CPU 使用
- `nodejs_heap_size_total_bytes` — 堆内存

---

## 9. WebSocket 连接稳定性

### TC-9.1 长连接保持

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | Flutter App 登录并进入聊天 | WebSocket 连接成功 |
| 2 | 手机锁屏 2 分钟后解锁 | 连接仍然存活（或自动重连） |
| 3 | 切换到其他 App 后切回 | 连接恢复，消息不丢失 |

### TC-9.2 在线状态广播

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | Alice 在线，Bob 查看好友列表 | Alice 显示绿色在线标识 |
| 2 | Alice 关闭 App | Bob 收到 `presence:changed` 事件，Alice 变灰 |

---

## 10. Swagger API 文档

打开浏览器访问：

```
http://localhost:3008/api/docs
```

验证：
- [ ] 所有 API 端点都列出
- [ ] 可以在页面内尝试 "Try it out"
- [ ] Bearer Auth 输入 token 后可以调用受保护接口

---

## 快速验证清单

完整跑完后，勾选以下项目：

### 基础功能
- [ ] 注册 / 登录成功
- [ ] 发送 / 接收文本消息 <2s 延迟
- [ ] 输入状态（typing indicator）正常
- [ ] 已读回执正常

### AI 三模式
- [ ] `@ai` 触发 Whisper 建议条
- [ ] 点击建议 → 填入输入框
- [ ] Draft 卡片出现 + 倒计时 + 三按钮
- [ ] Approve / Reject / Edit 都正常
- [ ] 草稿 5 分钟过期变灰
- [ ] Predictive 卡片出现 + 颜色编码
- [ ] 安全操作直接执行
- [ ] 危险操作弹确认框

### Sprint 4 增强
- [ ] 消息撤回 2 分钟内成功
- [ ] 消息撤回超时被拒绝
- [ ] 管理员撤回无时间限制
- [ ] 消息搜索返回正确结果
- [ ] 中文搜索正常（ILIKE fallback）
- [ ] 搜索结果遵守权限隔离

### 安全 & 监控
- [ ] 速率限制生效（429）
- [ ] `/health` 返回 200
- [ ] `/metrics` 返回 Prometheus 格式
- [ ] Swagger 文档可访问

---

## 常见问题排查

| 问题 | 原因 | 解决 |
|------|------|------|
| Whisper 没有返回建议 | `DEEPSEEK_API_KEY` 未配置 | 在 `apps/server/.env` 中添加 |
| WebSocket 连接失败 | Redis 未启动 | 执行 `pnpm docker:up` |
| 搜索无结果 | tsvector 迁移未执行 | 执行 `pnpm db:migrate` |
| 草稿卡片不出现 | converseId 不匹配 | 确认 curl 中的 converseId 与 App 打开的会话一致 |
| 429 被限流 | 正常行为 | 等待 1 分钟后重试 |
| Flutter 启动报错 DNS | pub.dev 国内访问问题 | 配置 Flutter 国内镜像 |
