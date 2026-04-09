import { useMemo } from 'react'
import { marked } from 'marked'

interface ExportPreviewProps {
  content: string
}

function stripFrontmatter(md: string): string {
  return md.replace(/^---\n[\s\S]*?\n---\n*/, '')
}

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

/**
 * Inline export preview — just the rendered markdown content, no chrome.
 */
export function ExportPreview({ content }: ExportPreviewProps) {
  const frontmatter = useMemo(() => extractFrontmatter(content), [content])
  const renderedHtml = useMemo(() => {
    const body = stripFrontmatter(content)
    return marked.parse(body, { async: false }) as string
  }, [content])

  return (
    <>
      {/* Frontmatter properties */}
      {frontmatter && Object.keys(frontmatter).length > 0 && (
        <div className="mb-5 pb-4 border-b border-border/[0.1]">
          {Object.entries(frontmatter).map(([key, value]) => (
            <div key={key} className="flex gap-2 text-[12px] leading-relaxed">
              <span className="text-text-muted font-medium shrink-0">{key}:</span>
              <span className="text-text-secondary">{value}</span>
            </div>
          ))}
        </div>
      )}
      {/* Rendered markdown body */}
      <div
        className="prose-preview text-[14px] text-text-primary leading-relaxed"
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </>
  )
}

/**
 * Helpers re-exported for use in the export flow.
 */
export function extractYamlTitle(md: string): string | null {
  const m = md.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return null
  const titleMatch = m[1].match(/^title:\s*(.+)$/m)
  if (!titleMatch) return null
  return titleMatch[1].trim().replace(/^["']+|["']+$/g, '')
}

export function injectEmbedLines(md: string, title: string, hasPhoto: boolean, includeAudio: boolean): string {
  const yamlEnd = md.match(/^---\n[\s\S]*?\n---/)
  if (!yamlEnd) return md
  const endIdx = yamlEnd[0].length
  const before = md.slice(0, endIdx)
  const after = md.slice(endIdx).replace(/^\n+/, '')
  const embeds: string[] = []
  if (includeAudio) embeds.push(`![[${title}.m4a]]`)
  if (hasPhoto) embeds.push(`![[${title}_photo.jpg]]`)
  if (embeds.length === 0) return md
  return `${before}\n\n\n${embeds.join('\n')}\n\n${after}`
}
