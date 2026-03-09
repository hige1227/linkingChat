# 自动化测试改善计划

> 目标：扫清能自动化发现的问题，减少手动测试中"鬼打墙"式的隐性 bug

## 问题根因分析

2026-03-09 真实测试发现 28 个问题，按类型分布：

| 类型 | 数量 | 占比 | 能否自动化发现 |
|------|------|------|----------------|
| WS 命名空间/事件缺失 | 12 | 43% | **能** — 集成测试 |
| WS payload 字段缺失 | 3 | 11% | **能** — 运行时校验 + 集成测试 |
| 双端功能遗漏（A端有B端没有） | 5 | 18% | **能** — 事件覆盖率检查 |
| 状态竞态/同步 | 4 | 14% | 部分能 — E2E 测试 |
| UI 渲染/布局 | 4 | 14% | 部分能 — 快照测试 |

**结论：~72% 的问题可以通过自动化测试拦截。**

---

## Phase 1：WS 事件集成测试（优先级最高）

### 问题

当前 373 个测试全是单元测试，mock 了 `broadcastService`。这意味着：
- 命名空间用错了（device vs chat）→ 测试照过
- payload 缺字段 → 测试照过
- 客户端没注册 handler → 无人知晓

### 方案

新建 `apps/server/src/__tests__/ws-integration/` 目录，用真实 Socket.IO 连接测试事件链路。

```
apps/server/src/__tests__/ws-integration/
├── setup.ts              # 启动测试服务器 + Socket.IO 客户端工具
├── friend-events.spec.ts # 好友事件：request/accepted/removed
├── message-events.spec.ts # 消息事件：new/updated/deleted/read
├── group-events.spec.ts  # 群组事件：created/member:added/removed/deleted
└── converse-events.spec.ts # 会话事件：new/updated
```

#### 测试模式

```typescript
// friend-events.spec.ts
describe('Friend WS Events (chat namespace)', () => {
  let app: INestApplication;
  let senderSocket: Socket;
  let receiverSocket: Socket;

  beforeAll(async () => {
    // 启动真实 NestJS 应用（用测试数据库）
    // 连接两个 Socket.IO 客户端到 /chat 命名空间
  });

  it('发送好友请求后，接收方应通过 chat 命名空间收到 friend:request', async () => {
    const received = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('未收到 friend:request 事件')), 3000);
      receiverSocket.on('friend:request', (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });

    // 通过 REST API 发送好友请求
    await request(app.getHttpServer())
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${receiverToken}`)
      .send({ receiverId: senderId });

    const data = await received;
    // 校验 payload 完整性
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('sender');
    expect(data).toHaveProperty('sender.id');
    expect(data).toHaveProperty('sender.displayName');
    expect(data).toHaveProperty('createdAt');
  });

  it('添加群成员后，现有成员应收到 group:member:added', async () => {
    // ...类似模式
  });
});
```

#### 关键校验点

每个 WS 事件测试必须验证：
1. **事件是否到达** — 在 /chat 命名空间收到（而非 /device）
2. **payload 完整性** — 所有必填字段都存在
3. **payload 值正确** — authorId、converseId 等字段值正确
4. **目标正确** — 只有应该收到的用户才收到

### 覆盖清单

| 事件 | 触发方式 | 需验证 |
|------|----------|--------|
| `friend:request` | POST /friends/request | sender payload, 到达 /chat |
| `friend:accepted` | POST /friends/accept/:id | friend payload, 双方都收到 |
| `friend:removed` | DELETE /friends/:userId | userId, 双方都收到 |
| `message:new` | POST /messages | authorId, author, type, content, converseId |
| `message:updated` | PATCH /messages/:id | 完整 MessageResponse |
| `message:deleted` | DELETE /messages/:id | messageId, converseId, recalledBy |
| `message:read` | emit message:read | converseId, userId, lastSeenMessageId |
| `converse:new` | 好友接受后自动创建 | id |
| `converse:updated` | PATCH /converses/groups/:id | id, 更新字段 |
| `group:created` | POST /converses/groups | id, name, members |
| `group:member:added` | POST /groups/:id/members | converseId, members[] with role |
| `group:member:removed` | DELETE /groups/:id/members/:uid | converseId, userId |
| `group:deleted` | DELETE /converses/groups/:id | id |
| `group:updated` | PATCH /converses/groups/:id | id, name |
| `message:typing` | emit message:typing | converseId, userId, isTyping |

---

## Phase 2：WS Payload 运行时校验

### 问题

即使集成测试覆盖了已知事件，新增事件时仍可能遗漏字段。

### 方案

在 `BroadcastService` 中加入 payload 校验层：

```typescript
// packages/ws-protocol/src/validators.ts
import { z } from 'zod';

export const MessageNewPayload = z.object({
  id: z.string(),
  content: z.string(),
  type: z.enum(['TEXT', 'IMAGE', 'FILE', 'VOICE', 'SYSTEM']),
  authorId: z.string(),
  author: z.object({
    id: z.string(),
    username: z.string(),
    displayName: z.string(),
  }),
  converseId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const FriendRequestPayload = z.object({
  id: z.string(),
  sender: z.object({
    id: z.string(),
    username: z.string(),
    displayName: z.string(),
  }),
  createdAt: z.string(),
});

// ... 每个事件一个 schema
```

```typescript
// apps/server/src/gateway/broadcast.service.ts
// 仅在 development 模式下校验（生产环境不影响性能）
if (process.env.NODE_ENV !== 'production') {
  const validator = EVENT_VALIDATORS[event];
  if (validator) {
    const result = validator.safeParse(payload);
    if (!result.success) {
      console.error(`[WS] Invalid payload for ${event}:`, result.error.format());
    }
  }
}
```

**效果**：开发时如果 `message:new` 缺少 `authorId`，服务端控制台直接报错，不需要等到客户端发现。

---

## Phase 3：双端事件覆盖率检查（静态分析）

### 问题

同一个 WS 事件，Desktop 有 handler 但 Mobile 没有（或反过来），这类遗漏手动测试很难发现。

### 方案

写一个脚本 `scripts/check-ws-coverage.ts`，静态扫描双端代码：

```typescript
// scripts/check-ws-coverage.ts
// 1. 从 ws-protocol 提取所有已声明事件名
// 2. 扫描 Desktop useChatSocket.ts 找所有 socket.on('xxx')
// 3. 扫描 Mobile chat_socket_service.dart 找所有 .on('xxx')
// 4. 扫描 Mobile 各 provider 找所有 chatSocket.on('xxx')
// 5. 对比输出覆盖矩阵

// 输出示例：
// ┌────────────────────┬─────────┬─────────┬────────┐
// │ Event              │ Server  │ Desktop │ Mobile │
// ├────────────────────┼─────────┼─────────┼────────┤
// │ message:new        │ ✅ emit │ ✅ on   │ ✅ on  │
// │ friend:request     │ ✅ emit │ ✅ on   │ ✅ on  │
// │ group:member:added │ ✅ emit │ ✅ on   │ ❌ --- │ ← 遗漏!
// │ group:deleted      │ ✅ emit │ ✅ on   │ ❌ --- │ ← 遗漏!
// └────────────────────┴─────────┴─────────┴────────┘
```

加入 CI：

```yaml
# .github/workflows/ci.yml
- name: Check WS event coverage
  run: pnpm ts-node scripts/check-ws-coverage.ts --strict
  # --strict 模式下有遗漏直接 exit 1
```

---

## Phase 4：关键路径 E2E 测试（中期）

### 问题

集成测试验证"事件到达"，但不验证"客户端正确处理"。竞态条件（如 currentUserId 未设置时渲染）需要 E2E。

### 方案

用 Playwright 测试 Desktop（Electron）关键路径：

```
apps/desktop/e2e/
├── setup/
│   ├── global-setup.ts   # 启动服务器 + 创建测试用户
│   └── electron-app.ts   # 启动 Electron 应用
├── auth.spec.ts           # 登录流程
├── chat-send.spec.ts      # 发送消息 + 对方收到
├── friend-request.spec.ts # 发送好友请求 + 对方看到红点
└── group-manage.spec.ts   # 创建群组 + 管理权限
```

优先覆盖：
1. 登录 → 会话列表加载 → 点击会话 → 发消息 → 对方收到
2. 发好友请求 → 对方红点出现 → 接受 → 双方好友列表更新
3. 创建群组 → Owner 能看到管理按钮 → 添加成员 → 系统消息出现

### Flutter 端

用 `integration_test` 包：

```dart
// apps/mobile/integration_test/chat_flow_test.dart
testWidgets('发送消息后对方收到', (tester) async {
  // 登录用户A
  // 进入会话
  // 发送消息
  // 切换到用户B
  // 验证消息出现
});
```

---

## Phase 5：新功能开发检查清单（流程）

每次新增涉及 WS 事件的功能，PR 模板中强制填写：

```markdown
## WS 事件检查清单

- [ ] 服务端 emit 使用 `chat` 命名空间 (chatListcast/chatUnicast/toRoom)
- [ ] payload 包含所有必填字段（对照 ws-protocol 类型定义）
- [ ] Desktop `useChatSocket.ts` 有 handler
- [ ] Mobile provider/socket_service 有 handler
- [ ] 有对应的集成测试
- [ ] `pnpm check-ws-coverage` 通过
```

---

## 实施优先级

| Phase | 内容 | 预计工作量 | 能拦截的问题比例 |
|-------|------|-----------|-----------------|
| **1** | WS 事件集成测试 | 2-3 天 | ~43%（命名空间 + payload） |
| **2** | Payload 运行时校验 | 0.5 天 | ~11%（字段缺失） |
| **3** | 双端覆盖率脚本 | 0.5 天 | ~18%（A端有B端没有） |
| **4** | E2E 测试 | 3-5 天 | ~14%（竞态 + UI） |
| **5** | PR 检查清单 | 0.1 天 | 预防性 |

**建议执行顺序**：Phase 3 → Phase 2 → Phase 1 → Phase 5 → Phase 4

Phase 3 和 2 投入最小收益最大，半天就能做完。Phase 1 是核心但工作量大。Phase 4 是长期投资。

---

## 预期效果

实施 Phase 1-3 后：
- **28 个问题中的 20 个**（~72%）能被自动发现
- 同类命名空间错误**不再重复出现**
- 新增 WS 事件时 CI 自动提醒双端是否都处理了
- 开发阶段就能发现 payload 缺字段，不用等到真机测试
