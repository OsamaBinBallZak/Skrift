import { useState, useEffect, useCallback, useRef } from 'react';
import type { 
  ElectronAPI, 
  ElectronHookResult, 
  ElectronEventCleanup,
  SystemResources,
  PlatformInfo 
} from '../types/electron';

/**
 * Hook to safely access Electron API
 */
export function useElectronAPI(): ElectronAPI | null {
  const [api, setApi] = useState<ElectronAPI | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.electronAPI) {
        setApi(window.electronAPI);
      } else if (window.electronAPIError) {
        setError(window.electronAPIError);
      } else {
        setError('Electron API not available');
      }
    }
  }, []);

  if (error) {
    console.error('Electron API Error:', error);
  }

  return api;
}

/**
 * Hook to get platform information
 */
export function usePlatform(): PlatformInfo | null {
  const [platform, setPlatform] = useState<PlatformInfo | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.platform) {
      setPlatform(window.platform);
    }
  }, []);

  return platform;
}

/**
 * Hook to get system information
 */
export function useSystemInfo(): ElectronHookResult<any> {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const api = useElectronAPI();

  const fetchSystemInfo = useCallback(async () => {
    if (!api) return;

    try {
      setLoading(true);
      setError(null);
      const info = await api.system.getInfo();
      setData(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get system info');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchSystemInfo();
  }, [fetchSystemInfo]);

  return {
    data,
    loading,
    error,
    refetch: fetchSystemInfo,
  };
}

/**
 * Hook to monitor system resources
 */
export function useSystemResources(interval: number = 5000): ElectronHookResult<SystemResources> {
  const [data, setData] = useState<SystemResources | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const api = useElectronAPI();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchResources = useCallback(async () => {
    if (!api) return;

    try {
      setError(null);
      const resources = await api.system.getResources();
      setData(resources);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get system resources');
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (api) {
      fetchResources();
      
      intervalRef.current = setInterval(fetchResources, interval);
      
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [api, fetchResources, interval]);

  return {
    data,
    loading,
    error,
    refetch: fetchResources,
  };
}

/**
 * Hook to handle file dialogs
 */
export function useFileDialog() {
  const api = useElectronAPI();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectFiles = useCallback(async () => {
    if (!api) throw new Error('Electron API not available');

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
  }, [api]);

  const selectFolder = useCallback(async () => {
    if (!api) throw new Error('Electron API not available');

    try {
      setLoading(true);
      setError(null);
      const result = await api.dialog.selectFolder();
      return result;
    } finally {
      setLoading(false);
    }
  }, [api]);

  const saveFile = useCallback(async (options?: any) => {
    if (!api) throw new Error('Electron API not available');

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
  }, [api]);

  return {
    selectFiles,
    selectFolder,
    saveFile,
    loading,
    error,
  };
}

/**
 * Hook to handle pipeline operations
 */
export function usePipeline() {
  const api = useElectronAPI();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startTranscription = useCallback(async (fileId: string, options: any) => {
    if (!api) throw new Error('Electron API not available');

    try {
      setLoading(true);
      setError(null);
      const result = await api.pipeline.startTranscription(fileId, options);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start transcription';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [api]);

  const startSanitise = useCallback(async (fileId: string) => {
    if (!api) throw new Error('Electron API not available');

    try {
      setLoading(true);
      setError(null);
      const result = await api.pipeline.startSanitise(fileId);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start sanitise';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [api]);

  const startEnhancement = useCallback(async (fileId: string, enhancements: string[]) => {
    if (!api) throw new Error('Electron API not available');

    try {
      setLoading(true);
      setError(null);
      const result = await api.pipeline.startEnhancement(fileId, enhancements);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start enhancement';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [api]);

  const startExport = useCallback(async (fileId: string, format: string) => {
    if (!api) throw new Error('Electron API not available');

    try {
      setLoading(true);
      setError(null);
      const result = await api.pipeline.startExport(fileId, format);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start export';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [api]);

  return {
    startTranscription,
    startSanitise,
    startEnhancement,
    startExport,
    loading,
    error,
  };
}

/**
 * Hook to handle Electron events
 */
export function useElectronEvent<T = any>(
  eventName: keyof ElectronAPI['on'],
  callback: (data: T) => void,
  deps: any[] = []
): ElectronEventCleanup | null {
  const api = useElectronAPI();
  const callbackRef = useRef(callback);
  const cleanupRef = useRef<ElectronEventCleanup | null>(null);

  // Update callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!api) return;

    // Clean up previous listener
    if (cleanupRef.current) {
      cleanupRef.current();
    }

    // Set up new listener
    const wrappedCallback = (data: T) => {
      callbackRef.current(data);
    };

    cleanupRef.current = api.on[eventName](wrappedCallback);

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [api, eventName, ...deps]);

  return cleanupRef.current;
}

/**
 * Hook to handle theme changes
 */
export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('light');
  const api = useElectronAPI();

  useEffect(() => {
    if (api) {
      // Get initial system theme
      api.theme.getSystemTheme().then(setSystemTheme);
      
      // Listen for theme changes
      const cleanup = api.on.themeChanged((newTheme: string) => {
        setSystemTheme(newTheme as 'light' | 'dark');
      });

      return cleanup;
    }
  }, [api]);

  const changeTheme = useCallback(async (newTheme: 'light' | 'dark' | 'system') => {
    if (!api) return;

    try {
      await api.theme.setTheme(newTheme);
      setTheme(newTheme);
    } catch (error) {
      console.error('Failed to change theme:', error);
    }
  }, [api]);

  const effectiveTheme = theme === 'system' ? systemTheme : theme;

  return {
    theme,
    systemTheme,
    effectiveTheme,
    changeTheme,
  };
}

/**
 * Hook to handle app control
 */
export function useAppControl() {
  const api = useElectronAPI();

  const quit = useCallback(() => {
    if (api) {
      api.app.quit();
    }
  }, [api]);

  const minimize = useCallback(() => {
    if (api) {
      api.app.minimize();
    }
  }, [api]);

  const toggleDevTools = useCallback(() => {
    if (api) {
      api.app.toggleDevTools();
    }
  }, [api]);

  return {
    quit,
    minimize,
    toggleDevTools,
  };
}

/**
 * Hook to get asset paths
 */
export function useAssetPath() {
  const api = useElectronAPI();

  const getAssetPath = useCallback(async (assetPath: string) => {
    if (!api) return null;

    try {
      return await api.assets.getPath(assetPath);
    } catch (error) {
      console.error('Failed to get asset path:', error);
      return null;
    }
  }, [api]);

  return { getAssetPath };
}