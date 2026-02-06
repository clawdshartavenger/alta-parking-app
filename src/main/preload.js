/**
 * Preload script - Secure bridge between main and renderer processes
 * Exposes limited API via contextBridge for security
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alta', {
  saveCredentials: (creds) => ipcRenderer.invoke('save-credentials', creds),
  loadCredentials: () => ipcRenderer.invoke('load-credentials'),
  startMonitor: (config) => ipcRenderer.invoke('start-monitor', config),
  stopMonitor: () => ipcRenderer.invoke('stop-monitor'),
  onStatus: (callback) => {
    ipcRenderer.on('monitor-status', (event, data) => callback(data));
  },
  removeStatusListener: () => {
    ipcRenderer.removeAllListeners('monitor-status');
  }
});
