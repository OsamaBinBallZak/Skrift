import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './shared/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from './shared/ui/card';
import { Alert, AlertDescription } from './shared/ui/alert';
import { Button } from './shared/ui/button';
import { AlertCircle, Zap, Settings, FileAudio } from 'lucide-react';
import { GlobalFileSelector } from './shared/GlobalFileSelector';
import type { PipelineFile } from './src/types/pipeline';
import { SystemResourceMonitor } from './shared/SystemResourceMonitor';
import { UploadTab } from './features/upload';
import { TranscribeTab } from './features/transcribe';
import { SanitiseTab } from './features/sanitise';
import { EnhanceTab, EnhancementConfigProvider } from './features/enhance';
import { ExportTab } from './features/export';
import { SettingsTab } from './features/settings';
import { apiService } from './src/api';
import { fetchWithTimeout, fetchJsonWithRetry } from './src/http';
import { ThemeProvider } from './src/theme/ThemeProvider';

// Safe hook wrappers that handle when Electron API is not available
function useElectronAPISafe() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.electronAPI) {
        setIsAvailable(true);
      } else if (window.electronAPIError) {
        setError(window.electronAPIError);
      } else {
        setError('Electron API not available - running in browser mode');
      }
    }
  }, []);

  return { isAvailable, error, api: isAvailable ? window.electronAPI : null };
}

function useSystemInfoSafe() {
  const { api } = useElectronAPISafe();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSystemInfo = async () => {
      if (!api) {
        // Provide mock data for browser mode
        setData({
          appVersion: '1.0.0',
          platform: 'browser',
          electronVersion: 'N/A',
          nodeVersion: 'N/A',
          chromeVersion: navigator.userAgent.includes('Chrome') ? 'Chrome' : 'Browser'
        });
        setLoading(false);
        return;
      }

      try {
        const info = await api.system.getInfo();
        setData(info);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get system info');
      } finally {
        setLoading(false);
      }
    };

    fetchSystemInfo();
  }, [api]);

  return { data, loading, error };
}

function useThemeSafe() {
  const { api } = useElectronAPISafe();
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemTheme(mediaQuery.matches ? 'dark' : 'light');

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const changeTheme = async (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    if (api) {
      try {
        await api.theme.setTheme(newTheme);
      } catch (error) {
        console.error('Failed to change theme:', error);
      }
    }
  };

  const effectiveTheme = theme === 'system' ? systemTheme : theme;

  return { theme, systemTheme, effectiveTheme, changeTheme };
}

function usePipelineSafe() {
  const { api } = useElectronAPISafe();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startTranscription = async (fileId: string, options: any) => {
    if (!api) {
      // Use HTTP API when Electron API is not available
      console.log('Using HTTP API: Starting transcription for', fileId, options);
      try {
        setLoading(true);
        setError(null);
        const result = await apiService.startTranscription(fileId, options.conversationMode || false);
        return { success: true, jobId: fileId, ...result };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to start transcription';
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    }

    try {
      setLoading(true);
      setError(null);
      const result = await api.pipeline.startTranscription(fileId, options);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start transcription';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const startSanitise = async (fileId: string) => {
    if (!api) {
      // Use HTTP API when Electron API is not available (browser mode)
      console.log('Using HTTP API: Starting sanitisation for', fileId);
      try {
        setLoading(true);
        setError(null);
        const result = await apiService.startSanitise(fileId);
        return { success: true, jobId: fileId, ...result };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to start sanitisation';
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    }

    try {
      setLoading(true);
      setError(null);
      const result = await api.pipeline.startSanitise(fileId);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start sanitisation';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const startEnhancement = async (fileId: string, enhancementId: string, prompt: string) => {
    if (!api) {
      // Use HTTP API in browser mode so Enhance works without Electron
      console.log('Using HTTP API: Starting enhancement for', fileId, enhancementId);
      try {
        setLoading(true);
        setError(null);
        const body = {
          enhancementType: enhancementId || 'polish',
          prompt,
        } as any;

        const resp = await fetchWithTimeout(
          `http://localhost:8000/api/process/enhance/${encodeURIComponent(fileId)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            timeoutMs: 15000,
          }
        );
        if (!resp.ok) {
          const txt = await resp.text();
          throw new Error(`HTTP ${resp.status}: ${txt}`);
        }
        const data = await resp.json();
        return { success: true, jobId: fileId, ...data };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to start enhancement';
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    }

    try {
      // Use HTTP API in Electron too for consistent validation (avoids strict IPC arg validator)
      setLoading(true);
      setError(null);
      const apiHttp = (await import('./src/api')).apiService;
      const result = await apiHttp.startEnhancement(fileId, enhancementId || 'polish', prompt);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start enhancement';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const startExport = async (fileId: string, format: string) => {
    if (!api) {
      console.log('Mock: Starting export for', fileId, format);
      return { success: true, jobId: `mock-export-${Date.now()}` };
    }

    try {
      setLoading(true);
      setError(null);
      const result = await api.pipeline.startExport(fileId, format);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start export';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return { startTranscription, startSanitise, startEnhancement, startExport, loading, error };
}

// Normalize backend file shape to PipelineFile consistently
function transformBackendFile(file: any): PipelineFile {
  const steps = {
    transcribe: file.steps?.transcribe ?? 'pending',
    sanitise: file.steps?.sanitise ?? 'pending',
    enhance: file.steps?.enhance ?? 'pending',
    export: file.steps?.export ?? 'pending',
  } as PipelineFile['steps'];

  // Derive high-level status from steps with a simple priority order
  const status: PipelineFile['status'] =
    steps.export === 'processing' ? 'exporting' :
    steps.enhance === 'processing' ? 'enhancing' :
    steps.sanitise === 'processing' ? 'sanitising' :
    steps.transcribe === 'processing' ? 'transcribing' :
    steps.export === 'done' ? 'exported' :
    steps.enhance === 'done' ? 'enhanced' :
    steps.sanitise === 'done' ? 'sanitised' :
    steps.transcribe === 'done' ? 'transcribed' :
    file.status === 'error' || steps.transcribe === 'error' || steps.sanitise === 'error' || steps.enhance === 'error' || steps.export === 'error' ? 'error' :
    'unprocessed';

  const duration = file.audioMetadata?.duration ?? file.duration ?? undefined;

  return {
    id: file.id,
    name: file.filename,
    size: file.size ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : 'Unknown',
    status,
    path: file.path,
    addedTime: file.uploadedAt || new Date().toISOString(),
    progress: file.progress,
    progressMessage: file.progressMessage,
    output: file.transcript || undefined,
    sanitised: file.sanitised || undefined,
    // enhanced: file.enhanced || undefined,  // legacy field no longer used
    exported: file.exported || undefined,
    // carry through persisted enhancement fields so downstream can enable View
    enhanced_title: file.enhanced_title || undefined,
    title_approval_status: (file.title_approval_status ?? null) as PipelineFile['title_approval_status'],
    enhanced_copyedit: file.enhanced_copyedit || file.enhanced_working || file.enhanced || undefined,
    enhanced_summary: file.enhanced_summary || undefined,
    enhanced_tags: file.enhanced_tags || undefined,
    tag_suggestions: file.tag_suggestions || undefined,
    error: file.error || undefined,
    conversationMode: Boolean(file.conversationMode),
    duration,
    format: (file.filename?.split('.').pop() || 'unknown') as PipelineFile['format'],
    lastActivityAt: file.lastActivityAt,
    steps,
  };
}

function App() {
  const [activeTab, setActiveTab] = useState("upload");
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [pipelineFiles, setPipelineFiles] = useState<PipelineFile[]>(() => {
    try {
      const cached = localStorage.getItem('pipelineFiles');
      return cached ? (JSON.parse(cached) as PipelineFile[]) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Pending auto-select when a single file is uploaded
  const [pendingAutoSelectName, setPendingAutoSelectName] = useState<string | null>(null);

  // Fetch files from backend
  const fetchFiles = async (isPolling = false, allowEmpty = false) => {
    if (!isPolling) console.log('🔄 fetchFiles called');
    try {
      if (!isPolling) {
        setLoading(true);
        setError(null);
      }
      if (!isPolling) console.log('📡 Making API request to /api/files/');
      const data = await fetchJsonWithRetry<any[]>(
        'http://localhost:8000/api/files/',
        { timeoutMs: 10000 },
        { retries: 2, retryDelayMs: 400 }
      );
      if (!isPolling) console.log('📥 API response data:', data);
      
      // Transform backend data to PipelineFile format (normalize keys, statuses)
      const transformedFiles: PipelineFile[] = data.map((file: any) => transformBackendFile(file));

      // Sort newest first by addedTime (uploadedAt), fallback to lastActivityAt
      const sortedFiles = [...transformedFiles].sort((a, b) => {
        const aTime = new Date(a.addedTime || a.lastActivityAt || 0).getTime();
        const bTime = new Date(b.addedTime || b.lastActivityAt || 0).getTime();
        return bTime - aTime;
      });
      
      // If backend temporarily returns empty but we have files, treat as transient and keep previous state
      if (!allowEmpty && sortedFiles.length === 0 && pipelineFiles.length > 0) {
        if (!isPolling) console.warn('Received empty file list; keeping last known files to avoid UI flash');
        return;
      }

      // Only update state if there are actual changes (to prevent unnecessary re-renders)
      const hasChanges = JSON.stringify(sortedFiles) !== JSON.stringify(pipelineFiles);
      if (hasChanges || !isPolling) {
        if (!isPolling) console.log('✅ Setting pipeline files:', sortedFiles);
        setPipelineFiles(sortedFiles);
        try {
          localStorage.setItem('pipelineFiles', JSON.stringify(sortedFiles));
        } catch {
          // Ignore localStorage errors (quota exceeded, private browsing, etc.)
        }
      }
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err || 'Failed to fetch files');
      const isAbort = (err && err.name === 'AbortError') || /aborted a request/i.test(msg);
      if (!isPolling) {
        if (isAbort) {
          console.warn('Fetch aborted (likely timeout) — will retry once shortly.');
          setTimeout(() => fetchFiles(false), 500);
        } else {
          setError(msg);
          console.error('Error fetching files:', err);
        }
      }
    } finally {
      if (!isPolling) setLoading(false);
    }
  };

  // Electron API integration with safe fallbacks
  const { isAvailable: isElectronAvailable, error: electronError } = useElectronAPISafe();
  const { data: systemInfo } = useSystemInfoSafe();
  const { theme, effectiveTheme, changeTheme } = useThemeSafe();
  const { 
    startEnhancement, 
    startExport,
    loading: pipelineLoading,
    error: pipelineError 
  } = usePipelineSafe();

  // Apply theme and platform classes to document
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', effectiveTheme === 'dark');
      
      // Add electron-app class when running in Electron for specific optimizations
      if (isElectronAvailable) {
        document.documentElement.classList.add('electron-app');
      } else {
        document.documentElement.classList.remove('electron-app');
      }
    }
  }, [effectiveTheme, isElectronAvailable]);

  // Listen for one-shot refresh requests (e.g., after SSE done)
  useEffect(() => {
    const handler = () => {
      fetchFiles(false);
    };
    window.addEventListener('pipeline-refresh-request', handler as EventListener);
    return () => window.removeEventListener('pipeline-refresh-request', handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute derived state
  const selectedFile = pipelineFiles.find(f => f.id === selectedFileId) || null;
  const currentProcessingFile = pipelineFiles.find(f => 
    f.status === 'transcribing' || 
    f.status === 'sanitising' || 
    f.status === 'enhancing' || 
    f.status === 'exporting'
  );

  const isAnyProcessing = pipelineFiles.some(f => 
    f.status === 'transcribing' || 
    f.status === 'sanitising' || 
    f.status === 'enhancing' || 
    f.status === 'exporting'
  );

  // Load files on component mount
  useEffect(() => {
    console.log('🏗️ App component mounted, calling fetchFiles...');
    // Clear localStorage cache immediately to force fresh backend fetch
    try {
      localStorage.removeItem('pipelineFiles');
      localStorage.removeItem('selectedFileId');
    } catch {
      // Ignore localStorage errors
    }
    // Clear state and fetch fresh from backend
    setPipelineFiles([]);
    setSelectedFileId(null);
    fetchFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set up periodic polling for file status updates
  useEffect(() => {
    // Poll more frequently when files are processing
    const pollIntervalMs = isAnyProcessing ? 1500 : 3000; // 1.5s during processing, 3s otherwise
    console.log(`📊 Setting up polling interval: ${pollIntervalMs}ms (processing: ${isAnyProcessing})`);
    
    const pollInterval = setInterval(() => {
      console.log(`🔄 Polling files (interval: ${pollIntervalMs}ms)`);
      fetchFiles(true); // Pass true to indicate this is polling
    }, pollIntervalMs);

    return () => {
      console.log('🛑 Clearing polling interval');
      clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnyProcessing]); // Re-setup interval when processing state changes


  // Keep selection valid and prefer newest (first) when nothing selected
  useEffect(() => {
    const exists = selectedFileId ? pipelineFiles.some(f => f.id === selectedFileId) : false;
    if ((!selectedFileId || !exists) && pipelineFiles.length > 0) {
      setSelectedFileId(pipelineFiles[0].id);
    } else if (selectedFileId && !exists && pipelineFiles.length === 0) {
      setSelectedFileId(null);
    }
    // Persist selection and files for better UX on reload
    try {
      localStorage.setItem('pipelineFiles', JSON.stringify(pipelineFiles));
      if (selectedFileId) localStorage.setItem('selectedFileId', selectedFileId);
    } catch {
      // Ignore localStorage errors
    }
  }, [selectedFileId, pipelineFiles]);

  // Event handlers
  const handleFileSelect = (fileId: string) => {
    setSelectedFileId(fileId);
  };

  // When we know a filename to auto-select, pick it once files arrive
  useEffect(() => {
    if (!pendingAutoSelectName) return;
    const match = pipelineFiles.find(f => f.name === pendingAutoSelectName);
    if (match) {
      setSelectedFileId(match.id);
      setPendingAutoSelectName(null);
    }
  }, [pipelineFiles, pendingAutoSelectName]);

  const handleRetryFile = async (fileId: string) => {
    console.log('Retry file processing for', fileId);
    // TODO: Implement retry logic
  };

  const handleViewErrorLog = async (fileId: string) => {
    console.log('Open error log for', fileId);
    // TODO: Implement error log viewing
  };

  const handleDeleteFile = async (fileId: string) => {
    try {
      setLoading(true);
      console.log('🗑️ Deleting file:', fileId);
      
      const response = await fetchWithTimeout(`http://localhost:8000/api/files/${fileId}`, {
        method: 'DELETE',
        timeoutMs: 10000
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Delete failed: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('✅ File deleted successfully:', result);
      
      // If deleted file was selected, clear selection
      if (selectedFileId === fileId) {
        setSelectedFileId(null);
      }
      
      // Refresh the file list; allow empty responses to reflect deletions
      await fetchFiles(false, true);
      // After refresh, if nothing selected but files exist, the effect above will auto-select the newest
      
    } catch (error) {
      console.error('❌ Delete error:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete file');
      // Still refresh to sync state even on error
      await fetchFiles(false, true);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchTranscribeAll = async () => {
    console.log('Start batch transcription');
    // TODO: Implement batch processing
  };

  const handlePauseBatch = async () => {
    console.log('Pause batch processing');
    // TODO: Implement batch pause
  };

  const handleResumeBatch = async () => {
    console.log('Resume batch processing');
    // TODO: Implement batch resume
  };

  const handleStartTranscription = async (fileId: string, conversationMode: boolean) => {
    try {
      console.log('Starting transcription:', fileId, { conversationMode });
      const result = await apiService.startTranscription(fileId, conversationMode);
      console.log('Transcription started:', result);
      
      // Update the file status locally for immediate UI feedback
      setPipelineFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'transcribing' } : f));
      
      // Force immediate refresh
      setTimeout(() => fetchFiles(false), 500);
      
      // Continue polling more frequently while processing
      const checkCompletion = setInterval(async () => {
        const file = await fetchJsonWithRetry<any>(
          `http://localhost:8000/api/files/${fileId}`,
          { timeoutMs: 10000 },
          { retries: 2, retryDelayMs: 400 }
        );
        if (
          file.steps?.transcribe === 'done' ||
          file.steps?.transcribe === 'error' ||
          file.steps?.transcribe === 'pending' // covers manual cancellation/reset
        ) {
          clearInterval(checkCompletion);
          fetchFiles(false); // Final refresh when done or cancelled
        }
      }, 1000);
      
    } catch (error) {
      console.error('Failed to start transcription:', error);
      // Refresh to get latest status even on error
      setTimeout(() => fetchFiles(false), 1000);
      throw error; // Re-throw so TranscribeTab can handle the error
    }
  };

const handleSaveTranscriptEdit = async (fileId: string, content: string) => {
    console.log('Save transcript edit for', fileId);
    try {
      const response = await fetchWithTimeout(`http://localhost:8000/api/files/${fileId}/transcript`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: content }),
        timeoutMs: 15000
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to save transcript: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ Transcript saved successfully:', result);
      await fetchFiles(false, true); // Refresh file list to reflect new changes
    } catch (error) {
      console.error('❌ Save transcript error:', error);
      setError(error instanceof Error ? error.message : 'Failed to save transcript');
    }
  };

  const handleAddFiles = async (files: File[], conversationMode: boolean) => {
    console.log('Add files to pipeline', files.length, 'conversation mode:', conversationMode);
    // If exactly one file was uploaded, remember its name to auto-select once it appears
    if (files.length === 1) {
      setPendingAutoSelectName(files[0].name);
    }
    // Refresh the file list after upload
    await fetchFiles(false, true);
  };

  const [disambSession, setDisambSession] = useState<any | null>(null);

  const handleStartSanitisation = async (fileId: string) => {
    try {
      // Call backend (do not pre-mark processing; 409 may require user input)
      const result = await apiService.startSanitise(fileId);
      console.log('Sanitise response:', result);
      if (result && result.status === 'needs_disambiguation') {
        setDisambSession({ fileId, ...result, index: 0, decisions: [] });
        // Ensure UI not stuck as processing
        await fetchFiles(false, true);
        return; // wait for resolve
      }
      
      // Backend has started processing; reflect it locally for snappier UI
      setPipelineFiles(prev => prev.map(f => {
        if (f.id !== fileId) return f;
        return { ...f, status: 'sanitising', steps: { ...f.steps, sanitise: 'processing' } };
      }));

      // Force an immediate refresh to pick up backend updates
      await fetchFiles(false);

      // Actively poll this file until sanitise completes or errors
      const startedAt = Date.now();
      const checkCompletion = setInterval(async () => {
        try {
          const file = await fetchJsonWithRetry<any>(
            `http://localhost:8000/api/files/${fileId}`,
            { timeoutMs: 10000 },
            { retries: 2, retryDelayMs: 400 }
          );
          const step = file?.steps?.sanitise;
          if (step === 'done' || step === 'error') {
            clearInterval(checkCompletion);
            fetchFiles(false); // Final refresh when done
          } else {
            // Safety timeout after 30s to avoid infinite polling
            if (Date.now() - startedAt > 30000) {
              clearInterval(checkCompletion);
              fetchFiles(false);
            }
          }
        } catch (e) {
          clearInterval(checkCompletion);
          fetchFiles(false);
        }
      }, 1000);
    } catch (error) {
      console.error('Failed to start sanitise:', error);
      setTimeout(() => fetchFiles(false), 500);
    }
  };

  const handleStartEnhancement = async (fileId: string, enhancementId: string, prompt: string) => {
    try {
      // Immediate local feedback: mark as enhancing
      setPipelineFiles(prev => prev.map(f => {
        if (f.id !== fileId) return f;
        return {
          ...f,
          status: 'enhancing',
          steps: { ...f.steps, enhance: 'processing' },
        };
      }));

      // Trigger the backend
      const result = await startEnhancement(fileId, enhancementId, prompt);
      console.log('Enhancement started:', result);

      // Force an immediate refresh to pick up backend updates
      await fetchFiles(false);

      // Poll this file until enhance completes or errors (with safety timeout)
      const startedAt = Date.now();
      const checkCompletion = setInterval(async () => {
        try {
          const file = await fetchJsonWithRetry<any>(
            `http://localhost:8000/api/files/${fileId}`,
            { timeoutMs: 10000 },
            { retries: 2, retryDelayMs: 400 }
          );
          const step = file?.steps?.enhance;
          if (step === 'done' || step === 'error') {
            clearInterval(checkCompletion);
            fetchFiles(false); // Final refresh when done
          } else {
            // Safety timeout after 60s to avoid infinite polling
            if (Date.now() - startedAt > 60000) {
              clearInterval(checkCompletion);
              fetchFiles(false);
            }
          }
        } catch (e) {
          clearInterval(checkCompletion);
          fetchFiles(false);
        }
      }, 1000);
    } catch (error) {
      console.error('Failed to start enhancement:', error);
      // Refresh to get latest status even on error
      setTimeout(() => fetchFiles(false), 500);
    }
  };

  const handleStartExport = async (fileId: string, format: string) => {
    try {
      const result = await startExport(fileId, format);
      console.log('Export started:', result);
    } catch (error) {
      console.error('Failed to start export:', error);
    }
  };

  // Simple Disambiguation Modal
  const DisambModal = () => {
    if (!disambSession) return null;
    const { occurrences = [], index = 0 } = disambSession;
    const occ = occurrences[index];
    if (!occ) return null;
    const pick = async (person_id: string, applyToRemaining: boolean) => {
      // Record decision
      const next = { ...disambSession };
      next.decisions.push({ alias: occ.alias, offset: occ.offset, person_id, apply_to_remaining: applyToRemaining });

      // If applying to remaining, fast-forward the wizard to the next occurrence with a different alias
      if (applyToRemaining) {
        let j = index + 1;
        while (j < next.occurrences.length && next.occurrences[j].alias === occ.alias) j++;
        next.index = j;
      } else {
        next.index = index + 1;
      }
      // If done, submit decisions
      if (next.index >= occurrences.length) {
        try {
          const payload = { session_id: disambSession.session_id, decisions: next.decisions };
          await apiService.resolveSanitise(disambSession.fileId, payload);
        } catch (e) {
          console.error('Resolve sanitise failed', e);
        } finally {
          setDisambSession(null);
          // Refresh files to pick up sanitised text
          fetchFiles(false);
        }
      } else {
        setDisambSession(next);
      }
    };
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/60">
        <div className="bg-background-primary rounded-lg shadow-lg w-[680px] max-w-[90vw] p-4 border border-border-primary">
          <div className="font-medium mb-2 text-text-primary">Disambiguate “{occ.alias}”</div>
          <div className="text-sm text-text-secondary mb-3">
            <div
              className="font-mono whitespace-pre-wrap text-xs bg-background-tertiary text-text-secondary p-2 rounded mb-2 truncate"
              title={`${occ.context_before}[${occ.alias}]${occ.context_after}`}
            >
              …{occ.context_before}
              <span className="bg-status-warning-bg text-status-warning-text px-1 rounded">{occ.alias}</span>
              {occ.context_after}…
            </div>
            <div className="text-xs text-text-tertiary mb-2">
              Pick the person for this occurrence. First mention → canonical link; subsequent mentions → short (nickname).
            </div>
          </div>
          <div className="space-y-2">
            {occ.candidates.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between p-2 border border-border-secondary rounded bg-surface-elevated">
                <div className="text-sm text-text-primary">
                  <div>
                    <span className="bg-status-success-bg text-status-success-text px-1 rounded">
                      Canonical: {c.canonical}
                    </span>
                  </div>
                  <div className="text-xs text-text-secondary mt-1">
                    <span className="font-medium">Short:</span> {c.short || '—'}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded"
                    onClick={() => pick(c.id, false)}
                    title="Apply only to this occurrence"
                  >
                    Apply
                  </button>
                  <button
                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded"
                    onClick={() => pick(c.id, true)}
                    title={`Apply to all remaining “${occ.alias}” in this file`}
                  >
                    Apply to remaining
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-3 text-xs text-text-tertiary">
            <div>Occurrence {index + 1} / {occurrences.length}</div>
            <button
              className="text-text-muted hover:text-text-primary"
              onClick={async () => {
                try {
                  if (disambSession?.fileId) await apiService.cancelSanitise(disambSession.fileId);
                } catch {
                  /* Ignore cancel errors */
                }
                setDisambSession(null);
                await fetchFiles(false, true);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <ThemeProvider>
      <EnhancementConfigProvider>
        <main className="bg-background-secondary font-smooth">
        <div className="max-w-screen-2xl mx-auto p-6 min-h-screen">
          <Card className="w-full border-border-primary bg-background-primary shadow-card">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="text-left flex-1">
                  <div className="flex items-center justify-center space-x-6">
                    {/* Logo + Title */}
                    <div className="flex items-center space-x-3">
                      <div className="p-2 rounded-xl border-0 ring-0">
                        <img 
                          src="./skrift-icon.png" 
                          alt="Skrift Icon" 
                          className="w-14 h-14 rounded-lg border-0 ring-0"
                        />
                      </div>
                      <CardTitle className="text-xl text-text-primary">SKRIFT</CardTitle>
                    </div>
                    {/* Tagline + Version to the right */}
                    <div className="flex flex-col">
                      <div className="text-sm text-text-tertiary">
                        Batch processing system for audio transcription and enhancement
                      </div>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-xs text-text-muted">v{systemInfo?.appVersion || '1.0.0'}</span>
                        <span className="text-xs text-text-muted">•</span>
                        <span className="text-xs text-text-muted">Big Money Hartog</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* System Resource Monitor */}
                <div className="flex-shrink-0">
                  <SystemResourceMonitor
                    currentProcessingFile={currentProcessingFile?.name}
                    processingStep={currentProcessingFile?.status}
                    compact={true}
                  />
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-6">
              {/* Electron API Warning */}
              {!isElectronAvailable && (
                <Alert className="border-warning-200 bg-warning-50 animate-fade-in">
                  <AlertCircle className="w-4 h-4 text-warning-600" />
                  <AlertDescription className="text-warning-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <strong>Browser Mode:</strong> You&apos;re running the web version.
                        For full functionality including file system access and system monitoring, 
                        please use the desktop application.
                        {electronError && (
                          <div className="text-xs mt-1 text-warning-600">
                            {electronError}
                          </div>
                        )}
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Global Processing Warning */}
              {isAnyProcessing && activeTab !== 'transcribe' && (
                <Alert className="border-processing-200 bg-processing-50 animate-fade-in">
                  <AlertCircle className="w-4 h-4 text-processing-600" />
                  <AlertDescription className="text-processing-700">
                    <div className="flex items-center justify-between">
                      <span>
                        Processing in progress... Some features are disabled while files are being processed.
                        Currently processing: <strong>{currentProcessingFile?.name}</strong>
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handlePauseBatch}
                        disabled={pipelineLoading}
                        className="ml-4 border-processing-300 text-processing-700 hover:bg-processing-100"
                      >
                        Pause
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Pipeline Error Alert */}
              {pipelineError && (
                <Alert className="border-error-200 bg-error-50">
                  <AlertCircle className="w-4 h-4 text-error-600" />
                  <AlertDescription className="text-error-700">
                    Pipeline Error: {pipelineError}
                  </AlertDescription>
                </Alert>
              )}


              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-6 bg-background-tertiary p-1 rounded-lg sticky top-0 z-10">
                  <TabsTrigger value="upload">
                    <FileAudio className="w-4 h-4 mr-2" />
                    Upload
                  </TabsTrigger>
                  <TabsTrigger value="transcribe">
                    Transcribe
                  </TabsTrigger>
                  <TabsTrigger value="sanitise">
                    Sanitise
                  </TabsTrigger>
                  <TabsTrigger value="enhance">
                    Enhance
                  </TabsTrigger>
                  <TabsTrigger value="export">
                    Export
                  </TabsTrigger>
                  <TabsTrigger value="settings">
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </TabsTrigger>
                </TabsList>
                
              {/* Loading State */}
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <div className="text-text-secondary">Loading files...</div>
                </div>
              )}

              {/* Error State */}
              {error && (
                <Alert className="border-error-200 bg-error-50">
                  <AlertCircle className="w-4 h-4 text-error-600" />
                  <AlertDescription className="text-error-700">
                    <div className="flex items-center justify-between">
                      <span>Failed to load files: {error}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fetchFiles(false)}
                        className="ml-4 border-error-300 text-error-700 hover:bg-error-100"
                      >
                        Retry
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Global File Selector - appears on all tabs except settings */}
                {/* Hide empty state on upload tab to avoid redundancy */}
                {activeTab !== 'settings' && !loading && (activeTab !== 'upload' || pipelineFiles.length > 0) && (
                  <section className="mt-6">
                    <GlobalFileSelector
                      files={pipelineFiles}
                      selectedFileId={selectedFileId}
                      onFileSelect={handleFileSelect}
                      onRetryFile={handleRetryFile}
                      onViewErrorLog={handleViewErrorLog}
                      onDeleteFile={handleDeleteFile}
                    />
                  </section>
                )}
                
                <TabsContent value="upload" className="mt-6 tab-content">
                  <UploadTab 
                    files={pipelineFiles}
                    selectedFileId={selectedFileId}
                    onFileSelect={handleFileSelect}
                    onAddFiles={handleAddFiles}
                  />
                </TabsContent>
                
                <TabsContent value="transcribe" className="mt-6 tab-content">
                  <TranscribeTab 
                    selectedFile={selectedFile}
                    files={pipelineFiles}
                    onStartTranscription={handleStartTranscription}
                    onSaveTranscriptEdit={handleSaveTranscriptEdit}
                    onBatchTranscribeAll={handleBatchTranscribeAll}
                    onPauseBatch={handlePauseBatch}
                    onResumeBatch={handleResumeBatch}
                  />
                </TabsContent>
                
                <TabsContent value="sanitise" className="mt-6 tab-content">
                  <SanitiseTab 
                    selectedFile={selectedFile}
                    files={pipelineFiles}
                    onStartSanitisation={handleStartSanitisation}
                  />
                </TabsContent>
                
                <TabsContent value="enhance" className="mt-6 tab-content">
                  <EnhanceTab 
                    selectedFile={selectedFile}
                    files={pipelineFiles}
                    onStartEnhancement={handleStartEnhancement}
                  />
                </TabsContent>
                
                <TabsContent value="export" className="mt-6 tab-content">
                  <ExportTab 
                    selectedFile={selectedFile}
                    files={pipelineFiles}
                    onStartExport={handleStartExport}
                  />
                </TabsContent>
                
                <TabsContent value="settings" className="mt-6 tab-content">
                  <SettingsTab 
                    currentTheme={theme}
                    onThemeChange={changeTheme}
                    systemInfo={systemInfo}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </main>
        <DisambModal />
      </EnhancementConfigProvider>
    </ThemeProvider>
  );
}

export default App;