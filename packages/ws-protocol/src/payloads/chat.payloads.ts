// ========== 好友相关 ==========

/** 用户简要信息（嵌套在其他 payload 中） */
export interface UserBrief {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

/** friend:request 事件的 payload (S→C) */
export interface FriendRequestPayload {
  id: string;
  sender: UserBrief;
  message: string | null;
  createdAt: string; // ISO 8601
}

/** friend:accepted 事件的 payload (S→C) */
export interface FriendAcceptedPayload {
  friendId: string;
  friend: UserBrief;
}

/** friend:removed 事件的 payload (S→C) */
export interface FriendRemovedPayload {
  userId: string;
}

// ========== 消息相关 ==========

/** message:new / message:updated 事件的 payload */
export interface MessageResponse {
  id: string;
  content?: string;
  type: string; // MessageType
  converseId: string;
  authorId: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  metadata?: Record<string, unknown>;
  replyToId?: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  deletedAt?: string; // ISO 8601, null if not deleted
}

// ========== 会话相关 ==========

/** converse:new 事件的 payload (S→C) */
export interface ConverseNewPayload {
  id: string;
  type: string; // ConverseType
  members: Array<{
    userId: string;
    isOpen: boolean;
  }>;
  createdAt: string; // ISO 8601
}

/** converse:new / converse:updated 事件的 payload (REST/完整版) */
export interface ConverseResponse {
  id: string;
  type: string; // ConverseType
  name?: string;
  description?: string;
  avatarUrl?: string;
  creatorId?: string;
  memberCount?: number;
  members: Array<{
    userId: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    role?: string; // GroupRole
  }>;
  lastMessage?: MessageResponse;
  unreadCount?: number;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// ========== 输入状态 ==========

/** message:typing 事件的 payload */
export interface TypingPayload {
  converseId: string;
  userId: string;
  username: string;
  isTyping: boolean;
}

// ========== 已读回执 ==========

/** message:read 事件的 payload (C→S) */
export interface MessageReadPayload {
  converseId: string;
  lastSeenMessageId: string;
}

// ========== 在线状态 ==========

/** presence:update 事件的 payload (C→S) */
export interface PresenceUpdatePayload {
  status: string; // UserStatus
}

/** presence:changed 事件的 payload (S→C) */
export interface PresencePayload {
  userId: string;
  status: string; // UserStatus
  lastSeenAt?: string; // ISO 8601
}

// ========== 群组相关 ==========

/** group:created 事件的 payload (S→C) */
export interface GroupCreatedPayload {
  id: string;
  name: string;
  description?: string;
  creatorId: string;
  members: Array<{
    userId: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    role: string; // GroupRole
  }>;
  createdAt: string; // ISO 8601
}

/** group:updated 事件的 payload (S→C) */
export interface GroupUpdatedPayload {
  id: string;
  name?: string;
  description?: string | null;
  avatarUrl?: string | null;
  updatedAt: string; // ISO 8601
}

/** group:deleted 事件的 payload (S→C) */
export interface GroupDeletedPayload {
  id: string;
  deletedAt: string; // ISO 8601
}

/** group:member:added 事件的 payload (S→C) */
export interface GroupMemberAddedPayload {
  converseId: string;
  members: Array<{
    userId: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    role: string; // GroupRole
  }>;
}

/** group:member:removed 事件的 payload (S→C) */
export interface GroupMemberRemovedPayload {
  converseId: string;
  userId: string;
  removedBy: string;
}

/** group:member:role:updated 事件的 payload (S→C) */
export interface GroupMemberRoleUpdatedPayload {
  converseId: string;
  userId: string;
  role: string; // GroupRole
  updatedBy: string;
}
