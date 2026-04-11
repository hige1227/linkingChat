import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useChatStore } from '../stores/chatStore';
import { useAiStore } from '../stores/aiStore';
import { API_BASE_URL } from '@renderer/config';
import { ConversationList } from '../components/chat/ConversationList';
import { ChatThread } from '../components/chat/ChatThread';
import { MessageInput } from '../components/chat/MessageInput';
import { GroupPanel } from '../components/chat/GroupPanel';
import { WhisperBar } from '../components/chat/WhisperBar';
import { DraftCard } from '../components/chat/DraftCard';
import { PredictiveActionCard } from '../components/chat/PredictiveActionCard';
import { DropZone } from '../components/chat/DropZone';
import { SearchPanel } from '../components/chat/SearchPanel';
import { uploadFile } from '../services/uploadService';

const EMPTY_DRAFTS: import('../stores/aiStore').DraftItem[] = [];
const EMPTY_PREDICTIONS: import('../stores/aiStore').PredictiveSuggestion[] = [];

export function ChatPage() {
  const { converseId } = useParams<{ converseId?: string }>();
  const { setActiveConverse } = useChatStore();
  const [showGroupPanel, setShowGroupPanel] = useState(false);
  const [prefillText, setPrefillText] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const drafts = useAiStore((s) =>
    converseId ? (s.drafts[converseId] ?? EMPTY_DRAFTS) : EMPTY_DRAFTS,
  );
  const predictions = useAiStore((s) =>
    converseId ? (s.predictions[converseId] ?? EMPTY_PREDICTIONS) : EMPTY_PREDICTIONS,
  );
  const activePredictions = predictions.filter((p) => !p.dismissed);

  const converse = useChatStore((s) =>
    converseId ? s.converses.find((c) => c.id === converseId) : undefined,
  );
  const isGroup = converse?.type === 'GROUP';

  useEffect(() => {
    setActiveConverse(converseId ?? null);
  }, [converseId, setActiveConverse]);

  // Close panels when switching conversations
  useEffect(() => {
    setShowGroupPanel(false);
    setShowSearch(false);
  }, [converseId]);

  // Ctrl+F to toggle search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch((v) => !v);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleFilesDropped = useCallback(async (files: File[]) => {
    if (!converseId) return;
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const category = isImage ? 'image' : 'file';
      try {
        const result = await uploadFile(file, category as 'image' | 'file');
        const token = await window.electronAPI.getToken();
        if (!token) continue;
        const res = await fetch(`${API_BASE_URL}/api/v1/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            converseId,
            content: '',
            attachments: [{
              url: result.url,
              fileKey: result.fileKey,
              filename: file.name,
              mimeType: result.mimeType,
              size: result.size,
            }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const store = useChatStore.getState();
          store.addMessage(converseId, data);
          store.updateLastMessage(converseId, data, false);
        }
      } catch (e) {
        console.error('Drop upload failed:', e);
      }
    }
  }, [converseId]);

  // Fetch converses on mount + ensure currentUserId is set
  // Only fetch if store is empty (first load). Subsequent tab switches reuse cached data.
  // WS events handle incremental updates (message:new, converse:new, etc.)
  useEffect(() => {
    async function fetchConverses() {
      const token = await window.electronAPI.getToken();
      if (!token) return;

      // Ensure currentUserId is set before rendering converses
      if (!useChatStore.getState().currentUserId) {
        try {
          const payload = token.split('.')[1];
          const decoded = JSON.parse(atob(payload));
          if (decoded.sub) {
            useChatStore.getState().setCurrentUserId(decoded.sub);
          }
        } catch { /* ignore */ }
      }

      // Skip fetch if we already have converses (e.g. returning from another tab)
      if (useChatStore.getState().converses.length > 0) return;

      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/converses`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          useChatStore.getState().setConverses(data);
        }
      } catch (e) {
        console.error('Failed to fetch converses:', e);
      }
    }
    fetchConverses();
  }, []);

  return (
    <div className="chat-page">
      <div className="chat-sidebar">
        <ConversationList />
      </div>
      <DropZone onFilesDropped={handleFilesDropped}>
      <div className="chat-main">
        {converseId ? (
          <>
            <ChatThread
              converseId={converseId}
              onGroupInfoClick={isGroup ? () => setShowGroupPanel((v) => !v) : undefined}
            />

            {showSearch && (
              <SearchPanel
                converseId={converseId}
                onClose={() => setShowSearch(false)}
                onResultClick={(cId) => {
                  setShowSearch(false);
                  // Navigate to conversation if different
                  if (cId !== converseId) {
                    window.location.hash = `/chat/${cId}`;
                  }
                }}
              />
            )}

            {/* AI Draft Cards */}
            {drafts.length > 0 && (() => {
              const sorted = [...drafts].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
              console.log('[Draft] Render order:', sorted.map((d, i) => `${i}: ${d.botName} createdAt=${d.createdAt}`));
              return (
                <div className="ai-cards-area">
                  {sorted.map((d) => (
                    <DraftCard key={d.draftId} draft={d} converseId={converseId} />
                  ))}
                </div>
              );
            })()}

            {/* AI Predictive Action Cards */}
            {activePredictions.length > 0 && (
              <div className="ai-cards-area">
                {activePredictions.map((p) => (
                  <PredictiveActionCard
                    key={p.suggestionId}
                    suggestion={p}
                    converseId={converseId}
                  />
                ))}
              </div>
            )}

            {/* AI Whisper Bar */}
            <WhisperBar
              converseId={converseId}
              onAccept={(text) => setPrefillText(text)}
            />

            <MessageInput
              converseId={converseId}
              isGroup={isGroup}
              prefillText={prefillText}
              onPrefillConsumed={() => setPrefillText('')}
            />
          </>
        ) : (
          <div className="chat-empty">
            <div className="chat-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </div>
            <p>Select a conversation</p>
          </div>
        )}
      </div>
      </DropZone>
      {showGroupPanel && converseId && isGroup && (
        <div className="chat-right-panel">
          <GroupPanel
            converseId={converseId}
            onClose={() => setShowGroupPanel(false)}
          />
        </div>
      )}
    </div>
  );
}
