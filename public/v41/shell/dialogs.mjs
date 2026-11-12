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
    // #425: 순간 추가는 한 창(write-panel)이다 — 고르기 창·빠른 추가·편집기가 하나로 합쳐졌다.
    const write = $('write-panel'), assets = $('account-assets');
    const dialog = write?.open ? write : assets?.open ? assets : null;
    if (!dialog) return;
    const list = shellFocusables(dialog);
    if (!list.length) { event.preventDefault(); return; }
    const at = list.indexOf(document.activeElement);
    if (event.shiftKey) {
      if (at <= 0) { event.preventDefault(); list[list.length - 1].focus(); }
    } else if (at < 0 || at === list.length - 1) { event.preventDefault(); list[0].focus(); }
  }
  document.addEventListener('keydown', trapShellTab, true);


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

  // 2026-11-11 #380 4: 오른쪽 패널을 두 모양으로 띄우는 공통 틀 — data-lt-panel="full"(맨 위 메뉴 아래 내용 자리)·"center"(가운데 작은 창).
  // 컴퓨터와 모바일이 같은 모양이다. 공통 닫기 규칙: ×·바깥 클릭·Esc 모두, 쓰던 내용이 있으면 "저장하지 않고 닫을까요?"를 한 번 묻고(기존 편집기·트리 관리 규칙 재사용),
  // 닫으면 연 버튼으로 초점을 돌려준다.
  // #380 4 마지막: 오른쪽에 붭던 패널이 모두 이 틀로 옮겨졌다. 전체 화면 = 순간 정리·순간 잇기·
  // 설정·내 보관 파일·공유·둘러보기, 가운데 창 = 트리 관리·순간 추가(한 창, #425).
  // #368: 옛 내 기록(records)도 설정으로 옮겨져 공통 틀 밖 대화상자는 이제 없다.
  const PANEL_DIRTY = { 'tree-manager': () => deps.isTreeDirty?.() === true };
  // 2026-11-11 #380 4 2차: 더러움 판정을 편집기·순간 잇기까지 넓힌다. 판정 자체는 셸·패널 모듈이 들고 있고
  // (편집기는 제목·메모·주소·사진·고른 연결, 순간 잇기는 고른 연결이 저장 전), 공통 틀은 "한 번 묻고 닫을지"만 정한다.
  // #425: 순간 추가 한 창 — 쉬운 추가(주소를 적고 아직 담지 않음)와 자세한 추가(폼이 기준값과 다름) 모두 같은 판정을 쓴다.
  PANEL_DIRTY['write-panel'] = () => deps.isEditorDirty?.() === true;
  PANEL_DIRTY['connection-panel'] = () => deps.isConnectionDirty?.() === true;
  // #380 4 마지막: 빠른 추가는 주소를 적어 두고 아직 담지 않은 상태, 공유는 공개 범위를 미리 봤는데 링크를 아직 만들지 않은 상태만 묻는다.
  // 설정·내 보관 파일·둘러보기·추가 방식 고르기는 적어 두는 입력이 없어 그대로 닫는다.
  PANEL_DIRTY['share-panel'] = () => deps.isShareDirty?.() === true;
  // #368 2차: 설정은 프로필(표시 이름·동그라미 색)을 쓰다 두었을 때만 묻는다. 나머지 설정 항목은 누르는 즉시
  // 적용되어 더러움이 없고, 내 보관 파일·둘러보기도 적어 두는 입력이 없어 그대로 닫는다.
  PANEL_DIRTY['account-settings'] = () => deps.isSettingsDirty?.() === true;
  // #480 M8: 정리 창은 새 트리 이름을 적었거나 순간 고름·옮길 트리가 창을 열 때와 달라졌을 때 묻는다.
  // 미리 골라진 순간(순간 상세의 '옮기기')만으로는 묻지 않는다 — 열자마자 닫아도 되게.
  PANEL_DIRTY['cleanup-panel'] = () => deps.isCleanupDirty?.() === true;
  // 닫기 자체를 막아야 하는 상태(편집기 업로드 중)는 문구를 돌려준다. 이때는 확인을 묻지 않고 닫지 않는다 —
  // 편집기 규칙이 공통 틀보다 우선한다(업로드 중 닫기 방지).
  function panelBlockedMessage(d) {
    const message = deps.panelBlocked?.(d.id) || '';
    if (message) deps.notify?.(message);
    return message;
  }
  function panelConfirmClose(d) {
    if (panelBlockedMessage(d)) return false;
    if (PANEL_DIRTY[d.id]?.() && !confirm('저장하지 않고 닫을까요?')) return false;
    return true;
  }
  // 닫은 뒤 초점이 갈 곳: 연 버튼 → data-lt-return 순서는 focusReturnTarget이 정한다.
  // 모바일에서는 연 버튼이 '더보기' 메뉴 안에 접혀 보이지 않으므로, 그때는 더보기 버튼으로 돌려준다(초점을 잃지 않게).
  function panelReturnFocus(opener, fallback) {
    const target = focusReturnTarget(opener, fallback);
    if (target?.getClientRects?.().length) return target;
    const more = document.getElementById('mobile-more');
    if (more?.getClientRects?.().length) return more;
    return target;
  }
  function syncPanelTop() {
    const header = document.querySelector?.('.app-header');
    const top = header ? Math.round(header.getBoundingClientRect().height) : 66;
    document.documentElement?.style?.setProperty('--lt-panel-top', `${top}px`);
  }
  // 전체 화면 틀의 시작 높이는 셸 panel()뿐 아니라 각 패널 모듈이 직접 showModal()로 열 때도 맞아야 한다.
  // 메뉴 높이가 바뀌면(로그인·모바일 메뉴) 곧바로 따라가도록 머리 높이를 지켜본다.
  syncPanelTop();
  document.defaultView?.addEventListener?.('resize', syncPanelTop);
  const headerBox = document.querySelector?.('.app-header');
  if (headerBox && typeof ResizeObserver === 'function') new ResizeObserver(syncPanelTop).observe(headerBox);
  // 연 버튼 기록: dialog 'open' 이벤트는 환경마다 걸리는 시점이 달라 쓰지 않고, 셸 panel()이 showModal 직전에
  // noteOpener(id)로 그 순간의 활성 요소를 적둔다. 닫히면 연 버튼으로(사라졌으면 data-lt-return) 초점을 돌려준다.
  const openers = new Map();
  // 패널 모듈이 직접 showModal()로 여는 창(빠른 추가·고르기·둘러보기)도 연 버튼을 알아야 초점을 돌려줄 수 있다.
  // noteOpener를 부르지 않는 곳을 위해 마지막으로 누른 조작 요소를 적어 두고, 그 요소가 이 대화상자 밖에 있을 때만 쓴다.
  let lastControl = null;
  document.addEventListener('click', event => {
    const el = event.target?.closest?.('button,a,[role="button"]');
    if (el) lastControl = el;
  }, true);
  for (const d of document.querySelectorAll('dialog[data-lt-panel]')) {
    d.addEventListener('close', () => {
      const recorded = openers.get(d);
      openers.delete(d);
      const outside = lastControl ? !(d.contains?.(lastControl) ?? false) : false;
      const opener = recorded || (outside ? lastControl : null);
      const fallback = d.dataset.ltReturn ? document.getElementById(d.dataset.ltReturn) : null;
      const target = panelReturnFocus(opener, fallback);
      setTimeout(() => target?.focus?.(), 0);
    });
    d.addEventListener('cancel', event => { if (!panelConfirmClose(d)) event.preventDefault(); else d.close(); });
    d.addEventListener('click', event => {
      if (event.target !== d) return;
      const r = d.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) {
        if (panelConfirmClose(d)) d.close();
      }
    });
  }

  // #368: 공통 틀 밖 대화상자가 없어졌으므로 옛 바깥 클릭 규칙(dialog:not([data-lt-panel]))도 함께 지웠다.
  // 모든 dialog는 위 공통 틀(×·바깥 클릭·Esc·초점 복귀)이 닫는다.

  return {
    shellFocusables,
    trapShellTab,
    rememberOpener: opener => { assetsOpener = opener; },
    // #380 4: 셸 panel()이 showModal 직전에 부른다 — 연 버튼 기록과 전체 화면 모양의 맨 위 메뉴 높이 측정.
    // rememberOpener로 적어 둔 버튼이 있으면 그것을 먼저 쓴다(내 보관 파일을 연 버튼).
    noteOpener: id => {
      const d = $(id);
      if (!d?.dataset?.ltPanel) return;
      openers.set(d, assetsOpener?.isConnected ? assetsOpener : document.activeElement);
      assetsOpener = null;
    },
    // #380 4 2차: × 버튼도 바깥 클릭·Esc와 같은 규칙을 쓴다(막을 상태면 막고, 더러우면 한 번 묻고, 닫으면 초점 복귀).
    requestClose: id => { const d = $(id); if (!d) return false; if (!panelConfirmClose(d)) return false; d.close(); return true; },
    syncPanelTop
  };
}
