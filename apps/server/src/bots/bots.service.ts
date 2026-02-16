import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { agentConfigSchema } from '@linkingchat/shared';

@Injectable()
export class BotsService {
  private readonly logger = new Logger(BotsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建 Bot + 关联 User（事务）
   *
   * 流程：
   * 1. 验证 agentConfig 格式（Zod）
   * 2. 创建 Bot User 记录（不可登录的邮箱 + 随机密码）
   * 3. 创建 Bot 记录，关联到 Bot User 和 Owner
   */
  async create(ownerId: string, dto: CreateBotDto) {
    // 1. 验证 agentConfig
    const configResult = agentConfigSchema.safeParse(dto.agentConfig);
    if (!configResult.success) {
      throw new BadRequestException({
        message: 'Invalid agentConfig',
        errors: configResult.error.flatten().fieldErrors,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      // 2. 创建 Bot User 记录
      const botUser = await tx.user.create({
        data: {
          email: `bot-${randomBytes(8).toString('hex')}@bot.linkingchat.internal`,
          username: `bot_${dto.name.toLowerCase().replace(/\s/g, '_')}_${Date.now()}`,
          password: await argon2.hash(randomBytes(32).toString('hex')),
          displayName: dto.name,
          avatarUrl: dto.avatarUrl,
        },
      });

      // 3. 创建 Bot 记录
      const bot = await tx.bot.create({
        data: {
          name: dto.name,
          description: dto.description,
          avatarUrl: dto.avatarUrl,
          type: dto.type || 'REMOTE_EXEC',
          agentConfig: configResult.data,
          ownerId,
          userId: botUser.id,
          isPinned: dto.isPinned ?? true,
          isDeletable: true,
        },
      });

      this.logger.log(
        `Bot created: ${bot.id} (${bot.name}) for owner ${ownerId}, botUser=${botUser.id}`,
      );

      return bot;
    });
  }

  /**
   * 获取用户的所有 Bot
   *
   * 排序：isPinned=true 的置顶，然后按创建时间升序
   */
  async findByOwner(ownerId: string) {
    return this.prisma.bot.findMany({
      where: { ownerId },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * 获取单个 Bot 详情
   *
   * 仅 owner 可查看
   */
  async findOne(id: string, ownerId: string) {
    const bot = await this.prisma.bot.findFirst({
      where: { id, ownerId },
    });

    if (!bot) {
      throw new NotFoundException('Bot not found');
    }

    return bot;
  }

  /**
   * 更新 Bot 配置
   *
   * 仅 owner 可更新。如果更新 agentConfig，需重新验证。
   * 同步更新 Bot User 的 displayName 和 avatarUrl。
   */
  async update(id: string, ownerId: string, dto: UpdateBotDto) {
    const bot = await this.prisma.bot.findFirst({
      where: { id, ownerId },
    });

    if (!bot) {
      throw new NotFoundException('Bot not found');
    }

    // 验证 agentConfig（如果有更新）
    if (dto.agentConfig) {
      const configResult = agentConfigSchema.safeParse(dto.agentConfig);
      if (!configResult.success) {
        throw new BadRequestException({
          message: 'Invalid agentConfig',
          errors: configResult.error.flatten().fieldErrors,
        });
      }
      dto.agentConfig = configResult.data;
    }

    return this.prisma.$transaction(async (tx) => {
      // 更新 Bot 记录
      const updatedBot = await tx.bot.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
          ...(dto.type !== undefined && { type: dto.type }),
          ...(dto.agentConfig !== undefined && {
            agentConfig: dto.agentConfig as Prisma.InputJsonValue,
          }),
          ...(dto.isPinned !== undefined && { isPinned: dto.isPinned }),
        },
      });

      // 同步更新 Bot User 的 displayName 和 avatarUrl
      if (dto.name !== undefined || dto.avatarUrl !== undefined) {
        await tx.user.update({
          where: { id: bot.userId },
          data: {
            ...(dto.name !== undefined && { displayName: dto.name }),
            ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
          },
        });
      }

      return updatedBot;
    });
  }

  /**
   * 删除 Bot（软删除）
   *
   * 前置检查：
   * - 仅 owner 可删除
   * - isDeletable=false 的 Bot（如 Supervisor、Coding Bot）不可删除，返回 403
   *
   * 删除策略：
   * - 硬删除 Bot 记录
   * - 软删除关联 User 记录（设置 deletedAt），保留历史消息
   */
  async delete(id: string, ownerId: string) {
    const bot = await this.prisma.bot.findFirst({
      where: { id, ownerId },
    });

    if (!bot) {
      throw new NotFoundException('Bot not found');
    }

    if (!bot.isDeletable) {
      throw new ForbiddenException(
        'This bot cannot be deleted. System bots (Supervisor, Coding Bot) are protected.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.bot.delete({ where: { id } }),
      this.prisma.user.update({
        where: { id: bot.userId },
        data: { deletedAt: new Date() },
      }),
    ]);

    this.logger.log(
      `Bot deleted: ${id} (${bot.name}) by owner ${ownerId}, botUser=${bot.userId} soft-deleted`,
    );
  }

  /**
   * 内部方法：在已有事务中创建 Bot（由 Phase 6 AuthService 调用）
   *
   * 与 create() 的区别：
   * - 接收 Prisma 事务客户端 tx，不自行开启事务
   * - isDeletable 由调用方指定（系统 Bot 为 false）
   * - 不对外暴露为 REST API
   */
  async createWithTx(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    ownerId: string,
    config: {
      name: string;
      description: string;
      type: 'REMOTE_EXEC' | 'SOCIAL_MEDIA' | 'CUSTOM';
      agentConfig: Record<string, unknown>;
      isPinned: boolean;
      isDeletable: boolean;
    },
  ) {
    const botUser = await tx.user.create({
      data: {
        email: `bot-${randomBytes(8).toString('hex')}@bot.linkingchat.internal`,
        username: `bot_${config.name.toLowerCase().replace(/\s/g, '_')}_${Date.now()}`,
        password: await argon2.hash(randomBytes(32).toString('hex')),
        displayName: config.name,
      },
    });

    const bot = await tx.bot.create({
      data: {
        name: config.name,
        description: config.description,
        type: config.type,
        agentConfig: config.agentConfig as Prisma.InputJsonValue,
        ownerId,
        userId: botUser.id,
        isPinned: config.isPinned,
        isDeletable: config.isDeletable,
      },
    });

    return { bot, botUser };
  }
}
