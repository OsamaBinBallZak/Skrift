import { useEffect, useRef } from 'react'
import { X, Plus } from 'lucide-react'

interface ChatPanelProps {
  text: string
  streaming: boolean
  onDismiss: () => void
  onAppend: () => void
}

export function ChatPanel({ text, streaming, onDismiss, onAppend }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll while streaming
  useEffect(() => {
    if (streaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [text, streaming])

  return (
    <div className="flex flex-col border-t border-border/[0.15] bg-bg min-h-0 max-h-[40%]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/[0.08] shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-muted">
          AI Response
        </span>
        <div className="flex items-center gap-1.5">
          {!streaming && text && (
            <button
              onClick={onAppend}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-accent text-white hover:bg-accent/90 transition-colors"
            >
              <Plus size={10} />
              Append to note
            </button>
          )}
          <button
            onClick={onDismiss}
            className="p-1 text-text-muted hover:text-text-secondary transition-colors rounded hover:bg-white/[0.06]"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
        <div className="text-[13px] text-text-secondary leading-relaxed whitespace-pre-wrap">
          {text || <span className="text-text-muted italic">Thinking...</span>}
          {streaming && <span className="opacity-40 animate-pulse">{'\u258D'}</span>}
        </div>
      </div>
    </div>
  )
}
