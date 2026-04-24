import { Injectable } from '@nestjs/common';
import { RelationshipTier } from '@prisma/client';
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import type { PrismaService } from '../prisma/prisma.service';
import type { BotsService } from '../bots/bots.service';
import type { BroadcastService } from '../gateway/broadcast.service';

type AnySchema = Record<string, unknown>;

function textResult(value: unknown): AgentToolResult<unknown> {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    details: value,
  };
}

@Injectable()
export class JarvisToolRegistry {
  constructor(
    private readonly prisma: PrismaService,
    private readonly botsService: BotsService,
    private readonly broadcastService: BroadcastService,
  ) {}

  buildTools(userId: string): AgentTool<AnySchema>[] {
    return [
      this.buildQueryRelationship(userId),
      this.buildListRelationships(userId),
      this.buildSearchMessages(),
      this.buildSendNudge(userId),
    ];
  }

  private buildQueryRelationship(userId: string): AgentTool<AnySchema> {
    return {
      name: 'query_relationship',
      label: '查询关系 Profile',
      description: '查询某联系人的关系 profile：tier、标签、关键事件、最近互动时间',
      parameters: {
        type: 'object',
        properties: {
          contactId: { type: 'string', description: '联系人的 userId' },
        },
        required: ['contactId'],
      } as unknown as AnySchema,
      execute: async (
        _toolCallId: string,
        params: { contactId: string },
      ): Promise<AgentToolResult<unknown>> => {
        const profile = await this.prisma.relationshipProfile.findUnique({
          where: { userId_contactId: { userId, contactId: params.contactId } },
          include: {
            events: {
              where: { isActive: true },
              take: 5,
              orderBy: { extractedAt: 'desc' },
            },
          },
        });

        if (!profile) {
          return textResult({ found: false, message: `No relationship profile for contact ${params.contactId}` });
        }

        return textResult({
          found: true,
          tier: profile.tier,
          label: profile.label,
          notes: profile.notes,
          lastInteractionAt: profile.lastInteractionAt?.toISOString() ?? null,
          weeklyMessageCount: profile.weeklyMessageCount,
          sentimentTrend: profile.sentimentTrend,
          recentEvents: profile.events.map((e: { type: string; summary: string }) => ({
            type: e.type,
            summary: e.summary,
          })),
        });
      },
    };
  }

  private buildListRelationships(userId: string): AgentTool<AnySchema> {
    return {
      name: 'list_relationships',
      label: '列出关系',
      description: '按条件列出关系（如所有沉默超 N 天的 CORE 联系人）',
      parameters: {
        type: 'object',
        properties: {
          tier: {
            type: 'string',
            enum: ['CORE', 'IMPORTANT', 'EXTENDED'],
            description: '关系层级',
          },
          silentDaysMin: { type: 'number', description: '沉默天数下限' },
          limit: { type: 'number', description: '最多返回条数，默认 10' },
        },
      } as unknown as AnySchema,
      execute: async (
        _toolCallId: string,
        params: { tier?: string; silentDaysMin?: number; limit?: number },
      ): Promise<AgentToolResult<unknown>> => {
        const cutoff = params.silentDaysMin != null
          ? new Date(Date.now() - params.silentDaysMin * 86_400_000)
          : undefined;

        const profiles = await this.prisma.relationshipProfile.findMany({
          where: {
            userId,
            isMuted: false,
            ...(params.tier != null ? { tier: params.tier as RelationshipTier } : {}),
            ...(cutoff != null ? { lastInteractionAt: { lt: cutoff } } : {}),
          },
          orderBy: { lastInteractionAt: 'asc' },
          take: params.limit ?? 10,
          include: { contact: { select: { displayName: true } } },
        });

        return textResult(
          (profiles as Array<{
            contactId: string;
            tier: string;
            lastInteractionAt: Date | null;
            weeklyMessageCount: number;
            contact: { displayName: string };
          }>).map((p) => ({
            contactId: p.contactId,
            contactName: p.contact.displayName,
            tier: p.tier,
            lastInteractionAt: p.lastInteractionAt?.toISOString() ?? null,
            weeklyMessageCount: p.weeklyMessageCount,
          })),
        );
      },
    };
  }

  private buildSearchMessages(): AgentTool<AnySchema> {
    return {
      name: 'search_messages',
      label: '搜索消息',
      description: '搜索某对话的历史消息（关键词/时间范围）',
      parameters: {
        type: 'object',
        properties: {
          converseId: { type: 'string' },
          keyword: { type: 'string' },
          limit: { type: 'number', description: '返回条数，默认 20' },
        },
        required: ['converseId'],
      } as unknown as AnySchema,
      execute: async (
        _toolCallId: string,
        params: { converseId: string; keyword?: string; limit?: number },
      ): Promise<AgentToolResult<unknown>> => {
        const messages = await this.prisma.message.findMany({
          where: {
            converseId: params.converseId,
            deletedAt: null,
            ...(params.keyword != null
              ? { content: { contains: params.keyword, mode: 'insensitive' } }
              : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: params.limit ?? 20,
          select: {
            id: true,
            content: true,
            createdAt: true,
            author: { select: { displayName: true } },
          },
        });

        return textResult(
          (messages as Array<{
            id: string;
            content: string | null;
            createdAt: Date;
            author: { displayName: string };
          }>)
            .reverse()
            .map((m) => ({
              id: m.id,
              author: m.author.displayName,
              content: m.content,
              createdAt: m.createdAt.toISOString(),
            })),
        );
      },
    };
  }

  private buildSendNudge(userId: string): AgentTool<AnySchema> {
    return {
      name: 'send_nudge',
      label: '发送关系提醒',
      description: '向 Supervisor Bot 对话推送关系提醒卡片',
      parameters: {
        type: 'object',
        properties: {
          contactId: { type: 'string' },
          message: { type: 'string', description: '提醒内容，简洁，中文' },
          reason: { type: 'string', description: 'silence | cooling | pending_reply' },
        },
        required: ['contactId', 'message', 'reason'],
      } as unknown as AnySchema,
      execute: async (
        _toolCallId: string,
        params: { contactId: string; message: string; reason: string },
      ): Promise<AgentToolResult<unknown>> => {
        const supervisorConverse =
          await this.botsService.getOrCreateSupervisorConverse(userId);

        this.broadcastService.toRoom(`u-${userId}`, 'bot:message', {
          converseId: supervisorConverse.id,
          type: 'NUDGE_CARD',
          contactId: params.contactId,
          message: params.message,
          reason: params.reason,
          createdAt: new Date().toISOString(),
        });

        return textResult({ sent: true, converseId: supervisorConverse.id });
      },
    };
  }
}
