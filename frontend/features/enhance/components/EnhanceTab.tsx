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

interface EnhanceTabProps {
  selectedFile: PipelineFile | null;
  files: PipelineFile[];
}

export function EnhanceTab({ selectedFile }: EnhanceTabProps) {
  const { config } = useEnhancementConfig();
  const [selectedId, setSelectedId] = React.useState<string>('');
  const [workingApplied, setWorkingApplied] = React.useState(false);
  const [summaryApplied, setSummaryApplied] = React.useState(false);
  const [tagsApplied, setTagsApplied] = React.useState(false);
  
  const getOpt = (id: string) => config.options.find(o => o.id === id);
  const [streaming, setStreaming] = React.useState(false);
  const [streamingCopy, setStreamingCopy] = React.useState(false);
  const [streamingSummary, setStreamingSummary] = React.useState(false);
  const [streamText, setStreamText] = React.useState('');
  const streamRef = React.useRef('');
  const [summaryText, setSummaryText] = React.useState('');
  const summaryRef = React.useRef('');
  // Tag suggestion and selection state
  const [tagOld, setTagOld] = React.useState<string[]>([]);
  const [tagNew, setTagNew] = React.useState<string[]>([]);
  const [tagSelected, setTagSelected] = React.useState<Set<string>>(new Set());
  const [wlCount, setWlCount] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState<'copy' | 'summary' | 'tags' | 'compile' | null>(null);
  const esRef = React.useRef<EventSource | null>(null);

  // Consider only the selected file's state for gating, plus local streaming/busy
  const isProcessing = !!(
    streaming ||
    busy !== null ||
    (selectedFile && (
      selectedFile.steps.transcribe === 'processing' ||
      selectedFile.steps.sanitise === 'processing' ||
      selectedFile.steps.enhance === 'processing'
    ))
  );

  // Consider multiple possible backend field names for robustness
  const copyPersisted = (selectedFile as any)?.enhanced_copyedit || (selectedFile as any)?.enhanced_working || (selectedFile as any)?.enhanced || '';
  const summaryPersisted = (selectedFile as any)?.enhanced_summary || '';
  const hasCopy = !!copyPersisted && String(copyPersisted).trim().length > 0;
  const hasSummary = !!summaryPersisted && String(summaryPersisted).trim().length > 0;
  const hasTags = (selectedFile?.enhanced_tags || []).length > 0;
  // Relax stage ordering: only require sanitise done and not processing
  const canCompile = (hasCopy || workingApplied) && (hasSummary || summaryApplied) && (hasTags || tagsApplied) && !isProcessing;
  const savedCount = (hasCopy || workingApplied ? 1 : 0) + (hasSummary || summaryApplied ? 1 : 0) + (hasTags || tagsApplied ? 1 : 0);

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
      blue: 'border-blue-300 bg-blue-100',
      green: 'border-green-300 bg-green-100',
      purple: 'border-purple-300 bg-purple-100',
      orange: 'border-orange-300 bg-orange-100',
      red: 'border-red-300 bg-red-100',
      indigo: 'border-indigo-300 bg-indigo-100'
    };
    return colorMap[color as keyof typeof colorMap] || colorMap.blue;
  };



  if (!selectedFile) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Sparkles className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No File Selected</h3>
          <p className="text-gray-600">
            Please select a sanitised file to begin AI enhancement.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress checklist */}
      <div className="text-xs text-gray-600">Enhancement progress: {savedCount}/3 saved</div>

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
              {((streaming && streamText.length === 0) || (streamingCopy && streamText.length === 0) || (streamingSummary && summaryText.length === 0)) && (
                <span className="ml-2 inline-flex items-center text-xs text-gray-600 animate-fade-in">
                  <span className="animate-spin inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full mr-1" />
                  Preparing…
                </span>
              )}
            </CardTitle>
            <div className="flex items-center space-x-2">
              {selectedFile.steps.enhance === 'done' && (
                <Badge className="bg-green-100 text-green-800">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Completed
                </Badge>
              )}
              {selectedFile.status === 'enhancing' && (
                <Badge className="bg-blue-100 text-blue-800">
                  <Clock className="w-3 h-3 mr-1" />
                  Processing
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File Information */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm text-gray-600">File</p>
              <p className="font-medium">{selectedFile.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Sanitisation Status</p>
              <p className="font-medium">
                {selectedFile.steps.sanitise === 'done' ? 'Ready' : 'Pending'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Enhancement</p>
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
              const optCopy = getOpt('copy-edit');
              const optSumm = getOpt('summary');
              const optTags = getOpt('keywords');

              /* Copy Edit */
              return (
                <>
                  <div
className={`relative flex items-center justify-between p-3 border rounded-lg transition shadow-sm hover:shadow-md hover:ring-1 hover:ring-black/10 ${getColorClasses(optCopy?.color || 'blue')} ${(hasCopy || workingApplied) ? 'opacity-100' : 'opacity-90'}`}
                    aria-disabled={(streamingCopy || streamingSummary || busy === 'tags')}
                  >
                    <div
                      className={`flex items-center gap-2 flex-1 ${(!streamingCopy && !streamingSummary && busy !== 'tags') ? 'cursor-pointer' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={async () => {
                        if (!selectedFile || streamingCopy || streamingSummary || busy === 'tags') return;
                        setSelectedId('copy-edit');
                        try { esRef.current?.close(); } catch { /* Already closed */ }
                        const prompt = optCopy?.systemPrompt || '';
                        try {
                        setStreamingCopy(true); setStreamText(''); streamRef.current='';
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
                          setStreamingCopy(false); es.close();
                          // Ask app to refresh selected file so View reflects persisted content
                          try {
                            window.dispatchEvent(new CustomEvent('pipeline-refresh-request'));
                          } catch {
                            // Event dispatch failure is non-blocking
                          }
                          });
                          es.addEventListener('error', () => { setStreamingCopy(false); es.close(); });
                        } catch { setStreamingCopy(false); }
                      }}
                    >
                      {getIconComponent(optCopy?.icon || 'FileText')}
                      <div>
                        <div className="text-sm font-medium">{optCopy?.name || 'Copy Edit (Fix Spelling/Grammar)'}</div>
                        <div className="text-xs text-gray-600">{optCopy?.description || 'Rewrite to correct spelling, grammar, readability. Output only corrected text.'}</div>
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
                    aria-disabled={(streamingSummary || streamingCopy || busy === 'tags')}
                  >
                    <div
                      className={`flex items-center gap-2 flex-1 ${(!streamingSummary && !streamingCopy && busy !== 'tags') ? 'cursor-pointer' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={async () => {
                        if (!selectedFile || streamingSummary || streamingCopy || busy === 'tags') return;
                        setSelectedId('summary');
                        try { esRef.current?.close(); } catch { /* Already closed */ }
                        setBusy('summary'); setSummaryText('');
                        try {
                        setStreamingSummary(true); summaryRef.current='';
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
                        } catch { setStreamingSummary(false); }
                      }}
                    >
                      {getIconComponent(optSumm?.icon || 'FileText')}
                      <div>
                        <div className="text-sm font-medium">{optSumm?.name || 'Summary (1 sentence)'}</div>
                        <div className="text-xs text-gray-600">{optSumm?.description || 'Generate exactly one sentence (20–30 words).'}</div>
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
className={`relative flex items-center justify-between p-3 border rounded-lg transition shadow-sm hover:shadow-md hover:ring-1 hover:ring-black/10 ${getColorClasses(optTags?.color || 'green')} ${(hasTags || tagsApplied) ? 'opacity-100 ring-1 ring-green-300' : 'opacity-90'} ${(busy === 'tags' || streamingCopy || streamingSummary) ? ((busy === 'tags') ? 'animate-pulse pointer-events-none' : 'pointer-events-none') : 'cursor-pointer'}`}
                    role="button"
                    aria-disabled={(busy === 'tags' || streamingCopy || streamingSummary)}
                    tabIndex={0}
                    onClick={async () => {
                      if (!selectedFile) return;
                      setBusy('tags');
                      try {
                        const api = (await import('../../../src/api')).apiService;
                        const res = await api.generateEnhanceTags(selectedFile.id);
                        setTagOld(res.old || []);
                        setTagNew(res.new || []);
                        setWlCount(res.whitelist_count ?? null);
                        setTagSelected(new Set());
                      } finally { setBusy(null); }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {getIconComponent(optTags?.icon || 'Zap')}
                      <div>
                        <div className="text-sm font-medium">{optTags?.name || 'Keywords / Tags'}</div>
                        <div className="text-xs text-gray-600">{optTags?.description || 'Select up to 10 tags from your whitelist.'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2" />
                  </div>

                  {/* Tag suggestions UI */}
                  {(tagOld.length + tagNew.length) > 0 && (
                    <div className="p-3 border rounded-lg space-y-3">
                      {wlCount !== null && wlCount > 500 && (
                        <div className="text-xs text-red-600">Whitelist contains {wlCount} tags. Consider pruning to improve LLM focus.</div>
                      )}
                      <div>
                        <div className="text-xs font-semibold mb-2">Old tags (from whitelist)</div>
                        <div className="flex flex-wrap gap-2">
                          {tagOld.map(t => {
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
                                className={`px-3 py-1.5 text-sm rounded-full border ${sel ? 'bg-green-100 text-green-800 border-green-300' : 'bg-white text-gray-800 border-gray-300'} hover:bg-green-50`}
                                title={t}
                              >{t}</button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-2">New tags (suggested)</div>
                        <div className="flex flex-wrap gap-2">
                          {tagNew.map(t => {
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
                                className={`px-3 py-1.5 text-sm rounded-full border ${sel ? 'bg-green-100 text-green-800 border-green-300' : 'bg-white text-gray-800 border-gray-300'} hover:bg-green-50`}
                                title={t}
                              >{t}</button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-500">Selected: {tagSelected.size}</div>
                        <Button
                          variant="outline"
                          disabled={(tagOld.length + tagNew.length) === 0 || streaming || busy === 'tags'}
                          onClick={async () => {
                            if (!selectedFile) return;
                            setBusy('tags');
                            try {
                              const api = (await import('../../../src/api')).apiService;
                              const chosen = Array.from(tagSelected);
                              await api.setEnhanceTags(selectedFile.id, chosen);
                              setTagOld([]); setTagNew([]); setTagSelected(new Set());
                              setTagsApplied(true);
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
              <div className="text-xs text-gray-600">Progress: {savedCount}/3</div>
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

      {/* Split Preview: Sanitised vs Enhanced */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileText className="w-5 h-5" />
            <span>Sanitised vs Enhanced</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-white border rounded-lg">
              <div className="text-xs font-medium text-gray-500 mb-2">Sanitised</div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap max-h-[60vh] overflow-auto">{selectedFile?.sanitised || selectedFile?.output || 'No sanitised text yet.'}</div>
            </div>
            <div className="p-4 bg-white border rounded-lg">
              <div className="text-sm font-medium text-gray-500 mb-2">Enhanced ({selectedId || '—'})</div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap max-h-[60vh] overflow-auto">{
                // Prefer local in-memory results while/after streaming until backend refresh arrives
                selectedId === 'summary'
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
    </div>
  );
}