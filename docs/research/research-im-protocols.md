# LinkingChat IM Protocol & Platform Research Report

> Research Date: 2026-02-11
> Purpose: Evaluate open source IM projects, protocols, and SDKs that could serve as the foundation (or reference) for building LinkingChat's social messaging layer
> Context: LinkingChat is an AI-native social app with remote desktop control. Stack: Node.js/TypeScript cloud, Flutter mobile, Electron desktop, PostgreSQL database.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Requirements Recap](#2-requirements-recap)
3. [Candidate Evaluation](#3-candidate-evaluation)
   - 3.1 Matrix (Synapse)
   - 3.2 Rocket.Chat
   - 3.3 Mattermost
   - 3.4 XMPP (Ejabberd / Prosody)
   - 3.5 Signal Protocol (libsignal)
   - 3.6 Tinode
   - 3.7 Spacebar (formerly Fosscord)
   - 3.8 Revolt / Stoat
   - 3.9 Other Notable Projects
4. [Comparison Matrix](#4-comparison-matrix)
5. [Approach Analysis: Adopt vs Adapt vs Build](#5-approach-analysis-adopt-vs-adapt-vs-build)
6. [Recommendation](#6-recommendation)
7. [Sources](#7-sources)

---

## 1. Executive Summary

After evaluating 8+ open source IM platforms and protocols, the recommendation for LinkingChat is to **build a custom lightweight chat server in TypeScript/Node.js**, selectively borrowing protocol design and data models from **Spacebar** (Discord-compatible TypeScript backend) and **Mattermost** (PostgreSQL schema design), while using **Matrix's custom event type system** as inspiration for the device-control message protocol.

No existing platform is a clean fit because:
- Platforms with Node.js/TypeScript backends (Rocket.Chat, Spacebar) use MongoDB, not PostgreSQL
- Platforms using PostgreSQL (Mattermost) are written in Go, not TypeScript
- Protocol-level solutions (Matrix, XMPP) add federation complexity that is unnecessary overhead for a 2-3 person team
- None natively support the dual-purpose messaging (social chat + device control commands) that is core to LinkingChat

The most practical path is: **custom server + reference implementations for learning**.

---

## 2. Requirements Recap

### MVP Social Features Required

| Feature | Priority |
|---------|----------|
| Email registration/login | P0 |
| Friend system (add, delete, list) | P0 |
| 1-on-1 text chat | P0 |
| 1-on-1 file/image sending | P0 |
| Group chat | P0 |
| Push notifications (offline) | P0 |
| User avatars / profiles | P1 |
| Online/offline status (presence) | P1 |
| Read receipts | P1 |
| Message recall/retract | P1 |
| Message search | P1 |
| Voice messages | P2 |
| Voice/video calls | **NOT required** |

### Technical Constraints

| Constraint | Requirement |
|------------|-------------|
| Backend language | Node.js / TypeScript |
| Mobile client | Flutter (Dart) |
| Desktop client | Electron + Node.js/TypeScript |
| Database | PostgreSQL |
| Real-time transport | WebSocket |
| Custom message types | Must support device control commands alongside chat |
| Team size | 2-3 developers |
| Repo structure | Monorepo (pnpm workspace / turborepo) |

---

## 3. Candidate Evaluation

### 3.1 Matrix (Synapse / Conduit)

**What it is:** An open, federated protocol for real-time communication. Synapse is the reference homeserver (Python/Twisted). Conduit is a lightweight alternative (Rust). Element is the reference client (React/TypeScript).

**Language/Stack:**
- Server: Synapse = Python; Conduit = Rust (neither is Node.js/TypeScript)
- Client SDK: `matrix-js-sdk` (TypeScript, actively maintained, v40+ on npm)
- Flutter SDK: `matrix` Dart package on pub.dev (mature, powers FluffyChat). Matrix Dart SDK 1.0.0 released in 2025.
- Bot SDK: `matrix-bot-sdk` (TypeScript)

**Feature Coverage:**
- 1:1 chat, group chat, file/image sending, presence, read receipts, message redaction (recall): ALL supported natively
- Push notifications: supported via Matrix push gateway spec
- Friend system: not a native concept (Matrix uses room invites), would need custom implementation
- Message search: server-side search supported
- Voice messages: can be sent as file attachments with custom metadata
- Custom message types: **Excellent** -- Matrix was designed for IoT/extensible events. You can define `com.linkchat.device.command` event types freely.

**Integration Model:**
- Must run as a **separate server process** (Synapse or Conduit)
- Your Node.js backend would interact via Matrix Client-Server API (REST + WebSocket sync)
- Cannot be embedded as a library -- it is a full server

**WebSocket Support:** Yes, via the `/sync` long-polling endpoint or experimental native WebSocket transport (MSC3575).

**Custom Message Types for Device Control:** **Best-in-class.** Matrix was explicitly designed to synchronize arbitrary JSON objects between clients, devices, and services. Custom event types with arbitrary JSON payloads are a first-class feature. Power levels can restrict who sends which event types.

**Community & Maturity:**
- Synapse: 40k+ GitHub stars, extremely active, backed by Element (commercial entity)
- Protocol spec: v1.12 (January 2026), mature and well-documented
- Flutter ecosystem: FluffyChat is a production Flutter client; Matrix Dart SDK 1.0.0 released 2025
- Conduit/Tuwunel: Lighter alternative, Tuwunel sponsored by Swiss government

**License:** Apache-2.0 (spec and most SDKs), Synapse is AGPLv3

**Pros:**
- Richest feature set of any evaluated platform
- Best extensibility for custom message types (device control)
- Mature Flutter SDK (production-proven with FluffyChat)
- Excellent TypeScript client SDK
- Federation capability (not needed now, but future-proof)

**Cons:**
- Server is Python (Synapse) or Rust (Conduit), not Node.js/TypeScript
- Running a separate Matrix server adds operational complexity
- Synapse is resource-hungry (2-4GB RAM for small deployment)
- Over-engineered for a 2-3 person team -- federation, DAG-based event history, etc.
- Friend system must be custom-built on top
- Learning curve for the Matrix spec is steep

**Verdict:** Excellent protocol design to **learn from**, but too heavy to adopt as infrastructure for a small team.

---

### 3.2 Rocket.Chat

**What it is:** Enterprise-grade open source team communication platform. Looks like Slack with additional features (omnichannel, live chat, video calls).

**Language/Stack:**
- Server: **Node.js + TypeScript + Meteor framework + MongoDB**
- Client: React web app, React Native mobile apps
- Flutter SDK: Official `Rocket.Chat.Flutter.SDK` exists on GitHub (MIT license), includes `rocket_chat_api` and `rocket_chat_embeddedchat_component` packages
- JS SDK: `@rocket.chat/sdk` on npm (though last published 7 years ago; REST API is the primary integration path now)
- Apps Engine: TypeScript-based plugin system for extending functionality

**Feature Coverage:**
- 1:1 chat, group chat, file/image, push notifications, presence, read receipts, message search: ALL supported
- Friend system: not a native concept (uses channels/DMs)
- Message recall: supported
- Voice messages: supported
- Custom message types: possible through Apps Engine (TypeScript plugins)

**Integration Model:**
- Runs as a **complete separate server** (cannot be used as a library)
- Very opinionated architecture (Meteor framework, MongoDB-centric)
- REST API + Realtime API (DDP protocol, not standard WebSocket)

**Database:** MongoDB only. **Does not support PostgreSQL.** No plans to change this.

**WebSocket Support:** Uses DDP (Distributed Data Protocol) over WebSocket, not standard WebSocket. This is a Meteor framework constraint.

**Custom Message Types:** Possible via Apps Engine plugins (TypeScript), but the architecture is Meteor/MongoDB-centric and would require significant adaptation for device control commands.

**Community & Maturity:**
- 42k+ GitHub stars, very active
- Version 8.0 released January 2026
- Tens of millions of users across 150+ countries
- Used by Deutsche Bahn, US Navy, Credit Suisse

**License:** MIT (core), some enterprise features are proprietary

**Pros:**
- Most feature-complete IM platform evaluated
- Node.js/TypeScript backend (closest to our stack)
- Official Flutter SDK exists
- TypeScript plugin system (Apps Engine)
- Massive community and production-proven

**Cons:**
- **MongoDB only** -- incompatible with our PostgreSQL requirement
- Meteor framework is heavy and opinionated, difficult to extend in non-standard ways
- Uses DDP instead of standard WebSocket
- Massive codebase -- understanding and modifying it would take significant effort
- Overkill for our use case (omnichannel, live chat, etc.)
- Cannot be used as a library/SDK -- must run as complete server

**Verdict:** Best for **learning how a production IM works** (especially the Flutter SDK), but MongoDB dependency and Meteor framework make it unsuitable for adoption.

---

### 3.3 Mattermost

**What it is:** Open source Slack alternative focused on enterprise DevOps teams. Clean, focused feature set.

**Language/Stack:**
- Server: **Go + PostgreSQL** (also supports MySQL)
- Client: React + TypeScript web app
- Mobile: React Native (official), Flutter package `mattermost_flutter` on pub.dev (community, published May 2025)
- TypeScript API driver: `cometkim/mattermost-typescript` (community-maintained)

**Feature Coverage:**
- 1:1 chat, group chat (channels), file sharing, push notifications, message search: ALL supported
- Presence (online/offline): supported
- Read receipts: supported (since v7)
- Message recall/delete: supported
- Friend system: not a native concept (team/channel-based)
- Voice messages: not natively supported
- Voice/video calls: via plugin (not needed)

**Integration Model:**
- Runs as a **separate Go binary**
- REST API + WebSocket API for real-time events
- Plugin system (Go plugins, not TypeScript)

**Database:** **PostgreSQL** (primary recommended) and MySQL. This aligns with our stack.

**WebSocket Support:** Yes, native WebSocket for real-time events. Well-documented API.

**Custom Message Types:** Mattermost supports custom post types via plugins, but plugins must be written in Go. The webhook/API system allows custom JSON payloads to some extent.

**Community & Maturity:**
- 35k+ GitHub stars, extremely active
- Monthly releases (MIT license)
- Used by thousands of companies
- Strong documentation

**License:** MIT (core server), some features are enterprise-only

**Pros:**
- **Uses PostgreSQL** -- can study their schema design for messages, channels, users
- Clean, focused architecture (simpler than Rocket.Chat)
- Good WebSocket API design
- Strong documentation
- MIT license

**Cons:**
- **Server is Go**, not Node.js/TypeScript
- Plugin system is Go-based (cannot extend with TypeScript)
- Flutter support is community-only (`mattermost_flutter` on pub.dev, published 2025)
- No friend system concept
- Cannot be used as a library -- runs as separate server

**Verdict:** **Best reference for PostgreSQL schema design** (message storage, channels, users, teams). Study their data model carefully.

---

### 3.4 XMPP (Ejabberd / Prosody)

**What it is:** A mature, federated messaging protocol (standardized since 1999). Ejabberd (Erlang) and Prosody (Lua) are the most popular servers.

**Language/Stack:**
- Servers: Ejabberd (Erlang/OTP), Prosody (Lua) -- neither is Node.js
- Node.js SDK: `xmpp.js` (xmppjs/xmpp.js on GitHub, supports TypeScript)
- Flutter SDKs: `xmpp_plugin` (native channels, Android/iOS), `xmpp_stone` (pure Dart, WIP), `xmpp_client_web` (pure Dart, WIP)
- **New in 2025:** Fluux SDK by ProcessOne (ejabberd team) -- TypeScript-first XMPP SDK with clean high-level API that hides XML complexity

**Feature Coverage:**
- 1:1 chat, group chat (MUC), file transfer (HTTP Upload), presence, message receipts: ALL supported via XEPs
- Push notifications: XEP-0357 (Push Notifications)
- Message recall: XEP-0424 (Message Retraction)
- Message search: XEP-0313 (Message Archive Management)
- Voice messages: as file uploads
- Friend system: native "Roster" concept (add/remove/list contacts) -- **best fit of all evaluated options**

**Integration Model:**
- Must run a separate XMPP server (Ejabberd or Prosody)
- Node.js client connects via `xmpp.js` library
- Protocol is XML-based (verbose, complex)

**Database:** Ejabberd supports PostgreSQL, MySQL, SQLite, MSSQL. Prosody supports SQLite, PostgreSQL, MySQL.

**WebSocket Support:** Yes, XMPP over WebSocket is standardized (RFC 7395). Both Ejabberd and Prosody support it.

**Custom Message Types:** XMPP allows custom XML namespaces and stanza types. You can define `<command xmlns="linkchat:device:control">` stanzas. However, working with XML in a TypeScript/JSON-native codebase is painful.

**Community & Maturity:**
- XMPP protocol: 25+ years old, extremely mature
- Ejabberd: 10k+ GitHub stars, backed by ProcessOne (commercial)
- Prosody: Active, lightweight
- Flutter SDKs: **immature** -- all are work-in-progress or limited to specific platforms
- The Fluux SDK (2025) is promising but very new

**License:** Ejabberd: GPLv2; Prosody: MIT; xmpp.js: ISC

**Pros:**
- Native friend system ("Roster") -- the only protocol evaluated that has this built in
- Extremely mature and battle-tested protocol
- Ejabberd supports PostgreSQL
- WebSocket support standardized
- New Fluux SDK (2025) makes TypeScript development much easier
- Federation built-in (not needed now, but available)

**Cons:**
- XML-based protocol in a JSON/TypeScript world -- impedance mismatch
- Server is Erlang (Ejabberd) or Lua (Prosody), not TypeScript
- Flutter SDKs are **immature** -- the best options are WIP pure-Dart libraries
- Learning curve for XMPP XEPs is significant (there are hundreds of extensions)
- Over-engineered for our needs (federation, presence priority levels, etc.)
- Operational complexity of running Ejabberd/Prosody alongside Node.js backend

**Verdict:** The protocol has the best built-in social features (roster/friend system), but the XML foundation, immature Flutter SDKs, and separate server requirement make it impractical for a small team.

---

### 3.5 Signal Protocol (libsignal)

**What it is:** End-to-end encryption protocol (Double Ratchet algorithm). This is NOT a complete IM platform -- it is a cryptographic library for encrypting messages.

**Language/Stack:**
- Official: `@signalapp/libsignal-client` npm package (Rust core + TypeScript bindings)
- Community: `@privacyresearch/libsignal-protocol-typescript` (pure TypeScript)
- The old `libsignal-protocol-javascript` is **deprecated**

**What it provides:**
- Session establishment (X3DH key agreement)
- Message encryption/decryption (Double Ratchet)
- Sealed sender (metadata protection)
- **Does NOT provide:** message transport, user management, group chat logic, push notifications, file storage, or any other IM features

**Integration Model:** Can be used as a **library/SDK** within your Node.js server. This is the only evaluated option that integrates at the library level rather than running as a separate server.

**Flutter SDK:** No official Flutter/Dart SDK. Would need to use Dart FFI to call the Rust core, or implement in pure Dart.

**License:** AGPLv3 (official), MIT (community pure-TS implementation)

**Pros:**
- Library-level integration (not a separate server)
- Industry-standard E2E encryption
- TypeScript API available

**Cons:**
- Only provides encryption, not an IM platform
- E2E encryption is **not an MVP requirement** for LinkingChat
- Adds significant complexity (key management, device verification, pre-key bundles)
- No Flutter SDK
- Building all IM features on top would be equivalent to building from scratch

**Verdict:** **Not relevant for MVP.** Could be added later if E2E encryption becomes a requirement. It is a cryptographic building block, not an IM foundation.

---

### 3.6 Tinode

**What it is:** Lightweight, purpose-built open source instant messaging server. Designed as a modern replacement for XMPP with a focus on mobile.

**Language/Stack:**
- Server: **Go** (not Node.js/TypeScript)
- Wire protocol: JSON over WebSocket (or protobuf over gRPC)
- Flutter SDK: Official `tinode` Dart package on pub.dev (maintained by Tinode team)
- JS SDK: `tinode-sdk` on npm (JavaScript, works in Node.js and browser)
- gRPC clients: available for Node, C++, C#, Go, Java, PHP, Python, Ruby

**Feature Coverage:**
- 1:1 chat, group chat, file/image sending, presence, read receipts ("read" notifications): ALL supported
- Push notifications: supported (FCM, APNS)
- User search/discovery: supported
- Message recall: not clearly documented as a built-in feature
- Message search: supported via server-side queries
- Voice messages: file attachment with metadata
- Friend system: "Subscriptions" model (similar to following, not exactly friends)
- Rich formatting: Markdown-style with inline images, videos, file attachments

**Integration Model:**
- Runs as a **separate Go server**
- Communication via JSON/WebSocket or gRPC
- Cannot be used as a library within Node.js

**Database:** MySQL, MongoDB, or RethinkDB. **Does not support PostgreSQL** (though custom adapters can be written).

**WebSocket Support:** Yes, native JSON over WebSocket -- clean and simple protocol.

**Custom Message Types:** The protocol supports custom data in messages, but the message format is relatively fixed compared to Matrix's fully extensible event system.

**Community & Maturity:**
- ~12k GitHub stars
- Active development (latest release December 2025)
- Smaller community than Matrix/Rocket.Chat/Mattermost
- Official Flutter SDK is a significant advantage

**License:** Server: **GPL-3.0** (copyleft -- modifications must be open-sourced); Clients: Apache-2.0

**Pros:**
- **Official Flutter SDK** on pub.dev (Dart, maintained by Tinode team)
- Clean JSON/WebSocket protocol (easy to understand and extend)
- Purpose-built for mobile IM (not repurposed team chat)
- Lightweight compared to Synapse/Rocket.Chat
- Good feature coverage for basic IM

**Cons:**
- **Server is Go**, not TypeScript
- **No PostgreSQL support** (MySQL/MongoDB/RethinkDB)
- **GPL-3.0 server license** -- any server modifications must be open-sourced
- Smaller community
- Custom message types are limited compared to Matrix
- Would still need to run as a separate server

**Verdict:** **Best lightweight IM reference** with a good Flutter SDK. The JSON/WebSocket protocol design is clean and worth studying. However, Go server, no PostgreSQL, and GPL license are blockers for adoption.

---

### 3.7 Spacebar (formerly Fosscord)

**What it is:** A reverse-engineered reimplementation of the Discord.com backend, built in TypeScript. Goal: complete feature parity with Discord while being self-hostable.

**Language/Stack:**
- Server: **TypeScript + Node.js** (our exact backend stack)
- ORM: **TypeORM** (supports PostgreSQL, MySQL, SQLite, and more)
- Database: **PostgreSQL and SQLite** confirmed via Docker configs
- Architecture: REST API server + WebSocket Gateway + CDN server
- Client: Separate web client project (TypeScript)

**Feature Coverage:**
- 1:1 DMs, group DMs, server/channel model (Discord-style): ALL supported
- File/image upload (via CDN service): supported
- Push notifications: partially implemented
- Presence (online/offline/DND/invisible): supported
- Read receipts (message acknowledgement): supported (Discord-style)
- Message delete: supported
- Message search: basic implementation
- Friend system: **supported** (Discord-style friend requests, accept/deny)
- Voice messages: not specifically, but file uploads work
- API typings: `spacebar-api-types` npm package

**Integration Model:**
- Runs as a **separate Node.js server** (or bundled: API + Gateway + CDN in one process)
- Can run API, Gateway, CDN separately with RabbitMQ for inter-service communication
- Discord-compatible REST API and WebSocket Gateway
- TypeORM entities can potentially be reused

**Database:** PostgreSQL (confirmed), SQLite (confirmed). Uses TypeORM, so MariaDB/MySQL also possible.

**WebSocket Support:** Yes, Discord-compatible WebSocket Gateway with event dispatching. This is exactly the pattern LinkingChat needs (real-time events over WebSocket).

**Custom Message Types:** The protocol follows Discord's message type system. Extending it for device control commands would require modifying the source code, which is possible since it is all TypeScript.

**Community & Maturity:**
- ~6.3k GitHub stars (main repo), ~1.7k stars (server repo)
- Last updated October 2025
- AGPL-3.0 license
- Moderate community activity
- Not production-ready for large-scale deployment (still has incompatibilities with Discord clients)

**License:** AGPL-3.0 (copyleft -- if you deploy a modified version as a service, you must release source code)

**Pros:**
- **TypeScript + Node.js** -- exact same backend stack as LinkingChat
- **PostgreSQL support** via TypeORM -- matches our database choice
- **Discord-compatible architecture** -- REST API + WebSocket Gateway + CDN is a proven pattern
- **Friend system built-in** (Discord-style)
- TypeORM entities for users, messages, channels, guilds, relationships are directly reusable as reference
- Schema generation, OpenAPI support
- Bundled or distributed deployment options

**Cons:**
- **AGPL-3.0 license** -- if you fork and deploy, you must open-source your modifications
- Discord compatibility adds unnecessary complexity (encoding with erlpack, Discord-specific quirks)
- Not fully production-ready (some features incomplete)
- No Flutter client or SDK
- Heavy Discord-specific baggage (guilds, roles, permissions model may be overkill)
- No mobile client at all (web client only)

**Verdict:** **Most relevant technical reference** for LinkingChat. Same stack (TypeScript + Node.js + PostgreSQL via TypeORM), same architecture pattern (REST API + WebSocket Gateway + CDN). The TypeORM entity definitions, WebSocket gateway implementation, and friend system are directly studyable. However, AGPL license means you cannot fork it without open-sourcing your changes, and Discord-specific complexity adds overhead.

---

### 3.8 Revolt / Stoat (formerly Revolt.chat)

**What it is:** Open source, user-first chat platform that looks and feels like Discord. Rebranded from Revolt to Stoat in October 2025.

**Language/Stack:**
- Server: **Rust** (requires Rust 1.86+)
- Database: **MongoDB** (not PostgreSQL)
- Queue: RabbitMQ for event distribution
- Web client: **TypeScript** (Solid.js)
- Android client: Kotlin + Jetpack Compose (official), Flutter community client "Rebar" exists
- TypeScript API SDK: `javascript-client-api` with OpenAPI v3 typings and fully typed request builders
- Bot libraries: revolt.js (TypeScript), plus community libs for Python, .NET, Rust, Go, Dart

**Feature Coverage:**
- 1:1 DMs, group DMs, servers/channels (Discord-style): ALL supported
- File/image upload: supported
- Push notifications: `revolt-pushd` daemon
- Presence: supported
- Friend system: basic implementation
- Custom message types: open-source server allows modification
- Voice channels: community library (Revoice.js)

**Integration Model:**
- Runs as a set of **separate Rust microservices** (API, events, file server, proxy, push)
- Cannot be used as a library
- REST API with TypeScript typings available

**Database:** MongoDB only. **No PostgreSQL support.**

**WebSocket Support:** Yes, via the events server (revolt-bonfire).

**Custom Message Types:** Server source is open, so you could modify it, but it is Rust code, not TypeScript.

**Community & Maturity:**
- ~500k registered users (as of late 2024)
- Active development, recent rebrand to Stoat
- Smaller community than Matrix/Rocket.Chat
- Rich ecosystem of third-party libraries

**License:** AGPL-3.0 (server), various for clients

**Pros:**
- Discord-like UX that works well
- TypeScript API typings available
- Rich ecosystem of bot/client libraries
- Active development

**Cons:**
- **Server is Rust**, not TypeScript
- **MongoDB only**, no PostgreSQL
- No official Flutter client (community "Rebar" app exists, plus "Volt" Dart bot library)
- AGPL license on server
- Microservice architecture adds operational complexity

**Verdict:** Good **UX/UI reference** for Discord-like design. The TypeScript API typings package is useful for understanding API design patterns. Not suitable for adoption due to Rust backend and MongoDB.

---

### 3.9 Other Notable Projects

#### Zulip
- **Stack:** Python/Django + PostgreSQL + React
- **Feature:** Thread-based chat (unique "topic" model per channel)
- **Relevance:** PostgreSQL schema design is useful reference. Thread model is different from Discord/WhatsApp style.
- **Flutter:** No official Flutter SDK
- **License:** Apache-2.0

#### Conduit / Tuwunel (Matrix in Rust)
- **Stack:** Rust, RocksDB
- **Relevance:** Lightweight Matrix server using ~350MB RAM vs Synapse's 2-4GB. Tuwunel is sponsored by Swiss government.
- **Note:** Still Matrix protocol, so all Matrix SDKs (including Flutter) work with it.

#### NestJS + Socket.io Chat Patterns
- **Stack:** TypeScript + Node.js + PostgreSQL + Socket.io
- **Relevance:** Multiple tutorial/reference implementations exist for building chat with this exact stack. Not production platforms, but useful code patterns.
- **Examples:** DZone tutorial "Build a Chat App With NestJS and PostgreSQL", multiple GitHub repos.

#### Supabase Realtime
- **Stack:** Elixir + PostgreSQL
- **Relevance:** Provides real-time WebSocket layer on top of PostgreSQL (listen/notify). Could be used as a building block for real-time message delivery.
- **Note:** Not an IM platform, but the real-time PostgreSQL pattern is relevant.

---

## 4. Comparison Matrix

### 4.1 Stack Compatibility

| Project | Backend Language | Database | Node.js/TS Backend | PostgreSQL | Flutter SDK | WebSocket |
|---------|-----------------|----------|---------------------|------------|-------------|-----------|
| **Matrix (Synapse)** | Python | PostgreSQL/SQLite | No (Python) | Yes | Yes (mature) | Yes |
| **Matrix (Conduit)** | Rust | RocksDB | No (Rust) | No | Yes (same SDK) | Yes |
| **Rocket.Chat** | Node.js/TS | MongoDB | **Yes** | **No** | Yes (official) | DDP (not standard) |
| **Mattermost** | Go | PostgreSQL/MySQL | No (Go) | **Yes** | Community only | Yes |
| **XMPP (Ejabberd)** | Erlang | PostgreSQL/MySQL | No (Erlang) | Yes | WIP/immature | Yes |
| **Signal Protocol** | Rust + TS bindings | N/A (library) | **Yes** (library) | N/A | No | N/A |
| **Tinode** | Go | MySQL/MongoDB | No (Go) | **No** | Yes (official) | Yes |
| **Spacebar** | **TypeScript/Node.js** | PG/SQLite (TypeORM) | **Yes** | **Yes** | **No** | **Yes** |
| **Revolt/Stoat** | Rust | MongoDB | No (Rust) | **No** | Community only | Yes |

### 4.2 Feature Coverage vs MVP Requirements

| Feature | Matrix | Rocket.Chat | Mattermost | XMPP | Tinode | Spacebar | Revolt |
|---------|--------|-------------|------------|------|--------|----------|--------|
| Email registration | Config | Yes | Yes | Plugin | Yes | Yes | Yes |
| Friend system | No (rooms) | No (channels) | No (teams) | **Yes (Roster)** | Partial | **Yes** | Partial |
| 1:1 text chat | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| File/image sending | Yes | Yes | Yes | Yes (XEP) | Yes | Yes | Yes |
| Group chat | Yes | Yes | Yes | Yes (MUC) | Yes | Yes | Yes |
| Push notifications | Yes | Yes | Yes | Yes (XEP) | Yes | Partial | Yes |
| Avatars/profiles | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Online/offline status | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Read receipts | Yes | Yes | Yes | Yes (XEP) | Yes | Yes | Partial |
| Message recall | Yes | Yes | Yes | Yes (XEP) | Unclear | Yes | Yes |
| Message search | Yes | Yes | Yes | Yes (MAM) | Basic | Basic | Basic |
| Voice messages | As file | Yes | No | As file | As file | As file | As file |
| Custom msg types | **Excellent** | Good | Limited | Good (XML) | Limited | Moderate | Moderate |
| Device control cmds | **Best fit** | Plugin | Plugin (Go) | XML stanzas | Limited | Fork needed | Fork needed |

### 4.3 Integration Approach

| Project | Can Use as Library? | Must Run Separate Server? | Effort to Integrate |
|---------|--------------------|--------------------------|--------------------|
| Matrix | No | Yes (Synapse/Conduit) | High (learn Matrix spec) |
| Rocket.Chat | No | Yes (Meteor + MongoDB) | Very High (Meteor framework) |
| Mattermost | No | Yes (Go binary) | Medium (REST API) |
| XMPP | No | Yes (Ejabberd/Prosody) | High (XML protocol) |
| Signal Protocol | **Yes** (npm package) | No | Medium (encryption only) |
| Tinode | No | Yes (Go binary) | Medium (clean JSON/WS) |
| Spacebar | No (but reusable code) | Yes (Node.js) | Medium (same stack) |
| Revolt | No | Yes (Rust microservices) | High (Rust + MongoDB) |

### 4.4 Licensing

| Project | Server License | Client License | Can You Keep Modifications Private? |
|---------|---------------|----------------|-------------------------------------|
| Matrix (Synapse) | AGPL-3.0 | Apache-2.0 | No (server) |
| Rocket.Chat | MIT | MIT | Yes |
| Mattermost | MIT (core) | MIT | Yes |
| XMPP (Ejabberd) | GPL-2.0 | Various | No (server) |
| XMPP (Prosody) | MIT | Various | Yes |
| Signal Protocol | AGPL-3.0 | Various | No |
| Tinode | **GPL-3.0** | Apache-2.0 | No (server) |
| Spacebar | **AGPL-3.0** | AGPL-3.0 | No |
| Revolt/Stoat | **AGPL-3.0** | Various | No (server) |

---

## 5. Approach Analysis: Adopt vs Adapt vs Build

### Approach A: Adopt an Existing Platform (Run as Backend)

**What:** Deploy Matrix/Synapse, Rocket.Chat, or Tinode as the chat backend. Build Flutter mobile and Electron desktop as clients that connect to it.

**Pros:**
- Get 80% of social features for free
- Proven, battle-tested infrastructure

**Cons:**
- None use TypeScript + Node.js + PostgreSQL together
- Running a separate server increases operational complexity
- Customizing for device control commands requires deep knowledge of the adopted platform
- Locked into someone else's architecture, data model, and upgrade cycle
- The "social layer" and "device control layer" become split across two systems
- 2-3 person team cannot effectively maintain a forked Synapse (Python) or Ejabberd (Erlang)

**Effort:** Medium upfront, **high ongoing maintenance** for customizations

**Risk:** High -- getting stuck when you need to customize something the platform was not designed for

### Approach B: Adapt/Fork an Existing TypeScript Project (Spacebar)

**What:** Fork Spacebar's TypeScript server, strip Discord-specific code, add LinkingChat-specific features (device control, AI integration).

**Pros:**
- Same stack (TypeScript + Node.js + PostgreSQL via TypeORM)
- TypeORM entities, WebSocket gateway, REST API already implemented
- Friend system already built
- Fastest path to a working prototype with real features

**Cons:**
- **AGPL-3.0 license** -- all modifications must be open-sourced if deployed as a service
- Discord-specific baggage (guilds, roles, permission system, erlpack encoding) would need removal
- Spacebar is not fully production-ready
- Maintaining a fork diverges from upstream quickly
- The codebase was designed for Discord compatibility, not for AI/device control extensibility

**Effort:** Medium upfront (strip unnecessary code, add custom features), **medium-high ongoing** (fork maintenance)

**Risk:** Medium -- AGPL license is the main concern; codebase complexity is a secondary concern

### Approach C: Build Custom, Learn from References (Recommended)

**What:** Build a custom lightweight chat server in TypeScript/Node.js/PostgreSQL from scratch, but heavily reference existing projects for design decisions.

**Reference Sources:**
1. **Spacebar** -- WebSocket gateway architecture, TypeORM entity design, REST API patterns, friend system implementation
2. **Mattermost** -- PostgreSQL schema design for messages, channels, users (since it actually uses PG in production)
3. **Matrix** -- Custom event type system design for the device control protocol; room-based message routing concepts
4. **Tinode** -- Clean JSON/WebSocket protocol design; Dart SDK API design for the Flutter client
5. **Discord API docs** -- API design patterns, rate limiting, gateway events (well-documented, widely understood)

**Pros:**
- Full control over architecture, no license restrictions
- Optimized for LinkingChat's dual-purpose (social + device control) from day one
- TypeScript end-to-end: shared types between server, Electron client, and (via code generation) Flutter client
- PostgreSQL native from the start
- No unnecessary complexity (no federation, no XML, no Meteor, no Discord compatibility)
- Can use familiar frameworks (NestJS or Express + Socket.io/ws)
- 2-3 person team can understand the entire codebase

**Cons:**
- Most development effort upfront
- Need to implement features that exist in off-the-shelf platforms
- Risk of re-inventing wheels poorly

**Effort:** **High upfront**, low ongoing (you own the code completely)

**Risk:** Low-medium -- well-understood technology, clear feature requirements, good reference implementations available

---

## 6. Recommendation

### Primary Recommendation: Approach C -- Build Custom, Learn from References

For a 2-3 person team building an AI-native social app with device control, the custom build approach is the most practical for these reasons:

1. **No platform matches the full stack** -- There is no open source IM that combines TypeScript/Node.js backend + PostgreSQL + Flutter SDK + WebSocket + custom device control messages. Any adoption would require fighting against the chosen platform's architecture.

2. **The MVP feature set is achievable** -- The required features (auth, friends, 1:1 chat, groups, files, push, presence, read receipts, recall, search) are all well-understood patterns. With reference implementations available, a competent team can build the core in 2-3 months.

3. **Device control is first-class** -- The OpenClaw integration is not an afterthought. Building custom means the message protocol can natively support both `chat.message` and `device.command` types from day one, using the same WebSocket connection.

4. **License freedom** -- All AGPL/GPL-licensed platforms (Spacebar, Tinode, Matrix/Synapse, Ejabberd) would require open-sourcing modifications. A custom build has no such constraints.

### Specific Reference Strategy

| What to Reference | Source Project | What to Study |
|-------------------|---------------|---------------|
| WebSocket Gateway architecture | **Spacebar** | Event dispatching, connection management, heartbeat, reconnection |
| PostgreSQL schema for chat | **Mattermost** | Messages, channels, users, teams, file attachments tables |
| TypeORM entity design | **Spacebar** | User, Message, Channel, Relationship (friend) entities |
| REST API design | **Discord API docs** | Endpoint naming, pagination, rate limiting, error format |
| Custom message types | **Matrix spec** | Event type namespacing, extensible JSON payloads, power levels |
| Flutter chat SDK API | **Tinode Dart SDK** | Connection management, topic subscriptions, message publishing |
| Flutter embedded chat component | **Rocket.Chat Flutter SDK** | UI components, message list, input bar, file picker |
| Push notification architecture | **Tinode** | FCM/APNS integration pattern |
| File storage (Discord-style) | **Spacebar CDN** + **Revolt (Autumn)** | Separate CDN service, presigned URLs, file metadata |

### Suggested Technology Stack for Custom Build

```
Server:
  - Runtime: Node.js 20+ with TypeScript
  - Framework: NestJS (provides WebSocket gateway, REST controllers, DI, guards)
    OR Express + ws/Socket.io (lighter, more control)
  - ORM: TypeORM or Prisma (PostgreSQL)
  - Database: PostgreSQL 16
  - Cache: Redis (presence, sessions, pub/sub for multi-instance)
  - File storage: S3-compatible (MinIO for dev, AWS S3 for prod)
  - Push: Firebase Cloud Messaging (FCM) + Apple Push Notification Service (APNS)

Protocol:
  - Transport: WebSocket (ws library or Socket.io)
  - Format: JSON
  - Message types: Namespaced (e.g., "message.create", "message.delete",
    "device.command", "device.result", "presence.update")
  - Auth: JWT tokens over WebSocket handshake

Shared:
  - Protocol types: TypeScript package in monorepo, shared between server + Electron
  - Code generation: Generate Dart types from TypeScript for Flutter client

Mobile:
  - Flutter with Dart
  - WebSocket client: web_socket_channel package
  - State management: Riverpod or Bloc
  - Push: firebase_messaging package

Desktop:
  - Electron + Node.js/TypeScript
  - Same WebSocket protocol as mobile
  - OpenClaw worker runs locally, receives device.command messages
```

### What NOT to Do

1. **Do not adopt Matrix/Synapse as infrastructure** -- The federation protocol, Python server, and DAG-based event history add enormous complexity for zero benefit in a non-federated app.

2. **Do not fork Spacebar** -- The AGPL license and Discord-specific baggage outweigh the head start. Study it, but do not fork it.

3. **Do not use Rocket.Chat or its Meteor framework** -- MongoDB dependency and DDP protocol are fundamental mismatches.

4. **Do not implement the Signal Protocol for MVP** -- E2E encryption can be added later if needed. It is not a social feature requirement.

5. **Do not use XMPP** -- The XML protocol is a poor fit for a JSON/TypeScript ecosystem, and the Flutter SDKs are not production-ready.

---

## 7. Sources

### Matrix
- [Matrix.org Specification](https://spec.matrix.org/latest/)
- [matrix-js-sdk on GitHub](https://github.com/matrix-org/matrix-js-sdk)
- [Matrix SDKs Ecosystem](https://matrix.org/ecosystem/sdks/)
- [Synapse on GitHub](https://github.com/matrix-org/synapse)
- [FluffyChat on GitHub](https://github.com/krille-chan/fluffychat)
- [Matrix Dart SDK on pub.dev](https://fluttergems.dev/packages/matrix/)
- [Conduit Matrix Server](https://conduit.rs/)
- [Tuwunel (Conduit successor)](https://github.com/matrix-construct/tuwunel)
- [Self-hosting Matrix in 2025](https://blog.klein.ruhr/self-hosting-matrix-in-2025)

### Rocket.Chat
- [Rocket.Chat on GitHub](https://github.com/RocketChat/Rocket.Chat)
- [Rocket.Chat Flutter SDK](https://github.com/RocketChat/Rocket.Chat.Flutter.SDK)
- [Rocket.Chat Apps Engine](https://rocketchat.github.io/Rocket.Chat.Apps-engine/)
- [Rocket.Chat Developer Docs](https://developer.rocket.chat/)
- [Rocket.Chat MongoDB-only (GitHub Issue #533)](https://github.com/RocketChat/Rocket.Chat/issues/533)

### Mattermost
- [Mattermost on GitHub](https://github.com/mattermost/mattermost)
- [Mattermost TypeScript Driver](https://github.com/cometkim/mattermost-typescript)
- [mattermost_flutter on pub.dev](https://pub.dev/packages/mattermost_flutter)
- [Mattermost Developer Docs](https://developers.mattermost.com)

### XMPP
- [xmpp.js on GitHub](https://github.com/xmppjs/xmpp.js)
- [Fluux SDK (ProcessOne)](https://www.process-one.net/blog/introducing-fluux-messenger-a-modern-xmpp-client-born-from-a-holiday-coding-session/)
- [xmpp_plugin on pub.dev](https://pub.dev/packages/xmpp_plugin)
- [xmpp_stone on pub.dev](https://pub.dev/packages/xmpp_stone)

### Signal Protocol
- [libsignal on GitHub](https://github.com/signalapp/libsignal)
- [libsignal-protocol-typescript on npm](https://www.npmjs.com/package/@privacyresearch/libsignal-protocol-typescript)
- [libsignal TypeScript by raphaelvserafim](https://github.com/raphaelvserafim/libsignal)

### Tinode
- [Tinode on GitHub](https://github.com/tinode/chat)
- [Tinode Dart SDK on pub.dev](https://pub.dev/packages/tinode)
- [Tinode Dart SDK on GitHub](https://github.com/tinode/dart-sdk)

### Spacebar (formerly Fosscord)
- [Spacebar Server on GitHub](https://github.com/spacebarchat/server)
- [Spacebar Main Repo](https://github.com/spacebarchat/spacebarchat)
- [Spacebar Documentation](https://docs.spacebar.chat/)
- [Spacebar API Types](https://github.com/spacebarchat/spacebar-api-types)
- [Spacebar Docker](https://github.com/spacebarchat/docker)

### Revolt / Stoat
- [Stoat (formerly Revolt) on GitHub](https://github.com/stoatchat)
- [Stoat Website](https://stoat.chat/)
- [Stoat Developer Docs](https://developers.stoat.chat/)
- [Stoat JavaScript Client API](https://github.com/stoatchat/javascript-client-api)
- [awesome-stoat](https://github.com/stoatchat/awesome-stoat)

### General
- [SelfHostHero: Matrix, Rocket.Chat, Mattermost Comparison](https://selfhosthero.com/secure-self-hosted-chat-platforms-matrix-rocket-chat-mattermost-comparison/)
- [Medevel: 26 Open-source Chat Servers](https://medevel.com/26-os-chat-servers/)
- [TypeORM](https://typeorm.io/)
- [NestJS WebSockets](https://docs.nestjs.com/websockets/gateways)
