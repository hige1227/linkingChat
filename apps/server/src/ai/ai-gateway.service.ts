import {
  Injectable,
  Inject,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Redis } from 'ioredis';
import { LlmProxyDto } from './dto/llm-proxy.dto';

export interface LlmTokenResponse {
  token: string;
  expiresIn: number;
}

export interface ProxyChunk {
  type: 'text' | 'done' | 'error';
  content?: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
  message?: string;
}

const RATE_LIMIT_PER_MINUTE = 20;
const RATE_LIMIT_PER_DAY = 200;
const TOKEN_EXPIRY_SECONDS = 86_400; // 24 hours
const PROVIDER_FETCH_ATTEMPTS = 2;
const PROVIDER_REQUEST_TIMEOUT_MS = 60_000;

@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);
  private readonly jwtPrivateKey: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {
    this.jwtPrivateKey = Buffer.from(
      process.env.AUTH_JWT_PRIVATE_KEY!,
      'base64',
    ).toString('utf-8');
  }

  async issueLlmToken(userId: string): Promise<LlmTokenResponse> {
    const token = await this.jwtService.signAsync(
      { type: 'llm-proxy' },
      {
        subject: userId,
        algorithm: 'RS256',
        privateKey: this.jwtPrivateKey,
        expiresIn: TOKEN_EXPIRY_SECONDS,
      },
    );

    return { token, expiresIn: TOKEN_EXPIRY_SECONDS };
  }

  async checkRateLimit(userId: string): Promise<void> {
    const minuteKey = `llm:rate:min:${userId}`;
    const dayKey = `llm:rate:day:${userId}`;

    let minuteCount: number;
    let dayCount: number;
    try {
      [minuteCount, dayCount] = await Promise.all([
        this.redis.incr(minuteKey),
        this.redis.incr(dayKey),
      ]);

      if (minuteCount === 1) await this.redis.expire(minuteKey, 60);
      if (dayCount === 1) await this.redis.expire(dayKey, 86_400);
    } catch (err) {
      this.logger.warn(
        `Rate limit dependency unavailable: ${(err as Error).message}`,
      );
      throw new HttpException(
        'Rate limit dependency unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const limitPerMin = this.configService.get<number>(
      'LLM_RATE_LIMIT_PER_MINUTE',
      RATE_LIMIT_PER_MINUTE,
    );
    const limitPerDay = this.configService.get<number>(
      'LLM_RATE_LIMIT_PER_DAY',
      RATE_LIMIT_PER_DAY,
    );

    if (minuteCount > limitPerMin) {
      throw new HttpException('Rate limit exceeded (per minute)', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (dayCount > limitPerDay) {
      throw new HttpException('Rate limit exceeded (per day)', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async *streamProxy(
    userId: string,
    dto: LlmProxyDto,
  ): AsyncGenerator<ProxyChunk> {
    const provider = this.selectProvider(dto.model);
    let { baseUrl, apiKey, model } = provider;

    if (!apiKey) {
      yield { type: 'error', message: `LLM provider API key is not configured for ${model}` };
      return;
    }

    const body = {
      model,
      messages: dto.messages,
      stream: true,
      temperature: dto.temperature ?? 0.7,
      max_tokens: dto.max_tokens ?? 1024,
    };

    let response: Response;
    try {
      response = await this.fetchProvider(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const fallback = this.selectFallbackProvider(model, dto.model);
      if (!fallback) {
        yield { type: 'error', message: `LLM provider unreachable: ${this.describeFetchError(err)}` };
        return;
      }

      this.logger.warn(
        `Falling back from ${model} to ${fallback.model}: ${this.describeFetchError(err)}`,
      );
      baseUrl = fallback.baseUrl;
      apiKey = fallback.apiKey;
      model = fallback.model;
      body.model = model;

      try {
        response = await this.fetchProvider(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
      } catch (fallbackErr) {
        yield {
          type: 'error',
          message: `LLM fallback provider unreachable: ${this.describeFetchError(fallbackErr)}`,
        };
        return;
      }
    }

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => response.statusText);
      yield { type: 'error', message: `LLM API error ${response.status}: ${text}` };
      return;
    }

    let promptTokens = 0;
    let completionTokens = 0;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            yield { type: 'done', usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens } };
            return;
          }

          try {
            const parsed = JSON.parse(data) as {
              choices: Array<{ delta: { content?: string }; finish_reason?: string }>;
              usage?: { prompt_tokens: number; completion_tokens: number };
            };

            if (parsed.usage) {
              promptTokens = parsed.usage.prompt_tokens;
              completionTokens = parsed.usage.completion_tokens;
            }

            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) yield { type: 'text', content: delta };

            if (parsed.choices?.[0]?.finish_reason === 'stop') {
              yield { type: 'done', usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens } };
              return;
            }
          } catch {
            // skip malformed SSE chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
      this.recordUsage(userId, model, promptTokens, completionTokens).catch((err) =>
        this.logger.warn(`Failed to record AI usage: ${(err as Error).message}`),
      );
    }

    yield { type: 'done', usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens } };
  }

  private async recordUsage(
    userId: string,
    model: string,
    promptTokens: number,
    completionTokens: number,
  ): Promise<void> {
    const cost = this.estimateCost(model, promptTokens, completionTokens);
    await this.prisma.aiUsage.create({
      data: { userId, model, promptTokens, completionTokens, cost },
    });
  }

  private estimateCost(model: string, promptTokens: number, completionTokens: number): number {
    // Rough cost in ¥ — deepseek-chat: ~0.001¥/1K tokens
    const rate = model.includes('deepseek') ? 0.000001 : 0.000002;
    return (promptTokens + completionTokens) * rate;
  }

  private async fetchProvider(url: string, init: RequestInit): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= PROVIDER_FETCH_ATTEMPTS; attempt += 1) {
      try {
        return await fetch(url, {
          ...init,
          signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        lastError = err;
        this.logger.warn(
          `LLM provider fetch failed (${attempt}/${PROVIDER_FETCH_ATTEMPTS}): ${this.describeFetchError(err)}`,
        );
        if (attempt < PROVIDER_FETCH_ATTEMPTS) {
          await this.delay(500 * attempt);
        }
      }
    }

    throw lastError;
  }

  private describeFetchError(err: unknown): string {
    if (!(err instanceof Error)) return String(err);

    const cause = err.cause as { code?: string; message?: string } | undefined;
    if (cause?.code || cause?.message) {
      return `${err.message} (${[cause.code, cause.message].filter(Boolean).join(': ')})`;
    }
    return err.message;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private selectFallbackProvider(
    failedModel: string,
    requestedModel?: string,
  ): { baseUrl: string; apiKey: string; model: string } | null {
    if (requestedModel) return null;
    if (!failedModel.includes('deepseek')) return null;

    const apiKey = this.configService.get('KIMI_API_KEY', '');
    if (!apiKey) return null;

    return {
      baseUrl: this.configService.get('KIMI_BASE_URL', 'https://api.moonshot.cn'),
      apiKey,
      model: this.configService.get('KIMI_MODEL', 'moonshot-v1-8k'),
    };
  }

  private selectProvider(requestedModel?: string): { baseUrl: string; apiKey: string; model: string } {
    if (requestedModel?.startsWith('kimi') || requestedModel?.startsWith('moonshot')) {
      return {
        baseUrl: this.configService.get('KIMI_BASE_URL', 'https://api.moonshot.cn'),
        apiKey: this.configService.get('KIMI_API_KEY', ''),
        model: requestedModel,
      };
    }
    return {
      baseUrl: this.configService.get('DEEPSEEK_BASE_URL', 'https://api.deepseek.com'),
      apiKey: this.configService.get('DEEPSEEK_API_KEY', ''),
      model: requestedModel ?? this.configService.get('DEEPSEEK_MODEL', 'deepseek-chat'),
    };
  }
}
