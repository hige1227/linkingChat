# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

LinkingChat (codename: Ghost Mate) has completed **Sprint 0–5**. The platform has a working NestJS server with auth, device control, friends, 1-on-1 & group chat, bots framework, AI modules (AgentOrchestrator + SupervisorAgent + LLM routing), email verification, password reset, voice messages, i18n, plus full Flutter mobile UI and Electron desktop UI.

### What's working:
- `pnpm install` — Turborepo v2 + pnpm 10 workspace (5 packages)
- `pnpm docker:up` — PostgreSQL:5440, Redis:6387, MinIO:9008, Adminer:8088, MailDev:1088
- `pnpm dev:server` — NestJS on http://localhost:3008/api/v1
- `pnpm dev:desktop` — Electron + electron-vite + React (full chat UI with group info panel)
- `pnpm dev:mobile` — Flutter mobile app (full chat UI, friends, groups, device control)
- `pnpm build` — All 4 packages compile (server, desktop, shared, ws-protocol)
- `pnpm test` — Run all tests; use `pnpm --filter @linkingchat/server test` to run server tests only
- `pnpm check-ws-coverage` — Verify WS event type coverage (tsx scripts/check-ws-coverage.ts)
- `pnpm lint` / `pnpm type-check` — Code quality checks
- `pnpm db:migrate` / `pnpm db:seed` — Prisma migrations and seeding
- Prisma schema: 12 models (User, Device, Command, RefreshToken, FriendRequest, Friendship, UserBlock, Converse, ConverseMember, Message, Attachment, Bot)

### Environment Setup
Required `.env` in `apps/server/`:
- `DATABASE_URL` — PostgreSQL connection (e.g., `postgresql://user:pass@localhost:5440/linkingchat`)
- `REDIS_URL` — Redis connection (e.g., `redis://localhost:6387`)
- `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` — RS256 key pair (base64 encoded)
- `DEEPSEEK_API_KEY` / `KIMI_API_KEY` — LLM providers (Sprint 3+)

### Sprint completion:
- **Sprint 0** ✅ — Infrastructure setup (monorepo, Docker, Prisma, CI)
- **Sprint 1** ✅ — Auth (JWT RS256) + device registration + WS gateway + shell exec + full chain PoC
- **Sprint 2** ✅ — Friends, 1-on-1 chat, presence, read receipts, Bot framework (Bot-as-User), group chat CRUD + permissions, Flutter + Desktop full chat UI (~90 new files, ~8,500+ lines)
- **Sprint 3** 🔧 — AI module + OpenClaw Gateway + Supervisor notifications
  - **Phase 5** ✅ — OpenClaw Gateway 云端集成 (2026-02-28)
  - **Phase 6** ✅ — Agent framework: AgentOrchestrator + SupervisorAgent + BotEventListener
  - **Phase 7** ✅ — Mention routing (@ai) + profile enhancements
  - **Phase 8** ✅ — Desktop streaming bot chat (OpenClaw → ChatThread)
  - **Active** 🔧 — Bot→AI pipeline routing (see `docs/superpowers/plans/`)
- **Sprint 5** ✅ — 账号安全 + 基础功能补全 (2026-03-07)
  - Phase 1 ✅ — 邮箱验证 (MailModule + 验证码 + Guard + Flutter/Desktop UI)
  - Phase 2 ✅ — 忘记密码/重置密码 (防枚举 + token 失效 + Flutter/Desktop UI)
  - Phase 3 ✅ — 语音消息 (录制/播放组件 + 消息气泡集成，双端)
  - Phase 4 ✅ — i18n 客户端集成 (Flutter l10n + Desktop i18next，语言切换 UI)

### Sprint 2 deferred to Sprint 3:
- ~~OpenClaw Gateway integration~~ (Phase 5 ✅ 完成)
- Supervisor notification aggregation (Sprint 3 Phase 6)

Technical decisions are in `docs/decisions/decision-checklist.md` and `docs/decisions/tech-decisions-v2.md`.

## Active Work (2026-04-16)

**Current priority: Wake up Jarvis — wire AI services into real user flows.**

See `plan.md` for complete iteration plan (aligned via Steve Jobs product review 2026-04-16).

Key next steps:
1. Wire WhisperService to auto-trigger on every received message (AI-native social's soul)
2. Wire DraftService into Bot conversation flow (Jarvis drafts messages for you)
3. Design system with "AI presence" visual language (users must feel Jarvis is there)

Previous plans in `docs/superpowers/plans/`:
- `2026-04-06-bot-ai-pipeline-routing.md` — Wire Bot DM → EventEmitter2 → AgentOrchestrator (server-side)
- `2026-04-06-openclaw-bot-chat-integration.md` — Desktop: OpenClaw streaming chat UI (largely done per recent commits)

## What This Project IS

LinkingChat is an **AI-native social app** — a WeChat/Telegram-style messenger where every user has a **Jarvis (贾维斯)** living inside their chat. The interface clones WeChat (zero learning curve for anyone), but social interactions are AI-native: Jarvis helps users communicate with higher EQ, greater efficiency, and less friction.

> This is **NOT** a remote-control tool with chat bolted on. It is **NOT** another AI chatbot app (like Character.AI). It is a **real social app for real human-to-human conversations**, with AI woven into every interaction.

> Note: The original design docs (prd.md, architecture.md) have been archived to `docs/_archive/` — they describe a superseded "parasitic Desktop Bridge" direction.

**Product essence:**
1. **AI-native Social**: Every chat has AI presence — smart reply suggestions, draft generation, high-EQ communication assistance. Users chat with real people, but Jarvis helps them do it better
2. **Jarvis as a Teammate**: A pinned Bot (Supervisor) acts as the user's personal Jarvis — can draft messages, execute tasks on their computer, anticipate needs
3. **Remote Control** (secondary): Cloud-integrated OpenClaw enables desktop command execution via mobile — powerful but not the primary differentiator

**Three core AI interaction patterns:**
- **The Whisper (耳语建议)** [P0] — Jarvis automatically suggests replies when you receive messages. AI-native social's soul
- **Draft & Verify (代理草稿)** [P0] — Tell Jarvis "帮我回复张总", get a polished draft, confirm before sending
- **Predictive Actions (预测执行)** [P1] — After task execution, Jarvis anticipates next steps

**AI integration status (honest assessment, 2026-04-16):**
- WhisperService: code complete, UI complete, **not auto-triggered** (manual button only). Needs wiring to auto-suggest on every received message
- DraftService: code complete, UI complete, **not triggered in real flow** (test endpoint only). Needs wiring to Bot conversation flow
- PredictiveService: code complete, UI complete, **not triggered** (detectTrigger never called). Needs wiring to device execution errors

## Architecture Overview

Three-tier distributed system: "Cloud Brain + Local Hands"

### OpenClaw Cloud Architecture (Phase 5)
OpenClaw Gateway 部署在 Cloud Brain（每用户一个实例），Desktop 使用 openclaw-node 客户端连接：
- Gateway Manager Service 管理多用户 Gateway 进程
- 动态端口分配 (18790-18889)
- JWT Token 认证集成
- Desktop 启动时自动连接，命令执行优先使用 OpenClaw，失败降级到 child_process

```
Flutter Mobile App  <--WSS-->  Cloud Brain (NestJS)  <--WSS-->  Electron Desktop Client
  (Controller)                   ├── WebSocket Gateway                 ├── Social UI (chat)
  ├── Social UI                  ├── Intent Planner                    ├── OpenClaw Worker
  ├── Send commands              ├── LLM Router                        ├── Shell Exec (fallback)
  └── Confirm drafts             ├── Draft State Machine               ├── File IO
                                 ├── OpenClaw Integration              └── Local task execution
                                 └── Gateway Manager (multi-tenant)
```

- **Mobile App (Flutter)**: Social interface + remote command issuer. iOS & Android from one codebase.
- **Cloud Brain (NestJS / TypeScript)**: WebSocket gateway, intent planning, LLM inference with multi-provider routing (cheap models like DeepSeek for simple tasks, powerful models like Kimi 2.5 for complex tasks). Hosts all Agent logic.
- **Desktop Client (Electron + Node.js/TypeScript)**: Full GUI social client (like Discord desktop) + local OpenClaw worker that receives and executes remote commands.

## Key Data Architecture (Sprint 2+)

### Converse model (unified conversation container)
- `type` enum: `DIRECT` (1-on-1), `GROUP`, `BOT` (user-bot conversation)
- Groups use `ConverseMember` with `GroupRole` enum: `OWNER`, `ADMIN`, `MEMBER`
- Permission checks are role-based (not string permission lists)

### REST endpoint patterns
- Auth: `/api/v1/auth/*`
- Users: `/api/v1/users/*`
- Devices: `/api/v1/devices/*`
- Friends: `/api/v1/friends/*`
- Converses: `/api/v1/converses/*`
- Groups: `/api/v1/converses/groups/*` (groups are a sub-resource of converses)
- Messages: `/api/v1/messages/*`
- Bots: `/api/v1/bots/*`
- Commands: `/api/v1/commands/*`
- OpenClaw: `/api/v1/openclaw/gateway/*` (connect, start, stop, status)

### WebSocket namespaces
- `/device` — device control (register, heartbeat, command send/execute/result)
- `/chat` — messaging (message send/receive, typing, read receipts, presence)

## Confirmed Tech Decisions

| Decision | Choice |
|---|---|
| Implementation strategy | Full-chain minimal PoC (all 3 components simultaneously) |
| Language | TypeScript everywhere (Dart for mobile) |
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

## First Milestone ✅

> "手机 App 发送一个干活的指令给电脑端，电脑直接干活并且将任务交付，发回给手机端回复已经做完任务"

Mobile sends a work command → Desktop executes → Desktop reports completion back to mobile. **Achieved in Sprint 1.**

## Three Core Interaction Patterns

1. **The Whisper (耳语建议)** [P0 — AI-native social's soul]: User receives message → Jarvis **automatically** suggests 1 best reply + 2 alternatives below the input box. No @ai trigger needed — Jarvis is always there, quietly ready to help. Ghost text completion planned for v2+ (local small model).
2. **Draft & Verify (代理草稿)** [P0]: User tells Jarvis "帮我回复张总，说周五开会没问题" → Jarvis generates polished, high-EQ draft → user confirms before sending. Bot **never** acts autonomously.
3. **Predictive Actions (预测执行)** [P1]: Bot analyzes context (e.g., shell errors) → generates action card → dangerous commands blocked or flagged.

## Performance Targets

- Message mirror latency: <2 seconds
- Remote action execution: <3 seconds
- @ai reply generation: <2 seconds (user-triggered, has wait expectation)

## Mobile UI Direction

- WeChat/WhatsApp style, less is more — **mobile is the primary interface**
- Bot = fixed pinned system contact (like WeChat "File Transfer Assistant") — this is Jarvis
- Zero barrier: anyone who can use WeChat can use LinkingChat
- AI presence must be visible — Whisper suggestions appear naturally in every conversation
- Design quality must match WeChat level as baseline, then surpass with AI-native features

## Multi-Bot Architecture

- **MVP: one Jarvis only** — Supervisor Bot, pinned, undeletable. Do one bot insanely well before adding more
- Auto-create on registration: Supervisor Bot (the user's Jarvis)
- v1.x: add bot types per demand (social media, data analysis, etc.)
- v2.0: open custom bot creation
- Supervisor Bot = notification aggregator + smart concierge + the user's AI social coach

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
│   ├── sprint0_implement.md            — Sprint 0: Infrastructure setup (✅ DONE)
│   ├── sprint0_implement_mark.md       — Sprint 0 implementation record
│   ├── sprint1_implement.md            — Sprint 1: Auth + device + WS + shell exec (✅ DONE)
│   ├── sprint1_implement_mark.md       — Sprint 1 implementation record
│   ├── sprint2_implement.md            — Sprint 2: Friends, chat, bots, groups, UI (✅ DONE)
│   ├── sprint2_implement_mark.md       — Sprint 2 implementation record
│   ├── sprint3_implement.md            — Sprint 3: AI module + OpenClaw + enhancements (🔧 NEXT)
│   ├── sprint4_implement.md            — Sprint 4: Polish + production readiness
│   └── sprint4_phases/                 — Sprint 4 individual Phase development docs
│       ├── phase0_rich_media.md        — P1: S3 storage + image/file/voice messages
│       ├── phase1_message_recall.md    — P2: Message recall enhancement
│       ├── phase5_cloud_deploy.md      — P3: Tencent Cloud Docker deployment
│       ├── phase6_nginx_proxy.md       — P4: Nginx reverse proxy + SSL + WSS
│       ├── phase9_security_audit.md    — P5: Security audit + Prometheus monitoring
│       ├── phase2_message_search.md    — P6: PostgreSQL full-text search
│       ├── phase4_i18n.md              — P7: i18n (Chinese + English)
│       ├── phase8_performance.md       — P8: Performance optimization
│       └── phase7_horizontal_scaling.md — P9: Horizontal scaling + load testing
│
├── plans/                              # Phase-specific design documents (Sprint 3)
│   ├── 2026-02-28-phase5-*.md          — OpenClaw Gateway
│   ├── 2026-02-28-phase6-*.md          — Agent framework + Supervisor
│   ├── 2026-03-01-phase7-*.md          — Mention routing + profile
│   └── 2026-03-01-phase8-*.md          — Desktop profile UI
│
├── superpowers/plans/                  # Active sprint plans
│   ├── 2026-04-06-bot-ai-pipeline-routing.md       — Bot DM → agent dispatch wiring
│   └── 2026-04-06-openclaw-bot-chat-integration.md — Desktop streaming bot chat
│
└── _archive/                           # Superseded documents
    ├── architecture.md                 — Old "parasitic Desktop Bridge" direction
    ├── prd.md                          — Old product requirements
    └── gemini-research.md              — Original Gemini report (errors corrected in research/)
```

## Open Questions

All major questions resolved — see `docs/decisions/tech-decisions-v2.md`.

## Key File Locations (Phase 5+)

### OpenClaw Integration
- Server: `apps/server/src/openclaw/` — Gateway Manager, Controller, Module
- Desktop: `apps/desktop/src/main/services/openclaw-client.service.ts` — OpenClaw 客户端
- Desktop: `apps/desktop/src/main/services/command-executor.service.ts` — 双模式命令执行器
- Tests: `apps/server/src/openclaw/__tests__/gateway-manager.service.spec.ts`

### AI / Agent Module
- `apps/server/src/agents/` — Agent framework
  - `orchestrator/agent-orchestrator.service.ts` — Routes events to registered agents
  - `impl/supervisor.agent.ts` — Supervisor Bot agent (sentinel `botId: 'supervisor-bot'`)
  - `impl/batch-trigger.service.ts` — Batch event triggering
  - `events/bot-event.listener.ts` — EventEmitter2 → orchestrator bridge
  - `core/` — BaseAgent, AgentMemoryService, AgentWorkspaceService
  - `interfaces/` — AgentEvent, AgentResponse, ConversationContext types
- `apps/server/src/ai/` — LLM providers + AI services
  - `services/llm-router.service.ts` — Multi-provider LLM routing (DeepSeek cheap / Kimi complex)
  - `services/whisper.service.ts` — @ai reply suggestions
  - `services/draft.service.ts` — Draft & Verify state machine
  - `services/predictive.service.ts` — Predictive Actions
  - `providers/` — deepseek.provider.ts, kimi.provider.ts

### Desktop IPC Pattern
- Renderer calls `window.api.xxx()` → preload bridge → Main IPC handler → service/OpenClaw
- Preload: `apps/desktop/src/preload/index.ts` — exposes typed `window.api`
- IPC handlers: `apps/desktop/src/main/ipc/` (auth.ipc.ts, device.ipc.ts, openclaw.ipc.ts)

### Test Files Location
- Server tests: `apps/server/src/<module>/__tests__/` (colocated with source)
- Exception: `messages.service.spec.ts` lives directly in `messages/` (not in `__tests__/`)
