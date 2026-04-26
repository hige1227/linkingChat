# Main Validation Plan After Jarvis / Relationship / AI Gateway Merge

> Date: 2026-04-26
> Scope: current `main` after merging upstream Jarvis/Relationship work and AI Gateway packaged Desktop fixes.
> Related docs:
> - `docs/testing/ai-gateway-packaged-test-plan.md`
> - `docs/realtest/2026-04-24.md`
> - `docs/superpowers/plans/2026-04-24-jarvis-phase0.md`
> - `docs/superpowers/plans/2026-04-24-jarvis-phase1.md`
> - `docs/superpowers/specs/2026-04-24-relationship-graph-design.md`

---

## 1. Goal

Validate that the merged `main` is safe to run locally and safe to promote toward production:

- AI Gateway still works after the upstream Jarvis/Relationship changes.
- Desktop can still send bot messages through the server provider.
- New `pi-ai` / `pi-agent-core` server stack compiles and passes targeted tests.
- New Prisma models and migrations for Relationship Graph and Jarvis are usable.
- Relationship API, relationship event updates, Jarvis routing, and group mention Whisper have basic coverage.
- Packaged Desktop can still be built and smoke-tested.

---

## 2. Current Known Baseline

After rebase onto upstream `main`, these checks already passed once:

| Check | Result |
|-------|--------|
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm --filter @linkingchat/server type-check` | PASS after Prisma Client regenerate |
| `pnpm --filter @linkingchat/server build` | PASS |
| `pnpm --filter @linkingchat/server test -- ai-gateway.service.spec.ts` | PASS |
| `pnpm --filter @linkingchat/desktop type-check` | PASS |
| `pnpm --filter @linkingchat/desktop build` | PASS |

Important local note:

```text
If Prisma generate fails on Windows with EPERM for query_engine-windows.dll.node, stop `pnpm dev:server` / Nest watch first, then rerun Prisma generate.
```

---

## 3. Prerequisites

Use PowerShell from repo root:

```powershell
cd D:\myproject\LinkChat_new
```

Expected remotes:

```powershell
git remote -v
git status --short
git rev-parse --short HEAD
```

Expected:

- Working tree is clean before testing.
- `main` is synced with `upstream/main`, unless intentionally testing local changes.

Required local services:

```powershell
docker compose up -d postgres redis
```

Required server environment:

- `AUTH_JWT_PRIVATE_KEY`
- `AUTH_JWT_PUBLIC_KEY`
- `AUTH_REFRESH_PRIVATE_KEY`
- `AUTH_REFRESH_PUBLIC_KEY`
- `DEEPSEEK_API_KEY`
- `KIMI_API_KEY`
- normal database and Redis config

---

## 4. P0 Machine Verification

### P0-1. Install Dependencies

Command:

```powershell
pnpm install --frozen-lockfile
```

Expected:

- Completes successfully.
- No `pnpm-lock.yaml` change.

Result:

| Status | Notes |
|--------|-------|
| PASS | Built `win-unpacked` with local API/WS environment variables; `LinkingChat.exe` exists. |

---

### P0-2. Generate Prisma Client

Command:

```powershell
pnpm --filter @linkingchat/server exec prisma generate --schema prisma/schema.prisma
```

Fallback if command lookup fails from repo root:

```powershell
cd apps\server
pnpm exec prisma generate --schema prisma/schema.prisma
cd ..\..
```

Expected:

- Prisma Client generated.
- TypeScript can see `relationshipProfile`, `relationshipEvent`, `jarvisState`, and `RelationshipTier`.

Result:

| Status | Notes |
|--------|-------|
| PASS | Packaged app launched, login worked against local server, chat/device indicators recovered after renderer was rebuilt with local URLs. |

---

### P0-3. Type Check And Build

Commands:

```powershell
pnpm --filter @linkingchat/server type-check
pnpm --filter @linkingchat/server build
pnpm --filter @linkingchat/desktop type-check
pnpm --filter @linkingchat/desktop build
```

Expected:

- All pass.

Result:

| Status | Notes |
|--------|-------|
| TODO | |

---

### P0-4. Targeted Unit Tests

Commands:

```powershell
pnpm --filter @linkingchat/server test -- ai-gateway.service.spec.ts
pnpm --filter @linkingchat/server test -- llm-config.service.spec.ts
pnpm --filter @linkingchat/server test -- jarvis
pnpm --filter @linkingchat/server test -- relationship
```

Expected:

- AI Gateway tests pass.
- LLM config tests pass.
- Jarvis tests pass.
- Relationship tests pass.

Result:

| Status | Test | Notes |
|--------|------|-------|
| TODO | AI Gateway | |
| TODO | LLM Config | |
| TODO | Jarvis | |
| TODO | Relationship | |

---

## 5. P1 Local Desktop And AI Gateway Smoke

### P1-1. Start Local Apps

Terminal 1:

```powershell
pnpm dev:server
```

Terminal 2:

```powershell
pnpm dev:desktop
```

Expected:

- Server starts on `http://localhost:3008`.
- Desktop opens.
- Left-side connection indicators become green.

Result:

| Status | Notes |
|--------|-------|
| TODO | |

---

### P1-2. Login And Basic Chat

Steps:

1. Login with a test account.
2. Open a normal direct conversation.
3. Send a normal text message.

Expected:

- User message appears immediately.
- No duplicate message appears.
- No send freeze.

Result:

| Status | Account | Notes |
|--------|---------|-------|
| TODO | | |

---

### P1-3. Bot Conversation Through Server Provider

Prompt:

```text
Please reply exactly: LOCAL AI GATEWAY OK
```

Expected:

- User message remains visible.
- Bot replies with `LOCAL AI GATEWAY OK`.
- No duplicate send when pressing Enter/clicking send repeatedly during in-flight reply.

Useful DevTools check:

```js
await window.electronAPI.getAgentType()
```

Expected agent type:

```text
server
```

If this returns anything else in dev mode, switch to the server provider before testing:

```js
await window.electronAPI.setAgentType('server')
await window.electronAPI.getAgentType()
```

Result:

| Status | Agent type | Bot reply | Notes |
|--------|------------|-----------|-------|
| TODO | | | |

---

### P1-4. Server Restart Recovery

Steps:

1. Keep Desktop open.
2. Restart local server.
3. Wait for both indicators to recover.
4. Send another bot message.

Prompt:

```text
Please reply exactly: LOCAL SERVER RESTART OK
```

Expected:

- Desktop reconnects.
- User can send after restart.
- Bot replies.

Result:

| Status | Reconnected | Bot reply | Notes |
|--------|-------------|-----------|-------|
| TODO | | | |

---

## 6. P2 Relationship Graph Local Validation

### P2-1. Apply Local Migrations

For local DB only:

```powershell
pnpm --filter @linkingchat/server exec prisma migrate deploy --schema prisma/schema.prisma
```

Expected:

- Migrations apply:
  - `20260424010000_add_relationship_graph_and_jarvis_state`
  - `20260424020000_rename_relationship_tables`

Result:

| Status | Notes |
|--------|-------|
| TODO | |

---

### P2-2. Relationship Profiles Created On Friend Accept

Steps:

1. Use two local test users.
2. Send a friend request.
3. Accept the friend request.
4. Query relationship profiles.

DB check:

```powershell
docker --% exec linkingchat-postgres psql -U linkingchat -d linkingchat -c "select id, \"userId\", \"contactId\", tier, \"isMuted\", \"createdAt\" from relationship_profiles order by \"createdAt\" desc limit 10;"
```

Expected:

- Two profiles are created, one in each direction.
- `tier` defaults to `IMPORTANT`.
- `isMuted` is `false`.

Result:

| Status | Profiles created | Notes |
|--------|------------------|-------|
| TODO | | |

---

### P2-3. Relationship API

Prerequisites:

- Use an authenticated JWT.
- The account must have `isEmailVerified = true`, because this controller uses `EmailVerifiedGuard`.

Request:

```text
GET /api/v1/relationships
```

Expected:

- Returns current user's relationship profiles.
- Includes recent events array.

Patch request:

```text
PATCH /api/v1/relationships/:contactId
```

Example body:

```json
{
  "tier": "CORE",
  "label": "Important contact",
  "notes": "Manual local test"
}
```

Expected:

- Profile updates.
- Follow-up GET shows changed `tier`, `label`, and `notes`.

Result:

| Status | GET | PATCH | Notes |
|--------|-----|-------|-------|
| TODO | | | |

---

### P2-4. DM Message Updates Relationship Metrics

Steps:

1. Send a DM message to an existing friend.
2. Query `relationship_profiles`.

DB check:

```powershell
docker --% exec linkingchat-postgres psql -U linkingchat -d linkingchat -c "select \"userId\", \"contactId\", \"weeklyMessageCount\", \"lastInteractionAt\" from relationship_profiles order by \"updatedAt\" desc limit 10;"
```

Expected:

- Sender profile's `weeklyMessageCount` increments.
- `lastInteractionAt` updates for both sides.

Result:

| Status | weeklyMessageCount | lastInteractionAt | Notes |
|--------|--------------------|-------------------|-------|
| TODO | | | |

---

### P2-5. Important Event Extraction

Send a DM message with clearly important content, for example:

```text
我保证明天会把最终报告发给你。
```

Then wait a few seconds and query:

```powershell
docker --% exec linkingchat-postgres psql -U linkingchat -d linkingchat -c "select type, summary, \"sourceMessageId\", \"extractedAt\" from relationship_events order by \"extractedAt\" desc limit 10;"
```

Expected:

- The sample includes `我保证`, so the rule filter should trigger event extraction.
- If LLM provider is configured and extraction returns an event, a relationship event is created.
- If no event is created, check server logs for LLM failures or JSON parse warnings; an empty extraction result may not log.

Result:

| Status | Event created | Notes |
|--------|---------------|-------|
| TODO | | |

---

## 7. P3 Jarvis / Supervisor Validation

### P3-1. Supervisor Basic Reply

Open Supervisor and send:

```text
Please reply exactly: JARVIS LOCAL OK
```

Expected:

- Supervisor/Jarvis replies.
- No server crash.
- No duplicate messages.

Result:

| Status | Reply | Notes |
|--------|-------|-------|
| PASS | `FINAL PACKAGE OK` | User confirmed bot reply was visible with no stale packaged renderer behavior. |

---

### P3-2. Jarvis State Persistence

After using Supervisor/Jarvis, query:

```powershell
docker --% exec linkingchat-postgres psql -U linkingchat -d linkingchat -c "select \"userId\", \"snapshotAt\", jsonb_array_length(messages) as message_count from jarvis_states order by \"snapshotAt\" desc limit 10;"
```

Expected:

- A `jarvis_states` row exists for the user after Jarvis completes a turn or saves state.

Result:

| Status | State row | Notes |
|--------|-----------|-------|
| TODO | | |

---

### P3-3. Group Mention Whisper

Steps:

1. Create or open a group conversation with at least two real users.
2. Send a message mentioning another human username.

Example:

```text
@someusername please review this plan when you have time.
```

Expected:

- Server does not crash.
- Mentioned human can receive Whisper suggestion if quality gate triggers.
- Bot mentions and `@ai` still route as before.

Result:

| Status | Mention resolved | Whisper triggered | Notes |
|--------|------------------|-------------------|-------|
| TODO | | | |

---

## 8. P4 Packaged Desktop Validation

### P4-1. Build Unpacked Package

Close any running `apps\desktop\dist\win-unpacked\LinkingChat.exe` first.

Command:

```powershell
$env:API_BASE_URL = 'http://localhost:3008'
$env:VITE_API_URL = 'http://localhost:3008'
$env:WS_URL = 'http://localhost:3008'
$env:VITE_WS_URL = 'http://localhost:3008'
pnpm --filter @linkingchat/desktop dist:dir
```

Expected:

- Build passes.
- `apps\desktop\dist\win-unpacked\LinkingChat.exe` exists.
- Packaged renderer bundle contains local API/WS URLs for this validation run.

Result:

| Status | Notes |
|--------|-------|
| TODO | |

---

### P4-2. Launch Packaged App

Command:

```powershell
$env:API_BASE_URL = 'http://localhost:3008'
$env:VITE_API_URL = 'http://localhost:3008'
$env:WS_URL = 'http://localhost:3008'
$env:VITE_WS_URL = 'http://localhost:3008'
Start-Process .\apps\desktop\dist\win-unpacked\LinkingChat.exe
```

Expected:

- App launches.
- Packaged main-process API/WS calls target local `localhost:3008`, not the production API.
- Login works.
- Left indicators recover to green.

Result:

| Status | Notes |
|--------|-------|
| TODO | |

---

### P4-3. Final Packaged AI Gateway Smoke

Prompt:

```text
Please reply exactly: FINAL PACKAGE OK
```

Expected:

- User message visible.
- Bot reply visible.
- No duplicate send.
- No stale packaged renderer behavior.

Result:

| Status | Reply | Notes |
|--------|-------|-------|
| TODO | | |

---

## 9. P5 Production Readiness Checklist

Only run this after local validation passes.

Before production deploy:

```powershell
git status --short
git rev-list --left-right --count upstream/main...HEAD
```

Expected:

- Working tree clean.
- Local branch is not behind upstream.

Production deploy must include:

- Server code.
- Prisma migrations.
- Prisma Client generation inside build image.
- Environment variables for DeepSeek/Kimi.
- Redis available.

Production migration command:

```powershell
pnpm --filter @linkingchat/server exec prisma migrate deploy --schema prisma/schema.prisma
```

Production smoke:

| Check | Expected |
|-------|----------|
| Server health | healthy |
| Redis health | healthy |
| Login | works |
| Bot reply | works through server provider |
| `ai_usage` | row created for successful LLM call |
| `relationship_profiles` | updated after DM/friendship action |

Local regression result:

| Command | Result | Notes |
|---------|--------|-------|
| `pnpm --filter @linkingchat/server test` | PASS | 47 suites / 460 tests passed after replacing static `pi-agent-core` import with lazy dynamic loading. Jest still reports one worker graceful-exit warning. |
| `pnpm --filter @linkingchat/desktop test` | PASS | 6 suites / 24 tests passed. |
| `pnpm --filter @linkingchat/server type-check` | PASS | Re-run after Jarvis and bot username changes. |
| `pnpm --filter @linkingchat/server build` | PASS | Re-run after Jarvis and bot username changes. |
| Packaged cold start | PASS | User confirmed token restore, chat/device connections, bot conversations, and `COLD START OK` bot reply. |
| New user API E2E | PASS | Registered `coldnew-20260426124425@test.local`; default Supervisor/Coding Bot conversations were created; Supervisor message emitted `agent.dispatch` and wrote one `jarvis_states` row. |
| New user packaged UI | PASS | User confirmed new-user packaged flow overall passed after client state reset fix and confirm-password field were added. |
| Registration auto-login decision | DEFERRED | Current behavior is register-and-login because `/auth/register` returns tokens. Product decision deferred; recommended follow-up is an email-verification gate before entering the chat shell. |
| MailDev email verification | PASS | Started `maildev`; registered `mailcheck-20260426130615@test.local`; MailDev captured the verification email; Redis code verified successfully; subsequent login returned `isEmailVerified=true`. |
| Password reset API | PASS | Forgot-password code was created for `mailcheck-20260426130615@test.local`; reset succeeded; old password failed; new password logged in successfully. |

---

## 10. Test Run Notes

Use this section during the manual run.

| Time | Tester | Step | Result | Evidence / Notes |
|------|--------|------|--------|------------------|
| 2026-04-26 12:25 CST | Codex + user | P0-1 | PASS | Docker services healthy; frozen install passed. |
| 2026-04-26 12:25 CST | Codex + user | P0-2 | PASS | Prisma Client generation, server type-check/build, desktop type-check/build passed. |
| 2026-04-26 12:25 CST | Codex + user | P0-3 | PASS | AI Gateway, LLM Config, Jarvis, and Relationship targeted suites passed. |
| 2026-04-26 12:25 CST | Codex + user | P0-4 | PASS | Server and Desktop dev processes started; server health OK. |
| 2026-04-26 12:25 CST | Codex + user | P1-1 | PASS | Desktop launched in dev mode; user confirmed. |
| 2026-04-26 12:25 CST | Codex + user | P1-2 | PASS | Login and basic chat flow confirmed. |
| 2026-04-26 12:25 CST | Codex + user | P1-3 | PASS | Server-provider bot reply confirmed. |
| 2026-04-26 12:25 CST | Codex + user | P1-4 | PASS | Server restart recovery confirmed with `LOCAL SERVER RESTART OK`. |
| 2026-04-26 12:25 CST | Codex + user | P2-1 | PASS | Relationship/Jarvis migrations applied locally. |
| 2026-04-26 12:25 CST | Codex + user | P2-2 | PASS | Friend accept created relationship profiles. |
| 2026-04-26 12:25 CST | Codex + user | P2-3 | PASS | Relationship GET/PATCH worked after JWT user-id handling fix. |
| 2026-04-26 12:25 CST | Codex + user | P2-4 | PASS | DM updated message count and last interaction timestamps. |
| 2026-04-26 12:25 CST | Codex + user | P2-5 | PASS | Promise text produced empty extraction without crash or server error, which is allowed by this plan. |
| 2026-04-26 12:25 CST | Codex + user | P3-1 | PASS | User confirmed Desktop reply `JARVIS LOCAL OK`. |
| 2026-04-26 12:25 CST | Codex + user | P3-2 | PASS | Real Jarvis dispatch path wrote `jarvis_states`; note Desktop server-provider reply alone did not persist state. |
| 2026-04-26 12:25 CST | Codex + user | P3-3 | PASS | Group mention generated and stored a WHISPER suggestion for the mentioned user. |
| 2026-04-26 12:25 CST | Codex + user | P4-1 | PASS | Packaged `win-unpacked` build succeeded with local API/WS URLs embedded in renderer bundle. |
| 2026-04-26 12:25 CST | Codex + user | P4-2 | PASS | Packaged app launched, login worked, and chat/device connections recovered. |
| 2026-04-26 12:25 CST | Codex + user | P4-3 | PASS | User confirmed final packaged bot smoke with `FINAL PACKAGE OK`. |
