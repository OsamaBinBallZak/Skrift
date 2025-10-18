#!/usr/bin/env python3
"""
FastAPI Backend for Audio Transcription Pipeline
Main server entry point with API routing and CORS configuration
"""

import os
import sys
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

# Add the backend directory to Python path for module imports
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

# Import API routers
try:
    from api.files import router as files_router
    from api.processing import router as processing_router
    from api.transcribe import router as transcribe_router
    from api.sanitise import router as sanitise_router
    from api.enhance import router as enhance_router
    from api.export import router as export_router
    from api.system import router as system_router
    from api.config import router as config_router
    from api.batch import router as batch_router
except ImportError:
    # Fallback for development - create stub routers
    from fastapi import APIRouter
    files_router = APIRouter()
    processing_router = APIRouter()
    transcribe_router = APIRouter()
    sanitise_router = APIRouter()
    enhance_router = APIRouter()
    export_router = APIRouter()
    system_router = APIRouter()
    config_router = APIRouter()
    batch_router = APIRouter()
    
    @files_router.get("/")
    async def files_stub():
        return {"message": "Files API - Integration in progress"}
    
    @processing_router.post("/transcribe/{file_id}")
    async def transcribe_stub(file_id: str):
        return {"status": "ready", "message": "Transcription API ready for integration"}
    
    @system_router.get("/resources")
    async def system_stub():
        return {"cpuUsage": 25.0, "ramUsed": 8.2, "ramTotal": 24.0}
    
    @config_router.get("/")
    async def config_stub():
        return {"message": "Config API - Integration in progress"}

# Initialize FastAPI app
app = FastAPI(
    title="Audio Transcription Pipeline API",
    description="Backend API for processing audio files through transcription, sanitisation, enhancement, and export",
    version="1.0.0"
)

# Configure CORS for Electron frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Vite dev server
        "http://127.0.0.1:3000",
        "file://",  # Electron file:// protocol
        "capacitor://localhost",  # For potential mobile builds
        "ionic://localhost"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(files_router, prefix="/api/files", tags=["files"])
app.include_router(processing_router, prefix="/api/process", tags=["processing"])
app.include_router(transcribe_router, prefix="/api/process/transcribe", tags=["transcription"])
app.include_router(sanitise_router, prefix="/api/process/sanitise", tags=["sanitisation"])
app.include_router(enhance_router, prefix="/api/process/enhance", tags=["enhancement"])
app.include_router(export_router, prefix="/api/process/export", tags=["export"])
app.include_router(system_router, prefix="/api/system", tags=["system"])
app.include_router(config_router, prefix="/api/config", tags=["config"])
app.include_router(batch_router, tags=["batch"])

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "message": "Audio Transcription Pipeline API",
        "status": "running",
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    """Detailed health check with system info"""
    return {
        "status": "healthy",
        "backend_path": str(backend_dir),
        "python_version": sys.version,
        "available_endpoints": [
            "/api/files/*",
            "/api/process/*",
            "/api/process/transcribe/*",
            "/api/process/sanitise/*",
            "/api/process/enhance/*",
            "/api/process/export/*",
            "/api/system/*",
            "/api/config/*",
            "/api/batch/*"
        ]
    }

# Exception handler for development
@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={
            "detail": str(exc),
            "type": type(exc).__name__,
            "path": str(request.url)
        }
    )

if __name__ == "__main__":
    print("🚀 Starting Audio Transcription Pipeline Backend...")
    print(f"📁 Backend directory: {backend_dir}")
    print("🌐 CORS enabled for Electron frontend")
    print("📡 API endpoints available at: http://localhost:8000")
    print("📖 API documentation: http://localhost:8000/docs")
    
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        log_level="info"
    )
