import { useState, useEffect, useRef } from 'react';
import { useAiStore } from '../../stores/aiStore';
import { useChatSocket } from '../../hooks/useChatSocket';
import type { DraftItem } from '../../stores/aiStore';

interface DraftCardProps {
  draft: DraftItem;
  converseId: string;
}

export function DraftCard({ draft, converseId }: DraftCardProps) {
  const { updateDraftStatus } = useAiStore();
  const { emitDraftApprove, emitDraftReject, emitDraftEdit } = useChatSocket();
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [remaining, setRemaining] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const contentText = (draft.draftContent.content as string) ?? '';
  const isPending = draft.status === 'pending';

  // Countdown timer
  useEffect(() => {
    function updateCountdown() {
      const now = Date.now();
      const expires = new Date(draft.expiresAt).getTime();
      const diff = expires - now;

      if (diff <= 0) {
        setRemaining('00:00');
        if (draft.status === 'pending') {
          updateDraftStatus(draft.draftId, 'expired');
        }
        if (timerRef.current) clearInterval(timerRef.current);
        return;
      }

      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setRemaining(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
    }

    updateCountdown();
    timerRef.current = setInterval(updateCountdown, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [draft.expiresAt, draft.draftId, draft.status, updateDraftStatus]);

  const handleApprove = () => {
    emitDraftApprove(draft.draftId);
    updateDraftStatus(draft.draftId, 'approved');
  };

  const handleReject = () => {
    emitDraftReject(draft.draftId);
    updateDraftStatus(draft.draftId, 'rejected');
  };

  const handleEdit = () => {
    setEditText(contentText);
    setEditing(true);
  };

  const handleSaveEdit = () => {
    emitDraftEdit(draft.draftId, { ...draft.draftContent, content: editText });
    updateDraftStatus(draft.draftId, 'approved');
    setEditing(false);
  };

  const statusLabel = draft.status !== 'pending' ? draft.status.charAt(0).toUpperCase() + draft.status.slice(1) : null;
  const statusColor = draft.status === 'approved' ? '#4caf50' : draft.status === 'rejected' ? '#607b96' : '#f44336';

  return (
    <div
      className={`draft-card draft-card--${draft.status}`}
      style={{ opacity: isPending ? 1 : 0.6 }}
    >
      <div className="draft-card-header">
        <span className="draft-card-bot">🤖 Draft from {draft.botName}</span>
        <span className="draft-card-timer" style={{ color: remaining === '00:00' ? '#f44336' : '#f59e0b' }}>
          {remaining}
        </span>
      </div>

      <div className={`draft-card-content ${draft.draftType === 'command' ? 'draft-card-code' : ''}`}>
        {editing ? (
          <textarea
            className="draft-card-editor"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={3}
          />
        ) : (
          <span>{contentText}</span>
        )}
      </div>

      {isPending && !editing && (
        <div className="draft-card-actions">
          <button className="draft-btn draft-btn-reject" onClick={handleReject}>✕ Reject</button>
          <button className="draft-btn draft-btn-edit" onClick={handleEdit}>✎ Edit</button>
          <button className="draft-btn draft-btn-approve" onClick={handleApprove}>✓ Approve</button>
        </div>
      )}

      {isPending && editing && (
        <div className="draft-card-actions">
          <button className="draft-btn draft-btn-reject" onClick={() => setEditing(false)}>Cancel</button>
          <button className="draft-btn draft-btn-approve" onClick={handleSaveEdit}>Save & Approve</button>
        </div>
      )}

      {statusLabel && (
        <div className="draft-card-status" style={{ color: statusColor }}>
          {statusLabel}
        </div>
      )}
    </div>
  );
}
