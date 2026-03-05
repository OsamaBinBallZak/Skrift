// Standardized PipelineFile interface
export interface PipelineFile {
  id: string;
  name: string;
  size: string;
  status: 'unprocessed' | 'transcribing' | 'transcribed' | 'sanitising' | 'sanitised' | 'enhancing' | 'enhanced' | 'exporting' | 'exported' | 'error';
  path: string;
  addedTime: string;
  progress?: number; // 0-100, only during processing
  progressMessage?: string; // Status message during processing
  output?: string; // raw transcript
  sanitised?: string; // sanitised text
  enhanced?: string; // enhanced text
  exported?: string; // exported content (if any)
  // Persisted enhancement pieces
  enhanced_title?: string;
  /**
   * Title approval status as tracked in backend status.json:
   * null/undefined, 'pending', 'accepted', or 'declined'.
   * Used by the Export tab to show the AI title approval banner.
   */
  title_approval_status?: 'pending' | 'accepted' | 'declined' | null;
  enhanced_copyedit?: string;
  enhanced_summary?: string;
  tag_suggestions?: { old: string[]; new: string[] };
  enhanced_tags?: string[];
  // Whether Obsidian export should include the original audio file for this item
  include_audio_in_export?: boolean;
  error?: string;
  conversationMode: boolean; // Always present, not optional
  duration?: string; // Format: "HH:MM:SS" or null if unknown
  format?: 'm4a' | 'mp3' | 'wav' | 'flac';
  lastActivityAt?: string; // ISO timestamp of last processing activity
  steps: {
    transcribe: 'pending' | 'processing' | 'done' | 'error';
    sanitise: 'pending' | 'processing' | 'done' | 'error'; 
    enhance: 'pending' | 'processing' | 'done' | 'error';
    export: 'pending' | 'processing' | 'done' | 'error';
  };
}
