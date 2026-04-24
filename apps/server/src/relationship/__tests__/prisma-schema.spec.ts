import { PrismaClient } from '@prisma/client';

describe('Prisma schema — relationship models', () => {
  it('RelationshipProfile model exists on PrismaClient', () => {
    const prisma = new PrismaClient();
    expect(typeof prisma.relationshipProfile).toBe('object');
    prisma.$disconnect();
  });

  it('RelationshipEvent model exists on PrismaClient', () => {
    const prisma = new PrismaClient();
    expect(typeof prisma.relationshipEvent).toBe('object');
    prisma.$disconnect();
  });

  it('JarvisState model exists on PrismaClient', () => {
    const prisma = new PrismaClient();
    expect(typeof prisma.jarvisState).toBe('object');
    prisma.$disconnect();
  });
});
