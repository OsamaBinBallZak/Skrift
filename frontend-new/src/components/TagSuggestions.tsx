import { cn } from '@/lib/utils'

interface TagSuggestionsProps {
  oldTags: string[]  // from whitelist
  newTags: string[]  // new suggestions
  accepted: string[]
  onToggle: (tag: string) => void
}

export function TagSuggestions({ oldTags, newTags, accepted, onToggle }: TagSuggestionsProps) {
  return (
    <div className="space-y-3">
      {/* Whitelist tags */}
      {oldTags.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-muted mb-1.5">From whitelist</div>
          <div className="flex flex-wrap gap-1">
            {oldTags.map(tag => {
              const on = accepted.includes(tag)
              return (
                <button
                  key={tag}
                  onClick={() => onToggle(tag)}
                  className={cn(
                    'px-2 py-[3px] rounded-full text-[11px] border transition-colors',
                    on
                      ? 'bg-accent/15 border-accent/30 text-accent'
                      : 'bg-white/[0.04] border-border/[0.15] text-text-secondary hover:text-text-primary',
                  )}
                >
                  {on ? '✓ ' : ''}#{tag}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* New suggestions */}
      {newTags.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-step-enhance mb-1.5">New suggestions</div>
          <div className="flex flex-wrap gap-1">
            {newTags.map(tag => {
              const on = accepted.includes(tag)
              return (
                <button
                  key={tag}
                  onClick={() => onToggle(tag)}
                  className={cn(
                    'px-2 py-[3px] rounded-full text-[11px] border border-dashed transition-colors',
                    on
                      ? 'bg-step-enhance/10 border-step-enhance/40 text-step-enhance'
                      : 'border-step-enhance/30 text-step-enhance/70 hover:text-step-enhance hover:border-step-enhance/60',
                  )}
                >
                  {on ? '✓ ' : '+ '}#{tag}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
