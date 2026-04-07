import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BroadcastService } from '../../gateway/broadcast.service';
import { LlmRouterService } from './llm-router.service';
import type { WhisperSuggestionsPayload } from '@linkingchat/ws-protocol';

/** Whisper 建议结构 */
interface WhisperSuggestions {
  primary: string;
  alternatives: string[];
}

/**
 * Whisper Service
 *
 * 用户发送 @ai → 提取聊天上下文 → LLM 生成建议 → WS 推送。
 * - 1 个主推荐 + 2 个备选
 * - 使用 DeepSeek（低延迟优先）
 * - 超时 2 秒后放弃
 */
@Injectable()
export class WhisperService {
  private readonly logger = new Logger(WhisperService.name);

  /** @ai 建议生成超时（毫秒） */
  private readonly WHISPER_TIMEOUT = 2_000;

  /** 上下文窗口大小（最近 N 条消息） */
  private readonly CONTEXT_WINDOW = 20;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmRouter: LlmRouterService,
    private readonly broadcastService: BroadcastService,
  ) {}

  /**
   * 检测消息是否包含 @ai 触发词
   */
  isWhisperTrigger(content: string | null): boolean {
    if (!content) return false;
    return /(?<!\w)@ai\b/i.test(content);
  }

  /**
   * 处理 @ai 触发：生成建议并推送
   *
   * fire-and-forget，不阻塞消息发送
   */
  async handleWhisperTrigger(
    userId: string,
    converseId: string,
    messageId: string,
  ): Promise<void> {
    try {
      // 1. 提取上下文
      const context = await this.extractContext(converseId);

      // 2. 调用 LLM 生成建议（带超时）
      const suggestions = await this.generateSuggestions(context);
      if (!suggestions) {
        this.logger.warn(
          `Whisper timed out for message ${messageId} in converse ${converseId}`,
        );
        return;
      }

      // 3. 持久化
      const record = await this.prisma.aiSuggestion.create({
        data: {
          type: 'WHISPER',
          userId,
          converseId,
          messageId,
          suggestions: {
            primary: suggestions.primary,
            alternatives: suggestions.alternatives,
          },
        },
      });

      // 4. WS 推送到触发用户
      const payload: WhisperSuggestionsPayload = {
        suggestionId: record.id,
        converseId,
        messageId,
        primary: suggestions.primary,
        alternatives: suggestions.alternatives,
        createdAt: record.createdAt.toISOString(),
      };

      this.broadcastService.toRoom(
        `u-${userId}`,
        'ai:whisper:suggestions',
        payload,
      );

      this.logger.log(
        `Whisper suggestions sent to user ${userId} for message ${messageId}`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Whisper failed for message ${messageId}: ${msg}`,
      );
    }
  }

  /**
   * 处理客户端主动请求建议（发送前触发）
   * 与 handleWhisperTrigger 的区别：不需要 messageId，不依赖已发送的消息
   */
  async handleWhisperRequest(
    userId: string,
    converseId: string,
    prompt?: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `[handleWhisperRequest] START userId=${userId}, converseId=${converseId}, prompt=${prompt ?? '(none)'}`,
      );

      // 1. Extract context
      const context = await this.extractContext(converseId);
      this.logger.debug(
        `[handleWhisperRequest] Context extracted, length=${context.length}`,
      );

      // 2. Generate suggestions via LLM
      const suggestions = await this.generateSuggestions(context, prompt);
      if (!suggestions) {
        this.logger.warn(
          `[handleWhisperRequest] generateSuggestions returned null (LLM failed or timed out) for converse ${converseId}`,
        );
        return;
      }
      this.logger.debug(
        `[handleWhisperRequest] Suggestions generated: primary="${suggestions.primary.substring(0, 50)}..."`,
      );

      // 3. Persist to DB
      const record = await this.prisma.aiSuggestion.create({
        data: {
          type: 'WHISPER',
          userId,
          converseId,
          suggestions: {
            primary: suggestions.primary,
            alternatives: suggestions.alternatives,
          },
        },
      });
      this.logger.debug(
        `[handleWhisperRequest] Saved to DB, id=${record.id}`,
      );

      // 4. Broadcast to user
      const payload: WhisperSuggestionsPayload = {
        suggestionId: record.id,
        converseId,
        primary: suggestions.primary,
        alternatives: suggestions.alternatives,
        createdAt: record.createdAt.toISOString(),
      };

      this.broadcastService.toRoom(
        `u-${userId}`,
        'ai:whisper:suggestions',
        payload,
      );

      this.logger.log(
        `[handleWhisperRequest] DONE — suggestions broadcast to u-${userId}`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[handleWhisperRequest] FAILED: ${msg}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * 用户采纳建议
   */
  async acceptSuggestion(
    userId: string,
    suggestionId: string,
    selectedIndex: number,
  ): Promise<void> {
    await this.prisma.aiSuggestion.updateMany({
      where: {
        id: suggestionId,
        userId,
        status: 'PENDING',
      },
      data: {
        status: 'ACCEPTED',
        selectedIndex,
      },
    });

    this.logger.log(
      `Whisper suggestion ${suggestionId} accepted by ${userId} (index=${selectedIndex})`,
    );
  }

  /**
   * 提取聊天上下文（最近 N 条消息）
   */
  async extractContext(converseId: string): Promise<string> {
    const messages = await this.prisma.message.findMany({
      where: {
        converseId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: this.CONTEXT_WINDOW,
      include: {
        author: {
          select: { displayName: true },
        },
      },
    });

    // 按时间正序排列
    messages.reverse();

    return messages
      .map((m) => `${m.author.displayName}: ${m.content ?? ''}`)
      .join('\n');
  }

  /**
   * 调用 LLM 生成 1 主推荐 + 2 备选
   *
   * 返回 null 表示超时或失败
   */
  async generateSuggestions(
    context: string,
    prompt?: string,
  ): Promise<WhisperSuggestions | null> {
    try {
      let userContent = `以下是聊天记录:\n\n${context}\n\n`;
      if (prompt) {
        userContent += `用户想要表达的意思: ${prompt}\n\n请根据聊天上下文，帮用户写出 3 条可以直接发送的消息。`;
      } else {
        userContent += `请根据上下文，帮用户写出 3 条可以直接发送的回复消息。`;
      }

      this.logger.debug(
        `[generateSuggestions] Calling LLM, context length=${context.length}, prompt=${prompt ?? '(none)'}`,
      );

      const response = await this.llmRouter.complete({
        taskType: 'whisper',
        systemPrompt: WHISPER_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: userContent,
          },
        ],
        maxTokens: 512,
        temperature: 0.8,
      });

      this.logger.debug(
        `[generateSuggestions] LLM response received, length=${response.content.length}`,
      );

      return this.parseSuggestions(response.content);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[generateSuggestions] LLM call failed: ${msg}`);
      return null;
    }
  }

  /**
   * 解析 LLM 输出为结构化建议
   */
  parseSuggestions(content: string): WhisperSuggestions {
    // Strip markdown code block wrapper if present (```json ... ```)
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned
        .replace(/^```(?:json)?\s*\n?/, '')
        .replace(/\n?```\s*$/, '')
        .trim();
    }

    // Try JSON parsing first
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed.primary && Array.isArray(parsed.alternatives)) {
        return {
          primary: String(parsed.primary),
          alternatives: parsed.alternatives
            .map(String)
            .filter((s: string) => s.length > 0)
            .slice(0, 2),
        };
      }
    } catch {
      // Fall through to line-based parsing
    }

    // Line-based parsing: first non-empty line = primary, next 2 = alternatives
    const lines = cleaned
      .split('\n')
      .map((l) => l.replace(/^[\d.)\-*]+\s*/, '').trim())
      .filter((l) => l.length > 0);

    return {
      primary: lines[0] || cleaned,
      alternatives: lines.slice(1, 3),
    };
  }
}

const WHISPER_SYSTEM_PROMPT = `你是一个聊天代笔助手。用户正在和别人聊天，需要你帮忙写回复。你生成的内容将直接作为用户发送的消息，不是给用户的建议或指导。

核心规则：
- 你生成的是用户要发出去的消息原文，不是"建议用户怎么说"
- 以用户的口吻写，像用户自己在说话
- 绝对不要出现"你可以说…""建议你…""试试…"这类元描述
- 契合对话的语境、语气和话题
- 简短自然（一般不超过 50 字）
- 3 条风格各异（例如：积极/随意/幽默）

输出格式（严格 JSON）：
{
  "primary": "最推荐的回复原文",
  "alternatives": ["备选回复原文1", "备选回复原文2"]
}

直接输出 JSON，不要包裹在 markdown 代码块中。`;
