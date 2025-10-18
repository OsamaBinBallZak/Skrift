# Frontend Cleanup Plan

**Total Issues**: 230 (208 errors, 22 warnings)  
**Status**: Ready to fix systematically  
**Estimated Time**: 2-3 hours

---

## Issue Breakdown

| Issue Type | Count | Severity | Auto-fixable? |
|------------|-------|----------|---------------|
| `any` types | 84 | Medium | Partial |
| Unused variables | 50+ | Low | Yes |
| Empty blocks | 13 | Medium | Manual |
| Missing React imports | 7 | Low | Yes |
| CommonJS requires | 7 | Low | Yes |
| React Hook warnings | 22 | Medium | Manual |
| Unescaped entities | 6 | Low | Yes |
| Use-before-define | 4 | Medium | Manual |

---

## Execution Plan

### Phase 1: Quick Wins (Auto-fixable) - 30 min

**Priority**: HIGH  
**Risk**: LOW  
**Impact**: ~70 issues fixed

#### 1.1 Remove Unused Imports & Variables (50+ issues)

**What `npm run lint` auto-fixes:**
- ✅ Unused imports (Badge, Select, Clock, etc.) - **AUTO-REMOVED**
- ✅ Unescaped entities (&apos;, &quot;) - **AUTO-FIXED**

**What requires manual removal:**
- ⚠️ Unused variables (files, planInfo, canEnhance, etc.) - ~37 instances
- ⚠️ Unused function declarations (handleStop, etc.) - ~34 instances

**Strategy**: Run `npm run lint` first to auto-fix what it can, then manually review remaining unused vars (they may be intentional for future features).

**Files affected:** All feature components

#### 1.2 Fix React JSX Scope Errors (7 issues)
**Issue**: ESLint's `react/react-in-jsx-scope` rule is enabled but JSX transform is already set to `react-jsx`.

**Root cause**: `.eslintrc.json` doesn't know about the new JSX transform.

**Fix**: Update `.eslintrc.json` to disable the outdated rule:
```json
"rules": {
  "react/react-in-jsx-scope": "off",  // Add this line
  // ... existing rules
}
```

**Files affected**: 
- `shared/ui/aspect-ratio.tsx`
- `shared/ui/collapsible.tsx`
- `shared/ui/skeleton.tsx`
- `shared/ui/sonner.tsx`

**Why**: tsconfig.json already has `"jsx": "react-jsx"` which doesn't require React imports.

#### 1.3 Handle CommonJS Requires (7 issues)
File: `src/lib/utils.js`

**Issue**: This is an Electron **main process** file that MUST use CommonJS (not ES6 modules).

**Fix Option 1** (Recommended): Disable ESLint for this file
Add to `.eslintignore`:
```
src/lib/utils.js
```

**Fix Option 2**: Suppress the rule in the file
Add at top of `utils.js`:
```javascript
/* eslint-disable @typescript-eslint/no-var-requires */
```

**Why**: Electron main process runs in Node.js and requires CommonJS. Converting to ES6 would break it.

#### 1.4 Fix Unescaped Entities (6 issues)
Replace quotes/apostrophes with HTML entities:
- `Don't` → `Don&apos;t`
- `"text"` → `&quot;text&quot;`

---

### Phase 2: Type Safety (84 `any` types) - 60 min

**Priority**: MEDIUM  
**Risk**: MEDIUM (may require testing)  
**Impact**: Better type safety

#### Strategy: Replace by category

**2.1 API/HTTP layer (30 instances)**
File: `src/api.ts`, `src/http.ts`

Pattern:
```typescript
// Before
export async function someAPI(data: any): Promise<any>

// After
export async function someAPI(data: RequestBody): Promise<ResponseData>
```

**Action**:
- Define proper types in `src/types/api.ts`
- Replace `any` with specific interfaces
- Use generics where appropriate

**2.2 Event handlers (20 instances)**
```typescript
// Before
const handleClick = (e: any) => {}

// After
const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {}
```

**2.3 Electron IPC (20 instances)**
File: `src/types/electron.d.ts`

Pattern:
```typescript
// Before
invoke(channel: string, ...args: any[]): Promise<any>

// After
invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>
```

**2.4 Component props (14 instances)**
```typescript
// Before
function Component({ config }: { config: any })

// After
function Component({ config }: { config: ConfigType })
```

---

### Phase 3: Empty Blocks (13 issues) - 30 min

**Priority**: MEDIUM  
**Risk**: LOW  
**Impact**: Better error handling

#### Pattern: Add proper handlers or comments

```typescript
// Before
try {
  doSomething()
} catch (e) {}

// After - Option 1: Log error
try {
  doSomething()
} catch (e) {
  console.error('Failed to do something:', e)
}

// After - Option 2: Intentional ignore
try {
  doSomething()
} catch (e) {
  // Intentionally ignore - operation is optional
}
```

**Files affected:**
- `App.tsx` (2 instances)
- `EnhanceTab.tsx` (6 instances)

**Decision needed**: Should empty catches:
1. Log to console?
2. Report to error tracking?
3. Show user notification?
4. Be intentionally silent (add comment)?

---

### Phase 4: React Hook Dependencies (22 warnings) - 45 min

**Priority**: MEDIUM  
**Risk**: HIGH (may change behavior)  
**Impact**: Fix stale closure bugs

#### Common patterns:

**4.1 Missing function dependency**
```typescript
// Before
useEffect(() => {
  fetchFiles()
}, [selectedFile])  // Warning: missing 'fetchFiles'

// After - Option 1: Add to deps
useEffect(() => {
  fetchFiles()
}, [selectedFile, fetchFiles])

// After - Option 2: Use useCallback
const fetchFiles = useCallback(() => {
  // ... 
}, [/* deps */])
```

**4.2 Complex expressions in deps**
```typescript
// Before
useEffect(() => {
  // ...
}, [selectedFile?.id])  // Warning: complex expression

// After
const fileId = selectedFile?.id
useEffect(() => {
  // ...
}, [fileId])
```

**Files affected:**
- `App.tsx` (3 instances)
- `SanitiseTab.tsx` (9 instances)
- `ExportTab.tsx` (1 instance)
- Hooks files (9 instances)

**Caution**: Review each carefully - may cause infinite loops if wrong!

---

### Phase 5: Use-Before-Define (4 issues) - 15 min

**Priority**: LOW  
**Risk**: LOW  
**Impact**: Cleaner code structure

**Files:**
- `shared/ui/chart.tsx`: Move `ChartStyle` definition before use
- `shared/ui/form.tsx`: Move `FormItemContext` definition before use
- Feature files: Reorder function declarations

**Fix**: Move declarations/definitions above their usage

---

## Execution Order (Recommended)

### Session 1: Safe Automated Fixes (45 min)
1. ✅ Update `.eslintrc.json` to disable `react/react-in-jsx-scope`
2. ✅ Add `src/lib/utils.js` to `.eslintignore`
3. ✅ Run `npm run lint` (auto-fixes unused vars, entities)
4. ✅ Fix use-before-define issues (move declarations)
5. ✅ Verify: `npm run lint` should show ~160 issues remaining

**After Session 1**: ~70 issues fixed, 160 remaining

### Session 2: Type Safety (60-90 min)
1. ✅ Define types in `src/types/api.ts`
2. ✅ Fix HTTP/API layer `any` types
3. ✅ Fix event handler `any` types
4. ✅ Fix Electron IPC `any` types
5. ✅ Fix component props `any` types

**After Session 2**: ~30 issues remaining

### Session 3: Error Handling & Hooks (45 min)
1. ✅ Fix empty catch blocks
2. ✅ Fix React Hook dependencies (carefully!)
3. ✅ Test affected components

**After Session 3**: 0 issues remaining ✅

---

## Pre-Execution Checklist

- [ ] Commit current state (`git commit -m "Pre-cleanup checkpoint"`)
- [ ] Ensure app is working (manual test)
- [ ] Run `npm run type-check` to see current type errors
- [ ] Note any known issues that might surface

---

## Post-Execution Validation

After each session:
```bash
# 1. Check lint status
npm run lint

# 2. Check types
npm run type-check

# 3. Test build
npm run build-renderer

# 4. Manual smoke test
npm run dev  # Test all tabs
```

---

## Risk Mitigation

### High-Risk Changes
- React Hook dependency fixes (Phase 4)
- Type changes in API layer (Phase 2.1)

### Safety Measures
1. **Git commits after each phase**
2. **Test after each file edit** (for Phase 4)
3. **Keep backup**: `git stash` before starting
4. **Incremental approach**: One file at a time for risky changes

---

## Expected Outcome

### Before
```
✖ 230 problems (208 errors, 22 warnings)
```

### After
```
✔ 0 problems
```

**Bonus benefits:**
- Better type safety
- No stale closures
- Cleaner code
- Easier maintenance
- Better IDE autocomplete

---

## Files Requiring Most Attention

1. **App.tsx** (1,040 lines, 24 issues)
2. **SettingsTab.tsx** (1,275 lines, 50+ issues)
3. **EnhanceTab.tsx** (577 lines, 20 issues)
4. **SanitiseTab.tsx** (588 lines, 20 issues)
5. **src/api.ts** (10 `any` types)
6. **src/types/electron.d.ts** (20 `any` types)

---

## Ready to Execute?

**Recommendation**: Start with Session 1 (safe automated fixes) to get quick wins and build confidence.

Run this to start:
```bash
cd /Users/tiurihartog/Hackerman/THE\ APP\ V2.0/frontend
git add -A && git commit -m "Checkpoint before frontend cleanup"
npm run lint:fix  # or `npm run lint` if :fix doesn't exist
```

---

**Created by**: Warp AI Agent Mode  
**Status**: ✅ Plan ready for execution
