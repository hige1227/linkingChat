import { SetupService } from '../setup.service';

jest.mock('electron-store', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn((key: string, defaultVal?: any) => defaultVal),
    set: jest.fn(),
  }));
});

jest.mock('electron', () => ({
  app: { isPackaged: false },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('SetupService', () => {
  let service: SetupService;
  let mockStore: any;

  beforeEach(() => {
    service = new SetupService();
    mockStore = (service as any).store;
    jest.clearAllMocks();
  });

  it('skips if setupComplete is true', async () => {
    mockStore.get.mockReturnValueOnce(true);
    await service.initialize('user-1', 'token-abc');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches API key and saves to store on first run', async () => {
    mockStore.get.mockReturnValue(false);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { apiKey: 'sk-test-123', provider: 'deepseek' } }),
    });

    await service.initialize('user-1', 'token-abc');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/config/agent-key'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token-abc' }) }),
    );
    expect(mockStore.set).toHaveBeenCalledWith('platformApiKey', 'sk-test-123');
    expect(mockStore.set).toHaveBeenCalledWith('setupComplete', true);
  });

  it('does not set setupComplete if API key fetch fails', async () => {
    mockStore.get.mockReturnValue(false);
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await service.initialize('user-1', 'token-abc');

    const setCalls = mockStore.set.mock.calls.map((c: any[]) => c[0]);
    expect(setCalls).not.toContain('setupComplete');
  });
});
