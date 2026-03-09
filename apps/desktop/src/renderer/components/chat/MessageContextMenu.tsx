import { useEffect, useRef, useCallback } from 'react';
import type { MessageResponse } from '@linkingchat/ws-protocol';

interface MessageContextMenuProps {
  message: MessageResponse;
  isOwnMessage: boolean;
  withinRecallWindow: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onCopy: () => void;
  onRecall: () => void;
}

export function MessageContextMenu({
  message,
  isOwnMessage,
  withinRecallWindow,
  position,
  onClose,
  onCopy,
  onRecall,
}: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  // Adjust position to stay in viewport
  const adjustedStyle: React.CSSProperties = {
    position: 'fixed',
    top: position.y,
    left: position.x,
    zIndex: 150,
  };

  return (
    <div className="context-menu" ref={menuRef} style={adjustedStyle}>
      <button className="context-menu-item" onClick={() => { onCopy(); onClose(); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
        Copy
      </button>
      {isOwnMessage && withinRecallWindow && (
        <button className="context-menu-item danger" onClick={() => { onRecall(); onClose(); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
          </svg>
          Recall
        </button>
      )}
    </div>
  );
}
