import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FriendsService } from './friends.service';
import { SendFriendRequestDto } from './dto/send-request.dto';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  /** POST /api/v1/friends/request — 发送好友请求 */
  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  sendRequest(
    @CurrentUser('userId') userId: string,
    @Body() dto: SendFriendRequestDto,
  ) {
    return this.friendsService.sendRequest(userId, dto);
  }

  /** POST /api/v1/friends/accept/:requestId — 接受好友请求 */
  @Post('accept/:requestId')
  @HttpCode(HttpStatus.OK)
  acceptRequest(
    @Param('requestId') requestId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.friendsService.accept(userId, requestId);
  }

  /** POST /api/v1/friends/reject/:requestId — 拒绝好友请求 */
  @Post('reject/:requestId')
  @HttpCode(HttpStatus.OK)
  rejectRequest(
    @Param('requestId') requestId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.friendsService.reject(userId, requestId);
  }

  /** GET /api/v1/friends/requests — 待处理的好友请求 */
  @Get('requests')
  getPendingRequests(@CurrentUser('userId') userId: string) {
    return this.friendsService.getPendingRequests(userId);
  }

  /** GET /api/v1/friends — 好友列表 */
  @Get()
  getFriendList(@CurrentUser('userId') userId: string) {
    return this.friendsService.getFriendList(userId);
  }

  /** DELETE /api/v1/friends/:userId — 删除好友 */
  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  removeFriend(
    @Param('userId') targetUserId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.friendsService.removeFriend(userId, targetUserId);
  }

  /** POST /api/v1/friends/block/:userId — 拉黑用户 */
  @Post('block/:userId')
  @HttpCode(HttpStatus.OK)
  blockUser(
    @Param('userId') blockedId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.friendsService.blockUser(userId, blockedId);
  }
}
