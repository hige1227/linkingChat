import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useChatStore } from '../stores/chatStore';
import type { MessageResponse, ConverseResponse } from '@linkingchat/ws-protocol';

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

export function useChatSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const joinedRoomsRef = useRef<Set<string>>(new Set());

  // ─── Connect socket (once) ───
  useEffect(() => {
    let cancelled = false;

    async function connect() {
      const token = await window.electronAPI.getToken();
      if (!token || cancelled) return;

      // Extract current user ID from JWT and store it
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

      socketRef.current = socket;

      socket.on('connect', () => {
        if (!cancelled) setIsConnected(true);
        // Re-join rooms we already know about
        joinedRoomsRef.current.clear();
        const converses = useChatStore.getState().converses;
        for (const c of converses) {
          socket.emit('converse:join', { converseId: c.id });
          joinedRoomsRef.current.add(c.id);
        }
      });

      socket.on('disconnect', () => {
        if (!cancelled) setIsConnected(false);
        joinedRoomsRef.current.clear();
      });

      // ──── Message events ────
      socket.on('message:new', (data: MessageResponse) => {
        const state = useChatStore.getState();
        state.addMessage(data.converseId, data);

        // Only increment unread if:
        // 1. The message is NOT from the current user
        // 2. The user is NOT currently viewing this conversation
        const isOwnMessage = data.authorId === state.currentUserId;
        const isViewing = state.activeConverseId === data.converseId;
        state.updateLastMessage(data.converseId, data, !isOwnMessage && !isViewing);
      });

      socket.on('message:updated', (data: MessageResponse) => {
        useChatStore.getState().updateMessage(data.converseId, data);
      });

      socket.on('message:deleted', (data: { messageId: string; converseId: string; id?: string }) => {
        const msgId = data.messageId || data.id;
        if (msgId) {
          useChatStore.getState().removeMessage(data.converseId, msgId);
        }
      });

      // ──── Converse events ────
      socket.on('converse:updated', (data: ConverseResponse) => {
        useChatStore.getState().updateConverse(data.id, data);
      });

      // ──── Group events ────
      socket.on('group:created', () => {
        // Refresh full converse list
      });

      socket.on('group:deleted', (data: { id: string }) => {
        useChatStore.getState().removeConverse(data.id);
      });

      socket.on('group:updated', (data: { id: string; name?: string }) => {
        useChatStore.getState().updateConverse(data.id, data as Partial<ConverseResponse>);
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

      // ──── Presence events ────
      socket.on('presence:changed', () => {
        // TODO: update user presence in converse member list
      });
    }

    connect();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, []);

  // ─── Join rooms when converses list changes ───
  const converses = useChatStore((s) => s.converses);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;

    for (const c of converses) {
      if (!joinedRoomsRef.current.has(c.id)) {
        socket.emit('converse:join', { converseId: c.id });
        joinedRoomsRef.current.add(c.id);
      }
    }
  }, [converses]);

  // ─── Auto mark-read when viewing a conversation ───
  const activeConverseId = useChatStore((s) => s.activeConverseId);
  const activeMessagesLen = useChatStore((s) =>
    s.activeConverseId ? (s.messages[s.activeConverseId] ?? []).length : 0,
  );

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected || !activeConverseId) return;

    const msgs = useChatStore.getState().messages[activeConverseId] ?? [];
    if (msgs.length === 0) return;

    // Messages are stored newest-first, so msgs[0] is the latest
    const newestMsg = msgs[0];
    socket.emit('message:read', {
      converseId: activeConverseId,
      lastSeenMessageId: newestMsg.id,
    });

    // Also reset local unread count immediately
    useChatStore.getState().markConverseRead(activeConverseId);
  }, [activeConverseId, activeMessagesLen]);

  return {
    isConnected,
    socket: socketRef.current,
    joinRoom: (converseId: string) => {
      socketRef.current?.emit('converse:join', { converseId });
      joinedRoomsRef.current.add(converseId);
    },
    leaveRoom: (converseId: string) => {
      socketRef.current?.emit('converse:leave', { converseId });
      joinedRoomsRef.current.delete(converseId);
    },
    emitTyping: (converseId: string, userId: string, username: string, isTyping = true) => {
      socketRef.current?.emit('message:typing', {
        converseId,
        userId,
        username,
        isTyping,
      });
    },
    markRead: (converseId: string, lastSeenMessageId: string) => {
      socketRef.current?.emit('message:read', {
        converseId,
        lastSeenMessageId,
      });
    },
  };
}
