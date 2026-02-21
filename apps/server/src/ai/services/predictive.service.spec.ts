import { Test, TestingModule } from '@nestjs/testing';
import { PredictiveService } from './predictive.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BroadcastService } from '../../gateway/broadcast.service';
import { LlmRouterService } from './llm-router.service';

// ── 测试数据 ────────────────────────────

const mockUserId = 'user-001';
const mockConverseId = 'converse-001';

const mockSuggestionRecord = {
  id: 'suggestion-pred-001',
  type: 'PREDICTIVE',
  status: 'PENDING',
  userId: mockUserId,
  converseId: mockConverseId,
  suggestions: {
    trigger: 'npm ERR! missing script: start',
    category: 'package_error',
    actions: [
      { type: 'shell', action: 'cat package.json', description: '查看 package.json', dangerLevel: 'safe' },
      { type: 'shell', action: 'npm run dev', description: '尝试 dev 脚本', dangerLevel: 'safe' },
    ],
  },
  selectedIndex: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── Mock Services ────────────────────────────

const mockPrisma: any = {
  aiSuggestion: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockBroadcast: any = {
  toRoom: jest.fn(),
};

const mockLlmRouter: any = {
  complete: jest.fn(),
};

// ── 测试套件 ────────────────────────────

describe('PredictiveService', () => {
  let service: PredictiveService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PredictiveService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BroadcastService, useValue: mockBroadcast },
        { provide: LlmRouterService, useValue: mockLlmRouter },
      ],
    }).compile();

    service = module.get<PredictiveService>(PredictiveService);
    jest.clearAllMocks();
  });

  // ── detectTrigger() ────────────────────────────

  describe('detectTrigger', () => {
    it('should detect npm errors', () => {
      expect(service.detectTrigger('npm ERR! missing script: start')).toBe('package_error');
    });

    it('should detect generic errors', () => {
      expect(service.detectTrigger('Error: something went wrong')).toBe('error');
    });

    it('should detect permission denied', () => {
      expect(service.detectTrigger('EACCES: permission denied')).toBe('permission');
    });

    it('should detect file not found', () => {
      expect(service.detectTrigger('ENOENT: no such file or directory')).toBe('not_found');
    });

    it('should detect timeout', () => {
      expect(service.detectTrigger('ETIMEDOUT: connection timed out')).toBe('timeout');
    });

    it('should detect build errors', () => {
      expect(service.detectTrigger('Build failed with 3 errors')).toBe('build_error');
    });

    it('should detect network errors', () => {
      expect(service.detectTrigger('ECONNREFUSED 127.0.0.1:5432')).toBe('network');
    });

    it('should return null for normal output', () => {
      expect(service.detectTrigger('Build successful. 0 errors.')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(service.detectTrigger('')).toBeNull();
    });
  });

  // ── classifyDangerLevel() ────────────────────────────

  describe('classifyDangerLevel', () => {
    it('should classify safe shell commands', () => {
      const result = service.classifyDangerLevel({
        type: 'shell',
        action: 'cat package.json',
        description: '查看文件',
        dangerLevel: 'safe',
      });
      expect(result.dangerLevel).toBe('safe');
    });

    it('should classify rm -rf / as dangerous', () => {
      const result = service.classifyDangerLevel({
        type: 'shell',
        action: 'rm -rf /',
        description: '删除全盘',
        dangerLevel: 'safe',
      });
      expect(result.dangerLevel).toBe('dangerous');
    });

    it('should classify shutdown as dangerous', () => {
      const result = service.classifyDangerLevel({
        type: 'shell',
        action: 'shutdown -h now',
        description: '关机',
        dangerLevel: 'safe',
      });
      expect(result.dangerLevel).toBe('dangerous');
    });

    it('should classify rm (simple) as warning', () => {
      const result = service.classifyDangerLevel({
        type: 'shell',
        action: 'rm temp.log',
        description: '删除临时文件',
        dangerLevel: 'safe',
      });
      expect(result.dangerLevel).toBe('warning');
    });

    it('should classify git reset as warning', () => {
      const result = service.classifyDangerLevel({
        type: 'shell',
        action: 'git reset --hard HEAD~1',
        description: '回退一个提交',
        dangerLevel: 'safe',
      });
      expect(result.dangerLevel).toBe('warning');
    });

    it('should classify docker prune as warning', () => {
      const result = service.classifyDangerLevel({
        type: 'shell',
        action: 'docker prune -a',
        description: '清理 Docker',
        dangerLevel: 'safe',
      });
      expect(result.dangerLevel).toBe('warning');
    });

    it('should classify non-shell actions as safe', () => {
      const result = service.classifyDangerLevel({
        type: 'message',
        action: 'Send error report',
        description: '发送错误报告',
        dangerLevel: 'safe',
      });
      expect(result.dangerLevel).toBe('safe');
    });
  });

  // ── parseActions() ────────────────────────────

  describe('parseActions', () => {
    it('should parse JSON array of actions', () => {
      const json = JSON.stringify([
        { type: 'shell', action: 'npm install', description: '安装依赖' },
        { type: 'shell', action: 'npm run build', description: '重新构建' },
      ]);

      const result = service.parseActions(json);

      expect(result).toHaveLength(2);
      expect(result[0].action).toBe('npm install');
    });

    it('should parse JSON object with actions property', () => {
      const json = JSON.stringify({
        actions: [
          { type: 'shell', action: 'ls', description: '列出文件' },
        ],
      });

      const result = service.parseActions(json);

      expect(result).toHaveLength(1);
    });

    it('should return empty array for invalid JSON', () => {
      expect(service.parseActions('not json')).toEqual([]);
    });

    it('should limit to 5 actions', () => {
      const actions = Array.from({ length: 10 }, (_, i) => ({
        type: 'shell',
        action: `cmd${i}`,
        description: `desc${i}`,
      }));

      const result = service.parseActions(JSON.stringify(actions));

      expect(result).toHaveLength(5);
    });

    it('should filter actions without description', () => {
      const json = JSON.stringify([
        { type: 'shell', action: 'ls' }, // missing description
        { type: 'shell', action: 'cat x', description: 'read x' },
      ]);

      const result = service.parseActions(json);

      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('cat x');
    });
  });

  // ── analyzeTrigger() ────────────────────────────

  describe('analyzeTrigger', () => {
    it('should generate actions and push via WS', async () => {
      mockLlmRouter.complete.mockResolvedValue({
        content: JSON.stringify([
          { type: 'shell', action: 'cat package.json', description: '查看 package.json' },
          { type: 'shell', action: 'npm run dev', description: '尝试 dev 脚本' },
        ]),
      });
      mockPrisma.aiSuggestion.create.mockResolvedValue(mockSuggestionRecord);

      await service.analyzeTrigger({
        userId: mockUserId,
        converseId: mockConverseId,
        triggerOutput: 'npm ERR! missing script: start',
        triggerCategory: 'package_error',
      });

      expect(mockPrisma.aiSuggestion.create).toHaveBeenCalled();
      expect(mockBroadcast.toRoom).toHaveBeenCalledWith(
        `u-${mockUserId}`,
        'ai:predictive:action',
        expect.objectContaining({
          suggestionId: 'suggestion-pred-001',
          actions: expect.arrayContaining([
            expect.objectContaining({ action: 'cat package.json', dangerLevel: 'safe' }),
          ]),
        }),
      );
    });

    it('should not push when LLM returns empty actions', async () => {
      mockLlmRouter.complete.mockResolvedValue({
        content: JSON.stringify([]),
      });

      await service.analyzeTrigger({
        userId: mockUserId,
        converseId: mockConverseId,
        triggerOutput: 'some output',
        triggerCategory: 'error',
      });

      expect(mockPrisma.aiSuggestion.create).not.toHaveBeenCalled();
      expect(mockBroadcast.toRoom).not.toHaveBeenCalled();
    });
  });

  // ── executeAction() ────────────────────────────

  describe('executeAction', () => {
    it('should return selected action and mark as ACCEPTED', async () => {
      mockPrisma.aiSuggestion.findFirst.mockResolvedValue(mockSuggestionRecord);
      mockPrisma.aiSuggestion.update.mockResolvedValue({});

      const action = await service.executeAction(mockUserId, 'suggestion-pred-001', 0);

      expect(action).toEqual(
        expect.objectContaining({ action: 'cat package.json' }),
      );
      expect(mockPrisma.aiSuggestion.update).toHaveBeenCalledWith({
        where: { id: 'suggestion-pred-001' },
        data: { status: 'ACCEPTED', selectedIndex: 0 },
      });
    });

    it('should return null when suggestion not found', async () => {
      mockPrisma.aiSuggestion.findFirst.mockResolvedValue(null);

      const action = await service.executeAction(mockUserId, 'nonexistent', 0);

      expect(action).toBeNull();
    });
  });

  // ── dismissAction() ────────────────────────────

  describe('dismissAction', () => {
    it('should mark suggestion as DISMISSED', async () => {
      mockPrisma.aiSuggestion.updateMany.mockResolvedValue({ count: 1 });

      await service.dismissAction(mockUserId, 'suggestion-pred-001');

      expect(mockPrisma.aiSuggestion.updateMany).toHaveBeenCalledWith({
        where: { id: 'suggestion-pred-001', userId: mockUserId, status: 'PENDING' },
        data: { status: 'DISMISSED' },
      });
    });
  });
});
