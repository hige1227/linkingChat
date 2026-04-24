import { JarvisToolRegistry } from '../jarvis-tool.registry';

describe('JarvisToolRegistry', () => {
  let registry: JarvisToolRegistry;

  beforeEach(() => {
    const mockPrisma = { relationshipProfile: { findUnique: jest.fn(), findMany: jest.fn() }, message: { findMany: jest.fn() } };
    const mockBots = { getOrCreateSupervisorConverse: jest.fn() };
    const mockBroadcast = { toRoom: jest.fn() };
    registry = new JarvisToolRegistry(
      mockPrisma as any,
      mockBots as any,
      mockBroadcast as any,
    );
  });

  it('buildTools returns the 4 L3 tools', () => {
    const tools = registry.buildTools('user-123');
    const names = tools.map((t: any) => t.name);
    expect(names).toContain('query_relationship');
    expect(names).toContain('list_relationships');
    expect(names).toContain('search_messages');
    expect(names).toContain('send_nudge');
    expect(tools).toHaveLength(4);
  });

  it('each tool has name, description, and execute function', () => {
    const tools = registry.buildTools('user-123');
    for (const tool of tools) {
      expect(typeof (tool as any).name).toBe('string');
      expect(typeof (tool as any).description).toBe('string');
      expect(typeof (tool as any).execute).toBe('function');
    }
  });
});
