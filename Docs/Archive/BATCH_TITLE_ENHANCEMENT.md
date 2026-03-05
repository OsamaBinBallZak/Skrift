# Batch Title Enhancement Implementation

## Executive Summary

This document outlines the integration of the newly implemented **Title Enhancement** feature into the existing **Batch Enhancement** system. Title generation will become the **first step** in the batch enhancement pipeline, running before Copy Edit, Summary, and Tags.

**Current State**: Manual mode title generation fully implemented and tested  
**Target State**: Title generation integrated into batch processing as Step 1 of 4  
**Estimated Effort**: Small (2-3 hours implementation + testing)  
**Dependencies**: Title Enhancement Plan + Batch Processing Design V2

---

## 1. Overview

### 1.1 Batch Enhancement Pipeline (New)

```
For each file in batch:
├── Step 1: Title Generation ⚙️
├── Step 2: Copy Edit ⚙️
├── Step 3: Summary ⚙️
└── Step 4: Tags ⚙️
```

**Processing Order**: Sequential, oldest audio file first  
**Skip Logic**: Each step checks if already completed before running  
**Error Handling**: Step failures don't stop the file; batch continues

### 1.2 Integration Points

**Backend**:
- `backend/services/batch_manager.py` - Add title step to enhancement pipeline
- `backend/api/batch.py` - No changes needed (uses generic SSE broadcaster)

**Frontend**:
- `frontend/features/enhance/components/BatchProgressCard.tsx` - Add title indicator
- `frontend/features/enhance/components/EnhanceTab.tsx` - Update batch eligibility

---

## 2. Backend Implementation

### 2.1 Batch Manager Changes

**File**: `backend/services/batch_manager.py`

#### Change 1: Update File Entry Initialization

**Location**: `~line 460` (inside `start_enhance_batch()`)

**Current**:
```python
"steps": {
    "copy_edit": "waiting",
    "summary": "waiting",
    "tags": "waiting"
}
```

**New**:
```python
"steps": {
    "title": "waiting",          # NEW
    "copy_edit": "waiting",
    "summary": "waiting",
    "tags": "waiting"
}
```

#### Change 2: Extract Title Prompt

**Location**: `~line 620-624` (inside `_process_enhancement_steps()`, where prompts are loaded)

**Current**:
```python
# Get prompts from settings
enh_cfg = settings.get('enhancement') or {}
prompts = (enh_cfg.get('prompts') or {})
copy_prompt = prompts.get('copy_edit') or "You are an assistant that enhances transcripts."
summary_prompt = prompts.get('summary') or "Return exactly one sentence (20-30 words) summarizing the text. Output one sentence only."
```

**New** (add title_prompt extraction):
```python
# Get prompts from settings
enh_cfg = settings.get('enhancement') or {}
prompts = (enh_cfg.get('prompts') or {})
title_prompt = prompts.get('title') or "Analyze the following transcript. If the speaker explicitly mentions a title or name for this content, extract and return that exact title. If no title is mentioned, generate an appropriate, concise title (5-10 words) that captures the main topic. Return ONLY the title, nothing else."  # NEW
copy_prompt = prompts.get('copy_edit') or "You are an assistant that enhances transcripts."
summary_prompt = prompts.get('summary') or "Return exactly one sentence (20-30 words) summarizing the text. Output one sentence only."
```

#### Change 3: Add Title Generation Step

**Location**: `~line 626` (inside `_process_enhancement_steps()`, **BEFORE** Copy Edit step)

**Add**:
```python
# =============================
# Step 1: Title Generation
# =============================
if not (pf.enhanced_title or ''):
    file_entry["current_step"] = "title"
    file_entry["steps"]["title"] = "processing"
    self.current_batch["updated_at"] = datetime.now().isoformat()
    self._save_state()
    
    # Broadcast step start
    await self.broadcast("start", {"file_id": file_id, "step": "title"})
    
    try:
        logger.info(f"[Batch Enhance] Running Title Generation for {file_id}")
        
        # Run enhancement with streaming (broadcasts tokens via SSE)
        result_text = await self._run_enhancement_stream(
            file_id, input_text, title_prompt, "title"
        )
        
        # Persist result using status tracker
        status_tracker.set_enhancement_title(file_id, result_text.strip())
        
        file_entry["steps"]["title"] = "done"
        self.current_batch["consecutive_failures"] = 0
        logger.info(f"[Batch Enhance] Title Generation completed for {file_id}")
        
        # Broadcast step done
        await self.broadcast("done", {"file_id": file_id, "step": "title"})
        
        # Refresh pf from tracker to get updated enhanced_title
        pf = status_tracker.get_file(file_id)
    
    except Exception as e:
        logger.error(f"[Batch Enhance] Title Generation failed for {file_id}: {e}")
        file_entry["steps"]["title"] = "failed"
        file_entry["error"] = f"Title Generation failed: {e}"
        self.current_batch["consecutive_failures"] += 1
        
        # Broadcast error
        await self.broadcast("error", {"file_id": file_id, "step": "title", "error": str(e)})
    
    self._save_state()
else:
    # Title already exists, skip
    file_entry["steps"]["title"] = "done"
    logger.info(f"[Batch Enhance] Title already exists for {file_id}, skipping")
```

#### Change 4: Update Copy Edit Comment

**Location**: `~line 626` (the comment above Copy Edit step)

**Current**:
```python
# Step 1: Copy Edit (streaming)
```

**New**:
```python
# Step 2: Copy Edit (streaming)
```

#### Change 5: Update Docstring

**Location**: `~line 492` (docstring of `_process_enhance_batch()`)

**Current**:
```python
"""
For each file, runs Copy Edit → Summary → Tags in order.
"""
```

**New**:
```python
"""
For each file, runs Title → Copy Edit → Summary → Tags in order.
"""
```

**Notes**:
- Uses existing `_run_enhancement_stream()` method (same as Copy Edit/Summary)
- Broadcasts tokens to SSE clients in real-time
- Persists to `status.json` via `set_enhancement_title()`
- Skip logic: only runs if `enhanced_title` is empty

---

## 3. Frontend Implementation

### 3.1 Batch Progress Card Changes

**File**: `frontend/features/enhance/components/BatchProgressCard.tsx`

#### Change 1: Add Title Step Indicator

**Location**: `~line 282` (inside file entry rendering)

**Current**:
```tsx
<div className="flex gap-2 mt-2">
  <StepIndicator status={file.steps.copy_edit} label="Copy Edit" />
  <StepIndicator status={file.steps.summary} label="Summary" />
  <StepIndicator status={file.steps.tags} label="Tags" />
</div>
```

**New**:
```tsx
<div className="flex gap-2 mt-2">
  <StepIndicator status={file.steps.title} label="Title" />
  <StepIndicator status={file.steps.copy_edit} label="Copy Edit" />
  <StepIndicator status={file.steps.summary} label="Summary" />
  <StepIndicator status={file.steps.tags} label="Tags" />
</div>
```

#### Change 2: Update TypeScript Interface (if needed)

**Location**: Inside `BatchProgressCard.tsx` or type definitions

**Add to interface**:
```typescript
interface BatchFileEntry {
  // ... existing fields
  steps: {
    title: 'waiting' | 'processing' | 'done' | 'failed';  // NEW
    copy_edit: 'waiting' | 'processing' | 'done' | 'failed';
    summary: 'waiting' | 'processing' | 'done' | 'failed';
    tags: 'waiting' | 'processing' | 'done' | 'failed';
  };
}
```

### 3.2 Enhance Tab Changes

**File**: `frontend/features/enhance/components/EnhanceTab.tsx`

#### Change: Update Batch Eligibility Calculation

**Location**: `~line 153` (inside `eligibleForBatch` useMemo)

**Current**:
```typescript
const eligibleForBatch = React.useMemo(() => {
  return files.filter(f => {
    if (!f || !f.id) return false;
    const hasSanitised = !!((f.sanitised || '').trim());
    const hasCopy = !!((f as any)?.enhanced_copyedit || '').trim();
    const hasSummary = !!((f as any)?.enhanced_summary || '').trim();
    const hasTags = !!((f as any)?.enhanced_tags && (f as any).enhanced_tags.length > 0);
    return hasSanitised && !(hasCopy && hasSummary && hasTags);
  });
}, [files]);
```

**New**:
```typescript
const eligibleForBatch = React.useMemo(() => {
  return files.filter(f => {
    if (!f || !f.id) return false;
    const hasSanitised = !!((f.sanitised || '').trim());
    const hasTitle = !!((f as any)?.enhanced_title || '').trim();        // NEW
    const hasCopy = !!((f as any)?.enhanced_copyedit || '').trim();
    const hasSummary = !!((f as any)?.enhanced_summary || '').trim();
    const hasTags = !!((f as any)?.enhanced_tags && (f as any).enhanced_tags.length > 0);
    return hasSanitised && !(hasTitle && hasCopy && hasSummary && hasTags);  // NEW
  });
}, [files]);
```

**Logic**:
- File is eligible if sanitised AND missing any of: title, copy edit, summary, or tags
- File is excluded once all 4 steps are complete

---

## 4. Data Flow

### 4.1 Batch Enhancement Flow (With Title)

```
User clicks "Batch Enhance All (N files)"
    ↓
Backend: BatchManager.start_enhance_batch()
    ↓
For each file (sorted by creation date, oldest first):
    ↓
    ┌─────────────────────────────────────┐
    │ Check: enhanced_title exists?       │
    │ NO  → Run Title Generation          │
    │       ├── SSE stream tokens to UI   │
    │       ├── Persist to status.json    │
    │       └── Broadcast "done" event    │
    │ YES → Skip (mark "done" immediately)│
    └─────────────────────────────────────┘
    ↓
    ┌─────────────────────────────────────┐
    │ Check: enhanced_copyedit exists?    │
    │ NO  → Run Copy Edit                 │
    │ YES → Skip                          │
    └─────────────────────────────────────┘
    ↓
    ┌─────────────────────────────────────┐
    │ Check: enhanced_summary exists?     │
    │ NO  → Run Summary                   │
    │ YES → Skip                          │
    └─────────────────────────────────────┘
    ↓
    ┌─────────────────────────────────────┐
    │ Check: enhanced_tags exists?        │
    │ NO  → Run Tags                      │
    │ YES → Skip                          │
    └─────────────────────────────────────┘
    ↓
Next file
```

### 4.2 UI Updates During Batch

**BatchProgressCard displays**:
```
✅ recording_001.m4a (completed)
   Title ✅ | Copy Edit ✅ | Summary ✅ | Tags ✅

⚙️ recording_002.m4a (Title in progress...)
   Title ⚙️ | Copy Edit ⏳ | Summary ⏳ | Tags ⏳

⏳ recording_003.m4a (waiting)
   Title ⏳ | Copy Edit ⏳ | Summary ⏳ | Tags ⏳
```

**Live output panel shows**:
```
Analyzing the transcript...
"Irish" "and" "English" "Janks:" ...
```

**Progress indicator**:
```
Batch Enhance: 1/10 files (Title: 10%, Copy Edit: 0%, Summary: 0%, Tags: 0%)
```

---

## 5. Error Handling

### 5.1 Title Generation Failures

**Scenario**: MLX model fails during title generation

**Behavior**:
1. Mark title step as `failed` ❌
2. Increment `consecutive_failures` counter
3. Continue to Copy Edit step anyway (title is optional for compilation)
4. If 3 consecutive total failures → stop batch

**UI Display**:
```
❌ recording_005.m4a (Title failed: MLX model timeout)
   Title ❌ | Copy Edit ⚙️ | Summary ⏳ | Tags ⏳
```

### 5.2 Partial Enhancement Completion

**Scenario**: File has title but no copy edit

**Behavior**:
- Title step: Skipped (already exists)
- Copy Edit: Runs normally
- Summary: Runs normally
- Tags: Runs normally

**UI Display**:
```
⚙️ recording_007.m4a (Copy Edit in progress...)
   Title ✅ | Copy Edit ⚙️ | Summary ⏳ | Tags ⏳
```

### 5.3 Batch Resume After Interruption

**Scenario**: Batch interrupted during title generation

**Behavior**:
1. On resume, title step for interrupted file is marked as `failed`
2. Next file starts from Step 1 (Title) normally
3. User can manually regenerate title for failed file later

---

## 6. Testing Plan

### 6.1 Unit Tests

**Backend**:
```python
def test_batch_enhance_includes_title_step():
    # Start batch with 3 files
    # Verify each file has "title" in steps dict
    # Verify title step runs before copy edit

def test_batch_title_skip_logic():
    # File already has enhanced_title
    # Start batch
    # Verify title step marked "done" without calling MLX

def test_batch_title_failure_continues():
    # Mock MLX to raise exception on title
    # Verify copy edit still runs
    # Verify file not marked as fully failed
```

**Frontend**:
```typescript
test('BatchProgressCard renders 4 step indicators', () => {
  // Render BatchProgressCard with mock batch state
  // Verify 4 indicators: Title, Copy Edit, Summary, Tags
});

test('Eligible files include those without title', () => {
  // File with sanitised but no title
  // Verify included in eligibleForBatch
});
```

### 6.2 Integration Tests

**Test Case 1: Fresh File Batch**
1. Upload 3 files, transcribe, sanitise all
2. Click "Batch Enhance All (3 files)"
3. Verify:
   - Title step runs first for file 1
   - Copy Edit runs second
   - Summary runs third
   - Tags runs fourth
   - All 4 indicators show correct status in UI

**Test Case 2: Partial Enhancement**
1. File 1: Has title, no copy edit
2. File 2: Has title + copy edit, no summary
3. File 3: Fresh (no enhancements)
4. Start batch
5. Verify:
   - File 1: Title skipped, Copy Edit runs
   - File 2: Title + Copy Edit skipped, Summary runs
   - File 3: All 4 steps run

**Test Case 3: Title Failure Recovery**
1. Start batch with 5 files
2. Simulate MLX failure on file 3 during title
3. Verify:
   - File 3 marked with title ❌
   - Copy Edit still runs for file 3
   - File 4 continues normally

**Test Case 4: Batch Resume**
1. Start batch with 10 files
2. Close app during file 4 (title step)
3. Reopen app, resume batch
4. Verify:
   - File 4 title marked failed
   - File 5 starts from title step
   - Batch completes normally

---

## 7. Implementation Checklist

### Backend
- [ ] Add `"title": "waiting"` to batch file entry initialization
- [ ] Add title generation step in `_process_enhancement_steps()` (before Copy Edit)
- [ ] Update skip logic: check `pf.enhanced_title`
- [ ] Add title error handling (mark failed, continue to Copy Edit)
- [ ] Test title step runs first in batch

### Frontend
- [ ] Add `title` field to `BatchFileEntry.steps` interface
- [ ] Add `<StepIndicator status={file.steps.title} label="Title" />` to BatchProgressCard
- [ ] Update `eligibleForBatch` to include title check
- [ ] Test 4 step indicators render correctly
- [ ] Test batch eligibility calculation

### Testing
- [ ] Run batch with 3 fresh files → verify 4 steps run per file
- [ ] Run batch with partial enhancement → verify skip logic works
- [ ] Simulate title failure → verify Copy Edit still runs
- [ ] Test batch resume after interruption

---

## 8. Success Criteria

### Functional Requirements
- ✅ Title generation runs as **first step** in batch enhancement
- ✅ Skip logic works: files with existing title skip the step
- ✅ Step indicators show: Title, Copy Edit, Summary, Tags
- ✅ Batch eligibility includes files without title
- ✅ Title failures don't stop the file (Copy Edit still runs)

### Performance Requirements
- ✅ Title generation adds minimal overhead (<10 seconds per file)
- ✅ MLX model stays loaded across all 4 steps (no reload between steps)
- ✅ SSE streaming works for title tokens (same as Copy Edit)

### UX Requirements
- ✅ Progress indicator shows "4 steps per file"
- ✅ Step indicators update in real-time during title generation
- ✅ User can see live title output in batch dropdown
- ✅ Failed title steps are clearly marked ❌

---

## 9. Rollback Plan

If issues arise:
1. **Remove title step from batch**: Comment out title generation block in `batch_manager.py`
2. **Revert frontend**: Remove title indicator from BatchProgressCard
3. **Update eligibility**: Remove title check from `eligibleForBatch`
4. Batch continues with 3 steps as before (Copy Edit, Summary, Tags)

**Risk Level**: Low (title is optional, doesn't break compilation)

---

## 10. Future Enhancements

### Not in Initial Release
- **Title retry button**: Allow user to retry failed title generation in batch dropdown
- **Title preview**: Show generated title in batch dropdown without clicking through
- **Batch title approval**: Auto-apply titles to Export tab after batch completes
- **Title quality metrics**: Track how often users accept vs reject AI titles

---

## Appendix A: Code Snippets

### Backend: Title Step Implementation

```python
# File: backend/services/batch_manager.py
# Location: Inside _process_enhancement_steps(), before Copy Edit

# Step 1: Title Generation
if not (pf.enhanced_title or ''):
    file_entry["current_step"] = "title"
    file_entry["steps"]["title"] = "processing"
    self.current_batch["updated_at"] = datetime.now().isoformat()
    self._save_state()
    
    await self.broadcast("start", {"file_id": file_id, "step": "title"})
    
    try:
        logger.info(f"[Batch] Title Generation for {file_id}")
        title_prompt = prompts.get('title') or "Analyze the following transcript..."
        result_text = await self._run_enhancement_stream(file_id, input_text, title_prompt, "title")
        status_tracker.set_enhancement_title(file_id, result_text.strip())
        file_entry["steps"]["title"] = "done"
        self.current_batch["consecutive_failures"] = 0
        await self.broadcast("done", {"file_id": file_id, "step": "title"})
        pf = status_tracker.get_file(file_id)  # Refresh
    except Exception as e:
        logger.error(f"[Batch] Title failed for {file_id}: {e}")
        file_entry["steps"]["title"] = "failed"
        file_entry["error"] = f"Title failed: {e}"
        self.current_batch["consecutive_failures"] += 1
        await self.broadcast("error", {"file_id": file_id, "step": "title", "error": str(e)})
    self._save_state()
else:
    file_entry["steps"]["title"] = "done"
```

### Frontend: Step Indicator

```tsx
// File: frontend/features/enhance/components/BatchProgressCard.tsx
// Location: Inside file entry rendering

<div className="flex gap-2 mt-2">
  <StepIndicator status={file.steps.title} label="Title" />
  <StepIndicator status={file.steps.copy_edit} label="Copy Edit" />
  <StepIndicator status={file.steps.summary} label="Summary" />
  <StepIndicator status={file.steps.tags} label="Tags" />
</div>
```

---

**Document Version**: 1.0  
**Last Updated**: 2025-10-22  
**Author**: AI Assistant  
**Status**: Ready for Implementation

**Dependencies**:
- Title Enhancement Plan (COMPLETED)
- Batch Processing Design V2 (IMPLEMENTED)
- Manual Title Mode (TESTED ✅)
