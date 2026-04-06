# Server — NestJS Backend

NestJS 11, Node 22+, TypeScript 5.7+. Entry: `src/main.ts`, base URL: `http://localhost:3008/api/v1`.

## Commands

```bash
pnpm dev          # nest start --watch (port 3008)
pnpm build        # nest build
pnpm test         # jest (all server tests)
pnpm test --watch # jest watch mode
```

Run from repo root with filter: `pnpm --filter @linkingchat/server <cmd>`

## Module Structure

```
src/
├── auth/           # JWT RS256 login/register/refresh + guards
├── users/          # User CRUD + profile
├── profile/        # Extended profile (avatar, display name)
├── devices/        # Device registration + heartbeat
├── friends/        # Friend requests + friendship + blocks
├── converses/      # Conversation containers (DIRECT/GROUP/BOT)
├── messages/       # Message CRUD + bot recipient detection
├── mentions/       # @ai mention routing (Whisper vs Supervisor)
├── bots/           # Bot CRUD + reply persistence
├── gateway/        # Socket.IO gateways (/chat, /device) + BroadcastService
├── agents/         # Agent framework (orchestrator, supervisor, batch-trigger)
├── ai/             # LLM routing, Whisper, Draft, Predictive services
├── openclaw/       # Gateway Manager (multi-tenant, ports 18790-18889)
├── commands/       # Shell command queue
├── upload/         # MinIO S3 file storage
├── mail/           # MailDev email + verification codes
├── metrics/        # Prometheus metrics
├── redis/          # Redis client module
├── prisma/         # PrismaService (singleton)
└── common/         # Interceptors, guards shared across modules
```

## Key Patterns

**Testing:** Tests live in `<module>/__tests__/` — except `messages.service.spec.ts` which is directly in `messages/`.

**BroadcastService:** Use `BroadcastService` (not direct socket emit) to send events to clients. It validates payloads in dev mode against `@linkingchat/ws-protocol` Zod schemas.

**Bot dispatch flow:**
```
MessagesService.detectBotRecipient()
  → EventEmitter2.emit('agent.dispatch', ...)
  → BotEventListener.handleAgentDispatch()
  → AgentOrchestratorService.dispatchEvent()
  → SupervisorAgent (botId: 'supervisor-bot') or registered agent
```

**@ai mention routing:**
- GROUP converse → dispatch to SupervisorAgent
- DIRECT/BOT converse → Whisper suggestion

**Guard order:** `JwtAuthGuard` → `EmailVerifiedGuard` → controller handler.

## Environment Variables

Required in `apps/server/.env`:
```
DATABASE_URL=postgresql://user:pass@localhost:5440/linkingchat
REDIS_URL=redis://localhost:6387
JWT_PRIVATE_KEY=<base64 RS256 private key>
JWT_PUBLIC_KEY=<base64 RS256 public key>
DEEPSEEK_API_KEY=...
KIMI_API_KEY=...
MINIO_ENDPOINT=localhost
MINIO_PORT=9008
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
```
