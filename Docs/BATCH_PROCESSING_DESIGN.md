# Batch File Processing System Design

## Executive Summary

This document outlines the design for adding batch file processing capabilities to THE APP V2.0, enabling concurrent processing of multiple audio files through the transcription → sanitization → enhancement → export pipeline.

**Current State**: Single file processing with blocking operations  
**Target State**: Queue-based concurrent processing with configurable parallelism  
**Estimated Effort**: Medium-High (3-4 days implementation + testing)  
**Impact**: High (major UX and productivity improvement)

---

## 1. Current Architecture Analysis

### 1.1 Processing Flow
```
Upload → Transcribe → Sanitise → Enhance → Export
```

Each step is independent per file, with status tracked in JSON files:
- `processing_status.json` - Overall file status
- `transcription_status.json` - Transcription progress
- `sanitisation_status.json` - Sanitisation state
- `enhancement_status.json` - Enhancement state

### 1.2 Current Limitations
1. **Single file processing**: Only one file can be transcribed at a time
2. **Blocking operations**: Enhancement blocks other files from starting
3. **No queue management**: Users must wait for completion before starting next file
4. **Resource contention**: MLX model loading not optimized for concurrent use
5. **UI limitations**: No batch status overview or queue management interface

### 1.3 Async Patterns Currently Used
- **Transcription**: Threading with heartbeat status updates
- **Sanitisation**: Synchronous processing (fast operation)
- **Enhancement**: SSE streaming with blocking model inference
- **Export**: Synchronous file writing

---

## 2. Proposed Architecture

### 2.1 Core Components

#### A. Processing Queue Manager
**Location**: `backend/services/queue_manager.py`

```python
class ProcessingQueue:
    """Manages queue of files waiting for processing"""
    - add_to_queue(file_id, step, priority)
    - remove_from_queue(file_id, step)
    - get_queue_position(file_id, step)
    - get_queue_status()
    - reorder_queue(file_id, new_position)
```

**Responsibilities**:
- Maintain ordered queue per processing step
- Handle priority/reordering
- Persist queue state to disk (survive restarts)
- Emit queue change events

#### B. Worker Pool Manager
**Location**: `backend/services/worker_pool.py`

```python
class WorkerPool:
    """Manages concurrent workers per processing step"""
    - start_worker(step_type, file_id)
    - stop_worker(file_id)
    - get_active_workers()
    - check_capacity(step_type)
    - wait_for_slot(step_type)
```

**Responsibilities**:
- Enforce concurrency limits per step type
- Track active workers and resource usage
- Handle worker lifecycle (start, monitor, cleanup)
- Graceful shutdown coordination

#### C. Batch Coordinator
**Location**: `backend/services/batch_coordinator.py`

```python
class BatchCoordinator:
    """Orchestrates batch processing workflow"""
    - submit_batch(file_ids)
    - process_next_in_queue(step)
    - handle_step_completion(file_id, step)
    - handle_step_failure(file_id, step, error)
    - get_batch_status(batch_id)
```

**Responsibilities**:
- Coordinate queue → worker → next step flow
- Auto-progress files through pipeline steps
- Error handling and retry logic
- Batch-level status aggregation

### 2.2 Concurrency Limits

#### Recommended Limits (configurable via settings)
```python
CONCURRENCY_LIMITS = {
    'transcribe': 3,      # CPU-bound, multiple threads OK
    'sanitise': 5,        # Fast, minimal resource use
    'enhance': 1,         # MLX model - memory intensive, single instance
    'export': 3           # I/O bound, multiple OK
}
```

**Rationale**:
- **Transcribe**: Whisper can run multiple instances with acceptable CPU load
- **Sanitise**: Lightweight text processing, high concurrency safe
- **Enhance**: MLX model requires ~8GB memory, single instance safest initially
- **Export**: File I/O limited, moderate concurrency

#### Future Optimization
- Enhance step could support 2-3 concurrent if model kept in memory
- Dynamic limits based on system resource monitoring

### 2.3 Queue Persistence

**Storage**: `backend/data/queues/`
```
queues/
├── transcribe_queue.json
├── sanitise_queue.json
├── enhance_queue.json
└── export_queue.json
```

**Schema**:
```json
{
  "queue": [
    {
      "file_id": "abc123",
      "priority": 0,
      "added_at": "2024-01-15T10:30:00Z",
      "attempts": 0,
      "last_error": null
    }
  ],
  "active": {
    "def456": {
      "started_at": "2024-01-15T10:35:00Z",
      "worker_pid": 12345
    }
  }
}
```

---

## 3. API Changes

### 3.1 New Endpoints

#### Queue Management
```
GET  /api/queue/status
     → Returns all queues with positions and active workers

POST /api/queue/{step}/add
     Body: { file_id, priority? }
     → Adds file to step queue

DELETE /api/queue/{step}/{file_id}
     → Removes file from queue (cancel)

PATCH /api/queue/{step}/{file_id}/priority
     Body: { priority }
     → Changes queue priority/position
```

#### Batch Operations
```
POST /api/batch/submit
     Body: { file_ids: [], auto_progress: true }
     → Submits batch of files, optionally auto-progress through pipeline
     
GET  /api/batch/{batch_id}/status
     → Returns aggregated status of all files in batch

POST /api/batch/{batch_id}/cancel
     → Cancels all remaining files in batch
```

### 3.2 Modified Endpoints

#### Transcribe
```
POST /api/process/transcribe/{file_id}
     New behavior: Adds to queue if workers at capacity
     Returns: { queued: true, position: 3 } OR starts immediately
```

#### Enhance, Sanitise, Export
Similar queue-aware behavior for each step.

### 3.3 WebSocket for Real-time Updates

**New**: `WS /api/ws/queue`

Broadcasts events:
```json
{
  "event": "queue_updated",
  "step": "transcribe",
  "queue_length": 5,
  "active_workers": 2
}

{
  "event": "file_started",
  "file_id": "abc123",
  "step": "enhance"
}

{
  "event": "file_completed",
  "file_id": "abc123", 
  "step": "transcribe",
  "next_step": "sanitise"
}
```

---

## 4. Frontend Changes

### 4.1 New UI Components

#### A. Queue Status Panel
**Location**: `frontend/features/shared/components/QueueStatusPanel.tsx`

Shows:
- Current queue length per step
- Active workers / capacity per step
- Estimated wait time
- Quick actions (pause/resume queue)

#### B. Batch Upload Interface
**Location**: `frontend/features/upload/components/BatchUploadDialog.tsx`

Features:
- Multi-file selection
- Preview file list with individual remove
- Batch settings (auto-progress, priority)
- Submit batch button

#### C. Batch Progress Tracker
**Location**: `frontend/features/shared/components/BatchProgressTracker.tsx`

Displays:
- Progress per file in batch
- Current step per file
- Errors with retry option
- Overall batch completion percentage

#### D. Queue Position Indicator
**Location**: `frontend/features/shared/components/QueuePositionBadge.tsx`

Small badge showing:
- "Processing..."
- "Queued (position 3 of 7)"
- "Waiting for slot..."

### 4.2 Modified Components

#### GlobalFileSelector
- Add queue position badges to file cards
- Show active processing indicator vs queued state
- Bulk select for batch operations

#### Tab Components
- Show queue status banner at top
- Disable manual "Start" buttons when queued
- Display queue position in file details

### 4.3 State Management

**New Context**: `frontend/features/shared/context/QueueContext.tsx`

```typescript
interface QueueContextType {
  queues: Record<Step, QueueItem[]>;
  activeWorkers: Record<Step, WorkerInfo[]>;
  refreshQueues: () => void;
  addToQueue: (fileId: string, step: Step) => void;
  removeFromQueue: (fileId: string, step: Step) => void;
  submitBatch: (fileIds: string[]) => void;
}
```

Connects to WebSocket for real-time updates.

---

## 5. Data Model Changes

### 5.1 PipelineFile Extensions

Add fields to `backend/models/pipeline_file.py`:

```python
@dataclass
class PipelineFile:
    # ... existing fields ...
    
    # New batch processing fields
    batch_id: Optional[str] = None
    queue_position: Optional[int] = None
    queued_at: Optional[str] = None
    processing_priority: int = 0
    auto_progress: bool = True
```

### 5.2 New Models

#### BatchInfo
```python
@dataclass
class BatchInfo:
    batch_id: str
    file_ids: List[str]
    created_at: str
    completed_count: int
    failed_count: int
    in_progress_count: int
    status: Literal['pending', 'processing', 'completed', 'cancelled']
```

#### QueueItem
```python
@dataclass
class QueueItem:
    file_id: str
    step: str
    priority: int
    added_at: str
    attempts: int
    last_error: Optional[str]
```

---

## 6. Implementation Plan

### Phase 1: Queue Infrastructure (Day 1)
- [ ] Implement ProcessingQueue class
- [ ] Add queue persistence to disk
- [ ] Create queue management endpoints
- [ ] Unit tests for queue operations

### Phase 2: Worker Pool (Day 1-2)
- [ ] Implement WorkerPool with concurrency limits
- [ ] Integrate with existing transcription threading
- [ ] Add worker lifecycle management
- [ ] Worker pool unit tests

### Phase 3: Batch Coordinator (Day 2)
- [ ] Implement BatchCoordinator
- [ ] Auto-progression through pipeline steps
- [ ] Error handling and retry logic
- [ ] Integration tests for multi-file flow

### Phase 4: API Integration (Day 2-3)
- [ ] Modify existing endpoints to be queue-aware
- [ ] Implement new queue management endpoints
- [ ] Add WebSocket connection for real-time updates
- [ ] API integration tests

### Phase 5: Frontend Implementation (Day 3-4)
- [ ] Create QueueContext and WebSocket hook
- [ ] Implement QueueStatusPanel component
- [ ] Build BatchUploadDialog
- [ ] Add BatchProgressTracker
- [ ] Update GlobalFileSelector for batch operations
- [ ] Frontend integration testing

### Phase 6: Testing & Polish (Day 4)
- [ ] End-to-end batch processing test
- [ ] Stress test with 20+ files
- [ ] Error scenario testing (failures, cancellations)
- [ ] Performance profiling
- [ ] Documentation updates

---

## 7. Error Handling & Edge Cases

### 7.1 Retry Logic

**Failed Steps**:
- Automatically retry up to 3 times with exponential backoff
- After 3 failures, mark as failed and notify user
- Allow manual retry from UI

**Retry Delays**:
```
Attempt 1: immediate
Attempt 2: 30 seconds
Attempt 3: 2 minutes
```

### 7.2 Cancellation

**User Cancels File**:
1. Remove from queue if waiting
2. Signal worker to stop if active
3. Clean up partial outputs
4. Update status to 'cancelled'

**Graceful Shutdown**:
1. Stop accepting new queue items
2. Wait for active workers to finish current files
3. Persist queue state to disk
4. Exit cleanly

### 7.3 Resource Exhaustion

**Disk Space**:
- Check available space before starting transcription
- If < 5GB free, pause queue and notify user

**Memory**:
- Monitor MLX model memory usage
- Reduce enhance concurrency limit if swap increases

### 7.4 Corrupt Files

- Detect early in transcription step
- Mark as failed immediately
- Don't retry automatically
- Log clear error message for user

---

## 8. Configuration

### 8.1 User Settings

Add to `user_settings.json`:

```json
{
  "batch_processing": {
    "concurrency_limits": {
      "transcribe": 3,
      "sanitise": 5,
      "enhance": 1,
      "export": 3
    },
    "auto_progress": true,
    "retry_attempts": 3,
    "enable_queue_notifications": true
  }
}
```

### 8.2 Settings UI

Add section to SettingsTab:
- Concurrency sliders per step
- Toggle auto-progress
- Retry attempt count
- Queue behavior preferences

---

## 9. Testing Strategy

### 9.1 Unit Tests
- Queue add/remove/reorder operations
- Worker pool capacity checks
- Batch status aggregation
- Priority sorting

### 9.2 Integration Tests
- Single file through full pipeline
- Batch of 5 files with auto-progress
- Cancellation during processing
- Retry after failure

### 9.3 Stress Tests
- 50 files submitted simultaneously
- All workers at capacity
- Rapid queue modifications
- Multiple batches in parallel

### 9.4 Manual Testing Checklist
- [ ] Upload 10 files, verify queue order
- [ ] Cancel file mid-transcription
- [ ] Change priority while queued
- [ ] Submit batch with auto-progress enabled
- [ ] Restart backend with active queue
- [ ] Fill disk space and verify pause
- [ ] Test with corrupt audio file

---

## 10. Rollback Plan

If critical issues arise:

1. **Feature Flag**: Add `ENABLE_BATCH_PROCESSING` flag to disable new behavior
2. **Fallback Mode**: Revert endpoints to original single-file blocking behavior
3. **Data Migration**: Queue state persisted separately, won't corrupt existing files
4. **API Compatibility**: Old API calls still work, just don't use queue

**Zero Data Loss**: All existing file states preserved, queue is additive.

---

## 11. Future Enhancements

### 11.1 Smart Scheduling
- Prioritize shorter files for better perceived performance
- Batch similar files together (same language, speaker count)

### 11.2 Advanced Queue Management
- Pause/resume individual files
- Schedule batches for specific times
- Queue presets (e.g., "overnight batch")

### 11.3 Resource Optimization
- Dynamic concurrency limits based on system load
- Model caching to reduce enhance startup time
- Shared memory pool for workers

### 11.4 Analytics
- Processing time statistics per step
- Queue wait time trends
- Throughput metrics dashboard

---

## 12. Security Considerations

### 12.1 Rate Limiting
- Limit queue additions per minute (prevent DoS)
- Max queue size per user (future multi-user)

### 12.2 Resource Isolation
- Worker processes isolated via subprocess
- Memory limits per worker
- Timeout enforcement (kill runaway processes)

### 12.3 Data Privacy
- Queue state includes only file IDs, no content
- Temporary files cleaned up on completion
- Failed file data purged after 24 hours

---

## 13. Success Metrics

### 13.1 Performance
- **Throughput**: 3x increase in files processed per hour
- **Latency**: Queue wait time < 2 minutes during normal load
- **Resource Usage**: CPU < 80%, Memory < 90% during max concurrency

### 13.2 Reliability
- **Retry Success**: 90% of failed files succeed on retry
- **Data Integrity**: 0 corrupted files or status inconsistencies
- **Uptime**: Queue manager 99.9% available

### 13.3 User Experience
- **Adoption**: 70% of users process 3+ files in batch within first week
- **Feedback**: Net Promoter Score increase
- **Support**: <5% of users report queue-related issues

---

## Appendix A: Example User Workflows

### Workflow 1: Batch Upload & Auto-Process
1. User drags 15 audio files into upload area
2. BatchUploadDialog appears, user clicks "Upload and Process All"
3. Files upload and automatically enter transcribe queue
4. Transcription processes 3 files concurrently
5. As each completes, auto-progresses to sanitise → enhance → export
6. User monitors BatchProgressTracker, sees real-time updates
7. All files complete in 45 minutes (vs. 3+ hours serially)

### Workflow 2: Selective Queue Management
1. User uploads 10 files
2. Starts transcription on all
3. Realizes file 7 is urgent, increases priority
4. File 7 moves to front of queue
5. User cancels files 8-10 (not needed)
6. Remaining files process in priority order

### Workflow 3: Overnight Batch
1. User uploads 30 large interview files at end of day
2. Submits batch with auto-progress enabled
3. Closes laptop, queue persists
4. Next morning, all files fully processed and exported
5. User reviews results and exports

---

## Appendix B: Queue State Diagram

```
[Upload Complete]
        ↓
   [Add to Transcribe Queue]
        ↓
   [Wait for Worker Slot] ← (position in queue)
        ↓
   [Transcription Active] ← (worker processing)
        ↓
   [Transcription Complete]
        ↓
   [Auto-progress to Sanitise Queue]
        ↓
   [Sanitisation Active]
        ↓
   [Auto-progress to Enhance Queue]
        ↓
   [Enhancement Active]
        ↓
   [Auto-progress to Export Queue]
        ↓
   [Export Active]
        ↓
   [Pipeline Complete]
```

**Cancellation**: Any step → [Cancelled] → remove from queue  
**Failure**: Any step → [Failed] → retry queue or mark failed

---

## Appendix C: Technology Choices

### Queue Implementation
**Choice**: In-memory queue with JSON persistence  
**Alternatives Considered**:
- Redis: Overkill for single-user desktop app
- SQLite: Adds complexity, JSON sufficient for scale
- RabbitMQ/Celery: Too heavy for desktop use

**Rationale**: Simple, no external dependencies, fast enough for expected load (< 100 files in queue).

### Worker Pool
**Choice**: Python threading with ProcessPoolExecutor for CPU-intensive steps  
**Alternatives Considered**:
- asyncio: Current code uses threading, migration complex
- Multiprocessing: Better isolation but higher overhead

**Rationale**: Matches current threading pattern, gradual migration possible.

### Real-time Updates
**Choice**: WebSocket  
**Alternatives Considered**:
- SSE: Already used for enhancement streaming, WebSocket more bidirectional
- Polling: Higher latency and server load

**Rationale**: Low latency, bidirectional, modern standard.

---

**Document Version**: 1.0  
**Last Updated**: 2024-01-15  
**Author**: AI Assistant  
**Status**: Draft for Review
