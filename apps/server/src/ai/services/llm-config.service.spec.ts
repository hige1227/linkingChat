import { ConfigService } from '@nestjs/config';

let mockComplete: jest.Mock;

import {
  LlmConfigService,
  resetPiAiLoaderForTest,
  setPiAiLoaderForTest,
} from '../llm-config.service';

describe('LlmConfigService', () => {
  let svc: LlmConfigService;
  let mockConfig: { get: jest.Mock };

  beforeEach(() => {
    mockComplete = jest.fn();
    setPiAiLoaderForTest(async () => ({
      complete: (...args: unknown[]) => mockComplete(...args),
    }) as any);
    mockConfig = { get: jest.fn().mockReturnValue('test-key') };
    svc = new LlmConfigService(mockConfig as unknown as ConfigService);
  });

  afterEach(() => {
    resetPiAiLoaderForTest();
  });

  describe('getModel', () => {
    it('returns deepseek model for whisper tasks', () => {
      const m = svc.getModel('whisper');
      expect(m.provider).toBe('deepseek');
      expect(m.id).toBe('deepseek-chat');
    });

    it('returns kimi model for draft tasks', () => {
      expect(svc.getModel('draft').provider).toBe('kimi');
    });

    it('returns kimi model for complex_analysis tasks', () => {
      expect(svc.getModel('complex_analysis').provider).toBe('kimi');
    });

    it('returns deepseek model for predictive and chat tasks', () => {
      expect(svc.getModel('predictive').provider).toBe('deepseek');
      expect(svc.getModel('chat').provider).toBe('deepseek');
    });
  });

  describe('completeText', () => {
    it('returns joined text content from assistant message', async () => {
      mockComplete.mockResolvedValue({
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'thinking', thinking: 'reasoning' },
          { type: 'text', text: 'world' },
        ],
      });

      const result = await svc.completeText('whisper', 'sys', 'user msg');
      expect(result).toBe('Hello world');
    });

    it('passes correct apiKey for deepseek model', async () => {
      mockConfig.get.mockImplementation((key: string) =>
        key === 'DEEPSEEK_API_KEY' ? 'ds-key' : 'ki-key',
      );
      mockComplete.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });

      await svc.completeText('whisper', 'sys', 'msg');
      expect(mockComplete).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'deepseek' }),
        expect.anything(),
        expect.objectContaining({ apiKey: 'ds-key' }),
      );
    });

    it('passes correct apiKey for kimi model', async () => {
      mockConfig.get.mockImplementation((key: string) =>
        key === 'KIMI_API_KEY' ? 'ki-key' : 'ds-key',
      );
      mockComplete.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });

      await svc.completeText('draft', 'sys', 'msg');
      expect(mockComplete).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'kimi' }),
        expect.anything(),
        expect.objectContaining({ apiKey: 'ki-key' }),
      );
    });

    it('returns null on timeout', async () => {
      jest.useFakeTimers();
      mockComplete.mockImplementation(() => new Promise(() => {})); // never resolves

      const resultPromise = svc.completeText('whisper', 'sys', 'msg', { timeoutMs: 100 });
      jest.advanceTimersByTime(200);
      const result = await resultPromise;

      expect(result).toBeNull();
      jest.useRealTimers();
    });

    it('returns null on LLM error', async () => {
      mockComplete.mockRejectedValue(new Error('network failure'));

      const result = await svc.completeText('whisper', 'sys', 'msg');
      expect(result).toBeNull();
    });

    it('passes temperature: 0 correctly (does not silently drop it)', async () => {
      mockComplete.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });

      await svc.completeText('whisper', 'sys', 'msg', { temperature: 0 });
      expect(mockComplete).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ temperature: 0 }),
      );
    });
  });
});

