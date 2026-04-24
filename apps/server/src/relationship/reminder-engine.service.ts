import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JarvisAgentService } from '../jarvis/jarvis-agent.service';
import type { RelationshipProfile } from '@prisma/client';

const SILENCE_THRESHOLD: Record<string, number | null> = {
  CORE: 7,
  IMPORTANT: 21,
  EXTENDED: null,
};

const DAILY_CAP = 3;
const DEDUP_DAYS = 7;
const QUIET_START = 22;
const QUIET_END = 8;

@Injectable()
export class ReminderEngineService {
  private readonly logger = new Logger(ReminderEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jarvisAgent: JarvisAgentService,
  ) {}

  async runDailyEvaluation(): Promise<void> {
    if (this.isQuietHours(new Date())) {
      this.logger.log('Reminder evaluation skipped — quiet hours');
      return;
    }

    const profiles = await this.prisma.relationshipProfile.findMany({
      where: { isMuted: false },
    });

    const byUser = new Map<string, typeof profiles>();
    for (const p of profiles) {
      const list = byUser.get(p.userId) ?? [];
      list.push(p);
      byUser.set(p.userId, list);
    }

    for (const [userId, userProfiles] of byUser.entries()) {
      const sorted = [...userProfiles].sort((a, b) => {
        const order: Record<string, number> = { CORE: 0, IMPORTANT: 1, EXTENDED: 2 };
        const tierDiff = (order[a.tier] ?? 2) - (order[b.tier] ?? 2);
        if (tierDiff !== 0) return tierDiff;
        return (a.lastInteractionAt?.getTime() ?? 0) - (b.lastInteractionAt?.getTime() ?? 0);
      });

      let sent = 0;
      for (const profile of sorted) {
        if (sent >= DAILY_CAP) break;
        if (!profile.isMuted && this.isSilent(profile) && this.notRecentlySent(profile.silenceReminderSentAt)) {
          await this.jarvisAgent.systemTrigger(userId, 'SILENCE_REMINDER', {
            contactId: profile.contactId,
            daysSilent: Math.floor(this.daysSince(profile.lastInteractionAt)),
            tier: profile.tier,
            label: profile.label,
            lastKeyEvent: profile.lastKeyEventSummary,
          });

          await this.prisma.relationshipProfile.updateMany({
            where: { id: profile.id },
            data: { silenceReminderSentAt: new Date() },
          });

          sent++;
        }
      }
    }
  }

  isSilent(
    profile: Pick<RelationshipProfile, 'tier' | 'customSilenceDays' | 'lastInteractionAt'>,
  ): boolean {
    const threshold = profile.customSilenceDays ?? SILENCE_THRESHOLD[profile.tier];
    if (threshold == null) return false;
    return this.daysSince(profile.lastInteractionAt) >= threshold;
  }

  private notRecentlySent(sentAt: Date | null): boolean {
    return !sentAt || this.daysSince(sentAt) >= DEDUP_DAYS;
  }

  private daysSince(date: Date | null | undefined): number {
    if (!date) return Infinity;
    return (Date.now() - date.getTime()) / 86_400_000;
  }

  private isQuietHours(now: Date): boolean {
    const h = now.getHours();
    return h >= QUIET_START || h < QUIET_END;
  }
}
