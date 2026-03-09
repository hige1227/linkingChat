import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useChatStore } from '../stores/chatStore';
import { useAiStore } from '../stores/aiStore';
import { useFriendsStore } from '../stores/friendsStore';
import type {
  MessageResponse,
  ConverseResponse,
  FriendRequestPayload,
  FriendAcceptedPayload,
  FriendRemovedPayload,
} from '@linkingchat/ws-protocol';

const CHAT_URL = 'http://localhost:3008/chat';

/** Decode JWT payload to get user ID (sub claim) */
function getUserIdFromToken(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload));
    return decoded.sub ?? null;
  } catch {
    return null;
  }
}

// ─── Module-level singleton ───
// Only ONE socket connection is created, shared across all components that call useChatSocket().
let sharedSocket: Socket | null = null;
let sharedJoinedRooms = new Set<string>();
let connectionInitiated = false;
const connectedListeners = new Set<(v: boolean) => void>();

function notifyConnected(connected: boolean) {
  for (const listener of connectedListeners) {
    listener(connected);
  }
}

function initSocket() {
  if (connectionInitiated) return;
  connectionInitiated = true;

  (async () => {
    const token = window.electronAPI ? await window.electronAPI.getToken() : null;
    if (!token) return;

    const userId = getUserIdFromToken(token);
    if (userId) {
      useChatStore.getState().setCurrentUserId(userId);
    }

    const socket = io(CHAT_URL, {
      auth: { token, deviceType: 'desktop' },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    });

    sharedSocket = socket;

    let connectErrorCount = 0;

    socket.on('connect', () => {
      connectErrorCount = 0;
      notifyConnected(true);
      sharedJoinedRooms.clear();
      const converses = useChatStore.getState().converses;
      for (const c of converses) {
        socket.emit('converse:join', { converseId: c.id });
        sharedJoinedRooms.add(c.id);
      }
      // Fetch pending friend requests so badge shows immediately
      useFriendsStore.getState().fetchRequests();
    });

    socket.on('disconnect', () => {
      notifyConnected(false);
      sharedJoinedRooms.clear();
    });

    socket.on('connect_error', async () => {
      connectErrorCount++;
      if (connectErrorCount <= 3 && window.electronAPI) {
        try {
          const newToken = await window.electronAPI.refreshToken();
          if (newToken && socket) {
            (socket as any).auth = { token: newToken, deviceType: 'desktop' };
            console.log('[ChatSocket] Token refreshed for reconnect');
          }
        } catch (e) {
          console.error('[ChatSocket] Token refresh failed:', e);
        }
      }
    });

    // ──── Message events ────
    socket.on('message:new', (data: MessageResponse) => {
      const state = useChatStore.getState();
      state.addMessage(data.converseId, data);
      const isOwnMessage = data.authorId === state.currentUserId;
      const isViewing = state.activeConverseId === data.converseId;
      state.updateLastMessage(data.converseId, data, !isOwnMessage && !isViewing);
    });

    socket.on('message:updated', (data: MessageResponse) => {
      useChatStore.getState().updateMessage(data.converseId, data);
    });

    socket.on('message:deleted', (data: { messageId: string; converseId: string; id?: string; recalledBy?: string; deletedAt?: string }) => {
      const msgId = data.messageId || data.id;
      if (msgId) {
        if (data.recalledBy) {
          useChatStore.getState().markMessageRecalled(
            data.converseId,
            msgId,
            data.deletedAt || new Date().toISOString(),
          );
        } else {
          useChatStore.getState().removeMessage(data.converseId, msgId);
        }
      }
    });

    // ──── Read receipt events ────
    socket.on('message:read', (data: { converseId: string; userId: string; lastSeenMessageId: string }) => {
      useChatStore.getState().setReadReceipt(data.converseId, data.lastSeenMessageId);
    });

    // ──── Converse events ────
    socket.on('converse:updated', (data: ConverseResponse) => {
      useChatStore.getState().updateConverse(data.id, data);
    });

    socket.on('converse:new', async (data: { id: string }) => {
      // Re-fetch full converses list to get member names/avatars
      const t = window.electronAPI ? await window.electronAPI.getToken() : null;
      if (!t) return;
      try {
        const res = await fetch('http://localhost:3008/api/v1/converses', {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (res.ok) {
          const converses: ConverseResponse[] = await res.json();
          useChatStore.getState().setConverses(converses);
          // Auto-join the new converse room
          if (data.id && !sharedJoinedRooms.has(data.id)) {
            socket.emit('converse:join', { converseId: data.id });
            sharedJoinedRooms.add(data.id);
          }
        }
      } catch {
        // silent
      }
    });

    socket.on('group:created', async (data: { id?: string }) => {
      // Re-fetch converses to get the new group
      const t = window.electronAPI ? await window.electronAPI.getToken() : null;
      if (!t) return;
      try {
        const res = await fetch('http://localhost:3008/api/v1/converses', {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (res.ok) {
          const converses: ConverseResponse[] = await res.json();
          useChatStore.getState().setConverses(converses);
          // Auto-join the new group room
          const groupId = data?.id;
          if (groupId && !sharedJoinedRooms.has(groupId)) {
            socket.emit('converse:join', { converseId: groupId });
            sharedJoinedRooms.add(groupId);
          }
        }
      } catch {
        // silent
      }
    });

    socket.on('group:member:added', async () => {
      // Re-fetch converses to update member lists/counts
      const t = window.electronAPI ? await window.electronAPI.getToken() : null;
      if (!t) return;
      try {
        const res = await fetch('http://localhost:3008/api/v1/converses', {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (res.ok) {
          const converses: ConverseResponse[] = await res.json();
          useChatStore.getState().setConverses(converses);
        }
      } catch {
        // silent
      }
    });

    socket.on('group:member:removed', async () => {
      const t = window.electronAPI ? await window.electronAPI.getToken() : null;
      if (!t) return;
      try {
        const res = await fetch('http://localhost:3008/api/v1/converses', {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (res.ok) {
          const converses: ConverseResponse[] = await res.json();
          useChatStore.getState().setConverses(converses);
        }
      } catch {
        // silent
      }
    });

    socket.on('group:deleted', (data: { id: string }) => {
      useChatStore.getState().removeConverse(data.id);
    });

    socket.on('group:updated', (data: { id: string; name?: string }) => {
      useChatStore.getState().updateConverse(data.id, data as Partial<ConverseResponse>);
    });

    socket.on('group:member:role:updated', (data: { converseId: string; userId: string; role: string }) => {
      // Refetch converse to get updated member roles
      const state = useChatStore.getState();
      const converse = state.converses.find((c) => c.id === data.converseId);
      if (converse) {
        const members = (converse.members ?? []).map((m) =>
          m.userId === data.userId ? { ...m, role: data.role } : m,
        );
        state.updateConverse(data.converseId, { members } as Partial<ConverseResponse>);
      }
    });

    // ──── Typing events ────
    socket.on('message:typing', (data: { converseId: string; userId: string; isTyping: boolean }) => {
      const state = useChatStore.getState();
      const current = state.typingUsers[data.converseId] ?? [];
      if (data.isTyping) {
        if (!current.includes(data.userId)) {
          state.setTyping(data.converseId, [...current, data.userId]);
        }
      } else {
        state.setTyping(
          data.converseId,
          current.filter((id) => id !== data.userId),
        );
      }
    });

    socket.on('presence:changed', () => {});

    // ──── AI events ────
    socket.on('ai:whisper:suggestions', (data: {
      suggestionId: string;
      converseId: string;
      primary: string;
      alternatives: string[];
    }) => {
      useAiStore.getState().setWhisper(data.converseId, {
        suggestionId: data.suggestionId,
        primary: data.primary,
        alternatives: data.alternatives ?? [],
        showAlternatives: false,
      });
    });

    socket.on('ai:draft:created', (data: {
      draftId: string;
      converseId: string;
      botId?: string;
      botName: string;
      draftType: 'message' | 'command';
      draftContent: Record<string, unknown>;
      expiresAt: string;
      createdAt: string;
    }) => {
      useAiStore.getState().addDraft(data.converseId, {
        ...data,
        status: 'pending',
      });
    });

    socket.on('ai:draft:expired', (data: { draftId: string }) => {
      useAiStore.getState().expireDraft(data.draftId);
    });

    socket.on('ai:predictive:action', (data: {
      suggestionId: string;
      converseId: string;
      trigger: string;
      actions: Array<{
        type: 'shell' | 'message' | 'file';
        action: string;
        description: string;
        dangerLevel: 'safe' | 'warning' | 'dangerous';
      }>;
    }) => {
      useAiStore.getState().addPrediction(data.converseId, {
        suggestionId: data.suggestionId,
        trigger: data.trigger,
        actions: data.actions,
        dismissed: false,
      });
    });

    // ──── Friend events ────
    socket.on('friend:request', (data: FriendRequestPayload) => {
      useFriendsStore.getState().addReceivedRequest(data);
    });

    socket.on('friend:accepted', (data: FriendAcceptedPayload) => {
      useFriendsStore.getState().handleFriendAccepted(data);
    });

    socket.on('friend:removed', (data: FriendRemovedPayload) => {
      useFriendsStore.getState().handleFriendRemoved(data.userId);
    });
  })();
}

// ─── Hook ───
export function useChatSocket() {
  const [isConnected, setIsConnected] = useState(sharedSocket?.connected ?? false);

  // Register this component's connected listener + init socket once
  useEffect(() => {
    connectedListeners.add(setIsConnected);
    initSocket();

    return () => {
      connectedListeners.delete(setIsConnected);
    };
  }, []);

  // ─── Join rooms when converses list changes ───
  const converses = useChatStore((s) => s.converses);

  useEffect(() => {
    if (!sharedSocket?.connected) return;

    for (const c of converses) {
      if (!sharedJoinedRooms.has(c.id)) {
        sharedSocket.emit('converse:join', { converseId: c.id });
        sharedJoinedRooms.add(c.id);
      }
    }
  }, [converses]);

  // ─── Auto mark-read when viewing a conversation ───
  const activeConverseId = useChatStore((s) => s.activeConverseId);
  const activeMessagesLen = useChatStore((s) =>
    s.activeConverseId ? (s.messages[s.activeConverseId] ?? []).length : 0,
  );

  useEffect(() => {
    if (!sharedSocket?.connected || !activeConverseId) return;

    const msgs = useChatStore.getState().messages[activeConverseId] ?? [];
    if (msgs.length === 0) return;

    const newestMsg = msgs[0];
    sharedSocket.emit('message:read', {
      converseId: activeConverseId,
      lastSeenMessageId: newestMsg.id,
    });

    useChatStore.getState().markConverseRead(activeConverseId);
  }, [activeConverseId, activeMessagesLen]);

  return {
    isConnected,
    socket: sharedSocket,
    joinRoom: (converseId: string) => {
      sharedSocket?.emit('converse:join', { converseId });
      sharedJoinedRooms.add(converseId);
    },
    leaveRoom: (converseId: string) => {
      sharedSocket?.emit('converse:leave', { converseId });
      sharedJoinedRooms.delete(converseId);
    },
    emitTyping: (converseId: string, userId: string, username: string, isTyping = true) => {
      sharedSocket?.emit('message:typing', { converseId, userId, username, isTyping });
    },
    markRead: (converseId: string, lastSeenMessageId: string) => {
      sharedSocket?.emit('message:read', { converseId, lastSeenMessageId });
    },

    // ── AI emit helpers ──
    emitWhisperAccept: (suggestionId: string, selectedIndex: number) => {
      sharedSocket?.emit('ai:whisper:accept', { suggestionId, selectedIndex });
    },
    emitDraftApprove: (draftId: string) => {
      sharedSocket?.emit('ai:draft:approve', { draftId });
    },
    emitDraftReject: (draftId: string, reason?: string) => {
      sharedSocket?.emit('ai:draft:reject', { draftId, reason });
    },
    emitDraftEdit: (draftId: string, editedContent: Record<string, unknown>) => {
      sharedSocket?.emit('ai:draft:edit', { draftId, editedContent });
    },
    emitPredictiveExecute: (suggestionId: string, actionIndex: number) => {
      sharedSocket?.emit('ai:predictive:execute', { suggestionId, actionIndex });
    },
    emitPredictiveDismiss: (suggestionId: string) => {
      sharedSocket?.emit('ai:predictive:dismiss', { suggestionId });
    },
  };
}
