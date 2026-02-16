import { Test, TestingModule } from '@nestjs/testing';
import { BotsService } from './bots.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

// ── 测试数据 ────────────────────────────

const mockOwnerId = 'owner-001';

const validAgentConfig = {
  systemPrompt: 'You are a helpful assistant.',
  llmProvider: 'deepseek',
  tools: ['system.run'],
};

const mockCreateDto = {
  name: 'Test Bot',
  description: 'A test bot',
  type: 'REMOTE_EXEC' as const,
  agentConfig: validAgentConfig,
};

const mockBotUser = {
  id: 'bot-user-001',
  email: 'bot-abc123@bot.linkingchat.internal',
  username: 'bot_test_bot_123',
  displayName: 'Test Bot',
  avatarUrl: null,
};

const mockBot = {
  id: 'bot-001',
  name: 'Test Bot',
  description: 'A test bot',
  avatarUrl: null,
  type: 'REMOTE_EXEC',
  agentConfig: validAgentConfig,
  ownerId: mockOwnerId,
  userId: 'bot-user-001',
  isPinned: true,
  isDeletable: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSystemBot = {
  ...mockBot,
  id: 'bot-system-001',
  name: 'Supervisor',
  isDeletable: false,
};

// ── Mock PrismaService ────────────────────────────

const mockPrisma: any = {
  bot: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  user: {
    create: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ── 测试套件 ────────────────────────────

describe('BotsService', () => {
  let service: BotsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BotsService>(BotsService);
    jest.clearAllMocks();
  });

  // ── create() ────────────────────────────

  describe('create', () => {
    it('should create Bot + Bot User in a transaction', async () => {
      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          user: { create: jest.fn().mockResolvedValue(mockBotUser) },
          bot: { create: jest.fn().mockResolvedValue(mockBot) },
        };
        return cb(tx);
      });

      const result = await service.create(mockOwnerId, mockCreateDto);

      expect(result).toEqual(mockBot);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should create Bot User with @bot.linkingchat.internal email', async () => {
      let capturedUserData: any;

      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          user: {
            create: jest.fn().mockImplementation(({ data }) => {
              capturedUserData = data;
              return Promise.resolve({ ...mockBotUser, ...data });
            }),
          },
          bot: { create: jest.fn().mockResolvedValue(mockBot) },
        };
        return cb(tx);
      });

      await service.create(mockOwnerId, mockCreateDto);

      expect(capturedUserData.email).toMatch(/@bot\.linkingchat\.internal$/);
    });

    it('should create Bot User with bot_ username prefix', async () => {
      let capturedUserData: any;

      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          user: {
            create: jest.fn().mockImplementation(({ data }) => {
              capturedUserData = data;
              return Promise.resolve({ ...mockBotUser, ...data });
            }),
          },
          bot: { create: jest.fn().mockResolvedValue(mockBot) },
        };
        return cb(tx);
      });

      await service.create(mockOwnerId, mockCreateDto);

      expect(capturedUserData.username).toMatch(/^bot_/);
    });

    it('should hash Bot User password with argon2', async () => {
      let capturedUserData: any;

      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          user: {
            create: jest.fn().mockImplementation(({ data }) => {
              capturedUserData = data;
              return Promise.resolve({ ...mockBotUser, ...data });
            }),
          },
          bot: { create: jest.fn().mockResolvedValue(mockBot) },
        };
        return cb(tx);
      });

      await service.create(mockOwnerId, mockCreateDto);

      expect(capturedUserData.password).toMatch(/^\$argon2/);
    });

    it('should throw BadRequestException when agentConfig misses systemPrompt', async () => {
      const invalidDto = {
        ...mockCreateDto,
        agentConfig: { llmProvider: 'deepseek' },
      };

      await expect(
        service.create(mockOwnerId, invalidDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when temperature is out of range', async () => {
      const invalidDto = {
        ...mockCreateDto,
        agentConfig: {
          ...validAgentConfig,
          temperature: 5,
        },
      };

      await expect(
        service.create(mockOwnerId, invalidDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when llmProvider is invalid', async () => {
      const invalidDto = {
        ...mockCreateDto,
        agentConfig: {
          ...validAgentConfig,
          llmProvider: 'invalid-provider',
        },
      };

      await expect(
        service.create(mockOwnerId, invalidDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── findByOwner() ────────────────────────────

  describe('findByOwner', () => {
    it('should return bots ordered by isPinned desc, createdAt asc', async () => {
      const bots = [mockBot, mockSystemBot];
      mockPrisma.bot.findMany.mockResolvedValue(bots);

      const result = await service.findByOwner(mockOwnerId);

      expect(result).toEqual(bots);
      expect(mockPrisma.bot.findMany).toHaveBeenCalledWith({
        where: { ownerId: mockOwnerId },
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'asc' }],
      });
    });

    it('should return empty array when user has no bots', async () => {
      mockPrisma.bot.findMany.mockResolvedValue([]);

      const result = await service.findByOwner('non-existent-owner');

      expect(result).toEqual([]);
    });
  });

  // ── findOne() ────────────────────────────

  describe('findOne', () => {
    it('should return bot when found', async () => {
      mockPrisma.bot.findFirst.mockResolvedValue(mockBot);

      const result = await service.findOne('bot-001', mockOwnerId);

      expect(result).toEqual(mockBot);
    });

    it('should throw NotFoundException when bot does not exist', async () => {
      mockPrisma.bot.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('non-existent', mockOwnerId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when not owner', async () => {
      mockPrisma.bot.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('bot-001', 'other-owner'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── update() ────────────────────────────

  describe('update', () => {
    it('should update bot name and sync Bot User displayName', async () => {
      mockPrisma.bot.findFirst.mockResolvedValue(mockBot);
      const updatedBot = { ...mockBot, name: 'Updated Bot' };
      let userUpdateCalled = false;

      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          bot: { update: jest.fn().mockResolvedValue(updatedBot) },
          user: {
            update: jest.fn().mockImplementation(() => {
              userUpdateCalled = true;
              return Promise.resolve({});
            }),
          },
        };
        return cb(tx);
      });

      const result = await service.update('bot-001', mockOwnerId, {
        name: 'Updated Bot',
      });

      expect(result.name).toBe('Updated Bot');
      expect(userUpdateCalled).toBe(true);
    });

    it('should throw NotFoundException when bot does not exist', async () => {
      mockPrisma.bot.findFirst.mockResolvedValue(null);

      await expect(
        service.update('non-existent', mockOwnerId, { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when agentConfig is invalid on update', async () => {
      mockPrisma.bot.findFirst.mockResolvedValue(mockBot);

      await expect(
        service.update('bot-001', mockOwnerId, {
          agentConfig: { llmProvider: 'invalid' } as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── delete() ────────────────────────────

  describe('delete', () => {
    it('should delete bot and soft-delete Bot User', async () => {
      mockPrisma.bot.findFirst.mockResolvedValue(mockBot);
      mockPrisma.bot.delete.mockResolvedValue(mockBot);
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.$transaction.mockResolvedValue(undefined);

      await service.delete('bot-001', mockOwnerId);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should throw ForbiddenException when isDeletable is false', async () => {
      mockPrisma.bot.findFirst.mockResolvedValue(mockSystemBot);

      await expect(
        service.delete('bot-system-001', mockOwnerId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when bot does not exist', async () => {
      mockPrisma.bot.findFirst.mockResolvedValue(null);

      await expect(
        service.delete('non-existent', mockOwnerId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when not owner', async () => {
      mockPrisma.bot.findFirst.mockResolvedValue(null);

      await expect(
        service.delete('bot-001', 'other-owner'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
