import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '../../stores/chatStore';
import { API_BASE_URL } from '@renderer/config';
import type { ConverseResponse } from '@linkingchat/ws-protocol';

interface FriendItem {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}

interface GroupPanelProps {
  converseId: string;
  onClose: () => void;
}

export function GroupPanel({ converseId, onClose }: GroupPanelProps) {
  const navigate = useNavigate();
  const converse = useChatStore((s) =>
    s.converses.find((c) => c.id === converseId),
  );
  const currentUserId = useChatStore((s) => s.currentUserId);

  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [editDesc, setEditDesc] = useState('');
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [muteTarget, setMuteTarget] = useState<{ userId: string; name: string } | null>(null);
  const [banTarget, setBanTarget] = useState<{ userId: string; name: string } | null>(null);
  const [mutePreset, setMutePreset] = useState<number | null>(null);
  const [muteCustom, setMuteCustom] = useState('');
  const [banReason, setBanReason] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
  const [addMemberLoading, setAddMemberLoading] = useState(false);

  if (!converse) return null;

  const ext = converse as any;
  const members = converse.members ?? [];
  const myMember = members.find((m) => m.userId === currentUserId);
  const myRole: string | null = myMember?.role ?? null;
  // Primary role check from members array
  let isOwner = myRole === 'OWNER';
  let isAdmin = myRole === 'ADMIN';
  // Fallback: if creatorId matches current user, they are the owner
  // (covers edge cases where members array role is not yet populated)
  if (!isOwner && !isAdmin && converse.creatorId && converse.creatorId === currentUserId) {
    isOwner = true;
  }
  const canManage = isOwner || isAdmin;

  async function getToken(): Promise<string | null> {
    return window.electronAPI.getToken();
  }

  async function refreshConverses() {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`${API_BASE_URL}/api/v1/converses`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      useChatStore.getState().setConverses(await res.json());
    }
  }

  async function handleUpdateGroup(data: { name?: string; description?: string }) {
    setActionLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(
        `${API_BASE_URL}/api/v1/converses/groups/${converseId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(data),
        },
      );
      if (res.ok) {
        await refreshConverses();
        setEditingName(false);
        setEditingDesc(false);
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRemoveMember(memberId: string) {
    const token = await getToken();
    if (!token) return;
    await fetch(
      `${API_BASE_URL}/api/v1/converses/groups/${converseId}/members/${memberId}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    );
    await refreshConverses();
  }

  async function handleUpdateRole(memberId: string, role: 'ADMIN' | 'MEMBER') {
    const token = await getToken();
    if (!token) return;
    await fetch(
      `${API_BASE_URL}/api/v1/converses/groups/${converseId}/members/${memberId}/role`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role }),
      },
    );
    await refreshConverses();
  }

  async function handleLeaveGroup() {
    const token = await getToken();
    if (!token) return;
    await fetch(
      `${API_BASE_URL}/api/v1/converses/groups/${converseId}/leave`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
    );
    await refreshConverses();
    navigate('/chat');
  }

  async function handleDeleteGroup() {
    setActionLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      await fetch(
        `${API_BASE_URL}/api/v1/converses/groups/${converseId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      );
      await refreshConverses();
      navigate('/chat');
    } finally {
      setActionLoading(false);
    }
  }

  const MUTE_PRESETS = [
    { label: '1 min', minutes: 1 },
    { label: '10 min', minutes: 10 },
    { label: '1 hour', minutes: 60 },
    { label: '1 day', minutes: 1440 },
    { label: '1 week', minutes: 10080 },
    { label: '1 month', minutes: 43200 },
  ];

  function getMuteMinutes(): number {
    if (muteCustom) return parseInt(muteCustom, 10) || 0;
    if (mutePreset !== null) return MUTE_PRESETS[mutePreset].minutes;
    return 0;
  }

  async function handleMute() {
    if (!muteTarget) return;
    const minutes = getMuteMinutes();
    if (minutes <= 0) return;
    setActionLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      await fetch(
        `${API_BASE_URL}/api/v1/converses/groups/${converseId}/members/${muteTarget.userId}/mute`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ durationMinutes: minutes }),
        },
      );
      await refreshConverses();
      setMuteTarget(null);
      setMutePreset(null);
      setMuteCustom('');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUnmute(memberId: string) {
    const token = await getToken();
    if (!token) return;
    await fetch(
      `${API_BASE_URL}/api/v1/converses/groups/${converseId}/members/${memberId}/mute`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    );
    await refreshConverses();
  }

  async function handleBan() {
    if (!banTarget) return;
    setActionLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      await fetch(
        `${API_BASE_URL}/api/v1/converses/groups/${converseId}/bans/${banTarget.userId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ reason: banReason.trim() || undefined }),
        },
      );
      await refreshConverses();
      setBanTarget(null);
      setBanReason('');
    } finally {
      setActionLoading(false);
    }
  }

  async function openAddMember() {
    setShowAddMember(true);
    setSelectedFriendIds(new Set());
    setFriendsLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/api/v1/friends`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: FriendItem[] = await res.json();
        // Filter out existing group members
        const existingIds = new Set(members.map((m) => m.userId));
        setFriends(data.filter((f) => !existingIds.has(f.id)));
      }
    } catch {
      // silent
    } finally {
      setFriendsLoading(false);
    }
  }

  function toggleFriendSelection(friendId: string) {
    setSelectedFriendIds((prev) => {
      const next = new Set(prev);
      if (next.has(friendId)) {
        next.delete(friendId);
      } else {
        next.add(friendId);
      }
      return next;
    });
  }

  async function handleAddMembers() {
    if (selectedFriendIds.size === 0) return;
    setAddMemberLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(
        `${API_BASE_URL}/api/v1/converses/groups/${converseId}/members`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ memberIds: [...selectedFriendIds] }),
        },
      );
      if (res.ok) {
        await refreshConverses();
        setShowAddMember(false);
      }
    } finally {
      setAddMemberLoading(false);
    }
  }

  function getRoleBadge(role?: string) {
    if (!role) return null;
    const colors: Record<string, string> = {
      OWNER: '#f59e0b',
      ADMIN: '#4361ee',
      MEMBER: '#607b96',
    };
    return (
      <span className="group-role-badge" style={{ color: colors[role] ?? '#607b96' }}>
        {role.toLowerCase()}
      </span>
    );
  }

  function canRemove(targetRole?: string): boolean {
    if (!targetRole) return false;
    if (isOwner) return targetRole !== 'OWNER';
    if (isAdmin) return targetRole === 'MEMBER';
    return false;
  }

  return (
    <div className="group-panel">
      <div className="group-panel-header">
        <h3>Group Info</h3>
        <button className="dialog-close" onClick={onClose}>&times;</button>
      </div>

      <div className="group-panel-body">
        {/* Group Name */}
        <div className="group-panel-section">
          <div className="group-panel-label">Name</div>
          {editingName ? (
            <div className="group-panel-edit-row">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={100}
                autoFocus
              />
              <button
                className="group-panel-save-btn"
                onClick={() => handleUpdateGroup({ name: editName })}
                disabled={actionLoading || !editName.trim()}
              >
                Save
              </button>
              <button
                className="group-panel-cancel-btn"
                onClick={() => setEditingName(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="group-panel-value-row">
              <span>{converse.name ?? 'Unnamed'}</span>
              {canManage && (
                <button
                  className="group-panel-edit-btn"
                  onClick={() => { setEditName(converse.name ?? ''); setEditingName(true); }}
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </div>

        {/* Description */}
        <div className="group-panel-section">
          <div className="group-panel-label">Description</div>
          {editingDesc ? (
            <div className="group-panel-edit-row">
              <input
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                maxLength={500}
                autoFocus
              />
              <button
                className="group-panel-save-btn"
                onClick={() => handleUpdateGroup({ description: editDesc })}
                disabled={actionLoading}
              >
                Save
              </button>
              <button
                className="group-panel-cancel-btn"
                onClick={() => setEditingDesc(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="group-panel-value-row">
              <span className="group-panel-desc">
                {ext.description || 'No description'}
              </span>
              {canManage && (
                <button
                  className="group-panel-edit-btn"
                  onClick={() => { setEditDesc(ext.description ?? ''); setEditingDesc(true); }}
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </div>

        {/* Members */}
        <div className="group-panel-section">
          <div className="group-panel-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Members ({ext.memberCount ?? members.length})</span>
            {canManage && (
              <button
                className="group-panel-edit-btn"
                onClick={openAddMember}
                style={{ fontSize: '0.8rem' }}
              >
                + Add
              </button>
            )}
          </div>
          <div className="group-panel-members">
            {members.map((m) => (
              <div key={m.userId} className="group-member-item">
                <div className="group-member-avatar">
                  {(m.displayName ?? m.username ?? '?').charAt(0).toUpperCase()}
                </div>
                <div className="group-member-info">
                  <span className="group-member-name">
                    {m.displayName ?? m.username}
                    {m.userId === currentUserId && (
                      <span className="group-member-you"> (you)</span>
                    )}
                  </span>
                  {getRoleBadge(m.role)}
                  {(m as any).mutedUntil && new Date((m as any).mutedUntil) > new Date() && (
                    <span style={{ marginLeft: 4, color: '#f59e0b', fontSize: '12px' }} title="Muted">🔇</span>
                  )}
                </div>
                {m.userId !== currentUserId && canRemove(m.role) && (
                  <div className="group-member-actions">
                    {isOwner && m.role !== 'ADMIN' && (
                      <button
                        className="group-action-btn promote"
                        onClick={() => handleUpdateRole(m.userId, 'ADMIN')}
                        title="Promote to Admin"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" />
                        </svg>
                      </button>
                    )}
                    {isOwner && m.role === 'ADMIN' && (
                      <button
                        className="group-action-btn demote"
                        onClick={() => handleUpdateRole(m.userId, 'MEMBER')}
                        title="Demote to Member"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </button>
                    )}
                    {canManage && !((m as any).mutedUntil && new Date((m as any).mutedUntil) > new Date()) && (
                      <button
                        className="group-action-btn"
                        onClick={() => {
                          setMuteTarget({ userId: m.userId, name: m.displayName ?? m.username ?? '' });
                          setMutePreset(null);
                          setMuteCustom('');
                        }}
                        title="Mute"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 5L6 9H2v6h4l5 4V5z" />
                          <line x1="23" y1="9" x2="17" y2="15" />
                          <line x1="17" y1="9" x2="23" y2="15" />
                        </svg>
                      </button>
                    )}
                    {canManage && (m as any).mutedUntil && new Date((m as any).mutedUntil) > new Date() && (
                      <button
                        className="group-action-btn"
                        onClick={() => handleUnmute(m.userId)}
                        title="Unmute"
                        style={{ color: '#f59e0b' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 5L6 9H2v6h4l5 4V5z" />
                          <path d="M19.07 4.93a10 10 0 010 14.14" />
                        </svg>
                      </button>
                    )}
                    {canManage && (
                      <button
                        className="group-action-btn"
                        onClick={() => {
                          setBanTarget({ userId: m.userId, name: m.displayName ?? m.username ?? '' });
                          setBanReason('');
                        }}
                        title="Ban"
                        style={{ color: '#f44336' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                        </svg>
                      </button>
                    )}
                    <button
                      className="group-action-btn remove"
                      onClick={() => handleRemoveMember(m.userId)}
                      title="Remove"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="group-panel-section group-panel-actions">
          <button className="group-leave-btn" onClick={handleLeaveGroup}>
            Leave Group
          </button>
          {isOwner && (
            <>
              {showConfirmDelete ? (
                <div className="group-delete-confirm">
                  <span>Delete this group permanently?</span>
                  <div className="group-delete-confirm-btns">
                    <button
                      className="group-delete-btn confirm"
                      onClick={handleDeleteGroup}
                      disabled={actionLoading}
                    >
                      {actionLoading ? 'Deleting...' : 'Yes, Delete'}
                    </button>
                    <button
                      className="group-delete-btn cancel-del"
                      onClick={() => setShowConfirmDelete(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="group-delete-btn"
                  onClick={() => setShowConfirmDelete(true)}
                >
                  Delete Group
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mute Duration Picker Dialog */}
      {muteTarget && (
        <div className="dialog-overlay" onClick={() => setMuteTarget(null)}>
          <div className="dialog-content" style={{ width: 360 }} onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <h3>🔇 Mute {muteTarget.name}</h3>
              <button className="dialog-close" onClick={() => setMuteTarget(null)}>&times;</button>
            </div>
            <div className="dialog-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {MUTE_PRESETS.map((p, i) => (
                  <button
                    key={p.minutes}
                    className="dialog-btn"
                    style={{
                      background: mutePreset === i && !muteCustom ? '#4361ee' : '#2d3748',
                      color: mutePreset === i && !muteCustom ? '#fff' : '#a0aec0',
                      fontWeight: mutePreset === i && !muteCustom ? 700 : 400,
                    }}
                    onClick={() => { setMutePreset(i); setMuteCustom(''); }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="dialog-field">
                <label>Custom (minutes)</label>
                <input
                  type="number"
                  min={1}
                  max={43200}
                  value={muteCustom}
                  onChange={(e) => { setMuteCustom(e.target.value); setMutePreset(null); }}
                  placeholder="Enter minutes..."
                />
              </div>
            </div>
            <div className="dialog-footer">
              <button className="dialog-btn cancel" onClick={() => setMuteTarget(null)}>Cancel</button>
              <button
                className="dialog-btn primary"
                onClick={handleMute}
                disabled={actionLoading || getMuteMinutes() <= 0}
              >
                {actionLoading ? 'Muting...' : 'Mute'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Dialog */}
      {showAddMember && (
        <div className="dialog-overlay" onClick={() => setShowAddMember(false)}>
          <div className="dialog-content" style={{ width: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <h3>Add Members</h3>
              <button className="dialog-close" onClick={() => setShowAddMember(false)}>&times;</button>
            </div>
            <div className="dialog-body" style={{ maxHeight: 350, overflowY: 'auto' }}>
              {friendsLoading ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#607b96' }}>
                  Loading friends...
                </div>
              ) : friends.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#607b96' }}>
                  No friends available to add
                </div>
              ) : (
                friends.map((f) => (
                  <div
                    key={f.id}
                    className="group-member-item"
                    style={{ cursor: 'pointer', background: selectedFriendIds.has(f.id) ? 'rgba(67,97,238,0.15)' : undefined }}
                    onClick={() => toggleFriendSelection(f.id)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFriendIds.has(f.id)}
                      onChange={() => toggleFriendSelection(f.id)}
                      style={{ marginRight: 8, accentColor: '#4361ee' }}
                    />
                    <div className="group-member-avatar">
                      {(f.displayName ?? f.username ?? '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="group-member-info">
                      <span className="group-member-name">{f.displayName}</span>
                      <span style={{ color: '#607b96', fontSize: '0.8rem' }}>@{f.username}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="dialog-footer">
              <button className="dialog-btn cancel" onClick={() => setShowAddMember(false)}>Cancel</button>
              <button
                className="dialog-btn primary"
                onClick={handleAddMembers}
                disabled={addMemberLoading || selectedFriendIds.size === 0}
              >
                {addMemberLoading ? 'Adding...' : `Add (${selectedFriendIds.size})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ban Member Dialog */}
      {banTarget && (
        <div className="dialog-overlay" onClick={() => setBanTarget(null)}>
          <div className="dialog-content" style={{ width: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <h3 style={{ color: '#f44336' }}>🚫 Ban & Remove {banTarget.name}</h3>
              <button className="dialog-close" onClick={() => setBanTarget(null)}>&times;</button>
            </div>
            <div className="dialog-body">
              <p style={{ color: '#a0aec0', fontSize: '0.88rem', margin: 0 }}>
                This will remove <strong style={{ color: '#e0e0e0' }}>{banTarget.name}</strong> from
                the group and prevent them from rejoining.
              </p>
              <div className="dialog-field">
                <label>Reason (optional)</label>
                <textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Enter reason for banning..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #1e2d3d',
                    borderRadius: 8,
                    background: '#0d1b2a',
                    color: '#e0e0e0',
                    fontSize: '0.88rem',
                    resize: 'vertical',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>
            <div className="dialog-footer">
              <button className="dialog-btn cancel" onClick={() => setBanTarget(null)}>Cancel</button>
              <button
                className="dialog-btn"
                style={{ background: '#f44336', color: '#fff' }}
                onClick={handleBan}
                disabled={actionLoading}
              >
                {actionLoading ? 'Banning...' : 'Ban'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
