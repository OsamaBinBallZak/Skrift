"""
Transcription API endpoints
Handles audio transcription with whisper.cpp
"""

import threading
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from models import ProcessingRequest, ProcessingResponse, ProcessingStatus
from utils.status_tracker import status_tracker
from services.transcription import process_transcription_thread, generate_transcription_stream

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
    
    # Check if already processing or done
    if pipeline_file.steps.transcribe == ProcessingStatus.PROCESSING:
        return ProcessingResponse(
            status="already_processing",
            message="Transcription already in progress",
            file=pipeline_file
        )
    
    if pipeline_file.steps.transcribe == ProcessingStatus.DONE:
        return ProcessingResponse(
            status="already_done", 
            message="Transcription already completed",
            file=pipeline_file
        )
    
    try:
        # Update status to processing
        status_tracker.update_file_status(
            file_id, 
            "transcribe", 
            ProcessingStatus.PROCESSING
        )
        
        # Use explicit request value, or fall back to file's setting
        conversation_mode = request.conversationMode if request.conversationMode is not None else pipeline_file.conversationMode
        
        # Start transcription in a separate thread
        thread = threading.Thread(target=process_transcription_thread, args=(file_id, conversation_mode))
        thread.start()
        
        return ProcessingResponse(
            status="started",
            message=f"{'Conversation' if conversation_mode else 'Solo'} transcription started",
            estimatedTime="5-15 minutes" if not conversation_mode else "10-25 minutes",
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


@router.get("/stream/{file_id}")
async def stream_transcription(file_id: str):
    """Stream Whisper CLI output for a file as Server-Sent Events (debug helper).

    This does not currently update pipeline status; it is intended for
    inspecting live Whisper output when debugging long or stuck runs.
    """
    pipeline_file = status_tracker.get_file(file_id)
    if not pipeline_file:
        raise HTTPException(status_code=404, detail="File not found")

    async def event_generator():
        async for event in generate_transcription_stream(file_id):
            yield event

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
