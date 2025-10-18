"""
Status tracking utility for Audio Transcription Pipeline
Manages file processing status using JSON files
"""

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
from models import PipelineFile, ProcessingStatus, ProcessingSteps
from config.settings import get_file_output_folder

class StatusTracker:
    """Manages file processing status using JSON files"""
    
    def __init__(self):
        self._files: Dict[str, PipelineFile] = {}
        self.load_existing_files()
    
    def load_existing_files(self):
        """Load existing files from status.json files"""
        from config.settings import get_output_folder
        
        output_folder = get_output_folder()
        if not output_folder.exists():
            return
        
        for file_folder in output_folder.iterdir():
            if file_folder.is_dir():
                status_file = file_folder / "status.json"
                if status_file.exists():
                    try:
                        with open(status_file, 'r') as f:
                            data = json.load(f)
                            # Construct model
                            pipeline_file = PipelineFile(**data)
                            
                            # Validate that the actual audio file exists
                            if Path(pipeline_file.path).exists():
                                self._files[pipeline_file.id] = pipeline_file
                            else:
                                print(f"Warning: Audio file not found, removing orphaned entry: {pipeline_file.path}")
                                # Clean up orphaned status file
                                status_file.unlink()
                                
                    except Exception as e:
                        print(f"Warning: Could not load status file {status_file}: {e}")
                        # Remove corrupted status file
                        try:
                            status_file.unlink()
                        except:
                            pass
    
    def create_file(self, 
                   filename: str, 
                   path: str, 
                   size: int, 
                   conversation_mode: bool = False) -> PipelineFile:
        """Create a new pipeline file entry"""
        
        file_id = str(uuid.uuid4())
        
        pipeline_file = PipelineFile(
            id=file_id,
            filename=filename,
            path=path,
            size=size,
            conversationMode=conversation_mode,
            uploadedAt=datetime.now(),
            steps=ProcessingSteps()
        )
        
        self._files[file_id] = pipeline_file
        self.save_file_status(file_id)
        
        return pipeline_file
    
    def get_file(self, file_id: str) -> Optional[PipelineFile]:
        """Get a pipeline file by ID"""
        return self._files.get(file_id)
    
    def get_all_files(self) -> List[PipelineFile]:
        """Get all pipeline files"""
        return list(self._files.values())
    
    def update_file_status(self, 
                          file_id: str, 
                          step: str, 
                          status: ProcessingStatus,
                          error: Optional[str] = None,
                          result_content: Optional[str] = None) -> Optional[PipelineFile]:
        """Update the status of a processing step"""
        
        if file_id not in self._files:
            return None
        
        pipeline_file = self._files[file_id]
        
        # Update step status
        if hasattr(pipeline_file.steps, step):
            setattr(pipeline_file.steps, step, status)
        
        # Handle error: set if provided; if explicitly empty string, clear; if None, leave unchanged
        if error is not None:
            if error == "":
                pipeline_file.error = None
                pipeline_file.errorDetails = None
            else:
                pipeline_file.error = error
                pipeline_file.errorDetails = {
                    "step": step,
                    "timestamp": datetime.now().isoformat(),
                    "message": error
                }
        
        # Store result content
        if result_content:
            if step == "transcribe":
                pipeline_file.transcript = result_content
            elif step == "sanitise":
                pipeline_file.sanitised = result_content
            elif step == "enhance":
                # Legacy 'enhanced' field is deprecated; store copy-edit output instead
                pipeline_file.enhanced_copyedit = result_content
            elif step == "export":
                pipeline_file.exported = result_content
        
        # Update timestamps
        pipeline_file.lastModified = datetime.now()
        pipeline_file.lastActivityAt = datetime.now()
        
        # Save to file
        self.save_file_status(file_id)
        
        return pipeline_file
    
    def clear_error(self, file_id: str):
        """Clear top-level error and errorDetails for a file and persist."""
        if file_id not in self._files:
            return
        pf = self._files[file_id]
        pf.error = None
        pf.errorDetails = None
        pf.lastModified = datetime.now()
        pf.lastActivityAt = datetime.now()
        self.save_file_status(file_id)

    def add_processing_time(self, file_id: str, step: str, time_seconds: float):
        """Add processing time for a step"""
        if file_id not in self._files:
            return
        
        pipeline_file = self._files[file_id]
        if pipeline_file.processingTime is None:
            pipeline_file.processingTime = {}
        
        pipeline_file.processingTime[step] = time_seconds
        self.save_file_status(file_id)
    
    def add_audio_metadata(self, file_id: str, metadata: Dict[str, Any]):
        """Add audio metadata to a file. Merge keys instead of overwriting the entire object."""
        if file_id not in self._files:
            return
        
        pipeline_file = self._files[file_id]
        if pipeline_file.audioMetadata is None:
            pipeline_file.audioMetadata = {}
        try:
            # Merge keys
            for k, v in (metadata or {}).items():
                pipeline_file.audioMetadata[k] = v
        except Exception:
            # Fallback: overwrite if merge failed unexpectedly
            pipeline_file.audioMetadata = metadata
        self.save_file_status(file_id)

    def set_enhancement_fields(self, file_id: str, *, working: Optional[str] = None, copyedit: Optional[str] = None, summary: Optional[str] = None, tags: Optional[List[str]] = None):
        """Set enhancement pipeline fields and persist.
        - working: legacy (maps to copyedit)
        - copyedit: preferred name for copy-edited text
        - summary: one-sentence summary
        - tags: selected tags
        """
        if file_id not in self._files:
            return
        pf = self._files[file_id]
        # Back-compat: working maps to copyedit
        if copyedit is None and working is not None:
            copyedit = working
        if copyedit is not None:
            # Model field is enhanced_copyedit
            try:
                pf.enhanced_copyedit = copyedit
            except Exception:
                # Older models: fall back to enhanced_working if present
                setattr(pf, 'enhanced_working', copyedit)
        if summary is not None:
            pf.enhanced_summary = summary
        if tags is not None:
            pf.enhanced_tags = tags
        pf.lastModified = datetime.now()
        pf.lastActivityAt = datetime.now()
        self.save_file_status(file_id)
    
    def delete_file(self, file_id: str) -> bool:
        """Delete a pipeline file and its status"""
        if file_id not in self._files:
            return False
        
        pipeline_file = self._files[file_id]
        
        # Remove status file without recreating the folder
        try:
            file_folder = Path(pipeline_file.path).parent
            status_file = file_folder / "status.json"
            if status_file.exists():
                status_file.unlink()
        except Exception:
            pass
        
        # Remove from memory
        del self._files[file_id]
        
        return True
    
    def save_file_status(self, file_id: str):
        """Save file status to JSON file"""
        if file_id not in self._files:
            return
        
        pipeline_file = self._files[file_id]
        file_folder = get_file_output_folder(pipeline_file.filename)
        status_file = file_folder / "status.json"
        
        # Convert to dict for JSON serialization
        data = pipeline_file.model_dump()
        
        # Convert datetime objects to ISO strings
        if isinstance(data.get('uploadedAt'), datetime):
            data['uploadedAt'] = data['uploadedAt'].isoformat()
        if isinstance(data.get('lastModified'), datetime):
            data['lastModified'] = data['lastModified'].isoformat()
        if isinstance(data.get('lastActivityAt'), datetime):
            data['lastActivityAt'] = data['lastActivityAt'].isoformat()
        
        # Reorder keys for readability: place enhancement subparts before 'enhanced' and 'exported'
        desired_order = [
            'id','filename','path','size','conversationMode','steps',
            'uploadedAt','lastModified','lastActivityAt',
            'transcript','sanitised',
'enhanced_copyedit','enhanced_summary','enhanced_tags',
            'exported',
            'error','errorDetails','processingTime','audioMetadata','progress','progressMessage'
        ]
        ordered = {}
        for k in desired_order:
            if k in data:
                ordered[k] = data[k]
        # Include any remaining keys not in desired_order
        for k,v in data.items():
            if k not in ordered:
                ordered[k] = v
        # Drop deprecated 'enhanced' key if present
        if 'enhanced' in ordered:
            ordered.pop('enhanced', None)
        with open(status_file, 'w') as f:
            json.dump(ordered, f, indent=2, default=str)
    
    def get_processing_queue(self) -> List[PipelineFile]:
        """Get files that are currently being processed"""
        processing_files = []
        for file in self._files.values():
            steps = file.steps
            if (steps.transcribe == ProcessingStatus.PROCESSING or
                steps.sanitise == ProcessingStatus.PROCESSING or
                steps.enhance == ProcessingStatus.PROCESSING or
                steps.export == ProcessingStatus.PROCESSING):
                processing_files.append(file)
        return processing_files
    
    def get_files_by_status(self, step: str, status: ProcessingStatus) -> List[PipelineFile]:
        """Get files filtered by step status"""
        filtered_files = []
        for file in self._files.values():
            if hasattr(file.steps, step):
                step_status = getattr(file.steps, step)
                if step_status == status:
                    filtered_files.append(file)
        return filtered_files

    def update_file_progress(self, file_id: str, step: str, progress: int, status_message: str):
        """Update file progress percentage and status message"""
        if file_id not in self._files:
            return

        pipeline_file = self._files[file_id]

        # Update progress and message directly
        pipeline_file.progress = progress
        pipeline_file.progressMessage = status_message
        
        # Update timestamps
        pipeline_file.lastModified = datetime.now()
        pipeline_file.lastActivityAt = datetime.now()

        # Save to file
        self.save_file_status(file_id)
    
    def update_last_activity(self, file_id: str, message: Optional[str] = None):
        """Update only the last activity timestamp and optionally the message"""
        if file_id not in self._files:
            return
            
        pipeline_file = self._files[file_id]
        pipeline_file.lastActivityAt = datetime.now()
        
        if message:
            pipeline_file.progressMessage = message
            
        # Save to file
        self.save_file_status(file_id)


# Global status tracker instance
status_tracker = StatusTracker()
