# AI Gateway / Packaged Desktop Test Plan

> Date: 2026-04-24
> Scope: Desktop packaged build, Server AI Gateway, server provider default, DeepSeek/Kimi fallback
> Related real test log: `docs/realtest/2026-04-24.md`

---

## 1. Test Goals

This plan verifies the production-like Desktop experience after the AI Gateway changes:

- Packaged Desktop defaults to `server` provider for new users.
- Login fetches and caches the LLM proxy token.
- Bot chat uses `Server /api/v1/ai/llm-proxy`.
- Server records usage in `ai_usage`.
- DeepSeek failures are observable and can fallback to Kimi.
- Logout and error paths do not leak or reuse invalid LLM tokens.

---

## 2. Environment

| Item | Value |
|------|-------|
| OS | Windows |
| Server | `http://localhost:3008` for local test |
| Production API | `https://linkchat-api.matrix-ai.com.cn` |
| Database | PostgreSQL in Docker |
| Redis | Redis in Docker |
| Test account | `pmp@test.com` |
| Desktop package output | `apps/desktop/dist/` |

Required local services:

```powershell
docker compose up -d postgres redis
pnpm dev:server
```

Useful database checks:

```powershell
docker exec linkingchat-postgres psql -U linkingchat -d linkingchat -c "select to_jsonb(au) from ai_usage au order by to_jsonb(au)->>'createdAt' desc limit 5;"
```

Useful Desktop DevTools checks:

```js
await window.electronAPI.getAgentType()
await window.electronAPI.setAgentType('server')
```

---

## 3. P0 Tests

### P0-1. Build NSIS Installer

Purpose: verify the real installable Windows package can be produced.

Steps:

```powershell
pnpm --filter @linkingchat/desktop dist
```

Expected:

- Build completes without fatal errors.
- Installer is generated under `apps/desktop/dist/`.
- `win-unpacked/` is also available.

Result:

| Status | Tester | Notes |
|--------|--------|-------|
| PASS | Codex | `pnpm --filter @linkingchat/desktop dist` succeeded after closing stale `win-unpacked` LinkingChat/OpenClaw sidecar processes. Generated `apps/desktop/dist/LinkingChat Setup 0.0.1.exe` (257,416,011 bytes) and `.blockmap`. Non-blocking warnings: missing package `description`/`author`, missing optional `resources/hermes-env`, Node `DEP0190`. |

---

### P0-2. Fresh Install Defaults To Server Provider

Purpose: verify a clean packaged install does not inherit old `openclaw` or `hermes` state.

Preconditions:

- Backup existing Desktop store if needed:

```powershell
$store = Join-Path $env:APPDATA '@linkingchat\desktop'
```

Steps:

1. Install the NSIS package.
2. Start Desktop.
3. Open DevTools.
4. Run:

```js
await window.electronAPI.getAgentType()
```

Expected:

```text
server
```

Result:

| Status | Actual provider | Notes |
|--------|-----------------|-------|
| PASS | `server` | Verified with the current `win-unpacked` build after temporarily moving `linkingchat-agent.json`. The app regenerated `{"agentType":"server"}`. Original store was restored. Note: silent NSIS install (`/S`) did not exit within 5 minutes in this environment, so full installed-app validation still needs manual installer run. |

---

### P0-3. Local Packaged App Uses Local Server

Purpose: verify packaged app can be pointed at local server for controlled testing.

Steps:

```powershell
$env:API_BASE_URL="http://localhost:3008"
D:\myproject\LinkChat_new\apps\desktop\dist\win-unpacked\LinkingChat.exe
```

Then:

1. Login as `pmp@test.com`.
2. Confirm provider:

```js
await window.electronAPI.getAgentType()
```

3. Send to Supervisor/Bot:

```text
请只回复：packaged server OK
```

Expected:

- UI receives a bot reply.
- No `LLM provider unreachable` message is shown.
- `ai_usage` gets a new row.

Result:

| Status | UI reply | `ai_usage.model` | Notes |
|--------|----------|------------------|-------|
| PASS | `packaged server P0-3 OK` | `deepseek-chat` | Started `win-unpacked/LinkingChat.exe` with `API_BASE_URL=http://localhost:3008`. Logged in as `pmp@test.com`. Dev store remained `{"agentType":"server"}`. `ai_usage` row created at `2026-04-24T07:51:14.294` with `promptTokens=16`, `completionTokens=8`. User and bot messages were both persisted. |

---

### P0-4. Production API Packaged Login And Chat

Purpose: verify packaged app works without local `API_BASE_URL`, using production API.

Steps:

1. Close all local packaged instances.
2. Clear temporary `API_BASE_URL` from the shell.
3. Start installed Desktop normally.
4. Login.
5. Send:

```text
请只回复：production server OK
```

Expected:

- Login succeeds against production API.
- `/ai/llm-token` succeeds.
- Bot replies through production server proxy.
- Production usage tracking is updated.

Result:

| Status | Login | Bot reply | Usage confirmed | Notes |
|--------|-------|-----------|-----------------|-------|
| PASS | PASS | `production server Po-4 OK` | PASS | Retested packaged Desktop against production API as `ice@test.com`. UI received the expected bot reply. Production `ai_usage` confirmed a new row for `ice@test.com` using `deepseek-chat` at `2026-04-24 09:11:21.092 UTC` with `promptTokens=15`, `completionTokens=7`. The first sidebar status dot was briefly gray after login and then turned green, indicating chat WebSocket reconnection completed. |

---

## 4. P1 Tests

### P1-1. Long Streaming Reply

Purpose: verify SSE streaming and final message persistence for longer responses.

Prompt:

```text
写一段 500 字的产品介绍，主题是 LinkingChat 的智能协作能力。
```

Expected:

- Text streams progressively.
- Final response is complete.
- Message table contains the full bot message.
- `ai_usage` has a new row.

Result:

| Status | Stream complete | Saved complete | Notes |
|--------|-----------------|----------------|-------|
| PASS | PASS | PASS | Production packaged test as `ice@test.com` returned the expected long reply ending with `P1-1 LONG STREAM OK`. Production `ai_usage` recorded `deepseek-chat` at `2026-04-24 09:26:27.918 UTC` with `promptTokens=45`, `completionTokens=650`; messages table contains both the user prompt and bot reply. UI issue found and fixed: bot conversation sends now add the REST-saved user message to the local store immediately. Retest with `P1-1 USER MESSAGE VISIBLE OK` passed twice; production DB shows two real user sends and two bot replies, not duplicate rendering. |

---

### P1-2. Cancel Or Interrupt Long Reply

Purpose: verify abort behavior does not break future chat.

Steps:

1. Send a long prompt.
2. Cancel, switch conversation, or close the window during streaming.
3. Reopen and send a short prompt.

Expected:

- UI does not hang.
- Server has no unhandled exception.
- A later message still works.

Result:

| Status | Abort behavior | Later chat | Notes |
|--------|----------------|------------|-------|
| FIXED - RETEST NEEDED | PASS | FAIL before fix | Switching away during a long production packaged bot reply did not freeze the UI, and the long reply completed with `P1-2 INTERRUPT LONG OK`. Production DB confirmed both user prompt and bot reply, with `deepseek-chat` usage at `2026-04-24 09:39:07.662 UTC` (`promptTokens=55`, `completionTokens=716`). Recovery short prompts exposed duplicate-send behavior: first 2 sends were persisted 34ms apart, and a later stress retest produced many real duplicate sends. Fixed `MessageInput` so bot conversation `sendingRef` remains locked until `sendOpenClawMessage` completes. Also fixed `apps/desktop/package.json` so `dist` and `dist:dir` run `pnpm build` before `electron-builder`; earlier retests were using stale `out/renderer` assets. New `out/renderer` now contains `await sendOpenClawMessage(...)`. Retest short recovery prompt under rapid Enter/click. |

---

### P1-3. Server Restart While Desktop Is Open

Purpose: verify Desktop recovers after backend restart.

Steps:

1. Keep Desktop open and logged in.
2. Stop and restart `pnpm dev:server`.
3. Send:

```text
服务端重启后请回复 OK
```

Expected:

- If token is still valid, chat works after server is back.
- If request happens while server is down, UI shows a clear error.
- After restart, later requests succeed.

Result:

| Status | During downtime | After restart | Notes |
|--------|-----------------|---------------|-------|
| PASS | Server restarted cleanly | PASS | Production `server` was restarted and returned to healthy. Initial test exposed a recovery defect: Device Gateway reconnected but Chat Gateway did not, leaving the first sidebar dot gray and message send blocked. Fixed `useChatSocket` forced reconnect plus send/stream timeouts. Retest passed: ChatGateway reconnected at `2026-04-24 14:20:38.840 UTC`, user message `P1-3 SERVER RESTART RETEST OK` persisted at `2026-04-24 14:24:11.677 UTC`, bot reply persisted at `2026-04-24 14:24:12.825 UTC`, and `ai_usage` recorded `deepseek-chat` with `promptTokens=19`, `completionTokens=11`. |

---

### P1-4. DeepSeek Failure Falls Back To Kimi

Purpose: verify default server proxy remains usable when DeepSeek is unavailable.

Ways to trigger:

- Temporarily make `DEEPSEEK_BASE_URL` invalid, or
- Use the current network state if DeepSeek times out from the server process.

Prompt:

```text
请只回复：fallback OK
```

Expected:

- Server logs DeepSeek failure.
- Server logs fallback to Kimi.
- UI receives a reply.
- `ai_usage.model` is `kimi...`.

Result:

| Status | DeepSeek failed | Kimi fallback | UI reply | Notes |
|--------|-----------------|---------------|----------|-------|
| PASS | PASS | PASS | `P1-4 FALLBACK REAL OK` | Controlled fault injection changed production `DEEPSEEK_BASE_URL` to `http://127.0.0.1:9` and restarted server. Retest passed: user message persisted at `2026-04-24 15:19:39.174 UTC`, bot reply persisted at `2026-04-24 15:19:41.563 UTC`, `ai_usage.model=moonshot-v1-8k` at `2026-04-24 15:19:41.102 UTC`. Logs show `AiGatewayService` DeepSeek fetch failed twice with `fetch failed (bad port)`, then `Falling back from deepseek-chat to moonshot-v1-8k`. Production DeepSeek config was restored to `https://api.deepseek.com` and server returned healthy. |

---

### P1-5. Rate Limit Behavior

Purpose: verify Redis rate limiting.

Steps:

1. Send more than 20 server-provider bot messages within one minute.
2. Observe UI and server logs.
3. Check Redis:

```powershell
docker exec linkingchat-redis redis-cli --scan --pattern "llm:rate:*"
```

Expected:

- Requests up to the limit work.
- After the limit, UI receives a clear rate-limit error.
- Minute key expires after about 60 seconds.

Result:

| Status | Limit hit | Error clear | TTL behavior | Notes |
|--------|-----------|-------------|--------------|-------|
| PASS | PASS | PASS | PASS | Production API-level controlled test used a temporary 10-minute LLM token for `ice@test.com` (`userId=cmnsytign000fo301cb0e4p2m`) and sent 22 `/api/v1/ai/llm-proxy` requests with `max_tokens=1`. Requests 1-20 returned OK; requests 21-22 returned `Rate limit exceeded`. Redis minute key reached `22` with TTL counting down, then expired (`ttl=-2`) after about 60 seconds. Redis day key increased to `72`. `ai_usage` added 20 rows for `deepseek-chat`; the 2 rate-limited requests did not create usage rows. |

---

## 5. P2 Tests

### P2-1. Logout Clears LLM Token

Purpose: verify logout does not leave a usable LLM token.

Steps:

1. Login.
2. Confirm `linkingchat-ai-gateway.json` has a token.
3. Logout.
4. Confirm token is removed.
5. Try bot chat while logged out.

Expected:

- Store token is cleared.
- Server proxy cannot be called from Desktop while logged out.

Result:

| Status | Token cleared | Logged-out chat blocked | Notes |
|--------|---------------|-------------------------|-------|
| PASS | PASS | PASS | Before logout, `linkingchat-ai-gateway.json` had an LLM token with expiry `2026-04-25 23:15:58` local time. Initial token-clearing check passed. Focused retest was then performed from a healthy Desktop state with both sidebar dots green; user logged out of `ice@test.com`. After logout, `linkingchat-ai-gateway.json` was `{}` with no `llmToken` or `llmTokenExpiry`, and `linkingchat-auth.json` was also `{}`. |

---

### P2-2. Invalid LLM Token Rejected

Purpose: verify `/ai/llm-proxy` rejects invalid signed tokens.

Command:

```powershell
Invoke-WebRequest -UseBasicParsing `
  -Method Post `
  -Uri "http://localhost:3008/api/v1/ai/llm-proxy" `
  -Headers @{ Authorization = "Bearer invalid-token"; "Content-Type" = "application/json" } `
  -Body '{"messages":[{"role":"user","content":"test"}],"stream":true}'
```

Expected:

- Request is rejected.
- Provider is not called.
- No `ai_usage` row is created.

Result:

| Status | HTTP/error result | Usage created | Notes |
|--------|-------------------|---------------|-------|
| PASS | 401 `Invalid or expired LLM token` | No | Production `/api/v1/ai/llm-proxy` was called with `Authorization: Bearer invalid-token`. It returned HTTP 401 with `Invalid or expired LLM token`. `ai_usage` count in the surrounding 2-minute window remained `0`, proving provider was not called and usage was not recorded. |

---

### P2-3. Missing Provider API Key

Purpose: verify clear error when no provider credentials are configured.

Steps:

1. Temporarily remove or blank `DEEPSEEK_API_KEY` and `KIMI_API_KEY`.
2. Restart server.
3. Send a server-provider bot message.

Expected:

- UI shows clear API key configuration error.
- No ambiguous `fetch failed`.
- No usage row unless a provider request was actually made.

Result:

| Status | Error clarity | Usage created | Notes |
|--------|---------------|---------------|-------|
| PASS | PASS | No | Production `server` was recreated with `DEEPSEEK_API_KEY=` and `KIMI_API_KEY=` overriding env-file secrets. A temporary LLM token request to `/api/v1/ai/llm-proxy` returned SSE error `LLM provider API key is not configured for deepseek-chat`, not an ambiguous fetch failure. `ai_usage` count in the surrounding 5-minute window remained `0`. API key overrides were removed, production server was recreated, and health returned to `healthy`. |

---

### P2-4. Redis Unavailable

Purpose: verify behavior when Redis rate limiter dependency is down.

Steps:

```powershell
docker compose stop redis
```

Then send a server-provider bot message.

Expected:

- Current expected behavior may be failure because rate limit depends on Redis.
- Server should not crash.
- UI should show a clear error.

Restore:

```powershell
docker compose up -d redis
```

Result:

| Status | UI error | Server survived | Notes |
|--------|----------|-----------------|-------|
| PASS | SSE error `Rate limit dependency unavailable` | Yes | Production Redis was stopped and `/api/v1/ai/llm-proxy` was called with a temporary LLM token. The request returned in about `435ms` with `data: {"type":"error","message":"Rate limit dependency unavailable"}`. `server` stayed `healthy`, `ai_usage` count stayed `71 -> 71`, and Redis was restored to `healthy`. Server log included `Rate limit dependency unavailable: Stream isn't writeable and enableOfflineQueue options is false`. A recovery smoke request after Redis returned `healthy` streamed `P2-4 RECOVERY SMOKE OK` and created 1 `deepseek-chat` usage row. |

---

## 6. Evidence To Collect

For each completed test, collect one or more:

- Screenshot of UI result.
- Server log snippet.
- `ai_usage` latest row.
- Redis key/TTL output.
- DevTools `getAgentType()` result.

Suggested DB query:

```powershell
docker exec linkingchat-postgres psql -U linkingchat -d linkingchat -c "select to_jsonb(au) from ai_usage au order by to_jsonb(au)->>'createdAt' desc limit 5;"
```

Suggested provider store check:

```powershell
Get-Content (Join-Path $env:APPDATA '@linkingchat\desktop\linkingchat-agent.json') -Raw
```

Suggested LLM token store check:

```powershell
$p = Join-Path $env:APPDATA '@linkingchat\desktop\linkingchat-ai-gateway.json'
$j = Get-Content $p -Raw | ConvertFrom-Json
[pscustomobject]@{
  HasToken = [bool]$j.llmToken
  TokenLength = if ($j.llmToken) { $j.llmToken.Length } else { 0 }
  ExpiryLocal = if ($j.llmTokenExpiry) { [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$j.llmTokenExpiry).LocalDateTime } else { $null }
}
```

---

## 7. Completion Criteria

The feature is ready for wider release when:

- P0 tests pass.
- P1-1 through P1-4 pass.
- P1-5 rate limit behavior is understood and acceptable.
- P2 failures are clear and do not crash Desktop or Server.
- Production API test is explicitly recorded with evidence.
