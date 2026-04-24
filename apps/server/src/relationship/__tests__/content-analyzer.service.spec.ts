import { ContentAnalyzerService } from '../content-analyzer.service';

const mockLlmConfig = { completeText: jest.fn() };

describe('ContentAnalyzerService', () => {
  let svc: ContentAnalyzerService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new ContentAnalyzerService(mockLlmConfig as any);
  });

  describe('ruleFilter', () => {
    it('returns false for very short messages', () => {
      expect(svc.ruleFilter('ok')).toBe(false);
    });

    it('returns false for messages under 8 chars', () => {
      expect(svc.ruleFilter('hello')).toBe(false);
    });

    it('returns false for pure emoji', () => {
      expect(svc.ruleFilter('😊👍')).toBe(false);
    });

    it('returns true for life-event keyword', () => {
      expect(svc.ruleFilter('我妈妈昨天住院了')).toBe(true);
    });

    it('returns true for commitment keyword', () => {
      expect(svc.ruleFilter('我答应你下周一定来')).toBe(true);
    });

    it('returns true for !! pattern', () => {
      expect(svc.ruleFilter('真的太厉害了！！')).toBe(true);
    });
  });

  describe('extractEvents', () => {
    it('parses JSON array returned by LLM', async () => {
      mockLlmConfig.completeText.mockResolvedValue(
        JSON.stringify([{ type: 'life_event', summary: '妈妈住院了' }]),
      );
      const events = await svc.extractEvents('我妈妈住院了', 'msg-1');
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('life_event');
      expect(events[0].sourceMessageId).toBe('msg-1');
    });

    it('returns empty array when LLM returns null', async () => {
      mockLlmConfig.completeText.mockResolvedValue(null);
      expect(await svc.extractEvents('text', 'msg-2')).toEqual([]);
    });

    it('returns empty array when LLM returns invalid JSON', async () => {
      mockLlmConfig.completeText.mockResolvedValue('not json');
      expect(await svc.extractEvents('text', 'msg-3')).toEqual([]);
    });

    it('returns empty array when LLM returns a non-array JSON value', async () => {
      mockLlmConfig.completeText.mockResolvedValue('{"type":"life_event"}');
      expect(await svc.extractEvents('text', 'msg-4')).toEqual([]);
    });
  });
});
