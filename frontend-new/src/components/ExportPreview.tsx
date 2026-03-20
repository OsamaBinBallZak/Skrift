import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { api } from '@/api'
import type { PipelineFile } from '@/types/pipeline'

interface ExportPreviewProps {
  file: PipelineFile
  vaultPath: string
  onClose: () => void
  onExported: (updatedFile: PipelineFile) => void
}

export function ExportPreview({ file, vaultPath, onClose, onExported }: ExportPreviewProps) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    api.getCompiledMarkdown(file.id)
      .then(r => setContent(r.content))
      .catch(() => setContent('# Error loading preview'))
      .finally(() => setLoading(false))
  }, [file.id])

  function handleContentChange(v: string) {
    setContent(v)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void api.saveCompiledEdits(file.id, v), 1000)
  }

  async function handleExport() {
    setExporting(true)
    try {
      await api.exportToVault(file.id, content, {
        export_to_vault: true,
        vault_path: vaultPath || undefined,
        include_audio: file.include_audio_in_export ?? false,
      })
      const updated = await api.getFile(file.id)
      onExported(updated)
      onClose()
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  const filename = (file.enhanced_title ?? file.filename).replace(/ /g, '-').toLowerCase() + '.md'

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[150] backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-surface border border-border/[0.15] rounded-xl w-[600px] max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border/[0.07] flex items-center justify-between">
          <span className="text-[15px] font-semibold">Export Preview</span>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors"><X size={16} /></button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto">
          <div className="text-[11px] text-text-muted mb-2 font-mono">{filename}</div>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            </div>
          ) : (
            <textarea
              value={content}
              onChange={e => handleContentChange(e.target.value)}
              className="w-full bg-white/[0.03] border border-border/[0.07] rounded-lg p-4 text-[12px] font-mono text-text-primary leading-relaxed outline-none resize-none min-h-[300px]"
              spellCheck={false}
            />
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-border/[0.07] flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-1.5 text-xs rounded-lg bg-white/[0.05] border border-border/[0.15] text-text-secondary hover:text-text-primary transition-colors">Close</button>
          <button
            onClick={() => void handleExport()}
            disabled={exporting || loading}
            className="px-4 py-1.5 text-xs rounded-lg bg-accent text-white font-medium hover:bg-accent/90 transition-colors disabled:opacity-60"
          >
            {exporting ? 'Exporting…' : 'Export to Obsidian'}
          </button>
        </div>
      </div>
    </div>
  )
}
