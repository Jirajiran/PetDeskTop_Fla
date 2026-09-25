/**
 * Locale loader — ordered categories are anonymous beats (logline order).
 * Show: all categories except the last (if 2+).
 * Awareness: all categories in order; LAST category is always the leave/quit beat.
 */
const fs = require('fs');
const path = require('path');

const LOCALES = ['th', 'en', 'zh'];
const DEFAULT_LOCALE = 'th';
const LOCALE_DIR = path.join(__dirname, 'i18n');

/** @type {string} */
let currentLocale = DEFAULT_LOCALE;
/** @type {object|null} */
let pack = null;

function localePath(code) {
  return path.join(LOCALE_DIR, `${code}.json`);
}

function loadLocale(code) {
  const safe = LOCALES.includes(code) ? code : DEFAULT_LOCALE;
  try {
    const raw = fs.readFileSync(localePath(safe), 'utf8');
    pack = JSON.parse(raw);
    currentLocale = safe;
  } catch (err) {
    console.error('[i18n] loadLocale', safe, err);
    if (safe !== DEFAULT_LOCALE) return loadLocale(DEFAULT_LOCALE);
    pack = emptyPack();
    currentLocale = DEFAULT_LOCALE;
  }
  return pack;
}

function emptyPack() {
  return {
    locale: DEFAULT_LOCALE,
    meta: { name: 'ไทย' },
    tray: {},
    categories: [{ id: 'leave', phrases: ['...'] }],
    pools: { idle: [], drag: [], banComplain: [], loadHeavy: [] },
    apps: {},
  };
}

function ensurePack() {
  if (!pack) loadLocale(currentLocale);
  return pack;
}

function getLocale() {
  return currentLocale;
}

function getPack() {
  return ensurePack();
}

function categories() {
  const list = ensurePack().categories;
  return Array.isArray(list) ? list.filter((c) => c && Array.isArray(c.phrases) && c.phrases.length) : [];
}

/** Show beats: everything before the last category (leave stays awareness-only). */
function getShowCategories() {
  const cats = categories();
  if (cats.length <= 1) return cats;
  return cats.slice(0, -1);
}

/** Awareness beats: full ordered list; last = leave. */
function getAwarenessCategories() {
  return categories();
}

function getLastCategory() {
  const cats = categories();
  return cats.length ? cats[cats.length - 1] : null;
}

function tray(key, vars) {
  const t = ensurePack().tray || {};
  let s = t[key] != null ? String(t[key]) : key;
  if (vars && typeof vars === 'object') {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return s;
}

function pool(name) {
  const p = ensurePack().pools || {};
  const list = p[name];
  return Array.isArray(list) ? list : [];
}

function appPhrases(family) {
  const apps = ensurePack().apps || {};
  const list = apps[family];
  return Array.isArray(list) ? list : [];
}

function pickFromList(list, seedRef) {
  if (!list || !list.length) return '';
  if (seedRef && typeof seedRef === 'object') {
    seedRef.value = (Number(seedRef.value) || 1) + 1;
    return list[Math.abs(seedRef.value) % list.length];
  }
  return list[Math.floor(Math.random() * list.length)];
}

function pickFromCategory(cat, seedRef) {
  if (!cat || !cat.phrases || !cat.phrases.length) return '';
  return pickFromList(cat.phrases, seedRef);
}

function pickPool(name, seedRef) {
  return pickFromList(pool(name), seedRef);
}

function pickApp(family, seedRef) {
  return pickFromList(appPhrases(family), seedRef);
}

function pickLastCategoryPhrase(seedRef) {
  return pickFromCategory(getLastCategory(), seedRef);
}

/** Renderer-safe snapshot (no functions). */
function packForRenderer() {
  const p = ensurePack();
  return {
    locale: currentLocale,
    meta: p.meta || {},
    categories: categories(),
    showCategories: getShowCategories(),
    pools: {
      idle: pool('idle'),
      drag: pool('drag'),
    },
  };
}

module.exports = {
  LOCALES,
  DEFAULT_LOCALE,
  loadLocale,
  getLocale,
  getPack,
  getShowCategories,
  getAwarenessCategories,
  getLastCategory,
  tray,
  pool,
  appPhrases,
  pickFromList,
  pickFromCategory,
  pickPool,
  pickApp,
  pickLastCategoryPhrase,
  packForRenderer,
};
