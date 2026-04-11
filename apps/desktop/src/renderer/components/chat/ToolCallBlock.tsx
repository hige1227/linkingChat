import { useState } from 'react';
import type { ToolRecord } from '../../stores/chatStore';

interface ToolCallBlockProps {
  record: ToolRecord;
}

export function ToolCallBlock({ record }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const hasOutput = record.output && record.output.length > 0;

  return (
    <div
      className="tool-call-block"
      onClick={() => hasOutput && setExpanded(!expanded)}
      style={{ cursor: hasOutput ? 'pointer' : 'default' }}
    >
      <div className="tool-call-header">
        {record.status === 'running' ? (
          <span className="tool-call-spinner" />
        ) : (
          <span>🔧</span>
        )}
        <span className="tool-call-name">{record.tool}</span>
        {record.input && (
          <span className="tool-input" title={record.input}>
            $ {record.input}
          </span>
        )}
        {hasOutput && (
          <span className="tool-expand">{expanded ? '▼' : '▶'}</span>
        )}
      </div>
      {expanded && hasOutput && (
        <pre className="tool-call-output">{record.output}</pre>
      )}
    </div>
  );
}
