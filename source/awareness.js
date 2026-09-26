/**
 * App Awareness (feature 7) — main-process poll + ban state.
 * System load, app-catch phrases, porn rounds, persist ban to userData.
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const i18n = require('./i18n');

const POLL_MS = 5000;
const GRACE_MS = 3 * 60 * 1000;
/** Heaviest process CPU% or mem% must stay at/above this (was 80 — false quit near Task Manager 80). */
const LOAD_THRESHOLD = 90;
/** Must stay over threshold continuously this long; any dip resets the timer. */
const LOAD_SUSTAIN_MS = 15000;
const APP_CATCH_DEBOUNCE_MS = 45000;
/** Other desktop-pet notice — longer than tab catch (2–5 min band). */
const OTHER_PET_DEBOUNCE_MS = 3 * 60 * 1000;
const OTHER_PET_FAMILY = 'other-pet';
/** Prefer small floating windows (many Steam pets). */
const OTHER_PET_MAX_AREA = 400 * 400;
const OTHER_PET_MAX_SIDE = 480;
const PORN_DEBOUNCE_MS = 8000;
const BAN_FILE = 'awareness-ban.json';

/** @typedef {{ banActive: boolean, reopenCount: number, pornRound: number, graceStartedAt: number|null, phraseSeed: number }} BanState */

/** @type {BanState} */
const DEFAULT_STATE = {
  banActive: false,
  reopenCount: 0,
  pornRound: 0,
  graceStartedAt: null,
  phraseSeed: 1,
};

const SELF_NAME_HINTS = [
  'fla_petdesktop',
  'fla-pet-desktop',
  'electron',
];

function seedPick() {
  return {
    get value() { return state.phraseSeed; },
    set value(v) {
      state.phraseSeed = Math.max(1, Number(v) || 1);
      saveState();
    },
  };
}

function pickPhrase(pool) {
  const list = Array.isArray(pool) ? pool : [];
  if (!list.length) return '';
  return i18n.pickFromList(list, seedPick());
}

function pickLeavePhrase() {
  const last = i18n.getLastCategory();
  if (last && last.phrases && last.phrases.length) return pickPhrase(last.phrases);
  const fallback = i18n.pool('leave');
  return fallback.length ? pickPhrase(fallback) : 'bye';
}

function pickBanComplainPhrase() {
  const list = i18n.pool('banComplain');
  return list.length ? pickPhrase(list) : pickLeavePhrase();
}

function pickLoadHeavyPhrase() {
  const list = i18n.pool('loadHeavy');
  return list.length ? pickPhrase(list) : pickLeavePhrase();
}

function setLocale(code) {
  i18n.loadLocale(code || i18n.DEFAULT_LOCALE);
}

/** Detection only — spoken lines from i18n.apps[family]. */
const APP_CATCH_RULES = [
  {
    family: 'youtube-music',
    test: (t, n) =>
      /youtube/i.test(t + n)
      && /(music|เพลง|official audio|lyrics|soundtrack|spotify)/i.test(t),
  },
  {
    family: 'youtube',
    test: (t, n) => /youtube/i.test(t + n) || /youtube\.com/i.test(t),
  },
  {
    family: 'google',
    test: (t, n) =>
      (/google/i.test(t) && !/youtube/i.test(t))
      || /chrome.*search|ค้นหา/i.test(t)
      || (/google/i.test(n) && /search|ค้นหา/i.test(t)),
  },
  { family: 'facebook', test: (t, n) => /facebook|fb\.com|messenger/i.test(t + n) },
  {
    family: 'twitter',
    test: (t, n) =>
      /twitter|tweetdeck/i.test(t + n)
      || /^x$/i.test(n)
      || /(^|\s)X\s*[-–|:|]/.test(t)
      || /x\.exe/i.test(n),
  },
  { family: 'instagram', test: (t, n) => /instagram|ig\b/i.test(t + n) },
  { family: 'tiktok', test: (t, n) => /tiktok|douyin/i.test(t + n) },
  { family: 'discord', test: (t, n) => /discord/i.test(t + n) },
  { family: 'steam', test: (t, n) => /steam/i.test(t + n) },
  { family: 'spotify', test: (t, n) => /spotify/i.test(t + n) },
  { family: 'netflix', test: (t, n) => /netflix/i.test(t + n) },
  { family: 'twitch', test: (t, n) => /twitch/i.test(t + n) },
  {
    family: 'line',
    test: (t, n) =>
      /^line$/i.test(n) || /line\.exe/i.test(n) || /\bLINE\b/.test(t) || /LINE\s*[-–|]/.test(t),
  },
  { family: 'reddit', test: (t, n) => /reddit/i.test(t + n) },
  { family: 'whatsapp', test: (t, n) => /whatsapp/i.test(t + n) },
  { family: 'telegram', test: (t, n) => /telegram/i.test(t + n) },
  {
    family: 'vscode',
    test: (t, n) => /visual studio code|vscode/i.test(t + n) || /code\.exe/i.test(n),
  },
  {
    family: 'chrome',
    test: (t, n) => /chrome|google chrome/i.test(n) || /google chrome/i.test(t),
  },
  {
    family: 'edge',
    test: (t, n) => /msedge|microsoft edge|edge\.exe/i.test(n) || /microsoft edge/i.test(t),
  },
];

const PORN_KEYWORDS = [
  'porn', 'pornhub', 'xvideos', 'xnxx', 'xhamster', 'redtube', 'youporn',
  'onlyfans', 'chaturbate', 'stripchat', 'brazzers', 'spankbang', 'missav',
  'jav', 'hentai', 'nhentai', 'rule34', 'nsfw', 'xxx', 'sex.com',
  'adult video', 'erotic', 'จู๋', 'โป๊', 'หนังโป๊', '18+',
];

let appRef = null;
let getMainWindow = null;
let onForceQuit = null;
/** @type {null | (() => boolean)} */
let isShowSpeechActive = null;
/** @type {null | (() => boolean)} true while soft-hidden — block soft app-catch speak */
let isPetVisuallyHidden = null;
/** @type {null | (() => void)} Called when awareness owns stage — main drops external pending. */
let onExternalRefuseNeeded = null;
let pollTimer = null;
let polling = false;
let speakingBusy = false;
/** True while the active speak is porn/load-quit (thenQuit or keepPriority). Soft app-catch leaves this false. */
let speakCritical = false;
/** @type {{ text: string, thenQuit: boolean }[]} */
let speakQueue = [];
let speakSafetyTimer = null;
let pornSequenceActive = false;
/**
 * Soft app-catch / other-pet intent (shared slot). Not spoken until pet idle-ready.
 * Porn / load-quit still use requestSpeak immediately.
 * other-pet may include lookTarget (screen cx/cy); tab catch leaves it null.
 * Coexistence: app-catch may overwrite other-pet; other-pet does not steal a tab-catch slot.
 * @type {null | { text: string, family: string, at: number, lookTarget?: { cx: number, cy: number }|null }}
 */
let pendingAppCatch = null;
/** @type {BanState} */
let state = { ...DEFAULT_STATE };
/** Wall-clock when heaviest process first crossed LOAD_THRESHOLD without dipping; null = not hot. */
let loadHighSince = null;
/** @type {Map<string, number>} */
const lastAppCatchAt = new Map();
let lastPornDetectAt = 0;
let pornWasPresent = false;
let bootHandled = false;

function logAwareness(context, err) {
  console.error(`[Awareness] ${context}:`, err);
}

/** Intro Show in progress — block general awareness; porn bypasses. */
function showSpeechBlocksGeneral() {
  try {
    return typeof isShowSpeechActive === 'function' && !!isShowSpeechActive();
  } catch (_) {
    return false;
  }
}

/** Soft-hidden (tray Hide / snooze) — soft app-catch must wait until Show. */
function isPetSoftHidden() {
  try {
    return typeof isPetVisuallyHidden === 'function' && !!isPetVisuallyHidden();
  } catch (_) {
    return false;
  }
}

function banFilePath() {
  if (!appRef) return path.join(os.tmpdir(), BAN_FILE);
  return path.join(appRef.getPath('userData'), BAN_FILE);
}

function loadState() {
  try {
    const p = banFilePath();
    if (!fs.existsSync(p)) {
      state = { ...DEFAULT_STATE };
      return state;
    }
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    state = {
      banActive: !!raw.banActive,
      reopenCount: Math.max(0, Number(raw.reopenCount) || 0),
      pornRound: Math.max(0, Math.min(3, Number(raw.pornRound) || 0)),
      graceStartedAt: raw.graceStartedAt == null ? null : Number(raw.graceStartedAt) || null,
      phraseSeed: Math.max(1, Number(raw.phraseSeed) || 1),
    };
  } catch (err) {
    logAwareness('loadState', err);
    state = { ...DEFAULT_STATE };
  }
  return state;
}

function saveState() {
  try {
    const p = banFilePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    logAwareness('saveState', err);
  }
}

function clearBanState() {
  state = { ...DEFAULT_STATE, phraseSeed: state.phraseSeed || 1 };
  saveState();
}

function isGraceExpired() {
  if (!state.graceStartedAt) return false;
  return Date.now() - state.graceStartedAt >= GRACE_MS;
}

function sendToRenderer(channel, payload) {
  try {
    const win = typeof getMainWindow === 'function' ? getMainWindow() : null;
    if (!win || win.isDestroyed()) return false;
    win.webContents.send(channel, payload);
    return true;
  } catch (err) {
    logAwareness('sendToRenderer', err);
    return false;
  }
}

function quitNow() {
  if (typeof onForceQuit === 'function') {
    onForceQuit();
    return;
  }
  if (appRef) {
    appRef.isQuitting = true;
    appRef.quit();
  }
}

/**
 * Speak via renderer; optionally quit after speech.
 * Falls back to force-quit if renderer unavailable.
 * Next queued line starts only from notifySpeechFinished (after speech ends).
 */
function clearSpeakSafetyTimer() {
  if (speakSafetyTimer) {
    clearTimeout(speakSafetyTimer);
    speakSafetyTimer = null;
  }
}

function notifyExternalRefuse() {
  try {
    if (typeof onExternalRefuseNeeded === 'function') onExternalRefuseNeeded();
  } catch (_) { /* ignore */ }
}

function flushSpeakQueue() {
  if (speakingBusy) return;
  const next = speakQueue.shift();
  if (!next) {
    pornSequenceActive = false;
    return;
  }
  requestSpeak(next.text, !!next.thenQuit, { keepPriority: !!next.keepPriority });
}

function enqueueSpeakSequence(items) {
  for (const item of items) {
    if (!item || !item.text) continue;
    speakQueue.push({
      text: String(item.text),
      thenQuit: !!item.thenQuit,
      keepPriority: !!item.keepPriority,
    });
  }
  flushSpeakQueue();
}

function requestSpeak(text, thenQuit, opts = {}) {
  const critical = !!thenQuit || !!opts.keepPriority;
  // Soft app-catch must not speak while soft-hidden — pending waits until Show.
  if (!critical && isPetSoftHidden()) {
    return;
  }

  if (speakingBusy) {
    // Critical quit while busy: schedule fallback quit only.
    if (thenQuit) {
      setTimeout(() => quitNow(), 8000);
    }
    return;
  }

  speakingBusy = true;
  speakCritical = critical;
  notifyExternalRefuse();
  clearSpeakSafetyTimer();
  const keepPriority = !!opts.keepPriority;
  const look = opts.lookTarget && Number.isFinite(opts.lookTarget.cx) && Number.isFinite(opts.lookTarget.cy)
    ? { lookCx: Number(opts.lookTarget.cx), lookCy: Number(opts.lookTarget.cy) }
    : {};
  const ok = sendToRenderer('awareness-speak', {
    text,
    thenQuit: !!thenQuit,
    keepPriority,
    family: opts.family ? String(opts.family) : undefined,
    ...look,
  });
  if (!ok) {
    speakingBusy = false;
    speakCritical = false;
    if (thenQuit) {
      speakQueue = [];
      pornSequenceActive = false;
      quitNow();
      return;
    }
    flushSpeakQueue();
    return;
  }

  // Safety only if renderer never acks — then continue queue or quit.
  const safetyMs = thenQuit
    ? Math.max(12000, 2000 + String(text || '').length * 100)
    : Math.max(10000, 1500 + String(text || '').length * 90);
  speakSafetyTimer = setTimeout(() => {
    speakSafetyTimer = null;
    if (!speakingBusy) return;
    speakingBusy = false;
    speakCritical = false;
    if (thenQuit) {
      speakQueue = [];
      pornSequenceActive = false;
      quitNow();
      return;
    }
    flushSpeakQueue();
  }, safetyMs);
}

function requestForceQuit() {
  const ok = sendToRenderer('awareness-force-quit', {});
  if (!ok) quitNow();
  else setTimeout(() => quitNow(), 1500);
}

function collectSelfPids() {
  const self = new Set([process.pid]);
  try {
    if (process.ppid) self.add(process.ppid);
  } catch (_) { /* ignore */ }
  return self;
}

function isSelfProcess(proc, selfPids, selfPathHint) {
  if (!proc) return true;
  const pid = Number(proc.pid) || 0;
  if (selfPids.has(pid)) return true;
  const name = String(proc.name || '').toLowerCase();
  const title = String(proc.title || '').toLowerCase();
  for (const hint of SELF_NAME_HINTS) {
    if (name.includes(hint)) return true;
  }
  if (selfPathHint && name && selfPathHint.includes(name.replace(/\.exe$/i, ''))) {
    // weak match — only if product name fragment
  }
  const product = 'fla_petdesktop';
  if (name.includes(product) || title.includes(product)) return true;
  return false;
}

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      {
        windowsHide: true,
        timeout: 20000,
        maxBuffer: 4 * 1024 * 1024,
      },
      (err, stdout, stderr) => {
        if (err) {
          reject(err);
          return;
        }
        if (stderr && /error/i.test(stderr) && !stdout) {
          reject(new Error(stderr.slice(0, 400)));
          return;
        }
        resolve(String(stdout || '').trim());
      },
    );
  });
}

/**
 * Snapshot of visible windows + rough CPU/memory load.
 * Uses a short dual-sample on top WorkingSet processes (Task Manager–style %).
 * Each window includes MainWindow bounds center (cx/cy screen) for other-pet look.
 * @returns {Promise<{windows: Array<{pid:number,name:string,title:string,cx:number,cy:number,width:number,height:number,topMost:boolean,path:string}>, heaviest: {pid:number,name:string,cpu:number,mem:number}|null}>}
 */
async function snapshotWindows() {
  if (process.platform !== 'win32') {
    return { windows: [], heaviest: null };
  }

  const cores = Math.max(1, os.cpus().length);
  const selfPid = process.pid;
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$cores = ${cores}
$selfRoot = ${selfPid}

if (-not ('FlaPetNativeWin' -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class FlaPetNativeWin {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
  public const int GWL_EXSTYLE = -20;
  public const int WS_EX_TOPMOST = 0x00000008;
}
"@
}

$totalMem = [double](Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
if ($totalMem -le 0) { $totalMem = 1 }

$wins = @()
Get-Process | Where-Object {
  $_.Id -ne $selfRoot -and $_.MainWindowTitle -and $_.MainWindowTitle.Trim() -ne ''
} | ForEach-Object {
  $cx = 0; $cy = 0; $w = 0; $h = 0; $topMost = $false
  try {
    $hwnd = $_.MainWindowHandle
    if ($hwnd -ne [IntPtr]::Zero) {
      $rect = New-Object FlaPetNativeWin+RECT
      if ([FlaPetNativeWin]::GetWindowRect($hwnd, [ref]$rect)) {
        $w = [int]($rect.Right - $rect.Left)
        $h = [int]($rect.Bottom - $rect.Top)
        $cx = [math]::Round(($rect.Left + $rect.Right) / 2.0)
        $cy = [math]::Round(($rect.Top + $rect.Bottom) / 2.0)
      }
      $ex = [FlaPetNativeWin]::GetWindowLong($hwnd, [FlaPetNativeWin]::GWL_EXSTYLE)
      $topMost = ($ex -band [FlaPetNativeWin]::WS_EX_TOPMOST) -ne 0
    }
  } catch {}
  $path = ''
  try { $path = [string]$_.Path } catch { $path = '' }
  $wins += [pscustomobject]@{
    pid = $_.Id
    name = $_.ProcessName
    title = $_.MainWindowTitle
    cx = $cx
    cy = $cy
    width = $w
    height = $h
    topMost = $topMost
    path = $path
  }
}

$candidates = @(Get-Process | Where-Object { $_.Id -gt 0 -and $_.Id -ne $selfRoot } | Sort-Object WorkingSet64 -Descending | Select-Object -First 40)
$sample1 = @{}
foreach ($p in $candidates) {
  try { $sample1[$p.Id] = $p.TotalProcessorTime.TotalMilliseconds } catch { $sample1[$p.Id] = 0 }
}
Start-Sleep -Milliseconds 400
$heavy = $null
foreach ($p in $candidates) {
  try {
    $p2 = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
    if (-not $p2) { continue }
    $t0 = [double]$sample1[$p.Id]
    $t1 = 0
    try { $t1 = $p2.TotalProcessorTime.TotalMilliseconds } catch { $t1 = $t0 }
    $cpu = [math]::Round((($t1 - $t0) / 400.0) * 100.0 / $cores, 1)
    if ($cpu -lt 0) { $cpu = 0 }
    if ($cpu -gt 100) { $cpu = 100 }
    $mem = [math]::Round(([double]$p2.WorkingSet64 / $totalMem) * 100.0, 1)
    $score = [math]::Max($cpu, $mem)
    if ($null -eq $heavy -or $score -gt [double]$heavy.score) {
      $heavy = [pscustomobject]@{
        pid = $p2.Id
        name = $p2.ProcessName
        cpu = $cpu
        mem = $mem
        score = $score
      }
    }
  } catch {}
}

[pscustomobject]@{ windows = $wins; heaviest = $heavy } | ConvertTo-Json -Compress -Depth 4
`.trim();

  try {
    const out = await runPowerShell(script);
    if (!out) return { windows: [], heaviest: null };
    const data = JSON.parse(out);
    let windows = data.windows || [];
    if (!Array.isArray(windows)) windows = windows ? [windows] : [];
    windows = windows.map((w) => ({
      pid: Number(w.pid) || 0,
      name: String(w.name || ''),
      title: String(w.title || ''),
      cx: Number(w.cx) || 0,
      cy: Number(w.cy) || 0,
      width: Number(w.width) || 0,
      height: Number(w.height) || 0,
      topMost: !!w.topMost,
      path: String(w.path || ''),
    }));
    let heaviest = data.heaviest || null;
    if (heaviest) {
      heaviest = {
        pid: Number(heaviest.pid) || 0,
        name: String(heaviest.name || ''),
        cpu: Number(heaviest.cpu) || 0,
        mem: Number(heaviest.mem) || 0,
      };
    }
    return { windows, heaviest };
  } catch (err) {
    logAwareness('snapshotWindows', err);
    return { windows: [], heaviest: null };
  }
}

function matchPorn(windows, selfPids) {
  for (const w of windows) {
    if (isSelfProcess(w, selfPids)) continue;
    const hay = `${w.title} ${w.name}`.toLowerCase();
    for (const kw of PORN_KEYWORDS) {
      if (hay.includes(kw.toLowerCase())) return w;
    }
  }
  return null;
}

function matchAppCatch(windows, selfPids) {
  for (const w of windows) {
    if (isSelfProcess(w, selfPids)) continue;
    const title = w.title || '';
    const name = w.name || '';
    for (const rule of APP_CATCH_RULES) {
      try {
        if (rule.test(title, name)) {
          const phrases = i18n.appPhrases(rule.family);
          if (!phrases.length) continue;
          return { family: rule.family, phrases, window: w };
        }
      } catch (_) { /* ignore bad rule */ }
    }
  }
  return null;
}

/** Known big apps / shells — not "mystery desktop pets". */
const OTHER_PET_DENY_NAMES = [
  'explorer', 'applicationframehost', 'systemsettings', 'searchapp', 'searchui',
  'shellexperiencehost', 'startmenuexperiencehost', 'textinputhost',
  'runtimebroker', 'lockapp', 'securityhealthsystray',
  'winword', 'excel', 'powerpnt', 'outlook', 'onenote', 'mspub', 'msaccess',
  'slack', 'teams', 'ms-teams', 'zoom', 'skype', 'webex',
  'taskmgr', 'cmd', 'powershell', 'pwsh', 'windowsterminal', 'conhost',
  'notepad', 'calc', 'calculator', 'snip', 'screenclipping',
  'devenv', 'cursor', 'idea64', 'pycharm64', 'rider64', 'webstorm64',
  'firefox', 'opera', 'brave', 'vivaldi',
  'nvidia', 'nvcontainer', 'amdow', 'radeon',
  'wallpaperengine', 'wallpaper engine', 'rainmeter',
  'spotify', 'discord', 'steam', 'steamwebhelper',
  'chrome', 'msedge',
];

function isDeniedForOtherPet(title, name) {
  const t = String(title || '');
  const n = String(name || '');
  for (const rule of APP_CATCH_RULES) {
    try {
      if (rule.test(t, n)) return true;
    } catch (_) { /* ignore */ }
  }
  const hay = `${t} ${n}`.toLowerCase();
  for (const d of OTHER_PET_DENY_NAMES) {
    if (hay.includes(d)) return true;
  }
  if (/microsoft (word|excel|powerpoint|edge|teams|outlook)/i.test(hay)) return true;
  return false;
}

function isPetLikeWindow(w) {
  const width = Number(w.width) || 0;
  const height = Number(w.height) || 0;
  if (width < 48 || height < 48) return false;
  // Fullscreen / large app chrome — not a floating pet.
  if (width > 1100 || height > 900) return false;
  const area = width * height;
  const small = area <= OTHER_PET_MAX_AREA
    || (width <= OTHER_PET_MAX_SIDE && height <= OTHER_PET_MAX_SIDE);
  const topMost = !!w.topMost;
  if (topMost && width <= 800 && height <= 800) return true;
  if (small) return true;
  // Optional Steam install hint for mid-size always-floating pets.
  if (w.path && /steamapps/i.test(w.path) && width <= 640 && height <= 640) return true;
  return false;
}

/**
 * Heuristic "other desktop pet" — no species/name greeting.
 * Denylist + prefer small / topmost; exclude self.
 */
function matchOtherPet(windows, selfPids) {
  const phrases = i18n.appPhrases(OTHER_PET_FAMILY);
  if (!phrases.length) return null;

  let best = null;
  let bestScore = -1;
  for (const w of windows) {
    if (isSelfProcess(w, selfPids)) continue;
    if (isDeniedForOtherPet(w.title, w.name)) continue;
    if (!isPetLikeWindow(w)) continue;
    if (!Number.isFinite(w.cx) || !Number.isFinite(w.cy)) continue;
    if (w.cx === 0 && w.cy === 0 && !(w.width > 0 && w.height > 0)) continue;

    let score = 0;
    if (w.topMost) score += 50;
    const area = (Number(w.width) || 0) * (Number(w.height) || 0);
    score += Math.max(0, 40 - Math.floor(area / 5000));
    if (w.path && /steamapps/i.test(w.path)) score += 20;
    if (score > bestScore) {
      bestScore = score;
      best = w;
    }
  }
  if (!best) return null;
  return { family: OTHER_PET_FAMILY, phrases, window: best };
}

function enforceBanKick() {
  if (pornSequenceActive || speakingBusy) return;
  bumpReopenOnKick();
  const text = state.reopenCount >= 4 ? pickLeavePhrase() : pickBanComplainPhrase();
  requestSpeak(text, true);
}

/**
 * Ordered category beats from i18n JSON.
 * System does not know semantic labels — last category is always leave + quit.
 */
function startPornComplaintSequence() {
  if (pornSequenceActive || speakingBusy) return;

  pornSequenceActive = true;
  notifyExternalRefuse();
  lastPornDetectAt = Date.now();
  const cats = i18n.getAwarenessCategories();
  state.pornRound = Math.max(1, cats.length);
  state.banActive = true;
  state.reopenCount = Math.max(1, state.reopenCount || 0);
  state.graceStartedAt = null;
  saveState();

  speakQueue = [];
  if (!cats.length) {
    enqueueSpeakSequence([{ text: pickLeavePhrase(), thenQuit: true, keepPriority: false }]);
    return;
  }
  enqueueSpeakSequence(
    cats.map((cat, i) => ({
      text: pickPhrase(cat.phrases),
      thenQuit: i === cats.length - 1,
      keepPriority: i < cats.length - 1,
    })),
  );
}

function onPornDetected() {
  pornWasPresent = true;

  // Porn returned during grace: cancel clear, keep counters (do not advance rounds).
  if (state.graceStartedAt) {
    state.graceStartedAt = null;
    saveState();
    if (state.banActive) {
      enforceBanKick();
    }
    return;
  }

  // Ban loop while banActive + porn present (after sequence already ran).
  if (state.banActive) {
    if (pornSequenceActive || speakingBusy) return;
    const now = Date.now();
    if (now - lastPornDetectAt < PORN_DEBOUNCE_MS) return;
    lastPornDetectAt = now;
    enforceBanKick();
    return;
  }

  // Fresh detection: full 1→2→3 chain immediately (no wait between rounds).
  startPornComplaintSequence();
}

function bumpReopenOnKick() {
  state.banActive = true;
  state.reopenCount = Math.max(1, (state.reopenCount || 0) + 1);
  state.graceStartedAt = null;
  saveState();
}

function onPornCleared() {
  if (!pornWasPresent && !state.banActive && state.pornRound === 0) return;

  const wasPresent = pornWasPresent;
  pornWasPresent = false;

  if (!state.banActive && state.pornRound === 0) return;

  // Start grace only when transitioning to closed (or first notice closed while ban).
  if (!state.graceStartedAt) {
    state.graceStartedAt = Date.now();
    saveState();
  }

  if (isGraceExpired()) {
    clearBanState();
    pornWasPresent = false;
    return;
  }

  // reopenCount ≥ 4 and porn closed: sulk = leave bubble then quit (until grace clears).
  if (state.banActive && state.reopenCount >= 4) {
    if (!speakingBusy && !pornSequenceActive) {
      requestSpeak(pickLeavePhrase(), true);
    }
  }
  // reopenCount 1–3 + porn closed: allow normal run, keep counters (no action).
  void wasPresent;
}

function handleSystemLoad(heaviest, selfPids) {
  if (pornSequenceActive || speakingBusy) return;
  if (showSpeechBlocksGeneral()) return;
  if (!heaviest || isSelfProcess(heaviest, selfPids)) {
    loadHighSince = null;
    return;
  }
  const cpu = Number(heaviest.cpu) || 0;
  const mem = Number(heaviest.mem) || 0;
  const over = cpu >= LOAD_THRESHOLD || mem >= LOAD_THRESHOLD;
  if (!over) {
    // Dip below threshold → restart count from scratch when it rises again.
    loadHighSince = null;
    return;
  }

  const now = Date.now();
  if (loadHighSince == null) {
    loadHighSince = now;
    return;
  }
  if (now - loadHighSince < LOAD_SUSTAIN_MS) return;

  loadHighSince = null;
  requestSpeak(pickLoadHeavyPhrase(), true);
}

function handleAppCatch(windows, selfPids) {
  if (pornSequenceActive || state.banActive) return;
  const hit = matchAppCatch(windows, selfPids);
  if (!hit) return;

  const text = pickPhrase(hit.phrases);
  if (!text) return;

  const now = Date.now();

  // Slot already waiting — always overwrite (latest wins); debounce only after delivery.
  if (pendingAppCatch) {
    pendingAppCatch = {
      text: String(text),
      family: hit.family,
      at: now,
      lookTarget: null,
    };
    sendToRenderer('awareness-pending', { family: hit.family });
    return;
  }

  const last = lastAppCatchAt.get(hit.family) || 0;
  if (now - last < APP_CATCH_DEBOUNCE_MS) return;

  // Central API slot — do not seize / speak yet; pet delivers when idle.
  pendingAppCatch = {
    text: String(text),
    family: hit.family,
    at: now,
    lookTarget: null,
  };
  sendToRenderer('awareness-pending', { family: hit.family });
}

/**
 * Soft other-pet notice — same pendingAppCatch slot + idle deliver.
 * Does not steal a waiting tab-catch; longer debounce than APP_CATCH.
 */
function handleOtherPetCatch(windows, selfPids) {
  if (pornSequenceActive || state.banActive) return;
  const hit = matchOtherPet(windows, selfPids);
  if (!hit) return;

  const text = pickPhrase(hit.phrases);
  if (!text) return;

  const win = hit.window || {};
  const lookTarget = {
    cx: Number(win.cx) || 0,
    cy: Number(win.cy) || 0,
  };
  const now = Date.now();

  // Do not steal a waiting known-app catch (tab / discord / etc.).
  if (pendingAppCatch && pendingAppCatch.family !== OTHER_PET_FAMILY) {
    return;
  }

  if (pendingAppCatch) {
    pendingAppCatch = {
      text: String(text),
      family: OTHER_PET_FAMILY,
      at: now,
      lookTarget,
    };
    sendToRenderer('awareness-pending', { family: OTHER_PET_FAMILY });
    return;
  }

  const last = lastAppCatchAt.get(OTHER_PET_FAMILY) || 0;
  if (now - last < OTHER_PET_DEBOUNCE_MS) return;

  pendingAppCatch = {
    text: String(text),
    family: OTHER_PET_FAMILY,
    at: now,
    lookTarget,
  };
  sendToRenderer('awareness-pending', { family: OTHER_PET_FAMILY });
}

/**
 * Pet finished waiting for a good stage — deliver soft app-catch once.
 * @returns {'started'|'busy'|'empty'}
 */
function deliverPendingAppCatch() {
  if (!pendingAppCatch) return 'empty';
  if (speakingBusy || pornSequenceActive) return 'busy';
  if (showSpeechBlocksGeneral()) return 'busy';
  // After tray Hide / snooze — keep pending until Show (do not clear slot).
  if (isPetSoftHidden()) return 'busy';

  const job = pendingAppCatch;
  pendingAppCatch = null;
  lastAppCatchAt.set(job.family, Date.now());
  requestSpeak(job.text, false, {
    family: job.family,
    lookTarget: job.lookTarget || null,
  });
  return 'started';
}

function clearPendingAppCatch() {
  pendingAppCatch = null;
}

async function pollOnce() {
  if (polling || speakingBusy || pornSequenceActive) return;
  polling = true;
  try {
    // Grace expiry while porn stays closed
    if (state.graceStartedAt && isGraceExpired() && !pornWasPresent) {
      clearBanState();
    }

    // ≥4 sulk while grace active and no porn: leave bubble then quit
    if (
      state.banActive
      && state.reopenCount >= 4
      && state.graceStartedAt
      && !isGraceExpired()
      && !pornWasPresent
      && !speakingBusy
      && !pornSequenceActive
    ) {
      requestSpeak(pickLeavePhrase(), true);
      return;
    }

    const snap = await snapshotWindows();
    const selfPids = collectSelfPids();
    const selfPathHint = String(process.execPath || '').toLowerCase();

    // Filter heaviest excluding self
    let heaviest = snap.heaviest;
    if (heaviest && isSelfProcess(heaviest, selfPids, selfPathHint)) {
      heaviest = null;
    }

    const pornHit = matchPorn(snap.windows, selfPids);
    if (pornHit) {
      onPornDetected();
    } else {
      onPornCleared();
    }

    // System load leave (skip if already in porn quit path / speaking)
    if (!speakingBusy) {
      handleSystemLoad(heaviest, selfPids);
    }

    // Soft app-catch: only refresh pending slot (pet delivers when idle).
    if (!state.banActive) {
      handleAppCatch(snap.windows, selfPids);
      // Other desktop-pet notice — same soft slot; longer debounce; no steal of tab-catch.
      handleOtherPetCatch(snap.windows, selfPids);
    }
  } catch (err) {
    logAwareness('pollOnce', err);
  } finally {
    polling = false;
  }
}

/**
 * Decide boot action from persisted ban + optional quick porn probe.
 * @returns {Promise<{ action: 'run'|'speak-quit'|'silent-quit', text?: string }>}
 */
async function evaluateBoot() {
  loadState();

  if (state.graceStartedAt && isGraceExpired()) {
    clearBanState();
    return { action: 'run' };
  }

  let pornNow = false;
  try {
    const snap = await snapshotWindows();
    const selfPids = collectSelfPids();
    pornNow = !!matchPorn(snap.windows, selfPids);
    pornWasPresent = pornNow;
  } catch (err) {
    logAwareness('evaluateBoot snapshot', err);
  }

  if (!state.banActive) {
    return { action: 'run' };
  }

  // Ban active
  if (pornNow) {
    state.graceStartedAt = null;
    saveState();
    // Any reopen count: speak then quit (≥4 uses leave pool).
    const text = state.reopenCount >= 4
      ? pickLeavePhrase()
      : pickBanComplainPhrase();
    bumpReopenOnKick();
    return { action: 'speak-quit', text };
  }

  // Porn closed while ban active
  if (!state.graceStartedAt) {
    state.graceStartedAt = Date.now();
    saveState();
  }

  if (isGraceExpired()) {
    clearBanState();
    return { action: 'run' };
  }

  if (state.reopenCount >= 4) {
    // Sulk until grace: leave bubble then quit (visible so testing is obvious).
    return { action: 'speak-quit', text: pickLeavePhrase() };
  }

  // reopen 1–3 + porn closed: normal run, keep counters
  return { action: 'run' };
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    pollOnce().catch((err) => logAwareness('poll interval', err));
  }, POLL_MS);
  // First tick soon after start
  setTimeout(() => {
    pollOnce().catch((err) => logAwareness('poll first', err));
  }, 2500);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/**
 * @param {object} opts
 * @param {import('electron').App} opts.app
 * @param {() => import('electron').BrowserWindow|null} opts.getMainWindow
 * @param {() => void} opts.forceQuit
 * @param {() => boolean} [opts.isShowSpeechActive] true while soft-show intro runs
 * @param {() => boolean} [opts.isPetVisuallyHidden] true while soft-hidden — block soft catch
 * @param {() => void} [opts.onExternalRefuseNeeded] drop tray pending when awareness owns stage
 */
function init(opts) {
  appRef = opts.app;
  getMainWindow = opts.getMainWindow;
  onForceQuit = opts.forceQuit;
  isShowSpeechActive = typeof opts.isShowSpeechActive === 'function'
    ? opts.isShowSpeechActive
    : null;
  isPetVisuallyHidden = typeof opts.isPetVisuallyHidden === 'function'
    ? opts.isPetVisuallyHidden
    : null;
  onExternalRefuseNeeded = typeof opts.onExternalRefuseNeeded === 'function'
    ? opts.onExternalRefuseNeeded
    : null;
  loadState();
}

/**
 * Call after window is ready. Handles boot speak-quit if needed, then starts poll.
 * @param {{ action: string, text?: string }} boot
 */
function afterWindowReady(boot) {
  if (bootHandled) {
    startPolling();
    return;
  }
  bootHandled = true;

  if (boot.action === 'speak-quit' && boot.text) {
    // Brief delay so renderer can register listeners
    setTimeout(() => {
      requestSpeak(boot.text, true);
    }, 800);
    return;
  }

  startPolling();
}

function getState() {
  return { ...state };
}

/** Renderer finished a line — immediately continue queue (or quit). */
function notifySpeechFinished(thenQuit) {
  clearSpeakSafetyTimer();
  speakingBusy = false;
  speakCritical = false;
  if (thenQuit) {
    speakQueue = [];
    pornSequenceActive = false;
    quitNow();
    return;
  }
  flushSpeakQueue();
}

/**
 * Tray / rebootstrap fresh start — drop general speak lock.
 * Never clears active porn sequence.
 */
function resetGeneralSpeakLock() {
  if (pornSequenceActive) return;
  clearSpeakSafetyTimer();
  speakingBusy = false;
  speakCritical = false;
  speakQueue = [];
  // Soft pending stays — pet will deliver when idle after tray pipe.
}

/** External tray gate: awareness owns stage (speaking / porn). Pending soft catch does not block. */
function isAwarenessStageActive() {
  return speakingBusy || pornSequenceActive || speakQueue.length > 0;
}

/** Porn chain / load-quit — tray Hide must refuse. Soft app-catch is not critical. */
function isCriticalAwarenessActive() {
  return pornSequenceActive || (speakingBusy && speakCritical);
}

module.exports = {
  init,
  evaluateBoot,
  afterWindowReady,
  startPolling,
  stopPolling,
  getState,
  loadState,
  saveState,
  clearBanState,
  notifySpeechFinished,
  resetGeneralSpeakLock,
  isAwarenessStageActive,
  isCriticalAwarenessActive,
  deliverPendingAppCatch,
  clearPendingAppCatch,
  setLocale,
  GRACE_MS,
  LOAD_THRESHOLD,
  LOAD_SUSTAIN_MS,
};
