// 셸의 화면 전환과 iframe 두 장 교대 (#231 1-B ②).
// 2026-11-08 리팩터링: 동작·겉모습 변경 0. shell.mjs에 있던 show·showInFrame·frameLoaded·hideFrames를 그대로 옮겼다.
// 셸은 지금 화면(current)과 나머지 일(테마·주소·연결)을 넘겨 주고, 이 파일은 화면만 바꾼다.
import {screenUrl, screenTitle} from './navigation.mjs';

export function createScreens(deps) {
  const {
    $,
    screens,
    getCurrent,
    setCurrent,
    getSource,
    hasTree,
    isGuest = () => false,
    flowNavigation,
    paintEmptyForScreen,
    authPending = () => false,
    waitAuth,
    paintEmptyCopy,
    applyTheme,
    writeLocation,
    links,
    takeNetworkOpen,
    closePanels,
    syncTips,
    takeBoardOpen,
    onFrameReady,
    onFrameReveal
  } = deps;

  // 2026-11-08 #211 화면 전환 깜빡임: 새 화면은 보이지 않는 두 번째 iframe에서 먼저 다 그린다.
  // 준비(load + 글꼴 준비)가 끝나면 두 장의 앞뒤만 바꾼다. 이전 화면은 그 순간까지 그대로 보인다.
  let viewToken = 0;
  // #1231: 로그아웃 탭 클릭으로 연 개인 화면만 빈 상태로 유지한다.
  // 예시를 직접 가리키는 기존 주소(#book 등)의 읽기 경로는 별도로 보존한다.
  let guestTabSelected = false;
  // #996: 화면 교대 뒤 지연 비우기 타이머. 화면을 다시 바꾸면 앞 타이머를 취소하고,
  // 비우기 직전에 그 프레임이 다시 보이는 장이 되었는지 한 번 더 확인한다.
  let blankTimer = 0;

  // #428: 숨은 프레임은 초점을 받지 않게 둔다(inert + aria-hidden + tabindex=-1). 불러온 문서가
  // autofocus·focus()·접근성 트랩으로 초점을 청해도 크로미움이 그 자리로 가려고 .app(overflow:hidden)을
  // 몰래 굴리는 일이 없다. 보여 주는 순간(revealFrame)에만 푼다. #219의 두 장 교대와 #415의
  // about:blank 빈 화면 판정은 그대로다.
  function setFrameFocusGuard(frame, on) {
    if (!frame) return;
    try { frame.inert = on; } catch { /* 오래된 브라우저: 속성만으로 둔다 */ }
    if (on) {
      frame.setAttribute('inert', '');
      frame.setAttribute('aria-hidden', 'true');
      frame.setAttribute('tabindex', '-1');
    } else {
      frame.removeAttribute('inert');
      frame.removeAttribute('aria-hidden');
      frame.removeAttribute('tabindex');
    }
  }
  setFrameFocusGuard($('view-next'), true);

  function frames() {
    return [$('view'), $('view-next')].filter(Boolean);
  }

  function hideFrames() {
    for (const f of frames()) {
      f.hidden = true;
      setFrameFocusGuard(f, true);
      try { f.contentWindow.location.replace('about:blank'); } catch {}
    }
  }

  function revealFrame(next) {
    const active = $('view');
    if (!next || next === active) return;
    // #428: 보여 주는 순간에만 초점 이동을 허용한다 — 새 장은 풀고, 가려지는 장은 막는다.
    setFrameFocusGuard(next, false);
    next.hidden = false;
    active.hidden = true;
    next.id = 'view';
    active.id = 'view-next';
    next.style.zIndex = '2';
    active.style.zIndex = '1';
    setFrameFocusGuard(active, true);
    onFrameReveal?.();
    // #428: 보여 주는 순간에만 초점 이동을 허용한다 — 숨은 장에서 온 초점 청구가
    // reveal 직후에 자리 잡아 .app(overflow:hidden)을 밀 수 있다. 그 밀림은 보여 준
    // 딱 그 순간 한 번만 되돌린다(숨은 장의 스크롤 리스너 가드(#420) 대신, 뷰 코드는 건드리지 않는다).
    const unroll = () => {
      try {
        const app = next.contentDocument?.querySelector('.app');
        if (app && (app.scrollLeft || app.scrollTop)) app.scrollTo(0, 0);
      } catch {}
    };
    setTimeout(unroll, 0);
    setTimeout(unroll, 150);
  }

  function showInFrame(url, title) {
    const active = $('view'), next = $('view-next');
    // #1300: 공유 감상 진입은 안쪽 문서가 보이기 전까지 로딩 화면을 유지한다.
    // 조기 완료 표시가 뒤로 가기와 iframe 교체를 경합시키지 않게 한다.
    const shareLoading = getSource() === 'share';
    if (shareLoading) $('empty').hidden = false;
    const loadedInitial = frame => {
      if (!shareLoading) return;
      const finish = () => {
        if (getSource() !== 'share' || frame !== $('view')) return;
        try { if (frame.contentWindow.location.href !== url) { frame.addEventListener('load', finish, {once:true}); return; } } catch { return; }
        $('empty').hidden = true;
      };
      frame.addEventListener('load', finish, {once:true});
    };
    if (!next) {
      active.hidden = false;
      active.title = title;
      loadedInitial(active);
      active.contentWindow.location.replace(url);
      return;
    }
    // 아직 아무 화면도 없으면(첫 진입·기록 없음) 보이는 한 장에 바로 그린다.
    let blank = true;
    try { blank = active.contentWindow.location.href === 'about:blank'; } catch { blank = false; }
    if (blank) {
      if (next) next.hidden = true;
      active.hidden = false;
      // #428: 이 자리는 곧바로 보이는 장이므로 초점 가드를 푼다(이전 hideFrames에서 막혔을 수 있다).
      setFrameFocusGuard(active, false);
      active.title = title;
      loadedInitial(active);
      active.contentWindow.location.replace(url);
      return;
    }
    // #428: 뒤에서 불러오는 동안 이 장은 초점을 받지 않는다.
    setFrameFocusGuard(next, true);
    const token = ++viewToken;
    // #996: 앞 전환이 비우려던 프레임은 이제 새 불러오기의 대상이다 — 대기 중인 비우기를 취소한다.
    clearTimeout(blankTimer);
    let settled = false;
    const done = () => {
      if (settled || token !== viewToken) return;
      settled = true;
      next.hidden = false;
      next.title = title;
      revealFrame(next);
      if (shareLoading && getSource() === 'share') $('empty').hidden = true;
      applyTheme();
      if (!document.body.classList.contains('home-screen')) {
        next.classList.remove('lt-arrive');
        void next.offsetWidth;
        next.classList.add('lt-arrive');
      }
      links();
      blankTimer = setTimeout(() => {
        // #996: 아직 숨은 프레임만 비운다. 다시 보이는 장이 되었거나 새 전환이 지난 프레임은
        // 그대로 둔다 — 그렇지 않으면 보이는 화면이 비어 굳는다.
        if (token !== viewToken || active.hidden !== true || active === $('view')) return;
        try { active.contentWindow.location.replace('about:blank'); } catch {}
      }, 600);
    };
    const ready = () => {
      if (token !== viewToken) return;
      let doc = null;
      try { doc = next.contentDocument; } catch {}
      // #1365: 첫 화면처럼 내용을 가려진 문서(shadow root)에 그리는 경우도 내용으로 인정한다 —
      // 본문 글자만 보면 늘 비어 있어 900ms 한계까지 기다리게 된다.
      const shadowHasText = (d, sr) => {
        const walker = d.createTreeWalker(sr, 4 /* SHOW_TEXT */, {
          acceptNode(node) {
            const tag = node.parentElement?.tagName;
            if (tag === 'STYLE' || tag === 'SCRIPT') return 2 /* REJECT */;
            return node.nodeValue.trim() ? 1 /* ACCEPT */ : 2 /* REJECT */;
          },
        });
        return !!walker.nextNode();
      };
      const waitContent = deadline => {
        if (token !== viewToken) return;
        let filled = false;
        try {
          const d = next.contentDocument;
          if (d && d.body && d.body.children.length > 0) {
            filled = !!(d.body.innerText || '').trim();
            if (!filled) {
              for (const host of d.querySelectorAll('*')) {
                if (host.shadowRoot && shadowHasText(d, host.shadowRoot)) { filled = true; break; }
              }
            }
          }
        } catch {}
        if (filled || Date.now() > deadline) {
          requestAnimationFrame(() => requestAnimationFrame(done));
          return;
        }
        setTimeout(() => waitContent(deadline), 28);
      };
      if (doc && doc.fonts && doc.fonts.ready) {
        doc.fonts.ready.then(() => waitContent(Date.now() + 900)).catch(() => waitContent(Date.now() + 900));
      } else {
        waitContent(Date.now() + 900);
      }
      setTimeout(done, 1200); // 글꼴이 늦어도 화면은 넘어간다
    };
    next.addEventListener('load', ready, {once: true});
    next.contentWindow.location.replace(url);
    setTimeout(ready, 1500); // load를 놓쳐도 두 번은 넘어가지 않는다(settled)
  }

  // treeKey: 트리를 바꿀 때 프레임 주소를 달리해 반드시 새 문서로 띄운다(#26 — 같은 주소면 옛 트리 내용이 남았다).
  function show(file, write = true, treeKey = '', fromHeaderTab = false) {
    // show()는 화면 파일 이름을 받는다(화면 키가 아니다). 목록에서 그대로 찾는다.
    const screen = screens.find(s => s[1] === file);
    if (!screen) return;
    // #933: 화면을 옮기면 열려 있던 창은 닫는다 — 트리 관리·순간 추가·설정 창이 새 화면 위에 남지 않게.
    closePanels?.();
    if ($('community-panel')?.open) $('community-panel').close();
    setCurrent(file);
    // 탭에서 연 개인 화면만 빈 상태로 유지한다. 지도 상세 → 책 등 내부 이동은
    // 기존 예시 감상 경로를 그대로 쓰며, 인증·예시 데이터 지연으로도 탭 빈 상태를 덮지 않는다.
    if (!isGuest() || file === 'src064-orbit.html') guestTabSelected = false;
    else if (fromHeaderTab) guestTabSelected = true;
    flowNavigation();
    applyTheme();
    if ((!hasTree() || (isGuest() && guestTabSelected)) && file !== 'src064-orbit.html') {
      // 2026-11-23 대표 결정: 로그아웃 탭 클릭은 예시 트리가 있어도 빈 상태로 연다.
      // 트리 0개 계정도 해당 화면의 빈 상태를 유지하고 첫 화면으로 돌리지 않는다.
      document.body.classList.remove('home-screen');
      hideFrames();
      document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-current', String(b.dataset.view === file || (file === 'track60-graph.html' && b.dataset.view === 'track56-network.html'))));
      // #1487 후속(CTO 결정): 로그인 확인 중에 탭으로 연 안쪽 화면도 주소로 들어올 때처럼 '불러오는 중'을 보인다.
      // 로그인 안내 같은 빈 상태는 확인이 끝난 뒤 셸이 그린다(workspace-runtime의 확인 대기).
      if (authPending()) {
        waitAuth?.();
        if (write) writeLocation();
        links();
        syncTips?.();
        return;
      }
      paintEmptyForScreen?.(file);
      $('empty').hidden = false;
      if (write) writeLocation();
      links();
      syncTips?.();
      return;
    }
    if (file === 'src064-orbit.html' && !hasTree()) paintEmptyCopy?.();
    document.body.classList.toggle('home-screen', file === 'src064-orbit.html');
    // 2026-11-16 대표 결정: 그래프 보기(#627 3단계, track60-graph.html)는 지도 안의 보기 하나다 —
    // 위쪽 메뉴(책·보드·지도)에서는 지도가 켜진 상태로 보인다. 메뉴 단추는 따로 만들지 않는다(navigation.mjs 그대로).
    const viewFamily = (b) => b.dataset.view === file || (file === 'track60-graph.html' && b.dataset.view === 'track56-network.html');
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-current', String(viewFamily(b))));
    $('empty').hidden = true;
    // #583 '이 순간 열기': 지도를 특정 순간을 가운데 두고 열 요청이 있으면 프레임 주소에 ?open=<순간>을 붙인다.
    // 요청은 한 번 쓰면 지운다(다른 화면을 먼저 보여 줬으면 끝난 요청이다).
    const openMoment = takeNetworkOpen?.() ?? null;
    const openBoardMoment = takeBoardOpen?.() ?? null;
    const url = new URL(screenUrl(file, getSource(), location.origin));
    if (treeKey) url.searchParams.set('tree', treeKey);
    if (file === 'track56-network.html' && openMoment) url.searchParams.set('open', openMoment);
    // #891: 보드는 주소가 특정 순간을 가리켰을 때만 ?open=을 붙인다 — 판 자동 열림의 한 벌 판정.
    if (file === 'track58-pinboard.html' && openBoardMoment) url.searchParams.set('open', openBoardMoment);
    // #1525: 보드의 ?open= 방식으로 트리 상세 열림을 새 프레임에 전달한다.
    if (file === 'track61-tree.html' && globalThis.history?.state?.lt41TreeDetail && window.LT41?.momentId) url.searchParams.set('open', window.LT41.momentId);
    showInFrame(url.href, '러브트리 · ' + screenTitle(file));
    if (write) writeLocation();
    links();
    // 이슈 933: 화면을 옮긴 뒤 첫 트리 안내 판을 다시 맞춘다(첫 여정에서는 띄우지 않는다).
    syncTips?.();
  }

  // 화면 한 장이 준비될 때마다: 테마·연결 도구·접근성·클릭 위임을 그 화면에 붙인다.
  // 도착 표시는 지금 보이는 화면(#view)에만 준다(뒤에서 준비 중인 화면에는 주지 않는다).
  function frameLoaded(frame) {
    applyTheme();
    const v = frame;
    if (!document.body.classList.contains('home-screen') && frame.id === 'view') {
      v.classList.remove('lt-arrive');
      void v.offsetWidth;
      v.classList.add('lt-arrive');
    }
    onFrameReady(frame);
  }

  return {frames, hideFrames, revealFrame, showInFrame, show, frameLoaded, viewScreens: screens, currentFile: getCurrent};
}
