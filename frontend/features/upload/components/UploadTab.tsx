import React, { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { Button } from '../../../shared/ui/button';
import { Badge } from '../../../shared/ui/badge';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { Switch } from '../../../shared/ui/switch';
import { Label } from '../../../shared/ui/label';
import { Progress } from '../../../shared/ui/progress';
import { Separator } from '../../../shared/ui/separator';
import {
  Upload,
  FileAudio,
  FolderOpen,
  AlertCircle,
  X,
  Users,
  User,
  Music,
  HardDrive,
  Plus,
  FileWarning
} from 'lucide-react';

// Import hooks with correct path and add fallback handling
import type { PipelineFile } from '../../../src/types/pipeline';
import { fetchWithTimeout } from '../../../src/http';

interface UploadTabProps {
  files: PipelineFile[];
  selectedFileId: string | null;
  onFileSelect: (fileId: string) => void;
  onAddFiles: (files: File[], conversationMode: boolean) => void;
}

interface FilePreview {
  file: File;
  id: string;
  error?: string;
  size: string;
  duration?: string;
  format: string;
}

// Create a safe hook wrapper that handles Electron API availability
function useFileDialogSafe() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectFiles = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electronAPI) {
      // Fallback for when Electron API is not available
      return new Promise<{canceled: boolean, filePaths: string[]}>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus';
        
        input.onchange = (e) => {
          const files = (e.target as HTMLInputElement).files;
          if (files) {
            const filePaths = Array.from(files).map(f => f.name);
            resolve({ canceled: false, filePaths });
          } else {
            resolve({ canceled: true, filePaths: [] });
          }
        };
        
        input.click();
      });
    }

    try {
      setLoading(true);
      setError(null);
      const result = await window.electronAPI.dialog.selectFiles();
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to select files';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const selectFolder = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electronAPI) {
      console.log('Folder selection not available in browser mode');
      return { canceled: true, filePaths: [] };
    }

    try {
      setLoading(true);
      setError(null);
      const result = await window.electronAPI.dialog.selectFolder();
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to select folder';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  return { selectFiles, selectFolder, loading, error };
}

export function UploadTab({ 
  onAddFiles,
  onFileSelect
}: UploadTabProps) {
  const [conversationMode, setConversationMode] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [filePreviews, setFilePreviews] = useState<FilePreview[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { selectFolder, loading } = useFileDialogSafe();

  const supportedFormats = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus'];
  const maxFileSize = 500 * 1024 * 1024; // 500MB
  const isElectronAvailable = typeof window !== 'undefined' && window.electronAPI;

  const formatFileSize = useCallback((bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, []);

  const validateFile = useCallback((file: File): string | null => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    if (!extension || !supportedFormats.includes(extension)) {
      return `Unsupported format. Supported: ${supportedFormats.join(', ').toUpperCase()}`;
    }
    
    if (file.size > maxFileSize) {
      return `File too large. Maximum size: ${formatFileSize(maxFileSize)}`;
    }
    
    return null;
  }, [supportedFormats, maxFileSize, formatFileSize]);

  const processFiles = useCallback((fileList: FileList | File[]) => {
    const newPreviews: FilePreview[] = [];
    const filesArray = Array.from(fileList);

    filesArray.forEach((file) => {
      const error = validateFile(file);
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      
      newPreviews.push({
        file,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        error: error || undefined,
        size: formatFileSize(file.size),
        format: extension.toUpperCase(),
      });
    });

    setFilePreviews(prev => [...prev, ...newPreviews]);
  }, [validateFile, formatFileSize]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setDragActive(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  }, [processFiles]);

  const handleFileSelect = useCallback(async () => {
    console.log('🔍 handleFileSelect called');
    // For now, always use browser file input for simplicity
    // TODO: Implement proper binary file reading through Electron API later
    if (fileInputRef.current) {
      console.log('📁 Triggering file input click');
      fileInputRef.current.click();
    } else {
      console.error('❌ fileInputRef.current is null');
    }
  }, []);

  const handleFolderSelect = useCallback(async () => {
    if (!isElectronAvailable) {
      alert('Folder selection is only available in the desktop application.');
      return;
    }

    try {
      const result = await selectFolder();
      if (!result.canceled && result.filePaths.length > 0) {
        console.log('Selected folder:', result.filePaths[0]);
        // Process folder contents
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
    }
  }, [selectFolder, isElectronAvailable]);

  const removePreview = useCallback((id: string) => {
    setFilePreviews(prev => prev.filter(p => p.id !== id));
  }, []);

  const handleUpload = useCallback(async () => {
    const validFiles = filePreviews.filter(p => !p.error);
    if (validFiles.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Prepare files for FormData
      const formData = new FormData();
      validFiles.forEach(preview => {
        formData.append('files', preview.file);
      });
      formData.append('conversationMode', conversationMode.toString());

      // Update progress to show we're starting
      setUploadProgress(10);

      // Make API call to backend
      console.log('🚀 Uploading files to backend...', {
        fileCount: validFiles.length,
        conversationMode,
        fileNames: validFiles.map(p => p.file.name)
      });

      setUploadProgress(50);

      // Call the backend upload API
      const response = await fetchWithTimeout('http://localhost:8000/api/files/upload', {
        method: 'POST',
        body: formData,
        timeoutMs: 60000
      });

      setUploadProgress(80);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      setUploadProgress(100);

      console.log('✅ Upload successful!', result);

      // Call the parent component's onAddFiles with the uploaded files data
      if (result.success && result.files) {
        // Convert backend response to match expected format
        const uploadedFiles = result.files.map((backendFile: any) => ({
          ...backendFile,
          status: 'uploaded' // Add status for UI
        }));
        
        // Notify parent component of successful upload
        console.log('📤 Notifying parent of uploaded files:', uploadedFiles);

        // If exactly one file was uploaded, auto-select it immediately for convenience
        try {
          if (uploadedFiles.length === 1 && uploadedFiles[0]?.id) {
            onFileSelect(uploadedFiles[0].id);
          }
        } catch {
          // onFileSelect may not be defined in all contexts
        }
        
        // Actually call the parent callback to refresh the file list
        await onAddFiles(validFiles.map(p => p.file), conversationMode);
      }
      
      // Clear previews after successful upload
      setFilePreviews([]);
      setUploadProgress(0);

      // Show success message (could be replaced with toast notification)
      alert(`Successfully uploaded ${validFiles.length} file(s)!`);
      
    } catch (error) {
      console.error('❌ Upload error:', error);
      // Show error message (could be replaced with toast notification)
      alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  }, [filePreviews, conversationMode, onAddFiles, onFileSelect]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('📄 handleFileInputChange called');
    console.log('📁 Files selected:', e.target.files);
    if (e.target.files && e.target.files.length > 0) {
      console.log(`✅ Processing ${e.target.files.length} files`);
      processFiles(e.target.files);
    } else {
      console.log('❌ No files selected');
    }
  }, [processFiles]);

  const validFiles = filePreviews.filter(p => !p.error);
  const invalidFiles = filePreviews.filter(p => p.error);
  const totalSize = filePreviews.reduce((sum, p) => sum + p.file.size, 0);

  return (
    <div className="space-y-6">
      {/* Electron API Warning */}
      {!isElectronAvailable && (
        <Alert className="border-warning-200 bg-warning-50">
          <AlertCircle className="w-4 h-4 text-warning-600" />
          <AlertDescription className="text-warning-700">
            <strong>Demo Mode:</strong> You&apos;re running in browser mode. Some features like folder selection are only available in the desktop application.
          </AlertDescription>
        </Alert>
      )}

      {/* File Previews */}
      {filePreviews.length > 0 && (
        <Card className="border-border-primary bg-background-primary shadow-card">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <Music className="w-5 h-5 text-processing-600" />
                <span>Files to Upload</span>
                <div className="flex items-center space-x-2 ml-3">
                  <Badge variant="outline" className="text-xs">
                    {validFiles.length} valid
                  </Badge>
                  {invalidFiles.length > 0 && (
                    <Badge className="text-xs bg-error-100 text-error-700">
                      {invalidFiles.length} invalid
                    </Badge>
                  )}
                </div>
              </CardTitle>
              
              {/* Action buttons moved to header */}
              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setFilePreviews([])}
                  disabled={isUploading}
                  className="border-border-primary hover:bg-background-secondary"
                >
                  Clear All
                </Button>
                <Button
                  size="sm"
                  onClick={handleUpload}
                  disabled={validFiles.length === 0 || isUploading}
                  className="bg-processing-600 hover:bg-processing-700 text-white"
                >
                  {isUploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload {validFiles.length} File{validFiles.length > 1 ? 's' : ''}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {/* Upload Progress */}
            {isUploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">Uploading files...</span>
                  <span className="font-medium text-text-primary">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            {/* File List */}
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {filePreviews.map((preview) => (
                <div 
                  key={preview.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    preview.error 
                      ? 'border-error-200 bg-error-50' 
                      : 'border-border-primary bg-background-secondary'
                  }`}
                >
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    {preview.error ? (
                      <FileWarning className="w-5 h-5 text-error-500 flex-shrink-0" />
                    ) : (
                      <FileAudio className="w-5 h-5 text-processing-600 flex-shrink-0" />
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text-primary truncate">
                        {preview.file.name}
                      </p>
                      <div className="flex items-center space-x-3 text-xs text-text-secondary mt-1">
                        <span className="flex items-center space-x-1">
                          <HardDrive className="w-3 h-3" />
                          <span>{preview.size}</span>
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {preview.format}
                        </Badge>
                        {conversationMode && (
                          <Badge className="text-xs bg-processing-100 text-processing-700">
                            Conversation
                          </Badge>
                        )}
                      </div>
                      {preview.error && (
                        <p className="text-xs text-error-600 mt-1">
                          {preview.error}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removePreview(preview.id)}
                    disabled={isUploading}
                    className="text-text-muted hover:text-error-600 hover:bg-error-50"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Upload Summary */}
            {(validFiles.length > 0 || invalidFiles.length > 0) && (
              <>
                <Separator />
                <div className="space-y-1">
                  <div className="flex items-center space-x-2 text-sm">
                    <span className="text-text-tertiary">Total size:</span>
                    <span className="font-medium text-text-primary">
                      {formatFileSize(totalSize)}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm">
                    <span className="text-text-tertiary">Processing mode:</span>
                    <Badge variant="outline" className="text-xs">
                      {conversationMode ? 'Conversation Detection' : 'Single Speaker'}
                    </Badge>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Upload Area */}
      <Card className="border-border-primary bg-background-primary shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Upload className="w-5 h-5 text-processing-600" />
            <span>Add Audio Files</span>
            {!isElectronAvailable && (
              <Badge variant="outline" className="text-xs text-warning-600 bg-warning-50">
                Browser Mode
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Drag and Drop Zone */}
          <section
            className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              dragActive 
                ? 'border-processing-400 bg-processing-50' 
                : 'border-border-secondary bg-background-secondary hover:border-border-primary hover:bg-background-primary'
            }`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center space-y-3">
              <div className={`p-3 rounded-full ${
                dragActive ? 'bg-processing-100' : 'bg-background-tertiary'
              }`}>
                <FileAudio className={`w-6 h-6 ${
                  dragActive ? 'text-processing-600' : 'text-text-muted'
                }`} />
              </div>
              
              <div className="space-y-1">
                <h3 className="text-base font-medium text-text-primary">
                  {dragActive ? 'Drop files here' : 'Drop audio files here'}
                </h3>
                <p className="text-sm text-text-tertiary max-w-sm">
                  Drag and drop your audio files, or use the buttons below to select files or folders
                </p>
              </div>
              
              <div className="flex items-center space-x-3">
                <Button 
                  onClick={handleFileSelect}
                  disabled={loading || isUploading}
                  size="sm"
                  className="bg-processing-600 hover:bg-processing-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Select Files
                </Button>
                
                <Button 
                  variant="outline"
                  onClick={handleFolderSelect}
                  disabled={loading || isUploading || !isElectronAvailable}
                  size="sm"
                  className="border-border-primary hover:bg-background-secondary"
                >
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Select Folder
                </Button>
              </div>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={supportedFormats.map(f => `.${f}`).join(',')}
              onChange={handleFileInputChange}
              className="hidden"
            />
          </section>

          {/* Processing Options */}
          <section className="space-y-4">
            <h4 className="text-sm font-medium text-text-primary">Processing Options</h4>
            
            <div className="flex items-center justify-between p-4 bg-background-secondary rounded-lg border border-border-primary hover:bg-background-tertiary transition-colors">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-md transition-colors ${conversationMode ? 'bg-processing-100' : 'bg-primary-100'}`}>
                  {conversationMode ? (
                    <Users className="w-5 h-5 text-processing-600" />
                  ) : (
                    <User className="w-5 h-5 text-text-muted" />
                  )}
                </div>
                <div>
                  <Label 
                    htmlFor="conversation-mode" 
                    className="text-sm font-medium text-text-primary cursor-pointer"
                  >
                    Conversation Mode
                  </Label>
                  <p className="text-xs text-text-tertiary mt-1">
                    {conversationMode 
                      ? 'Multi-speaker detection and dialogue formatting enabled' 
                      : 'Enable speaker detection and dialogue formatting'
                    }
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                {conversationMode && (
                  <Badge className="text-xs bg-processing-100 text-processing-700 border-processing-200">
                    Active
                  </Badge>
                )}
                <Switch
                  id="conversation-mode"
                  checked={conversationMode}
                  onCheckedChange={setConversationMode}
                  disabled={isUploading}
                />
              </div>
            </div>
            
            {conversationMode && (
              <div className="ml-4 p-3 bg-processing-50 rounded-md border border-processing-200">
                <p className="text-xs text-processing-700">
                  <strong>Conversation Mode:</strong> The system will attempt to identify different speakers and format the transcript as a dialogue. This is ideal for interviews, meetings, and multi-person recordings.
                </p>
              </div>
            )}
          </section>

          {/* Supported Formats */}
          <section className="space-y-3">
            <h4 className="text-sm font-medium text-text-primary">Supported Formats</h4>
            <div className="flex flex-wrap gap-2">
              {supportedFormats.map((format) => (
                <Badge 
                  key={format} 
                  variant="outline" 
                  className="text-xs uppercase bg-background-tertiary"
                >
                  {format}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-text-tertiary">
              Maximum file size: {formatFileSize(maxFileSize)} per file
            </p>
          </section>
        </CardContent>
      </Card>

    </div>
  );
}