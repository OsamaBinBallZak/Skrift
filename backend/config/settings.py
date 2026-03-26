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
        "parakeet_model": "mlx-community/parakeet-tdt-0.6b-v3",
        # Audio preprocessing (applied before transcription)
        "noise_reduction": -20,  # afftdn noise floor in dB (-10 = aggressive, -30 = gentle, 0 = off)
        "highpass_freq": 80,     # High-pass filter cutoff in Hz (removes rumble; 0 = off)
    },

    # Audio processing
    "audio": {
        "supported_input_formats": [".m4a", ".wav", ".mp3", ".mp4", ".mov", ".md"],
        "sample_rate": 16000,
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
            "top_p": 0.95,
            "top_k": 50,
            "repetition_penalty": 1.0,
            "timeout_seconds": 45,
            # Advanced controls
            "use_chat_template": True,
            "dynamic_tokens": True,
            "dynamic_ratio": 1.2,
            "min_tokens": 256
        },
        # Persisted text prompts for enhancement actions
        "prompts": {
            "copy_edit": "You are editing text into clean, polished written form. The text may be a transcribed voice memo or a written note. The author may mix English and Dutch — preserve their language choices, do not translate.\n\nRules:\n- Remove filler words (um, uh, like, you know, so basically, I mean) if present.\n- Break run-on sentences into clear, shorter ones.\n- Organize loose or stream-of-consciousness text into logical paragraphs.\n- Fix grammar and spelling.\n- Preserve any occurrences of [[like this]] exactly as-is. Do not remove the double brackets or alter the inner text.\n- Preserve the author's natural tone and all substantive content.\n- Do not add explanations, headings, or preambles.\n- Output only the edited text, nothing else.",
            "summary": "Summarize this text in 1-3 concise sentences (30-60 words). Capture the key insight or realization, plus any concrete action item or decision. If the text covers multiple distinct topics, mention each briefly. Write in third person. Output only the summary, nothing else.",
            "importance": "Rate the personal significance of this text on a scale from 0.0 to 1.0.\nHigh scores (0.7-1.0): life decisions, personal realizations, meaningful experiences, important plans, relationship insights, identity reflections.\nMedium scores (0.3-0.7): useful ideas, project updates, learning notes, opinions.\nLow scores (0.0-0.3): routine tasks, weather, small talk, logistics.\nReturn ONLY a single number between 0.0 and 1.0, nothing else.",
            "title": "Analyze the following transcript. \nIf the speaker explicitly mentions a title or name for this content, extract and return that exact title. \nIf no title is mentioned, generate an appropriate, descriptive title (10 - 30 words) that captures the main topic. \nReturn ONLY the title itself, nothing else."
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
            "max_new": 5,
            "selection_criteria": ""  # Optional free-text hint injected into the tag prompt
        }
    },
    
    # Export options
    "export": {
        "default_format": "markdown",
        "supported_formats": ["markdown", "docx", "txt"],
        "include_metadata": True,
        "author": "",        # Written to YAML frontmatter 'author:' field
        # Obsidian integration: where compiled notes and audio are copied to inside the vault
        "note_folder": "",         # e.g. /path/to/ObsidianVault/Notes
        "audio_folder": "",        # e.g. /path/to/ObsidianVault/Audio
        "attachments_folder": "",  # e.g. /path/to/ObsidianVault/Attachments (defaults to note_folder if empty)
    },
    
    # System monitoring
    "system": {
        "monitor_resources": True,
        "log_processing_time": True,
        "max_concurrent_files": 1,  # Sequential processing only
    },

    # Server
    "server": {
        "port": 8000,
        "cors_origins": [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "file://",
            "capacitor://localhost",
            "ionic://localhost",
        ],
    },

    # Batch processing
    "batch": {
        "max_consecutive_failures": 3,     # Abort batch after this many back-to-back failures
    },
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


def get_dependency_paths() -> dict:
    """Return core dependency locations derived from dependencies_folder.

    Keys:
      - parakeet: Path to models/parakeet (HuggingFace cache for parakeet-mlx)
      - mlx_models: Path to models/mlx
      - mlx_venv: Path to mlx-env
    """
    dep_base = Path(settings.get('dependencies_folder', str(BACKEND_DIR.parent / 'Skrift_dependencies')))
    return {
        'parakeet': dep_base / 'models' / 'parakeet',
        'mlx_models': dep_base / 'models' / 'mlx',
        'mlx_venv': dep_base / 'mlx-env',
    }


def get_mlx_models_path() -> Path:
    """Preferred MLX models directory resolved from dependencies_folder."""
    paths = get_dependency_paths()
    path = paths['mlx_models']
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_mlx_venv_path() -> Path:
    """Preferred MLX virtualenv path resolved from dependencies_folder."""
    paths = get_dependency_paths()
    return paths['mlx_venv']

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

def get_file_output_folder(filename: str, file_id: str = None) -> Path:
    """Get output folder for a specific file.

    When file_id is provided (new uploads) the folder is named
    ``<file_id>_<stem>`` so two files with the same filename never collide.
    Legacy folders created without a file_id continue to use just ``<stem>``.
    """
    base_name = Path(filename).stem
    folder_name = f"{file_id}_{base_name}" if file_id else base_name
    file_folder = get_output_folder() / folder_name
    file_folder.mkdir(parents=True, exist_ok=True)
    return file_folder

def get_parakeet_cache_path() -> Path:
    """HuggingFace cache directory for parakeet-mlx model weights."""
    paths = get_dependency_paths()
    path = paths['parakeet']
    path.mkdir(parents=True, exist_ok=True)
    return path
