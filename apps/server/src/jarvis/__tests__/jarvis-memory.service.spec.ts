import { JarvisMemoryService } from '../jarvis-memory.service';

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn(),
};
const mockPrisma = {
  jarvisState: {
    upsert: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn(),
  },
};

describe('JarvisMemoryService', () => {
  let svc: JarvisMemoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new JarvisMemoryService(mockRedis as any, mockPrisma as any);
  });

  it('save() writes to Redis with 1h TTL and upserts Prisma JarvisState', async () => {
    const messages = [{ role: 'user', content: 'hello' }];
    await svc.save('user-1', messages);
    expect(mockRedis.setex).toHaveBeenCalledWith(
      'jarvis:state:user-1',
      3600,
      JSON.stringify(messages),
    );
    expect(mockPrisma.jarvisState.upsert).toHaveBeenCalled();
  });

  it('restore() returns parsed messages from Redis when cache hit', async () => {
    const messages = [{ role: 'assistant', content: 'hi' }];
    mockRedis.get.mockResolvedValue(JSON.stringify(messages));
    const result = await svc.restore('user-1');
    expect(result).toEqual(messages);
    expect(mockPrisma.jarvisState.findUnique).not.toHaveBeenCalled();
  });

  it('restore() falls back to Prisma on Redis cache miss', async () => {
    const messages = [{ role: 'user', content: 'from db' }];
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.jarvisState.findUnique.mockResolvedValue({ messages });
    const result = await svc.restore('user-1');
    expect(result).toEqual(messages);
  });

  it('restore() returns null when neither Redis nor Prisma has state', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.jarvisState.findUnique.mockResolvedValue(null);
    const result = await svc.restore('user-1');
    expect(result).toBeNull();
  });

  it('compactContext() keeps last N messages', () => {
    const msgs = Array.from({ length: 60 }, (_, i) => ({ role: 'user', content: `msg ${i}` }));
    const compacted = svc.compactContext(msgs, 50);
    expect(compacted).toHaveLength(50);
    expect(compacted[0].content).toBe('msg 10');
  });
});
