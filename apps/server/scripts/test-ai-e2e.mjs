/**
 * Sprint 3 AI Module — End-to-End Manual Test Script
 *
 * 测试流程：
 *   1. 注册 2 个用户 (alice, bob)
 *   2. 互加好友 → 自动创建 DM 会话
 *   3. Alice 连接 /chat WebSocket
 *   4. Alice 发消息 "@ai 帮我回复 bob"
 *   5. 监听 ai:whisper:suggestions 事件 → 验证真实 LLM 返回
 *
 * 用法：
 *   node scripts/test-ai-e2e.mjs
 *
 * 前提：
 *   - pnpm docker:up (PG + Redis 运行中)
 *   - pnpm dev:server (NestJS 运行在 localhost:3008)
 *   - .env 中 DEEPSEEK_API_KEY / KIMI_API_KEY 已配置
 */

import { io } from 'socket.io-client';

const BASE = 'http://127.0.0.1:3008/api/v1';
const WS_URL = 'http://127.0.0.1:3008/chat';

const ts = Date.now();
const ALICE = {
  email: `alice_${ts}@test.com`,
  username: `alice_${ts}`,
  password: 'Test1234!',
  displayName: `Alice_${ts}`,
};
const BOB = {
  email: `bob_${ts}@test.com`,
  username: `bob_${ts}`,
  password: 'Test1234!',
  displayName: `Bob_${ts}`,
};

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
  if (!res.ok) {
    if (res.status === 409) return data;
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

function log(tag, msg, data) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [${tag}]`, msg);
  if (data !== undefined) console.log(JSON.stringify(data, null, 2));
}

function separator(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(60)}\n`);
}

// ─── Main ──────────────────────────────────────────

async function main() {
  separator('Step 1: Register two users');

  const aliceAuth = await api('POST', '/auth/register', ALICE);
  log('REGISTER', `Alice: ${ALICE.username}`, { userId: aliceAuth.user?.id });

  const bobAuth = await api('POST', '/auth/register', BOB);
  log('REGISTER', `Bob: ${BOB.username}`, { userId: bobAuth.user?.id });

  const aliceToken = aliceAuth.accessToken;
  const bobToken = bobAuth.accessToken;
  const aliceId = aliceAuth.user?.id;
  const bobId = bobAuth.user?.id;

  if (!aliceToken || !bobToken) {
    throw new Error('Registration failed — no tokens returned');
  }

  separator('Step 2: Bob sends friend request -> Alice accepts');

  // Bob sends friend request to Alice (using Alice's userId from registration)
  await api('POST', '/friends/request', { receiverId: aliceId }, bobToken);
  log('FRIEND', `Bob sent friend request to Alice (${aliceId})`);

  // Alice gets pending requests
  const pending = await api('GET', '/friends/requests', null, aliceToken);
  const received = pending?.received || (Array.isArray(pending) ? pending : []);
  const friendReq = received[0];
  if (!friendReq?.id) throw new Error('No pending friend request found');
  log('FRIEND', `Found request id=${friendReq.id}`);

  // Alice accepts
  await api('POST', `/friends/accept/${friendReq.id}`, {}, aliceToken);
  log('FRIEND', 'Alice accepted → DM converse should be created');

  separator('Step 3: Get DM converseId');

  // Small delay to let async DM creation complete
  await new Promise(r => setTimeout(r, 500));

  const converses = await api('GET', '/converses', null, aliceToken);
  log('CONVERSES', `Found ${Array.isArray(converses) ? converses.length : '?'} converses`);

  let converseId;
  if (Array.isArray(converses)) {
    // Find a DM converse (could be nested structure)
    const dm = converses.find(c => c.type === 'DM' || c.type === 'DIRECT');
    if (dm) {
      converseId = dm.id || dm.converseId;
    } else if (converses.length > 0) {
      // Use the first available converse
      converseId = converses[0].id || converses[0].converseId;
      log('WARN', `No DM found, using first converse (type=${converses[0].type})`);
    }
  }

  if (!converseId) {
    log('DEBUG', 'Converses response:', converses);
    throw new Error('No converse found — check friends/accept flow');
  }
  log('CONVERSE', `Using converseId = ${converseId}`);

  separator('Step 4: Connect Alice to /chat WebSocket');

  const socket = io(WS_URL, {
    auth: { token: aliceToken },
    transports: ['websocket'],
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WS connection timeout (5s)')), 5000);
    socket.on('connect', () => {
      clearTimeout(timeout);
      log('WS', `Connected! socketId = ${socket.id}`);
      resolve();
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`WS connect_error: ${err.message}`));
    });
  });

  separator('Step 5: Send @ai message + listen for whisper');

  // Set up listener BEFORE sending message
  const whisperPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(
        'Timeout (60s): No ai:whisper:suggestions received.\n' +
        '  → Check server terminal for [LLM OK] or [LLM FAIL] logs\n' +
        '  → Verify DEEPSEEK_API_KEY is valid in apps/server/.env\n' +
        '  → Verify server can reach https://api.deepseek.com'
      ));
    }, 60_000);

    socket.on('ai:whisper:suggestions', (payload) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });

  // Send message with @ai trigger via REST
  const msgContent = '@ai help me reply to Bob, say something friendly in Chinese';
  log('MSG', `Sending: "${msgContent}"`);
  const msg = await api('POST', '/messages', {
    converseId,
    content: msgContent,
  }, aliceToken);
  log('MSG', `Message created: id=${msg.id}`);

  // Wait for whisper suggestions
  log('WAIT', 'Waiting for ai:whisper:suggestions event (up to 15s)...');
  try {
    const payload = await whisperPromise;

    separator('SUCCESS: Whisper Suggestions Received!');
    console.log('  Primary:       ', payload.primary);
    if (payload.alternatives?.length) {
      payload.alternatives.forEach((alt, i) => {
        console.log(`  Alternative ${i + 1}: `, alt);
      });
    }
    console.log('');
    console.log('  suggestionId:  ', payload.suggestionId);
    console.log('  converseId:    ', payload.converseId);
    console.log('  messageId:     ', payload.messageId);
    console.log('  createdAt:     ', payload.createdAt);
    console.log('\n  >> LLM integration is working! <<');
  } catch (err) {
    separator('FAILED');
    console.error(err.message);
  }

  separator('Cleanup');
  socket.disconnect();
  log('DONE', 'Test complete');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
