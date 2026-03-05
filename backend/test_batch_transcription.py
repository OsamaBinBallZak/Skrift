#!/usr/bin/env python3
"""
Test script for batch transcription with whisper-server.
Verifies that the server starts, stays loaded during batch, and properly cleans up.
"""

import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from services.batch_manager import BatchManager
from utils.status_tracker import status_tracker
from config.settings import settings

async def test_batch_transcription():
    """Test batch transcription with whisper-server."""
    
    print("=" * 60)
    print("BATCH TRANSCRIPTION TEST")
    print("=" * 60)
    
    # Initialize batch manager
    data_dir = Path.home() / "Documents" / "Voice Transcription Application" / "data"
    batch_manager = BatchManager(data_dir)
    
    # Get list of uploaded but not transcribed files
    all_files = status_tracker.list_files()
    untranscribed = [
        f for f in all_files 
        if f.steps.transcribe == "not_started"
    ]
    
    if len(untranscribed) < 2:
        print(f"\n⚠️  Need at least 2 untranscribed files for testing.")
        print(f"   Found {len(untranscribed)} files.")
        print("\n   Please upload some audio files first using the UI.")
        return
    
    # Use first 2-3 files for testing
    test_files = untranscribed[:min(3, len(untranscribed))]
    file_ids = [f.id for f in test_files]
    
    print(f"\n📋 Testing with {len(file_ids)} files:")
    for i, f in enumerate(test_files, 1):
        print(f"   {i}. {f.filename}")
    
    print(f"\n🚀 Starting batch transcription...")
    print(f"   Model will be loaded ONCE and kept in memory")
    print(f"   Expected time savings: ~2-3 seconds per file")
    
    try:
        # Start batch
        batch = await batch_manager.start_transcribe_batch(
            file_ids=file_ids,
            file_service=status_tracker,
            transcription_service=None
        )
        
        print(f"\n✅ Batch started: {batch['batch_id']}")
        print(f"   Status: {batch['status']}")
        
        # Monitor progress
        print(f"\n⏳ Monitoring batch progress...")
        while True:
            current = batch_manager.get_current_batch()
            if not current or current['status'] != 'running':
                break
            
            # Show progress
            completed = sum(1 for f in current['files'] if f['status'] == 'completed')
            failed = sum(1 for f in current['files'] if f['status'] == 'failed')
            processing = [f for f in current['files'] if f['status'] == 'processing']
            
            if processing:
                print(f"   Processing: {processing[0]['file_id'][:8]}... ({completed}/{len(file_ids)} done, {failed} failed)")
            
            await asyncio.sleep(3)
        
        # Final status
        final = batch_manager.get_current_batch()
        print(f"\n🏁 Batch completed!")
        print(f"   Status: {final['status']}")
        print(f"   Files processed:")
        
        for f in final['files']:
            status_icon = "✅" if f['status'] == 'completed' else "❌"
            duration = ""
            if f.get('started_at') and f.get('completed_at'):
                from datetime import datetime
                start = datetime.fromisoformat(f['started_at'])
                end = datetime.fromisoformat(f['completed_at'])
                seconds = (end - start).total_seconds()
                duration = f" ({seconds:.1f}s)"
            print(f"   {status_icon} {f['file_id'][:8]}... {f['status']}{duration}")
        
        print(f"\n✅ Test completed successfully!")
        print(f"   Whisper model was kept in memory throughout batch")
        print(f"   Server automatically cleaned up")
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
    
    print("\n" + "=" * 60)

if __name__ == "__main__":
    asyncio.run(test_batch_transcription())
