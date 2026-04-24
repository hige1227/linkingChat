import { RelationshipGraphService } from '../relationship-graph.service';

const mockPrisma = {
  relationshipProfile: {
    upsert: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({}),
  },
};

describe('RelationshipGraphService', () => {
  let svc: RelationshipGraphService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new RelationshipGraphService(mockPrisma as any);
  });

  it('onMessageEvent() upserts profile for both sender→receiver and receiver→sender', async () => {
    await svc.onMessageEvent({
      senderId: 'user-a',
      receiverId: 'user-b',
      converseType: 'DM',
      messageId: 'msg-1',
      sentAt: new Date(),
    });
    expect(mockPrisma.relationshipProfile.upsert).toHaveBeenCalledTimes(2);
  });

  it('onMessageEvent() increments weeklyMessageCount for sender→receiver direction', async () => {
    await svc.onMessageEvent({
      senderId: 'user-a',
      receiverId: 'user-b',
      converseType: 'DM',
      messageId: 'msg-2',
      sentAt: new Date(),
    });
    const firstCall = mockPrisma.relationshipProfile.upsert.mock.calls[0][0];
    expect(firstCall.update).toMatchObject({ weeklyMessageCount: { increment: 1 } });
  });

  it('weeklyDecay() saves prevWeeklyMessageCount and resets weeklyMessageCount to 0', async () => {
    mockPrisma.relationshipProfile.findMany.mockResolvedValue([
      { id: 'p-1', weeklyMessageCount: 5 },
    ]);
    await svc.weeklyDecay();
    expect(mockPrisma.relationshipProfile.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { prevWeeklyMessageCount: 5, weeklyMessageCount: 0 },
    });
  });
});
