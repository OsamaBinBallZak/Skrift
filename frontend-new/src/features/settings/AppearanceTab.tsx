import { cn } from '@/lib/utils'
import type { AppSettings, VisibleProperties } from '@/hooks/useSettings'

interface AppearanceTabProps {
  settings: AppSettings
  onUpdate: (patch: Partial<AppSettings>) => Promise<void>
  setTheme: (t: 'dark' | 'light') => void
}

const PROP_LABELS: Record<keyof VisibleProperties, string> = {
  date: 'Date',
  source: 'Source type',
  duration: 'Duration',
  author: 'Author',
  location: 'Location',
  tags: 'Tags',
  summary: 'Summary',
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
          {Object.keys(PROP_LABELS).map(key => {
            const on = settings.visibleProps[key] !== false
            return (
              <label
                key={key}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] cursor-pointer transition-colors"
              >
                <div
                  onClick={() => toggleProp(key)}
                  className={cn(
                    'w-8 h-4 rounded-full relative transition-colors cursor-pointer',
                    on ? 'bg-accent' : 'bg-neutral-300 dark:bg-white/[0.1]',
                  )}
                >
                  <div className={cn(
                    'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform',
                    on ? 'translate-x-4' : 'translate-x-0.5',
                  )} />
                </div>
                <span className="text-[13px] text-text-secondary">{PROP_LABELS[key as keyof VisibleProperties]}</span>
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )
}
