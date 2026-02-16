import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BotsService } from './bots.service';
import { DEFAULT_BOT_TEMPLATES, type BotTemplate } from './bot-templates';

@Injectable()
export class BotInitService {
  private readonly logger = new Logger(BotInitService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly botsService: BotsService,
  ) {}

  /**
   * 为新注册用户创建所有默认 Bot
   *
   * 每个 Bot 独立事务：
   *   1. 创建 Bot（含 Bot 专用 User 记录）
   *   2. 创建 DM Converse
   *   3. 创建 ConverseMember（用户 + Bot 双方）
   *   4. 插入欢迎消息
   */
  async createDefaultBots(userId: string): Promise<void> {
    for (const template of DEFAULT_BOT_TEMPLATES) {
      await this.createBotWithDm(userId, template);
    }

    this.logger.log(
      `Created ${DEFAULT_BOT_TEMPLATES.length} default bots for user ${userId}`,
    );
  }

  /**
   * 创建单个 Bot 及其 DM 会话（事务）
   */
  private async createBotWithDm(
    userId: string,
    template: BotTemplate,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Step 1: 创建 Bot（含 Bot 专用 User 记录）
      const { bot } = await this.botsService.createWithTx(tx, userId, {
        name: template.name,
        description: template.description,
        type: template.type,
        agentConfig: template.agentConfig,
        isPinned: template.isPinned,
        isDeletable: template.isDeletable,
      });

      // Step 2: 创建 DM Converse
      const converse = await tx.converse.create({
        data: { type: 'DM' },
      });

      // Step 3: 创建 ConverseMember（用户 + Bot 双方）
      await tx.converseMember.createMany({
        data: [
          { converseId: converse.id, userId },
          { converseId: converse.id, userId: bot.userId },
        ],
      });

      // Step 4: 插入欢迎消息
      await tx.message.create({
        data: {
          content: template.welcomeMessage,
          type: 'TEXT',
          converseId: converse.id,
          authorId: bot.userId,
        },
      });

      this.logger.debug(
        `Bot "${template.name}" initialized: botId=${bot.id}, converseId=${converse.id}`,
      );
    });
  }
}
