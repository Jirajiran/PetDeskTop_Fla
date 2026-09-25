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
  getMovementLock: () => ipcRenderer.invoke('get-movement-lock'),
  setMovementLock: (enabled) => ipcRenderer.invoke('set-movement-lock', enabled),
  getPetSizeLevel: () => ipcRenderer.invoke('get-pet-size-level'),
  setPetSizeLevel: (level) => ipcRenderer.invoke('set-pet-size-level', level),
  getLocale: () => ipcRenderer.invoke('get-locale'),
  setLocale: (code) => ipcRenderer.invoke('set-locale', code),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  snooze: (ms) => ipcRenderer.invoke('snooze', ms),
  restoreWindowShell: () => ipcRenderer.invoke('restore-window-shell'),
  awarenessSpeechDone: (thenQuit) => ipcRenderer.invoke('awareness-speech-done', !!thenQuit),
  shellReady: (reason) => ipcRenderer.invoke('shell-ready', reason || ''),
  trayIdleReady: () => ipcRenderer.invoke('tray-idle-ready'),
  trayIdleReject: () => ipcRenderer.invoke('tray-idle-reject'),
  setShowSpeechGate: (active) => ipcRenderer.invoke('show-speech-gate', !!active),
  setAwarenessGate: (active) => ipcRenderer.invoke('awareness-gate', !!active),
  stageHardReset: () => ipcRenderer.invoke('stage-hard-reset'),
  onScreenChanged: (callback) => {
    ipcRenderer.on('screen-changed', () => callback());
  },
  onVisibilityChange: (callback) => {
    ipcRenderer.on('pet-visibility', (_event, visible) => callback(visible));
  },
  onForceInput: (callback) => {
    ipcRenderer.on('pet-force-input', () => callback());
  },
  onMovementLock: (callback) => {
    ipcRenderer.on('pet-movement-lock', (_event, locked) => callback(!!locked));
  },
  onPetSizeLevel: (callback) => {
    ipcRenderer.on('pet-size-level', (_event, level) => callback(level));
  },
  onPetSizeSync: (callback) => {
    ipcRenderer.on('pet-size-sync', (_event, level) => callback(level));
  },
  onLocale: (callback) => {
    ipcRenderer.on('pet-locale', (_event, pack) => callback(pack || {}));
  },
  onLocaleSync: (callback) => {
    ipcRenderer.on('pet-locale-sync', (_event, pack) => callback(pack || {}));
  },
  onShellBusy: (callback) => {
    ipcRenderer.on('pet-shell-busy', (_event, busy) => callback(!!busy));
  },
  onTrayPrepare: (callback) => {
    ipcRenderer.on('pet-tray-prepare', () => callback());
  },
  onAwarenessSpeak: (callback) => {
    ipcRenderer.on('awareness-speak', (_event, payload) => callback(payload || {}));
  },
  onAwarenessForceQuit: (callback) => {
    ipcRenderer.on('awareness-force-quit', () => callback());
  },
});
