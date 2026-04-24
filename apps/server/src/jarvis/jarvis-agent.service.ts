import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Agent } from '@mariozechner/pi-agent-core';
import type { BeforeToolCallContext, BeforeToolCallResult, AfterToolCallContext } from '@mariozechner/pi-agent-core';
import type { AgentEvent } from '@mariozechner/pi-agent-core';
import { JarvisToolRegistry } from './jarvis-tool.registry';
import type { JarvisMemoryService } from './jarvis-memory.service';
import type { BroadcastService } from '../gateway/broadcast.service';
import type { LlmConfigService } from '../ai/llm-config.service';

const SYSTEM_PROMPT = `你是贾维斯（Jarvis），用户的私人 AI 社交助理。
职责：帮助用户维护社交关系、主动提醒沉默联系人、生成高情商消息草稿。
原则：回复简洁（中文），每步操作都告知用户，send_message 等危险操作必须等用户确认。`;

const INACTIVE_EVICT_MS = 60 * 60 * 1000;

const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;

const DANGEROUS_TOOLS = ['send_message', 'execute_device_command'];

interface AgentEntry {
  readonly agent: Agent;
  readonly lastActiveAt: number;
}

@Injectable()
export class JarvisAgentService implements OnModuleDestroy {
  private readonly logger = new Logger(JarvisAgentService.name);
  private readonly agents = new Map<string, AgentEntry>();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    private readonly toolRegistry: JarvisToolRegistry,
    private readonly memoryService: JarvisMemoryService,
    private readonly broadcastService: BroadcastService,
    private readonly llmConfig: LlmConfigService,
  ) {
    this.cleanupInterval = setInterval(() => {
      void this.evictInactive();
    }, CLEANUP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupInterval);
    this.cleanupInterval = undefined;
  }

  async getOrCreate(userId: string): Promise<Agent> {
    const existing = this.agents.get(userId);
    if (existing) {
      this.agents.set(userId, { agent: existing.agent, lastActiveAt: Date.now() });
      return existing.agent;
    }

    const savedMessages = await this.memoryService.restore(userId);
    const tools = this.toolRegistry.buildTools(userId);

    const agent = new Agent({
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
        model: this.llmConfig.getModel('chat'),
        tools,
        messages: (savedMessages ?? []) as any,
      },
      transformContext: async (messages) =>
        this.memoryService.compactContext(messages as any, 50) as any,
      beforeToolCall: async (context: BeforeToolCallContext): Promise<BeforeToolCallResult | undefined> => {
        const { toolCall, args } = context;
        if (DANGEROUS_TOOLS.includes(toolCall.name)) {
          this.broadcastService.toRoom(`u-${userId}`, 'jarvis:confirm', {
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            args,
          });
          return { block: true, reason: 'awaiting_user_confirmation' };
        }
        return undefined;
      },
      afterToolCall: async (context: AfterToolCallContext): Promise<undefined> => {
        const { toolCall, isError } = context;
        await this.memoryService.logToolUse(userId, toolCall.name, undefined, isError);
        return undefined;
      },
    });

    agent.subscribe(async (event: AgentEvent) => {
      this.broadcastService.toRoom(`u-${userId}`, 'jarvis:event', {
        type: event.type,
        ...(event.type === 'message_update'
          ? { delta: (event as any).assistantMessageEvent }
          : {}),
      });

      if (event.type === 'agent_end') {
        await this.memoryService.save(userId, agent.state.messages as any);
      }
    });

    const entry: AgentEntry = { agent, lastActiveAt: Date.now() };
    this.agents.set(userId, entry);
    return agent;
  }

  async prompt(userId: string, message: string): Promise<void> {
    const agent = await this.getOrCreate(userId);
    await agent.prompt(message);
  }

  async systemTrigger(userId: string, eventType: string, payload: unknown): Promise<void> {
    const agent = await this.getOrCreate(userId);
    await (agent as any).followUp({
      role: 'user',
      content: `[SYSTEM] ${eventType}: ${JSON.stringify(payload)}`,
      timestamp: Date.now(),
    });
  }

  async confirmToolCall(userId: string, _toolCallId: string, approved: boolean): Promise<void> {
    // toolCallId noted but pi-agent-core confirm/reject operates on the full pending state
    const entry = this.agents.get(userId);
    if (!entry) {
      this.logger.warn(`No active agent for user ${userId}`);
      return;
    }
    if (approved) {
      await entry.agent.continue();
    } else {
      entry.agent.steer({
        role: 'user',
        content: '用户拒绝了这个操作，请换一种方式或询问用户意图。',
        timestamp: Date.now(),
      });
    }
  }

  private async evictInactive(): Promise<void> {
    const cutoff = Date.now() - INACTIVE_EVICT_MS;
    for (const [userId, entry] of this.agents.entries()) {
      if (entry.lastActiveAt < cutoff) {
        await this.memoryService.save(userId, entry.agent.state.messages as any);
        this.agents.delete(userId);
        this.logger.debug(`Evicted inactive agent for user ${userId}`);
      }
    }
  }
}
