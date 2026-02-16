import { Injectable, Logger } from '@nestjs/common';
import { Namespace } from 'socket.io';

@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);
  private namespaces = new Map<string, Namespace>();

  /**
   * 由 Gateway 在 afterInit 中调用，传入 Socket.IO Namespace 实例。
   * @param key  命名空间标识（'device' | 'chat'）
   * @param ns   Socket.IO Namespace 实例
   */
  setNamespace(key: string, ns: Namespace) {
    this.namespaces.set(key, ns);
    this.logger.log(
      `BroadcastService registered namespace: ${key} (${ns.name})`,
    );
  }

  private getNs(key: string): Namespace {
    const ns = this.namespaces.get(key);
    if (!ns) {
      throw new Error(
        `BroadcastService: namespace "${key}" not registered. Call setNamespace() first.`,
      );
    }
    return ns;
  }

  // ──────────────────────────────────────
  // 通用方法（默认使用 device 命名空间，保持向后兼容）
  // ──────────────────────────────────────

  /** 发送到单个用户的所有连接（个人房间 u-{userId}） */
  unicast(userId: string, event: string, data: unknown) {
    this.getNs('device').to(`u-${userId}`).emit(event, data);
  }

  /** 发送到多个用户 */
  listcast(userIds: string[], event: string, data: unknown) {
    const rooms = userIds.map((id) => `u-${id}`);
    this.getNs('device').to(rooms).emit(event, data);
  }

  /** 发送到特定房间（device 命名空间） */
  emitToRoom(roomId: string, event: string, data: unknown) {
    this.getNs('device').to(roomId).emit(event, data);
  }

  // ──────────────────────────────────────
  // Chat 命名空间方法
  // ──────────────────────────────────────

  /** 发送到 chat 命名空间的指定房间（如 converseId 房间） */
  toRoom(roomId: string, event: string, data: unknown) {
    this.getNs('chat').to(roomId).emit(event, data);
  }

  /**
   * 向 targetRoom 发送事件，但仅限于 NOT 在 excludeRoom 中的 socket。
   * 用于：用户不在聊天房间时通过个人房间 u-{userId} 推送通知。
   */
  toRoomIfNotIn(
    targetRoom: string,
    excludeRoom: string,
    event: string,
    data: unknown,
  ): void {
    const ns = this.getNs('chat');
    const targetSockets = ns.adapter.rooms.get(targetRoom);
    const excludeSockets = ns.adapter.rooms.get(excludeRoom);

    if (!targetSockets) return;

    for (const socketId of targetSockets) {
      if (excludeSockets && excludeSockets.has(socketId)) continue;
      ns.to(socketId).emit(event, data);
    }
  }
}
