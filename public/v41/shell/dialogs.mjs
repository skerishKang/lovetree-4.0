// 셸 대화상자 접근성 (#231 1-B 후속).
// 2026-11-08 리팩터링: 동작·문구·겉모습 변경 0. shell.mjs에서 조건·조회 방식을 바꾸지 않고 그대로 옮겼다.
// Tab 순환·Esc 복귀·포커스 되돌리기만 맡는다. 대화상자를 여닫는 일은 셸과 각 패널 모듈이 한다.
import {focusReturnTarget} from '../view-a11y.mjs';

// #978: 뒤로가기 한 번의 '맨 위 창'은 주소 처리가 창을 닫으려다 확인 물음을 띄우기 전 값이다.
// 모듈을 읽는 순간(다른 popstate 리스너보다 먼저) 캡처 리스너를 걸어 그 값을 적어 둔다.
let ltPopstateTop = null;
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('popstate', () => {
    const doc = globalThis.document;
    const modals = doc ? [...doc.querySelectorAll('dialog[open]')].filter(d => d.matches(':modal')) : [];
    ltPopstateTop = modals[modals.length - 1] || null;
  }, true);
}

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
  // #978: 앱 안 닫기 확인 틀 — 브라우저 기본 confirm() 대신 앱 모양으로 "저장하지 않고 닫을까요?"를 묻는다.
  // 공통 닫기 틀의 더러운 창은 모두 이 틀을 쓴다(정리·편집기·트리 관리·순간 잇기·공유·설정).
  // 물음은 비동기(단추를 눌러야 답이 온다)라서, 더러운 창은 일단 닫지 않고(return false) 틀을 띄운 뒤
  // '예'를 누르면 그때 실제로 닫는다. Esc·바깥 클릭 = 아니요(창은 그대로), 초점은 틀 안에 머물고
  // 닫히면 원래 자리로 돌아간다. 확인 틀은 패널 무리(한 장 규칙·뒤로가기)에 끼지 않는 잠깐 판이다.
  const CLOSE_CONFIRM_ID = 'lt-close-confirm';
  let closeConfirmEl = null;
  let closeConfirmFor = null;
  // #978: 물음이 열린 시각 — 같은 뒤로가기 처리 중에 뜬 물음(주소 처리가 먼저 창을 닫으려다 띄운 것)은
  // 사용자가 아직 답하지 않은 물음이라 '아니요'로 세지 않는다.
  let closeConfirmOpenedAt = 0;
  function dismissCloseConfirm() {
    const el = closeConfirmEl;
    closeConfirmFor = null;
    if (el?.open) { try { el.close(); } catch { /* 이미 닫힘 */ } }
  }
  function ensureCloseConfirm() {
    if (closeConfirmEl) return closeConfirmEl;
    const el = document.createElement('dialog');
    el.id = CLOSE_CONFIRM_ID;
    el.className = 'lt-close-confirm';
    el.setAttribute('aria-labelledby', 'lt-close-confirm-title');
    const title = document.createElement('h2');
    title.id = 'lt-close-confirm-title';
    title.textContent = '저장하지 않고 닫을까요?';
    const row = document.createElement('div');
    row.className = 'button-row';
    const yes = document.createElement('button');
    yes.type = 'button'; yes.id = 'lt-close-confirm-yes'; yes.className = 'primary'; yes.textContent = '예';
    const no = document.createElement('button');
    no.type = 'button'; no.id = 'lt-close-confirm-no'; no.textContent = '아니요';
    row.append(yes, no);
    el.append(title, row);
    document.body.append(el);
    // 예: 확인 틀을 닫고 원래 창을 실제로 닫는다(초점 복귀는 공통 'close' 규칙이 맡는다).
    yes.addEventListener('click', () => { const target = closeConfirmFor; dismissCloseConfirm(); target?.close?.(); });
    // 아니요: 확인 틀만 닫고 원래 창은 그대로 둔다. 초점은 원래 창으로 돌려준다.
    no.addEventListener('click', () => { const target = closeConfirmFor; dismissCloseConfirm(); refocusPanel(target); });
    // Esc = 아니요(브라우저 cancel을 막고 직접 닫는다). 바깥 클릭도 아니요.
    el.addEventListener('cancel', (event) => { event.preventDefault(); const target = closeConfirmFor; dismissCloseConfirm(); refocusPanel(target); });
    el.addEventListener('click', (event) => {
      if (event.target !== el) return;
      const r = el.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) {
        const target = closeConfirmFor; dismissCloseConfirm(); refocusPanel(target);
      }
    });
    // 초점은 틀 안에 머물게 한다 — Tab/Shift+Tab은 예·아니요 두 단추 안에서만 순환한다.
    el.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const list = [yes, no];
      const at = list.indexOf(document.activeElement);
      event.preventDefault();
      const next = event.shiftKey ? (at <= 0 ? list.length - 1 : at - 1) : (at < 0 || at === list.length - 1 ? 0 : at + 1);
      list[next].focus();
    });
    closeConfirmEl = el;
    return el;
  }
  function refocusPanel(d) {
    if (!d?.open) return;
    const back = d.querySelector('[data-close],input,select,textarea,button');
    (back || d).focus?.();
  }
  function askCloseConfirm(d) {
    const el = ensureCloseConfirm();
    closeConfirmFor = d;
    if (!el.open) { closeConfirmOpenedAt = Date.now(); try { el.showModal(); } catch { /* 이미 열림 */ } }
    el.querySelector('#lt-close-confirm-no')?.focus?.();
  }
  function panelConfirmClose(d) {
    if (panelBlockedMessage(d)) return false;
    if (!PANEL_DIRTY[d.id]?.()) return true;
    askCloseConfirm(d);
    return false;
  }
  // #380 4 2차: × 버튼도 바깥 클릭·Esc와 같은 규칙을 쓴다(막을 상태면 막고, 더러우면 한 번 묻고, 닫으면 초점 복귀).
  // #845 2단계: 뒤로가기도 같은 판정을 탄다 — 공통 판정을 함수로 뽑아 세 길이(×·Esc·뒤로가기) 하나로 간다.
  function requestPanelClose(id) { const d = $(id); if (!d) return false; if (id === CLOSE_CONFIRM_ID) return false; if (!panelConfirmClose(d)) return false; d.close(); return true; }
  // 닫은 뒤 초점이 갈 곳: 연 버튼 → data-lt-return 순서는 focusReturnTarget이 정한다.
  // 모바일에서는 연 버튼이 '더보기' 메뉴 안에 접혀 보이지 않으므로, 그때는 더보기 버튼으로 돌려준다(초점을 잃지 않게).
  function panelReturnFocus(opener, fallback) {
    const target = focusReturnTarget(opener, fallback);
    if (target?.getClientRects?.().length) return target;
    const more = document.getElementById('mobile-more');
    if (more?.getClientRects?.().length) return more;
    return target;
  }
  // #481 L14: 화면(iframe) 안의 버튼이 창을 열면 셸의 activeElement는 <iframe>이라, 닫을 때 초점이 프레임 테두리로만
  // 간다(누른 버튼으로 돌아가지 않음). 프레임이 연 경우에는 프레임에 알려, 그 안에서 마지막으로 누른 버튼으로 돌려준다.
  function focusIntoFrame(frame) {
    try {
      const win = frame?.contentWindow;
      const doc = frame?.contentDocument;
      if (!win || !doc) return false;
      const last = doc.activeElement;
      if (last && last !== doc.body && last.matches?.('button,a,[role="button"],input,select,textarea')) { last.focus?.(); return true; }
      const first = doc.querySelector?.('.top-actions button, main button, button');
      if (first) { first.focus?.(); return true; }
      win.focus?.();
      return true;
    } catch { return false; }
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
      // #481 L14: 연 곳이 화면(iframe)이면 그 안으로 초점을 돌려준다(셸 안 버튼으로 억지로 옮기지 않는다).
      const openedFromFrame = opener && typeof opener.contentWindow !== 'undefined' && opener.tagName === 'IFRAME';
      const target = panelReturnFocus(openedFromFrame ? null : opener, fallback);
      setTimeout(() => {
        if (openedFromFrame && focusIntoFrame(opener)) return;
        target?.focus?.();
      }, 0);
    });
    // Esc(cancel)·바깥 클릭의 '맨 위 창 하나'는 브라우저가 보장한다 — cancel은 top layer의 맨 위 모달에만,
    // backdrop 클릭도 맨 위 창만 받는다(2026-11-16 확인). 그래서 여기서는 추가 판정 없이 그대로 닫는다.
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

  // #845 2단계: 뒤로가기는 창을 닫는 일로 쓴다(261118 대표 결정 — 이슈 #845 규칙표). 모달 창이 하나라도
  // 열려 있으면 뒤로가기는 주소를 뒤로 가지 않고 맨 위 창을 닫는다 — ✕·Esc와 같은 판정(requestClose:
  // 막을 상태면 막고, 더러우면 '저장하지 않고 닫을까요?'를 한 번 묻는다)을 탄다. 창이 모두 닫히면 원래
  // 뒤로가기로 돌아간다.
  //
  // 이동을 막는 방법: 창을 열 때 주소가 그대로인 기록 한 칸을 쌓는다(pushState). 뒤로가기는 이 기록을
  // 판다 — 주소가 그대로므로 화면도 그대로이고, 여기서 맨 위 창을 닫는다. 창을 ✕·Esc·저장 등 다른 길로
  // 닫으면 이 기록이 한 칸 남아 다음 뒤로가기 한 번이 그것을 판다(화면 변화 없음). 창이 닫히는 순간
  // 되돌아가서 기록을 소비하는 방식은 쓰지 않는다 — 뒤로가기는 프레임 기록까지 함께 훑어 지도·책 같은
  // 안쪽 문서를 다시 띄운다(261118 지도 판 흐름 시험 — 설정 창을 닫았을 뿐인데 지도 프레임이 다시 떴다).
  // 초점 되돌리기는 창 'close'의 공통 규칙이 그대로 맡는다 — 뒤로가기로 닫아도 연 버튼으로 돌아간다.
  const view = document.defaultView;
  // #845 3단계: 창 위에 창을 여는 규칙(이슈 #845 규칙표). 새 창이 '잠깐 판'(옮길 트리 고르기·내 보관
  // 파일 고르기·둘러보기 미리보기 — 닫히면 앞 일에 돌아가는 창)이면 위에 겹침을 그대로 허용하고, 그 밖의
  // 큰 창이 열릴 때는 앞 창을 공통 판정(requestPanelClose — 더러우면 한 번 묻는다)으로 닫고 열린다.
  // 앞 창을 못 닫았으면(사용자가 취소) 그 위에 겹친다 — 예상 못한 길을 막지 않는다. 확인 질문(confirm)
  // 은 브라우저 판이라 여기서 다루지 않는다.
  // #876: 같은 영상 안내 창(video-dup-panel)도 잠깐 판이다 — 순간 추가 창 위에 겹쳐 열린다(창은 #876이 만든다).
  const STACK_ALLOWED = new Set(['move-picker', 'account-assets', 'community-preview', 'video-dup-panel', 'community-group-find', CLOSE_CONFIRM_ID]);
  // #933: 둘러보기 창은 자기 닫기 규칙(둘러보기 모듈)을 그대로 쓴다 — 이 틀이 대신 닫지 않는다.
  const PANEL_SKIP_AUTO_CLOSE = new Set(['community-panel', 'community-preview']);
  let dialogGuard = false;     // 창 기록을 쌓아 둔 상태
  function modalDialogs() { return [...document.querySelectorAll('dialog[open]')].filter(d => d.matches(':modal')); }
  // #933: 창은 한 장만 — 새 창을 열 때(모달·비모달 모두) 또는 화면을 옮길 때 지금 열려 있는 창을
  // 같은 판정(requestPanelClose: 막을 상태면 막고, 더러우면 한 번 묻는다)으로 닫는다.
  // 잠깐 판(STACK_ALLOWED — 앞 일로 돌아가는 창)은 #845 3단계 규칙대로 겹침을 그대로 둔다.
  function busyDialogs() {
    return [...document.querySelectorAll('dialog[open]')]
      .filter(d => !PANEL_SKIP_AUTO_CLOSE.has(d.id) && !STACK_ALLOWED.has(d.id));
  }
  function closeOpenPanels(exceptId = '') { for (const d of busyDialogs()) { if (d.id !== exceptId) requestPanelClose(d.id); } }
  if (view?.history && view.HTMLDialogElement) {
    const showModalOriginal = view.HTMLDialogElement.prototype.showModal;
    view.HTMLDialogElement.prototype.showModal = function (...args) {
      const front = modalDialogs()[modalDialogs().length - 1] || null;
      if (front && front !== this && !STACK_ALLOWED.has(this.id)) requestPanelClose(front.id);
      const result = showModalOriginal.apply(this, args);
      // #978: 확인 물음이 떠 있는 중에 다른 창이 열리면 물음을 맨 위로 다시 올린다 —
      // 물음이 새 창 뒤에 가려지면 답할 수 없게 된다(브라우저 confirm 은 항상 맨 위였다).
      if (closeConfirmEl?.open && this !== closeConfirmEl) { try { closeConfirmEl.close(); closeConfirmEl.showModal(); } catch { /* already top */ } }
      if (!dialogGuard && this.open && this.matches(':modal')) {
        view.history.pushState({ lt41Dialog: true }, '');
        dialogGuard = true;
      }
      return result;
    };
    // #933: 비모달로 여는 창(새 소식)은 앞 창(모달·비모달 모두)을 먼저 닫고 연다 — 창이 겹치지 않게.
    // 모달 쪽은 지금처럼 모달끼리만 판정한다(2026-11-16 결정: 비모달 창 위에 겹치는 길은 그대로 둔다).
    const showOriginal = view.HTMLDialogElement.prototype.show;
    view.HTMLDialogElement.prototype.show = function (...args) {
      const front = busyDialogs().filter(d => d !== this).pop() || null;
      if (front && !STACK_ALLOWED.has(this.id)) requestPanelClose(front.id);
      return showOriginal.apply(this, args);
    };
    view.addEventListener('popstate', () => {
      const top = ltPopstateTop;
      ltPopstateTop = null;
      // #978: 맨 위가 앱 안 닫기 확인 틀이면 뒤로가기 = 아니요 — 틀만 닫고 원래 창은 그대로 둔다.
      // 단, 이번 뒤로가기 처리 중에 뜬 물음(주소 처리가 먼저 창을 닫으려다 띄운 것)은 사용자가 아직
      // 답하지 않은 물음이다 — 아니요로 셈하지 않고 그대로 두고 기록만 다시 쌓는다.
      if (top && top.id === CLOSE_CONFIRM_ID) {
        if (Date.now() - closeConfirmOpenedAt < 400) {
          view.history.pushState({ lt41Dialog: true }, ''); dialogGuard = true;
          return;
        }
        const target = closeConfirmFor; dismissCloseConfirm(); refocusPanel(target);
        if (modalDialogs().length) { view.history.pushState({ lt41Dialog: true }, ''); dialogGuard = true; }
        else dialogGuard = false;
        return;
      }
      if (top) {
        const closed = requestPanelClose(top.id);
        // 닫기가 막혔거나(더러움 확인 취소) 창이 남았으면 기록을 다시 쌓는다 — 뒤로가기를 계속 '닫기'로 쓰게.
        if (!closed || modalDialogs().length) { view.history.pushState({ lt41Dialog: true }, ''); dialogGuard = true; }
        else dialogGuard = false;
      } else dialogGuard = false;
    });
  }

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
    // #845 2단계: 뒤로가기도 같은 판정(requestPanelClose)을 탄다 — 세 길이(×·Esc·뒤로가기)가 하나로 간다.
    requestClose: id => requestPanelClose(id),
    // #933: 화면을 옮길 때(서재·책·보드·지도·첫 여정) 열려 있던 창을 닫는다 — 창이 화면 위에 남지 않게.
    closePanels: id => closeOpenPanels(id),
    syncPanelTop
  };
}
