import { z } from 'zod';

export const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  memberIds: z.array(z.string()).min(1).max(199),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

export const addMembersSchema = z.object({
  memberIds: z.array(z.string()).min(1).max(199),
});

export type AddMembersInput = z.infer<typeof addMembersSchema>;

export const updateMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER']),
});

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
