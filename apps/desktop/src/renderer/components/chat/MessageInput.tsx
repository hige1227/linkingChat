import { useState, useRef, useCallback, useEffect } from 'react';
import { useChatStore } from '../../stores/chatStore';
import type { ChatState } from '../../stores/chatStore';
import { useAiStore } from '../../stores/aiStore';
import { useChatSocket } from '../../hooks/useChatSocket';
import { useOpenClawChat } from '../../hooks/useOpenClawChat';
import { uploadFile } from '../../services/uploadService';
import { VoiceRecorder } from './VoiceRecorder';
import { WhisperBar } from './WhisperBar';
import { API_BASE_URL } from '@renderer/config';
import type { MessageResponse } from '@linkingchat/ws-protocol';

const AI_MENTION_RE = /(?<!\w)@ai\b/i;
const API_URL = API_BASE_URL + '/api/v1';
const MESSAGE_REQUEST_TIMEOUT_MS = 30_000;
const BOT_REPLY_TIMEOUT_MS = 180_000;
const BOT_REPLY_TIMEOUT_MESSAGE = 'Bot response timed out';

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = MESSAGE_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

interface MessageInputProps {
  converseId: string;
  isGroup?: boolean;
  prefillText?: string;
  onPrefillConsumed?: () => void;
  onFilesDropped?: (files: File[]) => void;
}

export function MessageInput({ converseId, isGroup, prefillText, onPrefillConsumed, onFilesDropped }: MessageInputProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const aiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { emitWhisperRequest } = useChatSocket();
  const whisper = useAiStore((s) => s.whisper[converseId]);
  const showAiButton = true;

  // Bot converse detection
  const converse = useChatStore((s: ChatState) => s.converses.find((c) => c.id === converseId));
  const isBotConverse = Boolean((converse as any)?.isBot);
  const botId: string | undefined = (converse as any)?.botInfo?.id;

  // OpenClaw connection state (for offline hint)
  const [openClawConnected, setOpenClawConnected] = useState(false);

  // Streaming send hook
  const { sendMessage: sendOpenClawMessage, cancel: cancelOpenClawMessage } = useOpenClawChat(converseId);

  // Reset text when converseId changes
  useEffect(() => {
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [converseId]);

  // Handle prefill from WhisperBar
  useEffect(() => {
    if (prefillText) {
      setText(prefillText);
      onPrefillConsumed?.();
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        adjustHeight();
      });
    }
  }, [prefillText]);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 144) + 'px';
  }, []);

  // Reset AI state when converseId changes
  useEffect(() => {
    setAiLoading(false);
    if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
  }, [converseId]);

  // Reset aiLoading when whisper suggestion arrives
  useEffect(() => {
    if (whisper && aiLoading) {
      setAiLoading(false);
      if (aiTimeoutRef.current) {
        clearTimeout(aiTimeoutRef.current);
        aiTimeoutRef.current = null;
      }
    }
  }, [whisper, aiLoading]);

  // Track OpenClaw connection state for offline hint
  useEffect(() => {
    window.electronAPI.getOpenClawStatus().then((s) => {
      setOpenClawConnected(s.connected);
    });
    window.electronAPI.onOpenClawStatusChanged(setOpenClawConnected);
  }, []);

  const handleAiRequest = (userPrompt?: string) => {
    if (aiLoading) return;
    console.log('[AI] handleAiRequest called, converseId:', converseId, 'prompt:', userPrompt);
    setAiLoading(true);
    emitWhisperRequest(converseId, userPrompt);
    // 5s timeout fallback
    aiTimeoutRef.current = setTimeout(() => {
      setAiLoading(false);
      aiTimeoutRef.current = null;
      console.log('[AI] 5s timeout — loading reset');
    }, 5000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    adjustHeight();
    emitTyping();
  };

  const emitTyping = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
    }
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
    }, 2000);
  }, [converseId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
    const content = text.trim();
    if (!content || sendingRef.current) return;

    sendingRef.current = true;
    setSending(true);

    // Bot converse: route to local OpenClaw Gateway
    if (isBotConverse && botId) {
      setText('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';

      let persistedUserMessage = false;
      try {
        const token = await window.electronAPI.getToken();
        if (!token) {
          setText(content);
          requestAnimationFrame(adjustHeight);
          return;
        }

        // Persist user message via normal REST (echoes back via socket)
        const res = await fetchWithTimeout(`${API_URL}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ converseId, content, skipBotDispatch: true }),
        });
        if (!res.ok) {
          const err = await res.text();
          console.error('[Bot] Failed to persist user message:', res.status, err);
          setText(content);
          requestAnimationFrame(adjustHeight);
          return;
        }

        const data: MessageResponse = await res.json();
        const store = useChatStore.getState();
        store.addMessage(converseId, data);
        store.updateLastMessage(converseId, data, false);
        persistedUserMessage = true;

        await withTimeout(
          sendOpenClawMessage(content, botId, token),
          BOT_REPLY_TIMEOUT_MS,
          BOT_REPLY_TIMEOUT_MESSAGE,
        );
      } catch (err) {
        if ((err as Error).message === BOT_REPLY_TIMEOUT_MESSAGE) {
          cancelOpenClawMessage();
        }
        console.error('[Bot] Failed to send bot message:', err);
        if (!persistedUserMessage) {
          setText(content);
          requestAnimationFrame(adjustHeight);
        }
      } finally {
        sendingRef.current = false;
        setSending(false);
        textareaRef.current?.focus();
      }

      return;
    }

    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    let sent = false;
    try {
      const token = await window.electronAPI.getToken();
      if (!token) return;

      const res = await fetchWithTimeout(
        `${API_URL}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ converseId, content }),
        },
      );

      if (res.ok) {
        const data: MessageResponse = await res.json();
        const store = useChatStore.getState();
        store.addMessage(converseId, data);
        // Own message: update lastMessage but do NOT increment unread
        store.updateLastMessage(converseId, data, false);
        sent = true;
      } else {
        const err = await res.text();
        console.error('Send message failed:', res.status, err);
      }
    } catch (e) {
      console.error('Send message error:', e);
    } finally {
      if (!sent) {
        setText(content);
        requestAnimationFrame(adjustHeight);
      }
      sendingRef.current = false;
      setSending(false);
    }

    textareaRef.current?.focus();
  };

  const handleFileSelect = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    for (const file of fileArray) {
      const isImage = file.type.startsWith('image/');
      const category = isImage ? 'image' : 'file';

      setUploading(true);
      try {
        const result = await uploadFile(file, category as 'image' | 'file');

        // Send message with attachment
        const token = await window.electronAPI.getToken();
        if (!token) continue;

        const res = await fetch(`${API_URL}/messages`, {
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
          const data: MessageResponse = await res.json();
          const store = useChatStore.getState();
          store.addMessage(converseId, data);
          store.updateLastMessage(converseId, data, false);
        }
      } catch (e) {
        console.error('Upload failed:', e);
      } finally {
        setUploading(false);
      }
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle files dropped from DropZone
  useEffect(() => {
    if (onFilesDropped) {
      // parent will call handleFileSelect via ref or callback
    }
  }, [onFilesDropped]);

  return (
    <div className="message-input-container">
      {!isGroup && !isBotConverse && (
        <WhisperBar
          converseId={converseId}
          onAccept={(text) => {
            setText(text);
            requestAnimationFrame(() => textareaRef.current?.focus());
          }}
        />
      )}
      {isBotConverse && !openClawConnected && (
        <div className="bot-offline-hint">
          ⚠ AI assistant offline — restart Desktop to reconnect
        </div>
      )}
      <div className="message-input-wrapper">
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          multiple
          onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
        />
        <button
          className="message-attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Attach file"
        >
          {uploading ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spin">
              <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          )}
        </button>
        <textarea
          ref={textareaRef}
          className="message-input-textarea"
          placeholder="Type a message..."
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        {showAiButton && (
          <button
            className={`message-ai-btn${aiLoading ? ' loading' : ''}`}
            onClick={() => {
              // If user has typed text, use it as prompt context for AI
              const inputText = text.trim();
              const prompt = inputText ? inputText.replace(AI_MENTION_RE, '').trim() || undefined : undefined;
              handleAiRequest(prompt);
            }}
            disabled={aiLoading}
            title="AI suggestions"
          >
            {aiLoading ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spin">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z" />
                <path d="M20 16l1.04 3.13L24 20l-2.96.87L20 24l-1.04-3.13L16 20l2.96-.87L20 16z" opacity="0.6" />
              </svg>
            )}
          </button>
        )}
        {text.trim() ? (
          <button
            className="message-send-btn"
            onClick={handleSend}
            disabled={sending}
            title="Send"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        ) : (
          <VoiceRecorder
            onRecordComplete={async (blob, durationMs) => {
              setUploading(true);
              try {
                const file = new File([blob], `voice_${Date.now()}.webm`, { type: blob.type });
                const result = await uploadFile(file, 'voice');
                const token = await window.electronAPI.getToken();
                if (!token) return;

                const res = await fetch(`${API_URL}/messages`, {
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
                      metadata: { durationMs },
                    }],
                  }),
                });

                if (res.ok) {
                  const data: MessageResponse = await res.json();
                  const store = useChatStore.getState();
                  store.addMessage(converseId, data);
                  store.updateLastMessage(converseId, data, false);
                }
              } catch (e) {
                console.error('Voice upload failed:', e);
              } finally {
                setUploading(false);
              }
            }}
            onRecordCancel={() => {}}
          />
        )}
      </div>
    </div>
  );
}
