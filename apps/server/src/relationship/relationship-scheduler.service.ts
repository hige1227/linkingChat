import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Redis } from 'ioredis';
import { ReminderEngineService } from './reminder-engine.service';
import { RelationshipGraphService } from './relationship-graph.service';

@Injectable()
export class RelationshipSchedulerService {
  private readonly logger = new Logger(RelationshipSchedulerService.name);

  constructor(
    private readonly reminderEngine: ReminderEngineService,
    private readonly graphService: RelationshipGraphService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  @Cron('0 9 * * *')
  async runDailyReminders(): Promise<void> {
    const acquired = await this.redis.set('relationship:daily:lock', '1', 'EX', 3600, 'NX');
    if (!acquired) return;
    try {
      this.logger.log('Running daily reminder evaluation');
      await this.reminderEngine.runDailyEvaluation();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Daily reminder failed: ${msg}`);
    } finally {
      await this.redis.del('relationship:daily:lock');
    }
  }

  @Cron('0 2 * * 1')
  async runWeeklyDecay(): Promise<void> {
    const acquired = await this.redis.set('relationship:weekly:lock', '1', 'EX', 3600, 'NX');
    if (!acquired) return;
    try {
      await this.graphService.weeklyDecay();
    } finally {
      await this.redis.del('relationship:weekly:lock');
    }
  }
}
