/**
 * OpenClaw & Hermes configuration — single source of truth.
 *
 * All version-sensitive constants live here. Upgrade procedure:
 * 1. Test the new openclaw/hermes release in isolation
 * 2. Update the constants below
 * 3. Run `pnpm type-check && pnpm test` to verify nothing broke
 * 4. Ship the desktop update to clients
 *
 * NEVER scatter these values across service files.
 */

// ── OpenClaw Gateway (local sidecar) ──

export const OPENCLAW_LOCAL = {
  port: 18789,
  bindHost: '127.0.0.1',
  /** CLI args passed to the sidecar process (before --port / --bind / --auth flags) */
  cliArgs: ['gateway', 'run', '--allow-unconfigured', '--dev'] as const,
  /** Relative path inside resources/ for the bundled production sidecar */
  sidecarPath: 'openclaw-sidecar/node_modules/openclaw/openclaw.mjs',
  /** Relative path to bundled Node.js runtime inside resources/ */
  nodeExePath: 'openclaw-sidecar/node.exe',
} as const;

// ── OpenClaw WS Protocol ──

export const OPENCLAW_PROTOCOL = {
  version: 3,
  clientId: 'gateway-client',
  role: 'operator' as const,
  mode: 'backend' as const,
  scopes: ['operator.read', 'operator.write'] as const,
  caps: ['tool-events'] as const,
  /** Device signature payload version (field 0 of the signed payload string) */
  devicePayloadVersion: 'v2' as const,
  /** Session key prefix used by resetSession */
  sessionPrefix: 'agent:main:',
  /** WS close code that signals device pairing is required */
  wsCloseCodePairingRequired: 1008,
} as const;

// ── Hermes local AI agent ──

export const HERMES_CONFIG = {
  port: 8765,
  baseUrl: 'http://127.0.0.1:8765',
  api: {
    chat: '/v1/chat/completions',
    health: '/health',
  },
  model: 'hermes-agent',
  /** SSE stream terminator sent by Hermes */
  sseEndMarker: '[DONE]',
} as const;
