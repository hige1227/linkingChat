import { Injectable, Logger, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Redis } from 'ioredis';
import { BatchTriggerService } from './batch-trigger.service';
import { BotsService } from '../../bots/bots.service';
import { AgentOrchestratorService } from '../orchestrator/agent-orchestrator.service';
import { PredictiveService } from '../../ai/services/predictive.service';
import { JarvisAgentService } from '../../jarvis/jarvis-agent.service';
import { AgentEvent } from '../interfaces';

/** Well-known botId for the singleton SupervisorAgent */
export const SUPERVISOR_AGENT_BOT_ID = 'supervisor-bot';

export interface DeviceResultEvent {
  userId: string;
  commandId: string;
  command: string;
  status: 'success' | 'error';
  output?: string;
  error?: string;
  deviceId: string;
}

export interface AgentDispatchEvent {
  botId: string;
  events: AgentEvent[];
}

@Injectable()
export class BotEventListener {
  private readonly logger = new Logger(BotEventListener.name);

  constructor(
    private readonly batchTrigger: BatchTriggerService,
    private readonly botsService: BotsService,
    private readonly orchestrator: AgentOrchestratorService,
    private readonly predictiveService: PredictiveService,
    private readonly jarvisAgent: JarvisAgentService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  /**
   * Handle agent.dispatch events from MentionService (decoupled from AgentsModule)
   */
  @OnEvent('agent.dispatch')
  async handleAgentDispatch(payload: AgentDispatchEvent): Promise<void> {
    this.logger.debug(
      `Received agent.dispatch for bot ${payload.botId}`,
    );

    const userMessageEvent = payload.events.find((e) => e.type === 'USER_MESSAGE');
    if (userMessageEvent) {
      const userId = userMessageEvent.source?.userId;
      // Narrow the union payload to UserMessagePayload via type guard
      const msgPayload = userMessageEvent.payload as { content?: string };
      const content = msgPayload.content;
      if (userId && content) {
        await this.jarvisAgent.prompt(userId, content);
        return;
      }
    }

    // Fallback: keep old orchestrator for any non-USER_MESSAGE events
    await this.orchestrator.dispatchEvent(payload.botId, payload.events);
  }

  @OnEvent('device.result.complete')
  async handleDeviceResultComplete(payload: DeviceResultEvent): Promise<void> {
    this.logger.debug(
      `Received device:result:complete for command ${payload.commandId}`,
    );

    // Verify user has a Supervisor Bot (existence check)
    const supervisorBot = await this.botsService.findSupervisorByUserId(
      payload.userId,
    );
    if (!supervisorBot) {
      this.logger.warn(`No Supervisor Bot found for user ${payload.userId}`);
      return;
    }

    // Construct Agent event
    const event: AgentEvent = {
      type: 'DEVICE_RESULT',
      payload: {
        commandId: payload.commandId,
        command: payload.command,
        status: payload.status,
        output: payload.output,
        error: payload.error,
        deviceId: payload.deviceId,
      },
      timestamp: new Date(),
      source: {
        userId: payload.userId,
        deviceId: payload.deviceId,
      },
    };

    // Use the well-known singleton botId — SupervisorAgent resolves
    // the actual per-user bot inside handleEvent()
    this.batchTrigger.addEvent(SUPERVISOR_AGENT_BOT_ID, event);

    // Predictive Actions: analyze error output, push to Supervisor converse
    if (payload.status === 'error') {
      const rateLimitKey = `predictive:${payload.userId}:${payload.deviceId}`;
      const isRateLimited = await this.redis.exists(rateLimitKey);

      if (!isRateLimited) {
        await this.redis.setex(rateLimitKey, 60, '1');

        const errorOutput = payload.error ?? payload.output ?? '';
        const category = this.predictiveService.detectTrigger(errorOutput);

        if (category) {
          const supervisorConverse =
            await this.botsService.getOrCreateSupervisorConverse(payload.userId);

          this.predictiveService
            .analyzeTrigger({
              userId: payload.userId,
              converseId: supervisorConverse.id,
              triggerOutput: errorOutput,
              triggerCategory: category,
            })
            .catch((err) =>
              this.logger.error(`Predictive analysis failed: ${err.message}`),
            );
        }
      }
    }
  }
}
