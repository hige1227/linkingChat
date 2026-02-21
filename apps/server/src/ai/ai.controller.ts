import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { LlmRouterService } from './services/llm-router.service';
import { DraftService } from './services/draft.service';
import { PredictiveService } from './services/predictive.service';

@Controller('ai')
export class AiController {
  constructor(
    private readonly llmRouter: LlmRouterService,
    private readonly draftService: DraftService,
    private readonly predictiveService: PredictiveService,
  ) {}

  /** GET /api/v1/ai/health — AI 模块健康检查 */
  @Get('health')
  health() {
    return {
      status: 'ok',
      providers: ['deepseek', 'kimi'],
    };
  }

  // ──────────────────────────────────────
  // Test-only endpoints (dev environment)
  // ──────────────────────────────────────

  /**
   * POST /api/v1/ai/test/draft
   * 手动触发草稿生成（测试用）
   */
  @Post('test/draft')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async testDraft(
    @CurrentUser('userId') userId: string,
    @Body()
    body: {
      converseId: string;
      botId: string;
      botName: string;
      draftType: 'message' | 'command';
      userIntent: string;
    },
  ) {
    const draftId = await this.draftService.createDraft({
      userId,
      converseId: body.converseId,
      botId: body.botId,
      botName: body.botName,
      draftType: body.draftType,
      userIntent: body.userIntent,
    });
    return { draftId };
  }

  /**
   * POST /api/v1/ai/test/draft/approve
   * 手动批准草稿（测试用）
   */
  @Post('test/draft/approve')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async testDraftApprove(
    @CurrentUser('userId') userId: string,
    @Body() body: { draftId: string },
  ) {
    const content = await this.draftService.approveDraft(userId, body.draftId);
    return { status: 'APPROVED', content };
  }

  /**
   * POST /api/v1/ai/test/draft/reject
   * 手动拒绝草稿（测试用）
   */
  @Post('test/draft/reject')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async testDraftReject(
    @CurrentUser('userId') userId: string,
    @Body() body: { draftId: string; reason?: string },
  ) {
    await this.draftService.rejectDraft(userId, body.draftId, body.reason);
    return { status: 'REJECTED' };
  }

  /**
   * POST /api/v1/ai/test/predictive
   * 手动触发预测分析（测试用）
   */
  @Post('test/predictive')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async testPredictive(
    @CurrentUser('userId') userId: string,
    @Body()
    body: {
      converseId: string;
      errorOutput: string;
    },
  ) {
    const category = this.predictiveService.detectTrigger(body.errorOutput);
    if (!category) {
      return { triggered: false, category: null };
    }

    // Fire-and-forget (same as production), but we return the category
    this.predictiveService.analyzeTrigger({
      userId,
      converseId: body.converseId,
      triggerOutput: body.errorOutput,
      triggerCategory: category,
    });

    return { triggered: true, category };
  }
}
