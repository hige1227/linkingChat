import { Injectable } from '@nestjs/common';
import { BaseAgent } from '../core/base-agent';
import { AgentMemoryService } from '../core/memory.service';
import { AgentWorkspaceService } from '../core/workspace.service';
import { LlmRouterService } from '../../ai/services/llm-router.service';
import { MessagesService } from '../../messages/messages.service';
import { BroadcastService } from '../../gateway/broadcast.service';
import { BotsService } from '../../bots/bots.service';
import { MessageType } from '../../messages/dto/create-message.dto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AgentEvent,
  AgentResponse,
  AgentAction,
  ConversationContext,
  DeviceResultPayload,
  UserMessagePayload,
  CrossBotNotifyPayload,
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
    private readonly prisma: PrismaService,
  ) {
    super(memoryService, workspaceService);
  }

  async handleEvent(events: AgentEvent[]): Promise<void> {
    this.logger.log(`Supervisor handling ${events.length} events`);

    const userId = events[0]?.source.userId;
    if (!userId) {
      this.logger.warn('No userId in events, skipping');
      return;
    }

    const deviceResults: AgentEvent[] = [];

    for (const event of events) {
      try {
        switch (event.type) {
          case 'USER_MESSAGE':
            await this.handleUserMessage(event, userId);
            break;
          case 'CROSS_BOT_NOTIFY':
            await this.handleCrossBotNotify(event, userId);
            break;
          case 'DEVICE_RESULT':
            deviceResults.push(event);
            break;
          default:
            this.logger.debug(`Unhandled event type: ${event.type}`);
        }
      } catch (err) {
        this.logger.error(`Failed to handle ${event.type}:`, err);
      }
    }

    // Batch DEVICE_RESULT processing (preserves original single-call behavior)
    if (deviceResults.length > 0) {
      await this.handleDeviceResults(deviceResults, userId);
    }
  }

  private async handleUserMessage(event: AgentEvent, userId: string): Promise<void> {
    const payload = event.payload as UserMessagePayload;

    const supervisorBot = await this.botsService.findSupervisorByUserId(userId);
    if (!supervisorBot) {
      this.logger.warn(`No Supervisor Bot for user ${userId}`);
      return;
    }

    // Fetch recent conversation history for context (up to 20 messages, excluding the @ai message itself)
    const recentMessages = await this.prisma.message.findMany({
      where: { converseId: payload.converseId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 21, // extra 1 in case the @ai message is included
      include: { author: { select: { id: true, displayName: true } } },
    });

    // Build LLM context from history (oldest first, exclude the trigger @ai message)
    const contextMessages = recentMessages
      .reverse()
      .filter((m) => m.content && !m.content.match(/(?<!\w)@ai\b/i))
      .slice(-20)
      .map((m) => {
        const name = m.author?.displayName ?? 'Unknown';
        return `${name}: ${m.content}`;
      });

    const conversationContext = contextMessages.length > 0
      ? `以下是最近的对话记录：\n${contextMessages.join('\n')}\n\n`
      : '';

    const llmResponse = await this.llmRouter.complete({
      taskType: 'chat',
      systemPrompt:
        '你是 Supervisor，用户的 AI 助手。用户在对话中 @ai 向你提问，请根据对话上下文回答。简洁、友好，回复不超过 150 字。',
      messages: [{
        role: 'user',
        content: `${conversationContext}用户的请求：${payload.content.replace(/(?<!\w)@ai\b/i, '').trim()}`,
      }],
      maxTokens: 300,
    });

    await this.messagesService.create(
      supervisorBot.userId,
      {
        converseId: payload.converseId,
        content: llmResponse.content,
        type: MessageType.TEXT,
      },
      { skipMembershipCheck: true }, // Bot may not be a member of group chats
    );

    this.logger.log(`Replied to USER_MESSAGE in converse ${payload.converseId}`);
  }

  private async handleCrossBotNotify(event: AgentEvent, userId: string): Promise<void> {
    const payload = event.payload as CrossBotNotifyPayload;

    const supervisorBot = await this.botsService.findSupervisorByUserId(userId);
    if (!supervisorBot) {
      this.logger.warn(`No Supervisor Bot for user ${userId}`);
      return;
    }

    const converse = await this.botsService.getOrCreateSupervisorConverse(userId);
    const contentSuffix = payload.data?.content
      ? String(payload.data.content)
      : payload.event;
    const content = `[From ${payload.fromBotName}]: ${contentSuffix}`;

    const metadata: Record<string, unknown> = {
      cardType: 'cross_bot_notify',
      title: content,
      sourceBotName: payload.fromBotName,
      sourceEvent: payload.event,
    };

    const message = await this.messagesService.create(supervisorBot.userId, {
      converseId: converse.id,
      content,
      type: MessageType.BOT_NOTIFICATION,
      metadata,
    });

    this.broadcastService.toRoom(`u-${userId}`, 'bot:notification', {
      messageId: message.id,
      converseId: converse.id,
      fromBotId: supervisorBot.id,
      fromBotName: payload.fromBotName,
      content,
      createdAt: message.createdAt.toISOString(),
    });

    this.logger.log(
      `CROSS_BOT_NOTIFY from ${payload.fromBotName} forwarded to user ${userId}`,
    );
  }

  private async handleDeviceResults(events: AgentEvent[], userId: string): Promise<void> {
    const supervisorBot = await this.botsService.findSupervisorByUserId(userId);
    if (!supervisorBot) return;

    for (const event of events) {
      const payload = event.payload as DeviceResultPayload;
      await this.memoryService.addCommandResult(supervisorBot.id, {
        commandId: payload.commandId,
        command: payload.command,
        status: payload.status,
        output: payload.output,
        error: payload.error,
        completedAt: event.timestamp,
      } as CommandResult);
    }

    const response = await this.generateResponse({ events, userId });
    await this.sendNotification(response, userId, supervisorBot);
  }

  async generateResponse(_context: ConversationContext): Promise<AgentResponse> {
    const userId = _context.userId;
    if (!userId) {
      return { content: '没有新的任务完成。' };
    }

    const supervisorBot = await this.botsService.findSupervisorByUserId(userId);
    const memoryBotId = supervisorBot?.id || this.botId;
    const working = await this.memoryService.getWorkingMemory(memoryBotId);
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
    supervisorBot: { id: string; userId: string; name: string },
  ): Promise<void> {
    try {
      // Get or create Supervisor's DM Converse
      const converse = await this.botsService.getOrCreateSupervisorConverse(userId);

      // Build metadata for NotificationCard rendering
      const hasError = response.actions?.some(a => a.type === 'execute');
      const metadata: Record<string, any> = {
        cardType: hasError ? 'error' : 'task_complete',
        title: response.content,
        sourceBotName: supervisorBot.name,
      };
      if (response.actions && response.actions.length > 0) {
        metadata.actions = response.actions.map(a => ({
          label: a.label,
          action: a.type === 'view' ? 'view_result' : a.type,
          payload: a.data,
        }));
      }

      // Create message using the bot's actual userId
      const message = await this.messagesService.create(supervisorBot.userId, {
        converseId: converse.id,
        content: response.content,
        type: MessageType.BOT_NOTIFICATION,
        metadata,
      });

      // Push notification via WebSocket
      this.broadcastService.toRoom(`u-${userId}`, 'bot:notification', {
        messageId: message.id,
        converseId: converse.id,
        fromBotId: supervisorBot.id,
        fromBotName: supervisorBot.name,
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
