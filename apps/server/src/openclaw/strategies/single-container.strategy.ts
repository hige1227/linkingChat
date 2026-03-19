import { Logger } from '@nestjs/common';
import type { GatewayStrategy } from './gateway-strategy.interface';

/**
 * Single Container Strategy
 *
 * All users share one OpenClaw Gateway Docker container.
 * The container is managed externally (docker-compose), not by this service.
 *
 * Config (env):
 *   OPENCLAW_GATEWAY_URL   — WebSocket URL  (default: ws://127.0.0.1:18790)
 *   OPENCLAW_GATEWAY_TOKEN — Auth token      (default: lc_dev_token_change_me)
 */
export class SingleContainerStrategy implements GatewayStrategy {
  private readonly logger = new Logger(SingleContainerStrategy.name);
  private readonly gatewayUrl: string;
  private readonly gatewayToken: string;

  constructor(gatewayUrl: string, gatewayToken: string) {
    this.gatewayUrl = gatewayUrl;
    this.gatewayToken = gatewayToken;
    this.logger.log(`Single container mode: ${this.gatewayUrl}`);
  }

  async acquire(_userId: string): Promise<{ url: string; token: string }> {
    return {
      url: this.gatewayUrl,
      token: this.gatewayToken,
    };
  }

  async release(_userId: string): Promise<void> {
    // No-op: shared container stays up regardless of individual users
  }

  async health(_userId: string): Promise<boolean> {
    try {
      // Probe the Gateway by attempting an HTTP connection.
      // OpenClaw Gateway is a WS server — it accepts TCP connections but may
      // return an empty HTTP response (curl exit 52). That's fine: if fetch()
      // doesn't throw, the process is listening and alive.
      const httpUrl = this.gatewayUrl
        .replace(/^wss:/, 'https:')
        .replace(/^ws:/, 'http:');

      await fetch(`${httpUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      // Any response (even empty / non-200) means the Gateway is reachable
      return true;
    } catch {
      // Connection refused / timeout → container not running
      return false;
    }
  }

  async destroy(): Promise<void> {
    // No-op: container lifecycle is managed by docker-compose
  }
}
