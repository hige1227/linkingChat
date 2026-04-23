# Graph Report - .  (2026-04-24)

## Corpus Check
- Large corpus: 1262 files · ~546,210 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 1077 nodes · 1707 edges · 76 communities detected
- Extraction: 81% EXTRACTED · 19% INFERRED · 0% AMBIGUOUS · INFERRED: 316 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `ConversesService` - 22 edges
2. `OpenClawProcessService` - 21 edges
3. `WsClientService` - 19 edges
4. `ChatGateway` - 18 edges
5. `OpenClawWsClient` - 17 edges
6. `ConversesController` - 15 edges
7. `build_overview()` - 13 edges
8. `build_visuals()` - 13 edges
9. `AuthService` - 13 edges
10. `AgentWorkspaceService` - 13 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "apps/server/src"
Cohesion: 0.04
Nodes (28): AddMembersDto, AgentsModule, AiModule, BanMemberDto, BotsModule, ConversesModule, makeMemberData(), mockUser() (+20 more)

### Community 1 - "apps/desktop/src/renderer"
Cohesion: 0.03
Nodes (15): getMuteMinutes(), getToken(), handleAddMembers(), handleBan(), handleDeleteGroup(), handleLeaveGroup(), handleMute(), handleRemoveMember() (+7 more)

### Community 2 - "desktop & server"
Cohesion: 0.04
Nodes (18): AiGatewayController, AiGatewayGuard, AiGatewayModule, AuthStore, CommandExecutor, LlmMessageDto, LlmProxyDto, OpenClawAdapter (+10 more)

### Community 3 - "server & desktop"
Cohesion: 0.03
Nodes (20): AppController, AppModule, AppService, ConfigController, AppConfigModule, ConfirmUploadDto, EmailVerifiedGuard, GatewayManagerService (+12 more)

### Community 4 - "apps/server/src"
Cohesion: 0.05
Nodes (10): AuthController, AuthModule, AuthService, BotInitService, JwtStrategy, LoginDto, MailModule, MailService (+2 more)

### Community 5 - "apps/server/src"
Cohesion: 0.06
Nodes (6): CommandsService, DeviceGateway, isDangerousCommand(), DevicesController, DevicesModule, DevicesService

### Community 6 - "docs/ppt/gen ppt.py"
Cohesion: 0.11
Nodes (37): _add_multiline(), _add_slide(), _add_text(), _arrow_right(), build_overview(), build_visuals(), _card_with_label(), _corner_marks() (+29 more)

### Community 7 - "apps/mobile"
Cohesion: 0.11
Nodes (16): Create(), Destroy(), EnableFullDpiSupportIfAvailable(), GetClientArea(), GetThisFromHandle(), GetWindowClass(), MessageHandler(), OnCreate() (+8 more)

### Community 8 - "server & mobile"
Cohesion: 0.09
Nodes (3): RedisIoAdapter, GetCommandLineArguments(), Utf8FromUtf16()

### Community 9 - "apps/server/src/converses/converses.service.ts"
Cohesion: 0.14
Nodes (1): ConversesService

### Community 10 - "apps/desktop/src/main/services/openclaw process.service.ts"
Cohesion: 0.18
Nodes (1): OpenClawProcessService

### Community 11 - "apps/desktop/src/main/services/ws client.service.ts"
Cohesion: 0.16
Nodes (1): WsClientService

### Community 12 - "apps/server/src/gateway/chat.gateway.ts"
Cohesion: 0.13
Nodes (1): ChatGateway

### Community 13 - "apps/desktop/src/main/services/openclaw ws client.ts"
Cohesion: 0.19
Nodes (1): OpenClawWsClient

### Community 14 - "apps/server/src/converses/converses.controller.ts"
Cohesion: 0.13
Nodes (1): ConversesController

### Community 15 - "apps/server/coverage/lcov report/sorter.js"
Cohesion: 0.27
Nodes (11): addSortIndicators(), enableUI(), getNthColumn(), getTable(), getTableBody(), getTableHeader(), loadColumns(), loadData() (+3 more)

### Community 16 - "apps/server/src/agents/core/workspace.service.ts"
Cohesion: 0.31
Nodes (1): AgentWorkspaceService

### Community 17 - "apps/server/src/upload/upload.service.ts"
Cohesion: 0.29
Nodes (1): UploadService

### Community 18 - "server & desktop"
Cohesion: 0.21
Nodes (1): AiGatewayService

### Community 19 - "apps/server/src/agents/core/memory.service.ts"
Cohesion: 0.3
Nodes (1): AgentMemoryService

### Community 20 - "apps/server/coverage/lcov report/prettify.js"
Cohesion: 0.35
Nodes (8): a(), B(), D(), g(), i(), k(), Q(), y()

### Community 21 - "apps/server/src/bots/bot communication.service.ts"
Cohesion: 0.27
Nodes (1): BotCommunicationService

### Community 22 - "apps/server/src/bots/bots.service.ts"
Cohesion: 0.27
Nodes (1): BotsService

### Community 23 - "apps/server/src/messages/messages.service.ts"
Cohesion: 0.29
Nodes (1): MessagesService

### Community 24 - "apps/server/src/agents/impl/supervisor.agent.ts"
Cohesion: 0.33
Nodes (1): SupervisorAgent

### Community 25 - "apps/server/src/ai/services/predictive.service.ts"
Cohesion: 0.25
Nodes (1): PredictiveService

### Community 26 - "apps/server/src/ai/services/draft.service.ts"
Cohesion: 0.31
Nodes (1): DraftService

### Community 27 - "apps/server/src/users"
Cohesion: 0.2
Nodes (3): UsersController, UsersModule, UsersService

### Community 28 - "apps/server/src/friends/friends.service.ts"
Cohesion: 0.27
Nodes (1): FriendsService

### Community 29 - "apps/server/src/gateway/broadcast.service.ts"
Cohesion: 0.38
Nodes (1): BroadcastService

### Community 30 - "apps/desktop/src/main/services/hermes process.service.ts"
Cohesion: 0.38
Nodes (1): HermesProcessService

### Community 31 - "apps/desktop/src/main/services/openclaw client.service.ts"
Cohesion: 0.24
Nodes (1): OpenClawClientService

### Community 32 - "apps/server/src/bots/bots.controller.ts"
Cohesion: 0.2
Nodes (1): BotsController

### Community 33 - "apps/server/src/ai/services/whisper.service.ts"
Cohesion: 0.31
Nodes (1): WhisperService

### Community 34 - "apps/server/src/gateway/presence.service.ts"
Cohesion: 0.2
Nodes (1): PresenceService

### Community 35 - "apps/server/src/agents/orchestrator/agent orchestrator.se..."
Cohesion: 0.25
Nodes (1): AgentOrchestratorService

### Community 36 - "apps/server/src/friends/friends.controller.ts"
Cohesion: 0.22
Nodes (1): FriendsController

### Community 37 - "apps/server/src/openclaw/strategies"
Cohesion: 0.25
Nodes (1): SingleContainerStrategy

### Community 38 - "apps/server/src/mentions/mentions.service.ts"
Cohesion: 0.36
Nodes (1): MentionService

### Community 39 - "apps/server/src/ai/ai.controller.ts"
Cohesion: 0.25
Nodes (1): AiController

### Community 40 - "apps/server/src/messages/messages.controller.ts"
Cohesion: 0.29
Nodes (1): MessagesController

### Community 41 - "apps/server/src/agents/events/batch trigger.service.ts"
Cohesion: 0.38
Nodes (1): BatchTriggerService

### Community 42 - "apps/server/src/common/interceptors"
Cohesion: 0.29
Nodes (1): LoggingInterceptor

### Community 43 - "apps/server/src/ai/services/llm router.service.ts"
Cohesion: 0.48
Nodes (1): LlmRouterService

### Community 44 - "apps/desktop/src/main/agents/agent provider.factory.ts"
Cohesion: 0.53
Nodes (1): AgentProviderFactory

### Community 45 - "apps/desktop/src/main/agents/hermes.adapter.ts"
Cohesion: 0.47
Nodes (1): HermesAdapter

### Community 46 - "apps/server/src/metrics"
Cohesion: 0.33
Nodes (2): MetricsController, MetricsModule

### Community 47 - "apps/server/src/ai/providers/kimi.provider.ts"
Cohesion: 0.53
Nodes (1): KimiProvider

### Community 48 - "apps/server/src/ai/providers/deepseek.provider.ts"
Cohesion: 0.53
Nodes (1): DeepSeekProvider

### Community 49 - "scripts/check ws coverage.ts"
Cohesion: 0.8
Nodes (4): extractDesktopEvents(), extractMobileEvents(), main(), readFile()

### Community 50 - "packages/ws protocol/src"
Cohesion: 0.4
Nodes (0): 

### Community 51 - "apps/server/coverage/lcov report/block navigation.js"
Cohesion: 0.7
Nodes (4): goToNext(), goToPrevious(), makeCurrent(), toggleClass()

### Community 52 - "apps/mobile"
Cohesion: 0.5
Nodes (2): GeneratedPluginRegistrant, -registerWithRegistry

### Community 53 - "apps/server/src/metrics/metrics.service.ts"
Cohesion: 0.5
Nodes (1): MetricsService

### Community 54 - "apps/server/src/agents/events/bot event.listener.ts"
Cohesion: 0.5
Nodes (1): BotEventListener

### Community 55 - "apps/server/src/agents/interfaces"
Cohesion: 0.5
Nodes (0): 

### Community 56 - "apps/mobile/ios/Flutter/ephemeral/flutter lldb helper.py"
Cohesion: 0.5
Nodes (2): handle_new_rx_page(), Intercept NOTIFY_DEBUGGER_ABOUT_RX_PAGES and touch the pages.

### Community 57 - "apps/server/prisma/seed.ts"
Cohesion: 1.0
Nodes (0): 

### Community 58 - "apps/server/src/messages/dto/search messages.dto.ts"
Cohesion: 1.0
Nodes (1): SearchMessagesDto

### Community 59 - "apps/server/src/messages/dto/message response.dto.ts"
Cohesion: 1.0
Nodes (1): MessageResponseDto

### Community 60 - " verify sprint2.ps1"
Cohesion: 1.0
Nodes (0): 

### Community 61 - " update.ps1"
Cohesion: 1.0
Nodes (0): 

### Community 62 - "prepare openclaw sidecar.ps1"
Cohesion: 1.0
Nodes (0): 

### Community 63 - "bot notification"
Cohesion: 1.0
Nodes (0): 

### Community 64 - "user.schema"
Cohesion: 1.0
Nodes (0): 

### Community 65 - "bot.schema"
Cohesion: 1.0
Nodes (0): 

### Community 66 - "group.schema"
Cohesion: 1.0
Nodes (0): 

### Community 67 - "device.schema"
Cohesion: 1.0
Nodes (0): 

### Community 68 - "bot notification.schema"
Cohesion: 1.0
Nodes (0): 

### Community 69 - "validators"
Cohesion: 1.0
Nodes (0): 

### Community 70 - "events"
Cohesion: 1.0
Nodes (0): 

### Community 71 - "electron.vite.config"
Cohesion: 1.0
Nodes (0): 

### Community 72 - "env.d"
Cohesion: 1.0
Nodes (0): 

### Community 73 - "jest.integration.config"
Cohesion: 1.0
Nodes (0): 

### Community 74 - "bot response.dto"
Cohesion: 1.0
Nodes (0): 

### Community 75 - "validator compat.spec"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **67 isolated node(s):** `LinkingChat PPT Generator — "Hermès Tech" Design System Generates two presentati`, `Strict color + typography tokens.`, `Lock background on every slide layout via the slide master.`, `Explicitly set individual slide background (belt-and-suspenders).`, `Add a blank slide with background applied.` (+62 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `apps/server/prisma/seed.ts`** (2 nodes): `seed.ts`, `main()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `apps/server/src/messages/dto/search messages.dto.ts`** (2 nodes): `search-messages.dto.ts`, `SearchMessagesDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `apps/server/src/messages/dto/message response.dto.ts`** (2 nodes): `message-response.dto.ts`, `MessageResponseDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community ` verify sprint2.ps1`** (1 nodes): `_verify_sprint2.ps1`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community ` update.ps1`** (1 nodes): `_update.ps1`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `prepare openclaw sidecar.ps1`** (1 nodes): `prepare-openclaw-sidecar.ps1`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `bot notification`** (1 nodes): `bot-notification.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `user.schema`** (1 nodes): `user.schema.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `bot.schema`** (1 nodes): `bot.schema.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `group.schema`** (1 nodes): `group.schema.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `device.schema`** (1 nodes): `device.schema.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `bot notification.schema`** (1 nodes): `bot-notification.schema.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `validators`** (1 nodes): `validators.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `events`** (1 nodes): `events.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `electron.vite.config`** (1 nodes): `electron.vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `env.d`** (1 nodes): `env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `jest.integration.config`** (1 nodes): `jest.integration.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `bot response.dto`** (1 nodes): `bot-response.dto.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `validator compat.spec`** (1 nodes): `validator-compat.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ConversesService` connect `apps/server/src/converses/converses.service.ts` to `apps/server/src`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `OpenClawProcessService` connect `apps/desktop/src/main/services/openclaw process.service.ts` to `desktop & server`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `WsClientService` connect `apps/desktop/src/main/services/ws client.service.ts` to `desktop & server`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `LinkingChat PPT Generator — "Hermès Tech" Design System Generates two presentati`, `Strict color + typography tokens.`, `Lock background on every slide layout via the slide master.` to the rest of the system?**
  _67 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `apps/server/src` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `apps/desktop/src/renderer` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `desktop & server` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._