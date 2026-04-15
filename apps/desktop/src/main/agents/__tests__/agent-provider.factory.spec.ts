import { AgentProviderFactory } from '../agent-provider.factory';
import { OpenClawAdapter } from '../openclaw.adapter';
import { HermesAdapter } from '../hermes.adapter';

jest.mock('../openclaw.adapter');
jest.mock('../hermes.adapter');
jest.mock('electron-store', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn((key: string, defaultVal?: any) => defaultVal),
    set: jest.fn(),
  }));
});

describe('AgentProviderFactory', () => {
  beforeEach(() => {
    AgentProviderFactory.reset();
  });

  it('create("openclaw") returns OpenClawAdapter', () => {
    const provider = AgentProviderFactory.create('openclaw');
    expect(provider).toBeInstanceOf(OpenClawAdapter);
  });

  it('create("hermes") returns HermesAdapter', () => {
    const provider = AgentProviderFactory.create('hermes');
    expect(provider).toBeInstanceOf(HermesAdapter);
  });

  it('active() returns last created provider', () => {
    AgentProviderFactory.create('openclaw');
    expect(AgentProviderFactory.active()).toBeInstanceOf(OpenClawAdapter);
    AgentProviderFactory.create('hermes');
    expect(AgentProviderFactory.active()).toBeInstanceOf(HermesAdapter);
  });

  it('throws on unknown type', () => {
    expect(() => AgentProviderFactory.create('unknown' as any)).toThrow('Unknown agent type');
  });
});
