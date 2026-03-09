interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  dangerLevel: 'warning' | 'dangerous';
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  dangerLevel,
  onConfirm,
}: ConfirmDialogProps) {
  if (!open) return null;

  const isDangerous = dangerLevel === 'dangerous';

  return (
    <div className="dialog-overlay" onClick={() => onOpenChange(false)}>
      <div
        className="dialog-content"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '360px' }}
      >
        <div className="dialog-header">
          <h3 style={{ color: isDangerous ? '#f44336' : '#f59e0b' }}>
            {isDangerous ? '\u26A0\uFE0F' : '\u26A1'} {title}
          </h3>
          <button className="dialog-close" onClick={() => onOpenChange(false)}>
            &times;
          </button>
        </div>
        <div className="dialog-body">
          <p style={{ color: '#d4d4d4', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
            {description}
          </p>
          {isDangerous && (
            <div className="confirm-danger-warning">
              This action may be dangerous and cannot be undone.
            </div>
          )}
        </div>
        <div className="dialog-footer">
          <button className="dialog-btn cancel" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            className={`dialog-btn ${isDangerous ? 'danger' : 'warning'}`}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {isDangerous ? 'Execute Anyway' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
