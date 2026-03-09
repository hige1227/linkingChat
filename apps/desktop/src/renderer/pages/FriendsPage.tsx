import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFriendsStore } from '../stores/friendsStore';
import { AddFriendDialog } from '../components/friends/AddFriendDialog';

export function FriendsPage() {
  const navigate = useNavigate();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [requestsCollapsed, setRequestsCollapsed] = useState(false);

  const friends = useFriendsStore((s) => s.friends);
  const receivedRequests = useFriendsStore((s) => s.receivedRequests);
  const isLoading = useFriendsStore((s) => s.isLoading);
  const { fetchFriends, fetchRequests, acceptRequest, rejectRequest } = useFriendsStore();

  useEffect(() => {
    fetchFriends();
    fetchRequests();
  }, [fetchFriends, fetchRequests]);

  const handleAccept = async (requestId: string) => {
    try {
      await acceptRequest(requestId);
    } catch {
      // Error already handled in store
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      await rejectRequest(requestId);
    } catch {
      // Error already handled in store
    }
  };

  const handleFriendClick = (converseId?: string) => {
    if (converseId) {
      navigate(`/chat/${converseId}`);
    }
  };

  if (isLoading && friends.length === 0) {
    return (
      <div className="friends-page">
        <div className="friends-header">
          <h2>Contacts</h2>
        </div>
        <div className="friends-loading">Loading...</div>
      </div>
    );
  }

  const isEmpty = friends.length === 0 && receivedRequests.length === 0;

  return (
    <div className="friends-page">
      <div className="friends-header">
        <h2>Contacts</h2>
        <button className="friends-add-btn" onClick={() => setShowAddDialog(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Friend
        </button>
      </div>

      <div className="friends-content">
        {isEmpty ? (
          <div className="friends-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
            <p>Add friends to get started</p>
            <button className="friends-add-btn" onClick={() => setShowAddDialog(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Friend
            </button>
          </div>
        ) : (
          <>
            {/* ── Pending Requests Section ── */}
            {receivedRequests.length > 0 && (
              <div className="friends-section">
                <div
                  className="friends-section-header"
                  onClick={() => setRequestsCollapsed((v) => !v)}
                >
                  <span className={`friends-section-chevron ${requestsCollapsed ? 'collapsed' : ''}`}>
                    ▼
                  </span>
                  Friend Requests
                  <span className="friends-section-count">{receivedRequests.length}</span>
                </div>

                {!requestsCollapsed &&
                  receivedRequests.map((req) => (
                    <div key={req.id} className="friend-request-card">
                      <div className="friend-avatar">
                        {req.user.avatarUrl ? (
                          <img src={req.user.avatarUrl} alt="" />
                        ) : (
                          req.user.displayName.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="friend-request-info">
                        <div className="friend-request-name">{req.user.displayName}</div>
                        {req.message && (
                          <div className="friend-request-message">{req.message}</div>
                        )}
                      </div>
                      <div className="friend-request-actions">
                        <button
                          className="friend-request-accept"
                          title="Accept"
                          onClick={() => handleAccept(req.id)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </button>
                        <button
                          className="friend-request-reject"
                          title="Reject"
                          onClick={() => handleReject(req.id)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* ── Friends List Section ── */}
            <div className="friends-section">
              <div className="friends-section-header" style={{ cursor: 'default' }}>
                Friends
                <span style={{ color: '#607b96', fontWeight: 400 }}>({friends.length})</span>
              </div>

              {friends.map((friend) => (
                <div
                  key={friend.id}
                  className="friend-item"
                  onClick={() => handleFriendClick(friend.converseId)}
                >
                  <div className="friend-avatar-wrap">
                    <div className="friend-avatar">
                      {friend.avatarUrl ? (
                        <img src={friend.avatarUrl} alt="" />
                      ) : (
                        friend.displayName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div
                      className={`friend-status-dot ${friend.status?.toLowerCase() ?? 'offline'}`}
                    />
                  </div>
                  <div className="friend-details">
                    <div className="friend-display-name">{friend.displayName}</div>
                    <div className="friend-username">@{friend.username}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <AddFriendDialog open={showAddDialog} onClose={() => setShowAddDialog(false)} />
    </div>
  );
}
