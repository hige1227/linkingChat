import { Test, TestingModule } from '@nestjs/testing';
import { BatchTriggerService } from './batch-trigger.service';
import { AgentOrchestratorService } from '../orchestrator/agent-orchestrator.service';
import { AgentEvent } from '../interfaces';

describe('BatchTriggerService', () => {
  let service: BatchTriggerService;
  let mockOrchestrator: any;

  beforeEach(async () => {
    mockOrchestrator = {
      dispatchEvent: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchTriggerService,
        { provide: AgentOrchestratorService, useValue: mockOrchestrator },
      ],
    }).compile();

    service = module.get<BatchTriggerService>(BatchTriggerService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addEvent', () => {
    it('should accumulate events for the same bot', () => {
      const event1: AgentEvent = {
        type: 'DEVICE_RESULT',
        payload: { commandId: '1', command: 'ls', status: 'success', deviceId: 'd1' },
        timestamp: new Date(),
        source: { userId: 'u1' },
      };
      const event2: AgentEvent = {
        type: 'DEVICE_RESULT',
        payload: { commandId: '2', command: 'pwd', status: 'success', deviceId: 'd1' },
        timestamp: new Date(),
        source: { userId: 'u1' },
      };

      service.addEvent('bot-1', event1);
      service.addEvent('bot-1', event2);

      // Events should be accumulated, not immediately dispatched
      expect(mockOrchestrator.dispatchEvent).not.toHaveBeenCalled();
    });

    it('should flush events immediately when called', async () => {
      const event: AgentEvent = {
        type: 'DEVICE_RESULT',
        payload: { commandId: '1', command: 'ls', status: 'success', deviceId: 'd1' },
        timestamp: new Date(),
        source: { userId: 'u1' },
      };

      service.addEvent('bot-1', event);
      await service.flushNow('bot-1');

      expect(mockOrchestrator.dispatchEvent).toHaveBeenCalledWith('bot-1', [event]);
    });
  });
});
