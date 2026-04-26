import { createBoundStore } from './createBoundStore';
import type { StateCreator } from 'zustand/vanilla';

// ── Types ──

export interface WhisperSuggestion {
  suggestionId: string;
  primary: string;
  alternatives: string[];
  showAlternatives: boolean;
}

export type DraftStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface DraftItem {
  draftId: string;
  converseId: string;
  botId?: string;
  botName: string;
  draftType: 'message' | 'command';
  draftContent: Record<string, unknown>;
  expiresAt: string;
  createdAt: string;
  status: DraftStatus;
}

export interface PredictiveAction {
  type: 'shell' | 'message' | 'file';
  action: string;
  description: string;
  dangerLevel: 'safe' | 'warning' | 'dangerous';
}

export interface PredictiveSuggestion {
  suggestionId: string;
  trigger: string;
  actions: PredictiveAction[];
  dismissed: boolean;
}

// ── State ──

interface AiState {
  // Whisper: converseId → current suggestion (null = no suggestion)
  whisper: Record<string, WhisperSuggestion | null>;
  setWhisper: (converseId: string, suggestion: WhisperSuggestion | null) => void;
  toggleWhisperAlternatives: (converseId: string) => void;
  dismissWhisper: (converseId: string) => void;

  // Draft: converseId → draft list
  drafts: Record<string, DraftItem[]>;
  addDraft: (converseId: string, draft: DraftItem) => void;
  updateDraftStatus: (draftId: string, status: DraftStatus, updatedContent?: Record<string, unknown>) => void;
  expireDraft: (draftId: string) => void;
  removeDraft: (draftId: string) => void;

  // Predictive: converseId → suggestion list
  predictions: Record<string, PredictiveSuggestion[]>;
  addPrediction: (converseId: string, suggestion: PredictiveSuggestion) => void;
  dismissPrediction: (converseId: string, suggestionId: string) => void;
}

const _aiStoreCreator: StateCreator<AiState> = (set) => ({
  // ── Whisper ──
  whisper: {},

  setWhisper: (converseId, suggestion) =>
    set((state) => ({
      whisper: { ...state.whisper, [converseId]: suggestion },
    })),

  toggleWhisperAlternatives: (converseId) =>
    set((state) => {
      const current = state.whisper[converseId];
      if (!current) return state;
      return {
        whisper: {
          ...state.whisper,
          [converseId]: { ...current, showAlternatives: !current.showAlternatives },
        },
      };
    }),

  dismissWhisper: (converseId) =>
    set((state) => ({
      whisper: { ...state.whisper, [converseId]: null },
    })),

  // ── Draft ──
  drafts: {},

  addDraft: (converseId, draft) =>
    set((state) => ({
      drafts: {
        ...state.drafts,
        [converseId]: [...(state.drafts[converseId] ?? []), draft],
      },
    })),

  updateDraftStatus: (draftId, status, updatedContent?) => {
    set((state) => {
      const newDrafts: Record<string, DraftItem[]> = {};
      for (const [cid, items] of Object.entries(state.drafts)) {
        newDrafts[cid] = items.map((d) =>
          d.draftId === draftId
            ? { ...d, status, ...(updatedContent ? { draftContent: updatedContent } : {}) }
            : d,
        );
      }
      return { drafts: newDrafts };
    });
    // Auto-remove after 30s
    setTimeout(() => useAiStore.getState().removeDraft(draftId), 30_000);
  },

  expireDraft: (draftId) => {
    set((state) => {
      const newDrafts: Record<string, DraftItem[]> = {};
      for (const [cid, items] of Object.entries(state.drafts)) {
        newDrafts[cid] = items.map((d) =>
          d.draftId === draftId && d.status === 'pending'
            ? { ...d, status: 'expired' as DraftStatus }
            : d,
        );
      }
      return { drafts: newDrafts };
    });
    setTimeout(() => useAiStore.getState().removeDraft(draftId), 30_000);
  },

  removeDraft: (draftId) =>
    set((state) => {
      const newDrafts: Record<string, DraftItem[]> = {};
      for (const [cid, items] of Object.entries(state.drafts)) {
        newDrafts[cid] = items.filter((d) => d.draftId !== draftId);
      }
      return { drafts: newDrafts };
    }),

  // ── Predictive ──
  predictions: {},

  addPrediction: (converseId, suggestion) =>
    set((state) => ({
      predictions: {
        ...state.predictions,
        [converseId]: [suggestion, ...(state.predictions[converseId] ?? [])],
      },
    })),

  dismissPrediction: (converseId, suggestionId) =>
    set((state) => ({
      predictions: {
        ...state.predictions,
        [converseId]: (state.predictions[converseId] ?? []).map((s) =>
          s.suggestionId === suggestionId ? { ...s, dismissed: true } : s,
        ),
      },
    })),
});
export const useAiStore = createBoundStore(_aiStoreCreator);

export function resetAiStore(): void {
  useAiStore.setState({
    whisper: {},
    drafts: {},
    predictions: {},
  });
}
