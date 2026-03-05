import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { 
  ChevronDown, 
  ChevronUp, 
  X, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  Clock,
  AlertCircle
} from 'lucide-react';

interface BatchFile {
  file_id: string;
  status: 'waiting' | 'processing' | 'completed' | 'failed' | 'skipped';
  error?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

interface BatchProgress {
  total: number;
  completed: number;
  failed: number;
  current: number;
  percentage: number;
}

interface BatchData {
  batch_id: string;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  type: string;
  progress: BatchProgress;
  files: BatchFile[];
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
}

interface BatchDropdownProps {
  batchId: string;
  fileNames: { [fileId: string]: string }; // Map file IDs to filenames for display
  onCancel?: () => void;
  onClose?: () => void;
}

export function BatchDropdown({ batchId, fileNames, onCancel, onClose }: BatchDropdownProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [batchData, setBatchData] = useState<BatchData | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll batch status every 2 seconds
  useEffect(() => {
    const fetchBatchStatus = async () => {
      try {
        const response = await fetch(`http://localhost:8000/api/batch/${batchId}/status`);
        if (!response.ok) {
          throw new Error('Failed to fetch batch status');
        }
        const data = await response.json();
        setBatchData(data);
        
        // Stop polling if batch is completed/cancelled/failed
        if (data.status !== 'running') {
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error('Failed to fetch batch status:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch status');
      }
    };

    // Fetch immediately
    fetchBatchStatus();

    // Then poll every 2 seconds
    const pollInterval = setInterval(fetchBatchStatus, 2000);

    return () => clearInterval(pollInterval);
  }, [batchId]);

  const handleCancel = async () => {
    if (!batchData) return;
    
    setIsCancelling(true);
    try {
      const response = await fetch(`http://localhost:8000/api/batch/${batchData.batch_id}/cancel`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to cancel batch');
      }
      
      if (onCancel) onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel batch');
    } finally {
      setIsCancelling(false);
    }
  };

  if (!batchData) {
    return (
      <Card className="mb-4 border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex items-center space-x-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            <span className="text-sm text-blue-700">Loading batch status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isRunning = batchData.status === 'running';
  const isCompleted = batchData.status === 'completed';
  const isFailed = batchData.status === 'failed';
  const isCancelled = batchData.status === 'cancelled';

  const getFileIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
      case 'waiting':
        return <Clock className="w-4 h-4 text-gray-400" />;
      case 'skipped':
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = () => {
    if (isCompleted) return 'border-green-200 bg-green-50';
    if (isFailed) return 'border-red-200 bg-red-50';
    if (isCancelled) return 'border-yellow-200 bg-yellow-50';
    return 'border-blue-200 bg-blue-50';
  };

  const getStatusText = () => {
    if (isCompleted) return 'Batch Completed';
    if (isFailed) return 'Batch Failed';
    if (isCancelled) return 'Batch Cancelled';
    return 'Batch Processing';
  };

  return (
    <Card className={`mb-4 ${getStatusColor()}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 flex-1">
            <CardTitle className="text-base font-semibold">
              {getStatusText()}
            </CardTitle>
            <span className="text-sm text-gray-600">
              ({batchData.progress.completed}/{batchData.progress.total} files)
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            {isRunning && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancel}
                disabled={isCancelling}
                className="h-7 px-2 text-xs border-red-300 text-red-700 hover:bg-red-100"
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  <>
                    <X className="w-3 h-3 mr-1" />
                    Cancel
                  </>
                )}
              </Button>
            )}
            
            {(isCompleted || isFailed || isCancelled) && onClose && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onClose}
                className="h-7 px-2"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
            
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-7 px-2"
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="mt-2">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                isCompleted ? 'bg-green-600' : 
                isFailed ? 'bg-red-600' : 
                isCancelled ? 'bg-yellow-600' : 
                'bg-blue-600'
              }`}
              style={{ width: `${batchData.progress.percentage}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-xs text-gray-600">
            <span>{batchData.progress.percentage}% complete</span>
            {batchData.progress.failed > 0 && (
              <span className="text-red-600">{batchData.progress.failed} failed</span>
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          {error && (
            <Alert className="mb-3 border-red-200 bg-red-50">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <AlertDescription className="text-red-700 text-sm">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {batchData.consecutive_failures > 0 && batchData.consecutive_failures < 3 && (
            <Alert className="mb-3 border-yellow-200 bg-yellow-50">
              <AlertCircle className="w-4 h-4 text-yellow-600" />
              <AlertDescription className="text-yellow-700 text-sm">
                {batchData.consecutive_failures} consecutive failure{batchData.consecutive_failures > 1 ? 's' : ''}. 
                Batch will stop after 3.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {batchData.files.map((file) => {
              const fileName = fileNames[file.file_id] || file.file_id;
              return (
                <div
                  key={file.file_id}
                  className="flex items-center justify-between p-2 bg-white rounded border border-gray-200"
                >
                  <div className="flex items-center space-x-2 flex-1 min-w-0">
                    {getFileIcon(file.status)}
                    <span className="text-sm truncate" title={fileName}>
                      {fileName}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 capitalize ml-2">
                    {file.status}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
