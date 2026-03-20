"""
Apple Notes Markdown importer service.

Apple Notes exports notes as a folder containing:
  <Title>.md          — the note content in Markdown
  Attachments/        — any attached images or files

Attachments are renamed to "<Note Title> - <index>.<ext>" so they get clean,
collision-resistant names in the Obsidian vault.
"""

import re
from pathlib import Path
from urllib.parse import quote, unquote


def parse_markdown_note(md_path: Path) -> dict:
    """
    Parse an Apple Notes-exported .md file.

    Renames attachments to "<Note Title> - <index>.<ext>", updates the
    markdown content to reference the new names, and re-saves the file.

    Returns:
        {
            'title': str,
            'text': str,          # markdown with updated attachment refs
            'attachments': [
                {'filename': str, 'path': str, 'mime': str}
            ]
        }
    """
    content = md_path.read_text(encoding="utf-8", errors="replace")

    # Extract title from first # heading, fall back to filename stem
    title = md_path.stem.rstrip(".")
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            title = stripped[2:].strip().rstrip(".")
            break

    # Make a filename-safe version of the title
    safe_title = re.sub(r'[\\/:*?"<>|]', "-", title).strip()
    safe_title = re.sub(r"\s+", " ", safe_title).strip("-").strip()
    if not safe_title:
        safe_title = "note"

    # Discover, rename, and update refs for each attachment
    attachments: list[dict] = []
    attachments_dir = md_path.parent / "Attachments"
    if attachments_dir.is_dir():
        files = sorted(f for f in attachments_dir.iterdir() if f.is_file() and not f.name.startswith("."))
        for index, f in enumerate(files, start=1):
            ext = f.suffix.lower()
            new_name = f"{safe_title} - {index}{ext}"
            new_path = f.parent / new_name

            # Rename the file on disk
            try:
                f.rename(new_path)
            except Exception:
                new_path = f  # fallback: keep original
                new_name = f.name

            # Update both URL-encoded and plain refs in the markdown
            for old_ref in (f"Attachments/{f.name}", f"Attachments/{quote(f.name)}"):
                content = content.replace(f"({old_ref})", f"(Attachments/{new_name})")

            attachments.append({"filename": new_name, "path": str(new_path), "mime": _guess_mime(ext)})

    # Re-save the .md with updated attachment references
    md_path.write_text(content, encoding="utf-8")

    return {
        "title": title,
        "text": content,
        "attachments": attachments,
    }


def _guess_mime(ext: str) -> str:
    return {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".gif": "image/gif",
        ".webp": "image/webp", ".pdf": "application/pdf",
        ".mp3": "audio/mpeg", ".m4a": "audio/mp4",
        ".wav": "audio/wav",
    }.get(ext, "application/octet-stream")
