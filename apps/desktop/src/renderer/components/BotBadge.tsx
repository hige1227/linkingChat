import React from 'react'

interface BotBadgeProps {
  children: React.ReactNode
  size?: number
}

export function BotBadge({ children, size = 16 }: BotBadgeProps) {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {children}
      <div
        style={{
          position: 'absolute',
          right: -2,
          bottom: -2,
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: '#2196F3',
          border: '1.5px solid white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.55,
          lineHeight: 1,
        }}
        title="Bot"
      >
        <span role="img" aria-label="bot" style={{ color: 'white' }}>
          {'\u{1F916}'}
        </span>
      </div>
    </div>
  )
}
