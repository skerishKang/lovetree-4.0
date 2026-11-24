(() => {
  let mobilePicker = null;
  const canvas = document.getElementById('stage'),
    ctx = canvas.getContext('2d', { alpha: false });
  const $ = id => document.getElementById(id),
    dpr = Math.min(2, devicePixelRatio || 1),
    reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ltVar = (n, f) => {
    const k = tokenVersion + ' ' + n;
    if (!tokenCache.has(k))
      tokenCache.set(k, getComputedStyle(document.documentElement).getPropertyValue(n).trim() || f);
    return tokenCache.get(k);
  };
  // 보드와 같은 판 선택. 뜰 때와 설정 변경 때 같은 속성·그리기를 쓰며 문서는 다시 띄우지 않는다.
  const plateValue = v => (v === 'night' ? 'night' : 'paper');
  // #853: 저장한 값이 없으면 사용자 테마를 따른다 — 밤 테마면 밤 판(어두운 바탕·밝은 글자), 정원이면 종이 판.
  function readPlate() {
    try {
      const a = document.documentElement.getAttribute('data-lt-board-theme');
      if (a === 'night' || a === 'paper') return plateValue(a);
      const s = localStorage.getItem('lt41.boardTheme');
      if (s === 'night' || s === 'paper') return plateValue(s);
      return document.documentElement.getAttribute('data-lt-theme') === 'garden'
        ? 'paper'
        : 'night';
    } catch {
      return 'night';
    }
  }
  document.documentElement.setAttribute('data-lt-board-theme', readPlate());
  // 색은 CSS 한 벌에서 읽는다. 같은 값의 속성/메시지가 연달아 와도 한 번만 그린다.
  let tokenVersion = 0;
  const tokenCache = new Map();
  let paletteV = -1,
    palette = null;
  const paint = n => ltVar('--lt-map-' + n);
  const paintAlpha = (a, n) => Math.max(a, Number(paint(n)) || 0);
  const themeSignature = () =>
    [document.documentElement.getAttribute('data-lt-theme'), readPlate()].join('/');
  let drawnTheme = themeSignature();
  function refreshTheme() {
    const next = themeSignature();
    if (next === drawnTheme) return;
    drawnTheme = next;
    tokenVersion++;
    tokenCache.clear();
    paletteV = -1;
    scheduleDraw();
  }
  new MutationObserver(refreshTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-lt-theme', 'data-lt-board-theme']
  });
  addEventListener('message', e => {
    if (e.origin !== location.origin || e.data?.type !== globalThis.LT41_MSG.boardTheme) return;
    const v = plateValue(e.data.value);
    if (document.documentElement.getAttribute('data-lt-board-theme') !== v)
      document.documentElement.setAttribute('data-lt-board-theme', v);
    refreshTheme();
    paintNetBgMenu();
  });
  // #891(13:59 대표 결정): 지도 도구 줄에도 보드와 같은 '배경 ▾' 드롭을 둔다(그물형·동심원형 같은 머리줄).
  // 보드와 같은 저장값(lt41.boardTheme)을 쓰고, 고른 값은 셸이 한 곳에서 저장한다.
  function netBgChoice() {
    try {
      const s = localStorage.getItem('lt41.boardTheme');
      return s === 'paper' || s === 'night' ? s : 'auto';
    } catch {
      return 'auto';
    }
  }
  function paintNetBgMenu() {
    const v = netBgChoice();
    document
      .querySelectorAll('#netBgMenu .lt-bg-item')
      .forEach(b => b.setAttribute('aria-checked', String(b.dataset.bg === v)));
  }
  paintNetBgMenu();
  (function () {
    const btn = document.getElementById('netBgBtn'),
      menu = document.getElementById('netBgMenu');
    if (!btn || !menu) return;
    btn.onclick = () => {
      const open = menu.hidden;
      menu.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    };
    document.addEventListener('click', e => {
      if (menu.hidden) return;
      if (e.target.closest?.('#netBgBtn') || e.target.closest?.('#netBgMenu')) return;
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !menu.hidden) {
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        btn.focus();
      }
    });
    menu.addEventListener('click', e => {
      const item = e.target.closest?.('.lt-bg-item');
      if (!item) return;
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      // #951 ①: ⋯ 안에는 배경과 함께 도움말이 들어간다 — 도움말은 판을 바꾸지 않고 안내만 띄운다.
      if (item.id === 'helpBtn') {
        toast('점을 누르면 첫 순간에서 지나온 길이 밝아지고, 선에 올리면 연결 이유가 보여요.');
        return;
      }
      try {
        if (window.parent !== window)
          window.parent.postMessage(
            { type: globalThis.LT41_MSG.boardThemeChoice, value: item.dataset.bg },
            location.origin
          );
      } catch {}
    });
  })();
  const PALETTE = () => {
    if (paletteV !== tokenVersion) {
      paletteV = tokenVersion;
      palette = Array.from({ length: 6 }, (_, i) => paint('group-' + (i + 1)));
    }
    return palette;
  };
  const colorOf = n => {
    let idx = n.colorIndex ?? n.cluster ?? n.index ?? 0;
    try {
      if (typeof state !== 'undefined' && state.view === 'tag' && n.kind === 'moment')
        idx = TAG_INDEX.get(n.id) ?? idx;
    } catch {}
    return PALETTE()[((idx % 6) + 6) % 6];
  };
  const rgba = (hex, a) => {
    const [r, g, b] = hexRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  };
  // #601 묶음은 데이터에 맞는 쪽 — 부채꼴 나무(평평한 트리)는 감정별(색), 사슬·깊은 나무는 월별.
  // 7개씩 자른 순서 묶음은 뜻이 없었다('01 youtub…부터 7개'). 묶음·색은 LT56Model.pickGroups가 데이터에서
  // 만든다(최대 6묶음 = 색 6벌, 빈 묶음 없음). 묶음이 2개 미만이면 범례를 숨긴다(아래 legend 뒤, #951 ⑥).
  const GROUPS = LT56Model.pickGroups(LTDEMO.moments, LTDEMO.edges);
  const GROUP_INDEX = new Map();
  GROUPS.forEach((g, i) => g.ids.forEach(id => GROUP_INDEX.set(id, i)));
  const CLUSTERS = GROUPS.map((g, i) => ({
    id: `c${i}`,
    index: i,
    name: g.name,
    sub: '',
    color: PALETTE()[i],
    x: 0,
    y: 0,
    count: g.ids.length,
    hubR: 9
  }));
  // #1095 세 보기: 이어진 길은 위쪽 감정·월 묶음 그대로, 묶음은 꼬리표 거품(TAG_GROUPS), 시간 순은 날짜 줄.
  let TAG_DATA = LT56Model.tagGroups(LTDEMO.moments);
  let TAG_GROUPS = TAG_DATA.groups;
  let TAG_INDEX = new Map();
  TAG_GROUPS.forEach((g, i) => g.ids.forEach(id => TAG_INDEX.set(id, i)));
  const TAG_CLUSTERS = TAG_GROUPS.map((g, i) => ({
    id: `t${i}`,
    index: i,
    name: g.name,
    sub: '',
    color: PALETTE()[i],
    x: 0,
    y: 0,
    count: g.ids.length,
    hubR: 12,
    shelf: !!g.shelf
  }));
  let seed = 120811;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const rr = (a, b) => a + (b - a) * rnd(),
    clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const titles = [
    '처음 눈에 들어온 무대',
    '연습실 짧은 영상',
    '밤새 다시 본 직캠',
    '처음 저장한 인터뷰',
    '표정이 남은 엔딩',
    '이 장면 때문에 다음 영상을 찾음',
    '무대 뒤 한마디',
    '팬이 올린 짧은 클립',
    '공식 사진 속 손짓',
    '그날의 플레이리스트',
    '링크를 따라 발견한 라이브',
    '다른 멤버와의 장면',
    '댓글에서 찾은 정보',
    '무대 의상 기록',
    '다시 본 첫 영상',
    '친구에게 보낸 링크',
    '콘서트 전날 메모',
    '처음 간 팝업',
    '사진 한 장의 기억',
    '우연히 들은 라디오',
    '예전 저장을 다시 열다',
    '그날의 감정 메모',
    '다음 컴백 티저',
    '오래 남은 한 문장',
    '새 계절의 첫 저장'
  ];
  const notes = [
    '표정 하나가 오래 남았다.',
    '그때의 소리까지 같이 기억난다.',
    '이 장면에서 감정이 한 번 더 깊어졌다.',
    '다른 순간을 찾게 만든 작은 단서였다.',
    '나중에 다시 보고 싶어서 바로 저장했다.'
  ];
  const whys = [
    '이 장면의 표정이 계속 생각나서 다음 영상을 찾았어요.',
    '짧은 한마디가 궁금증을 남겨 관련 인터뷰로 이어졌어요.',
    '같은 날의 다른 시점을 보고 싶어서 다음 순간를 열었어요.',
    '이 감정이 끝나지 않아 비슷한 무대를 계속 찾아봤어요.',
    '친구에게 보여주고 싶어 다음 링크까지 저장했어요.'
  ];
  const nodes = [],
    edges = [],
    anchors = [],
    paths = [],
    pathById = {},
    clusterPathIds = CLUSTERS.map(() => []);
  const addEdge = e => {
    e.id = e.id || `e${edges.length}`;
    edges.push(e);
    return e;
  };
  const addPath = p => {
    paths.push(p);
    pathById[p.id] = p;
    clusterPathIds[p.cluster].push(p.id);
    return p;
  };
  function momentBase(ci, id, x, y, level, pathId, indexInPath, first = false) {
    return {
      id,
      kind: 'moment',
      cluster: ci,
      x,
      y,
      r: level === 0 ? 6.6 : level === 1 ? 5.2 : 3.6,
      colorIndex: ci,
      title: titles[(ci * 4 + nodes.length) % titles.length],
      date: `202${2 + ((ci + nodes.length) % 5)}.${String(1 + ((nodes.length * 2 + ci) % 12)).padStart(2, '0')}.${String(3 + ((nodes.length * 3) % 24)).padStart(2, '0')}`,
      emotion: ['설렘', '몰입', '호기심', '애정', '그리움', '기대'][(ci + nodes.length) % 6],
      note: notes[(ci + nodes.length) % notes.length],
      why: whys[(ci * 2 + nodes.length) % whys.length],
      source: ['YouTube', 'Photo', 'Note', 'Link', 'Video'][nodes.length % 5],
      level,
      pathId,
      indexInPath,
      first
    };
  }
  const branchPoint = (c, angle, step, len, branchIndex) =>
    LT56Model.branchPoint(c, angle, step, len, branchIndex);
  function generateCluster(c) {
    const hub = { ...c, kind: 'cluster', r: c.hubR };
    const entry = {
      id: `a${c.index}_entry`,
      kind: 'anchor',
      cluster: c.index,
      x: c.x,
      y: c.y,
      r: 15,
      color: c.color,
      label: 'ENTRY',
      level: 0
    };
    anchors.push(entry);
    let created = 0;
    const primaries = [];
    const baseLens = [];
    for (let b = 0; b < c.branchCount; b++) baseLens.push(7 + ((c.index + b) % 4));
    for (let b = 0; b < c.branchCount; b++) {
      const pid = `p${c.index}_${b}`,
        len = baseLens[b],
        seq = [];
      for (let j = 0; j < len && created < c.count; j++) {
        const p = branchPoint(c, c.branchAngles[b], j, len, b),
          id = `m${c.index}_${created}`;
        const n = momentBase(c.index, id, p.x, p.y, 0, pid, j, c.index === 0 && b === 0 && j === 0);
        if (n.first) {
          n.x = c.x - 34;
          n.y = c.y + 18;
          n.r = 9.5;
          n.title = '첫 순간 · 처음 마음이 움직인 순간';
          n.note = '여기서 여러 주요 감정 경로가 시작되었다.';
        }
        nodes.push(n);
        seq.push(id);
        created++;
        if (j === 0)
          addEdge({ a: entry.id, b: id, cluster: c.index, kind: 'primary', pathId: pid, order: j });
        else
          addEdge({
            a: seq[j - 1],
            b: id,
            cluster: c.index,
            kind: 'primary',
            pathId: pid,
            order: j
          });
      }
      const path = addPath({
        id: pid,
        cluster: c.index,
        label: `${String(c.index + 1).padStart(2, '0')} · 주경로 ${String.fromCharCode(65 + b)}`,
        tone: b,
        kind: 'primary',
        nodes: seq,
        children: [],
        branchAt: Math.min(3, Math.max(2, seq.length - 3))
      });
      primaries.push(path);
    }
    // one secondary branch from each primary, plus selected extra branch on dense clusters
    primaries.forEach((parent, b) => {
      if (created >= c.count) return;
      const attachIndex = Math.min(parent.branchAt, parent.nodes.length - 2),
        attach = nodes.find(n => n.id === parent.nodes[attachIndex]);
      const sid = `${parent.id}s1`,
        seq = [attach.id],
        len = Math.min(4 + ((b + c.index) % 3), c.count - created + 1);
      const baseAngle = c.branchAngles[b] + (b % 2 ? -0.62 : 0.58);
      for (let j = 1; j < len && created < c.count; j++) {
        const dist = 75 + j * 62,
          ang = baseAngle + j * 0.035 * (b % 2 ? -1 : 1),
          id = `m${c.index}_${created}`,
          n = momentBase(
            c.index,
            id,
            attach.x + Math.cos(ang) * dist,
            attach.y + Math.sin(ang) * dist * 0.78,
            1,
            sid,
            j
          );
        nodes.push(n);
        seq.push(id);
        created++;
        addEdge({
          a: seq[j - 1],
          b: id,
          cluster: c.index,
          kind: 'secondary',
          pathId: sid,
          order: j
        });
      }
      if (seq.length > 1) {
        addPath({
          id: sid,
          cluster: c.index,
          label: `${parent.label} · 분기`,
          tone: b + 0.35,
          kind: 'secondary',
          nodes: seq,
          parent: parent.id,
          children: []
        });
        parent.children.push(sid);
      }
    });
    // contextual moments sit near existing path nodes and use weak support edges only
    const cPathNodes = () => nodes.filter(n => n.cluster === c.index && n.level <= 1);
    while (created < c.count) {
      const bases = cPathNodes(),
        base = bases[Math.floor(rnd() * bases.length)],
        ang = rr(0, Math.PI * 2),
        dist = rr(28, 82),
        id = `m${c.index}_${created}`,
        n = momentBase(
          c.index,
          id,
          base.x + Math.cos(ang) * dist,
          base.y + Math.sin(ang) * dist,
          2,
          base.pathId,
          -1
        );
      nodes.push(n);
      created++;
      addEdge({ a: base.id, b: id, cluster: c.index, kind: 'support', pathId: base.pathId });
    }
    // sparse semantic cross-links: adjacent primary branches only
    for (let b = 0; b < primaries.length - 1; b++) {
      const A = primaries[b].nodes,
        B = primaries[b + 1].nodes,
        ai = Math.min(4, A.length - 1),
        bi = Math.min(3, B.length - 1);
      if (A[ai] && B[bi]) addEdge({ a: A[ai], b: B[bi], cluster: c.index, kind: 'cross' });
    }
    // hub support to entry only; avoid spoke flower
    addEdge({ a: c.id, b: entry.id, cluster: c.index, kind: 'anchor' });
    return hub;
  }
  // Use the same forty sample moments and actual links as the orbit.
  // #601 묶음 이름은 감정(색)과 개수 — "01 설렘 · 7개". 묶음이 2개 미만이면 범례를 숨긴다(#951 ⑥).
  const groupLabel = i =>
    `${String(i + 1).padStart(2, '0')} ${CLUSTERS[i]?.name || ''} · ${CLUSTERS[i]?.count || 0}개`;
  /* CTO 결정(261120): 아래 조작 줄의 묶음 단추는 '1묶음 · 1–2월' 형식 — 범례와 같은 번호, 앞 0 없음. */
  const clusterChip = (i, name) => `${i + 1}묶음 · ${name || ''}`;
  const legendBox = document.querySelector('.legend');
  function paintLegend() {
    const view = state.view || 'network';
    let list = CLUSTERS,
      label = i => groupLabel(i);
    if (view === 'tag') {
      list = TAG_CLUSTERS.filter(c => !c.shelf);
      label = i => {
        const c = TAG_CLUSTERS[i];
        return c ? `${String(i + 1).padStart(2, '0')} ${c.name} · ${c.count}개` : '';
      };
      // 꼬리표 거품 범례는 개수 자리에 허브 순서 번호를 쓴다(감정 묶음과 같은 가짓수).
      // 선반(아직 묶음에 안 든)은 범례에 넣지 않는다.
    } else if (view === 'time') {
      list = [];
    }
    if (legendBox) legendBox.hidden = list.length < 2;
    document.querySelectorAll('.legend-row').forEach((row, i) => {
      const c = list[i];
      if (list.length < 2 || !c) {
        row.hidden = true;
        return;
      }
      row.hidden = false;
      const sw = row.querySelector('.swatch');
      if (sw) sw.dataset.g = String(((view === 'tag' ? TAG_CLUSTERS.indexOf(c) : i) % 6) + 1);
      const txt =
        view === 'tag'
          ? `${String(TAG_CLUSTERS.indexOf(c) + 1).padStart(2, '0')} ${c.name} · ${c.count}개`
          : groupLabel(i);
      row.replaceChildren(...(sw ? [sw] : []), document.createTextNode(txt));
    });
  }
  // paintLegend는 state가 생긴 뒤(부팅·보기 전환 때) 부른다.
  // #366 배치는 LT56Model 보기별 함수 한 벌. #461: 두 보기 모두 화면에서 도구가 덮지 않는 상자(BOX)에 맞춰 화면 좌표로 펼친다.
  let BOX = { x: 0, y: 0, w: 1200, h: 800 },
    NETFIT = null,
    CONCENTRIC = null,
    TAGFIT = null,
    TIMEFIT = null;
  LTDEMO.moments.forEach((m, i) => {
    const ci = GROUP_INDEX.get(m.id) ?? 0,
      c = CLUSTERS[ci],
      p = { x: c.x, y: c.y },
      j = i;
    const n = momentBase(ci, m.id, p.x, p.y, 0, `p${ci}_0`, j, i === 0);
    if (n.first) n.r = 10;
    Object.assign(n, {
      title: m.title,
      date: m.date,
      emotion: m.emotion,
      note: m.memo || '',
      why: m.whyNext || '',
      source: m.source || '예시 기록',
      mediaMetadata: m.mediaMetadata,
      image: m.image
    });
    nodes.push(n);
  });
  CLUSTERS.forEach((c, ci) => {
    const seq = nodes.filter(n => n.cluster === ci).map(n => n.id);
    addPath({
      id: `p${ci}_0`,
      cluster: ci,
      label: c.name,
      kind: 'primary',
      nodes: seq,
      children: [],
      branchAt: -1
    });
  });
  LTDEMO.edges.forEach((e, i) =>
    addEdge({
      a: e.from,
      b: e.to,
      cluster: nodes.find(n => n.id === e.from)?.cluster || 0,
      kind: e.kind === 'related' ? 'related' : 'parent',
      pathId: nodes.find(n => n.id === e.from)?.pathId,
      order: i,
      reason: e.reason || ''
    })
  );
  let FIRST = nodes[0];
  const originTargets = [];
  // #461 갈림길: 다음 순간이 둘 이상인 순간(멀리서도 이름표를 붙이는 대상).
  const BRANCH = new Set(
    Object.entries(
      LTDEMO.edges
        .filter(e => e.kind === 'parent')
        .reduce((a, e) => ((a[e.from] = (a[e.from] || 0) + 1), a), {})
    )
      .filter(([, c]) => c > 1)
      .map(([id]) => id)
  );
  const all = [...CLUSTERS, ...anchors, ...nodes],
    byId = Object.fromEntries(all.map(n => [n.id, n]));
  function pathSequenceForNode(n) {
    if (!n?.pathId) return null;
    return pathById[n.pathId] || null;
  }
  function edgePathIncluded(e, pid) {
    return e.pathId === pid;
  }
  function clusterRouteEdges(ci) {
    return edges.filter(
      e =>
        e.cluster === ci &&
        [
          'parent',
          'related',
          'primary',
          'secondary',
          'bridge',
          'bridgeSecondary',
          'anchor'
        ].includes(e.kind)
    );
  }
  function originRevealEdges() {
    return edges.filter(
      e =>
        e.kind === 'origin' ||
        (e.cluster <= 2 && ['parent', 'related', 'primary', 'secondary'].includes(e.kind)) ||
        (e.cluster < 2 && ['bridge', 'bridgeSecondary'].includes(e.kind))
    );
  }
  let state = {
    scale: 1,
    tx: 0,
    ty: 0,
    drag: false,
    lastX: 0,
    lastY: 0,
    downX: 0,
    downY: 0,
    hover: null,
    selected: null,
    cluster: null,
    mode: 'OVERVIEW',
    mobile: innerWidth <= 640,
    mobileCluster: 0,
    revealStart: 0,
    revealEdges: new Set(),
    route: null,
    play: null,
    trail: new Set(),
    preview: new Set(),
    animEdge: null,
    animT: 0,
    branchPause: false,
    view: 'network',
    pathIds: new Set(),
    pathEdges: new Set(),
    hoverEdge: null
  };
  let vw = 0,
    vh = 0,
    last = performance.now();
  const hexRgb = h => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16)
  ];
  const w2s = (x, y) => ({ x: x * state.scale + state.tx, y: y * state.scale + state.ty }),
    s2w = (x, y) => ({ x: (x - state.tx) / state.scale, y: (y - state.ty) / state.scale }),
    visible = (p, m = 100) => p.x > -m && p.x < vw + m && p.y > -m && p.y < vh + m;
  function setMode(mode) {
    state.mode = mode;
    $('modePill').textContent = LTLabels.mode(mode);
  }
  // #368 3차: 날짜 표기는 책·보드와 같은 한 벌(window.LTTitle.formatDisplayDate — track56 html이 formatDisplayDate로 심는다).
  const dateText = v => {
    try {
      return window.LTTitle?.formatDisplayDate?.(v) || v || '';
    } catch {
      return v || '';
    }
  };
  /* #951 ⑤: 판의 날짜는 '날짜·감정·트리' 한 줄(#dBasic)에 있다 — 표기 값이 바뀌면 그 줄을 그 순간으로 다시 그린다. */ addEventListener(
    'lt-date-style-changed',
    () => {
      const n = state.selected;
      if (n && typeof paintDetail === 'function') paintDetail(n);
    }
  );
  // #368 3차: 설정의 '관계 지도 기본 보기' — 셸이 lt41-network-view로 알려 주면 지금 화면도 같은 보기로 바꾼다.
  // #1095: 옛 저장값 'concentric'(동심원)은 새 'tag'(꼬리표 묶음)로 읽는다.
  addEventListener('message', e => {
    if (e.data?.type !== globalThis.LT41_MSG.networkView || !globalThis.LT41_isShellMessage?.(e))
      return;
    const v = e.data.value === 'concentric' ? 'tag' : e.data.value;
    if ((v === 'network' || v === 'tag' || v === 'time') && state.view !== v) setView(v);
  });
  function setupMobileRibbon() {
    const r = $('mobileRibbon');
    if (!r) return;
    r.innerHTML = '';
    const o = document.createElement('button');
    o.textContent = '첫 순간 보기';
    o.className = 'origin';
    o.onclick = () => selectMoment(FIRST, true);
    r.appendChild(o);
    const zm = document.createElement('button');
    zm.textContent = '−';
    zm.setAttribute('aria-label', '지도 축소(−)');
    zm.onclick = () => {
      zoomAt(0.84);
      scheduleDraw();
    };
    r.appendChild(zm);
    const zp = document.createElement('button');
    zp.textContent = '＋';
    zp.setAttribute('aria-label', '지도 확대(＋)');
    zp.onclick = () => {
      zoomAt(1.18);
      scheduleDraw();
    };
    r.appendChild(zp);
    const addFit = () => {
      const b = document.createElement('button');
      b.textContent = '전체 맞춤';
      b.onclick = () => {
        fitView();
        document.querySelector('.hero')?.classList.add('dim');
        scheduleDraw();
      };
      r.appendChild(b);
    };
    if (state.view === 'tag') {
      TAG_CLUSTERS.filter(c => !c.shelf).forEach(c => {
        const b = document.createElement('button');
        const full = `${TAG_CLUSTERS.indexOf(c) + 1}묶음 · ${c.name} · ${c.count}개`;
        b.textContent = `${TAG_CLUSTERS.indexOf(c) + 1}묶음 · ${c.name}`;
        b.setAttribute('aria-label', full);
        b.title = full;
        b.dataset.i = c.index;
        b.onclick = () => selectTagCluster(c);
        r.appendChild(b);
      });
      addFit();
    } else if (state.view === 'time') {
      addFit();
    } else if (state.view === 'network' && NETFIT?.compact) {
      addFit();
    } else if (state.view === 'network' && !NETFIT?.fan) {
      const yearRe = /^(\d{4}년 )/;
      const years = CLUSTERS.map(c => yearRe.exec(c.name)?.[1] || '');
      const sharedYear =
        CLUSTERS.length > 1 && years.every(Boolean) && new Set(years).size === 1 ? years[0] : '';
      CLUSTERS.forEach((c, i) => {
        const b = document.createElement('button');
        const full = groupLabel(i);
        b.textContent = clusterChip(i, sharedYear ? c.name.replace(yearRe, '') : c.name);
        b.setAttribute('aria-label', full);
        b.title = full;
        b.dataset.i = i;
        b.onclick = () => selectCluster(c);
        r.appendChild(b);
      });
      addFit();
    } else {
      addFit();
    }
    // #1249: 휴대폰에서는 묶음 선택을 한 개의 메뉴로 묶고 전체 맞춤을 항상 노출한다.
    const chips = [...r.querySelectorAll('button[data-i]')];
    if (chips.length) {
      const more = document.createElement('button');
      more.className = 'ribbon-more';
      more.type = 'button';
      more.textContent = '…';
      more.setAttribute('aria-label', '묶음 선택');
      more.setAttribute('aria-expanded', 'false');
      more.setAttribute('aria-controls', 'ribbonGroups');
      const groups = document.createElement('div');
      groups.id = 'ribbonGroups';
      groups.className = 'ribbon-groups';
      const close = () => {
        groups.classList.remove('is-open');
        more.setAttribute('aria-expanded', 'false');
      };
      more.onclick = () => {
        const open = groups.classList.toggle('is-open');
        more.setAttribute('aria-expanded', String(open));
        if (open) groups.querySelector('button')?.focus();
      };
      groups.addEventListener('keydown', e => {
        if (e.key === 'Escape') { close(); more.focus(); }
      });
      r.insertBefore(more, chips[0]);
      r.insertBefore(groups, chips[0]);
      for (const chip of chips) {
        groups.append(chip);
        chip.addEventListener('click', () => {
          close();
          if (more.getClientRects().length) more.focus();
        });
      }
    }
    syncRibbon();
  }
  function syncRibbon() {
    document
      .querySelectorAll('#mobileRibbon button[data-i]')
      .forEach((b, i) =>
        b.classList.toggle(
          'active',
          state.mode === 'CLUSTER_PATH_OVERVIEW' && i === state.mobileCluster
        )
      );
  }
  // #461 지도를 덮는 도구(위 머리·안내 문구·순간 고르기 줄, 왼쪽 패널, 아래 묶음 줄)를 재어 남는 상자(BOX)를 정한다.
  // 창 크기가 바뀔 때만 잰다(가만히 있을 때는 아무것도 하지 않는다 — 유휴 rAF 0).
  // #517: 머리가 두 줄로 감기는 좁은 폭에서는 머리 아래에 순간 선택 패널·안내 문구가 오게 한다 —
  // 머리의 실제 아래 끝을 --lt-picker-top으로 CSS에 넘겨 패널(top)·안내 문구(top)가 도구 줄과 겹치지 않게 한다.
  function measureInsets() {
    const box = el => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return null;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1 ? r : null;
    };
    const left = box(document.querySelector('.left-rail')),
      right = box(document.querySelector('.progress-rail')),
      bottom = box(document.querySelector('.mobile-ribbon'));
    const topbarBottom = box(document.querySelector('.topbar'))?.bottom;
    /* #951 ①: 위 단추 줄 아래 작은 글자('순간 N · 이어진 선 N')가 앉을 자리(4px 아래·높이 16px + 2px 숨 = 22px)를 늘 비워 둔다.
    잰 글자 높이에 기대지 않는다 — 글자가 늦게 채워지면 그때마다 판 위 여백이 달라져 같은 판이 다르게 그려졌다.
    값은 순간 고르기 줄보다 먼저 정하고(그 줄이 그 자리에 서도록), 그 뒤에 재야 재는 값이 흔들리지 않는다. */
    const pickerTop = (topbarBottom || 102) + 22;
    document.documentElement.style.setProperty('--lt-picker-top', pickerTop.toFixed(0) + 'px');
    /* #951 ⑤: 좁은 화면에서 상세 시트가 아래 묶음 단추 줄을 덮지 않게 그 줄 높이를 재어 넘긴다. */
    document.documentElement.style.setProperty(
      '--lt-sheet-bottom',
      (bottom ? vh - bottom.top + 8 : 104).toFixed(0) + 'px'
    );
    /* #951 ⑥: 넓은 화면 묶음 카드·토스트는 아래 단추 줄 위에 앉는다 — 줄 위 끝(화면 아래에서부터의 높이)을 넘긴다. */
    document.documentElement.style.setProperty(
      '--lt-bottom-cover',
      (bottom ? vh - bottom.top : 118).toFixed(0) + 'px'
    );
    /* #951 ⑤: 토스트가 보이는 동안 시트가 물러난 자리는 창 크기가 바뀌어도 유지한다. */ if (
      $('toast').classList.contains('show')
    )
      placeToast();

    // 순간 고르기 줄은 그 자리에 서므로 잰 위·아래를 쓰지 않고, 높이만 더해 '늘 같은' 아래 끝을 쓴다(그 줄이 늦게 붙어도 같다).
    const picker = box(document.querySelector('.lt-moment-picker'));
    /* 좁은 화면 상세 시트의 위 끝 — 순간 고르기 줄 아래에서 시작한다(줄과 겹치지 않게). */
    document.documentElement.style.setProperty(
      '--lt-sheet-top',
      (picker ? pickerTop + picker.height + 8 : 190).toFixed(0) + 'px'
    );
    /* #951 ⑤: 넓은 화면(981px 이상)에서 상세 판이 열리면 지도 판이 판 너비만큼 왼쪽으로 줄어든다(보드 #891과 같게).
    판에 가려진 자리에 고른 순간이 놓이지 않도록 오른쪽 여백으로 판을 비켜 준다. 좁은 화면은 아래 시트라 그대로 덮는다. */
    const detailOpen = vw > 980 && !!document.querySelector('#detail.open'),
      detailInset = detailOpen ? 446 : 0;
    const tops = ['.topbar', '.hero p'].map(s => box(document.querySelector(s))).filter(Boolean);
    const topInset = Math.max(0, ...tops.map(r => r.bottom), picker ? pickerTop + picker.height + 4 : 0) +
      (state.mobile ? 30 : 0);
    const bottomInset = bottom ? vh - bottom.top : 0;
    // #1249: 한 줄 도구로 줄어든 아래 여백을 보완해 지도 중심이 화면 아래로 쏠리지 않게 한다.
    // 짧은 화면에서도 실제 조작 줄과 겹치지 않는 범위에서만 배치 영역을 조정한다.
    const balance = state.mobile ? Math.min(topInset - vh * .16, vh - topInset - 152) : 0;
    return {
      top: topInset,
      left: left ? left.right : 0,
      right: Math.max(right ? vw - right.left : 0, detailInset),
      bottom: Math.max(bottomInset, balance)
    };
  }
  function layoutNetwork() {
    NETFIT = LT56Model.networkLayout(LTDEMO.moments, {
      box: BOX,
      dotR: 5,
      firstR: 20,
      gap: 8,
      hubR: 9,
      edges: LTDEMO.edges,
      groups: GROUPS.map(g => g.ids)
    });
    CLUSTERS.forEach((c, i) => {
      const h = NETFIT.hubs[i];
      if (h) {
        c.x = h.x;
        c.y = h.y;
      } else if (NETFIT.fan || NETFIT.compact) {
        /* #583 부채꼴 나무: 묶음 점이 뜻하는 묶음 자리가 없다(한 고리에 펼침) — 화면 밖에 치워 점·이름표·누르기에서 치운다 */ c.x =
          -9999;
        c.y = -9999;
      }
    });
  }
  function layoutTag() {
    TAGFIT = LT56Model.tagLayout(LTDEMO.moments, {
      box: BOX,
      dotR: 5,
      firstR: 12,
      gap: 8,
      hubR: 12,
      edges: LTDEMO.edges
    });
    TAG_CLUSTERS.forEach((c, i) => {
      const h = TAGFIT.hubs?.[i];
      if (h) {
        c.x = h.x;
        c.y = h.y;
      } else if (TAGFIT.empty) {
        const p = TAGFIT.points[c.id] || { x: -9999, y: -9999 };
        c.x = -9999;
        c.y = -9999;
      }
    });
    if (TAGFIT.empty) {
      TAG_CLUSTERS.forEach(c => {
        c.x = -9999;
        c.y = -9999;
      });
    }
  }
  function layoutTime() {
    TIMEFIT = LT56Model.timeLayout(LTDEMO.moments, { box: BOX, dotR: 5, gap: 8, hubR: 9 });
  }
  function paintTagEmpty() {
    const el = $('tagEmpty');
    if (!el) return;
    const show = state.view === 'tag' && !!TAGFIT?.empty;
    el.hidden = !show;
    if (show && !el.dataset.wired) {
      el.dataset.wired = '1';
      const b = el.querySelector('button');
      if (b)
        b.onclick = () => {
          try {
            parent.postMessage(
              { type: globalThis.LT41_MSG.openTags, suggest: true },
              location.origin
            );
          } catch {}
          toast('꼬리표 정리에서 제목으로 제안받을 수 있어요.');
        };
    }
  }
  function applyPoints(fit) {
    if (!fit) return;
    for (const n of nodes) {
      const p = fit.points[n.id];
      if (p) {
        n.x = p.x;
        n.y = p.y;
      }
    }
  }
  // 전체 보기 = 배율 1(배치가 이미 화면 좌표로 상자에 맞춰져 있다).
  function fitView() {
    state.scale = 1;
    state.tx = 0;
    state.ty = 0;
  }
  function resize() {
    vw = innerWidth;
    vh = innerHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    state.mobile = vw <= 640;
    BOX = LT56Model.fitBox(vw, vh, measureInsets(), 16);
    layoutNetwork();
    layoutTag();
    layoutTime();
    if (state.view === 'tag') applyPoints(TAGFIT);
    else if (state.view === 'time') applyPoints(TIMEFIT);
    else if (state.view === 'concentric') computeConcentric(false);
    else restoreNetworkPoints();
    paintTagEmpty();
    if (
      state.mode === 'OVERVIEW' ||
      state.mode === 'ORIGIN_REVEAL' ||
      (!state.selected && !state.cluster)
    )
      fitView();
    else if (state.mode === 'CLUSTER_PATH_OVERVIEW' && state.cluster)
      centerOn(state.cluster, clusterZoom());
    else if (state.selected) centerOn(state.selected, state.scale);
    scheduleDraw();
  }
  // #366 동심원형: 첫 순간을 가운데, 단계별 바깥 원(LT56Model.concentricLayout). #461: 상자(BOX)에 맞춰 화면 좌표로 — 배율 1이 전체 보기다.
  function computeConcentric(recenter = true) {
    CONCENTRIC = LT56Model.concentricLayout(LTDEMO.moments, LTDEMO.edges, {
      box: BOX,
      nodeR: state.mobile ? 4.2 : 4.6,
      firstR: 20,
      gap: 8
    });
    for (const n of nodes) {
      const p = CONCENTRIC.points[n.id];
      if (p) {
        n.x = p.x;
        n.y = p.y;
      }
    }
    if (recenter) {
      fitView();
      state.mobileCluster = 0;
    }
  }
  function restoreNetworkPoints() {
    if (!NETFIT) return;
    for (const n of nodes) {
      const p = NETFIT.points[n.id];
      if (p) {
        n.x = p.x;
        n.y = p.y;
      }
    }
  }
  function fitConcentric() {
    fitView();
    document.querySelector('.hero')?.classList.add('dim');
    scheduleDraw();
  }
  function centerConcentricFirst() {
    selectMoment(FIRST, true);
  }
  function computeTag(recenter = true) {
    layoutTag();
    applyPoints(TAGFIT);
    if (recenter) {
      fitView();
      state.mobileCluster = 0;
    }
  }
  function computeTime(recenter = true) {
    layoutTime();
    applyPoints(TIMEFIT);
    if (recenter) {
      fitView();
      state.mobileCluster = 0;
    }
  }
  function layoutForView() {
    if (state.view === 'tag') computeTag(false);
    else if (state.view === 'time') computeTime(false);
    else if (state.view === 'concentric') computeConcentric(false);
    else restoreNetworkPoints();
  }
  // 묶음 하나를 상자에 꽉 차게 보는 확대(1~3배).
  function clusterZoom() {
    if (!NETFIT) return 1.5;
    return Math.max(1, Math.min(3, 0.9 * Math.min(BOX.w / NETFIT.cell.w, BOX.h / NETFIT.cell.h)));
  }
  // 보기 방식은 이 기기에 기억한다(저장소가 막혀도 화면은 그대로 동작).
  const VIEW_KEY = 'lt41.network.view';
  const normView = v =>
    v === 'concentric' ? 'tag' : v === 'tag' ? 'tag' : v === 'time' ? 'time' : 'network';
  const readStoredView = () => {
    try {
      return normView(localStorage.getItem(VIEW_KEY));
    } catch (e) {
      return 'network';
    }
  };
  const storeView = v => {
    try {
      localStorage.setItem(VIEW_KEY, normView(v));
    } catch (e) {}
  };
  function paintViewButtons() {
    $('viewNet')?.setAttribute('aria-pressed', String(state.view === 'network'));
    $('viewConc')?.setAttribute('aria-pressed', String(state.view === 'tag'));
    $('viewGraph')?.setAttribute('aria-pressed', String(state.view === 'time'));
  }
  /* 보고마다 머리줄 설명 한 문장 — 이어진 길(#1095 현재 문장)·묶음·시간 순만 다르다. */
  const HERO_LINES = {
    network: '첫 순간에서 어떻게 이어졌는지 보는 지도예요',
    tag: '같은 가수·노래·무대 꼬리표끼리 모아 보는 지도예요',
    time: '담은 날짜 순서대로 보는 지도예요'
  };
  function paintHero() {
    const p = document.querySelector('.hero p');
    if (p) p.textContent = HERO_LINES[state.view] || HERO_LINES.network;
  }
  function setView(v) {
    v = normView(v);
    if (state.view === v) return;
    state.view = v;
    storeView(v);
    document.body.dataset.ltView = v;
    state.selected = null;
    state.cluster = null;
    state.revealEdges.clear();
    state.pathIds = new Set();
    state.pathEdges = new Set();
    $('detail')?.classList.remove('open');
    $('routeStatus')?.classList.remove('show');
    if (BOX) layoutForView();
    fitView();
    state.mobileCluster = 0;
    paintViewButtons();
    paintHero();
    paintLegend();
    paintTagEmpty();
    setupMobileRibbon();
    scheduleDraw();
    toast(
      v === 'tag'
        ? '묶음 보기 — 같은 꼬리표끼리 거품으로 모읍니다.'
        : v === 'time'
          ? '시간 순 보기 — 담은 날짜 순서 줄을 봅니다.'
          : '이어진 길 보기 — 첫 순간에서 이어진 가지를 봅니다.'
    );
  }
  function overview(show = true) {
    cancelPlayback();
    state.selected = null;
    state.cluster = null;
    state.revealEdges.clear();
    state.trail.clear();
    state.preview.clear();
    state.pathIds = new Set();
    state.pathEdges = new Set();
    setMode('OVERVIEW');
    $('detail').classList.remove('open');
    $('branchChooser').classList.remove('open');
    $('routeStatus').classList.remove('show');
    document.querySelector('.hero')?.classList.remove('dim');
    fitView();
    paintTagEmpty();
    syncRibbon();
    scheduleDraw();
    if (show)
      toast(
        state.view === 'time'
          ? '순간을 눌러 보세요.'
          : state.mobile
            ? '첫 순간이나 아래 묶음을 눌러 보세요.'
            : '첫 순간이나 묶음을 눌러 보세요.'
      );
  }
  function mobileOverview(show = true) {
    fitView();
    state.cluster = null;
    state.selected = null;
    scheduleDraw();
    if (show) toast('묶음을 누르면 그 묶음의 순간을 크게 봅니다.');
  }
  function centerMobileCluster(ci, show = true) {
    const c = CLUSTERS[ci];
    state.mobileCluster = ci;
    centerOn(c, clusterZoom());
    syncRibbon();
    if (show) toast(`${clusterChip(ci, CLUSTERS[ci]?.name)} 묶음을 봅니다.`);
  }
  // 확대해서 한 점을 지도 상자 가운데로. 배율은 전체 보기(1) 기준 배수다.
  function centerOn(n, scale) {
    state.scale = scale || 1.6;
    state.tx = BOX.x + BOX.w / 2 - n.x * state.scale;
    state.ty = BOX.y + BOX.h / 2 - n.y * state.scale;
    document.querySelector('.hero').classList.add('dim');
    scheduleDraw();
  }
  function selectCluster(c) {
    cancelPlayback();
    state.cluster = c;
    state.mobileCluster = c.index;
    state.selected = null;
    state.pathIds = new Set();
    state.pathEdges = new Set();
    /* #601 묶음이 감정·월처럼 뜻을 가지면 흩어져 있다 — 묶음 안에서 실제 이어진 선만 밝힌다(양 끝이 묶음 안).
흩어진 묶음은 선 대신 묶음의 점을 밝혀 보여 준다(지도를 가로지르는 가짜 길을 그리지 않는다). */ state.revealEdges =
      new Set(
        edges
          .filter(e => byId[e.a]?.cluster === c.index && byId[e.b]?.cluster === c.index)
          .map(e => e.id)
      );
    state.revealStart = performance.now();
    setMode('CLUSTER_PATH_OVERVIEW');
    $('detail').classList.remove('open');
    $('branchChooser').classList.remove('open');
    centerOn(c, clusterZoom());
    showRouteStatus(
      groupLabel(c.index),
      state.revealEdges.size
        ? `이 묶음의 순간과 묶음 안에서 이어진 선을 보여 줘요.`
        : '이 묶음의 순간을 밝혀 보여 줘요. 서로 이어진 선은 아직 없어요.'
    );
    syncRibbon();
    scheduleDraw();
    toast(`${groupLabel(c.index)} 묶음을 봅니다.`);
  }
  function originReveal() {
    cancelPlayback();
    state.selected = FIRST;
    state.cluster = null;
    state.pathIds = new Set();
    state.pathEdges = new Set();
    state.revealEdges = new Set(originRevealEdges().map(e => e.id));
    state.revealStart = performance.now();
    setMode('ORIGIN_REVEAL');
    $('detail').classList.remove('open');
    $('branchChooser').classList.remove('open');
    document.querySelector('.hero').classList.add('dim');
    fitView();
    showRouteStatus(
      '첫 순간 · 01 / 02 / 03 전체 분기',
      '처음 마음이 움직인 순간에서 시작해 세 주요 경로군이 어디로 퍼졌는지 동시에 보여줍니다.'
    );
    scheduleDraw();
    toast('첫 순간에서 01·02·03 주요 성장 경로가 함께 펼쳐집니다.');
  }
  // #366 길 강조 대상 계산: 첫 순간부터 이 순간까지 지나온 길(부모 연결)만 밝힌다. 세기는 LT56Model.pathEmphasis 한 곳.
  function applyPathHighlight(n) {
    const path = LT56Model.originPath(n.id, LTDEMO.moments, LTDEMO.edges);
    state.pathIds = new Set(path);
    const idx = new Map(path.map((id, i) => [id, i]));
    state.pathEdges = new Set();
    for (const e of edges) {
      if (e.kind !== 'parent') continue;
      const ia = idx.get(e.a),
        ib = idx.get(e.b);
      if (ia != null && ib != null && Math.abs(ia - ib) === 1) state.pathEdges.add(e.id);
    }
    state.revealEdges = new Set(state.pathEdges);
  }
  function clearSelection() {
    state.selected = null;
    state.pathIds = new Set();
    state.pathEdges = new Set();
    state.revealEdges.clear();
    state.cluster = null;
    $('detail').classList.remove('open');
    setMode('OVERVIEW');
    document.querySelector('.hero').classList.remove('dim');
    syncRibbon();
    scheduleDraw();
  }
  function selectTagCluster(c) {
    cancelPlayback();
    state.cluster = c;
    state.mobileCluster = c.index;
    state.selected = null;
    state.pathIds = new Set();
    state.pathEdges = new Set();
    state.revealEdges = new Set(
      edges
        .filter(e => {
          const ai = TAG_INDEX.get(e.a),
            bi = TAG_INDEX.get(e.b);
          return ai === c.index && bi === c.index;
        })
        .map(e => e.id)
    );
    state.revealStart = performance.now();
    setMode('CLUSTER_PATH_OVERVIEW');
    $('detail').classList.remove('open');
    const hub = { x: c.x, y: c.y };
    state.scale = 1.4;
    state.tx = BOX.x + BOX.w / 2 - hub.x * state.scale;
    state.ty = BOX.y + BOX.h / 2 - hub.y * state.scale;
    document.querySelector('.hero')?.classList.add('dim');
    showRouteStatus(
      `${c.index + 1}묶음 · ${c.name}`,
      state.revealEdges.size
        ? '이 묶음의 순간과 묶음 안에서 이어진 선을 보여 줘요.'
        : '이 묶음의 순간을 밝혀 보여 줘요. 서로 이어진 선은 아직 없어요.'
    );
    syncRibbon();
    scheduleDraw();
    toast(`${c.index + 1}묶음 · ${c.name} 묶음을 봅니다.`);
  }
  function selectMoment(n, center = false) {
    mobilePicker?.select(n.id);
    LTDEMO.select(n.id);
    cancelPlayback(false);
    state.selected = n;
    state.cluster = state.view === 'network' ? CLUSTERS[n.cluster] : null;
    state.mobileCluster = state.view === 'tag' ? (TAG_INDEX.get(n.id) ?? 0) : n.cluster;
    setMode('MOMENT_FOCUS');
    applyPathHighlight(n);
    const p = pathSequenceForNode(n);
    if (center) centerOn(n, state.mobile ? 1.8 : 1.6);
    paintDetail(n);
    $('detail').classList.add('open');
    resize();
    /* 판 너비만큼 판이 줄면 캔버스 크기가 바뀌어 한 프레임 비어 보인다 — 그 자리에서 바로 한 번 그린다. */ typeof draw ===
      'function' && draw();
    const tagName =
      state.view === 'tag'
        ? TAG_CLUSTERS[TAG_INDEX.get(n.id)]?.name
        : state.view === 'time'
          ? dateText(n.date)
          : CLUSTERS[n.cluster]?.name;
    showRouteStatus(
      tagName || '',
      state.view === 'time'
        ? `담은 날짜 순서로 이어진 줄입니다. 첫 순간에서 ${Math.max(0, state.pathIds.size - 1)}단계 지나온 길을 밝힙니다.`
        : `첫 순간에서 ${Math.max(0, state.pathIds.size - 1)}단계 지나온 길을 밝힙니다.`
    );
    /* #951 ⑤: 같은 뜻의 안내를 두 번 보이지 않는다 — 묶음 카드(routeStatus)가 보이는 화면에서는 카드를 남기고
    토스트는 띄우지 않는다(보드 #845와 같은 규칙). 카드가 숨는 좁은 화면에서만 토스트로 알린다. */
    syncRibbon();
    scheduleDraw();
    if (getComputedStyle($('routeStatus')).display === 'none')
      toast('첫 순간에서 이 순간까지 지나온 길을 밝혔어요.');
  }
  /* #951 ⑤: 순간 상세 판 — 보드(#891·#662)와 같은 틀을 쓴다. 판 안: 제목·사진/영상·내가 남긴 마음·날짜와 트리·이어진 순간.
   아래 고정 줄: 크게 보기·여기부터 시네마·⋯ 더 보기. 지도에서 새로 만들지 않고 보드 판의 규칙(한 벌 스크롤·44px 줄)을 그대로 따른다. */
  const escHtml = globalThis.LTEscapeHtml; // A-15: 글자 막기 정본(html-escape.js) 한 벌
  function autoTitleOf(n) {
    const raw = LTDEMO.moments.find(x => x.id === n.id);
    const autoRe = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d{1,5})?에서 간직한 순간$/i;
    const t = String(n.title || '').trim();
    const clean = autoRe.test(t)
      ? String(raw?.mediaMetadata?.title || '').trim() || n.note || '순간'
      : n.title;
    return { raw, clean };
  }
  function detailMediaHTML(n) {
    const m = LTDEMO.moments.find(x => x.id === n.id) || {};
    if (m.url && window.LTMedia)
      return window.LTMedia.markup(m.url, m.title, m.mediaMetadata, m.id, null, null, {
        compact: true
      });
    const img = m.image || m.asset || '';
    if (img)
      return `<img class="detailPhoto" src="${escHtml(img)}" alt="${escHtml(m.title || n.title || '기록한 그림')}">`;
    if (m.video)
      return `<video class="detailVideo" src="${escHtml(m.video)}" controls muted playsinline></video>`;
    return '';
  }
  function paintDetail(n) {
    const { raw, clean } = autoTitleOf(n);
    $('detailKicker').textContent = n.first ? '첫 순간' : '순간';
    $('detailTitle').textContent = clean;
    const sub = String(raw?.mediaMetadata?.title || '').trim(),
      ds = $('detailSub');
    if (ds) {
      const show = !!sub && sub !== clean;
      ds.textContent = show ? '▶ ' + sub : '';
      ds.hidden = !show;
    }
    const player = $('detailPlayer'),
      media = detailMediaHTML(n);
    player.innerHTML = media;
    player.hidden = !media;
    const ytUrl = /youtu/i.test(String(raw?.url || '')) ? raw.url : '';
    const ytRow = $('ytLinkRow');
    if (ytRow) {
      ytRow.hidden = !ytUrl;
      if (ytUrl) $('detailYtLink').href = ytUrl;
    }
    const heart = $('detailNote');
    heart.textContent = n.note || '';
    heart.closest('.section').hidden = !n.note;
    const treeName = document.getElementById('treeTitleText')?.textContent?.trim() || '';
    $('dBasic').innerHTML =
      `<b>${escHtml(n.emotion || '')}</b> · ${escHtml(dateText(n.date))}${n.first ? ' <span class="firstMark" title="첫 순간">●</span>' : ''}${treeName ? ` · ${escHtml(treeName)}` : ''}`;
    const linked = list => list.map(e => ({ e, m: byId[e.to] || byId[e.a] })).filter(x => x.m);
    const outs = linked(LTDEMO.edges.filter(e => e.kind === 'parent' && e.from === n.id));
    const ins = linked(LTDEMO.edges.filter(e => e.kind === 'parent' && e.to === n.id));
    const row = x =>
      `<button type="button" class="connCard" data-id="${escHtml(x.m.id)}"><span class="connName">${escHtml(x.m.title || '순간')}</span>${x.e.reason && x.e.reason !== '관련 순간' ? `<span class="connWhy">${escHtml(x.e.reason)}</span>` : ''}</button>`;
    const pick = outs.length ? outs : ins;
    $('dConn').innerHTML = pick.length
      ? pick.slice(0, 3).map(row).join('')
      : '<span class="connNone">이어진 순간이 아직 없어요</span>';
    /* '여기부터 시네마'는 이 순간에서 이어진 길이 있을 때만 — 보드의 detailButtonState와 같은 뜻이다. */
    const cin = $('cinemaFromMoment'),
      canGo = outs.length > 0;
    cin.disabled = !canGo;
    cin.title = canGo ? '' : '이 순간에서 이어진 길이 없어요';
  }
  function closeDetail() {
    const id = state.selected?.id;
    $('detail').classList.remove('open');
    hideMoreMenu();
    resize();
    typeof draw === 'function' && draw();
    /* 닫은 뒤 초점은 누른 순간(캔버스 위 그 순간)으로 돌아간다 — 캔버스가 그 순간을 이고 있으므로 캔버스로 초점을 돌리고 표시를 남긴다. */
    if (id) canvas.dataset.ltFocusMoment = id;
    canvas.focus({ preventScroll: true });
  }
  function hideMoreMenu() {
    const menu = $('detailMoreMenu'),
      btn = $('detailMoreBtn');
    if (!menu || !btn) return;
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }
  function openViewer() {
    const n = state.selected;
    if (!n) return;
    const { clean } = autoTitleOf(n);
    $('vTitle').textContent = clean;
    const media = detailMediaHTML(n);
    $('viewerMedia').innerHTML =
      media ||
      '<div class="detail-label" style="padding:22px">크게 볼 사진이나 영상이 없어요</div>';
    $('vMeta').textContent = [n.emotion, dateText(n.date), n.note].filter(Boolean).join(' · ');
    const v = $('ltViewer');
    v.classList.add('open');
    v.setAttribute('aria-hidden', 'false');
    $('closeViewer').focus();
  }
  function closeViewer() {
    const v = $('ltViewer');
    v.classList.remove('open');
    v.setAttribute('aria-hidden', 'true');
    $('detailOpen').focus();
  }
  function wireDetail() {
    const back = $('detailClose');
    if (back) back.onclick = closeDetail;
    const open = $('detailOpen');
    if (open) open.onclick = openViewer;
    const closeV = $('closeViewer');
    if (closeV) closeV.onclick = closeViewer;
    const cin = $('cinemaFromMoment');
    if (cin)
      cin.onclick = () => {
        if (cin.disabled) return;
        startPlayback();
      };
    const moreBtn = $('detailMoreBtn'),
      moreMenu = $('detailMoreMenu');
    if (moreBtn && moreMenu) {
      moreBtn.onclick = e => {
        e.stopPropagation();
        const openNow = moreMenu.hidden;
        moreMenu.hidden = !openNow;
        moreBtn.setAttribute('aria-expanded', String(openNow));
      };
    }
    const help = $('detailHelpBtn');
    if (help)
      help.onclick = () => {
        hideMoreMenu();
        $('helpBtn')?.click();
      };
    const conn = $('dConn');
    if (conn)
      conn.onclick = e => {
        const b = e.target.closest?.('.connCard');
        if (!b) return;
        const n = byId[b.dataset.id];
        if (n) {
          closeDetail();
          selectMoment(n, true);
        }
      };
    const viewer = $('ltViewer');
    if (viewer)
      viewer.onclick = e => {
        if (e.target === viewer) closeViewer();
      };
  }
  wireDetail();
  // Esc: 판이 열려 있으면 판만 닫고 초점을 누른 순간으로 돌린다(캔버스의 Esc=선택 풀기보다 먼저 — 캡처 단계).
  addEventListener(
    'keydown',
    e => {
      if (e.key !== 'Escape') return;
      if ($('ltViewer')?.classList.contains('open')) {
        e.preventDefault();
        e.stopPropagation();
        closeViewer();
        return;
      }
      if (
        $('detailMoreMenu') &&
        !$('detailMoreMenu').hidden &&
        !e.target.closest?.('#detailMoreBtn')
      ) {
        e.preventDefault();
        e.stopPropagation();
        hideMoreMenu();
        $('detailMoreBtn')?.focus();
        return;
      }
      if ($('detail')?.classList.contains('open')) {
        e.preventDefault();
        e.stopPropagation();
        closeDetail();
      }
    },
    true
  );
  document.addEventListener('click', e => {
    if ($('detailMoreMenu')?.hidden) return;
    if (e.target.closest?.('#detailMoreBtn') || e.target.closest?.('#detailMoreMenu')) return;
    hideMoreMenu();
  });
  // #461 누르는 범위는 화면 px로 잰다(배치가 화면 좌표라 확대해도 묶음 점이 옆 순간을 가로채지 않게).
  function hubList() {
    return state.view === 'tag'
      ? TAG_CLUSTERS.filter(c => !c.shelf)
      : state.view === 'network'
        ? CLUSTERS
        : [];
  }
  function hitTest(sx, sy) {
    const w = s2w(sx, sy);
    let best = null,
      bd = Infinity;
    const hubs = state.view === 'tag' ? TAG_CLUSTERS : state.view === 'network' ? CLUSTERS : [];
    for (const n of [...nodes, ...anchors, ...hubs]) {
      if (!shouldDrawNode(n)) continue;
      const hub = hubs.includes(n),
        d = Math.hypot(w.x - n.x, w.y - n.y) * state.scale,
        hit = hub ? 16 : n.kind === 'anchor' ? 18 : Math.max(12, dotRadius(n) + 6);
      if (d < hit && d < bd) {
        best = n;
        bd = d;
      }
    }
    return best;
  }
  // #461 점 반지름 한 곳: 그리기·누르기·측정이 같은 값을 쓴다. 배치가 정한 반지름(dotR)에 확대를 조금만(최대 1.6배) 따른다.
  function dotRadius(n) {
    if (n.kind !== 'moment') return Math.max(1.5, n.r * state.scale);
    const base =
      state.view === 'tag'
        ? TAGFIT?.dotR || 5
        : state.view === 'time'
          ? TIMEFIT?.dotR || 5
          : state.view === 'concentric'
            ? CONCENTRIC?.dotR || 4.5
            : NETFIT?.dotR || 5;
    let r = base * Math.max(0.6, Math.min(1.6, state.scale));
    if (n.first) r = Math.max(r * 1.5, 6);
    if (state.selected?.id === n.id || state.play?.currentId === n.id) r += 2;
    return r;
  }
  function shouldDrawNode(n) {
    if (state.view === 'tag' || state.view === 'time')
      return (
        n.kind === 'moment' ||
        TAG_CLUSTERS.includes(n) ||
        (n.kind === 'cluster' && state.view === 'tag')
      );
    if (state.view === 'concentric') return n.kind === 'moment';
    if (!state.mobile) return true;
    if (n.kind === 'cluster')
      return (
        state.mode === 'OVERVIEW' ||
        state.mode === 'ORIGIN_REVEAL' ||
        state.mode === 'CLUSTER_PATH_OVERVIEW' ||
        n.index === state.mobileCluster
      );
    if (state.mode === 'OVERVIEW') return true;
    if (state.mode === 'ORIGIN_REVEAL')
      return n.first || (n.cluster <= 2 && n.level <= 0) || (n.kind === 'anchor' && n.cluster <= 2);
    if (
      state.mode === 'MOMENT_FOCUS' &&
      edges.some(
        e =>
          (e.a === state.selected?.id && e.b === n.id) ||
          (e.b === state.selected?.id && e.a === n.id)
      )
    )
      return true;
    if (['CLUSTER_PATH_OVERVIEW', 'MOMENT_FOCUS', 'PATH_PLAYBACK'].includes(state.mode))
      return n.cluster === state.mobileCluster && (n.level <= 1 || state.selected?.id === n.id);
    return false;
  }
  function edgeSelected(e) {
    if (state.play?.active)
      return state.trail.has(e.id) || state.preview.has(e.id) || state.animEdge?.id === e.id;
    if (state.mode === 'ORIGIN_REVEAL') return state.revealEdges.has(e.id);
    if (state.mode === 'CLUSTER_PATH_OVERVIEW') return state.revealEdges.has(e.id);
    if (state.mode === 'MOMENT_FOCUS') return state.revealEdges.has(e.id);
    return false;
  }
  function edgeAlpha(e) {
    if (state.view === 'time') return 0;
    if (state.view === 'tag')
      return state.mode === 'MOMENT_FOCUS'
        ? state.pathEdges.has(e.id)
          ? LT56Model.pathEmphasis.lit
          : LT56Model.pathEmphasis.dim
        : e.kind === 'parent'
          ? 0.75
          : 0.3;
    if (state.view === 'concentric')
      return state.mode === 'MOMENT_FOCUS'
        ? state.pathEdges.has(e.id)
          ? LT56Model.pathEmphasis.lit
          : LT56Model.pathEmphasis.dim
        : e.kind === 'parent'
          ? 0.55
          : 0.16;
    if (state.play?.active) {
      if (state.animEdge?.id === e.id) return 1;
      if (state.trail.has(e.id)) return 0.82;
      if (state.preview.has(e.id)) return 0.26;
      return 0.035;
    }
    if (state.mode === 'ORIGIN_REVEAL')
      return state.revealEdges.has(e.id) ? (e.kind === 'origin' ? 1 : 0.8) : 0.07;
    if (state.mode === 'CLUSTER_PATH_OVERVIEW')
      return state.revealEdges.has(e.id)
        ? ['parent', 'related', 'primary', 'secondary'].includes(e.kind)
          ? 0.86
          : 0.48
        : 0.055;
    if (state.mode === 'MOMENT_FOCUS')
      return state.pathEdges.has(e.id) ? LT56Model.pathEmphasis.lit : LT56Model.pathEmphasis.dim;
    if (state.mode === 'OVERVIEW' && ['parent', 'related'].includes(e.kind)) return 0.68;
    if (state.mode === 'OVERVIEW')
      return e.kind === 'cross'
        ? 0.035
        : e.kind === 'support'
          ? 0.055
          : e.kind === 'bridge' || e.kind === 'bridgeSecondary'
            ? 0.14
            : 0.12;
    return 0.1;
  }
  function nodeAlpha(n) {
    if (state.view === 'tag' || state.view === 'time') {
      if (n.first) return 1;
      if (state.mode === 'MOMENT_FOCUS')
        return state.pathIds.has(n.id)
          ? LT56Model.pathEmphasis.litNode
          : LT56Model.pathEmphasis.dimNode;
      return 0.9;
    }
    if (state.view === 'concentric') {
      if (n.first) return 1;
      if (state.mode === 'MOMENT_FOCUS')
        return state.pathIds.has(n.id)
          ? LT56Model.pathEmphasis.litNode
          : LT56Model.pathEmphasis.dimNode;
      return 0.85;
    }
    if (state.play?.active) {
      if (state.play.currentId === n.id) return 1;
      if (state.play.seq?.includes(n.id)) return 0.72;
      if (n.cluster === state.mobileCluster) return 0.18;
      return 0.07;
    }
    if (state.mode === 'ORIGIN_REVEAL') {
      if (n.first) return 1;
      if (n.kind === 'cluster' && n.index <= 2) return 0.95;
      if (n.cluster <= 2 && n.level <= 1) return 0.76;
      return 0.12;
    }
    if (state.mode === 'CLUSTER_PATH_OVERVIEW')
      return n.cluster === state.mobileCluster ? 0.9 : 0.13;
    if (state.mode === 'MOMENT_FOCUS') {
      if (n.first) return 1;
      if (state.pathIds.has(n.id)) return LT56Model.pathEmphasis.litNode;
      return LT56Model.pathEmphasis.dimNode;
    }
    return n.level === 2 ? 0.42 : 0.76;
  }
  function bezierGeometry(a, b, e) {
    return LT56Model.bezierGeometry(w2s(a.x, a.y), w2s(b.x, b.y), e.kind);
  }
  function pointBezier(g, t) {
    const u = 1 - t;
    return {
      x: u * u * u * g.A.x + 3 * u * u * t * g.cp1.x + 3 * u * t * t * g.cp2.x + t * t * t * g.B.x,
      y: u * u * u * g.A.y + 3 * u * u * t * g.cp1.y + 3 * u * t * t * g.cp2.y + t * t * t * g.B.y
    };
  }
  function drawBezier(g, t = 1) {
    ctx.beginPath();
    let p = g.A;
    ctx.moveTo(p.x, p.y);
    const steps = Math.max(8, Math.floor(24 * t));
    for (let i = 1; i <= steps; i++) {
      const q = pointBezier(g, (t * i) / steps);
      ctx.lineTo(q.x, q.y);
      DRAWN_EDGE_SEGMENTS.push({ a: p, b: q, pad: 2 + ctx.lineWidth / 2 });
      p = q;
    }
    ctx.stroke();
  }
  function revealFactor(e) {
    if (!state.revealEdges.has(e.id) || state.revealStart === 0 || reduced) return 1;
    const elapsed = performance.now() - state.revealStart;
    let order = 0;
    if (e.kind === 'origin') order = (e.originGroup || 1) - 1;
    else order = Math.min(8, e.order || 0) + 2 + (e.cluster || 0) * 0.2;
    return clamp((elapsed - order * 95) / 620, 0, 1);
  }
  // 선택한 길은 묶음색·후광으로, 나머지는 중성색으로 구분한다. 투명도를 낮춰 대비를 잃지 않게 한다.
  function drawEdge(e) {
    const a = byId[e.a],
      b = byId[e.b];
    if (!a || !b) return;
    if (state.view === 'time') return;
    if (
      (state.view === 'tag' || state.view === 'concentric') &&
      e.kind !== 'parent' &&
      e.kind !== 'related'
    )
      return;
    if (state.mobile) {
      if (state.mode === 'ORIGIN_REVEAL' && !(e.cluster <= 2 || e.kind === 'origin')) return;
      /* #601 묶음 보기(좁은 화면): 묶음 안에서 실제 이어진 선만 그린다 — 묶음에 닿는 다른 선까지
종이 판의 알파 하한(.95)으로 끄집어내면 지도가 회색보가 되어 이름표를 읽을 수 없다(대비 시험 실측). */ if (
        state.view === 'network' &&
        state.mode === 'CLUSTER_PATH_OVERVIEW' &&
        !(state.revealEdges.has(e.id) || e.kind === 'origin')
      )
        return;
      if (
        state.view === 'network' &&
        ['MOMENT_FOCUS', 'PATH_PLAYBACK'].includes(state.mode) &&
        e.cluster !== state.mobileCluster &&
        byId[e.b]?.cluster !== state.mobileCluster &&
        e.kind !== 'origin'
      )
        return;
      if (
        state.mode === 'OVERVIEW' &&
        !['parent', 'related', 'bridge', 'bridgeSecondary', 'origin'].includes(e.kind)
      )
        return;
    }
    const A = w2s(a.x, a.y),
      B = w2s(b.x, b.y);
    if (!visible(A, 220) && !visible(B, 220)) return;
    const rawAlpha = edgeAlpha(e),
      al = paintAlpha(rawAlpha, 'edge-alpha-min');
    if (state.mobile && al < 0.05) return;
    const selected = edgeSelected(e),
      baseColor =
        state.mode !== 'OVERVIEW' && rawAlpha < 0.5
          ? paint('context')
          : selected
            ? e.kind === 'origin'
              ? PALETTE()[Math.max(0, (e.originGroup || 1) - 1)]
              : colorOf(a)
            : e.kind === 'related'
              ? paint('related')
              : e.kind === 'parent'
                ? colorOf(a)
                : paint('edge'),
      rgb = hexRgb(baseColor);
    ctx.strokeStyle = `rgba(${rgb.join(',')},${al})`;
    ctx.lineWidth =
      (selected
        ? 1.9
        : ['parent', 'related'].includes(e.kind)
          ? 1.7
          : e.kind === 'primary'
            ? 1.0
            : e.kind === 'secondary'
              ? 0.82
              : 0.66) * Math.max(0.72, Math.min(1.6, state.scale));
    if (selected) {
      ctx.shadowColor = baseColor;
      ctx.shadowBlur = 5;
    } else ctx.shadowBlur = 0;
    drawBezier(bezierGeometry(a, b, e), revealFactor(e));
    if (e.kind === 'parent' && al >= 0.14) {
      /* #366 흐름 방향: 이전 순간→다음 순간. 흐르는 점선 없이 정적 화살표(유휴 rAF 0 유지). */ const g =
          bezierGeometry(a, b, e),
        q = LT56Model.bezierPoint(g, 0.62),
        ang = Math.atan2(q.dy, q.dx);
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate(ang);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.moveTo(4.6, 0);
      ctx.lineTo(-3.4, -3);
      ctx.lineTo(-3.4, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.shadowBlur = 0;
  }
  function drawNode(n) {
    if (!shouldDrawNode(n)) return;
    const p = w2s(n.x, n.y);
    if (!visible(p, 90)) return;
    const rawAlpha = nodeAlpha(n),
      al = paintAlpha(rawAlpha, 'node-alpha-min'),
      nodeColor = state.mode !== 'OVERVIEW' && rawAlpha < 0.5 ? paint('context') : colorOf(n),
      // 작은 꼬리표 점은 밝은 판에서 가장자리 혼합으로 대비가 약해진다.
      // 점을 그리는 색만 진하게 하여 묶음 색의 관계와 공용 토큰을 유지한다.
      rgb = hexRgb(nodeColor).map(v =>
        state.mobile && state.view === 'tag' && readPlate() === 'paper' ? Math.round(v * 0.85) : v
      ),
      sel = state.selected?.id === n.id || state.play?.currentId === n.id,
      hov = state.hover?.id === n.id;
    let r = dotRadius(n);
    if (n.kind === 'anchor') r *= 1.05;
    if (sel || hov) {
      ctx.fillStyle = `rgba(${rgb.join(',')},.11)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    const tr = dotThumbOf(n, r, rawAlpha);
    ctx.strokeStyle = `rgba(${rgb.join(',')},${Math.min(1, al + 0.1)})`;
    ctx.lineWidth = n.kind === 'anchor' || n.level === 0 ? 1.05 : 0.6;
    ctx.shadowColor = nodeColor;
    ctx.shadowBlur = sel ? 15 : n.level === 0 && al > 0.6 ? 5 : 0;
    if (tr) {
      /* 사진은 점 자리에 작은 원으로 — 테두리는 지금 점 색(고른 점은 강조색). 그림자 없이 또렷하게. */ ctx.shadowBlur = 0;
      const im = thumbs.get(n.id).img,
        s = Math.min(im.naturalWidth, im.naturalHeight);
      ctx.save();
      ctx.globalAlpha = al;
      ctx.beginPath();
      ctx.arc(p.x, p.y, tr, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(
        im,
        (im.naturalWidth - s) / 2,
        (im.naturalHeight - s) / 2,
        s,
        s,
        p.x - tr,
        p.y - tr,
        tr * 2,
        tr * 2
      );
      ctx.restore();
      THUMB_RECTS.push({ x: p.x - tr, y: p.y - tr, w: tr * 2, h: tr * 2 });
      ctx.globalAlpha = al;
      ctx.strokeStyle = `rgba(${rgb.join(',')},${Math.min(1, al + 0.35)})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, tr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = sel ? paint('selected') : `rgba(${rgb.join(',')},${al})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.5, r), 0, Math.PI * 2);
      ctx.fill();
      if (n.kind === 'anchor' || n.level === 0) ctx.stroke();
    }
    ctx.shadowBlur = 0;
    if (n.first) {
      /* #366 첫 순간 강조: 크게·고리 두 겹. '여기서 시작'은 이름표(#461 drawLabels)가 다른 글자와 겹치지 않는 자리에 붙인다. */ ctx.fillStyle =
        rgba(paint('first-glow'), 0.15);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(paint('first-inner'), 0.95);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = rgba(PALETTE()[0], paintAlpha(0.7, 'first-alpha-min'));
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (n.kind === 'moment' && n.level === 0 && pathById[n.pathId]?.branchAt === n.indexInPath) {
      ctx.strokeStyle = `rgba(${rgb.join(',')},${al * 0.65})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    const macro = state.scale < 0.47;
    if (!macro && n.kind === 'anchor') {
      ctx.font = '600 9px Pretendard,sans-serif';
      ctx.fillStyle = paint('anchor-text');
      ctx.textAlign = 'left';
      ctx.fillText(n.label, p.x + r + 7, p.y + 3);
    }
  }
  function drawHub(c) {
    if (state.view === 'concentric' || state.view === 'time') return;
    if (state.view === 'tag' && TAGFIT?.empty) return;
    const p = w2s(c.x, c.y);
    if (!visible(p, 150)) return;
    /* #366 길 강조 중엔 묶음 점도 흐리게(화면 밖이면 알파를 건드리지 않는다) */ if (
      state.mode === 'MOMENT_FOCUS'
    )
      ctx.globalAlpha = paintAlpha(LT56Model.pathEmphasis.hubDim, 'hub-alpha-min');
    const active =
      (state.mode === 'CLUSTER_PATH_OVERVIEW' && state.mobileCluster === c.index) ||
      (state.mode === 'ORIGIN_REVEAL' && c.index <= 2);
    const rgb = hexRgb(colorOf(c)),
      r = Math.max(0.5, c.hubR * state.scale);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.5);
    g.addColorStop(0, `rgba(${rgb.join(',')},${active ? 0.16 : 0.05})`);
    g.addColorStop(1, `rgba(${rgb.join(',')},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = active ? paint('hub-active') || `rgba(${rgb.join(',')},.90)` : paint('hub');
    ctx.strokeStyle = `rgba(${rgb.join(',')},${paintAlpha(active ? 0.94 : 0.36, 'hub-border-alpha-min')})`;
    ctx.lineWidth = active ? 1.6 : 1.1;
    ctx.shadowColor = colorOf(c);
    ctx.shadowBlur = active ? 9 : 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(8, r), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = active ? paint('hub-active-text') : paint('hub-text');
    ctx.font = '700 12px Pretendard,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(c.index + 1).padStart(2, '0'), p.x, p.y + 4);
    /* #461 묶음 이름은 이름표(drawLabels)가 겹치지 않는 자리에 붙인다 */ ctx.globalAlpha = 1;
  }
  // #461 이름표: 멀리서(전체 보기)는 첫 순간·갈림길·선택한 길·묶음 이름만 짧게, 가까이(1.35배 이상)는 모든 순간을.
  // 자리는 LT56Model.placeLabels 한 벌이 고른다 — 다른 이름표·점과 겹치는 자리에는 붙이지 않는다. 글씨 12px.
  const LABEL_PX = 12;
  let LAST_LABELS = [];
  let DRAWN_EDGE_SEGMENTS = [];
  let THUMB_RECTS = [];
  /* #951 (CTO 261120): 이름표를 글자 수로 자르면 남은 폭이 있어도 'Ditto …'로 잘렸다.
   남은 폭(BOX)에 맞춰 재어 자르고, 짧은 이름은 그대로 다 보인다 — 이름표끼리 겹침은 placeLabels가 지킨다. */
  function fitLabel(t) {
    const cap = Math.max(96, Math.min(BOX.w - 16, state.scale >= 1.35 ? 360 : 240));
    if (ctx.measureText(t).width <= cap) return t;
    let s = String(t);
    while (s.length > 1 && ctx.measureText(`${s}…`).width > cap) s = s.slice(0, -1);
    return `${s}…`;
  }
  function labelCands() {
    const near = state.scale >= 1.35,
      max = near ? 40 : 40,
      out = [];
    ctx.font = `600 ${LABEL_PX}px Pretendard,sans-serif`;
    const h = Math.round(LABEL_PX * 1.3);
    const centerOf = n =>
      state.view === 'time'
        ? w2s(BOX.x + BOX.w / 2, BOX.y + BOX.h / 2)
        : state.view === 'tag'
          ? TAGFIT?.empty
            ? w2s(BOX.x + BOX.w / 2, BOX.y + BOX.h / 2)
            : w2s(
                TAG_CLUSTERS[TAG_INDEX.get(n.id)]?.x ?? n.x,
                TAG_CLUSTERS[TAG_INDEX.get(n.id)]?.y ?? n.y
              )
          : state.view === 'concentric'
            ? w2s(CONCENTRIC.center.x, CONCENTRIC.center.y)
            : NETFIT?.fan
              ? w2s(NETFIT.center.x, NETFIT.center.y)
              : w2s(CLUSTERS[n.cluster]?.x ?? n.x, CLUSTERS[n.cluster]?.y ?? n.y);
    const dirOf = (p, c) => {
      const dx = p.x - c.x,
        dy = p.y - c.y,
        d = Math.hypot(dx, dy);
      return d < 1 ? { x: 0, y: -1 } : { x: dx / d, y: dy / d };
    };
    const pri = n =>
      n.first
        ? 0
        : state.selected?.id === n.id
          ? 1
          : state.pathIds.has(n.id)
            ? 2
            : BRANCH.has(n.id)
              ? 3
              : 5;
    // #601: 점 이름표는 한 줄 제목이다. 빠른 추가의 자동 제목('youtube.com에서 간직한 순간')은 제목이 아니므로
    // LT56Model.labelTitle이 영상 제목·마음 한마디를 먼저 쓰고 정말 없을 때만 사이트 이름을 보인다('youtub…' 버그 잡기).
    // 고른 순간의 이름표는 줄이지 않고 전체 제목을 보인다.
    const titleOf = n => LT56Model.labelTitle(n) || '순간';
    // #951 ②: 순간이 적으면(≤8) 멀리서도 모든 순간에 이름표를 붙인다 — 예전에는 pri<5(첫 순간·갈림길·고른 길)만
    // 후보가 되어 순간 3개짜리 트리에서 1개가 이름표 없이 남았다.
    const SMALL = LTDEMO.moments.length <= 8;
    const moments = nodes
      .filter(n => n.kind === 'moment' && shouldDrawNode(n) && (near || SMALL || pri(n) < 5))
      .sort((a, b) => pri(a) - pri(b) || nodes.indexOf(a) - nodes.indexOf(b));
    const push = (n, text, p, r, dir, only) => {
      if (!visible(p, 0)) return;
      const lines = [text];
      const cap = Math.max(80, BOX.w - 16);
      if (n.first && ctx.measureText(text).width > cap) {
        lines.length = 0;
        let line = '';
        for (const ch of text) {
          if (line && ctx.measureText(line + ch).width > cap) { lines.push(line.trimEnd()); line = ''; }
          line += ch;
        }
        if (line) lines.push(line.trimStart());
      }
      const w = Math.max(...lines.map(line => ctx.measureText(line).width));
      out.push({ id: n.id, text, lines, x: p.x, y: p.y, r, w, h: h * lines.length, lineH: h, dir, only, tw: 0, avoidEdges: !!n.first });
    };
    for (const n of moments.filter(n => pri(n) <= 1)) {
      const p = w2s(n.x, n.y);
      const t = titleOf(n);
      const full = state.selected?.id === n.id;
      push(
        n,
        n.first
          ? `여기서 시작 · ${full ? t : LT56Model.shortTitle(t, max)}`
          : full
            ? t
            : fitLabel(t),
        p,
        dotRadius(n) + (n.first ? 9 : 0),
        dirOf(p, centerOf(n))
      );
    }
    if (state.view === 'network')
      CLUSTERS.forEach(c => {
        if (!shouldDrawNode(c)) return;
        const p = w2s(c.x, c.y);
        push(c, c.name, p, Math.max(8, c.hubR * state.scale), { x: 0, y: 1 }, false);
      });
    if (state.view === 'tag' && !TAGFIT?.empty)
      TAG_CLUSTERS.filter(c => !c.shelf).forEach(c => {
        if (!shouldDrawNode(c)) return;
        const p = w2s(c.x, c.y);
        push(c, c.name, p, Math.max(10, c.hubR * state.scale), { x: 0, y: 1 }, false);
      });
    for (const n of moments.filter(n => pri(n) > 1)) {
      const p = w2s(n.x, n.y);
      push(
        n,
        state.selected?.id === n.id ? titleOf(n) : fitLabel(titleOf(n)),
        p,
        dotRadius(n),
        dirOf(p, centerOf(n))
      );
    }
    return out;
  }
  // #601 점 썸네일: 보드와 같은 한 벌(network-thumb.mjs가 심는 LTThumbFallback)에서 후보를 얻어 캔버스에 직접 올린다.
  // 바깥 그림은 crossOrigin으로만(캔버스 오염 없이 — 대비·지문 시험이 픽셀을 읽는다), 회색 대체 그림(120×90)은 쓰지 않는다.
  // 이름표를 그릴 때 처음 부른 순간만 읽어 오고, 읽힌 뒤 한 번 다시 그린다(유휴 반복 없음).
  /* #951 ③ (CTO 261120): 점 자리에 순간 썸네일을 올린다 — 작은 원, 테두리는 지금 점 색.
   화면에 그리는 순간만, 한 번에 60장까지만 읽는다(이미 있는 주소만 — 새 요청 0, 지연 로드).
   그림이 없거나 못 읽으면 지금의 점 그대로(깨진 그림 0). */
  const DOT_THUMB_MAX = 60,
    THUMB_MIN_R = 4.2,
    THUMB_MIN_AL = 0.6;
  function dotThumbOf(n, r, rawAlpha) {
    // 흐린(문맥) 점은 사진을 올리지 않는다 — 흐린 상태의 점 색(paint('context'))은 일부러 조용해서
    // 사진 테두리로 쓰면 대비가 모자란다(대비 시험 실측 paper 1.09:1). 그때는 예전처럼 점 하나로 둔다.
    if (
      n.kind !== 'moment' ||
      r < THUMB_MIN_R ||
      !(state.mode === 'OVERVIEW' || rawAlpha >= THUMB_MIN_AL)
    )
      return 0;
    if (!thumbs.has(n.id) && thumbs.size >= DOT_THUMB_MAX) return 0;
    const entry = requestThumb(n.id);
    return entry?.ok && entry.img?.naturalWidth ? Math.max(9, r + 4) : 0;
  }
  const thumbs = new Map();
  // 썸네일 한 벌(LTThumbFallback)은 모듈이라 지도 첫 그림 뒤에 도착한다 — 도착 신호에서 죽은 요청을 지우고 한 번 다시 그린다.
  if (!globalThis.LTThumbFallback)
    addEventListener(
      'lt41-map-thumbs-ready',
      () => {
        thumbs.clear();
        scheduleDraw();
      },
      { once: true }
    );
  function thumbCandidatesOf(id) {
    const m = LTDEMO.moments.find(x => x.id === id),
      api = globalThis.LTThumbFallback;
    if (!m || !api) return [];
    try {
      return api.thumbnailCandidates(m, { autoLoad: true }) || [];
    } catch {
      return [];
    }
  }
  function requestThumb(id) {
    if (thumbs.has(id)) return thumbs.get(id);
    const entry = { img: null, ready: false, ok: false };
    thumbs.set(id, entry);
    const src = thumbCandidatesOf(id)[0] || '';
    if (!src) {
      thumbs.delete(id);
      return entry;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let gray = false;
      try {
        gray =
          typeof globalThis.LTThumbFallback?.isGrayThumbnail === 'function' &&
          globalThis.LTThumbFallback.isGrayThumbnail(img);
      } catch {}
      if (gray) {
        entry.ready = true;
        return;
      }
      entry.ok = true;
      entry.ready = true;
      scheduleDraw();
    };
    img.onerror = () => {
      entry.ready = true;
    };
    img.src = src;
    entry.img = img;
    return entry;
  }
  function drawLabels() {
    const obstacles = nodes
      .filter(n => n.kind === 'moment' && shouldDrawNode(n))
      .map(n => {
        const p = w2s(n.x, n.y);
        return { id: n.id, x: p.x, y: p.y, r: dotRadius(n) + (n.first ? 9 : 0) };
      });
    if (state.view === 'network')
      CLUSTERS.forEach(c => {
        if (shouldDrawNode(c)) {
          const p = w2s(c.x, c.y);
          obstacles.push({ id: c.id, x: p.x, y: p.y, r: Math.max(8, c.hubR * state.scale) });
        }
      });
    if (state.view === 'tag' && !TAGFIT?.empty)
      TAG_CLUSTERS.filter(c => !c.shelf).forEach(c => {
        if (shouldDrawNode(c)) {
          const p = w2s(c.x, c.y);
          obstacles.push({ id: c.id, x: p.x, y: p.y, r: Math.max(10, c.hubR * state.scale) });
        }
      });
    const b = { x: BOX.x - 12, y: BOX.y - 12, w: BOX.w + 24, h: BOX.h + 24 };
    LAST_LABELS = LT56Model.placeLabels(labelCands(), obstacles, b, { segments: DRAWN_EDGE_SEGMENTS });
    ctx.font = `600 ${LABEL_PX}px Pretendard,sans-serif`;
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = paint('label-outline');
    for (const l of LAST_LABELS) {
      const n = byId[l.id];
      const dim =
        n?.kind === 'moment' &&
        state.mode === 'MOMENT_FOCUS' &&
        !state.pathIds.has(n.id) &&
        state.selected?.id !== n.id;
      ctx.globalAlpha = dim ? paintAlpha(0.45, 'label-alpha-min') : 1;
      /* #951 ③: 사진은 점 자리로 옮겼다 — 이름표는 글자만 쓴다. */
      const tx = l.x;
      ctx.fillStyle = n?.kind === 'cluster' ? paint('cluster-text') : paint('text');
      for (const [i, line] of (l.lines || [l.text]).entries()) {
        const y = l.y + i * (l.lineH || LABEL_PX);
        ctx.strokeText(line, tx, y);
        ctx.fillText(line, tx, y);
      }
    }
    ctx.globalAlpha = 1;
    /* 이름표가 없는 순간에 올리면 그 순간 전체 제목(#601 — 줄임 없이). */ const hv = state.hover;
    if (hv && !state.mobile && !LAST_LABELS.some(l => l.id === hv.id)) {
      const p = w2s(hv.x, hv.y);
      ctx.fillStyle = paint('text');
      const t = LT56Model.labelTitle(hv) || '순간';
      ctx.strokeText(t, p.x + dotRadius(hv) + 6, p.y + 4);
      ctx.fillText(t, p.x + dotRadius(hv) + 6, p.y + 4);
    }
  }
  // #1095: 동심원 안내 원은 없앴다(묶음은 꼬리표 거품, 시간 순은 날짜 줄). 옛 함수 이름만 남겨 대비 검사를 깨지 않는다.
  function drawRings() {
    if (state.view !== 'concentric' || !CONCENTRIC) return;
    const c = w2s(CONCENTRIC.center.x, CONCENTRIC.center.y);
    ctx.save();
    ctx.strokeStyle = paint('ring');
    ctx.lineWidth = 1;
    for (let L = 1; L <= CONCENTRIC.maxLevel; L++) {
      const r = CONCENTRIC.radii[L];
      if (!(r > 0)) continue;
      ctx.beginPath();
      ctx.ellipse(
        c.x,
        c.y,
        r * CONCENTRIC.sx * state.scale,
        r * CONCENTRIC.sy * state.scale,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawTimeLine() {
    if (state.view !== 'time' || !TIMEFIT) return;
    const a = w2s(BOX.x + (BOX.w - Math.max(40, BOX.w - 2 * (16 + 5))) / 2, TIMEFIT.y),
      b = w2s(BOX.x + (BOX.w + Math.max(40, BOX.w - 2 * (16 + 5))) / 2, TIMEFIT.y);
    ctx.save();
    ctx.strokeStyle = paint('edge');
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const order = TIMEFIT.order || [];
    for (let i = 0; i < order.length - 1; i++) {
      const p0 = byId[order[i]],
        p1 = byId[order[i + 1]];
      if (!p0 || !p1) continue;
      const A = w2s(p0.x, p0.y),
        B = w2s(p1.x, p1.y);
      ctx.save();
      ctx.strokeStyle =
        paintAlpha(state.pathEdges.size ? paint('selected') : paint('edge'), 0) || paint('edge');
      ctx.lineWidth = 1.2;
      ctx.globalAlpha =
        state.mode === 'MOMENT_FOCUS'
          ? state.pathIds.has(p0.id) && state.pathIds.has(p1.id)
            ? 0.95
            : 0.35
          : 0.55;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  function drawPlaybackOrb() {
    if (!state.animEdge) return;
    const a = byId[state.animEdge.a],
      b = byId[state.animEdge.b],
      g = bezierGeometry(a, b, state.animEdge),
      p = pointBezier(g, state.animT),
      rgb = hexRgb(colorOf(a));
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 17);
    grad.addColorStop(0, paint('orb'));
    grad.addColorStop(0.22, `rgba(${rgb.join(',')},.92)`);
    grad.addColorStop(1, `rgba(${rgb.join(',')},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 17, 0, Math.PI * 2);
    ctx.fill();
  }
  function draw() {
    THUMB_RECTS = [];
    DRAWN_EDGE_SEGMENTS = [];
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, vh);
    bg.addColorStop(0, paint('bg-top'));
    bg.addColorStop(0.55, paint('bg-middle'));
    bg.addColorStop(1, paint('bg-bottom'));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, vw, vh);
    drawRings();
    drawTimeLine();
    edges.forEach(drawEdge);
    if (state.view === 'tag') TAG_CLUSTERS.forEach(drawHub);
    else if (state.view === 'network') CLUSTERS.forEach(drawHub);
    if (state.view === 'network') {
      anchors.forEach(drawNode);
    }
    nodes.forEach(drawNode);
    drawLabels();
    drawPlaybackOrb();
    ctx.restore();
  }
  // #366 성능 원칙(#346): 유휴 rAF 0 — 상태가 바뀔 때 한 번 그리고, 재생·등장 연출 동안만 프레임을 반복한다.
  let rafPending = 0;
  const REVEAL_TOTAL = 1600;
  function revealAnimating() {
    return state.revealStart > 0 && performance.now() - state.revealStart < REVEAL_TOTAL;
  }
  function animating() {
    return !!state.play?.active || !!state.animEdge || revealAnimating();
  }
  function scheduleDraw() {
    if (!rafPending) rafPending = requestAnimationFrame(frame);
  }
  function frame(now) {
    rafPending = 0;
    if (state.play?.active && state.animEdge && !state.branchPause) {
      state.animT += (now - last) / (reduced ? 80 : 760);
      if (state.animT >= 1) {
        state.animT = 1;
        playbackArrive();
      }
    }
    last = now;
    draw();
    if (animating()) rafPending = requestAnimationFrame(frame);
  }
  function showRouteStatus(title, text) {
    $('routeStatusTitle').textContent = title;
    $('routeStatusText').textContent = text;
    $('routeStatus').classList.add('show');
    placeToast();
  }
  function hideRouteStatus() {
    if (state.mode === 'OVERVIEW') $('routeStatus').classList.remove('show');
    placeToast();
  }
  /* #951 ⑤: 좁은 화면 토스트 자리 — 아래 묶음 단추 줄 바로 위(위 단추 줄·순간 고르기 줄을 덮지 않는다).
   시트가 열려 있으면 시트 아래 끝이 토스트 높이+8만큼 물러나 자리를 만든다(시트 위 끝은 그대로).
   경로 갈림 판이 열려 있으면 그 판 위로 올린다. 넓은 화면은 아래 가운데 그대로. */
  let toastSheetExtra = 0;
  function sheetBottomBase() {
    const r = document.querySelector('.mobile-ribbon');
    const b = r && getComputedStyle(r).display !== 'none' ? r.getBoundingClientRect() : null;
    return b ? vh - b.top + 8 : 104;
  }
  function placeToast() {
    const el = $('toast');
    const on = el.classList.contains('show');
    if (!state.mobile) {
      /* #951 ⑥: 넓은 화면 토스트는 아래 단추 줄 위 — 묶음 카드가 보이면 그 카드 위(겹침 0). */
      el.style.top = '';
      const rb = document.querySelector('.mobile-ribbon'),
        r = rb && getComputedStyle(rb).display !== 'none' ? rb.getBoundingClientRect() : null;
      const card = $('routeStatus'),
        cardOn = card.classList.contains('show') && getComputedStyle(card).display !== 'none';
      el.style.bottom =
        (cardOn ? vh - card.getBoundingClientRect().top + 8 : r ? vh - r.top + 8 : 80) + 'px';
      toastSheetExtra = 0;
      return;
    }
    el.style.top = 'auto';
    const base = sheetBottomBase(),
      chooser = $('branchChooser'),
      chooserOpen = chooser.classList.contains('open');
    el.style.bottom =
      (on && chooserOpen ? Math.max(base, vh - chooser.getBoundingClientRect().top + 8) : base) +
      'px';
    const extra =
      on && !chooserOpen && document.querySelector('#detail.open') ? el.offsetHeight + 8 : 0;
    if (extra !== toastSheetExtra) {
      toastSheetExtra = extra;
      document.documentElement.style.setProperty(
        '--lt-sheet-bottom',
        (base + extra).toFixed(0) + 'px'
      );
    }
  }
  function toast(t) {
    const el = $('toast');
    el.textContent = t;
    el.classList.add('show');
    clearTimeout(toast.t);
    placeToast();
    toast.t = setTimeout(() => {
      el.classList.remove('show');
      placeToast();
    }, 2300);
  }
  function cancelPlayback(resetMode = true) {
    state.play = null;
    state.animEdge = null;
    state.animT = 0;
    state.trail.clear();
    state.preview.clear();
    state.branchPause = false;
    $('branchChooser').classList.remove('open');
    if (resetMode && state.mode === 'PATH_PLAYBACK')
      setMode(state.selected ? 'MOMENT_FOCUS' : 'CLUSTER_PATH_OVERVIEW');
    scheduleDraw();
  }
  function routeEdges(pid) {
    return LT56Model.routeEdges(pid, pathById, edges);
  }
  // 재생은 예시 판본에서만 연다. 실제 기록에는 경로 순서 데이터가 따로 없어(pathById는 두 판본 모두
  // 묶음에서 만든다) 데이터만으로 가를 수 없다 — 판단은 이 한 곳에서 한다.
  const canPlay = LTDEMO.example;
  function startPlayback() {
    const n = state.selected;
    if (!n) {
      toast('먼저 순간을 선택하세요.');
      return;
    }
    if (!canPlay) {
      toast('실제 연결은 상단 부모·자식 및 관련 순간에서 선택하세요.');
      return;
    }
    let p = pathSequenceForNode(n);
    if (!p || p.nodes.length < 2) {
      toast('이 순간는 맥락 노드입니다. 주요 경로 순간를 선택하세요.');
      return;
    }
    cancelPlayback(false);
    const start = Math.max(0, p.nodes.indexOf(n.id));
    const seq = p.nodes.slice(start);
    if (seq.length < 4 && start > 0) {
      p = pathById[p.id];
      state.selected = byId[p.nodes[0]];
    }
    state.play = {
      active: true,
      pathId: p.id,
      seq: p.nodes.slice(Math.max(0, p.nodes.indexOf(state.selected.id))),
      index: 0,
      currentId: state.selected.id
    };
    if (state.play.seq.length < 4) state.play.seq = p.nodes.slice(0);
    state.play.currentId = state.play.seq[0];
    state.mobileCluster = p.cluster;
    setMode('PATH_PLAYBACK');
    state.preview = new Set(routeEdges(p.id).map(e => e.id));
    showRouteStatus(
      `경로 재생 · ${p.label}`,
      `${state.play.seq.length}개 순간 sequence · 지나온 길 / 현재 / 앞으로 갈 길을 함께 유지합니다.`
    );
    $('detail').classList.remove('open');
    nextPlaybackEdge();
  }
  function nextPlaybackEdge() {
    if (!state.play?.active) return;
    const p = pathById[state.play.pathId],
      seq = state.play.seq,
      i = state.play.index;
    if (i >= seq.length - 1) {
      state.play.active = false;
      state.animEdge = null;
      toast('이 감정 경로의 끝까지 도착했습니다.');
      showRouteStatus(`도착 · ${p.label}`, `${seq.length}개의 순간를 연속으로 따라왔습니다.`);
      scheduleDraw();
      return;
    }
    const currentId = seq[i],
      nextId = seq[i + 1],
      e = edges.find(e => e.a === currentId && e.b === nextId && e.pathId === state.play.pathId);
    if (!e) {
      state.play.index++;
      nextPlaybackEdge();
      return;
    }
    state.animEdge = e;
    state.animT = 0;
    state.preview.delete(e.id);
    state.play.currentId = currentId;
    const cur = byId[currentId];
    if (cur) toast(cur.why);
    scheduleDraw();
  }
  function playbackArrive() {
    if (!state.play) return;
    const e = state.animEdge;
    state.trail.add(e.id);
    state.play.index++;
    state.play.currentId = e.b;
    state.selected = byId[e.b];
    state.animEdge = null;
    state.animT = 0;
    scheduleDraw();
    const p = pathById[state.play.pathId],
      idxInPath = p.nodes.indexOf(e.b),
      children = idxInPath === p.branchAt ? p.children : [];
    if (children?.length) {
      state.branchPause = true;
      openBranchChooser(p, children);
      return;
    }
    setTimeout(nextPlaybackEdge, reduced ? 0 : 240);
  }
  function openBranchChooser(p, children) {
    const box = $('branchOptions');
    box.innerHTML = '';
    const continueBtn = document.createElement('button');
    continueBtn.textContent = `주경로 계속 · ${p.label}`;
    continueBtn.onclick = () => {
      state.branchPause = false;
      $('branchChooser').classList.remove('open');
      nextPlaybackEdge();
    };
    box.appendChild(continueBtn);
    children.forEach(pid => {
      const cp = pathById[pid],
        b = document.createElement('button');
      b.textContent = `분기 선택 · ${cp.label}`;
      b.onclick = () => chooseBranch(pid);
      box.appendChild(b);
    });
    $('branchChooser').classList.add('open');
    toast('Branch point · 다음 감정 경로를 선택하세요.');
  }
  function chooseBranch(pid) {
    const p = pathById[pid];
    if (!p) return;
    $('branchChooser').classList.remove('open');
    state.branchPause = false;
    state.play.pathId = pid;
    state.play.seq = p.nodes.slice(0);
    state.play.index = 0;
    state.play.currentId = state.play.seq[0];
    state.selected = byId[state.play.currentId];
    state.preview = new Set(routeEdges(pid).map(e => e.id));
    showRouteStatus(
      `분기 경로 재생 · ${p.label}`,
      `${p.nodes.length}개의 순간 분기 sequence로 이어갑니다.`
    );
    nextPlaybackEdge();
  }

  function zoomAt(f, cx = vw / 2, cy = vh / 2) {
    const before = s2w(cx, cy);
    /* #461 전체 보기(1) 기준 0.5~4배. 배율은 늘 양수(바닥값). */ state.scale = Math.max(
      0.5,
      Math.min(4, state.scale * f)
    );
    state.tx = cx - before.x * state.scale;
    state.ty = cy - before.y * state.scale;
  }
  /* #461 세로 진행 막대는 지도가 화면에 다 들어와 쓸 일이 없어 숨겼다(network.css). */
  // #366 선 올리기/누르기: 연결 이유(relation)가 있을 때만 표시(없으면 생략). 값은 상세 판의 '연결 이유'와 같은 원본(reason).
  let edgeTipTimer = 0;
  function paintEdgeTip(edge, x, y, pinned = false) {
    const el = $('edgeTip'),
      text = LT56Model.relationText(edge);
    if (!text) {
      hideEdgeTip();
      return;
    }
    el.textContent = text;
    el.classList.add('show');
    const rect = el.getBoundingClientRect();
    const tx = clamp(x - rect.width / 2, 10, Math.max(10, vw - rect.width - 10));
    const above = y - rect.height - 16,
      ty = Math.max(10, above < 10 ? y + 18 : above);
    el.style.left = tx + 'px';
    el.style.top = ty + 'px';
    clearTimeout(edgeTipTimer);
    if (pinned) edgeTipTimer = setTimeout(hideEdgeTip, 3200);
  }
  function hideEdgeTip() {
    $('edgeTip').classList.remove('show');
    state.hoverEdge = null;
    clearTimeout(edgeTipTimer);
  }
  function edgeAt(sx, sy) {
    let best = null,
      bd = 9;
    for (const e of edges) {
      const a = byId[e.a],
        b = byId[e.b];
      if (!a || !b) continue;
      if (
        state.mobile &&
        ['cross', 'support', 'bridge', 'bridgeSecondary', 'anchor'].includes(e.kind)
      )
        continue;
      const g = bezierGeometry(a, b, e);
      for (let i = 1; i <= 12; i++) {
        const q = pointBezier(g, i / 12);
        const d = Math.hypot(q.x - sx, q.y - sy);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
    }
    return best;
  }
  canvas.addEventListener('pointerdown', e => {
    state.drag = true;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    state.downX = e.clientX;
    state.downY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    hideEdgeTip();
  });
  canvas.addEventListener('pointermove', e => {
    if (state.drag) {
      state.tx += e.clientX - state.lastX;
      state.ty += e.clientY - state.lastY;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      document.querySelector('.hero').classList.add('dim');
      hideEdgeTip();
      scheduleDraw();
      return;
    }
    const h = hitTest(e.clientX, e.clientY);
    state.hover = h?.kind === 'moment' ? h : null;
    canvas.classList.toggle('is-point', !!h);
    canvas.classList.toggle('is-grab', !h);
    if (h) {
      /* #366 연결 이유: 동심원처럼 선이 짧은 배치에서는 선 위에 정확히 올리기 어렵다 — 순간에 올리면 그 순간으로 들어온 연결 이유를 보여 준다. */ if (
        h.kind === 'moment'
      ) {
        const inc = edges.find(x => x.b === h.id && LT56Model.relationText(x));
        if (inc) {
          const p = w2s(h.x, h.y);
          paintEdgeTip(inc, p.x, p.y);
        } else hideEdgeTip();
      } else hideEdgeTip();
      scheduleDraw();
      return;
    }
    const he = edgeAt(e.clientX, e.clientY);
    state.hoverEdge = he;
    paintEdgeTip(he, e.clientX, e.clientY);
    scheduleDraw();
  });
  canvas.addEventListener('pointerup', e => {
    const dx = Math.abs(e.clientX - state.downX),
      dy = Math.abs(e.clientY - state.downY);
    state.drag = false;
    if (dx < 7 && dy < 7) {
      const h = hitTest(e.clientX, e.clientY);
      if (h && TAG_CLUSTERS.includes(h)) selectTagCluster(h);
      else if (h && CLUSTERS.includes(h)) selectCluster(h);
      else if (h?.kind === 'moment') {
        if (state.selected?.id === h.id) clearSelection();
        else {
          selectMoment(h);
          const inc = edges.find(x => x.b === h.id && LT56Model.relationText(x));
          if (inc) {
            const pp = w2s(h.x, h.y);
            paintEdgeTip(inc, pp.x, pp.y, true);
          }
        }
      } else if (h?.kind === 'anchor') selectCluster(CLUSTERS[h.cluster]);
      else {
        const he = edgeAt(e.clientX, e.clientY);
        if (he && LT56Model.relationText(he)) paintEdgeTip(he, e.clientX, e.clientY, true);
        else {
          hideEdgeTip();
          if (state.selected) clearSelection();
        }
      }
    }
  });
  canvas.addEventListener('pointercancel', () => {
    state.drag = false;
    hideEdgeTip();
    scheduleDraw();
  });
  canvas.addEventListener('pointerleave', () => {
    if (!state.drag) {
      hideEdgeTip();
      state.hover = null;
      scheduleDraw();
    }
  });
  // #366 키보드: 마우스 없이도 지도를 볼 수 있게 — 캘버스에 초점을 받으면 방향키로 순간을 옮긴다(그물·동심원 공통).
  // 방향키는 그 순간까지의 길만 밝히고(미리보기, 상세 판은 열지 않는다), Enter/Space는 상세 판과 함께 열며,
  // 선택한 순간으로 들어오는 연결 이유는 #edgeTip(role=status)에 띄워 화면 낭독기도 읽는다.
  function kbNodes() {
    return nodes.filter(n => n.kind === 'moment');
  }
  function kbRelation(n) {
    const e = edges.find(x => x.b === n.id && x.kind === 'parent' && LT56Model.relationText(x));
    if (!e) {
      hideEdgeTip();
      return;
    }
    const p = w2s(n.x, n.y);
    paintEdgeTip(e, p.x, p.y, false);
  }
  function kbPlace(n) {
    const p = w2s(n.x, n.y);
    if (p.x < 60 || p.x > vw - 60 || p.y < 90 || p.y > vh - 60) {
      state.tx += vw / 2 - p.x;
      state.ty += vh / 2 - p.y;
    }
  }
  function kbHighlight(n) {
    if (!n) return;
    cancelPlayback(false);
    state.selected = n;
    state.cluster = state.view === 'network' ? CLUSTERS[n.cluster] : null;
    state.mobileCluster = state.view === 'tag' ? (TAG_INDEX.get(n.id) ?? 0) : n.cluster;
    setMode('MOMENT_FOCUS');
    applyPathHighlight(n);
    kbPlace(n);
    kbRelation(n);
    syncRibbon();
    scheduleDraw();
  }
  canvas.addEventListener('keydown', e => {
    const list = kbNodes();
    if (!list.length) return;
    const key = e.key;
    if (key === 'Escape') {
      e.preventDefault();
      hideEdgeTip();
      clearSelection();
      return;
    }
    if (key === 'Enter' || key === ' ') {
      e.preventDefault();
      const n = state.selected;
      if (n && n.kind === 'moment') {
        selectMoment(n, true);
        kbRelation(n);
      }
      return;
    }
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(key)) return;
    e.preventDefault();
    const cur =
      state.selected?.kind === 'moment' ? list.findIndex(n => n.id === state.selected.id) : -1;
    let next;
    if (key === 'Home') next = 0;
    else if (key === 'End') next = list.length - 1;
    else {
      const step = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1;
      next = cur < 0 ? (step > 0 ? 0 : list.length - 1) : (cur + step + list.length) % list.length;
    }
    kbHighlight(list[next]);
  });
  canvas.addEventListener(
    'wheel',
    e => {
      e.preventDefault();
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))
        zoomAt(e.deltaY < 0 ? 1.08 : 0.92, e.clientX, e.clientY);
      else state.ty -= e.deltaY * 0.82;
      document.querySelector('.hero').classList.add('dim');
      scheduleDraw();
    },
    { passive: false }
  );
  // #518: 상세의 '책에서 보기'(#openMoment)는 셸이 문서 캡처 단계에서 맡는다(shell.mjs — 클릭을 잡아
  // track59 책 화면으로 옮기고, LT41.momentId로 지도에서 고른 그 순간을 연다). 이 자리에 개별 핸들러·안내를
  // 붙이면 캡처가 먼저라 실행되지 않는 죽은 코드가 된다(영어 프로토타입 안내가 그 예였다 — 제거).
  /* #951 ① '순간 N · 이어진 선 N개' — 단추가 아니라 위 단추 줄 아래 작은 글자다(셸의 links()도 같은 값을 쓴다). */
  function paintMapMeta() {
    const el = $('connection-tool');
    if (!el) return;
    const ids = new Set(LTDEMO.moments.map(m => m.id));
    const n = LTDEMO.edges.filter(e => ids.has(e.from) && ids.has(e.to)).length;
    el.textContent = `순간 ${LTDEMO.moments.length} · 이어진 선 ${n}개`;
  }
  paintMapMeta();
  $('zoomIn').onclick = () => {
    zoomAt(1.18);
    scheduleDraw();
  };
  $('zoomOut').onclick = () => {
    zoomAt(0.84);
    scheduleDraw();
  };
  $('overviewBtn').onclick = () => overview();
  $('resetFocus').onclick = () => overview();
  $('focusFirst').onclick = () => selectMoment(FIRST, true);
  $('viewNet').onclick = () => setView('network');
  $('viewConc').onclick = () => setView('tag');
  $('viewGraph').onclick = () => setView('time');
  window.__lovetreeStats = {
    moments: nodes.length,
    paths: paths.length,
    edges: edges.length,
    clusters: CLUSTERS.map(c => ({
      name: c.name,
      count: c.count,
      primaryPaths: paths.filter(p => p.cluster === c.index && p.kind === 'primary').length
    })),
    edgeKinds: edges.reduce((a, e) => ((a[e.kind] = (a[e.kind] || 0) + 1), a), {})
  };
  window.__lt = {
    edgeLen: () =>
      edges
        .filter(e => byId[e.a] && byId[e.b])
        .map(e => {
          const a = w2s(byId[e.a].x, byId[e.a].y),
            b = w2s(byId[e.b].x, byId[e.b].y);
          return Math.round(Math.hypot(b.x - a.x, b.y - a.y));
        }),
    compact: () => !!NETFIT?.compact,
    dots: () =>
      nodes
        .filter(n => n.kind === 'moment' && shouldDrawNode(n))
        .map(n => {
          const p = w2s(n.x, n.y),
            r = dotRadius(n);
          const ra = nodeAlpha(n);
          const te = dotThumbOf(n, r, ra);
          return { id: n.id, x: p.x, y: p.y, r, first: !!n.first, thumb: !!te, tr: te };
        }),
    hubs: () =>
      state.view === 'tag'
        ? TAG_CLUSTERS.filter(shouldDrawNode).map(c => {
            const p = w2s(c.x, c.y);
            return { id: c.id, x: p.x, y: p.y, r: Math.max(10, c.hubR * state.scale) };
          })
        : state.view === 'time'
          ? []
          : CLUSTERS.filter(shouldDrawNode).map(c => {
              const p = w2s(c.x, c.y);
              return { id: c.id, x: p.x, y: p.y, r: Math.max(8, c.hubR * state.scale) };
            }),
    box: () => BOX,
    labels: () => LAST_LABELS,
    edgeSegments: () => DRAWN_EDGE_SEGMENTS,
    fan: () => !!NETFIT?.fan,
    thumbs: () => [...thumbs.entries()].map(([id, e]) => ({ id, ok: e.ok })),
    thumbsSettled: () => [...thumbs.values()].every(e => e.ready),
    thumbRects: () => THUMB_RECTS,
    measureInsets,
    resize,
    overview,
    originReveal,
    selectCluster,
    selectTagCluster,
    selectMoment,
    startPlayback,
    chooseBranch,
    state,
    CLUSTERS,
    TAG_CLUSTERS,
    nodes,
    edges,
    paths,
    pathById,
    FIRST
  };
  mobilePicker = LTMobileMoments({
    moments: LTDEMO.moments,
    selected: LTDEMO.get(),
    onSelect: id => selectMoment(byId[id], true),
    onOpen: id => {
      selectMoment(byId[id], true);
      $('openMoment').click();
    },
    openLabel: '책 열기'
  });
  addEventListener('resize', resize);
  /* #951 ①: 셸이 순간 고르기 줄을 늦게 붙이면(--lt-picker-top 아래) 그때 한 번 다시 맞춘다 —
   붙는 시점에 따라 판 위 여백이 달라져 같은 판이 다르게 그려지던 것을 막는다. */
  (function () {
    if (!('MutationObserver' in window)) return;
    let had = !!document.querySelector('.lt-moment-picker');
    const ob = new MutationObserver(() => {
      const has = !!document.querySelector('.lt-moment-picker');
      if (has !== had) {
        had = has;
        resize();
      }
    });
    ob.observe(document.body, { childList: true, subtree: true });
  })();
  /* #529: 지도 겹은 스크롤하지 않는다 — 화면 밖 창 안으로 초점이 가도 .app이 밀리지 않게 바로 되돌린다(overflow:clip을 모르는 브라우저용). */ (function () {
    const app = document.querySelector('.app');
    if (!app) return;
    app.addEventListener('scroll', () => {
      if (app.scrollLeft || app.scrollTop) {
        app.scrollLeft = 0;
        app.scrollTop = 0;
      }
    });
  })();
  /* 지도를 덮는 도구(머리·안내·순간 고르기·왼쪽 창·아래 줄)의 크기가 처음 맞춘 뒤에 바뀌면(셸이 순간 고르기 줄을 늦게 붙이거나 글자가 줄바꿈될 때)
   빈 곳이 달라진다. 그때 한 번 다시 맞춘다 — 그러지 않으면 여는 타이밍에 따라 지도가 16px쯤 다르게 놓였다. 크기가 실제로 바뀔 때만 돌아 유휴 그리기는 0. */
  (() => {
    if (typeof ResizeObserver === 'undefined') return;
    let seen = '';
    const SEL = ['.topbar', '.hero p', '.lt-moment-picker', '.left-rail', '.mobile-ribbon'],
      watched = new WeakSet();
    const check = () => {
      const i = measureInsets(),
        k = [i.top, i.left, i.right, i.bottom].map(Math.round).join(',');
      if (k === seen) return;
      const first = !seen;
      seen = k;
      if (!first) resize();
    };
    const ro = new ResizeObserver(check),
      watch = () => {
        for (const q of SEL) {
          const el = document.querySelector(q);
          if (el && !watched.has(el)) {
            watched.add(el);
            ro.observe(el);
          }
        }
        check();
      };
    watch();
    new MutationObserver(watch).observe(document.body, { childList: true });
  })();
  /* #461 화면 문서 끝의 <style>(모바일 안내 문구 자리 등)은 이 스크립트 뒤에 읽힌다 — 문서를 다 읽은 뒤·글꼴이 온 뒤 한 번씩 덮개를 다시 재어 맞춘다(한 번뿐, 유휴 반복 없음). */ if (
    document.readyState === 'loading'
  )
    addEventListener('DOMContentLoaded', () => resize(), { once: true });
  addEventListener('load', () => resize(), { once: true });
  try {
    document.fonts?.ready?.then(() => resize());
  } catch (e) {}
  state.view = readStoredView();
  document.body.dataset.ltView = state.view;
  setupMobileRibbon();
  paintViewButtons();
  paintHero();
  paintLegend();
  resize();
  (() => {
    overview(false);
    /* #583 '이 순간 열기': 셸이 주소(#my/network?tree=…&moment=…)로 특정 순간을 열 때 프레임 주소에 ?open=<순간>을 붙여 보낸다 — 그 순간을 가운데 두고 고른 상태(상세 판 열림)로 연다. 주소 약속은 docs/HANDOFF.md. */ const openId =
      new URLSearchParams(location.search).get('open');
    const n =
      openId && byId[openId]?.kind === 'moment'
        ? byId[openId]
        : nodes.find(n => n.id === LTDEMO.get());
    if (n) {
      if (openId && n.id === openId) selectMoment(n, true);
      else state.selected = n;
    }
  })();
  last = performance.now();
  scheduleDraw();

  /* #1001 (3): 같은 트리 안 순간 변경(고치기·삭제·이전 순간 바꾸기·연결·해제)은 셸이 모델만 갱신하고
   lt41-moments-saved로 알린다 — 지도를 다시 띄우지 않고 점·선·묶음을 부모 LT41.tree에서 다시 읽어
   결정적 배치로 같은 자리에 다시 그린다. 고른 순간·보기·배율·열린 상세 판은 그대로 둔다(재적재 0).
   실제 기록(서버 트리) 기준 — 예시·공유는 읽기 전용이라 이 알림이 오지 않는다. */
  addEventListener('message', e => {
    if (
      e.origin !== location.origin ||
      e.source !== window.parent ||
      e.data?.type !== globalThis.LT41_MSG.momentsSaved
    )
      return;
    if (typeof LTDEMO.refresh !== 'function' || !LTDEMO.refresh()) return;
    const selId = state.selected?.id || null,
      detailOpen = $('detail').classList.contains('open');
    const view = state.view,
      scale = state.scale,
      tx = state.tx,
      ty = state.ty;
    TAG_DATA = LT56Model.tagGroups(LTDEMO.moments);
    TAG_GROUPS = TAG_DATA.groups;
    TAG_INDEX.clear();
    TAG_GROUPS.forEach((gr, i) => gr.ids.forEach(id => TAG_INDEX.set(id, i)));
    while (TAG_CLUSTERS.length > TAG_GROUPS.length) TAG_CLUSTERS.pop();
    TAG_GROUPS.forEach((gr, i) => {
      if (!TAG_CLUSTERS[i])
        TAG_CLUSTERS.push({
          id: `t${i}`,
          index: i,
          name: gr.name,
          sub: '',
          color: PALETTE()[i],
          x: 0,
          y: 0,
          count: gr.ids.length,
          hubR: 12,
          shelf: !!gr.shelf
        });
      else {
        TAG_CLUSTERS[i].name = gr.name;
        TAG_CLUSTERS[i].count = gr.ids.length;
        TAG_CLUSTERS[i].index = i;
        TAG_CLUSTERS[i].color = PALETTE()[i];
        TAG_CLUSTERS[i].shelf = !!gr.shelf;
      }
    });
    const g = LT56Model.pickGroups(LTDEMO.moments, LTDEMO.edges);
    GROUPS.length = 0;
    g.forEach(x => GROUPS.push(x));
    GROUP_INDEX.clear();
    GROUPS.forEach((gr, i) => gr.ids.forEach(id => GROUP_INDEX.set(id, i)));
    while (CLUSTERS.length > GROUPS.length) CLUSTERS.pop();
    GROUPS.forEach((gr, i) => {
      if (!CLUSTERS[i])
        CLUSTERS.push({
          id: `c${i}`,
          index: i,
          name: gr.name,
          sub: '',
          color: PALETTE()[i],
          x: 0,
          y: 0,
          count: gr.ids.length,
          hubR: 9
        });
      else {
        CLUSTERS[i].name = gr.name;
        CLUSTERS[i].count = gr.ids.length;
        CLUSTERS[i].index = i;
        CLUSTERS[i].color = PALETTE()[i];
      }
    });
    while (clusterPathIds.length < CLUSTERS.length) clusterPathIds.push([]);
    nodes.length = 0;
    LTDEMO.moments.forEach((m, i) => {
      const ci = GROUP_INDEX.get(m.id) ?? 0,
        c = CLUSTERS[ci],
        p = { x: c.x, y: c.y },
        j = i;
      const n = momentBase(ci, m.id, p.x, p.y, 0, `p${ci}_0`, j, i === 0);
      if (n.first) n.r = 10;
      Object.assign(n, {
        title: m.title,
        date: m.date,
        emotion: m.emotion,
        note: m.memo || '',
        why: m.whyNext || '',
        source: m.source || '예시 기록',
        mediaMetadata: m.mediaMetadata,
        image: m.image
      });
      nodes.push(n);
    });
    paths.length = 0;
    for (const k of Object.keys(pathById)) delete pathById[k];
    clusterPathIds.forEach(a => (a.length = 0));
    CLUSTERS.forEach((c, ci) => {
      const seq = nodes.filter(n => n.cluster === ci).map(n => n.id);
      addPath({
        id: `p${ci}_0`,
        cluster: ci,
        label: c.name,
        kind: 'primary',
        nodes: seq,
        children: [],
        branchAt: -1
      });
    });
    edges.length = 0;
    LTDEMO.edges.forEach((ed, i) =>
      addEdge({
        a: ed.from,
        b: ed.to,
        cluster: nodes.find(n => n.id === ed.from)?.cluster || 0,
        kind: ed.kind === 'related' ? 'related' : 'parent',
        pathId: nodes.find(n => n.id === ed.from)?.pathId,
        order: i,
        reason: ed.reason || ''
      })
    );
    FIRST = nodes[0];
    for (const k of Object.keys(byId)) delete byId[k];
    [...CLUSTERS, ...TAG_CLUSTERS, ...anchors, ...nodes].forEach(n => (byId[n.id] = n));
    BRANCH.clear();
    Object.entries(
      LTDEMO.edges
        .filter(ed => ed.kind === 'parent')
        .reduce((a, ed) => ((a[ed.from] = (a[ed.from] || 0) + 1), a), {})
    )
      .filter(([, c]) => c > 1)
      .forEach(([id]) => BRANCH.add(id));
    layoutNetwork();
    layoutTag();
    layoutTime();
    state.view = view;
    layoutForView();
    state.scale = scale;
    state.tx = tx;
    state.ty = ty;
    if (selId && byId[selId]?.kind === 'moment') {
      const n = byId[selId];
      state.selected = n;
      state.cluster = view === 'network' ? CLUSTERS[n.cluster] : null;
      state.mobileCluster = view === 'tag' ? (TAG_INDEX.get(n.id) ?? 0) : n.cluster;
      applyPathHighlight(n);
      if (detailOpen) paintDetail(n);
    } else if (selId) {
      clearSelection();
    }
    paintLegend();
    paintTagEmpty();
    paintMapMeta();
    setupMobileRibbon();
    paintViewButtons();
    scheduleDraw();
  });
})();
