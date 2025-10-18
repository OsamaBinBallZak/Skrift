import React from 'react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Loader2, Zap, FileAudio, Cpu, Settings, Download } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'card' | 'inline' | 'fullscreen';
  message?: string;
  submessage?: string;
  progress?: number;
  type?: 'general' | 'transcription' | 'processing' | 'upload' | 'download' | 'settings';
  showIcon?: boolean;
}

export function LoadingSpinner({
  size = 'md',
  variant = 'default',
  message = 'Loading...',
  submessage,
  progress,
  type = 'general',
  showIcon = true
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12'
  };

  const getTypeIcon = () => {
    const iconClass = sizeClasses[size];
    
    switch (type) {
      case 'transcription':
        return <FileAudio className={`${iconClass} text-processing-600`} />;
      case 'processing':
        return <Cpu className={`${iconClass} text-processing-600`} />;
      case 'upload':
        return <Zap className={`${iconClass} text-processing-600`} />;
      case 'download':
        return <Download className={`${iconClass} text-processing-600`} />;
      case 'settings':
        return <Settings className={`${iconClass} text-processing-600`} />;
      default:
        return <Loader2 className={`${iconClass} text-processing-600 animate-spin`} />;
    }
  };

  const getProgressColor = () => {
    if (!progress) return 'text-processing-600';
    if (progress < 30) return 'text-processing-600';
    if (progress < 70) return 'text-warning-600';
    return 'text-success-600';
  };

  const LoadingContent = () => (
    <div className="flex flex-col items-center space-y-4">
      {/* Icon and Spinner */}
      <div className="relative">
        {showIcon && type !== 'general' && (
          <div className="absolute inset-0 flex items-center justify-center">
            {getTypeIcon()}
          </div>
        )}
        <Loader2 className={`${sizeClasses[size]} text-processing-600 animate-spin`} />
      </div>

      {/* Message */}
      <div className="text-center space-y-2">
        <p className={`font-medium text-text-primary ${
          size === 'sm' ? 'text-sm' : 
          size === 'lg' ? 'text-lg' : 
          size === 'xl' ? 'text-xl' : 'text-base'
        }`}>
          {message}
        </p>
        
        {submessage && (
          <p className={`text-text-tertiary ${
            size === 'sm' ? 'text-xs' : 
            size === 'lg' ? 'text-base' : 
            size === 'xl' ? 'text-lg' : 'text-sm'
          }`}>
            {submessage}
          </p>
        )}
        
        {progress !== undefined && (
          <div className="space-y-2 min-w-48">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">Progress</span>
              <Badge variant="outline" className={`text-xs ${getProgressColor()}`}>
                {progress}%
              </Badge>
            </div>
            <div className="w-full bg-background-tertiary rounded-full h-2">
              <div 
                className="bg-processing-600 h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  switch (variant) {
    case 'fullscreen':
      return (
        <div className="fixed inset-0 bg-background-primary/80 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="w-auto max-w-md border-border-primary bg-background-primary shadow-lg">
            <CardContent className="p-8">
              <LoadingContent />
            </CardContent>
          </Card>
        </div>
      );

    case 'card':
      return (
        <Card className="w-full border-border-primary bg-background-primary shadow-card">
          <CardContent className="p-8">
            <LoadingContent />
          </CardContent>
        </Card>
      );

    case 'inline':
      return (
        <div className="flex items-center space-x-3">
          <Loader2 className={`${sizeClasses[size]} text-processing-600 animate-spin`} />
          <div className="flex flex-col">
            <span className={`text-text-primary font-medium ${
              size === 'sm' ? 'text-sm' : 'text-base'
            }`}>
              {message}
            </span>
            {submessage && (
              <span className={`text-text-tertiary ${
                size === 'sm' ? 'text-xs' : 'text-sm'
              }`}>
                {submessage}
              </span>
            )}
          </div>
          {progress !== undefined && (
            <Badge variant="outline" className={`text-xs ml-auto ${getProgressColor()}`}>
              {progress}%
            </Badge>
          )}
        </div>
      );

    default:
      return (
        <div className="flex items-center justify-center p-4">
          <LoadingContent />
        </div>
      );
  }
}

// Skeleton loading component for content placeholders
export function LoadingSkeleton({ 
  lines = 3, 
  className = "",
  showAvatar = false 
}: { 
  lines?: number; 
  className?: string;
  showAvatar?: boolean;
}) {
  return (
    <div className={`animate-pulse space-y-3 ${className}`}>
      {showAvatar && (
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-background-tertiary rounded-full" />
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-background-tertiary rounded w-1/3" />
            <div className="h-3 bg-background-tertiary rounded w-1/4" />
          </div>
        </div>
      )}
      
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div 
            key={i}
            className={`h-4 bg-background-tertiary rounded ${
              i === lines - 1 ? 'w-2/3' : 'w-full'
            }`} 
          />
        ))}
      </div>
    </div>
  );
}

// Specific loading states for different parts of the application
export const LoadingStates = {
  // File upload loading
  FileUpload: (props: Partial<LoadingSpinnerProps>) => (
    <LoadingSpinner
      type="upload"
      message="Uploading files..."
      submessage="Please wait while files are being processed"
      {...props}
    />
  ),

  // Transcription processing
  Transcription: (props: Partial<LoadingSpinnerProps>) => (
    <LoadingSpinner
      type="transcription"
      message="Processing audio..."
      submessage="Transcribing speech to text"
      {...props}
    />
  ),

  // General processing
  Processing: (props: Partial<LoadingSpinnerProps>) => (
    <LoadingSpinner
      type="processing"
      message="Processing..."
      submessage="This may take a few moments"
      {...props}
    />
  ),

  // Settings/configuration
  Settings: (props: Partial<LoadingSpinnerProps>) => (
    <LoadingSpinner
      type="settings"
      message="Updating settings..."
      submessage="Saving your preferences"
      {...props}
    />
  ),

  // File export
  Export: (props: Partial<LoadingSpinnerProps>) => (
    <LoadingSpinner
      type="download"
      message="Exporting files..."
      submessage="Preparing your download"
      {...props}
    />
  ),
};