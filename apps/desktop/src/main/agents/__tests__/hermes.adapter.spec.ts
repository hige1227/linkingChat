import { HermesAdapter } from '../hermes.adapter';
import type { ChatChunk } from '../agent-provider.interface';

const HERMES_URL = 'http://127.0.0.1:8765';

describe('HermesAdapter', () => {
  let adapter: HermesAdapter;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    adapter = new HermesAdapter();
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('name is "hermes"', () => {
    expect(adapter.name).toBe('hermes');
  });

  it('isReady returns true when health endpoint 200', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true } as Response);
    await expect(adapter.isReady()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(`${HERMES_URL}/health`);
  });

  it('isReady returns false when health endpoint fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(adapter.isReady()).resolves.toBe(false);
  });

  it('chat parses SSE stream and yields text chunks', async () => {
    const sseLines = [
      'data: {"choices":[{"delta":{"content":"Hi"}}]}',
      'data: {"choices":[{"delta":{"content":"!"}}]}',
      'data: [DONE]',
    ].join('\n');

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseLines));
        controller.close();
      },
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      body: stream,
    } as unknown as Response);

    const chunks: ChatChunk[] = [];
    for await (const chunk of adapter.chat({ botId: 'b1', converseId: 'c1', message: 'hello', requestId: 'req-1' })) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual({ type: 'text', content: 'Hi', requestId: 'req-1' });
    expect(chunks[1]).toEqual({ type: 'text', content: '!', requestId: 'req-1' });
    expect(chunks[2]).toEqual({ type: 'done', requestId: 'req-1' });
  });

  it('cancelStream aborts in-flight stream', () => {
    const ctrl = new AbortController();
    const abortSpy = jest.spyOn(ctrl, 'abort');
    (adapter as any).activeStreams.set('req-2', ctrl);
    adapter.cancelStream('req-2');
    expect(abortSpy).toHaveBeenCalled();
  });
});
