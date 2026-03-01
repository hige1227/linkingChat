import { Test, TestingModule } from '@nestjs/testing';
import { AgentWorkspaceService } from './workspace.service';

describe('AgentWorkspaceService', () => {
  let service: AgentWorkspaceService;
  let mockRedis: any;

  beforeEach(async () => {
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentWorkspaceService,
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AgentWorkspaceService>(AgentWorkspaceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getState', () => {
    it('should return empty object when no state exists', async () => {
      const result = await service.getState('bot-123');
      expect(result).toEqual({});
    });

    it('should return parsed state', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({ foo: 'bar' }));
      const result = await service.getState('bot-123');
      expect(result).toEqual({ foo: 'bar' });
    });
  });

  describe('updateState', () => {
    it('should merge state updates', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({ a: 1 }));
      await service.updateState('bot-123', { b: 2 });
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify({ a: 1, b: 2 }),
      );
    });
  });

  describe('getConfig', () => {
    it('should return default config when none exists', async () => {
      const result = await service.getConfig('bot-123');
      expect(result.language).toBe('zh-CN');
      expect(result.timezone).toBe('Asia/Shanghai');
    });
  });
});
