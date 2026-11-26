import { MSG } from './frame-messages.mjs';
import { thumbnailCandidates } from './thumb-fallback.mjs';
import { coverModeOf, normalizeCoverDesign } from './domain.mjs';
// #1091: 상단 메뉴 아래 화면 도구 줄 한 벌. 책·보드가 각자 그리던 줄 대신 이 부품을 호출한다.
// 서재는 #1154가 상단을 바꾸는 중이라 아직 붙이지 않는다.
// 책·보드·지도 같은 트리 줄 — 왼쪽에 '← 서재'·트리 이름(크게)·작은 메타(순간 N개 · 마지막 M.D),
// 오른쪽에 화면 도구, 맨 오른쪽에 공통 '▶ 이어 보기' 하나. 공용 코드는 이 벌 하나다.
function treeMetaText() {
  try {
    const moments = window.LTDEMO?.moments || window.parent?.LT41?.tree?.moments || [];
    const list = Array.isArray(moments) ? moments : [];
    const dates = list.map(m => String(m?.date || '')).filter(Boolean).sort();
    const last = dates.length ? dates[dates.length - 1] : '';
    if (!list.length) return '순간 0개';
    if (last) {
      const parts = last.split('-');
      const md = parts.length === 3 ? Number(parts[1]) + '.' + Number(parts[2]) : last;
      return '순간 ' + list.length + '개 · 마지막 ' + md;
    }
    return '순간 ' + list.length + '개';
  } catch { return ''; }
}
// #1367 PR 2: A common, non-navigating tree selector; the shell hookup belongs to PR 3.
function prepareTreeChoice(bar, screen, title, titleFrom) {
  const left = bar.querySelector('.lt-toolbar-left');
  if (!left) return () => {};
  const source = () => { try { return window.parent.LT41; } catch { return null; } };
  const context = source();
  const own = context?.source === 'server' && context?.writable === true && !!context?.tree && !context?.tree?.demoData;
  const choice = document.createElement(own ? 'button' : 'span');
  choice.className = 'lt-toolbar-tree-choice' + (own ? '' : ' lt-toolbar-tree-label');
  if (own) {
    choice.type = 'button';
    choice.setAttribute('aria-label', '\uD2B8\uB9AC \uACE0\uB974\uAE30');
    choice.title = '\uD2B8\uB9AC \uACE0\uB974\uAE30';
    choice.setAttribute('aria-haspopup', 'dialog');
    choice.setAttribute('aria-expanded', 'false');
    choice.setAttribute('aria-pressed', 'true');
    choice.addEventListener('click', event => {
      event.stopPropagation();
      const box = choice.getBoundingClientRect();
      window.parent.postMessage({type:MSG.toolbarTreePicker, rect:{left:box.left,top:box.top,right:box.right,bottom:box.bottom}, via:event.detail===0?'keyboard':'mouse'}, location.origin);
    });
    window.addEventListener('message', event => {
      if(event.source!==window.parent || event.origin!==location.origin || event.data?.type!==MSG.toolbarTreePickerState)return;
      choice.setAttribute('aria-expanded',String(!!event.data.open));
      if(event.data.focus) choice.focus();
    });
  }
  const thumb = document.createElement('span');
  thumb.className = 'lt-toolbar-tree-thumb';
  thumb.setAttribute('aria-hidden', 'true');
  const name = document.createElement('span');
  name.className = 'lt-toolbar-tree-name';
  if (own) {
    const caret = document.createElement('span');
    caret.className = 'lt-toolbar-tree-caret';
    caret.setAttribute('aria-hidden', 'true');
    caret.textContent = '\u25BE';
    choice.append(thumb, name, caret);
  } else choice.append(name);
  left.prepend(choice);
  // #1448: ????? ??? ??? ?? ??? ????? ?? ??? ??.
  title.hidden = true;
  const refresh = () => {
    const current = source()?.tree;
    const value = String(current?.title || current?.subject || titleFrom?.textContent || '\uD2B8\uB9AC').trim() || '\uD2B8\uB9AC';
    name.textContent = value;
    if (!own) return;
    const initial = Array.from(value)[0] || '\uD2B8';
    thumb.replaceChildren(document.createTextNode(initial));
    const mode = coverModeOf(current);
    const design = mode === 'design' ? normalizeCoverDesign(current?.coverDesign) : '';
    if (design) thumb.dataset.coverDesign = design;
    else delete thumb.dataset.coverDesign;
    // ??? ?? ??: ??? ??? ??, ?? ??? ?? ??? ??.
    const moments = Array.isArray(current?.moments) ? [...current.moments].sort((a, b) =>
      String(a.createdAt || '').localeCompare(String(b.createdAt || ''))) : [];
    const selected = mode === 'moment' ? moments.find(m => m.id === current?.coverMomentId) : null;
    const cover = selected || moments[0];
    const url = !design && cover ? thumbnailCandidates(cover, {autoLoad:true})[0] || '' : '';
    if (typeof url === 'string' && /^https?:\/\//.test(url)) {
      const image = document.createElement('img');
      image.alt = '';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('load', () => { if (source()?.tree?.id === current?.id) thumb.replaceChildren(image); }, {once:true});
      image.src = url;
    }
  };
  refresh();
  return refresh;
}
export function mountScreenToolbar({ screen, titleFrom, tools = [], initialBar = null, backEl = null, meta = false }) {
  // Adopt a pre-rendered toolbar when supplied, so the first paint already has its final layout.
  const bar = initialBar || document.createElement('div');
  bar.className = 'lt-screen-toolbar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', '화면 도구');
  bar.dataset.screen = screen;
  const title = bar.querySelector('.lt-toolbar-title') || document.createElement('span');
  title.className = 'lt-toolbar-title';
  const group = bar.querySelector('.lt-toolbar-tools') || document.createElement('div');
  group.className = 'lt-toolbar-tools';
  const more = bar.querySelector('.lt-toolbar-more') || document.createElement('button');
  more.className = 'lt-toolbar-more';
  more.type = 'button';
  more.textContent = '…';
  more.hidden = true;
  const menu = bar.querySelector('.lt-toolbar-menu') || document.createElement('div');
  menu.className = 'lt-toolbar-menu';
  menu.hidden = true;
  if (!initialBar) {
    const left = document.createElement('div');
    left.className = 'lt-toolbar-left';
    if (backEl) left.append(backEl);
    left.append(title);
    if (meta) {
      const metaEl = document.createElement('span');
      metaEl.className = 'lt-toolbar-meta';
      left.append(metaEl);
    }
    bar.append(left, group, more, menu);
  }
  const header = document.querySelector('header');
  // 도구 줄과 본문은 같은 위치 기준을 쓰고, 서로의 자식이 되지 않는다.
  if (!initialBar) {
    if (header) header.after(bar);
    else document.body.prepend(bar);
  }

  // 상단 메뉴의 실제 높이를 기준으로 하고 도구 줄 높이는 CSS 변수 하나를 쓴다.
  const align = () => {
    if (!header) return;
    const headerPad = Number.parseFloat(getComputedStyle(header).paddingLeft) || 0;
    const fallbackPad = matchMedia('(max-width:600px)').matches ? 10 : 24;
    bar.style.setProperty('--lt-toolbar-pad', `${headerPad || fallbackPad}px`);
    const root = document.documentElement;
    // #886: the board's fixed header and first-paint positions are set in board.css.
    // Only its wrapping narrow header needs measurement; never overwrite desktop geometry.
    if (screen === 'board') {
      if (!matchMedia('(max-width:580px)').matches) {
        root.style.removeProperty('--lt-toolbar-top');
        return;
      }
      if (header.offsetHeight > 0) root.style.setProperty('--lt-toolbar-top', `${header.offsetHeight + 4}px`);
      return;
    }
    const bottom = Math.round(header.getBoundingClientRect().bottom) + 4;
    root.style.setProperty('--lt-toolbar-top', `${bottom}px`);
  };
  align();

  const refreshTreeChoice = prepareTreeChoice(bar, screen, title, titleFrom);
  let reflow = () => {};
  const sync = () => {
    title.textContent = (titleFrom?.textContent || '').trim();
    refreshTreeChoice();
    const metaEl = bar.querySelector('.lt-toolbar-meta');
    if (metaEl && meta) metaEl.textContent = treeMetaText();
    if (typeof reflow === 'function') reflow();
  };
  sync();
  if (titleFrom && typeof MutationObserver === 'function') {
    new MutationObserver(sync).observe(titleFrom, { childList: true, characterData: true, subtree: true });
  }

  // 휴대폰 책의 재생 단추는 아래 이동 줄에 둔다. 모듈 실행 순서와 무관하게 유지한다.
  const bookPlay = screen === 'book' ? tools.find(el => el?.id === 'playAllBtn') : null;
  const keepBookPhonePlay = () => {
    const nav = document.querySelector('.nav-pill');
    if (bookPlay && nav && matchMedia('(max-width:599px)').matches) {
      bookPlay.classList.add('playback-launch');
      if (bookPlay.parentElement !== nav) nav.append(bookPlay);
    }
  };
  const shelfSearch = screen === 'shelf' ? tools.find(el => el?.matches('.search')) : null;
  const shelfSearchHome = shelfSearch?.parentElement;
  const placeShelfSearch = () => {
    if (!shelfSearch || !shelfSearchHome) return;
    const narrow = matchMedia('(max-width:600px)').matches;
    const target = narrow ? shelfSearchHome : group;
    if (shelfSearch.parentElement === target) return;
    if (narrow) target.prepend(shelfSearch);
    else target.insertBefore(shelfSearch, target.querySelector('#shelfNewTree'));
  };
  for (const tool of tools) if (tool && tool.parentElement !== group) group.append(tool);
  keepBookPhonePlay();
  placeShelfSearch();

  const boardMode = screen === 'board' ? bar.querySelector('.boardModeSwitch') : null;
  const placeBoardReset = () => {
    const reset = document.getElementById('boardResetOrderBtn');
    if (!boardMode || !reset) return;
    const narrow = matchMedia('(max-width:760px)').matches;
    if (narrow && reset.parentElement !== group) group.insertBefore(reset, boardMode.nextSibling);
    else if (!narrow && reset.parentElement !== boardMode) boardMode.append(reset);
  };
  let stashed = [];
  const isPlay = (el) => /^(playAllBtn|cinemaBtn|mapPlayBtn)$/.test(el.id || '');
  // 오른쪽 정렬(group justify-content:flex-end)에서는 넘치는 칸이 왼쪽 밖으로 나가 scrollWidth에 잡히지 않는다.
  // 보이는 단추 폭의 합으로 직접 재어 넘침을 판정한다(기준을 낮추지 않는다).
  const fits = () => {
    const items = [...group.children].filter((el) => !el.hidden && el.getClientRects().length > 0);
    const style = getComputedStyle(group);
    const gap = Number.parseFloat(style.columnGap || style.gap) || 0;
    const used = items.reduce((sum, el) => {
      const rect = el.getBoundingClientRect();
      const itemStyle = getComputedStyle(el);
      const border = (Number.parseFloat(itemStyle.borderLeftWidth) || 0) + (Number.parseFloat(itemStyle.borderRightWidth) || 0);
      const contentWidth = el.scrollWidth + border;
      return sum + Math.max(rect.width, contentWidth);
    }, 0) + gap * Math.max(0, items.length - 1);
    return used <= group.clientWidth + 1;
  };
  reflow = () => {
    align();
    for (const el of stashed) if (el.parentElement === menu) group.append(el);
    keepBookPhonePlay();
    placeShelfSearch();
    placeBoardReset();
    stashed = [];
    menu.replaceChildren();
    menu.hidden = true;
    more.hidden = true;
    if (screen === 'tree' || fits()) return;
    const items = [...group.children];
    const order = new Map(items.map((el, i) => [el, i]));
    const plays = items.filter((el) => isPlay(el));
    // More button consumes row width. Show it before measuring stashed controls so
    // the remaining buttons are fitted against the width users actually see.
    more.hidden = false;
    // 보기 전환·검색·새 트리는 먼저 지킨다 — 줄여도 되는 화면 도구부터 접는다.
    const essential = (el) => el.matches('.view-toggle, .shelf-view-inline, .boardModeSwitch, .view-switch, .search, #shelfNewTree');
    const stash = (list) => {
      for (let i = list.length - 1; i >= 0 && !fits(); i -= 1) {
        const el = list[i];
        menu.prepend(el);
        stashed.unshift(el);
      }
    };
    stash(items.filter((el) => !isPlay(el) && !essential(el)));
    if (!fits()) stash(items.filter((el) => !isPlay(el) && essential(el)));
    for (let i = plays.length - 1; i >= 0 && !fits(); i -= 1) {
      const el = plays[i];
      menu.prepend(el);
      // 이어 보기는 맨 오른쪽으로 돌아와야 한다 — 앞에 넣으면 되돌릴 때 제일 왼쪽으로 간다.
      stashed.push(el);
    }
    // 되돌릴 때 원래 순서를 지킨다.
    stashed.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    more.hidden = stashed.length === 0;
  };
  more.addEventListener('click', () => { menu.hidden = !menu.hidden; });
  if (boardMode && typeof MutationObserver === 'function') {
    new MutationObserver(reflow).observe(boardMode, {childList: true});
  }
  if (bookPlay && typeof MutationObserver === 'function') {
    new MutationObserver(reflow).observe(document.documentElement, {attributes: true, attributeFilter: ['data-book-shape']});
  }
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(reflow);
    observer.observe(bar);
    if (screen === 'board' && header) observer.observe(header);
  } else window.addEventListener('resize', reflow);
  reflow();

  return { bar, title, group, more, menu };
}
