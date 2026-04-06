# ws-protocol — Shared WebSocket Types

Shared TypeScript types and Zod validators for Socket.IO events. Used by both `server` and `desktop`.

## Purpose

Single source of truth for all WebSocket event names, payload shapes, and runtime validators. Prevents client/server drift.

## Structure

```
src/
├── events.ts       # Event name constants (CLIENT_EVENTS, SERVER_EVENTS)
├── payloads/       # Typed payload interfaces per event
├── validators.ts   # EVENT_VALIDATORS: Record<eventName, ZodSchema>
├── typed-socket.ts # TypedSocket wrapper for type-safe emit/on
└── index.ts        # Re-exports everything
```

## Usage

```typescript
// Server (BroadcastService validates against these in dev mode)
import { EVENT_VALIDATORS, SERVER_EVENTS } from '@linkingchat/ws-protocol';

// Desktop (typed socket)
import { TypedSocket, CLIENT_EVENTS } from '@linkingchat/ws-protocol';
```

## Adding a New Event

1. Add event name to `events.ts`
2. Add payload interface to `payloads/`
3. Add Zod schema to `validators.ts`
4. Re-export from `index.ts`
5. Run `pnpm check-ws-coverage` from repo root to verify coverage

## Build

```bash
pnpm build   # tsc (outputs to dist/)
```

This package must build successfully before server/desktop tests run.
