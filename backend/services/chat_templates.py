"""
Built-in chat templates for known model families that ship without one.

The runner checks model_name against KNOWN_TEMPLATES (substring match).
User overrides in settings always take priority over these defaults.

Note: Gemma 4 E4B ships with its own tokenizer chat template, so no
built-in override is needed. This module is kept for future model support.
"""

import logging

logger = logging.getLogger(__name__)

# Map of model name substrings to their built-in templates.
# Checked case-insensitively against the model directory basename.
# Gemma 4 uses its own tokenizer template — no entry needed.
KNOWN_TEMPLATES: dict[str, str] = {}


def get_builtin_template(model_path_str: str) -> str | None:
    """Return a built-in chat template if the model matches a known family, else None."""
    from pathlib import Path
    model_name = Path(model_path_str).name.lower()
    for key, template in KNOWN_TEMPLATES.items():
        if key in model_name:
            logger.info(f"Using built-in chat template for model family '{key}' (model: {model_name})")
            return template
    return None
