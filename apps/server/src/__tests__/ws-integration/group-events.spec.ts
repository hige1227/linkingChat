/**
 * WS Integration Tests: Group Events (/chat namespace)
 *
 * Tests group:created, group:member:added, group:member:removed,
 * group:deleted event delivery.
 *
 * Requires: Docker services (Postgres, Redis) running.
 */
import { Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { TestContext, createTestApp } from './helpers/test-app';
import { connectSocket, waitForEvent, disconnectSocket } from './helpers/socket-client';
import { TestUser, registerTestUser, cleanupTestUsers } from './helpers/test-users';

describe('Group WS Events (chat namespace)', () => {
  let ctx: TestContext;
  let alice: TestUser;
  let bob: TestUser;
  let charlie: TestUser;
  let aliceSocket: ClientSocket;
  let bobSocket: ClientSocket;
  let charlieSocket: ClientSocket;
  let groupId: string;

  beforeAll(async () => {
    ctx = await createTestApp();

    // Register three test users
    alice = await registerTestUser(ctx.httpServer, 'alice');
    bob = await registerTestUser(ctx.httpServer, 'bob');
    charlie = await registerTestUser(ctx.httpServer, 'charlie');

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
    charlieSocket = await connectSocket({
      baseUrl: ctx.baseUrl,
      namespace: 'chat',
      token: charlie.accessToken,
    });
  }, 30_000);

  afterAll(async () => {
    disconnectSocket(aliceSocket);
    disconnectSocket(bobSocket);
    disconnectSocket(charlieSocket);
    await cleanupTestUsers(ctx.prisma, [alice.id, bob.id, charlie.id]);
    await ctx.app.close();
  }, 15_000);

  // ─── group:created ────────────────────────────────────────────

  it('all initial members receive group:created', async () => {
    const aliceCreated = waitForEvent<any>(aliceSocket, 'group:created');
    const bobCreated = waitForEvent<any>(bobSocket, 'group:created');

    const res = await request(ctx.httpServer)
      .post('/api/v1/converses/groups')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({
        name: 'Test Group',
        description: 'WS integration test group',
        memberIds: [bob.id],
      })
      .expect(201);

    groupId = res.body.id;

    const aliceData = await aliceCreated;
    expect(aliceData.id).toBe(groupId);
    expect(aliceData.name).toBe('Test Group');
    expect(aliceData.creatorId).toBe(alice.id);
    expect(aliceData.members).toBeDefined();
    expect(aliceData.members.length).toBeGreaterThanOrEqual(2);

    const bobData = await bobCreated;
    expect(bobData.id).toBe(groupId);
  });

  // ─── group:member:added ───────────────────────────────────────

  it('existing and new members receive group:member:added', async () => {
    // Join the group rooms first
    await new Promise<void>((resolve) => {
      aliceSocket.emit('converse:join', { converseId: groupId }, () => resolve());
    });
    await new Promise<void>((resolve) => {
      bobSocket.emit('converse:join', { converseId: groupId }, () => resolve());
    });

    const aliceAdded = waitForEvent<any>(aliceSocket, 'group:member:added');
    const bobAdded = waitForEvent<any>(bobSocket, 'group:member:added');
    const charlieAdded = waitForEvent<any>(charlieSocket, 'group:member:added');

    // Alice adds Charlie to the group
    await request(ctx.httpServer)
      .post(`/api/v1/converses/groups/${groupId}/members`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ memberIds: [charlie.id] })
      .expect(201);

    const aliceData = await aliceAdded;
    expect(aliceData.converseId).toBe(groupId);
    expect(aliceData.members).toBeDefined();
    expect(aliceData.members.length).toBeGreaterThanOrEqual(1);

    // Verify new member payload has required fields
    const newMember = aliceData.members.find((m: any) => m.userId === charlie.id);
    expect(newMember).toBeDefined();
    expect(newMember.username).toBe(charlie.username);
    expect(newMember.displayName).toBe(charlie.displayName);
    expect(newMember.role).toBeDefined();

    // Bob (existing member) also receives
    const bobData = await bobAdded;
    expect(bobData.converseId).toBe(groupId);

    // Charlie (new member) also receives via personal room
    const charlieData = await charlieAdded;
    expect(charlieData.converseId).toBe(groupId);
  });

  // ─── group:member:removed ─────────────────────────────────────

  it('members receive group:member:removed when someone is kicked', async () => {
    // Charlie joins the room
    await new Promise<void>((resolve) => {
      charlieSocket.emit('converse:join', { converseId: groupId }, () => resolve());
    });

    const aliceRemoved = waitForEvent<any>(aliceSocket, 'group:member:removed');
    const bobRemoved = waitForEvent<any>(bobSocket, 'group:member:removed');

    // Alice removes Charlie from the group
    await request(ctx.httpServer)
      .delete(`/api/v1/converses/groups/${groupId}/members/${charlie.id}`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);

    const aliceData = await aliceRemoved;
    expect(aliceData.converseId).toBe(groupId);
    expect(aliceData.userId).toBe(charlie.id);

    const bobData = await bobRemoved;
    expect(bobData.converseId).toBe(groupId);
    expect(bobData.userId).toBe(charlie.id);
  });

  // ─── group:deleted ────────────────────────────────────────────

  it('all members receive group:deleted when group is dissolved', async () => {
    const aliceDeleted = waitForEvent<any>(aliceSocket, 'group:deleted');
    const bobDeleted = waitForEvent<any>(bobSocket, 'group:deleted');

    // Alice (owner) deletes the group
    await request(ctx.httpServer)
      .delete(`/api/v1/converses/groups/${groupId}`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);

    const aliceData = await aliceDeleted;
    expect(aliceData.id).toBe(groupId);

    const bobData = await bobDeleted;
    expect(bobData.id).toBe(groupId);
  });
});
