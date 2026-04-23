jest.mock('@mariozechner/pi-ai', () => ({}), { virtual: true });
import { Test, TestingModule } from '@nestjs/testing';
import { BotEventListener } from './bot-event.listener';
import { BatchTriggerService } from './batch-trigger.service';
import { BotsService } from '../../bots/bots.service';
import { AgentOrchestratorService } from '../orchestrator/agent-orchestrator.service';
import { PredictiveService } from '../../ai/services/predictive.service';
import type { DeviceResultEvent } from './bot-event.listener';

describe('BotEventListener — Predictive trigger', () => {
  let listener: BotEventListener;
  let mockPredictive: any;
  let mockBotsService: any;
  let mockRedis: any;

  beforeEach(async () => {
    mockPredictive = {
      detectTrigger: jest.fn(),
      analyzeTrigger: jest.fn().mockResolvedValue(undefined),
    };
    mockBotsService = {
      findSupervisorByUserId: jest.fn().mockResolvedValue({
        id: 'bot-1',
        userId: 'bot-user-1',
        name: 'Supervisor',
      }),
      getOrCreateSupervisorConverse: jest.fn().mockResolvedValue({
        id: 'converse-supervisor-1',
      }),
    };
    mockRedis = {
      exists: jest.fn().mockResolvedValue(0),
      setex: jest.fn().mockResolvedValue('OK'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotEventListener,
        { provide: BatchTriggerService, useValue: { addEvent: jest.fn() } },
        { provide: BotsService, useValue: mockBotsService },
        { provide: AgentOrchestratorService, useValue: { dispatchEvent: jest.fn() } },
        { provide: PredictiveService, useValue: mockPredictive },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();

    listener = module.get<BotEventListener>(BotEventListener);
  });

  describe('handleDeviceResultComplete — Predictive', () => {
    const errorPayload: DeviceResultEvent = {
      userId: 'user-1',
      commandId: 'cmd-1',
      command: 'npm install',
      status: 'error',
      output: 'npm ERR! code ENOENT\nnpm ERR! syscall open',
      deviceId: 'device-1',
    };

    it('triggers Predictive on error with matching category', async () => {
      mockPredictive.detectTrigger.mockReturnValue('package_error');

      await listener.handleDeviceResultComplete(errorPayload);

      expect(mockPredictive.detectTrigger).toHaveBeenCalledWith(
        expect.stringContaining('npm ERR!'),
      );
      expect(mockPredictive.analyzeTrigger).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          converseId: 'converse-supervisor-1',
          triggerCategory: 'package_error',
        }),
      );
    });

    it('does NOT trigger Predictive when rate limit key exists', async () => {
      mockRedis.exists.mockResolvedValueOnce(1); // rate limit active
      mockPredictive.detectTrigger.mockReturnValue('package_error');

      await listener.handleDeviceResultComplete(errorPayload);

      expect(mockPredictive.analyzeTrigger).not.toHaveBeenCalled();
    });

    it('does NOT trigger Predictive when detectTrigger returns null', async () => {
      mockPredictive.detectTrigger.mockReturnValue(null);

      await listener.handleDeviceResultComplete(errorPayload);

      expect(mockPredictive.analyzeTrigger).not.toHaveBeenCalled();
    });

    it('does NOT trigger Predictive on success status', async () => {
      await listener.handleDeviceResultComplete({
        ...errorPayload,
        status: 'success',
        output: 'Done.',
        error: undefined,
      });

      expect(mockPredictive.detectTrigger).not.toHaveBeenCalled();
      expect(mockPredictive.analyzeTrigger).not.toHaveBeenCalled();
    });

    it('sets Redis rate limit key with 60s TTL after triggering', async () => {
      mockPredictive.detectTrigger.mockReturnValue('build_error');

      await listener.handleDeviceResultComplete(errorPayload);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'predictive:user-1:device-1',
        60,
        '1',
      );
    });
  });
});
