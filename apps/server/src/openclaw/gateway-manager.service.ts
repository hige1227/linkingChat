import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { GatewayStrategy } from './strategies';
import { SingleContainerStrategy } from './strategies';
import { OPENCLAW_SERVER } from './openclaw.config';

/**
 * Gateway Manager Service
 *
 * Delegates to a GatewayStrategy based on OPENCLAW_MODE env var.
 * The controller and consumers call this service — they never touch the strategy directly.
 *
 * Supported modes (OPENCLAW_MODE):
 *   "single"   — all users share one Docker container  (default, implemented)
 *   "per-user" — one container per user                (TODO)
 *   "pool"     — N containers : M users                (TODO)
 */
@Injectable()
export class GatewayManagerService implements OnModuleDestroy {
  private readonly logger = new Logger(GatewayManagerService.name);
  private readonly strategy: GatewayStrategy;

  constructor(private readonly configService: ConfigService) {
    const mode = this.configService.get<string>('OPENCLAW_MODE', 'single');
    this.strategy = this.createStrategy(mode);
    this.logger.log(`Gateway Manager initialized (mode: ${mode})`);
  }

  /**
   * Returns the gateway token.
   * In production, throws if OPENCLAW_GATEWAY_TOKEN is not set.
   * In development, falls back to the dev default.
   */
  private getRequiredToken(): string {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    const token = this.configService.get<string>('OPENCLAW_GATEWAY_TOKEN');

    if (isProduction && !token) {
      throw new Error('OPENCLAW_GATEWAY_TOKEN must be set in production');
    }

    return token ?? OPENCLAW_SERVER.devToken;
  }

  private createStrategy(mode: string): GatewayStrategy {
    switch (mode) {
      case 'single': {
        const url = this.configService.get<string>(
          'OPENCLAW_GATEWAY_URL',
          OPENCLAW_SERVER.defaultGatewayUrl,
        );
        const token = this.getRequiredToken();
        return new SingleContainerStrategy(url, token);
      }

      // Future modes — uncomment and implement when needed:
      //
      // case 'per-user': {
      //   // One Docker container per user, dynamic port allocation
      //   return new PerUserContainerStrategy(this.configService);
      // }
      //
      // case 'pool': {
      //   // N containers : M users with consistent hashing
      //   return new PoolStrategy(this.configService);
      // }

      default:
        this.logger.warn(
          `Unknown OPENCLAW_MODE "${mode}", falling back to "single"`,
        );
        const url = this.configService.get<string>(
          'OPENCLAW_GATEWAY_URL',
          OPENCLAW_SERVER.defaultGatewayUrl,
        );
        const token = this.getRequiredToken();
        return new SingleContainerStrategy(url, token);
    }
  }

  // ── Public API (consumed by controller & other modules) ──

  /**
   * Get Gateway connection info for a user.
   * In single mode, all users get the same URL/token.
   */
  async acquire(userId: string): Promise<{ url: string; token: string }> {
    return this.strategy.acquire(userId);
  }

  /**
   * Release a user's Gateway resources.
   */
  async release(userId: string): Promise<void> {
    return this.strategy.release(userId);
  }

  /**
   * Check Gateway health for a user.
   */
  async health(userId: string): Promise<boolean> {
    return this.strategy.health(userId);
  }

  /**
   * Module destroy hook — cleanup all strategy resources.
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down Gateway Manager...');
    await this.strategy.destroy();
  }
}
