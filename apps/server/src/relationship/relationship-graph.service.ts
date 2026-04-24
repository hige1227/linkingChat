import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface MessageEvent {
  senderId: string;
  receiverId: string;
  converseType: 'DM' | 'GROUP';
  messageId: string;
  sentAt: Date;
}

@Injectable()
export class RelationshipGraphService {
  private readonly logger = new Logger(RelationshipGraphService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onMessageEvent(event: MessageEvent): Promise<void> {
    const { senderId, receiverId, sentAt, converseType } = event;

    if (converseType === 'DM') {
      await Promise.all([
        // Sender's profile of the receiver: they sent a message → interaction + count
        this.prisma.relationshipProfile.upsert({
          where: { userId_contactId: { userId: senderId, contactId: receiverId } },
          create: { userId: senderId, contactId: receiverId, lastInteractionAt: sentAt, weeklyMessageCount: 1 },
          update: { lastInteractionAt: sentAt, weeklyMessageCount: { increment: 1 } },
        }),
        // Receiver's profile of the sender: update lastInteractionAt only
        this.prisma.relationshipProfile.upsert({
          where: { userId_contactId: { userId: receiverId, contactId: senderId } },
          create: { userId: receiverId, contactId: senderId, lastInteractionAt: sentAt },
          update: { lastInteractionAt: sentAt },
        }),
      ]);
    } else {
      // GROUP: only update existing profiles (don't create for non-friends)
      await Promise.all([
        this.prisma.relationshipProfile.updateMany({
          where: { userId: senderId, contactId: receiverId },
          data: { lastInteractionAt: sentAt, groupInteractionCount: { increment: 1 } },
        }),
        this.prisma.relationshipProfile.updateMany({
          where: { userId: receiverId, contactId: senderId },
          data: { lastInteractionAt: sentAt },
        }),
      ]);
    }
  }

  async weeklyDecay(): Promise<void> {
    const profiles = await this.prisma.relationshipProfile.findMany({
      select: { id: true, weeklyMessageCount: true },
    });

    await Promise.all(
      profiles.map((p) =>
        this.prisma.relationshipProfile.update({
          where: { id: p.id },
          data: { prevWeeklyMessageCount: p.weeklyMessageCount, weeklyMessageCount: 0 },
        }),
      ),
    );

    this.logger.log(`Weekly decay applied to ${profiles.length} profiles`);
  }
}
