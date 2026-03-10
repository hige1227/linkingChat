import { useState, useRef, useCallback, useEffect } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useChatSocket } from '../../hooks/useChatSocket';
import { uploadFile } from '../../services/uploadService';
import { VoiceRecorder } from './VoiceRecorder';
import type { MessageResponse } from '@linkingchat/ws-protocol';

interface MessageInputProps {
  converseId: string;
  prefillText?: string;
  onPrefillConsumed?: () => void;
  onFilesDropped?: (files: File[]) => void;
}

export function MessageInput({ converseId, prefillText, onPrefillConsumed, onFilesDropped }: MessageInputProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const { emitWhisperRequest } = useChatSocket();

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

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
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
    if (!content || sending) return;

    // @ai 拦截：不发送消息，改为请求 Whisper 建议
    if (/(?<!\w)@ai\b/i.test(content)) {
      emitWhisperRequest(converseId);
      setText('');
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
