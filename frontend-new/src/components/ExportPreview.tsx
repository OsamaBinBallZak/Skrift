import { useState, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { marked } from 'marked'
import { api } from '@/api'
import type { PipelineFile } from '@/types/pipeline'

interface ExportPreviewProps {
  file: PipelineFile
  vaultPath: string
  onClose: () => void
  onExported: (updatedFile: PipelineFile) => void
}

/**
 * Extract the YAML title from compiled markdown frontmatter.
 */
function extractYamlTitle(md: string): string | null {
  const m = md.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return null
  const titleMatch = m[1].match(/^title:\s*(.+)$/m)
  if (!titleMatch) return null
  return titleMatch[1].trim().replace(/^["']+|["']+$/g, '')
}

/**
 * Inject audio and photo embed lines into the preview markdown,
 * right after the YAML frontmatter closing ---, mimicking what the
 * export service does on actual export.
 */
function injectEmbedLines(md: string, title: string, hasPhoto: boolean, includeAudio: boolean): string {
  const yamlEnd = md.match(/^---\n[\s\S]*?\n---/)
  if (!yamlEnd) return md

  const endIdx = yamlEnd[0].length
  const before = md.slice(0, endIdx)
  const after = md.slice(endIdx).replace(/^\n+/, '')

  const embeds: string[] = []
  if (includeAudio) {
    embeds.push(`![[${title}.m4a]]`)
  }
  if (hasPhoto) {
    embeds.push(`![[${title}_photo.jpg]]`)
  }

  if (embeds.length === 0) return md
  return `${before}\n\n\n${embeds.join('\n')}\n\n${after}`
}

/**
 * Strip YAML frontmatter from markdown for rendered preview.
 */
function stripFrontmatter(md: string): string {
  return md.replace(/^---\n[\s\S]*?\n---\n*/, '')
}

/**
 * Format YAML frontmatter as a readable properties block.
 */
function extractFrontmatter(md: string): Record<string, string> | null {
  const m = md.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return null
  const props: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const match = line.match(/^(\w[\w\s]*?):\s*(.+)$/)
    if (match) props[match[1].trim()] = match[2].trim().replace(/^["']+|["']+$/g, '')
  }
  return props
}

export function ExportPreview({ file, vaultPath, onClose, onExported }: ExportPreviewProps) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const includeAudio = file.include_audio_in_export ?? false
  const hasPhoto = !!file.audioMetadata?.phone_photo

  useEffect(() => {
    api.getCompiledMarkdown(file.id)
      .then(r => {
        let md = r.content
        const title = extractYamlTitle(md)
        if (title && (includeAudio || hasPhoto)) {
          md = injectEmbedLines(md, title, hasPhoto, includeAudio)
        }
        setContent(md)
      })
      .catch(() => setContent('# Error loading preview'))
      .finally(() => setLoading(false))
  }, [file.id, includeAudio, hasPhoto])

  const frontmatter = useMemo(() => extractFrontmatter(content), [content])
  const renderedHtml = useMemo(() => {
    const body = stripFrontmatter(content)
    return marked.parse(body, { async: false }) as string
  }, [content])

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
            <div className="bg-white/[0.03] border border-border/[0.07] rounded-lg p-4 min-h-[300px]">
              {/* Frontmatter properties */}
              {frontmatter && Object.keys(frontmatter).length > 0 && (
                <div className="mb-4 pb-3 border-b border-border/[0.1]">
                  {Object.entries(frontmatter).map(([key, value]) => (
                    <div key={key} className="flex gap-2 text-[11px] leading-relaxed">
                      <span className="text-text-muted font-medium shrink-0">{key}:</span>
                      <span className="text-text-secondary">{value}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Rendered markdown */}
              <div
                className="prose-preview text-[13px] text-text-primary leading-relaxed"
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            </div>
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
