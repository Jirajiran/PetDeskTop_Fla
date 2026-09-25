// Fla_petDesktop_V34 — single SVG poses (Move/Speak/Look) + eye look-at-mouse tween.
const APP_NAME = 'Fla_petDesktop_V34';
const APP_VERSION = '34.0.0';

/** Crop half-size from Fla_Base_Safe_area (180×180 transparent frame). */
const POSE_HALF = 90;
const POSES = {
  idle: { id: 'Idle', x: 247.65, y: 312.75 },
  n: { id: 'Move_N', x: 248.5, y: 159.1 },
  s: { id: 'Move_S', x: 245, y: 462.25 },
  w: { id: 'Move_W', x: 101.05, y: 312.75 },
  e: { id: 'Move_E', x: 395.35, y: 312.75 },
  nw: { id: 'Move_WN', x: 101.25, y: 159.1 },
  ne: { id: 'Move_EN', x: 393.85, y: 159.1 },
  sw: { id: 'Move_WS', x: 101.4, y: 462.25 },
  se: { id: 'Move_ES', x: 383.45, y: 462.25 },
  speak1: { id: 'Speak_1', x: 108.35, y: 671.6 },
  speak2: { id: 'Speak_2', x: 245.7, y: 671.6 },
  speak3: { id: 'Speak_3', x: 390.1, y: 671.6 },
  fade1: { id: 'Fade_1', x: 241.2, y: 848.85 },
  fade2: { id: 'Fade_2', x: 395.85, y: 848.85 },
  sleep: { id: 'Fade_Sleep', x: 92.05, y: 848.85 },
  lookN: { id: 'Look_N', x: 769.1, y: 159.1 },
  lookS: { id: 'Look_S', x: 769.1, y: 467.75 },
  lookE: { id: 'Look_E', x: 922.8, y: 317.75 },
  lookW: { id: 'Look_W', x: 601.3, y: 317.75 },
  lookNE: { id: 'Look_EN', x: 922.8, y: 159.1 },
  lookNW: { id: 'Look_WN', x: 601.3, y: 159.1 },
  lookSE: { id: 'Look_ES', x: 922.8, y: 467.75 },
  lookSW: { id: 'Look_WS', x: 601.3, y: 467.75 },
  /** Mouse over pet center — eye rest / middle look (from SVG Look_Middle). */
  lookMiddle: { id: 'Look_Middle', x: 769.1, y: 317.75 },
};

const FADE_FRAMES = ['fade1', 'fade2'];
const SPEAK_FRAMES = ['speak1', 'speak2', 'speak3'];

/**
 * Eye endpoints from SVG.
 * Center (Look_Middle) = mouse on pet middle; 8 dirs = Look_*.
 */
const EYE_IDLE = {
  L: { x: -11.9, y: 9.9 },
  R: { x: 11.75, y: 9.25 },
};
const EYE_LOOK = {
  n: { L: { x: -20.15, y: 4.85 }, R: { x: 19.65, y: 4.85 } },
  s: { L: { x: -20.15, y: 18.35 }, R: { x: 19.65, y: 18.35 } },
  e: { L: { x: -12.35, y: 10.55 }, R: { x: 34.85, y: 10.55 } },
  w: { L: { x: -34.25, y: 10.55 }, R: { x: 10.95, y: 10.55 } },
  ne: { L: { x: -12.35, y: 4.25 }, R: { x: 34.85, y: 4.25 } },
  nw: { L: { x: -34.25, y: 3.3 }, R: { x: 10.95, y: 3.3 } },
  se: { L: { x: -12.35, y: 14.8 }, R: { x: 34.85, y: 14.8 } },
  sw: { L: { x: -34.25, y: 14.8 }, R: { x: 10.95, y: 14.8 } },
};

const FADE_FRAME_MS = 100;
const SPEAK_FRAME_MS = 120;
const LOOK_TICK_MS = 33;
const LOOK_LERP = 0.22;
const LOOK_DEADZONE_PX = 28; // baseline; runtime uses lookDeadzonePx
const BASE_LOOK_DEADZONE_PX = 28;
const SVG_PET_URL = 'PetPicture/PetDesignSVG.svg';
const MIN_RHYTHM_BEATS = 8;
const TRIGGER_DEPTH_PX = 16;
const DEADZONE_PX = 12; // overwritten by applyPetSizeLevel; keep for any static refs
const GRID_EDGE_FRAC = 0.15;
const WARP_COOLDOWN_MS = 1000;
const DRAG_COMPLAINT_MS = 2800;
const MOVE_SPEED = 1.8;
const MOVE_TICK_MS = 33;
const TWEEN_SYNC_EVERY = 2;
const TRANSITION_TIMEOUT_MS = 4000;
const WATCHDOG_MS = 5000;
const SESSION_STUCK_MS = 8000;
const ENDING_DRAG_STUCK_MS = 12000;
const SPEAK_STUCK_MS = 20000;
const MOUSE_SLEEP_MS = 180000;
const MOUSE_POLL_MS = 500;
/** Size 1 baseline near-radius (after ×2 flee tweak). */
const BASE_MOUSE_NEAR_PX = 240;
const BASE_DEADZONE_PX = 12;
const BASE_SNOOZE_TAPS = 25;
/** Flee side checks at most this often — not every MOVE_TICK_MS (pet walk alone must not retarget). */
const MOUSE_FLEE_CHECK_MS = 100;
/** Mouse must move at least this much before a cardinal-side change can retarget. */
const MOUSE_FLEE_MOVE_PX = 6;
const WARP_HOPS = 5;
const FEATURE_READY_MS = 450;
/** Size 1 baseline window (pre-200 experiment). */
const BASE_WIN_PET = 72;
const BASE_WIN_W = 88;
const BASE_WIN_SPEAK_H = 120;
/** Constant px/frame toward mouse while dragging / settling after release (×2). */
const DRAG_SPEED_PX = 12;

/** Runtime locale pack from main (i18n JSON). Categories are ordered logline beats. */
let localePack = {
  locale: 'th',
  showCategories: [],
  pools: { idle: [], drag: [] },
};
/** Main tray/IPC loading lock mirror — clear clicks while shell settles. */
let shellBusyActive = false;
/** Soft-show intro running — Tray rejects; general awareness blocked in main. */
let showSpeechActiveLocal = false;
/** Invalidates in-flight Show finally so it cannot clear a newer gate / leave gate stuck. */
let showSpeechGateGen = 0;

function applyLocalePack(pack) {
  if (!pack || typeof pack !== 'object') return;
  localePack = {
    locale: pack.locale || 'th',
    showCategories: Array.isArray(pack.showCategories) ? pack.showCategories : [],
    pools: {
      idle: Array.isArray(pack.pools?.idle) ? pack.pools.idle : [],
      drag: Array.isArray(pack.pools?.drag) ? pack.pools.drag : [],
    },
  };
}

function pickFromPoolList(list) {
  if (!list || !list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function notifyShellReady(reason) {
  try {
    if (window.petAPI?.shellReady) {
      window.petAPI.shellReady(reason || '');
    }
  } catch (err) {
    logError('notifyShellReady', err);
  }
}

async function clearClicksForShellBusy() {
  walkTarget = null;
  skipNextIdle = false;
  if (isPointerSession || isDragFrozen || isActivelyDragging || isEndingDrag) {
    try {
      await cancelPointerSessionQuiet();
    } catch (err) {
      logError('clearClicksForShellBusy', err);
    }
  }
  resetDragState();
  releaseActivePointer();
  isDragFrozen = false;
  isActivelyDragging = false;
  isEndingDrag = false;
}

/**
 * Stage Snooze path → idle (no hide). Mouse snooze only — cuts other stages.
 */
async function enterSnoozeSettlePath() {
  snoozeTapCount = 0;
  lastSnoozeTapAt = 0;

  walkTarget = null;
  skipNextIdle = false;
  lastDirection = null;
  mouseFleeDidFlee = false;
  mouseFleePendingSide = null;

  if (isPointerSession || isDragFrozen || isActivelyDragging || isEndingDrag) {
    try {
      await cancelPointerSessionQuiet();
    } catch (err) {
      logError('enterSnoozeSettlePath cancelPointer', err);
    }
  }

  cancelSpeaking();
  stopVoice();
  hideBubble();
  isTransitioning = false;
  speakStartedAt = 0;
  forceIdleSprite();
  resetSnoozeTaps();
}

/** True when Stage other is clear — Tray may open its pipe. */
function isPetTrulyIdle() {
  if (showSpeechActiveLocal) return false;
  if (!isPetVisible || isSnoozed) return true;
  if (shellBusyActive) return false;
  if (awarenessPriorityActive || awarenessSpeakLock) return false;
  if (isSpeaking || isTransitioning) return false;
  if (isPointerSession || isDragFrozen || isActivelyDragging || isEndingDrag) return false;
  if (walkTarget) return false;
  if (currentSprite !== 'idle' && currentSprite !== 'sleep') return false;
  return true;
}

/**
 * Tray prepare: if idle → allow pipe; else REJECT (return / ignore click).
 * No wait queue — full prevent while Stage other / Show intro is active.
 */
async function settleForTrayPrepare() {
  try {
    if (isPetTrulyIdle()) {
      if (window.petAPI?.trayIdleReady) {
        await window.petAPI.trayIdleReady();
      }
      return;
    }
    if (window.petAPI?.trayIdleReject) {
      await window.petAPI.trayIdleReject();
    }
  } catch (err) {
    logError('settleForTrayPrepare', err);
    try {
      if (window.petAPI?.trayIdleReject) {
        await window.petAPI.trayIdleReject();
      }
    } catch (err2) {
      logError('trayIdleReject', err2);
    }
  }
}

async function setShowSpeechGate(active) {
  if (active) {
    const myGen = ++showSpeechGateGen;
    showSpeechActiveLocal = true;
    try {
      if (window.petAPI?.setShowSpeechGate) {
        await window.petAPI.setShowSpeechGate(true);
      }
    } catch (err) {
      logError('setShowSpeechGate on', err);
    }
    return myGen;
  }

  showSpeechActiveLocal = false;
  try {
    if (window.petAPI?.setShowSpeechGate) {
      await window.petAPI.setShowSpeechGate(false);
    }
  } catch (err) {
    logError('setShowSpeechGate off', err);
  }
  return showSpeechGateGen;
}

/**
 * Tray pipe = fresh start. Clear sticky stage flags before pause/rebootstrap.
 * Does not touch porn mid-flight in main if pornSequenceActive (awareness.resetGeneral).
 */
async function hardResetStagesForTrayPipe() {
  showSpeechGateGen += 1;
  showSpeechActiveLocal = false;

  try {
    if (window.petAPI?.stageHardReset) {
      await window.petAPI.stageHardReset();
    } else if (window.petAPI?.setShowSpeechGate) {
      await window.petAPI.setShowSpeechGate(false);
    }
  } catch (err) {
    logError('hardResetStagesForTrayPipe', err);
  }

  dragReleaseGen += 1;
  speechGeneration += 1;
  isSpeaking = false;
  isTransitioning = false;
  speakStartedAt = 0;
  isMouseSleeping = false;
  walkTarget = null;
  lastDirection = null;
  mouseFleeDidFlee = false;
  mouseFleePendingSide = null;
  skipNextIdle = false;
  awarenessSpeakLock = false;
  awarenessPriorityActive = false;

  try {
    stopVoice();
    hideBubble();
  } catch (_) { /* ignore */ }
  bumpFadeGeneration();

  if (isPointerSession || isDragFrozen || isActivelyDragging || isEndingDrag) {
    try {
      await cancelPointerSessionQuiet();
    } catch (err) {
      logError('hardResetStagesForTrayPipe cancelPointer', err);
    }
  }
  resetDragState();
  releaseActivePointer();
  isDragFrozen = false;
  isActivelyDragging = false;
  isEndingDrag = false;
}

const petContainer = document.getElementById('pet-container');
const pet = document.getElementById('pet');
const bubble = document.getElementById('speech-bubble');
const speechText = document.getElementById('speech-text');
const noteS = document.getElementById('note-s');
const noteL = document.getElementById('note-l');
const sfxClick = document.getElementById('sfx-click');
const sfxMove = document.getElementById('sfx-move');
const sfxShow = document.getElementById('sfx-show');
const sfxHide = document.getElementById('sfx-hide');

noteS.volume = 0.6;
noteL.volume = 0.6;
if (sfxClick) sfxClick.volume = 0.7;
if (sfxMove) sfxMove.volume = 0.55;
if (sfxShow) sfxShow.volume = 0.7;
if (sfxHide) sfxHide.volume = 0.7;

let petSvg = null;
let petSvgReady = false;
let idleEyeL = null;
let idleEyeR = null;
let eyeCurL = { x: EYE_IDLE.L.x, y: EYE_IDLE.L.y };
let eyeCurR = { x: EYE_IDLE.R.x, y: EYE_IDLE.R.y };
let eyeTargetL = { x: EYE_IDLE.L.x, y: EYE_IDLE.L.y };
let eyeTargetR = { x: EYE_IDLE.R.x, y: EYE_IDLE.R.y };
let lookEnabled = false;
let featuresReadyAt = 0;
let isMovementLocked = false;
let petSizeLevel = 1;
let WIN_PET = BASE_WIN_PET;
let WIN_W = BASE_WIN_W;
let WIN_SPEAK_H = BASE_WIN_SPEAK_H;
let MOUSE_NEAR_PX = BASE_MOUSE_NEAR_PX;
let activeDeadzonePx = BASE_DEADZONE_PX;
let snoozeTapsNeeded = BASE_SNOOZE_TAPS;
let snoozeTapMovePx = 10;
let lookDeadzonePx = BASE_LOOK_DEADZONE_PX;

let isSpeaking = false;
let speechGeneration = 0;
let isTransitioning = false;
let transitionStartedAt = 0;
let currentSprite = 'idle';
let isSnoozed = false;
let isPointerSession = false;
let isDragFrozen = false;
let isEndingDrag = false;
let dragDownPos = null;
let screenCache = null;
let gridNodes = [];
let walkTarget = null;
let petX = 0;
let petY = 0;
let aiRunning = false;
let isFirstCycle = true;
let lastDirection = null;
let nextWarpAt = 0;
let warpCooldownUntil = 0;
let lastSync = { x: -1, y: -1, w: -1, h: -1 };
let dragReleaseGen = 0;
let syncGeneration = 0;
let dragGrab = null;
let dragTargetX = 0;
let dragTargetY = 0;
let dragFollowRaf = null;
let lastDragWork = null;
let isDragSettling = false;
let dragSyncRaf = null;
let fadeGen = 0;
let pointerDownWork = null;
let isActivelyDragging = false;
let activePointerId = null;
let pointerSessionStartedAt = 0;
let endingDragStartedAt = 0;
let speakStartedAt = 0;
let isPetVisible = true;
let visibilityGen = 0;
let isMouseSleeping = false;
let lastMouseActiveAt = Date.now();
let lastCursorWork = null;
let mouseFleeSide = null;
/** True while cursor is inside near-radius; cleared on leave so next enter can flee once. */
let mouseFleeNearActive = false;
/** Already fled once for the current near-session (enter → one destination). */
let mouseFleeDidFlee = false;
let mouseFleeLastCheckAt = 0;
let mouseFleeLastMousePos = null;
/** Cardinal side awaiting MOUSE_FLEE_CHECK_MS confirm after mouse moved to a new direction. */
let mouseFleePendingSide = null;
let mouseFleePendingAt = 0;
let skipNextIdle = false;
/** Soft-show count for process lifetime (greeting → introduce → narrative → silent). */
let snoozeTapCount = 0;
let lastSnoozeTapAt = 0;

const SNOOZE_TAPS_NEEDED = 25; // baseline; runtime uses snoozeTapsNeeded
const SNOOZE_TAP_GAP_MS = 2000;
const SNOOZE_TAP_MOVE_PX = 10;

function roundHalfUp(x) {
  return Math.floor(Number(x) + 0.5);
}

function sizeScale(level = petSizeLevel) {
  const n = Math.max(1, Math.min(8, Math.floor(Number(level) || 1)));
  return 1 + (n - 1) * 0.2;
}

function applyPetSizeLevel(level) {
  const prevPet = WIN_PET;
  const centerX = petX + prevPet * 0.5;
  const centerY = petY + prevPet * 0.5;

  petSizeLevel = Math.max(1, Math.min(8, Math.floor(Number(level) || 1)));
  const scale = sizeScale(petSizeLevel);
  WIN_PET = Math.max(1, roundHalfUp(BASE_WIN_PET * scale));
  WIN_W = Math.max(1, roundHalfUp(BASE_WIN_W * scale));
  WIN_SPEAK_H = Math.max(1, roundHalfUp(BASE_WIN_SPEAK_H * scale));
  MOUSE_NEAR_PX = Math.max(1, roundHalfUp(BASE_MOUSE_NEAR_PX * scale));
  activeDeadzonePx = Math.max(1, roundHalfUp(BASE_DEADZONE_PX * scale));
  lookDeadzonePx = Math.max(1, roundHalfUp(BASE_LOOK_DEADZONE_PX * scale));
  // Size N: 25 + 25*0.2*(N-1) = 25*scale — snooze multi-tap (locked or unlocked).
  snoozeTapsNeeded = Math.max(1, roundHalfUp(BASE_SNOOZE_TAPS * scale));
  snoozeTapMovePx = Math.max(10, roundHalfUp(10 * scale));

  // Icon + bubble + collider scale together (same CSS box = hit area).
  document.documentElement.style.setProperty('--pet-safe', `${WIN_PET}px`);
  document.documentElement.style.setProperty('--pet-draw', `${WIN_PET}px`);
  document.documentElement.style.setProperty(
    '--bubble-width',
    `${Math.max(84, roundHalfUp(84 * scale))}px`,
  );
  document.documentElement.style.setProperty(
    '--bubble-font',
    `${Math.max(11, roundHalfUp(11 * scale))}px`,
  );

  // Keep visual center fixed — do not expand from the corner.
  petX = centerX - WIN_PET * 0.5;
  petY = centerY - WIN_PET * 0.5;

  if (screenCache) {
    screenCache.petSize = WIN_PET;
    buildGrid(screenCache);
    const clamped = clampPetPosition(petX, petY);
    setPetPosition(clamped.x, clamped.y, true);
  }
}

function logError(context, err) {
  console.error(`[${APP_NAME} v${APP_VERSION}] ${context}:`, err);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

function playSfx(el) {
  if (!el) return;
  try {
    el.pause();
    el.currentTime = 0;
    el.play().catch(() => {});
  } catch (err) {
    logError('playSfx', err);
  }
}

/** After show/resume: idle base only — Look / AI toys wait until settle. */
function beginFeatureGate() {
  featuresReadyAt = Date.now() + FEATURE_READY_MS;
  lookEnabled = false;
  resetIdleEyes(true);
}

function areFeaturesReady() {
  return Date.now() >= featuresReadyAt;
}

function applyMovementLock(locked) {
  // Lock = stay put (AI pathing off); drag still OK. Snooze taps use same multi-tap as unlock.
  isMovementLocked = !!locked;
  snoozeTapCount = 0;
  lastSnoozeTapAt = 0;
  if (isMovementLocked) {
    walkTarget = null;
    lastDirection = null;
    if (!isSpeaking && !isTransitioning && currentSprite !== 'fade') {
      setSpriteDirect('idle', true);
    }
  }
}

function poseViewBox(pose) {
  return `${pose.x - POSE_HALF} ${pose.y - POSE_HALF} ${POSE_HALF * 2} ${POSE_HALF * 2}`;
}

function setEyeTransform(el, pos) {
  if (!el) return;
  el.setAttribute('transform', `matrix(1,0,0,1,${pos.x},${pos.y})`);
}

function resetIdleEyes(snap = true) {
  eyeTargetL = { x: EYE_IDLE.L.x, y: EYE_IDLE.L.y };
  eyeTargetR = { x: EYE_IDLE.R.x, y: EYE_IDLE.R.y };
  if (snap) {
    eyeCurL = { x: EYE_IDLE.L.x, y: EYE_IDLE.L.y };
    eyeCurR = { x: EYE_IDLE.R.x, y: EYE_IDLE.R.y };
    setEyeTransform(idleEyeL, eyeCurL);
    setEyeTransform(idleEyeR, eyeCurR);
  }
}

function showPose(key, options = {}) {
  const { keepLook = true } = options;
  const pose = POSES[key];
  if (!petSvgReady || !petSvg || !pose) return false;

  for (const p of Object.values(POSES)) {
    const g = petSvg.getElementById(p.id);
    if (g) g.style.display = 'none';
  }

  const group = petSvg.getElementById(pose.id);
  if (!group) return false;
  group.style.display = '';
  petSvg.setAttribute('viewBox', poseViewBox(pose));

  lookEnabled = key === 'idle' && keepLook;
  if (key !== 'idle') {
    resetIdleEyes(true);
  }

  return true;
}

async function loadSvgPet() {
  const res = await fetch(SVG_PET_URL);
  if (!res.ok) throw new Error(`SVG fetch failed: ${res.status}`);
  const text = await res.text();
  pet.innerHTML = text;
  petSvg = pet.querySelector('svg');
  if (!petSvg) throw new Error('SVG root missing');

  petSvg.removeAttribute('width');
  petSvg.removeAttribute('height');
  petSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  petSvg.style.width = '100%';
  petSvg.style.height = '100%';
  petSvg.style.display = 'block';
  petSvg.style.overflow = 'visible';
  petSvg.setAttribute('pointer-events', 'none');

  const idle = petSvg.getElementById('Idle');
  if (idle) {
    idleEyeR = idle.querySelector('[id^="Eye_ball_2"]');
    idleEyeL = idle.querySelector('[id^="Eye_ball_1"]');
  }

  for (const p of Object.values(POSES)) {
    const g = petSvg.getElementById(p.id);
    if (g) g.style.display = 'none';
  }

  // Reference frame only (180×180 safe) — never shown as a play pose.
  const safeArea = petSvg.getElementById('Fla_Base_Safe_area');
  if (safeArea) safeArea.style.display = 'none';

  petSvgReady = true;
  showPose('idle');
  resetIdleEyes(true);
}

function setLookTargetFromDirection(dir) {
  const ends = (dir && EYE_LOOK[dir]) || { L: EYE_IDLE.L, R: EYE_IDLE.R };
  eyeTargetL = { x: ends.L.x, y: ends.L.y };
  eyeTargetR = { x: ends.R.x, y: ends.R.y };
}

function lerpEyes() {
  eyeCurL.x += (eyeTargetL.x - eyeCurL.x) * LOOK_LERP;
  eyeCurL.y += (eyeTargetL.y - eyeCurL.y) * LOOK_LERP;
  eyeCurR.x += (eyeTargetR.x - eyeCurR.x) * LOOK_LERP;
  eyeCurR.y += (eyeTargetR.y - eyeCurR.y) * LOOK_LERP;
  setEyeTransform(idleEyeL, eyeCurL);
  setEyeTransform(idleEyeR, eyeCurR);
}

function updateLookAtMouse(cursor) {
  if (!lookEnabled || currentSprite !== 'idle' || !petSvgReady) return;
  if (!areFeaturesReady()) return;

  if (
    isSpeaking
    || isDragFrozen
    || isPointerSession
    || isTransitioning
    || isMouseSleeping
    || isSnoozed
    || !isPetVisible
  ) {
    setLookTargetFromDirection(null);
    lerpEyes();
    return;
  }

  if (!cursor || !screenCache) {
    setLookTargetFromDirection(null);
    lerpEyes();
    return;
  }

  const petSize = screenCache.petSize || WIN_PET;
  const cx = petX + petSize * 0.5;
  const cy = petY + petSize * 0.35;
  const dx = cursor.x - cx;
  const dy = cursor.y - cy;
  const dist = Math.hypot(dx, dy);

  if (dist < lookDeadzonePx) {
    setLookTargetFromDirection(null);
  } else {
    setLookTargetFromDirection(getDirection(dx, dy));
  }
  lerpEyes();
}

async function lookLoop() {
  while (true) {
    try {
      if (petSvgReady && isPetVisible && !isSnoozed && areFeaturesReady()) {
        // Re-enable look only after gate + idle pose.
        if (currentSprite === 'idle' && !lookEnabled) {
          lookEnabled = true;
        }
        const cursor = await fetchCursorWork();
        updateLookAtMouse(cursor);
      }
    } catch (err) {
      logError('lookLoop', err);
    }
    await sleep(LOOK_TICK_MS);
  }
}

function resetStuckState() {
  const now = Date.now();

  if (isTransitioning && now - transitionStartedAt > TRANSITION_TIMEOUT_MS) {
    logError('watchdog', new Error('force-reset isTransitioning'));
    isTransitioning = false;
  }

  if (isEndingDrag && endingDragStartedAt > 0 && now - endingDragStartedAt > ENDING_DRAG_STUCK_MS) {
    logError('watchdog', new Error('force-reset isEndingDrag'));
    isEndingDrag = false;
    endingDragStartedAt = 0;
    resetDragState();
    bumpFadeGeneration();
    forceIdleSprite();
  }

  if (isPointerSession && !isEndingDrag && pointerSessionStartedAt > 0
    && now - pointerSessionStartedAt > SESSION_STUCK_MS) {
    logError('watchdog', new Error('force-reset pointer session'));
    resetDragState();
    bumpFadeGeneration();
    forceIdleSprite();
  }

  if (isDragFrozen && !isPointerSession) {
    logError('watchdog', new Error('force-reset isDragFrozen'));
    isDragFrozen = false;
    isActivelyDragging = false;
    setDraggingUi(false);
  }

  if (isSpeaking && speakStartedAt > 0 && now - speakStartedAt > SPEAK_STUCK_MS) {
    logError('watchdog', new Error('force-reset isSpeaking'));
    stopVoice();
    hideBubble();
    isSpeaking = false;
    isTransitioning = false;
    speakStartedAt = 0;
    bumpFadeGeneration();
    forceIdleSprite();
  }
}

function getWindowLayout() {
  return { w: WIN_W, h: WIN_SPEAK_H, anchor: 'bottom' };
}

function windowOriginForPet(x, y) {
  return { x, y };
}

function clampPetPosition(x, y) {
  if (!screenCache) return { x, y };

  const petSize = screenCache.petSize || WIN_PET;
  const maxX = Math.max(0, screenCache.width - petSize);
  const maxY = Math.max(0, screenCache.height - petSize);

  x = Math.max(0, Math.min(x, maxX));
  y = Math.max(0, Math.min(y, maxY));

  const layout = getWindowLayout();
  const origin = windowOriginForPet(x, y);
  if (origin.x < 0) x -= origin.x;
  if (origin.y < 0) y -= origin.y;
  if (origin.x + layout.w > screenCache.width) {
    x -= origin.x + layout.w - screenCache.width;
  }
  if (origin.y + layout.h > screenCache.height) {
    y -= origin.y + layout.h - screenCache.height;
  }

  return {
    x: Math.max(0, Math.min(x, maxX)),
    y: Math.max(0, Math.min(y, maxY)),
  };
}

async function syncWindowPosition(force = false) {
  if (isActivelyDragging && !force) return;

  const layout = getWindowLayout();
  const ix = Math.round(petX);
  const iy = Math.round(petY);
  const { w, h, anchor } = layout;
  const gen = syncGeneration;

  if (!force && ix === lastSync.x && iy === lastSync.y && w === lastSync.w && h === lastSync.h) {
    return;
  }
  lastSync = { x: ix, y: iy, w, h };

  try {
    if (window.petAPI?.moveWindow) {
      await window.petAPI.moveWindow(ix, iy, w, h, anchor);
    }
    if (gen !== syncGeneration) return;
  } catch (err) {
    logError('syncWindowPosition', err);
  }
}

function pointerToWorkCoords(e) {
  if (screenCache && Number.isFinite(screenCache.x) && Number.isFinite(screenCache.y)) {
    return {
      x: e.screenX - screenCache.x,
      y: e.screenY - screenCache.y,
    };
  }
  return { x: e.clientX, y: e.clientY };
}

function cancelDragMoveSync() {
  if (dragSyncRaf) {
    cancelAnimationFrame(dragSyncRaf);
    dragSyncRaf = null;
  }
  if (dragFollowRaf) {
    cancelAnimationFrame(dragFollowRaf);
    dragFollowRaf = null;
  }
}

function scheduleDragMoveSync() {
  if (dragSyncRaf) return;
  dragSyncRaf = requestAnimationFrame(() => {
    dragSyncRaf = null;
    if (!isActivelyDragging && !isDragSettling) return;
    flushDragWindowPosition();
  });
}

function flushDragWindowPosition() {
  const layout = getWindowLayout();
  const ix = Math.round(petX);
  const iy = Math.round(petY);
  const { w, h, anchor } = layout;

  if (ix === lastSync.x && iy === lastSync.y && w === lastSync.w && h === lastSync.h) {
    return;
  }
  lastSync = { x: ix, y: iy, w, h };

  try {
    if (window.petAPI?.moveWindowFast) {
      window.petAPI.moveWindowFast(ix, iy, w, h, anchor);
    } else if (window.petAPI?.moveWindow) {
      window.petAPI.moveWindow(ix, iy, w, h, anchor);
    }
  } catch (err) {
    logError('flushDragWindowPosition', err);
  }
}

/**
 * Constant-speed seek toward dragTarget (graph-assisted targets OK).
 * Target may be unclamped; petX/petY are clamped when applied.
 * Runs while button held or while settling after release.
 * While actively dragging, keep RAF alive even when dist < 1 (edge cling).
 */
function ensureDragFollowLoop() {
  if (dragFollowRaf) return;

  const tick = () => {
    dragFollowRaf = null;
    if (!isActivelyDragging && !isDragSettling) return;

    const dx = dragTargetX - petX;
    const dy = dragTargetY - petY;
    const dist = Math.hypot(dx, dy);

    if (dist < 1) {
      const snapped = clampPetPosition(dragTargetX, dragTargetY);
      petX = snapped.x;
      petY = snapped.y;
      scheduleDragMoveSync();
      // Keep seeking while button held — mouse may still be outside clamped bounds.
      if (isActivelyDragging) {
        dragFollowRaf = requestAnimationFrame(tick);
      }
      return;
    }

    const step = Math.min(dist, DRAG_SPEED_PX);
    petX += (dx / dist) * step;
    petY += (dy / dist) * step;
    const clamped = clampPetPosition(petX, petY);
    petX = clamped.x;
    petY = clamped.y;
    scheduleDragMoveSync();

    if (isActivelyDragging || isDragSettling) {
      dragFollowRaf = requestAnimationFrame(tick);
    }
  };

  dragFollowRaf = requestAnimationFrame(tick);
}

function updateDragPosition(workX, workY) {
  if (!isActivelyDragging || !dragGrab) return;

  lastDragWork = { x: workX, y: workY };
  // Store unclamped mouse-derived target; clamp only when applying pet position.
  dragTargetX = workX - dragGrab.offsetX;
  dragTargetY = workY - dragGrab.offsetY;
  ensureDragFollowLoop();
}

/** After release: keep seeking at same speed until final (graph-snapped) target. */
async function settleDragToTarget(tx, ty) {
  isDragSettling = true;
  const clamped = clampPetPosition(tx, ty);
  dragTargetX = clamped.x;
  dragTargetY = clamped.y;
  ensureDragFollowLoop();

  while (isDragSettling) {
    const dist = Math.hypot(dragTargetX - petX, dragTargetY - petY);
    if (dist < 1.25) {
      petX = dragTargetX;
      petY = dragTargetY;
      await syncWindowPosition(true);
      break;
    }
    await sleep(MOVE_TICK_MS);
  }

  isDragSettling = false;
  cancelDragMoveSync();
}

function setBubbleUi(visible) {
  document.body.classList.toggle('has-bubble', visible);
}

async function readWindowPetPosition() {
  if (!window.petAPI?.getWindowPetPosition) {
    return { petX, petY };
  }
  const pos = await window.petAPI.getWindowPetPosition();
  return { petX: pos.petX, petY: pos.petY };
}

async function refreshScreenSize() {
  try {
    if (!window.petAPI) return;
    const next = await window.petAPI.getScreenSize();
    const changed = !screenCache
      || screenCache.width !== next.width
      || screenCache.height !== next.height;

    screenCache = next;
    if (changed || !gridNodes.length) {
      buildGrid(screenCache);
    }

    if (changed && !isActivelyDragging) {
      const clamped = clampPetPosition(petX, petY);
      setPetPosition(clamped.x, clamped.y, true);
      await syncWindowPosition(true);
    }
  } catch (err) {
    logError('refreshScreenSize', err);
  }
}

function getMoveBounds() {
  if (!screenCache) return { width: 0, height: 0, maxX: 0, maxY: 0 };
  const { width, height, petSize } = screenCache;
  return {
    width,
    height,
    maxX: Math.max(0, width - petSize),
    maxY: Math.max(0, height - petSize),
  };
}

/** Unequal 3x3 grid (thin A/C + thin rows 1/3, large B2) inside DeadZone inset. */
function buildGrid(area) {
  gridNodes = [];
  if (!area || !Number.isFinite(area.width) || !Number.isFinite(area.height)) {
    return gridNodes;
  }

  const petSize = area.petSize || WIN_PET;
  const dz = activeDeadzonePx;
  const left = dz;
  const top = dz;
  const right = Math.max(left, area.width - dz - petSize);
  const bottom = Math.max(top, area.height - dz - petSize);
  const usableW = Math.max(0, right - left);
  const usableH = Math.max(0, bottom - top);

  const edgeW = usableW * GRID_EDGE_FRAC;
  const centerW = Math.max(0, usableW - 2 * edgeW);
  const colWidths = [edgeW, centerW, edgeW];

  const edgeH = usableH * GRID_EDGE_FRAC;
  const centerH = Math.max(0, usableH - 2 * edgeH);
  const rowHeights = [edgeH, centerH, edgeH];

  let y = top;
  for (let row = 0; row < 3; row += 1) {
    let x = left;
    for (let col = 0; col < 3; col += 1) {
      gridNodes.push({
        id: row * 3 + col,
        row,
        col,
        label: `${String.fromCharCode(65 + col)}${row + 1}`,
        x: x + colWidths[col] / 2,
        y: y + rowHeights[row] / 2,
      });
      x += colWidths[col];
    }
    y += rowHeights[row];
  }

  return gridNodes;
}

function getCornerNodes() {
  return gridNodes.filter(
    (n) => (n.col === 0 || n.col === 2) && (n.row === 0 || n.row === 2)
  );
}

/** Always lands on a valid node via seed % count. */
function pickNode(seed, pool) {
  const list = pool && pool.length ? pool : gridNodes;
  if (!list.length) return null;
  const n = Math.abs(Math.floor(Number(seed) || 0));
  return list[n % list.length];
}

function pickCornerNode(seed) {
  return pickNode(seed, getCornerNodes());
}

function nearestNode(x, y, pool) {
  const list = pool && pool.length ? pool : gridNodes;
  if (!list.length) return null;

  let best = list[0];
  let bestD = Infinity;
  for (let i = 0; i < list.length; i += 1) {
    const d = Math.hypot(list[i].x - x, list[i].y - y);
    if (d < bestD) {
      bestD = d;
      best = list[i];
    }
  }
  return best;
}

function pickWalkTarget() {
  if (!gridNodes.length && screenCache) buildGrid(screenCache);
  if (!gridNodes.length) return null;

  const seed = Math.floor(petX + petY);
  let node = pickNode(seed);
  const near = nearestNode(petX, petY);
  if (node && near && node.id === near.id && gridNodes.length > 1) {
    node = pickNode(seed + 1);
  }
  return node;
}

/**
 * 4-cardinal side of cursor relative to pet.
 * Used for mouse-flee (not 8-dir — fewer flips).
 */
function getCardinalSide(dx, dy) {
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'e' : 'w';
  return dy > 0 ? 's' : 'n';
}

/** Grid pool on the side opposite the mouse (flee away). */
function poolOppositeSide(side) {
  if (!gridNodes.length) return [];
  if (side === 'e') return gridNodes.filter((n) => n.col === 0);
  if (side === 'w') return gridNodes.filter((n) => n.col === 2);
  if (side === 's') return gridNodes.filter((n) => n.row === 0);
  if (side === 'n') return gridNodes.filter((n) => n.row === 2);
  return [];
}

function pickNodeOppositeSide(side, avoidId = null) {
  if (!gridNodes.length && screenCache) buildGrid(screenCache);
  const pool = poolOppositeSide(side).filter((n) => avoidId == null || n.id !== avoidId);
  if (!pool.length) return null;

  // Prefer farthest from current pet among that side.
  let best = pool[0];
  let bestD = -1;
  for (const n of pool) {
    const d = Math.hypot(n.x - petX, n.y - petY);
    if (d > bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

function clearMouseFleeState() {
  mouseFleeSide = null;
  mouseFleeNearActive = false;
  mouseFleeDidFlee = false;
  mouseFleeLastCheckAt = 0;
  mouseFleeLastMousePos = null;
  mouseFleePendingSide = null;
  mouseFleePendingAt = 0;
}

/**
 * Mouse-flee destination (opposite grid side).
 * - Enter near → change destination ONCE.
 * - Same mouse cardinal while still near → no retarget (pet walking past a static mouse does not flip).
 * - Mouse moves to another cardinal → MOUSE_FLEE_CHECK_MS confirm, then retarget once.
 * Checks at most every MOUSE_FLEE_CHECK_MS; new side changes require meaningful mouse delta.
 */
function evaluateMouseFleeTarget(cursor, avoidId = null) {
  if (!cursor) {
    clearMouseFleeState();
    return null;
  }
  if (!isCursorNearPet(cursor)) {
    clearMouseFleeState();
    return null;
  }

  const now = Date.now();
  if (now - mouseFleeLastCheckAt < MOUSE_FLEE_CHECK_MS) {
    return null;
  }
  mouseFleeLastCheckAt = now;

  const c = petCenterWork();
  const side = getCardinalSide(cursor.x - c.x, cursor.y - c.y);
  if (!side) return null;

  const mouseMoved = !mouseFleeLastMousePos
    || Math.hypot(
      cursor.x - mouseFleeLastMousePos.x,
      cursor.y - mouseFleeLastMousePos.y,
    ) >= MOUSE_FLEE_MOVE_PX;

  // First enter near radius → flee once to opposite grid side.
  if (!mouseFleeNearActive || !mouseFleeDidFlee) {
    mouseFleeNearActive = true;
    mouseFleeDidFlee = true;
    mouseFleeSide = side;
    mouseFleeLastMousePos = { x: cursor.x, y: cursor.y };
    mouseFleePendingSide = null;
    mouseFleePendingAt = 0;
    return pickNodeOppositeSide(side, avoidId);
  }

  // Same locked side → no retarget; clear any pending.
  if (side === mouseFleeSide) {
    mouseFleePendingSide = null;
    mouseFleePendingAt = 0;
    if (mouseMoved) {
      mouseFleeLastMousePos = { x: cursor.x, y: cursor.y };
    }
    return null;
  }

  // Confirming a previously detected side change (flee-check loop) — mouse may be still.
  if (mouseFleePendingSide === side) {
    if (now - mouseFleePendingAt < MOUSE_FLEE_CHECK_MS) {
      return null;
    }
    mouseFleeSide = side;
    mouseFleeLastMousePos = { x: cursor.x, y: cursor.y };
    mouseFleePendingSide = null;
    mouseFleePendingAt = 0;
    return pickNodeOppositeSide(side, avoidId);
  }

  // New cardinal vs locked — only start pending if the mouse itself moved
  // (pet walking past a static cursor must not flip sides).
  if (!mouseMoved) {
    return null;
  }
  mouseFleeLastMousePos = { x: cursor.x, y: cursor.y };
  mouseFleePendingSide = side;
  mouseFleePendingAt = now;
  return null;
}

async function fetchCursorWork() {
  try {
    if (!window.petAPI?.getCursorPos) return lastCursorWork;
    const pos = await window.petAPI.getCursorPos();
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return lastCursorWork;
    lastCursorWork = { x: pos.x, y: pos.y };
    return lastCursorWork;
  } catch (err) {
    logError('fetchCursorWork', err);
    return lastCursorWork;
  }
}

function petCenterWork() {
  const size = screenCache?.petSize || WIN_PET;
  return { x: petX + size / 2, y: petY + size / 2 };
}

function isCursorNearPet(cursor) {
  if (!cursor) return false;
  const c = petCenterWork();
  return Math.hypot(c.x - cursor.x, c.y - cursor.y) < MOUSE_NEAR_PX;
}

function getTriggerDepth() {
  return TRIGGER_DEPTH_PX;
}

function getTriggerEdgesRaw(x, y, maxX, maxY) {
  const d = getTriggerDepth();
  const edges = [];
  if (x < d) edges.push('left');
  if (x > maxX - d) edges.push('right');
  if (y < d) edges.push('top');
  if (y > maxY - d) edges.push('bottom');
  return edges;
}

function getTriggerEdges(x, y, maxX, maxY) {
  if (Date.now() < warpCooldownUntil) return [];
  return getTriggerEdgesRaw(x, y, maxX, maxY);
}

function teleportToNode(node) {
  if (!node) return;
  const clamped = clampPetPosition(node.x, node.y);
  petX = clamped.x;
  petY = clamped.y;
  walkTarget = null;
  lastDirection = null;
  warpCooldownUntil = Date.now() + WARP_COOLDOWN_MS;
  playSfx(sfxMove);
  setSpriteDirect('idle', true);
}

function instantWarp(_edges, _maxX, _maxY) {
  if (!gridNodes.length && screenCache) buildGrid(screenCache);
  const seed = Math.floor(petX + petY);
  const node = pickCornerNode(seed) || pickNode(seed);
  if (!node) return;
  teleportToNode(node);
  syncWindowPosition(true).catch((err) => logError('instantWarp sync', err));
}

function setPetPosition(x, y, skipWindowSync = false) {
  if (isDragFrozen) return;

  const clamped = clampPetPosition(x, y);
  petX = clamped.x;
  petY = clamped.y;

  if (!skipWindowSync) {
    syncWindowPosition();
  }
}

function stopVoice() {
  try {
    noteS.pause();
    noteL.pause();
    noteS.currentTime = 0;
    noteL.currentTime = 0;
    noteL.loop = false;
  } catch (err) {
    logError('stopVoice', err);
  }
}

function playClickNote() {
  playSfx(sfxClick || noteS);
}

function forceIdleSprite() {
  // Idle is the safe base; Look re-arms only after feature gate via lookLoop.
  showPose('idle', { keepLook: false });
  currentSprite = 'idle';
}

function bumpFadeGeneration() {
  fadeGen += 1;
  return fadeGen;
}

function interruptForDrag() {
  dragReleaseGen += 1;
  speechGeneration += 1;
  isSpeaking = false;
  isTransitioning = false;
  lastDirection = null;
  walkTarget = null;
  skipNextIdle = false;
  speakStartedAt = 0;
  stopVoice();
  bubble.classList.add('hidden');
  setBubbleUi(false);
  bumpFadeGeneration();
}

function cancelSpeaking() {
  interruptForDrag();
  forceIdleSprite();
}

function randomRhythm(minBeats = MIN_RHYTHM_BEATS) {
  const beats = minBeats + Math.floor(Math.random() * 3);
  const pattern = [];
  for (let i = 0; i < beats; i++) {
    pattern.push(Math.random() < 0.75 ? 'S' : 'L');
  }
  return pattern;
}

async function playRhythm(pattern, totalDuration, generation) {
  const gap = totalDuration / pattern.length;
  for (const note of pattern) {
    if (!isSpeaking || generation !== speechGeneration) break;
    stopVoice();
    if (!isSpeaking || generation !== speechGeneration) break;
    const audio = note === 'S' ? noteS : noteL;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    await sleep(gap);
  }
}

async function runFadeSequence(gen, options = {}) {
  const {
    allowDuringDrag = false,
    holdLastWhile = null,
    finishOnIdle = true,
    abortIf = null,
  } = options;

  for (const frame of FADE_FRAMES) {
    if (gen !== fadeGen) return 'cancelled';
    if (abortIf && abortIf()) {
      if (finishOnIdle) forceIdleSprite();
      return 'aborted';
    }
    if (!allowDuringDrag && shouldAbortAi()) {
      if (finishOnIdle) forceIdleSprite();
      return 'aborted';
    }
    showPose(frame);
    currentSprite = 'fade';
    await sleep(FADE_FRAME_MS);
    if (gen !== fadeGen) return 'cancelled';
  }

  if (typeof holdLastWhile === 'function' && holdLastWhile()) {
    return 'held';
  }

  if (finishOnIdle && gen === fadeGen) {
    forceIdleSprite();
  }
  return 'done';
}

/** Drag press: hold Fade_1 only (not the full fade1→fade2 sequence). */
function startPressFade() {
  bumpFadeGeneration();
  setSpriteDirect('fade1', true);
}

async function playReleaseFade() {
  const gen = bumpFadeGeneration();
  await runFadeSequence(gen, { finishOnIdle: true });
}

/**
 * Visual-only UX layer (OOP): click/drag/snooze logic must never await or be gated by this.
 * Logic may signal; animation plays independently (may be interrupted mid-way).
 */
function signalClickUx(kind, dragGen = null) {
  try {
    if (kind === 'press') {
      playClickNote();
      startPressFade();
      return;
    }

    if (kind === 'release-tap' || kind === 'release-drag') {
      const gen = dragGen;
      Promise.resolve()
        .then(async () => {
          await playReleaseFade();
          if (gen != null) await playDragComplaint(gen);
        })
        .catch((err) => logError(`signalClickUx ${kind}`, err));
    }
  } catch (err) {
    logError('signalClickUx', err);
  }
}

async function playFade(options = {}) {
  const opts = typeof options === 'boolean' ? { allowDuringDrag: options } : options;
  const { allowDuringDrag = false, abortIf = null } = opts;
  const gen = bumpFadeGeneration();
  const result = await runFadeSequence(gen, {
    allowDuringDrag,
    abortIf,
    finishOnIdle: true,
  });
  return result === 'done';
}

async function playSpeakAnimation(duration, generation) {
  const start = performance.now();
  let i = 0;
  while (
    isSpeaking
    && generation === speechGeneration
    && performance.now() - start < duration
  ) {
    showPose(SPEAK_FRAMES[i % SPEAK_FRAMES.length]);
    i += 1;
    await sleep(SPEAK_FRAME_MS);
  }
}

function setSpriteDirect(key, force = false) {
  if (!key) return;
  // During drag freeze, only idle + fade1 + speak (awareness force) are allowed.
  if (isDragFrozen && !force && key !== 'idle' && key !== 'fade1' && key !== 'speak') return;
  if (!force && key === currentSprite) return;

  if (key === 'speak') {
    showPose(SPEAK_FRAMES[0]);
  } else if (POSES[key]) {
    showPose(key);
  } else {
    return;
  }
  currentSprite = key;
}

async function waitTransitionSlot() {
  const start = performance.now();
  while (isTransitioning) {
    if (performance.now() - start > TRANSITION_TIMEOUT_MS) {
      logError('waitTransitionSlot', new Error('timeout'));
      isTransitioning = false;
      return;
    }
    await sleep(30);
  }
}

async function transitionTo(nextKey) {
  if (nextKey === currentSprite) return;
  await waitTransitionSlot();

  isTransitioning = true;
  transitionStartedAt = Date.now();
  try {
    await playFade();
    setSpriteDirect(nextKey);
  } catch (err) {
    logError('transitionTo', err);
    setSpriteDirect(nextKey);
  } finally {
    isTransitioning = false;
  }
}

function getDirection(dx, dy) {
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return 'idle';

  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  if (angle >= -22.5 && angle < 22.5) return 'e';
  if (angle >= 22.5 && angle < 67.5) return 'se';
  if (angle >= 67.5 && angle < 112.5) return 's';
  if (angle >= 112.5 && angle < 157.5) return 'sw';
  if (angle >= 157.5 || angle < -157.5) return 'w';
  if (angle >= -157.5 && angle < -112.5) return 'nw';
  if (angle >= -112.5 && angle < -67.5) return 'n';
  if (angle >= -67.5 && angle < -22.5) return 'ne';

  return 'idle';
}

function shouldAbortAi() {
  return isSnoozed || isDragFrozen || !isPetVisible || isMouseSleeping
    || awarenessPriorityActive || shellBusyActive;
}

/**
 * Root click unlock: CSS cursor can show grab while flags still block beginDragSession
 * after soft-hide / snooze wake. Hover reaching #pet proves the surface is hittable.
 */
function unlockPetInput(_reason = '') {
  isPetVisible = true;
  isSnoozed = false;
  isMouseSleeping = false;
  lastMouseActiveAt = Date.now();

  if (isPointerSession || isDragFrozen || isEndingDrag || isActivelyDragging) {
    cancelDragMoveSync();
    releaseActivePointer();
    resetDragState();
  }
}

async function pausePet() {
  // Soft-hide stages: stop walk / speech / SFX. Window stays alive (opacity handled in main).
  await hardResetStagesForTrayPipe();
  const gen = ++visibilityGen;
  isPetVisible = false;
  beginFeatureGate();
  playSfx(sfxHide);

  dragReleaseGen += 1;
  speechGeneration += 1;
  isSpeaking = false;
  isTransitioning = false;
  speakStartedAt = 0;
  isMouseSleeping = false;
  stopVoice();
  hideBubble();
  bumpFadeGeneration();

  if (isPointerSession || isDragFrozen) {
    await cancelPointerSessionQuiet();
  }
  if (gen !== visibilityGen) {
    notifyShellReady('pausePet-stale');
    return;
  }

  try {
    if (window.petAPI?.exitDragMode) {
      await window.petAPI.exitDragMode();
    }
  } catch (err) {
    logError('pausePet exitDragMode', err);
  }
  if (gen !== visibilityGen) {
    notifyShellReady('pausePet-stale');
    return;
  }

  resetDragState();
  releaseActivePointer();
  forceIdleSprite();
  resetSnoozeTaps();
  if (gen === visibilityGen) notifyShellReady('pausePet');
}

async function resumePet() {
  // Reverse of pause: unlock click flags first (same pipe every wake).
  const gen = ++visibilityGen;
  beginFeatureGate();
  unlockPetInput('resumePet');
  playSfx(sfxShow);

  dragReleaseGen += 1;
  speechGeneration += 1;
  isSpeaking = false;
  isTransitioning = false;
  speakStartedAt = 0;
  stopVoice();
  hideBubble();
  bumpFadeGeneration();
  forceIdleSprite();
  resetSnoozeTaps();

  try {
    await refreshScreenSize();
    if (gen !== visibilityGen) {
      notifyShellReady('resumePet-stale');
      return;
    }

    lastSync = { x: -1, y: -1, w: -1, h: -1 };
    await syncWindowPosition(true);
    if (gen !== visibilityGen) {
      notifyShellReady('resumePet-stale');
      return;
    }

    // Wake may race with a stale pause — unlock again after awaits.
    if (gen === visibilityGen) unlockPetInput('resumePet-after-sync');

    if (window.petAPI?.restoreWindowShell) {
      await window.petAPI.restoreWindowShell();
    }
    if (gen === visibilityGen) unlockPetInput('resumePet-done');

    // Close shellBusy (Tray pipe) before Show talk — talk is Stage other.
    if (gen === visibilityGen) notifyShellReady('resumePet');

    if (gen === visibilityGen) {
      try {
        await maybeSpeakOnSoftShow(gen);
      } catch (err) {
        logError('maybeSpeakOnSoftShow', err);
      }
    }
  } catch (err) {
    logError('resumePet', err);
    unlockPetInput('resumePet-error');
    notifyShellReady('resumePet-error');
  }
}

function pickShowSpeechPhrase(roundIndex) {
  const cats = localePack.showCategories || [];
  const cat = cats[roundIndex];
  if (!cat || !cat.phrases || !cat.phrases.length) return null;
  return pickFromPoolList(cat.phrases);
}

async function waitSoftShowSpeakSlot(gen) {
  while (gen === visibilityGen) {
    if (!isPetVisible || isSnoozed) return false;
    if (awarenessPriorityActive) return false;
    if (!areFeaturesReady()) {
      await sleep(50);
      continue;
    }
    return true;
  }
  return false;
}

/**
 * Soft-show speech: play ordered showCategories (JSON logline beats before leave).
 * Holds showSpeech gate for the whole intro — Tray drop + block general awareness.
 * Porn awareness may still seize (highest); then we yield via awarenessPriorityActive.
 */
async function maybeSpeakOnSoftShow(gen) {
  if (awarenessPriorityActive) return;

  const cats = localePack.showCategories || [];
  const count = Math.max(1, cats.length);

  const gateGen = await setShowSpeechGate(true);
  try {
    for (let i = 0; i < count; i += 1) {
      const ready = await waitSoftShowSpeakSlot(gen);
      if (!ready || gen !== visibilityGen || !isPetVisible || isSnoozed) return;
      if (awarenessPriorityActive) return;

      walkTarget = null;
      skipNextIdle = false;
      if (isPointerSession || isDragFrozen || isActivelyDragging) {
        try {
          await cancelPointerSessionQuiet();
        } catch (err) {
          logError('maybeSpeakOnSoftShow cancelPointer', err);
        }
      }

      const phrase = pickShowSpeechPhrase(i);
      if (!phrase) continue;
      await startSpeaking(phrase, { force: true });
    }
  } finally {
    // Only clear if we still own the gate (Tray hard-reset / newer Show may have bumped gen).
    if (gateGen === showSpeechGateGen) {
      await setShowSpeechGate(false);
    }
  }
}

/**
 * Size change = soft hide → apply scale → soft show.
 * Same interrupt/reset pipe as tray hide/show so AI / drag / look never continue mid-work.
 * No hide/show SFX and no window opacity (pet stays on screen while footprint updates).
 */
async function rebootstrapAfterSizeChange(level) {
  const next = Math.max(1, Math.min(8, Math.floor(Number(level) || 1)));
  // Same level (e.g. echo) — do not bump visibilityGen or kill Show speech.
  if (next === petSizeLevel) return;

  await hardResetStagesForTrayPipe();

  const pauseGen = ++visibilityGen;
  isPetVisible = false;
  beginFeatureGate();

  dragReleaseGen += 1;
  speechGeneration += 1;
  isSpeaking = false;
  isTransitioning = false;
  speakStartedAt = 0;
  isMouseSleeping = false;
  walkTarget = null;
  lastDirection = null;
  mouseFleeDidFlee = false;
  mouseFleePendingSide = null;
  skipNextIdle = false;
  stopVoice();
  hideBubble();
  bumpFadeGeneration();

  if (isPointerSession || isDragFrozen) {
    await cancelPointerSessionQuiet();
  }
  if (pauseGen !== visibilityGen) {
    notifyShellReady('size-stale');
    return;
  }

  try {
    if (window.petAPI?.exitDragMode) {
      await window.petAPI.exitDragMode();
    }
  } catch (err) {
    logError('rebootstrapAfterSizeChange exitDragMode', err);
  }
  if (pauseGen !== visibilityGen) {
    notifyShellReady('size-stale');
    return;
  }

  resetDragState();
  releaseActivePointer();
  forceIdleSprite();
  resetSnoozeTaps();

  applyPetSizeLevel(next);

  const resumeGen = ++visibilityGen;
  beginFeatureGate();
  unlockPetInput('size-rebootstrap');

  dragReleaseGen += 1;
  speechGeneration += 1;
  isSpeaking = false;
  isTransitioning = false;
  speakStartedAt = 0;
  stopVoice();
  hideBubble();
  bumpFadeGeneration();
  forceIdleSprite();
  resetSnoozeTaps();

  try {
    await refreshScreenSize();
    if (resumeGen !== visibilityGen) {
      notifyShellReady('size-stale');
      return;
    }

    lastSync = { x: -1, y: -1, w: -1, h: -1 };
    await syncWindowPosition(true);
    if (resumeGen !== visibilityGen) {
      notifyShellReady('size-stale');
      return;
    }

    if (resumeGen === visibilityGen) unlockPetInput('size-rebootstrap-after-sync');

    if (window.petAPI?.restoreWindowShell) {
      await window.petAPI.restoreWindowShell();
    }
    if (resumeGen === visibilityGen) unlockPetInput('size-rebootstrap-done');

    // Close Tray shell before Show talk (Stage other).
    if (resumeGen === visibilityGen) notifyShellReady('size-rebootstrap');

    if (resumeGen === visibilityGen && isPetVisible) {
      try {
        await maybeSpeakOnSoftShow(resumeGen);
      } catch (err) {
        logError('rebootstrapAfterSizeChange showSpeech', err);
      }
    }
  } catch (err) {
    logError('rebootstrapAfterSizeChange', err);
    unlockPetInput('size-rebootstrap-error');
    notifyShellReady('size-rebootstrap-error');
  }
}

/**
 * Locale change = soft hide → apply pack → soft show (same pipe as Size).
 */
async function rebootstrapAfterLocaleChange(pack) {
  await hardResetStagesForTrayPipe();

  applyLocalePack(pack);

  const pauseGen = ++visibilityGen;
  isPetVisible = false;
  beginFeatureGate();

  dragReleaseGen += 1;
  speechGeneration += 1;
  isSpeaking = false;
  isTransitioning = false;
  speakStartedAt = 0;
  isMouseSleeping = false;
  walkTarget = null;
  lastDirection = null;
  mouseFleeDidFlee = false;
  mouseFleePendingSide = null;
  skipNextIdle = false;
  stopVoice();
  hideBubble();
  bumpFadeGeneration();

  if (isPointerSession || isDragFrozen) {
    await cancelPointerSessionQuiet();
  }
  if (pauseGen !== visibilityGen) {
    notifyShellReady('locale-stale');
    return;
  }

  try {
    if (window.petAPI?.exitDragMode) {
      await window.petAPI.exitDragMode();
    }
  } catch (err) {
    logError('rebootstrapAfterLocaleChange exitDragMode', err);
  }
  if (pauseGen !== visibilityGen) {
    notifyShellReady('locale-stale');
    return;
  }

  resetDragState();
  releaseActivePointer();
  forceIdleSprite();
  resetSnoozeTaps();

  const resumeGen = ++visibilityGen;
  beginFeatureGate();
  unlockPetInput('locale-rebootstrap');

  dragReleaseGen += 1;
  speechGeneration += 1;
  isSpeaking = false;
  isTransitioning = false;
  speakStartedAt = 0;
  stopVoice();
  hideBubble();
  bumpFadeGeneration();
  forceIdleSprite();
  resetSnoozeTaps();

  try {
    await refreshScreenSize();
    if (resumeGen !== visibilityGen) {
      notifyShellReady('locale-stale');
      return;
    }

    lastSync = { x: -1, y: -1, w: -1, h: -1 };
    await syncWindowPosition(true);
    if (resumeGen !== visibilityGen) {
      notifyShellReady('locale-stale');
      return;
    }

    if (resumeGen === visibilityGen) unlockPetInput('locale-rebootstrap-after-sync');

    if (window.petAPI?.restoreWindowShell) {
      await window.petAPI.restoreWindowShell();
    }
    if (resumeGen === visibilityGen) unlockPetInput('locale-rebootstrap-done');

    // Close Tray shell before Show talk (Stage other).
    if (resumeGen === visibilityGen) notifyShellReady('locale-rebootstrap');

    if (resumeGen === visibilityGen && isPetVisible) {
      try {
        await maybeSpeakOnSoftShow(resumeGen);
      } catch (err) {
        logError('rebootstrapAfterLocaleChange showSpeech', err);
      }
    }
  } catch (err) {
    logError('rebootstrapAfterLocaleChange', err);
    unlockPetInput('locale-rebootstrap-error');
    notifyShellReady('locale-rebootstrap-error');
  }
}

function scheduleNextWarp() {
  nextWarpAt = Date.now() + randBetween(60, 120) * 1000;
}

async function idlePhase(durationMs) {
  setSpriteDirect('idle');
  const end = performance.now() + durationMs;

  while (performance.now() < end) {
    if (shouldAbortAi() || isSpeaking) return;
    await sleep(200);
  }
}

/** Straight-line tween from current position (n) to target node B. */
async function tweenToNode(target) {
  if (!target || shouldAbortAi() || isSpeaking || isMovementLocked) return false;

  let currentTarget = target;

  while (currentTarget && !shouldAbortAi() && !isSpeaking && !isMovementLocked) {
    const startX = petX;
    const startY = petY;
    const endX = currentTarget.x;
    const endY = currentTarget.y;
    const dx = endX - startX;
    const dy = endY - startY;
    const dist = Math.hypot(dx, dy);

    walkTarget = currentTarget;

    if (dist < 2) {
      setPetPosition(endX, endY, true);
      await syncWindowPosition(true);
      walkTarget = null;
      setSpriteDirect('idle');
      lastDirection = null;
      playSfx(sfxMove);
      return true;
    }

    // Start of this leg (also covers post-retarget new destination).
    playSfx(sfxMove);

    const dir = getDirection(dx, dy);
    if (dir !== 'idle') {
      lastDirection = dir;
      setSpriteDirect(dir);
    }

    const durationMs = Math.max(MOVE_TICK_MS, (dist / MOVE_SPEED) * MOVE_TICK_MS);
    const startTime = performance.now();
    let frame = 0;
    let retarget = null;

    while (true) {
      if (shouldAbortAi() || isSpeaking || isMovementLocked) {
        return false;
      }

      {
        const cursor = await fetchCursorWork();
        const away = evaluateMouseFleeTarget(cursor, currentTarget.id);
        if (away && away.id !== currentTarget.id) {
          retarget = away;
          break;
        }
      }

      const t = Math.min(1, (performance.now() - startTime) / durationMs);
      const x = startX + dx * t;
      const y = startY + dy * t;

      setPetPosition(x, y, true);
      frame += 1;
      if (frame % TWEEN_SYNC_EVERY === 0 || t >= 1) {
        await syncWindowPosition();
      }

      if (t >= 1) break;
      await sleep(MOVE_TICK_MS);
    }

    if (retarget) {
      currentTarget = retarget;
      continue;
    }

    walkTarget = null;
    setSpriteDirect('idle');
    lastDirection = null;
    playSfx(sfxMove);
    return true;
  }

  return false;
}

async function movePhase() {
  if (isMovementLocked) return;
  if (!screenCache) await refreshScreenSize();
  if (!gridNodes.length) buildGrid(screenCache);

  let target = walkTarget;
  if (!target) {
    target = pickWalkTarget();
  }
  if (!target) return;

  await tweenToNode(target);
}

async function cornerWarpPhase() {
  if (shouldAbortAi() || isSpeaking || isMovementLocked) return;
  if (!screenCache) await refreshScreenSize();
  if (!gridNodes.length) buildGrid(screenCache);

  const corners = getCornerNodes();
  if (!corners.length) return;

  let lastId = nearestNode(petX, petY)?.id ?? -1;
  const baseSeed = Math.floor(petX + petY + Date.now());

  // One warp stage = WARP_HOPS corner teleports in a row.
  for (let hop = 0; hop < WARP_HOPS; hop += 1) {
    if (shouldAbortAi() || isSpeaking || isMovementLocked) return;

    let target = null;
    for (let tryN = 0; tryN < corners.length * 2; tryN += 1) {
      const candidate = pickCornerNode(baseSeed + hop * 7 + tryN);
      if (candidate && candidate.id !== lastId) {
        target = candidate;
        break;
      }
    }
    if (!target) target = pickCornerNode(baseSeed + hop);
    if (!target) continue;

    setSpriteDirect('idle');
    await playFade();
    if (shouldAbortAi() || isSpeaking || isMovementLocked) return;

    teleportToNode(target);
    lastId = target.id;
    lastSync = { x: -1, y: -1, w: -1, h: -1 };
    await syncWindowPosition(true);
  }
}

function showBubble(text, options = {}) {
  const force = !!options.force;
  if (!force && isDragFrozen) return;
  speechText.textContent = text;
  bubble.classList.remove('hidden');
  setBubbleUi(true);
}

function hideBubble() {
  bubble.classList.add('hidden');
  setBubbleUi(false);
}

function speechDuration(text) {
  return Math.max(6000, 1500 + text.length * 80);
}

/**
 * @param {string} text
 * @param {{ force?: boolean }} [options] force = awareness priority (ignore drag/walk locks)
 */
async function startSpeaking(text, options = {}) {
  const force = !!options.force;
  if (!force && (isSpeaking || isDragFrozen)) return;

  if (force && isSpeaking) {
    speechGeneration += 1;
    isSpeaking = false;
    speakStartedAt = 0;
    stopVoice();
    hideBubble();
  }

  const generation = speechGeneration + 1;
  speechGeneration = generation;
  isSpeaking = true;
  speakStartedAt = Date.now();

  try {
    stopVoice();
    if (generation !== speechGeneration) return;

    if (force) {
      // Skip fade transition — awareness must not be aborted by AI/drag gates.
      setSpriteDirect('speak', true);
    } else {
      await transitionTo('speak');
      if (generation !== speechGeneration) return;
    }

    showBubble(text, { force });
    const duration = speechDuration(text);
    const pattern = randomRhythm();

    await Promise.all([
      playSpeakAnimation(duration, generation),
      playRhythm(pattern, duration, generation),
      sleep(duration),
    ]);
  } catch (err) {
    logError('startSpeaking', err);
  } finally {
    speakStartedAt = 0;

    if (generation !== speechGeneration) return;

    stopVoice();
    hideBubble();
    isSpeaking = false;
    lastDirection = null;

    if (!isSnoozed && (!isDragFrozen || force)) {
      try {
        if (force) {
          forceIdleSprite();
        } else {
          await transitionTo('idle');
        }
      } catch (err) {
        logError('startSpeaking->idle', err);
        setSpriteDirect('idle');
      }
    }
  }
}

function randomPhrase() {
  return pickFromPoolList(localePack.pools?.idle) || 'Hi';
}

async function enterMouseSleep() {
  if (isMouseSleeping || isSnoozed || !isPetVisible) return;

  isMouseSleeping = true;
  dragReleaseGen += 1;
  speechGeneration += 1;
  isSpeaking = false;
  isTransitioning = false;
  speakStartedAt = 0;
  stopVoice();
  hideBubble();
  bumpFadeGeneration();

  if (isPointerSession || isDragFrozen) {
    await cancelPointerSessionQuiet();
  }

  showPose('sleep');
  currentSprite = 'sleep';
}

async function wakeFromMouseSleep() {
  if (!isMouseSleeping) return;

  isMouseSleeping = false;
  lastMouseActiveAt = Date.now();
  bumpFadeGeneration();

  showPose('fade2');
  currentSprite = 'wake';
  await sleep(FADE_FRAME_MS * 2);

  if (!isMouseSleeping && isPetVisible && !isSnoozed && !isDragFrozen) {
    forceIdleSprite();
  }
}

async function mouseWatchLoop() {
  lastMouseActiveAt = Date.now();
  let prevX = null;
  let prevY = null;

  while (true) {
    try {
      if (!isPetVisible || isSnoozed) {
        await sleep(MOUSE_POLL_MS);
        continue;
      }

      const cursor = await fetchCursorWork();
      if (cursor) {
        const reallyMoved = prevX == null
          || Math.hypot(cursor.x - prevX, cursor.y - prevY) > 2;

        if (reallyMoved) {
          lastMouseActiveAt = Date.now();
          if (isMouseSleeping) {
            await wakeFromMouseSleep();
          }
        }

        prevX = cursor.x;
        prevY = cursor.y;
      }

      if (
        !isMouseSleeping
        && isPetVisible
        && !isSnoozed
        && !isDragFrozen
        && Date.now() - lastMouseActiveAt >= MOUSE_SLEEP_MS
      ) {
        await enterMouseSleep();
      }
    } catch (err) {
      logError('mouseWatchLoop', err);
    }

    await sleep(MOUSE_POLL_MS);
  }
}

async function aiLoop() {
  aiRunning = true;
  scheduleNextWarp();

  while (aiRunning) {
    if (isSnoozed || isDragFrozen || !isPetVisible || isMouseSleeping) {
      await sleep(300);
      continue;
    }

    if (!areFeaturesReady()) {
      await sleep(50);
      continue;
    }

    if (isSpeaking || isTransitioning) {
      await sleep(200);
      continue;
    }

    resetStuckState();

    try {
      if (isMovementLocked) {
        walkTarget = null;
        if (currentSprite !== 'idle' && currentSprite !== 'speak') {
          setSpriteDirect('idle');
        }
        const idleMs = randBetween(5, 10) * 1000;
        await idlePhase(idleMs);
        if (shouldAbortAi() || isSpeaking || isMovementLocked) continue;
        if (Math.random() < 0.35) {
          await startSpeaking(randomPhrase());
        }
        continue;
      }

      const shouldSkipIdle = skipNextIdle || !!walkTarget;
      if (skipNextIdle) skipNextIdle = false;

      if (!shouldSkipIdle) {
        const idleMs = isFirstCycle
          ? randBetween(1, 2) * 1000
          : randBetween(5, 10) * 1000;
        isFirstCycle = false;
        await idlePhase(idleMs);
        if (shouldAbortAi() || isSpeaking) continue;
      } else {
        isFirstCycle = false;
      }

      if (Date.now() >= nextWarpAt) {
        await cornerWarpPhase();
        scheduleNextWarp();
        continue;
      }

      // After mid-walk drag / retarget: resume n→B before picking a new action.
      if (walkTarget) {
        await movePhase();
        continue;
      }

      if (Math.random() < 0.35) {
        await startSpeaking(randomPhrase());
      } else {
        await movePhase();
      }
    } catch (err) {
      logError('aiLoop', err);
      isTransitioning = false;
      isSpeaking = false;
      setSpriteDirect('idle');
      await sleep(1000);
    }
  }
}

async function handleSnooze(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  if (isSnoozed || !isPetVisible) return;

  // Stage Snooze: interrupt other → idle, then soft-hide (existing pipe).
  await enterSnoozeSettlePath();

  isSnoozed = true;
  try {
    if (window.petAPI) await window.petAPI.snooze(3 * 60 * 1000);
  } catch (err) {
    logError('snooze', err);
  } finally {
    isSnoozed = false;
    if (isPetVisible) {
      await syncWindowPosition(true);
    }
  }
}

function resetSnoozeTaps() {
  snoozeTapCount = 0;
  lastSnoozeTapAt = 0;
}

function registerSnoozeTap() {
  const now = Date.now();

  // Locked or unlocked: same multi-tap (snoozeTapsNeeded). Lock ≠ one-click hide.
  if (now - lastSnoozeTapAt > SNOOZE_TAP_GAP_MS) {
    snoozeTapCount = 0;
  }
  lastSnoozeTapAt = now;
  snoozeTapCount += 1;

  if (snoozeTapCount >= snoozeTapsNeeded) {
    snoozeTapCount = 0;
    lastSnoozeTapAt = 0;
    handleSnooze().catch((err) => logError('snooze taps', err));
  }
}

function quitAppFromPet() {
  try {
    if (window.petAPI?.quitApp) {
      window.petAPI.quitApp();
    }
  } catch (err) {
    logError('quitAppFromPet', err);
  }
}

function setDraggingUi(active) {
  document.body.classList.toggle('dragging', active);
}

function resetDragState() {
  cancelDragMoveSync();
  isPointerSession = false;
  isDragFrozen = false;
  isEndingDrag = false;
  isActivelyDragging = false;
  isDragSettling = false;
  dragDownPos = null;
  dragGrab = null;
  pointerDownWork = null;
  lastDragWork = null;
  activePointerId = null;
  pointerSessionStartedAt = 0;
  endingDragStartedAt = 0;
  setDraggingUi(false);
  lastSync = { x: -1, y: -1, w: -1, h: -1 };
}

async function cancelPointerSessionQuiet() {
  cancelDragMoveSync();
  releaseActivePointer();

  if (isPointerSession && window.petAPI?.exitDragMode) {
    await window.petAPI.exitDragMode();
  }

  isPointerSession = false;
  isActivelyDragging = false;
  isDragFrozen = false;
  dragDownPos = null;
  dragGrab = null;
  pointerDownWork = null;
  pointerSessionStartedAt = 0;
  setDraggingUi(false);
}

function releaseActivePointer() {
  if (activePointerId === null) return;

  try {
    if (window.hasPointerCapture(activePointerId)) {
      window.releasePointerCapture(activePointerId);
    }
  } catch (err) {
    logError('releaseActivePointer', err);
  }
  activePointerId = null;
}

function beginDragSession(e) {
  // Shell loading or awareness — drop clicks until ready.
  if (shellBusyActive || awarenessPriorityActive || awarenessSpeakLock) return;

  // Hover/cursor already reached #pet — unlock flags that may still block after wake.
  unlockPetInput('beginDragSession');
  if (isPointerSession) return;

  lastMouseActiveAt = Date.now();
  if (isMouseSleeping) {
    wakeFromMouseSleep().catch((err) => logError('wakeFromMouseSleep drag', err));
  }

  // Click/drag cancels walk stage — do not resume previous target on release.
  walkTarget = null;
  skipNextIdle = false;
  lastDirection = null;

  isPointerSession = true;
  pointerSessionStartedAt = Date.now();
  pointerDownWork = pointerToWorkCoords(e);
  dragDownPos = { petX, petY };
  activePointerId = e.pointerId;

  dragGrab = {
    offsetX: pointerDownWork.x - petX,
    offsetY: pointerDownWork.y - petY,
  };
  dragTargetX = petX;
  dragTargetY = petY;
  lastDragWork = { x: pointerDownWork.x, y: pointerDownWork.y };
  isDragSettling = false;

  startActiveDrag();

  try {
    window.setPointerCapture(e.pointerId);
  } catch (err) {
    logError('setPointerCapture', err);
  }
}

function startActiveDrag() {
  if (isActivelyDragging) return;

  isActivelyDragging = true;
  isDragFrozen = true;
  lastDirection = null;
  walkTarget = null;
  skipNextIdle = false;
  syncGeneration += 1;

  interruptForDrag();
  forceIdleSprite();
  setDraggingUi(true);
  signalClickUx('press');

  if (window.petAPI?.enterDragMode) {
    window.petAPI.enterDragMode().catch((err) => logError('enterDragMode', err));
  }
}

function randomDragPhrase() {
  return pickFromPoolList(localePack.pools?.drag) || '...';
}

async function playDragComplaint(gen) {
  if (isSnoozed || gen !== dragReleaseGen || isDragFrozen) return;

  const generation = speechGeneration + 1;
  speechGeneration = generation;
  isSpeaking = true;
  speakStartedAt = Date.now();

  const text = randomDragPhrase();
  setSpriteDirect('speak', true);
  showBubble(text);

  const duration = Math.max(DRAG_COMPLAINT_MS, 1500 + text.length * 70);
  const pattern = randomRhythm(6);

  try {
    if (generation !== speechGeneration) return;

    await Promise.all([
      playSpeakAnimation(duration, generation),
      playRhythm(pattern, duration, generation),
      sleep(duration),
    ]);
  } catch (err) {
    logError('playDragComplaint', err);
  } finally {
    speakStartedAt = 0;

    if (generation !== speechGeneration) return;

    stopVoice();
    hideBubble();
    isSpeaking = false;
    lastDirection = null;

    if (!isDragFrozen && !isSnoozed) {
      setSpriteDirect('idle', true);
    }
  }
}

async function finishDragSession() {
  if (!isPointerSession || isEndingDrag) return;

  isEndingDrag = true;
  endingDragStartedAt = Date.now();
  const gen = dragReleaseGen;

  const endWork = lastDragWork || pointerDownWork;
  const movedPx = (pointerDownWork && endWork)
    ? Math.hypot(endWork.x - pointerDownWork.x, endWork.y - pointerDownWork.y)
    : Infinity;
  const wasTap = movedPx <= snoozeTapMovePx;

  let finalX = petX;
  let finalY = petY;
  if (dragGrab && endWork) {
    const raw = clampPetPosition(endWork.x - dragGrab.offsetX, endWork.y - dragGrab.offsetY);
    finalX = raw.x;
    finalY = raw.y;
  }
  // No grid snap on release — settle to final mouse-derived position only.

  try {
    releaseActivePointer();
    isActivelyDragging = false;
    setDraggingUi(false);

    if (!wasTap) {
      await settleDragToTarget(finalX, finalY);
    } else {
      cancelDragMoveSync();
      isDragSettling = false;
    }

    if (window.petAPI?.exitDragMode) {
      await window.petAPI.exitDragMode();
    }

    isPointerSession = false;
    isDragFrozen = false;
    dragDownPos = null;
    dragGrab = null;
    pointerDownWork = null;
    lastDragWork = null;
    pointerSessionStartedAt = 0;

    if (wasTap) {
      lastSync = { x: -1, y: -1, w: -1, h: -1 };
      await syncWindowPosition(true);
      registerSnoozeTap();
      signalClickUx('release-tap', gen);
      return;
    }

    resetSnoozeTaps();

    const { maxX, maxY } = getMoveBounds();
    const edges = getTriggerEdgesRaw(petX, petY, maxX, maxY);
    if (edges.length > 0) {
      walkTarget = null;
      instantWarp(edges, maxX, maxY);
    } else {
      lastSync = { x: -1, y: -1, w: -1, h: -1 };
      await syncWindowPosition(true);
    }
  } catch (err) {
    logError('finishDragSession', err);
    resetDragState();
    isDragSettling = false;
    resetSnoozeTaps();
    return;
  } finally {
    isEndingDrag = false;
    endingDragStartedAt = 0;
    isDragSettling = false;
  }

  signalClickUx('release-drag', gen);
  // Walk was cancelled on press — never resume a pre-drag walkTarget.
}

function onPointerMove(e) {
  if (!isPointerSession || !dragGrab) return;

  if (!(e.buttons & 1)) {
    if (!isEndingDrag) {
      finishDragSession().catch((err) => logError('finishDragSession move', err));
    }
    return;
  }

  const work = pointerToWorkCoords(e);
  updateDragPosition(work.x, work.y);
}

async function onPointerUp(e) {
  if (e.button !== 0) return;
  if (!isPointerSession) return;
  await finishDragSession();
}

pet.addEventListener('pointerenter', () => {
  // CSS cursor can change while click flags stay locked — heal as soon as hover hits.
  unlockPetInput('pointerenter');
});

pet.addEventListener('pointerdown', (e) => {
  // Middle-click = quit process for real.
  if (e.button === 1) {
    e.preventDefault();
    e.stopPropagation();
    quitAppFromPet();
    return;
  }
  // Right-click = do nothing (block OS menu only).
  if (e.button === 2) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if (e.button !== 0) return;

  e.preventDefault();
  beginDragSession(e);
});

window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
}, true);

window.addEventListener('pointerdown', (e) => {
  if (e.button === 2) {
    e.preventDefault();
  }
}, true);

window.addEventListener('pointermove', onPointerMove, true);
window.addEventListener('pointerup', onPointerUp, true);
window.addEventListener('pointercancel', onPointerUp, true);

function getDefaultPosition() {
  const { width, maxX, maxY } = getMoveBounds();
  return {
    x: Math.max(0, (width - (screenCache?.petSize || WIN_PET)) / 2),
    y: Math.max(0, maxY - 60),
  };
}

async function init() {
  try {
    if (!window.petAPI) {
      logError('init', new Error('petAPI is not available'));
      return;
    }

    await loadSvgPet();
    beginFeatureGate();
    applyPetSizeLevel(1);

    try {
      if (window.petAPI.getLocale) {
        applyLocalePack(await window.petAPI.getLocale());
      }
    } catch (err) {
      logError('init getLocale', err);
    }

    try {
      if (window.petAPI.getPetSizeLevel) {
        applyPetSizeLevel(await window.petAPI.getPetSizeLevel());
      }
    } catch (err) {
      logError('init getPetSizeLevel', err);
    }

    try {
      if (window.petAPI.getMovementLock) {
        applyMovementLock(await window.petAPI.getMovementLock());
      }
    } catch (err) {
      logError('init getMovementLock', err);
    }

    await refreshScreenSize();
    setInterval(() => refreshScreenSize(), 3000);
    setInterval(resetStuckState, WATCHDOG_MS);

    if (!gridNodes.length) buildGrid(screenCache);

    const start = getDefaultPosition();
    setPetPosition(start.x, start.y);
    forceIdleSprite();

    const { maxX, maxY } = getMoveBounds();
    const startEdges = getTriggerEdges(petX, petY, maxX, maxY);
    if (startEdges.length > 0) {
      const seed = Math.floor(petX + petY);
      const node = pickCornerNode(seed) || pickNode(seed);
      if (node) teleportToNode(node);
    }

    await syncWindowPosition(true);

    if (window.petAPI?.onVisibilityChange) {
      window.petAPI.onVisibilityChange((visible) => {
        if (visible) {
          resumePet().catch((err) => logError('onVisibilityChange resume', err));
        } else {
          pausePet().catch((err) => logError('onVisibilityChange pause', err));
        }
      });
    }

    if (window.petAPI?.onForceInput) {
      window.petAPI.onForceInput(() => {
        unlockPetInput('pet-force-input');
      });
    }

    if (window.petAPI?.onMovementLock) {
      window.petAPI.onMovementLock((locked) => {
        applyMovementLock(locked);
      });
    }

    if (window.petAPI?.onPetSizeLevel) {
      window.petAPI.onPetSizeLevel((level) => {
        const next = Math.max(1, Math.min(8, Math.floor(Number(level) || 1)));
        if (next === petSizeLevel) return;
        rebootstrapAfterSizeChange(next).catch((err) => {
          logError('onPetSizeLevel rebootstrap', err);
        });
      });
    }

    if (window.petAPI?.onLocale) {
      window.petAPI.onLocale((pack) => {
        rebootstrapAfterLocaleChange(pack).catch((err) => {
          logError('onLocale rebootstrap', err);
        });
      });
    }

    if (window.petAPI?.onShellBusy) {
      window.petAPI.onShellBusy((busy) => {
        shellBusyActive = !!busy;
        if (shellBusyActive) {
          clearClicksForShellBusy().catch((err) => logError('clearClicksForShellBusy', err));
        }
      });
    }

    if (window.petAPI?.onTrayPrepare) {
      window.petAPI.onTrayPrepare(() => {
        settleForTrayPrepare().catch((err) => logError('settleForTrayPrepare', err));
      });
    }

    if (window.petAPI?.onScreenChanged) {
      window.petAPI.onScreenChanged(async () => {
        if (!isPetVisible) return;
        await refreshScreenSize();
        buildGrid(screenCache);
        await syncWindowPosition(true);
      });
    }

    // --- App Awareness (feature 7) IPC ---
    if (window.petAPI?.onAwarenessSpeak) {
      window.petAPI.onAwarenessSpeak((payload) => {
        awarenessHandleSpeak(payload).catch((err) => logError('awarenessHandleSpeak', err));
      });
    }
    if (window.petAPI?.onAwarenessForceQuit) {
      window.petAPI.onAwarenessForceQuit(() => {
        awarenessForceQuit();
      });
    }

    setTimeout(() => {
      aiLoop().catch((err) => logError('aiLoop fatal', err));
      mouseWatchLoop().catch((err) => logError('mouseWatchLoop fatal', err));
      lookLoop().catch((err) => logError('lookLoop fatal', err));
    }, 500);
  } catch (err) {
    logError('init', err);
  }
}

window.addEventListener('error', (e) => {
  logError('window.error', e.error || e.message);
  e.preventDefault();
});

window.addEventListener('unhandledrejection', (e) => {
  logError('unhandledrejection', e.reason);
  e.preventDefault();
});

init().catch((err) => logError('init', err));

// =============================================================================
// App Awareness (feature 7) — HIGHEST priority speak pipe + quit.
// Overrides walk / drag / click / hide. Phrases chosen in main `awareness.js`.
// =============================================================================

let awarenessSpeakLock = false;
let awarenessPriorityActive = false;
let awarenessPriorityToken = 0;

function awarenessForceQuit() {
  try {
    quitAppFromPet();
  } catch (err) {
    logError('awarenessForceQuit', err);
  }
}

/** Stop walk/drag/AI toys so awareness lines 1→2→3 can always run. */
async function seizeForAwareness() {
  awarenessPriorityActive = true;
  walkTarget = null;
  skipNextIdle = false;
  lastDirection = null;
  isMouseSleeping = false;
  isTransitioning = false;

  dragReleaseGen += 1;
  if (isSpeaking) {
    speechGeneration += 1;
    isSpeaking = false;
    speakStartedAt = 0;
    try {
      stopVoice();
      hideBubble();
    } catch (_) { /* ignore */ }
  }

  if (isPointerSession || isDragFrozen || isActivelyDragging || isEndingDrag) {
    try {
      await cancelPointerSessionQuiet();
    } catch (err) {
      logError('seizeForAwareness cancelPointer', err);
    }
  }

  resetDragState();
  releaseActivePointer();
  isDragFrozen = false;
  isActivelyDragging = false;
  isEndingDrag = false;
}

/**
 * Forced awareness line. Always completes (even if pet soft-hidden — bubble may be invisible).
 * @param {{ text?: string, thenQuit?: boolean, keepPriority?: boolean }} payload
 */
async function awarenessHandleSpeak(payload) {
  const text = String(payload?.text || '').trim();
  const thenQuit = !!payload?.thenQuit;
  const keepPriority = !!payload?.keepPriority;

  if (!text) {
    if (thenQuit) awarenessForceQuit();
    try {
      if (window.petAPI?.awarenessSpeechDone) {
        await window.petAPI.awarenessSpeechDone(thenQuit);
      }
    } catch (err) {
      logError('awarenessSpeechDone empty', err);
    }
    return;
  }

  // Serialize awareness lines — wait for prior forced speak to finish (no skip).
  const waitStart = Date.now();
  while (awarenessSpeakLock && Date.now() - waitStart < 20000) {
    await sleep(50);
  }
  awarenessSpeakLock = true;
  ++awarenessPriorityToken;

  try {
    await seizeForAwareness();
    await startSpeaking(text, { force: true });
  } catch (err) {
    logError('awarenessHandleSpeak speak', err);
  } finally {
    awarenessSpeakLock = false;
    try {
      if (window.petAPI?.awarenessSpeechDone) {
        await window.petAPI.awarenessSpeechDone(thenQuit);
      }
    } catch (err) {
      logError('awarenessSpeechDone', err);
    }
    if (thenQuit) {
      awarenessPriorityActive = false;
      awarenessForceQuit();
    } else if (keepPriority) {
      // Hold lock for chained rounds 1→2→3
      awarenessPriorityActive = true;
    } else {
      awarenessPriorityActive = false;
    }
  }
}
