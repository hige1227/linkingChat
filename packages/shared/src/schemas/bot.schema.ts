import { z } from 'zod';

// ── agentConfig 结构验证 ────────────────────────────

export const agentConfigSchema = z.object({
  /** Agent system prompt — 定义 Bot 行为和人格 */
  systemPrompt: z.string().min(1).max(10000),

  /** LLM 提供商 — 决定调用哪个 AI 模型 */
  llmProvider: z.enum(['deepseek', 'kimi']).default('deepseek'),

  /** 具体模型名 — 可选，未指定时使用 provider 默认模型 */
  llmModel: z.string().optional(),

  /** 可用工具列表 — 如 ["system.run", "camera.snap"] */
  tools: z.array(z.string()).default([]),

  /** 最大输出 token 数 */
  maxTokens: z.number().int().min(1).max(100000).optional(),

  /** 生成温度 — 0 = 确定性，2 = 最大随机性 */
  temperature: z.number().min(0).max(2).optional(),
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;

// ── 创建 Bot 请求体验证 ────────────────────────────

export const createBotSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  type: z
    .enum(['REMOTE_EXEC', 'SOCIAL_MEDIA', 'CUSTOM'])
    .default('REMOTE_EXEC'),
  agentConfig: agentConfigSchema,
  isPinned: z.boolean().optional(),
});

export type CreateBotInput = z.infer<typeof createBotSchema>;

// ── 更新 Bot 请求体验证 ────────────────────────────

export const updateBotSchema = createBotSchema.partial();

export type UpdateBotInput = z.infer<typeof updateBotSchema>;
