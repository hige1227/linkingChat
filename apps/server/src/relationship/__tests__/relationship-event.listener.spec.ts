// Mock the ESM package before any imports that pull it in transitively.
jest.mock('@mariozechner/pi-ai', () => ({ complete: jest.fn() }), { virtual: true });

import { RelationshipEventListener } from '../relationship-event.listener';

const mockGraph = { onMessageEvent: jest.fn().mockResolvedValue(undefined) };
const mockAnalyzer = {
  ruleFilter: jest.fn().mockReturnValue(false),
  extractEvents: jest.fn().mockResolvedValue([]),
};
const mockPrisma = { relationshipEvent: { createMany: jest.fn().mockResolvedValue({}) } };

describe('RelationshipEventListener', () => {
  let listener: RelationshipEventListener;

  beforeEach(() => {
    jest.clearAllMocks();
    listener = new RelationshipEventListener(mockGraph as any, mockAnalyzer as any, mockPrisma as any);
  });

  it('calls onMessageEvent for every message', async () => {
    await listener.handleMessageCreated({
      messageId: 'msg-1', senderId: 'user-a', receiverId: 'user-b',
      converseType: 'DM', content: 'hello', sentAt: new Date(), profileId: 'p-1',
    });
    expect(mockGraph.onMessageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: 'user-a', receiverId: 'user-b' }),
    );
  });

  it('skips LLM extraction when ruleFilter returns false', async () => {
    mockAnalyzer.ruleFilter.mockReturnValue(false);
    await listener.handleMessageCreated({
      messageId: 'msg-2', senderId: 'u', receiverId: 'c',
      converseType: 'DM', content: 'ok', sentAt: new Date(), profileId: 'p-2',
    });
    expect(mockAnalyzer.extractEvents).not.toHaveBeenCalled();
  });

  it('persists extracted events when ruleFilter passes', async () => {
    mockAnalyzer.ruleFilter.mockReturnValue(true);
    const extractPromise = Promise.resolve([
      { type: 'life_event', summary: '住院了', sourceMessageId: 'msg-3' },
    ]);
    mockAnalyzer.extractEvents.mockReturnValue(extractPromise);

    await listener.handleMessageCreated({
      messageId: 'msg-3', senderId: 'u', receiverId: 'c',
      converseType: 'DM', content: '我妈住院了', sentAt: new Date(), profileId: 'p-3',
    });

    await extractPromise; // drains the microtask queue deterministically
    expect(mockPrisma.relationshipEvent.createMany).toHaveBeenCalled();
  });
});
