"""
Configuration settings for Audio Transcription Pipeline
Manages paths, processing options, and system settings
"""

import os
from pathlib import Path
from typing import Dict, Any

# Base paths
HOME_DIR = Path.home()
BACKEND_DIR = Path(__file__).parent.parent

# Default folder paths (configurable via frontend settings)
DEFAULT_SETTINGS = {
    "input_folder": str(HOME_DIR / "Documents" / "Voice Transcription Pipeline Audio Input"),
    "output_folder": str(HOME_DIR / "Documents" / "Voice Transcription Pipeline Audio Output"),
    
    # Processing settings
    "transcription": {
        "solo_model": "base.en",  # Whisper model for solo transcription
        "conversation_model": "base.en",  # Whisper model for conversations
        "use_metal_acceleration": True,
        "use_coreml": True,
        "use_vad": True,  # Voice Activity Detection
        "apply_audio_preprocessing": True,  # RNNoise + loudness normalization
    },
    
    # Audio processing
    "audio": {
        "supported_input_formats": [".m4a", ".wav", ".mp3", ".mp4", ".mov"],
        "whisper_format": ".wav",
        "sample_rate": 16000,
        "apply_rnnoise": True,
        "loudness_normalization": True,
    },
    
    # Text processing - Sanitisation settings (Name linking only)
    "sanitisation": {
        # Alias matching behavior
        "whole_word": True,

        # Name linking
        "linking": {
            "mode": "first",  # "first" | "all"
            "avoid_inside_links": True,
            "preserve_possessive": True,
            "format": {
                "style": "wiki",        # "wiki" | "wiki_with_path"
                "base_path": "People"   # used when style == wiki_with_path
            },
            "alias_priority": "longest"  # "longest" | "shortest"
        }
    },
    
    # AI Enhancement (MLX local)
    "enhancement": {
        "enabled": True,
        "mlx": {
            "models_dir": str(BACKEND_DIR / "resources" / "models" / "mlx"),
            "model_path": None,  # e.g., /path/to/model.mlx or safetensors supported by mlx-lm
            "max_tokens": 512,
            "temperature": 0.7,
            "timeout_seconds": 45,
            # Advanced controls
            "use_chat_template": True,
            "dynamic_tokens": True,
            "dynamic_ratio": 1.2,
            "min_tokens": 256
        },
        # Persisted text prompts for enhancement actions
        "prompts": {
            "copy_edit": "You are an expert copy editor. Task: rewrite the text to fix spelling, grammar, and readability while strictly preserving meaning and technical detail.\n\nRules:\n- Preserve any occurrences of [[like this]] exactly as-is. Do not remove the double brackets or alter the inner text.\n- Do not add explanations, headings, or preambles.\n- Do not summarize; keep roughly the same length unless removing filler or repetition.\n- Use clear, natural English.\n- Output only the corrected text, nothing else.",
            "summary": "Return exactly one sentence (20-30 words) summarizing the text."
        },
        # Read-only integration with Obsidian vault for tag whitelist
        "obsidian": {
            # User-provided path to an Obsidian vault (read-only). Leave empty to disable.
            "vault_path": "",
            # Where the backend stores the cached tag whitelist inside the app (not in the vault)
            "tags_whitelist_path": str(BACKEND_DIR / "resources" / "tags" / "tags_whitelist.json"),
            # Max tags to select for transcripts (legacy UI cap)
            "tags_cap": 10
        },
        # Tag generation knobs (whitelist-based)
        "tags": {
            "max_old": 10,
            "max_new": 5
        }
    },
    
    # Export options
    "export": {
        "default_format": "markdown",
        "supported_formats": ["markdown", "docx", "txt"],
        "include_metadata": True,
        "include_timestamps": False,  # For future implementation
    },
    
    # System monitoring
    "system": {
        "monitor_resources": True,
        "log_processing_time": True,
        "max_concurrent_files": 1,  # Sequential processing only
    }
}

class Settings:
    """Settings manager with file persistence"""
    
    def __init__(self):
        self.settings_file = BACKEND_DIR / "config" / "user_settings.json"
        self._settings = DEFAULT_SETTINGS.copy()
        self.load_settings()
    
    def load_settings(self):
        """Load settings from file if it exists"""
        if self.settings_file.exists():
            import json
            try:
                with open(self.settings_file, 'r') as f:
                    user_settings = json.load(f)
                    self._update_nested_dict(self._settings, user_settings)
            except Exception as e:
                print(f"Warning: Could not load settings file: {e}")
                print("Using default settings")
    
    def save_settings(self):
        """Save current settings to file"""
        import json
        self.settings_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.settings_file, 'w') as f:
            json.dump(self._settings, f, indent=2)
    
    def get(self, key: str, default=None):
        """Get setting value using dot notation (e.g., 'transcription.solo_model')"""
        keys = key.split('.')
        value = self._settings
        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default
        return value
    
    def set(self, key: str, value: Any):
        """Set setting value using dot notation"""
        keys = key.split('.')
        setting = self._settings
        for k in keys[:-1]:
            if k not in setting:
                setting[k] = {}
            setting = setting[k]
        setting[keys[-1]] = value
        self.save_settings()
    
    def get_all(self) -> Dict[str, Any]:
        """Get all settings"""
        return self._settings.copy()
    
    def _update_nested_dict(self, base_dict: dict, update_dict: dict):
        """Recursively update nested dictionary"""
        for key, value in update_dict.items():
            if key in base_dict and isinstance(base_dict[key], dict) and isinstance(value, dict):
                self._update_nested_dict(base_dict[key], value)
            else:
                base_dict[key] = value

# Global settings instance
settings = Settings()

def get_input_folder() -> Path:
    """Get configured input folder path"""
    folder = Path(settings.get("input_folder"))
    folder.mkdir(parents=True, exist_ok=True)
    return folder

def get_output_folder() -> Path:
    """Get configured output folder path"""
    folder = Path(settings.get("output_folder"))
    folder.mkdir(parents=True, exist_ok=True)
    return folder

def get_file_output_folder(filename: str) -> Path:
    """Get output folder for a specific file"""
    base_name = Path(filename).stem
    file_folder = get_output_folder() / base_name
    file_folder.mkdir(parents=True, exist_ok=True)
    return file_folder

def get_transcription_modules_path() -> Path:
    """Get path to transcription modules (deprecated, use get_whisper_path)"""
    return BACKEND_DIR / "resources" / "whisper" / "Transcription"

def get_whisper_path() -> Path:
    """Get path to whisper resources"""
    return BACKEND_DIR / "resources" / "whisper" / "Transcription"

def get_solo_transcription_path() -> Path:
    """Get path to solo transcription module"""
    return get_whisper_path() / "Metal-Version-float32-coreml"

def get_conversation_transcription_path() -> Path:
    """Get path to conversation transcription module"""
    return get_transcription_modules_path() / "Metal-Version-float32-coreml-conversations"
