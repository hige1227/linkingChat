import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { AgentOrchestratorService } from '../orchestrator/agent-orchestrator.service';
import { AgentEvent } from '../interfaces';

@Injectable()
export class BatchTriggerService implements OnModuleDestroy {
  private pendingEvents: Map<string, AgentEvent[]> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private readonly BATCH_WINDOW_MS = 5000;

  private readonly logger = new Logger(BatchTriggerService.name);

  constructor(private readonly orchestrator: AgentOrchestratorService) {}

  onModuleDestroy() {
    // Clear all timers on module destroy
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  addEvent(botId: string, event: AgentEvent): void {
    if (!this.pendingEvents.has(botId)) {
      this.pendingEvents.set(botId, []);
    }
    this.pendingEvents.get(botId)!.push(event);

    this.logger.debug(
      `Event added for ${botId}, total: ${this.pendingEvents.get(botId)!.length}`,
    );

    this.resetTimer(botId);
  }

  async flushNow(botId: string): Promise<void> {
    await this.flushEvents(botId);
  }

  private resetTimer(botId: string): void {
    if (this.timers.has(botId)) {
      clearTimeout(this.timers.get(botId)!);
    }

    this.timers.set(
      botId,
      setTimeout(() => {
        this.flushEvents(botId).catch((err) => {
          this.logger.error(`Failed to flush events for ${botId}:`, err);
        });
      }, this.BATCH_WINDOW_MS),
    );
  }

  private async flushEvents(botId: string): Promise<void> {
    const events = this.pendingEvents.get(botId);
    if (!events || events.length === 0) {
      return;
    }

    this.pendingEvents.delete(botId);
    this.timers.delete(botId);

    this.logger.log(`Flushing ${events.length} events for ${botId}`);

    try {
      await this.orchestrator.dispatchEvent(botId, events);
    } catch (error) {
      this.logger.error(`Failed to dispatch events for ${botId}:`, error);
    }
  }
}
