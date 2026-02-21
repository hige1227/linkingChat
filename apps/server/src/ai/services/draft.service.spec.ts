import { Test, TestingModule } from '@nestjs/testing';
import { DraftService } from './draft.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BroadcastService } from '../../gateway/broadcast.service';
import { LlmRouterService } from './llm-router.service';

// ── 测试数据 ────────────────────────────

const mockUserId = 'user-001';
const mockConverseId = 'converse-001';
const mockBotId = 'bot-001';

const mockDraftRecord = {
  id: 'draft-001',
  status: 'PENDING',
  userId: mockUserId,
  converseId: mockConverseId,
  botId: mockBotId,
  draftType: 'message',
  draftContent: { content: '好的，我同意这个方案' },
  editedContent: null,
  rejectReason: null,
  expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockExpiredDraft = {
  ...mockDraftRecord,
  id: 'draft-expired',
  expiresAt: new Date(Date.now() - 1000), // Already expired
};

// ── Mock Services ────────────────────────────

const mockPrisma: any = {
  aiDraft: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const mockBroadcast: any = {
  toRoom: jest.fn(),
};

const mockLlmRouter: any = {
  complete: jest.fn(),
};

const mockRedis: any = {
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
};

// ── 测试套件 ────────────────────────────

describe('DraftService', () => {
  let service: DraftService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DraftService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BroadcastService, useValue: mockBroadcast },
        { provide: LlmRouterService, useValue: mockLlmRouter },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<DraftService>(DraftService);
    jest.clearAllMocks();
  });

  // ── createDraft() ────────────────────────────

  describe('createDraft', () => {
    it('should create draft, save to DB, set Redis TTL, and push via WS', async () => {
      mockLlmRouter.complete.mockResolvedValue({
        content: JSON.stringify({ content: '好的，我同意这个方案' }),
      });
      mockPrisma.aiDraft.create.mockResolvedValue(mockDraftRecord);

      const draftId = await service.createDraft({
        userId: mockUserId,
        converseId: mockConverseId,
        botId: mockBotId,
        botName: 'Coding Bot',
        draftType: 'message',
        userIntent: '帮我同意这个方案',
      });

      expect(draftId).toBe('draft-001');

      // Should save to DB
      expect(mockPrisma.aiDraft.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: mockUserId,
            converseId: mockConverseId,
            botId: mockBotId,
            draftType: 'message',
          }),
        }),
      );

      // Should set Redis TTL
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'draft:draft-001',
        300, // 5 minutes
        'draft-001',
      );

      // Should push via WS
      expect(mockBroadcast.toRoom).toHaveBeenCalledWith(
        `u-${mockUserId}`,
        'ai:draft:created',
        expect.objectContaining({
          draftId: 'draft-001',
          converseId: mockConverseId,
          botId: mockBotId,
          botName: 'Coding Bot',
          draftType: 'message',
        }),
      );
    });

    it('should generate command draft with action field', async () => {
      mockLlmRouter.complete.mockResolvedValue({
        content: JSON.stringify({
          description: '拉取最新代码',
          command: 'git pull origin main',
          args: {},
        }),
      });
      mockPrisma.aiDraft.create.mockResolvedValue({
        ...mockDraftRecord,
        draftType: 'command',
        draftContent: {
          content: '拉取最新代码',
          action: 'git pull origin main',
          args: {},
        },
      });

      await service.createDraft({
        userId: mockUserId,
        converseId: mockConverseId,
        botId: mockBotId,
        botName: 'Coding Bot',
        draftType: 'command',
        userIntent: '帮我拉取最新代码',
      });

      expect(mockPrisma.aiDraft.create).toHaveBeenCalled();
    });
  });

  // ── approveDraft() ────────────────────────────

  describe('approveDraft', () => {
    it('should approve PENDING draft and return content', async () => {
      mockPrisma.aiDraft.findFirst.mockResolvedValue(mockDraftRecord);
      mockPrisma.aiDraft.update.mockResolvedValue({
        ...mockDraftRecord,
        status: 'APPROVED',
      });

      const content = await service.approveDraft(mockUserId, 'draft-001');

      expect(content).toEqual({ content: '好的，我同意这个方案' });
      expect(mockPrisma.aiDraft.update).toHaveBeenCalledWith({
        where: { id: 'draft-001' },
        data: { status: 'APPROVED' },
      });
      expect(mockRedis.del).toHaveBeenCalledWith('draft:draft-001');
    });

    it('should throw when draft not found', async () => {
      mockPrisma.aiDraft.findFirst.mockResolvedValue(null);

      await expect(
        service.approveDraft(mockUserId, 'nonexistent'),
      ).rejects.toThrow('Draft not found or no longer pending');
    });

    it('should throw when draft has expired', async () => {
      mockPrisma.aiDraft.findFirst.mockResolvedValue(mockExpiredDraft);
      mockPrisma.aiDraft.findUnique.mockResolvedValue(mockExpiredDraft);
      mockPrisma.aiDraft.update.mockResolvedValue({
        ...mockExpiredDraft,
        status: 'EXPIRED',
      });

      await expect(
        service.approveDraft(mockUserId, 'draft-expired'),
      ).rejects.toThrow('Draft has expired');
    });
  });

  // ── rejectDraft() ────────────────────────────

  describe('rejectDraft', () => {
    it('should reject draft with reason', async () => {
      mockPrisma.aiDraft.findFirst.mockResolvedValue(mockDraftRecord);
      mockPrisma.aiDraft.update.mockResolvedValue({
        ...mockDraftRecord,
        status: 'REJECTED',
        rejectReason: '不需要了',
      });

      await service.rejectDraft(mockUserId, 'draft-001', '不需要了');

      expect(mockPrisma.aiDraft.update).toHaveBeenCalledWith({
        where: { id: 'draft-001' },
        data: {
          status: 'REJECTED',
          rejectReason: '不需要了',
        },
      });
      expect(mockRedis.del).toHaveBeenCalledWith('draft:draft-001');
    });

    it('should reject draft without reason', async () => {
      mockPrisma.aiDraft.findFirst.mockResolvedValue(mockDraftRecord);
      mockPrisma.aiDraft.update.mockResolvedValue({
        ...mockDraftRecord,
        status: 'REJECTED',
      });

      await service.rejectDraft(mockUserId, 'draft-001');

      expect(mockPrisma.aiDraft.update).toHaveBeenCalledWith({
        where: { id: 'draft-001' },
        data: {
          status: 'REJECTED',
          rejectReason: null,
        },
      });
    });
  });

  // ── editAndApproveDraft() ────────────────────────────

  describe('editAndApproveDraft', () => {
    it('should save edited content and approve', async () => {
      mockPrisma.aiDraft.findFirst.mockResolvedValue(mockDraftRecord);
      const editedContent = { content: '我基本同意，但需要调整时间' };
      mockPrisma.aiDraft.update.mockResolvedValue({
        ...mockDraftRecord,
        status: 'APPROVED',
        editedContent,
      });

      const result = await service.editAndApproveDraft(
        mockUserId,
        'draft-001',
        editedContent,
      );

      expect(result).toEqual(editedContent);
      expect(mockPrisma.aiDraft.update).toHaveBeenCalledWith({
        where: { id: 'draft-001' },
        data: {
          status: 'APPROVED',
          editedContent: editedContent as any,
        },
      });
    });
  });

  // ── expireDraft() ────────────────────────────

  describe('expireDraft', () => {
    it('should mark draft as EXPIRED and push WS notification', async () => {
      mockPrisma.aiDraft.findUnique.mockResolvedValue(mockDraftRecord);
      mockPrisma.aiDraft.update.mockResolvedValue({
        ...mockDraftRecord,
        status: 'EXPIRED',
      });

      await service.expireDraft('draft-001');

      expect(mockPrisma.aiDraft.update).toHaveBeenCalledWith({
        where: { id: 'draft-001' },
        data: { status: 'EXPIRED' },
      });
      expect(mockBroadcast.toRoom).toHaveBeenCalledWith(
        `u-${mockUserId}`,
        'ai:draft:expired',
        expect.objectContaining({
          draftId: 'draft-001',
          converseId: mockConverseId,
        }),
      );
    });

    it('should skip if draft is not PENDING', async () => {
      mockPrisma.aiDraft.findUnique.mockResolvedValue({
        ...mockDraftRecord,
        status: 'APPROVED',
      });

      await service.expireDraft('draft-001');

      expect(mockPrisma.aiDraft.update).not.toHaveBeenCalled();
      expect(mockBroadcast.toRoom).not.toHaveBeenCalled();
    });

    it('should skip if draft not found', async () => {
      mockPrisma.aiDraft.findUnique.mockResolvedValue(null);

      await service.expireDraft('nonexistent');

      expect(mockPrisma.aiDraft.update).not.toHaveBeenCalled();
    });
  });

  // ── parseDraftContent() ────────────────────────────

  describe('parseDraftContent', () => {
    it('should parse message draft JSON', () => {
      const result = service.parseDraftContent(
        '{"content": "好的"}',
        'message',
      );
      expect(result).toEqual({ content: '好的' });
    });

    it('should parse command draft JSON', () => {
      const result = service.parseDraftContent(
        '{"description":"查看日志","command":"tail -f /var/log/app.log","args":{}}',
        'command',
      );
      expect(result).toEqual({
        content: '查看日志',
        action: 'tail -f /var/log/app.log',
        args: {},
      });
    });

    it('should fall back to raw text when JSON fails', () => {
      const result = service.parseDraftContent('plain text draft', 'message');
      expect(result).toEqual({ content: 'plain text draft' });
    });
  });
});
