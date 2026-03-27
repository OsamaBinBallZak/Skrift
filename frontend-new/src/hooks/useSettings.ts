import { useState, useEffect, useCallback } from 'react'
import { api, DEFAULT_PROMPTS, type EnhancePrompt } from '@/api'

export interface VisibleProperties {
  date: boolean
  source: boolean
  duration: boolean
  author: boolean
  location: boolean
  tags: boolean
  summary: boolean
  confidence: boolean
  [key: string]: boolean
}

export interface AppSettings {
  visibleProps: VisibleProperties
  customPropNames: string[]
  vaultPath: string
  vaultAudioPath: string
  vaultAttachmentsPath: string
  depsPath: string
  outputPath: string
  enhancePrompts: EnhancePrompt[]
  theme: 'dark' | 'light'
}

const DEFAULTS: AppSettings = {
  visibleProps: {
    date: true, source: true, duration: true,
    author: false, location: false,
    tags: true, summary: true, confidence: false,
  },
  customPropNames: [],
  vaultPath: '',
  vaultAudioPath: '',
  vaultAttachmentsPath: '',
  depsPath: '',
  outputPath: '',
  enhancePrompts: DEFAULT_PROMPTS,
  theme: 'dark',
}

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(() => {
    // Hydrate from localStorage for fast startup
    const stored = localStorage.getItem('skrift.settings')
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<AppSettings>
        // Drop any saved prompts whose id no longer exists in DEFAULT_PROMPTS
        // (e.g. the old 'tags' prompt that was removed)
        if (parsed.enhancePrompts) {
          const validIds = new Set(DEFAULT_PROMPTS.map(p => p.id))
          parsed.enhancePrompts = parsed.enhancePrompts.filter(p => validIds.has(p.id))
        }
        return { ...DEFAULTS, ...parsed }
      }
      catch { /* ignore */ }
    }
    return DEFAULTS
  })

  // Load from backend on mount
  useEffect(() => {
    async function load() {
      try {
        const { config } = await api.getConfig()
        const patch: Partial<AppSettings> = {}

        if (config['ui.visible_properties']) {
          patch.visibleProps = { ...DEFAULTS.visibleProps, ...(config['ui.visible_properties'] as VisibleProperties) }
        }
        if (config['ui.custom_props']) {
          patch.customPropNames = config['ui.custom_props'] as string[]
        }
        if (config['enhancement.prompts']) {
          const stored = config['enhancement.prompts'] as Partial<Record<string, Partial<EnhancePrompt>>>
          // Only include prompts that exist in DEFAULT_PROMPTS — drops removed ones (e.g. old 'tags')
          patch.enhancePrompts = DEFAULT_PROMPTS.map(p => ({
            ...p, ...(stored[p.id] ?? {}),
          }))
        }
        if (config['dependencies_folder']) {
          patch.depsPath = config['dependencies_folder'] as string
        }
        if (config['export.note_folder'] !== undefined) {
          patch.vaultPath = (config['export.note_folder'] as string) ?? ''
        }
        if (config['export.audio_folder'] !== undefined) {
          patch.vaultAudioPath = (config['export.audio_folder'] as string) ?? ''
        }
        if (config['export.attachments_folder'] !== undefined) {
          patch.vaultAttachmentsPath = (config['export.attachments_folder'] as string) ?? ''
        }

        const [outFolder] = await Promise.allSettled([api.getOutputFolder()])
        if (outFolder.status === 'fulfilled') patch.outputPath = outFolder.value.path

        // theme from localStorage
        patch.theme = (localStorage.getItem('skrift.theme') as 'dark' | 'light') || 'dark'

        setSettingsState(prev => {
          const next = { ...prev, ...patch }
          localStorage.setItem('skrift.settings', JSON.stringify(next))
          return next
        })
      } catch { /* use defaults */ }
    }
    void load()
  }, [])

  const update = useCallback(async (patch: Partial<AppSettings>) => {
    setSettingsState(prev => {
      const next = { ...prev, ...patch }
      localStorage.setItem('skrift.settings', JSON.stringify(next))
      return next
    })

    // Persist relevant keys to backend
    try {
      if (patch.visibleProps !== undefined) {
        await api.updateConfig('ui.visible_properties', patch.visibleProps)
      }
      if (patch.customPropNames !== undefined) {
        await api.updateConfig('ui.custom_props', patch.customPropNames)
      }
      if (patch.enhancePrompts !== undefined) {
        const prompts: Record<string, Partial<EnhancePrompt>> = {}
        for (const p of patch.enhancePrompts) {
          prompts[p.id] = { instruction: p.instruction, label: p.label, desc: p.desc, tagColor: p.tagColor }
        }
        await api.updateConfig('enhancement.prompts', prompts)
      }
      if (patch.vaultPath !== undefined) {
        await api.updateConfig('export.note_folder', patch.vaultPath)
        // Also set as the tag whitelist scan path
        await api.updateConfig('enhancement.obsidian.vault_path', patch.vaultPath)
      }
      if (patch.vaultAudioPath !== undefined) {
        await api.updateConfig('export.audio_folder', patch.vaultAudioPath)
      }
      if (patch.vaultAttachmentsPath !== undefined) {
        await api.updateConfig('export.attachments_folder', patch.vaultAttachmentsPath)
      }
    } catch (err) { console.error('Settings save failed:', err) }
  }, [])

  function setTheme(theme: 'dark' | 'light') {
    localStorage.setItem('skrift.theme', theme)
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.classList.toggle('light', theme !== 'dark')
    void update({ theme })
  }

  return { settings, update, setTheme }
}
