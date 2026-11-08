// 셸의 화면 전환과 iframe 두 장 교대 (#231 1-B ②).
// 2026-11-08 리팩터링: 동작·겉모습 변경 0. shell.mjs에 있던 show·showInFrame·frameLoaded·hideFrames를 그대로 옮겼다.
// 셸은 지금 화면(current)과 나머지 일(테마·주소·연결)을 넘겨 주고, 이 파일은 화면만 바꾼다.
import {screenForView, screenUrl, screenTitle} from './navigation.mjs';

export function createScreens(deps) {
  const {
    $,
    screens,
    getCurrent,
    setCurrent,
    getSource,
    hasTree,
    flowNavigation,
    applyTheme,
    writeLocation,
    links,
    onFrameReady
  } = deps;

  // 2026-11-08 #211 화면 전환 깜빡임: 새 화면은 보이지 않는 두 번째 iframe에서 먼저 다 그린다.
  // 준비(load + 글꼴 준비)가 끝나면 두 장의 앞뒤만 바꾼다. 이전 화면은 그 순간까지 그대로 보인다.
  let viewToken = 0;

  function frames() {
    return [$('view'), $('view-next')].filter(Boolean);
  }

  function hideFrames() {
    for (const f of frames()) {
      f.hidden = true;
      try { f.contentWindow.location.replace('about:blank'); } catch {}
    }
  }

  function revealFrame(next) {
    const active = $('view');
    if (!next || next === active) return;
    next.hidden = false;
    active.hidden = true;
    next.id = 'view';
    active.id = 'view-next';
    next.style.zIndex = '2';
    active.style.zIndex = '1';
  }

  function showInFrame(url, title) {
    const active = $('view'), next = $('view-next');
    if (!next) {
      active.hidden = false;
      active.title = title;
      active.contentWindow.location.replace(url);
      return;
    }
    // 아직 아무 화면도 없으면(첫 진입·기록 없음) 보이는 한 장에 바로 그린다.
    let blank = true;
    try { blank = active.contentWindow.location.href === 'about:blank'; } catch { blank = false; }
    if (blank) {
      if (next) next.hidden = true;
      active.hidden = false;
      active.title = title;
      active.contentWindow.location.replace(url);
      return;
    }
    const token = ++viewToken;
    let settled = false;
    const done = () => {
      if (settled || token !== viewToken) return;
      settled = true;
      next.hidden = false;
      next.title = title;
      revealFrame(next);
      applyTheme();
      if (!document.body.classList.contains('home-screen')) {
        next.classList.remove('lt-arrive');
        void next.offsetWidth;
        next.classList.add('lt-arrive');
      }
      links();
      setTimeout(() => { try { active.contentWindow.location.replace('about:blank'); } catch {} }, 600);
    };
    const ready = () => {
      if (token !== viewToken) return;
      let doc = null;
      try { doc = next.contentDocument; } catch {}
      // 글꼴이 준비되고, 새 화면에 실제 내용이 그려진 뒤에 넘긴다(빈 화면을 보여 주지 않는다).
      const waitContent = deadline => {
        if (token !== viewToken) return;
        let filled = false;
        try {
          const d = next.contentDocument;
          filled = !!(d && d.body && d.body.children.length > 0 && (d.body.innerText || '').trim().length > 0);
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

  function show(file, write = true) {
    const screen = screenForView(file);
    if (!screen || screen[1] !== file) return;
    if ($('community-panel')?.open) $('community-panel').close();
    setCurrent(file);
    flowNavigation();
    applyTheme();
    if (!hasTree() && file !== 'src064-orbit.html') {
      document.body.classList.remove('home-screen');
      hideFrames();
      $('empty').hidden = false;
      if (write) writeLocation();
      links();
      return;
    }
    document.body.classList.toggle('home-screen', file === 'src064-orbit.html');
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-current', String(b.dataset.view === file)));
    $('empty').hidden = true;
    showInFrame(screenUrl(file, getSource(), location.origin), '러브트리 · ' + screenTitle(file));
    if (write) writeLocation();
    links();
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
