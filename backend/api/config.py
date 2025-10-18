"""
Configuration management API endpoints
Handles settings and preferences management
"""

from fastapi import APIRouter, HTTPException
from models import ConfigUpdate, ConfigResponse
from config.settings import settings
from pathlib import Path
import json
import os

router = APIRouter()

@router.get("/")
async def get_all_config():
    """
    Get all configuration settings
    Returns complete configuration object
    """
    try:
        config = settings.get_all()
        return ConfigResponse(
            success=True,
            message="Configuration retrieved successfully",
            config=config
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get configuration: {str(e)}")


@router.post("/update")
async def update_config(config_update: ConfigUpdate):
    """
    Update a configuration value using dot notation
    Body: {"key": "transcription.solo_model", "value": "base.en"}
    """
    try:
        # Validate key exists in current config (optional - you might want to allow new keys)
        current_value = settings.get(config_update.key)
        
        # Update the value
        settings.set(config_update.key, config_update.value)
        
        return ConfigResponse(
            success=True,
            message=f"Successfully updated {config_update.key}",
            config={config_update.key: config_update.value}
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update configuration: {str(e)}")

@router.post("/reset")
async def reset_config():
    """
    Reset configuration to default values
    This will overwrite all user settings
    """
    try:
        # Clear the settings file to force reload of defaults
        if settings.settings_file.exists():
            settings.settings_file.unlink()
        
        # Reload settings (will use defaults)
        settings.load_settings()
        
        return ConfigResponse(
            success=True,
            message="Configuration reset to defaults",
            config=settings.get_all()
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reset configuration: {str(e)}")

@router.get("/folders/input")
async def get_input_folder():
    """
    Get current input folder path
    """
    try:
        from config.settings import get_input_folder
        folder = get_input_folder()
        
        return {
            "path": str(folder),
            "exists": folder.exists(),
            "writable": folder.exists() and os.access(folder, os.W_OK)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get input folder: {str(e)}")

@router.get("/folders/output")
async def get_output_folder():
    """
    Get current output folder path
    """
    try:
        from config.settings import get_output_folder
        folder = get_output_folder()
        
        return {
            "path": str(folder),
            "exists": folder.exists(),
            "writable": folder.exists() and os.access(folder, os.W_OK)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get output folder: {str(e)}")

@router.post("/folders/input")
async def set_input_folder(folder_path: dict):
    """
    Set input folder path
    Body: {"path": "/path/to/input/folder"}
    """
    try:
        import os
        from pathlib import Path
        
        new_path = folder_path.get("path")
        if not new_path:
            raise HTTPException(status_code=400, detail="Path is required")
        
        # Validate path
        path_obj = Path(new_path)
        if not path_obj.exists():
            # Try to create the folder
            try:
                path_obj.mkdir(parents=True, exist_ok=True)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Cannot create folder: {str(e)}")
        
        # Update settings
        settings.set("input_folder", str(path_obj))
        
        return ConfigResponse(
            success=True,
            message=f"Input folder updated to {new_path}",
            config={"input_folder": str(path_obj)}
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to set input folder: {str(e)}")

@router.post("/folders/output")
async def set_output_folder(folder_path: dict):
    """
    Set output folder path
    Body: {"path": "/path/to/output/folder"}
    """
    try:
        import os
        from pathlib import Path
        
        new_path = folder_path.get("path")
        if not new_path:
            raise HTTPException(status_code=400, detail="Path is required")
        
        # Validate path
        path_obj = Path(new_path)
        if not path_obj.exists():
            # Try to create the folder
            try:
                path_obj.mkdir(parents=True, exist_ok=True)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Cannot create folder: {str(e)}")
        
        # Update settings
        settings.set("output_folder", str(path_obj))
        
        return ConfigResponse(
            success=True,
            message=f"Output folder updated to {new_path}",
            config={"output_folder": str(path_obj)}
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to set output folder: {str(e)}")

@router.get("/sanitisation")
async def get_sanitisation_settings():
    try:
        return settings.get("sanitisation")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get sanitisation settings: {str(e)}")

@router.post("/sanitisation")
async def update_sanitisation_settings(payload: dict):
    try:
        # Merge shallowly into existing structure
        current = settings.get("sanitisation") or {}
        def merge(a, b):
            for k, v in b.items():
                if isinstance(v, dict) and isinstance(a.get(k), dict):
                    merge(a[k], v)
                else:
                    a[k] = v
            return a
        updated = merge(current, payload)
        settings.set("sanitisation", updated)
        return { "success": True, "message": "Sanitisation settings updated", "sanitisation": updated }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update sanitisation settings: {str(e)}")

@router.get("/names")
async def get_names_mapping():
    """
    Get the names mapping used by sanitise.
    Simplified schema:
    { "people": [ { "canonical": "[[Name]]", "aliases": [..] } ] }
    """
    try:
        names_path = Path(__file__).parent.parent / "config" / "names.json"
        if not names_path.exists():
            return { "people": [] }
        with open(names_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        # Normalise to simplified shape
        if isinstance(data, dict):
            if 'people' in data and isinstance(data['people'], list):
                return { 'people': data['people'] }
            if 'entries' in data and isinstance(data['entries'], list):
                return { 'people': data['entries'] }
        if isinstance(data, list):
            return { 'people': data }
        # Fallback
        return { 'people': [] }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load names mapping: {str(e)}")

@router.post("/names")
async def update_names_mapping(payload: dict):
    """
    Update the names mapping. Expects simplified schema { "people": [ { "canonical", "aliases" } ] }.
    The server sorts people alphabetically by canonical (ignoring brackets) and ensures canonical is [[Name]].
    """
    try:
        people = payload.get('people', []) or []

        # Normalise and sort
        normalised_people = []
        for p in people:
            canonical = str(p.get('canonical', '')).strip()
            if not canonical:
                # Skip entries without canonical
                continue
            if not (canonical.startswith('[[') and canonical.endswith(']]')):
                canonical = f"[[{canonical}]]"
            aliases = p.get('aliases', []) or []
            aliases = [str(a).strip() for a in aliases if str(a).strip()]
            normalised_people.append({
                'canonical': canonical,
                'aliases': aliases,
                'short': (str(p.get('short', '')).strip() or None)
            })
        def sort_key(entry):
            c = entry['canonical']
            core = c[2:-2] if c.startswith('[[') and c.endswith(']]') else c
            return core.lower()
        normalised_people.sort(key=sort_key)

        data = { 'people': normalised_people }

        names_path = Path(__file__).parent.parent / "config" / "names.json"
        names_path.parent.mkdir(parents=True, exist_ok=True)
        with open(names_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return { 'success': True, 'message': 'Names mapping saved', 'data': data }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save names mapping: {str(e)}")

@router.get("/transcription/modules")
async def get_transcription_modules():
    """
    Get information about available transcription modules
    """
    try:
        from config.settings import get_solo_transcription_path, get_conversation_transcription_path
        
        solo_path = get_solo_transcription_path()
        conv_path = get_conversation_transcription_path()
        
        modules = {
            "solo": {
                "available": solo_path.exists(),
                "path": str(solo_path),
                "components": {
                    "transcribe_script": (solo_path / "transcribe.sh").exists(),
                    "whisper_cpp": (solo_path / "whisper.cpp").exists(),
                    "rnnoise_models": (solo_path / "rnnoise-models").exists()
                }
            },
            "conversation": {
                "available": conv_path.exists(),
                "path": str(conv_path),
                "components": {
                    "transcribe_script": (conv_path / "transcribe.sh").exists(),
                    "python_script": (conv_path / "transcribe_conversation.py").exists(),
                    "whisper_cpp": (conv_path / "whisper.cpp").exists(),
                    "sherpa_onnx": (conv_path / "sherpa-onnx").exists(),
                    "models": (conv_path / "models").exists()
                }
            }
        }
        
        return {
            "modules": modules,
            "settings": {
                "solo_model": settings.get("transcription.solo_model"),
                "conversation_model": settings.get("transcription.conversation_model"),
                "use_metal_acceleration": settings.get("transcription.use_metal_acceleration"),
                "use_coreml": settings.get("transcription.use_coreml"),
                "use_vad": settings.get("transcription.use_vad")
            }
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get transcription modules: {str(e)}")

@router.get("/{key}")
async def get_config_value(key: str):
    """
    Get a specific configuration value using dot notation
    Example: GET /api/config/transcription.solo_model
    """
    try:
        value = settings.get(key)
        if value is None:
            raise HTTPException(status_code=404, detail=f"Configuration key '{key}' not found")
        
        return {
            "key": key,
            "value": value
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get configuration value: {str(e)}")
