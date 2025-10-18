"""
Batch Processing API Router

Handles endpoints for batch transcription and enhancement processing.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
import asyncio

from services.batch_manager import get_batch_manager

router = APIRouter(prefix="/api/batch", tags=["batch"])


class StartBatchRequest(BaseModel):
    """Request model for starting a batch"""
    file_ids: List[str]


class BatchStatusResponse(BaseModel):
    """Response model for batch status"""
    batch_id: str
    type: str
    status: str
    files: List[dict]
    current_file_id: Optional[str]
    completed_count: int
    failed_count: int
    total_count: int
    consecutive_failures: int
    progress_percentage: float
    mlx_model_loaded: bool
    started_at: str
    last_activity: str


@router.post("/transcribe/start")
async def start_transcribe_batch(request: StartBatchRequest, background_tasks: BackgroundTasks):
    """
    Start a new transcription batch
    
    Args:
        request: List of file IDs to process
        background_tasks: FastAPI background tasks for async processing
        
    Returns:
        Batch ID and start time
    """
    if len(request.file_ids) < 2:
        raise HTTPException(status_code=400, detail="Batch requires at least 2 files")
    
    batch_manager = get_batch_manager()
    
    try:
        result = batch_manager.start_transcribe_batch(request.file_ids)
        
        # Start processing in background
        background_tasks.add_task(process_transcribe_batch, result['batch_id'])
        
        return result
        
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.post("/enhance/start")
async def start_enhance_batch(request: StartBatchRequest, background_tasks: BackgroundTasks):
    """
    Start a new enhancement batch
    
    Args:
        request: List of file IDs to process
        background_tasks: FastAPI background tasks for async processing
        
    Returns:
        Batch ID and start time
    """
    if len(request.file_ids) < 2:
        raise HTTPException(status_code=400, detail="Batch requires at least 2 files")
    
    batch_manager = get_batch_manager()
    
    try:
        result = batch_manager.start_enhance_batch(request.file_ids)
        
        # Start processing in background
        background_tasks.add_task(process_enhance_batch, result['batch_id'])
        
        return result
        
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/current")
async def get_current_batch():
    """
    Get the current batch status (if any exists)
    
    Returns:
        Current batch status or null if no batch
    """
    batch_manager = get_batch_manager()
    status = batch_manager.get_batch_status()
    
    if not status:
        return None
    
    return status


@router.get("/{batch_id}/status")
async def get_batch_status(batch_id: str):
    """
    Get status of a specific batch
    
    Args:
        batch_id: Batch ID to query
        
    Returns:
        Batch status
    """
    batch_manager = get_batch_manager()
    status = batch_manager.get_batch_status(batch_id)
    
    if not status:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    return status


@router.post("/{batch_id}/cancel")
async def cancel_batch(batch_id: str):
    """
    Cancel a running batch
    
    Args:
        batch_id: Batch ID to cancel
        
    Returns:
        Cancellation confirmation
    """
    batch_manager = get_batch_manager()
    
    if not batch_manager.cancel_batch(batch_id):
        raise HTTPException(status_code=404, detail="Batch not found or cannot be cancelled")
    
    return {"cancelled": True, "batch_id": batch_id}


@router.post("/{batch_id}/resume")
async def resume_batch(batch_id: str, background_tasks: BackgroundTasks):
    """
    Resume a paused/stopped batch
    
    Args:
        batch_id: Batch ID to resume
        background_tasks: FastAPI background tasks for async processing
        
    Returns:
        Resume confirmation
    """
    batch_manager = get_batch_manager()
    
    if not batch_manager.resume_batch(batch_id):
        raise HTTPException(status_code=404, detail="Batch not found or cannot be resumed")
    
    # Get batch type and restart processing
    status = batch_manager.get_batch_status(batch_id)
    if status:
        if status['type'] == 'transcribe':
            background_tasks.add_task(process_transcribe_batch, batch_id)
        elif status['type'] == 'enhance':
            background_tasks.add_task(process_enhance_batch, batch_id)
    
    return {"resumed": True, "batch_id": batch_id}


# Background processing functions (to be implemented in Phase 2)
async def process_transcribe_batch(batch_id: str):
    """
    Process transcription batch in background
    
    This will be implemented in Phase 2 with integration to transcription service.
    """
    # TODO: Implement in Phase 2
    pass


async def process_enhance_batch(batch_id: str):
    """
    Process enhancement batch in background
    
    This will be implemented in Phase 3 with integration to enhancement service.
    """
    # TODO: Implement in Phase 3
    pass
