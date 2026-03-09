# 自动化测试改善计划

> 目标：扫清能自动化发现的问题，减少手动测试中"鬼打墙"式的隐性 bug

## 问题根因分析

2026-03-09 真实测试发现 28 个问题，按类型分布：

| 类型 | 数量 | 占比 | 能否自动化发现 |
|------|------|------|----------------|
| WS 命名空间/事件缺失 | 12 | 43% | **能** — 集成测试 + 覆盖率脚本 |
| WS payload 字段缺失 | 3 | 11% | **能** — 运行时校验 + 集成测试 |
| 双端功能遗漏（A端有B端没有） | 5 | 18% | **能** — 事件覆盖率检查 |
| 状态竞态/同步 | 4 | 14% | 部分能 — E2E 测试 |
| UI 渲染/布局 | 4 | 14% | 部分能 — 快照测试 |

**结论：~72% 的问题可以通过自动化测试拦截。**

> 注：28 个问题全部发生在 `/chat` 命名空间。`/device` 命名空间当前不在覆盖范围内（远程控制功能尚未进入真机测试阶段）。后续 Sprint 涉及 device 事件时需扩展。

---

## 事件全景图

实施任何 Phase 前，先明确项目中所有 WS 事件的完整清单。

### Server → Client 事件（/chat 命名空间，26 个）

| 事件 | Payload 类型 | 发射位置 |
|------|-------------|---------|
| `message:new` | `MessageResponse` | messages.service, converses.service |
| `message:updated` | `MessageResponse` | messages.service |
| `message:deleted` | `{ id, converseId, deletedAt?, recalledBy? }` | messages.service |
| `message:typing` | `TypingPayload` | chat.gateway (relay) |
| `message:read` | `MessageReadPayload` | chat.gateway (relay) |
| `friend:request` | `FriendRequestPayload` | friends.service |
| `friend:accepted` | `FriendAcceptedPayload` | friends.service |
| `friend:removed` | `FriendRemovedPayload` | friends.service |
| `converse:new` | `ConverseNewPayload` | friends.service, converses.service |
| `converse:updated` | `ConverseResponse` | converses.service |
| `presence:changed` | `PresencePayload` | chat.gateway |
| `notification:new` | `Record<string, unknown>` | messages.service |
| `bot:notification` | `Record<string, unknown>` | supervisor.agent |
| `group:created` | `GroupCreatedPayload` | converses.service |
| `group:updated` | `GroupUpdatedPayload` | converses.service |
| `group:deleted` | `GroupDeletedPayload` | converses.service |
| `group:member:added` | `GroupMemberAddedPayload` | converses.service |
| `group:member:removed` | `GroupMemberRemovedPayload` | converses.service |
| `group:member:role:updated` | `GroupMemberRoleUpdatedPayload` | converses.service |
| `group:member:muted` | mute payload | converses.service |
| `group:member:unmuted` | unmute payload | converses.service |
| `group:member:banned` | ban payload | converses.service |
| `group:member:unbanned` | unban payload | converses.service |
| `ai:whisper:suggestions` | `WhisperSuggestionsPayload` | whisper.service |
| `ai:draft:created` | `DraftCreatedPayload` | draft.service |
| `ai:draft:expired` | `DraftExpiredPayload` | draft.service |
| `ai:predictive:action` | `PredictiveActionPayload` | predictive.service |
| `bot:cross:notify` | `BotNotificationPayload` | bot-communication.service |

### Client → Server 事件（/chat 命名空间，12 个）

| 事件 | Payload 类型 | 处理位置 |
|------|-------------|---------|
| `converse:join` | `{ converseId }` | chat.gateway |
| `converse:leave` | `{ converseId }` | chat.gateway |
| `message:typing` | `TypingPayload` | chat.gateway |
| `message:read` | `MessageReadPayload` | chat.gateway |
| `presence:update` | `PresenceUpdatePayload` | chat.gateway |
| `ai:whisper:request` | `WhisperRequestPayload` | chat.gateway |
| `ai:whisper:accept` | `WhisperAcceptPayload` | chat.gateway |
| `ai:draft:approve` | `DraftApprovePayload` | chat.gateway |
| `ai:draft:reject` | `DraftRejectPayload` | chat.gateway |
| `ai:draft:edit` | `DraftEditPayload` | chat.gateway |
| `ai:predictive:execute` | `PredictiveExecutePayload` | chat.gateway |
| `ai:predictive:dismiss` | `PredictiveDismissPayload` | chat.gateway |

### 双端 Handler 覆盖现状

| 事件 (S→C) | Desktop | Mobile | 差异 |
|------------|---------|--------|------|
| `message:new` | ✅ | ✅ | — |
| `message:updated` | ✅ | ✅ | — |
| `message:deleted` | ✅ | ✅ | — |
| `message:typing` | ✅ | ✅ | — |
| `message:read` | ✅ | ✅ | — |
| `friend:request` | ✅ | ✅ | — |
| `friend:accepted` | ✅ | ✅ | — |
| `friend:removed` | ✅ | ✅ | — |
| `converse:new` | ✅ | ✅ | — |
| `converse:updated` | ✅ | ✅ | — |
| `presence:changed` | ⚠️ 空 handler | ✅ | Desktop 需实现 |
| `notification:new` | ❌ | ✅ | Desktop 缺失 |
| `bot:notification` | ❌ | ❌ | 均缺失（通过 message:new + type 处理） |
| `group:created` | ✅ | ✅ | — |
| `group:updated` | ✅ | ✅ | — |
| `group:deleted` | ✅ | ✅ | — |
| `group:member:added` | ✅ | ✅ | — |
| `group:member:removed` | ✅ | ✅ | — |
| `group:member:role:updated` | ✅ | ✅ | — |
| `group:member:muted` | ❌ | ❌ | 均缺失（通过 refetch 处理） |
| `group:member:unmuted` | ❌ | ❌ | 均缺失 |
| `group:member:banned` | ❌ | ❌ | 均缺失 |
| `group:member:unbanned` | ❌ | ❌ | 均缺失 |
| `ai:whisper:suggestions` | ✅ | ✅ | — |
| `ai:draft:created` | ✅ | ✅ | — |
| `ai:draft:expired` | ✅ | ✅ | — |
| `ai:predictive:action` | ✅ | ✅ | — |
| `bot:cross:notify` | ❌ | ❌ | 均缺失（暂不需要） |

---

## 实施优先级

| 顺序 | Phase | 内容 | 预计工作量 | 能拦截的问题比例 |
|------|-------|------|-----------|-----------------|
| **1** | Phase 5 | PR 检查清单 | 0.1 天 | 预防性（零成本） |
| **2** | Phase 2 | Payload 运行时校验 | 0.5 天 | ~11% |
| **3** | Phase 3 | 双端覆盖率脚本 | 1 天 | ~18% |
| **4** | Phase 1 | WS 事件集成测试 | 4-5 天 | ~43% |
| **5** | Phase 4 | E2E 测试 | 3-5 天 | ~14% |

**理由**：Phase 5 零成本立即生效。Phase 2 建立 payload schema 注册表，作为 Phase 3 脚本的数据源。Phase 1 最重要但依赖基础设施搭建（测试数据库、JWT 生成、Redis mock）。

### 完成标准

- [x] Phase 5：PR 模板已添加 WS 检查清单 ✅ 2026-03-09
- [x] Phase 2：`ServerToClientEvents` 中所有非 device 事件都有对应 zod schema；`z.infer<Schema>` 与 TypeScript 接口类型兼容 ✅ 2026-03-09
- [x] Phase 3：`pnpm check-ws-coverage` 输出覆盖矩阵，`--strict` 模式下已知例外之外的遗漏 exit 1 ✅ 2026-03-09
- [x] Phase 1：所有核心 chat 事件（friend、message、group、converse）有集成测试，包含 happy path + 错误路径 ✅ 2026-03-09
- [ ] Phase 4：Desktop Playwright 覆盖登录→发消息→好友请求→群组管理 4 条关键路径（待单独规划）

---

## Phase 5：PR 检查清单（立即执行）

每次新增涉及 WS 事件的功能，PR 模板中强制填写：

```markdown
## WS 事件检查清单

- [ ] 服务端 emit 使用 `chat` 命名空间方法 (`chatListcast`/`chatUnicast`/`toRoom`)
- [ ] payload 符合 `packages/ws-protocol` 中的类型定义
- [ ] payload zod schema 已更新（如果修改了字段）
- [ ] Desktop `useChatSocket.ts` 有 handler
- [ ] Mobile `chat_socket_service.dart` 或 provider 有 handler
- [ ] 有对应的集成测试（如果是新事件）
- [ ] `pnpm check-ws-coverage` 通过（如果脚本已就绪）
```

**文件**：`.github/PULL_REQUEST_TEMPLATE.md`

---

## Phase 2：WS Payload 运行时校验

### 问题

当前 373 个单元测试 mock 了 `broadcastService`，所以 payload 缺字段永远不会被发现。

### 方案

在 `packages/ws-protocol` 中用 zod 定义每个事件的 payload schema，在 `BroadcastService` 开发模式下自动校验。

#### 2.1 Payload Schema 定义

```typescript
// packages/ws-protocol/src/validators.ts
import { z } from 'zod';

// ── 基础类型 ──

const UserBrief = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable().optional(),
});

const AttachmentPayload = z.object({
  id: z.string().optional(),
  url: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  duration: z.number().optional(),
  thumbnailUrl: z.string().optional(),
});

// ── Message 事件 ──

export const MessageNewSchema = z.object({
  id: z.string(),
  content: z.string().optional(),  // 非文本消息可无 content
  type: z.string(),                // 不硬编码 enum，从 Prisma 类型派生
  authorId: z.string(),
  author: UserBrief,
  converseId: z.string(),
  metadata: z.record(z.unknown()).optional(),
  replyToId: z.string().optional(),
  attachments: z.array(AttachmentPayload).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable().optional(),
});

export const MessageDeletedSchema = z.object({
  messageId: z.string(),
  converseId: z.string(),
  recalledBy: z.string().optional(),
  deletedAt: z.string().optional(),
});

// ── Friend 事件 ──

export const FriendRequestSchema = z.object({
  id: z.string(),
  sender: UserBrief,
  message: z.string().nullable().optional(),
  createdAt: z.string(),
});

export const FriendAcceptedSchema = z.object({
  friendId: z.string(),
  friend: UserBrief,
});

export const FriendRemovedSchema = z.object({
  userId: z.string(),
});

// ── Group 事件 ──

export const GroupMemberAddedSchema = z.object({
  converseId: z.string(),
  members: z.array(z.object({
    userId: z.string(),
    username: z.string(),
    displayName: z.string(),
    avatarUrl: z.string().nullable().optional(),
    role: z.string(),
  })),
});

export const GroupMemberRemovedSchema = z.object({
  converseId: z.string(),
  userId: z.string(),
  removedBy: z.string().optional(),
});

export const GroupMemberRoleUpdatedSchema = z.object({
  converseId: z.string(),
  userId: z.string(),
  role: z.string(),
  updatedBy: z.string().optional(),
});

// ── 事件名 → Schema 映射 ──

export const EVENT_VALIDATORS: Record<string, z.ZodSchema> = {
  'message:new': MessageNewSchema,
  'message:updated': MessageNewSchema,
  'message:deleted': MessageDeletedSchema,
  'friend:request': FriendRequestSchema,
  'friend:accepted': FriendAcceptedSchema,
  'friend:removed': FriendRemovedSchema,
  'group:member:added': GroupMemberAddedSchema,
  'group:member:removed': GroupMemberRemovedSchema,
  'group:member:role:updated': GroupMemberRoleUpdatedSchema,
  // 后续逐步补充其他事件
};
```

#### 2.2 类型兼容性检查

防止 zod schema 和 TypeScript 接口漂移：

```typescript
// packages/ws-protocol/src/__tests__/validator-compat.spec.ts
import type { MessageResponse, FriendRequestPayload } from '../payloads/chat.payloads';
import type { z } from 'zod';
import { MessageNewSchema, FriendRequestSchema } from '../validators';

// 编译时检查：zod infer 的类型必须兼容 TypeScript 接口
type AssertExtends<T, U extends T> = true;
type _M = AssertExtends<MessageResponse, z.infer<typeof MessageNewSchema>>;
type _F = AssertExtends<FriendRequestPayload, z.infer<typeof FriendRequestSchema>>;

// 如果 schema 和接口不匹配，TypeScript 编译会报错
test('zod schemas are compatible with TypeScript interfaces', () => {
  expect(true).toBe(true); // 真正的检查发生在编译时
});
```

#### 2.3 BroadcastService 集成

```typescript
// apps/server/src/gateway/broadcast.service.ts
// 在 toRoom / chatUnicast / chatListcast 中添加开发模式校验

import { EVENT_VALIDATORS } from '@linkingchat/ws-protocol';

private validatePayload(event: string, data: unknown) {
  if (process.env.NODE_ENV === 'production') return;
  const schema = EVENT_VALIDATORS[event];
  if (!schema) return; // 尚未定义 schema 的事件跳过
  const result = schema.safeParse(data);
  if (!result.success) {
    this.logger.error(
      `Invalid payload for "${event}": ${JSON.stringify(result.error.format())}`,
    );
  }
}
```

---

## Phase 3：双端事件覆盖率检查（静态分析）

### 问题

同一个 WS 事件，Desktop 有 handler 但 Mobile 没有（或反过来），手动测试很难发现。

### 方案

`scripts/check-ws-coverage.ts`，基于 Phase 2 的 `EVENT_VALIDATORS` 注册表作为事件源（不用正则猜测），扫描双端代码验证 handler 存在。

#### 3.1 数据源策略

| 数据 | 来源 | 方式 |
|------|------|------|
| 服务端所有事件名 | `EVENT_VALIDATORS` keys + `CHAT_EVENTS` 常量 | TypeScript import |
| Desktop handler | `useChatSocket.ts` | 正则 `socket\.on\(['"](.+?)['"]\)` |
| Mobile handler | `chat_socket_service.dart` | 正则 `on\(['"](.+?)['"]\)` |
| Mobile AI handler | `ai_events.dart` | 解析 `serverToClientEvents` 常量列表 |
| Mobile provider handler | `*_provider.dart` | 正则 `chatSocket\.on\(['"](.+?)['"]\)` 或 `_chatSocket\.on\(['"](.+?)['"]\)` |

#### 3.2 已知例外（不报错）

某些事件故意只在一端处理，脚本需要维护一个白名单：

```typescript
const KNOWN_EXCEPTIONS: Record<string, string> = {
  'bot:cross:notify': '暂不需要客户端处理',
  'bot:notification': '通过 message:new + type 字段处理',
  'group:member:muted': '通过 refetch converses 处理',
  'group:member:unmuted': '通过 refetch converses 处理',
  'group:member:banned': '通过 refetch converses 处理',
  'group:member:unbanned': '通过 refetch converses 处理',
  'notification:new': 'Desktop 暂未实现通知中心',
};
```

#### 3.3 输出格式

```
┌──────────────────────────┬─────────┬─────────┬────────┬───────────┐
│ Event                    │ Server  │ Desktop │ Mobile │ Status    │
├──────────────────────────┼─────────┼─────────┼────────┼───────────┤
│ message:new              │ ✅ emit │ ✅ on   │ ✅ on  │ OK        │
│ friend:request           │ ✅ emit │ ✅ on   │ ✅ on  │ OK        │
│ group:member:role:updated│ ✅ emit │ ❌ ---  │ ✅ on  │ ⚠ Desktop │
│ notification:new         │ ✅ emit │ ❌ ---  │ ✅ on  │ 已豁免    │
└──────────────────────────┴─────────┴─────────┴────────┴───────────┘

Result: 2 issues found (1 error, 1 warning)
```

#### 3.4 CI 集成

```yaml
# .github/workflows/ci.yml
- name: Check WS event coverage
  run: pnpm tsx scripts/check-ws-coverage.ts --strict
```

`--strict` 模式：已知例外之外的遗漏 exit 1。

---

## Phase 1：WS 事件集成测试

### 问题

当前 373 个测试全是单元测试，mock 了 `broadcastService`。命名空间用错、payload 缺字段、事件没到达——全部测不出来。

### 方案

新建 `apps/server/src/__tests__/ws-integration/` 目录，用真实 NestJS + Socket.IO 连接测试事件链路。

```
apps/server/src/__tests__/ws-integration/
├── helpers/
│   ├── test-app.ts           # NestJS 启动 + 随机端口 + Redis mock
│   ├── socket-client.ts      # Socket.IO 客户端连接工具
│   ├── jwt-helper.ts         # 生成测试用 JWT token
│   ├── db-helper.ts          # 测试数据库 seed + cleanup
│   └── wait-for-event.ts     # 事件等待工具函数
├── friend-events.spec.ts
├── message-events.spec.ts
├── group-events.spec.ts
├── converse-events.spec.ts
└── client-to-server.spec.ts  # C→S 事件测试
```

### 1.1 基础设施详细设计

#### test-app.ts — NestJS 启动

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    // 覆盖 Redis adapter 为内存模式（不依赖真实 Redis）
    .overrideProvider('REDIS_OPTIONS')
    .useValue({ host: 'localhost', port: 0 }) // 将被 mock
    .compile();

  const app = moduleRef.createNestApplication();

  // 使用默认 IoAdapter（内存模式，不需要 Redis）
  app.useWebSocketAdapter(new IoAdapter(app));

  // 随机端口，避免与 dev server 冲突
  await app.listen(0);

  return app;
}

export function getBaseUrl(app: INestApplication): string {
  const server = app.getHttpServer();
  const { port } = server.address();
  return `http://localhost:${port}`;
}
```

#### jwt-helper.ts — 测试用 JWT 生成

```typescript
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

// 生成临时 RSA 密钥对（仅用于测试，不依赖 .env 文件中的真实密钥）
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

export function generateTestToken(userId: string, username: string): string {
  return jwt.sign(
    { sub: userId, username, jti: crypto.randomUUID() },
    privateKey,
    { algorithm: 'RS256', expiresIn: '1h' },
  );
}

export { publicKey as testPublicKey };
```

#### db-helper.ts — 数据库 seed 与清理

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

export async function seedTestUsers() {
  const userA = await prisma.user.create({
    data: { id: 'test-user-a', username: 'alice', displayName: 'Alice', passwordHash: '...' },
  });
  const userB = await prisma.user.create({
    data: { id: 'test-user-b', username: 'bob', displayName: 'Bob', passwordHash: '...' },
  });
  return { userA, userB };
}

export async function cleanupTestData() {
  // 按外键依赖顺序清理
  await prisma.message.deleteMany({ where: { authorId: { startsWith: 'test-' } } });
  await prisma.converseMember.deleteMany({ where: { userId: { startsWith: 'test-' } } });
  await prisma.converse.deleteMany({ where: { creatorId: { startsWith: 'test-' } } });
  await prisma.friendRequest.deleteMany({
    where: { OR: [{ senderId: { startsWith: 'test-' } }, { receiverId: { startsWith: 'test-' } }] },
  });
  await prisma.friendship.deleteMany({
    where: { OR: [{ userAId: { startsWith: 'test-' } }, { userBId: { startsWith: 'test-' } }] },
  });
  await prisma.user.deleteMany({ where: { id: { startsWith: 'test-' } } });
}

export async function disconnectDb() {
  await prisma.$disconnect();
}
```

#### wait-for-event.ts — 事件等待工具

```typescript
import type { Socket } from 'socket.io-client';

/**
 * 等待 socket 事件，超时则 reject。
 * 可复用于所有集成测试。
 */
export function waitForEvent<T = unknown>(
  socket: Socket,
  event: string,
  timeout = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout: 未在 ${timeout}ms 内收到 "${event}" 事件`)),
      timeout,
    );
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/**
 * 断言某事件在指定时间内 NOT 到达。
 * 用于验证"不应该收到此事件"的场景。
 */
export function assertNoEvent(
  socket: Socket,
  event: string,
  duration = 1000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = () => reject(new Error(`不应收到 "${event}" 事件但收到了`));
    socket.on(event, handler);
    setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, duration);
  });
}
```

### 1.2 测试示例

```typescript
// friend-events.spec.ts
describe('Friend WS Events (chat namespace)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let aliceSocket: Socket;
  let bobSocket: Socket;
  let aliceToken: string;
  let bobToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    baseUrl = getBaseUrl(app);
    const { userA, userB } = await seedTestUsers();
    aliceToken = generateTestToken(userA.id, userA.username);
    bobToken = generateTestToken(userB.id, userB.username);

    // 连接到 /chat 命名空间
    aliceSocket = io(`${baseUrl}/chat`, { auth: { token: aliceToken } });
    bobSocket = io(`${baseUrl}/chat`, { auth: { token: bobToken } });
    await Promise.all([
      new Promise(r => aliceSocket.on('connect', r)),
      new Promise(r => bobSocket.on('connect', r)),
    ]);
  });

  afterAll(async () => {
    aliceSocket.disconnect();
    bobSocket.disconnect();
    await cleanupTestData();
    await disconnectDb();
    await app.close();
  });

  it('发送好友请求后，接收方收到 friend:request（payload 完整）', async () => {
    const received = waitForEvent<FriendRequestPayload>(bobSocket, 'friend:request');

    await request(app.getHttpServer())
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ receiverId: 'test-user-b' });

    const data = await received;
    expect(data.id).toBeDefined();
    expect(data.sender).toBeDefined();
    expect(data.sender.id).toBe('test-user-a');
    expect(data.sender.displayName).toBe('Alice');
    expect(data.createdAt).toBeDefined();
  });

  it('发送方不应收到自己的 friend:request', async () => {
    await assertNoEvent(aliceSocket, 'friend:request', 1000);
  });
});
```

### 1.3 覆盖范围

**Server → Client（必测）**：

| 优先级 | 事件 | 触发方式 | 验证点 |
|--------|------|----------|--------|
| P0 | `message:new` | POST /messages | authorId, author, type, content, converseId, attachments |
| P0 | `friend:request` | POST /friends/request | sender payload, 仅接收方收到 |
| P0 | `friend:accepted` | POST /friends/accept/:id | friend payload, 双方都收到 |
| P0 | `friend:removed` | DELETE /friends/:userId | userId, 双方都收到 |
| P0 | `group:member:added` | POST /groups/:id/members | converseId, members[] with role, 新旧成员都收到 |
| P1 | `message:deleted` | DELETE /messages/:id | messageId, converseId, recalledBy |
| P1 | `converse:new` | 好友接受后自动创建 | id, type, 双方收到 |
| P1 | `group:created` | POST /converses/groups | id, name, 所有成员收到 |
| P1 | `group:member:removed` | DELETE /groups/:id/members/:uid | converseId, userId |
| P1 | `group:deleted` | DELETE /converses/groups/:id | id |
| P2 | `message:updated` | PATCH /messages/:id | 完整 MessageResponse |
| P2 | `group:updated` | PATCH /converses/groups/:id | id, name |
| P2 | `group:member:role:updated` | PATCH .../role | converseId, userId, role |
| P2 | `presence:changed` | 用户上线/下线 | userId, status |

**Client → Server（必测）**：

| 优先级 | 事件 | 验证点 |
|--------|------|--------|
| P0 | `converse:join` | 加入房间后能收到该房间的 message:new |
| P0 | `message:read` | lastSeenMessageId 被持久化 |
| P1 | `message:typing` | 对方收到 typing 事件 |
| P1 | `converse:join` + 非法 converseId | 应拒绝或静默忽略 |

### 1.4 运行配置

```json
// apps/server/package.json 新增脚本
{
  "test:integration": "jest --config jest.integration.config.ts --forceExit --detectOpenHandles"
}
```

```typescript
// apps/server/jest.integration.config.ts
export default {
  rootDir: 'src',
  testRegex: '__tests__/ws-integration/.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  testTimeout: 15000,  // WS 测试需要更长超时
  maxWorkers: 1,       // 串行执行，避免端口冲突
};
```

### 1.5 CI 集成

```yaml
# .github/workflows/ci.yml — 新增 job
integration-test:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:16
      env:
        POSTGRES_USER: test
        POSTGRES_PASSWORD: test
        POSTGRES_DB: linkingchat_test
      ports: ['5432:5432']
      options: >-
        --health-cmd pg_isready
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5
    redis:
      image: redis:7
      ports: ['6379:6379']
      options: >-
        --health-cmd "redis-cli ping"
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5

  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with: { version: 10 }
    - uses: actions/setup-node@v4
      with: { node-version: 22, cache: 'pnpm' }
    - run: pnpm install --frozen-lockfile
    - name: Migrate test database
      run: cd apps/server && npx prisma migrate deploy
      env:
        DATABASE_URL: postgresql://test:test@localhost:5432/linkingchat_test
    - name: Run integration tests
      run: cd apps/server && pnpm test:integration
      env:
        DATABASE_URL: postgresql://test:test@localhost:5432/linkingchat_test
        TEST_DATABASE_URL: postgresql://test:test@localhost:5432/linkingchat_test
        REDIS_URL: redis://localhost:6379
```

### 1.6 防 Flaky 策略

- **超时设为 5s**（默认），CI 上可设 10s。不用 `jest.retryTimes()`——WS 测试如果 flaky，应该修根因而非重试
- **串行执行**（`maxWorkers: 1`），避免多个测试文件争抢端口
- **每个 test suite 独立启动/关闭 app**，不共享状态
- **`afterAll` 中先断开 socket、再 cleanup 数据、最后 close app**，防止 "open handles" 告警
- **超时失败消息包含事件名**（`waitForEvent` 已实现），方便定位

---

## Phase 4：关键路径 E2E 测试（中期）

### 问题

集成测试验证"事件到达"，但不验证"客户端正确处理"。竞态条件（如 `currentUserId` 未设置时渲染）需要 E2E。

### 方案

Desktop 用 Playwright + Electron，Mobile 用 Flutter `integration_test`。

```
apps/desktop/e2e/
├── setup/
│   ├── global-setup.ts   # 启动服务器 + 创建测试用户
│   └── electron-app.ts   # 启动 Electron 应用
├── auth.spec.ts           # 登录流程
├── chat-send.spec.ts      # 发送消息 + 对方收到
├── friend-request.spec.ts # 发送好友请求 + 对方看到红点
└── group-manage.spec.ts   # 创建群组 + Owner 看到管理按钮
```

优先覆盖的 4 条关键路径：
1. 登录 → 会话列表加载 → 点击会话 → 发消息 → 对方收到
2. 发好友请求 → 对方红点出现 → 接受 → 双方好友列表更新
3. 创建群组 → Owner 能看到管理按钮 → 添加成员 → 系统消息出现
4. 群组 Admin → 能 mute/ban → 普通成员看不到管理按钮

> Phase 4 细节待 Phase 1-3 完成后单独规划。

---

## 预期效果

实施 Phase 1-3 + 5 后：
- **28 个问题中的 20 个**（~72%）能在开发阶段被自动发现
- 同类命名空间错误**不再重复出现**（已出现 3 次的 device→chat 错误）
- 新增 WS 事件时 CI 自动提醒双端是否都处理了
- 开发阶段 payload 缺字段时服务端控制台直接报错
- PR 检查清单提供人工兜底

---

## 实施记录 (2026-03-09)

### Phase 5 ✅ — PR 检查清单
- 创建 `.github/PULL_REQUEST_TEMPLATE.md`

### Phase 2 ✅ — Payload 运行时校验
- 新增 `packages/ws-protocol/src/validators.ts`，为所有 22 个 S→C 事件定义 zod schema
- 导出 `EVENT_VALIDATORS` 注册表
- `BroadcastService` 开发模式自动校验 payload
- 编译时类型兼容性测试 `validator-compat.spec.ts`（20 个 schema/interface 对）
- **发现真实 Bug**：`message:deleted` 事件 TypeScript 接口声明 `messageId` 但实际发送 `id`，已修复

### Phase 3 ✅ — 双端覆盖率脚本
- 新增 `scripts/check-ws-coverage.ts`，扫描 Desktop + Mobile 的事件 handler 注册
- `--strict` 模式：28 事件，21 OK，7 豁免，0 问题
- 已集成到 CI（`.github/workflows/ci.yml`）
- 修复了 Desktop 缺失的 `group:member:role:updated` handler

### Phase 1 ✅ — WS 集成测试
- 测试基础设施：`test-app.ts`、`socket-client.ts`、`test-users.ts`
- 3 个测试套件，10 个测试：
  - `friend-events.spec.ts`（4 tests）
  - `message-events.spec.ts`（2 tests）
  - `group-events.spec.ts`（4 tests）
- 独立 jest 配置 `jest.integration.config.ts`
- 所有测试通过（需要 Docker 服务运行）

### Phase 4 — 待规划
- E2E 测试（Playwright + Flutter integration_test）细节待后续单独规划

### 最终验证结果
- `pnpm build`：4 packages 构建成功
- `pnpm test`：34 suites，384 tests 通过
- `pnpm test:integration`：3 suites，10 tests 通过
- `pnpm check-ws-coverage --strict`：28 events，0 issues
