// ==========================================================================
// Electron API Type Definitions
// ==========================================================================

export interface SystemInfo {
  platform: NodeJS.Platform;
  arch: string;
  version: string;
  appVersion: string;
  electronVersion: string;
  nodeVersion: string;
  chromeVersion: string;
  isDevelopment: boolean;
  isProduction: boolean;
}

export interface SystemResources {
  cpu: {
    percentCPUUsage: number;
    idleWakeupsPerSecond: number;
  };
  memory: {
    workingSetSize: number;
    peakWorkingSetSize: number;
    privateBytes: number;
  };
  system: {
    totalMemory: number;
    freeMemory: number;
    loadAverage: number[];
    uptime: number;
  };
}

export interface FileDialogResult {
  canceled: boolean;
  filePaths: string[];
}

export interface SaveDialogResult {
  canceled: boolean;
  filePath?: string;
}

export interface SaveDialogOptions {
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
  defaultPath?: string;
}

export interface FileReadResult {
  success: boolean;
  content?: string;
  size?: number;
  modified?: Date;
  error?: string;
}

export interface FileWriteResult {
  success: boolean;
  error?: string;
}

export interface PipelineJobResult {
  success: boolean;
  jobId?: string;
  error?: string;
}

export interface JSONResult<T = any> {
  success: boolean;
  data?: T;
  json?: string;
  error?: string;
}

export interface PlatformInfo {
  platform: NodeJS.Platform;
  arch: string;
  isWindows: boolean;
  isMacOS: boolean;
  isLinux: boolean;
  versions: {
    node: string;
    chrome: string;
    electron: string;
  };
}

export interface ElectronAPI {
  system: {
    getInfo(): Promise<SystemInfo>;
    getResources(): Promise<SystemResources>;
    getPlatform(): NodeJS.Platform;
    getArchitecture(): string;
    getVersions(): {
      node: string;
      chrome: string;
      electron: string;
    };
  };

  file: {
    read(filePath: string): Promise<FileReadResult>;
    write(filePath: string, content: string): Promise<FileWriteResult>;
  };

  dialog: {
    selectFiles(): Promise<FileDialogResult>;
    selectFolder(): Promise<FileDialogResult>;
    saveFile(options?: SaveDialogOptions): Promise<SaveDialogResult>;
  };

  assets: {
    getPath(assetPath: string): Promise<string>;
  };

  pipeline: {
    startTranscription(fileId: string, options: any): Promise<PipelineJobResult>;
    startSanitise(fileId: string): Promise<PipelineJobResult>;
    startEnhancement(fileId: string, enhancements: string[]): Promise<PipelineJobResult>;
    startExport(fileId: string, format: string): Promise<PipelineJobResult>;
  };

  app: {
    quit(): Promise<void>;
    minimize(): Promise<void>;
    toggleDevTools(): Promise<void>;
  };

  theme: {
    getSystemTheme(): Promise<'light' | 'dark'>;
    setTheme(theme: 'light' | 'dark' | 'system'): Promise<string>;
  };

  logging: {
    info(message: any, context?: any): Promise<void>;
    warn(message: any, context?: any): Promise<void>;
    error(message: any, context?: any): Promise<void>;
    debug(message: any, context?: any): Promise<void>;
  };

  on: {
    menuAddFiles(callback: () => void): () => void;
    menuAddFolder(callback: () => void): () => void;
    menuPreferences(callback: () => void): () => void;
    menuBatchProcess(callback: () => void): () => void;
    menuPauseProcess(callback: () => void): () => void;
    menuClearPipeline(callback: () => void): () => void;
    menuAbout(callback: () => void): () => void;
    menuCheckUpdates(callback: () => void): () => void;
    pipelineUpdate(callback: (data: any) => void): () => void;
    progressUpdate(callback: (data: any) => void): () => void;
    error(callback: (error: any) => void): () => void;
    themeChanged(callback: (theme: string) => void): () => void;
    systemResourcesUpdate(callback: (resources: SystemResources) => void): () => void;
  };

  utils: {
    parseJSON<T = any>(jsonString: string): JSONResult<T>;
    stringifyJSON(data: any): JSONResult<string>;
    formatFileSize(bytes: number): string;
    formatDuration(seconds: number): string;
    formatDate(date: Date): string;
    generateId(): string;
    debounce<T extends (...args: any[]) => any>(func: T, wait: number): T;
    throttle<T extends (...args: any[]) => any>(func: T, limit: number): T;
    deepClone<T>(obj: T): T;
    validateEmail(email: string): boolean;
    sanitizeFilename(filename: string): string;
  };
}

// ==========================================================================
// Global Type Declarations
// ==========================================================================

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    platform: PlatformInfo;
    electronAPIError?: string;
  }
}

// ==========================================================================
// React Hook Types
// ==========================================================================

export type ElectronHookResult<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

export type ElectronEventCleanup = () => void;

// ==========================================================================
// Pipeline Types
// ==========================================================================

export interface PipelineFile {
  id: string;
  name: string;
  path: string;
  size: number;
  duration?: number;
  format?: string;
  status: 'idle' | 'processing' | 'completed' | 'error';
  progress?: number;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PipelineJob {
  id: string;
  fileId: string;
  type: 'transcription' | 'sanitisation' | 'enhancement' | 'export';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  startTime?: Date;
  endTime?: Date;
  error?: string;
  result?: any;
}

export interface TranscriptionOptions {
  language?: string;
  model?: string;
  conversationMode?: boolean;
  speakerDetection?: boolean;
  timestamps?: boolean;
  confidence?: number;
}

export interface EnhancementOptions {
  punctuation?: boolean;
  capitalization?: boolean;
  paragraphs?: boolean;
  speakers?: boolean;
  timestamps?: boolean;
  summary?: boolean;
}

export interface ExportOptions {
  format: 'txt' | 'json' | 'csv' | 'srt' | 'vtt';
  includeTimestamps?: boolean;
  includeSpeakers?: boolean;
  includeConfidence?: boolean;
}

export {};