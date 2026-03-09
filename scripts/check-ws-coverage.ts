#!/usr/bin/env tsx
/**
 * WS Event Coverage Checker
 *
 * Verifies that all Server→Client WebSocket events defined in the server
 * are handled by both Desktop (Electron) and Mobile (Flutter) clients.
 *
 * Usage:
 *   pnpm tsx scripts/check-ws-coverage.ts           # normal mode
 *   pnpm tsx scripts/check-ws-coverage.ts --strict   # exit 1 on unexempted gaps
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Configuration ──

const ROOT = path.resolve(__dirname, '..');

const DESKTOP_SOCKET_FILE = path.join(
  ROOT,
  'apps/desktop/src/renderer/hooks/useChatSocket.ts',
);

const MOBILE_FILES = {
  chatSocketService: path.join(
    ROOT,
    'apps/mobile/lib/core/network/chat_socket_service.dart',
  ),
  chatProvider: path.join(
    ROOT,
    'apps/mobile/lib/features/chat/providers/chat_provider.dart',
  ),
  draftProvider: path.join(
    ROOT,
    'apps/mobile/lib/features/chat/providers/draft_provider.dart',
  ),
  predictiveProvider: path.join(
    ROOT,
    'apps/mobile/lib/features/chat/providers/predictive_provider.dart',
  ),
  whisperProvider: path.join(
    ROOT,
    'apps/mobile/lib/features/chat/providers/whisper_provider.dart',
  ),
  friendsProvider: path.join(
    ROOT,
    'apps/mobile/lib/features/friends/providers/friends_provider.dart',
  ),
  aiEvents: path.join(
    ROOT,
    'apps/mobile/lib/core/constants/ai_events.dart',
  ),
};

// Known exceptions: events intentionally not handled on one or both clients
const KNOWN_EXCEPTIONS: Record<string, string> = {
  'bot:cross:notify': 'Not needed on clients yet',
  'bot:notification': 'Handled via message:new + type field',
  'group:member:muted': 'Handled via refetch converses',
  'group:member:unmuted': 'Handled via refetch converses',
  'group:member:banned': 'Handled via refetch converses',
  'group:member:unbanned': 'Handled via refetch converses',
  'notification:new': 'Desktop notification center not yet implemented',
};

// ── Server events (source of truth) ──

// All S→C events from /chat namespace, extracted from ws-protocol CHAT_EVENTS + AI_EVENTS
const SERVER_TO_CLIENT_EVENTS = [
  // Chat events
  'message:new',
  'message:updated',
  'message:deleted',
  'message:typing',
  'message:read',
  'friend:request',
  'friend:accepted',
  'friend:removed',
  'converse:new',
  'converse:updated',
  'presence:changed',
  'notification:new',
  'bot:notification',
  // Group events
  'group:created',
  'group:updated',
  'group:deleted',
  'group:member:added',
  'group:member:removed',
  'group:member:role:updated',
  'group:member:muted',
  'group:member:unmuted',
  'group:member:banned',
  'group:member:unbanned',
  // AI events (S→C only)
  'ai:whisper:suggestions',
  'ai:draft:created',
  'ai:draft:expired',
  'ai:predictive:action',
  // Bot inter-communication
  'bot:cross:notify',
];

// ── Scanner functions ──

function readFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    console.error(`  Warning: Cannot read ${filePath}`);
    return '';
  }
}

function extractDesktopEvents(content: string): Set<string> {
  const events = new Set<string>();
  // Match socket.on('event-name' or socket.on("event-name"
  const regex = /socket\.on\(['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const event = match[1];
    // Skip connection lifecycle events
    if (!['connect', 'disconnect', 'connect_error'].includes(event)) {
      events.add(event);
    }
  }
  return events;
}

function extractMobileEvents(): Set<string> {
  const events = new Set<string>();

  // 1. Parse chat_socket_service.dart — the central event registration
  const chatSocketContent = readFile(MOBILE_FILES.chatSocketService);
  // Match event strings in the chatEvents list
  const stringRegex = /'([a-z:_]+)'/g;
  let match: RegExpExecArray | null;
  while ((match = stringRegex.exec(chatSocketContent)) !== null) {
    if (match[1].includes(':')) {
      events.add(match[1]);
    }
  }

  // 2. Parse ai_events.dart for spread events
  const aiEventsContent = readFile(MOBILE_FILES.aiEvents);
  const aiRegex = /static const (\w+) = '([^']+)'/g;
  while ((match = aiRegex.exec(aiEventsContent)) !== null) {
    events.add(match[2]);
  }

  // 3. Scan individual providers for any direct .on() registrations
  const providerFiles = [
    MOBILE_FILES.chatProvider,
    MOBILE_FILES.draftProvider,
    MOBILE_FILES.predictiveProvider,
    MOBILE_FILES.whisperProvider,
    MOBILE_FILES.friendsProvider,
  ];
  for (const file of providerFiles) {
    const content = readFile(file);
    const onRegex = /\.on\(['"]([^'"]+)['"]/g;
    while ((match = onRegex.exec(content)) !== null) {
      events.add(match[1]);
    }
    // Also match AiEvents.xxx usage
    const aiRefRegex = /AiEvents\.(\w+)/g;
    while ((match = aiRefRegex.exec(content)) !== null) {
      // Map constant names to event strings
      const map: Record<string, string> = {
        whisperSuggestions: 'ai:whisper:suggestions',
        draftCreated: 'ai:draft:created',
        draftExpired: 'ai:draft:expired',
        predictiveAction: 'ai:predictive:action',
      };
      if (map[match[1]]) {
        events.add(map[match[1]]);
      }
    }
  }

  return events;
}

// ── Main ──

function main() {
  const isStrict = process.argv.includes('--strict');

  console.log('WS Event Coverage Check');
  console.log('=======================\n');

  // Scan Desktop
  const desktopContent = readFile(DESKTOP_SOCKET_FILE);
  const desktopEvents = extractDesktopEvents(desktopContent);

  // Scan Mobile
  const mobileEvents = extractMobileEvents();

  // Report
  type Status = 'OK' | 'EXEMPT' | 'DESKTOP_MISSING' | 'MOBILE_MISSING' | 'BOTH_MISSING';

  interface EventResult {
    event: string;
    desktop: boolean;
    mobile: boolean;
    status: Status;
    note?: string;
  }

  const results: EventResult[] = [];
  let errorCount = 0;

  for (const event of SERVER_TO_CLIENT_EVENTS) {
    const hasDesktop = desktopEvents.has(event);
    const hasMobile = mobileEvents.has(event);

    let status: Status;
    let note: string | undefined;

    if (hasDesktop && hasMobile) {
      status = 'OK';
    } else if (KNOWN_EXCEPTIONS[event]) {
      status = 'EXEMPT';
      note = KNOWN_EXCEPTIONS[event];
    } else {
      if (!hasDesktop && !hasMobile) {
        status = 'BOTH_MISSING';
      } else if (!hasDesktop) {
        status = 'DESKTOP_MISSING';
      } else {
        status = 'MOBILE_MISSING';
      }
      errorCount++;
    }

    results.push({ event, desktop: hasDesktop, mobile: hasMobile, status, note });
  }

  // Print table
  const COL_EVENT = 30;
  const COL_DM = 9;

  const header = [
    'Event'.padEnd(COL_EVENT),
    'Desktop'.padEnd(COL_DM),
    'Mobile'.padEnd(COL_DM),
    'Status',
  ].join(' | ');

  const separator = [
    '-'.repeat(COL_EVENT),
    '-'.repeat(COL_DM),
    '-'.repeat(COL_DM),
    '-'.repeat(20),
  ].join('-+-');

  console.log(header);
  console.log(separator);

  for (const r of results) {
    const desktopIcon = r.desktop ? ' ✓ on' : ' ✗ ---';
    const mobileIcon = r.mobile ? ' ✓ on' : ' ✗ ---';
    let statusStr: string;
    switch (r.status) {
      case 'OK':
        statusStr = 'OK';
        break;
      case 'EXEMPT':
        statusStr = `Exempt: ${r.note}`;
        break;
      case 'DESKTOP_MISSING':
        statusStr = '⚠ Desktop missing';
        break;
      case 'MOBILE_MISSING':
        statusStr = '⚠ Mobile missing';
        break;
      case 'BOTH_MISSING':
        statusStr = '⚠ Both missing';
        break;
    }

    console.log(
      [
        r.event.padEnd(COL_EVENT),
        desktopIcon.padEnd(COL_DM),
        mobileIcon.padEnd(COL_DM),
        statusStr,
      ].join(' | '),
    );
  }

  console.log();

  // Summary
  const okCount = results.filter((r) => r.status === 'OK').length;
  const exemptCount = results.filter((r) => r.status === 'EXEMPT').length;
  console.log(`Total: ${SERVER_TO_CLIENT_EVENTS.length} events`);
  console.log(`  OK: ${okCount}`);
  console.log(`  Exempt: ${exemptCount}`);
  console.log(`  Issues: ${errorCount}`);

  if (errorCount > 0) {
    console.log(`\n${errorCount} coverage gap(s) found.`);
    if (isStrict) {
      console.log('Failing due to --strict mode.');
      process.exit(1);
    }
  } else {
    console.log('\nAll events covered (or exempted). ✓');
  }
}

main();
