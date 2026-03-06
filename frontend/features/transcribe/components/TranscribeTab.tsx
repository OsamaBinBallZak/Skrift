import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { Button } from '../../../shared/ui/button';
import { Badge } from '../../../shared/ui/badge';
import { Textarea } from '../../../shared/ui/textarea';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { 
  Mic, 
  Play, 
  Edit3, 
  Save, 
  X,
  Users,
  User,
  Clock,
  AlertCircle,
  PlayCircle,
  Timer,
  Music,
  Loader2
} from 'lucide-react';
import type { PipelineFile } from '../../../src/types/pipeline';
import { API_BASE_URL } from '../../../src/api';
import { BatchDropdown } from '../../../shared/BatchDropdown';

interface TranscribeTabProps {
  selectedFile: PipelineFile | null;
  files: PipelineFile[];
  onStartTranscription?: (fileId: string, conversationMode: boolean) => void;
  onSaveTranscriptEdit?: (fileId: string, content: string) => void;
  onBatchTranscribeAll?: () => void;
  onPauseBatch?: () => void;
  onResumeBatch?: () => void;
}

export function TranscribeTab({ 
  selectedFile, 
  files,
  onStartTranscription,
  onSaveTranscriptEdit
}: TranscribeTabProps) {
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState('');
  const [isStartingTranscription, setIsStartingTranscription] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [isStartingBatch, setIsStartingBatch] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const statusPollingRef = useRef<NodeJS.Timeout | null>(null);
  const batchPollRef = useRef<NodeJS.Timeout | null>(null);

  // Live debug streaming state for Whisper CLI output
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isStreamingTranscription, setIsStreamingTranscription] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const streamSourceRef = useRef<EventSource | null>(null);
  const liveOutputRef = useRef<HTMLDivElement | null>(null);

  // Defensive: safely compute derived state with null checks
  const processingFiles = files ? files.filter(f => f?.status?.includes?.('ing')) : [];
  const isProcessing = processingFiles.length > 0;
  const transcribingFiles = files ? files.filter(f => f?.status === 'transcribing') : [];
  const transcribableFiles = files ? files.filter(f => 
    f?.status === 'unprocessed' || f?.status === 'error'
  ) : [];
  
  const canTranscribe = selectedFile && !isProcessing && 
    (selectedFile?.status === 'unprocessed' || selectedFile?.status === 'error');
  const hasTranscript = selectedFile && 
    (selectedFile?.steps?.transcribe === 'done' || selectedFile?.status === 'transcribed' || selectedFile?.output);

  const startStatusPolling = () => {
    if (statusPollingRef.current) {
      clearInterval(statusPollingRef.current);
    }
    
    statusPollingRef.current = setInterval(() => {
      if (selectedFile && selectedFile.status !== 'transcribing' && selectedFile?.steps?.transcribe !== 'processing') {
        if (statusPollingRef.current) {
          clearInterval(statusPollingRef.current);
          statusPollingRef.current = null;
        }
      }
    }, 2000);
  };

  const handleStartTranscription = async () => {
    if (!selectedFile || !onStartTranscription) return;
    
    setIsStartingTranscription(true);
    setTranscriptionError(null);
    
    try {
      await onStartTranscription(selectedFile.id, selectedFile.conversationMode || false);
      startStatusPolling();
      // Automatically start live debug streaming alongside the real transcription
      handleStartStreamingTranscription();
    } catch (error) {
      setTranscriptionError(error instanceof Error ? error.message : 'Failed to start transcription');
    } finally {
      setIsStartingTranscription(false);
    }
  };

  // Poll for active batch
  useEffect(() => {
    const checkActiveBatch = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/batch/current`);
        if (response.ok) {
          const data = await response.json();
          if (data.active && data.batch) {
            setActiveBatchId(data.batch.batch_id);
          } else {
            setActiveBatchId(null);
          }
        }
      } catch (err) {
        console.error('Failed to check active batch:', err);
      }
    };

    // Check immediately
    checkActiveBatch();

    // Poll every 3 seconds
    batchPollRef.current = setInterval(checkActiveBatch, 3000);

    return () => {
      if (batchPollRef.current) {
        clearInterval(batchPollRef.current);
      }
    };
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (statusPollingRef.current) {
        clearInterval(statusPollingRef.current);
      }
    };
  }, []);

  // Cleanup transcription stream on unmount or when selected file changes
  useEffect(() => {
    return () => {
      if (streamSourceRef.current) {
        try {
          streamSourceRef.current.close();
        } catch {
          // Ignore close errors
        }
        streamSourceRef.current = null;
      }
      setIsStreamingTranscription(false);
    };
  }, [selectedFile?.id]);


  const handleEditTranscript = () => {
    setEditedTranscript(selectedFile?.output || '');
    setIsEditingTranscript(true);
  };

  const handleSaveTranscript = () => {
    if (selectedFile && onSaveTranscriptEdit) {
      onSaveTranscriptEdit(selectedFile.id, editedTranscript);
    }
    setIsEditingTranscript(false);
  };

  const handleCancelEdit = () => {
    setIsEditingTranscript(false);
    setEditedTranscript('');
  };

  const handleBatchTranscribeAll = async () => {
    if (transcribableFiles.length === 0) return;
    
    setIsStartingBatch(true);
    setBatchError(null);
    
    try {
      // Get IDs of all untranscribed files
      const fileIds = transcribableFiles.map(f => f.id);
      
      // Call batch API
      const response = await fetch('${API_BASE_URL}/api/batch/transcribe/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_ids: fileIds })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to start batch: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('Batch started:', result);
      
      // Set active batch ID to show the dropdown
      if (result.batch && result.batch.batch_id) {
        setActiveBatchId(result.batch.batch_id);
      }
      
      // Success! The batch is now running in the background
      // The UI will update via polling
      
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : 'Failed to start batch transcription');
      console.error('Batch transcription error:', error);
    } finally {
      setIsStartingBatch(false);
    }
  };

  const handleStartStreamingTranscription = () => {
    if (!selectedFile) return;

    // Close any previous stream
    if (streamSourceRef.current) {
      try {
        streamSourceRef.current.close();
      } catch {
        // ignore
      }
      streamSourceRef.current = null;
    }

    setStreamError(null);
    setLiveTranscript('');
    setIsStreamingTranscription(true);

    try {
      const url = `${API_BASE_URL}/api/process/transcribe/stream/${encodeURIComponent(selectedFile.id)}`;
      const es = new EventSource(url);
      streamSourceRef.current = es;

      // Inactivity timeout: if no token arrives for 5 minutes, assume backend is hung
      let inactivityTimer: ReturnType<typeof setTimeout>;
      const resetInactivity = () => {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
          setStreamError('Transcription stalled — no output for 5 minutes. Check backend logs.');
          setIsStreamingTranscription(false);
          try { es.close(); } catch { /* ignore */ }
          streamSourceRef.current = null;
        }, 5 * 60 * 1000);
      };
      resetInactivity();

      es.addEventListener('start', () => {
        setLiveTranscript('');
      });

      es.addEventListener('token', (e: Event) => {
        resetInactivity();
        const data = (e as MessageEvent).data?.toString() ?? '';
        setLiveTranscript(prev => (prev ? prev + '\n' + data : data));
        if (liveOutputRef.current) {
          liveOutputRef.current.scrollTop = liveOutputRef.current.scrollHeight;
        }
      });

      es.addEventListener('done', (e: Event) => {
        clearTimeout(inactivityTimer);
        const data = (e as MessageEvent).data?.toString() ?? '';
        if (data) {
          setLiveTranscript(prev => (prev ? prev + '\n\n' + data : data));
        }
        setIsStreamingTranscription(false);
        try {
          es.close();
        } catch {
          // ignore
        }
        streamSourceRef.current = null;
      });

      es.addEventListener('error', (e: Event) => {
        clearTimeout(inactivityTimer);
        console.error('Transcription stream error', e);
        setStreamError('Transcription stream error. See backend logs for details.');
        setIsStreamingTranscription(false);
        try {
          es.close();
        } catch {
          // ignore
        }
        streamSourceRef.current = null;
      });
    } catch (err) {
      console.error('Failed to start transcription stream', err);
      setStreamError('Failed to start transcription stream.');
      setIsStreamingTranscription(false);
    }
  };

  const handleStopTranscription = async () => {
    if (!selectedFile) return;

    // Stop local stream immediately
    if (streamSourceRef.current) {
      try {
        streamSourceRef.current.close();
      } catch {
        // ignore
      }
      streamSourceRef.current = null;
    }
    setIsStreamingTranscription(false);

    try {
      // Ask backend to cancel processing (this will also try to kill Whisper subprocess)
      await fetch(`${API_BASE_URL}/api/process/${encodeURIComponent(selectedFile.id)}/cancel`, {
        method: 'POST',
      });
    } catch (err) {
      console.error('Failed to cancel transcription', err);
    }
  };

  if (!selectedFile) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6 text-center">
            <Mic className="w-12 h-12 text-muted mx-auto mb-4" />
            <h3 className="text-lg font-medium text-fg mb-2">No File Selected</h3>
            <p className="text-secondary">
              Please select an audio file from the dropdown above to begin transcription.
            </p>
          </CardContent>
        </Card>

        {transcribableFiles.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <PlayCircle className="w-5 h-5" />
                <span>Batch Processing</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-status-info-bg rounded-lg">
                <div>
                  <p className="font-medium text-status-info-text">
                    {transcribableFiles.length} file{transcribableFiles.length > 1 ? 's' : ''} ready for transcription
                  </p>
                  <p className="text-sm text-status-info-text">
                    Backend will handle batch processing queue
                  </p>
                </div>
                <Button
                  onClick={handleBatchTranscribeAll}
                  disabled={isStartingBatch || isProcessing}
                  className="bg-btn-primary hover:opacity-90"
                >
                  {isStartingBatch ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Starting Batch...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-4 h-4 mr-2" />
                      Batch Transcribe All
                    </>
                  )}
                </Button>
              </div>
              
              {batchError && (
                <Alert className="border-status-error-border bg-status-error-bg">
                  <AlertCircle className="w-4 h-4 text-status-error-text" />
                  <AlertDescription className="text-status-error-text">
                    {batchError}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Create file name map for BatchDropdown
  const fileNameMap = files.reduce((acc, file) => {
    if (file?.id && file?.name) {
      acc[file.id] = file.name;
    }
    return acc;
  }, {} as { [key: string]: string });

  return (
    <div className="space-y-6">
      {/* Batch Progress Dropdown */}
      {activeBatchId && (
        <BatchDropdown
          batchId={activeBatchId}
          fileNames={fileNameMap}
          onCancel={() => {
            // Batch cancelled, will be detected by polling
          }}
          onClose={() => {
            setActiveBatchId(null);
          }}
        />
      )}

      {/* Transcription Actions */}
      <Card>
          <CardContent className="p-6">
          {transcriptionError && (
            <Alert className="border-status-error-border bg-status-error-bg mb-4">
              <AlertCircle className="w-4 h-4 text-status-error-text" />
              <AlertDescription className="text-status-error-text">
                {transcriptionError}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center space-x-3">
            {canTranscribe && !activeBatchId && (
              <Button 
                onClick={handleStartTranscription}
                disabled={isProcessing || isStartingTranscription}
                className="bg-btn-primary hover:opacity-90 text-white font-medium flex items-center space-x-2"
              >
                {isStartingTranscription ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Starting...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>Start Transcription</span>
                  </>
                )}
              </Button>
            )}

            {selectedFile?.status === 'transcribing' && !activeBatchId && (
              <div className="flex items-center space-x-2">
                <Button variant="outline" disabled className="flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Transcribing...</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={handleStopTranscription}
                  className="flex items-center space-x-1 text-status-error-text border-status-error-border hover:bg-status-error-bg/10"
                >
                  <X className="w-4 h-4" />
                  <span>Stop</span>
                </Button>
              </div>
            )}

            {transcribableFiles.length > 1 && !isProcessing && !activeBatchId && (
              <Button
                variant="outline"
                onClick={handleBatchTranscribeAll}
                disabled={isStartingBatch}
                className="bg-status-info-bg hover:bg-status-info-bg/80 text-status-info-text"
              >
                {isStartingBatch ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <PlayCircle className="w-4 h-4 mr-2" />
                    Batch All ({transcribableFiles.length})
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Live Whisper output (debug-only, does not affect pipeline status) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Live Whisper Output (Debug)</CardTitle>
            {isStreamingTranscription && (
              <span className="text-xs text-secondary flex items-center space-x-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Streaming...</span>
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {streamError && (
            <Alert className="border-status-error-border bg-status-error-bg mb-3">
              <AlertCircle className="w-4 h-4 text-status-error-text" />
              <AlertDescription className="text-status-error-text">
                {streamError}
              </AlertDescription>
            </Alert>
          )}
          <div
            ref={liveOutputRef}
            className="bg-surface-elevated border border-theme-border rounded-lg p-4 font-mono text-xs min-h-[200px] max-h-[300px] overflow-y-auto whitespace-pre-wrap"
          >
            {liveTranscript || (
              <span className="text-secondary">
                When you start transcription, raw Whisper output will appear here automatically. This does not change the saved transcript.
              </span>
            )}
            {isStreamingTranscription && <span className="animate-pulse text-fg">█</span>}
          </div>
        </CardContent>
      </Card>

      {hasTranscript && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Transcript Content</CardTitle>
              <div className="flex items-center space-x-2">
                {!isEditingTranscript ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleEditTranscript}
                  >
                    <Edit3 className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                ) : (
                  <div className="flex space-x-2">
                    <Button
                      size="sm"
                      onClick={handleSaveTranscript}
                      className="bg-status-success-text hover:opacity-90 text-white font-medium"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCancelEdit}
                      className="text-text-primary"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isEditingTranscript ? (
              <Textarea
                value={editedTranscript}
                onChange={(e) => setEditedTranscript(e.target.value)}
                className="min-h-40 font-mono text-sm"
                placeholder="Transcript content will be loaded from backend for editing..."
              />
            ) : (
              <div className="p-4 bg-surface-elevated rounded-lg">
                <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
                  {selectedFile?.output || 'No transcript available.'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  );
}
