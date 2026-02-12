# LinkingChat

> "Cloud Brain + Local Hands" — AI-native social app with remote desktop control

## Project Overview

LinkingChat (codename: Ghost Mate) is a standalone messaging platform (similar to Discord/Telegram) with deep integration of [OpenClaw](https://github.com/openclaw/openclaw) remote-control capabilities. It is **not** a wrapper around existing apps — it is an independent social application.

**Dual functionality:**
- **Social**: Chat, groups, friends — a full messaging platform
- **Remote Control**: Cloud-integrated OpenClaw commands desktop workers to execute tasks (shell, file ops, automation)

**AI-native features:**
- Draft & Verify — bot generates drafts, user confirms before sending
- The Whisper — smart reply suggestions in <800ms
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
| Cloud Backend | NestJS + Prisma + PostgreSQL |
| Desktop Client | Electron + TypeScript |
| Mobile App | Flutter (or React Native Expo) |
| Real-time | Socket.IO + Redis adapter |
| AI/LLM | Multi-provider routing (DeepSeek / Kimi 2.5) |
| Remote Control | OpenClaw (MIT) |
| Monorepo | Turborepo + pnpm workspace |
| Testing | Vitest |

## Documentation

### Decisions & Requirements
- [Project Brief](./docs/decisions/project-brief.md) — Strategic vision v2.0
- [Tech Decisions v2](./docs/decisions/tech-decisions-v2.md) — Comprehensive tech decisions
- [Decision Checklist](./docs/decisions/decision-checklist.md) — Team confirmed decisions
- [User Stories](./docs/decisions/user-stories.md) — BDD acceptance criteria
- [Follow-up Q&A v1](./docs/decisions/follow-up-questions.md) / [v2](./docs/decisions/follow-up-questions-v2.md) — Architect Q&A

### Development Plan
- [Reference Architecture Guide](./docs/dev-plan/reference-architecture-guide.md) — **Core dev guide** (Prisma schema, WebSocket, Auth, full patterns)
- [Project Skeleton](./docs/dev-plan/project-skeleton.md) — Monorepo structure & module design
- [Sprint 1 Plan](./docs/dev-plan/sprint-1-plan.md) — Minimal PoC implementation plan
- [WebSocket Protocol](./docs/dev-plan/websocket-protocol.md) — Protocol design
- [Database Schema](./docs/dev-plan/database-schema.md) — Entity design
- [Dev Environment Setup](./docs/dev-plan/dev-environment-setup.md) — Setup guide

### Research
- [Fork vs Build Analysis](./docs/research/fork-vs-build-analysis.md) — Open-source project evaluation
- [Tech Route Comparison](./docs/research/tech-route-final-comparison.md) — Route A (Fork Tailchat) vs Route C (Self-build)
- [Research Report](./docs/research/research-report.md) — Technical research overview
- [Detailed Project Analysis](./docs/research/research-projects-detailed.md) — Reference project deep dive
- [IM Protocols](./docs/research/research-im-protocols.md) — Open-source IM protocol research
- [Tinode Research](./docs/research/research-tinode.md) — Tinode Chat analysis
- [Gemini Projects](./docs/research/research-gemini-projects.md) — Tailchat, Dendrite, Conduit, Matrix evaluation

## First Milestone

> 手机 App 发送一个干活的指令给电脑端，电脑直接干活并且将任务交付，发回给手机端回复已经做完任务

Mobile sends a work command → Desktop executes → Desktop reports completion back to mobile.

## Status

**Pre-development / design phase.** No implementation code yet. Architecture and tech decisions are finalized. Next step: Sprint 1 PoC.

## License

MIT
