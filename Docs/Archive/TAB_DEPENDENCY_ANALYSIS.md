# Tab Dependency Analysis & Migration Guide

**Created:** 2025-10-13  
**Purpose:** Deep-dive into each tab's dependencies to inform safe refactor execution

---

## Overview

This document analyzes **what each tab imports** and **what it needs to move**. Each tab gets its own chapter with:
- Current imports (what it depends on)
- Cross-tab dependencies (if any)
- Files to move
- Tricky spots / watch-outs
- Step-by-step migration instructions

---

## Chapter 1: Upload Tab

### Current Location
- `frontend/components/UploadTab.tsx`

### Import Analysis
```typescript
// UI Components (shared, keep in shared/)
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Progress } from './ui/progress';
import { Separator } from './ui/separator';
import { Upload, FileAudio, ... } from 'lucide-react'; // Icons

// Cross-feature dependencies
import { PipelineFile } from './GlobalFileSelector'; // ⚠️ SHARED TYPE
import { apiService } from '../src/api';           // ✅ STAYS IN SRC
import { fetchWithTimeout } from '../src/http';    // ✅ STAYS IN SRC
```

### Cross-Tab Dependencies
**NONE** ✅ Upload is completely self-contained!

### Files to Move
1. `UploadTab.tsx` → `features/upload/components/UploadTab.tsx`

### Upload-Specific Code (stays with tab)
- `useFileDialogSafe` hook (embedded in file)
- `FilePreview` interface
- File validation logic
- Drag-and-drop handlers

### Watch-Outs ⚠️
1. **PipelineFile type** is imported from `GlobalFileSelector.tsx`
   - **Solution:** Move `PipelineFile` type to `src/types/pipeline.ts` first
   - Update all imports before moving tabs
2. **Electron API** usage (`window.electronAPI.dialog`)
   - Already has safe fallback for browser mode
   - No changes needed

### Migration Steps

**Prerequisites:** ✅ Complete Pre-Migration Tasks (Pre-Task 1-3) first!

**Step 1: Create upload feature folder**
```bash
mkdir -p frontend/features/upload/components
mkdir -p frontend/features/upload/hooks
```

**Step 2: Move UploadTab**
```bash
mv frontend/components/UploadTab.tsx frontend/features/upload/components/UploadTab.tsx
```

**Step 3: Update imports in UploadTab**

Note: We're moving from `components/` to `features/upload/components/`, which changes relative paths.

⚠️ **Important:** We do NOT rename `components/` to `shared/` yet—that happens in Phase 3!

```typescript
// frontend/features/upload/components/UploadTab.tsx

// UI components: ./ui/ becomes ../../../components/ui/ (NOT shared yet!)
- import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
+ import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
// (repeat for all other ui/ imports: Button, Badge, Alert, Switch, Label, Progress, Separator)

// Type: was from GlobalFileSelector, now from src/types/pipeline
- import { PipelineFile } from './GlobalFileSelector';
+ import type { PipelineFile } from '../../../src/types/pipeline';

// API: ../src/ becomes ../../../src/ (went up one more level)
- import { apiService } from '../src/api';
+ import { apiService } from '../../../src/api';
- import { fetchWithTimeout } from '../src/http';
+ import { fetchWithTimeout } from '../../../src/http';
```
**Step 4 (Optional): Refactor inline useFileDialogSafe**

UploadTab has its own inline `useFileDialogSafe` function. For now, **keep it**—it's simpler and less risky.

(We can optionally clean this up later after all tabs are migrated.)

**Step 5: Create index.ts**
```typescript
// frontend/features/upload/index.ts
export { UploadTab } from './components/UploadTab';
```

**Step 6: Update App.tsx**
```typescript
// frontend/App.tsx
- import { UploadTab } from './components/UploadTab';
+ import { UploadTab } from './features/upload';
```

**Step 7: Test**
- Run `npm run dev`
- Navigate to Upload tab
- Try drag-and-drop
- Try file selection
- Verify no console errors

---

## Chapter 2: Transcribe Tab

### Current Location
- `frontend/components/TranscribeTab.tsx`

### Import Analysis
```typescript
// UI Components (shared)
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { Alert, AlertDescription } from './ui/alert';
import { Progress } from './ui/progress';
import { Mic, Play, Pause, ... } from 'lucide-react';

// Cross-feature
import { PipelineFile } from './GlobalFileSelector'; // ⚠️ SHARED TYPE
```

### Cross-Tab Dependencies
**NONE** ✅ Transcribe is self-contained!

### Files to Move
1. `TranscribeTab.tsx` → `features/transcribe/components/TranscribeTab.tsx`

### Transcribe-Specific Code
- `getActivityAge()` helper function
- `isActivityStale()` helper function
- Audio playback logic (`audioRef`, `togglePlay`)
- Status polling logic

### Watch-Outs ⚠️
1. **Audio playback** uses `file://` URLs
   - Works in Electron, may need CORS handling in browser
   - Already has `encodeURI()` for special chars ✅
2. **Embedded helper functions** (`getActivityAge`, `isActivityStale`)
   - Could extract to `features/transcribe/utils/` for reuse
   - Or keep inline (simpler for now)

### Migration Steps

**Step 1: Create transcribe feature folder**
```bash
mkdir -p frontend/features/transcribe/components
mkdir -p frontend/features/transcribe/utils
```

**Step 2: Move TranscribeTab**
```bash
mv frontend/components/TranscribeTab.tsx frontend/features/transcribe/components/TranscribeTab.tsx
```

**Step 3: Update imports**
```typescript
// frontend/features/transcribe/components/TranscribeTab.tsx
import { Card, ... } from '../../../components/ui/card';
// ... update all './ui/' to '../../../components/ui/' (NOT shared yet!)

import type { PipelineFile } from '../../../src/types/pipeline';
```

**Step 4: (Optional) Extract utils**
```typescript
// frontend/features/transcribe/utils/activityHelpers.ts
export function getActivityAge(lastActivityAt: string | Date | undefined): string {
  // ... move function here
}

export function isActivityStale(lastActivityAt: string | Date | undefined, thresholdSeconds: number = 120): boolean {
  // ... move function here
}
```

Then import in TranscribeTab:
```typescript
import { getActivityAge, isActivityStale } from '../utils/activityHelpers';
```

**Step 5: Create index.ts**
```typescript
// frontend/features/transcribe/index.ts
export { TranscribeTab } from './components/TranscribeTab';
```

**Step 6: Update App.tsx**
```typescript
// frontend/App.tsx
- import { TranscribeTab } from './components/TranscribeTab';
+ import { TranscribeTab } from './features/transcribe';
```

**Step 7: Test**
- Navigate to Transcribe tab
- Select a file
- Start transcription
- Test audio playback
- Verify transcript editing works

---

## Chapter 3: Sanitise Tab

### Current Location
- `frontend/components/SanitiseTab.tsx`

### Import Analysis
```typescript
// NO UI COMPONENT IMPORTS! ⚠️ Unusual
// This file doesn't import from './ui/' at all

// Inline types only
interface MinimalFile { ... }  // ⚠️ Duplicate of PipelineFile

// Inline utilities
fetchWithTimeout() // ⚠️ Duplicate from src/http
```

### Cross-Tab Dependencies
**NONE** ✅ Completely standalone!

### Files to Move
1. `SanitiseTab.tsx` → `features/sanitise/components/SanitiseTab.tsx`

### Sanitise-Specific Code
- SRT parsing (`timecodeToSeconds`, `parseSRT`)
- Word timing alignment (`buildWordTiming`)
- Timeline token highlighting
- Audio sync with text selection

### Watch-Outs ⚠️
1. **Duplicate types** (`MinimalFile` should use `PipelineFile`)
2. **Duplicate utilities** (`fetchWithTimeout` already in `src/http`)
3. **Complex audio sync logic** - don't break it!
4. **HTTP endpoints** hardcoded (`http://localhost:8000/api/files/...`)
   - Should use `apiService` instead (refactor opportunity)

### Migration Steps

**Step 1: Create sanitise feature folder**
```bash
mkdir -p frontend/features/sanitise/components
mkdir -p frontend/features/sanitise/utils
```

**Step 2: Extract SRT utilities (optional but recommended)**
```typescript
// frontend/features/sanitise/utils/srtParser.ts
export function timecodeToSeconds(tc: string): number { ... }
export function parseSRT(srt: string): SrtSegment[] { ... }
export function buildWordTiming(text: string, segments: SrtSegment[]) { ... }
```

**Step 3: Move SanitiseTab**
```bash
mv frontend/components/SanitiseTab.tsx frontend/features/sanitise/components/SanitiseTab.tsx
```

**Step 4: Update types**
```typescript
// frontend/features/sanitise/components/SanitiseTab.tsx
- interface MinimalFile { ... }
- interface Props {
-   selectedFile: MinimalFile | null;
-   files: MinimalFile[];
- }

+ import { PipelineFile } from '../../../src/types/pipeline';
+ interface Props {
+   selectedFile: PipelineFile | null;
+   files: PipelineFile[];
+ }
```

**Step 5: Use shared fetchWithTimeout**
```typescript
- async function fetchWithTimeout(...) { ... }  // Remove inline version
+ import { fetchWithTimeout } from '../../../src/http';
```

**Step 6: Create index.ts**
```typescript
// frontend/features/sanitise/index.ts
export { SanitiseTab } from './components/SanitiseTab';
```

**Step 7: Update App.tsx**
```typescript
// frontend/App.tsx
- import { SanitiseTab } from './components/SanitiseTab';
+ import { SanitiseTab } from './features/sanitise';
```

**Step 8: Test carefully**
- Load sanitised text
- Verify audio playback
- Test word highlighting
- Test timeline seeking by clicking text
- Verify processed.wav plays correctly

---

## Chapter 4: Enhance Tab ⚠️ MOST COMPLEX

### Current Location
- `frontend/components/EnhanceTab.tsx`
- `frontend/components/EnhancementConfigContext.tsx`

### Import Analysis
```typescript
// UI Components (shared)
import { Card, ... } from './ui/card';
import { Sparkles, ... } from 'lucide-react';

// Cross-feature dependencies
import { PipelineFile } from './GlobalFileSelector';     // ⚠️ SHARED TYPE
import { useEnhancementConfig } from './EnhancementConfigContext'; // ⚠️ CONTEXT
import { API_BASE_URL } from '../src/api';              // ✅ STAYS
```

### Cross-Tab Dependencies
⚠️ **HAS CONTEXT**: `EnhancementConfigContext.tsx`
- Provides `config`, `updateConfig`, `updateOption`
- Used by EnhanceTab AND SettingsTab
- **Must move to features/enhance/context/** and be imported by both

### Files to Move
1. `EnhanceTab.tsx` → `features/enhance/components/EnhanceTab.tsx`
2. `EnhancementConfigContext.tsx` → `features/enhance/context/EnhancementConfigContext.tsx`

### Enhance-Specific Code
- SSE streaming logic (`EventSource`)
- Copy edit, Summary, Tags panels
- Model selection UI
- Stream state management

### Watch-Outs ⚠️
1. **Context Provider** wraps entire App
   - Must remain accessible at App level
   - Import path changes but usage stays the same
2. **EventSource for SSE streaming**
   - Backend endpoint: `/api/process/enhance/stream/${fileId}`
   - Keep URL construction logic intact
3. **Settings Tab also imports context**
   - Update its import after moving context

### Migration Steps

**Step 1: Create enhance feature folder**
```bash
mkdir -p frontend/features/enhance/components
mkdir -p frontend/features/enhance/context
mkdir -p frontend/features/enhance/hooks
```

**Step 2: Move context FIRST**
```bash
mv frontend/components/EnhancementConfigContext.tsx \
   frontend/features/enhance/context/EnhancementConfigContext.tsx
```

**Step 3: Update context imports**
```typescript
// frontend/features/enhance/context/EnhancementConfigContext.tsx
// Update the apiService import path:
- import { apiService } from '../src/api';
+ import { apiService } from '../../../src/api';
```

**Step 4: Move EnhanceTab**
```bash
mv frontend/components/EnhanceTab.tsx frontend/features/enhance/components/EnhanceTab.tsx
```

**Step 5: Update EnhanceTab imports**
```typescript
// frontend/features/enhance/components/EnhanceTab.tsx
import { Card, ... } from '../../../components/ui/card';
import { PipelineFile } from '../../../src/types/pipeline';
import { useEnhancementConfig } from '../context/EnhancementConfigContext';
import { API_BASE_URL } from '../../../src/api';
```

**Step 6: Create index.ts**
```typescript
// frontend/features/enhance/index.ts
export { EnhanceTab } from './components/EnhanceTab';
export { EnhancementConfigProvider, useEnhancementConfig } from './context/EnhancementConfigContext';
```

**Step 7: Update App.tsx**
```typescript
// frontend/App.tsx
- import { EnhanceTab } from './components/EnhanceTab';
- import { EnhancementConfigProvider } from './components/EnhancementConfigContext';
+ import { EnhanceTab, EnhancementConfigProvider } from './features/enhance';
```

**Step 8: Update SettingsTab import (will be updated when Settings migrates)**
```typescript
// frontend/components/SettingsTab.tsx (temporary)
- import { useEnhancementConfig } from './EnhancementConfigContext';
+ import { useEnhancementConfig } from '../features/enhance/context/EnhancementConfigContext';
```

**Step 9: Test**
- Navigate to Enhance tab
- Test SSE streaming (copy edit)
- Test summary generation
- Test tag generation
- Verify Apply buttons persist state
- Test Compile button

---

## Chapter 5: Export Tab

### Current Location
- `frontend/components/ExportTab.tsx`

### Import Analysis
```typescript
// UI Components (shared)
import { Card, ... } from './ui/card';
import { Download, ... } from 'lucide-react';

// Cross-feature
import { PipelineFile } from './GlobalFileSelector'; // ⚠️ SHARED TYPE
```

### Cross-Tab Dependencies
**NONE** ✅ Export is self-contained!

### Files to Move
1. `ExportTab.tsx` → `features/export/components/ExportTab.tsx`

### Export-Specific Code
- Markdown editor
- YAML frontmatter handling
- Save / Save & Export logic
- Vault path configuration

### Watch-Outs ⚠️
1. **Dynamic import** of apiService
   ```typescript
   const { apiService } = await import('../src/api');
   ```
   - Update path to `../../../src/api` after move
2. **Markdown editing state** (`content`, `path`, `vaultPath`)
   - Keep all state management in component

### Migration Steps

**Step 1: Create export feature folder**
```bash
mkdir -p frontend/features/export/components
```

**Step 2: Move ExportTab**
```bash
mv frontend/components/ExportTab.tsx frontend/features/export/components/ExportTab.tsx
```

**Step 3: Update imports**
```typescript
// frontend/features/export/components/ExportTab.tsx
import { Card, ... } from '../../../components/ui/card';
import { PipelineFile } from '../../../src/types/pipeline';

// Update dynamic import path
const { apiService } = await import('../../../src/api');
```

**Step 4: Create index.ts**
```typescript
// frontend/features/export/index.ts
export { ExportTab } from './components/ExportTab';
```

**Step 5: Update App.tsx**
```typescript
// frontend/App.tsx
- import { ExportTab } from './components/ExportTab';
+ import { ExportTab } from './features/export';
```

**Step 6: Test**
- Navigate to Export tab
- Load compiled.md
- Edit markdown
- Test Save button
- Test Save & Export button
- Verify vault path selection works

---

## Chapter 6: Settings Tab ⚠️ SPECIAL CASE

### Current Location
- `frontend/components/SettingsTab.tsx`
- `frontend/components/hooks/useElectronSafe.ts`

### Import Analysis
```typescript
// UI Components (shared)
import { Card, ... } from './ui/card';
import { FolderOpen, ... } from 'lucide-react';

// Cross-feature
import { useFileDialogSafe } from './hooks/useElectronSafe';  // ⚠️ SHARED HOOK
import { useEnhancementConfig, EnhancementOption } from './EnhancementConfigContext'; // ⚠️ ENHANCE CONTEXT
```

### Cross-Tab Dependencies
⚠️ **IMPORTS FROM ENHANCE**:
- `useEnhancementConfig` from EnhancementConfigContext
- This is OK! Settings is allowed to import from enhance for configuration

⚠️ **USES SHARED HOOK**:
- `useFileDialogSafe` hook
- Used by both Upload and Settings
- **Stays in `components/hooks/` until Phase 3**

### Files to Move
1. `SettingsTab.tsx` → `features/settings/components/SettingsTab.tsx`
2. Hook stays at `components/hooks/useElectronSafe.ts` (no move during Phase 1)

### Settings-Specific Code
- MLX model management
- Name/alias configuration
- Sanitisation settings
- Enhancement prompts editing
- Obsidian vault config
- Tag generation settings

### Watch-Outs ⚠️
1. **Cross-feature imports are OK here**
   - Settings is special: it configures other features
   - Importing from enhance context is expected
2. **useFileDialogSafe is shared**
   - Hook stays in `components/hooks/` (no move needed)
   - Import path will be `../../../components/hooks/useElectronSafe`
3. **Many API calls** to backend config endpoints
   - All use dynamic imports: `await import('../src/api')`
   - Update paths after move

### Migration Steps

**Step 1: Create settings feature folder**
```bash
mkdir -p frontend/features/settings/components
```

**Step 2: Move SettingsTab**
```bash
mv frontend/components/SettingsTab.tsx frontend/features/settings/components/SettingsTab.tsx
```

**Step 3: Update imports**
```typescript
// frontend/features/settings/components/SettingsTab.tsx
import { Card, ... } from '../../../components/ui/card';
import { useFileDialogSafe } from '../../../components/hooks/useElectronSafe';
import { useEnhancementConfig, EnhancementOption } from '../../enhance/context/EnhancementConfigContext';

// Update all dynamic imports
const api = (await import('../../../src/api')).apiService;
```

**Step 4: Create index.ts**
```typescript
// frontend/features/settings/index.ts
export { SettingsTab } from './components/SettingsTab';
```

**Step 5: Update App.tsx**
```typescript
// frontend/App.tsx
- import { SettingsTab } from './components/SettingsTab';
+ import { SettingsTab } from './features/settings';
```

**Step 6: Test thoroughly**
- Navigate to Settings tab
- Test each sub-tab (Transcription, Enhancement, Names, Export, System)
- Test file/folder selection dialogs
- Test save/reset buttons
- Verify MLX model management works
- Test name configuration
- Test Obsidian vault refresh

---

## Summary: Dependency Matrix

| Tab | Imports PipelineFile? | Imports Context? | Has Shared Hooks? | Cross-Tab Imports? |
|-----|---------------------|------------------|-------------------|-------------------|
| Upload | ✅ | ❌ | ✅ (inline) | ❌ No |
| Transcribe | ✅ | ❌ | ❌ | ❌ No |
| Sanitise | ✅ (inline duplicate) | ❌ | ❌ | ❌ No |
| Enhance | ✅ | ✅ (provides) | ❌ | ❌ No |
| Export | ✅ | ❌ | ❌ | ❌ No |
| Settings | ❌ | ✅ (consumes) | ✅ | ✅ Yes (enhance) |

---

## Critical Pre-Migration Tasks

**⚠️ MUST complete these BEFORE moving any tab! ⚠️**

### Pre-Task 1: Extract PipelineFile Type

**Current state:** `PipelineFile` interface is defined in `GlobalFileSelector.tsx` (lines 26-54)

**Why extract?** Prevents circular dependencies when we move GlobalFileSelector to shared/

**Steps:**
```bash
# 1. Create type file
mkdir -p frontend/src/types
```

Create `frontend/src/types/pipeline.ts`:
```typescript
export interface PipelineFile {
  id: string;
  name: string;
  size: string;
  status: 'unprocessed' | 'transcribing' | 'transcribed' | 'sanitising' | 
          'sanitised' | 'enhancing' | 'enhanced' | 'exporting' | 'exported' | 'error';
  path: string;
  addedTime: string;
  progress?: number;
  progressMessage?: string;
  output?: string;
  sanitised?: string;
  enhanced?: string;
  exported?: string;
  enhanced_copyedit?: string;
  enhanced_summary?: string;
  enhanced_tags?: string[];
  error?: string;
  conversationMode: boolean;
  duration?: string;
  format?: 'm4a' | 'mp3' | 'wav' | 'flac';
  lastActivityAt?: string;
  steps: {
    transcribe: 'pending' | 'processing' | 'done' | 'error';
    sanitise: 'pending' | 'processing' | 'done' | 'error'; 
    enhance: 'pending' | 'processing' | 'done' | 'error' | 'skipped';
    export: 'pending' | 'processing' | 'done' | 'error';
  };
}
```

**2. Update GlobalFileSelector.tsx:**
```typescript
// At the top of the file, replace the interface definition with:
import type { PipelineFile } from '../src/types/pipeline';
export type { PipelineFile }; // Re-export for convenience

// Remove lines 26-54 (the old interface definition)
```

**3. Test:**
```bash
npm run dev
# Verify no errors, all tabs still work
```

---

### Pre-Task 2: Update App.tsx to use new PipelineFile location

**Why?** App.tsx currently imports PipelineFile from GlobalFileSelector. After Pre-Task 1, we need to update this.

**Update App.tsx:**
```typescript
// frontend/App.tsx line 7
- import { GlobalFileSelector, PipelineFile } from './components/GlobalFileSelector';
+ import { GlobalFileSelector } from './components/GlobalFileSelector';
+ import type { PipelineFile } from './src/types/pipeline';
```

**Test:**
```bash
npm run dev
# Verify no errors, all tabs still work
```

---

### Pre-Task 3: Verify Everything Still Works

**Checklist:**
- [ ] App starts without errors
- [ ] GlobalFileSelector displays files
- [ ] All tabs load correctly
- [ ] No console errors about missing types
- [ ] `npm run build` succeeds

**✅ If all checks pass, you're ready to start migrating tabs!**

---

## Note: components/ vs shared/

**Important:** During tab migration (Chapters 1-6), we keep the `components/` directory name.

We only rename `components/` → `shared/` in **Phase 3** (after all tabs have been moved).

This means tab imports will temporarily use `../../../components/ui/` paths, which we'll update to `../../../shared/ui/` in Phase 3.

---

## Migration Order (Recommended)

Based on complexity and dependencies:

1. **Upload** (simplest, no context, good starter)
2. **Transcribe** (simple, no context, audio logic is isolated)
3. **Export** (moderate, no context, dynamic imports)
4. **Sanitise** (moderate, needs type refactor, complex logic)
5. **Enhance** (complex, has context used by Settings)
6. **Settings** (most complex, imports from Enhance)

---

## Post-Migration Validation

After each tab migration, check:
- [ ] Tab loads without console errors
- [ ] All buttons/controls work
- [ ] File selection works
- [ ] API calls succeed
- [ ] State management intact
- [ ] No import errors in other tabs
- [ ] Hot reload still works

---

## Rollback Strategy

If any tab breaks during migration:
```bash
# Revert the last commit
git revert HEAD

# Or reset to before migration
git reset --hard <commit-before-migration>
```

Keep each tab migration as a single atomic commit for easy rollback.

---

## Next Actions

1. ✅ Read through each chapter
2. ✅ Identify any concerns or questions
3. ✅ Complete pre-migration tasks (Pre-Task 1-3)
4. ▶️ Start with Upload tab (Chapter 1)
5. Validate before moving to next tab

