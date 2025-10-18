"""
Batch Processing Manager

Handles sequential batch processing of files through transcription and enhancement pipelines.
Manages batch state persistence, recovery, and error handling.
"""

import json
import os
import asyncio
from datetime import datetime
from typing import List, Optional, Dict, Any, Literal
from pathlib import Path

# Batch state file location
BATCH_STATE_FILE = Path(__file__).parent.parent / "data" / "batch_state.json"


class BatchManager:
    """Manages batch processing state and execution"""
    
    def __init__(self):
        self.current_batch: Optional[Dict[str, Any]] = None
        self._load_batch_state()
    
    def _load_batch_state(self) -> None:
        """Load existing batch state from disk if it exists"""
        if BATCH_STATE_FILE.exists():
            try:
                with open(BATCH_STATE_FILE, 'r') as f:
                    self.current_batch = json.load(f)
            except Exception as e:
                print(f"Failed to load batch state: {e}")
                self.current_batch = None
    
    def _save_batch_state(self) -> None:
        """Persist current batch state to disk"""
        try:
            BATCH_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(BATCH_STATE_FILE, 'w') as f:
                json.dump(self.current_batch, f, indent=2)
        except Exception as e:
            print(f"Failed to save batch state: {e}")
    
    def _clear_batch_state(self) -> None:
        """Remove batch state file"""
        if BATCH_STATE_FILE.exists():
            BATCH_STATE_FILE.unlink()
        self.current_batch = None
    
    def start_transcribe_batch(self, file_ids: List[str]) -> Dict[str, Any]:
        """
        Start a new transcription batch
        
        Args:
            file_ids: List of file IDs to process
            
        Returns:
            Dict with batch_id and started_at
        """
        if self.current_batch and self.current_batch['status'] == 'running':
            raise ValueError("A batch is already running")
        
        batch_id = f"batch_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        self.current_batch = {
            'batch_id': batch_id,
            'type': 'transcribe',
            'status': 'running',
            'files': [
                {
                    'file_id': fid,
                    'status': 'waiting',
                    'started_at': None,
                    'completed_at': None,
                    'processing_time_seconds': None,
                    'error': None
                }
                for fid in file_ids
            ],
            'consecutive_failures': 0,
            'mlx_model_loaded': False,
            'started_at': datetime.now().isoformat(),
            'last_activity': datetime.now().isoformat()
        }
        
        self._save_batch_state()
        
        return {
            'batch_id': batch_id,
            'started_at': self.current_batch['started_at']
        }
    
    def start_enhance_batch(self, file_ids: List[str]) -> Dict[str, Any]:
        """
        Start a new enhancement batch
        
        Args:
            file_ids: List of file IDs to process
            
        Returns:
            Dict with batch_id and started_at
        """
        if self.current_batch and self.current_batch['status'] == 'running':
            raise ValueError("A batch is already running")
        
        batch_id = f"batch_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        self.current_batch = {
            'batch_id': batch_id,
            'type': 'enhance',
            'status': 'running',
            'files': [
                {
                    'file_id': fid,
                    'status': 'waiting',
                    'started_at': None,
                    'completed_at': None,
                    'processing_time_seconds': None,
                    'error': None,
                    'steps': {
                        'copy_edit': None,
                        'summary': None,
                        'tags': None
                    }
                }
                for fid in file_ids
            ],
            'consecutive_failures': 0,
            'mlx_model_loaded': False,
            'started_at': datetime.now().isoformat(),
            'last_activity': datetime.now().isoformat()
        }
        
        self._save_batch_state()
        
        return {
            'batch_id': batch_id,
            'started_at': self.current_batch['started_at']
        }
    
    def get_batch_status(self, batch_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Get current batch status
        
        Args:
            batch_id: Optional batch ID to verify (if None, returns current batch)
            
        Returns:
            Batch status dict or None if no batch exists
        """
        if not self.current_batch:
            return None
        
        if batch_id and self.current_batch.get('batch_id') != batch_id:
            return None
        
        # Calculate stats
        completed_count = sum(1 for f in self.current_batch['files'] if f['status'] == 'completed')
        failed_count = sum(1 for f in self.current_batch['files'] if f['status'] == 'failed')
        total_count = len(self.current_batch['files'])
        
        # Find current file
        current_file_id = None
        for f in self.current_batch['files']:
            if f['status'] == 'processing':
                current_file_id = f['file_id']
                break
        
        return {
            'batch_id': self.current_batch['batch_id'],
            'type': self.current_batch['type'],
            'status': self.current_batch['status'],
            'files': self.current_batch['files'],
            'current_file_id': current_file_id,
            'completed_count': completed_count,
            'failed_count': failed_count,
            'total_count': total_count,
            'consecutive_failures': self.current_batch['consecutive_failures'],
            'progress_percentage': (completed_count / total_count * 100) if total_count > 0 else 0,
            'mlx_model_loaded': self.current_batch.get('mlx_model_loaded', False),
            'started_at': self.current_batch['started_at'],
            'last_activity': self.current_batch['last_activity']
        }
    
    def cancel_batch(self, batch_id: str) -> bool:
        """
        Cancel the current batch
        
        Args:
            batch_id: Batch ID to cancel
            
        Returns:
            True if cancelled, False if batch not found or doesn't match
        """
        if not self.current_batch or self.current_batch.get('batch_id') != batch_id:
            return False
        
        self.current_batch['status'] = 'cancelled'
        self._save_batch_state()
        
        # Clear state after a moment (allow status check)
        self._clear_batch_state()
        
        return True
    
    def resume_batch(self, batch_id: str) -> bool:
        """
        Resume a paused/stopped batch
        
        Args:
            batch_id: Batch ID to resume
            
        Returns:
            True if resumed, False if batch not found or can't resume
        """
        if not self.current_batch or self.current_batch.get('batch_id') != batch_id:
            return False
        
        # Mark any 'processing' files as 'failed' (interrupted)
        for file_info in self.current_batch['files']:
            if file_info['status'] == 'processing':
                file_info['status'] = 'failed'
                file_info['error'] = 'Interrupted by sleep/restart'
                file_info['completed_at'] = datetime.now().isoformat()
        
        self.current_batch['status'] = 'running'
        self.current_batch['last_activity'] = datetime.now().isoformat()
        self._save_batch_state()
        
        return True
    
    def update_file_status(
        self, 
        file_id: str, 
        status: Literal['waiting', 'processing', 'completed', 'failed'],
        error: Optional[str] = None,
        step_updates: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Update status of a file in the batch
        
        Args:
            file_id: File ID to update
            status: New status
            error: Optional error message
            step_updates: Optional dict of step statuses for enhance batches
        """
        if not self.current_batch:
            return
        
        for file_info in self.current_batch['files']:
            if file_info['file_id'] == file_id:
                old_status = file_info['status']
                file_info['status'] = status
                
                if status == 'processing' and old_status == 'waiting':
                    file_info['started_at'] = datetime.now().isoformat()
                
                if status in ['completed', 'failed']:
                    file_info['completed_at'] = datetime.now().isoformat()
                    if file_info['started_at']:
                        start_time = datetime.fromisoformat(file_info['started_at'])
                        end_time = datetime.fromisoformat(file_info['completed_at'])
                        file_info['processing_time_seconds'] = (end_time - start_time).total_seconds()
                
                if error:
                    file_info['error'] = error
                
                if step_updates and 'steps' in file_info:
                    file_info['steps'].update(step_updates)
                
                # Update consecutive failures counter
                if status == 'failed':
                    self.current_batch['consecutive_failures'] += 1
                elif status == 'completed':
                    self.current_batch['consecutive_failures'] = 0
                
                self.current_batch['last_activity'] = datetime.now().isoformat()
                break
        
        self._save_batch_state()
    
    def should_stop_batch(self) -> bool:
        """
        Check if batch should be stopped due to consecutive failures
        
        Returns:
            True if batch should stop (3+ consecutive failures)
        """
        if not self.current_batch:
            return False
        
        return self.current_batch.get('consecutive_failures', 0) >= 3
    
    def complete_batch(self) -> None:
        """Mark the current batch as completed"""
        if self.current_batch:
            self.current_batch['status'] = 'completed'
            self.current_batch['completed_at'] = datetime.now().isoformat()
            self._save_batch_state()
    
    def fail_batch(self, reason: str) -> None:
        """
        Mark the current batch as failed
        
        Args:
            reason: Failure reason
        """
        if self.current_batch:
            self.current_batch['status'] = 'failed'
            self.current_batch['failure_reason'] = reason
            self.current_batch['completed_at'] = datetime.now().isoformat()
            self._save_batch_state()
    
    def get_next_waiting_file(self) -> Optional[str]:
        """
        Get the next file ID that needs processing
        
        Returns:
            File ID or None if no waiting files
        """
        if not self.current_batch:
            return None
        
        for file_info in self.current_batch['files']:
            if file_info['status'] == 'waiting':
                return file_info['file_id']
        
        return None
    
    def set_mlx_model_loaded(self, loaded: bool) -> None:
        """Update MLX model loaded status"""
        if self.current_batch:
            self.current_batch['mlx_model_loaded'] = loaded
            self._save_batch_state()


# Global singleton instance
_batch_manager = None

def get_batch_manager() -> BatchManager:
    """Get the global BatchManager instance"""
    global _batch_manager
    if _batch_manager is None:
        _batch_manager = BatchManager()
    return _batch_manager
