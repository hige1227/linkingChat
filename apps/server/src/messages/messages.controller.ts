import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  /**
   * POST /api/v1/messages
   * 发送消息 — 插入 DB + WS 广播
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60000, limit: 30 } }) // 30 messages per minute
  create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messagesService.create(userId, dto);
  }

  /**
   * GET /api/v1/messages/search?query=xxx&converseId=xxx&limit=20&offset=0
   * 消息搜索 — PostgreSQL 全文搜索 + ILIKE fallback
   */
  @Get('search')
  @Throttle({ default: { ttl: 60000, limit: 20 } }) // 20 searches per minute
  search(
    @CurrentUser('userId') userId: string,
    @Query('query') query: string,
    @Query('converseId') converseId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.messagesService.search(
      userId,
      query,
      converseId,
      limit ? parseInt(limit, 10) : 20,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  /**
   * GET /api/v1/messages?converseId=xxx&cursor=xxx&limit=35
   * 消息历史 — 游标分页
   */
  @Get()
  findByConverse(
    @CurrentUser('userId') userId: string,
    @Query('converseId') converseId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messagesService.findByConverse(
      userId,
      converseId,
      cursor,
      limit ? parseInt(limit, 10) : 35,
    );
  }

  /**
   * PATCH /api/v1/messages/:id
   * 编辑消息 — 仅作者可编辑
   */
  @Patch(':id')
  update(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMessageDto,
  ) {
    return this.messagesService.update(userId, id, dto);
  }

  /**
   * DELETE /api/v1/messages/:id
   * 撤回消息 — 软删除（设置 deletedAt）
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.messagesService.softDelete(userId, id);
  }
}
