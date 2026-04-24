jest.mock('@mariozechner/pi-ai', () => ({}), { virtual: true });
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { BroadcastService } from '../gateway/broadcast.service';
import { ConversesService } from '../converses/converses.service';
import { MentionService } from '../mentions/mentions.service';
import { UploadService } from '../upload/upload.service';
import { MetricsService } from '../metrics/metrics.service';
import { I18nService } from '../i18n/i18n.service';
import { WhisperService } from '../ai/services/whisper.service';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

describe('MessagesService', () => {
  let service: MessagesService;

  const mockPrisma: any = {
    message: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    converseMember: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    converse: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    bot: {
      findUnique: jest.fn(),
    },
    relationshipProfile: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn((args: any) => Promise.resolve(args)),
    $queryRaw: jest.fn(),
  };

  const mockBroadcast = {
    unicast: jest.fn(),
    listcast: jest.fn(),
    emitToRoom: jest.fn(),
    toRoom: jest.fn(),
    toRoomIfNotIn: jest.fn(),
    setNamespace: jest.fn(),
  };

  const mockConverses = {
    verifyMembership: jest.fn(),
    getMemberIds: jest.fn(),
    checkMuted: jest.fn().mockResolvedValue(null), // Phase 9: 默认未禁言
  };



  const mockMention = {
    parse: jest.fn().mockReturnValue([]),
    validate: jest.fn().mockResolvedValue([]),
    route: jest.fn().mockResolvedValue(undefined),
  };

  const mockUpload = {
    deleteFile: jest.fn().mockResolvedValue(undefined),
  };

  const mockMetricsService = {
    httpRequestDuration: { observe: jest.fn(), labels: jest.fn().mockReturnThis() },
    httpRequestsTotal: { inc: jest.fn(), labels: jest.fn().mockReturnThis() },
    wsConnectionsActive: { inc: jest.fn(), dec: jest.fn(), labels: jest.fn().mockReturnThis() },
    wsMessagesTotal: { inc: jest.fn(), labels: jest.fn().mockReturnThis() },
    messagesSentTotal: { inc: jest.fn() },
    messagesRecalledTotal: { inc: jest.fn() },
    llmRequestsTotal: { inc: jest.fn(), labels: jest.fn().mockReturnThis() },
    llmLatencySeconds: { observe: jest.fn(), labels: jest.fn().mockReturnThis() },
    uploadsTotal: { inc: jest.fn(), labels: jest.fn().mockReturnThis() },
  };

  const mockI18nService = {
    t: jest.fn((key: string) => key),
    detectLocale: jest.fn(() => 'en'),
  };

  const mockWhisperService = {
    shouldTrigger: jest.fn().mockReturnValue(true),
    handleWhisperRequest: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BroadcastService, useValue: mockBroadcast },
        { provide: ConversesService, useValue: mockConverses },
        { provide: MentionService, useValue: mockMention },
        { provide: UploadService, useValue: mockUpload },
        { provide: MetricsService, useValue: mockMetricsService },
        { provide: I18nService, useValue: mockI18nService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: WhisperService, useValue: mockWhisperService },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
    jest.clearAllMocks();

    // Default: detectBotRecipient finds no other members (fire-and-forget)
    mockPrisma.converseMember.findMany.mockResolvedValue([]);
    // Default: handleGroupMentions returns early (DIRECT type)
    mockPrisma.converse.findUnique.mockResolvedValue({ type: 'DIRECT' });
  });

  describe('create', () => {
    const baseDto = {
      converseId: 'conv1',
      content: 'Hello!',
    };

    it('should throw ForbiddenException when not a member', async () => {
      mockConverses.verifyMembership.mockRejectedValue(
        new ForbiddenException('Not a member'),
      );

      await expect(service.create('user1', baseDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException when replyTo message not found', async () => {
      mockConverses.verifyMembership.mockResolvedValue({});
      mockPrisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user1', { ...baseDto, replyToId: 'nonexistent' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when replyTo is from different converse', async () => {
      mockConverses.verifyMembership.mockResolvedValue({});
      mockPrisma.message.findUnique.mockResolvedValue({
        id: 'msg1',
        converseId: 'other-converse',
      });

      await expect(
        service.create('user1', { ...baseDto, replyToId: 'msg1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create message and broadcast to room', async () => {
      mockConverses.verifyMembership.mockResolvedValue({});
      mockPrisma.message.create.mockResolvedValue({
        id: 'msg1',
        content: 'Hello!',
        type: 'TEXT',
        authorId: 'user1',
        converseId: 'conv1',
        replyToId: null,
        metadata: null,
        createdAt: new Date('2026-02-14T12:00:00Z'),
        updatedAt: new Date('2026-02-14T12:00:00Z'),
        author: {
          id: 'user1',
          username: 'alice',
          displayName: 'Alice',
          avatarUrl: null,
        },
      });
      mockConverses.getMemberIds.mockResolvedValue(['user1', 'user2']);

      const result = await service.create('user1', baseDto);

      expect(result.id).toBe('msg1');
      expect(result.content).toBe('Hello!');

      // Should broadcast to converse room
      expect(mockBroadcast.toRoom).toHaveBeenCalledWith(
        'conv1',
        'message:new',
        expect.objectContaining({
          id: 'msg1',
          content: 'Hello!',
        }),
      );

      // Should send notification to non-sender members not in room
      expect(mockBroadcast.toRoomIfNotIn).toHaveBeenCalledWith(
        'u-user2',
        'conv1',
        'notification:new',
        expect.objectContaining({
          converseId: 'conv1',
          messageId: 'msg1',
        }),
      );

      // Should NOT notify sender
      expect(mockBroadcast.toRoomIfNotIn).not.toHaveBeenCalledWith(
        'u-user1',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('findByConverse', () => {
    it('should throw ForbiddenException when not a member', async () => {
      mockConverses.verifyMembership.mockRejectedValue(
        new ForbiddenException('Not a member'),
      );

      await expect(
        service.findByConverse('user1', 'conv1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return paginated messages with hasMore=false', async () => {
      mockConverses.verifyMembership.mockResolvedValue({});
      const messages = [
        {
          id: 'msg2',
          content: 'Second',
          createdAt: new Date('2026-02-14T12:01:00Z'),
          author: { id: 'user1' },
        },
        {
          id: 'msg1',
          content: 'First',
          createdAt: new Date('2026-02-14T12:00:00Z'),
          author: { id: 'user2' },
        },
      ];
      mockPrisma.message.findMany.mockResolvedValue(messages);

      const result = await service.findByConverse('user1', 'conv1');

      expect(result.messages).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should return hasMore=true when more messages exist', async () => {
      mockConverses.verifyMembership.mockResolvedValue({});
      // Return limit+1 messages (36 when limit=35)
      const messages = Array.from({ length: 36 }, (_, i) => ({
        id: `msg${i}`,
        content: `Message ${i}`,
        createdAt: new Date(Date.now() - i * 1000),
        author: { id: 'user1' },
      }));
      mockPrisma.message.findMany.mockResolvedValue(messages);

      const result = await service.findByConverse('user1', 'conv1');

      expect(result.messages).toHaveLength(35);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeDefined();
    });

    it('should pass cursor as createdAt filter', async () => {
      mockConverses.verifyMembership.mockResolvedValue({});
      mockPrisma.message.findMany.mockResolvedValue([]);

      const cursor = '2026-02-14T12:00:00.000Z';
      await service.findByConverse('user1', 'conv1', cursor);

      expect(mockPrisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            converseId: 'conv1',
            deletedAt: null,
            createdAt: { lt: new Date(cursor) },
          }),
        }),
      );
    });
  });

  describe('update', () => {
    it('should throw NotFoundException when message not found', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.update('user1', 'msg1', { content: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when message is deleted', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: 'msg1',
        authorId: 'user1',
        deletedAt: new Date(),
      });

      await expect(
        service.update('user1', 'msg1', { content: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not author', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: 'msg1',
        authorId: 'user2',
        deletedAt: null,
      });

      await expect(
        service.update('user1', 'msg1', { content: 'Updated' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update message and broadcast', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: 'msg1',
        authorId: 'user1',
        converseId: 'conv1',
        deletedAt: null,
      });
      mockPrisma.message.update.mockResolvedValue({
        id: 'msg1',
        content: 'Updated',
        converseId: 'conv1',
        updatedAt: new Date('2026-02-14T12:05:00Z'),
        author: {
          id: 'user1',
          username: 'alice',
          displayName: 'Alice',
          avatarUrl: null,
        },
      });

      const result = await service.update('user1', 'msg1', {
        content: 'Updated',
      });

      expect(result.content).toBe('Updated');
      expect(mockBroadcast.toRoom).toHaveBeenCalledWith(
        'conv1',
        'message:updated',
        expect.objectContaining({
          id: 'msg1',
          content: 'Updated',
        }),
      );
    });
  });

  describe('softDelete', () => {
    const recentMessage = {
      id: 'msg1',
      authorId: 'user1',
      converseId: 'conv1',
      createdAt: new Date(), // just created
      deletedAt: null,
      attachments: [],
    };

    it('should throw NotFoundException when message not found', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(null);

      await expect(service.softDelete('user1', 'msg1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when already deleted', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        ...recentMessage,
        deletedAt: new Date(),
      });

      await expect(service.softDelete('user1', 'msg1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when not author and not admin', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        ...recentMessage,
        authorId: 'user2', // different author
      });
      // Not an admin
      mockPrisma.converseMember.findUnique.mockResolvedValue({
        role: 'MEMBER',
      });

      await expect(service.softDelete('user1', 'msg1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should soft delete own message within 2 minutes and broadcast with recalledBy', async () => {
      const deletedAt = new Date('2026-02-14T12:10:00Z');
      mockPrisma.message.findUnique.mockResolvedValue(recentMessage);
      // Author is a regular member (not admin)
      mockPrisma.converseMember.findUnique.mockResolvedValue({
        role: 'MEMBER',
      });
      mockPrisma.message.update.mockResolvedValue({
        id: 'msg1',
        converseId: 'conv1',
        deletedAt,
      });

      const result = await service.softDelete('user1', 'msg1');

      expect(result.id).toBe('msg1');
      expect(result.deleted).toBe(true);
      expect(mockBroadcast.toRoom).toHaveBeenCalledWith(
        'conv1',
        'message:deleted',
        expect.objectContaining({
          id: 'msg1',
          converseId: 'conv1',
          deletedAt: deletedAt.toISOString(),
          recalledBy: 'user1',
        }),
      );
    });

    it('should throw ForbiddenException when recall time limit exceeded (>2 min)', async () => {
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
      mockPrisma.message.findUnique.mockResolvedValue({
        ...recentMessage,
        createdAt: threeMinutesAgo,
      });
      // Regular member, not admin
      mockPrisma.converseMember.findUnique.mockResolvedValue({
        role: 'MEMBER',
      });

      await expect(service.softDelete('user1', 'msg1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow admin to recall any message without time limit', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const deletedAt = new Date();
      mockPrisma.message.findUnique.mockResolvedValue({
        ...recentMessage,
        authorId: 'user2', // someone else's message
        createdAt: oneHourAgo, // old message
      });
      // Current user is ADMIN
      mockPrisma.converseMember.findUnique.mockResolvedValue({
        role: 'ADMIN',
      });
      mockPrisma.message.update.mockResolvedValue({
        id: 'msg1',
        converseId: 'conv1',
        deletedAt,
      });

      const result = await service.softDelete('user1', 'msg1');

      expect(result.id).toBe('msg1');
      expect(result.deleted).toBe(true);
    });

    it('should allow OWNER to recall any message', async () => {
      const deletedAt = new Date();
      mockPrisma.message.findUnique.mockResolvedValue({
        ...recentMessage,
        authorId: 'user2',
      });
      // Current user is OWNER
      mockPrisma.converseMember.findUnique.mockResolvedValue({
        role: 'OWNER',
      });
      mockPrisma.message.update.mockResolvedValue({
        id: 'msg1',
        converseId: 'conv1',
        deletedAt,
      });

      const result = await service.softDelete('user1', 'msg1');

      expect(result.deleted).toBe(true);
    });

    it('should allow admin-author to recall own old message (no time limit)', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const deletedAt = new Date();
      mockPrisma.message.findUnique.mockResolvedValue({
        ...recentMessage,
        createdAt: oneHourAgo, // old message
      });
      // Author is also ADMIN
      mockPrisma.converseMember.findUnique.mockResolvedValue({
        role: 'ADMIN',
      });
      mockPrisma.message.update.mockResolvedValue({
        id: 'msg1',
        converseId: 'conv1',
        deletedAt,
      });

      const result = await service.softDelete('user1', 'msg1');

      expect(result.deleted).toBe(true);
    });

    it('should async cleanup S3 attachments on recall', async () => {
      const deletedAt = new Date();
      const messageWithAttachments = {
        ...recentMessage,
        attachments: [
          {
            id: 'att1',
            url: 'http://localhost:9008/attachments/image/abc.jpg',
            thumbnailUrl: 'http://localhost:9008/attachments/image/abc_thumb.jpg',
          },
          {
            id: 'att2',
            url: 'http://localhost:9008/attachments/file/doc.pdf',
            thumbnailUrl: null,
          },
        ],
      };
      mockPrisma.message.findUnique.mockResolvedValue(messageWithAttachments);
      mockPrisma.converseMember.findUnique.mockResolvedValue({
        role: 'MEMBER',
      });
      mockPrisma.message.update.mockResolvedValue({
        id: 'msg1',
        converseId: 'conv1',
        deletedAt,
      });

      await service.softDelete('user1', 'msg1');

      // Give async cleanup a tick to run
      await new Promise((r) => setTimeout(r, 50));

      // Should have deleted both attachment files + 1 thumbnail
      expect(mockUpload.deleteFile).toHaveBeenCalledWith('image/abc.jpg');
      expect(mockUpload.deleteFile).toHaveBeenCalledWith('image/abc_thumb.jpg');
      expect(mockUpload.deleteFile).toHaveBeenCalledWith('file/doc.pdf');
    });

    it('should not fail recall if attachment cleanup fails', async () => {
      const deletedAt = new Date();
      mockPrisma.message.findUnique.mockResolvedValue({
        ...recentMessage,
        attachments: [
          {
            id: 'att1',
            url: 'http://localhost:9008/attachments/image/abc.jpg',
            thumbnailUrl: null,
          },
        ],
      });
      mockPrisma.converseMember.findUnique.mockResolvedValue({
        role: 'MEMBER',
      });
      mockPrisma.message.update.mockResolvedValue({
        id: 'msg1',
        converseId: 'conv1',
        deletedAt,
      });
      // Make cleanup fail
      mockUpload.deleteFile.mockRejectedValue(new Error('S3 error'));

      // Should not throw
      const result = await service.softDelete('user1', 'msg1');
      expect(result.deleted).toBe(true);
    });
  });

  describe('search', () => {
    it('should throw BadRequestException for empty query', async () => {
      await expect(service.search('user1', '')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.search('user1', '  ')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return tsvector results when matches found', async () => {
      const searchResults = [
        {
          id: 'msg1',
          content: 'Hello world',
          type: 'TEXT',
          authorId: 'user2',
          converseId: 'conv1',
          createdAt: new Date(),
          updatedAt: new Date(),
          highlight: '<mark>Hello</mark> world',
        },
      ];
      // First call: tsvector search results
      mockPrisma.$queryRaw.mockResolvedValueOnce(searchResults);
      // Second call: count
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ count: BigInt(1) }]);

      const result = await service.search('user1', 'Hello');

      expect(result.results).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.query).toBe('Hello');
    });

    it('should fallback to ILIKE when tsvector returns no results', async () => {
      const likeResults = [
        {
          id: 'msg1',
          content: '你好世界',
          type: 'TEXT',
          authorId: 'user2',
          converseId: 'conv1',
          createdAt: new Date(),
          updatedAt: new Date(),
          highlight: '你好世界',
        },
      ];
      // First call: tsvector - no results
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);
      // Second call: tsvector count = 0
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ count: BigInt(0) }]);
      // Third call: ILIKE results
      mockPrisma.$queryRaw.mockResolvedValueOnce(likeResults);
      // Fourth call: ILIKE count
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ count: BigInt(1) }]);

      const result = await service.search('user1', '你好');

      expect(result.results).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should return empty results when nothing matches', async () => {
      // tsvector: no results
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ count: BigInt(0) }]);
      // ILIKE: no results
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ count: BigInt(0) }]);

      const result = await service.search('user1', 'nonexistent');

      expect(result.results).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should pass converseId filter when provided', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ count: BigInt(0) }]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ count: BigInt(0) }]);

      await service.search('user1', 'test', 'conv1');

      // Verify $queryRaw was called (we can't easily check Prisma.sql internals)
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });
  });

  describe('Whisper auto-trigger', () => {
    const directDto = { converseId: 'conv1', content: 'Hello there!' };

    beforeEach(() => {
      mockConverses.verifyMembership.mockResolvedValue({});
      mockPrisma.message.create.mockResolvedValue({
        id: 'msg1',
        content: 'Hello there!',
        type: 'TEXT',
        authorId: 'user1',
        converseId: 'conv1',
        replyToId: null,
        metadata: null,
        attachments: [],
        author: { id: 'user1', displayName: 'Alice', avatarUrl: null },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.$transaction.mockResolvedValue([null, null]);
      mockPrisma.converse.findUnique.mockResolvedValue({ type: 'DM' });
      mockConverses.getMemberIds.mockResolvedValue(['user1', 'user2']);
    });

    it('triggers Whisper for DIRECT TEXT message (receiver side)', async () => {
      await service.create('user1', directDto);

      expect(mockWhisperService.shouldTrigger).toHaveBeenCalledWith('Hello there!');
      expect(mockWhisperService.handleWhisperRequest).toHaveBeenCalledWith(
        'user2', // receiver, not sender
        'conv1',
      );
    });

    it('does NOT trigger Whisper for GROUP converse', async () => {
      mockPrisma.converse.findUnique.mockResolvedValue({ type: 'GROUP' });

      await service.create('user1', directDto);

      expect(mockWhisperService.handleWhisperRequest).not.toHaveBeenCalled();
    });

    it('does NOT trigger Whisper when shouldTrigger returns false', async () => {
      mockWhisperService.shouldTrigger.mockReturnValueOnce(false);

      await service.create('user1', directDto);

      expect(mockWhisperService.handleWhisperRequest).not.toHaveBeenCalled();
    });

    it('does NOT trigger Whisper for non-TEXT message type', async () => {
      mockPrisma.message.create.mockResolvedValueOnce({
        id: 'msg1',
        content: '',
        type: 'VOICE',
        authorId: 'user1',
        converseId: 'conv1',
        replyToId: null,
        metadata: null,
        attachments: [],
        author: { id: 'user1', displayName: 'Alice', avatarUrl: null },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.create('user1', { converseId: 'conv1', content: '' });

      expect(mockWhisperService.handleWhisperRequest).not.toHaveBeenCalled();
    });
  });

  describe('detectBotRecipient', () => {
    const mockEventEmitter = { emit: jest.fn() };

    beforeEach(() => {
      mockEventEmitter.emit.mockClear();
    });

    it('should emit agent.dispatch with supervisor-bot sentinel when recipient is Supervisor', async () => {
      // Rebuild service with EventEmitter2 injected
      const { MessagesService: Svc } = await import('./messages.service');
      const { EventEmitter2 } = await import('@nestjs/event-emitter');
      const module = await Test.createTestingModule({
        providers: [
          Svc,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: BroadcastService, useValue: mockBroadcast },
          { provide: ConversesService, useValue: mockConverses },
            { provide: MentionService, useValue: mockMention },
          { provide: UploadService, useValue: mockUpload },
          { provide: MetricsService, useValue: mockMetricsService },
          { provide: I18nService, useValue: mockI18nService },
          { provide: EventEmitter2, useValue: mockEventEmitter },
          { provide: WhisperService, useValue: mockWhisperService },
        ],
      }).compile();
      const svc = module.get<MessagesService>(Svc);

      // Stub: one other member who is a Supervisor bot
      mockPrisma.converseMember.findMany.mockResolvedValueOnce([
        { userId: 'bot-user-1' },
      ]);
      mockPrisma.bot.findUnique.mockResolvedValueOnce({
        id: 'bot-db-uuid-1',
        userId: 'bot-user-1',
        name: 'Supervisor',
      });

      // Call the private method via type cast
      await (svc as any).detectBotRecipient('user-1', 'conv-1', {
        id: 'msg-1',
        content: 'Hello bot',
        type: 'TEXT',
      });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith('agent.dispatch', {
        botId: 'supervisor-bot',
        events: [
          expect.objectContaining({
            type: 'USER_MESSAGE',
            payload: expect.objectContaining({
              userId: 'user-1',
              content: 'Hello bot',
              converseId: 'conv-1',
            }),
          }),
        ],
      });
    });

    it('should emit agent.dispatch with bot db id for non-supervisor bots', async () => {
      const { MessagesService: Svc } = await import('./messages.service');
      const { EventEmitter2 } = await import('@nestjs/event-emitter');
      const module = await Test.createTestingModule({
        providers: [
          Svc,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: BroadcastService, useValue: mockBroadcast },
          { provide: ConversesService, useValue: mockConverses },
            { provide: MentionService, useValue: mockMention },
          { provide: UploadService, useValue: mockUpload },
          { provide: MetricsService, useValue: mockMetricsService },
          { provide: I18nService, useValue: mockI18nService },
          { provide: EventEmitter2, useValue: mockEventEmitter },
          { provide: WhisperService, useValue: mockWhisperService },
        ],
      }).compile();
      const svc = module.get<MessagesService>(Svc);

      mockPrisma.converseMember.findMany.mockResolvedValueOnce([
        { userId: 'coding-user-1' },
      ]);
      mockPrisma.bot.findUnique.mockResolvedValueOnce({
        id: 'coding-bot-uuid',
        userId: 'coding-user-1',
        name: 'Coding',
      });

      await (svc as any).detectBotRecipient('user-1', 'conv-2', {
        id: 'msg-2',
        content: 'Fix this bug',
        type: 'TEXT',
      });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith('agent.dispatch', {
        botId: 'coding-bot-uuid',
        events: [expect.objectContaining({ type: 'USER_MESSAGE' })],
      });
    });
  });
});
