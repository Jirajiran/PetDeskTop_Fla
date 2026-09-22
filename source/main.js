const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  Tray,
  Menu,
  nativeImage,
  shell,
  dialog,
} = require('electron');
const path = require('path');
const fs = require('fs');

const APP_NAME = 'Fla_petDesktop_V32';
const APP_VERSION = '32.0.0';
const PET_SIZE = 72;
const WINDOW_WIDTH = 88;
const WINDOW_HEIGHT = 120;
const ALWAYS_ON_TOP_LEVEL = 'screen-saver';

let mainWindow = null;
let tray = null;
let snoozeTimer = null;
let snoozeResolve = null;
let dragMoveListener = null;
/** Soft-hide: opacity 0 + bottom layer (window stays alive, not BrowserWindow.hide). */
let petVisuallyHidden = false;

function clearSnoozeWait() {
  if (snoozeTimer) {
    clearTimeout(snoozeTimer);
    snoozeTimer = null;
  }
  if (snoozeResolve) {
    const resolve = snoozeResolve;
    snoozeResolve = null;
    resolve();
  }
}

function logMain(context, err) {
  console.error(`[${APP_NAME} v${APP_VERSION} Main] ${context}:`, err);
}

process.on('uncaughtException', (err) => logMain('uncaughtException', err));
process.on('unhandledRejection', (err) => logMain('unhandledRejection', err));

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function getWorkArea() {
  return screen.getPrimaryDisplay().workArea;
}

function applyAlwaysOnTop(win) {
  if (!win || win.isDestroyed()) return;
  if (petVisuallyHidden) return;
  win.setAlwaysOnTop(true, ALWAYS_ON_TOP_LEVEL);
}

function applyHiddenVisual(win) {
  if (!win || win.isDestroyed()) return;
  win.setOpacity(0);
  win.setIgnoreMouseEvents(true);
  win.setAlwaysOnTop(false);
}

function applyVisibleVisual(win) {
  if (!win || win.isDestroyed()) return;
  win.setIgnoreMouseEvents(false);
  win.setOpacity(1);
  applyAlwaysOnTop(win);
}

function restorePetWindowShell(win) {
  if (!win || win.isDestroyed()) return;

  win.setMenu(null);
  win.setSkipTaskbar(true);
  win.setFocusable(false);
  win.setBackgroundColor('#00000000');
  win.setHasShadow(false);

  if (typeof win.setVisibleOnAllWorkspaces === 'function') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  if (!petVisuallyHidden) {
    win.setAlwaysOnTop(false);
    win.setAlwaysOnTop(true, ALWAYS_ON_TOP_LEVEL);
  }
}

function restorePetWindowBounds(win) {
  if (!win || win.isDestroyed()) return;

  const { petX, petY, width, height } = getWindowPetPosition(win);
  movePetWindow(
    win,
    petX,
    petY,
    width || WINDOW_WIDTH,
    height || WINDOW_HEIGHT,
    'bottom',
  );
}

function restorePetWindow(win) {
  restorePetWindowShell(win);
  restorePetWindowBounds(win);
}

function petToWindowBounds(petX, petY, winW, winH, anchor = 'bottom') {
  const w = Math.round(winW);
  const h = Math.round(winH);
  let x = Math.round(petX);
  let y = Math.round(petY);

  if (w > PET_SIZE || h > PET_SIZE) {
    x = Math.round(petX - (w - PET_SIZE) / 2);
    if (anchor === 'center') {
      y = Math.round(petY - (h - PET_SIZE) / 2);
    } else {
      y = Math.round(petY - (h - PET_SIZE));
    }
  }

  return { x, y, width: w, height: h };
}

function windowBoundsToPet(bounds, winW, winH, anchor = 'bottom') {
  const w = Math.round(winW);
  const h = Math.round(winH);
  let petX = Math.round(bounds.x);
  let petY = Math.round(bounds.y);

  if (w > PET_SIZE || h > PET_SIZE) {
    petX = Math.round(bounds.x + (w - PET_SIZE) / 2);
    if (anchor === 'center') {
      petY = Math.round(bounds.y + (h - PET_SIZE) / 2);
    } else {
      petY = Math.round(bounds.y + (h - PET_SIZE));
    }
  }

  return { petX, petY };
}

function clampWindowToWorkArea(bounds, area) {
  let { x, y, width, height } = bounds;
  x = Math.max(0, Math.min(x, area.width - width));
  y = Math.max(0, Math.min(y, area.height - height));
  return { x, y, width, height };
}

function movePetWindow(win, petX, petY, winW, winH, anchor = 'bottom') {
  if (!win || win.isDestroyed()) return;

  const area = getWorkArea();
  const bounds = clampWindowToWorkArea(
    petToWindowBounds(petX, petY, winW, winH, anchor),
    area
  );

  const absX = area.x + bounds.x;
  const absY = area.y + bounds.y;

  let cur = null;
  try {
    cur = win.getBounds();
  } catch (err) {
    cur = null;
  }

  if (
    cur
    && cur.width === bounds.width
    && cur.height === bounds.height
    && typeof win.setPosition === 'function'
  ) {
    win.setPosition(absX, absY);
  } else {
    win.setBounds({
      x: absX,
      y: absY,
      width: bounds.width,
      height: bounds.height,
    });
  }
  // Always-on-top is applied on show/restore/drag enter — not every move.
}

function getWindowPetPosition(win) {
  if (!win || win.isDestroyed()) {
    return { petX: 0, petY: 0, width: PET_SIZE, height: PET_SIZE };
  }

  const area = getWorkArea();
  const b = win.getBounds();
  const rel = windowBoundsToPet(
    { x: b.x - area.x, y: b.y - area.y },
    b.width,
    b.height,
    'bottom'
  );

  return {
    petX: rel.petX,
    petY: rel.petY,
    width: b.width,
    height: b.height,
  };
}

function enterDragMode(win) {
  if (!win || win.isDestroyed()) return;

  applyAlwaysOnTop(win);

  if (dragMoveListener) {
    win.removeListener('move', dragMoveListener);
  }
  dragMoveListener = () => applyAlwaysOnTop(win);
  win.on('move', dragMoveListener);
}

function exitDragMode(win) {
  if (!win || win.isDestroyed()) return;

  if (dragMoveListener) {
    win.removeListener('move', dragMoveListener);
    dragMoveListener = null;
  }
  applyAlwaysOnTop(win);
}

function hidePetWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  // Soft-hide: keep process + window alive; only hide visually and block hits.
  petVisuallyHidden = true;
  mainWindow.webContents.send('pet-visibility', false);

  if (!mainWindow.isVisible()) {
    mainWindow.showInactive();
  }
  applyHiddenVisual(mainWindow);
}

function showPetWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  // Resolve any snooze waiter (tray show or timer) before restoring UI.
  clearSnoozeWait();

  petVisuallyHidden = false;

  if (!mainWindow.isVisible()) {
    mainWindow.showInactive();
  }

  restorePetWindowShell(mainWindow);
  applyVisibleVisual(mainWindow);
  restorePetWindowBounds(mainWindow);

  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !petVisuallyHidden) {
      applyVisibleVisual(mainWindow);
      restorePetWindowBounds(mainWindow);
    }
  }, 50);

  // Same reverse path: opacity + layer first, then resume stages in renderer.
  mainWindow.webContents.send('pet-visibility', true);
  mainWindow.webContents.send('screen-changed');
}

function createWindow() {
  const area = getWorkArea();

  mainWindow = new BrowserWindow({
    x: area.x + Math.round(area.width / 2 - WINDOW_WIDTH / 2),
    y: area.y + Math.round(area.height - WINDOW_HEIGHT - 60),
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    show: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
  });

  mainWindow.loadFile('index.html');
  mainWindow.setMenu(null);
  applyAlwaysOnTop(mainWindow);

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setFocusable(false);
      showPetWindow();
    }
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logMain('render-process-gone', details);
    if (details.reason === 'clean-exit') return;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadFile('index.html');
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, desc) => {
    logMain('did-fail-load', `${code}: ${desc}`);
  });

  mainWindow.webContents.on('context-menu', (event) => {
    event.preventDefault();
  });

  mainWindow.on('system-context-menu', (event) => {
    event.preventDefault();
  });

  mainWindow.on('show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      restorePetWindowShell(mainWindow);
    }
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      hidePetWindow();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'PetPicture', 'right.png');
  let icon = nativeImage.createFromPath(iconPath);

  if (icon.isEmpty()) {
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFklEQVQ4T2NkYGD4z0ABYBw1gGE0AAD//wMABhMBBf1nW5wAAAAASUVORK5CYII='
    );
  } else {
    icon = icon.resize({ width: 32, height: 32 });
  }

  tray = new Tray(icon);
  updateTrayMenu();
}

function launchUninstaller() {
  if (!app.isPackaged) {
    dialog.showMessageBox({
      type: 'info',
      title: APP_NAME,
      message: 'ถอนการติดตั้งใช้ได้เฉพาะเมื่อติดตั้งจาก Setup แล้ว',
      detail: 'ตอนรันด้วย npm start จะไม่ลบอะไร (และไม่แตะไฟล์ Setup ในโปรเจกต์)',
    }).catch((err) => logMain('launchUninstaller dialog', err));
    return;
  }

  const installDir = path.dirname(process.execPath);
  const candidates = [
    path.join(installDir, `Uninstall ${APP_NAME}.exe`),
    path.join(installDir, 'Uninstall.exe'),
    path.join(installDir, 'uninstall.exe'),
  ];
  const uninstaller = candidates.find((p) => fs.existsSync(p));

  if (!uninstaller) {
    dialog.showMessageBox({
      type: 'warning',
      title: APP_NAME,
      message: 'ไม่พบตัวถอนการติดตั้ง',
      detail: installDir,
    }).catch((err) => logMain('launchUninstaller missing', err));
    return;
  }

  // Open NSIS uninstaller (removes installed app only — not the Setup .exe in the repo).
  shell.openPath(uninstaller).then((errMsg) => {
    if (errMsg) {
      logMain('launchUninstaller openPath', errMsg);
      dialog.showErrorBox(APP_NAME, `เปิดตัวถอนการติดตั้งไม่สำเร็จ:\n${errMsg}`);
      return;
    }
    app.isQuitting = true;
    clearSnoozeWait();
    app.quit();
  });
}

function updateTrayMenu() {
  const startupEnabled = app.getLoginItemSettings().openAtLogin;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'แสดง Pet',
      click: () => showPetWindow(),
    },
    {
      label: 'ซ่อน Pet',
      click: () => hidePetWindow(),
    },
    { type: 'separator' },
    {
      label: 'เปิดพร้อมระบบ',
      type: 'checkbox',
      checked: startupEnabled,
      click: (item) => {
        app.setLoginItemSettings({
          openAtLogin: item.checked,
          path: process.execPath,
          args: app.isPackaged ? [] : [path.resolve(process.argv[1])],
        });
      },
    },
    { type: 'separator' },
    {
      label: 'ถอนการติดตั้ง',
      click: () => launchUninstaller(),
    },
    {
      label: 'ออก',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip(`${APP_NAME} v${APP_VERSION}`);
  tray.setContextMenu(contextMenu);
}

function setupIpc() {
  ipcMain.handle('move-pet-window', (event, petX, petY, winW, winH, anchor) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      movePetWindow(win, petX, petY, winW || WINDOW_WIDTH, winH || WINDOW_HEIGHT, anchor || 'bottom');
    } catch (err) {
      logMain('move-pet-window', err);
    }
  });

  ipcMain.on('move-pet-window-fast', (event, petX, petY, winW, winH, anchor) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) return;
      movePetWindow(win, petX, petY, winW || WINDOW_WIDTH, winH || WINDOW_HEIGHT, anchor || 'bottom');
    } catch (err) {
      logMain('move-pet-window-fast', err);
    }
  });

  ipcMain.handle('get-window-pet-position', (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      return getWindowPetPosition(win);
    } catch (err) {
      logMain('get-window-pet-position', err);
      return { petX: 0, petY: 0, width: PET_SIZE, height: PET_SIZE };
    }
  });

  ipcMain.handle('enter-drag-mode', (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      enterDragMode(win);
    } catch (err) {
      logMain('enter-drag-mode', err);
    }
  });

  ipcMain.handle('exit-drag-mode', (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      exitDragMode(win);
    } catch (err) {
      logMain('exit-drag-mode', err);
    }
  });

  ipcMain.handle('restore-window-shell', (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      restorePetWindow(win);
    } catch (err) {
      logMain('restore-window-shell', err);
    }
  });

  ipcMain.handle('get-screen-size', () => {
    try {
      const area = getWorkArea();
      return {
        x: area.x,
        y: area.y,
        width: area.width,
        height: area.height,
        petSize: PET_SIZE,
      };
    } catch (err) {
      logMain('get-screen-size', err);
      return { x: 0, y: 0, width: 1920, height: 1080, petSize: PET_SIZE };
    }
  });

  ipcMain.handle('get-cursor-pos', () => {
    try {
      const area = getWorkArea();
      const p = screen.getCursorScreenPoint();
      return {
        x: p.x - area.x,
        y: p.y - area.y,
        screenX: p.x,
        screenY: p.y,
      };
    } catch (err) {
      logMain('get-cursor-pos', err);
      return { x: 0, y: 0, screenX: 0, screenY: 0 };
    }
  });

  ipcMain.handle('set-startup', (_event, enabled) => {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: app.isPackaged ? [] : [path.resolve(process.argv[1])],
    });
    updateTrayMenu();
    return enabled;
  });

  ipcMain.handle('get-startup', () => {
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle('quit-app', () => {
    app.isQuitting = true;
    clearSnoozeWait();
    app.quit();
  });

  ipcMain.handle('snooze', async (event, ms) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) return;

      const delay = Math.max(0, Number(ms) || 0);

      // Wait until shown again (timer or tray "แสดง Pet").
      await new Promise((resolve) => {
        clearSnoozeWait();
        snoozeResolve = resolve;
        hidePetWindow();
        snoozeTimer = setTimeout(() => {
          snoozeTimer = null;
          showPetWindow();
        }, delay);
      });
    } catch (err) {
      logMain('snooze', err);
    }
  });
}

if (gotLock) {
  app.on('second-instance', () => showPetWindow());

  app.whenReady().then(() => {
    setupIpc();
    createWindow();
    createTray();

    screen.on('display-metrics-changed', () => {
      if (mainWindow && !mainWindow.isDestroyed() && !petVisuallyHidden) {
        mainWindow.webContents.send('screen-changed');
      }
    });

    if (app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath,
      });
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else {
        showPetWindow();
      }
    });
  }).catch((err) => logMain('whenReady', err));

  app.on('window-all-closed', () => {
    // Keep running in system tray
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
    clearSnoozeWait();
  });
}
