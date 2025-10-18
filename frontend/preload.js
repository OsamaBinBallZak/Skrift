const { contextBridge, ipcRenderer } = require('electron');

// ==========================================================================
// Security and Validation
// ==========================================================================

/**
 * Validate string input
 */
const validateString = (value, maxLength = 1000) => {
  return typeof value === 'string' && value.length <= maxLength;
};

/**
 * Validate array input
 */
const validateArray = (value, maxLength = 100) => {
  return Array.isArray(value) && value.length <= maxLength;
};

/**
 * Validate object input
 */
const validateObject = (value) => {
  return typeof value === 'object' && value !== null;
};

/**
 * Create safe IPC invoke wrapper
 */
const createInvokeWrapper = (channel, validator = null) => {
  return async (...args) => {
    try {
      // Validate arguments if validator provided
      if (validator && !validator(...args)) {
        throw new Error(`Invalid arguments for ${channel}`);
      }
      
      const result = await ipcRenderer.invoke(channel, ...args);
      return result;
    } catch (error) {
      console.error(`IPC Invoke Error [${channel}]:`, error);
      throw error;
    }
  };
};

/**
 * Create safe IPC listener wrapper
 */
const createListenerWrapper = (channel, callback, validator = null) => {
  if (typeof callback !== 'function') {
    throw new Error('Callback must be a function');
  }
  
  const wrappedCallback = (event, ...args) => {
    try {
      // Validate arguments if validator provided
      if (validator && !validator(...args)) {
        console.error(`Invalid arguments for listener ${channel}`);
        return;
      }
      
      callback(...args);
    } catch (error) {
      console.error(`IPC Listener Error [${channel}]:`, error);
    }
  };
  
  ipcRenderer.on(channel, wrappedCallback);
  
  // Return cleanup function
  return () => {
    ipcRenderer.removeListener(channel, wrappedCallback);
  };
};

// ==========================================================================
// Electron API Definition
// ==========================================================================

const electronAPI = {
  // ==========================================================================
  // System Information
  // ==========================================================================
  
  system: {
    getInfo: createInvokeWrapper('system:getInfo'),
    
    getResources: createInvokeWrapper('system:getResources'),
    
    getPlatform: () => process.platform,
    
    getArchitecture: () => process.arch,
    
    getVersions: () => ({
      node: process.versions.node,
      chrome: process.versions.chrome,
      electron: process.versions.electron,
    }),
  },

  // ==========================================================================
  // File System Operations
  // ==========================================================================
  
  file: {
    read: createInvokeWrapper('file:read', (filePath) => {
      return validateString(filePath, 2000);
    }),
    
    write: createInvokeWrapper('file:write', (filePath, content) => {
      return validateString(filePath, 2000) && typeof content === 'string';
    }),
  },

  // ==========================================================================
  // Dialog Operations
  // ==========================================================================
  
  dialog: {
    selectFiles: createInvokeWrapper('dialog:selectFiles'),
    
    selectFolder: createInvokeWrapper('dialog:selectFolder'),
    
    saveFile: createInvokeWrapper('dialog:saveFile', (options = {}) => {
      return validateObject(options);
    }),
  },

  // ==========================================================================
  // Asset Management
  // ==========================================================================
  
  assets: {
    getPath: createInvokeWrapper('assets:getPath', (assetPath) => {
      return validateString(assetPath, 500);
    }),
  },

  // ==========================================================================
  // Pipeline Operations
  // ==========================================================================
  
  pipeline: {
    startTranscription: createInvokeWrapper('pipeline:startTranscription', (fileId, options) => {
      return validateString(fileId, 100) && validateObject(options);
    }),
    
    startSanitise: createInvokeWrapper('pipeline:startSanitise', (fileId) => {
      return validateString(fileId, 100);
    }),
    
    startEnhancement: createInvokeWrapper('pipeline:startEnhancement', (fileId, enhancements) => {
      return validateString(fileId, 100) && validateArray(enhancements, 20);
    }),
    
    startExport: createInvokeWrapper('pipeline:startExport', (fileId, format) => {
      return validateString(fileId, 100) && validateString(format, 50);
    }),
  },

  // ==========================================================================
  // Application Control
  // ==========================================================================
  
  app: {
    quit: createInvokeWrapper('app:quit'),
    
    minimize: createInvokeWrapper('app:minimize'),
    
    toggleDevTools: createInvokeWrapper('app:toggleDevTools'),
  },

  // ==========================================================================
  // Theme Management
  // ==========================================================================
  
  theme: {
    getSystemTheme: createInvokeWrapper('theme:getSystemTheme'),
    
    setTheme: createInvokeWrapper('theme:setTheme', (theme) => {
      return ['light', 'dark', 'system'].includes(theme);
    }),
  },

  // ==========================================================================
  // Event Listeners
  // ==========================================================================
  
  on: {
    // Menu events
    menuAddFiles: (callback) => createListenerWrapper('menu-add-files', callback),
    menuAddFolder: (callback) => createListenerWrapper('menu-add-folder', callback),
    menuPreferences: (callback) => createListenerWrapper('menu-preferences', callback),
    menuBatchProcess: (callback) => createListenerWrapper('menu-batch-process', callback),
    menuPauseProcess: (callback) => createListenerWrapper('menu-pause-process', callback),
    menuClearPipeline: (callback) => createListenerWrapper('menu-clear-pipeline', callback),
    menuAbout: (callback) => createListenerWrapper('menu-about', callback),
    menuCheckUpdates: (callback) => createListenerWrapper('menu-check-updates', callback),
    
    // Pipeline events
    pipelineUpdate: (callback) => createListenerWrapper('pipeline-update', callback, (data) => {
      return validateObject(data);
    }),
    
    progressUpdate: (callback) => createListenerWrapper('progress-update', callback, (data) => {
      return validateObject(data);
    }),
    
    error: (callback) => createListenerWrapper('error', callback, (error) => {
      return validateObject(error);
    }),
    
    // Theme events
    themeChanged: (callback) => createListenerWrapper('theme-changed', callback, (theme) => {
      return validateString(theme, 50);
    }),
    
    // System events
    systemResourcesUpdate: (callback) => createListenerWrapper('system-resources-update', callback, (resources) => {
      return validateObject(resources);
    }),
  },

  // ==========================================================================
  // Utility Functions
  // ==========================================================================
  
  utils: {
    // Safe JSON parsing
    parseJSON: (jsonString) => {
      try {
        return { success: true, data: JSON.parse(jsonString) };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    
    // Safe JSON stringification
    stringifyJSON: (data) => {
      try {
        return { success: true, json: JSON.stringify(data, null, 2) };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    
    // Format file size
    formatFileSize: (bytes) => {
      if (typeof bytes !== 'number' || bytes < 0) return '0 B';
      
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let size = bytes;
      let unitIndex = 0;
      
      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
      }
      
      return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
    },
    
    // Format duration
    formatDuration: (seconds) => {
      if (typeof seconds !== 'number' || seconds < 0) return '00:00';
      
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      
      if (hours > 0) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      } else {
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
    },
    
    // Format date
    formatDate: (date) => {
      if (!(date instanceof Date)) return '';
      
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    },
    
    // Generate unique ID
    generateId: () => {
      return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    },
    
    // Debounce function
    debounce: (func, wait) => {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    },
    
    // Throttle function
    throttle: (func, limit) => {
      let inThrottle;
      return function(...args) {
        if (!inThrottle) {
          func.apply(this, args);
          inThrottle = true;
          setTimeout(() => inThrottle = false, limit);
        }
      };
    },
    
    // Deep clone object
    deepClone: (obj) => {
      if (obj === null || typeof obj !== 'object') return obj;
      if (obj instanceof Date) return new Date(obj.getTime());
      if (obj instanceof Array) return obj.map(item => electronAPI.utils.deepClone(item));
      if (typeof obj === 'object') {
        const cloned = {};
        Object.keys(obj).forEach(key => {
          cloned[key] = electronAPI.utils.deepClone(obj[key]);
        });
        return cloned;
      }
    },
    
    // Validate email
    validateEmail: (email) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    },
    
    // Sanitize filename
    sanitizeFilename: (filename) => {
      return filename
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .replace(/^\.+/, '')
        .replace(/\.+$/, '')
        .substring(0, 255);
    },
  },
};

// ==========================================================================
// Expose API to Renderer
// ==========================================================================

try {
  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
  
  // Development: Log successful API exposure
  if (process.env.NODE_ENV === 'development') {
    console.log('Electron API exposed successfully');
    console.log('Available APIs:', Object.keys(electronAPI));
  }
} catch (error) {
  console.error('Failed to expose Electron API:', error);
  
  // Fallback: Set error flag for renderer to detect
  window.electronAPIError = error.message;
}

// ==========================================================================
// Platform Information
// ==========================================================================

const platformInfo = {
  platform: process.platform,
  arch: process.arch,
  isWindows: process.platform === 'win32',
  isMacOS: process.platform === 'darwin',
  isLinux: process.platform === 'linux',
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
};

try {
  contextBridge.exposeInMainWorld('platform', platformInfo);
} catch (error) {
  console.error('Failed to expose platform info:', error);
}

// ==========================================================================
// Development Helpers
// ==========================================================================

if (process.env.NODE_ENV === 'development') {
  window.addEventListener('DOMContentLoaded', () => {
    console.log('Voice Transcription Pipeline - Development Mode');
    console.log('Platform:', platformInfo);
    console.log('Available Electron APIs:', Object.keys(electronAPI));
  });
}

// ==========================================================================
// Production Security Warning
// ==========================================================================

if (process.env.NODE_ENV === 'production') {
  window.addEventListener('DOMContentLoaded', () => {
    console.log(
      '%cSTOP!',
      'color: red; font-size: 50px; font-weight: bold;'
    );
    console.log(
      '%cThis is a browser feature intended for developers. If someone told you to copy and paste something here, it is a scam and will give them access to your application.',
      'color: red; font-size: 16px;'
    );
  });
}

// ==========================================================================
// Error Handling
// ==========================================================================

// Handle uncaught errors in preload script
process.on('uncaughtException', (error) => {
  console.error('Preload script uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Preload script unhandled rejection:', reason);
});

// ==========================================================================
// Cleanup on Unload
// ==========================================================================

window.addEventListener('beforeunload', () => {
  // Clean up any event listeners or resources
  console.log('Cleaning up preload script...');
});