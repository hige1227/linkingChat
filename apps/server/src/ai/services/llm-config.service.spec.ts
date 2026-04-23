import { ConfigService } from '@nestjs/config';

// Mock the pi-ai module before importing LlmConfigService
jest.mock('@mariozechner/pi-ai', () => ({
  complete: jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'mocked response' }],
  }),
}), { virtual: true });

import { LlmConfigService } from '../llm-config.service';

describe('LlmConfigService', () => {
  let svc: LlmConfigService;

  beforeEach(() => {
    const mockConfig = { get: jest.fn().mockReturnValue('test-key') };
    svc = new LlmConfigService(mockConfig as unknown as ConfigService);
  });

  it('returns deepseek model for whisper tasks', () => {
    const m = svc.getModel('whisper');
    expect(m.provider).toBe('deepseek');
    expect(m.id).toBe('deepseek-chat');
  });

  it('returns kimi model for draft tasks', () => {
    const m = svc.getModel('draft');
    expect(m.provider).toBe('kimi');
  });

  it('returns kimi model for complex_analysis tasks', () => {
    expect(svc.getModel('complex_analysis').provider).toBe('kimi');
  });

  it('returns deepseek model for predictive and chat tasks', () => {
    expect(svc.getModel('predictive').provider).toBe('deepseek');
    expect(svc.getModel('chat').provider).toBe('deepseek');
  });
});
