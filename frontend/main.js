const { app, BrowserWindow, ipcMain, dialog, shell, Menu, protocol, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { spawn } = require('child_process');

// Import utilities
const {
  getAssetPath,
  // getBuildResourcePath,  // Reserved for future use
  getIconPath,
  getUserDataPath,
  getLogsPath,
  getTempPath,
  ensureDirectoryExists,
  // getSafeFilename,  // Reserved for future use
  // getPreferencesPath,  // Reserved for future use
  getStatePath,
} = require('./src/lib/utils');

// ==========================================================================
// Application Configuration
// ==========================================================================

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = !isDevelopment;

// GPU and Performance Optimization Flags
if (isProduction) {
  // Common GPU and performance fixes - uncomment as needed
  
  // GPU acceleration fixes
  // app.commandLine.appendSwitch('enable-gpu-rasterization');
  // app.commandLine.appendSwitch('enable-zero-copy');
  // app.commandLine.appendSwitch('disable-gpu-sandbox');
  
  // Performance optimizations
  // app.commandLine.appendSwitch('max_old_space_size', '4096');
  // app.commandLine.appendSwitch('no-sandbox');
  
  // Hardware acceleration
  // app.commandLine.appendSwitch('enable-hardware-acceleration');
  // app.commandLine.appendSwitch('ignore-gpu-blacklist');
  
  // Memory optimization
  // app.commandLine.appendSwitch('memory-pressure-off');
  // app.commandLine.appendSwitch('max_old_space_size', '8192');
  
  // Disable features that can cause issues
  // app.commandLine.appendSwitch('disable-background-timer-throttling');
  // app.commandLine.appendSwitch('disable-renderer-backgrounding');
  // app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor');
}

// Platform-specific optimizations
if (process.platform === 'win32') {
  // Windows-specific flags
  // app.commandLine.appendSwitch('high-dpi-support', 'true');
  // app.commandLine.appendSwitch('force-device-scale-factor', '1');
}

if (process.platform === 'darwin') {
  // macOS-specific flags
  // app.commandLine.appendSwitch('enable-transparent-visuals');
  // app.commandLine.appendSwitch('disable-gpu-compositing');
}

// ==========================================================================
// Global Variables
// ==========================================================================

let mainWindow = null;
let isQuitting = false;
let childProcesses = new Map(); // Track child processes for cleanup
let windowState = {
  width: 1400,
  height: 900,
  x: undefined,
  y: undefined,
  isMaximized: false,
};

// ==========================================================================
// Utility Functions
// ==========================================================================

/**
 * Save window state to persistent storage
 */
async function saveWindowState() {
  if (!mainWindow) return;
  
  try {
    if (!mainWindow.isMaximized()) {
      const bounds = mainWindow.getBounds();
      windowState = {
        ...windowState,
        ...bounds,
        isMaximized: false,
      };
    } else {
      windowState.isMaximized = true;
    }
    
    await fs.writeFile(
      getStatePath(),
      JSON.stringify({ windowState }, null, 2),
      'utf8'
    );
  } catch (error) {
    console.error('Failed to save window state:', error);
  }
}

/**
 * Load window state from persistent storage
 */
async function loadWindowState() {
  try {
    const stateFile = await fs.readFile(getStatePath(), 'utf8');
    const state = JSON.parse(stateFile);
    
    if (state.windowState) {
      windowState = { ...windowState, ...state.windowState };
    }
  } catch (error) {
    // Use defaults if state file doesn't exist or is corrupted
    console.log('Using default window state');
  }
}

/**
 * Kill all child processes
 * This is called before the app quits to clean up backend processes
 */
function killChildProcesses() {
  console.log('Cleaning up child processes...');
  
  childProcesses.forEach((process, name) => {
    console.log(`Killing process: ${name}`);
    
    try {
      if (process && !process.killed) {
        // Try graceful shutdown first
        process.kill('SIGTERM');
        
        // Force kill after timeout
        setTimeout(() => {
          if (process && !process.killed) {
            process.kill('SIGKILL');
          }
        }, 5000);
      }
    } catch (error) {
      console.error(`Error killing process ${name}:`, error);
    }
  });
  
  childProcesses.clear();
}

/**
 * Spawn a child process and track it for cleanup
 * @param {string} name - Process name for tracking
 * @param {string} command - Command to run
 * @param {string[]} args - Command arguments
 * @param {object} options - Spawn options
 * @returns {ChildProcess} The spawned process
 */
// Reserved for future background process management
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function spawnTrackedProcess(name, command, args = [], options = {}) {
  console.log(`Spawning process: ${name}`);
  
  const childProcess = spawn(command, args, {
    detached: false,
    stdio: 'pipe',
    ...options,
  });
  
  // Track the process
  childProcesses.set(name, childProcess);
  
  // Handle process events
  childProcess.on('spawn', () => {
    console.log(`Process ${name} spawned successfully`);
  });
  
  childProcess.on('error', (error) => {
    console.error(`Process ${name} error:`, error);
    childProcesses.delete(name);
  });
  
  childProcess.on('exit', (code, signal) => {
    console.log(`Process ${name} exited with code ${code} and signal ${signal}`);
    childProcesses.delete(name);
  });
  
  return childProcess;
}

/**
 * Create application menu
 */
function createApplicationMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Add Audio Files',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-add-files');
            }
          },
        },
        {
          label: 'Add Folder',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-add-folder');
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Preferences',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-preferences');
            }
          },
        },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectall' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Pipeline',
      submenu: [
        {
          label: 'Start Batch Processing',
          accelerator: 'CmdOrCtrl+B',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-batch-process');
            }
          },
        },
        {
          label: 'Pause Processing',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-pause-process');
            }
          },
        },
        {
          label: 'Clear Pipeline',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-clear-pipeline');
            }
          },
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-about');
            }
          },
        },
        {
          label: 'Check for Updates',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-check-updates');
            }
          },
        },
      ],
    },
  ];

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });

    // Window menu
    template[5].submenu = [
      { role: 'close' },
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      { role: 'front' },
    ];
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * Create the main application window
 */
async function createMainWindow() {
  // Load saved window state
  await loadWindowState();
  
  // Ensure directories exist
  ensureDirectoryExists(getUserDataPath());
  ensureDirectoryExists(getLogsPath());
  ensureDirectoryExists(getTempPath());
  
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 1200,
    minHeight: 800,
    show: false, // Don't show until ready
    
    // Security settings
    webPreferences: {
      contextIsolation: true,        // Enable context isolation
      nodeIntegration: false,        // Disable node integration
      enableRemoteModule: false,     // Disable remote module
      preload: path.join(__dirname, 'preload.js'),
      
      // Security
      webSecurity: isProduction,     // Enable web security in production
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      
      // Performance
      backgroundThrottling: true,
      webgl: true,

      // Native spellcheck and context menu support
      spellcheck: true,
      
      // Development
      devTools: isDevelopment,
    },
    
    // Window styling
    // Use the standard macOS title bar to avoid content-overlay dragging quirks
    titleBarStyle: 'default',
    backgroundColor: '#f9fafb',
    autoHideMenuBar: isProduction,
    
    // Icon
    icon: getIconPath(),
    
    // Accessibility
    accessibleTitle: 'Voice Transcription Pipeline',
  });

  // Load the application
  if (isDevelopment) {
    // Development mode: load from Vite dev server
    const viteURL = 'http://localhost:3000';
    try {
      await mainWindow.loadURL(viteURL);
    } catch (error) {
      console.error('Failed to load from Vite dev server:', error);
      // Fallback to local file if Vite server is not running
      const indexPath = path.join(__dirname, 'index.html');
      await mainWindow.loadFile(indexPath);
    }
  } else {
    // Production mode: load from dist/index.html
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    console.log('Loading from:', indexPath);
    try {
      await mainWindow.loadFile(indexPath);
    } catch (error) {
      console.error('Failed to load index.html:', error);
      console.error('Current directory:', __dirname);
      const fs = require('fs');
      try {
        const files = fs.readdirSync(__dirname);
        console.log('Files in __dirname:', files);
        if (fs.existsSync(path.join(__dirname, 'dist'))) {
          const distFiles = fs.readdirSync(path.join(__dirname, 'dist'));
          console.log('Files in dist directory:', distFiles);
        }
      } catch (listError) {
        console.error('Error listing files:', listError);
      }
      throw error;
    }
  }

  // Configure spellchecker languages (default to British + US English)
  try {
    mainWindow.webContents.session.setSpellCheckerLanguages(['en-GB', 'en-US']);
  } catch (e) {
    console.warn('SpellChecker languages not set:', e?.message || e);
  }

  // Provide a native context menu with spelling suggestions and edit roles
  mainWindow.webContents.on('context-menu', (event, params) => {
    const template = [];

    // Spelling suggestions
    if (params.misspelledWord && Array.isArray(params.dictionarySuggestions) && params.dictionarySuggestions.length) {
      for (const s of params.dictionarySuggestions) {
        template.push({ label: s, click: () => mainWindow.webContents.replaceMisspelling(s) });
      }
      template.push({ type: 'separator' });
      template.push({ label: 'Learn Spelling', click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord) });
      template.push({ type: 'separator' });
    }

    // Edit roles
    if (params.isEditable) {
      template.push(
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { type: 'separator' }, { role: 'selectAll' },
      );
    } else {
      // Non-editable: still allow copy/select all
      template.push({ role: 'copy' }, { type: 'separator' }, { role: 'selectAll' });
    }

    if (template.length > 0) {
      const menu = Menu.buildFromTemplate(template);
      menu.popup({ window: mainWindow });
    }
  });

  // Development tools
  if (isDevelopment) {
    mainWindow.webContents.openDevTools();
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    if (windowState.isMaximized) {
      mainWindow.maximize();
    }
    mainWindow.show();
    mainWindow.focus();
  });

  // Window event handlers
  mainWindow.on('close', async (event) => {
    if (process.platform === 'darwin' && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return;
    }
    
    await saveWindowState();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Save window state on resize/move
  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
  mainWindow.on('maximize', saveWindowState);
  mainWindow.on('unmaximize', saveWindowState);

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Security: prevent navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
    }
  });

  return mainWindow;
}

// ==========================================================================
// App Event Handlers
// ==========================================================================

// Security: prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });
});

// App ready
app.whenReady().then(async () => {
  // Set up protocol handlers
  protocol.registerFileProtocol('file', (request, callback) => {
    const pathname = decodeURI(request.url.replace('file:///', ''));
    callback(pathname);
  });

  await createMainWindow();
  createApplicationMenu();

  // macOS: recreate window when dock icon is clicked
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

// Window management
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// App lifecycle
app.on('before-quit', async (event) => {
  isQuitting = true;
  
  // Clean up child processes
  if (childProcesses.size > 0) {
    event.preventDefault();
    
    console.log('Cleaning up before quit...');
    killChildProcesses();
    
    // Wait for processes to clean up
    setTimeout(() => {
      app.quit();
    }, 3000);
  }
});

// Error handling
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (isDevelopment) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

// ==========================================================================
// IPC Handlers
// ==========================================================================

// System information
ipcMain.handle('system:getInfo', async () => {
  return {
    platform: process.platform === 'darwin' ? 'Big Money Hartog' : process.platform,
    arch: process.arch,
    version: process.version,
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    chromeVersion: process.versions.chrome,
    isDevelopment,
    isProduction,
  };
});

// System resources
ipcMain.handle('system:getResources', async () => {
  const cpuUsage = process.getCPUUsage();
  const memoryUsage = process.getProcessMemoryInfo();
  
  return {
    cpu: {
      percentCPUUsage: cpuUsage.percentCPUUsage,
      idleWakeupsPerSecond: cpuUsage.idleWakeupsPerSecond,
    },
    memory: {
      workingSetSize: Math.round(memoryUsage.workingSetSize / 1024 / 1024),
      peakWorkingSetSize: Math.round(memoryUsage.peakWorkingSetSize / 1024 / 1024),
      privateBytes: Math.round(memoryUsage.privateBytes / 1024 / 1024),
    },
    system: {
      totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024),
      freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024),
      loadAverage: os.loadavg(),
      uptime: os.uptime(),
    },
  };
});

// File dialogs
ipcMain.handle('dialog:selectFiles', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  
  return result;
});

ipcMain.handle('dialog:selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  
  return result;
});

ipcMain.handle('dialog:saveFile', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: options.filters || [
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    defaultPath: options.defaultPath || 'transcript.txt',
  });
  
  return result;
});

// File operations
ipcMain.handle('file:read', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const stats = await fs.stat(filePath);
    
    return {
      success: true,
      content,
      size: stats.size,
      modified: stats.mtime,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle('file:write', async (event, filePath, content) => {
  try {
    await fs.writeFile(filePath, content, 'utf8');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
});

// Asset paths
ipcMain.handle('assets:getPath', async (event, assetPath) => {
  return getAssetPath(assetPath);
});

// Pipeline operations (placeholders for backend integration)
ipcMain.handle('pipeline:startTranscription', async (event, fileId, options) => {
  console.log('Starting transcription:', fileId, options);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const body = { conversationMode: !!(options && options.conversationMode) };
    const res = await fetch(`http://localhost:8000/api/process/transcribe/${encodeURIComponent(fileId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText} ${err}`);
    }
    const data = await res.json().catch(() => ({}));
    return { success: true, jobId: fileId, ...data };
  } catch (error) {
    console.error('Transcription IPC error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('pipeline:startSanitise', async (event, fileId) => {
  console.log('Starting sanitise:', fileId);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`http://localhost:8000/api/process/sanitise/${fileId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText} ${err}`);
    }
    const data = await res.json().catch(() => ({}));
    return { success: true, jobId: `sanitise-${Date.now()}`, ...data };
  } catch (error) {
    console.error('Sanitise IPC error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('pipeline:startEnhancement', async (event, fileId, enhancements) => {
  console.log('Starting enhancement:', fileId, enhancements);
  
  // TODO: Integrate with your backend enhancement service
  
  return { success: true, jobId: `enhancement-${Date.now()}` };
});

ipcMain.handle('pipeline:startExport', async (event, fileId, format) => {
  console.log('Starting export:', fileId, format);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const body = { exportFormat: String(format || 'markdown') };
    const res = await fetch(`http://localhost:8000/api/process/export/${encodeURIComponent(fileId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText} ${err}`);
    }
    const data = await res.json().catch(() => ({}));
    return { success: true, jobId: fileId, ...data };
  } catch (error) {
    console.error('Export IPC error:', error);
    return { success: false, error: error.message };
  }
});

// App control
ipcMain.handle('app:quit', async () => {
  isQuitting = true;
  app.quit();
});

ipcMain.handle('app:minimize', async () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.handle('app:toggleDevTools', async () => {
  if (mainWindow) {
    mainWindow.webContents.toggleDevTools();
  }
});

// Theme
ipcMain.handle('theme:getSystemTheme', async () => {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
});

ipcMain.handle('theme:setTheme', async (event, theme) => {
  nativeTheme.themeSource = theme;
  return theme;
});

// ==========================================================================
// Error Handling
// ==========================================================================

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  
  if (isProduction) {
    dialog.showErrorBox('Unexpected Error', `An unexpected error occurred: ${error.message}`);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown
const cleanup = async () => {
  console.log('Performing cleanup...');
  killChildProcesses();
  await saveWindowState();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);