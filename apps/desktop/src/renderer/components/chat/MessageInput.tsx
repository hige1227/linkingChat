import { useState, useRef, useCallback, useEffect } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useAiStore } from '../../stores/aiStore';
import { useChatSocket } from '../../hooks/useChatSocket';
import { uploadFile } from '../../services/uploadService';
import { VoiceRecorder } from './VoiceRecorder';
import type { MessageResponse } from '@linkingchat/ws-protocol';

const AI_MENTION_RE = /(?<!\w)@ai\b/i;

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
  const [showAiHint, setShowAiHint] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const aiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { emitWhisperRequest } = useChatSocket();
  const whisper = useAiStore((s) => s.whisper[converseId]);
  const showAiButton = !isGroup;

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

  // Reset AI hint when converseId changes
  useEffect(() => {
    setShowAiHint(false);
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
    // Real-time @ai detection
    if (showAiButton) {
      setShowAiHint(AI_MENTION_RE.test(value));
    }
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
    if (!content || sending) return;

    // @ai 拦截：仅当提示条可见时拦截（用户已有预期）
    if (showAiHint) {
      // Extract user's text minus @ai as prompt context
      const prompt = content.replace(AI_MENTION_RE, '').trim() || undefined;
      handleAiRequest(prompt);
      setText('');
      setShowAiHint(false);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    setText('');
    setSending(true);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const token = await window.electronAPI.getToken();
      if (!token) return;

      const res = await fetch(
        'http://localhost:3008/api/v1/messages',
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
      } else {
        const err = await res.text();
        console.error('Send message failed:', res.status, err);
      }
    } catch (e) {
      console.error('Send message error:', e);
    } finally {
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

        const res = await fetch('http://localhost:3008/api/v1/messages', {
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
      {showAiHint && (
        <div className="ai-hint-bar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
          </svg>
          <span>Contains @ai — sending will request AI suggestions, message won't be sent</span>
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

                const res = await fetch('http://localhost:3008/api/v1/messages', {
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
