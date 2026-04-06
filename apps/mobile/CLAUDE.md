# Mobile — Flutter App

Flutter (Dart). iOS + Android from one codebase. WeChat/WhatsApp-style UI.

## Commands

```bash
flutter pub get          # Install dependencies
flutter run              # Run on connected device/emulator
flutter test             # Run tests
flutter build apk        # Android build
flutter build ios        # iOS build
flutter gen-l10n         # Regenerate i18n (after editing .arb files)
```

From repo root: `pnpm dev:mobile` (requires Flutter SDK in PATH)

## Project Structure

```
lib/
├── main.dart               # App entry
├── router.dart             # go_router route definitions
├── core/                   # App-wide infrastructure
│   ├── api/                # HTTP client + interceptors
│   ├── socket/             # Socket.IO /chat client
│   ├── auth/               # Token storage + refresh
│   └── theme/              # App theme (light/dark)
├── features/
│   ├── auth/               # Login, register, email verify, password reset
│   ├── chat/               # 1-on-1 + group + bot chat UI
│   ├── friends/            # Friend list, requests, search
│   ├── device/             # Remote control UI (send commands)
│   ├── profile/            # User profile view/edit
│   └── shared/             # Reusable widgets
└── l10n/                   # i18n ARB files (en, zh)
```

## Key Patterns

**State management:** Each feature uses its own provider/bloc pattern. No global state beyond auth.

**API calls:** All HTTP via `core/api/` client which handles JWT attach + token refresh. Never call `http.get()` directly.

**i18n:** Use `AppLocalizations.of(context)!.someKey`. After editing `.arb` files run `flutter gen-l10n`.

**Bot UI:** Bots appear as pinned contacts (like WeChat "File Transfer Assistant"). BOT converse type renders bot-specific bubbles. Messages to bots route through OpenClaw on the server — the mobile side just sends a normal message to the bot converse.

**Voice messages:** Use the voice recorder widget in `features/chat/` — records to temp file, uploads to MinIO via `/api/v1/upload`, then sends as VOICE message type.

## Environment

No `.env` file — server URL is configured in `core/api/` (check `api_client.dart` for base URL constant). For local dev, point to `http://localhost:3008/api/v1`.
