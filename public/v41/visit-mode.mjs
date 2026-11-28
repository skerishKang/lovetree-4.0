let active = false;
let sessionTheme = null;
let sessionPrefs = null;
// #1615: 셸과 안쪽 화면은 각각의 저장소 원형을 방문 중에만 감싼다.
// 방문 종료 시 같은 함수와 속성 정의를 그대로 복구한다.
let storageMethods = null;
function syncVisitStorageGuard(next) {
  if (!next) {
    if (storageMethods) {
      Object.defineProperties(storageMethods.proto, storageMethods.originals);
      storageMethods = null;
    }
    return;
  }
  if (storageMethods || typeof Storage === 'undefined') return;
  const proto = Storage.prototype;
  const originals = Object.fromEntries(['setItem','removeItem','clear'].map(name => [name,Object.getOwnPropertyDescriptor(proto,name)]));
  const blocked = key => /^(lt41\.|lovetree\.v41\.)/.test(String(key));
  Object.defineProperties(proto, {
    setItem: {...originals.setItem, value:function(key, value) {
      if (!blocked(key)) return originals.setItem.value.apply(this, arguments);
    }},
    removeItem: {...originals.removeItem, value:function(key) {
      if (!blocked(key)) return originals.removeItem.value.apply(this, arguments);
    }},
    // 전체 지우기는 보호 키까지 없애므로 두 저장소에서 모두 막는다.
    clear: {...originals.clear, value:function() {}}
  });
  storageMethods = {proto, originals};
}

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
  syncVisitStorageGuard(active);
  // 기존 프레임도 주소 교체에 앞서 같은 호출 안에서 보호를 켜거나 해제한다.
  if (typeof window !== 'undefined') window.dispatchEvent?.(new Event('lt41-visit-storage-mode'));
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
