import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BroadcastService } from '../../gateway/broadcast.service';
import { LlmRouterService } from './llm-router.service';
import type {
  PredictiveActionPayload,
  PredictiveAction,
  DangerLevel,
} from '@linkingchat/ws-protocol';

/** 上下文触发模式 */
interface ContextTrigger {
  pattern: RegExp;
  category: string;
}

/**
 * Predictive Actions Service
 *
 * 分析上下文（如 shell 错误输出）→ LLM 生成操作卡片 → 标注危险等级。
 * - 使用 DeepSeek（低延迟优先）
 * - dangerous 级别命令需通过 Draft & Verify
 */
@Injectable()
export class PredictiveService {
  private readonly logger = new Logger(PredictiveService.name);

  /** 危险命令黑名单 — 引用自 Sprint 1 DeviceGateway */
  private readonly DANGEROUS_PATTERNS: RegExp[] = [
    /^rm\s+(-rf?|--recursive)\s+\//,
    /^rm\s+-rf?\s+~/,
    /^format\s/i,
    /^mkfs\./,
    /^dd\s+if=/,
    /^:\(\)\{.*\|.*&\s*\}\s*;/,
    /shutdown|reboot|halt|poweroff/i,
    /^chmod\s+(-R\s+)?777\s+\//,
    /^chown\s+(-R\s+)?.*\s+\//,
    />\s*\/dev\/sd[a-z]/,
    /\|\s*bash\s*$/,
    /curl.*\|\s*sh/i,
  ];

  /** 上下文触发器模式（specific patterns first, generic last） */
  private readonly TRIGGERS: ContextTrigger[] = [
    { pattern: /npm ERR!|yarn error|pnpm ERR/i, category: 'package_error' },
    { pattern: /build failed|compile error|syntax error/i, category: 'build_error' },
    { pattern: /exception|traceback|stack trace/i, category: 'exception' },
    { pattern: /permission denied|access denied|EACCES/i, category: 'permission' },
    { pattern: /not found|no such file|ENOENT/i, category: 'not_found' },
    { pattern: /timeout|timed out|ETIMEDOUT/i, category: 'timeout' },
    { pattern: /ECONNREFUSED|ECONNRESET|connection refused/i, category: 'network' },
    { pattern: /\bErr(?:or)?[\s:!]|\bfailed\b|\bfailure\b/i, category: 'error' },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmRouter: LlmRouterService,
    private readonly broadcastService: BroadcastService,
  ) {}

  /**
   * 检测上下文是否触发预测分析
   */
  detectTrigger(output: string): string | null {
    for (const trigger of this.TRIGGERS) {
      if (trigger.pattern.test(output)) {
        return trigger.category;
      }
    }
    return null;
  }

  /**
   * 分析上下文并生成预测操作卡片
   *
   * 由设备执行结果返回错误时触发（fire-and-forget）
   */
  async analyzeTrigger(params: {
    userId: string;
    converseId: string;
    triggerOutput: string;
    triggerCategory: string;
  }): Promise<void> {
    try {
      // 1. 调用 LLM 生成操作建议
      const actions = await this.generateActions(
        params.triggerOutput,
        params.triggerCategory,
      );

      if (!actions || actions.length === 0) {
        this.logger.debug(
          `No predictive actions generated for category=${params.triggerCategory}`,
        );
        return;
      }

      // 2. 交叉验证危险等级
      const classifiedActions = actions.map((a) =>
        this.classifyDangerLevel(a),
      );

      // 3. 持久化
      const record = await this.prisma.aiSuggestion.create({
        data: {
          type: 'PREDICTIVE',
          userId: params.userId,
          converseId: params.converseId,
          suggestions: {
            trigger: params.triggerOutput.substring(0, 500),
            category: params.triggerCategory,
            actions: classifiedActions,
          } as any,
        },
      });

      // 4. WS 推送操作卡片
      const payload: PredictiveActionPayload = {
        suggestionId: record.id,
        converseId: params.converseId,
        trigger: params.triggerOutput.substring(0, 200),
        actions: classifiedActions,
        createdAt: record.createdAt.toISOString(),
      };

      this.broadcastService.toRoom(
        `u-${params.userId}`,
        'ai:predictive:action',
        payload,
      );

      this.logger.log(
        `Predictive actions sent to user ${params.userId}: ` +
          `${classifiedActions.length} actions for ${params.triggerCategory}`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Predictive analysis failed for ${params.triggerCategory}: ${msg}`,
      );
    }
  }

  /**
   * 用户选择执行某个预测操作 → 记录选择
   */
  async executeAction(
    userId: string,
    suggestionId: string,
    actionIndex: number,
  ): Promise<PredictiveAction | null> {
    const record = await this.prisma.aiSuggestion.findFirst({
      where: { id: suggestionId, userId },
    });

    if (!record) return null;

    const suggestions = record.suggestions as any;
    const action = suggestions?.actions?.[actionIndex];
    if (!action) return null;

    // 标记为 ACCEPTED
    await this.prisma.aiSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: 'ACCEPTED',
        selectedIndex: actionIndex,
      },
    });

    return action;
  }

  /**
   * 用户忽略预测建议
   */
  async dismissAction(
    userId: string,
    suggestionId: string,
  ): Promise<void> {
    await this.prisma.aiSuggestion.updateMany({
      where: { id: suggestionId, userId, status: 'PENDING' },
      data: { status: 'DISMISSED' },
    });

    this.logger.log(
      `Predictive suggestion ${suggestionId} dismissed by ${userId}`,
    );
  }

  /**
   * 调用 LLM 生成操作建议
   */
  private async generateActions(
    output: string,
    category: string,
  ): Promise<PredictiveAction[]> {
    const response = await this.llmRouter.complete({
      taskType: 'predictive',
      systemPrompt: PREDICTIVE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `错误类型: ${category}\n\n错误输出:\n${output.substring(0, 1000)}`,
        },
      ],
      maxTokens: 512,
      temperature: 0.3,
    });

    return this.parseActions(response.content);
  }

  /**
   * 解析 LLM 输出为操作列表
   */
  parseActions(content: string): PredictiveAction[] {
    try {
      const parsed = JSON.parse(content);
      const actions = Array.isArray(parsed) ? parsed : parsed.actions;

      if (!Array.isArray(actions)) return [];

      return actions
        .filter((a: any) => a.action && a.description)
        .slice(0, 5)
        .map((a: any) => ({
          type: (a.type as PredictiveAction['type']) || 'shell',
          action: String(a.action || a.command),
          description: String(a.description),
          dangerLevel: 'safe' as DangerLevel, // Will be overridden by classifyDangerLevel
        }));
    } catch {
      return [];
    }
  }

  /**
   * 使用黑名单交叉验证危险等级
   */
  classifyDangerLevel(action: PredictiveAction): PredictiveAction {
    if (action.type !== 'shell') {
      return { ...action, dangerLevel: 'safe' };
    }

    const cmd = action.action.trim();

    // 黑名单匹配 → dangerous
    if (this.isDangerousCommand(cmd)) {
      return { ...action, dangerLevel: 'dangerous' };
    }

    // Warning patterns (destructive but not catastrophic)
    if (this.isWarningCommand(cmd)) {
      return { ...action, dangerLevel: 'warning' };
    }

    return { ...action, dangerLevel: 'safe' };
  }

  /**
   * 判断是否为危险命令（引用 Sprint 1 黑名单）
   */
  isDangerousCommand(action: string): boolean {
    return this.DANGEROUS_PATTERNS.some((p) => p.test(action.trim()));
  }

  /**
   * 判断是否为警告级命令
   */
  isWarningCommand(action: string): boolean {
    const warningPatterns = [
      /^rm\s/,
      /^git\s+(reset|clean|checkout\s+--)/,
      /^npm\s+init/i,
      /^pip\s+install.*--force/i,
      /^docker\s+(rm|rmi|prune)/i,
      /^kill\s/,
      /^pkill\s/,
      /DROP\s+(TABLE|DATABASE)/i,
      /TRUNCATE\s/i,
    ];
    return warningPatterns.some((p) => p.test(action.trim()));
  }
}

const PREDICTIVE_SYSTEM_PROMPT = `你是一个开发运维助手。根据错误输出，生成可能的修复操作建议。

输出格式（严格 JSON 数组）：
[
  { "type": "shell", "action": "shell 命令", "description": "操作说明" },
  { "type": "shell", "action": "shell 命令", "description": "操作说明" }
]

要求：
- 最多生成 3 个建议
- type 可以是 "shell"、"message" 或 "file"
- action 是具体的操作内容
- description 用中文简要说明
- 从安全到激进排序（最安全的操作排在前面）
- 直接输出 JSON，不要包裹在 markdown 代码块中`;
