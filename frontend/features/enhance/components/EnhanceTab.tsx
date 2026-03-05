import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { Button } from '../../../shared/ui/button';
import { Badge } from '../../../shared/ui/badge';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { 
  Sparkles, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  FileText,
  Zap,
  Brain,
  HelpCircle
} from 'lucide-react';
import type { PipelineFile } from '../../../src/types/pipeline';
import { useEnhancementConfig } from '../context/EnhancementConfigContext';
import { API_BASE_URL } from '../../../src/api';
import { BatchProgressCard } from './BatchProgressCard';

interface EnhanceTabProps {
  selectedFile: PipelineFile | null;
  files: PipelineFile[];
}

export function EnhanceTab({ selectedFile, files }: EnhanceTabProps) {
  // All hooks MUST be called unconditionally before any returns
  const { config } = useEnhancementConfig();
  const [selectedId, setSelectedId] = React.useState<string>('');
  const [workingApplied, setWorkingApplied] = React.useState(false);
  const [summaryApplied, setSummaryApplied] = React.useState(false);
  const [tagsApplied, setTagsApplied] = React.useState(false);
  
  // Batch enhancement state
  const [batchState, setBatchState] = React.useState<any | null>(null);
  const [isBatchMode, setIsBatchMode] = React.useState(false);
  
  const getOpt = (id: string) => config.options.find(o => o.id === id);
  const [streaming, setStreaming] = React.useState(false);
  const [streamingTitle, setStreamingTitle] = React.useState(false);
  const [streamingCopy, setStreamingCopy] = React.useState(false);
  const [streamingSummary, setStreamingSummary] = React.useState(false);
  const [titleText, setTitleText] = React.useState('');
  const titleRef = React.useRef('');
  const [streamText, setStreamText] = React.useState('');
  const streamRef = React.useRef('');
  const [summaryText, setSummaryText] = React.useState('');
  const summaryRef = React.useRef('');
  const [titleApplied, setTitleApplied] = React.useState(false);
  // Tag suggestion and selection state
  const [tagSelected, setTagSelected] = React.useState<Set<string>>(new Set());
  const [wlCount, setWlCount] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState<'title' | 'copy' | 'summary' | 'tags' | 'compile' | null>(null);
  
  const esRef = React.useRef<EventSource | null>(null);

  // Read enhancement options from settings (editable prompts)
  const enhancements = config.options.map(option => ({
    id: option.id,
    label: option.name,
    description: option.description,
    icon: option.icon,
    color: option.color
  }));

  React.useEffect(() => {
    if (!selectedId && enhancements.length > 0) {
      setSelectedId(enhancements[0].id);
    }
  }, [enhancements, selectedId]);

  // Poll for batch status
  React.useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const checkBatch = async () => {
      try {
        const api = (await import('../../../src/api')).apiService;
        const response = await api.getCurrentBatch();
        console.log('🔍 Batch status check:', { active: response.active, type: response.batch?.type, status: response.batch?.status, filesCount: response.batch?.files?.length });
        
        if (response.active && response.batch?.type === 'enhance') {
          // Validate batch state has required data
          if (!response.batch.files || !Array.isArray(response.batch.files)) {
            console.error('⚠️ Invalid batch state - missing files array');
            setBatchState(null);
            setIsBatchMode(false);
            return;
          }
          
          setBatchState(response.batch);
          setIsBatchMode(true);
          console.log('✅ Batch mode active:', response.batch.batch_id);
          
          // Stop polling if batch is completed/cancelled/failed
          if (response.batch.status !== 'running') {
            console.log('🏁 Batch completed/stopped:', response.batch.status);
            setIsBatchMode(false);
            // Refresh file list
            window.dispatchEvent(new CustomEvent('pipeline-refresh-request'));
            if (interval) clearInterval(interval);
          }
        } else {
          setBatchState(null);
          setIsBatchMode(false);
        }
      } catch (error) {
        console.error('Failed to check batch status:', error);
      }
    };

    // Check immediately
    checkBatch();

    // Poll more frequently during batch (500ms) for smoother progress updates
    // Otherwise poll every 2 seconds
    const pollInterval = isBatchMode ? 500 : 2000;
    interval = setInterval(checkBatch, pollInterval);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isBatchMode]);

  // Helper function to get icon component
  const getIconComponent = (iconName: string) => {
    const iconProps = { className: "w-4 h-4" };
    switch (iconName) {
      case 'Zap': return <Zap {...iconProps} />;
      case 'Brain': return <Brain {...iconProps} />;
      case 'FileText': return <FileText {...iconProps} />;
      case 'Sparkles': return <Sparkles {...iconProps} />;
      case 'CheckCircle': return <CheckCircle {...iconProps} />;
      case 'HelpCircle': return <HelpCircle {...iconProps} />;
      default: return <Sparkles {...iconProps} />;
    }
  };

  // Helper function to get color classes
  const getColorClasses = (color: string) => {
    const colorMap = {
      blue: 'border-status-info-border bg-status-info-bg',
      green: 'border-status-success-border bg-status-success-bg',
      purple: 'border-status-enhanced-border bg-status-enhanced-bg',
      orange: 'border-status-warning-border bg-status-warning-bg',
      red: 'border-status-error-border bg-status-error-bg',
      indigo: 'border-status-processing-border bg-status-processing-bg'
    };
    return colorMap[color as keyof typeof colorMap] || colorMap.blue;
  };

  // Calculate eligible files for batch (must be before early return)
  const eligibleForBatch = React.useMemo(() => {
    return files.filter(f => {
      if (!f || !f.id) return false; // Safety check
      const hasSanitised = !!((f.sanitised || '').trim());
      const hasTitle = !!((f as any)?.enhanced_title || '').trim();
      const hasCopy = !!((f as any)?.enhanced_copyedit || '').trim();
      const hasSummary = !!((f as any)?.enhanced_summary || '').trim();
      const hasTags = !!((f as any)?.enhanced_tags && (f as any).enhanced_tags.length > 0);
      return hasSanitised && !(hasTitle && hasCopy && hasSummary && hasTags);
    });
  }, [files]);

  // Build filename map for batch progress card (must be before early return)
  const fileNameMap = React.useMemo(() => {
    const map = new Map<string, string>();
    files.forEach(f => {
      if (f && f.id && f.name) {
        map.set(f.id, f.name);
      }
    });
    return map;
  }, [files]);

  // Early return if no file selected (after all hooks)
  if (!selectedFile) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Sparkles className="w-12 h-12 text-muted mx-auto mb-4" />
          <h3 className="text-lg font-medium text-fg mb-2">No File Selected</h3>
          <p className="text-secondary">
            Please select a sanitised file to begin AI enhancement.
          </p>
        </CardContent>
      </Card>
    );
  }

  // selectedFile-dependent calculations (selectedFile guaranteed non-null here)
  const tagSuggestions = (selectedFile as any)?.tag_suggestions || null;
  const tagOld = tagSuggestions?.old || [];
  const tagNew = tagSuggestions?.new || [];
  const hasSuggestions = tagOld.length > 0 || tagNew.length > 0;

  const isProcessing = !!(
    streaming ||
    busy !== null ||
    (selectedFile.steps.transcribe === 'processing' ||
     selectedFile.steps.sanitise === 'processing' ||
     selectedFile.steps.enhance === 'processing')
  );

  const titlePersisted = (selectedFile as any)?.enhanced_title || '';
  const copyPersisted = (selectedFile as any)?.enhanced_copyedit || (selectedFile as any)?.enhanced_working || (selectedFile as any)?.enhanced || '';
  const summaryPersisted = (selectedFile as any)?.enhanced_summary || '';
  const hasTitle = !!titlePersisted && String(titlePersisted).trim().length > 0;
  const hasCopy = !!copyPersisted && String(copyPersisted).trim().length > 0;
  const hasSummary = !!summaryPersisted && String(summaryPersisted).trim().length > 0;
  const hasTags = (selectedFile.enhanced_tags || []).length > 0;
  const canCompile = (hasTitle || titleApplied) && (hasCopy || workingApplied) && (hasSummary || summaryApplied) && (hasTags || tagsApplied) && !isProcessing;
  const savedCount = (hasTitle || titleApplied ? 1 : 0) + (hasCopy || workingApplied ? 1 : 0) + (hasSummary || summaryApplied ? 1 : 0) + (hasTags || tagsApplied ? 1 : 0);

  const handleStartBatch = async () => {
    console.log('🚀 Batch Enhance clicked', { eligibleCount: eligibleForBatch.length });
    if (eligibleForBatch.length < 1) {
      console.warn('⚠️ Not enough eligible files for batch', eligibleForBatch.length);
      return;
    }
    
    try {
      const api = (await import('../../../src/api')).apiService;
      console.log('📤 Starting batch enhance for files:', eligibleForBatch.map(f => f.id));
      await api.startEnhanceBatch(eligibleForBatch.map(f => f.id));
      console.log('✅ Batch enhance started successfully');
      
      // Immediately check batch status to avoid race condition
      // This ensures BatchProgressCard mounts and SSE connects ASAP
      console.log('⚡ Immediately fetching batch state...');
      const response = await api.getCurrentBatch();
      if (response.active && response.batch?.type === 'enhance') {
        setBatchState(response.batch);
        setIsBatchMode(true);
        console.log('⚡ Batch state set immediately:', response.batch.batch_id);
      }
    } catch (error) {
      console.error('❌ Failed to start batch:', error);
      alert(`Failed to start batch: ${error}`);
    }
  };

  const handleCancelBatch = async () => {
    if (!batchState) return;
    
    try {
      const api = (await import('../../../src/api')).apiService;
      console.log('🛑 Cancel batch requested', { batchId: batchState.batch_id });
      const res = await api.cancelBatch(batchState.batch_id);
      console.log('✅ Cancel batch response', res);
      // Optimistically update local UI instead of waiting for polling
      setBatchState(prev => prev ? { ...prev, status: 'cancelled' } : prev);
      setIsBatchMode(false);
      // Ask the rest of the app to refresh file state
      try {
        window.dispatchEvent(new CustomEvent('pipeline-refresh-request'));
      } catch {
        // non-blocking
      }
    } catch (error) {
      console.error('Failed to cancel batch:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Batch Progress Card (replaces other UI when active) */}
      {isBatchMode && batchState && (
        <BatchProgressCard
          batch={batchState}
          fileNames={fileNameMap}
          onCancel={handleCancelBatch}
        />
      )}

      {/* Manual Mode UI (hidden during batch) */}
      {!isBatchMode && (
        <>
          {/* Batch Enhance Button */}
          {eligibleForBatch.length >= 1 && (
            <div className="flex justify-end">
              <Button
                onClick={handleStartBatch}
                disabled={isProcessing || isBatchMode}
                className="bg-btn-primary hover:opacity-90 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isBatchMode ? 'Batch Running...' : `Batch Enhance All (${eligibleForBatch.length} ${eligibleForBatch.length === 1 ? 'file' : 'files'})`}
              </Button>
            </div>
          )}

          {/* Progress checklist */}
          <div className="text-xs text-secondary">Enhancement progress: {savedCount}/4 saved</div>

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
                Sanitisation must be completed before AI enhancement can begin.
              </AlertDescription>
            </Alert>
          )}

          {/* Main Enhancement Controls */}
          <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5" />
              <span>AI Enhancement</span>
              {((streaming && streamText.length === 0) || (streamingTitle && titleText.length === 0) || (streamingCopy && streamText.length === 0) || (streamingSummary && summaryText.length === 0)) && (
                <span className="ml-2 inline-flex items-center text-xs text-secondary animate-fade-in">
                  <span className="animate-spin inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full mr-1" />
                  Preparing…
                </span>
              )}
            </CardTitle>
            <div className="flex items-center space-x-2">
              {selectedFile.steps.enhance === 'done' && (
                <Badge className="bg-status-success-bg text-status-success-text">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Completed
                </Badge>
              )}
              {selectedFile.status === 'enhancing' && (
                <Badge className="bg-status-processing-bg text-status-processing-text">
                  <Clock className="w-3 h-3 mr-1" />
                  Processing
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File Information */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-surface-elevated rounded-lg">
            <div>
              <p className="text-sm text-secondary">File</p>
              <p className="font-medium">{selectedFile.name}</p>
            </div>
            <div>
              <p className="text-sm text-secondary">Sanitisation Status</p>
              <p className="font-medium">
                {selectedFile.steps.sanitise === 'done' ? 'Ready' : 'Pending'}
              </p>
            </div>
            <div>
              <p className="text-sm text-secondary">Enhancement</p>
              <p className="font-medium">
                {selectedFile.steps.enhance === 'done' ? 'Completed' : 
                 selectedFile.status === 'enhancing' ? 'Processing' : 'Not Started'}
              </p>
            </div>
          </div>

          {/* Pipeline Buttons - vertical colorful from settings */}
          <div className="flex flex-col gap-3">
            {/* Resolve option metadata from settings */}
            {(() => {
              const optTitle = getOpt('title');
              const optCopy = getOpt('copy-edit');
              const optSumm = getOpt('summary');
              const optTags = getOpt('keywords');

              /* Title Generation */
              return (
                <>
                  <div
                    className={`relative flex items-center justify-between p-3 border rounded-lg transition shadow-sm hover:shadow-md hover:ring-1 hover:ring-black/10 ${getColorClasses(optTitle?.color || 'indigo')} ${(hasTitle || titleApplied) ? 'opacity-100' : 'opacity-90'}`}
                    aria-disabled={(streamingTitle || streamingCopy || streamingSummary || busy === 'tags')}
                  >
                    <div
                      className={`flex items-center gap-2 flex-1 ${(!streamingTitle && !streamingCopy && !streamingSummary && busy !== 'tags') ? 'cursor-pointer' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={async () => {
                        if (!selectedFile || streamingTitle || streamingCopy || streamingSummary || busy === 'tags') return;
                        setSelectedId('title');
                        try { esRef.current?.close(); } catch { /* Already closed */ }
                        setBusy('title');
                        setTitleText('');
                        const prompt = optTitle?.systemPrompt || '';
                        try {
                          setStreamingTitle(true);
                          titleRef.current = '';
                          const url = `${API_BASE_URL}/api/process/enhance/stream/${encodeURIComponent(selectedFile.id)}?prompt=${encodeURIComponent(prompt)}`;
                          const es = new EventSource(url);
                          esRef.current = es;
                          es.addEventListener('token', (ev: Event) => {
                            const data = ((ev as MessageEvent).data || '').toString();
                            titleRef.current += data;
                            setTitleText(prev => prev + data);
                          });
                          es.addEventListener('done', async () => {
                            try {
                              const api = (await import('../../../src/api')).apiService;
                              await api.setEnhanceTitle(selectedFile.id, titleRef.current.trim());
                              setTitleApplied(true);
                            } catch {
                              // Persist failure is non-blocking
                            }
                            setStreamingTitle(false);
                            setBusy(null);
                            es.close();
                            try {
                              window.dispatchEvent(new CustomEvent('pipeline-refresh-request'));
                            } catch {
                              // Event dispatch failure is non-blocking
                            }
                          });
                          es.addEventListener('error', () => { setStreamingTitle(false); setBusy(null); es.close(); });
                        } catch { setStreamingTitle(false); setBusy(null); }
                      }}
                    >
                      {getIconComponent(optTitle?.icon || 'FileText')}
                      <div>
                        <div className="text-sm font-medium">{optTitle?.name || 'Generate Title'}</div>
                        <div className="text-xs text-secondary">{optTitle?.description || 'AI extracts or generates a title for this transcript'}</div>
                      </div>
                    </div>
                    <div className="ml-3">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!hasTitle}
                        onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          if (!selectedFile) return;
                          setSelectedId('title');
                          setTitleText(titlePersisted || '');
                          setStreamingTitle(false);
                          try { esRef.current?.close(); } catch { /* Already closed */ }
                        }}
                      >View</Button>
                    </div>
                  </div>

                  {/* Copy Edit */}
                  <div
className={`relative flex items-center justify-between p-3 border rounded-lg transition shadow-sm hover:shadow-md hover:ring-1 hover:ring-black/10 ${getColorClasses(optCopy?.color || 'blue')} ${(hasCopy || workingApplied) ? 'opacity-100' : 'opacity-90'}`}
                    aria-disabled={(streamingTitle || streamingCopy || streamingSummary || busy === 'tags')}
                  >
                    <div
                      className={`flex items-center gap-2 flex-1 ${(!streamingTitle && !streamingCopy && !streamingSummary && busy !== 'tags') ? 'cursor-pointer' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={async () => {
                        if (!selectedFile || streamingTitle || streamingCopy || streamingSummary || busy === 'tags') return;
                        setSelectedId('copy-edit');
                        try { esRef.current?.close(); } catch { /* Already closed */ }
                        setBusy('copy');
                        setStreamText('');
                        const prompt = optCopy?.systemPrompt || '';
                        try {
                          setStreamingCopy(true);
                          streamRef.current = '';
                          const url = `${API_BASE_URL}/api/process/enhance/stream/${encodeURIComponent(selectedFile.id)}?prompt=${encodeURIComponent(prompt)}`;
                          const es = new EventSource(url);
                          esRef.current = es;
                          es.addEventListener('token', (ev: Event) => {
                            const data = ((ev as MessageEvent).data || '').toString();
                            streamRef.current += data;
                            setStreamText(prev => prev + data);
                          });
                          es.addEventListener('done', async () => {
                            // Keep displayed buffer as-is; persist exactly what the user saw streaming
                            try {
                              const api = (await import('../../../src/api')).apiService;
                              await api.setEnhanceCopyedit(selectedFile.id, streamRef.current);
                              setWorkingApplied(true);
                            } catch {
                              // Persist failure is non-blocking
                            }
                            setStreamingCopy(false);
                            setBusy(null);
                            es.close();
                            // Ask app to refresh selected file so View reflects persisted content
                            try {
                              window.dispatchEvent(new CustomEvent('pipeline-refresh-request'));
                            } catch {
                              // Event dispatch failure is non-blocking
                            }
                          });
                          es.addEventListener('error', () => { setStreamingCopy(false); setBusy(null); es.close(); });
                        } catch { setStreamingCopy(false); setBusy(null); }
                      }}
                    >
                      {getIconComponent(optCopy?.icon || 'FileText')}
                      <div>
                        <div className="text-sm font-medium">{optCopy?.name || 'Copy Edit (Fix Spelling/Grammar)'}</div>
                        <div className="text-xs text-secondary">{optCopy?.description || 'Rewrite to correct spelling, grammar, readability. Output only corrected text.'}</div>
                      </div>
                    </div>
                    <div className="ml-3">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!hasCopy}
                        onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          if (!selectedFile) return;
                          setSelectedId('copy-edit');
                          setStreamText(copyPersisted || '');
                          setStreamingCopy(false);
                          setStreaming(false);
                        }}
                      >View</Button>
                    </div>
                  </div>

                  {/* Summary */}
                  <div
className={`relative flex items-center justify-between p-3 border rounded-lg transition shadow-sm hover:shadow-md hover:ring-1 hover:ring-black/10 ${getColorClasses(optSumm?.color || 'purple')} ${(hasSummary || summaryApplied) ? 'opacity-100' : 'opacity-90'}`}
                    aria-disabled={(streamingTitle || streamingSummary || streamingCopy || busy === 'tags')}
                  >
                    <div
                      className={`flex items-center gap-2 flex-1 ${(!streamingTitle && !streamingSummary && !streamingCopy && busy !== 'tags') ? 'cursor-pointer' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={async () => {
                        if (!selectedFile || streamingTitle || streamingSummary || streamingCopy || busy === 'tags') return;
                        setSelectedId('summary');
                        try { esRef.current?.close(); } catch { /* Already closed */ }
                        setBusy('summary'); setSummaryText('');
                        try {
                          setStreamingSummary(true);
                          summaryRef.current = '';
                          const prompt = optSumm?.systemPrompt || 'Return exactly one sentence (20-30 words) summarizing the text. Output one sentence only.';
                          const url = `${API_BASE_URL}/api/process/enhance/stream/${encodeURIComponent(selectedFile.id)}?prompt=${encodeURIComponent(prompt)}`;
                          const es = new EventSource(url);
                          esRef.current = es;
                          es.addEventListener('token', (ev: Event) => {
                            const data = ((ev as MessageEvent).data || '').toString();
                            summaryRef.current += data;
                            setSummaryText(prev => prev + data);
                          });
                          es.addEventListener('done', async () => {
                            // Keep displayed summary buffer as-is; persist exactly what the user saw streaming
                            try {
                              const api = (await import('../../../src/api')).apiService;
                              await api.setEnhanceSummary(selectedFile.id, summaryRef.current.trim());
                              setSummaryApplied(true);
                            } catch {
                              // Persist failure is non-blocking
                            }
                            setStreamingSummary(false);
                            setBusy(null);
                            es.close();
                            // Ask app to refresh selected file so View reflects persisted content
                            try {
                              window.dispatchEvent(new CustomEvent('pipeline-refresh-request'));
                            } catch {
                              // Event dispatch failure is non-blocking
                            }
                          });
                          es.addEventListener('error', () => { setStreamingSummary(false); setBusy(null); es.close(); });
                        } catch { setStreamingSummary(false); setBusy(null); }
                      }}
                    >
                      {getIconComponent(optSumm?.icon || 'FileText')}
                      <div>
                        <div className="text-sm font-medium">{optSumm?.name || 'Summary (1 sentence)'}</div>
                        <div className="text-xs text-secondary">{optSumm?.description || 'Generate exactly one sentence (20–30 words).'}</div>
                      </div>
                    </div>
                    <div className="ml-3">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!hasSummary}
                        onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          if (!selectedFile) return;
                          setSelectedId('summary');
                          setSummaryText(summaryPersisted || '');
                          setStreamingSummary(false);
                          setStreaming(false);
                        }}
                      >View</Button>
                    </div>
                  </div>

                  {/* Tags */}
                  <div
className={`relative flex items-center justify-between p-3 border rounded-lg transition shadow-sm hover:shadow-md hover:ring-1 hover:ring-black/10 ${getColorClasses(optTags?.color || 'green')} ${(hasTags || tagsApplied) ? 'opacity-100 ring-1 ring-green-300' : 'opacity-90'} ${(busy === 'tags' || streamingTitle || streamingCopy || streamingSummary) ? ((busy === 'tags') ? 'animate-pulse pointer-events-none' : 'pointer-events-none') : 'cursor-pointer'}`}
                    role="button"
                    aria-disabled={(busy === 'tags' || streamingTitle || streamingCopy || streamingSummary)}
                    tabIndex={0}
                    onClick={async () => {
                      if (!selectedFile) return;
                      setBusy('tags');
                      try {
                        const api = (await import('../../../src/api')).apiService;
                        const res = await api.generateEnhanceTags(selectedFile.id);
                        setWlCount(res.whitelist_count ?? null);
                        setTagSelected(new Set());
                        // Refresh file to get persisted suggestions from backend
                        window.dispatchEvent(new CustomEvent('pipeline-refresh-request'));
                      } finally { setBusy(null); }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {getIconComponent(optTags?.icon || 'Zap')}
                      <div>
                        <div className="text-sm font-medium">{optTags?.name || 'Keywords / Tags'}</div>
                        <div className="text-xs text-secondary">{optTags?.description || 'Select up to 10 tags from your whitelist.'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2" />
                  </div>

                  {/* Tag suggestions UI */}
                  {hasSuggestions && (
                    <div className="p-3 border rounded-lg space-y-3">
                      {wlCount !== null && wlCount > 500 && (
                        <div className="text-xs text-status-error-text">Whitelist contains {wlCount} tags. Consider pruning to improve LLM focus.</div>
                      )}
                      <div>
                        <div className="text-xs font-semibold mb-2">Old tags (from whitelist)</div>
                        <div className="flex flex-wrap gap-2">
                          {tagOld.map((t: string) => {
                            const sel = tagSelected.has(t);
                            return (
                              <button
                                key={`old-${t}`}
                                onClick={() => {
                                  setTagSelected(prev => {
                                    const next = new Set(prev);
                                    if (next.has(t)) next.delete(t); else next.add(t);
                                    return next;
                                  });
                                }}
                                className={`px-3 py-1.5 text-sm rounded-full border ${sel ? 'bg-status-success-bg text-status-success-text border-status-success-border' : 'bg-surface text-fg border-theme-border'} hover:bg-status-success-bg/50`}
                                title={t}
                              >{t}</button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-2">New tags (suggested)</div>
                        <div className="flex flex-wrap gap-2">
                          {tagNew.map((t: string) => {
                            const sel = tagSelected.has(t);
                            return (
                              <button
                                key={`new-${t}`}
                                onClick={() => {
                                  setTagSelected(prev => {
                                    const next = new Set(prev);
                                    if (next.has(t)) next.delete(t); else next.add(t);
                                    return next;
                                  });
                                }}
                                className={`px-3 py-1.5 text-sm rounded-full border ${sel ? 'bg-status-success-bg text-status-success-text border-status-success-border' : 'bg-surface text-fg border-theme-border'} hover:bg-status-success-bg/50`}
                                title={t}
                              >{t}</button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted">Selected: {tagSelected.size}</div>
                        <Button
                          variant="outline"
                          disabled={!hasSuggestions || streaming || busy === 'tags'}
                          onClick={async () => {
                            if (!selectedFile) return;
                            setBusy('tags');
                            try {
                              const api = (await import('../../../src/api')).apiService;
                              const chosen = Array.from(tagSelected);
                              await api.setEnhanceTags(selectedFile.id, chosen);
                              setTagSelected(new Set());
                              setTagsApplied(true);
                              // Refresh file - backend will have cleared tag_suggestions
                              window.dispatchEvent(new CustomEvent('pipeline-refresh-request'));
                            } finally { setBusy(null); }
                          }}
                        >Apply</Button>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            {/* Compile */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="text-sm font-medium">Compile for Obsidian</div>
              <div className="text-xs text-secondary">Progress: {savedCount}/4</div>
              <Button
                variant="outline"
                disabled={!canCompile}
                onClick={async () => {
                  if (!selectedFile) return;
                  setBusy('compile');
                  try {
                    const api = (await import('../../../src/api')).apiService;
                    await api.compileForObsidian(selectedFile.id);
                  } finally { setBusy(null); }
                }}
              >Compile</Button>
            </div>
          </div>
        </CardContent>
      </Card>

          {/* Split Preview: Sanitised vs Enhanced (only in manual mode) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="w-5 h-5" />
                <span>Sanitised vs Enhanced</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-surface border border-theme-border rounded-lg">
                  <div className="text-xs font-medium text-muted mb-2">Sanitised</div>
                  <div className="text-sm text-fg whitespace-pre-wrap max-h-[60vh] overflow-auto">{selectedFile?.sanitised || selectedFile?.output || 'No sanitised text yet.'}</div>
                </div>
                <div className="p-4 bg-surface border border-theme-border rounded-lg">
                  <div className="text-sm font-medium text-muted mb-2">Enhanced ({selectedId || '—'})</div>
                  <div className="text-sm text-fg whitespace-pre-wrap max-h-[60vh] overflow-auto">{
                    // Prefer local in-memory results while/after streaming until backend refresh arrives
                    selectedId === 'title'
                      ? ((titleText && titleText.length > 0) ? titleText : (
                          streamingTitle ? (titleText || '') : (selectedFile?.enhanced_title || 'Run Title to generate output.')
                        ))
                      : selectedId === 'summary'
                        ? ((summaryText && summaryText.length > 0) ? summaryText : (
                            streamingSummary ? (summaryText || '') : (selectedFile?.enhanced_summary || 'Run Summary to generate output.')
                          ))
                        : ((streamText && streamText.length > 0) ? streamText : (
                            streamingCopy ? (streamText || '') : (selectedFile?.enhanced_copyedit || 'Run Copy Edit to generate output.')
                          ))
                  }</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
