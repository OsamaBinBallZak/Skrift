import { useEffect, useRef, useCallback, useState } from 'react'
import type { PipelineFile } from '@/types/pipeline'
import { AddNameModal } from './AddNameModal'

function formatDuration(raw: string | undefined): string {
  if (!raw) return ''
  const parts = raw.split(':').map(Number)
  if (parts.length === 3) {
    const [h, m, s] = parts
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
  }
  return raw
}

export function getBestText(file: PipelineFile): string | null {
  return file.enhanced_copyedit ?? file.sanitised ?? file.transcript
}

function TranscribePlaceholder({ file, onTranscribe }: { file: PipelineFile; onTranscribe?: () => void }) {
  const isProcessing = file.steps.transcribe === 'processing'

  return (
    <div className="flex flex-col items-center py-16 text-text-muted">
      <div className="w-16 h-16 rounded-2xl bg-white/[0.05] flex items-center justify-center text-3xl mb-4 select-none">🎙</div>
      <p className="text-[15px] mb-1">{file.filename}</p>
      {file.audioMetadata?.duration && <p className="text-[12px] mb-5">{formatDuration(file.audioMetadata.duration)}</p>}
      <button
        onClick={onTranscribe}
        disabled={!onTranscribe || isProcessing}
        className="px-6 py-2.5 rounded-lg bg-accent text-white text-[14px] font-medium hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {isProcessing && (
          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
        )}
        {isProcessing ? 'Transcribing…' : 'Transcribe this memo'}
      </button>
    </div>
  )
}

interface NoteBodyProps {
  file: PipelineFile
  onTranscribe?: () => void
  onBodySave: (text: string, field: 'copyedit' | 'sanitised' | 'transcript') => void
}

export function NoteBody({ file, onTranscribe, onBodySave }: NoteBodyProps) {
  const isAppleNote = file.source_type === 'note'
  const transcribed = file.steps.transcribe === 'done'
  const divRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastFileId = useRef<string | null>(null)

  // Selection toolbar state
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null)
  const [selectedWord, setSelectedWord] = useState<string | null>(null)
  const [showAddName, setShowAddName] = useState(false)
  // modalWord is saved at the moment "Add name" is clicked and stays stable
  // while the modal is open — it's never touched by the mousedown listener
  const [modalWord, setModalWord] = useState<string | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)

  const bestText = getBestText(file)

  // Sync content into the div when:
  // - the selected file changes (always reset), or
  // - the backend text changes while the div isn't focused (e.g. after sanitise)
  useEffect(() => {
    if (!divRef.current) return
    const switching = lastFileId.current !== file.id
    const focused = document.activeElement === divRef.current
    if (switching || !focused) {
      divRef.current.innerText = bestText ?? ''
      lastFileId.current = file.id
    }
  }, [file.id, bestText])

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const text = divRef.current?.innerText ?? ''
      const field = file.enhanced_copyedit != null ? 'copyedit' : file.sanitised != null ? 'sanitised' : 'transcript'
      onBodySave(text, field)
    }, 1500)
  }, [file.enhanced_copyedit, file.sanitised, onBodySave])

  // Show floating toolbar when text is selected within this div
  function handleMouseUp() {
    // Small delay so the selection is settled
    setTimeout(() => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        setToolbarPos(null)
        setSelectedWord(null)
        return
      }
      const text = sel.toString().trim()
      if (!text || !divRef.current) {
        setToolbarPos(null)
        setSelectedWord(null)
        return
      }
      // Only show if selection is within our div
      const range = sel.getRangeAt(0)
      if (!divRef.current.contains(range.commonAncestorContainer)) {
        setToolbarPos(null)
        setSelectedWord(null)
        return
      }
      const rect = range.getBoundingClientRect()
      // Position toolbar centred above the selection
      setToolbarPos({ x: rect.left + rect.width / 2, y: rect.top - 8 })
      setSelectedWord(text)
    }, 10)
  }

  // Hide toolbar when clicking outside it
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (toolbarRef.current && toolbarRef.current.contains(e.target as Node)) return
      setToolbarPos(null)
      setSelectedWord(null)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  if (!transcribed && !isAppleNote) {
    return <TranscribePlaceholder file={file} onTranscribe={onTranscribe} />
  }
  if (!bestText) {
    return <div className="flex items-center justify-center py-16 text-text-muted text-sm">No text available</div>
  }

  return (
    <>
      <div
        ref={divRef}
        contentEditable
        suppressContentEditableWarning
        onInput={scheduleSave}
        onMouseUp={handleMouseUp}
        className="text-[15px] leading-[1.75] text-text-primary outline-none min-h-[200px] cursor-text"
        style={{ whiteSpace: 'pre-wrap' }}
      />

      {/* Floating selection toolbar */}
      {toolbarPos && selectedWord && !showAddName && (
        <div
          ref={toolbarRef}
          style={{
            position: 'fixed',
            left: toolbarPos.x,
            top: toolbarPos.y,
            transform: 'translate(-50%, -100%)',
            zIndex: 200,
          }}
        >
          <button
            onMouseDown={e => {
              // Prevent mousedown from collapsing selection before we read it
              e.preventDefault()
              setModalWord(selectedWord) // lock in the word before toolbar clears
              setShowAddName(true)
              setToolbarPos(null)
            }}
            className="px-3 py-1.5 rounded-lg bg-surface border border-border/[0.3] text-[12px] font-medium text-text-primary shadow-lg hover:bg-white/[0.08] transition-colors whitespace-nowrap flex items-center gap-1.5"
          >
            <span className="text-accent">+</span> Add name
          </button>
        </div>
      )}

      {/* Add Name modal — uses modalWord (locked at open time), not selectedWord */}
      {showAddName && modalWord && (
        <AddNameModal
          selectedText={modalWord}
          onClose={() => {
            setShowAddName(false)
            setModalWord(null)
            setSelectedWord(null)
          }}
        />
      )}
    </>
  )
}
