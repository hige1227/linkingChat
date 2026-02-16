import React from 'react'

interface NotificationAction {
  label: string
  action: string
  payload?: Record<string, unknown>
}

interface BotNotificationMetadata {
  cardType: 'task_complete' | 'error' | 'info' | 'action_required'
  title: string
  description?: string
  sourceBotName?: string
  executionTimeMs?: number
  actions?: NotificationAction[]
}

interface NotificationCardProps {
  metadata: BotNotificationMetadata
}

const CARD_STYLES: Record<
  string,
  { icon: string; iconColor: string; bgColor: string; borderColor: string }
> = {
  task_complete: {
    icon: '\u2705',
    iconColor: '#4CAF50',
    bgColor: '#E8F5E9',
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  error: {
    icon: '\u274C',
    iconColor: '#F44336',
    bgColor: '#FFEBEE',
    borderColor: 'rgba(244, 67, 54, 0.3)',
  },
  info: {
    icon: '\u2139\uFE0F',
    iconColor: '#2196F3',
    bgColor: '#E3F2FD',
    borderColor: 'rgba(33, 150, 243, 0.3)',
  },
  action_required: {
    icon: '\u26A0\uFE0F',
    iconColor: '#FFC107',
    bgColor: '#FFF8E1',
    borderColor: 'rgba(255, 193, 7, 0.3)',
  },
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function NotificationCard({ metadata }: NotificationCardProps) {
  const style = CARD_STYLES[metadata.cardType] || CARD_STYLES.info

  const handleAction = (action: NotificationAction) => {
    // Sprint 2: UI 就绪，具体动作在 Sprint 3 实现
    console.log('[NotificationCard] Action:', action.action, action.payload)
  }

  return (
    <div
      className="notification-card"
      style={{
        backgroundColor: style.bgColor,
        border: `1px solid ${style.borderColor}`,
        borderRadius: '12px',
        padding: '12px',
        margin: '4px 0',
        maxWidth: '360px',
      }}
    >
      {/* 标题行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '16px' }}>{style.icon}</span>
        <span
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: style.iconColor,
          }}
        >
          {metadata.title}
        </span>
      </div>

      {/* 描述文本 */}
      {metadata.description && (
        <p
          style={{
            margin: '4px 0 0 24px',
            fontSize: '13px',
            color: '#666',
          }}
        >
          {metadata.description}
        </p>
      )}

      {/* 来源 + 耗时 */}
      {(metadata.sourceBotName || metadata.executionTimeMs != null) && (
        <div
          style={{
            margin: '8px 0 0 24px',
            fontSize: '11px',
            color: '#999',
          }}
        >
          {metadata.sourceBotName && (
            <span>来自 {metadata.sourceBotName}</span>
          )}
          {metadata.sourceBotName && metadata.executionTimeMs != null && (
            <span> · </span>
          )}
          {metadata.executionTimeMs != null && (
            <span>耗时 {formatDuration(metadata.executionTimeMs)}</span>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      {metadata.actions && metadata.actions.length > 0 && (
        <div
          style={{
            margin: '8px 0 0 24px',
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          {metadata.actions.map((action, index) => (
            <button
              key={index}
              onClick={() => handleAction(action)}
              style={{
                padding: '4px 12px',
                fontSize: '12px',
                color: style.iconColor,
                border: `1px solid ${style.borderColor}`,
                borderRadius: '6px',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
