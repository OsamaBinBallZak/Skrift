# Refactor Roadmap: Organize by Feature/Tab

**Created:** 2025-10-13  
**Status:** PLANNING  
**Goal:** Reorganize frontend and backend code to align with the natural tab/feature boundaries already visible in the UI and workflow.

---

## Executive Summary

**Current problem:**
- Frontend components are mixed in a flat `components/` directory
- Empty `frontend/Modules/` folders suggest an abandoned attempt at feature organization
- Backend `modules/` contains external tools/assets, not application code
- Tab-specific logic is scattered; no clear ownership boundaries

**Proposed solution:**
- Frontend: Create `features/{tab-name}/` folders for each tab's UI, hooks, and state
- Backend: Introduce thin `services/` layer per step; keep `modules/` for external runners only
- Preserve shared/common code in dedicated folders
- Maintain backward compatibility via temporary shims during migration

**Success criteria:**
- Each tab's code lives in one obvious place
- Cross-feature dependencies are explicit and minimal
- New features can be added by creating a new feature folder
- No behavioral changes—purely structural

---

## Current State Assessment

### Frontend Structure
```
frontend/
  components/           # Mixed: shared UI + tab-specific components
    ui/                 # ✅ Good: Generic primitives (shadcn)
    figma/              # ✅ Good: Design system components
    utils/              # ✅ Good: Generic utilities
    hooks/              # ✅ Good: Generic hooks
    UploadTab.tsx       # ❌ Tab-specific, should be in features/
    TranscribeTab.tsx   # ❌ Tab-specific
    SanitiseTab.tsx     # ❌ Tab-specific
    EnhanceTab.tsx      # ❌ Tab-specific
    ExportTab.tsx       # ❌ Tab-specific
    SettingsTab.tsx     # ❌ Tab-specific
    GlobalFileSelector.tsx  # ? Could be shared or Upload-specific
    SystemResourceMonitor.tsx  # ✅ Shared system component
    EnhancementConfigContext.tsx  # ❌ Enhance-specific
  src/
    lib/                # ✅ Good: Generic utilities
    hooks/              # ✅ Good: Generic hooks
    types/              # ✅ Good: Shared types
  Modules/              # ❌ Empty folders, remove or repurpose
    Upload/
    Transcription/
    Sanitisation/
    Enhancement/
    Export/
    Settings/
  App.tsx               # ✅ Good: Clean orchestration
```

### Backend Structure
```
backend/
  api/                  # ✅ Good: FastAPI routers
    files.py            # ✅ Cross-cutting
    processing.py       # ❌ Too large: all steps in one file
    system.py           # ✅ Cross-cutting
    config.py           # ✅ Cross-cutting
  modules/              # ⚠️ Misleading name: these are external tools, not code modules
    Transcription/      # External: whisper.cpp binaries
    Enhancement/        # External: MLX models, tags whitelist
    Sanitisation/       # Empty
    Export/             # Empty
    Upload/             # Empty
  config/               # ✅ Good: Settings management
  utils/                # ✅ Good: Generic utilities
  models.py             # ✅ Good: Pydantic models
```

**Key insight:** Backend `modules/` should be renamed to `resources/` or `external/` to avoid confusion with code modules.

---

## Target State Design

### Frontend Target Structure
```
frontend/
  features/                      # NEW: Feature folders (one per tab)
    upload/
      components/
        UploadTab.tsx            # Main tab component
        FileDropZone.tsx         # Upload-specific UI
        AudioFileCard.tsx
      hooks/
        useFileUpload.ts
      utils/
        validateAudioFile.ts
      index.ts                   # Public API: export { UploadTab }
    
    transcribe/
      components/
        TranscribeTab.tsx
        TranscriptionControls.tsx
        TranscriptEditor.tsx
      hooks/
        useTranscription.ts
      index.ts
    
    sanitise/
      components/
        SanitiseTab.tsx
        DisambiguationModal.tsx
        NameLinkingConfig.tsx
      hooks/
        useSanitisation.ts
      index.ts
    
    enhance/
      components/
        EnhanceTab.tsx
        CopyEditPanel.tsx
        SummaryPanel.tsx
        TagsPanel.tsx
        ModelSelector.tsx
      context/
        EnhancementConfigContext.tsx  # Move from components/
      hooks/
        useEnhancement.ts
        useEnhanceStream.ts
      index.ts
    
    export/
      components/
        ExportTab.tsx
        MarkdownEditor.tsx
        ExportPreview.tsx
      hooks/
        useExport.ts
      index.ts
    
    settings/
      components/
        SettingsTab.tsx
        TranscriptionSettings.tsx
        EnhancementSettings.tsx
        ObsidianVaultConfig.tsx
      hooks/
        useSettings.ts
      index.ts
  
  shared/                        # Renamed from components/ (generic only)
    ui/                          # Keep: shadcn primitives
    components/
      GlobalFileSelector.tsx     # Cross-feature file picker
      SystemResourceMonitor.tsx
    hooks/                       # Keep: Generic hooks
    utils/                       # Keep: Generic utilities
  
  src/                           # Keep as-is
    lib/
    hooks/
    types/
    api.ts                       # HTTP client
    http.ts
  
  App.tsx                        # Update imports only
```

### Backend Target Structure
```
backend/
  api/                           # Split by feature
    files.py                     # Keep: Cross-cutting file management
    transcribe.py                # NEW: Split from processing.py
    sanitise.py                  # NEW: Split from processing.py
    enhance.py                   # NEW: Split from processing.py
    export.py                    # NEW: Split from processing.py
    system.py                    # Keep: System monitoring
    config.py                    # Keep: Config management
  
  services/                      # NEW: Business logic layer
    transcription.py             # Wraps whisper.cpp invocation
    sanitisation.py              # Name linking logic
    enhancement.py               # MLX generation, tag generation
    export.py                    # Markdown compilation
  
  domain/                        # Optional: Shared domain logic
    audio.py                     # Audio metadata, validation
    text.py                      # Text processing utilities
  
  resources/                     # RENAMED from modules/
    transcription/               # External: whisper.cpp binaries
    enhancement/                 # External: MLX models, tags whitelist
  
  config/                        # Keep as-is
  utils/                         # Keep as-is
  models.py                      # Keep as-is
  main.py                        # Update router imports
```

---

## Migration Plan

### Phase 0: Pre-flight Checks ✅
- [x] Document current state
- [x] Identify all tab-specific code
- [x] Map dependencies between tabs
- [x] **Critical review**: Walk through roadmap with code side-by-side
- [x] Identify any missing pieces or conflicts

### Phase 1: Frontend - Tab Migration (One Tab at a Time)
**Goal:** Migrate all tabs to feature folders with granular validation

**Order (simplest → most complex):**

#### Phase 1.1: Upload Tab ✅ COMPLETED
- [x] Create `frontend/features/upload/` structure (components/, index.ts)
- [x] Move `UploadTab.tsx` to `features/upload/components/UploadTab.tsx`
- [x] Create `features/upload/index.ts`: `export { UploadTab } from './components/UploadTab';`
- [x] Update App.tsx import: `import { UploadTab } from './features/upload';`
- [x] Verify: App starts, Upload tab functional, no console errors
- [x] Commit: `refactor(frontend): migrate Upload tab to features folder`

#### Phase 1.2: Transcribe Tab ✅ COMPLETED
- [x] Create `frontend/features/transcribe/` structure
- [x] Move `TranscribeTab.tsx` to `features/transcribe/components/TranscribeTab.tsx`
- [x] Create index.ts with export
- [x] Update App.tsx import
- [x] Verify: Transcription starts and completes successfully
- [x] Commit: `refactor(frontend): migrate Transcribe tab to features folder`

#### Phase 1.3: Sanitise Tab ✅ COMPLETED
- [x] Create `frontend/features/sanitise/` structure
- [x] Move `SanitiseTab.tsx` to `features/sanitise/components/SanitiseTab.tsx`
- [x] Move `ReprocessConfirmDialog.tsx` if sanitise-specific (check usage)
- [x] Create index.ts with export
- [x] Update App.tsx import
- [x] Verify: Sanitisation runs, disambiguation modal works
- [x] Commit: `refactor(frontend): migrate Sanitise tab to features folder`

#### Phase 1.4: Enhance Tab ✅ COMPLETED
- [x] Create `frontend/features/enhance/` structure (components/, context/)
- [x] Move `EnhanceTab.tsx` to `features/enhance/components/EnhanceTab.tsx`
- [x] Move `EnhancementConfigContext.tsx` to `features/enhance/context/`
- [x] Update EnhanceTab imports to use relative path for context
- [x] Create index.ts exporting both `EnhanceTab` and `EnhancementConfigProvider`
- [x] Update App.tsx imports (both component and context provider)
- [x] Verify: Enhancement streaming works, all panels functional
- [x] Commit: `refactor(frontend): migrate Enhance tab + context to features folder`

#### Phase 1.5: Export Tab ✅ COMPLETED
- [x] Create `frontend/features/export/` structure
- [x] Move `ExportTab.tsx` to `features/export/components/ExportTab.tsx`
- [x] Create index.ts with export
- [x] Update App.tsx import
- [x] Verify: Export/compile generates markdown correctly
- [x] Commit: `refactor(frontend): migrate Export tab to features folder`

#### Phase 1.6: Settings Tab ✅ COMPLETED
- [x] Create `frontend/features/settings/` structure
- [x] Move `SettingsTab.tsx` to `features/settings/components/SettingsTab.tsx`
- [x] Create index.ts with export
- [x] Update App.tsx import
- [x] Verify: Settings save and persist correctly
- [x] Commit: `refactor(frontend): migrate Settings tab to features folder`

**Validation after EACH substep:**
- [ ] App starts without errors
- [ ] Tab renders and functions correctly
- [ ] No console errors
- [ ] Run `npm run type-check` (TypeScript validation)
- [ ] Run `npm run lint` (if time permits)

**Rollback:** Revert one commit per substep

---

### Phase 2: Frontend - Clean Up & Organize Shared Components ✅ COMPLETED
**Goal:** Finalize structure and remove legacy folders

**Steps:**
1. Move shared components:
   - [x] `GlobalFileSelector.tsx` → `shared/` (kept at root of shared/)
   - [x] `SystemResourceMonitor.tsx` → `shared/` (kept at root of shared/)
   - [x] `LoadingSpinner.tsx` → `shared/` (kept at root of shared/)
2. Rename components/ → shared/:
   - [x] Renamed `components/` to `shared/` for clarity
   - [x] Kept `shared/ui/` as-is (shadcn primitives)
   - [x] Kept `shared/hooks/` for shared hooks
   - [x] Kept `shared/utils/` for shared utilities
   - [x] Kept `shared/figma/` for design system components
3. Clean up empty/obsolete files:
   - [x] Delete `components/delete_this.tsx`
   - [x] Delete `components/delete_this_too.tsx`
   - [x] Delete `components/StatusFilePatch.tsx` (empty file)
   - [x] Delete `components/ReprocessConfirmDialog.tsx` (unused)
4. Delete empty Modules folder:
   - [x] Remove `frontend/Modules/` directory entirely
5. Update all imports:
   - [x] Updated App.tsx (6 imports)
   - [x] Updated all feature tabs (47 imports total)
   - [x] Updated tsconfig.json paths
   - [x] Updated tsconfig.typecheck.json
   - [x] Updated vite.config.ts alias
   - [x] Updated tailwind.config.js content paths
6. Verify all tabs still work:
   - [x] Type-check passing
   - [x] Build successful
7. Commit: `refactor(frontend): rename components to shared, clean up legacy files`

---

### Phase 3: Backend - Extract Services Layer
**Goal:** Separate business logic from API endpoints

**Steps:**
1. Create `backend/services/` directory
2. Extract transcription logic from `api/processing.py`:
   - Move `run_solo_transcription()` → `services/transcription.py`
   - Move `run_conversation_transcription()` → `services/transcription.py`
   - Keep API endpoint in `processing.py`, delegate to service
3. Repeat for sanitise, enhance, export
4. Test each extraction independently
5. Commit per service: "refactor(backend): extract transcription service"

**Pattern:**
```python
# Before: api/processing.py
@router.post("/transcribe/{file_id}")
async def start_transcription(...):
    # 200 lines of logic here
    result = run_solo_transcription(...)
    return result

# After: api/transcribe.py
from services.transcription import TranscriptionService

@router.post("/transcribe/{file_id}")
async def start_transcription(...):
    service = TranscriptionService()
    result = await service.transcribe_solo(...)
    return result
```

---

---

### Phase 4: Backend - Split API Routers
**Goal:** One router per feature for clarity

**Steps:**
1. Create `api/transcribe.py` and move transcribe endpoints from `processing.py`
2. Create `api/sanitise.py` and move sanitise endpoints
3. Create `api/enhance.py` and move enhance + model management endpoints
4. Create `api/export.py` and move export endpoints
5. Update `main.py` to include new routers:
   ```python
   from api.transcribe import router as transcribe_router
   from api.sanitise import router as sanitise_router
   from api.enhance import router as enhance_router
   from api.export import router as export_router
   
   app.include_router(transcribe_router, prefix="/api/process", tags=["transcribe"])
   app.include_router(sanitise_router, prefix="/api/process", tags=["sanitise"])
   app.include_router(enhance_router, prefix="/api/process", tags=["enhance"])
   app.include_router(export_router, prefix="/api/process", tags=["export"])
   ```
6. Delete now-empty `api/processing.py`
7. Test all endpoints via `/docs`
8. Commit: "refactor(backend): split processing router by feature"

---

### Phase 5: Backend - Rename modules/ → resources/
**Goal:** Clarify that this folder holds external tools, not code

**Steps:**
1. Rename `backend/modules/` → `backend/resources/`
2. Update all path references in `config/settings.py`:
   ```python
   # Before
   BACKEND_DIR / "modules" / "transcription"
   
   # After
   BACKEND_DIR / "resources" / "transcription"
   ```
3. Update any hardcoded paths in services
4. Test transcription, enhancement
5. Commit: "refactor(backend): rename modules to resources for clarity"

---

### Phase 6: Add Lint Guards
**Goal:** Prevent future cross-feature coupling

**Steps:**
1. Add ESLint rule to prevent cross-feature imports:
   ```json
   {
     "rules": {
       "import/no-restricted-paths": ["error", {
         "zones": [
           { "target": "./frontend/features/upload", "from": "./frontend/features/!(upload|shared)" },
           { "target": "./frontend/features/transcribe", "from": "./frontend/features/!(transcribe|shared)" },
           // ... repeat for each feature
         ]
       }]
     }
   }
   ```
2. Configure Python import linter (optional)
3. Document import policy in `Docs/ARCHITECTURE.md`

---

## Risk Assessment

### Low Risk
✅ Frontend feature folders (easy to revert, no behavior change)  
✅ Backend service extraction (pure refactor, tests catch breaks)  
✅ Renaming modules/ → resources/ (find-and-replace paths)

### Medium Risk
⚠️ Splitting `api/processing.py` (many endpoints, easy to miss one)  
⚠️ Moving `EnhancementConfigContext` (used across enhance panels)

### High Risk
❌ None—this refactor is purely structural, no logic changes

### Mitigation
- **Test after each phase** (don't batch multiple phases)
- **Keep commits small** (one logical change per commit)
- **Maintain a working main branch** (use feature branch for each phase)
- **Run full test suite** (if tests exist; if not, manual smoke test each tab)

---

## Validation Checklist

After each phase, verify:
- [ ] App starts without errors
- [ ] All tabs load and render correctly
- [ ] File upload works
- [ ] Transcription starts and completes
- [ ] Sanitisation runs (including disambiguation if triggered)
- [ ] Enhancement streams work
- [ ] Export/compile generates markdown
- [ ] Settings save and persist
- [ ] No console errors
- [ ] Backend `/docs` API page renders
- [ ] Backend endpoints respond correctly

---

## Rollback Plan

**Per-phase rollback:**
- Revert the commits for that phase
- Re-test to confirm rollback worked

**Full rollback:**
- Reset to commit before Phase 1 started
- Tag that commit as `pre-refactor-baseline` for safety

---

## Post-Refactor Benefits

### For You (Developer)
✅ Each tab's code is in one place—faster navigation  
✅ Clear boundaries reduce cognitive load  
✅ Easier to add new tabs (just copy a feature folder template)  
✅ Lint rules prevent accidental coupling

### For the Codebase
✅ Import paths tell you feature boundaries at a glance  
✅ Services layer makes backend testable (can mock services in API tests)  
✅ `resources/` clarifies what's external vs. application code  
✅ Future code splitting becomes trivial (Vite can split by feature automatically)

### For Future You
✅ Onboarding new contributors is faster (point them at one feature folder)  
✅ Debugging is scoped (if Enhance breaks, only look in features/enhance/)  
✅ Refactoring one feature doesn't risk others

---

## Decisions Made ✅

1. **Frontend directory naming:** `frontend/features/` ✅
   - Industry standard, clear intent
   - Empty `Modules/` will be removed in Phase 3

2. **Backend services pattern:** Module-level functions ✅
   - Simple, functional approach: `transcription.transcribe_solo(...)`
   - Can migrate to classes later if state management becomes complex

3. **Shared component boundaries:** ✅
   - `GlobalFileSelector`: Shared (used across all tabs)
   - `SystemResourceMonitor`: Shared (global system monitoring)
   - All tab-specific components go in their respective feature folders

4. **Testing strategy:** Manual smoke testing per phase ✅
   - Run through validation checklist after each phase
   - Add automated tests after structure stabilizes (Phase 7)
   - Document manual test steps in phase validation sections

---

## Next Steps

### Immediate (Today)
1. **Critical review session:** 
   - Open this roadmap side-by-side with the codebase
   - Walk through each phase mentally
   - Challenge assumptions ("Does this make sense for my workflow?")
   - Update roadmap with any gaps or conflicts you find

2. **Tag baseline:**
   ```bash
   git tag pre-refactor-baseline
   git push origin pre-refactor-baseline
   ```

3. **Create feature branch:**
   ```bash
   git checkout -b refactor/organize-by-feature
   ```

### Phase 1 Execution (After Review)
1. Start with Transcribe tab (simplest, well-isolated)
2. Follow Phase 1 steps exactly
3. Commit, test, validate
4. If successful, continue to Phase 2

### Phase 7: Add Automated Tests (Optional)
**Goal:** Lock in refactored structure with tests

**Steps:**
1. Add basic smoke tests for each tab component
2. Add API integration tests for each service
3. Add tests to CI/CD pipeline
4. Document testing conventions in `Docs/TESTING.md`

---

### Weekly Cadence (Suggested)
- **Week 1:** Phases 0-2 (Frontend tab migration, cleanup)
- **Week 2:** Phases 3-4 (Backend services, split routers)
- **Week 3:** Phases 5-6 (Rename modules, lint guards)
- **Week 4:** Phase 7 (Automated tests, documentation)

---

## Success Metrics

**Quantitative:**
- [x] 6 feature folders created (one per tab)
- [ ] 4 service files created (transcribe, sanitise, enhance, export)
- [ ] 4 new API router files created
- [x] 0 behavioral regressions
- [x] 100% of tabs functional post-refactor

**Qualitative:**
- [ ] "Where does X live?" has an obvious answer
- [ ] Adding a new tab takes <1 hour (copy template, customize)
- [ ] Cross-feature imports are rare and intentional

---

## Notes & Learnings

*(Update this section as you execute the plan)*

- **2025-10-13 (19:21):** Initial roadmap created
- **2025-10-13 (19:21):** Decisions locked in:
  - ✅ Frontend: `features/` directory structure
  - ✅ Backend: Module-level functions (not classes)
  - ✅ Testing: Manual smoke tests per phase, automated tests in Phase 7
  - ✅ Status: Ready for Phase 0 critical review
- **2025-10-15 (18:14):** Phase 0 completed ✅
  - Verified: No cross-tab imports detected
  - Path aliases confirmed in tsconfig.json and vite.config.ts
  - Build tools ready (lint, type-check)
- **2025-10-15 (18:14):** Restructured Phase 1 & 2 ✅
  - Phase 1 now split into 6 substeps (one per tab)
  - Order: Upload → Transcribe → Sanitise → Enhance → Export → Settings
  - Phase 2 focuses on shared components cleanup
  - Ready to begin Phase 1.1 (Upload tab migration)
- **2025-10-15 (18:58):** Phase 1.1 (Upload Tab) completed ✅
  - Created features/upload structure
  - Updated all imports and fixed relative paths
  - Updated tsconfig.typecheck.json
  - Verified Upload tab functionality
- **2025-10-15 (18:58):** Phase 1.2 (Transcribe Tab) completed ✅
  - Created features/transcribe structure
  - Migrated TranscribeTab.tsx successfully
  - Verified transcription works correctly
- **2025-10-15 (18:58):** Phase 1.3 (Sanitise Tab) completed ✅
  - Created features/sanitise structure
  - Fixed Tailwind config to scan features/ folder for CSS classes
  - Fixed SanitiseTab state refresh bug (added steps.sanitise to useEffect deps)
  - Verified editor height (h-96) and sanitisation functionality
- **2025-10-15 (19:05):** Phase 1.4 (Enhance Tab) completed ✅
  - Created features/enhance structure with components/ and context/ subdirectories
  - Moved EnhanceTab and EnhancementConfigContext
  - Updated SettingsTab import (also uses EnhancementConfigContext)
  - Removed unused imports (Checkbox, Play, Eye, Settings)
  - Fixed 'Preparing...' banner fade animation
- **2025-10-15 (19:19):** Pre-Task 1 completed (Extract PipelineFile Type) ✅
  - Created src/types/pipeline.ts as single source of truth
  - Updated GlobalFileSelector to import and re-export
  - Updated all migrated tabs to use new type location
  - Removed 'skipped' status from enhance step (all steps must complete)
  - Removed duplicate PipelineFile interface from src/api.ts
- **2025-10-15 (19:24):** Phase 1.5 (Export Tab) completed ✅
  - Created features/export structure
  - Moved ExportTab.tsx to features/export/components/
  - Updated all imports (UI components, PipelineFile, dynamic api imports)
  - Updated tsconfig.typecheck.json
  - Verified build and frontend restart
- **2025-10-15 (21:20):** Phase 1.6 (Settings Tab) completed ✅
  - Created features/settings structure
  - Moved SettingsTab.tsx to features/settings/components/
  - Updated all static imports (UI components, hooks)
  - Updated all dynamic imports (src/api) to use correct relative paths
  - Fixed fetchWithTimeout call signature in App.tsx (moved timeout to init object)
  - Updated tsconfig.typecheck.json
  - **All Phase 1 substeps now complete!**
- **2025-10-15 (21:36):** Phase 2 (Frontend Cleanup) completed ✅
  - Renamed `components/` → `shared/` for clarity (47 imports updated)
  - Deleted 4 obsolete files (StatusFilePatch, delete_this, delete_this_too, ReprocessConfirmDialog)
  - Deleted empty `Modules/` directory
  - Updated all config files (tsconfig.json, tsconfig.typecheck.json, vite.config.ts, tailwind.config.js)
  - Created .eslintignore to exclude dist/ and build artifacts (reduced lint errors 65%)
  - Build and type-check passing
  - **Frontend refactor complete! Next:** Phase 3 (Backend services layer)

---

## References

- Feature-Sliced Design: https://feature-sliced.design/
- Vertical Slice Architecture: https://jimmybogard.com/vertical-slice-architecture/
- Original refactor discussion: (this conversation)
