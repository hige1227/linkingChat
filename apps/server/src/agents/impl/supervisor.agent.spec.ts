import { Test, TestingModule } from '@nestjs/testing';
import { SupervisorAgent } from './supervisor.agent';
import { AgentMemoryService } from '../core/memory.service';
import { AgentWorkspaceService } from '../core/workspace.service';
import { LlmRouterService } from '../../ai/services/llm-router.service';
import { MessagesService } from '../../messages/messages.service';
import { BroadcastService } from '../../gateway/broadcast.service';
import { BotsService } from '../../bots/bots.service';
import { AgentEvent } from '../interfaces';

describe('SupervisorAgent', () => {
  let agent: SupervisorAgent;
  let mockMemoryService: any;
  let mockWorkspaceService: any;
  let mockLlmRouter: any;
  let mockMessagesService: any;
  let mockBroadcastService: any;
  let mockBotsService: any;

  beforeEach(async () => {
    mockMemoryService = {
      getShortTermMemory: jest.fn().mockResolvedValue([]),
      getWorkingMemory: jest.fn().mockResolvedValue({ pendingActions: [], recentResults: [] }),
      addCommandResult: jest.fn().mockResolvedValue(undefined),
      addShortTermMemory: jest.fn().mockResolvedValue(undefined),
    };
    mockWorkspaceService = {
      getWorkspace: jest.fn().mockResolvedValue({ state: {}, config: {}, sessionId: 's1' }),
    };
    mockLlmRouter = {
      complete: jest.fn().mockResolvedValue({ content: '任务已完成', model: 'deepseek-chat' }),
    };
    mockMessagesService = {
      create: jest.fn().mockResolvedValue({ id: 'msg-1', createdAt: new Date() }),
    };
    mockBroadcastService = {
      toRoom: jest.fn().mockResolvedValue(undefined),
    };
    mockBotsService = {
      getOrCreateSupervisorConverse: jest.fn().mockResolvedValue({ id: 'converse-1', type: 'DM' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupervisorAgent,
        { provide: AgentMemoryService, useValue: mockMemoryService },
        { provide: AgentWorkspaceService, useValue: mockWorkspaceService },
        { provide: LlmRouterService, useValue: mockLlmRouter },
        { provide: MessagesService, useValue: mockMessagesService },
        { provide: BroadcastService, useValue: mockBroadcastService },
        { provide: BotsService, useValue: mockBotsService },
      ],
    }).compile();

    agent = module.get<SupervisorAgent>(SupervisorAgent);
  });

  it('should be defined', () => {
    expect(agent).toBeDefined();
  });

  describe('handleEvent', () => {
    it('should add command results to memory', async () => {
      const events: AgentEvent[] = [
        {
          type: 'DEVICE_RESULT',
          payload: { commandId: 'cmd-1', command: 'ls', status: 'success', deviceId: 'd1' },
          timestamp: new Date(),
          source: { userId: 'u1' },
        },
      ];

      await agent.handleEvent(events);
      expect(mockMemoryService.addCommandResult).toHaveBeenCalled();
    });

    it('should generate and send notification', async () => {
      mockMemoryService.getWorkingMemory.mockResolvedValue({
        pendingActions: [],
        recentResults: [
          { commandId: 'cmd-1', command: 'ls', status: 'success', completedAt: new Date() },
        ],
      });

      const events: AgentEvent[] = [
        {
          type: 'DEVICE_RESULT',
          payload: { commandId: 'cmd-1', command: 'ls', status: 'success', deviceId: 'd1' },
          timestamp: new Date(),
          source: { userId: 'u1' },
        },
      ];

      await agent.handleEvent(events);
      expect(mockLlmRouter.complete).toHaveBeenCalled();
    });
  });

  describe('generateResponse', () => {
    it('should return LLM-generated content', async () => {
      mockMemoryService.getWorkingMemory.mockResolvedValue({
        pendingActions: [],
        recentResults: [
          { commandId: 'cmd-1', command: 'ls', status: 'success', completedAt: new Date() },
        ],
      });

      const response = await agent.generateResponse({ userId: 'u1' });
      expect(response.content).toBe('任务已完成');
    });
  });
});
