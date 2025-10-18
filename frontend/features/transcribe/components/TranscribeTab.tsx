import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { Button } from '../../../shared/ui/button';
import { Badge } from '../../../shared/ui/badge';
import { Textarea } from '../../../shared/ui/textarea';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { 
  Mic, 
  Play, 
  Eye, 
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

interface TranscribeTabProps {
  selectedFile: PipelineFile | null;
  files: PipelineFile[];
  onStartTranscription?: (fileId: string, conversationMode: boolean) => void;
  onSaveTranscriptEdit?: (fileId: string, content: string) => void;
  onBatchTranscribeAll?: () => void;
  onPauseBatch?: () => void;
  onResumeBatch?: () => void;
}

// Helper function to calculate activity age
function getActivityAge(lastActivityAt: string | Date | undefined): string {
  if (!lastActivityAt) return 'never';
  
  const lastActivity = typeof lastActivityAt === 'string' ? new Date(lastActivityAt) : lastActivityAt;
  const now = new Date();
  const ageInSeconds = Math.floor((now.getTime() - lastActivity.getTime()) / 1000);
  
  if (ageInSeconds < 10) return 'just now';
  if (ageInSeconds < 60) return `${ageInSeconds} seconds ago`;
  
  const ageInMinutes = Math.floor(ageInSeconds / 60);
  if (ageInMinutes < 60) return `${ageInMinutes} minute${ageInMinutes > 1 ? 's' : ''} ago`;
  
  const ageInHours = Math.floor(ageInMinutes / 60);
  return `${ageInHours} hour${ageInHours > 1 ? 's' : ''} ago`;
}

// Helper function to check if activity is stale
function isActivityStale(lastActivityAt: string | Date | undefined, thresholdSeconds: number = 120): boolean {
  if (!lastActivityAt) return true;
  
  const lastActivity = typeof lastActivityAt === 'string' ? new Date(lastActivityAt) : lastActivityAt;
  const now = new Date();
  const ageInSeconds = (now.getTime() - lastActivity.getTime()) / 1000;
  
  return ageInSeconds > thresholdSeconds;
}

export function TranscribeTab({ 
  selectedFile, 
  files,
  onStartTranscription,
  onSaveTranscriptEdit
}: TranscribeTabProps) {
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState('');
  const [showTranscriptPreview, setShowTranscriptPreview] = useState(false);
  const [isStartingTranscription, setIsStartingTranscription] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const statusPollingRef = useRef<NodeJS.Timeout | null>(null);

  // Audio playback state/refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [, setIsPlaying] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _audioSrc = React.useMemo(() => {
    if (!selectedFile?.path) return undefined;
    // Build a file:// URL that handles spaces and special chars
    return encodeURI(`file://${selectedFile.path}`);
  }, [selectedFile?.path]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play();
      setIsPlaying(true);
    } else {
      a.pause();
      setIsPlaying(false);
    }
  };

  // Keep play state in sync with element events
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onEnded = () => setIsPlaying(false);
    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    a.addEventListener('ended', onEnded);
    a.addEventListener('pause', onPause);
    a.addEventListener('play', onPlay);
    return () => {
      a.removeEventListener('ended', onEnded);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('play', onPlay);
    };
  }, [audioRef.current]);

  // Pause when switching to a different file
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  }, [selectedFile?.id]);

  const processingFiles = files.filter(f => f.status.includes('ing'));
  const isProcessing = processingFiles.length > 0;
  const transcribingFiles = files.filter(f => f.status === 'transcribing');
  const transcribableFiles = files.filter(f => 
    f.status === 'unprocessed' || f.status === 'error'
  );
  
  const canTranscribe = selectedFile && !isProcessing && 
    (selectedFile.status === 'unprocessed' || selectedFile.status === 'error');
  const hasTranscript = selectedFile && 
    (selectedFile.steps.transcribe === 'done' || selectedFile.status === 'transcribed' || selectedFile.output);

  const startStatusPolling = () => {
    if (statusPollingRef.current) {
      clearInterval(statusPollingRef.current);
    }
    
    statusPollingRef.current = setInterval(() => {
      // Polling logic would be handled by the parent component
      // This is just to track that we should be polling
      if (selectedFile && selectedFile.status !== 'transcribing' && selectedFile.steps.transcribe !== 'processing') {
        clearInterval(statusPollingRef.current!);
        statusPollingRef.current = null;
      }
    }, 2000);
  };

  const handleStartTranscription = async () => {
    if (!selectedFile || !onStartTranscription) return;
    
    setIsStartingTranscription(true);
    setTranscriptionError(null);
    
    try {
      await onStartTranscription(selectedFile.id, selectedFile.conversationMode || false);
      // Start polling for status updates
      startStatusPolling();
    } catch (error) {
      setTranscriptionError(error instanceof Error ? error.message : 'Failed to start transcription');
    } finally {
      setIsStartingTranscription(false);
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (statusPollingRef.current) {
        clearInterval(statusPollingRef.current);
      }
    };
  }, []);

  // Auto-show transcript when it becomes available
  useEffect(() => {
    if (hasTranscript) {
      setShowTranscriptPreview(true);
    }
  }, [hasTranscript]);
  
  // Monitor for transcription completion and auto-refresh
  useEffect(() => {
    if (selectedFile && selectedFile.steps.transcribe === 'processing') {
      console.log('🎙️ Monitoring transcription for:', selectedFile.name);
      
      const checkInterval = setInterval(() => {
        // Force a re-render by updating local state
        setShowTranscriptPreview(prev => {
          // This will trigger a re-render even if the value doesn't change
          return prev;
        });
      }, 2000); // Check every 2 seconds
      
      return () => {
        console.log('🛑 Stopping transcription monitor');
        clearInterval(checkInterval);
      };
    }
  }, [selectedFile?.id, selectedFile?.steps.transcribe]);

  const handleEditTranscript = () => {
    setEditedTranscript(selectedFile?.output || ''); // Load current transcript content
    setIsEditingTranscript(true);
    setShowTranscriptPreview(true);
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

  if (!selectedFile) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6 text-center">
            <Mic className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No File Selected</h3>
            <p className="text-gray-600">
              Please select an audio file from the dropdown above to begin transcription.
            </p>
          </CardContent>
        </Card>

        {/* Batch Processing Controls */}
        {transcribableFiles.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <PlayCircle className="w-5 h-5" />
                <span>Batch Processing</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                <div>
                  <p className="font-medium text-blue-900">
                    {transcribableFiles.length} file{transcribableFiles.length > 1 ? 's' : ''} ready for transcription
                  </p>
                  <p className="text-sm text-blue-700">
                    Backend will handle batch processing queue
                  </p>
                </div>
                <Button
                  onClick={onBatchTranscribeAll}
                  disabled={isProcessing}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <PlayCircle className="w-4 h-4 mr-2" />
                  Batch Transcribe All
                </Button>
              </div>

              {transcribingFiles.length > 0 && (
                <Alert>
                  <PlayCircle className="w-4 h-4" />
                  <AlertDescription>
                    Backend processing in progress: {transcribingFiles.length} file{transcribingFiles.length > 1 ? 's' : ''}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Processing Status Alert */}
      {/* Reduce redundancy: hide global processing alert replacement when file panel already shows progress */}
      {isProcessing && !(selectedFile?.steps?.transcribe === 'processing' || selectedFile?.status === 'transcribing') && (
        <Alert>
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>
            Backend processing in progress... Please wait for current operations to complete.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Transcription Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Mic className="w-5 h-5" />
              <span>Audio Transcription</span>
            </CardTitle>
            <div className="flex items-center space-x-2">
              {selectedFile.conversationMode ? (
                <Badge className="bg-purple-100 text-purple-800">
                  <Users className="w-3 h-3 mr-1" />
                  Conversation
                </Badge>
              ) : (
                <Badge className="bg-blue-100 text-blue-800">
                  <User className="w-3 h-3 mr-1" />
                  Solo
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File Information */}
          <div className="grid grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm text-gray-600">File Size</p>
              <p className="font-medium">{selectedFile.size}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Duration</p>
              <p className="font-medium flex items-center">
                <Timer className="w-4 h-4 mr-1" />
                {selectedFile.duration || 'Unknown'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Format</p>
              <p className="font-medium flex items-center">
                <Music className="w-4 h-4 mr-1" />
                {selectedFile.format?.toUpperCase() || 'Unknown'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Processing</p>
              <p className="font-medium flex items-center">
                <Clock className="w-4 h-4 mr-1" />
                Backend Managed
              </p>
            </div>
          </div>

          {/* Audio Playback Controls removed as requested */}

          {/* Transcription Error Alert */}
          {transcriptionError && (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <AlertDescription className="text-red-700">
                {transcriptionError}
              </AlertDescription>
            </Alert>
          )}


          {/* Action Buttons */}
          <div className="flex items-center space-x-3">
            {canTranscribe && (
              <Button 
                onClick={handleStartTranscription}
                disabled={isProcessing || isStartingTranscription}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center space-x-2"
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

            {selectedFile.status === 'transcribing' && (
              <Button variant="outline" disabled className="flex items-center space-x-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Transcribing...</span>
              </Button>
            )}

            {hasTranscript && (
              <Button
                variant="outline"
                onClick={() => setShowTranscriptPreview(!showTranscriptPreview)}
              >
                <Eye className="w-4 h-4 mr-2" />
                {showTranscriptPreview ? 'Hide' : 'View'} Transcript
              </Button>
            )}
            

            {transcribableFiles.length > 1 && !isProcessing && (
              <Button
                variant="outline"
                onClick={onBatchTranscribeAll}
                className="bg-blue-50 hover:bg-blue-100 text-blue-700"
              >
                <PlayCircle className="w-4 h-4 mr-2" />
                Batch All ({transcribableFiles.length})
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Transcript Preview/Edit */}
      {showTranscriptPreview && hasTranscript && (
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
                      className="bg-blue-600 hover:bg-blue-700 text-white font-medium"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCancelEdit}
                      className="text-gray-700"
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
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {selectedFile?.output || 'No transcript available. Transcript content will be loaded from backend and displayed here...'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Batch Processing Status */}
      {transcribingFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <PlayCircle className="w-5 h-5" />
              <span>Batch Processing Status</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertDescription>
                Backend is processing {transcribingFiles.length} file{transcribingFiles.length > 1 ? 's' : ''}. 
                Status updates will be received from backend processing queue.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}
    </div>
  );
}