let active = false;
let sessionTheme = null;
let sessionPrefs = null;
const storageGuard = Symbol('lt41.visitStorageGuard');

export function isVisitMode() {
  return active;
}

export function setVisitMode(value) {
  const next = !!value;
  if (active !== next) {
    sessionTheme = null;
    sessionPrefs = null;
  }
  active = next;
  globalThis.LT41_VISIT_READ_ONLY = active;
  if (typeof Storage === 'undefined' || Storage.prototype[storageGuard]) return;
  const setItem = Storage.prototype.setItem;
  const removeItem = Storage.prototype.removeItem;
  const blocked = key => active && String(key).startsWith('lt41.');
  Storage.prototype.setItem = function (key, value) {
    if (this !== localStorage || !blocked(key)) return setItem.call(this, key, value);
  };
  Storage.prototype.removeItem = function (key) {
    if (this !== localStorage || !blocked(key)) return removeItem.call(this, key);
  };
  Object.defineProperty(Storage.prototype, storageGuard, {value: true});
}

export function readVisitTheme() {
  return active ? sessionTheme : null;
}

export function setVisitTheme(value) {
  if (!active) return;
  sessionTheme = value || null;
  if (sessionPrefs) sessionPrefs = {...sessionPrefs, theme:sessionTheme};
}

export function setVisitPrefs(value) {
  if (active) sessionPrefs = value && typeof value === 'object' ? value : null;
}

export function readVisitPrefs() {
  return active ? sessionPrefs : null;
}
