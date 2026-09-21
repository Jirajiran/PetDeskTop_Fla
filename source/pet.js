// OCPet Ver32 — mouse sleep/wake, avoid mouse retarget, skip idle after drag
const APP_VERSION = '32.0.0';

const SPRITES = {
  idle: 'PetPicture/Idel.png',
  n: 'PetPicture/up.png',
  s: 'PetPicture/down.png',
  w: 'PetPicture/left.png',
  e: 'PetPicture/right.png',
  nw: 'PetPicture/up-left.png',
  ne: 'PetPicture/up-right.png',
  sw: 'PetPicture/down-left.png',
  se: 'PetPicture/down-right.png',
};

const FADE_FRAMES = ['PetPicture/Fade01.png', 'PetPicture/Fade02.png'];
const SPEAK_FRAMES = [
  'PetPicture/Speak01.png',
  'PetPicture/Speak02.png',
  'PetPicture/Speak03.png',
];

const FADE_FRAME_MS = 100;
const SPEAK_FRAME_MS = 120;
const MIN_RHYTHM_BEATS = 8;
const TRIGGER_DEPTH_PX = 16;
const DEADZONE_PX = 12;
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
const MOUSE_NEAR_PX = 120;
const MOUSE_RETARGET_COOLDOWN_MS = 2500;
const WIN_PET = 72;
const WIN_W = 88;
const WIN_SPEAK_H = 120;

const DRAG_RELEASE_PHRASES = [
  'ฉันไม่ชอบโดนลาก',
  'มันเจ็บน่ะ',
  'ช่วยอ่อนโยนหน่อย',
];

const THAI_PHRASES = [
  'สวัสดี!',
  'วันนี้อากาศดีนะ',
  'อย่าลืมพักผ่อนบ้างนะ',
  'ทำงานหนักจังเลย~',
  'มีอะไรให้ช่วยไหม?',
  'สู้ๆ นะ!',
  'หิวข้าวยัง?',
  'ยิ้มหน่อยสิ~',
  'วันนี้เป็นยังไงบ้าง?',
  'พักสายตาบ้างนะ',
];

const petContainer = document.getElementById('pet-container');
const pet = document.getElementById('pet');
const bubble = document.getElementById('speech-bubble');
const speechText = document.getElementById('speech-text');
const noteS = document.getElementById('note-s');
const noteL = document.getElementById('note-l');

noteS.volume = 0.6;
noteL.volume = 0.6;

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
let dragSyncRaf = null;
let fadeGen = 0;
let pointerDownWork = null;
let isActivelyDragging = false;
let activePointerId = null;
let pointerSessionStartedAt = 0;
let endingDragStartedAt = 0;
let speakStartedAt = 0;
let isPetVisible = true;
let isMouseSleeping = false;
let lastMouseActiveAt = Date.now();
let lastCursorWork = null;
let mouseRetargetUntil = 0;
let skipNextIdle = false;

function logError(context, err) {
  console.error(`[OCPet v${APP_VERSION}] ${context}:`, err);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randBetween(min, max) {
  return min + Math.random() * (max - min);
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
}

function scheduleDragMoveSync() {
  if (dragSyncRaf) return;
  dragSyncRaf = requestAnimationFrame(() => {
    dragSyncRaf = null;
    if (!isActivelyDragging) return;
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

function updateDragPosition(workX, workY) {
  if (!isActivelyDragging || !dragGrab) return;

  const rawX = workX - dragGrab.offsetX;
  const rawY = workY - dragGrab.offsetY;
  const clamped = clampPetPosition(rawX, rawY);

  if (clamped.x !== rawX || clamped.y !== rawY) {
    dragGrab.offsetX = workX - clamped.x;
    dragGrab.offsetY = workY - clamped.y;
  }

  petX = clamped.x;
  petY = clamped.y;
  scheduleDragMoveSync();
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
  const dz = DEADZONE_PX;
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

/** Prefer a grid node far from the cursor (mouse-avoid retarget). */
function pickNodeAwayFromMouse(cursor, avoidId = null) {
  if (!gridNodes.length && screenCache) buildGrid(screenCache);
  if (!gridNodes.length || !cursor) return null;

  const ranked = gridNodes
    .filter((n) => avoidId == null || n.id !== avoidId)
    .map((n) => ({
      node: n,
      d: Math.hypot(n.x - cursor.x, n.y - cursor.y),
    }))
    .sort((a, b) => b.d - a.d);

  if (!ranked.length) return null;
  const seed = Math.floor(petX + petY + cursor.x + cursor.y);
  const top = ranked.slice(0, Math.min(3, ranked.length));
  return top[seed % top.length].node;
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
  try {
    noteS.pause();
    noteS.currentTime = 0;
    noteS.play().catch(() => {});
  } catch (err) {
    logError('playClickNote', err);
  }
}

function forceIdleSprite() {
  pet.src = SPRITES.idle;
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
    pet.src = frame;
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

function startPressFade() {
  const gen = bumpFadeGeneration();
  runFadeSequence(gen, {
    holdLastWhile: () => isPointerSession || isDragFrozen,
    finishOnIdle: false,
  }).catch((err) => logError('startPressFade', err));
}

async function playReleaseFade() {
  const gen = bumpFadeGeneration();
  await runFadeSequence(gen, { finishOnIdle: true });
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
    pet.src = SPEAK_FRAMES[i % SPEAK_FRAMES.length];
    i += 1;
    await sleep(SPEAK_FRAME_MS);
  }
}

function setSpriteDirect(key, force = false) {
  if (!key) return;
  if (isDragFrozen && key !== 'idle') return;
  if (!force && key === currentSprite) return;

  if (key === 'speak') {
    pet.src = SPEAK_FRAMES[0];
  } else if (SPRITES[key]) {
    pet.src = SPRITES[key];
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
  return isSnoozed || isDragFrozen || !isPetVisible || isMouseSleeping;
}

async function pausePet() {
  if (!isPetVisible) return;
  isPetVisible = false;

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

  try {
    if (window.petAPI?.exitDragMode) {
      await window.petAPI.exitDragMode();
    }
  } catch (err) {
    logError('pausePet exitDragMode', err);
  }

  resetDragState();
  releaseActivePointer();
  forceIdleSprite();
}

async function resumePet() {
  if (isPetVisible) return;
  isPetVisible = true;
  lastMouseActiveAt = Date.now();
  isMouseSleeping = false;

  dragReleaseGen += 1;
  speechGeneration += 1;
  isSpeaking = false;
  isTransitioning = false;
  speakStartedAt = 0;
  stopVoice();
  hideBubble();
  bumpFadeGeneration();
  resetDragState();
  releaseActivePointer();
  forceIdleSprite();

  try {
    await refreshScreenSize();
    lastSync = { x: -1, y: -1, w: -1, h: -1 };
    await syncWindowPosition(true);
    if (window.petAPI?.restoreWindowShell) {
      await window.petAPI.restoreWindowShell();
    }
  } catch (err) {
    logError('resumePet', err);
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
  if (!target || shouldAbortAi() || isSpeaking) return false;

  let currentTarget = target;

  while (currentTarget && !shouldAbortAi() && !isSpeaking) {
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
      return true;
    }

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
      if (shouldAbortAi() || isSpeaking) {
        return false;
      }

      if (Date.now() >= mouseRetargetUntil) {
        const cursor = await fetchCursorWork();
        if (isCursorNearPet(cursor)) {
          const away = pickNodeAwayFromMouse(cursor, currentTarget.id);
          if (away && away.id !== currentTarget.id) {
            mouseRetargetUntil = Date.now() + MOUSE_RETARGET_COOLDOWN_MS;
            retarget = away;
            break;
          }
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
    return true;
  }

  return false;
}

async function movePhase() {
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
  if (shouldAbortAi() || isSpeaking) return;
  if (!screenCache) await refreshScreenSize();
  if (!gridNodes.length) buildGrid(screenCache);

  const seed = Math.floor(petX + petY + Date.now());
  const target = pickCornerNode(seed);
  if (!target) return;

  setSpriteDirect('idle');
  await playFade();
  if (shouldAbortAi() || isSpeaking) return;

  teleportToNode(target);
  lastSync = { x: -1, y: -1, w: -1, h: -1 };
  await syncWindowPosition(true);
}

function showBubble(text) {
  if (isDragFrozen) return;
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

async function startSpeaking(text) {
  if (isSpeaking || isDragFrozen) return;

  const generation = speechGeneration + 1;
  speechGeneration = generation;
  isSpeaking = true;
  speakStartedAt = Date.now();

  try {
    stopVoice();
    if (generation !== speechGeneration) return;

    await transitionTo('speak');
    if (generation !== speechGeneration) return;

    showBubble(text);
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

    if (!isSnoozed && !isDragFrozen) {
      try {
        await transitionTo('idle');
      } catch (err) {
        logError('startSpeaking->idle', err);
        setSpriteDirect('idle');
      }
    }
  }
}

function randomPhrase() {
  return THAI_PHRASES[Math.floor(Math.random() * THAI_PHRASES.length)];
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

  pet.src = FADE_FRAMES[0];
  currentSprite = 'sleep';
}

async function wakeFromMouseSleep() {
  if (!isMouseSleeping) return;

  isMouseSleeping = false;
  lastMouseActiveAt = Date.now();
  bumpFadeGeneration();

  pet.src = FADE_FRAMES[1];
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

    if (isSpeaking || isTransitioning) {
      await sleep(200);
      continue;
    }

    resetStuckState();

    try {
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

  if (isPointerSession) {
    await cancelPointerSessionQuiet();
  }
  cancelSpeaking();
  stopVoice();

  isSnoozed = true;
  try {
    if (window.petAPI) await window.petAPI.snooze(3 * 60 * 1000);
  } catch (err) {
    logError('snooze', err);
  } finally {
    isSnoozed = false;
    await syncWindowPosition(true);
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
  dragDownPos = null;
  dragGrab = null;
  pointerDownWork = null;
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
  if (isPointerSession || isSnoozed || !isPetVisible) return;

  lastMouseActiveAt = Date.now();
  if (isMouseSleeping) {
    wakeFromMouseSleep().catch((err) => logError('wakeFromMouseSleep drag', err));
  }

  isPointerSession = true;
  pointerSessionStartedAt = Date.now();
  pointerDownWork = pointerToWorkCoords(e);
  dragDownPos = { petX, petY };
  activePointerId = e.pointerId;

  dragGrab = {
    offsetX: pointerDownWork.x - petX,
    offsetY: pointerDownWork.y - petY,
  };

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
  syncGeneration += 1;

  interruptForDrag();
  setDraggingUi(true);
  playClickNote();
  startPressFade();

  if (window.petAPI?.enterDragMode) {
    window.petAPI.enterDragMode().catch((err) => logError('enterDragMode', err));
  }
}

function randomDragPhrase() {
  return DRAG_RELEASE_PHRASES[Math.floor(Math.random() * DRAG_RELEASE_PHRASES.length)];
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

  try {
    cancelDragMoveSync();
    releaseActivePointer();

    if (window.petAPI?.exitDragMode) {
      await window.petAPI.exitDragMode();
    }

    isPointerSession = false;
    isDragFrozen = false;
    isActivelyDragging = false;
    dragDownPos = null;
    dragGrab = null;
    pointerDownWork = null;
    pointerSessionStartedAt = 0;
    setDraggingUi(false);

    // Current drop position is n; keep walkTarget B so AI can continue n→B.
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
    return;
  } finally {
    isEndingDrag = false;
    endingDragStartedAt = 0;
  }

  try {
    await playReleaseFade();
    await playDragComplaint(gen);
    if (walkTarget) {
      skipNextIdle = true;
    }
  } catch (err) {
    logError('finishDragSession post', err);
  }
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

pet.addEventListener('pointerdown', (e) => {
  if (e.button === 2) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if (e.button === 1) {
    handleSnooze(e);
    return;
  }
  if (e.button !== 0) return;

  e.preventDefault();
  beginDragSession(e);
});

pet.addEventListener('auxclick', (e) => {
  if (e.button === 1) handleSnooze(e);
});

window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
}, true);

window.addEventListener('pointerdown', (e) => {
  if (e.button === 2) {
    e.preventDefault();
    e.stopPropagation();
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

    await refreshScreenSize();
    setInterval(() => refreshScreenSize(), 3000);
    setInterval(resetStuckState, WATCHDOG_MS);

    if (!gridNodes.length) buildGrid(screenCache);

    const start = getDefaultPosition();
    setPetPosition(start.x, start.y);
    setSpriteDirect('idle');

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

    if (window.petAPI?.onScreenChanged) {
      window.petAPI.onScreenChanged(async () => {
        if (!isPetVisible) return;
        await refreshScreenSize();
        buildGrid(screenCache);
        await syncWindowPosition(true);
      });
    }

    setTimeout(() => {
      aiLoop().catch((err) => logError('aiLoop fatal', err));
      mouseWatchLoop().catch((err) => logError('mouseWatchLoop fatal', err));
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
