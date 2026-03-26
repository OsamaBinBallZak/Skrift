export type StepStatus = 'pending' | 'processing' | 'done' | 'error' | 'skipped'

export interface ProcessingSteps {
  transcribe: StepStatus
  sanitise: StepStatus
  enhance: StepStatus
  export: StepStatus
}

export interface AudioMetadata {
  duration?: string
  format?: string
  [key: string]: unknown
}

export interface PipelineFile {
  id: string
  filename: string
  path: string
  size: number
  conversationMode: boolean
  steps: ProcessingSteps
  uploadedAt: string
  lastModified: string | null
  lastActivityAt: string | null
  transcript: string | null
  sanitised: string | null
  /** @deprecated use enhanced_copyedit */
  enhanced: string | null
  exported: string | null
  enhanced_title: string | null
  title_approval_status: string | null
  enhanced_copyedit: string | null
  enhanced_summary: string | null
  enhanced_tags: string[] | null
  tag_suggestions: Record<string, string[]> | null
  source_type: 'audio' | 'note' | null
  compiled_text: string | null
  include_audio_in_export: boolean | null
  error: string | null
  errorDetails: Record<string, unknown> | null
  processingTime: Record<string, number> | null
  audioMetadata: AudioMetadata | null
  progress: number | null
  progressMessage: string | null
}

export interface UploadResponse {
  success: boolean
  files: PipelineFile[]
  message: string
  errors: string[]
}

export interface SystemHealth {
  status: string
  resources?: {
    cpuUsage?: number
    ramUsed?: number
    ramTotal?: number
  }
  processing?: {
    active?: boolean
    currentFile?: string | null
  }
  file_statistics?: {
    total?: number
    by_status?: Record<string, number>
  }
  transcription_modules?: {
    parakeet?: { available?: boolean; engine?: string }
    [key: string]: { available?: boolean; [k: string]: unknown } | undefined
  }
  mlx_model?: {
    selected?: string | null
    loaded?: boolean
  }
}
