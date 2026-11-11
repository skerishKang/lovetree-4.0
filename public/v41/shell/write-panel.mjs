// 순간 추가 한 창(#425, 2026-11-12) — 쉬운 추가와 자세한 추가를 한 창 안의 탭으로 오간다.
// 두 구역은 DOM에 그대로 남고 보이기만 바뀌므로, 탭을 바꿔도 적어 둔 값(주소·제목·마음 등)이 따라간다.
// 어느 탭을 먼저 보일지는 설정 "화면"의 값(lt41.writeTab)이 정하고, 값이 없으면 쉬운 추가다.

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

export function createWritePanel(deps) {
  const $ = deps.$;
  const storage = deps.storage || globalThis.localStorage;
  let current = 'easy';

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
    return current;
  }

  function open(tab) {
    const dialog = $('write-panel');
    if (!dialog.open) dialog.showModal();
    show(tab ?? readWriteTab(storage));
  }

  // 탭을 고르면 마지막으로 쓴 탭으로 기억한다(다음에 열 때 그 탭부터).
  function choose(tab) {
    const next = show(tab);
    writeWriteTab(storage, next);
    return next;
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

  return {open, show, choose, setTabsVisible, paint, tab: () => current};
}
