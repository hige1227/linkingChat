jest.mock('@mariozechner/pi-ai', () => ({}), { virtual: true });
/**
 * WS Integration Tests: Message Events (/chat namespace)
 *
 * Tests message:new, message:updated, message:deleted event delivery
 * with complete payloads.
 *
 * Requires: Docker services (Postgres, Redis) running.
 */
import { Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { TestContext, createTestApp } from './helpers/test-app';
import { connectSocket, waitForEvent, disconnectSocketAndWait } from './helpers/socket-client';
import { TestUser, registerTestUser, cleanupTestUsers } from './helpers/test-users';

describe('Message WS Events (chat namespace)', () => {
  let ctx: TestContext;
  let alice: TestUser;
  let bob: TestUser;
  let aliceSocket: ClientSocket;
  let bobSocket: ClientSocket;
  let converseId: string;

  beforeAll(async () => {
    ctx = await createTestApp();

    // Register users and make them friends (which creates a DM)
    alice = await registerTestUser(ctx.httpServer, 'alice');
    bob = await registerTestUser(ctx.httpServer, 'bob');

    // Send and accept friend request → creates a DM converse
    const reqRes = await request(ctx.httpServer)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ receiverId: bob.id })
      .expect(201);

    await request(ctx.httpServer)
      .post(`/api/v1/friends/accept/${reqRes.body.id}`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(200);

    // Get converseId from friends list
    const friendsRes = await request(ctx.httpServer)
      .get('/api/v1/friends')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);

    converseId = friendsRes.body[0]?.converseId;
    expect(converseId).toBeDefined();

    // Connect sockets
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

    // Join the converse room
    await new Promise<void>((resolve) => {
      aliceSocket.emit('converse:join', { converseId }, () => resolve());
    });
    await new Promise<void>((resolve) => {
      bobSocket.emit('converse:join', { converseId }, () => resolve());
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

  // ─── message:new ──────────────────────────────────────────────

  let messageId: string;

  it('receiver gets message:new with complete payload', async () => {
    const received = waitForEvent<any>(bobSocket, 'message:new');

    const res = await request(ctx.httpServer)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({
        content: 'Hello Bob!',
        converseId,
      })
      .expect(201);

    messageId = res.body.id;

    const data = await received;
    expect(data.id).toBe(messageId);
    expect(data.content).toBe('Hello Bob!');
    expect(data.type).toBe('TEXT');
    expect(data.converseId).toBe(converseId);
    expect(data.authorId).toBe(alice.id);
    expect(data.author).toBeDefined();
    expect(data.author.id).toBe(alice.id);
    expect(data.author.username).toBe(alice.username);
    expect(data.author.displayName).toBe(alice.displayName);
    expect(data.createdAt).toBeDefined();
    expect(data.updatedAt).toBeDefined();
  });

  // ─── message:deleted (recall) ─────────────────────────────────

  it('receiver gets message:deleted when sender recalls', async () => {
    const received = waitForEvent<any>(bobSocket, 'message:deleted');

    await request(ctx.httpServer)
      .delete(`/api/v1/messages/${messageId}`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);

    const data = await received;
    expect(data.id).toBe(messageId);
    expect(data.converseId).toBe(converseId);
  });
});
