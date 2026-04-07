import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BroadcastService } from '../gateway/broadcast.service';
import { ConversesService } from '../converses/converses.service';
import { MentionService } from '../mentions/mentions.service';
import { UploadService } from '../upload/upload.service';
import { MetricsService } from '../metrics/metrics.service';
import { I18nService } from '../i18n/i18n.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';

/** 撤回时间限制：普通用户 2 分钟 */
const RECALL_TIME_LIMIT_MS = 2 * 60 * 1000;

// 标准 author select，复用于所有消息查询
const AUTHOR_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcastService: BroadcastService,
    private readonly conversesService: ConversesService,
    private readonly mentionService: MentionService,
    private readonly uploadService: UploadService,
    private readonly metricsService: MetricsService,
    private readonly i18n: I18nService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * 创建消息 — REST handler 调用
   *
   * 流程：
   * 1. 校验用户是 converse 成员
   * 2. 插入消息记录
   * 3. 更新所有成员的 lastMessageId + converse.updatedAt
   * 4. 广播 message:new 到 {converseId} 房间
   * 5. 对不在房间的成员广播 notification:new 到 u-{userId}
   */
  async create(
    userId: string,
    dto: CreateMessageDto,
    options?: { skipMembershipCheck?: boolean },
  ) {
    // 1. 校验成员身份（internal agent calls can skip this）
    if (!options?.skipMembershipCheck) {
      await this.conversesService.verifyMembership(dto.converseId, userId);
    }

    // 2. 检查群组禁言状态（Phase 9）
    const mutedUntil = await this.conversesService.checkMuted(
      dto.converseId,
      userId,
    );
    if (mutedUntil) {
      throw new ForbiddenException(
        `You are muted until ${mutedUntil.toISOString()}`,
      );
    }

    // 3. 如果有 replyToId，校验引用消息存在且属于同一会话
    if (dto.replyToId) {
      const replyTarget = await this.prisma.message.findUnique({
        where: { id: dto.replyToId },
      });
      if (!replyTarget || replyTarget.converseId !== dto.converseId) {
        throw new NotFoundException(
          'Reply target message not found in this conversation',
        );
      }
    }

    // 3. 插入消息（含附件）
    const attachmentData =
      dto.attachments && dto.attachments.length > 0
        ? {
            create: dto.attachments.map((att) => ({
              url: att.url,
              filename: att.filename,
              mimeType: att.mimeType,
              size: att.size ?? null,
              width: att.width ?? null,
              height: att.height ?? null,
              duration: att.duration ?? null,
              thumbnailUrl: att.thumbnailUrl ?? null,
            })),
          }
        : undefined;

    const message = await this.prisma.message.create({
      data: {
        content: dto.content ?? null,
        type: dto.type ?? 'TEXT',
        authorId: userId,
        converseId: dto.converseId,
        replyToId: dto.replyToId ?? null,
        ...(dto.metadata ? { metadata: dto.metadata } : {}),
        ...(attachmentData ? { attachments: attachmentData } : {}),
      },
      include: {
        author: { select: AUTHOR_SELECT },
        attachments: true,
      },
    });

    // 4. 更新所有成员的 lastMessageId + 更新 converse.updatedAt
    await this.prisma.$transaction([
      this.prisma.converseMember.updateMany({
        where: { converseId: dto.converseId },
        data: { lastMessageId: message.id },
      }),
      this.prisma.converse.update({
        where: { id: dto.converseId },
        data: { updatedAt: new Date() },
      }),
    ]);

    // 5. 广播 message:new 到 {converseId} 房间
    const messagePayload = {
      id: message.id,
      content: message.content,
      type: message.type,
      authorId: message.authorId,
      author: message.author,
      converseId: message.converseId,
      replyToId: message.replyToId,
      metadata: message.metadata,
      attachments:
        message.attachments && message.attachments.length > 0
          ? message.attachments
          : undefined,
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
    };

    this.broadcastService.toRoom(
      dto.converseId,
      'message:new',
      messagePayload,
    );

    // 6. 对不在 {converseId} 房间的成员发送 notification:new
    const memberIds = await this.conversesService.getMemberIds(dto.converseId);
    for (const memberId of memberIds) {
      if (memberId === userId) continue; // 不通知发送者自己
      this.broadcastService.toRoomIfNotIn(
        `u-${memberId}`, // 目标：个人房间
        dto.converseId, // 条件：不在此会话房间内
        'notification:new',
        {
          converseId: dto.converseId,
          messageId: message.id,
          content: message.content,
          author: message.author,
          createdAt: message.createdAt.toISOString(),
        },
      );
    }

    // Prometheus: increment messages sent counter
    this.metricsService.messagesSentTotal.inc();

    this.logger.log(
      `Message created: ${message.id} in converse ${dto.converseId} by ${userId}`,
    );

    // 7. @mention 路由（fire-and-forget）— @ai dispatches to SupervisorAgent in all chat types
    this.handleMentions(userId, dto.converseId, message)
      .catch((err) =>
        this.logger.error(`handleMentions failed: ${err.message}`, err.stack),
      );

    // 8. 私信 Bot 检测 — skip if Desktop already handles via local OpenClaw
    if (!dto.skipBotDispatch) {
      this.detectBotRecipient(userId, dto.converseId, message).catch((err) =>
        this.logger.error(`detectBotRecipient failed: ${err.message}`, err.stack),
      );
    }

    return message;
  }

  /**
   * 处理群聊中的 @mention 路由
   *
   * @param userId - 发送者 ID
   * @param converseId - 会话 ID
   * @param message - 消息对象
   */
  private async handleMentions(
    userId: string,
    converseId: string,
    message: { id: string; content: string | null; type: string },
  ): Promise<void> {
    // 解析 @mentions
    const mentions = this.mentionService.parse(message.content);
    if (mentions.length === 0) return;

    // 验证并路由
    const validMentions = await this.mentionService.validate(mentions, converseId);
    if (validMentions.length === 0) return;

    await this.mentionService.route(validMentions, {
      id: message.id,
      content: message.content,
      converseId,
    }, userId, converseId);

    this.logger.log(
      `Routed ${validMentions.length} mentions in group ${converseId}`,
    );
  }

  /**
   * 游标分页查询消息历史
   *
   * @param userId     - 当前用户 ID（用于校验成员身份）
   * @param converseId - 会话 ID
   * @param cursor     - ISO 8601 时间戳游标，获取此时间之前的消息
   * @param limit      - 每页条数，默认 35
   * @returns          - { messages: Message[], hasMore: boolean, nextCursor: string | null }
   */
  async findByConverse(
    userId: string,
    converseId: string,
    cursor?: string,
    limit = 35,
  ) {
    // 1. 校验成员身份
    await this.conversesService.verifyMembership(converseId, userId);

    // 2. 查询 limit + 1 条，多查 1 条判断是否还有更多
    const messages = await this.prisma.message.findMany({
      where: {
        converseId,
        deletedAt: null,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        author: { select: AUTHOR_SELECT },
        attachments: true,
      },
    });

    const hasMore = messages.length > limit;
    if (hasMore) {
      messages.pop(); // 移除多查的 1 条
    }

    const nextCursor = hasMore
      ? messages[messages.length - 1].createdAt.toISOString()
      : null;

    return {
      messages,
      hasMore,
      nextCursor,
    };
  }

  /**
   * 消息搜索 — PostgreSQL 全文搜索 + LIKE fallback
   *
   * 搜索策略：
   * 1. 先用 tsvector 全文搜索（GIN 索引，快速）
   * 2. 如果无结果，退化到 ILIKE '%keyword%'（顺序扫描，小数据集可接受）
   * 3. 仅搜索用户有权限访问的会话
   */
  async search(
    userId: string,
    query: string,
    converseId?: string,
    limit = 20,
    offset = 0,
  ) {
    if (!query || query.trim().length === 0) {
      throw new BadRequestException(this.i18n.t('messages.search_query_required'));
    }

    const trimmedQuery = query.trim();

    // Build the converseId filter fragment
    const converseFilter = converseId
      ? Prisma.sql`AND m."converseId" = ${converseId}`
      : Prisma.empty;

    // 1. Try tsvector full-text search first
    const tsResults = await this.prisma.$queryRaw<
      Array<{
        id: string;
        content: string;
        type: string;
        authorId: string;
        converseId: string;
        createdAt: Date;
        updatedAt: Date;
        highlight: string;
      }>
    >`
      SELECT m."id", m."content", m."type", m."authorId", m."converseId",
             m."createdAt", m."updatedAt",
             ts_headline('simple', m."content", plainto_tsquery('simple', ${trimmedQuery}),
               'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20') as highlight
      FROM messages m
      JOIN converse_members cm ON cm."converseId" = m."converseId" AND cm."userId" = ${userId}
      WHERE m.search_vector @@ plainto_tsquery('simple', ${trimmedQuery})
        AND m."deletedAt" IS NULL
        ${converseFilter}
      ORDER BY ts_rank(m.search_vector, plainto_tsquery('simple', ${trimmedQuery})) DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Get total count for tsvector results
    const tsCount = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count
      FROM messages m
      JOIN converse_members cm ON cm."converseId" = m."converseId" AND cm."userId" = ${userId}
      WHERE m.search_vector @@ plainto_tsquery('simple', ${trimmedQuery})
        AND m."deletedAt" IS NULL
        ${converseFilter}
    `;

    const totalFromTs = Number(tsCount[0]?.count ?? 0);

    if (totalFromTs > 0) {
      return {
        results: tsResults,
        total: totalFromTs,
        query: trimmedQuery,
      };
    }

    // 2. Fallback to ILIKE for Chinese text or partial matches
    const likePattern = `%${trimmedQuery}%`;
    const likeResults = await this.prisma.$queryRaw<
      Array<{
        id: string;
        content: string;
        type: string;
        authorId: string;
        converseId: string;
        createdAt: Date;
        updatedAt: Date;
        highlight: string;
      }>
    >`
      SELECT m."id", m."content", m."type", m."authorId", m."converseId",
             m."createdAt", m."updatedAt",
             m."content" as highlight
      FROM messages m
      JOIN converse_members cm ON cm."converseId" = m."converseId" AND cm."userId" = ${userId}
      WHERE m."content" ILIKE ${likePattern}
        AND m."deletedAt" IS NULL
        ${converseFilter}
      ORDER BY m."createdAt" DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const likeCount = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count
      FROM messages m
      JOIN converse_members cm ON cm."converseId" = m."converseId" AND cm."userId" = ${userId}
      WHERE m."content" ILIKE ${likePattern}
        AND m."deletedAt" IS NULL
        ${converseFilter}
    `;

    return {
      results: likeResults,
      total: Number(likeCount[0]?.count ?? 0),
      query: trimmedQuery,
    };
  }

  /**
   * 编辑消息 — 仅作者可操作
   */
  async update(userId: string, messageId: string, dto: UpdateMessageDto) {
    // 1. 查找消息
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException(this.i18n.t('messages.not_found'));
    }

    if (message.deletedAt) {
      throw new NotFoundException(this.i18n.t('messages.not_found'));
    }

    // 2. 校验作者身份
    if (message.authorId !== userId) {
      throw new ForbiddenException(this.i18n.t('messages.recall_no_permission'));
    }

    // 3. 更新消息
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: dto.content,
        updatedAt: new Date(),
      },
      include: {
        author: { select: AUTHOR_SELECT },
      },
    });

    // 4. 广播 message:updated
    this.broadcastService.toRoom(message.converseId, 'message:updated', {
      id: updated.id,
      content: updated.content,
      converseId: updated.converseId,
      updatedAt: updated.updatedAt.toISOString(),
    });

    this.logger.log(
      `Message updated: ${messageId} in converse ${message.converseId}`,
    );

    return updated;
  }

  /**
   * 软删除消息（撤回）
   *
   * Sprint 4 增强：
   * - 普通用户 2 分钟内可撤回自己的消息
   * - 群管理员（OWNER/ADMIN）可撤回任何人的消息，无时间限制
   * - 撤回带附件的消息时，异步清理 S3 文件
   */
  async softDelete(userId: string, messageId: string) {
    // 1. 查找消息（含附件信息）
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { attachments: true },
    });

    if (!message) {
      throw new NotFoundException(this.i18n.t('messages.not_found'));
    }

    if (message.deletedAt) {
      throw new NotFoundException(this.i18n.t('messages.not_found'));
    }

    // 2. 权限检查：消息作者 OR 群管理员
    const isAuthor = message.authorId === userId;
    let isAdmin = false;

    if (!isAuthor) {
      // 检查是否为群管理员
      const member = await this.prisma.converseMember.findUnique({
        where: {
          converseId_userId: { converseId: message.converseId, userId },
        },
      });
      isAdmin = member?.role === 'OWNER' || member?.role === 'ADMIN';

      if (!isAdmin) {
        throw new ForbiddenException(this.i18n.t('messages.recall_no_permission'));
      }
    }

    // 3. 时间限制：普通用户 2 分钟，管理员无限制
    if (isAuthor && !isAdmin) {
      // 先检查当前用户自身是否也是管理员
      const selfMember = await this.prisma.converseMember.findUnique({
        where: {
          converseId_userId: { converseId: message.converseId, userId },
        },
      });
      const selfIsAdmin =
        selfMember?.role === 'OWNER' || selfMember?.role === 'ADMIN';

      if (!selfIsAdmin) {
        const elapsed = Date.now() - new Date(message.createdAt).getTime();
        if (elapsed > RECALL_TIME_LIMIT_MS) {
          throw new ForbiddenException(
            this.i18n.t('messages.recall_time_expired'),
          );
        }
      }
    }

    // 4. 软删除
    const deleted = await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });

    // 5. 异步清理 S3 附件（不阻塞撤回响应）
    if (message.attachments && message.attachments.length > 0) {
      this.cleanupAttachments(message.attachments).catch((err) =>
        this.logger.error(
          `Attachment cleanup failed for message ${messageId}: ${err.message}`,
        ),
      );
    }

    // 6. 广播 message:deleted（含 recalledBy 标识撤回者）
    this.broadcastService.toRoom(message.converseId, 'message:deleted', {
      id: deleted.id,
      converseId: deleted.converseId,
      deletedAt: deleted.deletedAt!.toISOString(),
      recalledBy: userId,
    });

    // Prometheus: increment messages recalled counter
    this.metricsService.messagesRecalledTotal.inc();

    this.logger.log(
      `Message recalled: ${messageId} in converse ${message.converseId} by ${userId}`,
    );

    return { id: deleted.id, deleted: true };
  }

  /**
   * 异步清理消息附件的 S3 文件
   */
  private async cleanupAttachments(
    attachments: Array<{
      id: string;
      url: string;
      thumbnailUrl: string | null;
    }>,
  ): Promise<void> {
    for (const att of attachments) {
      // 从 URL 中提取 fileKey（去掉 bucket 前缀的部分）
      const fileKey = this.extractFileKey(att.url);
      if (fileKey) {
        await this.uploadService
          .deleteFile(fileKey)
          .catch((e) =>
            this.logger.error(
              `Failed to delete attachment ${att.id}: ${(e as Error).message}`,
            ),
          );
      }
      if (att.thumbnailUrl) {
        const thumbKey = this.extractFileKey(att.thumbnailUrl);
        if (thumbKey) {
          await this.uploadService.deleteFile(thumbKey).catch(() => {});
        }
      }
    }
  }

  /**
   * 从 S3 URL 中提取 fileKey
   * e.g., "http://localhost:9008/attachments/image/abc.jpg" → "image/abc.jpg"
   */
  private extractFileKey(url: string): string | null {
    try {
      const parsed = new URL(url);
      const pathParts = parsed.pathname.split('/');
      // pathname: /bucket/fileKey... → skip empty + bucket
      if (pathParts.length >= 3) {
        return pathParts.slice(2).join('/');
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 检测消息收件人是否为 Bot
   *
   * Sprint 2: 仅记录日志
   * Sprint 3: 路由到 AI pipeline 生成回复
   */
  private async detectBotRecipient(
    senderId: string,
    converseId: string,
    message: { id: string; content: string | null; type: string },
  ): Promise<void> {
    const otherMembers = await this.prisma.converseMember.findMany({
      where: {
        converseId,
        userId: { not: senderId },
      },
    });

    for (const member of otherMembers) {
      const bot = await this.prisma.bot.findUnique({
        where: { userId: member.userId },
      });

      if (bot) {
        this.logger.log(
          `[Bot] Message to ${bot.name} (${bot.id}): ` +
            `type=${message.type}, content="${(message.content ?? '').substring(0, 100)}"`,
        );

        // Supervisor uses a well-known sentinel botId; other bots use their DB id
        const agentBotId =
          bot.name === 'Supervisor' ? 'supervisor-bot' : bot.id;

        const event = {
          type: 'USER_MESSAGE' as const,
          payload: {
            userId: senderId,
            content: message.content ?? '',
            converseId,
          },
          timestamp: new Date(),
          source: { userId: senderId, botId: bot.id },
        };

        this.eventEmitter.emit('agent.dispatch', {
          botId: agentBotId,
          events: [event],
        });

        this.logger.log(
          `[Bot] Dispatched USER_MESSAGE to agent ${agentBotId}`,
        );
      }
    }
  }
}
