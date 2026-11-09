// 셸 시험용 최소 가짜 DOM (#231 1-B, 2026-11-09).
// 소스 글자를 정규식으로 보던 시험을 "함수를 직접 불러 결과를 본다"로 바꾸면서,
// 파일마다 가짜 DOM을 새로 만들지 않도록 여기 한 곳에 둔다.
// 규칙: 제품 코드는 건드리지 않는다. 여기서 만드는 것은 셸이 만지는 요소의 최소 흉내다.

export function fakeEl(extra = {}) {
  const el = {
    hidden: false,
    title: '',
    textContent: '',
    dataset: {},
    classList: {
      list: new Set(),
      add(...names) { for (const n of names) this.list.add(n); },
      remove(...names) { for (const n of names) this.list.delete(n); },
      toggle(name, force) {
        const on = force === undefined ? !this.list.has(name) : !!force;
        if (on) this.list.add(name); else this.list.delete(name);
        return on;
      },
      contains: (name) => el.classList.list.has(name)
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    removeAttribute(name) { delete this.attrs[name]; },
    getAttribute(name) { return this.attrs[name] ?? null; },
    focus() { el.focused = true; },
    focused: false,
    close() { el.closed = true; el.open = false; },
    showModal() { el.open = true; },
    closed: false,
    listeners: {},
    addEventListener(type, fn) { (el.listeners[type] ||= []).push(fn); },
    dispatch(type, event) { for (const fn of el.listeners[type] || []) fn(event); },
    ...extra
  };
  return el;
}

// 라디오 묶음(RadioNodeList) 흉내 — #314, 2026-11-09 Chromium 1254 실측 그대로.
// 실측: .value에 빈 문자열이나 없는 값을 넣으면 **아무것도 바뀌지 않고**,
// 있는 값(비어 있지 않은)을 넣을 때만 그 라디오를 체크하고 나머지를 해제한다.
// 그래서 RadioNodeList.value = ''로는 이전 선택이 지워지지 않는다(#314의 원인).
// 이 동작을 흉내 내야 "빈 값으로 열었는데 이전 선택이 남는" 회귀를 시험이 실제로 잡는다.
export function fakeRadioGroup(values, { checked = values[0] } = {}) {
  const radios = values.map((value) => fakeEl({ value, checked: value === checked }));
  Object.defineProperty(radios, 'value', {
    get() { return (radios.find((r) => r.checked) || {}).value ?? ''; },
    set(next) {
      if (next === '') return;
      const match = radios.find((r) => r.value === next);
      if (!match) return;
      for (const radio of radios) radio.checked = radio === match;
    }
  });
  return radios;
}

// 셸이 쓰는 탭 줄(nav) 흉내: 스크롤 폭·현재 위치·페이드 클래스·스크롤 반응 등록을 기록한다.
export function fakeNav({scrollWidth = 400, clientWidth = 400, scrollLeft = 0, buttons = []} = {}) {
  const nav = fakeEl({
    scrollWidth,
    clientWidth,
    scrollLeft,
    close() { el.closed = true; el.open = false; },
    showModal() { el.open = true; },
    closed: false,
    listeners: {},
    querySelector(sel) {
      if (sel === '[aria-current="true"]') return buttons.find((b) => b.getAttribute('aria-current') === 'true') || null;
      if (sel === '#record-menu') return buttons.find((b) => b.id === 'record-menu') || null;
      return null;
    },
    addEventListener(type, fn) { nav.listeners[type] = fn; }
  });
  nav.buttons = buttons;
  return nav;
}

export function fakeTabButton({id = '', title = '', rect = true} = {}) {
  const b = fakeEl({id, scrolledWith: null});
  b.title = title;
  b.getClientRects = () => (rect ? [{width: 80, height: 30}] : []);
  b.scrollIntoView = (opts) => { b.scrolledWith = opts; };
  return b;
}

// 셸 헤더 시험의 공용 하네스. tests/v41-shell-header.test.mjs(#241)에서 쓰던 방식을 그대로 옮겼다.
export function createHeaderHarness({
  owned = false, writable = true, dirty = false, subject = 's1',
  trees = 0, tree = null, source = 'example', current = 'src064-orbit.html',
  navBar = null, reduceMotion = false, narrow = true, account = {ok: false}, storage = null
} = {}) {
  const els = {
    'tree-views': fakeEl(),
    'record-menu': fakeEl(),
    'source-label': fakeEl(),
    'write-menu': fakeEl(),
    'share-menu': fakeEl(),
    'account-entry': fakeEl(),
    'account-avatar': fakeEl({ hidden: true }),
    'account-email': fakeEl(),
    'account-popover': fakeEl({ hidden: true }),
    server: fakeEl(),
    logout: fakeEl()
  };
  const saved = {
    document: globalThis.document,
    window: globalThis.window,
    sessionStorage: globalThis.sessionStorage,
    matchMedia: globalThis.matchMedia,
    LT41: globalThis.LT41,
    addEventListener: globalThis.addEventListener
  };
  const store = storage || { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.sessionStorage = store;
  globalThis.document = { querySelectorAll: () => [] };
  globalThis.window = globalThis;
  globalThis.addEventListener = () => {};
  globalThis.matchMedia = (query) => ({
    matches: query.includes('max-width:780px') ? narrow : (query.includes('reduce') ? reduceMotion : false)
  });
  globalThis.LT41 = tree ? { tree } : null;

  const calls = { tips: 0, scrolled: [] };
  globalThis.navScrollSpy = () => {};

  let currentScreen = current;
  const member = { snapshot: () => ({ owned, writable, dirty, subject }) };
  const header = createHeaderForTest({
    $: (id) => els[id] ?? null,
    navBar,
    getMember: () => member,
    getModel: () => ({ trees: Array.from({ length: trees }, (_, i) => ({ id: 't' + i, title: '기록 ' + i })) }),
    getSource: () => source,
    getCurrent: () => currentScreen,
    accountApi: { account: async () => account },
    delegate: { syncTreeTips: () => { calls.tips += 1; } }
  });

  const restore = () => {
    globalThis.document = saved.document;
    globalThis.window = saved.window;
    globalThis.matchMedia = saved.matchMedia;
    globalThis.addEventListener = saved.addEventListener;
    if (saved.sessionStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = saved.sessionStorage;
    if (saved.LT41 === undefined) delete globalThis.LT41;
    else globalThis.LT41 = saved.LT41;
    delete globalThis.navScrollSpy;
  };

  return {
    header,
    els,
    calls,
    setCurrent: (next) => { currentScreen = next; },
    restore
  };
}

// createHeader는 제품 모듈에서 가져온다(순환 참조를 피하려고 지연 import).
import { createHeader as createHeaderForTest } from '../../public/v41/shell/header.mjs';

// 주소·기록 흉내 (#231 후속, 2026-11-09). createLocation이 읽는 location.hash와
// history.pushState/replaceState/go, 그리고 popstate·hashchange를 실제로 발생시킨다.
export function fakeBrowser({hash = '#home', state = null} = {}) {
  const calls = {push: [], replace: [], go: [], listeners: {} };
  const listeners = {};
  const browsed = {state, hash};
  const location = {
    origin: 'https://lovetree-4-0.pages.dev',
    get hash() { return browsed.hash; },
    set hash(value) { browsed.hash = value; }
  };
  const history = {
    get state() { return browsed.state; },
    pushState(next, title, url) { calls.push.push({next, url}); browsed.state = next; browsed.hash = url; },
    replaceState(next, title, url) { calls.replace.push({next, url}); browsed.state = next; browsed.hash = url; },
    go(n) { calls.go.push(n); }
  };
  const saved = {location: globalThis.location, history: globalThis.history, addEventListener: globalThis.addEventListener, localStorage: globalThis.localStorage};
  globalThis.location = location;
  globalThis.history = history;
  globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.addEventListener = (type, fn) => { (listeners[type] ||= []).push(fn); };

  return {
    location,
    history,
    calls,
    listeners,
    setHash(value) { browsed.hash = value; },
    fire(type) { for (const fn of listeners[type] || []) fn({type}); },
    popstate() { this.fire('popstate'); },
    hashchange() { this.fire('hashchange'); },
    restore() {
      globalThis.location = saved.location;
      globalThis.history = saved.history;
      globalThis.addEventListener = saved.addEventListener;
      if (saved.localStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = saved.localStorage;
    }
  };
}
