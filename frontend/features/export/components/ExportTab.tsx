import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { Button } from '../../../shared/ui/button';
import { Input } from '../../../shared/ui/input';
import { Label } from '../../../shared/ui/label';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { Switch } from '../../../shared/ui/switch';
import { 
  Download, 
  FileText, 
  FileDown, 
  CheckCircle, 
  AlertCircle,
  Edit3
} from 'lucide-react';
import type { PipelineFile } from '../../../src/types/pipeline';

interface ExportTabProps {
  selectedFile: PipelineFile | null;
  files: PipelineFile[];
  onStartExport?: (fileId: string, format: string) => void;
}

function injectAudioEmbedPreview(markdown: string, title: string): string {
  const cleanTitle = (title || '').trim();
  if (!cleanTitle) return markdown;
  const embedLine = `![[${cleanTitle}.m4a]]`;
  const head = markdown.slice(0, 500);
  if (head.includes(embedLine)) return markdown;

  const yamlMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!yamlMatch) {
    const body = markdown.replace(/^\n+/, '');
    return `${embedLine}\n\n\n${body}`;
  }
  const endIndex = yamlMatch[0].length;
  const before = markdown.slice(0, endIndex);
  const after = markdown.slice(endIndex).replace(/^\n+/, '');
  return `${before}\n\n\n${embedLine}\n\n${after}`;
}

function removeAudioEmbedPreview(markdown: string, title: string): string {
  const cleanTitle = (title || '').trim();
  if (!cleanTitle) return markdown;
  const embedLine = `![[${cleanTitle}.m4a]]`;
  const lines = markdown.split(/\r?\n/);
  let idx = lines.findIndex((l) => l.trim() === embedLine);
  if (idx === -1) return markdown;
  // Remove surrounding blank lines around the embed
  let start = idx;
  let end = idx;
  while (start > 0 && lines[start - 1].trim() === '') start--;
  while (end + 1 < lines.length && lines[end + 1].trim() === '') end++;
  const newLines = [...lines.slice(0, start), ...lines.slice(end + 1)];
  return newLines.join('\n');
}

export function ExportTab({ selectedFile, files }: ExportTabProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [path, setPath] = useState<string | null>(null);
  const [includeAudio, setIncludeAudio] = useState(false);
  // Track a local, definitive export success based on the most recent Save & Export response
  const [hasExportedContent, setExportedSuccess] = useState(false);
  // Track previous file to save before switching
  const prevFileRef = React.useRef<string | null>(null);
  const prevContentRef = React.useRef<string>('');

  const isProcessing = files.some(f => f.status.includes('ing'));

  // Load compiled.md strictly; if missing, show guidance
  React.useEffect(() => {
    if (!selectedFile) return;
    let cancelled = false;
    // Reset local success indicator when switching files
    setExportedSuccess(false);
    (async () => {
      try {
        setLoading(true); setError(null);
        const { apiService } = await import('../../../src/api');
        const api = (apiService as any);
        const resp = await api.getCompiledMarkdown(selectedFile.id);
        if (!cancelled) { 
          const initialContent = resp.content || '';
          setContent(initialContent); 
          setPath(resp.path);
          // Extract title from response or use filename as fallback
          const baseTitle = resp.title || selectedFile.name.replace(/\.[^/.]+$/, '');
          setTitle(baseTitle);
          // Initialise audio toggle from latest status, if available
          const wantAudio = Boolean((selectedFile as any)?.include_audio_in_export);
          setIncludeAudio(wantAudio);
          if (wantAudio) {
            setContent((prev) => injectAudioEmbedPreview(prev, baseTitle));
          }
        }
      } catch (e: any) {
        setError(e?.message || 'Failed to load compiled markdown');
      } finally {
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedFile?.id]);

  // Auto-save content changes (debounced)
  React.useEffect(() => {
    if (!selectedFile || !content) return;
    setExportedSuccess(false);
    
    const timer = setTimeout(async () => {
      try {
        const { apiService } = await import('../../../src/api');
        const api = (apiService as any);
        await api.saveCompiledMarkdown(selectedFile.id, content, false, undefined);
      } catch (e: any) {
        console.error('Auto-save failed:', e);
      }
    }, 1000); // 1 second debounce
    
    return () => clearTimeout(timer);
  }, [content, selectedFile?.id]);

  // Save immediately when switching files (to catch unsaved changes)
  React.useEffect(() => {
    const saveBeforeSwitch = async () => {
      if (prevFileRef.current && prevFileRef.current !== selectedFile?.id && prevContentRef.current) {
        try {
          const { apiService } = await import('../../../src/api');
          const api = (apiService as any);
          await api.saveCompiledMarkdown(prevFileRef.current, prevContentRef.current, false, undefined);
        } catch (e: any) {
          console.error('Save before file switch failed:', e);
        }
      }
    };
    
    saveBeforeSwitch();
    
    // Update refs for next change
    prevFileRef.current = selectedFile?.id || null;
    prevContentRef.current = content;
  }, [selectedFile?.id]);

  // Update YAML frontmatter when title changes
  React.useEffect(() => {
    if (!title || !content) return;
    
    // Update title in YAML frontmatter
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (yamlMatch) {
      const yamlBlock = yamlMatch[1];
      // Strip existing quotes from title to avoid double-quoting
      const cleanTitle = title.replace(/^["']+|["']+$/g, '');
      const updatedYaml = yamlBlock.replace(
        /^title:\s*.+$/m,
        `title: "${cleanTitle}"`
      );
      const updatedContent = content.replace(
        /^---\n[\s\S]*?\n---/,
        `---\n${updatedYaml}\n---`
      );
      if (updatedContent !== content) {
        setContent(updatedContent);
      }
    }
  }, [title]);

  const onSave = async (exportToVault: boolean) => {
    if (!selectedFile) return;
    try {
      setLoading(true); setError(null);
      const { apiService } = await import('../../../src/api');
      const api = (apiService as any);

      // Pre-flight: ensure required paths are configured when exporting
      if (exportToVault) {
        try {
          const cfg = await api.getConfig();
          const noteFolder = cfg?.export?.note_folder as string | undefined;
          const audioFolder = cfg?.export?.audio_folder as string | undefined;
          const depsFolder = (cfg as any)?.dependencies_folder as string | undefined;

          const missing: string[] = [];
          if (!noteFolder) missing.push('Export note path');
          if (!depsFolder) missing.push('Dependencies path');
          if (includeAudio && !audioFolder) missing.push('Audio export path');

          if (missing.length > 0) {
            const msg = `Before exporting, please configure:\n- ${missing.join('\n- ')}\n\nOpen Settings → Paths to fix this.`;
            setError(msg);
            setLoading(false);
            return;
          }
        } catch (e: any) {
          const msg = e?.message || 'Failed to validate export paths from settings';
          setError(msg);
          setLoading(false);
          return;
        }
      }

      const resp = await api.saveCompiledMarkdown(selectedFile.id, content, exportToVault, undefined, includeAudio);
      if (resp.exported_path) {
        setPath(resp.exported_path);
      } else if (resp.path) {
        setPath(resp.path);
      }
      // Mark success only when an export action was requested and backend signalled success
      if (exportToVault && (resp.exported_path || resp.vault_exported_path)) {
        setExportedSuccess(true);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
    } finally { setLoading(false); }
  };

  if (!selectedFile) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Download className="w-12 h-12 text-muted mx-auto mb-4" />
          <h3 className="text-lg font-medium text-fg mb-2">No File Selected</h3>
          <p className="text-secondary">
            Please select a processed file to begin export.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Processing Status Alert */}
      {isProcessing && (
        <Alert>
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>
            Backend processing in progress... Please wait for current operations to complete.
          </AlertDescription>
        </Alert>
      )}

      {/* Prerequisites Check */}
      {selectedFile.steps.sanitise !== 'done' && (
        <Alert>
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>
            At least sanitisation must be completed before export can begin.
          </AlertDescription>
        </Alert>
      )}

{/* Main Export Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Download className="w-5 h-5" />
              <span>Export</span>
            </CardTitle>
            {/* Status badges removed per user request */}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* AI Title Approval */}
          {(() => {
            const aiTitle = (selectedFile as any)?.enhanced_title;
            const approvalStatus = (selectedFile as any)?.title_approval_status;
            const showApproval = aiTitle && aiTitle.trim().length > 0 && approvalStatus === 'pending';
            if (!showApproval) return null;
            return (
              <Alert className="bg-status-info-bg border-status-info-border">
                <AlertCircle className="w-4 h-4 text-status-info-text" />
                <AlertDescription>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-status-info-text mb-1">AI-generated title available:</p>
                      <p className="text-sm text-status-info-text font-semibold italic">"{aiTitle}"</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          try {
                            const { apiService } = await import('../../../src/api');
                            const api = (apiService as any);
                            await api.approveTitle(selectedFile.id);
                            setTitle(aiTitle);
                          } catch (e: any) {
                            console.error('Failed to approve title:', e);
                          }
                        }}
                        className="bg-status-success-text hover:opacity-90 text-white"
                      >
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Yes, use this title
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            const { apiService } = await import('../../../src/api');
                            const api = (apiService as any);
                            await api.declineTitle(selectedFile.id);
                          } catch (e: any) {
                            console.error('Failed to decline title:', e);
                          }
                        }}
                        className="border-theme-border text-secondary hover:bg-surface-elevated"
                      >
                        No, I'll enter my own
                      </Button>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            );
          })()}

          {/* Title Input */}
          <div className="space-y-3 p-4 bg-surface-elevated rounded-lg">
            <div className="flex items-center space-x-2">
              <Edit3 className="w-4 h-4 text-secondary" />
              <Label htmlFor="export-title" className="text-sm font-medium text-fg">
                Document Title
              </Label>
            </div>
            <Input
              id="export-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter document title"
              className="font-medium bg-surface text-text-primary"
            />
            <p className="text-xs text-muted">
              Filename when exported: <span className="font-mono font-medium">{title || 'title'}.md</span>
            </p>
          </div>

          {/* Audio export toggle */}
          <div className="flex items-center justify-between p-3 bg-surface-elevated rounded-lg">
            <div>
              <Label className="text-sm font-medium text-fg">Include audio file in Obsidian export</Label>
              <p className="text-xs text-muted">
                When enabled, the original audio is copied to your Obsidian audio folder and embedded as <span className="font-mono">![[{(title || 'Title')}.m4a]]</span>.
              </p>
            </div>
            <Switch
              checked={includeAudio}
              onCheckedChange={(checked) => {
                setIncludeAudio(checked);
                setContent((prev) =>
                  checked ? injectAudioEmbedPreview(prev, title) : removeAudioEmbedPreview(prev, title)
                );
              }}
            />
          </div>

{/* Editor */}
          {error && (
            <Alert>
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {loading ? (
            <div className="text-sm text-secondary">Loading compiled.md…</div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="text-xs text-muted">{path || ''}</div>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full h-[60vh] border border-theme-border rounded-md p-3 font-mono text-sm bg-surface text-text-primary [&::selection]:bg-status-info-bg [&::selection]:text-status-info-text"
                  spellCheck={false}
                />
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => onSave(true)}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium bg-status-success-text text-white hover:opacity-90 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-status-success-border"
                  aria-label="Export compiled markdown"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Export</span>
                </button>
                <div className="text-xs text-muted">
                  Export paths are configured in <span className="font-mono">Settings → Paths</span>.
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

{/* Export Success */}
      {hasExportedContent && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <CheckCircle className="w-5 h-5 text-status-success-text" />
                <span>Export Completed</span>
              </CardTitle>
              <button
                onClick={() => setExportedSuccess(false)}
                className="text-muted hover:text-fg p-1 rounded"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="p-4 bg-status-success-bg rounded-lg">
              <p className="text-sm text-status-success-text">
                File has been successfully exported.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}