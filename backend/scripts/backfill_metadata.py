#!/usr/bin/env python3
"""
Backfill mobile metadata fields into existing Obsidian vault Markdown notes.

Adds empty placeholder fields for mobile-recorded metadata (location, weather,
pressure, pressureTrend, dayPeriod, daylight, steps) to any .md file that has
YAML frontmatter but is missing these fields.

Usage:
    # Dry run (default) — shows what would change, writes nothing:
    python backfill_metadata.py /path/to/vault

    # Apply changes (creates .md.bak backups):
    python backfill_metadata.py /path/to/vault --apply

    # Apply without backups:
    python backfill_metadata.py /path/to/vault --apply --no-backup

Requires: PyYAML (included in the backend's mlx-env venv).

The script inserts new fields after 'confidence:' if present, or after 'source:'
if present, or at the end of the frontmatter block. Existing values are never
overwritten — only missing fields are added as empty placeholders.
"""

import argparse
import re
import sys
import shutil
from pathlib import Path

import yaml


# The mobile metadata fields to backfill, in the order they should appear.
# Nested fields use a dict with None values for empty placeholders.
MOBILE_FIELDS_TEMPLATE = [
    ("location", None),
    ("weather", None),
    ("pressure", None),
    ("pressureTrend", None),
    ("dayPeriod", None),
    ("daylight", {
        "sunrise": None,
        "sunset": None,
        "hoursOfLight": None,
    }),
    ("steps", None),
]

# Top-level field names we track (for checking whether backfill is needed)
MOBILE_FIELD_NAMES = {name for name, _ in MOBILE_FIELDS_TEMPLATE}


def parse_frontmatter(text: str) -> tuple[dict | None, str, str, str]:
    """Parse YAML frontmatter from markdown text.

    Returns:
        (parsed_yaml_dict, yaml_raw_str, before_yaml, after_yaml)
        parsed_yaml_dict is None if no frontmatter found.
        before_yaml includes the opening '---\\n'.
        after_yaml includes the closing '---\\n' and everything after.
    """
    m = re.match(r"^(---\n)(.*?\n)(---\n?)(.*)", text, flags=re.DOTALL)
    if not m:
        return None, "", "", text

    opener = m.group(1)       # '---\n'
    yaml_raw = m.group(2)     # YAML content between markers
    closer = m.group(3)       # '---\n' or '---' (at EOF)
    rest = m.group(4)         # everything after closing ---

    try:
        parsed = yaml.safe_load(yaml_raw)
    except yaml.YAMLError:
        return None, yaml_raw, opener, closer + rest

    if not isinstance(parsed, dict):
        return None, yaml_raw, opener, closer + rest

    return parsed, yaml_raw, opener, closer + rest


def file_needs_backfill(parsed: dict) -> bool:
    """Return True if any mobile metadata field is missing from the frontmatter."""
    for field_name in MOBILE_FIELD_NAMES:
        if field_name not in parsed:
            return True
    return False


def build_insertion_lines(parsed: dict) -> list[str]:
    """Build YAML lines for the missing mobile metadata fields.

    Only includes fields that are absent from `parsed`. Produces block-style
    YAML with empty values (no quotes, just the key followed by nothing).
    """
    lines = []
    for field_name, default_value in MOBILE_FIELDS_TEMPLATE:
        if field_name in parsed:
            continue
        if isinstance(default_value, dict):
            # Nested mapping with empty sub-fields
            lines.append(f"{field_name}:")
            for sub_key, sub_val in default_value.items():
                lines.append(f"  {sub_key}:")
        else:
            lines.append(f"{field_name}:")
    return lines


def find_insertion_point(yaml_lines: list[str]) -> int:
    """Find the line index AFTER which to insert new fields.

    Strategy:
    1. After 'confidence:' line if present
    2. After 'source:' line if present
    3. At the end of the YAML block
    """
    confidence_idx = None
    source_idx = None

    for i, line in enumerate(yaml_lines):
        stripped = line.lstrip()
        if stripped.startswith("confidence:"):
            confidence_idx = i
        elif stripped.startswith("source:"):
            source_idx = i

    if confidence_idx is not None:
        return confidence_idx + 1
    if source_idx is not None:
        return source_idx + 1
    return len(yaml_lines)


def backfill_file(filepath: Path, apply: bool, backup: bool) -> str | None:
    """Process a single markdown file.

    Returns:
        'updated' if the file was (or would be) modified,
        'already_has_metadata' if all mobile fields are present,
        'no_frontmatter' if the file lacks YAML frontmatter,
        None on read/parse error (logged to stderr).
    """
    try:
        text = filepath.read_text(encoding="utf-8")
    except Exception as e:
        print(f"  WARNING: Could not read {filepath}: {e}", file=sys.stderr)
        return None

    parsed, yaml_raw, opener, after_yaml = parse_frontmatter(text)

    if parsed is None:
        return "no_frontmatter"

    if not file_needs_backfill(parsed):
        return "already_has_metadata"

    # Build the lines to insert
    new_lines = build_insertion_lines(parsed)
    if not new_lines:
        return "already_has_metadata"

    # Split existing YAML into lines (preserving trailing newlines)
    yaml_lines = yaml_raw.splitlines()

    # Find where to insert
    insert_at = find_insertion_point(yaml_lines)

    # Insert the new lines
    for i, line in enumerate(new_lines):
        yaml_lines.insert(insert_at + i, line)

    # Reconstruct the full file
    new_yaml = "\n".join(yaml_lines) + "\n"
    new_text = opener + new_yaml + after_yaml

    if apply:
        if backup:
            bak_path = filepath.with_suffix(filepath.suffix + ".bak")
            try:
                shutil.copyfile(filepath, bak_path)
            except Exception as e:
                print(f"  WARNING: Could not create backup {bak_path}: {e}", file=sys.stderr)
                return None

        try:
            filepath.write_text(new_text, encoding="utf-8")
        except Exception as e:
            print(f"  WARNING: Could not write {filepath}: {e}", file=sys.stderr)
            return None

    return "updated"


def main():
    parser = argparse.ArgumentParser(
        description="Backfill mobile metadata fields into Obsidian vault Markdown notes."
    )
    parser.add_argument(
        "vault_path",
        type=Path,
        help="Path to the Obsidian vault directory.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        default=False,
        help="Actually write changes. Without this flag, runs in dry-run mode.",
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        default=False,
        help="Skip creating .md.bak backup files (only meaningful with --apply).",
    )
    args = parser.parse_args()

    vault = args.vault_path.expanduser().resolve()
    if not vault.is_dir():
        print(f"ERROR: Not a directory: {vault}", file=sys.stderr)
        sys.exit(1)

    apply = args.apply
    backup = not args.no_backup

    if not apply:
        print("DRY RUN — no files will be modified. Pass --apply to write changes.\n")
    else:
        bak_note = " (with .bak backups)" if backup else " (no backups)"
        print(f"APPLY MODE{bak_note} — files will be modified.\n")

    md_files = sorted(vault.rglob("*.md"))
    if not md_files:
        print(f"No .md files found in {vault}")
        sys.exit(0)

    updated = 0
    already = 0
    skipped = 0
    errors = 0

    for filepath in md_files:
        # Skip hidden files and directories (e.g. .obsidian/, .trash/)
        parts = filepath.relative_to(vault).parts
        if any(p.startswith(".") for p in parts):
            continue

        result = backfill_file(filepath, apply=apply, backup=backup)

        if result == "updated":
            action = "Updated" if apply else "Would update"
            print(f"  {action}: {filepath.relative_to(vault)}")
            updated += 1
        elif result == "already_has_metadata":
            already += 1
        elif result == "no_frontmatter":
            skipped += 1
        else:
            errors += 1

    print()
    verb = "updated" if apply else "would be updated"
    print(f"Summary:")
    print(f"  {updated} files {verb}")
    print(f"  {already} files already have metadata")
    print(f"  {skipped} files have no frontmatter (skipped)")
    if errors:
        print(f"  {errors} files had read/write errors")
    print(f"  {updated + already + skipped + errors} total .md files scanned")


if __name__ == "__main__":
    main()
