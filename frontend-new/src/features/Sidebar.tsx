import { useState, useEffect, useRef, useCallback } from 'react'
import { Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, API_BASE } from '@/api'
import type { PipelineFile } from '@/types/pipeline'
import { StepDots } from '@/components/StepDots'
import { SystemStatus } from '@/components/SystemStatus'

// ── Types ──────────────────────────────────────────────────

const FILTERS = ['All', 'Needs Work', 'Complete'] as const
type Filter = (typeof FILTERS)[number]

// ── Helpers ────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatDuration(raw: string | undefined): string {
  if (!raw) return ''
  // Backend returns "HH:MM:SS" — strip leading zero hours
  const parts = raw.split(':').map(Number)
  if (parts.length === 3) {
    const [h, m, s] = parts
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    return `${m}:${String(s).padStart(2, '0')}`
  }
  return raw
}

function isComplete(file: PipelineFile): boolean {
  const { transcribe, sanitise, enhance, export: exp } = file.steps
  return (
    transcribe === 'done' &&
    sanitise === 'done' &&
    enhance === 'done' &&
    exp === 'done'
  )
}

// ── Props ──────────────────────────────────────────────────

interface SidebarProps {
  selectedId: string | null
  onSelectFile: (id: string | null) => void
  onSettingsOpen?: () => void
}

// ── Component ──────────────────────────────────────────────

export function Sidebar({ selectedId, onSelectFile, onSettingsOpen }: SidebarProps) {
  const [files, setFiles] = useState<PipelineFile[]>([])
  const [filter, setFilter] = useState<Filter>('All')
  const [multiSelect, setMultiSelect] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [batchError, setBatchError] = useState<string | null>(null)
  const [batchProgress, setBatchProgress] = useState<{
    ids: string[]
    step: 'transcribe' | 'enhance'
    label: string
  } | null>(null)
  const [batchStream, setBatchStream] = useState<string>('')
  const batchStreamRef = useRef<HTMLDivElement>(null)
  const batchEsRef = useRef<EventSource | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Data loading & polling ──────────────────────────────

  const loadFiles = useCallback(async () => {
    try {
      const data = await api.getFiles()
      setFiles(data)
    } catch (err) {
      console.error('Failed to load files:', err)
    }
  }, [])

  useEffect(() => {
    void loadFiles()
    const interval = setInterval(() => void loadFiles(), 5_000)
    return () => clearInterval(interval)
  }, [loadFiles])

  // ── Prune stale checked IDs when files list changes ────
  useEffect(() => {
    if (checked.size === 0) return
    const validIds = new Set(files.map(f => f.id))
    const stale = Array.from(checked).filter(id => !validIds.has(id))
    if (stale.length > 0) setChecked(prev => { const n = new Set(prev); stale.forEach(id => n.delete(id)); return n })
  }, [files])

  // ── Batch progress derived from polled files ───────────
  const batchDone = batchProgress
    ? files.filter(f => {
        if (!batchProgress.ids.includes(f.id)) return false
        if (batchProgress.step === 'enhance') {
          // Count as done when LLM has run all steps — tag approval is a separate user action
          return !!(f.enhanced_title && f.enhanced_copyedit && f.enhanced_summary)
        }
        return f.steps[batchProgress.step] === 'done'
      }).length
    : 0
  const batchTotal = batchProgress?.ids.length ?? 0

  useEffect(() => {
    if (batchProgress && batchDone === batchTotal) {
      const t = setTimeout(() => {
        setBatchProgress(null)
        setBatchStream('')
        batchEsRef.current?.close()
        batchEsRef.current = null
      }, 2000)
      return () => clearTimeout(t)
    }
  }, [batchProgress, batchDone, batchTotal])

  // Auto-scroll stream output
  useEffect(() => {
    if (batchStreamRef.current) {
      batchStreamRef.current.scrollTop = batchStreamRef.current.scrollHeight
    }
  }, [batchStream])

  // ── Filtering & sorting ────────────────────────────────

  const sorted = [...files].sort((a, b) => {
    const da = a.lastModified ?? a.uploadedAt
    const db = b.lastModified ?? b.uploadedAt
    return new Date(db).getTime() - new Date(da).getTime()
  })

  const filtered = sorted.filter(f => {
    if (filter === 'Complete') return isComplete(f)
    if (filter === 'Needs Work') return !isComplete(f)
    return true
  })

  // ── Batch select ───────────────────────────────────────

  function toggleCheck(id: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exitMultiSelect() {
    setMultiSelect(false)
    setChecked(new Set())
  }

  // ── Delete ─────────────────────────────────────────────

  async function handleDelete(id: string) {
    try {
      await api.deleteFile(id)
      setDeleteConfirmId(null)
      // If we deleted the selected file, pick the next one or clear selection
      if (selectedId === id) {
        const remaining = files.filter(f => f.id !== id)
        if (remaining.length > 0) onSelectFile(remaining[0].id)
        else onSelectFile(null)
      }
      await loadFiles()
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  async function handleDeleteChecked() {
    const ids = Array.from(checked)
    for (const id of ids) {
      try {
        await api.deleteFile(id)
      } catch (err) {
        console.error('Delete failed for', id, err)
      }
    }
    exitMultiSelect()
    await loadFiles()
  }

  // ── Upload ─────────────────────────────────────────────

  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return
    const filesToUpload = Array.from(e.target.files)
    // Reset so re-selecting the same file works next time
    e.target.value = ''

    setUploading(true)
    try {
      const result = await api.uploadFiles(filesToUpload)
      await loadFiles()
      if (result.files.length > 0) {
        onSelectFile(result.files[0].id)
      }
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
    }
  }

  async function onUploadClick() {
    if (window.electronAPI?.openUploadDialog) {
      const picked = await window.electronAPI.openUploadDialog()
      if (!picked) return
      const { files: filePaths, folders } = picked
      if (filePaths.length === 0 && folders.length === 0) return
      setUploading(true)
      try {
        // Convert file paths to File-like objects via fetch for non-Electron path
        // In Electron we pass paths directly via folderPaths; for plain files use the
        // hidden input fallback (openUploadDialog covers all cases via IPC).
        // Since Electron gives us paths (not File objects), send all as folder/path uploads.
        // Plain audio/md file paths are sent as single-item "folder" paths that the
        // backend handles as direct file paths when they're not directories.
        // Instead: re-fetch the files as Blobs so we can pass them as File objects.
        const fileObjects: File[] = []
        for (const fp of filePaths) {
          try {
            const res = await fetch(`file://${fp}`)
            const blob = await res.blob()
            const name = fp.split('/').pop() ?? fp
            fileObjects.push(new File([blob], name))
          } catch { /* skip unreadable */ }
        }
        const result = await api.uploadFiles(fileObjects, false, folders)
        await loadFiles()
        if (result.files.length > 0) onSelectFile(result.files[0].id)
      } catch (err) {
        console.error('Upload failed:', err)
      } finally {
        setUploading(false)
      }
    } else {
      fileInputRef.current?.click()
    }
  }

  // ── Drag & drop ────────────────────────────────────────

  const [dragOver, setDragOver] = useState(false)

  function onDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      setDragOver(true)
    }
  }

  function onDragLeave(e: React.DragEvent) {
    // Only clear if leaving the sidebar itself (not a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false)
    }
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)

    const audioFiles: File[] = []
    const folderPaths: string[] = []

    const droppedFiles = Array.from(e.dataTransfer.files)

    if (window.electronAPI?.classifyPaths) {
      // In Electron, use IPC + fs.stat to reliably tell files from folders.
      // webkitGetAsEntry() returns null for directories in Electron's Chromium,
      // so we can't rely on entry.isDirectory.
      const allPaths = droppedFiles
        .map(f => (f as File & { path?: string }).path)
        .filter((p): p is string => !!p)

      if (allPaths.length === 0) return

      const { files: filePaths, folders } = await window.electronAPI.classifyPaths(allPaths)
      folderPaths.push(...folders)

      for (const fp of filePaths) {
        if (/\.(m4a|wav|mp3|md)$/i.test(fp)) {
          const f = droppedFiles.find(df => (df as File & { path?: string }).path === fp)
          if (f) audioFiles.push(f)
        }
      }
    } else {
      // Web fallback: webkitGetAsEntry works in regular browsers
      const items = Array.from(e.dataTransfer.items)
      items.forEach((item) => {
        const entry = item.webkitGetAsEntry?.()
        const file = item.getAsFile()
        if (!file) return
        if (entry?.isDirectory) {
          const electronPath = (file as File & { path?: string }).path
          if (electronPath) folderPaths.push(electronPath)
        } else if (/\.(m4a|wav|mp3|md)$/i.test(file.name)) {
          audioFiles.push(file)
        }
      })
    }

    if (audioFiles.length === 0 && folderPaths.length === 0) return
    setUploading(true)
    try {
      const result = await api.uploadFiles(audioFiles, false, folderPaths)
      await loadFiles()
      if (result.files.length > 0) onSelectFile(result.files[0].id)
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────

  const deleteTarget = files.find(f => f.id === deleteConfirmId)

  return (
    <aside
      className={cn(
        'w-[280px] min-w-[280px] h-full flex flex-col bg-surface border-r border-border/[0.07] relative transition-colors',
        dragOver && 'bg-accent/[0.08]',
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={e => void onDrop(e)}
    >
      {dragOver && (
        <div className="absolute inset-2 z-10 rounded-xl border-2 border-dashed border-accent/50 pointer-events-none flex items-center justify-center">
          <span className="text-[12px] text-accent font-medium">Drop to upload</span>
        </div>
      )}

      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 border-b border-border/[0.07]">

        {/* Logo row */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xl leading-none select-none">✦</span>

          <div className="flex items-center gap-1">
            <SystemStatus />

            <button
              onClick={() => {
                setMultiSelect(v => !v)
                setChecked(new Set())
              }}
              className={cn(
                'px-2 py-[5px] text-xs rounded-md transition-colors',
                multiSelect
                  ? 'bg-accent/15 text-accent'
                  : 'bg-white/[0.05] hover:bg-white/[0.08] text-text-secondary',
              )}
            >
              {multiSelect ? 'Cancel' : 'Select'}
            </button>

            <button
              onClick={onSettingsOpen}
              className="p-[5px] rounded-md bg-white/[0.05] hover:bg-white/[0.08] text-text-secondary transition-colors"
              aria-label="Settings"
            >
              <Settings size={13} />
            </button>

            <button
              onClick={() => void onUploadClick()}
              disabled={uploading}
              className="px-[10px] py-[5px] text-xs font-medium rounded-md bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-60"
            >
              {uploading ? '…' : '+ Upload'}
            </button>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex gap-1">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-[10px] py-1 text-xs rounded-md transition-colors',
                filter === f
                  ? 'bg-accent/15 border border-accent/20 text-accent'
                  : 'border border-transparent text-text-secondary hover:text-text-primary',
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* ── Note list ── */}
      <div className="flex-1 overflow-y-auto p-[6px]">
        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-24 text-text-muted text-xs">
            No notes
          </div>
        )}

        {filtered.map(file => {
          const isSelected = !multiSelect && selectedId === file.id
          const isChecked = checked.has(file.id)
          const displayName = file.enhanced_title ?? file.filename
          const duration = formatDuration(file.audioMetadata?.duration)

          return (
            <div
              key={file.id}
              onClick={() => {
                if (multiSelect) toggleCheck(file.id)
                else onSelectFile(file.id)
              }}
              className={cn(
                'group/note relative px-3 py-[10px] rounded-lg cursor-pointer mb-[2px]',
                'border transition-colors',
                isSelected
                  ? 'bg-accent/15 border-accent/20'
                  : 'border-transparent hover:bg-surface-hover',
              )}
            >
              <div className="flex items-start gap-2">
                {/* Batch checkbox */}
                {multiSelect && (
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleCheck(file.id)}
                    onClick={e => e.stopPropagation()}
                    className="mt-0.5 accent-[rgb(var(--color-accent))]"
                  />
                )}

                <div className="flex-1 min-w-0">
                  {/* Title row */}
                  <div className="flex items-start gap-1 mb-1">
                    <span className="flex-1 text-[13px] font-medium truncate leading-tight">
                      {displayName}
                    </span>

                    {/* Delete button — visible on hover */}
                    {!multiSelect && (
                      <button
                        className="opacity-0 group-hover/note:opacity-100 shrink-0 text-text-muted hover:text-destructive transition-all text-[11px] px-1 py-px -mt-px"
                        onClick={e => {
                          e.stopPropagation()
                          setDeleteConfirmId(file.id)
                        }}
                        aria-label="Delete note"
                        title="Delete note"
                      >
                        🗑
                      </button>
                    )}
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-text-muted leading-none">
                      {formatDate(file.uploadedAt)}
                      {duration && ` · ${duration}`}
                    </span>
                    <StepDots steps={file.steps} />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Batch progress bar ── */}
      {batchProgress && (
        <div className="px-3 py-2 border-t border-border/[0.07] bg-accent/[0.06]">
          <div className="flex justify-between text-xs text-text-secondary mb-1.5">
            <span className="text-accent font-medium">{batchProgress.label}…</span>
            <span>{batchDone} / {batchTotal}</span>
          </div>
          <div className="h-1 rounded-full bg-border/20 overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: batchTotal > 0 ? `${(batchDone / batchTotal) * 100}%` : '0%' }}
            />
          </div>
          {batchStream && (
            <div
              ref={batchStreamRef}
              className="mt-2 max-h-20 overflow-y-auto text-[10px] leading-relaxed text-text-secondary font-mono whitespace-pre-wrap"
            >
              {batchStream}
            </div>
          )}
        </div>
      )}

      {/* ── Batch action bar ── */}
      {multiSelect && checked.size > 0 && (
        <div className="p-3 border-t border-border/[0.07] bg-accent/[0.08]">
          <div className="text-xs text-accent font-medium mb-2">
            {checked.size} selected
          </div>
          {batchError && (
            <div className="text-xs text-destructive mb-2 leading-snug">{batchError}</div>
          )}
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={async () => {
                const ids = Array.from(checked)
                exitMultiSelect()
                setBatchError(null)
                setBatchProgress({ ids, step: 'transcribe', label: 'Transcribing' })
                try {
                  for (const id of ids) {
                    await api.startTranscription(id).catch(() => null)
                  }
                  await loadFiles()
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : String(err)
                  setBatchError(msg)
                  setBatchProgress(null)
                }
              }}
              className="px-[10px] py-[5px] text-xs rounded-md bg-accent text-white font-medium hover:bg-accent/90 transition-colors"
            >
              Transcribe
            </button>
            <button
              onClick={async () => {
                const ids = Array.from(checked)
                exitMultiSelect()
                setBatchError(null)
                // Only enhance files that are transcribed
                const ready = ids.filter(id => {
                  const f = files.find(x => x.id === id)
                  return f?.steps.transcribe === 'done'
                })
                if (ready.length === 0) {
                  setBatchError('None of the selected files have been transcribed yet.')
                  return
                }
                const skipped = ids.length - ready.length
                const label = skipped > 0 ? `Enhancing (${skipped} not ready, skipped)` : 'Enhancing'
                setBatchProgress({ ids: ready, step: 'enhance', label })
                setBatchStream('')
                // Connect to SSE stream for live token output
                batchEsRef.current?.close()
                const es = new EventSource(`${API_BASE}/api/batch/enhance/stream`)
                batchEsRef.current = es
                es.addEventListener('token', (e) => {
                  setBatchStream(prev => prev + e.data)
                })
                es.addEventListener('start', () => setBatchStream(''))
                try {
                  await api.startEnhanceBatch(ready)
                  await loadFiles()
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : String(err)
                  setBatchError(msg.includes('already been enhanced') ? 'All selected files are already fully enhanced.' : msg)
                  setBatchProgress(null)
                  setBatchStream('')
                  es.close()
                  batchEsRef.current = null
                }
              }}
              className="px-[10px] py-[5px] text-xs rounded-md bg-accent text-white font-medium hover:bg-accent/90 transition-colors"
            >
              Enhance
            </button>
            <button
              onClick={() => void handleDeleteChecked()}
              className="px-[10px] py-[5px] text-xs rounded-md bg-destructive text-white font-medium hover:opacity-90 transition-opacity"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* ── Hidden file input ── */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".m4a,.wav,.mp3,.md"
        className="hidden"
        onChange={e => void handleFileInputChange(e)}
      />

      {/* ── Delete confirmation modal ── */}
      {deleteConfirmId && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm"
          onClick={() => setDeleteConfirmId(null)}
        >
          <div
            className="bg-surface border border-border/[0.15] rounded-xl p-6 w-80 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-text-primary mb-2">
              Delete note?
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed mb-5">
              <span className="font-medium text-text-primary">
                {deleteTarget?.enhanced_title ?? deleteTarget?.filename}
              </span>{' '}
              will be permanently deleted.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-1.5 text-xs rounded-lg bg-white/[0.05] hover:bg-white/[0.08] border border-border/[0.15] text-text-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleDelete(deleteConfirmId)}
                className="px-4 py-1.5 text-xs rounded-lg bg-destructive text-white font-medium hover:opacity-90 transition-opacity"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
