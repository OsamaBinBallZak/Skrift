import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger } from './ui/select';
import { Alert, AlertDescription } from './ui/alert';
import { 
  FileAudio, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  RotateCcw, 
  FileText, 
  Users, 
  User,
  Music,
  Timer,
  Folder,
  Trash2
} from 'lucide-react';
import type { PipelineFile } from '../src/types/pipeline';

// Re-export for convenience (backwards compatibility)
export type { PipelineFile };

interface GlobalFileSelectorProps {
  files: PipelineFile[];
  selectedFileId: string | null;
  onFileSelect: (fileId: string) => void;
  onRetryFile: (fileId: string) => void;
  onViewErrorLog: (fileId: string) => void;
  onDeleteFile: (fileId: string) => void;
}

export function GlobalFileSelector({ 
  files, 
  selectedFileId, 
  onFileSelect, 
  onRetryFile, 
  onViewErrorLog,
  onDeleteFile
}: GlobalFileSelectorProps) {
  const selectedFile = files.find(f => f.id === selectedFileId);

  const getStatusIcon = (status: string) => {
    const iconProps = { className: "w-4 h-4" };
    
    switch (status) {
      case 'exported':
        return <CheckCircle {...iconProps} className="w-4 h-4 text-success-500" />;
      case 'error':
        return <AlertCircle {...iconProps} className="w-4 h-4 text-error-500" />;
      case 'transcribing':
      case 'sanitising':
      case 'enhancing':
      case 'exporting':
        return <Clock {...iconProps} className="w-4 h-4 text-processing-500 animate-pulse" />;
      default:
        return <FileAudio {...iconProps} className="w-4 h-4 text-text-muted" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      exported: 'bg-badge-exported-bg text-badge-exported-text border-success-200',
      enhanced: 'bg-badge-enhanced-bg text-badge-enhanced-text border-purple-200',
      sanitised: 'bg-badge-sanitised-bg text-badge-sanitised-text border-processing-200',
      transcribed: 'bg-badge-transcribed-bg text-badge-transcribed-text border-indigo-200',
      transcribing: 'bg-badge-processing-bg text-badge-processing-text border-processing-200',
      sanitising: 'bg-badge-processing-bg text-badge-processing-text border-processing-200',
      enhancing: 'bg-badge-processing-bg text-badge-processing-text border-processing-200',
      exporting: 'bg-badge-processing-bg text-badge-processing-text border-processing-200',
      error: 'bg-badge-error-bg text-badge-error-text border-error-200',
      unprocessed: 'bg-badge-unprocessed-bg text-badge-unprocessed-text border-border-secondary'
    };

    const labels = {
      exported: 'Exported',
      enhanced: 'Enhanced',
      sanitised: 'Sanitised',
      transcribed: 'Transcribed',
      transcribing: 'Transcribing',
      sanitising: 'Sanitising',
      enhancing: 'Enhancing',
      exporting: 'Exporting',
      error: 'Error',
      unprocessed: 'Unprocessed'
    };
    
    const variantClass = variants[status as keyof typeof variants] || variants.unprocessed;
    const label = labels[status as keyof typeof labels] || 'Unknown';
    
    return (
      <Badge className={`text-xs border ${variantClass}`}>
        {label}
      </Badge>
    );
  };

  // Reserved for future progress indicator feature
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getOverallProgress = (file: PipelineFile) => {
    const steps = Object.values(file.steps);
    const completed = steps.filter(step => step === 'done').length;
    const total = steps.length;
    return Math.round((completed / total) * 100);
  };

  if (files.length === 0) {
    return (
      <Card className="border-border-primary bg-background-primary shadow-card">
        <CardContent className="p-8 text-center">
          <div className="flex flex-col items-center space-y-4">
            <div className="p-4 rounded-full bg-background-tertiary">
              <Folder className="w-8 h-8 text-text-muted" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-medium text-text-primary">No Files in Pipeline</h3>
              <p className="text-text-tertiary max-w-sm">
                Add audio files using the Upload tab to begin processing. Supported formats include MP3, WAV, M4A, and FLAC.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border-primary bg-background-primary shadow-card">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileAudio className="w-5 h-5 text-processing-600" />
            <span>Pipeline Files</span>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="text-xs">
              {files.length} file{files.length > 1 ? 's' : ''}
            </Badge>
            {files.some(f => f.status.includes('ing')) && (
              <Badge className="text-xs bg-processing-100 text-processing-700 animate-pulse">
                Processing
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* File Selector */}
        <section>
          <div className="flex items-center space-x-2">
            <Select value={selectedFileId || ''} onValueChange={onFileSelect}>
              <SelectTrigger className="flex-1 p-4 h-auto bg-background-secondary border-border-primary hover:border-border-focus focus:border-border-focus transition-colors">
                {selectedFile ? (
                  <div className="flex items-start justify-between w-full">
                    <div className="flex items-start space-x-3 flex-1 min-w-0">
                      {getStatusIcon(selectedFile.status)}
                      <div className="flex-1 min-w-0 text-left">
                        <h4 className="font-medium text-text-primary truncate">
                          {selectedFile.name}
                        </h4>
                        <div className="flex items-center space-x-4 text-sm text-text-secondary mt-1">
                          <span className="flex items-center space-x-1">
                            <Music className="w-3 h-3" />
                            <span>{selectedFile.size}</span>
                          </span>
                          {selectedFile.duration && (
                            <span className="flex items-center space-x-1">
                              <Timer className="w-3 h-3" />
                              <span>{selectedFile.duration}</span>
                            </span>
                          )}
                          <span className="flex items-center space-x-1">
                            {selectedFile.conversationMode ? (
                              <Users className="w-3 h-3" />
                            ) : (
                              <User className="w-3 h-3" />
                            )}
                            <span>{selectedFile.conversationMode ? 'Conversation' : 'Solo'}</span>
                          </span>
                          {selectedFile.format && (
                            <span className="uppercase text-xs font-medium px-2 py-1 bg-background-tertiary rounded">
                              {selectedFile.format}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-3 flex-shrink-0">
                      {getStatusBadge(selectedFile.status)}
                    </div>
                  </div>
                ) : (
                  <span className="text-text-tertiary">Choose a file to work with</span>
                )}
              </SelectTrigger>
            <SelectContent className="bg-background-primary border-border-primary">
              {files.map((file) => (
                <SelectItem key={file.id} value={file.id} className="hover:bg-background-secondary">
                  <div className="flex items-center space-x-3 w-full">
                    {getStatusIcon(file.status)}
                    <div className="flex-1 min-w-0">
                      <span className="truncate font-medium text-text-primary">
                        {file.name}
                      </span>
                      <div className="flex items-center space-x-2 text-xs text-text-tertiary mt-1">
                        <span>{file.size}</span>
                        {file.duration && (
                          <>
                            <span>•</span>
                            <span>{file.duration}</span>
                          </>
                        )}
                        <span>•</span>
                        <span className="capitalize">{file.conversationMode ? 'Conversation' : 'Solo'}</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {getStatusBadge(file.status)}
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
            {/* Delete button outside of Select to prevent event conflicts */}
            {selectedFile && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (confirm(`Are you sure you want to delete "${selectedFile.name}"? This will permanently remove the file and all its processed data.`)) {
                    onDeleteFile(selectedFile.id);
                  }
                }}
                className="text-error-600 border-error-300 hover:bg-error-100 hover:border-error-400"
                disabled={selectedFile.status.includes('ing')}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
        </section>

        {/* Additional File Details */}
        {selectedFile && (
          <section className="space-y-4">


            {/* Processing Steps */}
            <div className="space-y-2">
              <h5 className="text-xs font-medium text-text-secondary">Pipeline Progress</h5>
              
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(selectedFile.steps).map(([step, status]) => {
                  // Calculate enhancement sub-progress (copy-edit, summary, tags)
                  const isEnhance = step === 'enhance';
                  let enhanceProgress = 0;
                  if (isEnhance) {
                    const hasCopy = (selectedFile as any)?.enhanced_copyedit || (selectedFile as any)?.enhanced_working || (selectedFile as any)?.enhanced;
                    const hasSummary = (selectedFile as any)?.enhanced_summary;
                    const hasTags = (selectedFile as any)?.enhanced_tags?.length > 0;
                    enhanceProgress = (hasCopy ? 1 : 0) + (hasSummary ? 1 : 0) + (hasTags ? 1 : 0);
                  }
                  const enhanceTotal = 3;
                  const enhancePercent = isEnhance ? Math.round((enhanceProgress / enhanceTotal) * 100) : 0;
                  
                  return (
                    <div 
                      key={step} 
                      className={`relative text-center p-2 rounded border transition-colors overflow-hidden ${
                        status === 'done' 
                          ? 'bg-success-50 border-success-200' 
                          : status === 'processing'
                          ? 'bg-processing-50 border-processing-200'
                          : status === 'error'
                          ? 'bg-error-50 border-error-200'
                          : 'bg-background-primary border-border-secondary'
                      }`}
                    >
                      {/* Partial progress bar for enhance stage when not fully done */}
                      {isEnhance && status !== 'done' && enhanceProgress > 0 && (
                        <div 
                          className="absolute inset-0 bg-green-100 border-green-200 transition-all duration-300"
                          style={{ width: `${enhancePercent}%` }}
                        />
                      )}
                      
                      <div className="relative flex items-center justify-center space-x-1">
                        {status === 'done' && <CheckCircle className="w-3 h-3 text-success-500" />}
                        {status === 'processing' && <Clock className="w-3 h-3 text-processing-500 animate-pulse" />}
                        {status === 'error' && <AlertCircle className="w-3 h-3 text-error-500" />}
                        {status === 'pending' && <div className="w-3 h-3 bg-text-muted rounded-full opacity-20" />}
                        <span className="text-xs text-text-primary capitalize">
                          {step}
                        </span>
                        {/* Show fraction for enhance when partial */}
                        {isEnhance && status !== 'done' && enhanceProgress > 0 && (
                          <span className="text-[10px] text-green-700 font-medium ml-0.5">
                            {enhanceProgress}/{enhanceTotal}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Error Handling */}
            {selectedFile.error && (
              <Alert className="border-error-200 bg-error-50">
                <AlertCircle className="w-4 h-4 text-error-600" />
                <AlertDescription className="text-error-700">
                  <div className="flex items-center justify-between">
                    <span className="flex-1">{selectedFile.error}</span>
                    <div className="flex space-x-2 ml-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onRetryFile(selectedFile.id)}
                        className="text-error-600 border-error-300 hover:bg-error-100"
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Retry
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onViewErrorLog(selectedFile.id)}
                        className="text-error-600 border-error-300 hover:bg-error-100"
                      >
                        <FileText className="w-3 h-3 mr-1" />
                        View Log
                      </Button>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* File Metadata */}
            <details className="space-y-2">
              <summary className="text-sm font-medium text-text-primary cursor-pointer hover:text-processing-600 transition-colors">
                File Details
              </summary>
              <div className="pl-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Path:</span>
                  <span className="text-text-secondary font-mono text-xs truncate max-w-64">
                    {selectedFile.path}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Added:</span>
                  <span className="text-text-secondary">
                    {selectedFile.addedTime}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Mode:</span>
                  <Badge variant="outline" className="text-xs">
                    {selectedFile.conversationMode ? 'Conversation Detection' : 'Single Speaker'}
                  </Badge>
                </div>
              </div>
            </details>
          </section>
        )}
      </CardContent>
    </Card>
  );
}