import { Test, TestingModule } from '@nestjs/testing';
import { FriendsService } from './friends.service';
import { PrismaService } from '../prisma/prisma.service';
import { BroadcastService } from '../gateway/broadcast.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

describe('FriendsService', () => {
  let service: FriendsService;
  let prisma: jest.Mocked<PrismaService>;
  let broadcast: jest.Mocked<BroadcastService>;

  const mockPrisma: any = {
    user: { findUnique: jest.fn() },
    friendRequest: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
    },
    friendship: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    userBlock: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    converse: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    converseMember: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((fn: any) => fn(mockPrisma)),
  };

  const mockBroadcast = {
    unicast: jest.fn(),
    listcast: jest.fn(),
    emitToRoom: jest.fn(),
    toRoom: jest.fn(),
    toRoomIfNotIn: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FriendsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BroadcastService, useValue: mockBroadcast },
      ],
    }).compile();

    service = module.get<FriendsService>(FriendsService);
    prisma = module.get(PrismaService);
    broadcast = module.get(BroadcastService);

    jest.clearAllMocks();
  });

  describe('sendRequest', () => {
    it('should throw BadRequestException when sending to self', async () => {
      await expect(
        service.sendRequest('user1', { receiverId: 'user1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when receiver does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.sendRequest('user1', { receiverId: 'user2' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when blocked', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user2' });
      mockPrisma.userBlock.findFirst.mockResolvedValue({
        id: 'b1',
        blockerId: 'user2',
        blockedId: 'user1',
      });

      await expect(
        service.sendRequest('user1', { receiverId: 'user2' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException when already friends', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user2' });
      mockPrisma.userBlock.findFirst.mockResolvedValue(null);
      mockPrisma.friendship.findUnique.mockResolvedValue({
        id: 'f1',
        userAId: 'user1',
        userBId: 'user2',
      });

      await expect(
        service.sendRequest('user1', { receiverId: 'user2' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when duplicate request', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user2' });
      mockPrisma.userBlock.findFirst.mockResolvedValue(null);
      mockPrisma.friendship.findUnique.mockResolvedValue(null);
      mockPrisma.friendRequest.findFirst.mockResolvedValue({
        id: 'req1',
        senderId: 'user1',
        receiverId: 'user2',
        status: 'PENDING',
      });

      await expect(
        service.sendRequest('user1', { receiverId: 'user2' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create request and broadcast to receiver', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user2',
        username: 'alice',
        displayName: 'Alice',
        avatarUrl: null,
      });
      mockPrisma.userBlock.findFirst.mockResolvedValue(null);
      mockPrisma.friendship.findUnique.mockResolvedValue(null);
      mockPrisma.friendRequest.findFirst.mockResolvedValue(null);
      mockPrisma.friendRequest.create.mockResolvedValue({
        id: 'req1',
        senderId: 'user1',
        receiverId: 'user2',
        message: 'Hi!',
        status: 'PENDING',
        createdAt: new Date('2026-02-14T10:00:00Z'),
        sender: {
          id: 'user1',
          username: 'bob',
          displayName: 'Bob',
          avatarUrl: null,
        },
      });

      const result = await service.sendRequest('user1', {
        receiverId: 'user2',
        message: 'Hi!',
      });

      expect((result as any).id).toBe('req1');
      expect((result as any).status).toBe('PENDING');
      expect(mockBroadcast.unicast).toHaveBeenCalledWith(
        'user2',
        'friend:request',
        expect.objectContaining({ id: 'req1' }),
      );
    });
  });

  describe('accept', () => {
    it('should throw NotFoundException when request not found', async () => {
      mockPrisma.friendRequest.findUnique.mockResolvedValue(null);

      await expect(service.accept('user2', 'req1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when not the receiver', async () => {
      mockPrisma.friendRequest.findUnique.mockResolvedValue({
        id: 'req1',
        senderId: 'user1',
        receiverId: 'user3',
        status: 'PENDING',
      });

      await expect(service.accept('user2', 'req1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ConflictException when not pending', async () => {
      mockPrisma.friendRequest.findUnique.mockResolvedValue({
        id: 'req1',
        senderId: 'user1',
        receiverId: 'user2',
        status: 'REJECTED',
        sender: { id: 'user1', username: 'a', displayName: 'A', avatarUrl: null },
        receiver: { id: 'user2', username: 'b', displayName: 'B', avatarUrl: null },
      });

      await expect(service.accept('user2', 'req1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should create friendship with normalized IDs', async () => {
      mockPrisma.friendRequest.findUnique.mockResolvedValue({
        id: 'req1',
        senderId: 'user1',
        receiverId: 'user2',
        status: 'PENDING',
        sender: {
          id: 'user1',
          username: 'a',
          displayName: 'A',
          avatarUrl: null,
        },
        receiver: {
          id: 'user2',
          username: 'b',
          displayName: 'B',
          avatarUrl: null,
        },
      });
      mockPrisma.friendRequest.delete.mockResolvedValue({});
      mockPrisma.friendship.create.mockResolvedValue({
        id: 'f1',
        userAId: 'user1',
        userBId: 'user2',
      });
      mockPrisma.converse.findFirst.mockResolvedValue(null);
      mockPrisma.converse.create.mockResolvedValue({
        id: 'dm1',
        type: 'DM',
        createdAt: new Date(),
        members: [
          { userId: 'user1', isOpen: true },
          { userId: 'user2', isOpen: true },
        ],
      });

      const result = await service.accept('user2', 'req1');

      expect(result.friendshipId).toBe('f1');
      expect(result.converseId).toBe('dm1');

      // Verify friendship.create used normalized IDs
      expect(mockPrisma.friendship.create).toHaveBeenCalledWith({
        data: { userAId: 'user1', userBId: 'user2' },
      });

      // Verify both parties notified
      expect(mockBroadcast.unicast).toHaveBeenCalledTimes(2);
      expect(mockBroadcast.listcast).toHaveBeenCalledWith(
        ['user1', 'user2'],
        'converse:new',
        expect.objectContaining({ id: 'dm1', type: 'DM' }),
      );
    });
  });

  describe('normalizeFriendshipIds', () => {
    it('should put smaller ID in userAId', () => {
      const result = (service as any).normalizeFriendshipIds('zzz', 'aaa');
      expect(result).toEqual(['aaa', 'zzz']);
    });

    it('should handle equal IDs', () => {
      const result = (service as any).normalizeFriendshipIds('same', 'same');
      expect(result).toEqual(['same', 'same']);
    });
  });

  describe('reject', () => {
    it('should throw NotFoundException when request not found', async () => {
      mockPrisma.friendRequest.findUnique.mockResolvedValue(null);

      await expect(service.reject('user2', 'req1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when not the receiver', async () => {
      mockPrisma.friendRequest.findUnique.mockResolvedValue({
        id: 'req1',
        senderId: 'user1',
        receiverId: 'user3',
        status: 'PENDING',
      });

      await expect(service.reject('user2', 'req1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should update status to REJECTED', async () => {
      mockPrisma.friendRequest.findUnique.mockResolvedValue({
        id: 'req1',
        senderId: 'user1',
        receiverId: 'user2',
        status: 'PENDING',
      });
      mockPrisma.friendRequest.update.mockResolvedValue({
        id: 'req1',
        status: 'REJECTED',
      });

      const result = await service.reject('user2', 'req1');
      expect(result.status).toBe('REJECTED');
    });

    it('should not send WS notification on reject', async () => {
      mockPrisma.friendRequest.findUnique.mockResolvedValue({
        id: 'req1',
        senderId: 'user1',
        receiverId: 'user2',
        status: 'PENDING',
      });
      mockPrisma.friendRequest.update.mockResolvedValue({
        id: 'req1',
        status: 'REJECTED',
      });

      await service.reject('user2', 'req1');
      expect(mockBroadcast.unicast).not.toHaveBeenCalled();
    });
  });

  describe('removeFriend', () => {
    it('should throw NotFoundException when not friends', async () => {
      mockPrisma.friendship.findUnique.mockResolvedValue(null);

      await expect(
        service.removeFriend('user1', 'user2'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should delete friendship and close DM', async () => {
      mockPrisma.friendship.findUnique.mockResolvedValue({
        id: 'f1',
        userAId: 'user1',
        userBId: 'user2',
      });
      mockPrisma.friendship.delete.mockResolvedValue({});
      mockPrisma.converse.findFirst.mockResolvedValue({ id: 'dm1' });
      mockPrisma.converseMember.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.removeFriend('user1', 'user2');
      expect(result.success).toBe(true);

      // Verify both parties notified with friend:removed
      expect(mockBroadcast.unicast).toHaveBeenCalledWith(
        'user1',
        'friend:removed',
        { userId: 'user2' },
      );
      expect(mockBroadcast.unicast).toHaveBeenCalledWith(
        'user2',
        'friend:removed',
        { userId: 'user1' },
      );
    });
  });

  describe('blockUser', () => {
    it('should throw BadRequestException when blocking self', async () => {
      await expect(
        service.blockUser('user1', 'user1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.blockUser('user1', 'user2'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when already blocked', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user2' });
      mockPrisma.userBlock.findFirst.mockResolvedValue({
        id: 'b1',
        blockerId: 'user1',
        blockedId: 'user2',
      });

      await expect(
        service.blockUser('user1', 'user2'),
      ).rejects.toThrow(ConflictException);
    });

    it('should create block and delete friendship if exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user2' });
      mockPrisma.userBlock.findFirst.mockResolvedValue(null);
      mockPrisma.userBlock.create.mockResolvedValue({});
      mockPrisma.friendship.findUnique.mockResolvedValue({
        id: 'f1',
        userAId: 'user1',
        userBId: 'user2',
      });
      mockPrisma.friendship.delete.mockResolvedValue({});
      mockPrisma.converse.findFirst.mockResolvedValue({ id: 'dm1' });
      mockPrisma.converseMember.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.friendRequest.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.blockUser('user1', 'user2');
      expect(result.success).toBe(true);

      // Verify only the blocked party is notified (as friend:removed)
      expect(mockBroadcast.unicast).toHaveBeenCalledWith(
        'user2',
        'friend:removed',
        { userId: 'user1' },
      );
      expect(mockBroadcast.unicast).toHaveBeenCalledTimes(1);
    });

    it('should not notify when no prior friendship', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user2' });
      mockPrisma.userBlock.findFirst.mockResolvedValue(null);
      mockPrisma.userBlock.create.mockResolvedValue({});
      mockPrisma.friendship.findUnique.mockResolvedValue(null);
      mockPrisma.friendRequest.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.blockUser('user1', 'user2');
      expect(result.success).toBe(true);

      // No notification since they weren't friends
      expect(mockBroadcast.unicast).not.toHaveBeenCalled();
    });
  });

  describe('getPendingRequests', () => {
    it('should return sent and received requests', async () => {
      mockPrisma.friendRequest.findMany
        .mockResolvedValueOnce([
          {
            id: 'req1',
            senderId: 'user1',
            receiverId: 'user2',
            message: 'Hi',
            status: 'PENDING',
            createdAt: new Date('2026-02-14T10:00:00Z'),
            receiver: {
              id: 'user2',
              username: 'alice',
              displayName: 'Alice',
              avatarUrl: null,
            },
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'req2',
            senderId: 'user3',
            receiverId: 'user1',
            message: null,
            status: 'PENDING',
            createdAt: new Date('2026-02-14T11:00:00Z'),
            sender: {
              id: 'user3',
              username: 'charlie',
              displayName: 'Charlie',
              avatarUrl: null,
            },
          },
        ]);

      const result = await service.getPendingRequests('user1');

      expect(result.sent).toHaveLength(1);
      expect(result.sent[0].id).toBe('req1');
      expect(result.received).toHaveLength(1);
      expect(result.received[0].id).toBe('req2');
    });
  });
});
