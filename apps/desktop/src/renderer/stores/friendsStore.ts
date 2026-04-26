import { createBoundStore } from './createBoundStore';
import type { StateCreator } from 'zustand/vanilla';
import type {
  UserBrief,
  FriendRequestPayload,
  FriendAcceptedPayload,
} from '@linkingchat/ws-protocol';
import { API_BASE_URL } from '@renderer/config';

const API_BASE = API_BASE_URL + '/api/v1';

// ─── Response types ───

export interface FriendItem {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: 'ONLINE' | 'IDLE' | 'DND' | 'OFFLINE';
  converseId?: string;
}

export interface FriendRequestItem {
  id: string;
  user: UserBrief;
  message: string | null;
  createdAt: string;
}

export interface SearchUserResult {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

// ─── Store interface ───

interface FriendsState {
  friends: FriendItem[];
  receivedRequests: FriendRequestItem[];
  sentRequests: FriendRequestItem[];
  isLoading: boolean;

  // Fetch actions
  fetchFriends: () => Promise<void>;
  fetchRequests: () => Promise<void>;

  // Mutation actions
  sendRequest: (receiverId: string, message?: string) => Promise<void>;
  acceptRequest: (requestId: string) => Promise<void>;
  rejectRequest: (requestId: string) => Promise<void>;
  removeFriend: (userId: string) => Promise<void>;
  searchUsers: (query: string) => Promise<SearchUserResult[]>;

  // WS handlers
  addReceivedRequest: (payload: FriendRequestPayload) => void;
  handleFriendAccepted: (payload: FriendAcceptedPayload) => void;
  handleFriendRemoved: (userId: string) => void;
}

async function getAuthHeaders(): Promise<HeadersInit | null> {
  const token = window.electronAPI ? await window.electronAPI.getToken() : null;
  if (!token) return null;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

const _friendsStoreCreator: StateCreator<FriendsState> = (set, get) => ({
  friends: [],
  receivedRequests: [],
  sentRequests: [],
  isLoading: false,

  fetchFriends: async () => {
    const headers = await getAuthHeaders();
    if (!headers) return;
    set({ isLoading: true });
    try {
      const res = await fetch(`${API_BASE}/friends`, { headers });
      if (res.ok) {
        const data: FriendItem[] = await res.json();
        set({ friends: data });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  fetchRequests: async () => {
    const headers = await getAuthHeaders();
    if (!headers) return;
    try {
      const res = await fetch(`${API_BASE}/friends/requests`, { headers });
      if (res.ok) {
        const data: { sent: FriendRequestItem[]; received: FriendRequestItem[] } =
          await res.json();
        set({ receivedRequests: data.received, sentRequests: data.sent });
      }
    } catch {
      // silently fail
    }
  },

  sendRequest: async (receiverId, message) => {
    const headers = await getAuthHeaders();
    if (!headers) return;
    const res = await fetch(`${API_BASE}/friends/request`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ receiverId, message: message || undefined }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to send request');
    }
  },

  acceptRequest: async (requestId) => {
    const headers = await getAuthHeaders();
    if (!headers) return;
    const res = await fetch(`${API_BASE}/friends/accept/${requestId}`, {
      method: 'POST',
      headers,
    });
    if (res.ok) {
      // Remove from received requests
      set((state) => ({
        receivedRequests: state.receivedRequests.filter((r) => r.id !== requestId),
      }));
      // Refresh friends list to get the new friend with converseId
      get().fetchFriends();
    } else {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to accept request');
    }
  },

  rejectRequest: async (requestId) => {
    const headers = await getAuthHeaders();
    if (!headers) return;
    const res = await fetch(`${API_BASE}/friends/reject/${requestId}`, {
      method: 'POST',
      headers,
    });
    if (res.ok) {
      set((state) => ({
        receivedRequests: state.receivedRequests.filter((r) => r.id !== requestId),
      }));
    } else {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to reject request');
    }
  },

  removeFriend: async (userId) => {
    const headers = await getAuthHeaders();
    if (!headers) return;
    const res = await fetch(`${API_BASE}/friends/${userId}`, {
      method: 'DELETE',
      headers,
    });
    if (res.ok) {
      set((state) => ({
        friends: state.friends.filter((f) => f.id !== userId),
      }));
    } else {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to remove friend');
    }
  },

  searchUsers: async (query) => {
    const headers = await getAuthHeaders();
    if (!headers) return [];
    const res = await fetch(
      `${API_BASE}/users/search?q=${encodeURIComponent(query)}&limit=20`,
      { headers },
    );
    if (res.ok) {
      return (await res.json()) as SearchUserResult[];
    }
    return [];
  },

  // ─── WebSocket handlers ───

  addReceivedRequest: (payload) => {
    set((state) => {
      // Avoid duplicates
      if (state.receivedRequests.some((r) => r.id === payload.id)) return state;
      const item: FriendRequestItem = {
        id: payload.id,
        user: payload.sender,
        message: payload.message,
        createdAt: payload.createdAt,
      };
      return { receivedRequests: [item, ...state.receivedRequests] };
    });
  },

  handleFriendAccepted: (payload) => {
    set((state) => {
      // Remove from sent requests if present
      const sentRequests = state.sentRequests.filter(
        (r) => r.user.id !== payload.friendId,
      );
      // Add to friends list if not already there
      const alreadyFriend = state.friends.some((f) => f.id === payload.friendId);
      const friends = alreadyFriend
        ? state.friends
        : [
            ...state.friends,
            {
              id: payload.friend.id,
              username: payload.friend.username,
              displayName: payload.friend.displayName,
              avatarUrl: payload.friend.avatarUrl,
              status: 'OFFLINE' as const,
            },
          ];
      return { sentRequests, friends };
    });
    // Refresh to get converseId and accurate status
    get().fetchFriends();
  },

  handleFriendRemoved: (userId) => {
    set((state) => ({
      friends: state.friends.filter((f) => f.id !== userId),
    }));
  },
});
export const useFriendsStore = createBoundStore(_friendsStoreCreator);

export function resetFriendsStore(): void {
  useFriendsStore.setState({
    friends: [],
    receivedRequests: [],
    sentRequests: [],
    isLoading: false,
  });
}
