# Graph Report - .  (2026-04-15)

## Corpus Check
- Large corpus: 392 files · ~407,737 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 1084 nodes · 1524 edges · 177 communities detected
- Extraction: 81% EXTRACTED · 19% INFERRED · 0% AMBIGUOUS · INFERRED: 294 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `ConversesService` - 21 edges
2. `OpenClawProcessService` - 20 edges
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

### Community 0 - "AI & Chat Server Core"
Cohesion: 0.04
Nodes (30): AddMembersDto, AiModule, BanMemberDto, BotsModule, ConfirmUploadDto, ConversesModule, makeMemberData(), mockUser() (+22 more)

### Community 1 - "Desktop React UI"
Cohesion: 0.02
Nodes (5): GatewayManagerService, handleKeyDown(), handleSend(), OpenclawController, OpenclawModule

### Community 2 - "NestJS App Bootstrap"
Cohesion: 0.04
Nodes (13): AppController, AppModule, AppService, I18nModule, LoggingInterceptor, MentionsModule, MetricsController, MetricsModule (+5 more)

### Community 3 - "Auth Store & IPC"
Cohesion: 0.06
Nodes (10): AuthStore, CommandExecutor, connectToGateway(), connectViaDocker(), connectViaProcess(), disconnectFromGateway(), notifyStatusChange(), refreshAndRetry() (+2 more)

### Community 4 - "Agent Orchestrator"
Cohesion: 0.06
Nodes (5): AgentsModule, BatchTriggerService, BotEventListener, AgentMemoryService, AgentWorkspaceService

### Community 5 - "Auth Controller & JWT"
Cohesion: 0.06
Nodes (9): AuthController, AuthModule, AuthService, JwtStrategy, LoginDto, MailModule, MailService, RefreshDto (+1 more)

### Community 6 - "PPT Generation"
Cohesion: 0.11
Nodes (37): _add_multiline(), _add_slide(), _add_text(), _arrow_right(), build_overview(), build_visuals(), _card_with_label(), _corner_marks() (+29 more)

### Community 7 - "Flutter Mobile Window"
Cohesion: 0.11
Nodes (16): Create(), Destroy(), EnableFullDpiSupportIfAvailable(), GetClientArea(), GetThisFromHandle(), GetWindowClass(), MessageHandler(), OnCreate() (+8 more)

### Community 8 - "Group & Converse Service"
Cohesion: 0.14
Nodes (1): ConversesService

### Community 9 - "OpenClaw WS Client"
Cohesion: 0.17
Nodes (2): base64url(), OpenClawWsClient

### Community 10 - "Desktop WS Client Service"
Cohesion: 0.16
Nodes (1): WsClientService

### Community 11 - "LLM Providers (DeepSeek/Kimi)"
Cohesion: 0.15
Nodes (4): DeepSeekProvider, KimiProvider, LlmMessageDto, LlmRequestDto

### Community 12 - "Profile Controller"
Cohesion: 0.13
Nodes (4): ProfileController, ProfileModule, ProfileService, UpdateProfileDto

### Community 13 - "Chat Gateway"
Cohesion: 0.13
Nodes (1): ChatGateway

### Community 14 - "Group Panel UI"
Cohesion: 0.27
Nodes (13): getMuteMinutes(), getToken(), handleAddMembers(), handleBan(), handleDeleteGroup(), handleLeaveGroup(), handleMute(), handleRemoveMember() (+5 more)

### Community 15 - "Bots & Commands"
Cohesion: 0.13
Nodes (1): ConversesController

### Community 16 - "Device Gateway"
Cohesion: 0.16
Nodes (2): DevicesController, DevicesService

### Community 17 - "Email & Auth Services"
Cohesion: 0.27
Nodes (11): addSortIndicators(), enableUI(), getNthColumn(), getTable(), getTableBody(), getTableHeader(), loadColumns(), loadData() (+3 more)

### Community 18 - "Database Schema & Prisma"
Cohesion: 0.29
Nodes (1): UploadService

### Community 19 - "Security Decisions & Policies"
Cohesion: 0.35
Nodes (8): a(), B(), D(), g(), i(), k(), Q(), y()

### Community 20 - "Module Cluster 20"
Cohesion: 0.27
Nodes (1): BotCommunicationService

### Community 21 - "Module Cluster 21"
Cohesion: 0.27
Nodes (1): BotsService

### Community 22 - "Module Cluster 22"
Cohesion: 0.29
Nodes (1): MessagesService

### Community 23 - "Module Cluster 23"
Cohesion: 0.25
Nodes (1): PredictiveService

### Community 24 - "Module Cluster 24"
Cohesion: 0.31
Nodes (1): DraftService

### Community 25 - "Module Cluster 25"
Cohesion: 0.27
Nodes (1): FriendsService

### Community 26 - "Module Cluster 26"
Cohesion: 0.18
Nodes (2): DeviceGateway, isDangerousCommand()

### Community 27 - "Module Cluster 27"
Cohesion: 0.38
Nodes (1): BroadcastService

### Community 28 - "Module Cluster 28"
Cohesion: 0.24
Nodes (1): OpenClawClientService

### Community 29 - "Module Cluster 29"
Cohesion: 0.2
Nodes (1): BotsController

### Community 30 - "Module Cluster 30"
Cohesion: 0.36
Nodes (1): SupervisorAgent

### Community 31 - "Module Cluster 31"
Cohesion: 0.2
Nodes (1): PresenceService

### Community 32 - "Module Cluster 32"
Cohesion: 0.25
Nodes (1): AgentOrchestratorService

### Community 33 - "Module Cluster 33"
Cohesion: 0.36
Nodes (1): WhisperService

### Community 34 - "Module Cluster 34"
Cohesion: 0.22
Nodes (1): FriendsController

### Community 35 - "Module Cluster 35"
Cohesion: 0.25
Nodes (1): SingleContainerStrategy

### Community 36 - "Module Cluster 36"
Cohesion: 0.36
Nodes (1): MentionService

### Community 37 - "Module Cluster 37"
Cohesion: 0.25
Nodes (1): AiController

### Community 38 - "Module Cluster 38"
Cohesion: 0.29
Nodes (1): MessagesController

### Community 39 - "Module Cluster 39"
Cohesion: 0.48
Nodes (1): LlmRouterService

### Community 40 - "Module Cluster 40"
Cohesion: 0.8
Nodes (4): extractDesktopEvents(), extractMobileEvents(), main(), readFile()

### Community 41 - "Module Cluster 41"
Cohesion: 0.4
Nodes (0): 

### Community 42 - "Module Cluster 42"
Cohesion: 0.7
Nodes (4): goToNext(), goToPrevious(), makeCurrent(), toggleClass()

### Community 43 - "Module Cluster 43"
Cohesion: 0.4
Nodes (1): CommandsService

### Community 44 - "Module Cluster 44"
Cohesion: 0.5
Nodes (2): GeneratedPluginRegistrant, -registerWithRegistry

### Community 45 - "Module Cluster 45"
Cohesion: 0.5
Nodes (1): MetricsService

### Community 46 - "Module Cluster 46"
Cohesion: 0.67
Nodes (1): BotInitService

### Community 47 - "Module Cluster 47"
Cohesion: 0.5
Nodes (1): EmailVerifiedGuard

### Community 48 - "Module Cluster 48"
Cohesion: 0.5
Nodes (0): 

### Community 49 - "Module Cluster 49"
Cohesion: 0.5
Nodes (1): UsersController

### Community 50 - "Module Cluster 50"
Cohesion: 0.5
Nodes (1): UploadController

### Community 51 - "Module Cluster 51"
Cohesion: 0.5
Nodes (2): handle_new_rx_page(), Intercept NOTIFY_DEBUGGER_ABOUT_RX_PAGES and touch the pages.

### Community 52 - "Module Cluster 52"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Module Cluster 53"
Cohesion: 1.0
Nodes (1): SearchMessagesDto

### Community 54 - "Module Cluster 54"
Cohesion: 1.0
Nodes (1): MessageResponseDto

### Community 55 - "Module Cluster 55"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "Module Cluster 56"
Cohesion: 1.0
Nodes (0): 

### Community 57 - "Module Cluster 57"
Cohesion: 1.0
Nodes (0): 

### Community 58 - "Module Cluster 58"
Cohesion: 1.0
Nodes (0): 

### Community 59 - "Module Cluster 59"
Cohesion: 1.0
Nodes (0): 

### Community 60 - "Module Cluster 60"
Cohesion: 1.0
Nodes (0): 

### Community 61 - "Module Cluster 61"
Cohesion: 1.0
Nodes (0): 

### Community 62 - "Module Cluster 62"
Cohesion: 1.0
Nodes (0): 

### Community 63 - "Module Cluster 63"
Cohesion: 1.0
Nodes (0): 

### Community 64 - "Module Cluster 64"
Cohesion: 1.0
Nodes (0): 

### Community 65 - "Module Cluster 65"
Cohesion: 1.0
Nodes (0): 

### Community 66 - "Module Cluster 66"
Cohesion: 1.0
Nodes (0): 

### Community 67 - "Module Cluster 67"
Cohesion: 1.0
Nodes (0): 

### Community 68 - "Module Cluster 68"
Cohesion: 1.0
Nodes (0): 

### Community 69 - "Module Cluster 69"
Cohesion: 1.0
Nodes (0): 

### Community 70 - "Module Cluster 70"
Cohesion: 1.0
Nodes (0): 

### Community 71 - "Module Cluster 71"
Cohesion: 1.0
Nodes (1): JWT RS256 Asymmetric Auth

### Community 72 - "Module Cluster 72"
Cohesion: 1.0
Nodes (1): Refresh Token Pair

### Community 73 - "Module Cluster 73"
Cohesion: 1.0
Nodes (1): Environment Variable Secrets

### Community 74 - "Module Cluster 74"
Cohesion: 1.0
Nodes (1): Role-Based Access Control

### Community 75 - "Module Cluster 75"
Cohesion: 1.0
Nodes (1): WebSocket Secure Transport

### Community 76 - "Module Cluster 76"
Cohesion: 1.0
Nodes (1): Email Verification Flow

### Community 77 - "Module Cluster 77"
Cohesion: 1.0
Nodes (1): Password Reset with Anti-Enumeration

### Community 78 - "Module Cluster 78"
Cohesion: 1.0
Nodes (1): Shell Command Execution

### Community 79 - "Module Cluster 79"
Cohesion: 1.0
Nodes (1): Draft and Verify Pattern

### Community 80 - "Module Cluster 80"
Cohesion: 1.0
Nodes (1): Dangerous Command Blocking

### Community 81 - "Module Cluster 81"
Cohesion: 1.0
Nodes (1): Electron IPC Preload Bridge Security

### Community 82 - "Module Cluster 82"
Cohesion: 1.0
Nodes (1): OpenClaw Gateway Manager Multi-tenant

### Community 83 - "Module Cluster 83"
Cohesion: 1.0
Nodes (1): OpenClaw Gateway Token Authentication

### Community 84 - "Module Cluster 84"
Cohesion: 1.0
Nodes (1): JWT to Gateway Token Exchange Flow

### Community 85 - "Module Cluster 85"
Cohesion: 1.0
Nodes (1): Dangerous Command Detection

### Community 86 - "Module Cluster 86"
Cohesion: 1.0
Nodes (1): Command Whitelist

### Community 87 - "Module Cluster 87"
Cohesion: 1.0
Nodes (1): OpenClaw Authentication Modes

### Community 88 - "Module Cluster 88"
Cohesion: 1.0
Nodes (1): child_process Fallback Execution

### Community 89 - "Module Cluster 89"
Cohesion: 1.0
Nodes (1): Dynamic Port Allocation

### Community 90 - "Module Cluster 90"
Cohesion: 1.0
Nodes (1): Per-User Gateway Instance Isolation

### Community 91 - "Module Cluster 91"
Cohesion: 1.0
Nodes (1): HMAC-SHA256 Gateway Token Signing

### Community 92 - "Module Cluster 92"
Cohesion: 1.0
Nodes (1): OpenClaw Gateway REST API Endpoints

### Community 93 - "Module Cluster 93"
Cohesion: 1.0
Nodes (1): Desktop Auto-Connect to Gateway

### Community 94 - "Module Cluster 94"
Cohesion: 1.0
Nodes (1): Agent Short-Term Memory in Redis 24h TTL

### Community 95 - "Module Cluster 95"
Cohesion: 1.0
Nodes (1): Bot Workspace AllowedTools Permission Config

### Community 96 - "Module Cluster 96"
Cohesion: 1.0
Nodes (1): Agent Session Isolation

### Community 97 - "Module Cluster 97"
Cohesion: 1.0
Nodes (1): Rate Limiting on @mention Bot Triggers

### Community 98 - "Module Cluster 98"
Cohesion: 1.0
Nodes (1): Bot Message Loop Prevention

### Community 99 - "Module Cluster 99"
Cohesion: 1.0
Nodes (1): Predictive Action Danger Level Classification

### Community 100 - "Module Cluster 100"
Cohesion: 1.0
Nodes (1): Bot Never Auto-Executes Actions

### Community 101 - "Module Cluster 101"
Cohesion: 1.0
Nodes (1): OpenClaw auth=none Unsafe

### Community 102 - "Module Cluster 102"
Cohesion: 1.0
Nodes (1): Signal Protocol libsignal E2E Encryption

### Community 103 - "Module Cluster 103"
Cohesion: 1.0
Nodes (1): AgentMemoryService Redis-backed

### Community 104 - "Module Cluster 104"
Cohesion: 1.0
Nodes (1): AgentOrchestratorService

### Community 105 - "Module Cluster 105"
Cohesion: 1.0
Nodes (1): Logout Token Leak JWT Persists on Logout

### Community 106 - "Module Cluster 106"
Cohesion: 1.0
Nodes (1): Dangerous Command Filter Dual-layer 15 Server + 11 Desktop

### Community 107 - "Module Cluster 107"
Cohesion: 1.0
Nodes (1): Cross-Bot Communication Security Rate Limit Cycle Detection

### Community 108 - "Module Cluster 108"
Cohesion: 1.0
Nodes (1): Email Verification Full Flow Rate Limiting Lockout Code Expiry

### Community 109 - "Module Cluster 109"
Cohesion: 1.0
Nodes (1): ED25519 Device Identity Signature

### Community 110 - "Module Cluster 110"
Cohesion: 1.0
Nodes (1): JWT Token Auto-Refresh scheduleTokenRefresh

### Community 111 - "Module Cluster 111"
Cohesion: 1.0
Nodes (1): OpenClaw Local Auth None for Loopback

### Community 112 - "Module Cluster 112"
Cohesion: 1.0
Nodes (1): Verification Code Double-Submit Guard

### Community 113 - "Module Cluster 113"
Cohesion: 1.0
Nodes (1): Resend Verification Rate Limit 3/60s

### Community 114 - "Module Cluster 114"
Cohesion: 1.0
Nodes (1): req.user.id vs req.user.userId JWT Strategy Fix

### Community 115 - "Module Cluster 115"
Cohesion: 1.0
Nodes (1): IPC Listener Leak Fix Preload Cleanup

### Community 116 - "Module Cluster 116"
Cohesion: 1.0
Nodes (1): OpenClaw Operator Scopes read/write/admin/approvals/pairing

### Community 117 - "Module Cluster 117"
Cohesion: 1.0
Nodes (1): OpenClaw Exec Approval RPC

### Community 118 - "Module Cluster 118"
Cohesion: 1.0
Nodes (1): OpenClaw Device Authentication nonce ED25519

### Community 119 - "Module Cluster 119"
Cohesion: 1.0
Nodes (1): WS Namespace Mismatch Risk 43% of Bugs

### Community 120 - "Module Cluster 120"
Cohesion: 1.0
Nodes (1): ToolRecord Struct Tool Call Audit

### Community 121 - "Module Cluster 121"
Cohesion: 1.0
Nodes (1): GBK Fix Raw Buffer Passthrough Encoding Attack Reduction

### Community 122 - "Module Cluster 122"
Cohesion: 1.0
Nodes (1): JWT RS256 Authentication Decision

### Community 123 - "Module Cluster 123"
Cohesion: 1.0
Nodes (1): OpenClaw exec-approvals Security Model

### Community 124 - "Module Cluster 124"
Cohesion: 1.0
Nodes (1): Command Blacklist Security Policy

### Community 125 - "Module Cluster 125"
Cohesion: 1.0
Nodes (1): Draft and Verify Pattern Decision

### Community 126 - "Module Cluster 126"
Cohesion: 1.0
Nodes (1): API Rate Limiting Strategy

### Community 127 - "Module Cluster 127"
Cohesion: 1.0
Nodes (1): ZeroClaw Workspace Sandbox

### Community 128 - "Module Cluster 128"
Cohesion: 1.0
Nodes (1): ZeroClaw Command Allowlist

### Community 129 - "Module Cluster 129"
Cohesion: 1.0
Nodes (1): ZeroClaw Forbidden Paths Protection

### Community 130 - "Module Cluster 130"
Cohesion: 1.0
Nodes (1): Dangerous Command Interception User Stories

### Community 131 - "Module Cluster 131"
Cohesion: 1.0
Nodes (1): FaceID Confirmation for Dangerous Commands

### Community 132 - "Module Cluster 132"
Cohesion: 1.0
Nodes (1): Rate Limits Per Endpoint Table

### Community 133 - "Module Cluster 133"
Cohesion: 1.0
Nodes (1): Password Reset Forces All Device Logout

### Community 134 - "Module Cluster 134"
Cohesion: 1.0
Nodes (1): Verification Code 5 Attempt Lockout

### Community 135 - "Module Cluster 135"
Cohesion: 1.0
Nodes (1): Refresh Token Rotation

### Community 136 - "Module Cluster 136"
Cohesion: 1.0
Nodes (1): JWT JTI Anti-Collision UUID

### Community 137 - "Module Cluster 137"
Cohesion: 1.0
Nodes (1): JWT RS256 Authentication Implementation

### Community 138 - "Module Cluster 138"
Cohesion: 1.0
Nodes (1): Argon2 Password Hashing

### Community 139 - "Module Cluster 139"
Cohesion: 1.0
Nodes (1): Dangerous Command Blacklist Filter

### Community 140 - "Module Cluster 140"
Cohesion: 1.0
Nodes (1): Constant-Time argon2 Verify

### Community 141 - "Module Cluster 141"
Cohesion: 1.0
Nodes (1): SECURITY BUG JWT Algorithm Mismatch RS256 vs HS256

### Community 142 - "Module Cluster 142"
Cohesion: 1.0
Nodes (1): SECURITY BUG Admin Endpoint No Authorization

### Community 143 - "Module Cluster 143"
Cohesion: 1.0
Nodes (1): SECURITY BUG Bot Membership Check Bypass

### Community 144 - "Module Cluster 144"
Cohesion: 1.0
Nodes (1): SECURITY BUG File Extension Injection Risk

### Community 145 - "Module Cluster 145"
Cohesion: 1.0
Nodes (1): SECURITY BUG avatarUrl Direct Set Bypasses Upload Security

### Community 146 - "Module Cluster 146"
Cohesion: 1.0
Nodes (1): Security Desktop Logout Does Not Revoke Refresh Token

### Community 147 - "Module Cluster 147"
Cohesion: 1.0
Nodes (1): Security Gateway Token Exposed via CLI Process Args

### Community 148 - "Module Cluster 148"
Cohesion: 1.0
Nodes (1): Email Verification Required After Registration

### Community 149 - "Module Cluster 149"
Cohesion: 1.0
Nodes (1): Verification Code Brute Force Protection 5 Attempts Lockout

### Community 150 - "Module Cluster 150"
Cohesion: 1.0
Nodes (1): Password Reset Anti-Enumeration

### Community 151 - "Module Cluster 151"
Cohesion: 1.0
Nodes (1): Password Reset Revokes All Refresh Tokens

### Community 152 - "Module Cluster 152"
Cohesion: 1.0
Nodes (1): Bot User Non-Loginable Random Credentials

### Community 153 - "Module Cluster 153"
Cohesion: 1.0
Nodes (1): ConverseMembership Verification Guard

### Community 154 - "Module Cluster 154"
Cohesion: 1.0
Nodes (1): Non-Member Message Access Returns 403

### Community 155 - "Module Cluster 155"
Cohesion: 1.0
Nodes (1): Flutter flutter_secure_storage for JWT Token

### Community 156 - "Module Cluster 156"
Cohesion: 1.0
Nodes (1): RS256 Asymmetric Key Choice over HS256

### Community 157 - "Module Cluster 157"
Cohesion: 1.0
Nodes (1): CVE-2026-25253 Cross-Site WebSocket Hijacking

### Community 158 - "Module Cluster 158"
Cohesion: 1.0
Nodes (1): Docker Network Isolation loopback binding

### Community 159 - "Module Cluster 159"
Cohesion: 1.0
Nodes (1): Dangerous Command Triple-Layer Interception

### Community 160 - "Module Cluster 160"
Cohesion: 1.0
Nodes (1): Server-side Command Blacklist 15 regexes

### Community 161 - "Module Cluster 161"
Cohesion: 1.0
Nodes (1): Desktop Command Blacklist 11 regexes

### Community 162 - "Module Cluster 162"
Cohesion: 1.0
Nodes (1): OpenClaw exec-approvals Config ask mode Draft & Verify Layer 3

### Community 163 - "Module Cluster 163"
Cohesion: 1.0
Nodes (1): OpenClaw Gateway Token Security HMAC-SHA256 TTL userId binding

### Community 164 - "Module Cluster 164"
Cohesion: 1.0
Nodes (1): OpenClaw Version Pin CVE fix

### Community 165 - "Module Cluster 165"
Cohesion: 1.0
Nodes (1): Nginx Rate Limiting auth 10r/m api burst=20

### Community 166 - "Module Cluster 166"
Cohesion: 1.0
Nodes (1): CORS_ORIGINS Hardening production domain whitelist

### Community 167 - "Module Cluster 167"
Cohesion: 1.0
Nodes (1): TLS/SSL Configuration Let's Encrypt TLSv1.2/1.3

### Community 168 - "Module Cluster 168"
Cohesion: 1.0
Nodes (1): UFW Firewall allow only 22/80/443

### Community 169 - "Module Cluster 169"
Cohesion: 1.0
Nodes (1): AgentProvider Interface isReady chat cancelStream

### Community 170 - "Module Cluster 170"
Cohesion: 1.0
Nodes (1): OpenClawAdapter wraps openclaw-ws-client

### Community 171 - "Module Cluster 171"
Cohesion: 1.0
Nodes (1): HermesAdapter HTTP SSE AbortController

### Community 172 - "Module Cluster 172"
Cohesion: 1.0
Nodes (1): Offline Installer Bundling openclaw-sidecar + hermes-env

### Community 173 - "Module Cluster 173"
Cohesion: 1.0
Nodes (1): JwtAuthGuard JWT RS256

### Community 174 - "Module Cluster 174"
Cohesion: 1.0
Nodes (1): EmailVerifiedGuard opt-in

### Community 175 - "Module Cluster 175"
Cohesion: 1.0
Nodes (1): Desktop IPC Pattern window.api preload bridge

### Community 176 - "Module Cluster 176"
Cohesion: 1.0
Nodes (1): Mobile API Client JWT Attach Token Refresh

## Knowledge Gaps
- **169 isolated node(s):** `LinkingChat PPT Generator — "Hermès Tech" Design System Generates two presentati`, `Strict color + typography tokens.`, `Lock background on every slide layout via the slide master.`, `Explicitly set individual slide background (belt-and-suspenders).`, `Add a blank slide with background applied.` (+164 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Module Cluster 52`** (2 nodes): `seed.ts`, `main()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 53`** (2 nodes): `search-messages.dto.ts`, `SearchMessagesDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 54`** (2 nodes): `message-response.dto.ts`, `MessageResponseDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 55`** (1 nodes): `_verify_sprint2.ps1`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 56`** (1 nodes): `_update.ps1`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 57`** (1 nodes): `prepare-openclaw-sidecar.ps1`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 58`** (1 nodes): `bot-notification.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 59`** (1 nodes): `user.schema.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 60`** (1 nodes): `bot.schema.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 61`** (1 nodes): `group.schema.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 62`** (1 nodes): `device.schema.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 63`** (1 nodes): `bot-notification.schema.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 64`** (1 nodes): `validators.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 65`** (1 nodes): `events.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 66`** (1 nodes): `electron.vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 67`** (1 nodes): `env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 68`** (1 nodes): `jest.integration.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 69`** (1 nodes): `bot-response.dto.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 70`** (1 nodes): `validator-compat.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 71`** (1 nodes): `JWT RS256 Asymmetric Auth`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 72`** (1 nodes): `Refresh Token Pair`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 73`** (1 nodes): `Environment Variable Secrets`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 74`** (1 nodes): `Role-Based Access Control`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 75`** (1 nodes): `WebSocket Secure Transport`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 76`** (1 nodes): `Email Verification Flow`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 77`** (1 nodes): `Password Reset with Anti-Enumeration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 78`** (1 nodes): `Shell Command Execution`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 79`** (1 nodes): `Draft and Verify Pattern`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 80`** (1 nodes): `Dangerous Command Blocking`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 81`** (1 nodes): `Electron IPC Preload Bridge Security`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 82`** (1 nodes): `OpenClaw Gateway Manager Multi-tenant`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 83`** (1 nodes): `OpenClaw Gateway Token Authentication`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 84`** (1 nodes): `JWT to Gateway Token Exchange Flow`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 85`** (1 nodes): `Dangerous Command Detection`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 86`** (1 nodes): `Command Whitelist`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 87`** (1 nodes): `OpenClaw Authentication Modes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 88`** (1 nodes): `child_process Fallback Execution`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 89`** (1 nodes): `Dynamic Port Allocation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 90`** (1 nodes): `Per-User Gateway Instance Isolation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 91`** (1 nodes): `HMAC-SHA256 Gateway Token Signing`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 92`** (1 nodes): `OpenClaw Gateway REST API Endpoints`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 93`** (1 nodes): `Desktop Auto-Connect to Gateway`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 94`** (1 nodes): `Agent Short-Term Memory in Redis 24h TTL`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 95`** (1 nodes): `Bot Workspace AllowedTools Permission Config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 96`** (1 nodes): `Agent Session Isolation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 97`** (1 nodes): `Rate Limiting on @mention Bot Triggers`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 98`** (1 nodes): `Bot Message Loop Prevention`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 99`** (1 nodes): `Predictive Action Danger Level Classification`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 100`** (1 nodes): `Bot Never Auto-Executes Actions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 101`** (1 nodes): `OpenClaw auth=none Unsafe`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 102`** (1 nodes): `Signal Protocol libsignal E2E Encryption`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 103`** (1 nodes): `AgentMemoryService Redis-backed`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 104`** (1 nodes): `AgentOrchestratorService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 105`** (1 nodes): `Logout Token Leak JWT Persists on Logout`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 106`** (1 nodes): `Dangerous Command Filter Dual-layer 15 Server + 11 Desktop`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 107`** (1 nodes): `Cross-Bot Communication Security Rate Limit Cycle Detection`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 108`** (1 nodes): `Email Verification Full Flow Rate Limiting Lockout Code Expiry`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 109`** (1 nodes): `ED25519 Device Identity Signature`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 110`** (1 nodes): `JWT Token Auto-Refresh scheduleTokenRefresh`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 111`** (1 nodes): `OpenClaw Local Auth None for Loopback`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 112`** (1 nodes): `Verification Code Double-Submit Guard`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 113`** (1 nodes): `Resend Verification Rate Limit 3/60s`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 114`** (1 nodes): `req.user.id vs req.user.userId JWT Strategy Fix`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 115`** (1 nodes): `IPC Listener Leak Fix Preload Cleanup`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 116`** (1 nodes): `OpenClaw Operator Scopes read/write/admin/approvals/pairing`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 117`** (1 nodes): `OpenClaw Exec Approval RPC`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 118`** (1 nodes): `OpenClaw Device Authentication nonce ED25519`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 119`** (1 nodes): `WS Namespace Mismatch Risk 43% of Bugs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 120`** (1 nodes): `ToolRecord Struct Tool Call Audit`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 121`** (1 nodes): `GBK Fix Raw Buffer Passthrough Encoding Attack Reduction`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 122`** (1 nodes): `JWT RS256 Authentication Decision`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 123`** (1 nodes): `OpenClaw exec-approvals Security Model`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 124`** (1 nodes): `Command Blacklist Security Policy`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 125`** (1 nodes): `Draft and Verify Pattern Decision`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 126`** (1 nodes): `API Rate Limiting Strategy`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 127`** (1 nodes): `ZeroClaw Workspace Sandbox`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 128`** (1 nodes): `ZeroClaw Command Allowlist`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 129`** (1 nodes): `ZeroClaw Forbidden Paths Protection`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 130`** (1 nodes): `Dangerous Command Interception User Stories`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 131`** (1 nodes): `FaceID Confirmation for Dangerous Commands`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 132`** (1 nodes): `Rate Limits Per Endpoint Table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 133`** (1 nodes): `Password Reset Forces All Device Logout`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 134`** (1 nodes): `Verification Code 5 Attempt Lockout`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 135`** (1 nodes): `Refresh Token Rotation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 136`** (1 nodes): `JWT JTI Anti-Collision UUID`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 137`** (1 nodes): `JWT RS256 Authentication Implementation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 138`** (1 nodes): `Argon2 Password Hashing`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 139`** (1 nodes): `Dangerous Command Blacklist Filter`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 140`** (1 nodes): `Constant-Time argon2 Verify`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 141`** (1 nodes): `SECURITY BUG JWT Algorithm Mismatch RS256 vs HS256`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 142`** (1 nodes): `SECURITY BUG Admin Endpoint No Authorization`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 143`** (1 nodes): `SECURITY BUG Bot Membership Check Bypass`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 144`** (1 nodes): `SECURITY BUG File Extension Injection Risk`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 145`** (1 nodes): `SECURITY BUG avatarUrl Direct Set Bypasses Upload Security`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 146`** (1 nodes): `Security Desktop Logout Does Not Revoke Refresh Token`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 147`** (1 nodes): `Security Gateway Token Exposed via CLI Process Args`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 148`** (1 nodes): `Email Verification Required After Registration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 149`** (1 nodes): `Verification Code Brute Force Protection 5 Attempts Lockout`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 150`** (1 nodes): `Password Reset Anti-Enumeration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 151`** (1 nodes): `Password Reset Revokes All Refresh Tokens`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 152`** (1 nodes): `Bot User Non-Loginable Random Credentials`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 153`** (1 nodes): `ConverseMembership Verification Guard`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 154`** (1 nodes): `Non-Member Message Access Returns 403`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 155`** (1 nodes): `Flutter flutter_secure_storage for JWT Token`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 156`** (1 nodes): `RS256 Asymmetric Key Choice over HS256`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 157`** (1 nodes): `CVE-2026-25253 Cross-Site WebSocket Hijacking`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 158`** (1 nodes): `Docker Network Isolation loopback binding`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 159`** (1 nodes): `Dangerous Command Triple-Layer Interception`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 160`** (1 nodes): `Server-side Command Blacklist 15 regexes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 161`** (1 nodes): `Desktop Command Blacklist 11 regexes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 162`** (1 nodes): `OpenClaw exec-approvals Config ask mode Draft & Verify Layer 3`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 163`** (1 nodes): `OpenClaw Gateway Token Security HMAC-SHA256 TTL userId binding`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 164`** (1 nodes): `OpenClaw Version Pin CVE fix`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 165`** (1 nodes): `Nginx Rate Limiting auth 10r/m api burst=20`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 166`** (1 nodes): `CORS_ORIGINS Hardening production domain whitelist`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 167`** (1 nodes): `TLS/SSL Configuration Let's Encrypt TLSv1.2/1.3`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 168`** (1 nodes): `UFW Firewall allow only 22/80/443`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 169`** (1 nodes): `AgentProvider Interface isReady chat cancelStream`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 170`** (1 nodes): `OpenClawAdapter wraps openclaw-ws-client`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 171`** (1 nodes): `HermesAdapter HTTP SSE AbortController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 172`** (1 nodes): `Offline Installer Bundling openclaw-sidecar + hermes-env`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 173`** (1 nodes): `JwtAuthGuard JWT RS256`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 174`** (1 nodes): `EmailVerifiedGuard opt-in`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 175`** (1 nodes): `Desktop IPC Pattern window.api preload bridge`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 176`** (1 nodes): `Mobile API Client JWT Attach Token Refresh`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ConversesService` connect `Group & Converse Service` to `AI & Chat Server Core`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `ChatGateway` connect `Chat Gateway` to `AI & Chat Server Core`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `ConversesController` connect `Bots & Commands` to `AI & Chat Server Core`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `LinkingChat PPT Generator — "Hermès Tech" Design System Generates two presentati`, `Strict color + typography tokens.`, `Lock background on every slide layout via the slide master.` to the rest of the system?**
  _169 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `AI & Chat Server Core` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Desktop React UI` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `NestJS App Bootstrap` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._