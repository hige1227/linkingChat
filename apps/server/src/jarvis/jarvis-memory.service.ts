import { Injectable, Inject, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

type AgentMessage = { role: string; content: unknown };

const STATE_TTL_SECONDS = 3600;

@Injectable()
export class JarvisMemoryService {
  private readonly logger = new Logger(JarvisMemoryService.name);

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  private cacheKey(userId: string): string {
    return `jarvis:state:${userId}`;
  }

  async save(userId: string, messages: AgentMessage[]): Promise<void> {
    await Promise.all([
      this.redis.setex(this.cacheKey(userId), STATE_TTL_SECONDS, JSON.stringify(messages)),
      this.prisma.jarvisState.upsert({
        where: { userId },
        create: { userId, messages: messages as any },
        update: { messages: messages as any, snapshotAt: new Date() },
      }),
    ]);
  }

  async restore(userId: string): Promise<AgentMessage[] | null> {
    const cached = await this.redis.get(this.cacheKey(userId));
    if (cached) {
      try {
        return JSON.parse(cached) as AgentMessage[];
      } catch {
        this.logger.warn(`Failed to parse cached Jarvis state for user ${userId}`);
      }
    }
    const record = await this.prisma.jarvisState.findUnique({ where: { userId } });
    return record ? (record.messages as AgentMessage[]) : null;
  }

  compactContext(messages: AgentMessage[], keepLast: number): AgentMessage[] {
    if (messages.length <= keepLast) return messages;
    return messages.slice(messages.length - keepLast);
  }

  async logToolUse(
    userId: string,
    toolName: string,
    _result: unknown,
    isError: boolean,
  ): Promise<void> {
    this.logger.debug(`Tool use — user=${userId} tool=${toolName} error=${isError}`);
  }
}
