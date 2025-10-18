import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { Button } from '../../../shared/ui/button';
import { Input } from '../../../shared/ui/input';
import { Label } from '../../../shared/ui/label';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { 
  Download, 
  FileText, 
  FileDown, 
  CheckCircle, 
  AlertCircle,
  FolderOpen,
  Edit3
} from 'lucide-react';
import type { PipelineFile } from '../../../src/types/pipeline';

interface ExportTabProps {
  selectedFile: PipelineFile | null;
  files: PipelineFile[];
  onStartExport?: (fileId: string, format: string) => void;
}

export function ExportTab({ selectedFile, files }: ExportTabProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [path, setPath] = useState<string | null>(null);
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  // Track a local, definitive export success based on the most recent Save & Export response
  const [hasExportedContent, setExportedSuccess] = useState(false);

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
          setContent(resp.content || ''); 
          setPath(resp.path);
          // Extract title from response or use filename as fallback
          setTitle(resp.title || selectedFile.name.replace(/\.[^/.]+$/, ''));
        }
      } catch (e: any) {
        setError(e?.message || 'Failed to load compiled markdown');
      } finally {
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedFile?.id]);

  // Editing the content or title invalidates any prior "successfully exported" state
  React.useEffect(() => {
    setExportedSuccess(false);
  }, [content, title]);

  // Update YAML frontmatter when title changes
  React.useEffect(() => {
    if (!title || !content) return;
    
    // Update title in YAML frontmatter
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (yamlMatch) {
      const yamlBlock = yamlMatch[1];
      const updatedYaml = yamlBlock.replace(
        /^title:\s*.+$/m,
        `title: "${title}"`
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
      const resp = await api.saveCompiledMarkdown(selectedFile.id, content, exportToVault, vaultPath || undefined);
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
          <Download className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No File Selected</h3>
          <p className="text-gray-600">
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
          {/* Title Input */}
          <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-2">
              <Edit3 className="w-4 h-4 text-gray-600" />
              <Label htmlFor="export-title" className="text-sm font-medium text-gray-700">
                Document Title
              </Label>
            </div>
            <Input
              id="export-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter document title"
              className="font-medium bg-white"
            />
            <p className="text-xs text-gray-500">
              Filename when exported: <span className="font-mono font-medium">{title || 'title'}.md</span>
            </p>
          </div>

{/* Editor */}
          {error && (
            <Alert>
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {loading ? (
            <div className="text-sm text-gray-600">Loading compiled.md…</div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="text-xs text-gray-500">{path || ''}</div>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full h-[60vh] border rounded-md p-3 font-mono text-sm"
                  spellCheck={false}
                />
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => onSave(false)}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  aria-label="Save compiled markdown"
                >
                  <FileText className="w-4 h-4" />
                  <span>Save</span>
                </button>
                <button
                  onClick={() => onSave(true)}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
                  aria-label="Save and export compiled markdown"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Save & Export</span>
                </button>
                <Button variant="outline" onClick={async () => {
                  if (typeof window === 'undefined' || !window.electronAPI) {
                    alert('Folder selection available in desktop app only.');
                    return;
                  }
                  try {
                    setLoading(true); setError(null);
                    const res = await window.electronAPI.dialog.selectFolder();
                    if (!res.canceled && res.filePaths && res.filePaths[0]) setVaultPath(res.filePaths[0]);
                  } catch (e: any) { setError(e?.message || 'Folder select failed'); }
                  finally { setLoading(false); }
                }}>
                  <FolderOpen className="w-4 h-4 mr-2" />
                  {vaultPath ? 'Vault: ' + vaultPath : 'Select Obsidian Vault Folder'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

{/* Export Success */}
      {hasExportedContent && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span>Export Completed</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-green-800">
                File has been successfully exported.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}