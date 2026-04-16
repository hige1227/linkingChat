# Wake Up Jarvis — Sprint 6 Design Spec

> **Aligned via CTO-level product review, 2026-04-16**
>
> Three AI services are code-complete but dormant. This spec wires them into real user flows,
> adds quality gates, optimizes LLM costs, and establishes the data telemetry loop that makes
> Jarvis smarter over time.

---

## Problem Statement

LinkingChat has three production-ready AI services — `WhisperService`, `DraftService`,
`PredictiveService` — none of which fire in real user flows. The app looks and behaves like
a plain chat client. Users never experience the AI-native social vision.

The root cause is not missing features; it is missing **wiring + quality gates + telemetry**.

---

## Goals

| Goal | Success Metric |
|------|----------------|
| Users feel Jarvis is present | Whisper suggestions appear within 2s of receiving a DIRECT message |
| Draft flow works end-to-end | User says "帮我回复..." → DraftCard appears → approve → message sent |
| Predictive flow works end-to-end | Device command error → Predictive card in Supervisor converse |
| Quality bar from day one | Whisper accept rate measurable; poor-quality triggers filtered |
| Data telemetry established | Every accept/dismiss writes to `AiSuggestion.status` |

---

## Non-Goals

- Voice/video calling
- Multiple bot types (only Supervisor / Jarvis in MVP)
- Ghost text / inline completion (v1.2)
- Learning from telemetry (v1.1 — data collected now, used later)

---

## Architecture Overview

```
Phase 1: Whisper Auto-Trigger + Quality Gate
Phase 2: Draft Intent Classification (merged LLM call) + Wiring
Phase 3: Predictive Wiring + Rate Limiting
Phase 4: Three-platform integration test + Telemetry verification
```

### Full Data Flow

```
Incoming DIRECT message
    │
    ├─ Quality gate (shouldTrigger)
    │     skip: content empty / pure emoji / length < 3 / type != TEXT
    │
    ▼
WhisperService.handleWhisperRequest(receiverUserId, converseId)
    ├─ extractContext() — last 20 messages
    ├─ LLM (DeepSeek, taskType: whisper) — 1 primary + 2 alternatives
    ├─ persist AiSuggestion (status: PENDING)
    └─ WS → ai:whisper:suggestions → WhisperBar (Desktop + Mobile)

User taps suggestion / dismisses
    └─ WS → ai:whisper:accept | ai:whisper:dismiss
         └─ write AiSuggestion.status + selectedIndex  ← learning signal

──────────────────────────────────────────────────────────────────

User sends message to Supervisor Bot (BOT converse)
    │
    ▼
SupervisorAgent.handleUserMessage()
    └─ Single LLM call (DeepSeek, merged intent + response):
          returns { intent: "chat"|"draft", response?, draftFor?, draftContent? }
               │
               ├─ intent=chat  → send response as bot message (existing flow)
               └─ intent=draft → DraftService.createDraft()
                                    ├─ persist AiDraft (status: PENDING, TTL 5min)
                                    ├─ Redis TTL for expiry
                                    └─ WS → ai:draft:created → DraftCard (Desktop + Mobile)

User approves / edits / rejects draft
    └─ WS → ai:draft:approve | ai:draft:reject
         └─ write AiDraft.status
              approve → MessagesService.create() to target converse

──────────────────────────────────────────────────────────────────

Device command returns error
    │
    ▼
BotEventListener.handleDeviceResultComplete()  (payload.status === 'error')
    ├─ Rate gate: Redis key predictive:{userId}:{deviceId} TTL 60s
    │     skip if key exists
    ├─ PredictiveService.detectTrigger(error output) → category
    │     skip if no category match
    └─ PredictiveService.analyzeTrigger()
          ├─ LLM generates up to 3 actions with danger classification
          ├─ persist AiSuggestion (type: PREDICTIVE)
          └─ WS → ai:predictive:action → Supervisor Bot converse (BOT_NOTIFICATION card)
```

---

## Phase 1 — Whisper Auto-Trigger + Quality Gate

### Server Changes

**`apps/server/src/messages/messages.service.ts`**

- Inject `WhisperService` (add to constructor + module providers)
- Before `return message`, fire-and-forget (does not block return):

```typescript
// Only trigger for DIRECT converses, for the receiver, TEXT messages only
if (converse.type === 'DIRECT' && message.type === 'TEXT') {
  const receiverId = memberIds.find(id => id !== userId);
  if (receiverId && this.whisperService.shouldTrigger(message.content)) {
    this.whisperService
      .handleWhisperRequest(receiverId, dto.converseId)
      .catch(err => this.logger.error(`Whisper trigger failed: ${err.message}`));
  }
}
```

Note: `converse.type` requires a single extra Prisma query or join — add `include: { converse: { select: { type: true } } }` to the message create call, or fetch separately. Prefer fetching separately to avoid altering the existing create query shape.

**`apps/server/src/ai/services/whisper.service.ts`**

Add `shouldTrigger(content: string | null): boolean`:

```typescript
shouldTrigger(content: string | null): boolean {
  if (!content) return false;
  const stripped = content.trim();
  if (stripped.length < 3) return false;
  // Pure emoji: Unicode emoji regex
  if (/^[\p{Emoji}\s]+$/u.test(stripped)) return false;
  return true;
}
```

### Client Changes — Desktop

**`apps/desktop/src/renderer/components/chat/MessageInput.tsx`**

- Mount `<WhisperBar converseId={converseId} />` below the textarea
- Only render when `converse.type === 'direct'`

**`apps/desktop/src/renderer/components/chat/WhisperBar.tsx`**

- Subscribe to `ai:whisper:suggestions` WS event (filter by `converseId`)
- On receive: fade-in 200ms + subtle AI-accent border glow on input area
- Tap suggestion → fill input box (editable) → emit `ai:whisper:accept` with `{ suggestionId, selectedIndex }`
- Tap X → emit `ai:whisper:dismiss` with `{ suggestionId }` → hide bar

### Client Changes — Mobile

**`apps/mobile/lib/features/chat/widgets/whisper_suggestions.dart`**

- Same event subscription pattern
- `AnimatedOpacity` 200ms fade-in
- Only mounted in `ConversationType.direct` chat screens
- Tap to fill input, swipe/tap X to dismiss

### Telemetry — Phase 1

`AiSuggestion` table already has `status` (PENDING/ACCEPTED/DISMISSED) and `selectedIndex`.
Server handlers for `ai:whisper:accept` and `ai:whisper:dismiss` already exist in `ChatGateway`.
**Verify these handlers write `status` correctly — this is the data we need for v1.1 learning.**

---

## Phase 2 — Draft Intent Classification (Merged LLM Call)

### Server Changes

**`apps/server/src/agents/impl/supervisor.agent.ts`**

Replace `handleUserMessage()` LLM call with a merged intent + generation call:

```
System prompt: "你是 Jarvis。分析用户意图，返回 JSON：
{
  'intent': 'chat' | 'draft',
  'response': '直接回复内容（intent=chat时）',
  'draftFor': '目标对象（intent=draft时）',
  'draftContent': '草稿内容（intent=draft时）'
}
draft 意图触发条件：用户明确要求帮写/帮回复某人某事。否则 intent=chat。"
```

Routing after single LLM call:
- `intent === 'chat'` → send `response` as bot message (existing behavior, zero regression)
- `intent === 'draft'` → `draftService.createDraft({ draftType: DraftType.MESSAGE, userIntent: draftContent, ... })`

**Inject `DraftService` into `SupervisorAgent`** (add to constructor + `agents.module.ts` providers).

### Client Changes — Desktop

**`apps/desktop/src/renderer/components/chat/DraftCard.tsx`**

- Confirm listening to `ai:draft:created` WS event
- Render: editable textarea pre-filled with `draftContent`, 5-min countdown, Approve / Edit+Approve / Reject buttons
- Approve → emit `ai:draft:approve` → server sends message to target converse
- Reject → emit `ai:draft:reject` → card disappears

### Client Changes — Mobile

**`apps/mobile/lib/features/chat/widgets/draft_card.dart`**

- Same logic as Desktop

---

## Phase 3 — Predictive Actions Wiring + Rate Limiting

### Server Changes

**`apps/server/src/agents/events/bot-event.listener.ts`**

- Inject `PredictiveService` and `Redis` client
- In `handleDeviceResultComplete()`, after existing Supervisor dispatch:

```typescript
if (payload.status === 'error') {
  const rateLimitKey = `predictive:${payload.userId}:${payload.deviceId}`;
  const exists = await this.redis.exists(rateLimitKey);
  if (!exists) {
    await this.redis.setex(rateLimitKey, 60, '1');
    const errorOutput = payload.error ?? payload.output ?? '';
    const category = this.predictiveService.detectTrigger(errorOutput);
    if (category) {
      const supervisorConverse = await this.botsService.getOrCreateSupervisorConverse(payload.userId);
      this.predictiveService
        .analyzeTrigger({
          userId: payload.userId,
          converseId: supervisorConverse.id,
          triggerOutput: errorOutput,
          triggerCategory: category,
        })
        .catch(err => this.logger.error(`Predictive analysis failed: ${err.message}`));
    }
  }
}
```

**Client Changes — Desktop + Mobile**

`ai:predictive:action` WS event pushes a `BOT_NOTIFICATION` message to Supervisor converse.
Existing notification card rendering in both clients handles this — **verify metadata shape matches
`PredictiveActionPayload` and that danger level styling (`safe`=green, `warning`=yellow, `dangerous`=red) renders correctly.**

---

## Phase 4 — Integration Test + Telemetry Verification

### Test Scenarios

| Scenario | Expected Result |
|----------|----------------|
| Send short message (< 3 chars) in DIRECT | No Whisper triggered |
| Send normal message in DIRECT | WhisperBar appears within 2s |
| Send message in GROUP | No Whisper triggered |
| Send image/voice in DIRECT | No Whisper triggered |
| Accept Whisper suggestion | `AiSuggestion.status = ACCEPTED`, `selectedIndex` set |
| Dismiss Whisper | `AiSuggestion.status = DISMISSED` |
| Tell Jarvis "帮我回复张总说周五开会没问题" | DraftCard appears |
| Tell Jarvis "天气怎么样" | Normal chat response, no DraftCard |
| Device command fails | Predictive card in Supervisor converse (within 3s) |
| Same device fails again within 60s | No second Predictive card |

### Telemetry Check

After running test scenarios, query DB:

```sql
SELECT type, status, COUNT(*) FROM "AiSuggestion" GROUP BY type, status;
```

Expected: WHISPER rows with mix of PENDING/ACCEPTED/DISMISSED. This confirms the learning
signal pipeline is working from day one.

---

## File Change Summary

| File | Change Type | Estimated Lines |
|------|-------------|----------------|
| `messages/messages.service.ts` | Add WhisperService injection + 10-line trigger | +15 |
| `ai/services/whisper.service.ts` | Add `shouldTrigger()` method | +12 |
| `agents/impl/supervisor.agent.ts` | Merge intent classification + draft routing | +25 |
| `agents/events/bot-event.listener.ts` | Add Predictive trigger + Redis rate limit | +20 |
| `desktop/.../WhisperBar.tsx` | WS event wiring + dismiss | +30 |
| `desktop/.../MessageInput.tsx` | Mount WhisperBar for DIRECT converses | +8 |
| `desktop/.../DraftCard.tsx` | Confirm WS wiring + approve/reject | +20 |
| `mobile/.../whisper_suggestions.dart` | WS event wiring + dismiss | +25 |
| `mobile/.../draft_card.dart` | Confirm WS wiring + approve/reject | +15 |
| `agents/agents.module.ts` | Add DraftService to providers | +3 |

**Total: ~10 files, ~170 net lines added**

---

## Key Principles (CTO Alignment)

1. **Quality gate before scale** — Whisper only fires when it has a reasonable chance of being useful
2. **Zero extra LLM cost for Draft** — intent classification merged into the existing generation call
3. **Rate limiting before shipping Predictive** — noisy AI is worse than no AI
4. **Telemetry from day one** — accept/reject signals are the foundation of v1.1 learning
5. **Both platforms are first-class** — Desktop is a full chat app, not a secondary surface
6. **Ship over polish** — wire the AI services first, visual design system in Sprint 7
