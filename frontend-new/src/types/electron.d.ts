interface ElectronFileDialogOptions {
  accept?: string[]
  multiple?: boolean
}

interface ElectronAPI {
  openFileDialog: (options?: ElectronFileDialogOptions) => Promise<string[] | null>
  openFolderDialog: () => Promise<string | null>
  openUploadDialog: () => Promise<{ files: string[]; folders: string[] } | null>
  classifyPaths: (paths: string[]) => Promise<{ files: string[]; folders: string[] }>
  getSystemInfo: () => Promise<{
    appVersion: string
    platform: string
    electronVersion: string
    nodeVersion: string
  }>
  getSystemTheme: () => Promise<'dark' | 'light'>
  onMenuPreferences: (cb: () => void) => () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
    electronAPIError?: string
  }
}

export {}
