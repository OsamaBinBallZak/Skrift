import { useState, useEffect, useCallback } from 'react';

/**
 * Safe hook for checking Electron API availability
 */
export function useElectronSafe() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      setError('Not in browser environment');
      setIsLoading(false);
      return;
    }

    // Check for Electron API availability
    if (window.electronAPI) {
      setIsAvailable(true);
      setError(null);
    } else if (window.electronAPIError) {
      setError(window.electronAPIError);
      setIsAvailable(false);
    } else {
      setError('Electron API not available - running in browser mode');
      setIsAvailable(false);
    }

    setIsLoading(false);
  }, []);

  return {
    isAvailable,
    error,
    isLoading,
    api: isAvailable ? window.electronAPI : null
  };
}

/**
 * Safe wrapper for Electron API calls with fallback handling
 */
export function useElectronCall<T = any>(
  apiCall: () => Promise<T>,
  fallbackValue?: T,
  dependencies: any[] = []
) {
  const [data, setData] = useState<T | null>(fallbackValue || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isAvailable, api } = useElectronSafe();

  const executeCall = useCallback(async () => {
    if (!isAvailable || !api) {
      setData(fallbackValue || null);
      setLoading(false);
      return fallbackValue || null;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await apiCall();
      setData(result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'API call failed';
      setError(errorMessage);
      setData(fallbackValue || null);
      return fallbackValue || null;
    } finally {
      setLoading(false);
    }
  }, [isAvailable, api, apiCall, fallbackValue]);

  useEffect(() => {
    executeCall();
  }, [executeCall, ...dependencies]);

  return {
    data,
    loading,
    error,
    refetch: executeCall,
    isElectronAvailable: isAvailable
  };
}

/**
 * Hook for safe file dialog operations
 */
export function useFileDialogSafe() {
  const { isAvailable, api } = useElectronSafe();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectFiles = useCallback(async () => {
    if (!isAvailable || !api) {
      // Browser fallback - create file input
      return new Promise<{canceled: boolean, filePaths: string[]}>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus';
        
        input.onchange = (e) => {
          const files = (e.target as HTMLInputElement).files;
          if (files && files.length > 0) {
            const filePaths = Array.from(files).map(f => f.name);
            resolve({ canceled: false, filePaths });
          } else {
            resolve({ canceled: true, filePaths: [] });
          }
        };
        
        input.onclick = () => {
          // Reset input to allow selecting the same file again
          input.value = '';
        };
        
        input.click();
      });
    }

    try {
      setLoading(true);
      setError(null);
      const result = await api.dialog.selectFiles();
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to select files';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [isAvailable, api]);

  const selectFolder = useCallback(async () => {
    if (!isAvailable || !api) {
      console.warn('Folder selection not available in browser mode');
      return { canceled: true, filePaths: [] };
    }

    try {
      setLoading(true);
      setError(null);
      const result = await api.dialog.selectFolder();
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to select folder';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [isAvailable, api]);

  const saveFile = useCallback(async (options: any = {}) => {
    if (!isAvailable || !api) {
      console.warn('File save dialog not available in browser mode');
      return { canceled: true, filePath: undefined };
    }

    try {
      setLoading(true);
      setError(null);
      const result = await api.dialog.saveFile(options);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save file';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [isAvailable, api]);

  return {
    selectFiles,
    selectFolder,
    saveFile,
    loading,
    error,
    isElectronAvailable: isAvailable
  };
}

/**
 * Hook for safe system resource monitoring
 */
export function useSystemResourcesSafe(interval: number = 5000) {
  const { isAvailable, api } = useElectronSafe();
  
  // Fallback data for browser mode
  const fallbackData = {
    cpu: { percentCPUUsage: 45, idleWakeupsPerSecond: 10 },
    memory: { workingSetSize: 256, peakWorkingSetSize: 300, privateBytes: 200 },
    system: { 
      totalMemory: 8, 
      freeMemory: 4, 
      loadAverage: [1.2, 1.1, 1.0], 
      uptime: 3600 
    }
  };

  const apiCall = useCallback(async () => {
    if (!api) return fallbackData;
    return await api.system.getResources();
  }, [api]);

  const result = useElectronCall(apiCall, fallbackData, [interval]);

  // Set up interval for real-time updates in Electron mode
  useEffect(() => {
    if (!isAvailable) return;

    const intervalId = setInterval(result.refetch, interval);
    return () => clearInterval(intervalId);
  }, [isAvailable, interval, result.refetch]);

  return result;
}

/**
 * Hook for safe platform information
 */
export function usePlatformSafe() {
  const { isAvailable } = useElectronSafe();

  const platformInfo = {
    platform: isAvailable && window.platform ? window.platform.platform : 'browser' as const,
    arch: isAvailable && window.platform ? window.platform.arch : 'unknown',
    isWindows: isAvailable && window.platform ? window.platform.isWindows : false,
    isMacOS: isAvailable && window.platform ? window.platform.isMacOS : false,
    isLinux: isAvailable && window.platform ? window.platform.isLinux : false,
    versions: isAvailable && window.platform ? window.platform.versions : {
      node: 'N/A',
      chrome: navigator.userAgent.includes('Chrome') ? 'Chrome' : 'Browser',
      electron: 'N/A'
    }
  };

  return platformInfo;
}

