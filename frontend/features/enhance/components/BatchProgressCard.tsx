import React from 'react';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { Badge } from '../../../shared/ui/badge';
import { Loader2, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';

interface BatchFile {
  file_id: string;
  status: 'waiting' | 'processing' | 'completed' | 'failed';
  current_step: 'title' | 'copy_edit' | 'summary' | 'tags' | null;
  steps: {
    title: 'done' | 'failed' | 'processing' | 'waiting' | 'skipped';
    copy_edit: 'done' | 'failed' | 'processing' | 'waiting' | 'skipped';
    summary: 'done' | 'failed' | 'processing' | 'waiting' | 'skipped';
    tags: 'done' | 'failed' | 'processing' | 'waiting' | 'skipped';
  };
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface BatchState {
  batch_id: string;
  type: string;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  result?: 'success' | 'partial_success' | 'failed' | null;
  current_file_id: string | null;
  files: BatchFile[];
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
}

interface BatchProgressCardProps {
  batch: BatchState;
  fileNames: Map<string, string>; // file_id -> filename mapping
  onCancel: () => void;
}

// Step indicator component
const StepIndicator: React.FC<{ status: string; label: string }> = ({ status, label }) => {
  const getIcon = () => {
    switch (status) {
      case 'done':
        return <CheckCircle2 className="w-4 h-4 text-status-success-text" />;
      case 'skipped':
        return <CheckCircle2 className="w-4 h-4 text-status-warning-text" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-status-error-text" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-status-processing-text animate-spin" />;
      case 'waiting':
      default:
        return <Clock className="w-4 h-4 text-muted" />;
    }
  };

  const getClasses = () => {
    switch (status) {
      case 'done':
        return 'bg-status-success-bg text-status-success-text border-status-success-border';
      case 'skipped':
        return 'bg-status-warning-bg text-status-warning-text border-status-warning-border';
      case 'failed':
        return 'bg-status-error-bg text-status-error-text border-status-error-border';
      case 'processing':
        return 'bg-status-processing-bg text-status-processing-text border-status-processing-border animate-pulse';
      case 'waiting':
      default:
        return 'bg-surface-elevated text-secondary border-theme-border';
    }
  };

  return (
    <div className={`flex items-center gap-1 px-2 py-1 text-xs rounded border ${getClasses()}`}>
      {getIcon()}
      <span className="font-medium">{label}</span>
    </div>
  );
};

export const BatchProgressCard: React.FC<BatchProgressCardProps> = ({
  batch,
  fileNames,
  onCancel,
}) => {
  // Live streaming state
  const [liveOutput, setLiveOutput] = React.useState('');
  const [currentStep, setCurrentStep] = React.useState<{fileId: string; step: string} | null>(null);
  const outputRef = React.useRef<HTMLDivElement>(null);
  
  // Set currentStep based on batch state (for immediate display)
  React.useEffect(() => {
    if (batch.status === 'running' && batch.current_file_id) {
      const currentFile = batch.files.find(f => f.file_id === batch.current_file_id);
      if (currentFile?.current_step) {
        setCurrentStep({ fileId: currentFile.file_id, step: currentFile.current_step });
      }
    }
  }, [batch.status, batch.current_file_id, batch.files]);
  
  // Subscribe to batch SSE stream
  React.useEffect(() => {
    console.log('🔌 BatchProgressCard: Attempting SSE connection', { batchStatus: batch.status, batchId: batch.batch_id });
    
    const eventSource = new EventSource('http://localhost:8000/api/batch/enhance/stream');
    console.log('📡 EventSource created for batch stream');
    
    eventSource.addEventListener('connected', () => {
      console.log('✅ Connected to batch stream');
    });
    
    eventSource.addEventListener('start', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setCurrentStep({ fileId: data.file_id, step: data.step });
      setLiveOutput(''); // Clear output for new step
    });
    
    eventSource.addEventListener('token', (e) => {
      const token = (e as MessageEvent).data;
      setLiveOutput(prev => prev + token);
      // Auto-scroll to bottom
      if (outputRef.current) {
        outputRef.current.scrollTop = outputRef.current.scrollHeight;
      }
    });
    
    eventSource.addEventListener('done', (e) => {
      // Step completed, keep output visible
    });
    
    eventSource.addEventListener('error', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setLiveOutput(prev => prev + `\n\n❌ Error: ${data.error}`);
    });
    
    eventSource.addEventListener('heartbeat', () => {
      // Keep-alive, no action needed
    });
    
    eventSource.onerror = (err) => {
      console.error('❌ Batch stream connection error', err);
      eventSource.close();
    };
    
    return () => {
      console.log('🔌 Closing batch SSE connection');
      eventSource.close();
    };
  }, [batch.batch_id]); // Re-connect only when batch changes, not on status updates
  
  // Guard against undefined or missing files array
  if (!batch?.files || !Array.isArray(batch.files)) {
    return null;
  }

  const totalFiles = batch.files.length;
  const completedFiles = batch.files.filter(f => f.status === 'completed').length;
  const failedFiles = batch.files.filter(f => f.status === 'failed').length;
  
  // Calculate total steps progress (4 steps per file: title, copy edit, summary, tags)
  // Note: 'skipped' counts as complete (e.g., tags already approved)
  const totalSteps = totalFiles * 4;
  const completedSteps = batch.files.reduce((sum, f) => {
    let count = 0;
    if (f.steps.title === 'done' || f.steps.title === 'skipped') count++;
    if (f.steps.copy_edit === 'done' || f.steps.copy_edit === 'skipped') count++;
    if (f.steps.summary === 'done' || f.steps.summary === 'skipped') count++;
    if (f.steps.tags === 'done' || f.steps.tags === 'skipped') count++;
    return sum + count;
  }, 0);
  
  const progressPercentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const getFileStatusIcon = (file: BatchFile) => {
    if (file.status === 'completed') {
      return <CheckCircle2 className="w-5 h-5 text-status-success-text" />;
    }
    if (file.status === 'failed') {
      return <XCircle className="w-5 h-5 text-status-error-text" />;
    }
    if (file.status === 'processing') {
      return <Loader2 className="w-5 h-5 text-status-processing-text animate-spin" />;
    }
    return <Clock className="w-5 h-5 text-muted" />;
  };

  const getFileStatusText = (file: BatchFile) => {
    if (file.status === 'processing' && file.current_step) {
      const stepLabels: Record<string, string> = {
        title: 'Title',
        copy_edit: 'Copy Edit',
        summary: 'Summary',
        tags: 'Tags',
      };
      return `${stepLabels[file.current_step] || file.current_step}...`;
    }
    if (file.status === 'failed' && file.error) {
      return file.error;
    }
    return file.status.charAt(0).toUpperCase() + file.status.slice(1);
  };

  // Get result badge color and text
  const getResultBadge = () => {
    if (batch.status !== 'completed' || !batch.result) return null;
    
    const badges = {
      success: { className: 'bg-status-success-bg text-status-success-text border-status-success-border', text: '✓ Success' },
      partial_success: { className: 'bg-status-warning-bg text-status-warning-text border-status-warning-border', text: '⚠ Partial Success' },
      failed: { className: 'bg-status-error-bg text-status-error-text border-status-error-border', text: '✗ Failed' }
    };
    
    const badge = badges[batch.result] || badges.failed;
    return (
      <Badge className={`${badge.className} border px-2 py-1`}>
        {badge.text}
      </Badge>
    );
  };

  return (
    <>
      {/* Live Output Card - Full Width, Always Visible During Batch */}
      {batch.status === 'running' && currentStep && (
        <Card className="border-theme-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Loader2 className="w-4 h-4 text-status-processing-text animate-spin" />
              <span>
                Live Output: {fileNames.get(currentStep.fileId) || currentStep.fileId}
                {' '}— {currentStep.step.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              ref={outputRef}
              className="bg-surface text-fg p-4 border border-theme-border rounded-lg font-mono text-sm min-h-[300px] max-h-[400px] overflow-y-auto whitespace-pre-wrap"
            >
              {liveOutput || <span className="text-muted">Waiting for output...</span>}
              {liveOutput && <span className="animate-pulse text-fg">█</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Batch Progress Card */}
      <Card className="border-status-info-border bg-surface-elevated">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            {batch.status === 'running' && <Loader2 className="w-5 h-5 text-status-processing-text animate-spin" />}
            {batch.status === 'completed' && getResultBadge()}
            <span>Batch Enhancement: {completedFiles}/{totalFiles} files</span>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={batch.status !== 'running'}
            className="border-status-error-border text-status-error-text hover:bg-status-error-bg"
          >
            Cancel Batch
          </Button>
        </div>
        
        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-secondary">Progress: {completedSteps}/{totalSteps} steps</span>
            <span className="text-sm font-medium text-text-secondary">{progressPercentage}%</span>
          </div>
          <div className="w-full bg-surface-elevated rounded-full h-2">
            <div
              className="bg-status-processing-bg h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        {/* Failure warning */}
        {batch.consecutive_failures > 0 && (
            <div className="mt-2 flex items-center gap-2 text-sm text-status-warning-text bg-status-warning-bg border border-status-warning-border rounded px-3 py-2">
            <AlertCircle className="w-4 h-4" />
            <span>{batch.consecutive_failures} consecutive failure{batch.consecutive_failures > 1 ? 's' : ''} (will stop at 3)</span>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {/* File list */}
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {batch.files.map((file) => {
            const filename = fileNames.get(file.file_id) || file.file_id;
            const isCurrent = file.file_id === batch.current_file_id;
            
            return (
              <div
                key={file.file_id}
                className={`p-3 rounded-lg border ${
                  isCurrent
                    ? 'border-status-info-border bg-surface ring-2 ring-status-info-border'
                    : 'border-theme-border bg-surface'
                }`}
              >
                {/* File header */}
                <div className="flex items-start gap-3 mb-2">
                  {getFileStatusIcon(file)}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate" title={filename}>
                      {filename}
                    </div>
                    <div className="text-xs text-secondary">
                      {getFileStatusText(file)}
                    </div>
                  </div>
                </div>

                {/* Step indicators */}
                <div className="flex gap-2 mt-2">
                  <StepIndicator status={file.steps.title} label="Title" />
                  <StepIndicator status={file.steps.copy_edit} label="Copy Edit" />
                  <StepIndicator status={file.steps.summary} label="Summary" />
                  <StepIndicator status={file.steps.tags} label="Tags" />
                </div>

                {/* Error message */}
                {file.status === 'failed' && file.error && (
                  <div className="mt-2 text-xs text-status-error-text bg-status-error-bg border border-status-error-border rounded px-2 py-1">
                    {file.error}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary stats */}
        {failedFiles > 0 && (
            <div className="mt-4 pt-3 border-t border-status-info-border">
            <div className="flex items-center justify-between text-sm">
              <span className="text-secondary">Status Summary:</span>
              <div className="flex gap-4">
                <span className="text-status-success-text">✓ {completedFiles} completed</span>
                <span className="text-status-error-text">✗ {failedFiles} failed</span>
                <span className="text-secondary">⏳ {totalFiles - completedFiles - failedFiles} pending</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    </>
  );
};
