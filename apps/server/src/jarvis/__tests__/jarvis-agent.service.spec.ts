import {
  JarvisAgentService,
  resetPiAgentCoreLoaderForTest,
  setPiAgentCoreLoaderForTest,
} from '../jarvis-agent.service';

class MockAgent {
  readonly state = { messages: [] as unknown[] };
  subscribe = jest.fn();
  prompt = jest.fn().mockResolvedValue(undefined);
  continue = jest.fn().mockResolvedValue(undefined);
  followUp = jest.fn();
  steer = jest.fn();
  constructor(_opts?: unknown) {}
}

const mockToolRegistry = { buildTools: jest.fn().mockReturnValue([]) };
const mockMemoryService = {
  restore: jest.fn().mockResolvedValue(null),
  save: jest.fn().mockResolvedValue(undefined),
  compactContext: jest.fn((msgs: any[]) => msgs),
  logToolUse: jest.fn().mockResolvedValue(undefined),
};
const mockBroadcast = { toRoom: jest.fn() };
const mockLlmConfig = {
  getModel: jest.fn().mockReturnValue({ id: 'deepseek-chat', provider: 'deepseek' }),
};

describe('JarvisAgentService', () => {
  let svc: JarvisAgentService;

  beforeEach(() => {
    jest.clearAllMocks();
    setPiAgentCoreLoaderForTest(async () => ({ Agent: MockAgent as any }));
    svc = new JarvisAgentService(
      mockToolRegistry as any,
      mockMemoryService as any,
      mockBroadcast as any,
      mockLlmConfig as any,
    );
  });

  afterEach(() => {
    svc.onModuleDestroy();
    resetPiAgentCoreLoaderForTest();
  });

  it('getOrCreate() returns the same Agent instance on repeated calls', async () => {
    const a1 = await svc.getOrCreate('user-1');
    const a2 = await svc.getOrCreate('user-1');
    expect(a1).toBe(a2);
  });

  it('getOrCreate() returns distinct instances for different users', async () => {
    const a1 = await svc.getOrCreate('user-1');
    const a2 = await svc.getOrCreate('user-2');
    expect(a1).not.toBe(a2);
  });

  it('getOrCreate() calls restore() to load saved messages', async () => {
    const saved = [{ role: 'user', content: 'previous message' }];
    mockMemoryService.restore.mockResolvedValueOnce(saved);
    await svc.getOrCreate('user-with-history');
    expect(mockMemoryService.restore).toHaveBeenCalledWith('user-with-history');
  });
});
