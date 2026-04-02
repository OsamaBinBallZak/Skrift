import { cn } from '@/lib/utils'
import type { AppSettings, VisibleProperties } from '@/hooks/useSettings'

interface AppearanceTabProps {
  settings: AppSettings
  onUpdate: (patch: Partial<AppSettings>) => Promise<void>
  setTheme: (t: 'dark' | 'light') => void
}

const PROP_META: Record<keyof VisibleProperties, { label: string; desc: string }> = {
  date: { label: 'Date', desc: 'When the recording was made' },
  source: { label: 'Source type', desc: 'Voice memo or Apple Note' },
  duration: { label: 'Duration', desc: 'Audio recording length' },
  author: { label: 'Author', desc: 'Who wrote or spoke this' },
  location: { label: 'Location', desc: 'Where it was recorded' },
  tags: { label: 'Tags', desc: 'Topic labels for organization' },
  summary: { label: 'Summary', desc: 'AI-generated summary of the content' },
  significance: { label: 'Significance', desc: 'How personally significant this note is (0\u20131)' },
}

export function AppearanceTab({ settings, onUpdate, setTheme }: AppearanceTabProps) {
  function toggleProp(key: string) {
    void onUpdate({
      visibleProps: { ...settings.visibleProps, [key]: !settings.visibleProps[key] },
    })
  }

  return (
    <div className="space-y-8 max-w-sm">
      {/* Theme */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted mb-3">Theme</div>
        <div className="flex gap-2">
          {(['dark', 'light'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={cn(
                'flex-1 h-16 rounded-xl border text-sm font-medium capitalize transition-all',
                settings.theme === t
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-border/[0.15] bg-white/[0.03] text-text-secondary hover:text-text-primary',
              )}
            >
              {t === 'dark' ? '🌙 ' : '☀️ '}{t}
            </button>
          ))}
        </div>
      </div>

      {/* Visible properties */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted mb-3">Note properties</div>
        <div className="space-y-1">
          {Object.keys(PROP_META).map(key => {
            const on = settings.visibleProps[key] !== false
            const meta = PROP_META[key as keyof VisibleProperties]
            return (
              <label
                key={key}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] cursor-pointer transition-colors"
              >
                <div
                  onClick={() => toggleProp(key)}
                  className={cn(
                    'w-8 h-4 rounded-full relative transition-colors cursor-pointer shrink-0',
                    on ? 'bg-accent' : 'bg-neutral-300 dark:bg-white/[0.1]',
                  )}
                >
                  <div className={cn(
                    'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform',
                    on ? 'translate-x-4' : 'translate-x-0.5',
                  )} />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] text-text-secondary">{meta.label}</div>
                  <div className="text-[10px] text-text-muted">{meta.desc}</div>
                </div>
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )
}
