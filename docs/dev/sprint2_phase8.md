# Sprint 2 — Phase 8: 群组聊天（Group Chat Server）

> **负责人**：后端
>
> **前置条件**：Phase 0（Schema）+ Phase 1（好友系统）+ Phase 2（DM 消息）+ Phase 3（在线状态）+ Phase 4（已读回执）+ Phase 5（Bot 系统）全部完成
>
> **产出**：GROUP 类型会话的完整生命周期 — 创建/编辑/删除群组、成员管理（邀请/移除/角色）、群消息收发复用现有消息系统、WS 实时群事件
>
> **参考**：[sprint2_implement.md](./sprint2_implement.md) | [database-schema.md](../dev-plan/database-schema.md) | [websocket-protocol.md](../dev-plan/websocket-protocol.md)

---

## `MULTI` vs `GROUP` 区分

当前 `ConverseType` 枚举包含 `DM`、`MULTI`、`GROUP` 三个值。明确语义：

| 类型 | 语义 | 角色管理 | 使用场景 |
|------|------|----------|---------|
| `DM` | 1 对 1 私聊 | 无 | 好友聊天、Bot DM |
| `GROUP` | 正式群组 | OWNER / ADMIN / MEMBER | 创建群组、成员管理、角色权限 |
| `MULTI` | 保留 — MVP 不使用 | 无 | 预留给未来"多人临时会话"（无管理权限的群聊），MVP 阶段不实现 |

> **MVP 原则**：Phase 8 仅实现 `GROUP` 类型。`MULTI` 保留在枚举中但不创建任何相关逻辑，避免无用代码。

---

## 任务清单

| # | 任务 | 文件 / 目录 | 依赖 |
|---|------|------------|------|
| 8.1 | Schema 扩展 — ConverseMember 角色 + Converse 群信息字段 | `apps/server/prisma/schema.prisma` | Phase 0 |
| 8.2 | 共享类型 — GroupRole 枚举 + WS 群事件 payload | `packages/shared` + `packages/ws-protocol` | 8.1 |
| 8.3 | 群组 CRUD — ConversesService 新增方法 | `apps/server/src/converses/converses.service.ts` | 8.1 |
| 8.4 | 群组成员管理 — 邀请/移除/角色/离开 | `apps/server/src/converses/converses.service.ts` | 8.3 |
| 8.5 | 群组 REST 端点 | `apps/server/src/converses/converses.controller.ts` | 8.3, 8.4 |
| 8.6 | WS 群事件广播 | `apps/server/src/gateway/chat.gateway.ts` | 8.2 |
| 8.7 | findUserConverses 适配 GROUP | `apps/server/src/converses/converses.service.ts` | 8.3 |
| 8.8 | DTO + 输入验证 | `apps/server/src/converses/dto/` | 8.5 |
| 8.9 | 单元测试 | `apps/server/src/converses/converses.service.spec.ts` | 8.3-8.7 |

---

## 8.1 Schema 扩展

### 新增枚举：GroupRole

```prisma
enum GroupRole {
  OWNER
  ADMIN
  MEMBER
}
```

### 修改 Converse model

```prisma
model Converse {
  id          String       @id @default(cuid())
  type        ConverseType
  name        String?
  description String?          // [新增] 群组描述
  avatarUrl   String?          // [新增] 群组头像
  creatorId   String?          // [新增] 创建者 userId（DM 为 null）
  maxMembers  Int        @default(500)  // [新增] 最大成员数
  deletedAt   DateTime?        // [新增] 软删除时间戳（群组解散时设置）
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  creator  User?            @relation("ConverseCreator", fields: [creatorId], references: [id])
  members  ConverseMember[]
  messages Message[]

  @@map("converses")
}
```

### 修改 ConverseMember model

```prisma
model ConverseMember {
  converseId        String
  userId            String
  isOpen            Boolean    @default(true)
  lastSeenMessageId String?
  lastMessageId     String?
  role              GroupRole?                      // [新增] 群组内角色（DM 为 null）
  nickname          String?                       // [新增] 群内昵称
  joinedAt          DateTime   @default(now())

  converse Converse @relation(fields: [converseId], references: [id])
  user     User     @relation(fields: [userId], references: [id])

  @@id([converseId, userId])
  @@map("converse_members")
}
```

### 修改 User model

新增关系字段：

```prisma
// 在 User model 中新增
createdConverses Converse[] @relation("ConverseCreator")
```

### Migration 命令

```bash
pnpm --filter @linkingchat/server exec prisma migrate dev --name group_chat
```

**注意**：`role` 字段为可选（nullable），DM 会话的 ConverseMember 记录保持 `null`，语义清晰。GROUP 成员由应用代码显式设置为 `OWNER`/`ADMIN`/`MEMBER`。`creatorId`、`description`、`deletedAt` 为可选字段，现有 DM 记录保持 null。

---

## 8.2 共享类型 — GroupRole 枚举 + WS 群事件 payload

### packages/shared/src/enums/index.ts

新增 `GroupRole` 枚举：

```typescript
export enum GroupRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}
```

### packages/ws-protocol/src/events.ts

在 `CHAT_EVENTS` 中新增：

```typescript
// Server → Client（群组事件）
GROUP_CREATED:       'group:created',
GROUP_UPDATED:       'group:updated',
GROUP_DELETED:       'group:deleted',
GROUP_MEMBER_ADDED:  'group:memberAdded',
GROUP_MEMBER_REMOVED:'group:memberRemoved',
GROUP_MEMBER_UPDATED:'group:memberUpdated',
```

### packages/ws-protocol/src/payloads/chat.payloads.ts

新增群组相关 payload 类型：

```typescript
// ========== 群组相关 ==========

/** 群组成员信息 */
export interface GroupMemberPayload {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  role: string; // GroupRole
  nickname?: string;
  joinedAt: string; // ISO 8601
}

/** group:created 事件 (S→C) */
export interface GroupCreatedPayload {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  creatorId: string;
  members: GroupMemberPayload[];
  createdAt: string; // ISO 8601
}

/** group:updated 事件 (S→C) */
export interface GroupUpdatedPayload {
  id: string;
  name?: string;
  description?: string;
  avatarUrl?: string;
  updatedAt: string; // ISO 8601
}

/** group:deleted 事件 (S→C) */
export interface GroupDeletedPayload {
  id: string;
}

/** group:memberAdded 事件 (S→C) */
export interface GroupMemberAddedPayload {
  converseId: string;
  member: GroupMemberPayload;
  addedBy: string; // userId of who added them
}

/** group:memberRemoved 事件 (S→C) */
export interface GroupMemberRemovedPayload {
  converseId: string;
  userId: string;
  removedBy: string; // userId of who removed them (self = left)
}

/** group:memberUpdated 事件 (S→C) */
export interface GroupMemberUpdatedPayload {
  converseId: string;
  userId: string;
  role?: string;     // new GroupRole
  nickname?: string; // new nickname（MVP 暂无 UI 入口，预留字段）
  updatedBy: string;
}
```

> **注意**：`nickname` 字段 MVP 阶段仅预留，Phase 9 不实现"修改群内昵称" UI 入口。v2 补充。

---

## 8.3 群组 CRUD — ConversesService 新增方法

### createGroup

```typescript
/**
 * 创建群组
 *
 * 1. 校验成员列表中所有用户存在
 * 2. 创建 Converse(type=GROUP) + ConverseMember 记录
 * 3. 创建者角色为 OWNER，其余为 MEMBER
 * 4. 插入 SYSTEM 消息："xxx 创建了群组"
 * 5. WS 广播 group:created 给所有成员
 */
async createGroup(
  creatorId: string,
  dto: CreateGroupDto,
): Promise<GroupResponse>
```

**CreateGroupDto**：

| 字段 | 类型 | 校验 | 说明 |
|------|------|------|------|
| `name` | string | `@MinLength(1) @MaxLength(100)` | 群名（必填） |
| `description` | string? | `@MaxLength(500)` | 群描述 |
| `avatarUrl` | string? | `@IsUrl()` | 群头像 |
| `memberIds` | string[] | `@ArrayMinSize(1) @ArrayMaxSize(498)` | 初始成员 userId 列表（不含创建者） |

**事务流程**：

```
$transaction {
  1. 校验所有 memberIds 对应的 User 存在
  2. converse.create({ type: 'GROUP', name, description, avatarUrl, creatorId })
  3. converseMember.createMany([
       { userId: creatorId, role: 'OWNER' },
       ...memberIds.map(id => ({ userId: id, role: 'MEMBER' }))
     ])
  4. message.create({ type: 'SYSTEM', content: `${displayName} 创建了群组`, converseId })
}
→ WS: group:created 广播给所有成员（通过 u-{userId} 个人房间）
```

### updateGroup

```typescript
/**
 * 更新群组信息
 * 仅 OWNER 和 ADMIN 可操作
 */
async updateGroup(
  userId: string,
  converseId: string,
  dto: UpdateGroupDto,
): Promise<GroupResponse>
```

**权限规则**：
- OWNER：可修改所有字段
- ADMIN：可修改 name、description、avatarUrl
- MEMBER：无权限（403）

### deleteGroup

```typescript
/**
 * 解散群组
 * 仅 OWNER 可操作
 *
 * 1. 校验调用者是 OWNER
 * 2. 软删除：设置 converse.deletedAt = now() + 关闭所有成员的 isOpen
 * 3. 插入 SYSTEM 消息："群组已解散"
 * 4. WS 广播 group:deleted 给所有成员（通过 u-{memberId} 个人房间）
 */
async deleteGroup(userId: string, converseId: string): Promise<void>
```

---

## 8.4 群组成员管理

### addMembers

```typescript
/**
 * 邀请新成员加入群组
 * OWNER 和 ADMIN 可操作
 *
 * 1. 校验会话为 GROUP 类型
 * 2. 校验调用者为 OWNER 或 ADMIN
 * 3. 校验不超过 maxMembers
 * 4. 校验目标用户存在且未在群中
 * 5. 创建 ConverseMember 记录
 * 6. 插入 SYSTEM 消息："xxx 邀请 yyy 加入了群组"
 * 7. WS 广播 group:memberAdded 给群内所有成员
 * 8. WS 广播 converse:new 给新成员（使其加入会话列表）
 *
 * MVP 好友关系校验：不强制要求被邀请者是邀请者的好友。
 * 原因：群组邀请场景中，ADMIN 可能邀请非自己好友但群内其他成员的好友。
 * v2 考虑：增加群组邀请确认机制（被邀请者需同意）。
 */
async addMembers(
  userId: string,
  converseId: string,
  dto: AddMembersDto,
): Promise<{ added: string[] }>
```

**AddMembersDto**：

| 字段 | 类型 | 校验 | 说明 |
|------|------|------|------|
| `memberIds` | string[] | `@ArrayMinSize(1) @ArrayMaxSize(50)` | 要添加的 userId 列表 |

### removeMember

```typescript
/**
 * 移除群组成员
 * OWNER 可移除任何人，ADMIN 可移除 MEMBER
 *
 * 权限矩阵：
 * - OWNER → 可踢 ADMIN 和 MEMBER
 * - ADMIN → 只可踢 MEMBER（不可踢其他 ADMIN 或 OWNER）
 * - MEMBER → 无踢人权限（403）
 *
 * 不可移除自己（应使用 leaveGroup）
 */
async removeMember(
  userId: string,
  converseId: string,
  targetUserId: string,
): Promise<void>
```

### updateMemberRole

```typescript
/**
 * 修改成员角色
 * 仅 OWNER 可操作
 *
 * 规则：
 * - 不可改变自己的角色
 * - 可将 MEMBER 提升为 ADMIN
 * - 可将 ADMIN 降级为 MEMBER
 * - 不可将他人设为 OWNER（转让群主需专门接口，MVP 暂不实现）
 */
async updateMemberRole(
  userId: string,
  converseId: string,
  targetUserId: string,
  role: 'ADMIN' | 'MEMBER',
): Promise<void>
```

### leaveGroup

```typescript
/**
 * 主动退出群组
 *
 * 规则：
 * - MEMBER / ADMIN：直接退出，关闭 isOpen
 * - OWNER：如果群内还有其他成员，需先转让群主（MVP 简化：自动转让给最早加入的 ADMIN
 *   `ORDER BY joinedAt ASC LIMIT 1`，无 ADMIN 则转给最早加入的 MEMBER），然后退出。
 *   注意：转让操作需在事务内完成，防止并发退群导致群组无主。
 * - 最后一人退出 → 群组标记删除
 */
async leaveGroup(userId: string, converseId: string): Promise<void>
```

---

## 8.5 群组 REST 端点

### ConversesController 新增端点

| Method | Path | 说明 | 权限 | 状态码 |
|--------|------|------|------|--------|
| POST | `/api/v1/converses/groups` | 创建群组 | JWT | 201 |
| PATCH | `/api/v1/converses/groups/:id` | 修改群组信息 | OWNER / ADMIN | 200 |
| DELETE | `/api/v1/converses/groups/:id` | 解散群组 | OWNER | 200 |
| POST | `/api/v1/converses/groups/:id/members` | 添加成员 | OWNER / ADMIN | 201 |
| DELETE | `/api/v1/converses/groups/:id/members/:memberId` | 移除成员 | OWNER / ADMIN | 200 |
| PATCH | `/api/v1/converses/groups/:id/members/:memberId` | 修改成员角色 | OWNER | 200 |
| POST | `/api/v1/converses/groups/:id/leave` | 退出群组 | 成员 | 200 |
| GET | `/api/v1/converses/groups/:id` | 群组详情（成员列表 + 角色） | 成员 | 200 |

### Controller 代码

```typescript
// apps/server/src/converses/converses.controller.ts

@Controller('converses')
@UseGuards(JwtAuthGuard)
export class ConversesController {
  constructor(private readonly conversesService: ConversesService) {}

  /** GET /api/v1/converses — 会话列表（已有） */
  @Get()
  findAll(@CurrentUser('userId') userId: string) { ... }

  /** POST /api/v1/converses/groups — 创建群组 */
  @Post('groups')
  @HttpCode(HttpStatus.CREATED)
  createGroup(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateGroupDto,
  ) {
    return this.conversesService.createGroup(userId, dto);
  }

  /** GET /api/v1/converses/groups/:id — 群组详情 */
  @Get('groups/:id')
  getGroupDetail(
    @CurrentUser('userId') userId: string,
    @Param('id') converseId: string,
  ) {
    return this.conversesService.getGroupDetail(userId, converseId);
  }

  /** PATCH /api/v1/converses/groups/:id — 修改群组 */
  @Patch('groups/:id')
  updateGroup(
    @CurrentUser('userId') userId: string,
    @Param('id') converseId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.conversesService.updateGroup(userId, converseId, dto);
  }

  /** DELETE /api/v1/converses/groups/:id — 解散群组 */
  @Delete('groups/:id')
  @HttpCode(HttpStatus.OK)
  deleteGroup(
    @CurrentUser('userId') userId: string,
    @Param('id') converseId: string,
  ) {
    return this.conversesService.deleteGroup(userId, converseId);
  }

  /** POST /api/v1/converses/groups/:id/members — 添加成员 */
  @Post('groups/:id/members')
  @HttpCode(HttpStatus.CREATED)
  addMembers(
    @CurrentUser('userId') userId: string,
    @Param('id') converseId: string,
    @Body() dto: AddMembersDto,
  ) {
    return this.conversesService.addMembers(userId, converseId, dto);
  }

  /** DELETE /api/v1/converses/groups/:id/members/:memberId — 移除成员 */
  @Delete('groups/:id/members/:memberId')
  @HttpCode(HttpStatus.OK)
  removeMember(
    @CurrentUser('userId') userId: string,
    @Param('id') converseId: string,
    @Param('memberId') targetUserId: string,
  ) {
    return this.conversesService.removeMember(userId, converseId, targetUserId);
  }

  /** PATCH /api/v1/converses/groups/:id/members/:memberId — 修改角色 */
  @Patch('groups/:id/members/:memberId')
  updateMemberRole(
    @CurrentUser('userId') userId: string,
    @Param('id') converseId: string,
    @Param('memberId') targetUserId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.conversesService.updateMemberRole(userId, converseId, targetUserId, dto.role);
  }

  /** POST /api/v1/converses/groups/:id/leave — 退出群组 */
  @Post('groups/:id/leave')
  @HttpCode(HttpStatus.OK)
  leaveGroup(
    @CurrentUser('userId') userId: string,
    @Param('id') converseId: string,
  ) {
    return this.conversesService.leaveGroup(userId, converseId);
  }
}
```

---

## 8.6 WS 群事件广播

群组事件通过已有的 `BroadcastService` 广播。**所有群事件均走 `/chat` 命名空间**（群组是聊天功能）：

| 事件 | 广播通道 | 接收方 | 说明 |
|------|----------|--------|------|
| `group:created` | `u-{memberId}` (chat 命名空间，个人房间) | 所有初始成员 | 新群出现在会话列表；成员尚未 join converseId 房间，所以走个人房间 |
| `group:updated` | `{converseId}` (chat 命名空间，会话房间) | 在群聊房间内的成员 | 群名/头像/描述变更 |
| `group:deleted` | `u-{memberId}` (chat 命名空间，个人房间) | 所有群成员 | 群组被解散；需确保所有成员收到（即使不在房间内） |
| `group:memberAdded` | `{converseId}` (chat 命名空间) + `u-{newMemberId}` | 群内成员 + 新成员 | 新成员通过个人房间收到 `converse:new` |
| `group:memberRemoved` | `{converseId}` (chat 命名空间) + `u-{removedId}` | 群内成员 + 被移除者 | 成员被移除 |
| `group:memberUpdated` | `{converseId}` (chat 命名空间) | 在群聊房间内的成员 | 角色变更 |

> **注意**：不使用 device 命名空间的 `unicast/listcast`。chat gateway 在连接时已将每个用户 join 到 `u-{userId}` 个人房间，`BroadcastService.toRoom()` 可直接使用。需要在 `BroadcastService` 中新增 `chatToRoom(roomId, event, data)` 方法或复用现有 `toRoom`，确保走 chat namespace。

**消息收发无需改动**：现有 `MessagesService.create()` 已通过 `converseId` 路由，不区分 DM/GROUP 类型。

---

## 8.7 findUserConverses 适配 GROUP

当前 `findUserConverses()` 针对 DM 会话做了 Bot 识别（查找"对方成员"）。GROUP 类型无单一"对方成员"概念，需要区分处理：

```typescript
// 修改点：构建响应时判断 converse.type
if (converse.type === 'GROUP') {
  return {
    id: converse.id,
    type: converse.type,
    name: converse.name,         // GROUP 有 name
    avatarUrl: converse.avatarUrl,
    memberCount: converse.members.length,
    members: converse.members.slice(0, 5).map(m => ({  // 列表只返回前 5 个成员预览
      userId: m.userId,
      ...m.user,
    })),
    lastMessage: converse.messages[0] ?? null,
    unreadCount,
    updatedAt: converse.updatedAt,
    isBot: false,
    isPinned: false,
    botInfo: null,
  };
}
```

**排序规则**：Bot 置顶 > 最后消息时间降序（GROUP 会话按正常时间排序，不特殊处理）。

**⚠️ 类型同步**：GROUP 响应新增了 `memberCount` 字段，需同步更新 `packages/ws-protocol/src/payloads/chat.payloads.ts` 中的 `ConverseResponse` 接口，新增：

```typescript
// ConverseResponse 新增字段
memberCount?: number;     // GROUP 类型返回成员总数
description?: string;     // GROUP 类型返回群描述
avatarUrl?: string;       // GROUP 类型返回群头像（DM 已有 member.avatarUrl）
```

---

## 8.8 DTO + 输入验证

### 新增文件

```
apps/server/src/converses/dto/
├── create-group.dto.ts         # name(必填), description, avatarUrl, memberIds
├── update-group.dto.ts         # name, description, avatarUrl（全部可选）
├── add-members.dto.ts          # memberIds(必填)
└── update-member-role.dto.ts   # role(必填, ADMIN | MEMBER)
```

### CreateGroupDto

```typescript
import { IsString, MinLength, MaxLength, IsOptional, IsUrl, IsArray, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(498)
  memberIds: string[];
}
```

### UpdateGroupDto

```typescript
import { IsString, MinLength, MaxLength, IsOptional, IsUrl } from 'class-validator';

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}
```

### AddMembersDto

```typescript
import { IsArray, IsString, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class AddMembersDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  memberIds: string[];
}
```

### UpdateMemberRoleDto

```typescript
import { IsEnum } from 'class-validator';

export class UpdateMemberRoleDto {
  @IsEnum(['ADMIN', 'MEMBER'])
  role: 'ADMIN' | 'MEMBER';
}
```

---

## 8.9 单元测试

### 预期测试用例（~30 个）

```
ConversesService (Group)
  createGroup
    ✓ should create group with creator as OWNER
    ✓ should create members with MEMBER role
    ✓ should insert SYSTEM message
    ✓ should throw BadRequestException when memberIds is empty
    ✓ should throw NotFoundException when member user does not exist
    ✓ should broadcast group:created to all members

  getGroupDetail
    ✓ should return group with all members and roles
    ✓ should throw ForbiddenException when not a member
    ✓ should throw NotFoundException when converse is not GROUP type

  updateGroup
    ✓ should update name when called by OWNER
    ✓ should update name when called by ADMIN
    ✓ should throw ForbiddenException when called by MEMBER
    ✓ should throw NotFoundException when group does not exist
    ✓ should broadcast group:updated

  deleteGroup
    ✓ should set converse.deletedAt and close all members' isOpen
    ✓ should insert SYSTEM message
    ✓ should throw ForbiddenException when not OWNER
    ✓ should broadcast group:deleted

  addMembers
    ✓ should add new members with MEMBER role
    ✓ should throw ForbiddenException when called by MEMBER
    ✓ should throw ConflictException when user already in group
    ✓ should throw BadRequestException when exceeding maxMembers
    ✓ should broadcast group:memberAdded

  removeMember
    ✓ should remove member when called by OWNER
    ✓ should throw ForbiddenException when ADMIN tries to remove ADMIN
    ✓ should throw ForbiddenException when MEMBER tries to remove anyone
    ✓ should throw BadRequestException when trying to remove self
    ✓ should broadcast group:memberRemoved

  updateMemberRole
    ✓ should promote MEMBER to ADMIN
    ✓ should demote ADMIN to MEMBER
    ✓ should throw ForbiddenException when not OWNER

  leaveGroup
    ✓ should remove member and close isOpen
    ✓ should auto-transfer ownership when OWNER leaves
    ✓ should delete group when last member leaves
```

---

## REST API 变更总览

### 新增端点（8 个）

| Method | Path | 说明 | 状态码 |
|--------|------|------|--------|
| POST | `/api/v1/converses/groups` | 创建群组 | 201 |
| GET | `/api/v1/converses/groups/:id` | 群组详情 | 200 |
| PATCH | `/api/v1/converses/groups/:id` | 修改群组信息 | 200 |
| DELETE | `/api/v1/converses/groups/:id` | 解散群组 | 200 |
| POST | `/api/v1/converses/groups/:id/members` | 添加成员 | 201 |
| DELETE | `/api/v1/converses/groups/:id/members/:memberId` | 移除成员 | 200 |
| PATCH | `/api/v1/converses/groups/:id/members/:memberId` | 修改角色 | 200 |
| POST | `/api/v1/converses/groups/:id/leave` | 退出群组 | 200 |

### 新增 WS 事件（6 个，通过 /chat 和 /device 命名空间）

| 事件 | 方向 | 说明 |
|------|------|------|
| `group:created` | Server→Client | 新群组创建通知（含完整群信息） |
| `group:updated` | Server→Client | 群组信息变更 |
| `group:deleted` | Server→Client | 群组被解散 |
| `group:memberAdded` | Server→Client | 新成员加入 |
| `group:memberRemoved` | Server→Client | 成员被移除/退出 |
| `group:memberUpdated` | Server→Client | 成员角色/昵称变更 |

---

## 设计笔记

### 消息系统零改动

现有 `MessagesService.create()` 通过 `converseId` 路由，已完全兼容 GROUP：
- `verifyMembership()` 检查成员身份 ✅
- `broadcastService.toRoom(converseId)` 广播到房间 ✅
- `getMemberIds()` 获取所有成员 ✅
- 游标分页 `findByConverse()` 不关心类型 ✅

唯一差异：GROUP 消息不会触发 `detectBotRecipient()`（Bot DM 是 1 对 1 概念）。

### 群组内 Bot

MVP 阶段不支持将 Bot 添加为群组成员。Bot 仅存在于 DM 会话中。Sprint 3 可扩展 `@bot` 群组提及功能。

### 权限矩阵

| 操作 | OWNER | ADMIN | MEMBER |
|------|-------|-------|--------|
| 修改群信息 | ✅ | ✅ | ❌ |
| 添加成员 | ✅ | ✅ | ❌ |
| 移除成员 | ✅（任何人） | ✅（仅 MEMBER） | ❌ |
| 修改角色 | ✅ | ❌ | ❌ |
| 解散群组 | ✅ | ❌ | ❌ |
| 退出群组 | ✅（需转让） | ✅ | ✅ |
| 发消息 | ✅ | ✅ | ✅ |

---

## 完成检查清单

- [ ] `prisma migrate dev --name group_chat` 执行成功
- [ ] `packages/shared` — GroupRole 枚举可用
- [ ] `packages/ws-protocol` — 6 个新 payload 类型 + 6 个新事件常量
- [ ] `pnpm build` — 4/4 packages 编译通过
- [ ] `pnpm test` — 所有现有测试 + ~30 个新测试通过
- [ ] POST /api/v1/converses/groups → 201，创建群组成功
- [ ] GET /api/v1/converses → 群组出现在会话列表，显示 memberCount 和 name
- [ ] PATCH /api/v1/converses/groups/:id → OWNER/ADMIN 可修改，MEMBER 403
- [ ] POST /api/v1/converses/groups/:id/members → 成功添加成员
- [ ] 消息收发在 GROUP 会话中正常工作（复用现有消息系统）
- [ ] WS group:* 事件正常广播
