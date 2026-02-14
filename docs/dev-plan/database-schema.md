# 数据库 Schema 设计

> 基于 Prisma ORM + PostgreSQL，综合 Valkyrie v1、nestjs-chat、Tailchat 三大参考项目。
>
> 权威来源：[reference-architecture-guide.md](./reference-architecture-guide.md) §一
>
> 旧版（TypeORM）已归档至 `_archive/database-schema.md`

---

## 一、设计原则

| 原则 | 来源 | 说明 |
|------|------|------|
| **PostgreSQL Schema 分区** | nestjs-chat | 用 PG schema 隔离领域：`user`、`auth`、`chat`、`group`、`device` |
| **软删除** | nestjs-chat | 所有实体加 `deletedAt`，永不硬删除 |
| **CUID 主键** | Valkyrie (snowflake 思路) | 用 `cuid2` 替代自增 ID / UUID，分布式安全、URL 安全 |
| **JSONB 用于灵活字段** | Tailchat (MongoDB 嵌入) | 插件配置、消息 metadata 等用 JSONB，其余用关系表 |
| **独立关联表** | Valkyrie | 好友、成员、频道权限等用显式关联表，不用 M2M 隐式表 |

### 与旧设计的关键差异

| 维度 | 旧 (TypeORM) | 新 (Prisma) | 原因 |
|------|-------------|-------------|------|
| ORM | TypeORM + 手写 Entity | **Prisma** + 声明式 Schema | 类型安全更强、Migration 更可靠 |
| 主键 | `uuid` (`uuid_generate_v4()`) | **`cuid()`** | 分布式安全、URL 安全、无需数据库扩展 |
| 密码哈希 | bcrypt | **argon2** | 更快、抗 GPU/ASIC 攻击 |
| DM/群聊 | 单一 `conversations` 表 | **三层**: Group → Channel → Converse | 支持 Discord 式频道嵌套 |
| 已读追踪 | `lastReadAt` 时间戳 | **`lastSeenMessageId`** 游标 | 精确到消息粒度 |
| 消息撤回 | `isRecalled: boolean` | **`deletedAt`** 软删除 | 统一软删除模式 |

---

## 二、Entity 关系总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                           用户领域                                   │
│  User ─┬── FriendRequest (pending)                                  │
│        ├── Friendship (confirmed, bidirectional)                    │
│        ├── UserBlock (拉黑)                                         │
│        ├── Device ── Command (OpenClaw 远控)                        │
│        └── ConverseMember                                           │
├─────────────────────────────────────────────────────────────────────┤
│                           群组领域                                   │
│  Group ─┬── Channel (TEXT / SECTION / VOICE / PLUGIN)              │
│         ├── GroupMember (roles[], muteUntil)                        │
│         ├── GroupRole (permissions[])                                │
│         └── GroupBan                                                 │
├─────────────────────────────────────────────────────────────────────┤
│                           会话领域                                   │
│  Converse (DM / MULTI / GROUP)                                     │
│    ├── ConverseMember (isOpen, lastSeenMessageId)                  │
│    └── Message ── Attachment                                        │
├─────────────────────────────────────────────────────────────────────┤
│                           AI 领域                                    │
│  AiDraft (Draft & Verify 草稿)                                     │
│  AiSuggestion (Whisper 建议 [@ai 触发] + Predictive Actions)  │
├─────────────────────────────────────────────────────────────────┤
│                           Bot 领域                               │
│  Bot (多 Bot 框架，映射 OpenClaw agent config)                   │
├─────────────────────────────────────────────────────────────────────┤
│                           认证领域                                   │
│  RefreshToken (JWT RS256 刷新令牌)                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 三、完整 Prisma Schema

> 共 **18 个 Model**，完整定义见 reference-architecture-guide.md §1.2。
> 此处列出每个表的要点和关键索引。

### 3.1 用户领域

#### User

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `String @id @default(cuid())` | CUID 主键 |
| `email` | `String @unique` | 登录邮箱 |
| `username` | `String @unique` | 显示名 |
| `password` | `String` | argon2 哈希 |
| `displayName` | `String` | 昵称 |
| `avatarUrl` | `String?` | 头像 URL |
| `status` | `UserStatus @default(OFFLINE)` | ONLINE / IDLE / DND / OFFLINE |
| `deletedAt` | `DateTime?` | 软删除 |

#### FriendRequest

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `String @id @default(cuid())` | |
| `senderId` | `String` | FK → User |
| `receiverId` | `String` | FK → User |
| `status` | `FriendRequestStatus @default(PENDING)` | PENDING / REJECTED |

**约束**: `@@unique([senderId, receiverId])`

> 注意：接受后直接删除 FriendRequest 行 + 创建 Friendship 行，不设 ACCEPTED 状态。

#### Friendship

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `String @id @default(cuid())` | |
| `userAId` | `String` | 较小 ID 放 A |
| `userBId` | `String` | 较大 ID 放 B |

**约束**: `@@unique([userAId, userBId])`

> 双向查询：WHERE userAId = :me OR userBId = :me

#### UserBlock

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `String @id @default(cuid())` | |
| `blockerId` | `String` | 拉黑者 |
| `blockedId` | `String` | 被拉黑者 |

**约束**: `@@unique([blockerId, blockedId])`

### 3.2 群组领域

#### Group

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `String @id @default(cuid())` | |
| `name` | `String` | 群名 |
| `iconUrl` | `String?` | 群头像 |
| `description` | `String? @db.VarChar(120)` | 群简介 |
| `inviteCode` | `String @unique @default(cuid())` | 邀请码 |
| `ownerId` | `String` | 群主 |
| `config` | `Json @default("{}")` | 插件配置 (学 Tailchat) |

#### Channel

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `String @id @default(cuid())` | |
| `name` | `String` | 频道名 |
| `type` | `ChannelType @default(TEXT)` | TEXT / SECTION / VOICE / PLUGIN |
| `parentId` | `String?` | 分类嵌套 (学 Tailchat) |
| `groupId` | `String` | FK → Group |
| `converseId` | `String? @unique` | 关联到 Converse |
| `sortOrder` | `Int @default(0)` | 排序 |
| `pluginProvider` | `String?` | 插件面板标识 |
| `lastActivityAt` | `DateTime` | 排序依据 |

**索引**: `@@index([groupId])`

#### GroupMember

| 字段 | 类型 | 说明 |
|------|------|------|
| `userId` | `String` | 复合主键 |
| `groupId` | `String` | 复合主键 |
| `nickname` | `String?` | 群内昵称 |
| `roles` | `String[] @default([])` | 角色 ID 列表 |
| `muteUntil` | `DateTime?` | 禁言到期 |
| `lastSeenAt` | `DateTime` | 未读计算 |

**主键**: `@@id([userId, groupId])`

#### GroupRole / GroupBan

- `GroupRole`: `id`, `groupId`, `name`, `permissions[]`
- `GroupBan`: `@@id([userId, groupId])`, `reason?`, `bannedAt`

### 3.3 会话领域

#### Converse

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `String @id @default(cuid())` | |
| `type` | `ConverseType` | **DM** / **MULTI** / **GROUP** |
| `name` | `String?` | DM 时为空 |

> 统一消息管道：DM、多人私聊、群组频道的消息都通过 Converse 路由。

#### ConverseMember

| 字段 | 类型 | 说明 |
|------|------|------|
| `converseId` | `String` | 复合主键 |
| `userId` | `String` | 复合主键 |
| `isOpen` | `Boolean @default(true)` | DM 可见性 (学 Valkyrie) |
| `lastSeenMessageId` | `String?` | 最后已读消息 ID (学 nestjs-chat) |
| `lastMessageId` | `String?` | 最后一条消息 ID (反范式优化) |

**主键**: `@@id([converseId, userId])`

#### Message

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `String @id @default(cuid())` | |
| `content` | `String?` | 可为空 (纯文件消息) |
| `type` | `MessageType @default(TEXT)` | TEXT / IMAGE / FILE / VOICE / SYSTEM / BOT_NOTIFICATION / AI_DRAFT / AI_WHISPER / AI_PREDICTIVE |
| `converseId` | `String` | FK → Converse |
| `authorId` | `String` | FK → User |
| `metadata` | `Json?` | AI 扩展字段 |
| `deletedAt` | `DateTime?` | 软删除 = 撤回 |

**索引**: `@@index([converseId, createdAt])` — 分页查询核心索引

**分页策略**: 游标分页，每页 35 条，以 `createdAt` DESC 为游标。

#### Attachment

- `id`, `messageId` (FK → Message, CASCADE), `url`, `filename`, `mimeType`, `size?`
- 1:N 关系 (一条消息可多个附件)

### 3.4 设备领域 (OpenClaw)

#### Device

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `String @id @default(cuid())` | |
| `name` | `String` | 设备显示名 |
| `platform` | `String` | `"darwin"` / `"win32"` / `"linux"` |
| `status` | `DeviceStatus @default(OFFLINE)` | ONLINE / OFFLINE |
| `lastSeenAt` | `DateTime?` | |
| `userId` | `String` | FK → User |

**索引**: `@@index([userId])`

#### Command

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `String @id @default(cuid())` | |
| `type` | `String` | `"shell"` / `"file"` / `"automation"` |
| `payload` | `Json` | 命令内容 |
| `result` | `Json?` | 执行结果 |
| `status` | `CommandStatus @default(PENDING)` | PENDING / RUNNING / COMPLETED / FAILED / CANCELLED |
| `deviceId` | `String` | FK → Device |
| `issuerId` | `String` | 发命令的用户 |
| `completedAt` | `DateTime?` | |

**索引**: `@@index([deviceId, createdAt])`

### 3.5 Bot 领域 (2026-02-13 新增)

> 多 Bot 框架：每个 bot 映射到一个 OpenClaw agent config。MVP 仅远程执行能力，后续按需加 bot 类型。
> Bot 作为特殊 User（学 Tailchat），固定置顶在聊天列表中。

#### Bot

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `String @id @default(cuid())` | |
| `name` | `String` | Bot 显示名 |
| `description` | `String?` | Bot 用途描述 |
| `avatarUrl` | `String?` | Bot 头像 |
| `type` | `BotType @default(REMOTE_EXEC)` | REMOTE_EXEC / SOCIAL_MEDIA / CUSTOM (v2+) |
| `agentConfig` | `Json` | OpenClaw agent 配置（system prompt, LLM 路由, 工具集） |
| `ownerId` | `String` | 创建者 |
| `isPinned` | `Boolean @default(true)` | 是否固定置顶 |
| `userId` | `String @unique` | 关联的 User 记录（Bot 即 User） |

**索引**: `@@index([ownerId])`

> **Bot 间通信**：OpenClaw 底层支持 multi-agent orchestration，但 MVP 阶段 bot 各自独立，不互通。v2.0 再暴露编排能力。

### 3.6 AI 领域

#### AiDraft (Draft & Verify)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `String @id @default(cuid())` | |
| `content` | `String` | AI 生成的草稿 |
| `status` | `DraftStatus @default(PENDING)` | PENDING / APPROVED / REJECTED / EXPIRED |
| `userId` | `String` | |
| `converseId` | `String` | |
| `triggerMessageId` | `String?` | 触发草稿的消息 |
| `resolvedAt` | `DateTime?` | |

#### AiSuggestion (Whisper + Predictive)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `String @id @default(cuid())` | |
| `type` | `SuggestionType` | WHISPER / PREDICTIVE |
| `content` | `String` | |
| `metadata` | `Json?` | |
| `userId` | `String` | |
| `converseId` | `String` | |
| `triggerMessageId` | `String?` | |

### 3.7 认证领域

#### RefreshToken (学 nestjs-chat)

- `id`, `token` (unique), `userId`, `expiresAt`, `createdAt`
- 支持 JWT RS256 双密钥对 token 刷新

---

## 四、关键设计决策

### 4.1 统一 Converse 模型

学 Tailchat，所有消息流都经过 `Converse` 表。区别于旧设计的单一 `conversations` 表：

- **DM**: 创建 `Converse(type=DM)` + 两个 `ConverseMember`
- **多人私聊**: 创建 `Converse(type=MULTI)` + N 个 `ConverseMember`
- **群组频道**: 创建 `Channel` 时自动创建关联的 `Converse(type=GROUP)`

好处：消息查询、未读计数、会话列表排序等逻辑完全统一。

### 4.2 已读追踪

使用 `ConverseMember.lastSeenMessageId`（消息 ID 游标），而非旧设计的 `lastReadAt` 时间戳。

```sql
-- 未读消息数
SELECT COUNT(*) FROM messages m
WHERE m."converseId" = :converseId
  AND m."createdAt" > (
    SELECT m2."createdAt" FROM messages m2 WHERE m2.id = :lastSeenMessageId
  )
  AND m."authorId" != :userId;
```

### 4.3 消息撤回

使用 `deletedAt` 软删除，不再使用 `isRecalled` 布尔值。客户端判断 `deletedAt IS NOT NULL` 显示"已撤回"占位。

### 4.4 Group vs Converse 的关系

```
Group
  ├── Channel (TEXT, type=TEXT)  ──── converseId → Converse(type=GROUP)
  ├── Channel (分类, type=SECTION)
  │     ├── Channel (子频道, TEXT)  ── converseId → Converse(type=GROUP)
  │     └── Channel (插件, PLUGIN)
  └── GroupMember[]
```

Channel 是群组内的"面板"，TEXT 类型的 Channel 关联一个 Converse 来承载消息。

---

## 五、Migration 执行顺序

```
prisma/migrations/
  001_init/                    -- User, FriendRequest, Friendship, UserBlock
  002_groups/                  -- Group, Channel, GroupMember, GroupRole, GroupBan
  003_converses/               -- Converse, ConverseMember
  004_messages/                -- Message, Attachment
  005_devices/                 -- Device, Command
  006_auth/                    -- RefreshToken
  007_bots/                    -- Bot (多 Bot 框架)
  --- Sprint 2+ ---
  008_ai/                      -- AiDraft, AiSuggestion
```

```bash
# 开发环境
npx prisma migrate dev --name init

# 生产环境
npx prisma migrate deploy
```
