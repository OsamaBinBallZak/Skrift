"""
Export service
Handles markdown compilation and export operations
"""

import re
import shutil
from pathlib import Path
from models import ProcessingStatus
from utils.status_tracker import status_tracker


def get_compiled_markdown(file_id: str) -> dict:
    """
    Get current compiled markdown content for a file.
    Resolution order for the active markdown file in the file's output folder:
    1) compiled.md if present
    2) If exactly one *.md exists, use that
    3) Otherwise, use the most recently modified *.md
    
    Returns:
        dict with:
        - status: 'done' or 'error'
        - path: path to markdown file (if done)
        - title: extracted YAML title (if done)
        - content: markdown content (if done)
        - error: error message (if error)
    """
    try:
        pf = status_tracker.get_file(file_id)
        if not pf:
            return {
                'status': 'error',
                'error': 'File not found'
            }
        
        folder = Path(pf.path).parent
        md_path = folder / 'compiled.md'
        
        if not md_path.exists():
            md_files = list(folder.glob('*.md'))
            # Exclude hidden files
            md_files = [p for p in md_files if not p.name.startswith('.')]
            if not md_files:
                return {
                    'status': 'error',
                    'error': 'No markdown file present for this item'
                }
            if len(md_files) == 1:
                md_path = md_files[0]
            else:
                md_path = max(md_files, key=lambda p: p.stat().st_mtime)
        
        try:
            content = md_path.read_text(encoding='utf-8')
        except Exception as e:
            return {
                'status': 'error',
                'error': f'Failed to read compiled markdown: {e}'
            }
        
        # Extract title from YAML frontmatter
        title = None
        m = re.search(r"^---\n([\s\S]*?)\n---", content, flags=re.MULTILINE)
        if m:
            block = m.group(1)
            mtitle = re.search(r"^title:\s*(.+)$", block, flags=re.MULTILINE)
            if mtitle:
                title = mtitle.group(1).strip()
        
        return {
            'status': 'done',
            'path': str(md_path),
            'title': title,
            'content': content
        }
    
    except Exception as e:
        return {
            'status': 'error',
            'error': str(e)
        }


def save_compiled_markdown(file_id: str, content: str, export_to_vault: bool = False, vault_path: str = None) -> dict:
    """
    Save compiled markdown edits and optionally export (rename) based on YAML title.
    
    Logic:
    - Determine the active markdown filename using the same resolver as GET.
    - A plain Save writes to the active file (overwriting it). It will not create a second .md.
    - Save & Export renames the active file to <YAML title>.md, then deletes any other .md siblings.
    - If a vault_path is provided and valid, copy the renamed file there.
    
    Args:
        file_id: file identifier
        content: markdown content to save
        export_to_vault: whether to export/rename based on YAML title
        vault_path: optional vault path for copying
    
    Returns:
        dict with:
        - status: 'done' or 'error'
        - success: True (if done)
        - path: path to saved file (if done, plain save)
        - exported_path: path to renamed file (if done, export)
        - vault_exported_path: path in vault (if done, vault export)
        - error: error message (if error)
    """
    try:
        pf = status_tracker.get_file(file_id)
        if not pf:
            return {
                'status': 'error',
                'error': 'File not found'
            }
        
        if not content:
            return {
                'status': 'error',
                'error': 'Missing markdown content'
            }
        
        folder = Path(pf.path).parent
        folder.mkdir(parents=True, exist_ok=True)
        
        # Resolve current active markdown path
        active = folder / 'compiled.md'
        if not active.exists():
            md_files = [p for p in folder.glob('*.md') if not p.name.startswith('.')]
            if md_files:
                if len(md_files) == 1:
                    active = md_files[0]
                else:
                    active = max(md_files, key=lambda p: p.stat().st_mtime)
        
        # Write content to the active file
        try:
            active.write_text(content, encoding='utf-8')
        except Exception as e:
            return {
                'status': 'error',
                'error': f'Failed to write markdown: {e}'
            }
        
        # Handle export/rename
        if export_to_vault:
            # Extract YAML title
            m = re.search(r"^---\n([\s\S]*?)\n---", content, flags=re.MULTILINE)
            title = None
            if m:
                block = m.group(1)
                mtitle = re.search(r"^title:\s*(.+)$", block, flags=re.MULTILINE)
                if mtitle:
                    title = mtitle.group(1).strip()
            
            if not title:
                return {
                    'status': 'error',
                    'error': 'YAML frontmatter must include a title before export'
                }
            
            # Sanitize title for filename
            safe = title.strip()
            safe = re.sub(r"[\\/:*?\"<>|]", "-", safe)
            safe = re.sub(r"\s+", " ", safe).strip()
            new_path = folder / f"{safe}.md"
            
            try:
                if new_path.exists():
                    new_path.unlink()
                
                # If active is different, rename it
                if str(active) != str(new_path):
                    active.rename(new_path)
                    active = new_path
                
                # Clean up any other .md files in the folder to avoid duplicates
                for other in folder.glob('*.md'):
                    if other.resolve() != active.resolve():
                        try:
                            other.unlink()
                        except Exception:
                            pass
                
                # Update export status
                status_tracker.update_file_status(
                    file_id,
                    'export',
                    ProcessingStatus.DONE,
                    result_content=str(active)
                )
                
                vault_exported = None
                if vault_path:
                    vp = Path(vault_path)
                    if not vp.exists() or not vp.is_dir():
                        return {
                            'status': 'error',
                            'error': f'Vault path is not a folder: {vault_path}'
                        }
                    vp_target = vp / active.name
                    try:
                        shutil.copyfile(active, vp_target)
                        vault_exported = str(vp_target)
                    except Exception as e:
                        return {
                            'status': 'error',
                            'error': f'Failed to export to vault: {e}'
                        }
                
                return {
                    'status': 'done',
                    'success': True,
                    'exported_path': str(active),
                    'vault_exported_path': vault_exported
                }
            
            except Exception as e:
                return {
                    'status': 'error',
                    'error': f'Failed to export/rename: {e}'
                }
        
        # Plain save path
        return {
            'status': 'done',
            'success': True,
            'path': str(active)
        }
    
    except Exception as e:
        return {
            'status': 'error',
            'error': str(e)
        }
