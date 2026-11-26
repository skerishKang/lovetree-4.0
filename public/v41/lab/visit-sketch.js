// #1444 방문하기 1단계 화면안 — 앱 셸·서버와 연결하지 않는 정적 시안(가짜 기록만).
// 주소의 state·theme·owner 값으로 한 장면을 그린다. 실제 구현은 설계 메모(docs/design/visit-1444/README.md)를 따른다.
(() => {
  const q = new URLSearchParams(location.search);
  const STATES = ['entry', 'tree', 'book', 'shelf', 'guest', 'exit', 'keep'];
  const state = STATES.includes(q.get('state')) ? q.get('state') : 'entry';
  const theme = q.get('theme') === 'garden' ? 'garden' : 'night';
  const owner = q.get('owner') === 'nick' ? 'nick' : 'anon';
  const root = document.documentElement;
  root.dataset.sketchState = state;
  if (theme === 'garden') root.setAttribute('data-lt-theme', 'garden');
  const img = n => '/v41/example-media/ex' + String(n).padStart(2, '0') + '.webp';

  // ---- 가짜 기록 -------------------------------------------------------------
  const TREE = { title: '여름 콘서트 무대 모음', subject: 'RIIZE', count: 24, branches: 3, updated: '2026. 11. 24', short: '11. 24' };
  const OWNER = owner === 'nick'
    ? { who: '별빛수집가 님의 러브트리', tag: '공개 별명' }
    : { who: '한 팬의 러브트리', tag: '' };
  // 600×760 상자 안 좌표(아래가 뿌리). kind: photo·text·root·bundle
  const NODES = [
    { id: 'r', x: 300, y: 682, kind: 'root', img: 15, title: '데뷔 쇼케이스' },
    { id: 'n1', x: 300, y: 596, img: 3, title: '음악방송 첫 1위' },
    { id: 'n2', x: 300, y: 512, kind: 'text', title: '팬미팅 앞줄' },
    { id: 'a1', x: 196, y: 440, img: 8, title: '여름 페스티벌' },
    { id: 'a2', x: 168, y: 358, img: 21, title: '오프닝 무대' },
    { id: 'a3', x: 160, y: 276, kind: 'text', title: '앵콜 떼창' },
    { id: 'n3', x: 300, y: 428, img: 11, title: '첫 단독 콘서트' },
    { id: 'n4', x: 304, y: 344, img: 27, title: '여름 노래 무대' },
    { id: 'b1', x: 414, y: 286, img: 5, title: '비 오는 날 라이브' },
    { id: 'b2', x: 462, y: 208, img: 17, title: '같은 노래 다른 무대' },
    { id: 'bundle', x: 520, y: 152, kind: 'bundle', title: '+5개' },
    { id: 'n5', x: 300, y: 258, img: 30, title: '팬송 무대' },
    { id: 'n6', x: 294, y: 174, kind: 'text', title: '마지막 인사' },
    { id: 'n7', x: 300, y: 92, img: 12, title: '다음 여름 약속' }
  ];
  const EDGES = [
    ['r', 'n1', 15], ['n1', 'n2', 13], ['n2', 'n3', 12], ['n3', 'n4', 11], ['n4', 'n5', 9], ['n5', 'n6', 8], ['n6', 'n7', 6],
    ['n2', 'a1', 8], ['a1', 'a2', 6], ['a2', 'a3', 5],
    ['n4', 'b1', 8], ['b1', 'b2', 6], ['b2', 'bundle', 4]
  ];
  const LIT = ['r', 'n1', 'n2', 'n3', 'n4', 'b1'];
  const PICK = 'b1';
  const MOMENT = {
    index: 6, title: '비 오는 날 라이브', date: '2026. 08. 14', emotion: '벅참', img: 5,
    memo: '우산을 접고 끝까지 따라 불렀던 날. 이 무대 다음부터 한동안 여름 노래만 들었다.',
    why: '같은 노래를 다른 무대에서 다시 보고 싶어서', hearts: 5, comments: 2
  };
  const COMMENTS = [
    { who: '팬', when: '11. 20', body: '같은 날 거기 있었어요! 비 맞으면서도 좋았죠.' },
    { who: '팬', when: '11. 21', body: '이 장면 각도가 제일 좋아요.' }
  ];
  const SHELF = [
    { title: '처음 입덕한 날들', subject: 'RIIZE', count: 12, updated: '11. 02', open: '책으로 열려요', tone: 2 },
    { title: TREE.title, subject: TREE.subject, count: TREE.count, updated: TREE.short, open: '트리로 열려요', tone: 1, current: true },
    { title: '직캠으로 남긴 장면', subject: 'Hearts2Hearts', count: 8, updated: '10. 18', open: '보드로 열려요', tone: 3 }
  ];
  const MY_TREES = [
    { title: '리즈 여름 기록', count: 31, already: true },
    { title: '모아둔 순간', count: 9, checked: true },
    { title: '무대 직캠 모음', count: 14, checked: true }
  ];
  const EXPLORE = [
    { title: '첫 콘서트의 기억', sub: 'Hearts2Hearts', img: 9, moment: '처음 들은 라이브', meta: '설렘 · 2026. 11. 22 · 공감 12' },
    { title: TREE.title, sub: TREE.subject, img: 15, moment: '데뷔 쇼케이스', meta: '벅참 · 2026. 11. 24 · 공감 12', visited: true },
    { title: '처음 입덕한 날들', sub: 'RIIZE', img: 3, moment: '처음 본 직캠', meta: '설렘 · 2026. 11. 02 · 공감 4' },
    { title: '겨울 노래 모음', sub: 'RIIZE', img: 24, moment: '눈 오는 날 무대', meta: '그리움 · 2026. 10. 30 · 공감' }
  ];

  // ---- 그림 조각 ---------------------------------------------------------------
  const ICON = {
    compass: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.2 5 13.2a4.6 4.6 0 1 1 6.5-6.5l.5.5.5-.5a4.6 4.6 0 1 1 6.5 6.5L12 20.2Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    heartOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.2 5 13.2a4.6 4.6 0 1 1 6.5-6.5l.5.5.5-.5a4.6 4.6 0 1 1 6.5 6.5L12 20.2Z" fill="currentColor" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    comment: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5h14v9H10l-4 3.2V15.5H5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    keep: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5h10v15l-5-3.4-5 3.4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 8v5M9.5 10.5h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4.5M8 8.2l4-3.7 4 3.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 12.5v6h12v-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="18" cy="12" r="1.6" fill="currentColor"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 6.5 11 11M17.5 6.5l-11 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    caret: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    exit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5.5H6.5v13H14M10.5 12H20m-3.2-3.4L20 12l-3.2 3.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 4.5a7.6 7.6 0 1 0 4 12.4 6.4 6.4 0 0 1-4-12.4Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7.5h14M5 12h14M5 16.5h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="5.8" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m15.4 15.4 4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 4 4 8-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5 9 12l5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6.5 15 12l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  const icon = (name, cls = '') => '<span class="vs-ico ' + cls + '">' + ICON[name] + '</span>';
  const visiting = state !== 'exit';
  const guest = state === 'guest';
  const view = { entry: 'tree', tree: 'tree', keep: 'tree', guest: 'tree', book: 'book', shelf: 'shelf', exit: 'explore' }[state];

  function header() {
    const tabs = [['shelf', '서재'], ['tree', '트리'], ['board', '보드'], ['book', '책'], ['network', '지도']];
    const nav = '<nav class="vs-nav" aria-label="화면">'
      + '<button type="button" class="vs-browse' + (view === 'explore' ? ' is-current' : '') + '">' + icon('compass') + '둘러보기</button>'
      + '<span class="vs-nav-group' + (visiting ? ' is-visit' : '') + '">'
      + tabs.map(([key, label]) => '<button type="button" class="vs-tab' + (key === view ? ' is-current' : '') + '"' + (key === view ? ' aria-current="true"' : '') + '>' + label + '</button>').join('')
      + '</span></nav>';
    const write = visiting ? '' : '<button type="button" class="vs-write">＋ 순간 추가</button>';
    const account = guest ? '<button type="button" class="vs-login">로그인</button>' : '<button type="button" class="vs-avatar" aria-label="내 계정">나</button>';
    return '<header class="vs-header">'
      + '<div class="vs-brand"><span>LoveTree</span><small>4.1</small></div><div class="vs-brand-short">LT</div>'
      + nav
      + '<div class="vs-actions"><button type="button" class="vs-round" aria-label="테마 바꾸기">' + icon(theme === 'garden' ? 'moon' : 'sun') + '</button>' + write + account
      + '<button type="button" class="vs-round vs-menu" aria-label="메뉴">' + icon('menu') + '</button></div>'
      + '</header>';
  }

  function band() {
    if (!visiting) return '';
    return '<div class="vs-band" role="status">'
      + '<span class="vs-band-badge">방문 중</span>'
      + '<span class="vs-band-who">' + OWNER.who + '</span>'
      + (OWNER.tag ? '<span class="vs-band-tag">' + OWNER.tag + '</span>' : '')
      + '<span class="vs-band-meta">공개 트리 3개 · 지금 ‘' + TREE.title + '’</span>'
      + '<button type="button" class="vs-band-exit">' + icon('exit') + '나가기</button>'
      + '</div>';
  }

  function visitActions(compact) {
    return '<span class="vs-visit-actions" aria-label="이 트리에 마음·댓글">'
      + '<button type="button" class="vs-tool vs-tool-icon" aria-label="공감 12">' + icon('heart') + '<b>12</b></button>'
      + '<button type="button" class="vs-tool vs-tool-icon" aria-label="댓글 3">' + icon('comment') + '<b>3</b></button>'
      + (compact ? '' : '<button type="button" class="vs-tool vs-tool-icon" aria-label="공유">' + icon('share') + '</button>')
      + '<button type="button" class="vs-tool vs-tool-icon" aria-label="더 보기">' + icon('more') + '</button>'
      + '</span>';
  }

  function chip() {
    return '<button type="button" class="vs-chip" aria-label="이 러브트리의 공개 트리 고르기">'
      + '<span class="vs-chip-initial">여</span><span class="vs-chip-name">' + TREE.title + '</span>' + icon('caret', 'vs-chip-caret') + '</button>'
      + '<span class="vs-toolbar-meta">순간 ' + TREE.count + '개 · ' + TREE.short + ' 고침</span>';
  }

  function treeToolbar() {
    return '<div class="vs-toolbar">'
      + '<div class="vs-toolbar-left">' + chip() + '</div>'
      + '<div class="vs-toolbar-tools">'
      + '<button type="button" class="vs-tool vs-tool-play">' + icon('play') + '이어 보기</button>'
      + '<button type="button" class="vs-tool vs-wide-only">뿌리로</button>'
      + '<button type="button" class="vs-tool">전체</button>'
      + '<button type="button" class="vs-tool vs-tool-sq vs-wide-only" aria-label="축소">−</button>'
      + '<button type="button" class="vs-tool vs-tool-sq vs-wide-only" aria-label="확대">＋</button>'
      + '<span class="vs-sep vs-wide-only"></span>'
      + visitActions(false)
      + '</div></div>';
  }

  function treeSvg() {
    const at = Object.fromEntries(NODES.map(n => [n.id, n]));
    const lit = new Set(LIT);
    const limbs = EDGES.map(([a, b, w]) => {
      const p = at[a], c = at[b];
      const midY = (p.y + c.y) / 2;
      const d = 'M' + p.x + ' ' + p.y + ' C ' + p.x + ' ' + (midY + 8) + ', ' + c.x + ' ' + (midY + 14) + ', ' + c.x + ' ' + c.y;
      const on = lit.has(a) && lit.has(b);
      return '<path class="vs-limb' + (on ? ' is-lit' : '') + (b === 'bundle' ? ' is-bundle' : '') + '" d="' + d + '" stroke-width="' + w + '"/>';
    }).join('');
    const leaves = [[300, 140], [292, 220], [180, 318], [438, 248], [304, 300], [210, 398]].map(([x, y], i) =>
      '<ellipse class="vs-leaf" cx="' + (x + (i % 2 ? 9 : -9)) + '" cy="' + y + '" rx="7" ry="3.2" transform="rotate(' + (i % 2 ? -30 : 30) + ' ' + (x + (i % 2 ? 9 : -9)) + ' ' + y + ')"/>').join('');
    const roots = '<path class="vs-root" d="M300 700 C 290 716, 268 722, 246 730 M300 700 C 300 718, 300 726, 300 736 M300 700 C 312 716, 334 722, 356 730"/>'
      + '<path class="vs-ground" d="M196 726 C 250 720, 350 720, 404 726"/>';
    return '<svg class="vs-wood" viewBox="0 0 600 760" aria-hidden="true">' + roots + limbs + leaves + '</svg>';
  }

  function treeNodes() {
    return NODES.map(n => {
      const cls = ['vs-node', 'is-' + (n.kind || 'photo')];
      if (n.id === PICK && state !== 'entry') cls.push('is-pick');
      if (LIT.includes(n.id) && state !== 'entry') cls.push('is-lit');
      const vars = 'style="--x:' + n.x + ';--y:' + n.y + '"';
      if (n.kind === 'bundle') return '<button type="button" class="' + cls.join(' ') + '" ' + vars + ' aria-label="접힌 순간 5개">' + n.title + '</button>';
      const inner = n.kind === 'text' ? '<span>' + n.title + '</span>' : '<img alt="" src="' + img(n.img) + '">';
      return '<button type="button" class="' + cls.join(' ') + '" ' + vars + ' aria-label="' + n.title + '">' + inner + '</button>';
    }).join('');
  }

  function plaque() {
    return '<section class="vs-plaque" aria-label="이 트리 소개">'
      + '<p class="vs-kicker">공개 러브트리 · 방문</p>'
      + '<h2>' + TREE.title + '</h2>'
      + '<p class="vs-plaque-subject"><span class="vs-subject">' + TREE.subject + '</span><span class="vs-muted">' + OWNER.who + '</span></p>'
      + '<dl class="vs-stats"><div><dt>순간</dt><dd>' + TREE.count + '</dd></div><div><dt>갈래</dt><dd>' + TREE.branches + '</dd></div><div><dt>고친 날</dt><dd>' + TREE.updated + '</dd></div></dl>'
      + '<p class="vs-plaque-hint">뿌리(첫 순간)에서 위로 자라요. 순간을 누르면 크게 보고, 마음·댓글·담기를 할 수 있어요.</p>'
      + '<div class="vs-plaque-actions"><button type="button" class="vs-primary">' + icon('play') + '뿌리부터 이어 보기</button><button type="button" class="vs-secondary">서재 · 공개 트리 3</button></div>'
      + '</section>';
  }

  function momentActions(opts = {}) {
    const heartOn = !!opts.heartOn;
    return '<div class="vs-moment-actions' + (opts.paper ? ' is-paper' : '') + '">'
      + '<button type="button" class="vs-act' + (heartOn ? ' is-on' : '') + (opts.focus ? ' is-focus' : '') + '" aria-pressed="' + heartOn + '">' + icon(heartOn ? 'heartOn' : 'heart') + '<span>' + MOMENT.hearts + '</span></button>'
      + '<button type="button" class="vs-act">' + icon('comment') + '<span>댓글 ' + MOMENT.comments + '</span></button>'
      + '<button type="button" class="vs-act' + (opts.keepOn ? ' is-on' : '') + '">' + icon('keep') + '<span>담기</span></button>'
      + (opts.paper ? '' : '<button type="button" class="vs-act">' + icon('share') + '<span>공유</span></button>')
      + '</div>';
  }

  function commentsBlock() {
    const list = COMMENTS.map(c => '<article class="vs-comment"><small>' + c.who + ' · ' + c.when + '</small><p>' + c.body + '</p></article>').join('');
    const input = guest
      ? '<div class="vs-comment-login"><span>로그인하면 댓글을 남길 수 있어요.</span><button type="button" class="vs-secondary vs-small">로그인</button></div>'
      : '<div class="vs-comment-input"><span>이 순간에 댓글 남기기</span><button type="button" class="vs-secondary vs-small">남기기</button></div>';
    return '<section class="vs-comments" aria-label="댓글"><h4>댓글 ' + COMMENTS.length + '</h4>' + list + input + '</section>';
  }

  function panel() {
    const loginTip = guest
      ? '<div class="vs-login-tip" role="dialog" aria-label="로그인 안내"><b>마음·댓글·담기는 로그인하면 할 수 있어요.</b><p>보기·재생·이어 보기는 로그인 없이도 돼요. 로그인하면 이 화면으로 돌아와요.</p><div><button type="button" class="vs-primary vs-small">로그인하고 계속</button><button type="button" class="vs-secondary vs-small">그냥 볼게요</button></div></div>'
      : '';
    return '<aside class="vs-panel" aria-label="고른 순간">'
      + '<div class="vs-grab" aria-hidden="true"></div>'
      + '<div class="vs-panel-head"><span class="vs-panel-step">순간 ' + MOMENT.index + ' / ' + TREE.count + '</span><span class="vs-panel-path">길 따라 보는 중</span><button type="button" class="vs-round vs-small-round" aria-label="닫기">' + icon('close') + '</button></div>'
      + '<div class="vs-media"><img alt="" src="' + img(MOMENT.img) + '"><button type="button" class="vs-media-play">' + icon('play') + '재생</button><span class="vs-media-source">YouTube ↗</span></div>'
      + '<h3 class="vs-moment-title">' + MOMENT.title + '</h3>'
      + '<p class="vs-moment-meta">' + MOMENT.date + ' · ' + MOMENT.emotion + '</p>'
      + '<p class="vs-moment-memo">' + MOMENT.memo + '</p>'
      + '<p class="vs-why"><small>다음으로 간 이유</small>' + MOMENT.why + '</p>'
      + '<div class="vs-act-wrap">' + momentActions({ focus: guest, keepOn: state === 'keep' }) + loginTip + '</div>'
      + '<div class="vs-path-nav"><button type="button" class="vs-secondary">' + icon('prev') + '앞 순간</button><span class="vs-fork">갈림길 2</span><button type="button" class="vs-secondary">다음 순간' + icon('next') + '</button></div>'
      + commentsBlock()
      + '</aside>';
  }

  function treeScreen() {
    const open = state !== 'entry';
    return '<section class="vs-screen vs-screen-tree' + (open ? ' has-panel' : '') + '">'
      + treeToolbar()
      + '<div class="vs-stage">'
      + '<div class="vs-tree"><div class="vs-treebox">' + treeSvg() + '<div class="vs-nodes">' + treeNodes() + '</div></div>'
      + (state === 'entry' ? plaque() : '')
      + '</div>'
      + (open ? panel() : '')
      + '</div>'
      + '<footer class="vs-status">순간 13/24개 · 접힌 순간 11개</footer>'
      + (state === 'keep' ? keepSheet() : '')
      + '</section>';
  }

  function keepSheet() {
    const rows = MY_TREES.map(t => '<label class="vs-keep-row' + (t.already ? ' is-already' : '') + '">'
      + '<span class="vs-check' + (t.checked ? ' is-on' : '') + '">' + (t.checked ? icon('check') : '') + '</span>'
      + '<span class="vs-keep-name">' + t.title + '<small>순간 ' + t.count + '</small></span>'
      + (t.already ? '<span class="vs-already">이미 있음</span>' : '')
      + '</label>').join('');
    return '<div class="vs-scrim"></div><div class="vs-keep" role="dialog" aria-label="내 트리에 담기">'
      + '<div class="vs-grab" aria-hidden="true"></div>'
      + '<div class="vs-keep-head"><h3>내 트리에 담기</h3><button type="button" class="vs-round vs-small-round" aria-label="닫기">' + icon('close') + '</button></div>'
      + '<div class="vs-keep-moment"><img alt="" src="' + img(MOMENT.img) + '"><div><b>' + MOMENT.title + '</b><small>' + OWNER.who.replace(' 러브트리', '') + ' ‘' + TREE.title + '’에서</small></div></div>'
      + '<p class="vs-keep-label">담을 트리 (여러 곳 고를 수 있어요)</p>'
      + '<div class="vs-keep-list">' + rows + '<button type="button" class="vs-keep-new">＋ 새 트리 만들어 담기</button></div>'
      + '<p class="vs-keep-note"><b>이미 있음</b>: 같은 영상·같은 장면이 그 트리에 이미 있어요. 골라도 되지만 한 번 더 물어봐요.</p>'
      + '<p class="vs-keep-note">담은 순간은 내 트리에서 따로 고칠 수 있어요. 원래 트리는 바뀌지 않아요.</p>'
      + '<div class="vs-keep-foot"><button type="button" class="vs-secondary">취소</button><button type="button" class="vs-primary">2곳에 담기</button></div>'
      + '</div>';
  }

  function bookPage(n, side) {
    const m = n === 0
      ? { img: 27, date: '2026. 08. 02 · 설렘', title: '여름 노래 무대', memo: '이 노래가 나오면 아직도 그 여름 냄새가 난다.' }
      : { img: MOMENT.img, date: MOMENT.date + ' · ' + MOMENT.emotion, title: MOMENT.title, memo: MOMENT.memo };
    return '<article class="vs-page vs-page-' + side + '">'
      + '<div class="vs-photo"><img alt="" src="' + img(m.img) + '"><button type="button" class="vs-media-play">' + icon('play') + '재생</button></div>'
      + '<p class="vs-page-date">' + m.date + '</p><h3>' + m.title + '</h3><p class="vs-page-memo">' + m.memo + '</p>'
      + (n === 1 ? '<p class="vs-why"><small>다음으로 간 이유</small>' + MOMENT.why + '</p>' : '')
      + momentActions({ paper: true })
      + '<span class="vs-page-no">' + (n === 0 ? '09' : '10') + '</span>'
      + '</article>';
  }

  function bookScreen() {
    return '<section class="vs-screen vs-screen-book">'
      + '<div class="vs-toolbar"><div class="vs-toolbar-left">' + chip() + '</div><div class="vs-toolbar-tools">'
      + '<span class="vs-seg vs-wide-only"><button type="button" class="is-on">책</button><button type="button">목록</button></span>'
      + '<button type="button" class="vs-tool vs-wide-only">목차</button>'
      + '<span class="vs-seg vs-wide-only"><button type="button">1장</button><button type="button" class="is-on">2장</button></span>'
      + '<button type="button" class="vs-tool vs-tool-sq vs-wide-only" aria-label="찾기">' + icon('search') + '</button>'
      + '<button type="button" class="vs-tool vs-wide-only">이어진 순간</button>'
      + '<button type="button" class="vs-tool vs-tool-play">' + icon('play') + '이어 보기</button>'
      + '<span class="vs-sep vs-wide-only"></span>' + visitActions(true)
      + '</div></div>'
      + '<div class="vs-book-stage"><div class="vs-book">' + bookPage(0, 'left') + bookPage(1, 'right') + '</div>'
      + '<div class="vs-pager"><button type="button" class="vs-round vs-small-round" aria-label="앞 장">' + icon('prev') + '</button><span>05 / 12</span><button type="button" class="vs-round vs-small-round" aria-label="다음 장">' + icon('next') + '</button></div></div>'
      + '</section>';
  }

  function shelfScreen() {
    const covers = SHELF.map(s => '<article class="vs-cover-wrap' + (s.current ? ' is-current' : '') + '">'
      + '<div class="vs-cover vs-cover-' + s.tone + '"><small>' + s.subject + '</small><h3>' + s.title + '</h3><span class="vs-cover-count">순간 ' + s.count + '</span></div>'
      + '<div class="vs-cover-info">' + (s.current ? '<span class="vs-now">지금 보는 트리</span>' : '') + '<b>' + s.title + '</b><small>' + s.updated + ' 고침 · ' + s.open + '</small></div>'
      + '<button type="button" class="' + (s.current ? 'vs-secondary' : 'vs-primary') + ' vs-small">' + (s.current ? '이어서 보기' : '열기') + '</button>'
      + '</article>').join('');
    return '<section class="vs-screen vs-screen-shelf">'
      + '<div class="vs-toolbar"><div class="vs-toolbar-left"><span class="vs-shelf-title">서재</span><span class="vs-toolbar-meta">' + OWNER.who.replace('러브트리', '공개 트리') + ' 3개</span></div><div class="vs-toolbar-tools">'
      + '<span class="vs-seg"><button type="button">선반</button><button type="button" class="is-on">회전</button></span>' + visitActions(true) + '</div></div>'
      + '<div class="vs-shelf-stage"><p class="vs-shelf-lead">둘러보기에 소개한 트리만 모여 있어요.</p><div class="vs-shelf-row">' + covers + '</div><div class="vs-plank" aria-hidden="true"></div>'
      + '<p class="vs-shelf-note">링크로만 보낸 트리와 비공개 트리는 여기에 나오지 않아요. 이름·아이디도 보이지 않아요.</p></div>'
      + '</section>';
  }

  function exploreScreen() {
    const cards = EXPLORE.map(c => '<article class="vs-ex-card' + (c.visited ? ' is-visited' : '') + '">'
      + '<div class="vs-ex-cover"><img alt="" src="' + img(c.img) + '">' + (c.visited ? '<span class="vs-ex-tag">방금 방문</span>' : '') + '</div>'
      + '<div class="vs-ex-body"><h3>' + c.title + '</h3><small>' + c.sub + '</small><p>' + c.moment + '</p><p class="vs-ex-meta">' + c.meta + '</p></div>'
      + '</article>').join('');
    return '<section class="vs-screen vs-screen-explore">'
      + '<div class="vs-ex-top"><span class="vs-seg vs-seg-big"><button type="button" class="is-on">트리</button><button type="button">순간</button></span><span class="vs-ex-search">' + icon('search') + '찾기</span></div>'
      + '<p class="vs-kicker">공개 러브트리 둘러보기</p><h1 class="vs-ex-h1">마음이 머무는 순간들을<br>천천히 감상해 보세요</h1>'
      + '<div class="vs-ex-chips"><button type="button" class="is-on">전체</button><button type="button">RIIZE</button><button type="button">Hearts2Hearts</button></div>'
      + '<div class="vs-ex-grid">' + cards + '</div>'
      + '<div class="vs-toast" role="status"><span><b>‘' + TREE.title + '’ 방문을 마쳤어요.</b> 내 화면과 설정은 그대로예요.</span><button type="button" class="vs-secondary vs-small">다시 방문</button><button type="button" class="vs-round vs-small-round" aria-label="닫기">' + icon('close') + '</button></div>'
      + '</section>';
  }

  const screen = { tree: treeScreen, book: bookScreen, shelf: shelfScreen, explore: exploreScreen }[view]();
  document.getElementById('app').innerHTML = header() + band() + '<main class="vs-main">' + screen + '</main>';
})();
