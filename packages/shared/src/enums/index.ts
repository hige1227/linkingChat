export enum DevicePlatform {
  DARWIN = 'darwin',
  WIN32 = 'win32',
  LINUX = 'linux',
}

export enum CommandStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum DeviceStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
}

// ========== Sprint 2 新增 ==========

/** 用户在线状态 */
export enum UserStatus {
  ONLINE = 'ONLINE',
  IDLE = 'IDLE',
  DND = 'DND',
  OFFLINE = 'OFFLINE',
}

/** 好友请求状态 */
export enum FriendRequestStatus {
  PENDING = 'PENDING',
  REJECTED = 'REJECTED',
}

/** 会话类型 */
export enum ConverseType {
  /** 1 对 1 私聊 */
  DM = 'DM',
  /** 多人私聊 */
  MULTI = 'MULTI',
  /** 群组频道 */
  GROUP = 'GROUP',
}

/** 消息类型 */
export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  FILE = 'FILE',
  VOICE = 'VOICE',
  /** 系统消息（加入群组、好友添加等） */
  SYSTEM = 'SYSTEM',
  /** Bot 通知卡片消息 */
  BOT_NOTIFICATION = 'BOT_NOTIFICATION',
}

/** Bot 类型 */
export enum BotType {
  /** 远程执行（MVP 唯一类型） */
  REMOTE_EXEC = 'REMOTE_EXEC',
  /** 社媒运营 (v1.x) */
  SOCIAL_MEDIA = 'SOCIAL_MEDIA',
  /** 自定义 (v2.0) */
  CUSTOM = 'CUSTOM',
}

/** 群组成员角色 */
export enum GroupRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}
