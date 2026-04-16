# LinkingChat Iteration Plan

> **Aligned via Steve Jobs Product Review, 2026-04-16**
>
> **Product essence:** AI-native WeChat + Jarvis. Interface clones WeChat (zero barrier), but every social interaction has AI woven in. Target: everyone, not just engineers.

---

## Current State Assessment (2026-04-16)

### What's solid
- IM foundation: 1-on-1 chat, groups, friends, presence, read receipts, voice messages, i18n (zh/en)
- Auth: JWT RS256, email verification, password reset
- Remote execution: OpenClaw integration, Desktop command execution
- Backend: 22 NestJS modules, 35+ test files (11,892 LOC tests), clean Prisma schema
- Clients: Flutter mobile + Electron desktop, both functional
- Protocol: ws-protocol package (typed Socket.IO events, Zod validators) — exemplary

### What's broken
- **Jarvis is asleep.** The three core AI services are code-complete but not wired into real user flows:
  - `WhisperService` — manual button trigger only (should auto-trigger on every received message)
  - `DraftService` — test endpoint only (should trigger from Bot conversations)
  - `PredictiveService` — `detectTrigger()` never called (should trigger from device execution errors)
- No "AI presence" — app looks and feels like a plain chat software
- No design system — hand-written CSS, hardcoded dark theme, no animations
- Frontend test coverage near zero (Desktop: 6 files, Mobile: 1 file)

### What to cut
| Cut | Reason |
|-----|--------|
| Voice/video calling | WebRTC is massive engineering; users will call on WeChat/FaceTime |
| Multiple Bot types in MVP | One Jarvis done well > ten mediocre bots. Coding Bot deferred to v1.x |
| Bot marketplace / custom bots | v2.0 feature. Focus on the single Jarvis experience |

### What NOT to cut
| Keep | Reason |
|------|--------|
| Flutter mobile | Primary interface. Most people chat on phones |
| Desktop (Electron) | Must reach WeChat-for-Mac level. Product experience needs both ends |
| IM basics (voice msg, groups, i18n) | Baseline expectation. If worse than WeChat, nobody stays for the AI |
| Engineering refactoring | Keep going. Code health supports velocity |

---

## Sprint 6: Wake Up Jarvis (Target: 2 weeks)

**Goal:** User opens LinkingChat, receives a message, and immediately feels: "There's an AI here."

### Task 6.1: Whisper Auto-Trigger [P0 — AI-native soul]

**Problem:** WhisperService exists but only fires when user manually clicks an AI button. Users never feel AI presence.

**Target behavior:** When user receives a new message in any 1-on-1 or group conversation, Jarvis automatically generates 1 best reply suggestion + 2 alternatives. Suggestions appear below the input box — quiet, non-intrusive, dismissable.

**Server changes:**
- File: `apps/server/src/ai/services/whisper.service.ts`
- File: `apps/server/src/gateway/chat.gateway.ts`
- Wire: On `message:new` event, if the message is not from the current user, emit a background `whisper:generate` job
- Use DeepSeek (fast, cheap) for suggestion generation
- Add rate limiting: max 1 Whisper per conversation per 10 seconds (avoid spam)
- Add user preference: `whisperEnabled` flag (opt-out, default on)

**Client changes (Desktop):**
- File: `apps/desktop/src/renderer/components/chat/MessageInput.tsx`
- File: `apps/desktop/src/renderer/components/chat/WhisperBar.tsx`
- Wire: Listen for `ai:whisper:suggestions` WS event, display WhisperBar below input
- Add subtle fade-in animation (200ms) when suggestions appear
- Add dismiss button (X) — dismissed suggestions don't reappear for that message

**Client changes (Mobile):**
- File: `apps/mobile/lib/features/chat/widgets/whisper_suggestions.dart`
- Wire: Same WS event listener, same UI behavior

**Tests:**
- Server: Test that `message:new` triggers whisper generation (unit test)
- Server: Test rate limiting (no double-fire within 10s)
- Server: Test opt-out respected

**Acceptance criteria:**
- [ ] User receives message → within 2 seconds, suggestion appears below input
- [ ] Suggestion is contextually relevant (based on last 20 messages)
- [ ] User can tap suggestion to fill input → edit → send
- [ ] User can dismiss suggestion
- [ ] Works on both Desktop and Mobile

### Task 6.2: Draft & Verify in Bot Conversations [P0]

**Problem:** DraftService exists but is only reachable via test endpoint `POST /api/v1/ai/test/draft`. Real Bot conversations don't generate drafts.

**Target behavior:** User sends a message to Jarvis (Supervisor Bot) like "帮我回复张总，说周五开会没问题" → Jarvis generates a polished draft → draft appears as a DraftCard in the chat → user reviews, edits, approves → message sent to target conversation.

**Server changes:**
- File: `apps/server/src/agents/impl/supervisor.agent.ts`
- File: `apps/server/src/ai/services/draft.service.ts`
- File: `apps/server/src/agents/events/bot-event.listener.ts`
- Wire: When BotEventListener receives a user message to Supervisor Bot, detect intent:
  - If intent is "draft a message for someone" → call `draftService.createDraft()`
  - If intent is "execute a command" → existing OpenClaw flow
  - If intent is general chat → existing LLM response flow
- Intent detection: Use LLM (DeepSeek) to classify: `{type: 'draft' | 'execute' | 'chat', target?: string, content?: string}`

**Client changes (Desktop):**
- File: `apps/desktop/src/renderer/components/chat/DraftCard.tsx` (already exists)
- Wire: Ensure `ai:draft:created` WS event renders DraftCard in ChatThread
- Wire: Approve/reject buttons emit `ai:draft:approve` / `ai:draft:reject` events

**Client changes (Mobile):**
- File: `apps/mobile/lib/features/chat/widgets/draft_card.dart` (already exists)
- Same wiring as desktop

**Tests:**
- Server: Test intent classification ("帮我回复张总" → draft type)
- Server: Test draft creation flow end-to-end
- Server: Test draft approval → message sent to target conversation

**Acceptance criteria:**
- [ ] User sends "帮我回复张总说周五开会没问题" to Jarvis
- [ ] DraftCard appears with polished text
- [ ] User approves → message appears in target conversation
- [ ] User can edit draft before approving
- [ ] User can reject draft (no action taken)

### Task 6.3: Predictive Actions Wiring [P1 — can follow after 6.1+6.2]

**Problem:** PredictiveService's `detectTrigger()` is never called.

**Target behavior:** When a device command execution fails (error output), Jarvis automatically analyzes the error and suggests fix actions.

**Server changes:**
- File: `apps/server/src/gateway/device.gateway.ts`
- File: `apps/server/src/ai/services/predictive.service.ts`
- Wire: On `command:result` event with error status, call `predictiveService.detectTrigger()`

**Client changes:**
- PredictiveActionCard already exists on both platforms
- Wire: Ensure `ai:predictive:actions` WS event renders cards

**Tests:**
- Server: Test error output → predictive trigger
- Server: Test blacklist blocks dangerous suggestions

**Acceptance criteria:**
- [ ] Command fails → predictive action card appears within 3 seconds
- [ ] Safe actions shown as green, risky as yellow
- [ ] Dangerous commands blocked entirely

---

## Sprint 7: Design System + AI Presence (Target: 1-2 weeks)

**Goal:** Users visually feel that this is not a plain chat app — Jarvis has a visible presence.

### Task 7.1: Design System Foundation

**Current state:** Hand-written CSS, hardcoded colors (#1a1a2e), no animations, no consistent spacing.

**Target:**
- Choose UI foundation: shadcn/ui or custom design tokens
- Define: 5 colors (primary, secondary, surface, text, AI-accent), 2 fonts, spacing scale
- Create: `apps/desktop/src/renderer/styles/tokens.css` (CSS custom properties)
- Create: `apps/mobile/lib/core/theme/` (Flutter ThemeData)
- Both platforms share the same visual identity

**Deliverables:**
- [ ] Design token files (Desktop CSS + Mobile Flutter theme)
- [ ] All existing CSS migrated to use tokens
- [ ] Light/dark mode support (dark default)

### Task 7.2: AI Presence Visual Language

**This is what makes LinkingChat look different from WeChat.**

- **Whisper glow:** When suggestions appear, input area gets a subtle AI-accent border glow (soft purple/blue)
- **Bot thinking indicator:** When Jarvis is processing, show a breathing-light animation (not just "typing...")
- **Draft slide-in:** DraftCard appears with a smooth slide-up + fade-in (300ms)
- **Predictive pulse:** Action buttons have a subtle pulse animation to draw attention

**Deliverables:**
- [ ] Whisper appearance animation (fade-in 200ms + border glow)
- [ ] Bot thinking animation (breathing dots / ripple effect)
- [ ] DraftCard entrance animation
- [ ] PredictiveActionCard pulse

### Task 7.3: Component Refactoring

Split oversized components for maintainability:

| Component | Lines | Action |
|-----------|-------|--------|
| `GroupPanel.tsx` | 706 | Split into MemberList, GroupSettings, GroupInfo |
| `ChatThread.tsx` | 513 | Extract MessageBubble, MessageList |
| `MessageInput.tsx` | 408 | Extract WhisperArea, BotInputRouter |

---

## Sprint 8: WeChat-Level Polish (Target: 2 weeks)

**Goal:** Base IM experience is at least as smooth as WeChat.

### Task 8.1: Toast Notifications & Error Handling
- Replace console.log with proper toast notifications (react-hot-toast or similar)
- Error states visible to users, not hidden in DevTools
- Fix `console.log` in redis.module.ts and redis-io.adapter.ts → use Logger

### Task 8.2: Loading States & Empty States
- Conversation list: skeleton loading on first load
- Chat thread: message loading indicator
- Empty conversation: friendly illustration + "Start chatting" prompt
- Network error: retry button + offline indicator

### Task 8.3: Mobile Environment Config
- Replace hardcoded server URL with environment config
- Support dev / staging / production environments
- Proper build flavors (Flutter --dart-define)

### Task 8.4: Frontend Test Coverage
- **Target: 60%+ for critical paths**
- Desktop: Add tests for Zustand stores (chatStore, aiStore, friendsStore)
- Desktop: Add tests for IPC handlers
- Desktop: Add tests for Socket.IO connection lifecycle
- Mobile: Add widget tests for chat screens
- Mobile: Add provider tests for Riverpod state

### Task 8.5: Performance Polish
- Message list: virtual scrolling for long conversations
- Image lazy loading
- WebSocket reconnection handling (graceful)
- Whisper debouncing (don't fire during rapid message bursts)

---

## Sprint 9: Production Deployment (Target: 1-2 weeks)

### Task 9.1: Cloud Deployment
- Docker Compose production config (NestJS + PostgreSQL + Redis + MinIO)
- Nginx reverse proxy + SSL (Let's Encrypt)
- Health check endpoints
- Prometheus metrics protection

### Task 9.2: Desktop Packaging
- Extract hardcoded URLs to config
- Build Windows (NSIS) and macOS (DMG) installers
- Auto-update mechanism (Electron updater)
- OpenClaw sidecar bundling

### Task 9.3: Mobile App Distribution
- Flutter build for iOS (TestFlight) and Android (APK / Play Store internal)
- Deep linking setup
- Push notifications (FCM/APNs)

### Task 9.4: Security Hardening
- Rate limiting on all API endpoints
- CORS configuration for production
- Secret rotation procedure
- Penetration testing checklist

---

## Sprint 10+: Growth & Iteration

### v1.1: Whisper Intelligence
- Learn from user's accept/reject patterns → better suggestions over time
- Context-aware tone (formal for boss, casual for friends)
- Multi-language support (suggestions in user's preferred language)

### v1.2: Ghost Text (灰体补全)
- Input box shows gray suggestion text after 2s pause
- Tab to accept (like VS Code Copilot)
- Requires local small model for low latency

### v1.x: Additional Bot Types
- Coding Bot (code execution, DevOps tasks)
- Social Media Bot (cross-post, schedule)
- Data Analysis Bot (SQL queries, visualization)

### v2.0: Bot Marketplace
- User-created bots
- Community marketplace
- Revenue sharing model

---

## Competitive Positioning

| Competitor | Social | AI in Social | Our Advantage |
|-----------|--------|-------------|---------------|
| **WeChat** | Dominant | Almost none | WeChat will never add AI to core chat (too conservative) |
| **Telegram** | Strong | Bots (bolt-on) | Their AI is "added beside chat", ours is "woven into chat" |
| **Character.AI** | None | AI conversation | They do human-AI chat, we do AI-assisted human-human chat |
| **ChatGPT app** | None | Strong | Tool, not social. Nobody chats with friends in ChatGPT |
| **Discord** | Gaming | Bots | Gaming community focus, not general social |

**Our unique position:** The only app where AI improves real human-to-human conversations (not human-to-AI).

---

## Key Metrics to Track

| Metric | Target | Why |
|--------|--------|-----|
| Whisper Accept Rate | >30% | If <30%, suggestions aren't good enough |
| Draft-to-Send Rate | >60% | If <60%, drafts need quality improvement |
| Whisper Latency | <2 seconds | Users won't wait longer for suggestions |
| Daily AI-Assisted Conversations | Growing week-over-week | AI penetration into social interactions |
| Message Send Rate (vs WeChat baseline) | Comparable | Base IM must not be worse than WeChat |

---

## Principles (from Jobs Review alignment)

1. **Jarvis first, features second.** Every sprint, ask: "Does this make Jarvis feel more present?" If no, deprioritize.
2. **WeChat baseline, AI ceiling.** Base experience must match WeChat. AI is the differentiator, not a replacement for good IM.
3. **Both platforms matter.** Mobile is primary interface, Desktop is where work happens. Both need to reach WeChat-level quality.
4. **One Jarvis, done well.** MVP = one Supervisor Bot. Don't add Coding Bot until Supervisor is magical.
5. **Honest status tracking.** Don't mark "✅ done" until the feature is wired end-to-end and a real user can experience it.
6. **Ship over polish.** Wire AI services first, refactor code second. A working Jarvis in ugly UI > beautiful UI with sleeping Jarvis.
