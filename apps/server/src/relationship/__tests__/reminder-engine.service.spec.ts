// pi-agent-core is ESM-only; stub it out before any transitive import resolves it.
jest.mock('@mariozechner/pi-agent-core', () => {
  class Agent {
    readonly state = { messages: [] as unknown[] };
    subscribe = jest.fn();
    prompt = jest.fn().mockResolvedValue(undefined);
    followUp = jest.fn();
    steer = jest.fn();
    constructor(_opts?: unknown) {}
  }
  return { Agent };
});

import { ReminderEngineService } from '../reminder-engine.service';

const mockPrisma = {
  relationshipProfile: {
    findMany: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({}),
  },
};
const mockJarvis = { systemTrigger: jest.fn().mockResolvedValue(undefined) };

describe('ReminderEngineService', () => {
  let svc: ReminderEngineService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new ReminderEngineService(mockPrisma as any, mockJarvis as any);
  });

  it('triggers Jarvis for a CORE contact silent for 8 days', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000);
    mockPrisma.relationshipProfile.findMany.mockResolvedValue([{
      id: 'p-1', userId: 'user-a', contactId: 'contact-b',
      tier: 'CORE', isMuted: false, customSilenceDays: null,
      silenceReminderSentAt: null, lastInteractionAt: eightDaysAgo,
      label: null, lastKeyEventSummary: null,
    }]);

    await svc.runDailyEvaluation();

    expect(mockJarvis.systemTrigger).toHaveBeenCalledWith(
      'user-a', 'SILENCE_REMINDER',
      expect.objectContaining({ contactId: 'contact-b' }),
    );
  });

  it('skips muted profiles', async () => {
    mockPrisma.relationshipProfile.findMany.mockResolvedValue([{
      id: 'p-2', userId: 'user-a', contactId: 'contact-c',
      tier: 'CORE', isMuted: true, customSilenceDays: null,
      silenceReminderSentAt: null, lastInteractionAt: new Date(Date.now() - 10 * 86_400_000),
      label: null, lastKeyEventSummary: null,
    }]);

    await svc.runDailyEvaluation();

    expect(mockJarvis.systemTrigger).not.toHaveBeenCalled();
  });

  it('caps reminders at 3 per user per day', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000);
    const profiles = Array.from({ length: 5 }, (_, i) => ({
      id: `p-${i}`, userId: 'user-a', contactId: `c-${i}`,
      tier: 'CORE', isMuted: false, customSilenceDays: null,
      silenceReminderSentAt: null, lastInteractionAt: eightDaysAgo,
      label: null, lastKeyEventSummary: null,
    }));
    mockPrisma.relationshipProfile.findMany.mockResolvedValue(profiles);

    await svc.runDailyEvaluation();

    expect(mockJarvis.systemTrigger).toHaveBeenCalledTimes(3);
  });

  describe('isSilent', () => {
    it('CORE: silent after 7 days', () => {
      expect(svc.isSilent({ tier: 'CORE', customSilenceDays: null, lastInteractionAt: new Date(Date.now() - 8 * 86_400_000) } as any)).toBe(true);
    });

    it('IMPORTANT: not silent at 10 days (threshold is 21)', () => {
      expect(svc.isSilent({ tier: 'IMPORTANT', customSilenceDays: null, lastInteractionAt: new Date(Date.now() - 10 * 86_400_000) } as any)).toBe(false);
    });

    it('EXTENDED: never silent', () => {
      expect(svc.isSilent({ tier: 'EXTENDED', customSilenceDays: null, lastInteractionAt: new Date(Date.now() - 60 * 86_400_000) } as any)).toBe(false);
    });

    it('respects customSilenceDays over tier default', () => {
      expect(svc.isSilent({ tier: 'IMPORTANT', customSilenceDays: 5, lastInteractionAt: new Date(Date.now() - 6 * 86_400_000) } as any)).toBe(true);
    });
  });
});
