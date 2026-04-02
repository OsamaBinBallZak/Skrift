import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '@/api'
import { useSettings } from '@/hooks/useSettings'
import type { PipelineFile } from '@/types/pipeline'
import { Sidebar } from './features/Sidebar'
import { NoteDisplay } from './features/NoteDisplay'
import { Inspector } from './features/Inspector'
import { Settings } from './features/Settings'

interface Token {
  text: string
  start: number
  end: number
}

export default function App() {
  // ── Selection + file state ─────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [file, setFile] = useState<PipelineFile | null>(null)
  const [fileLoading, setFileLoading] = useState(false)

  // ── Audio / karaoke state (lifted so NoteDisplay can karaoke-sync) ──
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [tokens, setTokens] = useState<Token[]>([])
  const [seekTo, setSeekTo] = useState<{ time: number; seq: number } | null>(null)
  const seekSeqRef = useRef(0)

  const handleSeek = useCallback((time: number) => {
    seekSeqRef.current += 1
    setSeekTo({ time, seq: seekSeqRef.current })
    setIsPlaying(true) // start playback on word click
  }, [])

  // ── Settings ───────────────────────────────────────────────
  const { settings, update: updateSettings, setTheme, defaultPrompts } = useSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [setupMode, setSetupMode] = useState(false)

  // Cmd+, from Electron menu also opens settings
  useEffect(() => {
    const cleanup = window.electronAPI?.onMenuPreferences(() => setSettingsOpen(true))
    return cleanup
  }, [])

  // First-launch detection: check if backend is reachable, parakeet available, AND deps configured
  useEffect(() => {
    let cancelled = false
    async function checkSetup() {
      try {
        const h = await api.getSystemHealth()
        if (cancelled) return
        const parakeetOk = h?.transcription_modules?.parakeet?.available === true
        if (!parakeetOk) {
          setSetupMode(true)
          setSettingsOpen(true)
          return
        }
        // Also check if dependencies folder is actually configured
        const { config } = await api.getConfig()
        const depsFolder = config['dependencies_folder'] as string | undefined
        if (!depsFolder) {
          setSetupMode(true)
          setSettingsOpen(true)
        }
      } catch {
        // Backend not reachable — likely first launch or deps missing
        if (!cancelled) {
          setSetupMode(true)
          setSettingsOpen(true)
        }
      }
    }
    void checkSetup()
    return () => { cancelled = true }
  }, [])

  // ── Load file on selection change + poll while processing ──
  useEffect(() => {
    if (!selectedId) {
      setFile(null)
      setTokens([])
      setIsPlaying(false)
      setCurrentTime(0)
      return
    }

    let cancelled = false
    setFileLoading(true)
    setTokens([])
    setIsPlaying(false)
    setCurrentTime(0)
    setSeekTo(null)

    api.getFile(selectedId)
      .then(data => { if (!cancelled) setFile(data) })
      .catch(() => { if (!cancelled) setFile(null) })
      .finally(() => { if (!cancelled) setFileLoading(false) })

    // Poll for updates every 3s so the UI stays in sync during
    // transcription, enhancement, sanitisation, etc. Stops when
    // no steps are processing and the file has settled.
    const poll = setInterval(() => {
      if (cancelled) return
      api.getFile(selectedId)
        .then(data => { if (!cancelled) setFile(data) })
        .catch(() => { /* ignore poll errors */ })
    }, 3_000)

    return () => { cancelled = true; clearInterval(poll) }
  }, [selectedId])

  // ── Load word timings when transcription is done ───────────
  useEffect(() => {
    if (!file || file.steps.transcribe !== 'done' || file.source_type === 'note') return
    let cancelled = false
    api.getTimeline(file.id)
      .then(r => { if (!cancelled) setTokens(r.tokens) })
      .catch(() => { /* no timings available */ })
    return () => { cancelled = true }
  }, [file?.id, file?.steps.transcribe])

  // ── File update callback ────────────────────────────────────
  const handleFileUpdate = useCallback((updated: PipelineFile) => {
    setFile(updated)
  }, [])

  // ── Body save ──────────────────────────────────────────────
  const handleBodySave = useCallback(async (text: string, field: 'copyedit' | 'sanitised' | 'transcript') => {
    if (!file) return
    try {
      if (field === 'copyedit') await api.setCopyedit(file.id, text)
      else if (field === 'sanitised') await api.updateSanitised(file.id, text)
      else await api.updateTranscript(file.id, text)
    } catch (err) { console.error('Body save failed:', err) }
  }, [file])

  // ── Title save ─────────────────────────────────────────────
  const handleTitleSave = useCallback(async (title: string) => {
    if (!file) return
    try {
      const updated = await api.setTitle(file.id, title)
      setFile(updated)
    } catch (err) { console.error('Title save failed:', err) }
  }, [file])

  // ── Tag remove ─────────────────────────────────────────────
  const handleTagRemove = useCallback(async (tag: string) => {
    if (!file) return
    const updated_tags = (file.enhanced_tags ?? []).filter(t => t !== tag)
    try {
      const updated = await api.setTags(file.id, updated_tags)
      setFile(updated)
    } catch (err) { console.error('Tag remove failed:', err) }
  }, [file])

  // ── Transcribe trigger (from NoteBody placeholder) ─────────
  const handleTranscribe = useCallback(async () => {
    if (!file) return
    try {
      await api.startTranscription(file.id)
      const updated = await api.getFile(file.id)
      setFile(updated)
    } catch (err) { console.error('Transcription start failed:', err) }
  }, [file])

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-text-primary font-sans">
      <Sidebar
        selectedId={selectedId}
        onSelectFile={setSelectedId}
        onSettingsOpen={() => setSettingsOpen(true)}
      />

      <NoteDisplay
        file={file}
        loading={fileLoading}
        settings={settings}
        isPlaying={isPlaying}
        currentTime={currentTime}
        tokens={tokens}
        onTranscribe={file ? handleTranscribe : undefined}
        onBodySave={handleBodySave}
        onTitleSave={handleTitleSave}
        onTagRemove={handleTagRemove}
        onSeek={handleSeek}
      />

      {file && (
        <Inspector
          file={file}
          settings={settings}
          isPlaying={isPlaying}
          currentTime={currentTime}
          seekTo={seekTo}
          onPlayPause={setIsPlaying}
          onTimeUpdate={setCurrentTime}
          onFileUpdate={handleFileUpdate}
        />
      )}

      {settingsOpen && (
        <Settings
          settings={settings}
          onUpdate={updateSettings}
          setTheme={setTheme}
          defaultPrompts={defaultPrompts}
          onClose={() => { setSettingsOpen(false); setSetupMode(false) }}
          initialTab={setupMode ? 'paths' : undefined}
          setupMode={setupMode}
        />
      )}
    </div>
  )
}
