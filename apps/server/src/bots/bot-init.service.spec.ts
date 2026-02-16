import { Test, TestingModule } from '@nestjs/testing';
import { BotInitService } from './bot-init.service';
import { BotsService } from './bots.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_BOT_TEMPLATES } from './bot-templates';

// ── 测试数据 ────────────────────────────

const mockUserId = 'user-001';

const mockBotUser = {
  id: 'bot-user-001',
  email: 'bot-abc@bot.linkingchat.internal',
  username: 'bot_supervisor_123',
  displayName: 'Supervisor',
};

const mockBot = {
  id: 'bot-001',
  name: 'Supervisor',
  userId: 'bot-user-001',
  ownerId: mockUserId,
};

// ── Mock Services ────────────────────────────

const createMockTx = () => ({
  converse: {
    create: jest.fn().mockResolvedValue({ id: 'converse-001' }),
  },
  converseMember: {
    createMany: jest.fn().mockResolvedValue({ count: 2 }),
  },
  message: {
    create: jest.fn().mockResolvedValue({ id: 'msg-001' }),
  },
});

const mockBotsService = {
  createWithTx: jest.fn().mockResolvedValue({
    bot: mockBot,
    botUser: mockBotUser,
  }),
};

const mockPrisma: any = {
  $transaction: jest.fn(),
};

// ── 测试套件 ────────────────────────────

describe('BotInitService', () => {
  let service: BotInitService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotInitService,
        { provide: BotsService, useValue: mockBotsService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BotInitService>(BotInitService);
    jest.clearAllMocks();
  });

  // ── createDefaultBots() ────────────────────────────

  describe('createDefaultBots', () => {
    it('should create bots for all default templates', async () => {
      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = createMockTx();
        return cb(tx);
      });

      await service.createDefaultBots(mockUserId);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(
        DEFAULT_BOT_TEMPLATES.length,
      );
    });

    it('should call createWithTx for each template with correct params', async () => {
      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = createMockTx();
        return cb(tx);
      });

      await service.createDefaultBots(mockUserId);

      expect(mockBotsService.createWithTx).toHaveBeenCalledTimes(
        DEFAULT_BOT_TEMPLATES.length,
      );

      // Verify first template (Supervisor)
      const firstCall = mockBotsService.createWithTx.mock.calls[0];
      expect(firstCall[1]).toBe(mockUserId);
      expect(firstCall[2]).toMatchObject({
        name: 'Supervisor',
        type: 'REMOTE_EXEC',
        isPinned: true,
        isDeletable: false,
      });
    });

    it('should create DM converse for each bot', async () => {
      const txInstances: any[] = [];
      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = createMockTx();
        txInstances.push(tx);
        return cb(tx);
      });

      await service.createDefaultBots(mockUserId);

      for (const tx of txInstances) {
        expect(tx.converse.create).toHaveBeenCalledWith({
          data: { type: 'DM' },
        });
      }
    });

    it('should create ConverseMember for both user and bot', async () => {
      const txInstances: any[] = [];
      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = createMockTx();
        txInstances.push(tx);
        return cb(tx);
      });

      await service.createDefaultBots(mockUserId);

      for (const tx of txInstances) {
        expect(tx.converseMember.createMany).toHaveBeenCalledWith({
          data: [
            { converseId: 'converse-001', userId: mockUserId },
            { converseId: 'converse-001', userId: mockBot.userId },
          ],
        });
      }
    });

    it('should insert welcome message from bot user', async () => {
      const txInstances: any[] = [];
      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = createMockTx();
        txInstances.push(tx);
        return cb(tx);
      });

      await service.createDefaultBots(mockUserId);

      for (let i = 0; i < txInstances.length; i++) {
        const tx = txInstances[i];
        const template = DEFAULT_BOT_TEMPLATES[i];
        expect(tx.message.create).toHaveBeenCalledWith({
          data: {
            content: template.welcomeMessage,
            type: 'TEXT',
            converseId: 'converse-001',
            authorId: mockBot.userId,
          },
        });
      }
    });

    it('should propagate error if a transaction fails', async () => {
      mockPrisma.$transaction.mockRejectedValueOnce(
        new Error('DB connection lost'),
      );

      await expect(service.createDefaultBots(mockUserId)).rejects.toThrow(
        'DB connection lost',
      );
    });
  });
});
