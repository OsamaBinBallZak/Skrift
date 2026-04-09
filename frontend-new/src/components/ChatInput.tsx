import { useState, useRef, useEffect } from 'react'
import { Send, Square } from 'lucide-react'

interface ChatInputProps {
  disabled: boolean
  streaming: boolean
  onSend: (message: string) => void
  onStop: () => void
}

export function ChatInput({ disabled, streaming, onSend, onStop }: ChatInputProps) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [message])

  function handleSubmit() {
    const trimmed = message.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setMessage('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        ref={textareaRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled || streaming}
        placeholder={disabled ? 'Model busy...' : 'Ask about this note...'}
        rows={1}
        className="w-full resize-none rounded-md border border-border/[0.15] bg-white/[0.03] px-2.5 py-2 text-[12px] text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/40 transition-colors disabled:opacity-50"
      />
      <div className="flex justify-end">
        {streaming ? (
          <button
            onClick={onStop}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md bg-destructive text-white hover:opacity-90 transition-colors"
          >
            <Square size={9} fill="white" />
            Stop
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={disabled || !message.trim()}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            <Send size={9} />
            Ask
          </button>
        )}
      </div>
    </div>
  )
}
