import { z } from 'zod';

export const deviceCommandSchema = z.object({
  targetDeviceId: z.string(),
  type: z.enum(['shell', 'file', 'automation']),
  action: z.string().min(1).max(10000),
  timeout: z.number().min(1000).max(300000).optional(),
});
