import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Namespace } from 'socket.io';
import { createWsAuthMiddleware } from './middleware/ws-auth.middleware';
import { BroadcastService } from './broadcast.service';
import { PresenceService } from './presence.service';
import { ConversesService } from '../converses/converses.service';
import { FriendsService } from '../friends/friends.service';
import { PrismaService } from '../prisma/prisma.service';
import type { TypedSocket, PresencePayload } from '@linkingchat/ws-protocol';

@WebSocketGateway({ namespace: '/chat' })
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  namespace: Namespace;

  constructor(
    private readonly broadcastService: BroadcastService,
    private readonly presenceService: PresenceService,
    private readonly conversesService: ConversesService,
    private readonly friendsService: FriendsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 注册 JWT 认证中间件 + 注册 chat 命名空间到 BroadcastService
   */
  afterInit(namespace: Namespace) {
    namespace.use(createWsAuthMiddleware());
    this.broadcastService.setNamespace('chat', namespace);
    this.logger.log('Chat Gateway initialized with RS256 auth middleware');
  }

  /**
   * 连接成功：加入个人房间 + 标记在线 + 通知好友
   */
  async handleConnection(client: TypedSocket) {
    const userId = client.data.userId;
    client.join(`u-${userId}`);

    try {
      const wasOnline = await this.presenceService.isOnline(userId);
      await this.presenceService.setOnline(userId, client.id);

      if (!wasOnline) {
        await this.broadcastPresenceChange(userId, 'ONLINE');
      }

      this.logger.log(
        `[Chat] Client connected: ${client.id} | userId=${userId} | wasOnline=${wasOnline}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle connection for user ${userId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * 断开连接：标记离线 + 通知好友（仅当所有设备都断开时）
   */
  async handleDisconnect(client: TypedSocket) {
    const userId = client.data.userId;

    try {
      await this.presenceService.setOffline(userId, client.id);

      const stillOnline = await this.presenceService.isOnline(userId);
      if (!stillOnline) {
        await this.broadcastPresenceChange(userId, 'OFFLINE');
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle disconnect for user ${userId}: ${(error as Error).message}`,
      );
    }

    this.logger.log(
      `[Chat] Client disconnected: ${client.id} | userId=${userId}`,
    );
  }

  /**
   * converse:join — 客户端打开某个会话时调用
   */
  @SubscribeMessage('converse:join')
  async handleJoin(
    @ConnectedSocket() client: TypedSocket,
    @MessageBody() data: { converseId: string },
  ) {
    const userId = client.data.userId;

    try {
      await this.conversesService.verifyMembership(data.converseId, userId);
      client.join(data.converseId);
      this.logger.debug(
        `[Chat] User ${userId} joined room ${data.converseId}`,
      );
      return { success: true };
    } catch {
      this.logger.warn(
        `[Chat] converse:join rejected: user ${userId}, converse ${data.converseId}`,
      );
      return {
        success: false,
        error: {
          code: 'JOIN_DENIED',
          message: 'Not a member of this conversation',
        },
      };
    }
  }

  /**
   * converse:leave — 客户端离开某个会话时调用
   */
  @SubscribeMessage('converse:leave')
  async handleLeave(
    @ConnectedSocket() client: TypedSocket,
    @MessageBody() data: { converseId: string },
  ) {
    client.leave(data.converseId);
    this.logger.debug(
      `[Chat] User ${client.data.userId} left room ${data.converseId}`,
    );
    return { success: true };
  }

  /**
   * message:typing — 输入状态广播
   */
  @SubscribeMessage('message:typing')
  handleTyping(
    @ConnectedSocket() client: TypedSocket,
    @MessageBody() data: { converseId: string; isTyping: boolean },
  ) {
    const userId = client.data.userId;

    client.to(data.converseId).emit('message:typing', {
      converseId: data.converseId,
      userId,
      isTyping: data.isTyping,
    });
  }

  /**
   * presence:update — 客户端主动切换状态（ONLINE / IDLE / DND）
   */
  @SubscribeMessage('presence:update')
  async handlePresenceUpdate(
    @ConnectedSocket() client: TypedSocket,
    @MessageBody() data: { status: 'ONLINE' | 'IDLE' | 'DND' },
  ) {
    const userId = client.data.userId;
    const validStatuses = ['ONLINE', 'IDLE', 'DND'];

    if (!data.status || !validStatuses.includes(data.status)) {
      return {
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Status must be one of: ${validStatuses.join(', ')}`,
        },
      };
    }

    try {
      await this.presenceService.updateStatus(userId, data.status);
      await this.broadcastPresenceChange(userId, data.status);

      this.logger.log(
        `[Chat] User ${userId} updated status to ${data.status}`,
      );

      return { success: true, data: { status: data.status } };
    } catch (error) {
      this.logger.error(
        `Failed to update presence for user ${userId}: ${(error as Error).message}`,
      );
      return {
        success: false,
        error: {
          code: 'PRESENCE_UPDATE_FAILED',
          message: (error as Error).message,
        },
      };
    }
  }

  /**
   * message:read — 已读回执
   * 客户端打开会话或滚动到新消息时发送，更新 lastSeenMessageId + 广播给其他成员
   */
  @SubscribeMessage('message:read')
  async handleMessageRead(
    @ConnectedSocket() client: TypedSocket,
    @MessageBody() data: { converseId: string; lastSeenMessageId: string },
  ) {
    const userId = client.data.userId;

    if (!data.converseId || !data.lastSeenMessageId) {
      return;
    }

    // 1. 校验用户是否为该会话成员
    const member = await this.prisma.converseMember.findUnique({
      where: {
        converseId_userId: {
          converseId: data.converseId,
          userId,
        },
      },
    });

    if (!member) {
      this.logger.warn(
        `message:read rejected: user ${userId} is not a member of converse ${data.converseId}`,
      );
      return;
    }

    // 2. 校验 lastSeenMessageId 确实属于该会话
    const message = await this.prisma.message.findFirst({
      where: {
        id: data.lastSeenMessageId,
        converseId: data.converseId,
        deletedAt: null,
      },
      select: { id: true, createdAt: true },
    });

    if (!message) {
      this.logger.warn(
        `message:read rejected: message ${data.lastSeenMessageId} not found in converse ${data.converseId}`,
      );
      return;
    }

    // 3. 防止游标回退 — 仅在新消息比当前已读位置更新时才更新
    if (member.lastSeenMessageId) {
      const currentLastSeen = await this.prisma.message.findUnique({
        where: { id: member.lastSeenMessageId },
        select: { createdAt: true },
      });

      if (currentLastSeen && currentLastSeen.createdAt >= message.createdAt) {
        return;
      }
    }

    // 4. 更新 DB
    await this.prisma.converseMember.update({
      where: {
        converseId_userId: {
          converseId: data.converseId,
          userId,
        },
      },
      data: { lastSeenMessageId: data.lastSeenMessageId },
    });

    // 5. 广播给同会话其他成员（排除发送者）
    client.to(data.converseId).emit('message:read', {
      converseId: data.converseId,
      userId,
      lastSeenMessageId: data.lastSeenMessageId,
    });

    this.logger.debug(
      `message:read: user=${userId} converse=${data.converseId} lastSeen=${data.lastSeenMessageId}`,
    );
  }

  /**
   * 向用户的所有好友广播状态变更
   * 通过 chat 命名空间的个人房间 u-{friendId} 推送
   */
  private async broadcastPresenceChange(
    userId: string,
    status: string,
  ): Promise<void> {
    try {
      const friendIds = await this.friendsService.getFriendIds(userId);

      if (friendIds.length === 0) {
        return;
      }

      const payload: PresencePayload = {
        userId,
        status,
        lastSeenAt: new Date().toISOString(),
      };

      for (const friendId of friendIds) {
        this.broadcastService.toRoom(
          `u-${friendId}`,
          'presence:changed',
          payload,
        );
      }

      this.logger.debug(
        `Presence change broadcast: user=${userId} status=${status} → ${friendIds.length} friend(s)`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to broadcast presence change for user ${userId}: ${(error as Error).message}`,
      );
    }
  }
}
