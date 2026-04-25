import { HttpException, HttpStatus } from '@nestjs/common';
import { AiGatewayService, ProxyChunk } from './ai-gateway.service';

const mockJwtService = {
  signAsync: jest.fn(),
};

const mockPrisma = {
  aiUsage: {
    create: jest.fn(),
  },
};

const mockRedis = {
  incr: jest.fn(),
  expire: jest.fn(),
};

const configValues: Record<string, string | number> = {
  DEEPSEEK_BASE_URL: 'https://deepseek.test',
  DEEPSEEK_API_KEY: 'deepseek-key',
  DEEPSEEK_MODEL: 'deepseek-chat',
  KIMI_BASE_URL: 'https://kimi.test',
  KIMI_API_KEY: 'kimi-key',
  KIMI_MODEL: 'moonshot-v1-8k',
};

const mockConfigService = {
  get: jest.fn((key: string, fallback?: string | number) =>
    key in configValues ? configValues[key] : fallback,
  ),
};

async function collect(
  stream: AsyncGenerator<ProxyChunk>,
): Promise<ProxyChunk[]> {
  const chunks: ProxyChunk[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

function responseFromSse(sse: string): Response {
  return new Response(sse, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('AiGatewayService', () => {
  let service: AiGatewayService;
  const originalFetch = global.fetch;
  const originalPrivateKey = process.env.AUTH_JWT_PRIVATE_KEY;

  beforeEach(() => {
    process.env.AUTH_JWT_PRIVATE_KEY = Buffer.from('test-private-key').toString(
      'base64',
    );
    jest.clearAllMocks();
    for (const key of Object.keys(configValues)) {
      delete configValues[key];
    }
    Object.assign(configValues, {
      DEEPSEEK_BASE_URL: 'https://deepseek.test',
      DEEPSEEK_API_KEY: 'deepseek-key',
      DEEPSEEK_MODEL: 'deepseek-chat',
      KIMI_BASE_URL: 'https://kimi.test',
      KIMI_API_KEY: 'kimi-key',
      KIMI_MODEL: 'moonshot-v1-8k',
    });

    service = new AiGatewayService(
      mockJwtService as any,
      mockPrisma as any,
      mockConfigService as any,
      mockRedis as any,
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalPrivateKey === undefined) {
      delete process.env.AUTH_JWT_PRIVATE_KEY;
    } else {
      process.env.AUTH_JWT_PRIVATE_KEY = originalPrivateKey;
    }
  });

  it('fails fast when Redis rate limit dependency is unavailable', async () => {
    mockRedis.incr.mockRejectedValueOnce(new Error('redis down'));

    let thrown: HttpException | undefined;
    try {
      await service.checkRateLimit('user-1');
    } catch (err) {
      thrown = err as HttpException;
    }

    expect(thrown).toBeInstanceOf(HttpException);
    expect(thrown?.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(thrown?.message).toBe('Rate limit dependency unavailable');

    expect(mockRedis.expire).not.toHaveBeenCalled();
  });

  it('returns a clear error when the provider API key is missing', async () => {
    configValues.DEEPSEEK_API_KEY = '';
    global.fetch = jest.fn();

    const chunks = await collect(
      service.streamProxy('user-1', {
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      }),
    );

    expect(chunks).toEqual([
      {
        type: 'error',
        message: 'LLM provider API key is not configured for deepseek-chat',
      },
    ]);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockPrisma.aiUsage.create).not.toHaveBeenCalled();
  });

  it('retries DeepSeek fetch failures and falls back to Kimi', async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(
        responseFromSse(
          [
            'data: {"choices":[{"delta":{"content":"OK"}}]}',
            '',
            'data: [DONE]',
            '',
          ].join('\n'),
        ),
      );
    global.fetch = fetchMock as any;

    const chunks = await collect(
      service.streamProxy('user-1', {
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://deepseek.test/v1/chat/completions',
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://deepseek.test/v1/chat/completions',
    );
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://kimi.test/v1/chat/completions',
    );
    expect(chunks).toEqual([
      { type: 'text', content: 'OK' },
      { type: 'done', usage: { prompt_tokens: 0, completion_tokens: 0 } },
    ]);
    expect(mockPrisma.aiUsage.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        model: 'moonshot-v1-8k',
        promptTokens: 0,
        completionTokens: 0,
        cost: 0,
      },
    });
  });
});
