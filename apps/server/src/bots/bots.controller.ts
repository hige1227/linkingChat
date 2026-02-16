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
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';

@Controller('bots')
@UseGuards(JwtAuthGuard)
export class BotsController {
  constructor(private readonly botsService: BotsService) {}

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
}
