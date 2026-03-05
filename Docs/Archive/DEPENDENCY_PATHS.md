# Dependency Path Configuration

## Overview

**Skrift uses explicit, settings-based absolute paths for all external dependencies. No symlinks required.**

This document describes how path resolution works, why we avoid symlinks, and how to configure paths for both development and distribution.

## Key Decision: Settings-Based Paths vs Symlinks

We use explicit path settings rather than symlinks because:

- **Reliability**: Symlinks break under code signing, notarization, sandboxing, app updates, and ASAR packaging
- **Clarity**: Explicit settings make environments reproducible and debuggable  
- **Portability**: Avoids platform-specific link semantics
- **Updatability**: Paths can be changed at runtime without rebundling

## Current State

The backend codebase already has two path resolution approaches:

1. **Settings-based (ACTIVE)**: `get_dependency_paths()` - Used by transcription and enhancement services
2. **Hardcoded symlinks (DEPRECATED)**: `get_whisper_path()` - Legacy functions

**Active services already use settings-based paths!** Only the old deprecated functions point to symlinks.

## Dependency Locations

### All Dependencies (14GB Total)
Located at: `/Users/tiurihartog/Hackerman/Skrift_dependencies/`

```
Skrift_dependencies/
├── whisper/           (5.0GB) - Whisper.cpp binaries
├── models/
│   └── mlx/          (8.0GB) - MLX AI models  
└── mlx-env/          (321MB) - Python virtual environment
└── mlx-env-backup/   (314MB) - Backup (not needed)
```

### Legacy Backend Resources Layout (no longer used by default)

> Historical note: Early iterations used symlinks under `backend/resources/` pointing to the large external dependencies folder.
> The current implementation **does not require or use these symlinks**; all active code resolves directly via `dependencies_folder`.

```
backend/resources/
├── whisper/           # (Legacy) symlink target to external whisper folder
└── models/
    └── mlx/          # (Legacy) symlink target to external MLX models folder
```

### Settings Configuration

### Current Settings Schema

The backend uses the `dependencies_folder` setting in `backend/config/user_settings.json`:

```json
{
  "dependencies_folder": "/Users/tiurihartog/Hackerman/Skrift_dependencies"
}
```

**Note**: At the time of writing, the `enhancement.mlx.models_dir` setting is effectively decorative — the code always derives the models directory from `dependencies_folder` via `get_mlx_models_path()`. Only `enhancement.mlx.model_path` (the specific model selection inside that directory) is used for actual model loading. If you later change the code to honor `models_dir` directly, update this note accordingly.

### Environment Detection

The code automatically resolves paths based on this setting:

```python
def get_dependency_paths() -> dict:
    dep_base = Path(settings.get('dependencies_folder'))
    
    return {
        'whisper': dep_base / 'whisper' / 'Transcription',
        'mlx_models': dep_base / 'models' / 'mlx', 
        'mlx_venv': dep_base / 'mlx-env'
    }
```

### Services Using These Paths

- **Transcription**: `get_whisper_path_dynamic()` → `get_dependency_paths()['whisper']`
- **Enhancement**: **Both path systems work**:
  - `get_mlx_models_path()` → `get_dependency_paths()['mlx_models']` (for model list/upload)
  - `enhancement.mlx.model_path` setting (for actual model loading)
- **MLX Environment**: `get_mlx_venv_path()` → `get_dependency_paths()['mlx_venv']`

## For Development

### Current Working Setup

The backend settings should point to your external dependencies:

```json
// backend/config/user_settings.json
{
  "dependencies_folder": "/Users/tiurihartog/Hackerman/Skrift_dependencies"
}
```

### Verifying Path Resolution

1. **Check backend logs** for successful path resolution:
```bash
tail -f backend/backend.log | grep -E "(Transcription|Enhancement|MLX)"
```

2. **Manually verify paths exist**:
```bash
# Whisper binaries
ls -la /Users/tiurihartog/Hackerman/Skrift_dependencies/whisper/Transcription/

# MLX models  
ls -la /Users/tiurihartog/Hackerman/Skrift_dependencies/models/mlx/

# MLX environment
ls -la /Users/tiurihartog/Hackerman/Skrift_dependencies/mlx-env/bin/python
```

## For Distribution

### Future Packaged Default

When distributing, the app will automatically set:

```json
{
  "dependencies_folder": "~/Library/Application Support/Skrift"
}
```

and lazy-download the 13.3GB of dependencies on first run.

### Environment Detection Logic

The backend path resolution works for both environments:

- **Development**: Uses user-configured path (`/Users/tiurihartog/Hackerman/Skrift_dependencies`)
- **Packaged**: Uses userData path (`~/Library/Application Support/Skrift`)

No code changes needed - just different settings values.

## Migration: Removing Legacy Symlink Functions

### Deprecated Functions

These functions hardcode symlink paths and should be removed:

- `get_whisper_path()` - Line 196 in settings.py
- `get_transcription_modules_path()` - Line 192 in settings.py  
- `get_solo_transcription_path()` - Line 200 in settings.py
- `get_conversation_transcription_path()` - Line 204 in settings.py

**Note**: Only `get_whisper_path_dynamic()` and `get_dependency_paths()` are used by active services.

### Migration Steps

1. **Phase 1 (Safe)**: Add deprecation comments to legacy functions
2. **Phase 2**: Update any remaining users to call dynamic functions
3. **Phase 3**: Remove deprecated functions and symlink requirements

## Validation Checklist

### Core Functionality

- [ ] Transcription service finds whisper binaries via settings path
- [ ] Enhancement service finds MLX models via settings path  
- [ ] MLX environment activation works with settings path
- [ ] No service attempts to access hardcoded symlink paths

### Environment Tests

- [ ] **Development**: Custom path in user_settings.json works
- [ ] **Distribution**: userData path will work (future test)
- [ ] **Path changes**: Updating settings resolves to new location

### Error Handling

- [ ] Missing dependencies folder shows clear error message
- [ ] Invalid permissions on dependency path shows helpful guidance
- [ ] Individual dependency (whisper/mlx/env) missing shows targeted error

## Troubleshooting

### "Path not found" errors

1. Check `backend/config/user_settings.json` for `dependencies_folder`
2. Verify the folder exists and is accessible
3. Check backend.log for path resolution messages

### "Whisper binary not found"

1. Verify: `<dependencies_folder>/whisper/Transcription/` exists
2. Check transcribe.sh script is executable
3. Look for Metal-Version-float32-coreml subdirectory

### "MLX models not detected"

1. Verify: `<dependencies_folder>/models/mlx/` contains model files
2. Check backend.log for model detection during enhancement
3. Confirm MLX environment is activated properly

### Current Working Configuration

```json
// backend/config/user_settings.json - WORKING
{
  "dependencies_folder": "/Users/tiurihartog/Hackerman/Skrift_dependencies"
}
```

## Integration Points

### Files That Handle Path Resolution

- `backend/config/settings.py` - Core path resolution logic
- `backend/services/transcription.py` - Uses `get_whisper_path_dynamic()`
- `backend/services/enhancement.py` - Uses MLX path functions
- `backend/services/mlx_runner.py` - Implicit MLX model loading

### Files That Reference Old Symlink Paths (Legacy)

- Only the deprecated functions in `settings.py` (mentioned above)
- No active services use these paths

## Implementation Notes

- The **settings-based approach is already implemented and working**
- **No changes needed** for current development to work
- **Symlinks are optional** - currently they don't even exist
- The system gracefully works with absolute paths

This means the distribution plan's "environment-based path switching" is **already implemented** and just needs the download manager component to be added.