import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Ambiguity } from '@/api'

interface Decision {
  alias: string
  offset: number
  person_id: string
  apply_to_remaining: boolean
}

interface DisambiguationModalProps {
  ambiguities: Ambiguity[]
  sessionId: string
  onResolve: (decisions: Decision[]) => void
  onCancel: () => void
}

export function DisambiguationModal({ ambiguities, sessionId: _sessionId, onResolve, onCancel }: DisambiguationModalProps) {
  // choices: Map<alias|offset, person_id>
  const [choices, setChoices] = useState<Record<string, string>>({})

  function choiceKey(alias: string, offset: number) { return `${alias}|${offset}` }

  function setChoice(alias: string, offset: number, person_id: string) {
    setChoices(prev => ({ ...prev, [choiceKey(alias, offset)]: person_id }))
  }

  function assignAllRemaining(ambig: Ambiguity, person_id: string) {
    setChoices(prev => {
      const next = { ...prev }
      for (const occ of ambig.occurrences) {
        const k = choiceKey(ambig.alias, occ.offset)
        if (!next[k]) next[k] = person_id
      }
      return next
    })
  }

  const totalOccurrences = ambiguities.reduce((s, a) => s + a.occurrences.length, 0)
  const resolvedCount = Object.keys(choices).length
  const allResolved = resolvedCount >= totalOccurrences

  function handleConfirm() {
    const decisions: Decision[] = []
    for (const ambig of ambiguities) {
      for (const occ of ambig.occurrences) {
        const person_id = choices[choiceKey(ambig.alias, occ.offset)]
        if (person_id) {
          decisions.push({ alias: ambig.alias, offset: occ.offset, person_id, apply_to_remaining: false })
        }
      }
    }
    onResolve(decisions)
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200] backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-surface border border-border/[0.15] rounded-xl w-[560px] max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-border/[0.07]">
          <div className="text-[15px] font-semibold mb-1">Ambiguous name{ambiguities.length > 1 ? 's' : ''}</div>
          <div className="text-[12px] text-text-secondary">Choose the correct person for each mention</div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-6">
          {ambiguities.map(ambig => (
            <div key={ambig.alias}>
              <div className="text-[13px] font-semibold text-text-primary mb-1">
                "{ambig.alias}" — {ambig.occurrences.length} occurrence{ambig.occurrences.length !== 1 ? 's' : ''}
              </div>

              {/* Quick-assign all remaining */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] text-text-muted">All remaining →</span>
                {ambig.candidates.map(c => (
                  <button
                    key={c.id}
                    onClick={() => assignAllRemaining(ambig, c.id)}
                    className="text-[11px] px-2.5 py-1 rounded-md bg-white/[0.05] border border-border/[0.15] text-text-secondary hover:text-text-primary transition-colors"
                  >
                    {c.canonical.replace(/\[\[|\]\]/g, '')}
                  </button>
                ))}
              </div>

              {/* Per-occurrence cards */}
              <div className="space-y-2">
                {ambig.occurrences.map(occ => {
                  const chosen = choices[choiceKey(ambig.alias, occ.offset)]
                  return (
                    <div key={occ.offset} className={cn('p-3 rounded-lg bg-white/[0.02] border transition-colors', chosen ? 'border-check-green/20' : 'border-border/[0.07]')}>
                      <p
                        className="text-[12px] text-text-secondary mb-2 leading-relaxed"
                        dangerouslySetInnerHTML={{
                          __html: occ.context.replace(
                            new RegExp(`\\b${ambig.alias}\\b`, 'gi'),
                            `<span style="color:rgb(var(--color-accent));font-weight:600">${ambig.alias}</span>`
                          ),
                        }}
                      />
                      <div className="flex gap-1.5">
                        {ambig.candidates.map(c => (
                          <button
                            key={c.id}
                            onClick={() => setChoice(ambig.alias, occ.offset, c.id)}
                            className={cn(
                              'flex-1 px-2 py-1.5 rounded-md text-[12px] font-medium text-center transition-colors',
                              chosen === c.id
                                ? 'bg-accent/15 border-2 border-accent text-accent'
                                : 'bg-white/[0.04] border border-border/[0.15] text-text-secondary hover:text-text-primary',
                            )}
                          >
                            {c.canonical.replace(/\[\[|\]\]/g, '')}
                            {chosen === c.id && ' ✓'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-border/[0.07] flex items-center justify-between">
          <span className="text-[11px] text-text-muted">{resolvedCount}/{totalOccurrences} resolved</span>
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-4 py-1.5 text-xs rounded-lg bg-white/[0.05] border border-border/[0.15] text-text-secondary hover:text-text-primary transition-colors">Cancel</button>
            <button
              onClick={handleConfirm}
              disabled={!allResolved}
              className="px-4 py-1.5 text-xs rounded-lg bg-accent text-white font-medium hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Confirm All
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
