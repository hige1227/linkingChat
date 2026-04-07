import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import Markdown from 'react-markdown';
import { useChatStore } from '../../stores/chatStore';
import { NotificationCard } from '../NotificationCard';
import { ImageMessage } from './ImageMessage';
import { FileMessage } from './FileMessage';
import { VoiceMessage } from './VoiceMessage';
import { MessageContextMenu } from './MessageContextMenu';
import type { MessageResponse, ConverseResponse } from '@linkingchat/ws-protocol';
import type { ChatState, StreamingMessage } from '../../stores/chatStore';

interface ChatThreadProps {
  converseId: string;
  onGroupInfoClick?: () => void;
}

export function ChatThread({ converseId, onGroupInfoClick }: ChatThreadProps) {
  const { messages, typingUsers, hasMore, cursors, prependMessages } =
    useChatStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);
  const loadingRef = useRef(false);

  const converse = useChatStore((s: ChatState) =>
    s.converses.find((c) => c.id === converseId),
  );
  const currentUserId = useChatStore((s: ChatState) => s.currentUserId);
  const readReceipts = useChatStore((s: ChatState) => s.readReceipts);
  const streamingMessagesMap = useChatStore((s: ChatState) => s.streamingMessages);
  const streamingMessages: StreamingMessage[] = useMemo(
    () => Object.values(streamingMessagesMap).filter((sm) => sm.converseId === converseId),
    [streamingMessagesMap, converseId],
  );
  const msgs = messages[converseId] ?? [];
  const typing = typingUsers[converseId] ?? [];
  const lastReadId = readReceipts[converseId];

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    msg: MessageResponse;
    position: { x: number; y: number };
  } | null>(null);

  // Fetch messages on mount / converseId change
  useEffect(() => {
    async function fetchMessages() {
      if (loadingRef.current) return;
      loadingRef.current = true;
      try {
        const token = await window.electronAPI.getToken();
        if (!token) return;

        const res = await fetch(
          `http://localhost:3008/api/v1/messages?converseId=${converseId}&limit=50`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok) {
          const data = await res.json();
          const items: MessageResponse[] = data.messages ?? [];
          const next: string | null = data.nextCursor ?? null;
          const more = data.hasMore ?? false;
          prependMessages(converseId, items, more, next);
        }
      } catch (e) {
        console.error('Failed to fetch messages:', e);
      } finally {
        loadingRef.current = false;
      }
    }

    // Only fetch if we don't have messages yet
    if ((messages[converseId] ?? []).length === 0) {
      fetchMessages();
    }
  }, [converseId]);

  // Scroll to bottom on new messages (if user was at bottom)
  useEffect(() => {
    if (wasAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [msgs.length]);

  // Also scroll to bottom when streaming messages appear/change
  useEffect(() => {
    if (wasAtBottomRef.current && streamingMessages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamingMessages.length]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    // Check if at bottom
    const threshold = 60;
    wasAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;

    // Load more at top
    if (el.scrollTop < 40 && hasMore[converseId] && !loadingRef.current) {
      loadOlderMessages();
    }
  }, [converseId, hasMore]);

  async function loadOlderMessages() {
    if (loadingRef.current) return;
    loadingRef.current = true;

    const el = containerRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;

    try {
      const token = await window.electronAPI.getToken();
      if (!token) return;

      const cursor = cursors[converseId];
      let url = `http://localhost:3008/api/v1/messages?converseId=${converseId}&limit=50`;
      if (cursor) url += `&cursor=${cursor}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const items: MessageResponse[] = data.messages ?? [];
        const next: string | null = data.nextCursor ?? null;
        const more = data.hasMore ?? false;
        prependMessages(converseId, items, more, next);

        // Maintain scroll position after prepend
        requestAnimationFrame(() => {
          if (el) {
            el.scrollTop = el.scrollHeight - prevScrollHeight;
          }
        });
      }
    } catch (e) {
      console.error('Failed to load older messages:', e);
    } finally {
      loadingRef.current = false;
    }
  }

  // Messages are stored newest-first, reverse for display
  const displayMsgs = [...msgs].reverse();

  // Determine read receipt boundary (for newest-first array)
  const lastReadIndex = lastReadId
    ? msgs.findIndex((m) => m.id === lastReadId)
    : -1;

  const handleContextMenu = useCallback((e: React.MouseEvent, msg: MessageResponse) => {
    e.preventDefault();
    if ((msg as any).deletedAt) return;
    setContextMenu({ msg, position: { x: e.clientX, y: e.clientY } });
  }, []);

  const handleCopy = useCallback(async () => {
    if (contextMenu?.msg.content) {
      await navigator.clipboard.writeText(contextMenu.msg.content);
    }
  }, [contextMenu]);

  const handleRecall = useCallback(async () => {
    if (!contextMenu) return;
    try {
      const token = await window.electronAPI.getToken();
      if (!token) return;
      await fetch(`http://localhost:3008/api/v1/messages/${contextMenu.msg.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error('Recall failed:', err);
    }
  }, [contextMenu]);

  return (
    <div className="chat-thread">
      <div className="chat-thread-header">
        <div className="chat-thread-title">
          <span className="chat-thread-name">
            {getConverseName(converse, currentUserId)}
          </span>
          {converse?.type === 'GROUP' && converse.memberCount && (
            <span className="chat-thread-members">
              {converse.memberCount} members
            </span>
          )}
        </div>
        {onGroupInfoClick && (
          <button className="chat-thread-info-btn" onClick={onGroupInfoClick} title="Group Info">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>
        )}
      </div>

      <div
        className="chat-thread-messages"
        ref={containerRef}
        onScroll={handleScroll}
      >
        {hasMore[converseId] && (
          <div className="chat-load-more">Loading older messages...</div>
        )}
        {displayMsgs.map((msg, i) => {
          const prev = i > 0 ? displayMsgs[i - 1] : null;
          const showDate = !prev || !isSameDay(msg.createdAt, prev.createdAt);
          const showAuthor =
            !prev ||
            prev.authorId !== msg.authorId ||
            showDate;

          const isOwn = msg.authorId === currentUserId;
          const isRecalled = !!(msg as any).deletedAt;
          // Read receipt: in newest-first array, msg at displayIndex maps to msgs[msgs.length - 1 - i]
          const newestFirstIdx = msgs.length - 1 - i;
          const isRead = isOwn && lastReadIndex >= 0 && newestFirstIdx >= lastReadIndex;

          // BOT_NOTIFICATION type
          if ((msg as any).type === 'BOT_NOTIFICATION') {
            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="chat-date-separator">
                    <span>{formatDateSeparator(msg.createdAt)}</span>
                  </div>
                )}
                <div style={{ padding: '4px 16px' }}>
                  <NotificationCard metadata={(msg as any).metadata ?? {}} />
                </div>
              </div>
            );
          }

          // SYSTEM message (e.g., "Herry added Kitty to the group")
          if ((msg as any).type === 'SYSTEM') {
            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="chat-date-separator">
                    <span>{formatDateSeparator(msg.createdAt)}</span>
                  </div>
                )}
                <div style={{
                  textAlign: 'center',
                  padding: '8px 16px',
                  fontSize: '13px',
                  color: '#607b96',
                }}>
                  {msg.content}
                </div>
              </div>
            );
          }

          // Recalled message placeholder
          if (isRecalled) {
            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="chat-date-separator">
                    <span>{formatDateSeparator(msg.createdAt)}</span>
                  </div>
                )}
                <div className="chat-message-recalled" style={{
                  textAlign: 'center',
                  padding: '8px 16px',
                  fontSize: '13px',
                  color: '#999',
                  fontStyle: 'italic',
                }}>
                  {isOwn ? 'You recalled a message' : 'A message was recalled'}
                </div>
              </div>
            );
          }

          return (
            <div key={msg.id} onContextMenu={(e) => handleContextMenu(e, msg)}>
              {showDate && (
                <div className="chat-date-separator">
                  <span>{formatDateSeparator(msg.createdAt)}</span>
                </div>
              )}
              <div
                className={`chat-message ${isOwn ? 'own' : 'other'} ${showAuthor ? 'with-avatar' : 'compact'}`}
              >
                {!isOwn && showAuthor && (
                  <div className="chat-message-avatar">
                    {(msg.author?.displayName ?? msg.author?.username ?? '?')
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}
                <div className="chat-message-body">
                  {!isOwn && showAuthor && (
                    <div className="chat-message-header">
                      <span className="chat-message-author">
                        {msg.author?.displayName ?? msg.author?.username}
                      </span>
                      <span className="chat-message-time">
                        {formatTime(msg.createdAt)}
                      </span>
                    </div>
                  )}
                  <div className="chat-message-bubble">
                    <div className="chat-message-content">
                      {renderMessageContent(msg, isOwn)}
                    </div>
                    <div className="chat-message-meta">
                      <span className="chat-message-time">
                        {formatTime(msg.createdAt)}
                      </span>
                      {isOwn && (
                        <span className="chat-message-read-receipt" style={{
                          color: isRead ? '#4FC3F7' : '#999',
                        }}>
                          {isRead ? '✓✓' : '✓'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {typing.length > 0 && (
          <div className="chat-typing">
            <div className="chat-typing-dots">
              <span />
              <span />
              <span />
            </div>
            <span className="chat-typing-text">
              {typing.length === 1
                ? 'Someone is typing...'
                : `${typing.length} people are typing...`}
            </span>
          </div>
        )}

        {/* Streaming bot reply bubbles */}
        {streamingMessages.map((sm) => (
          <div key={sm.requestId} className="chat-message other with-avatar streaming-message">
            <div className="chat-message-avatar">AI</div>
            <div className="chat-message-body">
              <div className="chat-message-bubble">
                <div className="chat-message-content">
                  {sm.toolCalls.length > 0 && (
                    <div className="tool-call-indicator">
                      🔧 {sm.toolCalls[sm.toolCalls.length - 1]}...
                    </div>
                  )}
                  <span className="streaming-text">
                    {sm.text ? <Markdown>{sm.text}</Markdown> : '\u00a0'}
                  </span>
                  {sm.status === 'streaming' && (
                    <span className="streaming-cursor" aria-hidden="true" />
                  )}
                  {sm.status === 'error' && (
                    <span className="streaming-error">⚠ {sm.errorText}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {contextMenu && (() => {
        const isOwn = contextMenu.msg.authorId === currentUserId;
        const createdAt = new Date(contextMenu.msg.createdAt);
        const withinRecallWindow = (Date.now() - createdAt.getTime()) / 1000 <= 120;
        return (
          <MessageContextMenu
            message={contextMenu.msg}
            isOwnMessage={isOwn}
            withinRecallWindow={withinRecallWindow}
            position={contextMenu.position}
            onClose={() => setContextMenu(null)}
            onCopy={handleCopy}
            onRecall={handleRecall}
          />
        );
      })()}
    </div>
  );
}

function renderMessageContent(msg: MessageResponse, isOwn: boolean) {
  const attachments = (msg as any).attachments as Array<{
    url: string;
    filename: string;
    mimeType: string;
    size?: number;
  }> | undefined;

  if (attachments && attachments.length > 0) {
    const att = attachments[0];
    if (att.mimeType?.startsWith('image/')) {
      return (
        <>
          <ImageMessage attachment={att} isOwnMessage={isOwn} />
          {msg.content && <div style={{ marginTop: '4px' }}>{msg.content}</div>}
        </>
      );
    }
    if (att.mimeType?.startsWith('audio/')) {
      const metadata = (att as any).metadata as { durationMs?: number } | undefined;
      return (
        <VoiceMessage
          audioUrl={att.url}
          durationMs={metadata?.durationMs ?? 0}
          isOwn={isOwn}
        />
      );
    }
    return (
      <>
        <FileMessage attachment={att} isOwnMessage={isOwn} />
        {msg.content && <div style={{ marginTop: '4px' }}>{msg.content}</div>}
      </>
    );
  }

  if (!msg.content) return null;
  // Render markdown for bot/AI messages; plain text for own messages
  if (!isOwn) {
    return <Markdown>{msg.content}</Markdown>;
  }
  return <>{msg.content}</>;
}

function getConverseName(c?: ConverseResponse, currentUserId?: string | null): string {
  if (!c) return 'Chat';
  if (c.name) return c.name;
  // DM: show the OTHER person's name
  if (c.members.length > 0) {
    const other = currentUserId
      ? c.members.find((m) => m.userId !== currentUserId)
      : null;
    const target = other ?? c.members[0];
    return target.displayName ?? target.username ?? 'Unknown';
  }
  return 'Unnamed';
}

function isSameDay(a: string, b: string): boolean {
  try {
    return new Date(a).toDateString() === new Date(b).toDateString();
  } catch {
    return false;
  }
}

function formatDateSeparator(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
