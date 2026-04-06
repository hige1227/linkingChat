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
      findSupervisorByUserId: jest.fn().mockResolvedValue({
        id: 'bot-supervisor-1',
        userId: 'user-supervisor-1',
        name: 'Supervisor',
      }),
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

  describe('handleEvent — USER_MESSAGE', () => {
    it('should call llmRouter and create a reply message in the source converse', async () => {
      const events: AgentEvent[] = [
        {
          type: 'USER_MESSAGE',
          payload: {
            userId: 'u1',
            content: 'Hello Supervisor',
            converseId: 'conv-dm-1',
          },
          timestamp: new Date(),
          source: { userId: 'u1' },
        },
      ];

      await agent.handleEvent(events);

      expect(mockLlmRouter.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: 'chat',
          messages: [{ role: 'user', content: 'Hello Supervisor' }],
        }),
      );
      expect(mockMessagesService.create).toHaveBeenCalledWith(
        'user-supervisor-1', // supervisorBot.userId
        expect.objectContaining({
          converseId: 'conv-dm-1',
          content: '任务已完成',
        }),
      );
    });

    it('should skip when no supervisorBot found for user', async () => {
      mockBotsService.findSupervisorByUserId.mockResolvedValueOnce(null);

      const events: AgentEvent[] = [
        {
          type: 'USER_MESSAGE',
          payload: { userId: 'u-unknown', content: 'hi', converseId: 'conv-x' },
          timestamp: new Date(),
          source: { userId: 'u-unknown' },
        },
      ];

      await agent.handleEvent(events);

      expect(mockMessagesService.create).not.toHaveBeenCalled();
    });
  });

  describe('handleEvent — CROSS_BOT_NOTIFY', () => {
    it('should create BOT_NOTIFICATION message with [From X] attribution', async () => {
      mockMemoryService.getWorkingMemory.mockResolvedValue({
        pendingActions: [],
        recentResults: [],
      });

      const events: AgentEvent[] = [
        {
          type: 'CROSS_BOT_NOTIFY',
          payload: {
            fromBotId: 'coding-bot-id',
            fromBotName: 'Coding Bot',
            event: 'task_complete',
            data: { content: '已完成代码审查' },
          },
          timestamp: new Date(),
          source: { userId: 'u1' },
        },
      ];

      await agent.handleEvent(events);

      expect(mockMessagesService.create).toHaveBeenCalledWith(
        'user-supervisor-1',
        expect.objectContaining({
          content: '[From Coding Bot]: 已完成代码审查',
          type: 'BOT_NOTIFICATION',
          metadata: expect.objectContaining({
            cardType: 'cross_bot_notify',
            sourceBotName: 'Coding Bot',
          }),
        }),
      );

      expect(mockBroadcastService.toRoom).toHaveBeenCalledWith(
        'u-u1',
        'bot:notification',
        expect.objectContaining({
          fromBotName: 'Coding Bot',
          content: '[From Coding Bot]: 已完成代码审查',
        }),
      );
    });

    it('should fall back to event name when data.content is absent', async () => {
      const events: AgentEvent[] = [
        {
          type: 'CROSS_BOT_NOTIFY',
          payload: {
            fromBotId: 'coding-bot-id',
            fromBotName: 'Coding Bot',
            event: 'file_created',
            data: {},
          },
          timestamp: new Date(),
          source: { userId: 'u1' },
        },
      ];

      await agent.handleEvent(events);

      expect(mockMessagesService.create).toHaveBeenCalledWith(
        'user-supervisor-1',
        expect.objectContaining({
          content: '[From Coding Bot]: file_created',
        }),
      );
    });
  });
});
