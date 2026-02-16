# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

LinkingChat (codename: Ghost Mate) has completed **Sprint 0 (infrastructure setup)**. The monorepo skeleton is functional with NestJS server, Electron desktop client, and Flutter mobile project structure. Sprint 1 (authentication + device registration) is next.

### What's working:
- `pnpm install` — Turborepo v2 + pnpm 10 workspace (5 packages)
- `pnpm docker:up` — PostgreSQL:5440, Redis:6387, MinIO:9008, Adminer:8088, MailDev:1088
- `pnpm dev:server` — NestJS on http://localhost:3008/api/v1
- `pnpm dev:desktop` — Electron + electron-vite + React
- `pnpm build` — All 4 packages compile (server, desktop, shared, ws-protocol)
- `pnpm test` — 2 tests passing (AppController)
- Prisma migration applied (4 tables: users, devices, commands, refresh_tokens)

### Pending:
- Flutter SDK not yet installed — `apps/mobile/` has Dart source files ready, needs `flutter create .` for platform dirs

Technical decisions are in `docs/decisions/decision-checklist.md` and `docs/decisions/tech-decisions-v2.md`.

## What This Project IS

LinkingChat is a **new AI-native social app** (similar in form to Discord/Telegram/WhatsApp) with deep integration of OpenClaw remote-control capabilities. It is **NOT** about attaching to or automating existing apps like WeChat/Slack.

> Note: The original design docs (prd.md, architecture.md) have been archived to `docs/_archive/` — they describe a superseded "parasitic Desktop Bridge" direction.

**Dual functionality:**
1. **Social**: Chat, groups, friends — a standalone messaging platform
2. **Remote Control**: Cloud-integrated OpenClaw can command desktop workers to execute tasks (shell, file ops, automation)

**AI-native features:**
- Smart reply suggestions (The Whisper)
- Draft & Verify — bot generates drafts, user confirms before sending
- Predictive Actions — bot anticipates next steps from context (e.g., error → fix command)
- Proactive reminders and recommendations

## Architecture Overview

Three-tier distributed system: "Cloud Brain + Local Hands"

```
Flutter Mobile App  <--WSS-->  Cloud Brain (NestJS)  <--WSS-->  Electron Desktop Client
  (Controller)                   ├── WebSocket Gateway                 ├── Social UI (chat)
  ├── Social UI                  ├── Intent Planner                    ├── OpenClaw Worker
  ├── Send commands              ├── LLM Router                        ├── Shell Exec
  └── Confirm drafts             ├── Draft State Machine               ├── File IO
                                 └── OpenClaw Integration              └── Local task execution
```

- **Mobile App (Flutter)**: Social interface + remote command issuer. iOS & Android from one codebase.
- **Cloud Brain (NestJS / TypeScript)**: WebSocket gateway, intent planning, LLM inference with multi-provider routing (cheap models like DeepSeek for simple tasks, powerful models like Kimi 2.5 for complex tasks). Hosts all Agent logic.
- **Desktop Client (Electron + Node.js/TypeScript)**: Full GUI social client (like Discord desktop) + local OpenClaw worker that receives and executes remote commands.

## Confirmed Tech Decisions

| Decision | Choice |
|---|---|
| Implementation strategy | Full-chain minimal PoC (all 3 components simultaneously) |
| Language | TypeScript everywhere |
| Cloud framework | NestJS 11 (Node.js 22+ / TypeScript 5.7+) |
| Mobile framework | Flutter (Dart) |
| Desktop framework | Electron 35 + electron-vite 3 + React 19 |
| Database | PostgreSQL 16 + Prisma 6 ORM |
| Cache/PubSub | Redis 7 |
| File storage | MinIO (S3-compatible) |
| Repo structure | Turborepo v2 monorepo with pnpm 10 workspaces |
| LLM | Multi-provider with routing (DeepSeek for cheap, Kimi 2.5 for complex) |
| WebSocket | Socket.IO with typed events (@linkingchat/ws-protocol) |
| Auth | JWT RS256 asymmetric keys (access + refresh token pair) |
| Testing | Jest (unit tests from day one) |
| CI | GitHub Actions (lint + type-check + test) |
| Dev platform priority | Both macOS and Windows; macOS first if forced to choose |
| Port scheme | All +8 to avoid conflicts (NestJS:3008, PG:5440, Redis:6387, etc.) |

## First Milestone

> "手机 App 发送一个干活的指令给电脑端，电脑直接干活并且将任务交付，发回给手机端回复已经做完任务"

Mobile sends a work command → Desktop executes → Desktop reports completion back to mobile.

## Three Core Interaction Patterns

1. **Draft & Verify (代理草稿)** [P0]: User sends intent → bot generates draft → user confirms before execution. Bot **never** acts autonomously.
2. **The Whisper (耳语建议)** [P1]: User triggers via `@ai` → cloud generates 1 best reply (pre-filled in input) + `···` to expand 2 alternatives. Auto-push chips **rejected** (too generic). Ghost text completion planned for v2+ (local small model).
3. **Predictive Actions (预测执行)** [P0]: Bot analyzes context (e.g., shell errors) → generates action card → dangerous commands blocked or flagged.

## Performance Targets

- Message mirror latency: <2 seconds
- Remote action execution: <3 seconds
- @ai reply generation: <2 seconds (user-triggered, has wait expectation)

## Mobile UI Direction

- WeChat/WhatsApp style, less is more
- Bot = fixed pinned system contact (like WeChat "File Transfer Assistant")
- Multi-bot framework from MVP, but only remote execution capability initially
- Each bot maps to an OpenClaw agent config

## Multi-Bot Architecture

- MVP: bot CRUD + routing framework, only remote execution capability
- Auto-create on registration: Supervisor Bot (pinned, undeletable) + Coding Bot (pinned, configurable)
- v1.x: add bot types per demand (social media, data analysis, etc.)
- v2.0: open custom bot creation
- Supervisor Bot = notification aggregator + smart concierge (not the only entry point)
- Supervisor chat UI: normal chat flow + BOT_NOTIFICATION cards (no tabs)

## Bot Communication Rules

- All bots can communicate with each other (OpenClaw multi-agent orchestration)
- Each bot notifies user in its own chat window
- Cross-bot triggered messages MUST indicate trigger source (e.g., "[From Coding Bot]")
- Supervisor aggregates all bot events as notification cards
- Draft & Verify still applies: bots cannot auto-execute actions
- In group chats: bots can be added as members (Telegram model), @specificBot for direct call, @ai = Supervisor fallback

## Backend: NestJS Confirmed, Rust Rejected (2026-02-13)

Scalability through architecture (horizontal scaling + Redis + Nginx LB), not language. Rust reconsidered only if data shows specific hot-path bottlenecks post-product-validation.

## Documentation Map

```
docs/
├── decisions/                          # Strategic & technical decisions
│   ├── project-brief.md                — Strategic vision v2.0, core interaction patterns
│   ├── decision-checklist.md           — Team's confirmed technical decisions
│   ├── follow-up-questions.md          — Architect follow-up questions v1
│   ├── follow-up-questions-v2.md       — Architect follow-up questions v2 with team answers
│   ├── tech-decisions-v2.md            — ★ Core: OpenClaw, IM protocol, scaffold, execution path
│   ├── zeroclaw-evaluation.md          — ZeroClaw vs OpenClaw evaluation (2026-02-16)
│   └── user-stories.md                 — BDD acceptance criteria
│
├── research/                           # Technical research & analysis
│   ├── research-report.md              — Technical research report for project references
│   ├── research-projects-detailed.md   — Detailed reference project analysis
│   ├── research-im-protocols.md        — Open source IM protocol/platform research
│   ├── research-tinode.md              — Tinode Chat deep-dive
│   ├── research-gemini-projects.md     — Gemini-recommended projects analysis
│   ├── fork-vs-build-analysis.md       — Fork Tailchat vs self-build evaluation
│   └── tech-route-final-comparison.md  — Route A (fork) vs Route C (build) final comparison
│
├── dev-plan/                           # Implementation plans & specs
│   ├── reference-architecture-guide.md — ★ "Copy homework" guide from Valkyrie/nestjs-chat/Tailchat
│   ├── project-skeleton.md             — Monorepo structure & module design
│   ├── sprint-1-plan.md                — Sprint 1 detailed plan (minimal PoC)
│   ├── websocket-protocol.md           — WebSocket protocol design
│   ├── database-schema.md              — Database entity design
│   └── dev-environment-setup.md        — Dev environment setup guide
│
├── dev/                                # Sprint implementation guides
│   ├── sprint0_implement.md            — ★ Sprint 0: Infrastructure setup (✅ DONE)
│   ├── sprint1_implement.md            — Sprint 1: Auth + device registration
│   ├── sprint1_phase1_server.md        — Sprint 1 Phase 1: Server core modules
│   ├── sprint1_phase2_desktop.md       — Sprint 1 Phase 2: Desktop client
│   ├── sprint1_phase3_mobile.md        — Sprint 1 Phase 3: Mobile client
│   ├── sprint1_phase4_integration.md   — Sprint 1 Phase 4: Integration testing
│   ├── sprint2_implement.md            — Sprint 2: Remote command execution
│   ├── sprint3_implement.md            — Sprint 3: AI integration (Whisper + Draft)
│   └── sprint4_implement.md            — Sprint 4: Polish + production readiness
│
└── _archive/                           # Superseded documents
    ├── architecture.md                 — Old "parasitic Desktop Bridge" direction
    ├── prd.md                          — Old product requirements
    └── gemini-research.md              — Original Gemini report (errors corrected in research/)
```

## Open Questions (Blocking)

Most blocking questions from v1 have been resolved in `docs/decisions/tech-decisions-v2.md`. Remaining:

- ~~**F1**: Scope of Desktop Bridge~~ → Resolved: OpenClaw Node as independent process
- ~~**F2**: What is OpenClaw?~~ → Resolved: Open-source AI Agent Gateway (TypeScript, MIT), see tech-decisions-v2.md §2
- ~~**F3**: "Control own desktop" vs "control friend's desktop"~~ → MVP: control own desktop
- ~~**F4**: MVP social feature boundary~~ → Resolved: All features except voice/video calls, see tech-decisions-v2.md §1.2
- **F7**: Electron desktop app positioning → **Social client + OpenClaw executor** (implied by architecture, needs explicit confirmation)
