/**
 * Sprint 3 AI Module — Full E2E Test (Phase 2 + 3 + 4)
 *
 * Tests:
 *   Phase 2: Draft & Verify — create draft → approve / reject + WS events
 *   Phase 3: Predictive Actions — error output → action cards + danger levels
 *   Phase 4: Bot Inter-communication — cross-bot notify + Supervisor routing
 *
 * Prerequisites:
 *   - pnpm docker:up (PG + Redis running)
 *   - pnpm dev:server (restart after ai.controller.ts changes)
 *   - .env: DEEPSEEK_API_KEY + KIMI_API_KEY configured
 *
 * Usage:
 *   cd apps/server && node scripts/test-ai-full-e2e.mjs
 */

import { io } from 'socket.io-client';

const BASE = 'http://127.0.0.1:3008/api/v1';
const WS_URL = 'http://127.0.0.1:3008/chat';
const ts = Date.now();

// ─── Helpers ───────────────────────────────────────

async function api(method, path, body, token) {
  const url = `${BASE}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error(`${method} ${path} → network error: ${err.cause?.code || err.message}`);
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok && res.status !== 409) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

function log(tag, msg, data) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [${tag}]`, msg);
  if (data !== undefined) console.log(JSON.stringify(data, null, 2));
}

function sep(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(60)}\n`);
}

function waitForEvent(socket, event, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout (${timeoutMs / 1000}s): no "${event}" received`)),
      timeoutMs,
    );
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

let passed = 0;
let failed = 0;
function ok(name) { passed++; console.log(`  ✓ ${name}`); }
function fail(name, err) { failed++; console.log(`  ✗ ${name}: ${err}`); }

// ─── Setup ─────────────────────────────────────────

async function setup() {
  sep('Setup: Register user + connect WS');

  const user = {
    email: `tester_${ts}@test.com`,
    username: `tester_${ts}`,
    password: 'Test1234!',
    displayName: `Tester_${ts}`,
  };

  const auth = await api('POST', '/auth/register', user);
  const token = auth.accessToken;
  const userId = auth.user.id;
  log('SETUP', `User: ${user.username} (${userId})`);

  // Wait for bot auto-creation
  await new Promise(r => setTimeout(r, 500));

  // Get bots
  const bots = await api('GET', '/bots', null, token);
  const supervisor = bots.find(b => b.name === 'Supervisor');
  const codingBot = bots.find(b => b.name === 'Coding Bot');
  log('SETUP', `Bots: Supervisor=${supervisor?.id}, CodingBot=${codingBot?.id}`);

  // Get converses
  const converses = await api('GET', '/converses', null, token);
  const supervisorConverse = converses.find(
    c => c.isBot && c.botInfo?.name === 'Supervisor'
  );
  const codingConverse = converses.find(
    c => c.isBot && c.botInfo?.name === 'Coding Bot'
  );
  log('SETUP', `Converses: Supervisor=${supervisorConverse?.id}, CodingBot=${codingConverse?.id}`);

  // Connect WebSocket
  const socket = io(WS_URL, {
    auth: { token },
    transports: ['websocket'],
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WS timeout')), 5000);
    socket.on('connect', () => { clearTimeout(timeout); resolve(); });
    socket.on('connect_error', (e) => { clearTimeout(timeout); reject(e); });
  });
  log('SETUP', `WS connected: ${socket.id}`);

  return {
    token, userId, socket,
    supervisor, codingBot,
    supervisorConverse, codingConverse,
  };
}

// ─── Phase 2: Draft & Verify ───────────────────────

async function testDraft(ctx) {
  sep('Phase 2: Draft & Verify');

  const { token, socket, codingBot, codingConverse } = ctx;

  // Test 2a: Create draft (message type) + receive WS event
  log('TEST', '2a: Create message draft + WS event');
  const draftPromise = waitForEvent(socket, 'ai:draft:created', 30_000);

  const createRes = await api('POST', '/ai/test/draft', {
    converseId: codingConverse.id,
    botId: codingBot.id,
    botName: codingBot.name,
    draftType: 'message',
    userIntent: '帮我写一条消息跟同事说今天下午开会',
  }, token);

  if (createRes.draftId) {
    ok('Draft created via REST');
    log('DATA', `draftId = ${createRes.draftId}`);
  } else {
    fail('Draft creation', 'No draftId returned');
    return;
  }

  try {
    const draftPayload = await draftPromise;
    ok('ai:draft:created WS event received');
    console.log(`    botName:     ${draftPayload.botName}`);
    console.log(`    draftType:   ${draftPayload.draftType}`);
    console.log(`    content:     "${draftPayload.draftContent?.content || '(empty)'}"`);
    console.log(`    expiresAt:   ${draftPayload.expiresAt}`);
  } catch (err) {
    fail('ai:draft:created WS event', err.message);
  }

  // Test 2b: Approve draft
  log('TEST', '2b: Approve draft');
  try {
    const approveRes = await api('POST', '/ai/test/draft/approve', {
      draftId: createRes.draftId,
    }, token);
    if (approveRes.status === 'APPROVED') {
      ok(`Draft approved — content: "${approveRes.content?.content || '(empty)'}"`);
    } else {
      fail('Draft approve', JSON.stringify(approveRes));
    }
  } catch (err) {
    fail('Draft approve', err.message);
  }

  // Test 2c: Create another draft → reject
  log('TEST', '2c: Create command draft → reject');
  try {
    // Register WS listener BEFORE api call to avoid race condition
    const draft2WsPromise = waitForEvent(socket, 'ai:draft:created', 30_000);

    const draft2 = await api('POST', '/ai/test/draft', {
      converseId: codingConverse.id,
      botId: codingBot.id,
      botName: codingBot.name,
      draftType: 'command',
      userIntent: '帮我查看当前目录下所有文件',
    }, token);

    // Wait for WS event
    await draft2WsPromise;

    const rejectRes = await api('POST', '/ai/test/draft/reject', {
      draftId: draft2.draftId,
      reason: 'Testing rejection flow',
    }, token);

    if (rejectRes.status === 'REJECTED') {
      ok('Draft rejected successfully');
    } else {
      fail('Draft reject', JSON.stringify(rejectRes));
    }
  } catch (err) {
    fail('Draft reject flow', err.message);
  }
}

// ─── Phase 3: Predictive Actions ───────────────────

async function testPredictive(ctx) {
  sep('Phase 3: Predictive Actions');

  const { token, socket, codingConverse } = ctx;

  // Test 3a: npm error → predictive actions
  log('TEST', '3a: npm error → predictive action cards');
  const predictivePromise = waitForEvent(socket, 'ai:predictive:action', 30_000);

  const triggerRes = await api('POST', '/ai/test/predictive', {
    converseId: codingConverse.id,
    errorOutput: 'npm ERR! missing script: "start"\nnpm ERR! A complete log of this run can be found in:\nnpm ERR!     /home/user/.npm/_logs/2026-02-16.log',
  }, token);

  if (triggerRes.triggered) {
    ok(`Trigger detected: category = ${triggerRes.category}`);
  } else {
    fail('Trigger detection', 'Not triggered');
    return;
  }

  try {
    const payload = await predictivePromise;
    ok('ai:predictive:action WS event received');
    console.log(`    trigger:     "${payload.trigger?.substring(0, 80)}..."`);
    console.log(`    actions:`);
    for (const a of payload.actions || []) {
      const color = a.dangerLevel === 'safe' ? '🟢' : a.dangerLevel === 'warning' ? '🟡' : '🔴';
      console.log(`      ${color} [${a.dangerLevel}] ${a.action} — ${a.description}`);
    }
  } catch (err) {
    fail('ai:predictive:action WS event', err.message);
  }

  // Test 3b: permission error
  log('TEST', '3b: permission denied → predictive actions');
  const permPromise = waitForEvent(socket, 'ai:predictive:action', 30_000);

  const permRes = await api('POST', '/ai/test/predictive', {
    converseId: codingConverse.id,
    errorOutput: 'bash: /etc/shadow: Permission denied\ncat: /etc/shadow: Permission denied',
  }, token);

  if (permRes.triggered) ok(`Permission trigger: category = ${permRes.category}`);

  try {
    const payload = await permPromise;
    ok('Permission predictive actions received');
    for (const a of payload.actions || []) {
      const color = a.dangerLevel === 'safe' ? '🟢' : a.dangerLevel === 'warning' ? '🟡' : '🔴';
      console.log(`      ${color} [${a.dangerLevel}] ${a.action} — ${a.description}`);
    }
  } catch (err) {
    fail('Permission predictive', err.message);
  }

  // Test 3c: normal output should NOT trigger
  log('TEST', '3c: Normal output should not trigger');
  const normalRes = await api('POST', '/ai/test/predictive', {
    converseId: codingConverse.id,
    errorOutput: 'Server started on port 3000\nListening for connections...',
  }, token);

  if (!normalRes.triggered) {
    ok('Normal output correctly not triggered');
  } else {
    fail('False positive', `Triggered with category: ${normalRes.category}`);
  }
}

// ─── Phase 4: Bot Inter-communication ──────────────

async function testBotComm(ctx) {
  sep('Phase 4: Bot Inter-communication');

  const { token, socket, supervisor, codingBot } = ctx;

  // Test 4a: Cross-bot notification (CodingBot → Supervisor)
  log('TEST', '4a: CodingBot → Supervisor cross-notify');
  const notifyPromise = waitForEvent(socket, 'bot:cross:notify', 15_000);

  const notifyRes = await api('POST', '/bots/test/cross-notify', {
    fromBotId: codingBot.id,
    toBotId: supervisor.id,
    content: '代码编译完成，发现 3 个警告需要处理。',
    reason: 'Build completed with warnings',
  }, token);

  if (notifyRes.messageId) {
    ok(`Cross-bot message created: ${notifyRes.messageId}`);
  } else {
    fail('Cross-bot notify', JSON.stringify(notifyRes));
  }

  try {
    const payload = await notifyPromise;
    ok('bot:cross:notify WS event received');
    console.log(`    from:    ${payload.fromBotName} → ${payload.toBotName}`);
    console.log(`    content: "${payload.content}"`);
    console.log(`    source:  ${JSON.stringify(payload.triggerSource)}`);
  } catch (err) {
    fail('bot:cross:notify WS', err.message);
  }

  // Test 4b: Self-send blocked
  log('TEST', '4b: Bot cannot message itself');
  const selfRes = await api('POST', '/bots/test/cross-notify', {
    fromBotId: codingBot.id,
    toBotId: codingBot.id,
    content: 'test',
    reason: 'test',
  }, token);

  if (!selfRes.messageId) {
    ok('Self-send correctly blocked');
  } else {
    fail('Self-send not blocked', `messageId: ${selfRes.messageId}`);
  }

  // Test 4c: Supervisor routing
  log('TEST', '4c: Supervisor intent routing');
  try {
    const routeRes = await api('POST', '/bots/test/supervisor-route', {
      userMessage: '帮我在桌面上执行一个脚本',
    }, token);

    if (routeRes.recommendedBotId) {
      ok(`Supervisor routed to: ${routeRes.recommendedBotName} (confidence: ${routeRes.confidence})`);
      console.log(`    reason: ${routeRes.reason}`);
    } else {
      fail('Supervisor routing', 'No bot recommended');
    }
  } catch (err) {
    fail('Supervisor routing', err.message);
  }
}

// ─── Main ──────────────────────────────────────────

async function main() {
  const ctx = await setup();

  await testDraft(ctx);
  await testPredictive(ctx);
  await testBotComm(ctx);

  sep('Results');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total:  ${passed + failed}`);

  if (failed === 0) {
    console.log('\n  >> All E2E tests passed! <<');
  } else {
    console.log(`\n  >> ${failed} test(s) failed — check logs above <<`);
  }

  ctx.socket.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
