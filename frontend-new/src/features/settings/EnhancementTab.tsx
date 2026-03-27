import { useState, useEffect } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, type MlxModel, type EnhancePrompt, DEFAULT_PROMPTS } from '@/api'
import type { AppSettings } from '@/hooks/useSettings'

// ── Model selector ──────────────────────────────────────────

function ModelSelector() {
  const [models, setModels] = useState<MlxModel[]>([])
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ name: string; ok: boolean; elapsed?: number } | null>(null)

  useEffect(() => {
    api.getModels()
      .then(r => setModels(r.models.filter(m => !m.name.startsWith('.'))))
      .catch(() => {/* stay empty */})
      .finally(() => setLoading(false))
  }, [])

  async function selectModel(m: MlxModel) {
    await api.selectModel(m.path)
    setModels(prev => prev.map(x => ({ ...x, selected: x.name === m.name })))
  }

  async function testModel(name: string) {
    setTesting(name)
    setTestResult(null)
    try {
      const r = await api.testModel()
      setTestResult({ name, ok: !!r.sample, elapsed: r.elapsed_seconds })
    } catch {
      setTestResult({ name, ok: false })
    } finally {
      setTesting(null)
      setTimeout(() => setTestResult(null), 4000)
    }
  }

  if (loading) return <div className="text-[12px] text-text-muted">Loading models…</div>
  if (models.length === 0) return <div className="text-[12px] text-text-muted">No MLX models found in dependencies folder.</div>

  return (
    <div className="space-y-1.5">
      {models.map(m => (
        <div
          key={m.name}
          onClick={() => void selectModel(m)}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all',
            m.selected
              ? 'border-accent/30 bg-accent/[0.08]'
              : 'border-border/[0.1] bg-white/[0.02] hover:bg-white/[0.04]',
          )}
        >
          <div className={cn(
            'w-3.5 h-3.5 rounded-full border-2 transition-colors shrink-0',
            m.selected ? 'border-accent bg-accent' : 'border-border/[0.3]',
          )} />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-text-primary truncate">{m.name}</div>
            <div className="text-[11px] text-text-muted">{m.size}{m.quant ? ` · ${m.quant}` : ''}</div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); void testModel(m.name) }}
            disabled={testing === m.name}
            className={cn(
              'text-[11px] px-2 py-1 rounded border transition-colors disabled:opacity-50',
              testResult?.name === m.name && testResult.ok
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : testResult?.name === m.name && !testResult.ok
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : 'bg-white/[0.05] border-border/[0.15] text-text-secondary hover:text-text-primary',
            )}
          >
            {testing === m.name ? 'Testing…'
              : testResult?.name === m.name && testResult.ok ? `${testResult.elapsed?.toFixed(1)}s`
              : testResult?.name === m.name && !testResult.ok ? 'Failed'
              : 'Test'}
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Chat template modal ─────────────────────────────────────

function ChatTemplateModal({ onClose }: { onClose: () => void }) {
  const [template, setTemplate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getChatTemplate()
      .then(r => setTemplate(r.override ?? r.template ?? ''))
      .catch(() => {/* use empty */})
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    try { await api.saveChatTemplate(template); onClose() }
    catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[300]"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-surface border border-border/[0.15] rounded-xl w-[600px] max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border/[0.07] flex items-center justify-between">
          <span className="text-[15px] font-semibold">Chat Template</span>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center h-24 items-center">
              <div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            </div>
          ) : (
            <textarea
              value={template}
              onChange={e => setTemplate(e.target.value)}
              placeholder="Leave blank to use model default…"
              className="w-full min-h-[300px] text-[12px] font-mono bg-white/[0.03] border border-border/[0.07] rounded-lg p-4 text-text-primary outline-none resize-none leading-relaxed"
              spellCheck={false}
            />
          )}
        </div>
        <div className="px-5 py-3.5 border-t border-border/[0.07] flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-1.5 text-xs rounded-lg bg-white/[0.05] border border-border/[0.15] text-text-secondary hover:text-text-primary transition-colors">Cancel</button>
          <button
            onClick={() => void handleSave()}
            disabled={saving || loading}
            className="px-4 py-1.5 text-xs rounded-lg bg-accent text-white font-medium hover:bg-accent/90 transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Prompts editor ──────────────────────────────────────────

function PromptEditor({
  prompt,
  onChange,
  onReset,
}: {
  prompt: EnhancePrompt
  onChange: (p: EnhancePrompt) => void
  onReset: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const original = DEFAULT_PROMPTS.find(p => p.id === prompt.id)
  const modified = original && original.instruction !== prompt.instruction

  return (
    <div className="border border-border/[0.1] rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-2.5 px-3.5 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: prompt.tagColor }} />
        <span className="flex-1 text-[13px] font-medium text-text-primary">{prompt.label}</span>
        <span className="text-[11px] text-text-muted truncate max-w-[160px]">{prompt.desc}</span>
        {modified && (
          <button
            onClick={e => { e.stopPropagation(); onReset() }}
            className="text-[10px] px-2 py-0.5 rounded bg-white/[0.05] border border-border/[0.1] text-text-muted hover:text-text-primary transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {expanded && (
        <div className="px-3.5 pb-3.5 pt-1.5 border-t border-border/[0.07] bg-white/[0.01] space-y-2">
          <label className="text-[10px] text-text-muted uppercase tracking-[0.05em]">Instruction</label>
          <textarea
            value={prompt.instruction}
            onChange={e => onChange({ ...prompt, instruction: e.target.value })}
            rows={4}
            className="w-full text-[12px] font-mono bg-white/[0.04] border border-border/[0.15] rounded p-2.5 text-text-primary outline-none resize-none leading-relaxed focus:border-accent/50 transition-colors"
          />
        </div>
      )}
    </div>
  )
}

// ── Tag generation settings ─────────────────────────────────

function TagSettings() {
  const [maxOld, setMaxOld] = useState(10)
  const [maxNew, setMaxNew] = useState(5)
  const [criteria, setCriteria] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.getConfig()
      .then(({ config }) => {
        const tags = (config['enhancement.tags'] ?? {}) as Record<string, unknown>
        if (typeof tags.max_old === 'number') setMaxOld(tags.max_old)
        if (typeof tags.max_new === 'number') setMaxNew(tags.max_new)
        if (typeof tags.selection_criteria === 'string') setCriteria(tags.selection_criteria)
      })
      .catch(() => {/* keep defaults */})
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      await api.updateConfig('enhancement.tags', {
        max_old: maxOld,
        max_new: maxNew,
        selection_criteria: criteria,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  if (loading) return <div className="text-[12px] text-text-muted">Loading…</div>

  return (
    <div className="space-y-4">
      {/* Counts row */}
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="text-[11px] text-text-muted uppercase tracking-wide block mb-1.5">
            Max from whitelist
          </label>
          <input
            type="number"
            min={1}
            max={30}
            value={maxOld}
            onChange={e => setMaxOld(Math.max(1, Math.min(30, parseInt(e.target.value) || 1)))}
            className="w-full h-8 px-2.5 text-[13px] bg-white/[0.04] border border-border/[0.15] rounded text-text-primary outline-none focus:border-accent/50 transition-colors"
          />
        </div>
        <div className="flex-1">
          <label className="text-[11px] text-text-muted uppercase tracking-wide block mb-1.5">
            Max new suggestions
          </label>
          <input
            type="number"
            min={0}
            max={20}
            value={maxNew}
            onChange={e => setMaxNew(Math.max(0, Math.min(20, parseInt(e.target.value) || 0)))}
            className="w-full h-8 px-2.5 text-[13px] bg-white/[0.04] border border-border/[0.15] rounded text-text-primary outline-none focus:border-accent/50 transition-colors"
          />
        </div>
      </div>

      {/* Criteria */}
      <div>
        <label className="text-[11px] text-text-muted uppercase tracking-wide block mb-1.5">
          Selection criteria <span className="normal-case text-text-muted/60">(optional hint for the LLM)</span>
        </label>
        <textarea
          value={criteria}
          onChange={e => setCriteria(e.target.value)}
          placeholder="e.g. Focus on actionable and project-related tags. Avoid overly generic ones."
          rows={3}
          className="w-full text-[12px] bg-white/[0.04] border border-border/[0.15] rounded p-2.5 text-text-primary placeholder:text-text-muted/50 outline-none resize-none leading-relaxed focus:border-accent/50 transition-colors"
        />
      </div>

      <button
        onClick={() => void handleSave()}
        disabled={saving}
        className="px-4 py-1.5 text-[12px] rounded-lg bg-accent text-white font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
      </button>
    </div>
  )
}

// ── Tag whitelist ───────────────────────────────────────────

function TagWhitelist() {
  const [tags, setTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState<{ ok: boolean; count?: number } | null>(null)
  const [newTag, setNewTag] = useState('')

  useEffect(() => {
    api.getTagWhitelist()
      .then(r => setTags(r.tags))
      .catch(() => {/* empty */})
      .finally(() => setLoading(false))
  }, [])

  async function refreshFromVault() {
    setRefreshing(true)
    setRefreshResult(null)
    try {
      const r = await api.refreshTagWhitelist()
      setRefreshResult({ ok: r.success, count: r.count })
      // Reload tags
      const wl = await api.getTagWhitelist()
      setTags(wl.tags)
    } catch {
      setRefreshResult({ ok: false })
    } finally {
      setRefreshing(false)
      setTimeout(() => setRefreshResult(null), 4000)
    }
  }

  async function save(updated: string[]) {
    await api.updateConfig('enhancement.tag_whitelist', updated)
  }

  function addTag() {
    const v = newTag.trim().toLowerCase().replace(/\s+/g, '-')
    if (!v || tags.includes(v)) return
    const updated = [...tags, v]
    setTags(updated)
    void save(updated)
    setNewTag('')
  }

  function removeTag(t: string) {
    const updated = tags.filter(x => x !== t)
    setTags(updated)
    void save(updated)
  }

  if (loading) return <div className="text-[12px] text-text-muted">Loading…</div>

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map(t => (
          <span key={t} className="inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full text-[11px] bg-white/[0.05] border border-border/[0.12] text-text-secondary">
            #{t}
            <button onClick={() => removeTag(t)} className="opacity-50 hover:opacity-100 text-[9px] leading-none transition-opacity">×</button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-[12px] text-text-muted">No tags yet.</span>}
      </div>
      <div className="flex gap-2">
        <input
          value={newTag}
          onChange={e => setNewTag(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addTag() }}
          placeholder="Add tag…"
          className="flex-1 h-7 px-2.5 text-[12px] bg-white/[0.04] border border-border/[0.15] rounded text-text-primary outline-none focus:border-accent/50 transition-colors"
        />
        <button
          onClick={addTag}
          disabled={!newTag.trim()}
          className="h-7 px-2.5 rounded bg-white/[0.05] border border-border/[0.15] text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40"
        >
          <Plus size={12} />
        </button>
      </div>
      <button
        onClick={() => void refreshFromVault()}
        disabled={refreshing}
        className={cn(
          'text-[11px] px-3 py-1.5 rounded-lg border transition-colors',
          refreshResult?.ok
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : refreshResult && !refreshResult.ok
              ? 'bg-red-500/10 border-red-500/30 text-red-400'
              : 'bg-white/[0.05] border-border/[0.15] text-text-secondary hover:text-text-primary',
        )}
      >
        {refreshing ? 'Scanning vault…'
          : refreshResult?.ok ? `Refreshed (${refreshResult.count} tags)`
          : refreshResult && !refreshResult.ok ? 'Failed — check vault path'
          : 'Refresh from Obsidian vault'}
      </button>
    </div>
  )
}

// ── Main tab ────────────────────────────────────────────────

interface EnhancementTabProps {
  settings: AppSettings
  onUpdate: (patch: Partial<AppSettings>) => Promise<void>
}

export function EnhancementTab({ settings, onUpdate }: EnhancementTabProps) {
  const [templateOpen, setTemplateOpen] = useState(false)

  function updatePrompt(i: number, p: EnhancePrompt) {
    const updated = settings.enhancePrompts.map((x, j) => j === i ? p : x)
    void onUpdate({ enhancePrompts: updated })
  }

  function resetPrompt(i: number) {
    const original = DEFAULT_PROMPTS[i]
    if (!original) return
    updatePrompt(i, { ...settings.enhancePrompts[i], instruction: original.instruction })
  }

  return (
    <div className="space-y-8 max-w-lg">
      {/* Model */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted mb-3">MLX Model</div>
        <ModelSelector />
        <button
          onClick={() => setTemplateOpen(true)}
          className="mt-2 text-[12px] text-accent/80 hover:text-accent transition-colors"
        >
          Edit chat template →
        </button>
      </div>

      {/* Prompts */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted mb-3">Enhancement prompts</div>
        <div className="space-y-2">
          {settings.enhancePrompts.map((p, i) => (
            <PromptEditor
              key={p.id}
              prompt={p}
              onChange={updated => updatePrompt(i, updated)}
              onReset={() => resetPrompt(i)}
            />
          ))}
        </div>
      </div>

      {/* Tag generation */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted mb-1">Tag generation</div>
        <p className="text-[11px] text-text-muted mb-3">Controls how the LLM selects and suggests tags.</p>
        <TagSettings />
      </div>

      {/* Tag whitelist */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted">Tag whitelist</div>
        </div>
        <TagWhitelist />
      </div>

      {templateOpen && <ChatTemplateModal onClose={() => setTemplateOpen(false)} />}
    </div>
  )
}
