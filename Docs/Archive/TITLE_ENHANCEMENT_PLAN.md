# Title Enhancement Feature - Implementation Plan

## Executive Summary

**Status**: Manual mode ✅ COMPLETE | Batch mode ⏳ PENDING

**What's Working**:
- ✅ Title generation in Enhancement tab (SSE streaming, View button, progress counters)
- ✅ Export tab approval UI ("Yes"/"No" buttons to apply AI title)
- ✅ Backend persistence (`enhanced_title` in status.json)
- ✅ Frontend compile button requires title

**What Needs Implementation** (Batch Mode):
1. Add title step to batch processing (before Copy Edit)
2. Update batch eligibility checks (backend + frontend)
3. Update compile DONE validation to require title
4. Add title step indicator to BatchProgressCard
5. Update batch result computation

**Estimated Time**: 2-3.5 hours

**Critical Validations** (see "Critical Logic Validation" section below):
- ✅ Export tab title logic is correct (no backend changes needed for compile)
- ✅ Error handling is solid (matches Copy Edit/Summary/Tags pattern)
- ✅ Skip logic is well-defined (simple `if not enhanced_title` check)
- ⚠️ Compile validation needs title check added
- ⚠️ Batch processing completely missing title step

---

## Overview

Add a new enhancement step that generates an AI title for transcripts. The LLM will first check if a title was mentioned in the transcript, otherwise generate an appropriate one. This title will be shown in the Export tab with an approval interface.

---

## How I Understand This Feature

### 1. **New Enhancement Step: "Title Generation"**
- **Placement**: New banner **above** Copy Edit in the Enhancement tab
- **Behavior**: Exactly like Copy Edit and Summary:
  - Clickable banner with icon, name, description (all configurable via settings)
  - Streams LLM output token-by-token via SSE
  - Has a "View" button to show generated title
  - Shows streaming output in the split preview panel
  - Persists to `status.json` as `enhanced_title`

### 2. **System Prompt Logic**
The system prompt (configurable in settings) will instruct the LLM to:
```
1. Analyze the transcript to see if the speaker mentioned a title
2. If a title is explicitly mentioned, extract and return it
3. If no title is mentioned, generate an appropriate title based on content
4. Return ONLY the title (nothing else)
```

### 3. **Data Flow**
```
Enhance Tab (click "Generate Title" banner)
    ↓
SSE stream: /api/process/enhance/stream/{file_id}?prompt={title_prompt}
    ↓
LLM generates title token-by-token → streams to frontend
    ↓
On 'done' event: persist to status.json as enhanced_title
    ↓
Export tab loads file → sees enhanced_title in status.json
    ↓
Shows approval UI below title input field
```

### 4. **Export Tab UI Changes**

**Current state (line 159-178):**
```
┌─────────────────────────────────┐
│ Document Title                  │
│ [Title input field]             │
│ Filename: {title}.md            │
└─────────────────────────────────┘
```

**New state (when enhanced_title exists):**
```
┌─────────────────────────────────┐
│ Document Title                  │
│ [Title input field]             │
│ Filename: {title}.md            │
├─────────────────────────────────┤  ← NEW SECTION
│ AI-generated title:             │
│ "The Future of Machine Learning"│
│                                 │
│ Use AI-generated title?         │
│ [Yes]  [No]                     │
└─────────────────────────────────┘
```

- Clicking **Yes**: Replaces title input with AI title, hides approval UI
- Clicking **No**: Hides approval UI (leaves current title unchanged)
- Both actions: Dismisses the approval UI (doesn't reappear until new AI title generated)

---

## Implementation Steps

### Phase 1: Backend Changes

#### 1.1 Add `enhanced_title` Field to Status Model
**File**: `backend/models.py`

**Change**:
```python
class PipelineFile(BaseModel):
    # ... existing fields ...
    # Enhancement pipeline fields
    enhanced_title: Optional[str] = None  # NEW
    enhanced_copyedit: Optional[str] = None
    enhanced_summary: Optional[str] = None
    enhanced_tags: Optional[List[str]] = None
```

#### 1.2 Add Title Setter to Status Tracker
**File**: `backend/utils/status_tracker.py`

**Change**: Add method similar to `set_enhancement_fields()`:
```python
def set_enhancement_title(self, file_id: str, title: str):
    """Set enhanced title for a file."""
    # Load status, update enhanced_title, save atomically
```

#### 1.3 Update Export API to Include Title
**File**: `backend/api/export.py`

**Change**: When fetching compiled markdown, return `enhanced_title` from status.json in the API response so Export tab can access it.

**Note**: The compile step (`backend/api/enhance.py::compile_for_obsidian()`) uses `pf.filename` as the default YAML title. The Export tab UI allows users to replace this with `enhanced_title` via the approval UI, which then updates the YAML frontmatter before saving.

**API Response**:
```json
{
  "content": "---\ntitle: \"...\"\n---\n...",
  "path": "/path/to/compiled.md",
  "title": "Extracted Title",
  "enhanced_title": "AI Generated Title"  // NEW - loaded from status.json
}
```

**Implementation**: Lines 32-40 in `backend/api/export.py` already implement this correctly.

---

### Phase 2: Settings Configuration

#### 2.1 Add Title Option to Enhancement Settings
**File**: `backend/config/settings.json`

**Add new enhancement option**:
```json
{
  "enhancement": {
    "options": [
      {
        "id": "title",
        "name": "Generate Title",
        "description": "AI analyzes transcript to extract or generate a title",
        "icon": "FileText",
        "color": "indigo",
        "systemPrompt": "Analyze the following transcript. If the speaker explicitly mentions a title or name for this content, extract and return that exact title. If no title is mentioned, generate an appropriate, concise title (5-10 words) that captures the main topic. Return ONLY the title, nothing else.",
        "enabled": true
      },
      // ... existing options (copy-edit, summary, keywords)
    ]
  }
}
```

---

### Phase 3: Frontend - Enhancement Tab

#### 3.1 Add Title State Variables
**File**: `frontend/features/enhance/components/EnhanceTab.tsx`

**Add state** (similar to Copy Edit):
```typescript
const [streamingTitle, setStreamingTitle] = React.useState(false);
const [titleText, setTitleText] = React.useState('');
const titleRef = React.useRef('');
const [titleApplied, setTitleApplied] = React.useState(false);
```

#### 3.2 Add Title Banner
**File**: `frontend/features/enhance/components/EnhanceTab.tsx`

**Location**: Line ~351 (inside the pipeline buttons section, **BEFORE** Copy Edit banner)

**Code**: Duplicate Copy Edit banner structure:
```tsx
{/* Title Generation - NEW */}
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
      const prompt = optTitle?.systemPrompt || '';
      try {
        setStreamingTitle(true); setTitleText(''); titleRef.current='';
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
          setStreamingTitle(false); es.close();
          try {
            window.dispatchEvent(new CustomEvent('pipeline-refresh-request'));
          } catch {
            // Event dispatch failure is non-blocking
          }
        });
        es.addEventListener('error', () => { setStreamingTitle(false); es.close(); });
      } catch { setStreamingTitle(false); }
    }}
  >
    {getIconComponent(optTitle?.icon || 'FileText')}
    <div>
      <div className="text-sm font-medium">{optTitle?.name || 'Generate Title'}</div>
      <div className="text-xs text-gray-600">{optTitle?.description || 'AI extracts or generates a title for this transcript'}</div>
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
      }}
    >View</Button>
  </div>
</div>
```

#### 3.3 Update Split Preview to Show Title
**File**: `frontend/features/enhance/components/EnhanceTab.tsx`

**Location**: Line ~645 (inside the "Enhanced" panel)

**Change**: Add case for `selectedId === 'title'`:
```tsx
<div className="text-sm text-gray-800 whitespace-pre-wrap max-h-[60vh] overflow-auto">{
  selectedId === 'title'
    ? ((titleText && titleText.length > 0) ? titleText : (
        streamingTitle ? (titleText || '') : (selectedFile?.enhanced_title || 'Run Generate Title to create output.')
      ))
    : selectedId === 'summary'
    ? // ... existing summary logic
    : // ... existing copy-edit logic
}</div>
```

#### 3.4 Add API Method
**File**: `frontend/src/api.ts`

**Add method**:
```typescript
async setEnhanceTitle(fileId: string, title: string): Promise<void> {
  await this.request(`/api/process/enhance/title/${fileId}`, {
    method: 'PUT',
    body: JSON.stringify({ title }),
  });
}
```

---

### Phase 4: Frontend - Export Tab

#### 4.1 Add State for AI Title Approval
**File**: `frontend/features/export/components/ExportTab.tsx`

**Add state variables**:
```typescript
const [enhancedTitle, setEnhancedTitle] = useState<string | null>(null);
const [showTitleApproval, setShowTitleApproval] = useState(false);
```

#### 4.2 Load Enhanced Title
**File**: `frontend/features/export/components/ExportTab.tsx`

**Update useEffect** (line 37):
```typescript
React.useEffect(() => {
  if (!selectedFile) return;
  let cancelled = false;
  setExportedSuccess(false);
  (async () => {
    try {
      setLoading(true); setError(null);
      const { apiService } = await import('../../../src/api');
      const api = (apiService as any);
      const resp = await api.getCompiledMarkdown(selectedFile.id);
      if (!cancelled) { 
        setContent(resp.content || ''); 
        setPath(resp.path);
        setTitle(resp.title || selectedFile.name.replace(/\.[^/.]+$/, ''));
        
        // NEW: Load enhanced title and show approval UI if it exists
        if (resp.enhanced_title) {
          setEnhancedTitle(resp.enhanced_title);
          setShowTitleApproval(true);
        } else {
          setEnhancedTitle(null);
          setShowTitleApproval(false);
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load compiled markdown');
    } finally {
      setLoading(false);
    }
  })();
  return () => { cancelled = true; };
}, [selectedFile?.id]);
```

#### 4.3 Add Approval UI
**File**: `frontend/features/export/components/ExportTab.tsx`

**Location**: Line ~178 (immediately after title input section)

**Add**:
```tsx
{/* AI Title Approval UI */}
{showTitleApproval && enhancedTitle && (
  <div className="space-y-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
    <div className="text-sm font-medium text-gray-700">
      AI-generated title:
    </div>
    <div className="text-base font-semibold text-gray-900 italic">
      "{enhancedTitle}"
    </div>
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600">Use AI-generated title?</span>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            setTitle(enhancedTitle);
            setShowTitleApproval(false);
          }}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          Yes
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setShowTitleApproval(false);
          }}
          className="border-gray-300"
        >
          No
        </Button>
      </div>
    </div>
  </div>
)}
```

---

### Phase 5: Backend - API Endpoint

#### 5.1 Add Title Endpoint
**File**: `backend/api/enhance.py`

**Add route**:
```python
@router.put("/title/{file_id}")
async def set_title(file_id: str, request: dict):
    """
    Set enhanced title for a file.
    """
    title = request.get("title", "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    
    file = status_tracker.get_file(file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    status_tracker.set_enhancement_title(file_id, title)
    
    return {"success": True, "title": title}
```

---

### Phase 6: Batch Mode Integration

#### 6.1 Update Batch Processing
**File**: `backend/services/batch_manager.py`

**Update `_process_enhancement_steps()`** to include title generation:

**Add before Copy Edit** (line ~626):
```python
# Step 0: Title (streaming)
if not (pf.enhanced_title or ''):
    file_entry["current_step"] = "title"
    file_entry["steps"]["title"] = "processing"
    self.current_batch["updated_at"] = datetime.now().isoformat()
    self._save_state()
    
    # Broadcast step start
    await self.broadcast("start", {"file_id": file_id, "step": "title"})
    
    try:
        logger.info(f"Running Title Generation for {file_id}")
        title_prompt = prompts.get('title') or "Analyze the following transcript..."
        result_text = await self._run_enhancement_stream(
            file_id, input_text, title_prompt, "title"
        )
        
        # Persist result using status tracker
        status_tracker.set_enhancement_title(file_id, result_text.strip())
        
        file_entry["steps"]["title"] = "done"
        self.current_batch["consecutive_failures"] = 0
        logger.info(f"Title Generation completed for {file_id}")
        
        # Broadcast step done
        await self.broadcast("done", {"file_id": file_id, "step": "title"})
        
        # Refresh pf from tracker
        pf = status_tracker.get_file(file_id)
    
    except Exception as e:
        logger.error(f"Title Generation failed for {file_id}: {e}")
        file_entry["steps"]["title"] = "failed"
        file_entry["error"] = f"Title Generation failed: {e}"
        self.current_batch["consecutive_failures"] += 1
        
        # Broadcast error
        await self.broadcast("error", {"file_id": file_id, "step": "title", "error": str(e)})
    
    self._save_state()
else:
    file_entry["steps"]["title"] = "done"
```

#### 6.2 Update Batch State Model
**File**: `backend/services/batch_manager.py`

**Update file_entry initialization** (line ~460):
```python
"steps": {
    "title": "waiting",      # NEW
    "copy_edit": "waiting",
    "summary": "waiting",
    "tags": "waiting"
}
```

#### 6.3 Update Batch Result Computation
**File**: `backend/services/batch_manager.py`

**Update `_compute_batch_result()`** to include title check (line ~397-401):
```python
for file_entry in files:
    steps = file_entry.get("steps", {})
    # A file is fully completed if all steps are done or skipped
    title_complete = steps.get("title") in ["done", "skipped"]        # NEW
    copy_complete = steps.get("copy_edit") in ["done", "skipped"]
    summary_complete = steps.get("summary") in ["done", "skipped"]
    tags_complete = steps.get("tags") in ["done", "skipped"]
    
    if title_complete and copy_complete and summary_complete and tags_complete:  # UPDATED
        fully_completed_count += 1
    else:
        # Check if any step failed
        if any(steps.get(step) == "failed" for step in ["title", "copy_edit", "summary", "tags"]):  # UPDATED
            failed_count += 1
```

#### 6.4 Update Frontend Batch Progress
**File**: `frontend/features/enhance/components/BatchProgressCard.tsx`

**Add title to step indicators** (line ~282):
```tsx
<div className="flex gap-2 mt-2">
  <StepIndicator status={file.steps.title} label="Title" />
  <StepIndicator status={file.steps.copy_edit} label="Copy Edit" />
  <StepIndicator status={file.steps.summary} label="Summary" />
  <StepIndicator status={file.steps.tags} label="Tags" />
</div>
```

#### 6.4 Update Backend Batch Eligibility Check
**File**: `backend/api/batch.py`

**Update `start_enhance_batch()`** to include title in eligibility check (line ~233-240):
```python
# Include file if any enhancement step is incomplete
has_title = bool((file.enhanced_title or '').strip())  # NEW
has_copy = bool((file.enhanced_copyedit or '').strip())
has_summary = bool((file.enhanced_summary or '').strip())
has_tag_suggestions = bool(file.tag_suggestions and 
                           (file.tag_suggestions.get('old') or file.tag_suggestions.get('new')))
has_approved_tags = bool(file.enhanced_tags and len(file.enhanced_tags) > 0)
has_tags = has_tag_suggestions or has_approved_tags

if not (has_title and has_copy and has_summary and has_tags):  # UPDATED
    eligible_files.append(file_id)
```

**Update error message** (line ~244-247):
```python
if not eligible_files:
    raise HTTPException(
        status_code=400,
        detail="All files have already been enhanced (Title, Copy Edit, Summary, and Tags completed)"  # UPDATED
    )
```

#### 6.5 Update Frontend Batch Eligibility
**File**: `frontend/features/enhance/components/EnhanceTab.tsx`

**Update eligibleForBatch calculation** (line ~149):
```typescript
const eligibleForBatch = React.useMemo(() => {
  return files.filter(f => {
    if (!f || !f.id) return false;
    const hasSanitised = !!((f.sanitised || '').trim());
    const hasTitle = !!((f as any)?.enhanced_title || '').trim();     // NEW
    const hasCopy = !!((f as any)?.enhanced_copyedit || '').trim();
    const hasSummary = !!((f as any)?.enhanced_summary || '').trim();
    const hasTags = !!((f as any)?.enhanced_tags && (f as any).enhanced_tags.length > 0);
    return hasSanitised && !(hasTitle && hasCopy && hasSummary && hasTags);
  });
}, [files]);
```

---

## Implementation Progress

### ✅ Phase 1: Backend Data Model (COMPLETED)
- [x] `enhanced_title` field added to `PipelineFile` model (backend/models.py:52)
- [x] `set_enhancement_title()` method added to status tracker (backend/utils/status_tracker.py:207-215)
- [x] `enhanced_title` added to status.json field ordering (backend/utils/status_tracker.py:263)
- [x] POST `/api/process/enhance/title/{file_id}` endpoint created (backend/api/enhance.py)

### ✅ Phase 2: Settings Configuration (COMPLETED)
- [x] Title option added to `backend/config/settings.json` with:
  - ID: `"title"`
  - Name: "Generate Title"
  - Description: "AI extracts or generates a title for this transcript"
  - Icon: "FileText", Color: "indigo"
  - System prompt with "extract or generate" logic

### ✅ Phase 3: Frontend - Enhancement Tab (COMPLETED)
- [x] State variables added: `streamingTitle`, `titleText`, `titleRef`, `titleApplied`
- [x] Title banner added **above** Copy Edit banner with proper styling
- [x] Banner uses SSE streaming via `/api/process/enhance/stream/{file_id}`
- [x] View button closes EventSource and displays persisted title
- [x] Split preview shows title when `selectedId === 'title'`
- [x] API method `setEnhanceTitle()` added to `frontend/src/api.ts:209-211`
- [x] Cross-disabling logic: all enhancement steps disable during title streaming
- [x] Progress counter updated: "X/4 saved" (includes title)
- [x] Compile button requires title completion: `canCompile` includes `(hasTitle || titleApplied)`

### ✅ Phase 4: Frontend - Export Tab (COMPLETED)
- [x] AI title approval UI added (frontend/features/export/components/ExportTab.tsx:159-198)
- [x] Blue alert banner appears when `enhanced_title` exists and doesn't match current title
- [x] Displays AI-generated title in bold italic with quotes
- [x] "Yes, use this title" button (green) → copies AI title to title input
- [x] "No, I'll enter my own" button (outline) → dismisses approval UI
- [x] Approval UI reappears when navigating away and back (if title still doesn't match)

### ⏳ Phase 5: Backend - Compile Validation (PENDING)
- [ ] Update `compile_for_obsidian()` to require title in DONE check (backend/api/enhance.py:559)
- [ ] Current check: `if (copyedit) and (summary) and (tags): mark enhance as DONE`
- [ ] New check: `if (title) and (copyedit) and (summary) and (tags): mark enhance as DONE`

### ⏳ Phase 6: Batch Mode Integration (PENDING)
- [ ] Title step added to `_process_enhancement_steps()` (before Copy Edit)
- [ ] Title step added to batch state initialization: `"title": "waiting"`
- [ ] Backend batch eligibility check updated to include `has_title`
- [ ] Frontend batch eligibility check updated to include `hasTitle`
- [ ] Title step indicator added to `BatchProgressCard`
- [ ] Progress calculation includes title (4 steps per file)
- [ ] `_compute_batch_result()` updated to check title step

---

## What We Built

### Backend Changes
1. **Data Model** (`backend/models.py`)
   - Added `enhanced_title: Optional[str]` field to `PipelineFile` at line 52
   
2. **Status Tracker** (`backend/utils/status_tracker.py`)
   - Added `set_enhancement_title(file_id, title)` method for atomic persistence
   - Added `enhanced_title` to `desired_order` list for status.json field ordering
   
3. **API Endpoint** (`backend/api/enhance.py`)
   - Added `POST /api/process/enhance/title/{file_id}` endpoint
   - Accepts `{"title": "..."}` body, persists via status tracker

### Frontend Changes
1. **Enhancement Tab** (`frontend/features/enhance/components/EnhanceTab.tsx`)
   - Added title state: `streamingTitle`, `titleText`, `titleRef`, `titleApplied`
   - Added title banner above Copy Edit with indigo color scheme
   - Banner clicks trigger SSE streaming to `/api/process/enhance/stream/{file_id}?prompt=...`
   - On SSE 'done' event: calls `api.setEnhanceTitle()` to persist result
   - View button: sets `selectedId='title'`, displays persisted title, closes EventSource
   - Updated `canCompile` to require title: `(hasTitle || titleApplied) && ...`
   - Updated `savedCount` to include title: now counts 4 steps instead of 3
   - Updated progress labels: "Enhancement progress: X/4 saved", "Progress: X/4"
   - Added `streamingTitle` to all cross-disabling checks
   
2. **Export Tab** (`frontend/features/export/components/ExportTab.tsx`)
   - Added AI title approval UI (blue Alert banner)
   - Shows when `enhanced_title` exists and doesn't match current `title` input
   - "Yes" button: `setTitle(aiTitle)` → approval UI auto-hides (condition becomes false)
   - "No" button: no-op, approval UI stays visible until title matches or file changes
   
3. **API Client** (`frontend/src/api.ts`)
   - Added `setEnhanceTitle(fileId, title)` method
   - Calls `POST /api/process/enhance/title/{fileId}` with `{"title": "..."}`

### Settings Configuration
- Title option added to `backend/config/settings.json` at `enhancement.options[0]`
- System prompt: "Analyze the following transcript. If the speaker explicitly mentions a title..."

---

## Testing Results

### ✅ Manual Mode - All Tests Passed
1. **Title Generation**: SSE streaming works, tokens appear in real-time
2. **View Button**: Displays persisted title in split preview, closes EventSource properly
3. **Cross-disabling**: All enhancement steps correctly disable during title streaming
4. **Persistence**: Title saves to `status.json` as `enhanced_title: "..."`
5. **Export Tab Approval**: Blue banner appears with AI title when navigating to Export
6. **Accept Title**: "Yes" button copies AI title to input, approval UI disappears
7. **Reject Title**: "No" button dismisses UI (reappears on next load if title still doesn't match)
8. **Progress Counter**: Shows "1/4", "2/4", "3/4", "4/4" correctly
9. **Compile Button**: Disabled until all 4 steps complete (title now mandatory)

### Known Issues (Fixed)
1. ~~View button doesn't close EventSource~~ → Fixed: added `esRef.current?.close()`
2. ~~Progress shows "1/3" instead of "1/4"~~ → Fixed: updated `savedCount` calculation and labels
3. ~~Compile enabled without title~~ → Fixed: added title to `canCompile` condition
4. ~~`enhanced_title` missing from status.json on upload~~ → Fixed: added to `desired_order` list

---

## Verification Checklist

### Backend Verification
- [x] `enhanced_title` field added to `PipelineFile` model
- [x] `set_enhancement_title()` method added to status tracker
- [x] `enhanced_title` included in status.json field ordering
- [x] POST `/api/process/enhance/title/{file_id}` endpoint created
- [x] Export API returns `enhanced_title` in response (already implemented)
- [ ] Compile DONE check requires title (backend/api/enhance.py:559)
- [ ] Batch processing includes title step (before copy edit)
- [ ] Batch state includes `title: "waiting"` in steps
- [ ] Backend batch eligibility updated to check `has_title`
- [ ] `_compute_batch_result()` checks title step

### Settings Verification
- [x] Title option added to `settings.json` with:
  - ID: `"title"`
  - Name, description, icon, color
  - System prompt with "extract or generate" logic

### Frontend - Enhancement Tab
- [x] State variables added: `streamingTitle`, `titleText`, `titleRef`, `titleApplied`
- [x] Title banner added **above** Copy Edit banner
- [x] Banner uses same streaming logic as Copy Edit
- [x] View button closes EventSource and shows title in split preview
- [x] Split preview shows title when `selectedId === 'title'`
- [x] API method `setEnhanceTitle()` added to `api.ts`
- [x] Progress counters show "/4" instead of "/3"
- [x] `canCompile` requires title completion
- [x] `savedCount` includes title (4 steps)

### Frontend - Export Tab
- [x] AI title loaded from `selectedFile.enhanced_title`
- [x] Approval UI appears when `enhanced_title` exists and doesn't match current title
- [x] "Yes" button replaces title and hides approval UI
- [x] "No" button dismisses approval UI without changing title

### Batch Mode
- [ ] Title step indicator added to `BatchProgressCard`
- [ ] Title step runs first (before Copy Edit) in `_process_enhancement_steps()`
- [ ] Backend batch eligibility checks for `enhanced_title`
- [ ] Frontend batch eligibility checks for `enhanced_title`
- [ ] Progress calculation includes title (4 steps per file)
- [ ] `_compute_batch_result()` includes title in completion check

---

## Risk Analysis & Mitigation

### Risk 1: Breaking Existing Enhancement Flow
**Mitigation**:
- Title step is **optional** (only runs if not already generated)
- Copy Edit / Summary / Tags are unchanged
- Batch processing adds title at the beginning (doesn't interfere with existing steps)
- **Note**: No backwards compatibility needed - project is in testing phase with no production data

### Risk 2: Export Tab Title Confusion
**Mitigation**:
- AI title is shown in a **separate section** below manual title input
- User explicitly chooses to accept or reject
- Dismissing approval UI doesn't break anything (just hides the UI)

### Risk 3: Batch Processing Slowdown
**Mitigation**:
- Title generation is typically fast (10-20 tokens)
- Uses same streaming infrastructure as Copy Edit
- Skip logic: if `enhanced_title` already exists, mark as "done" immediately

### Risk 4: Settings Compatibility
**Mitigation**:
- Title option is added to **existing** `enhancement.options` array
- If settings.json doesn't have it, app falls back to defaults
- No breaking changes to settings schema

---

## Testing Plan

### Manual Mode Testing
1. **Generate title**: Click "Generate Title" banner → verify streaming works
2. **View title**: Click "View" button → verify title appears in split preview
3. **Export tab**: Navigate to Export → verify AI title appears with approval UI
4. **Accept title**: Click "Yes" → verify title input is replaced
5. **Reject title**: Click "No" → verify approval UI disappears, title unchanged
6. **Re-generate**: Generate new title → verify approval UI reappears with new title

### Batch Mode Testing
1. **Eligibility**: Verify files without title are included in batch
2. **Step order**: Verify Title runs first (before Copy Edit)
3. **Progress**: Verify progress shows "4 steps per file"
4. **Skip logic**: Verify files with existing title skip the step
5. **Live output**: Verify title streaming appears in live output panel

### Edge Cases
1. **Empty transcript**: Verify LLM generates reasonable title
2. **Very long transcript**: Verify streaming doesn't timeout
3. **LLM outputs multi-line**: Verify only first line is used (or .trim() handles it)
4. **User manually types title**: Verify no conflicts with AI title
5. **Batch cancellation**: Verify title step can be cancelled mid-stream

---

## Files to Modify

### Backend (7 files)
1. `backend/models.py` - Add `enhanced_title` field ✅ DONE
2. `backend/utils/status_tracker.py` - Add `set_enhancement_title()` method ✅ DONE
3. `backend/api/export.py` - Return `enhanced_title` in API response ✅ ALREADY IMPLEMENTED
4. `backend/api/enhance.py` - Add POST `/title/{file_id}` endpoint ✅ DONE + update compile DONE check (line 559)
5. `backend/api/batch.py` - Update batch eligibility check to include title
6. `backend/services/batch_manager.py` - Add title step to batch processing + update `_compute_batch_result()`
7. `backend/config/settings.json` - Add title option ✅ DONE

### Frontend (4 files)
1. `frontend/features/enhance/components/EnhanceTab.tsx` - Add title banner and logic ✅ DONE + update batch eligibility
2. `frontend/features/export/components/ExportTab.tsx` - Add approval UI ✅ ALREADY IMPLEMENTED
3. `frontend/src/api.ts` - Add `setEnhanceTitle()` method ✅ DONE
4. `frontend/features/enhance/components/BatchProgressCard.tsx` - Add title step indicator

---

## Rollback Plan

If issues arise:
1. **Remove title from settings.json** → Title banner won't appear in UI
2. **Revert `enhanced_title` field** → Field is optional, safe to remove
3. **Remove title step from batch** → Batch continues with 3 steps as before

**Note**: Since project is in testing phase, no concerns about existing production data.

---

## Summary

This feature **exactly mimics** Copy Edit and Summary:
- ✅ Same streaming architecture (SSE via `/api/process/enhance/stream`)
- ✅ Same UI pattern (clickable banner with View button)
- ✅ Same state management (streaming state + ref + applied flag)
- ✅ Same persistence (API call on 'done' event)
- ✅ Same batch integration (step runs sequentially, broadcasts tokens)

**New/Different parts**:
- ✅ Runs **before** Copy Edit (first enhancement step)
- ✅ Export tab has **approval UI** (instead of just displaying the result)
- ✅ System prompt has **"extract or generate"** logic

**Total new code**: ~600 lines (backend + frontend combined)
**Breaking changes**: None - title is optional during transition, will become mandatory once batch implementation is complete

---

## Critical Logic Validation

### ✅ Issue 1: Export Tab Title Logic - CONFIRMED CORRECT
**Finding**: Export tab does NOT need backend compile changes.

**How it works**:
1. Backend compile creates markdown with `title: {filename}` (default)
2. Export tab loads markdown, extracts YAML title → populates title input
3. If `enhanced_title` exists and differs from current title → shows approval UI
4. User clicks "Yes" → title input updates → `useEffect` rewrites YAML frontmatter
5. User saves → new title is persisted in markdown file

**Implementation**: Already working in `ExportTab.tsx` lines 159-198.

### ⚠️ Issue 2: Batch Processing - NOT IMPLEMENTED YET
**Finding**: Title step completely missing from batch processing.

**What needs to be added**:
- Title step in `_process_enhancement_steps()` before Copy Edit
- Title in batch state initialization
- Title in eligibility checks (backend + frontend)
- Title in result computation

**Status**: See Phase 6 implementation tasks below.

### ✅ Issue 3: Error Handling - SOLID
**Finding**: Existing error handling for Copy Edit/Summary/Tags is robust.

**Pattern to replicate for title**:
```python
try:
    result_text = await self._run_enhancement_stream(...)
    status_tracker.set_enhancement_title(file_id, result_text.strip())
    file_entry["steps"]["title"] = "done"
    self.current_batch["consecutive_failures"] = 0
    await self.broadcast("done", {"file_id": file_id, "step": "title"})
except Exception as e:
    logger.error(f"Title Generation failed for {file_id}: {e}")
    file_entry["steps"]["title"] = "failed"
    file_entry["error"] = f"Title Generation failed: {e}"
    self.current_batch["consecutive_failures"] += 1
    await self.broadcast("error", {"file_id": file_id, "step": "title", "error": str(e)})
```

**Features**:
- Try/catch around each step
- Failed steps broadcast error events
- Consecutive failure counter increments
- Individual step failures don't stop batch (continues to next step)
- File-level failure doesn't stop batch (continues to next file)
- 3 consecutive failures → batch marked as FAILED

### ✅ Issue 4: Skip Logic - WELL-DEFINED
**Finding**: Skip logic pattern is consistent across all steps.

**Pattern for title**:
```python
if not (pf.enhanced_title or ''):
    # Run title generation
    ...
else:
    file_entry["steps"]["title"] = "done"
```

**Edge case handling**:
- Copy Edit/Summary/Tags: Skip if already exists (simple string/list check)
- Tags: Additional check for `tag_suggestions` (awaiting user approval) → mark as "skipped" not "done"
- Title: Simple check - if `enhanced_title` exists, mark as "done" and skip

**No special cases needed for title** - follows same pattern as Copy Edit and Summary.

### ⚠️ Issue 5: Compile Validation - NEEDS UPDATE
**Finding**: Backend compile marks enhance as DONE without checking title.

**Current logic** (backend/api/enhance.py:559):
```python
if (pf.enhanced_copyedit or '') and (pf.enhanced_summary or '') and ((pf.enhanced_tags or [])):
    status_tracker.update_file_status(file_id, 'enhance', ProcessingStatus.DONE)
```

**Required change**:
```python
if (pf.enhanced_title or '') and (pf.enhanced_copyedit or '') and (pf.enhanced_summary or '') and ((pf.enhanced_tags or [])):
    status_tracker.update_file_status(file_id, 'enhance', ProcessingStatus.DONE)
```

**Status**: Needs implementation (Phase 5 task).

---

## Implementation Status Summary

### ✅ Completed (Manual Mode)
- Backend data model (`enhanced_title` field, status tracker, API endpoint)
- Settings configuration (title option in settings.json)
- Frontend Enhancement Tab (banner, streaming, View button, progress counter, compile button)
- Frontend Export Tab (approval UI with "Yes"/"No" buttons)
- Export API returns `enhanced_title` (already implemented at lines 32-40)

### ⏳ Pending (Batch Mode)
1. **Backend batch_manager.py**:
   - Add title step to `_process_enhancement_steps()` (before Copy Edit)
   - Update file_entry initialization to include `"title": "waiting"`
   - Update `_compute_batch_result()` to check title step completion

2. **Backend api/batch.py**:
   - Update `start_enhance_batch()` eligibility check to include `has_title`
   - Update error message to mention "Title, Copy Edit, Summary, and Tags"

3. **Backend api/enhance.py**:
   - Update `compile_for_obsidian()` DONE check (line 559) to require title:
     ```python
     if (pf.enhanced_title or '') and (pf.enhanced_copyedit or '') and (pf.enhanced_summary or '') and ((pf.enhanced_tags or [])):
         status_tracker.update_file_status(file_id, 'enhance', ProcessingStatus.DONE)
     ```

4. **Frontend EnhanceTab.tsx**:
   - Update `eligibleForBatch` calculation to include `hasTitle` check

5. **Frontend BatchProgressCard.tsx**:
   - Add title step indicator to the steps display

### Estimated Implementation Time
- Batch processing changes: 1-2 hours
- Frontend batch UI: 30 minutes
- Testing and verification: 1 hour
- **Total**: 2-3.5 hours

---

## Quick Implementation Checklist

When ready to implement batch mode, follow this order:

### Step 1: Backend Compile Validation (5 min)
**File**: `backend/api/enhance.py`
- [ ] Line 559: Add `(pf.enhanced_title or '')` to compile DONE check

### Step 2: Backend Batch Eligibility (10 min)
**File**: `backend/api/batch.py`
- [ ] Line 233-240: Add `has_title = bool((file.enhanced_title or '').strip())`
- [ ] Line 240: Update condition to `if not (has_title and has_copy and has_summary and has_tags)`
- [ ] Line 244-247: Update error message to mention "Title, Copy Edit, Summary, and Tags"

### Step 3: Backend Batch State Initialization (5 min)
**File**: `backend/services/batch_manager.py`
- [ ] Line ~460: Add `"title": "waiting"` to steps dictionary

### Step 4: Backend Batch Processing Logic (45-60 min)
**File**: `backend/services/batch_manager.py`
- [ ] Line ~626: Add title step (copy pattern from lines 627-668, adjust for title)
- [ ] Use `prompts.get('title')` for prompt
- [ ] Call `status_tracker.set_enhancement_title(file_id, result_text.strip())`
- [ ] Broadcast start/done/error events
- [ ] Skip if `pf.enhanced_title` already exists

### Step 5: Backend Batch Result Computation (10 min)
**File**: `backend/services/batch_manager.py`
- [ ] Line ~397-401: Add `title_complete = steps.get("title") in ["done", "skipped"]`
- [ ] Line ~404: Update condition to include `title_complete`
- [ ] Line ~407: Add `"title"` to failed steps list

### Step 6: Frontend Batch Eligibility (5 min)
**File**: `frontend/features/enhance/components/EnhanceTab.tsx`
- [ ] Line ~149: Add `const hasTitle = !!((f as any)?.enhanced_title || '').trim();`
- [ ] Update condition to `!(hasTitle && hasCopy && hasSummary && hasTags)`

### Step 7: Frontend Batch Progress Card (10 min)
**File**: `frontend/features/enhance/components/BatchProgressCard.tsx`
- [ ] Line ~282: Add `<StepIndicator status={file.steps.title} label="Title" />` as first indicator

### Step 8: Testing (1 hour)
- [ ] Start batch with files missing title → verify title step runs first
- [ ] Start batch with files that have title → verify step is skipped
- [ ] Cancel batch during title generation → verify proper cleanup
- [ ] Test title failure → verify consecutive failure counter increments
- [ ] Complete full batch → verify all 4 steps complete, progress shows correctly
- [ ] Check BatchProgressCard displays title indicator with correct status

---

## Notes for Implementation

**Prompt retrieval**:
```python
enh_cfg = settings.get('enhancement') or {}
prompts = (enh_cfg.get('prompts') or {})
title_prompt = prompts.get('title') or "Analyze the following transcript..."
```

**Skip logic pattern**:
```python
if not (pf.enhanced_title or ''):
    # Generate title
    ...
else:
    file_entry["steps"]["title"] = "done"
```

**Error handling pattern** (same as Copy Edit/Summary):
```python
try:
    result = await self._run_enhancement_stream(file_id, input_text, title_prompt, "title")
    status_tracker.set_enhancement_title(file_id, result.strip())
    file_entry["steps"]["title"] = "done"
    self.current_batch["consecutive_failures"] = 0
    await self.broadcast("done", {"file_id": file_id, "step": "title"})
    pf = status_tracker.get_file(file_id)  # Refresh for next step
except Exception as e:
    logger.error(f"Title Generation failed: {e}")
    file_entry["steps"]["title"] = "failed"
    file_entry["error"] = f"Title Generation failed: {e}"
    self.current_batch["consecutive_failures"] += 1
    await self.broadcast("error", {"file_id": file_id, "step": "title", "error": str(e)})
```
