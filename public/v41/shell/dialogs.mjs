// 셸 대화상자 접근성 (#231 1-B 후속).
// 2026-11-08 리팩터링: 동작·문구·겉모습 변경 0. shell.mjs에서 조건·조회 방식을 바꾸지 않고 그대로 옮겼다.
// Tab 순환·Esc 복귀·포커스 되돌리기만 맡는다. 대화상자를 여닫는 일은 셸과 각 패널 모듈이 한다.
import {focusReturnTarget} from '../view-a11y.mjs';

export function createDialogs(deps) {
  const {$} = deps;
  const closeTreeTips = deps.closeTreeTips;
  const closeAccountMenu = deps.closeAccountMenu;

  // 보관 파일 다이얼로그를 연 버튼(없으면 계정 동그라미)으로 초점을 돌려준다.
  let assetsOpener = null;

  // 2026-11-08 #202 후속: 셸 대화상자(순간 편집기·보관 파일) Tab을 내부에서 순환시킨다.
  // 보관 파일이 편집기 위에 열려 있으면 보관 파일 안에서만 순환한다.
  const SHELL_FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
  function shellFocusables(root) {
    return [...root.querySelectorAll(SHELL_FOCUSABLE)].filter(el => !el.disabled && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
  }
  function trapShellTab(event) {
    if (event.key !== 'Tab') return;
    const quick = $('quick-add'), chooser = $('write-chooser'), assets = $('account-assets'), editor = $('editor');
    const dialog = quick?.open ? quick : chooser?.open ? chooser : assets?.open ? assets : editor?.open ? editor : null;
    if (!dialog) return;
    const list = shellFocusables(dialog);
    if (!list.length) { event.preventDefault(); return; }
    const at = list.indexOf(document.activeElement);
    if (event.shiftKey) {
      if (at <= 0) { event.preventDefault(); list[list.length - 1].focus(); }
    } else if (at < 0 || at === list.length - 1) { event.preventDefault(); list[0].focus(); }
  }
  document.addEventListener('keydown', trapShellTab, true);

  $('account-assets').addEventListener('cancel', event => {
    event.preventDefault();
    $('account-assets').close();
    const target = focusReturnTarget(assetsOpener, $('account-avatar'));
    setTimeout(() => target?.focus?.(), 0);
  });

  // 첫 트리 안내 말풍선 Esc: 열린 모달 대화상자가 있으면 말풍선은 건드리지 않는다.
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const box = $('tree-tips');
    if (!box || box.hidden) return;
    if ([...document.querySelectorAll('dialog[open]')].some(d => d.matches(':modal'))) return;
    event.preventDefault();
    closeTreeTips();
  });

  // 계정 메뉴 Esc: 닫고 계정 동그라미로 초점을 돌린다.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const pop = $('account-popover');
    if (pop && !pop.hidden) { closeAccountMenu(); $('account-avatar').focus(); }
  });

  // 다이얼로그 바깥(어두운 배경) 클릭으로 닫기. 편집기·책 정보는 실수로 닫히지 않게 뺀다.
  for (const d of document.querySelectorAll('dialog')) d.addEventListener('click', e => {
    if (e.target !== d || ['editor', 'tree-manager', 'quick-add', 'write-chooser'].includes(d.id)) return;
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
  });

  return {
    shellFocusables,
    trapShellTab,
    rememberOpener: opener => { assetsOpener = opener; }
  };
}
