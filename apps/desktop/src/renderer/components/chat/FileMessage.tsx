interface Attachment {
  url: string;
  filename: string;
  mimeType: string;
  size?: number;
}

interface FileMessageProps {
  attachment: Attachment;
  isOwnMessage: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('application/pdf')) return '📄';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📎';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('compressed')) return '📦';
  return '📁';
}

export function FileMessage({ attachment, isOwnMessage }: FileMessageProps) {
  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = attachment.url;
    a.download = attachment.filename;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className={`file-message ${isOwnMessage ? 'own' : ''}`} onClick={handleDownload}>
      <span className="file-message-icon">{getFileIcon(attachment.mimeType)}</span>
      <div className="file-message-info">
        <span className="file-message-name">{attachment.filename}</span>
        <span className="file-message-size">
          {attachment.size ? formatFileSize(attachment.size) : ''}
        </span>
      </div>
      <svg className="file-message-download" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    </div>
  );
}
