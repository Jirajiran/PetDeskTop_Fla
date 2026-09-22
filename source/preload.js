const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  getScreenSize: () => ipcRenderer.invoke('get-screen-size'),
  getCursorPos: () => ipcRenderer.invoke('get-cursor-pos'),
  moveWindow: (petX, petY, winW, winH, anchor) => ipcRenderer.invoke('move-pet-window', petX, petY, winW, winH, anchor),
  moveWindowFast: (petX, petY, winW, winH, anchor) => {
    ipcRenderer.send('move-pet-window-fast', petX, petY, winW, winH, anchor);
  },
  getWindowPetPosition: () => ipcRenderer.invoke('get-window-pet-position'),
  enterDragMode: () => ipcRenderer.invoke('enter-drag-mode'),
  exitDragMode: () => ipcRenderer.invoke('exit-drag-mode'),
  setStartup: (enabled) => ipcRenderer.invoke('set-startup', enabled),
  getStartup: () => ipcRenderer.invoke('get-startup'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  snooze: (ms) => ipcRenderer.invoke('snooze', ms),
  restoreWindowShell: () => ipcRenderer.invoke('restore-window-shell'),
  onScreenChanged: (callback) => {
    ipcRenderer.on('screen-changed', () => callback());
  },
  onVisibilityChange: (callback) => {
    ipcRenderer.on('pet-visibility', (_event, visible) => callback(visible));
  },
  onForceInput: (callback) => {
    ipcRenderer.on('pet-force-input', () => callback());
  },
});
