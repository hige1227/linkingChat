import { z } from 'zod';

// ── Base types ──

export const UserBriefSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
});

export const AttachmentPayloadSchema = z.object({
  id: z.string(),
  url: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  duration: z.number().nullable(),
  thumbnailUrl: z.string().nullable(),
});

// ── Message events ──

export const MessageNewSchema = z.object({
  id: z.string(),
  content: z.string().optional(),
  type: z.string(),
  converseId: z.string(),
  authorId: z.string(),
  author: z.object({
    id: z.string(),
    username: z.string(),
    displayName: z.string(),
    avatarUrl: z.string().nullable().optional(),
  }),
  metadata: z.record(z.unknown()).nullable().optional(),
  replyToId: z.string().nullable().optional(),
  attachments: z.array(AttachmentPayloadSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable().optional(),
});

export const MessageDeletedSchema = z.object({
  id: z.string(),
  converseId: z.string(),
  deletedAt: z.string().optional(),
  recalledBy: z.string().optional(),
});

// ── Friend events ──

export const FriendRequestSchema = z.object({
  id: z.string(),
  sender: UserBriefSchema,
  message: z.string().nullable(),
  createdAt: z.string(),
});

export const FriendAcceptedSchema = z.object({
  friendId: z.string(),
  friend: UserBriefSchema,
});

export const FriendRemovedSchema = z.object({
  userId: z.string(),
});

// ── Converse events ──

export const ConverseNewSchema = z.object({
  id: z.string(),
  type: z.string(),
  members: z.array(
    z.object({
      userId: z.string(),
      isOpen: z.boolean(),
    }),
  ),
  createdAt: z.string(),
});

const ConverseMemberSchema = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().optional(),
  role: z.string().optional(),
});

export const ConverseUpdatedSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  avatarUrl: z.string().optional(),
  creatorId: z.string().optional(),
  memberCount: z.number().optional(),
  members: z.array(ConverseMemberSchema),
  lastMessage: MessageNewSchema.optional(),
  unreadCount: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ── Typing / Read / Presence ──

export const TypingSchema = z.object({
  converseId: z.string(),
  userId: z.string(),
  username: z.string(),
  isTyping: z.boolean(),
});

export const MessageReadSchema = z.object({
  converseId: z.string(),
  lastSeenMessageId: z.string(),
});

export const PresenceChangedSchema = z.object({
  userId: z.string(),
  status: z.string(),
  lastSeenAt: z.string().optional(),
});

// ── Group events ──

const GroupMemberSchema = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable().optional(),
  role: z.string(),
});

export const GroupCreatedSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  creatorId: z.string(),
  members: z.array(GroupMemberSchema),
  createdAt: z.string(),
});

export const GroupUpdatedSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  updatedAt: z.string(),
});

export const GroupDeletedSchema = z.object({
  id: z.string(),
  deletedAt: z.string(),
});

export const GroupMemberAddedSchema = z.object({
  converseId: z.string(),
  members: z.array(GroupMemberSchema),
});

export const GroupMemberRemovedSchema = z.object({
  converseId: z.string(),
  userId: z.string(),
  removedBy: z.string(),
});

export const GroupMemberRoleUpdatedSchema = z.object({
  converseId: z.string(),
  userId: z.string(),
  role: z.string(),
  updatedBy: z.string(),
});

// ── AI events ──

export const WhisperSuggestionsSchema = z.object({
  suggestionId: z.string(),
  converseId: z.string(),
  messageId: z.string().optional(),
  primary: z.string(),
  alternatives: z.array(z.string()),
  createdAt: z.string(),
});

export const DraftCreatedSchema = z.object({
  draftId: z.string(),
  converseId: z.string(),
  botId: z.string(),
  botName: z.string(),
  draftType: z.enum(['message', 'command']),
  draftContent: z.object({
    content: z.string(),
    action: z.string().optional(),
    args: z.record(z.unknown()).optional(),
  }),
  expiresAt: z.string(),
  createdAt: z.string(),
});

export const DraftExpiredSchema = z.object({
  draftId: z.string(),
  converseId: z.string(),
});

export const PredictiveActionSchema = z.object({
  suggestionId: z.string(),
  converseId: z.string(),
  trigger: z.string(),
  actions: z.array(
    z.object({
      type: z.enum(['shell', 'message', 'file']),
      action: z.string(),
      description: z.string(),
      dangerLevel: z.enum(['safe', 'warning', 'dangerous']),
    }),
  ),
  createdAt: z.string(),
});

export const BotNotificationSchema = z.object({
  messageId: z.string(),
  converseId: z.string(),
  fromBotId: z.string(),
  fromBotName: z.string(),
  toBotId: z.string(),
  toBotName: z.string(),
  content: z.string(),
  triggerSource: z.object({
    botId: z.string(),
    botName: z.string(),
    reason: z.string(),
  }),
  createdAt: z.string(),
});

// ── Event → Schema registry ──

export const EVENT_VALIDATORS: Record<string, z.ZodSchema> = {
  // Chat events
  'message:new': MessageNewSchema,
  'message:updated': MessageNewSchema,
  'message:deleted': MessageDeletedSchema,
  'message:typing': TypingSchema,
  'message:read': MessageReadSchema,
  'friend:request': FriendRequestSchema,
  'friend:accepted': FriendAcceptedSchema,
  'friend:removed': FriendRemovedSchema,
  'converse:new': ConverseNewSchema,
  'converse:updated': ConverseUpdatedSchema,
  'presence:changed': PresenceChangedSchema,

  // Group events
  'group:created': GroupCreatedSchema,
  'group:updated': GroupUpdatedSchema,
  'group:deleted': GroupDeletedSchema,
  'group:member:added': GroupMemberAddedSchema,
  'group:member:removed': GroupMemberRemovedSchema,
  'group:member:role:updated': GroupMemberRoleUpdatedSchema,

  // AI events
  'ai:whisper:suggestions': WhisperSuggestionsSchema,
  'ai:draft:created': DraftCreatedSchema,
  'ai:draft:expired': DraftExpiredSchema,
  'ai:predictive:action': PredictiveActionSchema,
  'bot:cross:notify': BotNotificationSchema,
};
