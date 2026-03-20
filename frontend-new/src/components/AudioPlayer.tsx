import { useRef, useEffect, useMemo, useCallback } from 'react'
import { Play, Pause, ChevronUp, ChevronDown } from 'lucide-react'

interface AudioPlayerProps {
  src: string
  isPlaying: boolean
  currentTime: number
  collapsed: boolean
  seekTo?: { time: number; seq: number } | null
  onPlayPause: (v: boolean) => void
  onTimeUpdate: (t: number) => void
  onCollapse: (v: boolean) => void
}

const BAR_COUNT = 80

export function AudioPlayer({ src, isPlaying, currentTime, collapsed, seekTo, onPlayPause, onTimeUpdate, onCollapse }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const rafRef = useRef<number>(0)
  const durationRef = useRef<number>(0)
  const lastSeekSeq = useRef<number | undefined>()

  // Stable random bar heights per mount
  const bars = useMemo(
    () => Array.from({ length: BAR_COUNT }, () => 0.15 + Math.random() * 0.85),
    []
  )

  // Sync audio element with isPlaying prop
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    if (isPlaying) { el.play().catch(() => onPlayPause(false)) }
    else { el.pause() }
  }, [isPlaying, onPlayPause])

  // rAF loop for smooth time updates while playing
  const tick = useCallback(() => {
    if (audioRef.current) onTimeUpdate(audioRef.current.currentTime)
    rafRef.current = requestAnimationFrame(tick)
  }, [onTimeUpdate])

  useEffect(() => {
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(tick)
    } else {
      cancelAnimationFrame(rafRef.current)
    }
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying, tick])

  // Seek when requested from outside (e.g. karaoke word click)
  useEffect(() => {
    if (!seekTo || seekTo.seq === lastSeekSeq.current) return
    lastSeekSeq.current = seekTo.seq
    if (audioRef.current) {
      audioRef.current.currentTime = seekTo.time
      onTimeUpdate(seekTo.time)
    }
  }, [seekTo, onTimeUpdate])

  // Handle audio end
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onEnded = () => { onPlayPause(false); onTimeUpdate(0) }
    const onMeta = () => { durationRef.current = el.duration }
    el.addEventListener('ended', onEnded)
    el.addEventListener('loadedmetadata', onMeta)
    return () => { el.removeEventListener('ended', onEnded); el.removeEventListener('loadedmetadata', onMeta) }
  }, [onPlayPause, onTimeUpdate])

  function fmt(s: number): string {
    const m = Math.floor(s / 60)
    const sec = String(Math.floor(s % 60)).padStart(2, '0')
    return `${m}:${sec}`
  }

  function handleWaveformClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    const t = pct * (durationRef.current || 1)
    if (audioRef.current) audioRef.current.currentTime = t
    onTimeUpdate(t)
  }

  const duration = durationRef.current || 0
  const pct = duration > 0 ? currentTime / duration : 0

  return (
    <div>
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Controls row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPlayPause(!isPlaying)}
            className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-white shrink-0 hover:bg-accent/90 transition-colors"
          >
            {isPlaying ? <Pause size={10} fill="white" /> : <Play size={10} fill="white" />}
          </button>
          <span className="text-[11px] text-text-muted font-mono">
            {fmt(currentTime)}{duration > 0 ? ` / ${fmt(duration)}` : ''}
          </span>
        </div>
        <button onClick={() => onCollapse(!collapsed)} className="text-text-muted hover:text-text-secondary transition-colors">
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {/* Waveform */}
      {!collapsed && (
        <div
          className="h-8 flex items-end gap-px cursor-pointer"
          onClick={handleWaveformClick}
        >
          {bars.map((h, i) => {
            const barPct = i / BAR_COUNT
            const filled = barPct < pct
            return (
              <div
                key={i}
                className="flex-1 rounded-sm transition-colors"
                style={{
                  height: `${h * 100}%`,
                  background: filled ? 'rgb(var(--color-accent))' : 'rgb(var(--color-border) / 0.12)',
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
