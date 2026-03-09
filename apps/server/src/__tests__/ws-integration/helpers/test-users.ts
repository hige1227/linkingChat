/**
 * Test user registration and cleanup helpers.
 * Uses the real REST API to create users with unique names.
 */
import request from 'supertest';
import { PrismaService } from '../../../prisma/prisma.service';

const TEST_PREFIX = `wstest${Date.now()}`;

export interface TestUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
}

let userCounter = 0;

/**
 * Register a new test user via the auth API.
 */
export async function registerTestUser(
  httpServer: any,
  name: string,
): Promise<TestUser> {
  userCounter++;
  const username = `${TEST_PREFIX}_${name}_${userCounter}`;
  const email = `${username}@test.local`;
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);

  const res = await request(httpServer)
    .post('/api/v1/auth/register')
    .send({
      email,
      username,
      password: 'TestPass123!',
      displayName,
    })
    .expect(201);

  return {
    id: res.body.user.id,
    email,
    username,
    displayName,
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
  };
}

/**
 * Cleanup all test users and their related data.
 * Call in afterAll().
 */
export async function cleanupTestUsers(
  prisma: PrismaService,
  userIds: string[],
): Promise<void> {
  if (userIds.length === 0) return;

  // Delete in dependency order
  await prisma.message
    .deleteMany({ where: { authorId: { in: userIds } } })
    .catch(() => {});
  await prisma.converseMember
    .deleteMany({ where: { userId: { in: userIds } } })
    .catch(() => {});
  await prisma.converse
    .deleteMany({ where: { creatorId: { in: userIds } } })
    .catch(() => {});
  await prisma.friendRequest
    .deleteMany({
      where: {
        OR: [
          { senderId: { in: userIds } },
          { receiverId: { in: userIds } },
        ],
      },
    })
    .catch(() => {});
  await prisma.friendship
    .deleteMany({
      where: {
        OR: [
          { userAId: { in: userIds } },
          { userBId: { in: userIds } },
        ],
      },
    })
    .catch(() => {});
  await prisma.refreshToken
    .deleteMany({ where: { userId: { in: userIds } } })
    .catch(() => {});
  await prisma.device
    .deleteMany({ where: { userId: { in: userIds } } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: userIds } } })
    .catch(() => {});
}
