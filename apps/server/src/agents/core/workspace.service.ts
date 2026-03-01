import { Injectable, Logger, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AgentWorkspace, BotConfig } from '../interfaces';

@Injectable()
export class AgentWorkspaceService {
  private readonly logger = new Logger(AgentWorkspaceService.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async getState(botId: string): Promise<Record<string, unknown>> {
    const key = this.getStateKey(botId);
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : {};
  }

  async setState(botId: string, state: Record<string, unknown>): Promise<void> {
    const key = this.getStateKey(botId);
    await this.redis.set(key, JSON.stringify(state));
  }

  async updateState(botId: string, updates: Record<string, unknown>): Promise<void> {
    const current = await this.getState(botId);
    await this.setState(botId, { ...current, ...updates });
  }

  async getConfig(botId: string): Promise<BotConfig> {
    const key = this.getConfigKey(botId);
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : this.getDefaultConfig();
  }

  async setConfig(botId: string, config: Partial<BotConfig>): Promise<void> {
    const current = await this.getConfig(botId);
    const key = this.getConfigKey(botId);
    await this.redis.set(key, JSON.stringify({ ...current, ...config }));
  }

  async getSessionId(botId: string): Promise<string> {
    const key = this.getSessionKey(botId);
    let sessionId = await this.redis.get(key);
    if (!sessionId) {
      sessionId = `${botId}-${Date.now()}`;
      await this.redis.set(key, sessionId);
    }
    return sessionId;
  }

  async getWorkspace(botId: string): Promise<AgentWorkspace> {
    const [state, config, sessionId] = await Promise.all([
      this.getState(botId),
      this.getConfig(botId),
      this.getSessionId(botId),
    ]);

    return { state, config, sessionId };
  }

  private getStateKey(botId: string): string {
    return `agent:${botId}:workspace:state`;
  }

  private getConfigKey(botId: string): string {
    return `agent:${botId}:workspace:config`;
  }

  private getSessionKey(botId: string): string {
    return `agent:${botId}:workspace:session`;
  }

  private getDefaultConfig(): BotConfig {
    return {
      language: 'zh-CN',
      timezone: 'Asia/Shanghai',
      settings: {},
      allowedTools: [],
    };
  }
}
