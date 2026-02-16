import { create } from 'zustand';
import type { ConverseResponse, MessageResponse } from '@linkingchat/ws-protocol';

interface ChatState {
  currentUserId: string | null;
  converses: ConverseResponse[];
  activeConverseId: string | null;
  messages: Record<string, MessageResponse[]>; // converseId → messages
  typingUsers: Record<string, string[]>; // converseId → userIds
  hasMore: Record<string, boolean>;
  cursors: Record<string, string | null>;

  // Actions
  setCurrentUserId: (id: string | null) => void;
  setConverses: (list: ConverseResponse[]) => void;
  setActiveConverse: (id: string | null) => void;
  addMessage: (converseId: string, msg: MessageResponse) => void;
  prependMessages: (
    converseId: string,
    msgs: MessageResponse[],
    hasMore: boolean,
    nextCursor: string | null,
  ) => void;
  updateMessage: (converseId: string, msg: Partial<MessageResponse> & { id: string }) => void;
  removeMessage: (converseId: string, messageId: string) => void;
  setTyping: (converseId: string, userIds: string[]) => void;
  updateConverse: (id: string, update: Partial<ConverseResponse>) => void;
  removeConverse: (id: string) => void;
  markConverseRead: (converseId: string) => void;
  updateLastMessage: (converseId: string, msg: MessageResponse, incrementUnread?: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  currentUserId: null,
  converses: [],
  activeConverseId: null,
  messages: {},
  typingUsers: {},
  hasMore: {},
  cursors: {},

  setCurrentUserId: (id) => set({ currentUserId: id }),

  setConverses: (list) => set({ converses: list }),

  setActiveConverse: (id) => set({ activeConverseId: id }),

  addMessage: (converseId, msg) =>
    set((state) => {
      const existing = state.messages[converseId] ?? [];
      // Avoid duplicates
      if (existing.some((m) => m.id === msg.id)) {
        return {
          messages: {
            ...state.messages,
            [converseId]: existing.map((m) =>
              m.id === msg.id ? { ...m, ...msg } : m,
            ),
          },
        };
      }
      return {
        messages: {
          ...state.messages,
          [converseId]: [msg, ...existing],
        },
      };
    }),

  prependMessages: (converseId, msgs, hasMore, nextCursor) =>
    set((state) => {
      const existing = state.messages[converseId] ?? [];
      return {
        messages: {
          ...state.messages,
          [converseId]: [...existing, ...msgs],
        },
        hasMore: { ...state.hasMore, [converseId]: hasMore },
        cursors: { ...state.cursors, [converseId]: nextCursor },
      };
    }),

  updateMessage: (converseId, msg) =>
    set((state) => {
      const existing = state.messages[converseId] ?? [];
      return {
        messages: {
          ...state.messages,
          [converseId]: existing.map((m) =>
            m.id === msg.id ? { ...m, ...msg } : m,
          ),
        },
      };
    }),

  removeMessage: (converseId, messageId) =>
    set((state) => {
      const existing = state.messages[converseId] ?? [];
      return {
        messages: {
          ...state.messages,
          [converseId]: existing.filter((m) => m.id !== messageId),
        },
      };
    }),

  setTyping: (converseId, userIds) =>
    set((state) => ({
      typingUsers: { ...state.typingUsers, [converseId]: userIds },
    })),

  updateConverse: (id, update) =>
    set((state) => ({
      converses: state.converses.map((c) =>
        c.id === id ? { ...c, ...update } : c,
      ),
    })),

  removeConverse: (id) =>
    set((state) => ({
      converses: state.converses.filter((c) => c.id !== id),
    })),

  markConverseRead: (converseId) =>
    set((state) => ({
      converses: state.converses.map((c) =>
        c.id === converseId ? { ...c, unreadCount: 0 } : c,
      ),
    })),

  updateLastMessage: (converseId, msg, incrementUnread = true) =>
    set((state) => ({
      converses: state.converses.map((c) =>
        c.id === converseId
          ? {
              ...c,
              lastMessage: msg,
              updatedAt: msg.createdAt,
              unreadCount: incrementUnread
                ? (c.unreadCount ?? 0) + 1
                : (c.unreadCount ?? 0),
            }
          : c,
      ),
    })),
}));
