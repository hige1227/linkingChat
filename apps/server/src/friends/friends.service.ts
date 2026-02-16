import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BroadcastService } from '../gateway/broadcast.service';
import { SendFriendRequestDto } from './dto/send-request.dto';
import { FriendResponseDto } from './dto/friend-response.dto';

@Injectable()
export class FriendsService {
  private readonly logger = new Logger(FriendsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcast: BroadcastService,
  ) {}

  // ──────────────────────────────────────
  // 1.2 发送好友请求
  // ──────────────────────────────────────

  async sendRequest(senderId: string, dto: SendFriendRequestDto) {
    const { receiverId, message } = dto;

    // 1. 不能自己加自己
    if (senderId === receiverId) {
      throw new BadRequestException('Cannot send friend request to yourself');
    }

    // 2. 检查接收方是否存在
    const receiver = await this.prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
    });

    if (!receiver) {
      throw new NotFoundException('User not found');
    }

    // 3. 检查是否被对方拉黑（双向检查）
    const blocked = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: receiverId, blockedId: senderId },
          { blockerId: senderId, blockedId: receiverId },
        ],
      },
    });

    if (blocked) {
      throw new ForbiddenException('Cannot send friend request to this user');
    }

    // 4. 检查是否已经是好友
    const [userAId, userBId] = this.normalizeFriendshipIds(senderId, receiverId);
    const existingFriendship = await this.prisma.friendship.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
    });

    if (existingFriendship) {
      throw new ConflictException('Already friends');
    }

    // 5. 检查是否已有待处理的请求（双向检查）
    const existingRequest = await this.prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId, receiverId, status: 'PENDING' },
          { senderId: receiverId, receiverId: senderId, status: 'PENDING' },
        ],
      },
    });

    if (existingRequest) {
      // 如果对方已经发了请求给自己，则自动接受
      if (existingRequest.senderId === receiverId) {
        return this.accept(senderId, existingRequest.id);
      }
      throw new ConflictException('Friend request already sent');
    }

    // 6. 创建好友请求
    const friendRequest = await this.prisma.friendRequest.create({
      data: {
        senderId,
        receiverId,
        message,
        status: 'PENDING',
      },
      include: {
        sender: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
    });

    // 7. WS 通知接收方
    this.broadcast.unicast(receiverId, 'friend:request', {
      id: friendRequest.id,
      sender: friendRequest.sender,
      message: friendRequest.message,
      createdAt: friendRequest.createdAt.toISOString(),
    });

    this.logger.log(
      `Friend request sent: ${senderId} → ${receiverId} (requestId: ${friendRequest.id})`,
    );

    return {
      id: friendRequest.id,
      receiverId,
      message: friendRequest.message,
      status: 'PENDING',
      createdAt: friendRequest.createdAt.toISOString(),
    };
  }

  // ──────────────────────────────────────
  // 1.3 接受好友请求
  // ──────────────────────────────────────

  async accept(currentUserId: string, requestId: string) {
    // 1. 查找请求
    const friendRequest = await this.prisma.friendRequest.findUnique({
      where: { id: requestId },
      include: {
        sender: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        receiver: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
    });

    if (!friendRequest) {
      throw new NotFoundException('Friend request not found');
    }

    if (friendRequest.receiverId !== currentUserId) {
      throw new ForbiddenException('You can only accept requests sent to you');
    }

    if (friendRequest.status !== 'PENDING') {
      throw new ConflictException('Friend request is no longer pending');
    }

    // 2. Friendship ID 归一化
    const [userAId, userBId] = this.normalizeFriendshipIds(
      friendRequest.senderId,
      friendRequest.receiverId,
    );

    // 3. 事务：删除请求 + 创建好友关系 + 创建 DM 会话
    const result = await this.prisma.$transaction(async (tx) => {
      // 3a. 删除 FriendRequest
      await tx.friendRequest.delete({
        where: { id: requestId },
      });

      // 3b. 创建 Friendship
      const friendship = await tx.friendship.create({
        data: { userAId, userBId },
      });

      // 3c. 检查是否已有 DM 会话（重新添加好友场景）
      const existingDm = await tx.converse.findFirst({
        where: {
          type: 'DM',
          members: {
            every: {
              userId: { in: [friendRequest.senderId, friendRequest.receiverId] },
            },
          },
        },
        include: { members: true },
      });

      let converse;
      if (existingDm && existingDm.members.length === 2) {
        // 重新打开已有的 DM
        await tx.converseMember.updateMany({
          where: { converseId: existingDm.id },
          data: { isOpen: true },
        });
        converse = existingDm;
      } else {
        // 创建新的 DM 会话
        converse = await tx.converse.create({
          data: {
            type: 'DM',
            members: {
              create: [
                { userId: friendRequest.senderId, isOpen: true },
                { userId: friendRequest.receiverId, isOpen: true },
              ],
            },
          },
          include: { members: true },
        });
      }

      return { friendship, converse };
    });

    // 4. WS 广播：通知双方已成为好友
    this.broadcast.unicast(friendRequest.senderId, 'friend:accepted', {
      friendId: friendRequest.receiverId,
      friend: friendRequest.receiver,
    });
    this.broadcast.unicast(friendRequest.receiverId, 'friend:accepted', {
      friendId: friendRequest.senderId,
      friend: friendRequest.sender,
    });

    // 5. WS 广播：通知双方新 DM 会话
    const conversePayload = {
      id: result.converse.id,
      type: 'DM',
      members: result.converse.members.map((m) => ({
        userId: m.userId,
        isOpen: m.isOpen,
      })),
      createdAt: result.converse.createdAt?.toISOString?.() ?? new Date().toISOString(),
    };

    this.broadcast.listcast(
      [friendRequest.senderId, friendRequest.receiverId],
      'converse:new',
      conversePayload,
    );

    this.logger.log(
      `Friend request accepted: ${friendRequest.senderId} ↔ ${friendRequest.receiverId} (friendship: ${result.friendship.id}, dm: ${result.converse.id})`,
    );

    return {
      friendshipId: result.friendship.id,
      converseId: result.converse.id,
    };
  }

  // ──────────────────────────────────────
  // 1.4 拒绝好友请求
  // ──────────────────────────────────────

  async reject(currentUserId: string, requestId: string) {
    const friendRequest = await this.prisma.friendRequest.findUnique({
      where: { id: requestId },
    });

    if (!friendRequest) {
      throw new NotFoundException('Friend request not found');
    }

    if (friendRequest.receiverId !== currentUserId) {
      throw new ForbiddenException('You can only reject requests sent to you');
    }

    if (friendRequest.status !== 'PENDING') {
      throw new ConflictException('Friend request is no longer pending');
    }

    const updated = await this.prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED' },
    });

    this.logger.log(
      `Friend request rejected: ${friendRequest.senderId} → ${currentUserId} (requestId: ${requestId})`,
    );

    return { id: updated.id, status: 'REJECTED' };
  }

  // ──────────────────────────────────────
  // 1.5 好友列表
  // ──────────────────────────────────────

  async getFriendList(userId: string): Promise<FriendResponseDto[]> {
    // 1. 双向查询好友关系
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      include: {
        userA: {
          select: {
            id: true, username: true, displayName: true, avatarUrl: true, status: true,
          },
        },
        userB: {
          select: {
            id: true, username: true, displayName: true, avatarUrl: true, status: true,
          },
        },
      },
    });

    // 2. 提取"对方"用户信息
    const friendUserIds: string[] = [];
    const friendMap = new Map<string, {
      user: { id: string; username: string; displayName: string; avatarUrl: string | null; status: string };
    }>();

    for (const f of friendships) {
      const friend = f.userAId === userId ? f.userB : f.userA;
      friendMap.set(friend.id, { user: friend });
      friendUserIds.push(friend.id);
    }

    // 3. 批量查询 DM 会话 ID
    const dmConverses = await this.prisma.converseMember.findMany({
      where: {
        userId,
        converse: { type: 'DM' },
        isOpen: true,
      },
      include: {
        converse: {
          include: {
            members: {
              where: { userId: { not: userId } },
              select: { userId: true },
            },
          },
        },
      },
    });

    // 建立 friendUserId → converseId 映射
    const dmMap = new Map<string, string>();
    for (const cm of dmConverses) {
      const otherMember = cm.converse.members[0];
      if (otherMember) {
        dmMap.set(otherMember.userId, cm.converseId);
      }
    }

    // 4. 组装响应
    return friendUserIds.map((friendId) => {
      const entry = friendMap.get(friendId)!;
      return {
        id: entry.user.id,
        username: entry.user.username,
        displayName: entry.user.displayName,
        avatarUrl: entry.user.avatarUrl,
        status: entry.user.status as 'ONLINE' | 'IDLE' | 'DND' | 'OFFLINE',
        converseId: dmMap.get(friendId),
      };
    });
  }

  // ──────────────────────────────────────
  // 1.6 删除好友
  // ──────────────────────────────────────

  async removeFriend(currentUserId: string, targetUserId: string) {
    const [userAId, userBId] = this.normalizeFriendshipIds(currentUserId, targetUserId);

    const friendship = await this.prisma.friendship.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
    });

    if (!friendship) {
      throw new NotFoundException('Friendship not found');
    }

    // 事务：删除好友关系 + 关闭 DM 会话
    await this.prisma.$transaction(async (tx) => {
      await tx.friendship.delete({
        where: { id: friendship.id },
      });

      const dmConverse = await tx.converse.findFirst({
        where: {
          type: 'DM',
          AND: [
            { members: { some: { userId: currentUserId } } },
            { members: { some: { userId: targetUserId } } },
          ],
        },
      });

      if (dmConverse) {
        await tx.converseMember.updateMany({
          where: { converseId: dmConverse.id },
          data: { isOpen: false },
        });
      }
    });

    // WS 通知双方
    this.broadcast.unicast(currentUserId, 'friend:removed', {
      userId: targetUserId,
    });
    this.broadcast.unicast(targetUserId, 'friend:removed', {
      userId: currentUserId,
    });

    this.logger.log(`Friendship removed: ${currentUserId} ↔ ${targetUserId}`);

    return { success: true };
  }

  // ──────────────────────────────────────
  // 1.7 拉黑用户
  // ──────────────────────────────────────

  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new BadRequestException('Cannot block yourself');
    }

    const blockedUser = await this.prisma.user.findUnique({
      where: { id: blockedId },
      select: { id: true },
    });

    if (!blockedUser) {
      throw new NotFoundException('User not found');
    }

    const existingBlock = await this.prisma.userBlock.findFirst({
      where: { blockerId, blockedId },
    });

    if (existingBlock) {
      throw new ConflictException('User already blocked');
    }

    // 事务：创建拉黑 + 删除好友关系 + 删除待处理请求
    const [userAId, userBId] = this.normalizeFriendshipIds(blockerId, blockedId);
    let hadFriendship = false;

    await this.prisma.$transaction(async (tx) => {
      await tx.userBlock.create({
        data: { blockerId, blockedId },
      });

      const friendship = await tx.friendship.findUnique({
        where: { userAId_userBId: { userAId, userBId } },
      });

      if (friendship) {
        hadFriendship = true;
        await tx.friendship.delete({
          where: { id: friendship.id },
        });

        const dmConverse = await tx.converse.findFirst({
          where: {
            type: 'DM',
            AND: [
              { members: { some: { userId: blockerId } } },
              { members: { some: { userId: blockedId } } },
            ],
          },
        });

        if (dmConverse) {
          await tx.converseMember.updateMany({
            where: { converseId: dmConverse.id },
            data: { isOpen: false },
          });
        }
      }

      await tx.friendRequest.deleteMany({
        where: {
          OR: [
            { senderId: blockerId, receiverId: blockedId, status: 'PENDING' },
            { senderId: blockedId, receiverId: blockerId, status: 'PENDING' },
          ],
        },
      });
    });

    // 如果之前是好友，通知被拉黑方
    if (hadFriendship) {
      this.broadcast.unicast(blockedId, 'friend:removed', {
        userId: blockerId,
      });
    }

    this.logger.log(`User blocked: ${blockerId} blocked ${blockedId}`);

    return { success: true };
  }

  // ──────────────────────────────────────
  // 1.9 待处理请求列表
  // ──────────────────────────────────────

  async getPendingRequests(userId: string) {
    const [sent, received] = await Promise.all([
      this.prisma.friendRequest.findMany({
        where: { senderId: userId, status: 'PENDING' },
        include: {
          receiver: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),

      this.prisma.friendRequest.findMany({
        where: { receiverId: userId, status: 'PENDING' },
        include: {
          sender: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      sent: sent.map((r) => ({
        id: r.id,
        user: r.receiver,
        message: r.message,
        createdAt: r.createdAt.toISOString(),
      })),
      received: received.map((r) => ({
        id: r.id,
        user: r.sender,
        message: r.message,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  // ──────────────────────────────────────
  // 1.10 获取好友 ID 列表（供 PresenceService 使用）
  // ──────────────────────────────────────

  async getFriendIds(userId: string): Promise<string[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      select: { userAId: true, userBId: true },
    });

    return friendships.map((f) =>
      f.userAId === userId ? f.userBId : f.userAId,
    );
  }

  // ──────────────────────────────────────
  // 工具方法
  // ──────────────────────────────────────

  /**
   * Friendship ID 归一化：较小 ID 放 userAId，较大 ID 放 userBId
   */
  private normalizeFriendshipIds(
    userId1: string,
    userId2: string,
  ): [string, string] {
    const [userAId, userBId] = [userId1, userId2].sort();
    return [userAId, userBId];
  }
}
