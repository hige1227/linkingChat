import { useState, useCallback } from 'react';

interface Attachment {
  url: string;
  filename: string;
  mimeType: string;
  size?: number;
}

interface ImageMessageProps {
  attachment: Attachment;
  isOwnMessage: boolean;
}

export function ImageMessage({ attachment, isOwnMessage }: ImageMessageProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const handleClick = useCallback(() => {
    setShowPreview(true);
  }, []);

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowPreview(false);
  }, []);

  return (
    <>
      <div
        className={`image-message ${isOwnMessage ? 'own' : ''}`}
        onClick={handleClick}
        style={{ cursor: 'pointer' }}
      >
        {!loaded && !error && (
          <div className="image-message-placeholder">Loading...</div>
        )}
        {error ? (
          <div className="image-message-error">Failed to load image</div>
        ) : (
          <img
            src={attachment.url}
            alt={attachment.filename}
            className="image-message-img"
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
            style={{ display: loaded ? 'block' : 'none' }}
          />
        )}
      </div>

      {showPreview && (
        <div className="image-preview-overlay" onClick={handleClose}>
          <button className="image-preview-close" onClick={handleClose}>
            &times;
          </button>
          <img
            src={attachment.url}
            alt={attachment.filename}
            className="image-preview-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
