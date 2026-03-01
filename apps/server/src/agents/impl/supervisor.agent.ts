import { Injectable } from '@nestjs/common';
import { BaseAgent } from '../core/base-agent';
import { AgentMemoryService } from '../core/memory.service';
import { AgentWorkspaceService } from '../core/workspace.service';
import { LlmRouterService } from '../../ai/services/llm-router.service';
import { MessagesService } from '../../messages/messages.service';
import { BroadcastService } from '../../gateway/broadcast.service';
import { BotsService } from '../../bots/bots.service';
import { MessageType } from '../../messages/dto/create-message.dto';
import {
  AgentEvent,
  AgentResponse,
  AgentAction,
  ConversationContext,
  DeviceResultPayload,
  CommandResult,
} from '../interfaces';

@Injectable()
export class SupervisorAgent extends BaseAgent {
  readonly id = 'supervisor-agent';
  readonly botId = 'supervisor-bot';
  readonly name = 'Supervisor';
  readonly role = 'supervisor' as const;

  constructor(
    memoryService: AgentMemoryService,
    workspaceService: AgentWorkspaceService,
    private readonly llmRouter: LlmRouterService,
    private readonly messagesService: MessagesService,
    private readonly broadcastService: BroadcastService,
    private readonly botsService: BotsService,
  ) {
    super(memoryService, workspaceService);
  }

  async handleEvent(events: AgentEvent[]): Promise<void> {
    this.logger.log(`Supervisor handling ${events.length} events`);

    const userId = events[0]?.source.userId;
    if (!userId) {
      this.logger.warn('No userId in events, skipping notification');
      return;
    }

    // Update working memory with command results
    for (const event of events) {
      if (event.type === 'DEVICE_RESULT') {
        const payload = event.payload as DeviceResultPayload;
        await this.memoryService.addCommandResult(this.botId, {
          commandId: payload.commandId,
          command: payload.command,
          status: payload.status,
          output: payload.output,
          error: payload.error,
          completedAt: event.timestamp,
        } as CommandResult);
      }
    }

    // Generate response
    const response = await this.generateResponse({ events, userId });
    await this.sendNotification(response, userId);
  }

  async generateResponse(_context: ConversationContext): Promise<AgentResponse> {
    const working = await this.memoryService.getWorkingMemory(this.botId);
    const results = working.recentResults;

    if (results.length === 0) {
      return { content: '没有新的任务完成。' };
    }

    const prompt = this.buildPrompt(results);
    const llmResponse = await this.llmRouter.complete({
      taskType: 'chat',
      systemPrompt: '你是一个智能助手 Supervisor，负责汇总并通知用户其他 Agent 的活动状态。',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 200,
    });

    const actions = this.generateActions(results);

    return {
      content: llmResponse.content,
      actions,
    };
  }

  private buildPrompt(results: CommandResult[]): string {
    const tasksSummary = results
      .map((r, i) => {
        const status = r.status === 'success' ? '✅' : '❌';
        return `${i + 1}. ${status} ${r.command} - ${r.status}`;
      })
      .join('\n');

    return `
最近完成的任务:
${tasksSummary}

请生成一条简洁的通知消息（不超过 50 字），告知用户这些任务的完成情况。
要求:
- 如果只有一个任务，直接说明完成情况
- 如果有多个任务，总结为"完成了 N 个任务"
- 语气友好、简洁
- 使用中文
    `.trim();
  }

  private generateActions(results: CommandResult[]): AgentAction[] {
    return results
      .filter((r) => r.status === 'success')
      .slice(0, 3)
      .map((r) => ({
        type: 'view' as const,
        label: '查看详情',
        target: 'coding-bot',
        data: { commandId: r.commandId },
      }));
  }

  private async sendNotification(
    response: AgentResponse,
    userId: string,
  ): Promise<void> {
    try {
      // Get or create Supervisor's DM Converse
      const converse = await this.botsService.getOrCreateSupervisorConverse(userId);

      // Create message
      const message = await this.messagesService.create(this.botId, {
        converseId: converse.id,
        content: response.content,
        type: MessageType.BOT_NOTIFICATION,
      });

      // Push notification via WebSocket
      this.broadcastService.toRoom(`u-${userId}`, 'bot:notification', {
        messageId: message.id,
        converseId: converse.id,
        fromBotId: this.botId,
        fromBotName: this.name,
        content: response.content,
        actions: response.actions,
        createdAt: message.createdAt.toISOString(),
      });

      this.logger.log(`Notification sent to user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to send notification:`, error);
    }
  }
}
