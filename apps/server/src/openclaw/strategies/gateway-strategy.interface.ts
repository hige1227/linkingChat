/**
 * Gateway Strategy Interface
 *
 * Abstracts OpenClaw Gateway deployment mode so the rest of the codebase
 * is decoupled from how Gateway instances are provisioned.
 *
 * Current implementations:
 *   - SingleContainerStrategy  (OPENCLAW_MODE=single)  — all users share one Docker container
 *
 * Planned implementations:
 *   - PerUserContainerStrategy (OPENCLAW_MODE=per-user) — one Docker container per user
 *   - PoolStrategy             (OPENCLAW_MODE=pool)     — N containers : M users
 *
 * To add a new mode:
 *   1. Create a class implementing GatewayStrategy in this directory
 *   2. Register it in gateway-manager.service.ts constructor switch
 *   3. Add the mode name to OPENCLAW_MODE env var docs
 */
export interface GatewayStrategy {
  /**
   * Acquire a Gateway connection for the given user.
   * Returns the WebSocket URL and auth token the client should use.
   *
   * For single mode: always returns the same shared container URL.
   * For per-user mode: would start/find a dedicated container.
   */
  acquire(userId: string): Promise<{ url: string; token: string }>;

  /**
   * Release a user's Gateway resources.
   * For single mode: no-op (shared container stays up).
   * For per-user mode: would stop the user's container.
   */
  release(userId: string): Promise<void>;

  /**
   * Check if the Gateway is healthy for the given user.
   */
  health(userId: string): Promise<boolean>;

  /**
   * Cleanup on module destroy.
   */
  destroy(): Promise<void>;
}
