import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ConversesService } from './converses.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { AddMembersDto } from './dto/add-members.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

@Controller('converses')
@UseGuards(JwtAuthGuard)
export class ConversesController {
  constructor(private readonly conversesService: ConversesService) {}

  /**
   * GET /api/v1/converses
   * 返回当前用户的所有打开会话 + 未读计数 + 最后消息预览
   */
  @Get()
  findAll(@CurrentUser('userId') userId: string) {
    return this.conversesService.findUserConverses(userId);
  }

  // ──────────────────────────────────────
  // Group Endpoints
  // ──────────────────────────────────────

  /**
   * POST /api/v1/converses/groups
   */
  @Post('groups')
  createGroup(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateGroupDto,
  ) {
    return this.conversesService.createGroup(userId, dto);
  }

  /**
   * PATCH /api/v1/converses/groups/:converseId
   */
  @Patch('groups/:converseId')
  updateGroup(
    @CurrentUser('userId') userId: string,
    @Param('converseId') converseId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.conversesService.updateGroup(userId, converseId, dto);
  }

  /**
   * DELETE /api/v1/converses/groups/:converseId
   */
  @Delete('groups/:converseId')
  deleteGroup(
    @CurrentUser('userId') userId: string,
    @Param('converseId') converseId: string,
  ) {
    return this.conversesService.deleteGroup(userId, converseId);
  }

  /**
   * POST /api/v1/converses/groups/:converseId/members
   */
  @Post('groups/:converseId/members')
  addMembers(
    @CurrentUser('userId') userId: string,
    @Param('converseId') converseId: string,
    @Body() dto: AddMembersDto,
  ) {
    return this.conversesService.addMembers(userId, converseId, dto);
  }

  /**
   * DELETE /api/v1/converses/groups/:converseId/members/:memberId
   */
  @Delete('groups/:converseId/members/:memberId')
  removeMember(
    @CurrentUser('userId') userId: string,
    @Param('converseId') converseId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.conversesService.removeMember(userId, converseId, memberId);
  }

  /**
   * POST /api/v1/converses/groups/:converseId/leave
   */
  @Post('groups/:converseId/leave')
  leaveGroup(
    @CurrentUser('userId') userId: string,
    @Param('converseId') converseId: string,
  ) {
    return this.conversesService.leaveGroup(userId, converseId);
  }

  /**
   * PATCH /api/v1/converses/groups/:converseId/members/:memberId/role
   */
  @Patch('groups/:converseId/members/:memberId/role')
  updateMemberRole(
    @CurrentUser('userId') userId: string,
    @Param('converseId') converseId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.conversesService.updateMemberRole(
      userId,
      converseId,
      memberId,
      dto,
    );
  }
}
