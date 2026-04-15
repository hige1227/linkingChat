import type { AgentProvider, ChatChunk, AgentType } from '../agent-provider.interface';

describe('AgentProvider interface types', () => {
  it('ChatChunk type accepts valid done chunk', () => {
    const chunk: ChatChunk = { type: 'done', requestId: 'req-1' };
    expect(chunk.type).toBe('done');
  });

  it('AgentType accepts openclaw and hermes', () => {
    const a: AgentType = 'openclaw';
    const b: AgentType = 'hermes';
    expect(a).toBe('openclaw');
    expect(b).toBe('hermes');
  });
});
