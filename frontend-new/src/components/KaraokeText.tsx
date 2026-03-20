import { useRef, useEffect } from 'react'

interface Token {
  text: string
  start: number
  end: number
}

interface KaraokeTextProps {
  tokens: Token[]
  fallback: string
  currentTime: number
  isActive: boolean
  onSeek?: (time: number) => void
}

export function KaraokeText({ tokens, fallback, currentTime, isActive, onSeek }: KaraokeTextProps) {
  const activeRef = useRef<HTMLSpanElement>(null)

  // Scroll active word into view smoothly
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })

  if (!isActive || tokens.length === 0) {
    return (
      <div className="text-[15px] leading-[1.75] text-text-primary" style={{ whiteSpace: 'pre-wrap' }}>
        {fallback}
      </div>
    )
  }

  return (
    <div className="text-[15px] leading-[1.75]">
      {tokens.map((token, i) => {
        const past = currentTime > token.end
        const active = currentTime >= token.start && currentTime <= token.end

        // Smart spacing: only insert a space if the token doesn't already carry one
        const nextToken = tokens[i + 1]
        const needsSpace =
          i < tokens.length - 1 &&
          !token.text.endsWith(' ') &&
          !nextToken?.text.startsWith(' ')

        return (
          <span
            key={i}
            ref={active ? activeRef : undefined}
            onClick={() => onSeek?.(token.start)}
            style={{
              // No padding ever — padding on inline spans changes word widths
              // and breaks line-wrapping compared to the plain-text view.
              // Background color alone is sufficient for the highlight.
              color: active
                ? 'rgb(var(--color-text-primary))'
                : past
                  ? 'rgb(var(--color-text-primary))'
                  : 'rgba(var(--color-text-primary) / 0.3)',
              background: active ? 'rgb(var(--color-accent) / 0.25)' : 'transparent',
              borderRadius: active ? '2px' : '0',
              cursor: onSeek ? 'pointer' : 'default',
              transition: 'color 0.06s, background 0.06s',
            }}
          >
            {token.text}{needsSpace ? ' ' : ''}
          </span>
        )
      })}
    </div>
  )
}
