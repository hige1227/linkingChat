import { Test, TestingModule } from '@nestjs/testing';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { AgentMemoryService } from '../core/memory.service';
import { AgentWorkspaceService } from '../core/workspace.service';
import { IAgent, AgentEvent } from '../interfaces';

describe('AgentOrchestratorService', () => {
  let service: AgentOrchestratorService;
  let mockMemoryService: any;
  let mockWorkspaceService: any;

  beforeEach(async () => {
    mockMemoryService = {
      getShortTermMemory: jest.fn().mockResolvedValue([]),
      getWorkingMemory: jest.fn().mockResolvedValue({ pendingActions: [], recentResults: [] }),
    };
    mockWorkspaceService = {
      getWorkspace: jest.fn().mockResolvedValue({ state: {}, config: {}, sessionId: 's1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentOrchestratorService,
        { provide: AgentMemoryService, useValue: mockMemoryService },
        { provide: AgentWorkspaceService, useValue: mockWorkspaceService },
      ],
    }).compile();

    service = module.get<AgentOrchestratorService>(AgentOrchestratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerAgent', () => {
    it('should register an agent', () => {
      const mockAgent = createMockAgent('bot-1', 'Test Agent');
      service.registerAgent(mockAgent);
      expect(service.getAgent('bot-1')).toBe(mockAgent);
    });
  });

  describe('dispatchEvent', () => {
    it('should call handleEvent on registered agent', async () => {
      const mockAgent = createMockAgent('bot-1', 'Test Agent');
      service.registerAgent(mockAgent);

      const events: AgentEvent[] = [
        {
          type: 'DEVICE_RESULT',
          payload: { commandId: '1', command: 'ls', status: 'success', deviceId: 'd1' },
          timestamp: new Date(),
          source: { userId: 'u1' },
        },
      ];

      await service.dispatchEvent('bot-1', events);
      expect(mockAgent.handleEvent).toHaveBeenCalledWith(events);
    });

    it('should not throw when agent not found', async () => {
      await expect(service.dispatchEvent('unknown-bot', [])).resolves.not.toThrow();
    });
  });
});

function createMockAgent(botId: string, name: string): IAgent {
  return {
    id: `agent-${botId}`,
    botId,
    name,
    role: 'supervisor',
    handleEvent: jest.fn().mockResolvedValue(undefined),
    generateResponse: jest.fn().mockResolvedValue({ content: 'OK' }),
    getMemory: jest.fn().mockResolvedValue({ shortTerm: [], working: { pendingActions: [], recentResults: [] } }),
    getWorkspace: jest.fn().mockResolvedValue({ state: {}, config: {}, sessionId: 's1' }),
    getTools: jest.fn().mockReturnValue([]),
  };
}
