import { useState } from 'react';
import { useAiStore } from '../../stores/aiStore';
import { useChatSocket } from '../../hooks/useChatSocket';
import type { PredictiveSuggestion } from '../../stores/aiStore';
import { ConfirmDialog } from './ConfirmDialog';

interface PredictiveActionCardProps {
  suggestion: PredictiveSuggestion;
  converseId: string;
}

const DANGER_COLORS: Record<string, string> = {
  safe: '#4caf50',
  warning: '#f59e0b',
  dangerous: '#f44336',
};

const DANGER_ICONS: Record<string, string> = {
  safe: '🟢',
  warning: '🟡',
  dangerous: '🔴',
};

export function PredictiveActionCard({ suggestion, converseId }: PredictiveActionCardProps) {
  const { dismissPrediction } = useAiStore();
  const { emitPredictiveExecute, emitPredictiveDismiss } = useChatSocket();
  const [confirmAction, setConfirmAction] = useState<{
    index: number;
    description: string;
    dangerLevel: 'warning' | 'dangerous';
  } | null>(null);

  if (suggestion.dismissed) return null;

  const handleExecute = (index: number) => {
    const action = suggestion.actions[index];
    if (action.dangerLevel === 'safe') {
      emitPredictiveExecute(suggestion.suggestionId, index);
      dismissPrediction(converseId, suggestion.suggestionId);
      emitPredictiveDismiss(suggestion.suggestionId);
    } else {
      setConfirmAction({
        index,
        description: action.description,
        dangerLevel: action.dangerLevel as 'warning' | 'dangerous',
      });
    }
  };

  const handleConfirm = () => {
    if (!confirmAction) return;
    emitPredictiveExecute(suggestion.suggestionId, confirmAction.index);
    dismissPrediction(converseId, suggestion.suggestionId);
    emitPredictiveDismiss(suggestion.suggestionId);
    setConfirmAction(null);
  };

  const handleDismiss = () => {
    emitPredictiveDismiss(suggestion.suggestionId);
    dismissPrediction(converseId, suggestion.suggestionId);
  };

  return (
    <>
      <div className="predictive-card">
        <div className="predictive-card-header">
          <span>✨ Suggested Actions</span>
          <button className="predictive-dismiss-btn" onClick={handleDismiss} title="Dismiss">×</button>
        </div>
        <div className="predictive-card-trigger">{suggestion.trigger}</div>

        <div className="predictive-card-actions">
          {suggestion.actions.map((action, i) => (
            <div
              key={i}
              className={`predictive-action-row predictive-action-row--${action.dangerLevel}`}
              style={{ borderLeftColor: DANGER_COLORS[action.dangerLevel] }}
            >
              <span className="predictive-action-icon">{DANGER_ICONS[action.dangerLevel]}</span>
              <div className="predictive-action-info">
                <span className="predictive-action-desc">{action.description}</span>
                {action.type === 'shell' && (
                  <code className="predictive-cmd">{action.action}</code>
                )}
              </div>
              <button
                className="predictive-run-btn"
                style={{ color: DANGER_COLORS[action.dangerLevel] }}
                onClick={() => handleExecute(i)}
              >
                Run
              </button>
            </div>
          ))}
        </div>
      </div>

      {confirmAction && (
        <ConfirmDialog
          open={true}
          onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
          title="Confirm Action"
          description={confirmAction.description}
          dangerLevel={confirmAction.dangerLevel}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}
