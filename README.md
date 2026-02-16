# LinkingChat

> "Cloud Brain + Local Hands" — AI-native social app with remote desktop control

## Project Overview

LinkingChat (codename: Ghost Mate) is a standalone messaging platform (similar to Discord/Telegram) with deep integration of [OpenClaw](https://github.com/openclaw/openclaw) remote-control capabilities. It is **not** a wrapper around existing apps — it is an independent social application.

**Dual functionality:**
- **Social**: Chat, groups, friends — a full messaging platform
- **Remote Control**: Cloud-integrated OpenClaw commands desktop workers to execute tasks (shell, file ops, automation)

**AI-native features:**
- Draft & Verify — bot generates drafts, user confirms before sending
- The Whisper — smart reply suggestions via `@ai`
- Predictive Actions — bot anticipates next steps from context

## Architecture

```
Flutter Mobile App  <--WSS-->  Cloud Brain (NestJS)  <--WSS-->  Electron Desktop Client
  (Controller)                   ├── WebSocket Gateway               ├── Social UI (chat)
  ├── Social UI                  ├── Intent Planner                  ├── OpenClaw Worker
  ├── Send commands              ├── LLM Router                      ├── Shell Exec
  └── Confirm drafts             ├── Draft State Machine             ├── File IO
                                 └── OpenClaw Integration            └── Local task execution
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Cloud Backend | NestJS 11 + Prisma 6 + PostgreSQL 16 |
| Desktop Client | Electron 35 + electron-vite 3 + React 19 |
| Mobile App | Flutter (Dart) |
| Real-time | Socket.IO + Redis 7 adapter |
| AI/LLM | Multi-provider routing (DeepSeek / Kimi 2.5) |
| Remote Control | OpenClaw (MIT) |
| Monorepo | Turborepo v2 + pnpm 10 workspace |
| Testing | Jest |
| File Storage | MinIO (S3-compatible) |

## Status

| Sprint | Description | Status |
|--------|-------------|--------|
| Sprint 0 | Infrastructure setup (monorepo, Docker, Prisma, CI) | ✅ Done |
| Sprint 1 | Auth (JWT RS256) + device registration + WS gateway + shell exec | ✅ Done |
| Sprint 2 | Friends, 1-on-1 chat, presence, bots, group chat, full UI | ✅ Done |
| Sprint 3 | AI module + OpenClaw integration + enhancements | 🔧 In progress |
| Sprint 4 | Polish + production readiness | Planned |

**Current stats:** 12 Prisma models, 7 test suites (102 tests), ~90 source files from Sprint 2 alone

## Quick Start

```bash
# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL, Redis, MinIO, etc.)
pnpm docker:up

# Run database migrations
pnpm --filter @linkingchat/server prisma migrate dev

# Start development servers
pnpm dev:server    # NestJS on http://localhost:3008/api/v1
pnpm dev:desktop   # Electron desktop client
pnpm dev:mobile    # Flutter mobile app (requires Flutter SDK)

# Run tests
pnpm test

# Build all packages
pnpm build
```

### Port Scheme

All ports offset +8 to avoid conflicts:

| Service | Port |
|---------|------|
| NestJS API | 3008 |
| PostgreSQL | 5440 |
| Redis | 6387 |
| MinIO | 9008 |
| MinIO Console | 9009 |
| Adminer | 8088 |
| MailDev | 1088 |

## Documentation

### Decisions & Requirements
- [Project Brief](./docs/decisions/project-brief.md) — Strategic vision v2.0
- [Tech Decisions v2](./docs/decisions/tech-decisions-v2.md) — Comprehensive tech decisions
- [Decision Checklist](./docs/decisions/decision-checklist.md) — Team confirmed decisions
- [User Stories](./docs/decisions/user-stories.md) — BDD acceptance criteria

### Development Plan
- [Reference Architecture Guide](./docs/dev-plan/reference-architecture-guide.md) — **Core dev guide** (Prisma schema, WebSocket, Auth, full patterns)
- [Project Skeleton](./docs/dev-plan/project-skeleton.md) — Monorepo structure & module design
- [WebSocket Protocol](./docs/dev-plan/websocket-protocol.md) — Protocol design
- [Database Schema](./docs/dev-plan/database-schema.md) — Entity design
- [Dev Environment Setup](./docs/dev-plan/dev-environment-setup.md) — Setup guide

### Sprint Implementation
- [Sprint 0](./docs/dev/sprint0_implement.md) — Infrastructure setup (✅ Done)
- [Sprint 1](./docs/dev/sprint1_implement.md) — Auth + device + WS + shell exec (✅ Done)
- [Sprint 2](./docs/dev/sprint2_implement.md) — Friends, chat, bots, groups, UI (✅ Done)
- [Sprint 3](./docs/dev/sprint3_implement.md) — AI module + OpenClaw + enhancements (🔧 Next)
- [Sprint 4](./docs/dev/sprint4_implement.md) — Polish + production readiness

### Research
- [Fork vs Build Analysis](./docs/research/fork-vs-build-analysis.md) — Open-source project evaluation
- [Tech Route Comparison](./docs/research/tech-route-final-comparison.md) — Route A (Fork Tailchat) vs Route C (Self-build)
- [Research Report](./docs/research/research-report.md) — Technical research overview

## First Milestone ✅

> 手机 App 发送一个干活的指令给电脑端，电脑直接干活并且将任务交付，发回给手机端回复已经做完任务

Mobile sends a work command → Desktop executes → Desktop reports completion back to mobile. **Achieved in Sprint 1.**

## License

MIT
