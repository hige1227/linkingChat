import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { RelationshipGraphService, type MessageEvent } from './relationship-graph.service';
import { ContentAnalyzerService } from './content-analyzer.service';

export interface MessageCreatedRelationshipEvent {
  messageId: string;
  senderId: string;
  receiverId: string;
  converseType: 'DM' | 'GROUP';
  content: string | null;
  sentAt: Date;
  profileId?: string;
}

@Injectable()
export class RelationshipEventListener {
  private readonly logger = new Logger(RelationshipEventListener.name);

  constructor(
    private readonly graphService: RelationshipGraphService,
    private readonly analyzer: ContentAnalyzerService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent('message.created.relationship')
  async handleMessageCreated(event: MessageCreatedRelationshipEvent): Promise<void> {
    await this.graphService.onMessageEvent({
      senderId: event.senderId,
      receiverId: event.receiverId,
      converseType: event.converseType,
      messageId: event.messageId,
      sentAt: event.sentAt,
    } satisfies MessageEvent);

    if (event.content && event.profileId && this.analyzer.ruleFilter(event.content)) {
      this.analyzer
        .extractEvents(event.content, event.messageId)
        .then(async (events) => {
          if (events.length === 0) return;
          await this.prisma.relationshipEvent.createMany({
            data: events.map((e) => ({
              profileId: event.profileId!,
              type: e.type,
              summary: e.summary,
              sourceMessageId: e.sourceMessageId,
            })),
          });
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(`Event extraction failed for message ${event.messageId}: ${msg}`);
        });
    }
  }
}
