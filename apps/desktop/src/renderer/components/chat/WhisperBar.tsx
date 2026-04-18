import { useAiStore } from '../../stores/aiStore';
import { useChatSocket } from '../../hooks/useChatSocket';

interface WhisperBarProps {
  converseId: string;
  onAccept: (text: string) => void;
}

export function WhisperBar({ converseId, onAccept }: WhisperBarProps) {
  const suggestion = useAiStore((s) => s.whisper[converseId]);
  const { dismissWhisper, toggleWhisperAlternatives } = useAiStore();
  const { emitWhisperAccept } = useChatSocket();

  if (!suggestion) return null;

  const handleAccept = (index: number, text: string) => {
    emitWhisperAccept(suggestion.suggestionId, index);
    dismissWhisper(converseId);
    onAccept(text);
  };

  return (
    <div className="whisper-bar">
      <span className="whisper-label">✦</span>
      <div className="whisper-chips">
        <button
          className="whisper-chip whisper-chip-primary"
          onClick={() => handleAccept(0, suggestion.primary)}
          title="点击填入输入框"
        >
          {suggestion.primary}
        </button>

        {suggestion.alternatives.length > 0 && (
          <button
            className="whisper-expand-btn"
            onClick={() => toggleWhisperAlternatives(converseId)}
            title={suggestion.showAlternatives ? '收起' : '更多建议'}
          >
            ···
          </button>
        )}
      </div>

      {suggestion.showAlternatives && suggestion.alternatives.length > 0 && (
        <div className="whisper-alternatives">
          {suggestion.alternatives.map((alt, i) => (
            <button
              key={i}
              className="whisper-chip whisper-chip-alt"
              onClick={() => handleAccept(i + 1, alt)}
            >
              {alt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
