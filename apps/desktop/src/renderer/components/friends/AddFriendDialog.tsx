import { useState, useEffect, useRef, useCallback } from 'react';
import { useFriendsStore, type SearchUserResult } from '../../stores/friendsStore';

interface AddFriendDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AddFriendDialog({ open, onClose }: AddFriendDialogProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { searchUsers, sendRequest } = useFriendsStore();

  // Reset state when dialog opens
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults([]);
    setSentIds(new Set());
    setSendingId(null);
    setError('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const doSearch = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setResults([]);
        return;
      }
      setSearching(true);
      setError('');
      try {
        const data = await searchUsers(q);
        setResults(data);
      } catch {
        setError('Search failed');
      } finally {
        setSearching(false);
      }
    },
    [searchUsers],
  );

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value.trim()), 400);
  };

  const handleSend = async (userId: string) => {
    setSendingId(userId);
    setError('');
    try {
      await sendRequest(userId);
      setSentIds((prev) => new Set(prev).add(userId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send request';
      setError(msg);
    } finally {
      setSendingId(null);
    }
  };

  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="dialog-header">
          <h3>Add Friend</h3>
          <button className="dialog-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="dialog-body">
          <div className="add-friend-search-wrap">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search username or email..."
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
            />
          </div>

          {error && <div className="add-friend-error">{error}</div>}

          <div className="add-friend-results">
            {searching && <div className="add-friend-hint">Searching...</div>}

            {!searching && query.length >= 2 && results.length === 0 && (
              <div className="add-friend-empty">No users found</div>
            )}

            {!searching && query.length < 2 && results.length === 0 && (
              <div className="add-friend-hint">Type at least 2 characters to search</div>
            )}

            {results.map((user) => (
              <div key={user.id} className="add-friend-result-item">
                <div className="friend-avatar">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" />
                  ) : (
                    user.displayName.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="add-friend-result-info">
                  <div className="add-friend-result-display">{user.displayName}</div>
                  <div className="add-friend-result-username">@{user.username}</div>
                </div>
                {sentIds.has(user.id) ? (
                  <span className="add-friend-sent-chip">Sent</span>
                ) : (
                  <button
                    className="add-friend-send-btn"
                    disabled={sendingId === user.id}
                    onClick={() => handleSend(user.id)}
                  >
                    {sendingId === user.id ? '...' : 'Add'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
