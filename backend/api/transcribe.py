"""
Transcription API endpoints
Handles audio transcription with whisper.cpp
"""

import threading
from fastapi import APIRouter, HTTPException, BackgroundTasks
from models import ProcessingRequest, ProcessingResponse, ProcessingStatus
from utils.status_tracker import status_tracker
from services.transcription import process_transcription_thread

router = APIRouter()


@router.post("/{file_id}", response_model=ProcessingResponse)
async def start_transcription(background_tasks: BackgroundTasks, file_id: str, request: ProcessingRequest = ProcessingRequest()):
    """
    Start transcription for a file
    Supports both solo and conversation modes
    """
    pipeline_file = status_tracker.get_file(file_id)
    if not pipeline_file:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Check if already processing
    if pipeline_file.steps.transcribe == ProcessingStatus.PROCESSING:
        return ProcessingResponse(
            status="already_processing",
            message="Transcription already in progress",
            file=pipeline_file
        )

    # If already done and not forcing a redo, return early
    if pipeline_file.steps.transcribe == ProcessingStatus.DONE and not request.force:
        return ProcessingResponse(
            status="already_done",
            message="Transcription already completed",
            file=pipeline_file
        )

    # Force redo: reset transcribe step and clear all downstream data so the
    # pipeline can be re-run cleanly from the new transcript
    if pipeline_file.steps.transcribe == ProcessingStatus.DONE and request.force:
        pipeline_file.transcript = None
        pipeline_file.sanitised = None
        pipeline_file.enhanced_copyedit = None
        pipeline_file.enhanced_summary = None
        pipeline_file.enhanced_title = None
        pipeline_file.enhanced_tags = None
        pipeline_file.compiled_text = None
        pipeline_file.steps.transcribe = ProcessingStatus.PENDING
        pipeline_file.steps.sanitise = ProcessingStatus.PENDING
        pipeline_file.steps.enhance = ProcessingStatus.PENDING
        pipeline_file.steps.export = ProcessingStatus.PENDING
        status_tracker.save_file_status(pipeline_file.id)

    try:
        # Update status to processing
        status_tracker.update_file_status(
            file_id, 
            "transcribe", 
            ProcessingStatus.PROCESSING
        )
        
        # Use explicit request value, or fall back to file's setting
        conversation_mode = request.conversationMode if request.conversationMode is not None else pipeline_file.conversationMode

        # Gate conversation mode before spawning the thread so the client gets an
        # immediate 400 rather than a mid-process error buried in status.json.
        if conversation_mode:
            status_tracker.update_file_status(file_id, "transcribe", ProcessingStatus.PENDING)
            raise HTTPException(
                status_code=400,
                detail="Conversation transcription (speaker diarization) is not yet supported. Please use solo mode."
            )

        # Start transcription in a separate thread
        thread = threading.Thread(target=process_transcription_thread, args=(file_id, conversation_mode))
        thread.start()
        
        return ProcessingResponse(
            status="started",
            message=f"{'Conversation' if conversation_mode else 'Solo'} transcription started",
            estimatedTime="5-15 minutes",
            file=status_tracker.get_file(file_id)
        )
    
    except Exception as e:
        # Update status to error
        status_tracker.update_file_status(
            file_id,
            "transcribe", 
            ProcessingStatus.ERROR,
            error=str(e)
        )
        raise HTTPException(status_code=500, detail=f"Failed to start transcription: {str(e)}")


