import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MentionService } from '../mentions.service';
import { PrismaService } from '../../prisma/prisma.service';
describe('MentionService', () => {
  let service: MentionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MentionService,
        { provide: PrismaService, useValue: {} },
                { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<MentionService>(MentionService);
  });

  describe('parse', () => {
    it('should parse single @mention', () => {
      const result = service.parse('Hello @CodingBot, how are you?');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'CodingBot',
        fullMatch: '@CodingBot',
        startIndex: 6,
      });
    });

    it('should parse multiple @mentions', () => {
      const result = service.parse('@Bot1 and @Bot2 please help');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Bot1');
      expect(result[1].name).toBe('Bot2');
    });

    it('should parse @ai as special mention', () => {
      const result = service.parse('Hey @ai what do you think?');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('ai');
    });

    it('should handle Chinese characters in bot names', () => {
      const result = service.parse('@小助手 帮我查一下');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('小助手');
    });

    it('should deduplicate repeated mentions', () => {
      const result = service.parse('@Bot1 @Bot1 @Bot1');
      expect(result).toHaveLength(1);
    });

    it('should return empty array for no mentions', () => {
      expect(service.parse('Hello world')).toEqual([]);
      expect(service.parse('')).toEqual([]);
      expect(service.parse(null as any)).toEqual([]);
    });

    it('should not match email addresses', () => {
      const result = service.parse('Contact me at test@example.com');
      expect(result).toEqual([]);
    });

    it('should parse correctly on consecutive calls (no stale /g state)', () => {
      // Fix 8: stateful regex /g flag — calling parse() twice must not skip matches
      const result1 = service.parse('@Bot1 hello');
      const result2 = service.parse('@Bot1 hello');
      expect(result1).toHaveLength(1);
      expect(result2).toHaveLength(1);
      expect(result1[0].name).toBe('Bot1');
      expect(result2[0].name).toBe('Bot1');
    });
  });

  describe('validate', () => {
    it('should validate @ai as special type', async () => {
      const parsed = service.parse('Hello @ai');
      const result = await service.validate(parsed, 'converse-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: 'ai',
        name: 'ai',
        fullMatch: '@ai',
      });
    });

    it('should return empty for non-existent bot', async () => {
      const mockPrisma = {
        bot: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MentionService,
          { provide: PrismaService, useValue: mockPrisma },
                    { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        ],
      }).compile();

      const serviceWithMock = module.get<MentionService>(MentionService);
      const parsed = serviceWithMock.parse('Hello @NonExistentBot');
      const result = await serviceWithMock.validate(parsed, 'converse-1');

      expect(result).toEqual([]);
    });

    it('should validate existing bot and verify group membership', async () => {
      const mockPrisma = {
        bot: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'bot-1', name: 'CodingBot', userId: 'user-bot-1' },
          ]),
        },
        converseMember: {
          findMany: jest.fn().mockResolvedValue([
            { userId: 'user-bot-1' },
          ]),
        },
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MentionService,
          { provide: PrismaService, useValue: mockPrisma },
                    { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        ],
      }).compile();

      const serviceWithMock = module.get<MentionService>(MentionService);
      const parsed = serviceWithMock.parse('@CodingBot help');
      const result = await serviceWithMock.validate(parsed, 'converse-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: 'bot',
        name: 'CodingBot',
        fullMatch: '@CodingBot',
        botId: 'bot-1',
        userId: 'user-bot-1',
      });
    });

    it('should filter out bots that are not group members', async () => {
      const mockPrisma = {
        bot: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'bot-1', name: 'CodingBot', userId: 'user-bot-1' },
          ]),
        },
        converseMember: {
          findMany: jest.fn().mockResolvedValue([]), // bot is not a member
        },
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MentionService,
          { provide: PrismaService, useValue: mockPrisma },
                    { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        ],
      }).compile();

      const serviceWithMock = module.get<MentionService>(MentionService);
      const parsed = serviceWithMock.parse('@CodingBot help');
      const result = await serviceWithMock.validate(parsed, 'converse-1');

      expect(result).toEqual([]);
    });
  });

  describe('route', () => {
    it('should route @ai to SupervisorAgent via agent.dispatch', async () => {
      const mockEmitter = { emit: jest.fn() };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MentionService,
          { provide: PrismaService, useValue: { bot: { findMany: jest.fn() } } },
          { provide: EventEmitter2, useValue: mockEmitter },
        ],
      }).compile();

      const serviceWithMock = module.get<MentionService>(MentionService);

      const mentions = [{
        type: 'ai' as const,
        name: 'ai',
        fullMatch: '@ai',
      }];

      await serviceWithMock.route(mentions, {
        id: 'msg-1',
        content: '@ai hello',
        converseId: 'conv-1',
      } as any, 'user-1', 'conv-1');

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'agent.dispatch',
        expect.objectContaining({
          botId: 'supervisor-bot',
          events: [
            expect.objectContaining({
              type: 'USER_MESSAGE',
              payload: expect.objectContaining({
                userId: 'user-1',
                content: '@ai hello',
                converseId: 'conv-1',
              }),
            }),
          ],
        }),
      );
    });

    it('should route @bot via EventEmitter', async () => {
      const mockEmitter = { emit: jest.fn() };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MentionService,
          { provide: PrismaService, useValue: { bot: { findMany: jest.fn() } } },
          { provide: EventEmitter2, useValue: mockEmitter },
        ],
      }).compile();

      const serviceWithMock = module.get<MentionService>(MentionService);

      const mentions = [{
        type: 'bot' as const,
        name: 'CodingBot',
        fullMatch: '@CodingBot',
        botId: 'bot-1',
        userId: 'user-bot-1',
      }];

      await serviceWithMock.route(mentions, {
        id: 'msg-1',
        content: '@CodingBot help',
        converseId: 'conv-1',
      } as any, 'user-1', 'conv-1');

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'agent.dispatch',
        expect.objectContaining({
          botId: 'bot-1',
          events: expect.arrayContaining([
            expect.objectContaining({
              type: 'USER_MESSAGE',
              payload: expect.objectContaining({
                userId: 'user-1',
                converseId: 'conv-1',
              }),
            }),
          ]),
        }),
      );
    });
  });

  describe('routeToSupervisor (unified)', () => {
    const mockEmit = jest.fn();

    beforeEach(() => {
      mockEmit.mockClear();
    });

    it('should emit agent.dispatch to supervisor-bot for any converse type', async () => {
      const mockPrismaLocal = {
        bot: { findMany: jest.fn().mockResolvedValue([]) },
        converseMember: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const { MentionService: MS } = await import('../mentions.service');
      const { EventEmitter2 } = await import('@nestjs/event-emitter');
      const { PrismaService } = await import('../../prisma/prisma.service');
      const module = await Test.createTestingModule({
        providers: [
          MS,
          { provide: PrismaService, useValue: mockPrismaLocal },
          { provide: EventEmitter2, useValue: { emit: mockEmit } },
        ],
      }).compile();
      const svc = module.get<MentionService>(MS);

      // Test with DM converse — should still dispatch to SupervisorAgent (not Whisper)
      const mentions = [{ type: 'ai' as const, name: 'ai', fullMatch: '@ai' }];
      await svc.route(
        mentions,
        { id: 'msg-1', content: 'Hey @ai help me', converseId: 'dm-1' },
        'sender-1',
        'dm-1',
      );

      expect(mockEmit).toHaveBeenCalledWith('agent.dispatch', {
        botId: 'supervisor-bot',
        events: [
          expect.objectContaining({
            type: 'USER_MESSAGE',
            payload: expect.objectContaining({
              userId: 'sender-1',
              content: 'Hey @ai help me',
              converseId: 'dm-1',
            }),
          }),
        ],
      });
    });
  });
});
