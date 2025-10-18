# BACKEND ARCHITECTURE - AUDIO TRANSCRIPTION PIPELINE

## 🎉 **MAJOR UPDATE - BACKEND INTEGRATION COMPLETE!**

### ✅ **Successfully Implemented - July 28, 2025:**
- **FastAPI Server**: Fully operational on http://localhost:8000
- **File Upload API**: Working with real iPhone .m4a recordings  
- **Status Tracking**: JSON-based system implemented and tested
- **Frontend Integration**: Electron app connects to backend successfully
- **CORS Configuration**: Properly configured for local development
- **Data Models**: PipelineFile structure matches frontend perfectly
- **File Organization**: Individual folders per file working correctly
- **System Monitoring**: CPU, RAM, temperature tracking operational
- **Error Handling**: Comprehensive logging and error responses
- **API Documentation**: Available at http://localhost:8000/docs

### 🧪 **TESTED & VERIFIED:**
```bash
# All endpoints working:
curl http://localhost:8000/                                    # Health check
curl -X POST -F "files=@test.m4a" http://localhost:8000/api/files/upload  # File upload
curl http://localhost:8000/api/files/                          # File listing
curl http://localhost:8000/api/system/resources                # System monitoring
```

## 🎯 BACKEND REQUIREMENTS SUMMARY

### System Constraints
- **Hardware**: Mac Mini M4, 24GB RAM
- **Processing**: Single-file sequential (no concurrent AI enhancement)
- **Manual Control**: Human approval required for each step
- **File Types**: .m4a input → .wav for Whisper → various outputs
- **Duration**: 10 min typical, up to 2 hours max
- **Speed**: ~5x real-time transcription

### Core Requirements
1. **Modular Architecture**: Each pipeline step is independent module
2. **File Organization**: Individual folder per audio file with all outputs
3. **Status Tracking**: JSON-based progress tracking per file
4. **Error Handling**: Individual error logs, no auto-retry
5. **API Integration**: RESTful APIs matching frontend expectations

## 🏗️ PROPOSED BACKEND STRUCTURE

```
audio-transcription-backend/
├── main.py                 # FastAPI server entry point
├── requirements.txt        # Python dependencies
├── config/
│   ├── settings.py        # Global configuration
│   ├── enhancement.json   # AI enhancement prompts
│   └── paths.json         # Input/output folder paths
├── modules/
│   ├── __init__.py
│   ├── file_manager.py    # File operations & upload handling
│   ├── transcription/
│   │   ├── __init__.py
│   │   ├── solo_transcriber.py     # Single-speaker Whisper transcription
│   │   └── conversation_transcriber.py  # Multi-speaker transcription with diarization
│   ├── sanitiser.py       # Text cleaning & conversation mode
│   ├── enhancer.py        # AI enhancement with local LLM
│   └── exporter.py        # Final document generation
├── api/
│   ├── __init__.py
│   ├── files.py           # File management endpoints
│   ├── processing.py      # Pipeline step endpoints
│   ├── system.py          # Resource monitoring
│   └── config.py          # Settings management
├── utils/
│   ├── __init__.py
│   ├── status_tracker.py  # JSON status file management
│   ├── error_logger.py    # Per-file error logging
│   └── audio_converter.py # .m4a → .wav conversion
└── tests/
    ├── test_modules.py
    ├── test_api.py
    └── test_integration.py
```

## 📁 FILE ORGANIZATION STRATEGY

### Input Folder Structure (Configurable)
```
# Default location (configurable via settings)
~/Desktop/Audio-Input/
├── meeting-recording.m4a
├── interview-session.m4a
└── voice-memo.mp3

# Alternative: User can configure any folder via settings panel
# Example: ~/Documents/My-Audio-Files/
```

### Output Folder Structure  
```
~/Desktop/Audio-Output/
├── meeting-recording/
│   ├── original.m4a       # Source file copy
│   ├── converted.wav      # Whisper-ready format
│   ├── transcript.txt     # Raw transcription
│   ├── sanitised.txt      # Cleaned text
│   ├── enhanced.txt       # AI-enhanced text (optional)
│   ├── exported.md        # Final document
│   ├── status.json        # Processing status
│   └── error.log          # Error log (if needed)
└── interview-session/
    └── ... (same structure)
```

## 🔧 API ENDPOINTS DESIGN

### File Management APIs
```python
# POST /api/files/upload
# Body: multipart/form-data with audio files + conversationMode flag
# Response: List of created file IDs

# GET /api/files
# Response: Array of PipelineFile objects

# GET /api/files/{file_id}
# Response: Single PipelineFile object with full details

# DELETE /api/files/{file_id}
# Response: Success confirmation
```

### Processing APIs
```python
# POST /api/process/transcribe/{file_id}
# Body: {"conversationMode": boolean}
# Response: {"status": "started", "estimatedTime": "5 minutes"}

# POST /api/process/sanitise/{file_id}  
# Response: {"status": "started"}

# POST /api/process/enhance/{file_id}
# Body: {"enhancementType": "smart|context|full"}
# Response: {"status": "started"}

# POST /api/process/export/{file_id}
# Body: {"format": "markdown|docx|txt"}
# Response: {"status": "started", "outputPath": "/path/to/file"}

# GET /api/process/{file_id}/status
# Response: PipelineFile object with current status
```

### System Monitoring APIs
```python
# GET /api/system/resources
# Response: {"cpuUsage": 45, "ramUsed": 8.2, "ramTotal": 24, "coreTemp": 52}

# GET /api/system/status  
# Response: {"processing": true, "currentFile": "filename", "currentStep": "transcribing"}
```

## 🔄 PROCESSING WORKFLOW

### 1. File Upload Process
1. Frontend uploads files via `/api/files/upload`
2. Backend copies files to individual output folders
3. Converts .m4a → .wav for Whisper compatibility
4. Creates initial `status.json` with metadata
5. Returns file IDs to frontend

### 2. Transcription Process
1. Frontend triggers `/api/process/transcribe/{file_id}`
2. Backend determines transcription mode from file metadata
3. **Solo Mode**: Uses `solo_transcriber.py` for single-speaker processing
4. **Conversation Mode**: Uses `conversation_transcriber.py` with speaker diarization
5. Saves raw output to `transcript.txt`
6. Updates `status.json` → steps.transcribe = "done"

### 3. Sanitisation Process
1. Frontend triggers `/api/process/sanitise/{file_id}`
2. Backend loads `transcript.txt`
3. Applies regex rules for filler word removal
4. For conversation mode: applies speaker name mapping
5. Adds original file date to YAML frontmatter
6. Saves to `sanitised.txt`

### 4. Enhancement Process (Local, Optional)
1. Frontend triggers `/api/process/enhance/{file_id}` with preset/prompt
2. Backend reads sanitised text from status.json
3. Calls local LLM (in-process) with selected prompt (provider: MLX/Apple Silicon)
4. Returns enhanced content to UI; when user confirms, `/api/process/enhance/{file_id}/save` persists it
5. Persist by writing `enhanced` field in `status.json` and setting `steps.enhance = "done"`
6. Can be skipped (status = "skipped")

### 5. Export Process
1. Frontend triggers `/api/process/export/{file_id}`
2. Backend determines source (enhanced.txt or sanitized.txt)
3. Generates YAML frontmatter with metadata
4. Formats in requested format (markdown/docx/txt)
5. Saves final document as `exported.{format}`

## 🚨 ERROR HANDLING STRATEGY

### Per-File Error Logging
```python
# error.log format per file
[2025-01-07 14:30:15] ERROR: Transcription failed
Step: transcribe
Error: Audio file corrupted at 2:34
System: macOS 14.2, 24GB RAM, M4 Pro
File: meeting-recording.m4a (24.5MB, 00:12:34)
Recovery: Manual intervention required
---
```

### No Auto-Retry Policy
- All errors require human intervention
- Frontend shows error status with "View Log" and "Retry" buttons
- Backend resets file to previous state on retry request
- Manual conversation mode configuration for complex errors

## 🎛️ CONFIGURATION MANAGEMENT

### Global Settings (`config/settings.py`)
```python
SETTINGS = {
    "input_folder": "/Users/tiurihartog/Desktop/Audio-Input",  # Configurable via settings panel
    "output_folder": "/Users/tiurihartog/Desktop/Audio-Output", 
    "whisper_model": "base",
    "conversation_mode_default": False,
    "max_file_size_mb": 500,
    "supported_formats": [".m4a", ".mp3", ".wav", ".flac"],
    
    # Separate transcription module settings
    "solo_transcription": {
        "whisper_model": "base",
        "device": "auto",
        "language": "auto"
    },
    "conversation_transcription": {
        "whisper_model": "base", 
        "device": "auto",
        "language": "auto",
        "diarization_enabled": True,
        "max_speakers": 10
    },
    
    "llm_model": "local-llama",
    "enhancement_enabled": True
}
```

### Speaker Mapping (`config/speaker_mapping.json`)
```json
{
  "default_mappings": {
    "SPEAKER 00": "Tiuri",
    "SPEAKER 01": "Guest"
  },
  "name_corrections": {
    "tuur": "Tiuri",
    "john doe": "John Doe"
  }
}
```

## 🔀 TECHNOLOGY STACK RECOMMENDATION

### Core Framework
- **FastAPI**: Modern, fast Python web framework
- **Uvicorn**: ASGI server for FastAPI
- **Pydantic**: Data validation and settings management

### Audio Processing
- **OpenAI Whisper**: Speech-to-text transcription
- **pydub**: Audio file format conversion
- **python-magic**: File type detection

### Local LLM (Enhancement)
- **MLX (Apple Silicon)**: In-process provider using mlx/mlx-lm
- Models stored under `backend/resources/models/mlx` (uploads); selection restricted to app models folder for safety
- External Python venv for MLX: `/Users/tiurihartog/Hackerman/mlx-env` (auto-bootstrapped by backend/start_backend.sh)
- Compatibility: Some mlx-lm versions do not support `temperature` or `stream=True`; the backend filters unsupported kwargs and falls back to non-stream generation.

### AI Enhancement
- **ollama**: Local LLM management
- **llama2/mistral**: Local language models
- **transformers**: Hugging Face model integration

### File Operations
- **pathlib**: Modern path handling
- **aiofiles**: Async file operations
- **watchdog**: File system monitoring

### System Monitoring  
- **psutil**: System resource monitoring
- **asyncio**: Concurrent processing management

## 🚀 IMPLEMENTATION PHASES

### Phase 2a: Core Infrastructure (Week 1)
1. Set up FastAPI project structure
2. Implement file management APIs
3. Create status tracking system
4. Build basic error logging

### Phase 2b: Transcription Modules (Week 2) 
1. Create separate `solo_transcriber.py` and `conversation_transcriber.py`
2. Integrate Whisper for both transcription modes
3. Add audio format conversion for both modules
4. Implement speaker diarization for conversation module only
5. Add progress tracking for both modules
6. Add configurable input folder via settings

### Phase 2c: Text Processing (Week 3)
1. Build sanitization module with regex
2. Add speaker mapping for conversation mode
3. Integrate local LLM for enhancement
4. Create export system with YAML frontmatter

### Phase 2d: Integration & Testing (Week 4)
1. Connect all modules to FastAPI endpoints
2. Test with frontend integration
3. Add system resource monitoring
4. Performance optimization and error handling

## 💡 NEXT IMMEDIATE STEPS

1. **Choose LLM Solution**: Decide between Ollama, direct model loading, or API
2. **Test Whisper Integration**: Verify it works well with iPhone .m4a files  
3. **Design Status JSON Schema**: Finalize the exact structure
4. **Plan Speaker Diarization**: Research best approach for conversation mode
5. **Set up Development Environment**: Create the initial project structure

---

**READY TO PROCEED**: Frontend is perfectly clean and ready for backend integration!
