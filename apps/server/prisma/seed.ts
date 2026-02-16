import { PrismaClient, ConverseType, MessageType, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ===== 1. 创建测试用户 =====
  const passwordHash = await argon2.hash('Test1234!');

  const alice = await prisma.user.upsert({
    where: { email: 'alice@linkingchat.com' },
    update: {},
    create: {
      email: 'alice@linkingchat.com',
      username: 'alice',
      password: passwordHash,
      displayName: 'Alice',
      status: UserStatus.OFFLINE,
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob@linkingchat.com' },
    update: {},
    create: {
      email: 'bob@linkingchat.com',
      username: 'bob',
      password: passwordHash,
      displayName: 'Bob',
      status: UserStatus.OFFLINE,
    },
  });

  console.log(`  Created users: ${alice.username} (${alice.id}), ${bob.username} (${bob.id})`);

  // ===== 2. 创建好友关系 =====
  // 较小 ID 放 userAId 端
  const [userAId, userBId] = alice.id < bob.id
    ? [alice.id, bob.id]
    : [bob.id, alice.id];

  const friendship = await prisma.friendship.upsert({
    where: {
      userAId_userBId: { userAId, userBId },
    },
    update: {},
    create: {
      userAId,
      userBId,
    },
  });

  console.log(`  Created friendship: ${friendship.id}`);

  // ===== 3. 创建 DM 会话 =====
  // 检查是否已存在 DM 会话
  const existingConverse = await prisma.converse.findFirst({
    where: {
      type: ConverseType.DM,
      AND: [
        { members: { some: { userId: alice.id } } },
        { members: { some: { userId: bob.id } } },
      ],
    },
  });

  const converse = existingConverse ?? await prisma.converse.create({
    data: {
      type: ConverseType.DM,
      members: {
        create: [
          { userId: alice.id },
          { userId: bob.id },
        ],
      },
    },
  });

  console.log(`  Created DM converse: ${converse.id}`);

  // ===== 4. 创建测试消息 =====
  const existingMessages = await prisma.message.count({
    where: { converseId: converse.id },
  });

  if (existingMessages === 0) {
    const msg1 = await prisma.message.create({
      data: {
        content: 'Hi Bob! Welcome to LinkingChat.',
        type: MessageType.TEXT,
        converseId: converse.id,
        authorId: alice.id,
      },
    });

    const msg2 = await prisma.message.create({
      data: {
        content: 'Hey Alice! Thanks, this looks great.',
        type: MessageType.TEXT,
        converseId: converse.id,
        authorId: bob.id,
      },
    });

    const msg3 = await prisma.message.create({
      data: {
        content: 'Let me try sending a command to my desktop.',
        type: MessageType.TEXT,
        converseId: converse.id,
        authorId: alice.id,
      },
    });

    // 更新 ConverseMember 的 lastMessageId
    await prisma.converseMember.update({
      where: {
        converseId_userId: { converseId: converse.id, userId: alice.id },
      },
      data: {
        lastMessageId: msg3.id,
        lastSeenMessageId: msg3.id, // Alice 已读所有消息
      },
    });

    await prisma.converseMember.update({
      where: {
        converseId_userId: { converseId: converse.id, userId: bob.id },
      },
      data: {
        lastMessageId: msg3.id,
        lastSeenMessageId: msg2.id, // Bob 只读到自己发的最后一条
      },
    });

    console.log(`  Created 3 test messages`);
  } else {
    console.log(`  Messages already exist, skipping`);
  }

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
