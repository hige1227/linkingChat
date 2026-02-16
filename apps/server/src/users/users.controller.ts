import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PresenceService } from '../gateway/presence.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly presenceService: PresenceService) {}

  /**
   * GET /api/v1/users/online?ids=userId1,userId2,userId3
   *
   * 批量查询用户在线状态
   */
  @Get('online')
  async getOnlineStatuses(
    @Query('ids') ids: string,
  ): Promise<Record<string, string>> {
    if (!ids || ids.trim().length === 0) {
      throw new BadRequestException('Query parameter "ids" is required');
    }

    const userIds = ids
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (userIds.length === 0) {
      throw new BadRequestException('At least one user ID is required');
    }

    if (userIds.length > 200) {
      throw new BadRequestException('Maximum 200 user IDs per request');
    }

    const statuses = await this.presenceService.getStatuses(userIds);
    return Object.fromEntries(statuses);
  }
}
