/**
 * WS Integration Tests: Friend Events (/chat namespace)
 *
 * Tests that friend-related WS events are delivered to the correct users
 * with complete payloads via the /chat namespace.
 *
 * Requires: Docker services (Postgres, Redis) running.
 * Run: pnpm test:integration
 */
import { Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { TestContext, createTestApp } from './helpers/test-app';
import { connectSocket, waitForEvent, assertNoEvent, disconnectSocketAndWait } from './helpers/socket-client';
import { TestUser, registerTestUser, cleanupTestUsers } from './helpers/test-users';

describe('Friend WS Events (chat namespace)', () => {
  let ctx: TestContext;
  let alice: TestUser;
  let bob: TestUser;
  let aliceSocket: ClientSocket;
  let bobSocket: ClientSocket;

  beforeAll(async () => {
    ctx = await createTestApp();

    // Register two test users
    alice = await registerTestUser(ctx.httpServer, 'alice');
    bob = await registerTestUser(ctx.httpServer, 'bob');

    // Connect both to /chat namespace
    aliceSocket = await connectSocket({
      baseUrl: ctx.baseUrl,
      namespace: 'chat',
      token: alice.accessToken,
    });
    bobSocket = await connectSocket({
      baseUrl: ctx.baseUrl,
      namespace: 'chat',
      token: bob.accessToken,
    });
  }, 30_000);

  afterAll(async () => {
    await Promise.all([
      disconnectSocketAndWait(aliceSocket),
      disconnectSocketAndWait(bobSocket),
    ]);
    await cleanupTestUsers(ctx.prisma, [alice.id, bob.id]);
    await ctx.app.close();
  }, 15_000);

  // ─── friend:request ───────────────────────────────────────────

  let friendRequestId: string;

  it('receiver gets friend:request with complete payload', async () => {
    const receivedPromise = waitForEvent<any>(bobSocket, 'friend:request');

    // Alice sends friend request to Bob via REST API
    const res = await request(ctx.httpServer)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ receiverId: bob.id })
      .expect(201);

    friendRequestId = res.body.id;

    // Bob should receive the friend:request event
    const data = await receivedPromise;
    expect(data).toBeDefined();
    expect(data.id).toBe(friendRequestId);
    expect(data.sender).toBeDefined();
    expect(data.sender.id).toBe(alice.id);
    expect(data.sender.username).toBe(alice.username);
    expect(data.sender.displayName).toBe(alice.displayName);
    expect(data.createdAt).toBeDefined();
  });

  it('sender does NOT receive their own friend:request', async () => {
    // Alice should not have received the friend:request event
    // (This checks the previous test's side-effect)
    await assertNoEvent(aliceSocket, 'friend:request', 500);
  });

  // ─── friend:accepted ─────────────────────────────────────────

  it('both users get friend:accepted and converse:new when request is accepted', async () => {
    // Both should get friend:accepted
    const aliceAccepted = waitForEvent<any>(aliceSocket, 'friend:accepted');
    const bobAccepted = waitForEvent<any>(bobSocket, 'friend:accepted');

    // Both should also get converse:new (DM created)
    const aliceConverse = waitForEvent<any>(aliceSocket, 'converse:new');
    const bobConverse = waitForEvent<any>(bobSocket, 'converse:new');

    // Bob accepts the friend request
    await request(ctx.httpServer)
      .post(`/api/v1/friends/accept/${friendRequestId}`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(200);

    // Verify friend:accepted payloads
    const aliceData = await aliceAccepted;
    expect(aliceData.friendId).toBeDefined();
    expect(aliceData.friend).toBeDefined();
    expect(aliceData.friend.id).toBe(bob.id);

    const bobData = await bobAccepted;
    expect(bobData.friendId).toBeDefined();
    expect(bobData.friend).toBeDefined();
    expect(bobData.friend.id).toBe(alice.id);

    // Verify converse:new payloads (DM conversation)
    const aliceConvData = await aliceConverse;
    expect(aliceConvData.id).toBeDefined();

    const bobConvData = await bobConverse;
    expect(bobConvData.id).toBeDefined();
  });

  // ─── friend:removed ──────────────────────────────────────────

  it('both users get friend:removed when friendship is deleted', async () => {
    const aliceRemoved = waitForEvent<any>(aliceSocket, 'friend:removed');
    const bobRemoved = waitForEvent<any>(bobSocket, 'friend:removed');

    // Alice removes Bob as friend
    await request(ctx.httpServer)
      .delete(`/api/v1/friends/${bob.id}`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);

    const aliceData = await aliceRemoved;
    expect(aliceData.userId).toBe(bob.id);

    const bobData = await bobRemoved;
    expect(bobData.userId).toBe(alice.id);
  });
});
