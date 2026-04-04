import { useState } from 'react'
import type { PipelineFile } from '@/types/pipeline'
import type { AppSettings } from '@/hooks/useSettings'
import { PipelineBreadcrumb } from '@/components/PipelineBreadcrumb'
import { NoteProperties } from '@/components/NoteProperties'
import { NoteBody, getBestText } from '@/components/NoteBody'
import { KaraokeText } from '@/components/KaraokeText'
import { AudioPlayer } from '@/components/AudioPlayer'
import { api } from '@/api'

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
      <span className="text-3xl select-none opacity-20">&#10022;</span>
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
  seekTo?: { time: number; seq: number } | null
  onPlayPause: (v: boolean) => void
  onTimeUpdate: (t: number) => void
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
  seekTo,
  onPlayPause,
  onTimeUpdate,
  onTranscribe,
  onBodySave,
  onTitleSave,
  onTagRemove,
  onSeek,
}: NoteDisplayProps) {
  const [audioCollapsed, setAudioCollapsed] = useState(false)

  if (loading && !file) return <Spinner />
  if (!file) return <EmptyState />

  const karaokeActive = isPlaying && tokens.length > 0 && file.steps.transcribe === 'done'
  const bestText = getBestText(file) ?? ''
  const isAppleNote = file.source_type === 'note'
  const transcribeDone = file.steps.transcribe === 'done'
  const showAudioPlayer = transcribeDone && !isAppleNote

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0">
      <PipelineBreadcrumb
        steps={file.steps}
        date={formatBreadcrumbDate(file.uploadedAt)}
      />

      <div className="flex-1 overflow-y-auto relative">
        {/* Sticky audio player at top of scroll area */}
        {showAudioPlayer && (
          <div className="sticky top-0 z-10 bg-bg px-10 pt-4 pb-3">
            <AudioPlayer
              src={api.getAudioUrl(file.id, 'processed')}
              isPlaying={isPlaying}
              currentTime={currentTime}
              collapsed={audioCollapsed}
              seekTo={seekTo}
              onPlayPause={onPlayPause}
              onTimeUpdate={onTimeUpdate}
              onCollapse={setAudioCollapsed}
            />
          </div>
        )}

        <div className="px-10 py-7">
          <NoteProperties
            file={file}
            author={file.enhanced_title ? (settings.author || undefined) : undefined}
            onTitleSave={onTitleSave}
            onTagRemove={onTagRemove}
          />

          {/* Photo from mobile capture */}
          {file.audioMetadata?.phone_photo && (
            <div className="mb-5">
              <img
                src={`file://${file.audioMetadata.phone_photo}`}
                alt="Capture photo"
                className="w-full rounded-lg object-cover max-h-64"
              />
            </div>
          )}

          {/* Summary */}
          {file.enhanced_summary && (
            <div className="px-3.5 py-2.5 rounded-lg bg-white/[0.02] border border-border/[0.07] text-[13px] leading-relaxed text-text-secondary italic mb-5">
              {file.enhanced_summary}
            </div>
          )}

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
    </div>
  )
}
