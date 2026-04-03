import type { PipelineFile } from '@/types/pipeline'
import type { AppSettings } from '@/hooks/useSettings'
import { PipelineBreadcrumb } from '@/components/PipelineBreadcrumb'
import { NoteProperties } from '@/components/NoteProperties'
import { NoteBody, getBestText } from '@/components/NoteBody'
import { KaraokeText } from '@/components/KaraokeText'

// ── Helpers ─────────────────────────────────────────────────

interface Token {
  text: string
  start: number
  end: number
}

function formatBreadcrumbDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ── Sub-states ──────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center flex-1">
      <div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 text-text-muted gap-1">
      <span className="text-3xl select-none opacity-20">✦</span>
      <p className="text-[14px] text-text-muted/80">Select a note to get started</p>
      <p className="text-[12px] text-text-muted/50">Your transcriptions will appear here</p>
    </div>
  )
}

// ── Component ───────────────────────────────────────────────

interface NoteDisplayProps {
  file: PipelineFile | null
  loading: boolean
  settings: AppSettings
  isPlaying: boolean
  currentTime: number
  tokens: Token[]
  onTranscribe?: () => void
  onBodySave: (text: string, field: 'copyedit' | 'sanitised' | 'transcript') => void
  onTitleSave: (title: string) => void
  onTagRemove: (tag: string) => void
  onSeek?: (time: number) => void
}

export function NoteDisplay({
  file,
  loading,
  settings,
  isPlaying,
  currentTime,
  tokens,
  onTranscribe,
  onBodySave,
  onTitleSave,
  onTagRemove,
  onSeek,
}: NoteDisplayProps) {
  if (loading && !file) return <Spinner />
  if (!file) return <EmptyState />

  const karaokeActive = isPlaying && tokens.length > 0 && file.steps.transcribe === 'done'
  const bestText = getBestText(file) ?? ''

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0">
      <PipelineBreadcrumb
        steps={file.steps}
        date={formatBreadcrumbDate(file.uploadedAt)}
      />

      <div className="flex-1 overflow-y-auto px-10 py-7">
        <NoteProperties
          file={file}
          visibleProps={settings.visibleProps}
          onTitleSave={onTitleSave}
          onTagRemove={onTagRemove}
        />

        {/* NoteBody stays mounted to preserve edits; hidden during karaoke */}
        <div className={karaokeActive ? 'hidden' : undefined}>
          <NoteBody
            file={file}
            onTranscribe={onTranscribe}
            onBodySave={onBodySave}
          />
        </div>

        {/* Karaoke overlay — only while audio is actively playing */}
        {karaokeActive && (
          <KaraokeText
            tokens={tokens}
            fallback={bestText}
            currentTime={currentTime}
            isActive={true}
            onSeek={onSeek}
          />
        )}
      </div>
    </div>
  )
}
