import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { Button } from '../../../shared/ui/button';
import { Input } from '../../../shared/ui/input';
import { Label } from '../../../shared/ui/label';
import { Textarea } from '../../../shared/ui/textarea';
import { Switch } from '../../../shared/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../shared/ui/select';
import { Separator } from '../../../shared/ui/separator';
import { Badge } from '../../../shared/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../shared/ui/tabs';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { 
  FolderOpen, 
  Save, 
  RotateCcw, 
  Settings, 
  Sparkles, 
  Zap,
  Brain, 
  FileText,
  Download,
  Upload,
  Plus,
  Trash2,
  Info,
  HardDrive,
  FolderInput,
  FolderOutput,
  Eraser
} from 'lucide-react';
import { useFileDialogSafe } from '../../../shared/hooks/useElectronSafe';
import { useEnhancementConfig, EnhancementOption } from '../../enhance';

interface PersonEntry {
  id: string; // local UI id
  canonical: string; // expect [[Name]]
  aliases: string[];
  aliasText?: string; // editing buffer for alias input
  short?: string; // nickname used for subsequent mentions
}

export function SettingsTab() {
  const { config, updateConfig, updateOption } = useEnhancementConfig();
  // MLX model manager state
  const [mlxModels, setMlxModels] = useState<{name: string; path: string; size?: number; selected: boolean}[]>([]);
  const [mlxSelected, setMlxSelected] = useState<string | null>(null);
  const [mlxLoading, setMlxLoading] = useState(false);
  const [mlxMessage, setMlxMessage] = useState<string | null>(null);
  const [mlxError, setMlxError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string>('');
  const [showManualModelInfo, setShowManualModelInfo] = useState<boolean>(false);
  const [mlxParams, setMlxParams] = useState<{maxTokens: number; temperature: number; timeoutSeconds: number}>({ maxTokens: 512, temperature: 0.7, timeoutSeconds: 45 });
  const [useChatTemplate, setUseChatTemplate] = useState(true);
  const [dynamicTokens, setDynamicTokens] = useState(true);
  const [dynamicRatio, setDynamicRatio] = useState(1.2);
  const [minTokens, setMinTokens] = useState(256);
  const [debugInfo, setDebugInfo] = useState<{ used_chat_template?: boolean; effective_max_tokens?: number; prompt_preview?: string; elapsed_seconds?: number } | null>(null);
  const [inputPath, setInputPath] = useState('/Users/username/Documents/Audio');
  const [outputPath, setOutputPath] = useState('/Users/username/Documents/Transcripts');
  const [modelsRoot, setModelsRoot] = useState<string>('');
  // Tag generation settings (whitelist-based)
  const [tagsMaxOld, setTagsMaxOld] = useState<number>(10);
  const [tagsMaxNew, setTagsMaxNew] = useState<number>(5);
  // Edit-time copies for Keywords/Tags option
  const [tagsOldEdit, setTagsOldEdit] = useState<number | null>(null);
  const [tagsNewEdit, setTagsNewEdit] = useState<number | null>(null);
  // Obsidian (read-only)
  const [awaitedVaultPath, setAwaitedVaultPath] = useState('');
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [wlMsg, setWlMsg] = useState<string | null>(null);
  const fileDlg = useFileDialogSafe();
  const [people, setPeople] = useState<PersonEntry[]>([]);
  const [defaultExportFormat, setDefaultExportFormat] = useState('markdown');
  const [yamlTemplate, setYamlTemplate] = useState(`---
title: "{{title}}"
date: "{{date}}"
type: "{{type}}"
duration: "{{duration}}"
participants: {{participants}}
topics: {{topics}}
tags: {{tags}}
processing:
  transcribed: {{transcribed}}
  sanitised: {{sanitised}}
  enhanced: {{enhanced}}
---`);

  const [editingOption, setEditingOption] = useState<string | null>(null);
  const [tempOption, setTempOption] = useState<EnhancementOption | null>(null);
  const [isSavingNames, setIsSavingNames] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Sanitisation settings (MVP)
  const [sanCfg, setSanCfg] = useState<any>({
    whole_word: true,
    linking: {
      mode: 'first',
      avoid_inside_links: true,
      preserve_possessive: true,
      format: { style: 'wiki', base_path: 'People' },
      alias_priority: 'longest'
    }
  });
  const [originalSanCfg, setOriginalSanCfg] = useState<any>(null);
  const [isSavingSan, setIsSavingSan] = useState(false);
  const [sanSavedAt, setSanSavedAt] = useState<string | null>(null);
  const isSanDirty = React.useMemo(() => {
    try { return JSON.stringify(sanCfg) !== JSON.stringify(originalSanCfg); } catch { return false; }
  }, [sanCfg, originalSanCfg]);

  const handleEditOption = (option: EnhancementOption) => {
    setEditingOption(option.id);
    setTempOption({ ...option });
    // Initialize edit-time tag values when editing the keywords option
    if (option.id === 'keywords') {
      setTagsOldEdit(tagsMaxOld);
      setTagsNewEdit(tagsMaxNew);
    } else {
      setTagsOldEdit(null);
      setTagsNewEdit(null);
    }
  };

  const handleSaveOption = async () => {
    if (tempOption && editingOption) {
      // Persist tag knobs if editing the Keywords/Tags option
      if (editingOption === 'keywords') {
        try {
          const api = (await import('../../../src/api')).apiService;
          const oldVal = typeof tagsOldEdit === 'number' ? tagsOldEdit : tagsMaxOld;
          const newVal = typeof tagsNewEdit === 'number' ? tagsNewEdit : tagsMaxNew;
          await api.updateConfig('enhancement.tags.max_old', oldVal);
          await api.updateConfig('enhancement.tags.max_new', newVal);
          setTagsMaxOld(oldVal);
          setTagsMaxNew(newVal);
        } catch (e) {
          console.warn('Failed to persist tag settings', e);
        } finally {
          setTagsOldEdit(null);
          setTagsNewEdit(null);
        }
      }
      updateOption(editingOption, tempOption);
      setEditingOption(null);
      setTempOption(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingOption(null);
    setTempOption(null);
    setTagsOldEdit(null);
    setTagsNewEdit(null);
  };

  const sortPeople = (list: PersonEntry[]) => {
    return [...list].sort((a, b) => {
      // Extract clean canonical name
      const ca = a.canonical.replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
      const cb = b.canonical.replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
      
      // Extract first name (text before first space or comma)
      const getFirstName = (name: string) => {
        const parts = name.split(/[,\s]+/);
        return parts[0].toLowerCase();
      };
      
      const firstA = getFirstName(ca);
      const firstB = getFirstName(cb);
      
      // Sort by first name, then full name as tiebreaker
      const firstCompare = firstA.localeCompare(firstB);
      if (firstCompare !== 0) return firstCompare;
      return ca.toLowerCase().localeCompare(cb.toLowerCase());
    });
  };

const handleAliasChange = (id: string, value: string) => {
  // Keep raw text so commas can be typed naturally; update aliases live but do not drop trailing empties
  const list = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
  setPeople(prev => prev.map(p => p.id === id ? { ...p, aliasText: value, aliases: list } : p));
};

  const handleCanonicalChange = (id: string, value: string) => {
    // Store canonical as plain text while editing; wrap to [[Name]] on save
    const stripped = value.replace(/^\[\[|\]\]$/g, '');
    setPeople(prev => prev.map(p => p.id === id ? { ...p, canonical: stripped } : p));
  };

  // replaceAll removed per requirements

  const handleAddPerson = () => {
    const id = Date.now().toString();
    setPeople(prev => sortPeople([...prev, { id, canonical: '', aliases: [] }]));
  };

  const handleRemovePerson = (id: string) => {
    setPeople(prev => prev.filter(p => p.id !== id));
  };

  const loadNames = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/config/names');
      const data = await res.json();
      // Support both simplified { people } and legacy shapes
      const rawPeople = Array.isArray(data)
        ? data
        : (Array.isArray(data?.people) ? data.people : Array.isArray(data?.entries) ? data.entries : []);
      const mapped: PersonEntry[] = rawPeople.map((p: any, idx: number) => {
        let c = typeof p.canonical === 'string' ? p.canonical : '';
        if (c.startsWith('[[') && c.endsWith(']]')) c = c.slice(2, -2);
        const aliases = Array.isArray(p.aliases) ? p.aliases : [];
        return {
          id: `${Date.now()}-${idx}`,
          canonical: c,
          aliases,
          aliasText: aliases.join(', '),
          short: typeof p.short === 'string' ? p.short : ''
        } as PersonEntry;
      });
      setPeople(sortPeople(mapped));
    } catch (e) {
      console.error('Failed to load names mapping', e);
    }
  };

  const saveNames = async () => {
    try {
      setIsSavingNames(true);
      // Sort just before saving to keep UI editing smooth
      const peopleSorted = sortPeople(people).map(p => ({
        canonical: p.canonical ? `[[${p.canonical}]]` : '',
        aliases: (p.aliasText ?? p.aliases.join(', ')).split(',').map(s => s.trim()).filter(Boolean),
        short: (p.short || '').trim() || undefined,
      }));
      const payload = {
        people: peopleSorted
      };
      const res = await fetch('http://localhost:8000/api/config/names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to save names');
      }
      setLastSavedAt(new Date().toLocaleTimeString());
      // Reload to refresh sorted list in UI
      await loadNames();
    } catch (e) {
      console.error('Failed to save names mapping', e);
    } finally {
      setIsSavingNames(false);
    }
  };

  const refreshMlxModels = async () => {
    try {
      setMlxLoading(true);
      const res = await import('../../../src/api').then(m => m.apiService.listEnhanceModels());
      setMlxModels(res.models);
      setMlxSelected(res.selected || null);
      setMlxError(null);
    } catch (e: any) {
      console.error('Failed to list MLX models', e);
      setMlxError(e?.message || 'Failed to list models');
    } finally {
      setMlxLoading(false);
    }
  };

  const loadPaths = async () => {
    try {
      const api = (await import('../../../src/api')).apiService;
      const [inp, out] = await Promise.all([
        api.getInputFolder(),
        api.getOutputFolder(),
      ]);
      if (inp?.path) setInputPath(inp.path);
      if (out?.path) setOutputPath(out.path);
    } catch (e) {
      console.warn('Failed to load folder paths', e);
    }
  };

  const savePaths = async () => {
    try {
      const api = (await import('../../../src/api')).apiService;
      await api.setInputFolder(inputPath);
      await api.setOutputFolder(outputPath);
      setMlxMessage('Paths saved');
      setTimeout(() => setMlxMessage(null), 2000);
    } catch (e: any) {
      setMlxError(e?.message || 'Failed to save paths');
      setTimeout(() => setMlxError(null), 3000);
    }
  };


  React.useEffect(() => {
    loadNames();
    refreshMlxModels();
    loadPaths();
    // Load enhancement settings (mlx)
    (async () => {
      try {
        const api = (await import('../../../src/api')).apiService;
        const cfg = await api.getConfig();
        const mlx = cfg?.enhancement?.mlx || {};
        if (typeof mlx.models_dir === 'string') setModelsRoot(mlx.models_dir);
        const tagsCfg = cfg?.enhancement?.tags || {};
        if (typeof tagsCfg.max_old === 'number') setTagsMaxOld(tagsCfg.max_old);
        if (typeof tagsCfg.max_new === 'number') setTagsMaxNew(tagsCfg.max_new);
        const obs = cfg?.enhancement?.obsidian || {};
        if (typeof obs.vault_path === 'string') setAwaitedVaultPath(obs.vault_path);
        // Load whitelist preview silently
        try { const wl = await api.getTagWhitelist(); setWhitelist(wl.tags || []); } catch {
          // Whitelist load is optional
        }
        if (typeof mlx.max_tokens === 'number') setMlxParams(p => ({ ...p, maxTokens: mlx.max_tokens }));
        if (typeof mlx.temperature === 'number') setMlxParams(p => ({ ...p, temperature: mlx.temperature }));
        if (typeof mlx.timeout_seconds === 'number') setMlxParams(p => ({ ...p, timeoutSeconds: mlx.timeout_seconds }));
        if (typeof mlx.use_chat_template === 'boolean') setUseChatTemplate(mlx.use_chat_template);
        if (typeof mlx.dynamic_tokens === 'boolean') setDynamicTokens(mlx.dynamic_tokens);
        if (typeof mlx.dynamic_ratio === 'number') setDynamicRatio(mlx.dynamic_ratio);
        if (typeof mlx.min_tokens === 'number') setMinTokens(mlx.min_tokens);
      } catch (e) {
        console.warn('Failed to load enhancement config', e);
      }
    })();
    // Load sanitisation settings
    (async () => {
      try {
        const res = await fetch('http://localhost:8000/api/config/sanitisation');
        const data = await res.json();
        if (data && typeof data === 'object') {
          setSanCfg(data);
          setOriginalSanCfg(data);
        }
      } catch (e) {
        console.error('Failed to load sanitisation settings', e);
      }
    })();
  }, []);

  const handleExportConfig = () => {
    const configJson = JSON.stringify(config, null, 2);
    const blob = new Blob([configJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'enhancement-config.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportConfig = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const importedConfig = JSON.parse(e.target?.result as string);
          updateConfig(importedConfig);
        } catch (error) {
          console.error('Failed to import config:', error);
        }
      };
      reader.readAsText(file);
    }
  };

  const getIconForOption = (iconName: string) => {
    switch (iconName) {
      case 'Zap': return <Zap className="w-4 h-4" />;
      case 'Brain': return <Brain className="w-4 h-4" />;
      case 'FileText': return <FileText className="w-4 h-4" />;
      default: return <Sparkles className="w-4 h-4" />;
    }
  };

  const getColorClasses = (color: string) => {
    const colorMap = {
      blue: 'border-blue-500 bg-blue-50 text-blue-700',
      purple: 'border-purple-500 bg-purple-50 text-purple-700',
      green: 'border-green-500 bg-green-50 text-green-700',
      orange: 'border-orange-500 bg-orange-50 text-orange-700',
      red: 'border-red-500 bg-red-50 text-red-700',
      indigo: 'border-indigo-500 bg-indigo-50 text-indigo-700'
    };
    return colorMap[color as keyof typeof colorMap] || colorMap.blue;
  };

  // Placeholder for future rules editor feature
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleEditRules = () => {
    console.log('Edit Rules clicked - will be implemented when backend sanitisation module is ready');
    // TODO: Connect to backend sanitisation rules file when module exists
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="w-5 h-5" />
            <span>Pipeline Settings</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="paths" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="paths">Paths</TabsTrigger>
              <TabsTrigger value="names">Names</TabsTrigger>
              <TabsTrigger value="sanitise" className="flex items-center space-x-1">
                <Eraser className="w-3 h-3" />
                <span>Sanitise</span>
              </TabsTrigger>
              <TabsTrigger value="enhancement" className="flex items-center space-x-1">
                <Sparkles className="w-3 h-3" />
                <span>Enhancement</span>
              </TabsTrigger>
              <TabsTrigger value="export">Export</TabsTrigger>
            </TabsList>

            {/* Paths Tab */}
            <TabsContent value="paths" className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <HardDrive className="w-5 h-5 text-blue-600" />
                  <h3 className="font-medium text-lg">Folder Configuration</h3>
                </div>
                
                {/* Explanation of Folder Configuration */}
                <Alert>
                  <Info className="w-4 h-4" />
                  <AlertDescription className="space-y-2">
                    <div className="font-medium">Purpose of Folder Configuration:</div>
                    <div className="text-sm space-y-1">
                      <div><strong>Input Folder:</strong> Where the application monitors for new audio files to process. The system will automatically detect supported audio formats (.m4a, .mp3, .wav, etc.) in this location.</div>
                      <div><strong>Output Folder:</strong> Where the processing pipeline creates individual subfolders for each audio file, containing all generated files (transcripts, sanitised text, enhanced versions, exports, and status tracking).</div>
                    </div>
                  </AlertDescription>
                </Alert>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <FolderInput className="w-4 h-4 text-green-600" />
                      <Label htmlFor="input-path">Input Folder Path</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Input
                        id="input-path"
                        value={inputPath}
                        onChange={(e) => setInputPath(e.target.value)}
                        placeholder="Path to audio files"
                        className="flex-1"
                      />
                      <Button variant="outline">
                        <FolderOpen className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="text-xs text-gray-500">
                      Monitor this folder for new audio files to automatically add to the processing queue
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <FolderOutput className="w-4 h-4 text-blue-600" />
                      <Label htmlFor="output-path">Output Folder Path</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Input
                        id="output-path"
                        value={outputPath}
                        onChange={(e) => setOutputPath(e.target.value)}
                        placeholder="Path for processed files"
                        className="flex-1"
                      />
                      <Button variant="outline">
                        <FolderOpen className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="text-xs text-gray-500">
                      Create individual subfolders here for each processed audio file with all outputs
                    </div>
                  </div>
                </div>

                {/* Example Folder Structure */}
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="font-medium text-sm">Example Output Structure:</div>
                  <div className="font-mono text-xs text-gray-700 space-y-1">
                    <div>📁 {outputPath}/</div>
                    <div className="ml-4">📁 meeting-recording/</div>
                    <div className="ml-8">🎵 original.m4a</div>
                    <div className="ml-8">📄 transcript.txt</div>
                    <div className="ml-8">📄 sanitised.txt</div>
                    <div className="ml-8">📄 enhanced.txt</div>
                    <div className="ml-8">📄 exported.md</div>
                    <div className="ml-8">⚙️ status.json</div>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <Button id="btn-save-paths" onClick={savePaths} className="bg-blue-600 hover:bg-blue-700 text-white font-medium">
                    <Save className="w-4 h-4 mr-2" />
                    Save Paths
                  </Button>
                  <Button variant="outline">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reset to Defaults
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Names Tab */}
            <TabsContent value="names" className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Name Mappings</h3>
                  <Button variant="outline" size="sm" onClick={handleAddPerson}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Person
                  </Button>
                </div>


                <div id="name-mappings-table" className="space-y-3">
                  {people.map((p) => (
                    <div key={p.id} className="grid grid-cols-12 gap-3 items-center p-3 border rounded-lg">
                      <Input
                        className="col-span-4"
                        value={p.canonical}
                        onChange={(e) => handleCanonicalChange(p.id, e.target.value)}
                        placeholder="Canonical (Full Name)"
                      />
                      <Input
                        className="col-span-5"
                        value={p.aliasText ?? p.aliases.join(', ')}
                        onChange={(e) => handleAliasChange(p.id, e.target.value)}
                        placeholder="Aliases (comma-separated)"
                      />
                      <Input
                        className="col-span-2"
                        value={p.short || ''}
                        onChange={(e) => setPeople(prev => prev.map(pp => pp.id === p.id ? { ...pp, short: e.target.value } : pp))}
                        placeholder="Nickname (short)"
                      />
                      <div className="col-span-1 flex justify-end">
                        <Button variant="outline" size="sm" onClick={() => handleRemovePerson(p.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded">
                  <div className="font-medium">How it works</div>
                  <ul className="list-disc pl-5 space-y-1 mt-1">
                    <li>Aliases are matched case-insensitively. Separate multiple aliases with commas.</li>
                    <li>Example: Aliases: &quot;Alex, Lex, Xander&quot; → Canonical: &quot;Alexander Example&quot; (saved as [[Alexander Example]]).</li>
                    <li>Canonical is saved as an Obsidian link automatically as [[Name]].</li>
                    <li>Only the first mention of a person is linked; subsequent mentions remain plain text.</li>
                    <li>Names are sorted alphabetically by canonical.</li>
                  </ul>
                </div>

                <div className="text-xs text-gray-600 mt-2">Saved as [[Canonical]]. Only the first mention is linked.</div>

                <div className="flex items-center space-x-4">
                  <Button onClick={saveNames} disabled={isSavingNames} className="bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-60">
                    <Save className="w-4 h-4 mr-2" />
                    {isSavingNames ? 'Saving…' : 'Save Mappings'}
                  </Button>
                  {lastSavedAt && (
                    <span className="text-xs text-green-700">Saved ✓ at {lastSavedAt}</span>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Enhancement Tab additions: Model Manager + Test Model + Compatibility Note */}
            <TabsContent value="enhancement" className="space-y-6">
              <div className="space-y-4">
                {/* Removed redundant top heading: Local Model (MLX) */}

                {/* Compatibility note removed per feedback */}

                {/* Models list removed per feedback (redundant). Keeping configuration below. */}

                {/* Test Model section removed to avoid duplication; keeping existing behavior */}

                {/* Advanced parameters (already present via state) */}
              </div>
            </TabsContent>

            {/* Sanitise Tab */}
            <TabsContent value="sanitise" className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Eraser className="w-5 h-5 text-blue-600" />
                  <h3 className="font-medium text-lg">Sanitisation Configuration</h3>
                </div>

                {/* Name Linking */}
                <div className="p-4 bg-gray-50 rounded-lg border">
                  <div className="font-medium mb-1">Name Linking</div>
                  <p className="text-xs text-gray-600 mb-3">Replace people aliases with their canonical name and link it.</p>
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={String(sanCfg.linking?.mode || 'first') === 'first'}
                          onCheckedChange={(isFirst) => setSanCfg((prev: any) => ({ ...prev, linking: { ...prev.linking, mode: isFirst ? 'first' : 'all' } }))}
                        />
                        <Label>Link only the first mention</Label>
                      </div>
                      <p className="text-xs text-gray-500 ml-8">When off, all occurrences are linked.</p>
                    </div>

                    <div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={!!sanCfg.linking?.avoid_inside_links}
                          onCheckedChange={(val) => setSanCfg((prev: any) => ({ ...prev, linking: { ...prev.linking, avoid_inside_links: val } }))}
                        />
                        <Label>Avoid linking inside existing [[...]]</Label>
                      </div>
                      <p className="text-xs text-gray-500 ml-8">Skips text already inside a link.</p>
                    </div>

                    <div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={!!sanCfg.linking?.preserve_possessive}
                          onCheckedChange={(val) => setSanCfg((prev: any) => ({ ...prev, linking: { ...prev.linking, preserve_possessive: val } }))}
                        />
                        <Label>Preserve possessive ’s</Label>
                      </div>
                      <p className="text-xs text-gray-500 ml-8">Keeps trailing &apos;s for matches, e.g. [[Alex]]&apos;s.</p>
                    </div>

                    <div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={!!sanCfg.whole_word}
                          onCheckedChange={(val) => setSanCfg((prev: any) => ({ ...prev, whole_word: val }))}
                        />
                        <Label>Whole word matching</Label>
                      </div>
                      <p className="text-xs text-gray-500 ml-8">Only match standalone alias words, not parts of other words.</p>
                    </div>
                  </div>
                </div>



                {/* Sticky Save Footer for Sanitisation settings */}
                {isSanDirty && (
                  <div className="sticky bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t p-3 flex items-center justify-between rounded-b">
                    <span className="text-sm text-gray-700">Unsaved changes</span>
                    <div className="space-x-2">
                      <Button
                        variant="outline"
                        onClick={() => setSanCfg(originalSanCfg)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={async () => {
                      try {
                        setIsSavingSan(true);
                        const res = await fetch('http://localhost:8000/api/config/sanitisation', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(sanCfg)
                        });
                        if (!res.ok) throw new Error('Failed to save sanitisation settings');
                        setSanSavedAt(new Date().toLocaleTimeString());
                      } catch (e) {
                        console.error(e);
                      } finally {
                        setIsSavingSan(false);
                      }
                    }}
                    disabled={isSavingSan}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-60"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {isSavingSan ? 'Saving…' : 'Save Sanitisation Settings'}
                  </Button>
                    </div>
                  </div>
                )}
                {!isSanDirty && sanSavedAt && (
                  <span className="text-xs text-green-700">Saved ✓ at {sanSavedAt}</span>
                )}
              </div>
            </TabsContent>

            {/* Enhancement Tab */}
            <TabsContent value="enhancement" className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">AI Enhancement Configuration</h3>
                </div>

                {/* MLX Model Manager */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">Local Model (MLX)</span>
                        {mlxLoading && <span className="text-xs text-gray-500">Loading…</span>}
                        {/* Selected path preview removed to avoid redundancy; shown below in content */}
                      </div>
                      <div className="flex items-center space-x-2">
<Button size="sm" variant="outline" className="bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-400 hover:border-gray-500 focus:ring-1 focus:ring-gray-300" onClick={refreshMlxModels}>Refresh</Button>
<Button size="sm" variant="outline" className="bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-400 hover:border-gray-500 focus:ring-1 focus:ring-gray-300" onClick={() => setShowManualModelInfo(v => !v)}>Manual Install Info</Button>
<Button size="sm" variant="outline" className="bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-400 hover:border-gray-500 focus:ring-1 focus:ring-gray-300" onClick={() => {
                          try {
                            if (modelsRoot) {
                              const url = 'file://' + modelsRoot.replace(/\s/g, '%20');
                              window.open(url, '_blank');
                            } else {
                              alert('Models folder path not available yet. Try Refresh or reopen Settings.');
                            }
                          } catch (e) {
                            console.error('Failed to open models folder', e);
                            alert(modelsRoot || 'Models folder path unavailable');
                          }
}}>Open Models Folder</Button>
                        {/* Upload removed per user preference; manual installs only */}
<Button size="sm" variant="outline" className="bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-400 hover:border-gray-500 focus:ring-1 focus:ring-gray-300" onClick={async () => {
                          try {
                            setMlxLoading(true);
                            setMlxMessage(null);
                            setMlxError(null);
                            setDebugInfo(null);
                            const api = (await import('../../../src/api')).apiService;
                            const res = await api.testEnhanceModel();
                            setMlxMessage(`Model OK · ${res.elapsed_seconds}s · ${res.selected}`);
                            // Also surface the first line sample below
                            setTestResult(res.sample || '');
                            // Capture debug fields if present
                            setDebugInfo({
                              used_chat_template: (res as any).used_chat_template,
                              effective_max_tokens: (res as any).effective_max_tokens,
                              prompt_preview: (res as any).prompt_preview,
                            });
                            await refreshMlxModels();
                          } catch (err: any) {
                            setMlxError(err?.message || 'Test failed');
                            setTestResult('');
                            setDebugInfo(null);
                          } finally {
                            setMlxLoading(false);
                          }
                        }}>Test Model</Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Status messages */}
                    {mlxMessage && <div className="text-xs text-green-700">{mlxMessage}</div>}
                    {mlxError && <div className="text-xs text-red-600">{mlxError}</div>}
                    {showManualModelInfo && (
                      <div className="text-xs text-gray-800 bg-gray-50 border rounded p-3 space-y-2">
                        <div className="font-medium">Manual model install (MLX)</div>
                        <ol className="list-decimal pl-5 space-y-1">
                          <li>Copy your model folder into: <span className="font-mono">backend/modules/Enhancement/LLM_Models/mlx/&lt;YourModelName&gt;</span></li>
                          <li>Return here and click <strong>Refresh</strong>. The model will appear in the list.</li>
                          <li>Select the model, then click <strong>Test Model</strong> to verify it loads.</li>
                        </ol>
                        <div className="space-y-1">
                          <div className="font-medium">Notes</div>
                          <ul className="list-disc pl-5 space-y-1">
                            <li>Keep the model’s internal files as-is (tokenizer.json, model.safetensors, etc.).</li>
                            <li>If your model includes a chat template (e.g., chat_template.jinja or tokenizer chat_template), enable “Use chat template”.</li>
                            <li>If it has no template, disable “Use chat template” to fall back to plain prompts.</li>
                          </ul>
                        </div>
                      </div>
                    )}
                    {testResult && (
                      <div className="text-xs text-gray-700">
                        <span className="font-medium">Test sample:</span> {testResult}
                      </div>
                    )}
                    {debugInfo && (
                      <div className="text-xs text-gray-700 mt-1 space-y-1">
                        <div>used_chat_template: <span className="font-mono">{String(debugInfo.used_chat_template)}</span></div>
                        {typeof debugInfo.effective_max_tokens === 'number' && (
                          <div>effective_max_tokens: <span className="font-mono">{debugInfo.effective_max_tokens}</span></div>
                        )}
                        {debugInfo.prompt_preview && (
                          <div className="max-w-full truncate" title={debugInfo.prompt_preview}>prompt_preview: <span className="font-mono">{debugInfo.prompt_preview}</span></div>
                        )}
                      </div>
                    )}

                    {/* Always show currently selected path, even if no uploaded models */}
                    {mlxSelected ? (
                      <div className="text-xs text-gray-700">
                        <span className="font-medium">Currently selected model:</span>{' '}
                        <span className="truncate align-middle inline-block max-w-full">{mlxSelected}</span>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500">No model selected yet.</div>
                    )}

                    {/* Params */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-sm">Max tokens</Label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="range"
                            min={256}
                            max={50000}
                            step={64}
                            value={Math.min(mlxParams.maxTokens, 50000)}
                            onChange={(e) => setMlxParams(p => ({ ...p, maxTokens: Math.max(256, Math.min(50000, Number(e.target.value))) }))}
                            onMouseUp={async () => {
                              const api = (await import('../../../src/api')).apiService;
                              await api.updateConfig('enhancement.mlx.max_tokens', Math.max(256, Math.min(50000, mlxParams.maxTokens)));
                            }}
                            className="flex-1 border rounded h-2"
                            style={{ accentColor: '#2563EB' }}
                            aria-label="Max tokens"
                          />
                          <Input
                            type="number"
                            value={mlxParams.maxTokens}
                            onChange={(e) => setMlxParams(p => ({...p, maxTokens: Number(e.target.value)}))}
                            onBlur={async () => {
                              const api = (await import('../../../src/api')).apiService;
                              await api.updateConfig('enhancement.mlx.max_tokens', mlxParams.maxTokens);
                            }}
                            className="w-24"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm">Temperature</Label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="range"
                            min={0}
                            max={1.5}
                            step={0.05}
                            value={mlxParams.temperature}
                            onChange={(e) => setMlxParams(p => ({ ...p, temperature: Number(e.target.value) }))}
                            onMouseUp={async () => {
                              const api = (await import('../../../src/api')).apiService;
                              await api.updateConfig('enhancement.mlx.temperature', mlxParams.temperature);
                            }}
                            className="flex-1 border rounded h-2"
                            style={{ accentColor: '#2563EB' }}
                            aria-label="Temperature"
                          />
                          <Input
                            type="number"
                            step="0.1"
                            value={mlxParams.temperature}
                            onChange={(e) => setMlxParams(p => ({...p, temperature: Number(e.target.value)}))}
                            onBlur={async () => {
                              const api = (await import('../../../src/api')).apiService;
                              await api.updateConfig('enhancement.mlx.temperature', mlxParams.temperature);
                            }}
                            className="w-24"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm">Timeout (s)</Label>
                        <Input type="number" value={mlxParams.timeoutSeconds} onChange={(e) => setMlxParams(p => ({...p, timeoutSeconds: Number(e.target.value)}))} onBlur={async () => {
                          const api = (await import('../../../src/api')).apiService;
                          await api.updateConfig('enhancement.mlx.timeout_seconds', mlxParams.timeoutSeconds);
                        }} />
                      </div>
                    </div>

                    {/* External path selector removed: selection is restricted to models copied/uploaded into the app. */}

                    {/* Advanced toggles */}
                    <div className="grid grid-cols-3 gap-3 mt-2">
                      <div className="col-span-1">
                        <Label className="text-sm">Use chat template</Label>
                        <div className="flex items-center space-x-2">
                          <Switch checked={useChatTemplate} onCheckedChange={async (val) => {
                            setUseChatTemplate(val);
                            const api = (await import('../../../src/api')).apiService;
                            await api.updateConfig('enhancement.mlx.use_chat_template', val);
                          }} />
                          <span className="text-xs text-gray-600">Use tokenizer.apply_chat_template when available</span>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-sm">Dynamic token budget</Label>
                        <div className="flex items-center space-x-3">
                          <Switch checked={dynamicTokens} onCheckedChange={async (val) => {
                            setDynamicTokens(val);
                            const api = (await import('../../../src/api')).apiService;
                            await api.updateConfig('enhancement.mlx.dynamic_tokens', val);
                          }} />
                          <div className="flex items-center space-x-2">
                            <Label className="text-xs">Ratio</Label>
                            <Input type="number" step="0.05" className="w-24" value={dynamicRatio} onChange={(e) => setDynamicRatio(Number(e.target.value))} onBlur={async () => {
                              const api = (await import('../../../src/api')).apiService;
                              await api.updateConfig('enhancement.mlx.dynamic_ratio', dynamicRatio);
                            }} />
                          </div>
                          <div className="flex items-center space-x-2">
                            <Label className="text-xs">Min tokens</Label>
                            <Input type="number" className="w-24" value={minTokens} onChange={(e) => setMinTokens(Number(e.target.value))} onBlur={async () => {
                              const api = (await import('../../../src/api')).apiService;
                              await api.updateConfig('enhancement.mlx.min_tokens', minTokens);
                            }} />
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Effective = min(Max tokens, max(Min tokens, input_tokens × Ratio))</p>
                      </div>
                    </div>

                    {/* Models table */}
                    <div className="border rounded">
                      <div className="grid grid-cols-5 text-xs font-medium text-gray-600 px-3 py-2 bg-gray-50">
                        <div className="col-span-2">Name</div>
                        <div>Size</div>
                        <div>Status</div>
                        <div className="text-right">Actions</div>
                      </div>
                      {mlxModels.filter(m => !(m.name || '').startsWith('.')).length === 0 ? (
                        <div className="px-3 py-3 text-sm text-gray-600">No models found. Use “Open Models Folder” and copy a model into it, then click Refresh.</div>
                      ) : (
                        mlxModels.filter(m => !(m.name || '').startsWith('.')).map(m => (
                          <div key={m.path} className="grid grid-cols-5 items-center px-3 py-2 border-t text-sm">
                            <div className="col-span-2 truncate" title={m.path}>{m.name}</div>
                            <div>{typeof m.size === 'number' ? `${(m.size/1_048_576).toFixed(1)} MB` : '—'}</div>
                            <div>{m.selected ? <span className="text-green-700">Selected</span> : '—'}</div>
                            <div className="text-right space-x-2">
                              {!m.selected && (
                                <Button size="sm" variant="outline" onClick={async () => {
                                  const api = (await import('../../../src/api')).apiService;
                                  await api.selectEnhanceModel(m.path);
                                  await refreshMlxModels();
                                }}>Select</Button>
                              )}
                              <Button size="sm" variant="outline" className="text-red-600" onClick={async () => {
                                const api = (await import('../../../src/api')).apiService;
                                await api.deleteEnhanceModel(m.name);
                                await refreshMlxModels();
                              }}>Delete</Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Separator />

                {/* Obsidian (read-only) integration */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">Obsidian Integration (Read-only)</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-xs text-gray-600">
                      Point to your vault (read-only) to build a tag whitelist. The app will not modify or delete anything in your vault; it only reads .md files to extract tags.
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            const res = await fileDlg.selectFolder();
                            if (!res?.canceled && Array.isArray(res.filePaths) && res.filePaths[0]) {
                              const newPath = res.filePaths[0];
                              setAwaitedVaultPath(newPath);
                              const api = (await import('../../../src/api')).apiService;
                              await api.updateConfig('enhancement.obsidian.vault_path', newPath);
                              setWlMsg('Vault path saved'); setTimeout(() => setWlMsg(null), 2000);
                            }
                          } catch (e) {
                            const picked = prompt('Enter Obsidian vault folder path');
                            if (picked) {
                              setAwaitedVaultPath(picked);
                              const api = (await import('../../../src/api')).apiService;
                              await api.updateConfig('enhancement.obsidian.vault_path', picked);
                              setWlMsg('Vault path saved'); setTimeout(() => setWlMsg(null), 2000);
                            }
                          }
                        }}
                      >
                        Choose Folder…
                      </Button>
                      <span className="text-xs text-gray-600 truncate max-w-[50%]" title={awaitedVaultPath}>{awaitedVaultPath || 'No vault selected'}</span>
                      <Button size="sm" variant="outline" onClick={async () => {
                        const api = (await import('../../../src/api')).apiService;
                        await api.refreshTagWhitelist();
                        const wl = await api.getTagWhitelist();
                        setWhitelist(wl.tags || []);
                        setWlMsg(`Whitelist refreshed · ${wl.count} tags`);
                        setTimeout(() => setWlMsg(null), 3000);
                      }}>Refresh Tag Whitelist</Button>
                      <Button size="sm" variant="outline" onClick={async () => {
                        const api = (await import('../../../src/api')).apiService;
                        const wl = await api.getTagWhitelist();
                        setWhitelist(wl.tags || []);
                        setWlMsg(`Loaded whitelist · ${wl.count} tags`);
                        setTimeout(() => setWlMsg(null), 3000);
                      }}>View Whitelist</Button>
                      {wlMsg && <span className="text-xs text-gray-700">{wlMsg}</span>}
                    </div>
                    <div className="border rounded p-2 max-h-40 overflow-auto bg-gray-50">
                      <div className="text-xs text-gray-600 mb-1">Tag whitelist ({whitelist.length})</div>
                      <div className="flex flex-wrap gap-2">
                        {whitelist.map(t => (
                          <span key={t} className="text-xs px-2 py-1 bg-white border rounded">{t}</span>
                        ))}
                        {whitelist.length === 0 && (
                          <div className="text-xs text-gray-500">No tags loaded.</div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>


                <div className="space-y-4">
                  <h4 className="font-medium">Enhancement Options</h4>
                  
                  {config.options.map((option) => (
                    <Card key={option.id} className={`transition-all ${
                      editingOption === option.id ? 'ring-2 ring-blue-500' : ''
                    }`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            {getIconForOption(option.icon)}
                            <span className="font-medium">{option.name}</span>
                            <Badge variant="outline" className={getColorClasses(option.color)}>
                              {option.id}
                            </Badge>
                          </div>
                          <div className="flex items-center space-x-2">
                            {editingOption === option.id ? (
                              <>
                                <Button size="sm" variant="outline" onClick={handleCancelEdit} className="text-gray-700">
                                  Cancel
                                </Button>
                                <Button size="sm" onClick={handleSaveOption} className="bg-blue-600 hover:bg-blue-700 text-white font-medium">
                                  <Save className="w-3 h-3 mr-1" />
                                  Save
                                </Button>
                              </>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => handleEditOption(option)}>
                                Edit
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {editingOption === option.id && tempOption ? (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Option Name</Label>
                                <Input
                                  value={tempOption.name}
                                  onChange={(e) => setTempOption({ ...tempOption, name: e.target.value })}
                                  placeholder="Enhancement option name"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Color Theme</Label>
                                <Select
                                  value={tempOption.color}
                                  onValueChange={(value) => setTempOption({ ...tempOption, color: value })}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="blue">Blue</SelectItem>
                                    <SelectItem value="purple">Purple</SelectItem>
                                    <SelectItem value="green">Green</SelectItem>
                                    <SelectItem value="orange">Orange</SelectItem>
                                    <SelectItem value="red">Red</SelectItem>
                                    <SelectItem value="indigo">Indigo</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            
                            <div className="space-y-2">
                              <Label>Description</Label>
                              <Input
                                value={tempOption.description}
                                onChange={(e) => setTempOption({ ...tempOption, description: e.target.value })}
                                placeholder="Brief description of what this enhancement does"
                              />
                            </div>

                            {tempOption.id === 'keywords' && (
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label className="text-sm">Max old tags (reuse from whitelist)</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={50}
                                    value={typeof tagsOldEdit === 'number' ? tagsOldEdit : tagsMaxOld}
                                    onChange={(e) => setTagsOldEdit(Math.max(0, Math.min(50, Number(e.currentTarget.value || 0))))}
                                  />
                                </div>
                                <div>
                                  <Label className="text-sm">Max new tags (propose)</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={50}
                                    value={typeof tagsNewEdit === 'number' ? tagsNewEdit : tagsMaxNew}
                                    onChange={(e) => setTagsNewEdit(Math.max(0, Math.min(50, Number(e.currentTarget.value || 0))))}
                                  />
                                </div>
                              </div>
                            )}

                            <div className="space-y-2">
                              <Label>Instruction</Label>
                              <Textarea
                                value={tempOption.systemPrompt}
                                onChange={(e) => setTempOption({ ...tempOption, systemPrompt: e.target.value })}
                                placeholder="Instruction to the local LLM"
                                className="min-h-[200px] font-mono text-sm"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <p className="text-sm text-gray-600">{option.description}</p>
                            {option.id !== 'keywords' ? (
                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-gray-500">INSTRUCTION PREVIEW</Label>
                                <div className="p-3 bg-gray-50 rounded text-xs font-mono max-h-32 overflow-y-auto">
                                  {option.systemPrompt.slice(0, 200)}
                                  {option.systemPrompt.length > 200 && '...'}
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-gray-600">Edit this option to set how many old/new tags the generator produces.</div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Separator />

                <div className="flex items-center space-x-4">
                  <Button onClick={handleExportConfig} className="bg-blue-600 hover:bg-blue-700 text-white font-medium">
                    <Download className="w-4 h-4 mr-2" />
                    Export Config
                  </Button>
                  <div className="relative">
                    <Button variant="outline" onClick={() => document.getElementById('config-import')?.click()}>
                      <Upload className="w-4 h-4 mr-2" />
                      Import Config
                    </Button>
                    <input
                      id="config-import"
                      type="file"
                      accept=".json"
                      onChange={handleImportConfig}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Export Tab */}
            <TabsContent value="export" className="space-y-6">
              <div className="space-y-4">
                <h3 className="font-medium">Export Settings</h3>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Default Export Format</Label>
                    <Select 
                      value={defaultExportFormat} 
                      onValueChange={setDefaultExportFormat}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="markdown">Markdown (.md)</SelectItem>
                        <SelectItem value="text">Plain Text (.txt)</SelectItem>
                        <SelectItem value="docx">Word Document (.docx)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label>YAML Frontmatter Template</Label>
                    <Textarea
                      value={yamlTemplate}
                      onChange={(e) => setYamlTemplate(e.target.value)}
                      className="min-h-[200px] font-mono text-sm"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white font-medium">
                    <Save className="w-4 h-4 mr-2" />
                    Save Export Settings
                  </Button>
                  <Button variant="outline" onClick={() => setYamlTemplate(`---
title: "{{title}}"
date: "{{date}}"
type: "{{type}}"
duration: "{{duration}}"
participants: {{participants}}
topics: {{topics}}
tags: {{tags}}
processing:
  transcribed: {{transcribed}}
  sanitised: {{sanitised}}
  enhanced: {{enhanced}}
---`)}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reset Template
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}