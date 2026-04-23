import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { complete, type Context, type Model, type TextContent } from '@mariozechner/pi-ai';

export type LlmTaskType = 'whisper' | 'predictive' | 'chat' | 'draft' | 'complex_analysis';

@Injectable()
export class LlmConfigService implements OnModuleInit {
  private readonly logger = new Logger(LlmConfigService.name);

  private readonly deepseekModel: Model<'openai-completions'> = {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    api: 'openai-completions',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    reasoning: false,
    input: ['text'],
    cost: { input: 0.27, output: 1.10, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 64000,
    maxTokens: 8000,
  };

  private readonly kimiModel: Model<'openai-completions'> = {
    id: 'moonshot-v1-8k',
    name: 'Kimi',
    api: 'openai-completions',
    provider: 'kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    reasoning: false,
    input: ['text'],
    cost: { input: 0.5, output: 1.5, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8000,
    maxTokens: 2048,
  };

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const deepseekKey = this.config.get<string>('DEEPSEEK_API_KEY');
    const kimiKey = this.config.get<string>('KIMI_API_KEY');
    if (!deepseekKey) this.logger.warn('DEEPSEEK_API_KEY not set — DeepSeek calls will fail');
    if (!kimiKey) this.logger.warn('KIMI_API_KEY not set — Kimi calls will fail');
  }

  getModel(taskType: LlmTaskType): Model<'openai-completions'> {
    if (taskType === 'draft' || taskType === 'complex_analysis') {
      return this.kimiModel;
    }
    return this.deepseekModel;
  }

  async completeText(
    taskType: LlmTaskType,
    systemPrompt: string,
    userMessage: string,
    options?: { maxTokens?: number; temperature?: number; timeoutMs?: number },
  ): Promise<string | null> {
    const model = this.getModel(taskType);
    const apiKey =
      model.provider === 'kimi'
        ? (this.config.get<string>('KIMI_API_KEY') ?? '')
        : (this.config.get<string>('DEEPSEEK_API_KEY') ?? '');

    const context: Context = {
      systemPrompt,
      messages: [{ role: 'user', content: userMessage, timestamp: Date.now() }],
    };

    const callOptions = {
      apiKey,
      ...(options?.maxTokens != null ? { maxTokens: options.maxTokens } : {}),
      ...(options?.temperature != null ? { temperature: options.temperature } : {}),
    };

    const timeout = options?.timeoutMs ?? 10_000;
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), timeout),
    );

    try {
      const result = await Promise.race([complete(model, context, callOptions), timeoutPromise]);
      if (!result) return null;

      return result.content
        .filter((b): b is TextContent => b.type === 'text')
        .map((b) => b.text)
        .join('');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`LLM call failed [${taskType}]: ${msg}`);
      return null;
    }
  }
}
