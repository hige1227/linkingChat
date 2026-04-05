import { create } from 'zustand';
import type { ConverseResponse, MessageResponse } from '@linkingchat/ws-protocol';

export interface StreamingMessage {
  requestId: string;
  converseId: string;
  text: string;          // Accumulated full text
  toolCalls: string[];   // Currently active tool names
  status: 'streaming' | 'done' | 'error';
  errorText?: string;
  createdAt: string;     // ISO timestamp when streaming began
}

export interface ChatState {
  currentUserId: string | null;
  converses: ConverseResponse[];
  activeConverseId: string | null;
  messages: Record<string, MessageResponse[]>; // converseId → messages
  typingUsers: Record<string, string[]>; // converseId → userIds
  hasMore: Record<string, boolean>;
  cursors: Record<string, string | null>;
  readReceipts: Record<string, string>; // converseId → lastSeenMessageId by peer
  streamingMessages: Record<string, StreamingMessage>; // keyed by requestId

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
  markMessageRecalled: (converseId: string, messageId: string, deletedAt: string) => void;
  setTyping: (converseId: string, userIds: string[]) => void;
  updateConverse: (id: string, update: Partial<ConverseResponse>) => void;
  removeConverse: (id: string) => void;
  markConverseRead: (converseId: string) => void;
  setReadReceipt: (converseId: string, lastSeenMessageId: string) => void;
  updateLastMessage: (converseId: string, msg: MessageResponse, incrementUnread?: boolean) => void;
  addStreamingMessage: (converseId: string, requestId: string) => void;
  appendStreamChunk: (requestId: string, chunk: { type: string; text: string }) => void;
  removeStreamingMessage: (requestId: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  currentUserId: null,
  converses: [],
  activeConverseId: null,
  messages: {},
  typingUsers: {},
  hasMore: {},
  cursors: {},
  readReceipts: {},
  streamingMessages: {},

  setCurrentUserId: (id) => set({ currentUserId: id }),

  setConverses: (list) =>
    set((state) => {
      // Build lookup of locally-read converses (unreadCount === 0 set by markConverseRead)
      // to prevent server re-fetch from overwriting the local read state.
      const localReadSet = new Set(
        state.converses
          .filter((c) => c.unreadCount === 0)
          .map((c) => c.id),
      );

      // If store was empty (first load), just set directly
      if (state.converses.length === 0) {
        return { converses: list };
      }

      // Merge: preserve local unreadCount=0 for converses the user already read
      return {
        converses: list.map((c) =>
          localReadSet.has(c.id) ? { ...c, unreadCount: 0 } : c,
        ),
      };
    }),

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

  markMessageRecalled: (converseId, messageId, deletedAt) =>
    set((state) => {
      const existing = state.messages[converseId] ?? [];
      return {
        messages: {
          ...state.messages,
          [converseId]: existing.map((m) =>
            m.id === messageId ? { ...m, deletedAt } : m,
          ),
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

  setReadReceipt: (converseId, lastSeenMessageId) =>
    set((state) => ({
      readReceipts: { ...state.readReceipts, [converseId]: lastSeenMessageId },
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

  addStreamingMessage: (converseId, requestId) =>
    set((state) => ({
      streamingMessages: {
        ...state.streamingMessages,
        [requestId]: {
          requestId,
          converseId,
          text: '',
          toolCalls: [],
          status: 'streaming',
          createdAt: new Date().toISOString(),
        },
      },
    })),

  appendStreamChunk: (requestId, chunk) =>
    set((state) => {
      const sm = state.streamingMessages[requestId];
      if (!sm) return state;

      let updated: StreamingMessage;

      if (chunk.type === 'text') {
        updated = { ...sm, text: sm.text + chunk.text };
      } else if (chunk.type === 'tool_use') {
        updated = { ...sm, toolCalls: [...sm.toolCalls, chunk.text] };
      } else if (chunk.type === 'tool_result') {
        updated = {
          ...sm,
          toolCalls: sm.toolCalls.filter((t) => t !== chunk.text),
        };
      } else if (chunk.type === 'done') {
        updated = { ...sm, status: 'done' };
      } else if (chunk.type === 'error') {
        updated = { ...sm, status: 'error', errorText: chunk.text };
      } else {
        return state;
      }

      return {
        streamingMessages: { ...state.streamingMessages, [requestId]: updated },
      };
    }),

  removeStreamingMessage: (requestId) =>
    set((state) => {
      const { [requestId]: _removed, ...rest } = state.streamingMessages;
      return { streamingMessages: rest };
    }),
}));
