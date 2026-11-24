// 순간 추가 한 창(#425, 2026-11-12) — 쉬운 추가와 자세한 추가를 한 창 안의 탭으로 오간다.
// 두 구역은 DOM에 그대로 남고 보이기만 바뀌므로, 탭을 바꿔도 적어 둔 값(주소·제목·마음 등)이 따라간다.
// 어느 탭을 먼저 보일지는 설정 "순간 추가 › 먼저 보일 탭"의 값(lt41.writeTab)이 정하고, 값이 없으면 쉬운 추가다.
// #462: 그 값은 설정에서만 바뀐다. 탭을 눌러 보거나 저장까지 해도 이번 열림에만 적용되고 기본 탭은 그대로다.

export const WRITE_TAB_KEY = 'lt41.writeTab';
export const WRITE_TABS = ['easy', 'detailed'];
export const WRITE_TAB_LABELS = {easy: '쉬운 추가', detailed: '자세한 추가'};

// 저장값 정리 한 곳: 'detailed'만 자세한 추가, 그 밖(빈 값·모르는 값)은 모두 쉬운 추가.
export function normalizeWriteTab(value) {
  return value === 'detailed' ? 'detailed' : 'easy';
}

export function readWriteTab(storage) {
  try { return normalizeWriteTab(storage?.getItem?.(WRITE_TAB_KEY)); } catch { return 'easy'; }
}

export function writeWriteTab(storage, tab) {
  const next = normalizeWriteTab(tab);
  try { storage?.setItem?.(WRITE_TAB_KEY, next); } catch { /* 저장 실패는 기본값으로 */ }
  return next;
}

// #462: 휴대폰 키보드가 올라오면 '보이는 화면'(visualViewport)만 줄고 창(100dvh)은 그대로라 아래 저장 단추가 가렸다.
// 보이는 화면의 위치·높이를 창에 CSS 변수로 넘기고(모바일 CSS만 쓴다), 저장 단추는 창 아래에 붙여 둔다.
export function viewportBox(vv) {
  const height = Number(vv?.height);
  if (!Number.isFinite(height) || height <= 0) return null;
  const top = Number(vv?.offsetTop);
  return {top: Number.isFinite(top) && top > 0 ? Math.round(top) : 0, height: Math.round(height)};
}

// #822 1단계: 쉬운 추가 탭 맨 아래의 '북마크에서 가져오기' 입구 한 줄. 가져오기 창과 한 벌로 붙였다 떼기 쉽게
// 마크업을 index.html에 두지 않고 여기서 만든다. 모양은 기존 안내 줄(quick-drop-hint)·글자 단추(quick-refine)
// 클래스를 그대로 쓴다. 누르면 onOpen만 부른다 — 창 모듈은 그때 받는다(shell/bookmark-import.mjs).
export const BOOKMARK_ENTRY_ID = 'bookmark-import-open';
export const BOOKMARK_ENTRY_LEAD = '이미 모아 둔 영상이 있나요?';
export const BOOKMARK_ENTRY_LABEL = '북마크에서 가져오기';
export function mountBookmarkEntry({ $, document: doc = globalThis.document, onOpen } = {}) {
  const host = $?.('write-easy');
  if (!host?.append || !doc?.createElement) return null;
  const line = doc.createElement('p');
  line.className = 'quick-drop-hint bookmark-entry';
  const lead = doc.createElement('span');
  lead.textContent = `${BOOKMARK_ENTRY_LEAD} `;
  const button = doc.createElement('button');
  button.type = 'button';
  button.id = BOOKMARK_ENTRY_ID;
  button.className = 'quick-refine';
  button.textContent = BOOKMARK_ENTRY_LABEL;
  button.addEventListener('click', () => { onOpen?.(); });
  line.append(lead, button);
  host.append(line);
  return button;
}

// #822 6단계: 처음 온 팬 안내 — 트리가 아직 없는 내 계정의 빈 화면(빈 서재, 첫 순간 안내)에 같은 한 줄을 둔다.
// 빈 화면 마크업(index.html #empty)은 건드리지 않고 여기서 한 줄을 붙인다. 모양은 가져오기 창과 같은 스타일 한 장을
// 쓰므로, 줄을 처음 보일 때 그 한 장을 싣고 다 실린 뒤에 보인다(셸 첫 화면이 받는 파일은 늘지 않는다).
// 돌려주는 show(on)을 빈 화면을 그리는 곳(workspace-runtime paintEmptyForScreen)이 부른다.
export const BOOKMARK_STYLE_HREF = '/v41/bookmark-import.css';
const bookmarkStyles = new WeakMap();
export function ensureBookmarkStyle(doc = globalThis.document) {
  if (!doc?.createElement) return Promise.resolve();
  if (bookmarkStyles.has(doc)) return bookmarkStyles.get(doc);
  const ready = new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = BOOKMARK_STYLE_HREF;
    link.addEventListener('load', finish);
    link.addEventListener('error', finish);
    setTimeout(finish, 1500);
    (doc.head || doc.body).append(link);
  });
  bookmarkStyles.set(doc, ready);
  return ready;
}
export const BOOKMARK_EMPTY_ID = 'empty-bookmark-open';
export function mountEmptyBookmarkEntry({ $, document: doc = globalThis.document, onOpen, ensureStyle = () => ensureBookmarkStyle(doc) } = {}) {
  const host = $?.('empty');
  if (!host?.append || !doc?.createElement) return { show() {} };
  const line = doc.createElement('p');
  line.className = 'empty-bookmark';
  line.hidden = true;
  const lead = doc.createElement('span');
  lead.textContent = `${BOOKMARK_ENTRY_LEAD} `;
  const button = doc.createElement('button');
  button.type = 'button';
  button.id = BOOKMARK_EMPTY_ID;
  button.textContent = BOOKMARK_ENTRY_LABEL;
  button.addEventListener('click', () => { onOpen?.(); });
  line.append(lead, button);
  host.append(line);
  let wanted = false;
  return {
    line,
    button,
    // 보이라는 말이 오면 스타일을 싣고 나서 보인다. 그 사이에 숨기라는 말이 오면 보이지 않는다.
    show(on) {
      wanted = !!on;
      if (!wanted) { line.hidden = true; return Promise.resolve(); }
      return Promise.resolve(ensureStyle()).then(() => { line.hidden = !wanted; });
    }
  };
}

export function createWritePanel(deps) {
  const $ = deps.$;
  const storage = deps.storage || globalThis.localStorage;
  const vv = deps.visualViewport === undefined ? globalThis.visualViewport : deps.visualViewport;
  let current = 'easy';
  function syncViewport() {
    const box = viewportBox(vv);
    const style = $('write-panel')?.style;
    if (!box || !style?.setProperty) return;
    style.setProperty('--lt-vv-top', `${box.top}px`);
    style.setProperty('--lt-vv-h', `${box.height}px`);
  }
  if (vv?.addEventListener) {
    vv.addEventListener('resize', syncViewport);
    vv.addEventListener('scroll', syncViewport);
    syncViewport();
  }
  // #453 B: 탭을 열 때마다 셸이 편집기 기준값을 다시 잡을 수 있게 알린다(탭만 눌렀는데 더러움으로 보던 문제).
  let onTab = () => {};
  function setTabHook(fn) { onTab = typeof fn === 'function' ? fn : () => {}; }

  function paint() {
    $('write-easy').hidden = current !== 'easy';
    $('write-detailed').hidden = current !== 'detailed';
    $('write-tab-easy').setAttribute('aria-selected', String(current === 'easy'));
    $('write-tab-detailed').setAttribute('aria-selected', String(current === 'detailed'));
    $('write-tab-easy').tabIndex = current === 'easy' ? 0 : -1;
    $('write-tab-detailed').tabIndex = current === 'detailed' ? 0 : -1;
  }

  // 탭 줄은 더하기(추가)일 때만 있다. 수정은 탭 없이 같은 창의 자세한 내용만 보여 준다.
  function setTabsVisible(visible) {
    $('write-tabs').hidden = !visible;
    if (visible) { paint(); return; }
    $('write-easy').hidden = true;
    $('write-detailed').hidden = false;
  }

  function show(tab) {
    current = normalizeWriteTab(tab);
    $('write-tabs').hidden = false;
    paint();
    onTab(current);
    return current;
  }

  function open(tab) {
    const dialog = $('write-panel');
    if (!dialog.open) { dialog.showModal(); deps.onModalShown?.(); }
    show(tab ?? readWriteTab(storage));
  }

  // #462: 탭을 고르면 이번 열림에만 그 탭을 보인다. 기본 탭(lt41.writeTab)은 저장하지 않는다 —
  // 설정의 '먼저 보일 탭'(shell.mjs의 data-write-tab → writeWriteTab)만 바꾼다.
  function choose(tab) {
    return show(tab);
  }

  $('write-tab-easy').onclick = () => choose('easy');
  $('write-tab-detailed').onclick = () => choose('detailed');
  // 탭 줄 키보드: 좌우 화살표·Home·End는 탭 사이를 옮기고, 초점도 함께 옮긴다(roles/tablist 규칙).
  $('write-tabs').addEventListener('keydown', event => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'easy' : event.key === 'End' ? 'detailed' : current === 'easy' ? 'detailed' : 'easy';
    choose(next);
    $(next === 'easy' ? 'write-tab-easy' : 'write-tab-detailed').focus?.();
  });
  paint();

  return {open, show, choose, setTabsVisible, paint, tab: () => current, setTabHook, syncViewport};
}
