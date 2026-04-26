import { RelationshipsController } from '../relationships.controller';

describe('RelationshipsController', () => {
  const mockPrisma = {
    relationshipProfile: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses JwtStrategy userId payload shape for GET', async () => {
    mockPrisma.relationshipProfile.findMany.mockResolvedValue([]);
    const controller = new RelationshipsController(mockPrisma as any);

    await controller.findAll({ user: { userId: 'user-1' } });

    expect(mockPrisma.relationshipProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });

  it('uses JwtStrategy userId payload shape for PATCH', async () => {
    mockPrisma.relationshipProfile.upsert.mockResolvedValue({
      id: 'profile-1',
      contactId: 'contact-1',
      tier: 'CORE',
      label: 'Important contact',
      notes: 'Manual local test',
      isMuted: false,
      isUrgentReply: false,
      lastInteractionAt: null,
      weeklyMessageCount: 0,
      sentimentTrend: null,
      lastKeyEventSummary: null,
      events: [],
    });
    const controller = new RelationshipsController(mockPrisma as any);

    await controller.update(
      { user: { userId: 'user-1' } },
      'contact-1',
      { tier: 'CORE', label: 'Important contact', notes: 'Manual local test' },
    );

    expect(mockPrisma.relationshipProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_contactId: { userId: 'user-1', contactId: 'contact-1' } },
        create: expect.objectContaining({ userId: 'user-1', contactId: 'contact-1' }),
      }),
    );
  });
});
