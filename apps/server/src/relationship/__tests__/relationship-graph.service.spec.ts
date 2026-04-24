import { RelationshipGraphService } from '../relationship-graph.service';

const mockPrisma = {
  relationshipProfile: {
    upsert: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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

  it('onMessageEvent() upserts profile for both sender→receiver and receiver→sender (DM)', async () => {
    await svc.onMessageEvent({
      senderId: 'user-a',
      receiverId: 'user-b',
      converseType: 'DM',
      messageId: 'msg-1',
      sentAt: new Date(),
    });
    expect(mockPrisma.relationshipProfile.upsert).toHaveBeenCalledTimes(2);
    expect(mockPrisma.relationshipProfile.updateMany).not.toHaveBeenCalled();
  });

  it('onMessageEvent() increments weeklyMessageCount for sender→receiver direction (DM)', async () => {
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

  it('onMessageEvent() uses updateMany (no create) for GROUP events', async () => {
    await svc.onMessageEvent({
      senderId: 'user-a',
      receiverId: 'user-b',
      converseType: 'GROUP',
      messageId: 'msg-3',
      sentAt: new Date(),
    });
    expect(mockPrisma.relationshipProfile.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.relationshipProfile.updateMany).toHaveBeenCalledTimes(2);
  });

  it('onMessageEvent() increments groupInteractionCount for sender→receiver direction (GROUP)', async () => {
    await svc.onMessageEvent({
      senderId: 'user-a',
      receiverId: 'user-b',
      converseType: 'GROUP',
      messageId: 'msg-4',
      sentAt: new Date(),
    });
    const senderCall = mockPrisma.relationshipProfile.updateMany.mock.calls[0][0];
    expect(senderCall.data).toMatchObject({ groupInteractionCount: { increment: 1 } });
    const receiverCall = mockPrisma.relationshipProfile.updateMany.mock.calls[1][0];
    expect(receiverCall.data).not.toHaveProperty('groupInteractionCount');
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
