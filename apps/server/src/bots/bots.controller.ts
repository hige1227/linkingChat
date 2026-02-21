import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BotsService } from './bots.service';
import { BotCommunicationService } from './bot-communication.service';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';

@Controller('bots')
@UseGuards(JwtAuthGuard)
export class BotsController {
  constructor(
    private readonly botsService: BotsService,
    private readonly botCommService: BotCommunicationService,
  ) {}

  /** POST /api/v1/bots — 创建 Bot（自动创建关联 User） */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateBotDto,
  ) {
    return this.botsService.create(userId, dto);
  }

  /** GET /api/v1/bots — 当前用户的 Bot 列表 */
  @Get()
  findAll(@CurrentUser('userId') userId: string) {
    return this.botsService.findByOwner(userId);
  }

  /** GET /api/v1/bots/:id — Bot 详情 */
  @Get(':id')
  findOne(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.botsService.findOne(id, userId);
  }

  /** PATCH /api/v1/bots/:id — 更新 Bot 配置 */
  @Patch(':id')
  update(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBotDto,
  ) {
    return this.botsService.update(id, userId, dto);
  }

  /** DELETE /api/v1/bots/:id — 删除 Bot（需 isDeletable=true） */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.botsService.delete(id, userId);
  }

  // ──────────────────────────────────────
  // Test-only endpoints (dev environment)
  // ──────────────────────────────────────

  /** POST /api/v1/bots/test/cross-notify — 测试 Bot 互通 */
  @Post('test/cross-notify')
  @HttpCode(HttpStatus.OK)
  async testCrossNotify(
    @CurrentUser('userId') userId: string,
    @Body()
    body: {
      fromBotId: string;
      toBotId: string;
      content: string;
      reason: string;
    },
  ) {
    const result = await this.botCommService.sendBotMessage({
      fromBotId: body.fromBotId,
      toBotId: body.toBotId,
      userId,
      content: body.content,
      reason: body.reason,
    });
    return result ?? { messageId: null, error: 'Blocked by validation' };
  }

  /** POST /api/v1/bots/test/supervisor-route — 测试 Supervisor 路由 */
  @Post('test/supervisor-route')
  @HttpCode(HttpStatus.OK)
  async testSupervisorRoute(
    @CurrentUser('userId') userId: string,
    @Body() body: { userMessage: string },
  ) {
    const result = await this.botCommService.routeViaSupervisor({
      userId,
      userMessage: body.userMessage,
    });
    return result ?? { recommendedBotId: null, reason: 'No match' };
  }
}
