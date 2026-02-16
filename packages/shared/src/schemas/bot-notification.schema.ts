import { z } from 'zod';

export const botNotificationActionSchema = z.object({
  label: z.string().min(1).max(50),
  action: z.enum(['view_result', 'retry', 'navigate']),
  payload: z.record(z.unknown()).optional(),
});

export const botNotificationMetadataSchema = z.object({
  cardType: z.enum(['task_complete', 'error', 'info', 'action_required']),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  sourceBotId: z.string().optional(),
  sourceBotName: z.string().optional(),
  actions: z.array(botNotificationActionSchema).max(3).optional(),
  executionTimeMs: z.number().int().min(0).optional(),
  timestamp: z.string().datetime(),
});

export type BotNotificationMetadataInput = z.infer<
  typeof botNotificationMetadataSchema
>;
