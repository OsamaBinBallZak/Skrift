"""
Data models for Audio Transcription Pipeline API
Defines the PipelineFile structure matching frontend expectations
"""

from typing import Optional, Dict, Any, List
from enum import Enum
from datetime import datetime
from pydantic import BaseModel, Field

class ProcessingStatus(str, Enum):
    """Status values for pipeline processing steps"""
    PENDING = "pending"
    PROCESSING = "processing" 
    DONE = "done"
    ERROR = "error"
    SKIPPED = "skipped"

class ProcessingSteps(BaseModel):
    """Processing status for each pipeline step"""
    transcribe: ProcessingStatus = ProcessingStatus.PENDING
    sanitise: ProcessingStatus = ProcessingStatus.PENDING
    enhance: ProcessingStatus = ProcessingStatus.PENDING
    export: ProcessingStatus = ProcessingStatus.PENDING

class PipelineFile(BaseModel):
    """
    Main data model matching frontend PipelineFile interface
    Represents an audio file in the processing pipeline
    """
    id: str = Field(..., description="Unique identifier for the file")
    filename: str = Field(..., description="Original filename")
    path: str = Field(..., description="Full path to the file")
    size: int = Field(..., description="File size in bytes")
    
    # Processing metadata
    conversationMode: bool = Field(False, description="Whether this is a conversation or solo recording")
    steps: ProcessingSteps = Field(default_factory=ProcessingSteps, description="Status of each processing step")
    
    # File timestamps
    uploadedAt: datetime = Field(default_factory=datetime.now, description="When file was uploaded")
    lastModified: Optional[datetime] = Field(None, description="Last modification timestamp")
    lastActivityAt: Optional[datetime] = Field(None, description="Last processing activity timestamp")
    
    # Processing results
    transcript: Optional[str] = Field(None, description="Raw transcription text")
    sanitised: Optional[str] = Field(None, description="Sanitised text")
    enhanced: Optional[str] = Field(None, description="AI-enhanced text (legacy single-step)")
    exported: Optional[str] = Field(None, description="Final exported content")

    # Enhancement pipeline fields
    enhanced_copyedit: Optional[str] = Field(None, description="Copy-edited text (applied)")
    enhanced_summary: Optional[str] = Field(None, description="One-sentence summary produced by enhancement")
    enhanced_tags: Optional[List[str]] = Field(None, description="Selected tags from whitelist for this file")
    
    # Error handling
    error: Optional[str] = Field(None, description="Error message if processing failed")
    errorDetails: Optional[Dict[str, Any]] = Field(None, description="Detailed error information")
    
    # Processing metadata
    processingTime: Optional[Dict[str, float]] = Field(None, description="Time taken for each step")
    audioMetadata: Optional[Dict[str, Any]] = Field(None, description="Audio file metadata (duration, format, etc.)")
    
    # Progress tracking
    progress: Optional[int] = Field(None, description="Current progress percentage (0-100)")
    progressMessage: Optional[str] = Field(None, description="Current progress status message")
    
    def get_activity_age_seconds(self) -> Optional[int]:
        """Get the age of last activity in seconds"""
        if not self.lastActivityAt:
            return None
        return int((datetime.now() - self.lastActivityAt).total_seconds())
    
    def is_activity_stale(self, threshold_seconds: int = 120) -> bool:
        """Check if activity is stale (default: 2 minutes)"""
        age = self.get_activity_age_seconds()
        return age is not None and age > threshold_seconds

class UploadResponse(BaseModel):
    """Response for file upload operations"""
    success: bool
    files: List[PipelineFile]
    message: Optional[str] = None
    errors: Optional[List[str]] = None

class ProcessingRequest(BaseModel):
    """Request for processing operations"""
    conversationMode: Optional[bool] = None
    enhancementType: Optional[str] = None
    prompt: Optional[str] = None
    exportFormat: Optional[str] = None

class ProcessingResponse(BaseModel):
    """Response for processing operations"""
    status: str
    message: str
    estimatedTime: Optional[str] = None
    file: Optional[PipelineFile] = None

class SystemResources(BaseModel):
    """System resource monitoring data"""
    cpuUsage: float = Field(..., description="CPU usage percentage")
    ramUsed: float = Field(..., description="RAM used in GB")
    ramTotal: float = Field(..., description="Total RAM in GB")
    coreTemp: Optional[float] = Field(None, description="CPU temperature in Celsius")
    diskUsed: Optional[float] = Field(None, description="Disk usage percentage")

class SystemStatus(BaseModel):
    """System processing status"""
    processing: bool = Field(..., description="Whether system is currently processing")
    currentFile: Optional[str] = Field(None, description="Currently processing file")
    currentStep: Optional[str] = Field(None, description="Current processing step")
    queueLength: int = Field(0, description="Number of files in processing queue")

class ConfigUpdate(BaseModel):
    """Configuration update request"""
    key: str = Field(..., description="Configuration key using dot notation")
    value: Any = Field(..., description="New configuration value")

class ConfigResponse(BaseModel):
    """Configuration response"""
    success: bool
    message: str
    config: Optional[Dict[str, Any]] = None
