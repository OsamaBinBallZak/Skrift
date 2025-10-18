"""
Export API Router
Handles all export-related endpoints including:
- Getting and saving compiled markdown
- Starting document export tasks
"""

from fastapi import APIRouter, HTTPException
from models import ProcessingRequest, ProcessingResponse, ProcessingStatus
from utils.status_tracker import status_tracker
from services.export import get_compiled_markdown as get_compiled_markdown_service, save_compiled_markdown as save_compiled_markdown_service

router = APIRouter()


@router.get("/compiled/{file_id}")
async def get_compiled_markdown(file_id: str):
    """Return current compiled markdown content for a file.
    Resolution order for the active markdown file in the file's output folder:
    1) compiled.md if present
    2) If exactly one *.md exists, use that
    3) Otherwise, use the most recently modified *.md
    Returns 404 only if no *.md exists at all.
    """
    result = get_compiled_markdown_service(file_id)
    
    if result['status'] == 'error':
        if 'not found' in result['error'].lower():
            raise HTTPException(status_code=404, detail=result['error'])
        raise HTTPException(status_code=500, detail=result['error'])
    
    return { 'path': result['path'], 'title': result['title'], 'content': result['content'] }

@router.post("/compiled/{file_id}")
async def save_compiled_markdown(file_id: str, body: dict):
    """Save compiled markdown edits and optionally export (rename) based on YAML title.
    Body: { content: str, export_to_vault?: bool, vault_path?: string }
    Logic changes:
    - Determine the active markdown filename using the same resolver as GET.
    - A plain Save writes to the active file (overwriting it). It will not create a second .md.
    - Save & Export renames the active file to <YAML title>.md, then deletes any other .md siblings to prevent duplicates.
    - If a vault_path is provided and valid, copy the renamed file there.
    """
    content = str(body.get('content') or '')
    export_to_vault = bool(body.get('export_to_vault') or False)
    vault_path = body.get('vault_path') or None
    
    result = save_compiled_markdown_service(file_id, content, export_to_vault, vault_path)
    
    if result['status'] == 'error':
        if 'not found' in result['error'].lower():
            raise HTTPException(status_code=404, detail=result['error'])
        if 'missing' in result['error'].lower() or 'must include' in result['error'].lower():
            raise HTTPException(status_code=400, detail=result['error'])
        raise HTTPException(status_code=500, detail=result['error'])
    
    # Return appropriate response based on export type
    if export_to_vault:
        return {
            'success': result['success'],
            'exported_path': result.get('exported_path'),
            'vault_exported_path': result.get('vault_exported_path')
        }
    else:
        return {
            'success': result['success'],
            'path': result.get('path')
        }

@router.post("/{file_id}", response_model=ProcessingResponse)
async def start_export(file_id: str, request: ProcessingRequest = ProcessingRequest()):
    """
    Start document export for a file
    Uses sanitised text or enhanced text if available
    """
    pipeline_file = status_tracker.get_file(file_id)
    if not pipeline_file:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Check if we have content to export
    if (pipeline_file.steps.sanitise != ProcessingStatus.DONE and 
        pipeline_file.steps.enhance != ProcessingStatus.DONE):
        raise HTTPException(status_code=400, detail="Either sanitisation or enhancement must be completed before export")
    
    try:
        # Update status to processing
        status_tracker.update_file_status(
            file_id,
            "export",
            ProcessingStatus.PROCESSING
        )
        
        export_format = request.exportFormat or "markdown"
        
        return ProcessingResponse(
            status="started", 
            message=f"Document export started ({export_format} format)",
            estimatedTime="30 seconds",
            file=status_tracker.get_file(file_id)
        )
    
    except Exception as e:
        status_tracker.update_file_status(
            file_id,
            "export",
            ProcessingStatus.ERROR,
            error=str(e)
        )
        raise HTTPException(status_code=500, detail=f"Failed to start export: {str(e)}")
