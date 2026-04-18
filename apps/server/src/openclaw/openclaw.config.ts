/**
 * Server-side OpenClaw configuration — single source of truth.
 *
 * Upgrade procedure: update constants here, run tests, then release.
 * NEVER hardcode these values in service files.
 */

export const OPENCLAW_SERVER = {
  /** Default Gateway WS URL when OPENCLAW_GATEWAY_URL env is not set */
  defaultGatewayUrl: 'ws://127.0.0.1:18790',
  /** Fallback dev token — MUST be overridden by OPENCLAW_GATEWAY_TOKEN in production */
  devToken: 'lc_dev_token_change_me',
  /** Health check path appended to the HTTP form of the Gateway URL */
  healthPath: '/health',
} as const;
