import { Injectable } from '@nestjs/common';
import { BaseAgent } from '../core/base-agent';
import { AgentMemoryService } from '../core/memory.service';
import { AgentWorkspaceService } from '../core/workspace.service';
import { LlmConfigService } from '../../ai/llm-config.service';
import { MessagesService } from '../../messages/messages.service';
import { BroadcastService } from '../../gateway/broadcast.service';
import { BotsService } from '../../bots/bots.service';
import { MessageType } from '../../messages/dto/create-message.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { DraftService } from '../../ai/services/draft.service';
import { DraftType } from '@prisma/client';
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
    private readonly llmConfig: LlmConfigService,
    private readonly messagesService: MessagesService,
    private readonly broadcastService: BroadcastService,
    private readonly botsService: BotsService,
    private readonly prisma: PrismaService,
    private readonly draftService: DraftService,
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

    // Build conversation context (last 20 messages, exclude @ai trigger)
    const recentMessages = await this.prisma.message.findMany({
      where: { converseId: payload.converseId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 21,
      include: { author: { select: { id: true, displayName: true } } },
    });

    const contextMessages = recentMessages
      .reverse()
      .filter((m: (typeof recentMessages)[number]) =>
        m.content && !m.content.match(/(?<!\w)@ai\b/i),
      )
      .slice(-20)
      .map((m: (typeof recentMessages)[number]) => {
        const name = m.author?.displayName ?? 'Unknown';
        return `${name}: ${m.content}`;
      });

    const conversationContext =
      contextMessages.length > 0
        ? `最近的对话记录：\n${contextMessages.join('\n')}\n\n`
        : '';

    // Single LLM call: classify intent + generate response/draft
    const llmText = await this.llmConfig.completeText(
      'chat',
      SUPERVISOR_INTENT_PROMPT,
      `${conversationContext}用户的请求：${payload.content.replace(/(?<!\w)@ai\b/i, '').trim()}`,
      { maxTokens: 512 },
    );

    const rawContent = llmText ?? '';

    // Parse intent from LLM response
    const parsed = this.parseIntentResponse(rawContent);

    if (parsed.intent === 'draft' && parsed.draftContent) {
      // Draft & Verify flow
      await this.draftService.createDraft({
        userId,
        converseId: payload.converseId,
        botId: supervisorBot.id,
        botName: supervisorBot.name,
        draftType: DraftType.MESSAGE,
        userIntent: parsed.draftContent,
      });
      this.logger.log(`Draft created for user ${userId} in converse ${payload.converseId}`);
    } else {
      // Chat reply flow (default)
      const replyContent = parsed.response ?? rawContent;
      await this.messagesService.create(
        supervisorBot.userId,
        {
          converseId: payload.converseId,
          content: replyContent,
          type: MessageType.TEXT,
        },
        { skipMembershipCheck: true },
      );
      this.logger.log(`Chat reply sent to converse ${payload.converseId}`);
    }
  }

  /**
   * Parse the merged intent+response JSON from LLM.
   * Falls back gracefully to chat intent on malformed output.
   */
  private parseIntentResponse(content: string): {
    intent: 'chat' | 'draft';
    response?: string;
    draftContent?: string;
  } {
    try {
      let cleaned = content.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
      }
      const parsed = JSON.parse(cleaned);
      if (parsed.intent === 'draft') {
        return { intent: 'draft', draftContent: String(parsed.draftContent ?? '') };
      }
      return { intent: 'chat', response: String(parsed.response ?? content) };
    } catch {
      // Malformed JSON → treat entire content as chat reply
      return { intent: 'chat', response: content };
    }
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
    const text = await this.llmConfig.completeText(
      'chat',
      '你是一个智能助手 Supervisor，负责汇总并通知用户其他 Agent 的活动状态。',
      prompt,
      { maxTokens: 200 },
    );

    const actions = this.generateActions(results);

    return {
      content: text ?? '任务已完成。',
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

const SUPERVISOR_INTENT_PROMPT = `你是 Jarvis，用户的智能私人助手。分析用户输入，返回以下 JSON：

{
  "intent": "chat" | "draft",
  "response": "直接回复的内容（intent=chat 时必填）",
  "draftContent": "代为起草的消息内容（intent=draft 时必填）"
}

draft 意图判断标准（满足以下任一）：
- 用户明确要求帮写/帮回复某人某事
- 含关键词：帮我回复、帮我写、替我说、帮我发、draft、write for me、代我回复

其他情况统一使用 chat。

chat 回复要求：简洁友好，不超过 150 字。
draft 内容要求：语言自然流畅，直接可发送，符合商务/社交场景。

直接输出 JSON，不要包裹在 markdown 代码块中。`;
