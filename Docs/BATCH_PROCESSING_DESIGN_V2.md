# Batch File Processing System Design v2.0

## Executive Summary

This document outlines the design for adding batch file processing capabilities to Skrift, enabling sequential processing of multiple audio files through the transcription and enhancement pipeline.

**Current State**: Single file processing only  
**Target State**: Sequential batch processing with smart step-skipping and resume capability  
**Estimated Effort**: Medium (3-4 days implementation + testing)  
**Impact**: High (major UX and productivity improvement)

**Key Principles**:
- Simple sequential processing (one file at a time, one batch at a time)
- Smart step-skipping (only process what's needed)
- Files sorted by audio creation date (oldest first)
- Batch survives sleep/restart with resume prompt
- No batching for Sanitise (requires manual audio review)

---

## 1. User Stories & Benefits

### Primary User Story
*"I record 15 voice memos during the day. At night, I want to upload them all, start batch processing, and review transcripts the next morning."*

### Current Pain Points
1. **Manual tedium**: Must click "Start Transcription" on each file individually
2. **No overnight processing**: Can't start a long batch and walk away
3. **Model reload overhead**: Enhancement loads/unloads MLX model for each file (slow)
4. **Lost progress**: If interrupted, must remember which files were done
5. **Sequential bottleneck**: Processing one file at a time with manual intervention

### Benefits of Batching
- ✅ **Set-and-forget**: Queue 20 files, start batch, come back later
- ✅ **Faster enhancement**: MLX model stays loaded between files
- ✅ **Smart resume**: Batch continues after sleep/restart where it left off
- ✅ **Skip completed**: Only processes steps that haven't been done yet
- ✅ **Clear progress**: Visual progress indicator with per-file status
- ✅ **Error resilience**: Failed files don't stop the batch

---

## 2. Design Overview

### 2.1 Core Architecture

**Sequential Processing**: One file at a time, one batch at a time
- Eliminates resource contention (no parallel Whisper + MLX)
- Predictable progress and timing
- Simpler error handling and recovery
- Easier to debug and maintain

**Two Batch Types**:
1. **Batch Transcribe**: Processes uploaded files through transcription
2. **Batch Enhance**: Processes sanitised files through enhancement pipeline

### 2.2 Smart Step Skipping

**Batch Transcribe**:
- Only processes files that haven't been transcribed yet
- Skips files already completed

**Batch Enhance**:
```
For each file, check completion status:
├── Copy Edit: Done ✅ → Skip
├── Summary: Not done → Process ⚙️
├── Tags: Not done → Process ⚙️
└── Compile: Never auto-run (needs manual tag selection)
```

### 2.3 File Ordering
All files sorted by **audio creation date** (oldest first)
- Matches chronological recording order
- Consistent with how users think about their recordings
- Applied to all file lists throughout app

---

## 3. User Interface Design

### 3.1 Batch Buttons

#### Transcribe Tab
```typescript
<Button disabled={untranscribedFiles.length < 2}>
  Batch Transcribe All ({untranscribedFiles.length} files)
</Button>
```
- **Enabled**: When 2+ files are uploaded but not transcribed
- **Action**: Starts batch transcription in creation date order

#### Enhance Tab
```typescript
<Button disabled={readyForEnhanceFiles.length < 2}>
  Batch Enhance All ({readyForEnhanceFiles.length} files)
</Button>
```
- **Enabled**: When 2+ files are sanitised but not fully enhanced
- **Action**: Runs Copy Edit → Summary → Tags for each file (skips completed steps)

### 3.2 Batch Progress Dropdown

**Location**: Top of tab (only visible when batch is active)

```
🔄 Batch Transcribe: 3/20 files
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ recording_001.m4a (2m 30s)
✅ recording_002.m4a (1m 45s)
⚙️ recording_003.m4a (processing... 45s elapsed)
❌ recording_004.m4a (failed: invalid audio format)
⏳ recording_005.m4a
⏳ recording_006.m4a
... (14 more) [Show All ▼]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Cancel Batch]
```

**Status Icons**:
- ✅ **Completed** (green)
- ⚙️ **Processing** (blue spinner)  
- ❌ **Failed** (red)
- ⏳ **Waiting** (gray)

### 3.3 Enhancement Pipeline Indicator

For Batch Enhance, each file shows 4-step progress:

```
⚙️ recording_002.m4a (Summary in progress...)
   Copy Edit ✅ | Summary ⚙️ | Tags ⏳ | Compile ⏸️

❌ recording_003.m4a (Copy Edit failed)
   Copy Edit ❌ | Summary ✅ | Tags ✅ | Compile ⏸️
```

**Step States**:
- ✅ **Success** (green bar)
- ❌ **Failed** (red bar)  
- ⚙️ **Processing** (blue spinner)
- ⏳ **Waiting** (gray bar)
- ⏸️ **Skipped/Manual** (gray, not run)

**Compile Rule**: Only enabled if Copy Edit ✅ AND Summary ✅ AND Tags ✅  
**Batch Behavior**: Never auto-runs Compile (requires manual tag selection)

### 3.4 Resume Dialog

After sleep/restart, if batch state exists:

```
┌───────────────────────────────────┐
│   Resume Batch Processing?        │
├───────────────────────────────────┤
│   Batch Transcribe was running    │
│   17 files remaining              │
│                                   │
│   Continue where you left off?    │
│                                   │
│   [Yes, Resume]  [No, Cancel]    │
└───────────────────────────────────┘
```

---

## 4. Technical Implementation

### 4.1 Backend Architecture

#### Batch State Manager
**Location**: `backend/services/batch_manager.py`

```python
class BatchManager:
    def start_transcribe_batch(self, file_ids: List[str]) -> str
    def start_enhance_batch(self, file_ids: List[str]) -> str
    def get_batch_status(self, batch_id: str) -> BatchStatus
    def cancel_batch(self, batch_id: str) -> bool
    def resume_batch(self, batch_id: str) -> bool
    def process_next_file(self, batch_id: str) -> None
```

#### Batch State Persistence
**File**: `backend/data/batch_state.json`

```json
{
  "batch_id": "batch_2025_10_18_120500",
  "type": "transcribe",
  "status": "running",
  "files": [
    {
      "file_id": "abc123",
      "status": "completed",
      "started_at": "2025-10-18T12:05:00Z",
      "completed_at": "2025-10-18T12:07:30Z",
      "processing_time_seconds": 150
    },
    {
      "file_id": "def456", 
      "status": "processing",
      "started_at": "2025-10-18T12:07:35Z"
    },
    {
      "file_id": "ghi789",
      "status": "waiting"
    }
  ],
  "consecutive_failures": 0,
  "mlx_model_loaded": true,
  "started_at": "2025-10-18T12:05:00Z",
  "last_activity": "2025-10-18T12:07:35Z"
}
```

### 4.2 API Endpoints

#### New Endpoints
```python
# Start batch processing
POST /api/batch/transcribe/start
     Body: { file_ids: List[str] }
     Returns: { batch_id: str, started_at: str }

POST /api/batch/enhance/start  
     Body: { file_ids: List[str] }
     Returns: { batch_id: str, started_at: str }

# Get batch status
GET /api/batch/{batch_id}/status
    Returns: {
      batch_id: str,
      type: 'transcribe' | 'enhance',
      status: 'running' | 'completed' | 'cancelled' | 'failed',
      files: List[BatchFileStatus],
      current_file_id: Optional[str],
      completed_count: int,
      failed_count: int,
      total_count: int,
      consecutive_failures: int,
      progress_percentage: float
    }

# Control batch
POST /api/batch/{batch_id}/cancel
     Returns: { cancelled: true }
     
POST /api/batch/{batch_id}/resume
     Returns: { resumed: true }
     
# Check for existing batch
GET /api/batch/current
    Returns: Optional[BatchStatus]
```

### 4.3 Processing Logic

#### Batch Transcribe Flow
```python
async def process_transcribe_batch(batch_id: str):
    batch = load_batch_state(batch_id)
    
    for file_info in batch.files:
        if file_info.status in ['completed', 'skipped']:
            continue
            
        # Update status to processing
        file_info.status = 'processing'
        file_info.started_at = datetime.now()
        save_batch_state(batch)
        
        try:
            # Run transcription (existing code)
            result = await transcribe_file(file_info.file_id)
            file_info.status = 'completed'
            file_info.completed_at = datetime.now()
            batch.consecutive_failures = 0
            
        except Exception as e:
            file_info.status = 'failed' 
            file_info.error = str(e)
            batch.consecutive_failures += 1
            
            # Stop batch if 3 consecutive failures
            if batch.consecutive_failures >= 3:
                batch.status = 'failed'
                break
                
        save_batch_state(batch)
        
    batch.status = 'completed'
    save_batch_state(batch)
```

#### Batch Enhance Flow  
```python
async def process_enhance_batch(batch_id: str):
    batch = load_batch_state(batch_id)
    mlx_model = None
    
    try:
        # Load MLX model once for entire batch
        mlx_model = load_mlx_model()
        batch.mlx_model_loaded = True
        
        for file_info in batch.files:
            if file_info.status in ['completed', 'skipped']:
                continue
                
            file_steps = get_file_enhancement_status(file_info.file_id)
            
            # Process only incomplete steps
            if not file_steps.copy_edit_done:
                await enhance_copy_edit(file_info.file_id, mlx_model)
                
            if not file_steps.summary_done:
                await enhance_summary(file_info.file_id, mlx_model)
                
            if not file_steps.tags_done:
                await enhance_generate_tags(file_info.file_id, mlx_model)
                
            # NOTE: Compile never auto-runs (needs manual tag selection)
            
            file_info.status = 'completed'
            
    finally:
        # Unload MLX model after batch
        if mlx_model:
            unload_mlx_model(mlx_model)
            batch.mlx_model_loaded = False
```

---

## 5. Frontend Implementation

### 5.1 New Components

#### BatchButton.tsx
```typescript
interface BatchButtonProps {
  type: 'transcribe' | 'enhance';
  eligibleFiles: PipelineFile[];
  onStartBatch: (fileIds: string[]) => void;
  disabled?: boolean;
}

export function BatchButton({ type, eligibleFiles, onStartBatch, disabled }: BatchButtonProps) {
  const isEnabled = eligibleFiles.length >= 2 && !disabled;
  const buttonText = `Batch ${type === 'transcribe' ? 'Transcribe' : 'Enhance'} All (${eligibleFiles.length} files)`;
  
  return (
    <Button 
      disabled={!isEnabled}
      onClick={() => onStartBatch(eligibleFiles.map(f => f.id))}
      className="bg-blue-600 hover:bg-blue-700"
    >
      {buttonText}
    </Button>
  );
}
```

#### BatchDropdown.tsx  
```typescript
interface BatchDropdownProps {
  batchStatus: BatchStatus;
  onCancel: () => void;
  onShowAll: () => void;
}

export function BatchDropdown({ batchStatus, onCancel, onShowAll }: BatchDropdownProps) {
  const { type, files, completed_count, total_count, current_file_id } = batchStatus;
  
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-blue-900">
          🔄 Batch {type === 'transcribe' ? 'Transcribe' : 'Enhance'}: {completed_count}/{total_count} files
        </h3>
        <Button variant="outline" onClick={onCancel} size="sm">
          Cancel Batch
        </Button>
      </div>
      
      <div className="space-y-2 max-h-32 overflow-y-auto">
        {files.slice(0, 5).map((file) => (
          <BatchFileRow 
            key={file.file_id} 
            file={file} 
            type={type}
            isCurrent={file.file_id === current_file_id}
          />
        ))}
        {files.length > 5 && (
          <button onClick={onShowAll} className="text-blue-600 text-sm">
            ... ({files.length - 5} more) [Show All ▼]
          </button>
        )}
      </div>
    </div>
  );
}
```

#### BatchResumeDialog.tsx
```typescript
interface BatchResumeDialogProps {
  batchStatus: BatchStatus;
  onResume: () => void;
  onCancel: () => void;
}

export function BatchResumeDialog({ batchStatus, onResume, onCancel }: BatchResumeDialogProps) {
  const remainingCount = batchStatus.total_count - batchStatus.completed_count;
  
  return (
    <Dialog open={true}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resume Batch Processing?</DialogTitle>
        </DialogHeader>
        
        <div className="py-4">
          <p>Batch {batchStatus.type} was running</p>
          <p className="font-medium">{remainingCount} files remaining</p>
          <p className="text-sm text-gray-600 mt-2">Continue where you left off?</p>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            No, Cancel
          </Button>
          <Button onClick={onResume}>
            Yes, Resume
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 5.2 Modified Components

#### GlobalFileSelector.tsx
Add batch status indicators to file cards:

```typescript
function FileCard({ file }: { file: PipelineFile }) {
  const isInBatch = file.batchStatus?.inActiveBatch;
  
  return (
    <Card className={isInBatch ? 'border-blue-300 bg-blue-50' : ''}>
      <CardContent>
        <div className="flex items-center justify-between">
          <FileInfo file={file} />
          {isInBatch && (
            <Badge className="bg-blue-100 text-blue-800">
              In Batch
            </Badge>
          )}
        </div>
        
        <PipelineSteps 
          file={file} 
          disabled={isInBatch} // Gray out manual buttons during batch
        />
      </CardContent>
    </Card>
  );
}
```

#### TranscribeTab.tsx
```typescript
function TranscribeTab({ files }: TranscribeTabProps) {
  const [currentBatch, setCurrentBatch] = useState<BatchStatus | null>(null);
  const untranscribedFiles = files.filter(f => f.steps.transcribe !== 'done');
  
  return (
    <div className="space-y-6">
      {/* Batch dropdown (only shown when batch active) */}
      {currentBatch && (
        <BatchDropdown 
          batchStatus={currentBatch}
          onCancel={handleCancelBatch}
          onShowAll={handleShowAllFiles}
        />
      )}
      
      {/* Batch button */}
      <BatchButton
        type="transcribe"
        eligibleFiles={untranscribedFiles}
        onStartBatch={handleStartBatch}
        disabled={!!currentBatch}
      />
      
      {/* Existing single-file UI */}
      <SingleFileTranscribeUI files={files} disabled={!!currentBatch} />
    </div>
  );
}
```

---

## 6. Error Handling & Edge Cases

### 6.1 File-Level Failures

**Single File Fails**: 
- Mark file as ❌ failed in batch dropdown
- Log error message for user review
- Continue processing next file
- Reset consecutive failure counter on next success

**Consecutive Failures**:
- Track `consecutive_failures` counter
- If 3 consecutive files fail → stop entire batch
- Show error banner: *"Batch stopped after 3 consecutive failures. Last error: 'MLX model failed to load'"*
- Provide options: [Review Failed Files] [Retry Batch]

### 6.2 Enhancement Step Failures

**Partial Enhancement Failures**:
```
File processing: Copy Edit ✅ → Summary ❌ → Tags ⚙️ → Compile ⏸️
```
- If Copy Edit fails → still attempt Summary and Tags
- If Summary fails → still attempt Tags  
- Only stop file processing if ALL steps fail
- Pipeline indicator shows individual step status

### 6.3 System Interruptions

**App Close/Sleep During Batch**:
1. Batch state persists to `batch_state.json`
2. Current processing file marked as failed
3. On app reopen → show BatchResumeDialog
4. If user resumes → continue from next file
5. MLX model reloads automatically

**Critical System Errors**:
- Out of disk space → pause batch, show warning
- MLX model fails to load → stop batch immediately  
- Corrupt audio file → mark failed, continue batch

### 6.4 Resource Management

**Memory Usage**:
- MLX model stays loaded for entire Enhance batch (~8GB)
- Monitor system memory, show warning if >90% usage
- Gracefully handle model loading failures

**Disk Space**:
- Check available space before starting batch
- If <2GB remaining → show warning, allow user to continue or cancel
- Transcripts are small (~10KB each) so not a major concern

---

## 7. Implementation Plan

### Phase 1: Core Infrastructure (Day 1)
- [ ] **BatchManager** class with state persistence
- [ ] **API endpoints** for start/status/cancel/resume  
- [ ] **Batch state** JSON schema and file handling
- [ ] **Sequential processing** loop for transcription
- [ ] Unit tests for batch state management

### Phase 2: Batch Transcribe (Day 1-2)  
- [ ] **BatchButton** component for Transcribe tab
- [ ] **BatchDropdown** component with progress display
- [ ] **File sorting** by audio creation date
- [ ] **Consecutive failure** detection and batch stopping
- [ ] **Integration** with existing transcription service
- [ ] Manual testing with 5-10 files

### Phase 3: Batch Enhance (Day 2-3)
- [ ] **Smart step skipping** logic (only run incomplete steps)
- [ ] **MLX model persistence** during batch
- [ ] **4-step pipeline indicator** per file  
- [ ] **Enhancement batch processing** loop
- [ ] **Per-step failure handling** (continue on partial failures)
- [ ] Manual testing with enhancement pipeline

### Phase 4: Sleep/Resume (Day 3)
- [ ] **BatchResumeDialog** component
- [ ] **Batch state detection** on app startup
- [ ] **Resume functionality** (continue from next file)
- [ ] **MLX model reloading** after resume
- [ ] Test sleep/wake cycle on macOS

### Phase 5: UI Integration (Day 3-4)
- [ ] **GlobalFileSelector** batch indicators
- [ ] **Tab integration** (disable manual buttons during batch)
- [ ] **File sorting** throughout app by creation date
- [ ] **Error messaging** and retry workflows
- [ ] **Polish and animations**

### Phase 6: Testing & Documentation (Day 4)
- [ ] **End-to-end testing** with 20+ files
- [ ] **Error scenario testing** (failures, interruptions)
- [ ] **Performance testing** (model loading, memory usage)
- [ ] **Documentation updates** (user guide, API docs)
- [ ] **Code review** and cleanup

---

## 8. Success Metrics

### Performance Targets
- **Throughput**: Process 20 files in <45 minutes (vs 2+ hours manually)
- **Model Loading**: MLX model loads once per batch (not per file)
- **Resume Time**: <5 seconds to resume after sleep/restart
- **Memory Usage**: <12GB total during Enhance batch
- **Error Recovery**: Successfully resume after interruption 95% of time

### User Experience Goals
- **Adoption**: Users process 5+ files in batch within first week
- **Reliability**: <5% of batches fail due to technical issues  
- **Usability**: Clear progress indication, no confusion about batch state
- **Error Handling**: Users can recover from failures without losing progress

---

## 9. Future Enhancements

### v2.0 Features (Not in Initial Release)
- **Parallel processing**: Run Transcribe + Enhance batches simultaneously
- **Smart scheduling**: Process shorter files first for perceived speed
- **Batch templates**: Save common batch configurations
- **Progress notifications**: macOS notifications on batch completion
- **Advanced error recovery**: Auto-retry with exponential backoff
- **Batch analytics**: Statistics on processing times and success rates

### Integration Opportunities  
- **Export automation**: Auto-export to Obsidian after enhancement
- **Cloud backup**: Sync batch results across devices
- **Quality metrics**: Track transcription accuracy across batches

---

## Appendix A: User Workflows

### Workflow 1: Daily Voice Memo Processing
1. **During day**: Record 15 voice memos on iPhone
2. **Evening**: AirDrop all files to Mac, drag into Skrift
3. **Start batch**: Click "Batch Transcribe All (15 files)"
4. **Walk away**: Batch processes overnight (45 minutes)  
5. **Next morning**: Review transcripts, start "Batch Enhance All"
6. **Walk away**: Enhancement completes (30 minutes)
7. **Review**: Click through files, approve tags, export to Obsidian

### Workflow 2: Interview Processing
1. **After interview**: Upload 3-hour recording split into 6 segments
2. **Start transcription**: Batch processes all segments (20 minutes)
3. **Manual sanitise**: Review each segment, fix names/terminology 
4. **Batch enhance**: Generate summaries and tags for all segments
5. **Tag selection**: Choose relevant tags per segment based on content
6. **Export**: Compile final interview notes with metadata

### Workflow 3: Batch Recovery
1. **Start batch**: 20 files queued for overnight processing
2. **Mac sleeps**: Process interrupted at file 8 of 20
3. **Next morning**: Open Skrift, resume dialog appears
4. **Resume**: "Yes, Resume" → continues from file 9
5. **Review failures**: File 3 and 12 failed, manually retry later
6. **Complete**: 18/20 files successfully processed

---

## Appendix B: Technical Architecture Diagram

```
┌─────────────────────────────────────────┐
│                Frontend                  │
├─────────────────────────────────────────┤
│ TranscribeTab                           │
│ ├── BatchButton                         │
│ ├── BatchDropdown                       │
│ └── SingleFileUI (disabled during batch)│
│                                         │
│ EnhanceTab                              │
│ ├── BatchButton                         │
│ ├── BatchDropdown                       │
│ ├── 4-Step Pipeline Indicator           │
│ └── SingleFileUI (disabled during batch)│
│                                         │
│ GlobalFileSelector                      │
│ ├── File Cards (sorted by creation date)│
│ └── Batch Status Indicators             │
│                                         │
│ BatchResumeDialog (on app startup)      │
└─────────────────────────────────────────┘
                    │ HTTP/WebSocket
┌─────────────────────────────────────────┐
│                Backend                   │
├─────────────────────────────────────────┤
│ BatchManager                            │
│ ├── start_batch() → Sequential Loop     │
│ ├── process_next_file()                 │
│ ├── handle_failures()                   │
│ └── persist_state() → batch_state.json  │
│                                         │
│ MLX Model Manager                       │
│ ├── load_once_per_batch()               │
│ ├── keep_in_memory()                    │
│ └── unload_after_completion()           │
│                                         │
│ Existing Services (unchanged)           │
│ ├── TranscriptionService                │
│ ├── EnhancementService                  │
│ └── StatusTracker                       │
└─────────────────────────────────────────┘
                    │
┌─────────────────────────────────────────┐
│            File System                   │
├─────────────────────────────────────────┤
│ ~/Documents/Voice Transcription.../     │
│ ├── [file_id]/status.json (per file)    │
│ └── processed audio, transcripts        │
│                                         │
│ backend/data/                           │
│ └── batch_state.json (global batch)     │
└─────────────────────────────────────────┘
```

---

**Document Version**: 2.0  
**Last Updated**: 2025-10-18  
**Author**: AI Assistant  
**Status**: Final Design for Implementation

**Key Changes from v1.0**:
- Simplified from complex queue-based to sequential processing
- Removed concurrent processing complexity  
- Added smart step-skipping and resume capability
- Focused on two clear batch types: Transcribe and Enhance
- Eliminated Sanitise batching (manual review required)
- Added comprehensive error handling and recovery flows