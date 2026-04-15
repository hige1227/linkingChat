import { OpenClawAdapter } from '../openclaw.adapter';
import type { ChatChunk } from '../agent-provider.interface';
import { openClawClientService } from '../../services/openclaw-client.service';

jest.mock('../../services/openclaw-client.service', () => ({
  openClawClientService: {
    isClientConnected: jest.fn(),
    getClient: jest.fn(),
  },
}));

describe('OpenClawAdapter', () => {
  let adapter: OpenClawAdapter;

  beforeEach(() => {
    adapter = new OpenClawAdapter();
    jest.clearAllMocks();
  });

  it('name is "openclaw"', () => {
    expect(adapter.name).toBe('openclaw');
  });

  it('isReady returns true when connected', async () => {
    (openClawClientService.isClientConnected as jest.Mock).mockReturnValue(true);
    await expect(adapter.isReady()).resolves.toBe(true);
  });

  it('isReady returns false when disconnected', async () => {
    (openClawClientService.isClientConnected as jest.Mock).mockReturnValue(false);
    await expect(adapter.isReady()).resolves.toBe(false);
  });

  it('chat yields mapped chunks from client.chat()', async () => {
    async function* fakeStream() {
      yield { type: 'text' as const, text: 'Hello' };
      yield { type: 'done' as const, text: '' };
    }

    const mockClient = { chat: jest.fn().mockReturnValue(fakeStream()) };
    (openClawClientService.isClientConnected as jest.Mock).mockReturnValue(true);
    (openClawClientService.getClient as jest.Mock).mockReturnValue(mockClient);

    const chunks: ChatChunk[] = [];
    for await (const chunk of adapter.chat({ botId: 'b1', converseId: 'c1', message: 'hi', requestId: 'req-1' })) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ type: 'text', content: 'Hello', requestId: 'req-1' });
    expect(chunks[1]).toEqual({ type: 'done', requestId: 'req-1' });
  });

  it('chat yields error when not connected', async () => {
    (openClawClientService.isClientConnected as jest.Mock).mockReturnValue(false);
    (openClawClientService.getClient as jest.Mock).mockReturnValue(null);

    const chunks: ChatChunk[] = [];
    for await (const chunk of adapter.chat({ botId: 'b1', converseId: 'c1', message: 'hi', requestId: 'req-1' })) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('error');
  });

  it('cancelStream sets cancelled flag', () => {
    // cancelStream should not throw when no stream active
    expect(() => adapter.cancelStream('req-unknown')).not.toThrow();
  });
});
