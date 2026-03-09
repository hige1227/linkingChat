/**
 * Type compatibility check: ensures zod schemas stay in sync with TypeScript interfaces.
 * If a schema and interface diverge, this file will fail to compile.
 */
import type { z } from 'zod';
import type {
  MessageResponse,
  FriendRequestPayload,
  FriendAcceptedPayload,
  FriendRemovedPayload,
  ConverseNewPayload,
  ConverseResponse,
  TypingPayload,
  MessageReadPayload,
  PresencePayload,
  GroupCreatedPayload,
  GroupUpdatedPayload,
  GroupDeletedPayload,
  GroupMemberAddedPayload,
  GroupMemberRemovedPayload,
  GroupMemberRoleUpdatedPayload,
} from '@linkingchat/ws-protocol';
import type {
  WhisperSuggestionsPayload,
  DraftCreatedPayload,
  DraftExpiredPayload,
  PredictiveActionPayload,
  BotNotificationPayload,
} from '@linkingchat/ws-protocol';
import type {
  MessageNewSchema,
  FriendRequestSchema,
  FriendAcceptedSchema,
  FriendRemovedSchema,
  ConverseNewSchema,
  ConverseUpdatedSchema,
  TypingSchema,
  MessageReadSchema,
  PresenceChangedSchema,
  GroupCreatedSchema,
  GroupUpdatedSchema,
  GroupDeletedSchema,
  GroupMemberAddedSchema,
  GroupMemberRemovedSchema,
  GroupMemberRoleUpdatedSchema,
  WhisperSuggestionsSchema,
  DraftCreatedSchema,
  DraftExpiredSchema,
  PredictiveActionSchema,
  BotNotificationSchema,
} from '@linkingchat/ws-protocol';

// Helper: checks that type A extends type B (A is assignable to B)
type AssertAssignable<_A extends B, B> = true;

// Compile-time checks: if any schema output does not match its interface, tsc will error
type _M1 = AssertAssignable<z.infer<typeof MessageNewSchema>, MessageResponse>;
type _M2 = AssertAssignable<z.infer<typeof FriendRequestSchema>, FriendRequestPayload>;
type _M3 = AssertAssignable<z.infer<typeof FriendAcceptedSchema>, FriendAcceptedPayload>;
type _M4 = AssertAssignable<z.infer<typeof FriendRemovedSchema>, FriendRemovedPayload>;
type _M5 = AssertAssignable<z.infer<typeof ConverseNewSchema>, ConverseNewPayload>;
type _M6 = AssertAssignable<z.infer<typeof ConverseUpdatedSchema>, ConverseResponse>;
type _M7 = AssertAssignable<z.infer<typeof TypingSchema>, TypingPayload>;
type _M8 = AssertAssignable<z.infer<typeof MessageReadSchema>, MessageReadPayload>;
type _M9 = AssertAssignable<z.infer<typeof PresenceChangedSchema>, PresencePayload>;
type _M10 = AssertAssignable<z.infer<typeof GroupCreatedSchema>, GroupCreatedPayload>;
type _M11 = AssertAssignable<z.infer<typeof GroupUpdatedSchema>, GroupUpdatedPayload>;
type _M12 = AssertAssignable<z.infer<typeof GroupDeletedSchema>, GroupDeletedPayload>;
type _M13 = AssertAssignable<z.infer<typeof GroupMemberAddedSchema>, GroupMemberAddedPayload>;
type _M14 = AssertAssignable<z.infer<typeof GroupMemberRemovedSchema>, GroupMemberRemovedPayload>;
type _M15 = AssertAssignable<z.infer<typeof GroupMemberRoleUpdatedSchema>, GroupMemberRoleUpdatedPayload>;
type _M16 = AssertAssignable<z.infer<typeof WhisperSuggestionsSchema>, WhisperSuggestionsPayload>;
type _M17 = AssertAssignable<z.infer<typeof DraftCreatedSchema>, DraftCreatedPayload>;
type _M18 = AssertAssignable<z.infer<typeof DraftExpiredSchema>, DraftExpiredPayload>;
type _M19 = AssertAssignable<z.infer<typeof PredictiveActionSchema>, PredictiveActionPayload>;
type _M20 = AssertAssignable<z.infer<typeof BotNotificationSchema>, BotNotificationPayload>;

describe('Zod schema <-> TypeScript interface compatibility', () => {
  it('compiles without errors (type checking happens at build time)', () => {
    // The real check is that this file compiles via tsc.
    // If schemas drift from interfaces, type-check will fail.
    expect(true).toBe(true);
  });
});
