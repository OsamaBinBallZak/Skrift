import { useState, useEffect, useCallback } from 'react'
import { api, type DepsValidation } from '@/api'
import { cn } from '@/lib/utils'
import { Check, X, FolderOpen, Loader2, ChevronRight } from 'lucide-react'

interface SetupWizardProps {
  onComplete: () => void
}

type Step = 'deps' | 'ready'

function CheckItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-[13px]">
      {ok
        ? <Check size={14} className="text-green-400 shrink-0" />
        : <X size={14} className="text-red-400/60 shrink-0" />}
      <span className={ok ? 'text-text-primary' : 'text-text-muted'}>{label}</span>
    </div>
  )
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<Step>('deps')
  const [detecting, setDetecting] = useState(true)
  const [depsPath, setDepsPath] = useState('')
  const [validation, setValidation] = useState<DepsValidation | null>(null)
  const [validating, setValidating] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  // Vault path (optional step 2)
  const [vaultPath, setVaultPath] = useState('')

  // Auto-detect on mount
  useEffect(() => {
    let cancelled = false
    api.detectDeps()
      .then(result => {
        if (cancelled) return
        if (result.found && result.path) {
          setDepsPath(result.path)
          setValidation(result.components)
        }
      })
      .catch(() => { /* backend may not be ready yet */ })
      .finally(() => { if (!cancelled) setDetecting(false) })
    return () => { cancelled = true }
  }, [])

  const browseFolder = useCallback(async () => {
    const p = await window.electronAPI?.openFolderDialog()
    if (!p) return
    setDepsPath(p)
    setError('')
    setValidating(true)
    try {
      const result = await api.validateDeps(p)
      setValidation(result)
    } catch {
      setValidation(null)
      setError('Could not validate folder')
    } finally {
      setValidating(false)
    }
  }, [])

  const applyAndContinue = useCallback(async () => {
    if (!depsPath) return
    setApplying(true)
    setError('')
    try {
      const result = await api.applyDeps(depsPath)
      setValidation(result.components)
      setStep('ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply')
    } finally {
      setApplying(false)
    }
  }, [depsPath])

  const finish = useCallback(async () => {
    // Save vault path if provided
    if (vaultPath) {
      try {
        await api.updateConfig('export.note_folder', vaultPath)
        await api.updateConfig('enhancement.obsidian.vault_path', vaultPath)
      } catch { /* non-critical */ }
    }
    onComplete()
  }, [vaultPath, onComplete])

  const canContinue = validation?.valid === true

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[300] animate-fade-in">
      <div className="bg-surface border border-border/[0.12] rounded-2xl w-[520px] shadow-2xl overflow-hidden animate-modal-in">
        {/* Header */}
        <div className="px-8 pt-8 pb-2">
          <div className="text-[22px] font-semibold text-text-primary">Welcome to Skrift</div>
          <div className="text-[13px] text-text-secondary mt-1">
            Let's get everything set up. This only takes a moment.
          </div>
        </div>

        {/* Step indicator */}
        <div className="px-8 py-3 flex items-center gap-2 text-[11px] text-text-muted">
          <span className={cn('px-2 py-0.5 rounded-full', step === 'deps' ? 'bg-accent/15 text-accent font-medium' : 'bg-white/[0.06] text-text-muted')}>
            1. Dependencies
          </span>
          <ChevronRight size={12} className="text-text-muted/40" />
          <span className={cn('px-2 py-0.5 rounded-full', step === 'ready' ? 'bg-accent/15 text-accent font-medium' : 'bg-white/[0.06] text-text-muted')}>
            2. Ready
          </span>
        </div>

        <div className="px-8 pb-8">
          {/* ── Step 1: Dependencies ── */}
          {step === 'deps' && (
            <div className="space-y-5">
              <div className="text-[13px] text-text-secondary">
                Skrift needs a folder with models and a Python environment.
                {detecting ? '' : depsPath ? ' Found one:' : ' Browse to select it.'}
              </div>

              {detecting ? (
                <div className="flex items-center gap-2 text-[13px] text-text-muted py-4">
                  <Loader2 size={14} className="animate-spin" />
                  Scanning for dependencies...
                </div>
              ) : (
                <>
                  {/* Path input + browse */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={depsPath}
                      onChange={e => {
                        setDepsPath(e.target.value)
                        setValidation(null)
                      }}
                      placeholder="~/Skrift_dependencies"
                      className="flex-1 h-9 px-3 text-[13px] bg-white/[0.04] border border-border/[0.15] rounded-lg text-text-primary placeholder:text-text-muted/40 outline-none focus:border-accent/50 transition-colors font-mono"
                    />
                    <button
                      onClick={browseFolder}
                      className="h-9 px-3 flex items-center gap-1.5 text-[12px] font-medium bg-white/[0.06] hover:bg-white/[0.1] border border-border/[0.15] rounded-lg text-text-secondary transition-colors"
                    >
                      <FolderOpen size={14} />
                      Browse
                    </button>
                  </div>

                  {/* Validation results */}
                  {validating && (
                    <div className="flex items-center gap-2 text-[13px] text-text-muted">
                      <Loader2 size={14} className="animate-spin" />
                      Checking folder...
                    </div>
                  )}

                  {validation && !validating && (
                    <div className="space-y-2 bg-white/[0.02] rounded-lg p-3 border border-border/[0.08]">
                      <CheckItem ok={validation.has_venv} label="Python environment (mlx-env/)" />
                      <CheckItem
                        ok={validation.has_mlx_models}
                        label={validation.mlx_model_names.length
                          ? `MLX model: ${validation.mlx_model_names.join(', ')}`
                          : 'MLX models (models/mlx/)'}
                      />
                      <CheckItem ok={validation.has_parakeet} label="Parakeet transcription model" />
                      {validation.issues.length > 0 && (
                        <div className="mt-2 text-[11px] text-amber-400/80">
                          {validation.issues.map((issue, i) => (
                            <div key={i}>⚠ {issue}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {error && (
                    <div className="text-[12px] text-red-400">{error}</div>
                  )}

                  {/* Continue button */}
                  <button
                    onClick={applyAndContinue}
                    disabled={!canContinue || applying}
                    className={cn(
                      'w-full h-10 rounded-lg text-[13px] font-medium transition-all',
                      canContinue
                        ? 'bg-accent hover:bg-accent/90 text-white cursor-pointer'
                        : 'bg-white/[0.06] text-text-muted/50 cursor-not-allowed',
                    )}
                  >
                    {applying ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 size={14} className="animate-spin" /> Applying...
                      </span>
                    ) : 'Continue'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── Step 2: Ready ── */}
          {step === 'ready' && (
            <div className="space-y-5">
              <div className="space-y-2 bg-white/[0.02] rounded-lg p-3 border border-border/[0.08]">
                <CheckItem ok={true} label={`Dependencies: ${depsPath.replace(/^\/Users\/[^/]+/, '~')}`} />
                {validation?.mlx_model_names?.[0] && (
                  <CheckItem ok={true} label={`Enhancement model: ${validation.mlx_model_names[0]}`} />
                )}
                <CheckItem ok={true} label="Parakeet transcription: ready" />
              </div>

              {/* Optional: Obsidian vault */}
              <div>
                <div className="text-[12px] font-medium text-text-secondary mb-2">
                  Obsidian vault <span className="text-text-muted/60">(optional — set later in Settings)</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={vaultPath}
                    onChange={e => setVaultPath(e.target.value)}
                    placeholder="Path to your Obsidian vault"
                    className="flex-1 h-9 px-3 text-[13px] bg-white/[0.04] border border-border/[0.15] rounded-lg text-text-primary placeholder:text-text-muted/40 outline-none focus:border-accent/50 transition-colors font-mono"
                  />
                  <button
                    onClick={async () => {
                      const p = await window.electronAPI?.openFolderDialog()
                      if (p) setVaultPath(p)
                    }}
                    className="h-9 px-3 flex items-center gap-1.5 text-[12px] font-medium bg-white/[0.06] hover:bg-white/[0.1] border border-border/[0.15] rounded-lg text-text-secondary transition-colors"
                  >
                    <FolderOpen size={14} />
                  </button>
                </div>
              </div>

              <button
                onClick={finish}
                className="w-full h-10 rounded-lg text-[13px] font-medium bg-accent hover:bg-accent/90 text-white transition-all cursor-pointer"
              >
                Start using Skrift
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
