import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { GatewayStrategy } from './strategies';
import { SingleContainerStrategy } from './strategies';

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
    // Initialize strategy based on mode
    const mode = this.configService.get<string>('OPENCLAW_MODE', 'single');
    this.strategy = this.createStrategy(mode);

    this.logger.log(`Gateway Manager initialized (mode: ${mode})`);
  }

  private createStrategy(mode: string): GatewayStrategy {
    switch (mode) {
      case 'single': {
        const url = this.configService.get<string>(
          'OPENCLAW_GATEWAY_URL',
          'ws://127.0.0.1:18790',
        );
        const token = this.configService.get<string>(
          'OPENCLAW_GATEWAY_TOKEN',
          'lc_dev_token_change_me',
        );
        return new SingleContainerStrategy(url, token);
      }

      // Future modes — uncomment and implement when needed:
      //
      // case 'per-user': {
      //   // One Docker container per user, dynamic port allocation
      //   // See: memory/openclaw-architecture.md for design notes
      //   return new PerUserContainerStrategy(this.configService);
      // }
      //
      // case 'pool': {
      //   // N containers : M users with consistent hashing
      //   // See: memory/openclaw-architecture.md for design notes
      //   return new PoolStrategy(this.configService);
      // }

      default:
        this.logger.warn(`Unknown OPENCLAW_MODE "${mode}", falling back to "single"`);
        const url = this.configService.get<string>(
          'OPENCLAW_GATEWAY_URL',
          'ws://127.0.0.1:18790',
        );
        const token = this.configService.get<string>(
          'OPENCLAW_GATEWAY_TOKEN',
          'lc_dev_token_change_me',
        );
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
