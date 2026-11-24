// #1092 — 둘러보기를 겹쳐 뜨는 창이 아니라 서재·책·보드·지도와 같은 화면으로 연다(셸 몫).
// 창 모듈(community-panel.mjs)은 showModal()로 창을 열지만, 이 파일이 그 호출을 받아 비모달 화면 열기로 바꾼다.
// 비모달이므로 뒤 덮개가 없어 상단 메뉴가 흐려지지 않고, ×·바깥 누름·Esc 닫기도 없다(창 모듈의 [data-close] 단추는 shell.css가 숨긴다).
// 주소는 창 모듈이 [트리]·[순간] 탭에서 이미 쓰는 #explore·#explore/moments(#1025)를 그대로 쓰고,
// 탭·메뉴로 열 때는 다른 화면과 같은 방식으로 #explore 기록을 새로 쌓는다 — 뒤로 가기가 이전 화면으로 돌아오게.
// 닫기는 브라우저 close 이벤트를 쓰지 않는다 — 그 이벤트는 비동기로 늦게 붚아(실측) 화면을 옮긴 뒤에야
// 창 모듈의 규칙(주소를 '#home'으로 덮기·탭 되살리기·초점 옮기기)이 화면 위에 떨어지기 때문이다.
// 대신 open 속성으로 조용히 닫고, 창 모듈의 close 규칙을 지금 곧바로 돌려(preview 정리·순간 보기 끄기·초점 복귀)
// 주소만 '#home'으로 덮지 않게 되돌린다. 창 모듈은 한 글자도 바꾸지 않는다.
export function createCommunityScreen(deps) {
  const $ = deps.$;
  const setHandled = deps.setHandled;
  const dialog = $('community-panel');
  const button = $('community-menu');
  if (!dialog || !button) return {isOpen: () => false, openRoute: () => {}, close: () => {}};
  // 화면 상태 — iframe·빈 화면은 화면 뒤에 남지 않게 숨긴다(shell.css의 body.community-screen 규칙).
  const paintPage = on => document.body.classList.toggle('community-screen', on);
  const viewTabs = () => document.querySelectorAll('nav [data-view]');
  const exploreHash = () => (/^#explore\/moments$/.test(location.hash) || /^#explore$/.test(location.hash) ? location.hash : '');

  // 접기 메뉴와 첫 화면에서도 같은 단추로 들어온다. 목록을 받는 동안에는 갈 곳을 주소에 남긴다.
  button.onclick = () => {
    deps.stageLoading?.start('explore');
    if (!exploreHash()) location.hash = '#explore';
  };

  // 창 모듈이 부르는 showModal을 비모달 화면 열기로 바꾼다 — 열기 규칙(탭·메뉴·주소)은 창 모듈의 openPanel 한 벌을 그대로 탄다.
  dialog.showModal = function openAsScreen() {
    if (dialog.open) return;
    deps.stageLoading?.start('explore'); // #1026: 카드가 늦으면 불러오는 중을 먼저 띄운다
    dialog.show();               // 비모달 — 뒤 덮개가 없어 상단 메뉴가 그대로 보인다
    paintPage(true);
    deps.flowNavigation?.();     // #1094: 서재 전용 보기 방식 토글을 둘러보기 화면에서 접는다
    // 주소도 다른 화면과 같은 방식 — 탭·메뉴로 열 때는 #explore 기록을 새로 쌓는다.
    // 주소(#explore·#explore/moments)로 열렸다면 이미 주소가 있으니 덮지 않는다.
    if (!exploreHash()) { history.pushState(null, '', '#explore'); setHandled?.('#explore'); }
    try { dialog.focus(); } catch { /* 초점은 그대로 둔다 */ }
  };

  // 모든 닫기 길(화면 이동·로고·공유 판·요청 닫기)이 dialog.close()로 모인다.
  dialog.close = function closeAsScreen() {
    if (!dialog.open) return;
    const was = location.hash;
    const hadFocus = document.activeElement;
    dialog.open = false;         // close 이벤트 없이 닫는다 — 늦게 붚는 규칙이 화면을 덮지 않게
    // 창 모듈의 close 규칙을 지금 곧바로 붙린다: 미리 보기 정리·[순간] 보기 끄기·'둘러보기' 탭 표시 내리기·초점 복귀.
    // 탭 되살리기(wasCurrent)는 미리 지운다 — 화면 이동 뒤에는 새 화면의 탭 표시(show)가 정답이므로.
    for (const t of viewTabs()) delete t.dataset.wasCurrent;
    dialog.dispatchEvent(new Event('close'));
    // 규칙이 '#explore' 주소를 '#home'으로 덮으면 되돌린다 — 뒤로 가기가 둘러보기로 돌아오려면 #explore 기록이
    // 살아 있어야 하고, 다른 주소(#my/…·#share/…)로 가는 중에는 그 주소를 덮지 않아야 하기 때문이다.
    if (location.hash === '#home' && was !== '#home') history.replaceState(null, '', was);
    paintPage(false);
    deps.stageLoading?.cancel(); // #1026: 둘러보기를 닫으면 불러오는 중 표시도 거둔다
    deps.flowNavigation?.();     // 둘러보기를 닫으면 서재·책에서 토글이 돌아온다
  };

  // 주소(뒤로·앞으로 가기, 직접 들어온 주소)로 열기 — '둘러보기' 탭을 누른 것과 같은 규칙.
  function openRoute() {
    if (!dialog.open) { button.click(); return; }
    // 이미 열려 있으면 안내 탭을 주소와 맞춘다 — [순간](#explore/moments) 방향은 창 모듈의 hashchange 규칙이 맡는다.
    // 뒤로 가기로 [순간] → [트리]를 복원할 때 새 방문 기록을 만들지 않는다.
    // 실제 탭 표시는 community-panel의 hashchange 처리에서 조용히 동기화한다.
  }
  return {isOpen: () => !!dialog.open, openRoute, close: () => dialog.close()};
}
