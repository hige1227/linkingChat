import { Injectable, Inject, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  /** Redis Key 常量 */
  private static readonly ONLINE_USERS_KEY = 'online_users';
  private static readonly STATUS_PREFIX = 'user:status:';
  private static readonly SOCKETS_PREFIX = 'user:sockets:';
  private static readonly STATUS_TTL = 300; // 5 分钟

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 标记用户在线
   *
   * 1. 将 userId 添加到 online_users SET
   * 2. 将 socketId 添加到 user:sockets:{userId} SET
   * 3. 设置 user:status:{userId} 为 ONLINE（TTL 300s）
   * 4. 更新数据库 User.status = ONLINE
   */
  async setOnline(userId: string, socketId: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.sadd(PresenceService.ONLINE_USERS_KEY, userId);
    pipeline.sadd(`${PresenceService.SOCKETS_PREFIX}${userId}`, socketId);
    pipeline.set(
      `${PresenceService.STATUS_PREFIX}${userId}`,
      'ONLINE',
      'EX',
      PresenceService.STATUS_TTL,
    );
    await pipeline.exec();

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'ONLINE' },
    });

    this.logger.debug(`User ${userId} marked ONLINE (socket: ${socketId})`);
  }

  /**
   * 标记用户离线（单个 socket 断开）
   *
   * 1. 从 user:sockets:{userId} 移除该 socketId
   * 2. 检查剩余 socket 数量
   * 3. 如果没有剩余 socket → 真正离线
   */
  async setOffline(userId: string, socketId: string): Promise<void> {
    await this.redis.srem(
      `${PresenceService.SOCKETS_PREFIX}${userId}`,
      socketId,
    );

    const remaining = await this.redis.scard(
      `${PresenceService.SOCKETS_PREFIX}${userId}`,
    );

    if (remaining === 0) {
      const pipeline = this.redis.pipeline();
      pipeline.srem(PresenceService.ONLINE_USERS_KEY, userId);
      pipeline.del(`${PresenceService.STATUS_PREFIX}${userId}`);
      pipeline.del(`${PresenceService.SOCKETS_PREFIX}${userId}`);
      await pipeline.exec();

      await this.prisma.user.update({
        where: { id: userId },
        data: { status: 'OFFLINE', lastSeenAt: new Date() },
      });

      this.logger.debug(`User ${userId} marked OFFLINE (all sockets closed)`);
    } else {
      this.logger.debug(
        `User ${userId} socket ${socketId} disconnected, ${remaining} socket(s) remaining`,
      );
    }
  }

  /**
   * 主动切换状态（ONLINE / IDLE / DND）
   */
  async updateStatus(
    userId: string,
    status: 'ONLINE' | 'IDLE' | 'DND',
  ): Promise<void> {
    await this.redis.set(
      `${PresenceService.STATUS_PREFIX}${userId}`,
      status,
      'EX',
      PresenceService.STATUS_TTL,
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { status },
    });

    this.logger.debug(`User ${userId} status updated to ${status}`);
  }

  /**
   * 心跳刷新 — 延长 status key 的 TTL
   */
  async refreshTtl(userId: string): Promise<void> {
    const key = `${PresenceService.STATUS_PREFIX}${userId}`;
    const exists = await this.redis.exists(key);
    if (exists) {
      await this.redis.expire(key, PresenceService.STATUS_TTL);
    }
  }

  /**
   * 判断用户是否在线 — O(1) SISMEMBER
   */
  async isOnline(userId: string): Promise<boolean> {
    return (
      (await this.redis.sismember(
        PresenceService.ONLINE_USERS_KEY,
        userId,
      )) === 1
    );
  }

  /**
   * 批量查询多个用户的在线状态（Redis pipeline）
   */
  async getStatuses(
    userIds: string[],
  ): Promise<Map<string, string>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const pipeline = this.redis.pipeline();
    userIds.forEach((id) =>
      pipeline.get(`${PresenceService.STATUS_PREFIX}${id}`),
    );
    const results = await pipeline.exec();

    const map = new Map<string, string>();
    userIds.forEach((id, i) => {
      const [err, value] = results![i];
      map.set(id, err ? 'OFFLINE' : (value as string) || 'OFFLINE');
    });

    return map;
  }

  /**
   * 获取单个用户的状态
   */
  async getStatus(userId: string): Promise<string> {
    const status = await this.redis.get(
      `${PresenceService.STATUS_PREFIX}${userId}`,
    );
    return status || 'OFFLINE';
  }

  /**
   * 获取在线用户总数（监控用）
   */
  async getOnlineCount(): Promise<number> {
    return this.redis.scard(PresenceService.ONLINE_USERS_KEY);
  }
}
