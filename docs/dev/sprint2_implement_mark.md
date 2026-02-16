# Sprint 2 实施记录

> **目标**：搭建完整的社交消息基础设施 — 好友系统、1对1聊天（DM）、在线状态、已读回执、Bot 系统、群组聊天、客户端 UI
>
> **本次完成**：Phase 0（Schema 扩展）+ Phase 1（好友系统 Server）+ Phase 2（DM 消息系统 Server）+ Phase 3（在线状态 Server）+ Phase 4（已读回执 Server）+ Phase 5（Bot 系统 Server）+ Phase 6（注册自动创建 Bot）+ Phase 7（Bot Chat UI）
>
> **完成日期**：2026-02-15
>
> **代码统计**：新增 49 个文件，修改 16 个文件，约 4,200 行代码 + 1,800 行测试
 ┌───────────────────────┬───────────┬────────┐
  │         邮箱          │   密码    │ 显示名 │
  ├───────────────────────┼───────────┼────────┤
  │ alice@linkingchat.com │ Test1234! │ Alice  │
  ├───────────────────────┼───────────┼────────┤
  │ bob@linkingchat.com   │ Test1234! │ Bob    │
  └───────────────────────┴───────────┴────────┘
---

## 当前进度

| Phase | 内容 | 状态 | 说明 |
|-------|------|------|------|
| Phase 0 | Schema 扩展 + 共享类型 + Seed | ✅ 完成 | 8 个新模型、5 个枚举、种子数据 |
| Phase 1 | 好友系统（Server） | ✅ 完成 | 7 个 REST 端点 + WS 实时通知 + 24 个单测 |
| Phase 2 | 1对1聊天（Server） | ✅ 完成 | 消息 CRUD + 游标分页 + ChatGateway + 16 个单测 |
| Phase 3 | 在线状态（Server） | ✅ 完成 | RedisModule + PresenceService + WS 集成 + 14 个单测 |
| Phase 4 | 已读回执（Server） | ✅ 完成 | message:read WS 事件 + getUnreadCount 公开化 + 10 个单测 |
| Phase 5 | Bot 系统 | ✅ 完成 | Bot CRUD + Bot-as-User + agentConfig Zod 验证 + 19 个单测 |
| Phase 6 | 注册自动创建 Bot | ✅ 完成 | BotInitService + bot-templates + AuthService 集成 + 6 个单测 |
| Phase 7 | Bot Chat UI | ✅ 完成 | Bot 识别+置顶 + BOT_NOTIFICATION 卡片 + Bot 消息路由检测 + Flutter/Desktop 组件 + 3 个单测 |
| Phase 8 | 群组聊天 | ⬜ 待开发 | |
| Phase 9 | Flutter + Desktop UI | ⬜ 待开发 | |

### 构建验证

```
pnpm build  → 4/4 packages 编译通过
pnpm test   → 7 suites, 94 tests passed

  PASS src/app.controller.spec.ts               (2 tests)
  PASS src/friends/friends.service.spec.ts       (24 tests)
  PASS src/messages/messages.service.spec.ts     (16 tests)
  PASS src/gateway/presence.service.spec.ts      (14 tests)
  PASS src/converses/converses.service.spec.ts   (13 tests)
  PASS src/bots/bots.service.spec.ts             (19 tests)
  PASS src/bots/bot-init.service.spec.ts         (6 tests)
```

---

## Phase 0：Schema 扩展 + 共享类型

### 一句话总结

扩展 Prisma 数据库 Schema（8 个新模型 + 5 个枚举），同步 TypeScript 共享枚举和 WS 协议类型定义，创建种子数据用于开发调试。

### 数据库变更

**新增 5 个枚举**：

| 枚举 | 值 |
|------|---|
| `UserStatus` | ONLINE, IDLE, DND, OFFLINE |
| `FriendRequestStatus` | PENDING, REJECTED |
| `ConverseType` | DM, MULTI, GROUP |
| `MessageType` | TEXT, IMAGE, FILE, VOICE, SYSTEM, BOT_NOTIFICATION |
| `BotType` | REMOTE_EXEC, SOCIAL_MEDIA, CUSTOM |

**新增/修改模型**：

| 模型 | 说明 | 关键字段 |
|------|------|----------|
| `User`（修改） | 增加社交字段 | status, lastSeenAt, deletedAt, 10 个新关联 |
| `FriendRequest` | 好友请求 | senderId, receiverId, status, message |
| `Friendship` | 好友关系（归一化） | userAId, userBId（@@unique，确保 A < B） |
| `UserBlock` | 拉黑记录 | blockerId, blockedId |
| `Converse` | 会话 | type(DM/MULTI/GROUP), name |
| `ConverseMember` | 会话成员 | converseId+userId(联合主键), isOpen, lastSeenMessageId, lastMessageId |
| `Message` | 消息 | content, type, authorId, converseId, replyToId, deletedAt(软删除) |
| `Attachment` | 附件 | messageId, fileUrl, mimeType, fileSize |
| `Bot` | Bot 实体 | name, type, ownerId, userId(关联 User 表) |

**索引**：
- `Message: @@index([converseId, createdAt])` — 消息游标分页的性能保障
- `Friendship: @@unique([userAId, userBId])` — 归一化保证唯一好友关系

### 共享类型变更

| 文件 | 变更 |
|------|------|
| `packages/shared/src/enums/index.ts` | 新增 5 个 TS 枚举（镜像 Prisma 枚举） |
| `packages/ws-protocol/src/events.ts` | 新增 `CHAT_EVENTS` 常量 |
| `packages/ws-protocol/src/payloads/chat.payloads.ts` | **新建**：定义 13 个 WS 负载类型 |
| `packages/ws-protocol/src/typed-socket.ts` | 新增 Chat 事件类型到 ClientToServer/ServerToClient Events |
| `packages/ws-protocol/src/index.ts` | 导出 chat.payloads |

### 种子数据

`apps/server/prisma/seed.ts`：创建 2 个测试用户（alice/bob）+ 1 对好友关系 + 1 个 DM 会话 + 3 条测试消息。

```bash
pnpm --filter @linkingchat/server exec prisma db seed
```

### 迁移

```bash
pnpm --filter @linkingchat/server exec prisma migrate dev --name social_and_bots
# → 生成 apps/server/prisma/migrations/20260214120954_social_and_bots/
```

---

## Phase 1：好友系统（Server）

### 一句话总结

搭建完整的好友模块：好友请求（发送/接受/拒绝）+ 好友列表 + 删除好友 + 拉黑用户 + 全链路 WS 实时通知 + BroadcastService 基础设施。

### 新增文件清单

```
apps/server/src/
├── gateway/
│   └── broadcast.service.ts            # [新建] WS 广播服务（unicast/listcast/emitToRoom/toRoom/toRoomIfNotIn）
│
├── friends/
│   ├── friends.module.ts               # FriendsModule（exports FriendsService）
│   ├── friends.controller.ts           # 7 个 REST 端点
│   ├── friends.service.ts              # 8 个业务方法
│   ├── friends.service.spec.ts         # 24 个单元测试
│   └── dto/
│       ├── send-request.dto.ts         # receiverId(必填) + message(可选，max 200)
│       └── friend-response.dto.ts      # id, username, displayName, avatarUrl, status, converseId
```

### 修改的已有文件

| 文件 | 变更 |
|------|------|
| `gateway/gateway.module.ts` | 添加 `@Global()` 装饰器 + 导出 BroadcastService |
| `gateway/device.gateway.ts` | 注入 BroadcastService，在 afterInit 调用 `setNamespace('device', ns)` |
| `app.module.ts` | 导入 FriendsModule |

### REST API 端点

| Method | Path | 说明 | 状态码 |
|--------|------|------|--------|
| POST | `/api/v1/friends/request` | 发送好友请求 | 201 |
| POST | `/api/v1/friends/accept/:requestId` | 接受好友请求 | 200 |
| POST | `/api/v1/friends/reject/:requestId` | 拒绝好友请求 | 200 |
| GET | `/api/v1/friends/requests` | 待处理请求列表（sent + received） | 200 |
| GET | `/api/v1/friends` | 好友列表（含在线状态 + DM 会话 ID） | 200 |
| DELETE | `/api/v1/friends/:userId` | 删除好友 | 200 |
| POST | `/api/v1/friends/block/:userId` | 拉黑用户 | 200 |

### WS 实时事件（通过 /device 命名空间）

| 事件 | 方向 | 触发场景 | 接收方 |
|------|------|----------|--------|
| `friend:request` | Server→Client | 收到好友请求 | 接收方 |
| `friend:accepted` | Server→Client | 好友请求被接受 | 双方 |
| `friend:removed` | Server→Client | 被删除好友/被拉黑 | 双方/被拉黑方 |
| `converse:new` | Server→Client | 好友接受后创建 DM | 双方 |

### 关键业务逻辑

**Friendship ID 归一化**：
```
[userId1, userId2].sort() → [userAId, userBId]
```
保证两个人之间只有一条好友关系记录，无论谁先加谁。

**sendRequest 7 步流程**：
1. 不能加自己（400）
2. 检查接收方存在（404）
3. 双向拉黑检查（403）
4. 已是好友检查（409）
5. 重复请求检查（互发请求自动接受）
6. 创建 FriendRequest
7. WS 通知接收方

**accept 事务操作**：
```
$transaction {
  1. 删除 FriendRequest
  2. 创建 Friendship（归一化 ID）
  3. 查找或创建 DM Converse（重新添加好友时复用已有会话）
}
→ WS 广播 friend:accepted（双方）+ converse:new（双方）
```

**blockUser 事务操作**：
```
$transaction {
  1. 创建 UserBlock
  2. 如果是好友 → 删除 Friendship + 关闭 DM（isOpen=false）
  3. 删除双方待处理的 FriendRequest
}
→ 如果之前是好友 → WS 通知被拉黑方 friend:removed
```

### 单元测试（24 个）

```
FriendsService
  sendRequest
    ✓ should throw BadRequestException when sending to self
    ✓ should throw NotFoundException when receiver does not exist
    ✓ should throw ForbiddenException when blocked
    ✓ should throw ConflictException when already friends
    ✓ should throw ConflictException when duplicate request
    ✓ should create request and broadcast to receiver
  accept
    ✓ should throw NotFoundException when request not found
    ✓ should throw ForbiddenException when not the receiver
    ✓ should throw ConflictException when not pending
    ✓ should create friendship with normalized IDs
  normalizeFriendshipIds
    ✓ should put smaller ID in userAId
    ✓ should handle equal IDs
  reject
    ✓ should throw NotFoundException when request not found
    ✓ should throw ForbiddenException when not the receiver
    ✓ should update status to REJECTED
    ✓ should not send WS notification on reject
  removeFriend
    ✓ should throw NotFoundException when not friends
    ✓ should delete friendship and close DM
  blockUser
    ✓ should throw BadRequestException when blocking self
    ✓ should throw NotFoundException when user not found
    ✓ should throw ConflictException when already blocked
    ✓ should create block and delete friendship if exists
    ✓ should not notify when no prior friendship
  getPendingRequests
    ✓ should return sent and received requests
```

---

## Phase 2：1对1聊天 / DM 消息系统（Server）

### 一句话总结

搭建完整的 DM 消息收发系统：REST 消息 CRUD + 游标分页 + `/chat` WebSocket 命名空间 + 输入状态指示 + BroadcastService 多命名空间重构。

### 新增文件清单

```
apps/server/src/
├── converses/
│   ├── converses.module.ts             # ConversesModule（exports ConversesService）
│   ├── converses.controller.ts         # GET /api/v1/converses
│   └── converses.service.ts            # findUserConverses + verifyMembership + getMemberIds + getUnreadCount
│
├── messages/
│   ├── messages.module.ts              # MessagesModule（imports ConversesModule）
│   ├── messages.controller.ts          # POST/GET/PATCH/DELETE /api/v1/messages
│   ├── messages.service.ts             # create + findByConverse + update + softDelete
│   ├── messages.service.spec.ts        # 16 个单元测试
│   └── dto/
│       ├── create-message.dto.ts       # converseId, content(max 10000), type(enum), replyToId
│       ├── update-message.dto.ts       # content(max 10000)
│       └── message-response.dto.ts     # 消息响应类型定义
│
├── gateway/
│   ├── broadcast.service.ts            # [重构] 多命名空间 Map + toRoom + toRoomIfNotIn
│   ├── chat.gateway.ts                 # [新建] /chat 命名空间 Gateway
│   └── gateway.module.ts              # [更新] 导入 ConversesModule + 注册 ChatGateway
```

### 修改的已有文件

| 文件 | 变更 |
|------|------|
| `gateway/broadcast.service.ts` | 从单 Namespace 重构为 `Map<string, Namespace>` 多命名空间；新增 `toRoom()` 和 `toRoomIfNotIn()` |
| `gateway/gateway.module.ts` | 新增 `imports: [ConversesModule]` + `providers: [ChatGateway]` |
| `gateway/device.gateway.ts` | `setNamespace(ns)` → `setNamespace('device', ns)` |
| `app.module.ts` | 导入 ConversesModule + MessagesModule |
| `friends/friends.service.spec.ts` | mock 对象新增 `toRoom` 和 `toRoomIfNotIn` 方法 |

### REST API 端点

| Method | Path | 说明 | 状态码 |
|--------|------|------|--------|
| GET | `/api/v1/converses` | 会话列表（含未读数 + 最后消息） | 200 |
| POST | `/api/v1/messages` | 发送消息 | 201 |
| GET | `/api/v1/messages?converseId=&cursor=&limit=` | 消息历史（游标分页） | 200 |
| PATCH | `/api/v1/messages/:id` | 编辑消息（仅作者） | 200 |
| DELETE | `/api/v1/messages/:id` | 撤回消息（软删除） | 200 |

### WS 命名空间：/chat

| 事件 | 方向 | 说明 |
|------|------|------|
| `converse:join` | Client→Server | 打开会话时加入房间（校验成员身份） |
| `converse:leave` | Client→Server | 离开会话房间 |
| `message:typing` | Client↔Server | 输入状态广播（排除发送者，2秒 debounce） |
| `message:new` | Server→Client | 新消息推送（发到 {converseId} 房间） |
| `message:updated` | Server→Client | 消息编辑通知 |
| `message:deleted` | Server→Client | 消息撤回通知 |
| `notification:new` | Server→Client | 不在会话房间的成员收到通知（发到 u-{userId}） |

### 关键技术设计

**BroadcastService 多命名空间架构**：

```
BroadcastService
  ├── namespaces: Map<string, Namespace>
  │     ├── 'device' → /device 命名空间（DeviceGateway 注册）
  │     └── 'chat'   → /chat 命名空间（ChatGateway 注册）
  │
  ├── unicast(userId, event, data)     → device 命名空间，u-{userId} 房间
  ├── listcast(userIds, event, data)   → device 命名空间
  ├── emitToRoom(roomId, event, data)  → device 命名空间
  │
  ├── toRoom(roomId, event, data)      → chat 命名空间，{converseId} 房间
  └── toRoomIfNotIn(target, exclude, event, data)
                                       → chat 命名空间，条件推送
```

**双通道通知机制**：

```
用户 A 在 conv_001 房间内（已打开聊天页）
用户 B 不在 conv_001 房间内（在其他页面）

消息发送后：
  → A 收到 message:new（通过 conv_001 房间，chat 命名空间）
  → B 收到 notification:new（通过 u-{B} 个人房间，chat 命名空间）
```

**游标分页**：

```
GET /api/v1/messages?converseId=conv1&limit=35

首次加载：不传 cursor → 返回最新 35 条 + hasMore + nextCursor
向上滚动：传 cursor=上页最后一条的 createdAt → 返回更早的 35 条

实现：查询 limit+1 条，多查的 1 条用于判断 hasMore，不返回给客户端
索引：@@index([converseId, createdAt]) 保证查询高效
```

**消息编辑/撤回权限控制**：
- 仅消息作者（`authorId === userId`）可编辑和删除
- 已删除的消息不可再次编辑/删除
- 删除使用软删除（设置 `deletedAt`），前端显示"已撤回"

### 单元测试（16 个）

```
MessagesService
  create
    ✓ should throw ForbiddenException when not a member
    ✓ should throw NotFoundException when replyTo message not found
    ✓ should throw NotFoundException when replyTo is from different converse
    ✓ should create message and broadcast to room
  findByConverse
    ✓ should throw ForbiddenException when not a member
    ✓ should return paginated messages with hasMore=false
    ✓ should return hasMore=true when more messages exist
    ✓ should pass cursor as createdAt filter
  update
    ✓ should throw NotFoundException when message not found
    ✓ should throw NotFoundException when message is deleted
    ✓ should throw ForbiddenException when not author
    ✓ should update message and broadcast
  softDelete
    ✓ should throw NotFoundException when message not found
    ✓ should throw NotFoundException when already deleted
    ✓ should throw ForbiddenException when not author
    ✓ should soft delete and broadcast
```

---

## Phase 3：在线状态系统（Server）

> **目标**：Redis-based 在线/离线状态管理 + 好友实时状态同步 + 批量状态查询 API

### 新增文件

| 文件 | 说明 |
|------|------|
| `redis/redis.module.ts` | @Global() Redis 模块，提供 `REDIS_CLIENT`（ioredis 实例） |
| `gateway/presence.service.ts` | 在线状态核心服务，封装 Redis SET/STRING 操作 + DB 同步 |
| `gateway/presence.service.spec.ts` | 14 个单元测试 |
| `users/users.module.ts` | UsersModule |
| `users/users.controller.ts` | GET /api/v1/users/online 批量状态查询端点 |

### 修改的已有文件

| 文件 | 变更 |
|------|------|
| `gateway/chat.gateway.ts` | 注入 PresenceService + FriendsService；handleConnection/handleDisconnect 集成在线状态；新增 `presence:update` handler + `broadcastPresenceChange` 私有方法 |
| `gateway/gateway.module.ts` | 新增 `imports: [FriendsModule]` + `providers: [PresenceService]` + `exports: [PresenceService]` |
| `friends/friends.service.ts` | 新增 `getFriendIds(userId)` 方法（返回好友 ID 列表） |
| `app.module.ts` | 导入 RedisModule + UsersModule |

### REST API 端点

| Method | Path | 说明 | 状态码 |
|--------|------|------|--------|
| GET | `/api/v1/users/online?ids=id1,id2,id3` | 批量查询用户在线状态（最多 200 个） | 200 |

### WS 事件

| 事件 | 方向 | 说明 |
|------|------|------|
| `presence:update` | Client→Server | 客户端主动切换状态（ONLINE/IDLE/DND） |
| `presence:changed` | Server→Client | 广播给好友的状态变更通知 |

### Redis 数据结构

```
Key                         Type     说明
─────────────────────────── ──────── ─────────────────────────────
online_users                SET      所有在线用户 ID 集合
user:status:{userId}        STRING   用户当前状态（TTL 300s 兜底）
user:sockets:{userId}       SET      用户的所有活跃 socket ID（多设备）
```

### 关键技术设计

**多设备在线管理**：

```
场景 1：手机连接 → socket A 加入 → 首次上线 → 广播 ONLINE
场景 2：桌面连接 → socket B 加入 → wasOnline=true → 不重复广播
场景 3：手机断开 → socket A 移除 → remaining=1 → 不广播
场景 4：桌面断开 → socket B 移除 → remaining=0 → 广播 OFFLINE + DB 更新
```

**状态广播路径**：
- 获取好友列表 → `FriendsService.getFriendIds(userId)`
- 逐个推送 → `BroadcastService.toRoom('u-{friendId}', 'presence:changed', payload)`
- 使用 chat 命名空间确保送达已连接到 /chat 的客户端

**TTL 兜底机制**：
- `user:status:{userId}` 设置 300s TTL
- 正常连接断开时 handleDisconnect 主动清理
- 极端情况（如服务器崩溃未触发 disconnect）5 分钟后自动过期

### 单元测试（14 个）

```
PresenceService
  setOnline
    ✓ should add user to online set, register socket, set status with TTL, and update DB
  setOffline
    ✓ should only remove socket when other sockets remain
    ✓ should fully mark offline when no sockets remain
  updateStatus
    ✓ should update Redis status with TTL and update DB
  refreshTtl
    ✓ should refresh TTL when key exists
    ✓ should not refresh TTL when key does not exist
  isOnline
    ✓ should return true when user is in online set
    ✓ should return false when user is not in online set
  getStatuses
    ✓ should return empty map for empty input
    ✓ should batch query statuses via pipeline
    ✓ should return OFFLINE for Redis errors
  getStatus
    ✓ should return status when key exists
    ✓ should return OFFLINE when key does not exist
  getOnlineCount
    ✓ should return count from Redis SET
```

---

## Phase 4：已读回执（Server）

> **目标**：消息级别的已读追踪 + 实时同步 — WS `message:read` 事件、未读计数重算

### 修改的已有文件

| 文件 | 变更 |
|------|------|
| `gateway/chat.gateway.ts` | 注入 PrismaService；新增 `@SubscribeMessage('message:read')` handler（校验成员+消息归属+防回退+DB 更新+房间广播） |
| `converses/converses.service.ts` | `getUnreadCount` 从 private 改为 public；新增 2-arg overload（自动查找 lastSeenMessageId）；lastSeenMessage 被删时 fallback 全量计数 |

### 新增文件

| 文件 | 说明 |
|------|------|
| `converses/converses.service.spec.ts` | 10 个单元测试（verifyMembership + getMemberIds + getUnreadCount 7 个边界场景） |

### WS 事件

| 事件 | 方向 | 说明 |
|------|------|------|
| `message:read` | Client→Server | 客户端发送已读回执 `{ converseId, lastSeenMessageId }` |
| `message:read` | Server→Client | 广播给同会话其他成员（排除发送者） |

### 关键技术设计

**message:read handler 5 步校验流程**：

```
1. 参数校验 — converseId 和 lastSeenMessageId 非空
2. 成员校验 — 用户是否为该会话成员（ConverseMember 查询）
3. 消息归属 — lastSeenMessageId 是否属于该 converseId（防跨会话篡改）
4. 防回退 — 对比 currentLastSeen.createdAt >= message.createdAt 则跳过
5. DB 更新 + 房间广播
```

**getUnreadCount 公开化 — 方法重载**：

```typescript
// 2-arg：自动从 DB 查找 lastSeenMessageId（供外部调用）
getUnreadCount(converseId, userId): Promise<number>

// 3-arg：接受已知 lastSeenMessageId（内部 findUserConverses 调用，避免重复查询）
getUnreadCount(converseId, userId, lastSeenMessageId): Promise<number>
```

**未读计数边界处理**：
- `lastSeenMessageId = null` → 从未已读，全部非自己消息算未读
- `lastSeenMessage` 被硬删除 → fallback 全量计数（而非返回 0）
- `authorId: { not: userId }` → 自己发的消息不算未读
- `deletedAt: null` → 已撤回消息不算未读

### 单元测试（10 个）

```
ConversesService
  verifyMembership
    ✓ should return member when found
    ✓ should throw ForbiddenException when not a member
  getMemberIds
    ✓ should return userId list
  getUnreadCount
    ✓ should return 0 when user is not a member (public overload)
    ✓ should count all non-own messages when lastSeenMessageId is null
    ✓ should count messages after lastSeenMessage createdAt
    ✓ should return 0 when all messages are read
    ✓ should fall back to full count when lastSeenMessage is deleted
    ✓ should work with explicit lastSeenMessageId parameter (3-arg overload)
    ✓ should count all when explicit lastSeenMessageId is null (3-arg overload)
```

---

## Phase 5：Bot 系统（Server）

> **目标**：Bot Model + CRUD API + Bot-as-User 关联 + agentConfig Zod 验证

### 新增文件

| 文件 | 说明 |
|------|------|
| `bots/bots.module.ts` | BotsModule（exports BotsService，供后续 Phase 调用 createWithTx） |
| `bots/bots.controller.ts` | 5 个 REST CRUD 端点（POST/GET/GET:id/PATCH/DELETE） |
| `bots/bots.service.ts` | Bot + User 联创、CRUD、agentConfig 验证、createWithTx |
| `bots/bots.service.spec.ts` | 19 个单元测试 |
| `bots/dto/create-bot.dto.ts` | class-validator 输入验证 |
| `bots/dto/update-bot.dto.ts` | 所有字段可选 |
| `bots/dto/bot-response.dto.ts` | 响应类型定义（接口） |
| `packages/shared/src/schemas/bot.schema.ts` | agentConfig Zod schema + createBotSchema + updateBotSchema |

### 修改的已有文件

| 文件 | 变更 |
|------|------|
| `app.module.ts` | 导入 BotsModule |
| `packages/shared/src/schemas/index.ts` | 导出 bot.schema 的所有 schemas 和类型 |
| `apps/server/package.json` | 新增 `@linkingchat/shared` workspace 依赖 + Jest moduleNameMapper |

### REST API 端点

| Method | Path | 说明 | 状态码 |
|--------|------|------|--------|
| POST | `/api/v1/bots` | 创建 Bot（事务中同时创建 Bot User） | 201 |
| GET | `/api/v1/bots` | 当前用户的 Bot 列表（isPinned 置顶） | 200 |
| GET | `/api/v1/bots/:id` | Bot 详情（仅 owner） | 200 |
| PATCH | `/api/v1/bots/:id` | 更新 Bot 配置（同步 Bot User displayName/avatarUrl） | 200 |
| DELETE | `/api/v1/bots/:id` | 删除 Bot（硬删 Bot + 软删 Bot User，isDeletable=false 返回 403） | 204 |

### 关键技术设计

**Bot-as-User 关联**：
- 每个 Bot 创建时在同一事务中创建一条 User 记录
- Bot User 使用不可登录的凭证：`bot-{random}@bot.linkingchat.internal` + argon2 随机密码
- Bot User 的 displayName/avatarUrl 与 Bot 保持同步（update 时一起更新）
- 删除 Bot 时硬删 Bot 记录、软删 User 记录（保留历史消息引用）

**agentConfig Zod 验证**：
- 在 `@linkingchat/shared` 中定义 `agentConfigSchema`
- 必填：`systemPrompt`（1-10000 字符）
- 可选：`llmProvider`（deepseek/kimi）、`llmModel`、`tools`（string[]）、`maxTokens`（1-100000）、`temperature`（0-2）
- create 和 update 时都执行验证

**createWithTx 内部方法**：
- 供 Phase 6 注册流程调用，在已有事务中创建系统 Bot（Supervisor、Coding Bot）
- 接收 Prisma 事务客户端，不自行开启事务
- isDeletable 由调用方指定（系统 Bot 为 false）

**Prisma InputJsonValue 类型处理**：
- `Record<string, unknown>` 与 Prisma 的 `InputJsonValue` 不兼容
- 使用 `as Prisma.InputJsonValue` 显式转换

**Jest ESM 兼容**：
- `@linkingchat/shared` 编译为 ESM（`"module": "ESNext"`），Jest 无法直接解析
- 通过 `moduleNameMapper` 将 `@linkingchat/shared` 映射到源码 TypeScript，由 ts-jest 编译

### 单元测试（19 个）

```
BotsService
  create
    ✓ should create Bot + Bot User in a transaction
    ✓ should create Bot User with @bot.linkingchat.internal email
    ✓ should create Bot User with bot_ username prefix
    ✓ should hash Bot User password with argon2
    ✓ should throw BadRequestException when agentConfig misses systemPrompt
    ✓ should throw BadRequestException when temperature is out of range
    ✓ should throw BadRequestException when llmProvider is invalid
  findByOwner
    ✓ should return bots ordered by isPinned desc, createdAt asc
    ✓ should return empty array when user has no bots
  findOne
    ✓ should return bot when found
    ✓ should throw NotFoundException when bot does not exist
    ✓ should throw NotFoundException when not owner
  update
    ✓ should update bot name and sync Bot User displayName
    ✓ should throw NotFoundException when bot does not exist
    ✓ should throw BadRequestException when agentConfig is invalid on update
  delete
    ✓ should delete bot and soft-delete Bot User
    ✓ should throw ForbiddenException when isDeletable is false
    ✓ should throw NotFoundException when bot does not exist
    ✓ should throw NotFoundException when not owner
```

---

## Phase 6：注册自动创建 Bot（Server）

> **目标**：用户注册时自动创建 Supervisor + Coding Bot，每个 Bot 自带 DM 会话和欢迎消息

### 新增文件

| 文件 | 说明 |
|------|------|
| `bots/bot-templates.ts` | BotTemplate 接口 + DEFAULT_BOT_TEMPLATES 常量（Supervisor + Coding Bot） |
| `bots/bot-init.service.ts` | createDefaultBots() + createBotWithDm()（独立事务） |
| `bots/bot-init.service.spec.ts` | 6 个单元测试 |

### 修改的已有文件

| 文件 | 变更 |
|------|------|
| `bots/bots.module.ts` | 新增 BotInitService 到 providers 和 exports |
| `auth/auth.module.ts` | 导入 BotsModule |
| `auth/auth.service.ts` | 注入 BotInitService + Logger；register() 中 try-catch 调用 createDefaultBots() |

### 关键技术设计

**Bot 模板数据驱动**：
- `DEFAULT_BOT_TEMPLATES` 静态数组，新增 Bot 只需追加模板，无需改动其他代码
- 每个模板包含：name、description、type、agentConfig、isPinned、isDeletable、welcomeMessage

**每 Bot 独立事务（4 步）**：
```
$transaction {
  1. botsService.createWithTx(tx, userId, config) → { bot, botUser }
  2. tx.converse.create({ type: 'DM' })
  3. tx.converseMember.createMany([user, bot])
  4. tx.message.create({ welcomeMessage, authorId: bot.userId })
}
```

**注册不阻塞**：
- AuthService.register() 使用 try-catch 包裹 createDefaultBots()
- Bot 创建失败仅记录 Logger.error，不影响注册成功返回 token

**默认 Bot 配置**：

| Bot | 描述 | agentConfig.tools | isDeletable |
|-----|------|-------------------|-------------|
| Supervisor | 智能助手管家，通知汇总+调度中心 | [] | false |
| Coding Bot | 远程代码执行助手 | ['system.run', 'system.which'] | false |

### 单元测试（6 个）

```
BotInitService
  createDefaultBots
    ✓ should create bots for all default templates
    ✓ should call createWithTx for each template with correct params
    ✓ should create DM converse for each bot
    ✓ should create ConverseMember for both user and bot
    ✓ should insert welcome message from bot user
    ✓ should propagate error if a transaction fails
```

---

## Phase 7：Bot Chat UI（全端）

> **目标**：Bot 会话置顶显示、Bot 身份标识角标、BOT_NOTIFICATION 消息卡片渲染、Bot 消息路由检测

### 新增文件

| 文件 | 说明 |
|------|------|
| `packages/shared/src/types/bot-notification.ts` | BotNotificationMetadata + BotNotificationAction 接口定义 |
| `packages/shared/src/schemas/bot-notification.schema.ts` | Zod 验证 schema（cardType, title, actions 等） |
| `apps/mobile/lib/core/constants/bot_notification_types.dart` | Flutter 端 BOT_NOTIFICATION 常量镜像 |
| `apps/mobile/lib/features/chat/widgets/notification_card.dart` | Flutter 通知卡片组件（4 种 cardType 样式） |
| `apps/mobile/lib/features/chat/widgets/bot_badge.dart` | Flutter Bot 头像角标叠加层 |
| `apps/mobile/lib/features/chat/widgets/converse_tile.dart` | Flutter 会话列表 tile（含 Bot 识别 + 置顶） |
| `apps/mobile/lib/features/chat/widgets/message_bubble.dart` | Flutter 消息气泡（BOT_NOTIFICATION/SYSTEM/TEXT 分支渲染） |
| `apps/desktop/src/renderer/components/NotificationCard.tsx` | Desktop 通知卡片组件 |
| `apps/desktop/src/renderer/components/BotBadge.tsx` | Desktop Bot 头像角标组件 |

### 修改的已有文件

| 文件 | 变更 |
|------|------|
| `apps/server/src/converses/converses.service.ts` | findUserConverses() 增加 Bot 识别（批量查询 Bot 表）+ isBot/isPinned/botInfo 字段 + isPinned 置顶排序 |
| `apps/server/src/messages/messages.service.ts` | create() 新增 detectBotRecipient() fire-and-forget 调用（Sprint 2 仅日志） |
| `apps/server/src/converses/converses.service.spec.ts` | 新增 3 个 findUserConverses 测试（non-Bot / Bot / 置顶排序） |
| `apps/server/src/messages/messages.service.spec.ts` | 新增 bot mock + detectBotRecipient 默认返回值 |
| `packages/shared/src/schemas/index.ts` | 导出 botNotificationMetadataSchema + botNotificationActionSchema |
| `packages/shared/src/index.ts` | 导出 BotNotificationMetadata + BotNotificationAction 类型 |

### 关键技术设计

**Bot 识别批量查询优化**：
```
findUserConverses():
  1. 查询用户所有 open 的 ConverseMember（含 Converse + members + lastMessage）
  2. 收集所有"对方成员" userId → dedupe
  3. 一次 bot.findMany({ where: { userId: { in: [...] } } }) 批量查询
  4. 构建 botByUserId Map，O(1) 查找
  → 避免 N+1 查询，只需 1 次额外 DB 查询
```

**Bot 消息路由检测（detectBotRecipient）**：
- 消息创建 + 广播后，异步检测收件人是否为 Bot
- `.catch()` 捕获错误仅记录日志，不影响消息返回
- Sprint 2：仅 `Logger.log()` 记录路由结果
- Sprint 3：接入 BotPipelineService 生成 AI 回复

**API 响应扩展**：
```typescript
// GET /api/v1/converses 响应新增字段
{
  isBot: boolean;            // 对方成员是否为 Bot
  isPinned: boolean;         // Bot 是否置顶
  botInfo: {                 // Bot 详细信息（非 Bot 为 null）
    id: string;
    name: string;
    type: 'REMOTE_EXEC' | 'SOCIAL_MEDIA' | 'CUSTOM';
  } | null;
}
```

**BOT_NOTIFICATION 卡片类型**：

| cardType | 颜色 | 用途 |
|----------|------|------|
| `task_complete` | 绿色 | 任务执行成功 |
| `error` | 红色 | 任务执行失败 |
| `info` | 蓝色 | 一般信息通知 |
| `action_required` | 黄色 | 需要用户操作 |

### 单元测试（新增 3 个，ConversesService）

```
ConversesService
  findUserConverses
    ✓ should return isBot=false for non-Bot conversations
    ✓ should return isBot=true with botInfo for Bot conversations
    ✓ should sort isPinned Bot conversations to top
```

---

## 编译期修复记录

| 问题 | 原因 | 修复方式 |
|------|------|----------|
| `npx prisma migrate dev` 拉取 Prisma v7 | npx 从 npm 全局拉取最新版，与项目本地 v6.19.2 不兼容 | 改用 `pnpm --filter @linkingchat/server exec prisma migrate dev` |
| `prisma generate` EPERM | DLL 被运行中的 Node 进程锁定 | 非阻塞问题 — TS 类型已在 migration 时正确生成 |
| `mockPrisma` 循环引用类型错误 | `$transaction: jest.fn((fn) => fn(mockPrisma))` 导致隐式 `any` | 显式声明 `const mockPrisma: any = {...}` |
| `sendRequest` 返回类型联合 | 自动接受路径返回 `{friendshipId, converseId}`，正常路径返回 `{id, status}` | 测试中使用 `(result as any).id` |
| `Record<string, unknown>` 不兼容 Prisma `InputJsonValue` | Prisma 6 严格的 JSON 类型定义 | 使用 `as Prisma.InputJsonValue` 显式转换 |
| Jest 无法解析 `@linkingchat/shared` ESM 输出 | shared 包编译为 ESM（`export *`），Jest 期望 CommonJS | 在 server package.json Jest 配置中添加 `moduleNameMapper` 映射到源码 TS |
| `message.content: string | null` 类型不兼容 | Prisma 的 `content` 字段可为 null，detectBotRecipient 参数声明为 `string` | 改为 `string | null` + `(message.content ?? '').substring(0, 100)` |

---

## 手动验证方法

### 前提

```bash
pnpm docker:up           # 启动 PostgreSQL + Redis
pnpm dev:server           # 启动 NestJS (localhost:3008)
```

### 获取 JWT Token

```bash
# 注册两个测试用户（如果 seed 数据不可用）
curl -X POST http://localhost:3008/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@test.com","username":"alice","password":"Test1234!","displayName":"Alice"}'

curl -X POST http://localhost:3008/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@test.com","username":"bob","password":"Test1234!","displayName":"Bob"}'

# 登录获取 token
curl -X POST http://localhost:3008/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@test.com","password":"Test1234!"}'
# → 记录 accessToken 为 $ALICE

curl -X POST http://localhost:3008/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@test.com","password":"Test1234!"}'
# → 记录 accessToken 为 $BOB
```

### 验证好友系统

```bash
# 1. Alice 发送好友请求给 Bob（需要 Bob 的 userId）
curl -X POST http://localhost:3008/api/v1/friends/request \
  -H "Authorization: Bearer $ALICE" \
  -H "Content-Type: application/json" \
  -d '{"receiverId":"<bob_userId>","message":"Hi Bob!"}'
# → 201, { id: "req_xxx", status: "PENDING" }

# 2. Bob 查看待处理请求
curl http://localhost:3008/api/v1/friends/requests \
  -H "Authorization: Bearer $BOB"
# → 200, { sent: [], received: [{ id: "req_xxx", user: {...}, message: "Hi Bob!" }] }

# 3. Bob 接受请求
curl -X POST http://localhost:3008/api/v1/friends/accept/<requestId> \
  -H "Authorization: Bearer $BOB"
# → 200, { friendshipId: "f_xxx", converseId: "conv_xxx" }

# 4. 验证好友列表
curl http://localhost:3008/api/v1/friends \
  -H "Authorization: Bearer $ALICE"
# → 200, [{ id: "bob_id", username: "bob", displayName: "Bob", status: "OFFLINE", converseId: "conv_xxx" }]

# 5. 验证边界条件
# 自己加自己 → 400
curl -X POST http://localhost:3008/api/v1/friends/request \
  -H "Authorization: Bearer $ALICE" \
  -H "Content-Type: application/json" \
  -d '{"receiverId":"<alice_userId>"}'

# 重复请求 → 409
curl -X POST http://localhost:3008/api/v1/friends/request \
  -H "Authorization: Bearer $ALICE" \
  -H "Content-Type: application/json" \
  -d '{"receiverId":"<bob_userId>"}'
```

### 验证消息系统

```bash
# 1. 查看会话列表（接受好友后自动创建 DM 会话）
curl http://localhost:3008/api/v1/converses \
  -H "Authorization: Bearer $ALICE"
# → 200, [{ id: "conv_xxx", type: "DM", members: [...], lastMessage: null, unreadCount: 0 }]

# 2. 发送消息
curl -X POST http://localhost:3008/api/v1/messages \
  -H "Authorization: Bearer $ALICE" \
  -H "Content-Type: application/json" \
  -d '{"converseId":"<converseId>","content":"你好 Bob！"}'
# → 201, { id: "msg_xxx", content: "你好 Bob！", type: "TEXT", author: {...} }

# 3. 查询消息历史
curl "http://localhost:3008/api/v1/messages?converseId=<converseId>" \
  -H "Authorization: Bearer $ALICE"
# → 200, { messages: [...], hasMore: false, nextCursor: null }

# 4. 编辑消息（仅作者）
curl -X PATCH http://localhost:3008/api/v1/messages/<messageId> \
  -H "Authorization: Bearer $ALICE" \
  -H "Content-Type: application/json" \
  -d '{"content":"修改后的消息"}'
# → 200

# 5. Bob 尝试编辑 Alice 的消息 → 403
curl -X PATCH http://localhost:3008/api/v1/messages/<messageId> \
  -H "Authorization: Bearer $BOB" \
  -H "Content-Type: application/json" \
  -d '{"content":"我来改"}'
# → 403 Forbidden

# 6. 撤回消息
curl -X DELETE http://localhost:3008/api/v1/messages/<messageId> \
  -H "Authorization: Bearer $ALICE"
# → 200, { id: "msg_xxx", deleted: true }

# 7. 游标分页（发送多条消息后测试）
curl "http://localhost:3008/api/v1/messages?converseId=<converseId>&limit=2" \
  -H "Authorization: Bearer $ALICE"
# → { messages: [最新2条], hasMore: true/false, nextCursor: "..." }
```

### 运行自动化测试

```bash
# 全部测试（66 个）
pnpm test

# 只跑好友测试
pnpm --filter @linkingchat/server exec jest friends

# 只跑消息测试
pnpm --filter @linkingchat/server exec jest messages

# 只跑在线状态测试
pnpm --filter @linkingchat/server exec jest presence

# 只跑会话+已读测试
pnpm --filter @linkingchat/server exec jest converses

# 全量构建
pnpm build
```

### 验收检查清单

| # | 验收项 | 操作 | 预期结果 |
|---|--------|------|----------|
| 1 | 发送好友请求 | POST /friends/request | 201, 返回请求 ID |
| 2 | 自己加自己 | 同上，receiverId = 自己 | 400 Bad Request |
| 3 | 重复请求 | 再发一次相同请求 | 409 Conflict |
| 4 | 查看待处理请求 | GET /friends/requests | 200, sent + received 分组 |
| 5 | 接受请求 | POST /friends/accept/:id | 200, 返回 friendshipId + converseId |
| 6 | 好友列表 | GET /friends | 200, 含在线状态和 DM 会话 ID |
| 7 | 删除好友 | DELETE /friends/:userId | 200, success: true |
| 8 | 拉黑用户 | POST /friends/block/:userId | 200, 自动清理好友+请求 |
| 9 | 会话列表 | GET /converses | 200, 含未读数 + 最后消息 |
| 10 | 发送消息 | POST /messages | 201, 返回完整消息对象 |
| 11 | 消息历史分页 | GET /messages?converseId=&limit=2 | hasMore + nextCursor |
| 12 | 编辑消息 | PATCH /messages/:id | 200, 内容已更新 |
| 13 | 非作者编辑 | 用其他账号 PATCH | 403 Forbidden |
| 14 | 撤回消息 | DELETE /messages/:id | 200, deleted: true |
| 15 | 重复撤回 | 再次 DELETE 同一消息 | 404 已删除 |

---

## 文件变更总览

### 新增文件（49 个）

```
apps/server/prisma/
├── seed.ts                             # 种子数据（alice, bob, friendship, DM, messages）
├── migrations/20260214.../migration.sql # Schema 迁移

apps/server/src/
├── redis/
│   └── redis.module.ts                 # [新建] @Global Redis 模块（REDIS_CLIENT provider）
│
├── gateway/
│   ├── broadcast.service.ts            # [新建] WS 多命名空间广播服务
│   ├── chat.gateway.ts                 # [新建] /chat 命名空间 Gateway
│   ├── presence.service.ts             # [新建] Redis-based 在线状态管理
│   └── presence.service.spec.ts        # [新建] 14 个测试
│
├── friends/
│   ├── friends.module.ts
│   ├── friends.controller.ts           # 7 个端点
│   ├── friends.service.ts              # 9 个方法（含 getFriendIds）
│   ├── friends.service.spec.ts         # 24 个测试
│   └── dto/
│       ├── send-request.dto.ts
│       └── friend-response.dto.ts
│
├── converses/
│   ├── converses.module.ts
│   ├── converses.controller.ts         # 1 个端点
│   ├── converses.service.ts            # 5 个方法（含公开 getUnreadCount）
│   └── converses.service.spec.ts       # [新建] 10 个测试
│
├── messages/
│   ├── messages.module.ts
│   ├── messages.controller.ts          # 4 个端点
│   ├── messages.service.ts             # 4 个方法
│   ├── messages.service.spec.ts        # 16 个测试
│   └── dto/
│       ├── create-message.dto.ts
│       ├── update-message.dto.ts
│       └── message-response.dto.ts
│
├── users/
│   ├── users.module.ts                 # [新建] Users 模块
│   └── users.controller.ts             # [新建] GET /api/v1/users/online
│
├── bots/
│   ├── bots.module.ts                  # [新建] Bot CRUD 模块（Phase 6: + BotInitService）
│   ├── bots.controller.ts             # [新建] 5 个 REST 端点
│   ├── bots.service.ts                # [新建] Bot + User 联创 + CRUD + createWithTx
│   ├── bots.service.spec.ts           # [新建] 19 个测试
│   ├── bot-init.service.ts            # [新建 Phase 6] 注册自动创建 Bot
│   ├── bot-init.service.spec.ts       # [新建 Phase 6] 6 个测试
│   ├── bot-templates.ts               # [新建 Phase 6] 默认 Bot 模板（Supervisor + Coding Bot）
│   └── dto/
│       ├── create-bot.dto.ts          # [新建] class-validator 输入验证
│       ├── update-bot.dto.ts          # [新建] 所有字段可选
│       └── bot-response.dto.ts        # [新建] 响应类型定义

packages/shared/src/schemas/
└── bot.schema.ts                       # [新建] agentConfig + createBot + updateBot Zod schemas

packages/shared/src/types/
└── bot-notification.ts                 # [新建 Phase 7] BotNotificationMetadata 接口

packages/shared/src/schemas/
└── bot-notification.schema.ts          # [新建 Phase 7] BotNotification Zod schema

packages/ws-protocol/src/
└── payloads/chat.payloads.ts           # 13 个 WS 负载类型

apps/mobile/lib/
├── core/constants/
│   └── bot_notification_types.dart     # [新建 Phase 7] BOT_NOTIFICATION 常量
│
└── features/chat/widgets/
    ├── notification_card.dart          # [新建 Phase 7] Flutter 通知卡片组件
    ├── bot_badge.dart                  # [新建 Phase 7] Flutter Bot 头像角标
    ├── converse_tile.dart              # [新建 Phase 7] Flutter 会话列表 tile
    └── message_bubble.dart             # [新建 Phase 7] Flutter 消息气泡

apps/desktop/src/renderer/components/
├── NotificationCard.tsx                # [新建 Phase 7] Desktop 通知卡片组件
└── BotBadge.tsx                        # [新建 Phase 7] Desktop Bot 头像角标
```

### 修改文件（16 个）

| 文件 | 变更说明 |
|------|----------|
| `apps/server/prisma/schema.prisma` | 8 个新模型 + 5 个枚举 + User 扩展 |
| `apps/server/src/app.module.ts` | 导入 RedisModule + FriendsModule + ConversesModule + MessagesModule + UsersModule + BotsModule |
| `apps/server/src/gateway/gateway.module.ts` | @Global + 导入 ConversesModule + FriendsModule + ChatGateway + PresenceService |
| `apps/server/src/gateway/device.gateway.ts` | setNamespace 签名更新 |
| `apps/server/src/gateway/chat.gateway.ts` | Phase 3: 在线状态；Phase 4: message:read handler + PrismaService 注入 |
| `apps/server/src/converses/converses.service.ts` | Phase 4: getUnreadCount 公开化；Phase 7: Bot 识别 + isPinned 置顶排序 |
| `apps/server/src/converses/converses.service.spec.ts` | Phase 7: 新增 3 个 findUserConverses 测试 + bot mock |
| `apps/server/src/messages/messages.service.ts` | Phase 7: 新增 detectBotRecipient() fire-and-forget |
| `apps/server/src/messages/messages.service.spec.ts` | Phase 7: 新增 bot mock + detectBotRecipient 默认返回 |
| `apps/server/src/friends/friends.service.ts` | 新增 getFriendIds() 方法 |
| `packages/shared/src/enums/index.ts` | 5 个新枚举 |
| `packages/shared/src/schemas/index.ts` | Phase 5: bot.schema；Phase 7: bot-notification.schema 导出 |
| `packages/shared/src/index.ts` | Phase 7: 导出 BotNotificationMetadata + BotNotificationAction 类型 |
| `packages/ws-protocol/src/typed-socket.ts` | Chat 事件类型 |
| `apps/server/package.json` | Phase 5: 新增 @linkingchat/shared 依赖 + Jest moduleNameMapper |
| `apps/server/src/auth/auth.module.ts` | Phase 6: 导入 BotsModule |
| `apps/server/src/auth/auth.service.ts` | Phase 6: 注入 BotInitService + Logger；register() 中 try-catch 调用 createDefaultBots() |

---

## REST API 端点总览（Sprint 2 新增）

### Friends（需要 JWT）

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/v1/friends/request` | 发送好友请求 |
| POST | `/api/v1/friends/accept/:requestId` | 接受好友请求 |
| POST | `/api/v1/friends/reject/:requestId` | 拒绝好友请求 |
| GET | `/api/v1/friends/requests` | 待处理请求（sent + received） |
| GET | `/api/v1/friends` | 好友列表 |
| DELETE | `/api/v1/friends/:userId` | 删除好友 |
| POST | `/api/v1/friends/block/:userId` | 拉黑用户 |

### Converses（需要 JWT）

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/v1/converses` | 当前用户的会话列表 |

### Messages（需要 JWT）

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/v1/messages` | 发送消息 |
| GET | `/api/v1/messages?converseId=&cursor=&limit=` | 消息历史（游标分页） |
| PATCH | `/api/v1/messages/:id` | 编辑消息 |
| DELETE | `/api/v1/messages/:id` | 撤回消息（软删除） |

### Users（需要 JWT）

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/v1/users/online?ids=id1,id2,...` | 批量查询在线状态（最多 200 个） |

### Bots（需要 JWT）

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/v1/bots` | 创建 Bot（事务中同时创建 Bot User） |
| GET | `/api/v1/bots` | 当前用户的 Bot 列表（isPinned 置顶） |
| GET | `/api/v1/bots/:id` | Bot 详情（仅 owner） |
| PATCH | `/api/v1/bots/:id` | 更新 Bot 配置（同步 Bot User displayName/avatarUrl） |
| DELETE | `/api/v1/bots/:id` | 删除 Bot（isDeletable=false 返回 403） |

### WebSocket 事件（/chat 命名空间，Sprint 2 新增）

| 事件 | 方向 | 说明 |
|------|------|------|
| `converse:join` | Client→Server | 加入会话房间 |
| `converse:leave` | Client→Server | 离开会话房间 |
| `message:typing` | Client↔Server | 输入状态广播 |
| `message:new` | Server→Client | 新消息（房间内成员） |
| `message:updated` | Server→Client | 消息编辑 |
| `message:deleted` | Server→Client | 消息撤回 |
| `notification:new` | Server→Client | 新消息通知（不在房间的成员） |
| `presence:update` | Client→Server | 主动切换在线状态（ONLINE/IDLE/DND） |
| `presence:changed` | Server→Client | 好友状态变更通知（上线/离线/切换） |
| `message:read` | Client↔Server | 已读回执（C→S 标记已读 + S→C 广播给其他成员） |

### WebSocket 事件（/device 命名空间，Phase 1 新增）

| 事件 | 方向 | 说明 |
|------|------|------|
| `friend:request` | Server→Client | 收到好友请求 |
| `friend:accepted` | Server→Client | 好友请求被接受 |
| `friend:removed` | Server→Client | 好友被删除/被拉黑 |
| `converse:new` | Server→Client | 新会话创建（好友接受后） |

---

## 下一步

| 优先级 | Phase | 内容 | 依赖 |
|--------|-------|------|------|
| P1 | Phase 8 | 群组聊天 | Phase 2 Converses + Phase 5 BotsService |
| P2 | Phase 9 | Flutter + Desktop 客户端 UI 集成 | Phase 1-8 全部 |
