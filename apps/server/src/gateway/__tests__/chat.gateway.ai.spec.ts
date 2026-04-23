jest.mock('@mariozechner/pi-ai', () => ({}), { virtual: true });
import { Test, TestingModule } from '@nestjs/testing';
import { ChatGateway } from '../chat.gateway';
import { BroadcastService } from '../broadcast.service';
import { PresenceService } from '../presence.service';
import { ConversesService } from '../../converses/converses.service';
import { FriendsService } from '../../friends/friends.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WhisperService } from '../../ai/services/whisper.service';
import { DraftService } from '../../ai/services/draft.service';
import { PredictiveService } from '../../ai/services/predictive.service';
import { MetricsService } from '../../metrics/metrics.service';
import type { TypedSocket } from '@linkingchat/ws-protocol';

// ── Test Data ────────────────────────────

const mockUserId = 'user-001';

const mockClient = {
  data: { userId: mockUserId },
  join: jest.fn(),
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
} as unknown as TypedSocket;

const mockDraftContent = {
  content: 'echo hello',
  action: 'shell',
};

// ── Mock Services ────────────────────────

const mockBroadcastService = {
  setNamespace: jest.fn(),
  toRoom: jest.fn(),
};

const mockPresenceService = {
  isOnline: jest.fn(),
  setOnline: jest.fn(),
  setOffline: jest.fn(),
  updateStatus: jest.fn(),
};

const mockConversesService = {
  verifyMembership: jest.fn(),
};

const mockFriendsService = {
  getFriendIds: jest.fn().mockResolvedValue([]),
};

const mockPrisma = {
  converseMember: { findUnique: jest.fn(), update: jest.fn() },
  message: { findFirst: jest.fn(), findUnique: jest.fn() },
};

const mockWhisperService = {
  acceptSuggestion: jest.fn().mockResolvedValue(undefined),
};

const mockDraftService = {
  approveDraft: jest.fn().mockResolvedValue(mockDraftContent),
  rejectDraft: jest.fn().mockResolvedValue(undefined),
  editAndApproveDraft: jest.fn().mockResolvedValue(mockDraftContent),
};

const mockPredictiveService = {
  executeAction: jest.fn().mockResolvedValue({
    type: 'shell',
    action: 'npm install',
    description: 'Install dependencies',
    dangerLevel: 'safe',
  }),
  dismissAction: jest.fn().mockResolvedValue(undefined),
};

const mockMetricsService = {
  httpRequestDuration: { observe: jest.fn(), labels: jest.fn().mockReturnThis() },
  httpRequestsTotal: { inc: jest.fn(), labels: jest.fn().mockReturnThis() },
  wsConnectionsActive: { inc: jest.fn(), dec: jest.fn(), labels: jest.fn().mockReturnThis() },
  wsMessagesTotal: { inc: jest.fn(), labels: jest.fn().mockReturnThis() },
  messagesSentTotal: { inc: jest.fn() },
  messagesRecalledTotal: { inc: jest.fn() },
  llmRequestsTotal: { inc: jest.fn(), labels: jest.fn().mockReturnThis() },
  llmLatencySeconds: { observe: jest.fn(), labels: jest.fn().mockReturnThis() },
  uploadsTotal: { inc: jest.fn(), labels: jest.fn().mockReturnThis() },
};

// ── Tests ────────────────────────────

describe('ChatGateway AI Handlers', () => {
  let gateway: ChatGateway;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        { provide: BroadcastService, useValue: mockBroadcastService },
        { provide: PresenceService, useValue: mockPresenceService },
        { provide: ConversesService, useValue: mockConversesService },
        { provide: FriendsService, useValue: mockFriendsService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WhisperService, useValue: mockWhisperService },
        { provide: DraftService, useValue: mockDraftService },
        { provide: PredictiveService, useValue: mockPredictiveService },
        { provide: MetricsService, useValue: mockMetricsService },
      ],
    }).compile();

    gateway = module.get<ChatGateway>(ChatGateway);
  });

  // ── Whisper ──

  describe('handleWhisperAccept', () => {
    it('should accept a suggestion and return success', async () => {
      const result = await gateway.handleWhisperAccept(mockClient, {
        suggestionId: 'sug-001',
        selectedIndex: 0,
      });

      expect(result).toEqual({ success: true });
      expect(mockWhisperService.acceptSuggestion).toHaveBeenCalledWith(
        mockUserId,
        'sug-001',
        0,
      );
    });

    it('should return error on failure', async () => {
      mockWhisperService.acceptSuggestion.mockRejectedValueOnce(
        new Error('Not found'),
      );

      const result = await gateway.handleWhisperAccept(mockClient, {
        suggestionId: 'sug-999',
        selectedIndex: 0,
      });

      expect(result).toEqual({
        success: false,
        error: { code: 'WHISPER_ACCEPT_FAILED', message: 'Not found' },
      });
    });
  });

  // ── Draft Approve ──

  describe('handleDraftApprove', () => {
    it('should approve a draft and return content', async () => {
      const result = await gateway.handleDraftApprove(mockClient, {
        draftId: 'draft-001',
      });

      expect(result).toEqual({
        success: true,
        data: { content: mockDraftContent },
      });
      expect(mockDraftService.approveDraft).toHaveBeenCalledWith(
        mockUserId,
        'draft-001',
      );
    });

    it('should return error on failure', async () => {
      mockDraftService.approveDraft.mockRejectedValueOnce(
        new Error('Draft expired'),
      );

      const result = await gateway.handleDraftApprove(mockClient, {
        draftId: 'draft-expired',
      });

      expect(result).toEqual({
        success: false,
        error: { code: 'DRAFT_APPROVE_FAILED', message: 'Draft expired' },
      });
    });
  });

  // ── Draft Reject ──

  describe('handleDraftReject', () => {
    it('should reject a draft with optional reason', async () => {
      const result = await gateway.handleDraftReject(mockClient, {
        draftId: 'draft-001',
        reason: 'Not what I wanted',
      });

      expect(result).toEqual({ success: true });
      expect(mockDraftService.rejectDraft).toHaveBeenCalledWith(
        mockUserId,
        'draft-001',
        'Not what I wanted',
      );
    });

    it('should reject a draft without reason', async () => {
      const result = await gateway.handleDraftReject(mockClient, {
        draftId: 'draft-001',
      });

      expect(result).toEqual({ success: true });
      expect(mockDraftService.rejectDraft).toHaveBeenCalledWith(
        mockUserId,
        'draft-001',
        undefined,
      );
    });
  });

  // ── Draft Edit ──

  describe('handleDraftEdit', () => {
    it('should edit and approve a draft', async () => {
      const editedContent = { content: 'echo modified' };
      const result = await gateway.handleDraftEdit(mockClient, {
        draftId: 'draft-001',
        editedContent,
      });

      expect(result).toEqual({
        success: true,
        data: { content: mockDraftContent },
      });
      expect(mockDraftService.editAndApproveDraft).toHaveBeenCalledWith(
        mockUserId,
        'draft-001',
        editedContent,
      );
    });
  });

  // ── Predictive Execute ──

  describe('handlePredictiveExecute', () => {
    it('should execute an action and return it', async () => {
      const result = await gateway.handlePredictiveExecute(mockClient, {
        suggestionId: 'pred-001',
        actionIndex: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data?.action).toBeDefined();
      expect(mockPredictiveService.executeAction).toHaveBeenCalledWith(
        mockUserId,
        'pred-001',
        0,
      );
    });

    it('should return error when action not found', async () => {
      mockPredictiveService.executeAction.mockResolvedValueOnce(null);

      const result = await gateway.handlePredictiveExecute(mockClient, {
        suggestionId: 'pred-999',
        actionIndex: 99,
      });

      expect(result).toEqual({
        success: false,
        error: { code: 'ACTION_NOT_FOUND', message: 'Suggestion or action not found' },
      });
    });
  });

  // ── Predictive Dismiss ──

  describe('handlePredictiveDismiss', () => {
    it('should dismiss a suggestion', async () => {
      const result = await gateway.handlePredictiveDismiss(mockClient, {
        suggestionId: 'pred-001',
      });

      expect(result).toEqual({ success: true });
      expect(mockPredictiveService.dismissAction).toHaveBeenCalledWith(
        mockUserId,
        'pred-001',
      );
    });
  });
});
