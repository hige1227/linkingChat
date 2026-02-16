import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BroadcastService } from '../../gateway/broadcast.service';
import { LlmRouterService } from './llm-router.service';
import { Redis } from 'ioredis';
import type { DraftCreatedPayload, DraftExpiredPayload } from '@linkingchat/ws-protocol';

/** 草稿内容结构 */
export interface DraftContent {
  content: string;
  action?: string;
  args?: Record<string, unknown>;
}

/**
 * Draft & Verify Service
 *
 * 状态机：PENDING → APPROVED / REJECTED / EXPIRED
 * - Bot 生成草稿 → 用户确认 → 才执行
 * - 5 分钟 TTL 自动过期
 * - 使用 Kimi（质量优先）
 */
@Injectable()
export class DraftService {
  private readonly logger = new Logger(DraftService.name);

  /** 草稿过期时间（秒） */
  private readonly DRAFT_TTL_SECONDS = 5 * 60; // 5 minutes

  /** Redis key 前缀 */
  private readonly REDIS_PREFIX = 'draft:';

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmRouter: LlmRouterService,
    private readonly broadcastService: BroadcastService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  /**
   * 生成草稿并推送给用户
   *
   * 由 Bot 消息处理管道调用。
   */
  async createDraft(params: {
    userId: string;
    converseId: string;
    botId: string;
    botName: string;
    draftType: 'message' | 'command';
    userIntent: string;
  }): Promise<string> {
    // 1. 调用 LLM 生成草稿内容
    const draftContent = await this.generateDraftContent(
      params.draftType,
      params.userIntent,
    );

    // 2. 计算过期时间
    const expiresAt = new Date(
      Date.now() + this.DRAFT_TTL_SECONDS * 1000,
    );

    // 3. 持久化到 DB
    const draft = await this.prisma.aiDraft.create({
      data: {
        userId: params.userId,
        converseId: params.converseId,
        botId: params.botId,
        draftType: params.draftType,
        draftContent: draftContent as any,
        expiresAt,
      },
    });

    // 4. 设置 Redis TTL 用于过期检测
    await this.redis.setex(
      `${this.REDIS_PREFIX}${draft.id}`,
      this.DRAFT_TTL_SECONDS,
      draft.id,
    );

    // 5. WS 推送草稿卡片
    const payload: DraftCreatedPayload = {
      draftId: draft.id,
      converseId: params.converseId,
      botId: params.botId,
      botName: params.botName,
      draftType: params.draftType,
      draftContent,
      expiresAt: expiresAt.toISOString(),
      createdAt: draft.createdAt.toISOString(),
    };

    this.broadcastService.toRoom(
      `u-${params.userId}`,
      'ai:draft:created',
      payload,
    );

    this.logger.log(
      `Draft created: ${draft.id} (${params.draftType}) for user ${params.userId}`,
    );

    // 6. 启动过期定时器
    this.scheduleExpiration(draft.id, params.userId, params.converseId);

    return draft.id;
  }

  /**
   * 批准草稿 → 执行
   */
  async approveDraft(userId: string, draftId: string): Promise<DraftContent> {
    const draft = await this.getValidDraft(userId, draftId);

    await this.prisma.aiDraft.update({
      where: { id: draftId },
      data: { status: 'APPROVED' },
    });

    // 清理 Redis TTL
    await this.redis.del(`${this.REDIS_PREFIX}${draftId}`);

    this.logger.log(`Draft approved: ${draftId} by user ${userId}`);

    return draft.draftContent as unknown as DraftContent;
  }

  /**
   * 拒绝草稿
   */
  async rejectDraft(
    userId: string,
    draftId: string,
    reason?: string,
  ): Promise<void> {
    await this.getValidDraft(userId, draftId);

    await this.prisma.aiDraft.update({
      where: { id: draftId },
      data: {
        status: 'REJECTED',
        rejectReason: reason ?? null,
      },
    });

    await this.redis.del(`${this.REDIS_PREFIX}${draftId}`);

    this.logger.log(
      `Draft rejected: ${draftId} by user ${userId}` +
        (reason ? ` (reason: ${reason})` : ''),
    );
  }

  /**
   * 编辑后批准草稿
   */
  async editAndApproveDraft(
    userId: string,
    draftId: string,
    editedContent: DraftContent,
  ): Promise<DraftContent> {
    await this.getValidDraft(userId, draftId);

    await this.prisma.aiDraft.update({
      where: { id: draftId },
      data: {
        status: 'APPROVED',
        editedContent: editedContent as any,
      },
    });

    await this.redis.del(`${this.REDIS_PREFIX}${draftId}`);

    this.logger.log(`Draft edited+approved: ${draftId} by user ${userId}`);

    return editedContent;
  }

  /**
   * 标记草稿为过期
   */
  async expireDraft(draftId: string): Promise<void> {
    const draft = await this.prisma.aiDraft.findUnique({
      where: { id: draftId },
    });

    if (!draft || draft.status !== 'PENDING') return;

    await this.prisma.aiDraft.update({
      where: { id: draftId },
      data: { status: 'EXPIRED' },
    });

    // WS 通知客户端
    const payload: DraftExpiredPayload = {
      draftId,
      converseId: draft.converseId,
    };

    this.broadcastService.toRoom(
      `u-${draft.userId}`,
      'ai:draft:expired',
      payload,
    );

    this.logger.log(`Draft expired: ${draftId}`);
  }

  /**
   * 获取有效（PENDING + 未过期）的草稿
   */
  private async getValidDraft(userId: string, draftId: string) {
    const draft = await this.prisma.aiDraft.findFirst({
      where: {
        id: draftId,
        userId,
        status: 'PENDING',
      },
    });

    if (!draft) {
      throw new Error('Draft not found or no longer pending');
    }

    if (new Date() > draft.expiresAt) {
      await this.expireDraft(draftId);
      throw new Error('Draft has expired');
    }

    return draft;
  }

  /**
   * 使用 LLM 生成草稿内容
   */
  private async generateDraftContent(
    draftType: 'message' | 'command',
    userIntent: string,
  ): Promise<DraftContent> {
    const systemPrompt =
      draftType === 'message'
        ? DRAFT_MESSAGE_PROMPT
        : DRAFT_COMMAND_PROMPT;

    const response = await this.llmRouter.complete({
      taskType: 'draft',
      systemPrompt,
      messages: [{ role: 'user', content: userIntent }],
      maxTokens: 1024,
      temperature: 0.5,
    });

    return this.parseDraftContent(response.content, draftType);
  }

  /**
   * 解析 LLM 输出为草稿内容
   */
  parseDraftContent(
    content: string,
    draftType: 'message' | 'command',
  ): DraftContent {
    try {
      const parsed = JSON.parse(content);
      if (draftType === 'command') {
        return {
          content: parsed.description || parsed.content || content,
          action: parsed.command || parsed.action,
          args: parsed.args,
        };
      }
      return {
        content: parsed.content || parsed.message || content,
      };
    } catch {
      return { content: content.trim() };
    }
  }

  /**
   * 设置过期定时器
   *
   * 使用 setTimeout 作为简单方案（不持久化）。
   * 生产环境应使用 Redis keyspace notifications 或 BullMQ delayed jobs。
   */
  private scheduleExpiration(
    draftId: string,
    userId: string,
    converseId: string,
  ): void {
    setTimeout(async () => {
      try {
        await this.expireDraft(draftId);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to expire draft ${draftId}: ${msg}`);
      }
    }, this.DRAFT_TTL_SECONDS * 1000);
  }
}

const DRAFT_MESSAGE_PROMPT = `你是一个消息草稿助手。根据用户的意图，生成一条合适的消息草稿。

输出格式（严格 JSON）：
{ "content": "草稿消息内容" }

要求：
- 语言自然流畅
- 符合聊天场景
- 直接输出 JSON，不要包裹在 markdown 代码块中`;

const DRAFT_COMMAND_PROMPT = `你是一个命令草稿助手。根据用户的意图，生成一个 shell 命令草稿。

输出格式（严格 JSON）：
{
  "description": "操作说明",
  "command": "shell 命令",
  "args": {}
}

要求：
- 命令必须安全可执行
- description 用中文简要说明
- 直接输出 JSON，不要包裹在 markdown 代码块中`;
