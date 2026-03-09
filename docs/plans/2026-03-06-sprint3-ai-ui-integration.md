# Sprint 3 — AI Module UI Integration Plan

> Date: 2026-03-06
> Status: Planning
> Scope: Server WS handlers + Flutter Mobile AI UI (Phase 0–4), Desktop port deferred (Phase 5)

## 1. Background

Sprint 3 backend AI services are **fully implemented** on the NestJS server:

| Service | Location | Status |
|---------|----------|--------|
| WhisperService (The Whisper / @ai suggestions) | `apps/server/src/ai/services/whisper.service.ts` | Done |
| DraftService (Draft & Verify state machine) | `apps/server/src/ai/services/draft.service.ts` | Done |
| PredictiveService (Predictive Actions) | `apps/server/src/ai/services/predictive.service.ts` | Done |
| LlmRouterService (multi-provider routing) | `apps/server/src/ai/services/llm-router.service.ts` | Done |
| SupervisorAgent (notification aggregation) | `apps/server/src/agents/impl/supervisor.agent.ts` | Done |
| WS Protocol types | `packages/ws-protocol/src/payloads/ai.payloads.ts` | Done |
| WS Event constants | `packages/ws-protocol/src/events.ts` → `AI_EVENTS` | Done |

**Gap:** Neither Flutter mobile nor Electron desktop has any AI UI code. The server's `ChatGateway` also lacks `@SubscribeMessage` handlers for client→server AI events (approve, reject, accept, etc.).

## 2. Strategy

**Flutter Mobile first**, then port to Electron Desktop. Server handlers are shared and done first as Phase 0 (blocker).

## 3. WS Protocol Reference

All types already defined in `packages/ws-protocol/src/`:

### Events (`AI_EVENTS`)

```
Server → Client (broadcasts):
  ai:whisper:suggestions    — 1 primary + 2 alternative reply suggestions
  ai:draft:created          — New draft awaiting user action
  ai:draft:expired          — Draft TTL expired (5 min)
  ai:predictive:action      — Error-triggered action card

Client → Server:
  ai:whisper:accept         — User accepted a suggestion
  ai:draft:approve          — User approved draft
  ai:draft:reject           — User rejected draft
  ai:draft:edit             — User edited and approved draft
  ai:predictive:execute     — User executed a predictive action
  ai:predictive:dismiss     — User dismissed action card
```

### Key Payload Types

```typescript
// Whisper
WhisperSuggestionsPayload {
  suggestionId: string;
  converseId: string;
  messageId: string;
  primary: string;           // 推荐的最佳回复
  alternatives: string[];    // 2 个备选方案
  createdAt: string;
}

// Draft & Verify
DraftCreatedPayload {
  draftId: string;
  converseId: string;
  botId: string;
  botName: string;
  draftType: 'message' | 'command';
  draftContent: { content: string; action?: string; args?: Record<string, unknown> };
  expiresAt: string;         // 5 分钟后过期
  createdAt: string;
}

// Predictive Actions
PredictiveActionPayload {
  suggestionId: string;
  converseId: string;
  trigger: string;           // 触发描述（如 "npm ERR! ..."）
  actions: PredictiveAction[];
  createdAt: string;
}

PredictiveAction {
  type: 'shell' | 'message' | 'file';
  action: string;
  description: string;
  dangerLevel: 'safe' | 'warning' | 'dangerous';
}
```

---

## 4. Implementation Phases

### Phase 0: Server — ChatGateway AI Event Handlers

**Why:** `ChatGateway` (`apps/server/src/gateway/chat.gateway.ts`) currently has zero AI handlers. Server→client broadcasts work (via `BroadcastService.toRoom()`), but clients cannot send approve/reject/accept events back.

**Files to modify:**

| File | Change |
|------|--------|
| `apps/server/src/gateway/gateway.module.ts` | Add `AiModule` to `imports` array |
| `apps/server/src/gateway/chat.gateway.ts` | Inject `WhisperService`, `DraftService`, `PredictiveService`; add 6 `@SubscribeMessage` handlers |

**New `@SubscribeMessage` handlers:**

| Event | Service Call |
|-------|-------------|
| `ai:whisper:accept` | `whisperService.acceptSuggestion(userId, data.suggestionId, data.selectedIndex)` |
| `ai:draft:approve` | `draftService.approveDraft(userId, data.draftId)` |
| `ai:draft:reject` | `draftService.rejectDraft(userId, data.draftId, data.reason)` |
| `ai:draft:edit` | `draftService.editAndApproveDraft(userId, data.draftId, data.editedContent)` |
| `ai:predictive:execute` | `predictiveService.executeAction(userId, data.suggestionId, data.actionIndex)` |
| `ai:predictive:dismiss` | `predictiveService.dismissAction(userId, data.suggestionId)` |

Note: `ai:whisper:request` 不需要 — Whisper 在用户发送包含 `@ai` 的消息时由 `MessagesService.create()` 自动触发。

**New test:** `apps/server/src/gateway/__tests__/chat.gateway.ai.spec.ts`

**Verification:** `cd apps/server && npx jest chat.gateway.ai`

---

### Phase 1: Whisper (The Whisper / @ai suggestions) — Flutter Mobile

**UX 规范 (from CLAUDE.md):**
> User triggers via `@ai` → cloud generates 1 best reply (pre-filled in input) + `···` to expand 2 alternatives.

**Flow:**
```
User sends "@ai how to fix this?" → normal POST /api/v1/messages
  → Server MessagesService detects @ai → WhisperService.handleWhisperTrigger() (async, fire-and-forget)
  → LLM (DeepSeek, 2s timeout) generates suggestions
  → Store in AiSuggestion table
  → BroadcastService.toRoom(`u-{userId}`, 'ai:whisper:suggestions', payload)
  → Client receives event → WhisperNotifier updates state
  → WhisperSuggestions widget appears above input bar
  → User taps chip → text pre-fills into MessageInput
  → User sends message normally (or edits first)
  → Client emits 'ai:whisper:accept' to server for tracking
```

**New files:**

| File | Purpose |
|------|---------|
| `apps/mobile/lib/core/constants/ai_events.dart` | AI event name constants (mirrors `AI_EVENTS` from ws-protocol) |
| `apps/mobile/lib/features/chat/providers/whisper_provider.dart` | Riverpod `StateNotifierProvider.family<WhisperNotifier, WhisperState, String>` keyed by converseId |
| `apps/mobile/lib/features/chat/widgets/whisper_suggestions.dart` | Suggestion bar widget: primary chip + `···` expand button + `×` dismiss |

**Modified files:**

| File | Change |
|------|--------|
| `apps/mobile/lib/core/network/chat_socket_service.dart` | Add AI events to `chatEvents` list (line 77–94). Add emit helpers for all 6 C→S events |
| `apps/mobile/lib/features/chat/widgets/message_input.dart` | Add `prefillText` callback — when Whisper accepted, pre-fill `TextEditingController` |
| `apps/mobile/lib/features/chat/pages/chat_thread_page.dart` | Watch `whisperProvider(converseId)`, render `WhisperSuggestions` between `TypingIndicator` and `MessageInput` |

**WhisperState:**
```dart
class WhisperState {
  final String? suggestionId;
  final String? primary;           // 推荐回复文本
  final List<String> alternatives; // 2 个备选
  final bool showAlternatives;     // 展开/折叠
}
```

**Key design:** If user is already typing when suggestions arrive, do NOT replace text. Only show bar — user must explicitly tap to accept.

**Verification:** Start server → send `@ai help` → verify bar appears <2s → tap → verify pre-fill

---

### Phase 2: Draft & Verify — Flutter Mobile

**UX 规范:**
> Bot generates draft → user confirms before execution. Bot never acts autonomously.

**Flow:**
```
Bot pipeline creates draft → DraftService.createDraft()
  → LLM (Kimi) generates content → Store AiDraft (PENDING, 5min TTL)
  → BroadcastService.toRoom(`u-{userId}`, 'ai:draft:created', payload)
  → Client receives → DraftNotifier adds to state
  → DraftCard appears in chat with countdown timer
  → User taps:
    [Approve] → emit 'ai:draft:approve' → server executes content
    [Edit]    → inline editor opens → emit 'ai:draft:edit' → server executes edited
    [Reject]  → emit 'ai:draft:reject' → card grays out
  → Timer reaches 0 → server broadcasts 'ai:draft:expired' → card grays out
```

**New files:**

| File | Purpose |
|------|---------|
| `apps/mobile/lib/features/chat/providers/draft_provider.dart` | Riverpod `StateNotifierProvider.family` for drafts per converseId |
| `apps/mobile/lib/features/chat/widgets/draft_card.dart` | Draft card with bot name, content, countdown, 3 action buttons |

**Modified files:**

| File | Change |
|------|--------|
| `apps/mobile/lib/features/chat/pages/chat_thread_page.dart` | Watch `draftProvider(converseId)`, render `DraftCard` widgets above message list |

**DraftCard widget spec:**
- **Header:** Bot avatar + "Draft from {botName}"
- **Content:** Message text; for `draftType: 'command'` → monospace code block
- **Timer:** `mm:ss` countdown via `Timer.periodic(Duration(seconds: 1))`, from `expiresAt - now`
- **Buttons:** `[✓ Approve]` green, `[✎ Edit]` blue, `[✕ Reject]` red
- **Edit flow:** Tap Edit → inline editor expands with draft content → user modifies → Save → emit `ai:draft:edit`
- **Visual states:**
  - `PENDING` — active, normal colors
  - `APPROVED` — green check overlay, buttons disabled
  - `REJECTED` — gray overlay, shows reject reason
  - `EXPIRED` — gray overlay + "Expired" badge

**Verification:** Use `POST /api/v1/ai/test/draft` → verify card → test Approve/Reject/Edit → wait 5min → verify Expired

---

### Phase 3: Predictive Actions — Flutter Mobile

**UX 规范:**
> Bot analyzes context (e.g., shell errors) → generates action card → dangerous commands blocked or flagged.

**Flow:**
```
Device command fails → DeviceGateway returns error result
  → PredictiveService.detectTrigger(output) matches error pattern
  → LLM (DeepSeek) generates action suggestions → classifyDangerLevel()
  → Store AiSuggestion (PREDICTIVE, PENDING)
  → BroadcastService.toRoom(`u-{userId}`, 'ai:predictive:action', payload)
  → Client receives → PredictiveNotifier adds to state
  → PredictiveActionCard appears in chat
  → User taps:
    Safe action → immediately emit 'ai:predictive:execute'
    Warning action → confirm dialog → emit 'ai:predictive:execute'
    Dangerous action → double-confirm dialog → emit 'ai:predictive:execute'
    Dismiss → emit 'ai:predictive:dismiss' → card removed
```

**New files:**

| File | Purpose |
|------|---------|
| `apps/mobile/lib/features/chat/providers/predictive_provider.dart` | Riverpod `StateNotifierProvider.family` per converseId |
| `apps/mobile/lib/features/chat/widgets/predictive_action_card.dart` | Action card with color-coded buttons |
| `apps/mobile/lib/features/chat/widgets/danger_confirm_dialog.dart` | AlertDialog for warning/dangerous actions |

**Modified files:**

| File | Change |
|------|--------|
| `apps/mobile/lib/features/chat/pages/chat_thread_page.dart` | Watch `predictiveProvider(converseId)`, render `PredictiveActionCard` |

**PredictiveActionCard spec:**
- **Header:** "Suggested Actions" + trigger description (error context)
- **Action list:** Each action shows icon + description + command (monospace for shell)
- **Color coding by `dangerLevel`:**
  - `safe` → green accent, tap executes immediately
  - `warning` → yellow/amber accent, tap shows DangerConfirmDialog ("Are you sure?")
  - `dangerous` → red accent, tap shows DangerConfirmDialog with explicit warning text
- **Dismiss:** Top-right X button

**Verification:** Use `POST /api/v1/ai/test/predictive` → verify card → test all 3 danger levels → test dismiss

---

### Phase 4: Wire NotificationCard Action Buttons — Flutter Mobile

**Why:** `NotificationCard` already exists for `BOT_NOTIFICATION` messages but action buttons are stubs (Sprint 2 comment: "操作按钮 UI 就绪，具体动作在 Sprint 3 实现").

| File | Change |
|------|--------|
| `apps/mobile/lib/features/chat/widgets/notification_card.dart` | Wire `_ActionButton.onPressed` to actual actions: `view_result` → GoRouter navigate to device result, `retry` → emit device command via WsService, `navigate` → GoRouter push |

---

### Phase 5 (Future): Electron Desktop Port

After Flutter Mobile phases 0–4 are verified, port all AI UI to Desktop:

| File | Change |
|------|--------|
| `apps/desktop/src/renderer/stores/aiStore.ts` | **New** — Zustand store for all AI state (whisper + draft + predictive) |
| `apps/desktop/src/renderer/components/chat/WhisperBar.tsx` | **New** — Suggestion bar component |
| `apps/desktop/src/renderer/components/chat/DraftCard.tsx` | **New** — Draft card component |
| `apps/desktop/src/renderer/components/chat/PredictiveActionCard.tsx` | **New** — Action card component |
| `apps/desktop/src/renderer/components/chat/ConfirmDialog.tsx` | **New** — Reusable confirm modal |
| `apps/desktop/src/renderer/hooks/useChatSocket.ts` | Add AI event listeners + emit helpers |
| `apps/desktop/src/renderer/components/chat/MessageInput.tsx` | Add `prefillText` prop |
| `apps/desktop/src/renderer/pages/ChatPage.tsx` | Add WhisperBar |
| `apps/desktop/src/renderer/components/chat/ChatThread.tsx` | Render draft/predictive cards |
| `apps/desktop/src/renderer/styles/chat.css` | AI component styles |
| `apps/desktop/src/renderer/components/NotificationCard.tsx` | Wire action buttons |

Reuses same server handlers from Phase 0. Mirrors Flutter widget logic in React + Zustand.

---

## 5. File Inventory (Phases 0–4)

### New Files (9)

| # | File | Phase |
|---|------|-------|
| 1 | `apps/server/src/gateway/__tests__/chat.gateway.ai.spec.ts` | 0 |
| 2 | `apps/mobile/lib/core/constants/ai_events.dart` | 1 |
| 3 | `apps/mobile/lib/features/chat/providers/whisper_provider.dart` | 1 |
| 4 | `apps/mobile/lib/features/chat/widgets/whisper_suggestions.dart` | 1 |
| 5 | `apps/mobile/lib/features/chat/providers/draft_provider.dart` | 2 |
| 6 | `apps/mobile/lib/features/chat/widgets/draft_card.dart` | 2 |
| 7 | `apps/mobile/lib/features/chat/providers/predictive_provider.dart` | 3 |
| 8 | `apps/mobile/lib/features/chat/widgets/predictive_action_card.dart` | 3 |
| 9 | `apps/mobile/lib/features/chat/widgets/danger_confirm_dialog.dart` | 3 |

### Modified Files (5)

| # | File | Phases |
|---|------|--------|
| 1 | `apps/server/src/gateway/gateway.module.ts` | 0 |
| 2 | `apps/server/src/gateway/chat.gateway.ts` | 0 |
| 3 | `apps/mobile/lib/core/network/chat_socket_service.dart` | 1 |
| 4 | `apps/mobile/lib/features/chat/widgets/message_input.dart` | 1 |
| 5 | `apps/mobile/lib/features/chat/pages/chat_thread_page.dart` | 1, 2, 3 |

### Enhanced Files (1)

| # | File | Phase |
|---|------|-------|
| 1 | `apps/mobile/lib/features/chat/widgets/notification_card.dart` | 4 |

---

## 6. Key Design Decisions

1. **Whisper pre-fill:** If user is already typing, do NOT auto-replace text. Only show suggestion bar — user must explicitly tap to accept.
2. **Draft cards position:** Pinned above message list (not inline). Always visible and actionable.
3. **Riverpod `.family` providers:** Per-converseId state. Switching conversations doesn't leak state across chats.
4. **All AI via WebSocket:** No REST endpoints for AI client↔server. `POST /api/v1/ai/test/*` endpoints are dev-only for manual testing.
5. **Flutter first:** Complete and verify mobile before porting to Desktop. Avoids context-switching overhead.

## 7. Verification Checklist

- [ ] **Phase 0:** `npx jest chat.gateway.ai` — all handler tests pass
- [ ] **Phase 1:** Send `@ai help` → suggestion bar appears <2s → tap → text pre-fills
- [ ] **Phase 2:** `POST /api/v1/ai/test/draft` → DraftCard appears → Approve/Reject/Edit work → Expired after 5min
- [ ] **Phase 3:** `POST /api/v1/ai/test/predictive` → action card appears → safe/warning/dangerous flows → dismiss
- [ ] **Phase 4:** Bot notification cards → action buttons trigger real actions
- [ ] **Regression:** `pnpm build && pnpm test` — all pass
