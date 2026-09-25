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
const awareness = require('./awareness');
const i18n = require('./i18n');

const APP_NAME = 'Fla_petDesktop_V34';
const APP_VERSION = '34.0.0';
/** Size 1 = original footprint (before 200px experiment). */
const BASE_PET_SIZE = 72;
const BASE_WINDOW_WIDTH = 88;
const BASE_WINDOW_HEIGHT = 120;
const ALWAYS_ON_TOP_LEVEL = 'screen-saver';
const LOCALE_FILE = 'pet-locale.json';
const SIZE_FILE = 'pet-size.json';
/** Closed Size cases — only 1..8 are valid (default 1). */
const SIZE_CASE_MIN = 1;
const SIZE_CASE_MAX = 8;
/** Closed locale cases — th/en/zh only (tray treats as 1..3). */
const LOCALE_CASES = ['th', 'en', 'zh'];

let mainWindow = null;
/** @type {{ action: string, text?: string }} */
let awarenessBoot = { action: 'run' };
let tray = null;
let snoozeTimer = null;
let snoozeResolve = null;
let dragMoveListener = null;
/** Soft-hide: opacity 0 + ignore-mouse (window stays alive, not BrowserWindow.hide). Always-on-top stays on. */
let petVisuallyHidden = false;
/** Set once at boot — never re-toggled on show/hide (toggling pulls other apps forward on Windows). */
let alwaysOnTopBooted = false;
let mouseAcceptTimers = [];
/** Tray lock: pet stays put (no AI pathing); drag still allowed. */
let movementLocked = false;
/** Tray Size 1..8 — scale = 1 + (level-1)*0.2 */
let petSizeLevel = 1;
let PET_SIZE = BASE_PET_SIZE;
let WINDOW_WIDTH = BASE_WINDOW_WIDTH;
let WINDOW_HEIGHT = BASE_WINDOW_HEIGHT;
/** th | en | zh */
let petLocale = i18n.DEFAULT_LOCALE;
/** Drop rapid tray/IPC while show/hide/size/locale settle. */
let shellBusy = false;
let shellBusyToken = 0;
let shellBusyTimer = null;
let shellBusyMinTimer = null;
let shellBusyStartedAt = 0;
const SHELL_BUSY_MIN_MS = 700;
const SHELL_BUSY_MAX_MS = 12000;
/**
 * Tray external op slot (latest wins) — only while Stage other / shell drain.
 * Show + Awareness: never store here (refuse at gate).
 * @type {null | { kind: 'show' | 'hide' | 'size' | 'locale', value?: any }}
 */
let pendingTrayOp = null;
let trayPrepareWaiting = false;
let trayPrepareTimer = null;
/** Tray popup is single-flight — second right-click while open does not stack another menu. */
let trayMenuOpen = false;
/** Boot: awareness waits until first show shellBusy closes (open→close pair). */
let rendererLoaded = false;
let awarenessStarted = false;
let bootShowStarted = false;
/** Soft-show intro (แนะนำตัว) — blocks general awareness; porn ignores this. */
let showSpeechActive = false;
/** Renderer awareness priority (keepPriority gaps) — same protect class as Show. */
let awarenessGateActive = false;
/**
 * Size/locale: do not persist until shell-ready success.
 * @type {null | { kind: 'size' | 'locale', previous: any, next: any }}
 */
let settingsPersistPending = null;

function roundHalfUp(x) {
  return Math.floor(Number(x) + 0.5);
}

/** @returns {number} Size case 1..8 */
function normalizeSizeCase(level) {
  const n = Math.floor(Number(level));
  switch (true) {
    case n >= SIZE_CASE_MIN && n <= SIZE_CASE_MAX:
      return n;
    default:
      return SIZE_CASE_MIN;
  }
}

/** @returns {'th'|'en'|'zh'} Locale case */
function normalizeLocaleCase(code) {
  const c = String(code || '').toLowerCase();
  switch (c) {
    case 'th':
    case 'en':
    case 'zh':
      return c;
    default:
      return i18n.DEFAULT_LOCALE;
  }
}

/** Update window geometry from level. Does not change committed petSizeLevel. */
function applySizeGeometry(level) {
  const n = normalizeSizeCase(level);
  const scale = 1 + (n - 1) * 0.2;
  PET_SIZE = Math.max(1, roundHalfUp(BASE_PET_SIZE * scale));
  WINDOW_WIDTH = Math.max(1, roundHalfUp(BASE_WINDOW_WIDTH * scale));
  WINDOW_HEIGHT = Math.max(1, roundHalfUp(BASE_WINDOW_HEIGHT * scale));
  return n;
}

/** Commit size level + geometry (boot / successful settle / rollback). */
function applySizeLevel(level) {
  petSizeLevel = applySizeGeometry(level);
}

function localeFilePath() {
  try {
    return path.join(app.getPath('userData'), LOCALE_FILE);
  } catch (_) {
    return path.join(require('os').tmpdir(), LOCALE_FILE);
  }
}

function sizeFilePath() {
  try {
    return path.join(app.getPath('userData'), SIZE_FILE);
  } catch (_) {
    return path.join(require('os').tmpdir(), SIZE_FILE);
  }
}

function loadSavedLocale() {
  try {
    const p = localeFilePath();
    if (!fs.existsSync(p)) return i18n.DEFAULT_LOCALE;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return normalizeLocaleCase(raw.locale);
  } catch (_) {
    return i18n.DEFAULT_LOCALE;
  }
}

function saveLocale() {
  try {
    const p = localeFilePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ locale: petLocale }, null, 2), 'utf8');
  } catch (err) {
    logMain('saveLocale', err);
  }
}

function loadSavedSizeLevel() {
  try {
    const p = sizeFilePath();
    if (!fs.existsSync(p)) return SIZE_CASE_MIN;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return normalizeSizeCase(raw.sizeLevel);
  } catch (_) {
    return SIZE_CASE_MIN;
  }
}

function saveSizeLevel() {
  try {
    const p = sizeFilePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ sizeLevel: petSizeLevel }, null, 2), 'utf8');
  } catch (err) {
    logMain('saveSizeLevel', err);
  }
}

/**
 * Restart after Size/locale (or manual Tray relaunch).
 * app.relaunch only schedules the next run — must exit current process.
 */
function relaunchForTraySettings(reason) {
  try {
    logMain('relaunchForTraySettings', new Error(String(reason || 'settings')));
  } catch (_) { /* ignore */ }
  app.isQuitting = true;
  clearSnoozeWait();
  try {
    awareness.stopPolling();
  } catch (err) {
    logMain('relaunch stopPolling', err);
  }
  try {
    app.relaunch();
  } catch (err) {
    logMain('app.relaunch', err);
  }
  app.exit(0);
}

function notifyLocale() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('pet-locale', i18n.packForRenderer());
}

/**
 * Size/ภาษา: จำดิสก์แล้ว relaunch+exit — ไม่ใช้ท่อ soft (รั่ว stage ไล่ไม่หมด).
 * ค่าเท่าเดิม = no-op.
 */
function setPetLocale(code) {
  const next = normalizeLocaleCase(code);
  if (next === petLocale) return petLocale;
  petLocale = next;
  i18n.loadLocale(next);
  try {
    awareness.setLocale(next);
  } catch (err) {
    logMain('setPetLocale awareness', err);
  }
  saveLocale();
  relaunchForTraySettings('locale');
  return petLocale;
}

function setPetLocaleNow(code) {
  // Legacy soft-pipe entry — Size/locale no longer use tray queue.
  setPetLocale(code);
  return true;
}

function notifyPetSize(level = petSizeLevel) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('pet-size-level', normalizeSizeCase(level));
}

/**
 * Size/ภาษา: จำดิสก์แล้ว relaunch+exit — ไม่ใช้ท่อ soft.
 */
function setPetSizeLevel(level) {
  const next = normalizeSizeCase(level);
  if (next === petSizeLevel) return petSizeLevel;
  applySizeLevel(next);
  saveSizeLevel();
  relaunchForTraySettings('size');
  return petSizeLevel;
}

function setPetSizeLevelNow(level) {
  // Legacy soft-pipe entry — Size/locale no longer use tray queue.
  setPetSizeLevel(level);
  return true;
}

applySizeLevel(1);

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

function clearMouseAcceptTimers() {
  for (const id of mouseAcceptTimers) clearTimeout(id);
  mouseAcceptTimers = [];
}

/**
 * Hard-clear Windows stuck setIgnoreMouseEvents(true).
 * Order matters: opacity must be visible-ish before accept-mouse sticks on some builds.
 */
function forceAcceptMouseEvents(win) {
  if (!win || win.isDestroyed()) return;
  if (petVisuallyHidden) return;

  const punch = () => {
    if (!win || win.isDestroyed() || petVisuallyHidden) return;
    try {
      win.setOpacity(1);
      // Toggle sequence — single false is often ignored after a long ignore=true.
      win.setIgnoreMouseEvents(false);
      win.setIgnoreMouseEvents(true);
      win.setIgnoreMouseEvents(false);
      win.setIgnoreMouseEvents(false);
    } catch (err) {
      logMain('forceAcceptMouseEvents', err);
    }
  };

  punch();
  clearMouseAcceptTimers();
  for (const ms of [0, 16, 32, 50, 100, 200, 400]) {
    mouseAcceptTimers.push(setTimeout(punch, ms));
  }
}

function logMain(context, err) {
  console.error(`[${APP_NAME} v${APP_VERSION} Main] ${context}:`, err);
}

function clearShellBusyTimers() {
  if (shellBusyTimer) {
    clearTimeout(shellBusyTimer);
    shellBusyTimer = null;
  }
  if (shellBusyMinTimer) {
    clearTimeout(shellBusyMinTimer);
    shellBusyMinTimer = null;
  }
}

function notifyShellBusy(busy) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send('pet-shell-busy', !!busy);
  } catch (err) {
    logMain('notifyShellBusy', err);
  }
}

/** @returns {boolean} false = already loading, drop the click */
function beginShellOp(reason) {
  if (shellBusy) {
    logMain('shellBusy drop', new Error(String(reason || 'op')));
    return false;
  }
  shellBusy = true;
  shellBusyStartedAt = Date.now();
  const token = ++shellBusyToken;
  clearShellBusyTimers();
  shellBusyTimer = setTimeout(() => {
    endShellOp(token, 'timeout');
  }, SHELL_BUSY_MAX_MS);
  notifyShellBusy(true);
  if (tray) updateTrayMenu();
  return true;
}

function endShellOp(token, why, detail = '') {
  if (token != null && token !== shellBusyToken) return;
  if (!shellBusy) return;

  const finish = () => {
    if (token != null && token !== shellBusyToken) return;
    settleSettingsPersist(why, detail);
    shellBusy = false;
    clearShellBusyTimers();
    notifyShellBusy(false);
    if (tray) updateTrayMenu();
    // Boot open→close: only then start awareness (no speak/poll fighting show pipe).
    tryStartAwarenessAfterShell();
    // External tray ops wait behind shell — drain queue when free (Stage other only).
    beginTrayPrepareIfNeeded();
  };

  const elapsed = Date.now() - shellBusyStartedAt;
  if (elapsed < SHELL_BUSY_MIN_MS) {
    shellBusyMinTimer = setTimeout(finish, SHELL_BUSY_MIN_MS - elapsed);
  } else {
    finish();
  }
}

/** Commit Size/locale only after successful rebootstrap; else rollback — no disk write of failed value. */
function isSettingsCommitSuccess(kind, why, detail) {
  if (why !== 'renderer') return false;
  const d = String(detail || '');
  if (kind === 'size') return d === 'size-rebootstrap';
  if (kind === 'locale') return d === 'locale-rebootstrap';
  return false;
}

function settleSettingsPersist(why, detail = '') {
  const pending = settingsPersistPending;
  if (!pending) return;
  settingsPersistPending = null;

  if (isSettingsCommitSuccess(pending.kind, why, detail)) {
    if (pending.kind === 'size') {
      petSizeLevel = pending.next;
      applySizeGeometry(pending.next);
      saveSizeLevel();
    } else if (pending.kind === 'locale') {
      petLocale = pending.next;
      i18n.loadLocale(petLocale);
      saveLocale();
      try {
        awareness.setLocale(petLocale);
      } catch (err) {
        logMain('settleSettingsPersist locale', err);
      }
    }
    return;
  }

  // Failed / timeout / stale — restore committed value; do not keep tentative.
  if (pending.kind === 'size') {
    applySizeLevel(pending.previous);
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pet-size-sync', pending.previous);
      }
    } catch (err) {
      logMain('pet-size-sync rollback', err);
    }
  } else if (pending.kind === 'locale') {
    petLocale = pending.previous;
    i18n.loadLocale(petLocale);
    try {
      awareness.setLocale(petLocale);
    } catch (err) {
      logMain('settleSettingsPersist locale rollback', err);
    }
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pet-locale-sync', i18n.packForRenderer());
      }
    } catch (err) {
      logMain('pet-locale-sync rollback', err);
    }
  }
}

function tryStartAwarenessAfterShell() {
  if (awarenessStarted || !rendererLoaded || !bootShowStarted) return;
  if (shellBusy) return;
  awarenessStarted = true;
  try {
    awareness.afterWindowReady(awarenessBoot);
  } catch (err) {
    logMain('awareness.afterWindowReady', err);
  }
}

function runShellOp(reason, fn) {
  if (!beginShellOp(reason)) return false;
  const token = shellBusyToken;
  try {
    fn();
  } catch (err) {
    logMain(`runShellOp ${reason}`, err);
    endShellOp(token, 'error');
    return false;
  }
  return true;
}

function clearTrayPrepareTimer() {
  if (trayPrepareTimer) {
    clearTimeout(trayPrepareTimer);
    trayPrepareTimer = null;
  }
}

/**
 * Hybrid external gate (Show + Awareness = same protect class):
 * - Show / Awareness → refuse (do not take value into pending)
 * - Stage other → enqueue; pet hard-cuts walk/casual speak then apply
 * - shellBusy → queue behind endShellOp (drain), never drop mid-apply intent
 */
function isAwarenessProtected() {
  if (awarenessGateActive) return true;
  try {
    return typeof awareness.isAwarenessStageActive === 'function'
      && !!awareness.isAwarenessStageActive();
  } catch (_) {
    return false;
  }
}

function isProtectedExternalStage() {
  return !!showSpeechActive || isAwarenessProtected();
}

/**
 * Only entry for external tray show/hide/size/locale.
 * @returns {boolean} true if accepted into pipe/queue
 */
function acceptExternalTrayOp(op) {
  if (!op || !op.kind) return false;
  if (isProtectedExternalStage()) {
    // Refuse: Show/Awareness — ignore input entirely (no pending, no tentative).
    closeTrayMenuIfOpen();
    return false;
  }
  enqueueTrayOp(op);
  return true;
}

/**
 * Tray show/hide/size/locale — one pending slot (latest wins) for Stage other / shell drain.
 * Soft pipe after prepare: pause → apply → resume → Show. Relaunch = manual Tray only.
 */
function enqueueTrayOp(op) {
  if (!op || !op.kind) return;
  if (isProtectedExternalStage()) {
    dropPendingTrayOp();
    return;
  }

  // Latest external intent wins (overwrite). Keep waiting if prepare already running.
  pendingTrayOp = op;
  if (tray) updateTrayMenu();

  if (shellBusy || trayPrepareWaiting) {
    return;
  }

  beginTrayPrepareIfNeeded();
}

/** Start prepare when there is a pending op and shell is free. */
function beginTrayPrepareIfNeeded() {
  if (!pendingTrayOp || shellBusy || trayPrepareWaiting) return;
  if (isProtectedExternalStage()) {
    dropPendingTrayOp();
    return;
  }

  trayPrepareWaiting = true;
  clearTrayPrepareTimer();
  if (tray) updateTrayMenu();

  if (!mainWindow || mainWindow.isDestroyed()) {
    const run = pendingTrayOp;
    pendingTrayOp = null;
    trayPrepareWaiting = false;
    executeTrayOp(run);
    if (tray) updateTrayMenu();
    return;
  }

  try {
    mainWindow.webContents.send('pet-tray-prepare');
  } catch (err) {
    logMain('pet-tray-prepare', err);
    dropPendingTrayOp();
    return;
  }
  // General stage hard-cut should finish fast; timeout = stuck → refuse leftover.
  trayPrepareTimer = setTimeout(() => {
    trayPrepareTimer = null;
    if (!trayPrepareWaiting) return;
    logMain('tray prepare timeout', new Error('general hard-cut exceeded'));
    dropPendingTrayOp();
  }, 8000);
}

function dropPendingTrayOp() {
  clearTrayPrepareTimer();
  trayPrepareWaiting = false;
  pendingTrayOp = null;
  if (tray) updateTrayMenu();
}

function onTrayIdleReady() {
  clearTrayPrepareTimer();
  trayPrepareWaiting = false;
  if (!pendingTrayOp) {
    if (tray) updateTrayMenu();
    return;
  }
  if (isProtectedExternalStage()) {
    // Show/Awareness seized during prepare — refuse stale value.
    dropPendingTrayOp();
    return;
  }
  if (shellBusy) {
    // Keep pending — endShellOp will beginTrayPrepareIfNeeded.
    if (tray) updateTrayMenu();
    return;
  }

  const op = pendingTrayOp;
  pendingTrayOp = null;
  const ok = executeTrayOp(op);
  if (!ok && tray) updateTrayMenu();
  // If execute failed to begin shell, allow another queued op later.
  if (!ok) beginTrayPrepareIfNeeded();
}

function onTrayIdleReject() {
  dropPendingTrayOp();
}

/** @returns {boolean} */
function executeTrayOp(op) {
  if (!op || !op.kind) return true;
  switch (op.kind) {
    case 'show':
      return showPetWindowNow();
    case 'hide':
      return hidePetWindowNow();
    case 'size':
      // Should not be queued anymore — if leftover, same as direct: save + relaunch.
      setPetSizeLevel(op.value);
      return true;
    case 'locale':
      setPetLocale(op.value);
      return true;
    default:
      return true;
  }
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

/**
 * Boot-only always-on-top. Call once at first window create / ready-to-show.
 * Do NOT call from show/hide/reassert/drag — toggling pulls other apps forward on Windows.
 */
function bootAlwaysOnTop(win) {
  if (!win || win.isDestroyed()) return;
  if (alwaysOnTopBooted) return;
  win.setAlwaysOnTop(true, ALWAYS_ON_TOP_LEVEL);
  alwaysOnTopBooted = true;
}

/** Soft-hide visual: invisible + no hit testing. Keeps always-on-top (opacity + ignore-mouse only). */
function applyHiddenVisual(win) {
  if (!win || win.isDestroyed()) return;
  clearMouseAcceptTimers();
  win.setSkipTaskbar(true);
  win.setFocusable(false);
  win.setIgnoreMouseEvents(true);
  win.setOpacity(0);
}

/**
 * Force input-on visual (tray show / snooze wake / OS reassert).
 * Opacity + hard-clear ignore-mouse only — does not touch alwaysOnTop.
 */
function applyVisibleVisual(win) {
  if (!win || win.isDestroyed()) return;
  win.setSkipTaskbar(true);
  win.setFocusable(false);
  win.setOpacity(1);
  forceAcceptMouseEvents(win);
}

function restorePetWindowShell(win) {
  if (!win || win.isDestroyed()) return;

  win.setMenu(null);
  // Keep empty — page-title-updated is blocked so OS cannot paint a caption strip.
  win.setTitle('');
  win.setSkipTaskbar(true);
  win.setFocusable(false);
  win.setMinimizable(false);
  win.setMaximizable(false);
  win.setFullScreenable(false);
  win.setBackgroundColor('#00000000');
  win.setHasShadow(false);

  if (typeof win.setVisibleOnAllWorkspaces === 'function') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  // Do NOT blur here — blur re-enters focus/blur handlers and can freeze mid locale/size pipe.
  // alwaysOnTop is boot-only — never re-applied here.
}

/** Suppress focus/blur storm while we strip caption or reassert. */
let suppressOsTouch = false;
let osTouchHeavyTimer = null;

function withOsTouchSuppressed(fn) {
  suppressOsTouch = true;
  try {
    fn();
  } finally {
    setTimeout(() => {
      suppressOsTouch = false;
    }, 80);
  }
}

/**
 * Caption strip only — no pet-force-input, no opacity/mouse punch (does not touch pet pipe).
 * Used after tray menu close and on OS focus chrome redraw.
 */
function stripCaptionOnly(win = mainWindow) {
  if (!win || win.isDestroyed()) return;
  withOsTouchSuppressed(() => {
    try {
      win.setMenu(null);
      win.setTitle('');
      win.setSkipTaskbar(true);
      win.setFocusable(false);
    } catch (_) { /* ignore */ }
  });
}

function scheduleCaptionStripOnly() {
  for (const ms of [0, 30, 100, 220]) {
    setTimeout(() => stripCaptionOnly(), ms);
  }
}

/**
 * After tray click, sticky Windows caption clears when user hide→show.
 * Do the same visually when safe — no shellBusy, no pet-visibility IPC, no Show speech.
 */
let captionSoftRefreshTimer = null;
let captionSoftRefreshRunning = false;

function canCaptionSoftHideShow() {
  if (captionSoftRefreshRunning) return false;
  if (shellBusy || suppressOsTouch) return false;
  if (isProtectedExternalStage()) return false;
  if (petVisuallyHidden) return false;
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return true;
}

function scheduleCaptionSoftHideShow() {
  if (captionSoftRefreshTimer) {
    clearTimeout(captionSoftRefreshTimer);
    captionSoftRefreshTimer = null;
  }
  // Let menu dismiss + OS activate settle, then micro hide→show.
  captionSoftRefreshTimer = setTimeout(() => {
    captionSoftRefreshTimer = null;
    runCaptionSoftHideShow();
  }, 80);
}

function runCaptionSoftHideShow() {
  if (!canCaptionSoftHideShow()) {
    scheduleCaptionStripOnly();
    return;
  }

  const win = mainWindow;
  captionSoftRefreshRunning = true;

  withOsTouchSuppressed(() => {
    try {
      // Visual-only hide — do not set petVisuallyHidden / do not IPC pause stages.
      applyHiddenVisual(win);
      restorePetWindowShell(win);
    } catch (err) {
      logMain('caption soft hide', err);
    }
  });

  setTimeout(() => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) return;

      // User hid for real while we blinked — stay hidden.
      if (petVisuallyHidden) {
        applyHiddenVisual(mainWindow);
        return;
      }
      // Stage became protected / shell busy — strip title only, do not force show pipe.
      if (shellBusy || isProtectedExternalStage()) {
        scheduleCaptionStripOnly();
        return;
      }

      withOsTouchSuppressed(() => {
        restorePetWindowShell(mainWindow);
        applyVisibleVisual(mainWindow);
        restorePetWindowBounds(mainWindow);
      });
      scheduleCaptionStripOnly();
    } catch (err) {
      logMain('caption soft show', err);
      try {
        if (mainWindow && !mainWindow.isDestroyed() && !petVisuallyHidden) {
          applyVisibleVisual(mainWindow);
        }
      } catch (_) { /* ignore */ }
    } finally {
      captionSoftRefreshRunning = false;
    }
  }, 60);
}

/**
 * UX: thin OS title/caption bar on the pet window itself ("Preview" strip above bubble).
 * Prefer scheduleCaptionStripOnly / stripCaptionOnly — avoid full shell restore from tray.
 */
function hideWindowCaptionChrome(win = mainWindow) {
  stripCaptionOnly(win);
}

function hideWindowCaptionChromeBurst() {
  scheduleCaptionStripOnly();
}

/** Re-apply shell + soft-hide/show visual after Windows taskbar/OS touches the window. */
function reassertPetSurface(win = mainWindow) {
  if (!win || win.isDestroyed()) return;
  withOsTouchSuppressed(() => {
    restorePetWindowShell(win);
    if (petVisuallyHidden) {
      applyHiddenVisual(win);
    } else {
      applyVisibleVisual(win);
      // Cursor/hover can work while renderer click flags stay locked — force unlock.
      try {
        win.webContents.send('pet-force-input');
      } catch (_) { /* ignore */ }
    }
  });
}

/**
 * Heavy OS recover (show/restore/minimize). Skip while shellBusy so locale/size pipe cannot freeze.
 * Debounced — focus/blur must NOT call this (caption-only instead).
 */
function onOsTouchHeavy() {
  if (suppressOsTouch || shellBusy) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (osTouchHeavyTimer) clearTimeout(osTouchHeavyTimer);
  osTouchHeavyTimer = setTimeout(() => {
    osTouchHeavyTimer = null;
    if (suppressOsTouch || shellBusy) return;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    reassertPetSurface(mainWindow);
    scheduleCaptionStripOnly();
  }, 120);
}

function notifyMovementLock() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('pet-movement-lock', movementLocked);
}

function setMovementLocked(locked) {
  movementLocked = !!locked;
  notifyMovementLock();
  if (tray) updateTrayMenu();
}

function notifyPetShown() {
  if (!mainWindow || mainWindow.isDestroyed() || petVisuallyHidden) return;
  mainWindow.webContents.send('pet-visibility', true);
  mainWindow.webContents.send('pet-force-input');
  mainWindow.webContents.send('screen-changed');
  notifyMovementLock();
  // Do NOT notifyPetSize here — same level would rebootstrap and cancel Show speech 1→2→3.
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
  // alwaysOnTop is boot-only — never toggled on move/show/hide.
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
  // Drag does not touch alwaysOnTop (boot-only).
  if (!win || win.isDestroyed()) return;
}

function exitDragMode(win) {
  if (!win || win.isDestroyed()) return;
  if (dragMoveListener) {
    win.removeListener('move', dragMoveListener);
    dragMoveListener = null;
  }
  // Do not re-apply alwaysOnTop.
}

function hidePetWindow() {
  acceptExternalTrayOp({ kind: 'hide' });
}

function showPetWindow() {
  acceptExternalTrayOp({ kind: 'show' });
}

/** @returns {boolean} */
function hidePetWindowNow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (!beginShellOp('hide')) return false;

  // Soft-hide: keep process + window alive; only hide visually and block hits.
  petVisuallyHidden = true;
  clearMouseAcceptTimers();

  if (!mainWindow.isVisible()) {
    mainWindow.showInactive();
  }
  applyHiddenVisual(mainWindow);
  // Stages pause after visual is off (same pipe as tray hide / snooze).
  mainWindow.webContents.send('pet-visibility', false);
  return true;
}

/** @returns {boolean} */
function showPetWindowNow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (!beginShellOp('show')) return false;
  bootShowStarted = true;

  // 1) Input/visual ON first — hard clear ignore-mouse before anything else.
  petVisuallyHidden = false;

  if (!mainWindow.isVisible()) {
    mainWindow.showInactive();
  }

  reassertPetSurface(mainWindow);
  restorePetWindowBounds(mainWindow);
  forceAcceptMouseEvents(mainWindow);

  // 2) Resume stages + force unlock click flags.
  notifyPetShown();

  // 3) Resolve snooze AFTER visibility/force-input.
  clearSnoozeWait();

  // 4) Keep punching accept-mouse (already scheduled inside forceAcceptMouseEvents).
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !petVisuallyHidden) {
      reassertPetSurface(mainWindow);
      restorePetWindowBounds(mainWindow);
      forceAcceptMouseEvents(mainWindow);
      mainWindow.webContents.send('pet-force-input');
    }
  }, 50);
  return true;
}

function createWindow() {
  const area = getWorkArea();

  const winOpts = {
    x: area.x + Math.round(area.width / 2 - WINDOW_WIDTH / 2),
    y: area.y + Math.round(area.height - WINDOW_HEIGHT - 60),
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    title: '',
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    thickFrame: false,
    roundedCorners: false,
    autoHideMenuBar: true,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
  };
  // Windows: toolbar-type windows stay out of normal taskbar / Alt+Tab listing better.
  if (process.platform === 'win32') {
    winOpts.type = 'toolbar';
  }

  mainWindow = new BrowserWindow(winOpts);

  mainWindow.loadFile('index.html');
  mainWindow.setMenu(null);
  mainWindow.setTitle('');
  // Stop Chromium/OS from pushing productName into a visible caption bar.
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
  });
  restorePetWindowShell(mainWindow);
  // alwaysOnTop once at create — soft show/hide only change opacity + mouse ignore.
  bootAlwaysOnTop(mainWindow);

  mainWindow.webContents.once('did-finish-load', () => {
    rendererLoaded = true;
    // Do not start awareness while boot show shellBusy is open — wait endShellOp.
    tryStartAwarenessAfterShell();
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      bootAlwaysOnTop(mainWindow);
      reassertPetSurface(mainWindow);
      // Boot: run show pipe immediately (renderer just loaded — no pending settle).
      showPetWindowNow();
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

  // Topic B: OS touch recover — heavy only on show/restore/minimize.
  // focus/blur = caption strip only (no pet-force-input) to avoid freeze loops mid locale pipe.
  mainWindow.on('show', () => onOsTouchHeavy());
  mainWindow.on('restore', () => onOsTouchHeavy());
  mainWindow.on('focus', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (suppressOsTouch || shellBusy) {
      stripCaptionOnly();
      return;
    }
    withOsTouchSuppressed(() => {
      try {
        if (mainWindow.isFocused()) mainWindow.blur();
      } catch (err) {
        logMain('blur after OS focus', err);
      }
    });
    scheduleCaptionStripOnly();
  });
  mainWindow.on('blur', () => {
    // Caption only — never reassert here (blur↔reassert was the freeze loop).
    if (suppressOsTouch) return;
    scheduleCaptionStripOnly();
  });

  mainWindow.on('minimize', (e) => {
    e.preventDefault();
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.showInactive();
      onOsTouchHeavy();
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
  const iconPath = path.join(__dirname, 'build', 'icon.png');
  let icon = nativeImage.createFromPath(iconPath);

  if (icon.isEmpty()) {
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFklEQVQ4T2NkYGD4z0ABYBw1gGE0AAD//wMABhMBBf1nW5wAAAAASUVORK5CYII='
    );
  } else {
    icon = icon.resize({ width: 32, height: 32 });
  }

  tray = new Tray(icon);
  // Manual popup only — OS auto contextMenu stacks / re-opens on every right-click.
  tray.setContextMenu(null);
  tray.on('right-click', () => openTrayMenuOnce());
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
      message: i18n.tray('uninstallMissing'),
      detail: installDir,
    }).catch((err) => logMain('launchUninstaller missing', err));
    return;
  }

  // Open NSIS uninstaller (removes installed app only — not the Setup .exe in the repo).
  shell.openPath(uninstaller).then((errMsg) => {
    if (errMsg) {
      logMain('launchUninstaller openPath', errMsg);
      dialog.showErrorBox(APP_NAME, i18n.tray('uninstallFail', { err: errMsg }));
      return;
    }
    app.isQuitting = true;
    clearSnoozeWait();
    app.quit();
  });
}

/**
 * Steam/Roblox-like: no popup while shell apply (show/hide mid-pipe).
 * Show/Awareness may open menu — Size/locale relaunch; show/hide still refuse at accept gate.
 */
function isTrayMenuAllowed() {
  return !shellBusy;
}

/** show/hide soft gate (Hybrid). Size/locale do not use this — they relaunch. */
function isTraySettingsAllowed() {
  return !shellBusy && !isProtectedExternalStage();
}

function closeTrayMenuIfOpen() {
  if (!tray) {
    trayMenuOpen = false;
    return;
  }
  try {
    tray.closeContextMenu();
  } catch (err) {
    logMain('closeContextMenu', err);
  }
  trayMenuOpen = false;
}

function buildTrayContextMenu() {
  const startupEnabled = app.getLoginItemSettings().openAtLogin;
  const t = (key, vars) => i18n.tray(key, vars);
  // Size/locale always enabled when menu opens — save + relaunch (no soft pipe).
  // show/hide still Hybrid-gated inside acceptExternalTrayOp.

  return Menu.buildFromTemplate([
    {
      label: t('show'),
      click: () => showPetWindow(),
    },
    {
      label: t('hide'),
      click: () => hidePetWindow(),
    },
    { type: 'separator' },
    {
      label: t('size'),
      submenu: Array.from(
        { length: SIZE_CASE_MAX - SIZE_CASE_MIN + 1 },
        (_, i) => SIZE_CASE_MIN + i,
      ).map((n) => ({
        label: n === 1 ? t('sizeDefault', { n }) : t('sizeN', { n }),
        type: 'radio',
        checked: petSizeLevel === n,
        click: () => setPetSizeLevel(n),
      })),
    },
    {
      label: t('language'),
      submenu: LOCALE_CASES.map((code) => ({
        label: code === 'th' ? t('langTh') : code === 'en' ? t('langEn') : t('langZh'),
        type: 'radio',
        checked: petLocale === code,
        click: () => setPetLocale(code),
      })),
    },
    {
      label: t('lock'),
      type: 'checkbox',
      checked: movementLocked,
      click: (item) => {
        setMovementLocked(item.checked);
      },
    },
    {
      label: t('startup'),
      type: 'checkbox',
      checked: startupEnabled,
      click: (item) => {
        app.setLoginItemSettings({
          openAtLogin: item.checked,
          path: process.execPath,
          args: app.isPackaged ? [] : [path.resolve(process.argv[1] || '.')],
        });
      },
    },
    { type: 'separator' },
    {
      label: t('relaunch'),
      click: () => relaunchForTraySettings('tray-manual'),
    },
    {
      label: t('uninstall'),
      click: () => launchUninstaller(),
    },
    {
      label: t('quit'),
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
}

/**
 * Tray right-click = open panel only (Steam/Discord-like).
 * No pet shell / IPC / settings — values only from MenuItem click handlers.
 * Not ready or menu already open → pure return.
 * After menu closes: soft hide→show visual blink when safe (clears sticky caption).
 */
function openTrayMenuOnce() {
  if (!tray || trayMenuOpen || !isTrayMenuAllowed()) {
    return;
  }

  const menu = buildTrayContextMenu();
  trayMenuOpen = true;
  menu.once('menu-will-close', () => {
    trayMenuOpen = false;
    // Same idea as user hide→show clearing caption — visual-only when safe.
    scheduleCaptionSoftHideShow();
  });

  try {
    tray.popUpContextMenu(menu);
  } catch (err) {
    trayMenuOpen = false;
    logMain('popUpContextMenu', err);
  }
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setToolTip(`${APP_NAME} v${APP_VERSION}`);
  // Never attach OS auto-menu — open only via openTrayMenuOnce (single-flight).
  try {
    tray.setContextMenu(null);
  } catch (err) {
    logMain('setContextMenu null', err);
  }
  if (!isTrayMenuAllowed()) {
    closeTrayMenuIfOpen();
  }
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

  ipcMain.handle('get-movement-lock', () => movementLocked);

  ipcMain.handle('set-movement-lock', (_event, enabled) => {
    setMovementLocked(!!enabled);
    return movementLocked;
  });

  ipcMain.handle('get-pet-size-level', () => petSizeLevel);

  ipcMain.handle('set-pet-size-level', (_event, level) => setPetSizeLevel(level));

  ipcMain.handle('get-locale', () => i18n.packForRenderer());

  ipcMain.handle('set-locale', (_event, code) => {
    setPetLocale(code);
    return i18n.packForRenderer();
  });

  ipcMain.handle('shell-ready', (_event, reason) => {
    endShellOp(shellBusyToken, 'renderer', String(reason || ''));
    return true;
  });

  ipcMain.handle('tray-idle-ready', () => {
    onTrayIdleReady();
    return true;
  });

  ipcMain.handle('tray-idle-reject', () => {
    onTrayIdleReject();
    return true;
  });

  ipcMain.handle('show-speech-gate', (_event, active) => {
    showSpeechActive = !!active;
    if (showSpeechActive) {
      // Show owns stage — refuse any queued external value.
      dropPendingTrayOp();
    }
    if (tray) updateTrayMenu();
    return true;
  });

  ipcMain.handle('awareness-gate', (_event, active) => {
    awarenessGateActive = !!active;
    if (awarenessGateActive) {
      // Awareness owns stage (same class as Show) — refuse queued external value.
      dropPendingTrayOp();
    }
    if (tray) updateTrayMenu();
    return true;
  });

  /** Tray pipe fresh start — clear sticky show gate + general awareness speak. */
  ipcMain.handle('stage-hard-reset', () => {
    showSpeechActive = false;
    // Do not clear awarenessGateActive here — porn/awareness mid-flight stays protected.
    if (tray) updateTrayMenu();
    try {
      awareness.resetGeneralSpeakLock();
    } catch (err) {
      logMain('stage-hard-reset awareness', err);
    }
    return true;
  });

  ipcMain.handle('quit-app', () => {
    app.isQuitting = true;
    clearSnoozeWait();
    try {
      awareness.stopPolling();
    } catch (err) {
      logMain('quit-app stopPolling', err);
    }
    app.quit();
  });

  // Renderer finished an awareness line (optional ack before thenQuit).
  ipcMain.handle('awareness-speech-done', (_event, thenQuit) => {
    try {
      awareness.notifySpeechFinished(!!thenQuit);
    } catch (err) {
      logMain('awareness-speech-done', err);
      if (thenQuit) {
        app.isQuitting = true;
        clearSnoozeWait();
        app.quit();
      }
    }
  });

  ipcMain.handle('snooze', async (event, ms) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) return;

      const delay = Math.max(0, Number(ms) || 0);

      // Wait until shown again (timer or tray "แสดง Pet").
      // Use Now variants — snooze already settled stages; do not re-enter prepare slot.
      await new Promise((resolve) => {
        clearSnoozeWait();
        snoozeResolve = resolve;
        hidePetWindowNow();
        snoozeTimer = setTimeout(() => {
          snoozeTimer = null;
          showPetWindowNow();
        }, delay);
      });
    } catch (err) {
      logMain('snooze', err);
    }
  });
}

if (gotLock) {
  app.on('second-instance', () => showPetWindow());

  app.whenReady().then(async () => {
    setupIpc();

    petLocale = loadSavedLocale();
    i18n.loadLocale(petLocale);
    applySizeLevel(loadSavedSizeLevel());

    awareness.init({
      app,
      getMainWindow: () => mainWindow,
      forceQuit: () => {
        app.isQuitting = true;
        clearSnoozeWait();
        try {
          awareness.stopPolling();
        } catch (err) {
          logMain('awareness forceQuit stopPolling', err);
        }
        app.quit();
      },
      isShowSpeechActive: () => showSpeechActive,
      onExternalRefuseNeeded: () => {
        dropPendingTrayOp();
        if (tray) updateTrayMenu();
      },
    });
    try {
      awareness.setLocale(petLocale);
    } catch (err) {
      logMain('awareness.setLocale', err);
    }

    try {
      awarenessBoot = await awareness.evaluateBoot();
    } catch (err) {
      logMain('awareness.evaluateBoot', err);
      awarenessBoot = { action: 'run' };
    }

    // Legacy silent-quit → still create window and speak leave (never invisible quit).
    if (awarenessBoot.action === 'silent-quit') {
      awarenessBoot = { action: 'speak-quit', text: 'ฉันไม่อยู่ล่ะ' };
    }

    createWindow();
    createTray();

    screen.on('display-metrics-changed', () => {
      if (mainWindow && !mainWindow.isDestroyed() && !petVisuallyHidden) {
        mainWindow.webContents.send('screen-changed');
      }
    });

    if (app.isPackaged) {
      // Respect user tray checkbox — do not force openAtLogin on every launch.
      const { openAtLogin } = app.getLoginItemSettings();
      app.setLoginItemSettings({
        openAtLogin,
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
    clearMouseAcceptTimers();
    clearSnoozeWait();
    try {
      awareness.stopPolling();
    } catch (err) {
      logMain('before-quit stopPolling', err);
    }
  });
}
