import {
  Controller,
  Get,
  Post,
  UseGuards,
  Req,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GatewayManagerService } from './gateway-manager.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * OpenClaw Gateway Management API
 *
 * Endpoints are strategy-agnostic — they work the same regardless of
 * OPENCLAW_MODE (single / per-user / pool).
 */
@Controller('openclaw')
@UseGuards(JwtAuthGuard)
export class OpenclawController {
  private readonly adminUserIds: Set<string>;

  constructor(
    private readonly gatewayManager: GatewayManagerService,
    private readonly configService: ConfigService,
  ) {
    const adminIds = this.configService.get<string>('ADMIN_USER_IDS', '');
    this.adminUserIds = new Set(
      adminIds
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    );
  }

  /**
   * Get Gateway connection info (for Desktop client).
   * Desktop sends JWT → gets back ws:// URL + token.
   */
  @Get('gateway/connect')
  async getConnectInfo(@Req() req: any) {
    // JwtAuthGuard already verified the token and populated req.user
    const userId = req.user?.userId || req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Invalid user token');
    }

    const info = await this.gatewayManager.acquire(userId);
    return { success: true, data: info };
  }

  /**
   * Acquire Gateway for the current user.
   */
  @Post('gateway/start')
  async startGateway(@Req() req: any) {
    const userId = req.user.userId || req.user.sub;
    const result = await this.gatewayManager.acquire(userId);
    return {
      success: true,
      data: { url: result.url, status: 'running' },
    };
  }

  /**
   * Release Gateway for the current user.
   */
  @Post('gateway/stop')
  async stopGateway(@Req() req: any) {
    const userId = req.user.userId || req.user.sub;
    await this.gatewayManager.release(userId);
    return { success: true, message: 'Gateway released' };
  }

  /**
   * Get Gateway health status for the current user.
   */
  @Get('gateway/status')
  async getGatewayStatus(@Req() req: any) {
    const userId = req.user.userId || req.user.sub;
    const healthy = await this.gatewayManager.health(userId);

    if (!healthy) {
      return {
        success: true,
        data: { running: false, status: 'unavailable' },
      };
    }

    const info = await this.gatewayManager.acquire(userId);
    return {
      success: true,
      data: { running: true, status: 'running', url: info.url },
    };
  }

  /**
   * Admin: check Gateway health.
   */
  @Get('admin/gateways')
  async getAdminStatus(@Req() req: any) {
    const userId = req.user.userId || req.user.sub;
    if (!this.adminUserIds.has(userId)) {
      throw new ForbiddenException('Admin access required');
    }

    const healthy = await this.gatewayManager.health(userId);
    return {
      success: true,
      data: { healthy },
    };
  }
}
