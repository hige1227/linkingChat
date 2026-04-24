import { PrismaClient } from '@prisma/client';

describe('Prisma schema — relationship models', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('RelationshipProfile model exists on PrismaClient', () => {
    expect(typeof prisma.relationshipProfile).toBe('object');
  });

  it('RelationshipEvent model exists on PrismaClient', () => {
    expect(typeof prisma.relationshipEvent).toBe('object');
  });

  it('JarvisState model exists on PrismaClient', () => {
    expect(typeof prisma.jarvisState).toBe('object');
  });
});
