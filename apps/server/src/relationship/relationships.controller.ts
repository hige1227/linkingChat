import { Controller, Get, Patch, Param, Body, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateRelationshipDto } from './dto/update-relationship.dto';
import type { RelationshipResponseDto } from './dto/relationship-response.dto';

@Controller('relationships')
@UseGuards(JwtAuthGuard, EmailVerifiedGuard)
export class RelationshipsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async findAll(@Request() req: { user: { id?: string; userId?: string; sub?: string } }): Promise<RelationshipResponseDto[]> {
    const userId = this.getRequestUserId(req);
    const profiles = await this.prisma.relationshipProfile.findMany({
      where: { userId },
      orderBy: [{ tier: 'asc' }, { lastInteractionAt: 'desc' }],
      include: {
        events: { where: { isActive: true }, take: 3, orderBy: { extractedAt: 'desc' } },
      },
    });

    return profiles.map((p) => ({
      id: p.id,
      contactId: p.contactId,
      tier: p.tier,
      label: p.label,
      notes: p.notes,
      isMuted: p.isMuted,
      isUrgentReply: p.isUrgentReply,
      lastInteractionAt: p.lastInteractionAt?.toISOString() ?? null,
      weeklyMessageCount: p.weeklyMessageCount,
      sentimentTrend: p.sentimentTrend,
      lastKeyEventSummary: p.lastKeyEventSummary,
      recentEvents: p.events.map((e) => ({ type: e.type, summary: e.summary })),
    }));
  }

  @Patch(':contactId')
  async update(
    @Request() req: { user: { id?: string; userId?: string; sub?: string } },
    @Param('contactId') contactId: string,
    @Body() dto: UpdateRelationshipDto,
  ): Promise<RelationshipResponseDto> {
    const userId = this.getRequestUserId(req);
    const profile = await this.prisma.relationshipProfile.upsert({
      where: { userId_contactId: { userId, contactId } },
      create: { userId, contactId, ...dto },
      update: dto,
      include: { events: { where: { isActive: true }, take: 3, orderBy: { extractedAt: 'desc' } } },
    });

    return {
      id: profile.id,
      contactId: profile.contactId,
      tier: profile.tier,
      label: profile.label,
      notes: profile.notes,
      isMuted: profile.isMuted,
      isUrgentReply: profile.isUrgentReply,
      lastInteractionAt: profile.lastInteractionAt?.toISOString() ?? null,
      weeklyMessageCount: profile.weeklyMessageCount,
      sentimentTrend: profile.sentimentTrend,
      lastKeyEventSummary: profile.lastKeyEventSummary,
      recentEvents: profile.events.map((e) => ({ type: e.type, summary: e.summary })),
    };
  }

  private getRequestUserId(req: { user?: { id?: string; userId?: string; sub?: string } }): string {
    const userId = req.user?.userId ?? req.user?.id ?? req.user?.sub;
    if (!userId) {
      throw new ForbiddenException('Authentication required');
    }
    return userId;
  }
}
