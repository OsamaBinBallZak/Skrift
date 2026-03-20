'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // File dialog
  openFileDialog: (options) => ipcRenderer.invoke('dialog:openFiles', options),
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),
  openUploadDialog: () => ipcRenderer.invoke('dialog:openUpload'),
  classifyPaths: (paths) => ipcRenderer.invoke('paths:classify', paths),

  // System info
  getSystemInfo: () => ipcRenderer.invoke('system:getInfo'),

  // System theme
  getSystemTheme: () => ipcRenderer.invoke('theme:getSystem'),

  // Menu event: settings opened via Cmd+,
  onMenuPreferences: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('menu-preferences', handler);
    return () => ipcRenderer.removeListener('menu-preferences', handler);
  },
});
