// 관계 지도의 순수 계산 한 벌. 화면(network.js)이 실제로 이 함수들을 부른다.
// 일반 스크립트로 불러오고(node 시험은 import), window.LT56Model 하나로 노출한다.
window.LT56Model = (() => {
  // 갈래 점: 중심 c에서 각도·진행률로 뻗은 점. 홀수/짝수 갈래는 좌우로 다르게 휜다.
  function branchPoint(c, angle, step, len, branchIndex) {
    const t = step / (len - 1);
    const curve = Math.sin(t * Math.PI) * (0.10 + branchIndex * 0.012);
    const radius = c.spread * (0.16 + 0.78 * t);
    const ax = angle + curve * (branchIndex % 2 ? 1 : -1);
    return {
      x: c.x + Math.cos(ax) * radius + Math.sin(t * 5 + branchIndex) * 12,
      y: c.y + Math.sin(ax) * radius * 0.80 + Math.cos(t * 4 + branchIndex) * 10
    };
  }

  // 묶음 나누기: 한 묶음에 7개 안팎, 묶음은 최대 6개(색 6가지). 작은 트리는 묶음을 억지로 6개로 쪼개지 않는다(#461).
  // 40개 → 7개씩 6묶음, 36개 → 6개씩 6묶음, 15개 → 5개씩 3묶음, 5개 → 한 묶음.
  function groupSizeFor(total) {
    const groups = Math.min(6, Math.ceil(Math.max(0, total) / 7));
    return Math.max(1, Math.ceil(total / Math.max(1, groups)));
  }

  // 짧은 제목: 길면 잘라 '…'을 붙인다.
  function shortTitle(text, max = 8) {
    const t = String(text ?? '').trim();
    return t.length > max ? `${t.slice(0, Math.max(1, max - 1))}…` : t;
  }

  // 묶음 나누기(#601 '순간 묶음' 다시 정하기): 7개씩 자르기를 버리고 감정별로 묶는다.
  // 감정은 순간에 저장된 값(도메인 6감정 + 가져온 기록의 커스텀 감정)이고, 색도 6벌이라 묶음도 최대 6개 —
  // 남는 감정은 여섯 번째 묶음에 합친다('여러 감정'). 순서는 데이터에 처음 나온 순서(같은 데이터면 같은 묶음).
  function emotionGroups(moments) {
    const nameOf = m => String(m?.emotion ?? '').trim() || '감정 없음';
    const names = [], indexOf = {};
    for (const m of moments || []) if (!(nameOf(m) in indexOf)) { indexOf[nameOf(m)] = names.length; names.push(nameOf(m)); }
    const groups = names.map(name => ({ name, ids: [] }));
    for (const m of moments || []) groups[indexOf[nameOf(m)]].ids.push(m.id);
    if (groups.length > 6) return [...groups.slice(0, 5), { name: '여러 감정', ids: groups.slice(5).flatMap(g => g.ids) }];
    return groups;
  }

  // 점 이름표의 제목(#601): 빠른 추가의 자동 제목('youtube.com에서 간직한 순간')은 제목이 아니라
  // 사이트 이름이므로, 영상 제목(mediaMetadata.title)·마음 한마디를 먼저 쓰고 정말 없을 때만 사이트 이름을 보인다.
  function labelTitle(m) {
    const raw = String(m?.title ?? '').trim();
    const auto = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d{1,5})?에서 간직한 순간$/i;
    if (auto.test(raw)) {
      const better = String(m?.mediaMetadata?.title || '').trim() || String(m?.note ?? m?.memo ?? '').trim();
      if (better) return better;
      return raw.replace(/에서 간직한 순간$/, '') || raw;
    }
    return raw;
  }

  // 월별 묶음(#601 '데이터에 맞는 쪽'): 사슬·깊은 나무는 시간 순서가 모양과 일치하므로 월별이 어긋나지 않는다.
  // 같은 월은 날짜 순서에서 본디 연속이다. 월이 6개를 넘으면 이어지는 월을 합쳐 색 6벌 이하로 뭉친다.
  function monthGroups(moments) {
    const key = m => String(m?.date || '').slice(0, 7);
    const list = (moments || []).slice().sort((a, b) => String(a?.date || '').localeCompare(String(b?.date || '')) || String(a?.createdAt || '').localeCompare(String(b?.createdAt || '')));
    const months = [...new Set(list.map(key))].filter(Boolean).sort();
    if (!months.length) return [{ name: '기억', ids: list.map(m => m.id) }];
    const per = Math.ceil(months.length / 6), groups = [];
    const ym = s => { const [y, m] = s.split('.'); return { y, m: String(Number(m)) }; };
    const monthName = chunk => {
      if (chunk.length === 1) { const { y, m } = ym(chunk[0]); return `${y}년 ${m}월`; }
      const a = ym(chunk[0]), b = ym(chunk[chunk.length - 1]);
      return a.y === b.y ? `${a.y}년 ${a.m}–${b.m}월` : `${a.y}년 ${a.m}월 – ${b.y}년 ${b.m}월`;
    };
    for (let i = 0; i < months.length; i += per) {
      const chunk = months.slice(i, i + per);
      groups.push({ name: monthName(chunk), ids: list.filter(m => chunk.includes(key(m))).map(m => m.id) });
    }
    return groups;
  }

  // 데이터에 맞는 묶음 고르기(#601): 한 순간에 8개 이상 이어진 부채꼴 나무(대표 트리 모양)는 공간 묶음이
  // 없어 색으로 감정을 보인다 — 감정별. 사슬·깊은 나무는 감정이 사슬을 따라 섞여 있어 감정별로 흩어지므로
  // 시간이 모양과 일치하는 월별로 묶는다. 고른 쪽이 한 묶음뿐이면 그대로 돌려 판을 숨긴다(감정으로 억지로 나누지 않는다).
  function pickGroups(moments, edges) {
    const fan = bfsOrder(moments || [], edges || []).fanHeavy;
    return fan ? emotionGroups(moments) : monthGroups(moments);
  }

  // 묶음 하나의 이름·개수(#461): 번호 범위 대신 묶음 첫 순간의 제목으로 — "첫인상부터 7개".
  // moments가 없으면(예전 호출) 번호 범위로 남긴다.
  function clusterSpan(index, groupSize, total, moments) {
    const count = Math.max(0, Math.min(groupSize, total - index * groupSize));
    const head = moments?.[index * groupSize];
    const name = head
      ? (count > 1 ? `${shortTitle(head.title, 7)}부터 ${count}개` : shortTitle(head.title, 9))
      : `순간 ${String(index * groupSize + 1).padStart(2, '0')}–${String(Math.min((index + 1) * groupSize, total)).padStart(2, '0')}`;
    return { name, sub: '', count };
  }

  // #461 지도를 펼칠 빈 곳: 창에서 지도를 덮는 도구(위 머리·안내 문구, 왼쪽 패널, 아래 순간 줄)를 뺀 상자.
  // 창이 아주 좁거나 낮아(준비 중인 iframe 등) 남는 곳이 거의 없으면 덮개를 무시하고 창 전체를 쓴다 — 배율·반지름이 음수가 되지 않는다.
  function fitBox(vw, vh, insets = {}, pad = 16) {
    const side = k => Math.max(0, Number(insets[k]) || 0);
    let box = { x: side('left') + pad, y: side('top') + pad, w: vw - side('left') - side('right') - 2 * pad, h: vh - side('top') - side('bottom') - 2 * pad };
    if (!(box.w >= 120) || !(box.h >= 120)) box = { x: 8, y: 8, w: vw - 16, h: vh - 16 };
    box.w = Math.max(40, box.w || 0);
    box.h = Math.max(40, box.h || 0);
    return box;
  }

  // 묶음 칸 나누기: 칸이 정사각형에 가깝고 빈 칸이 적은 열×행을 고른다 — 가로로 넓은 화면은 가로로, 세로로 긴 화면은 세로로 펼쳐진다.
  function gridFor(k, w, h) {
    if (!(k > 0) || !(w > 0) || !(h > 0)) return { cols: 1, rows: 1 };
    let best = null;
    for (let cols = 1; cols <= k; cols++) {
      const rows = Math.ceil(k / cols), empty = cols * rows - k;
      if (empty >= cols) continue;
      const score = Math.abs(Math.log((w / cols) / (h / rows))) + 0.35 * empty / k;
      if (!best || score < best.score - 1e-9) best = { cols, rows, score };
    }
    return { cols: best.cols, rows: best.rows };
  }

  // 연결선 베지에: 화면 좌표 두 점과 연결 종류로 조절점을 만든다.
  function bezierGeometry(A, B, kind) {
    const dx = B.x - A.x, dy = B.y - A.y;
    let bend = 12;
    if (['bridge', 'bridgeSecondary', 'origin'].includes(kind)) bend = Math.min(64, Math.abs(dx) * 0.10 + 18);
    const sign = dx >= 0 ? 1 : -1;
    return {
      A,
      B,
      cp1: { x: A.x + dx * 0.34 + sign * bend, y: A.y + dy * 0.28 },
      cp2: { x: B.x - dx * 0.30 - sign * bend * 0.55, y: B.y - dy * 0.26 }
    };
  }

  // 경로에 실제로 놓인 연결: 이웃한 두 순간을 잇는 연결을 순서대로 고른다.
  function routeEdges(pid, pathById, edges) {
    const p = pathById[pid];
    if (!p) return [];
    const out = [];
    for (let i = 0; i < p.nodes.length - 1; i++) {
      const e = edges.find((x) => x.a === p.nodes[i] && x.b === p.nodes[i + 1] && x.pathId === pid);
      if (e) out.push(e);
    }
    return out;
  }

  // ===== #366 보기별 배치(2026-11-10) — 나무형·AI 후보 점을 나중에 꽂기 쉽게 보기 함수를 여기 한 벌에 모은다. =====

  // 베지어 위의 점과 접선 방향: 선 위 방향 화살표·선 올리기(연결 이유)에 쓴다.
  function bezierPoint(g, t) {
    const u = 1 - t;
    const x = u*u*u*g.A.x + 3*u*u*t*g.cp1.x + 3*u*t*t*g.cp2.x + t*t*t*g.B.x;
    const y = u*u*u*g.A.y + 3*u*u*t*g.cp1.y + 3*u*t*t*g.cp2.y + t*t*t*g.B.y;
    const dx = 3*u*u*(g.cp1.x - g.A.x) + 6*u*t*(g.cp2.x - g.cp1.x) + 3*t*t*(g.B.x - g.cp2.x);
    const dy = 3*u*u*(g.cp1.y - g.A.y) + 6*u*t*(g.cp2.y - g.cp1.y) + 3*t*t*(g.B.y - g.cp2.y);
    return { x, y, dx, dy };
  }

  // 부모 연결 인접 목록: from(이전 순간) → to(다음 순간). 관련 연결(related)은 단계·길 계산에 넣지 않는다.
  function childrenMap(edges) {
    const childrenOf = {};
    for (const e of edges) {
      if (e.kind !== 'parent') continue;
      (childrenOf[e.from] = childrenOf[e.from] || []).push(e.to);
    }
    return childrenOf;
  }

  // 단계 계산: 첫 순간(parentId가 없는 순간)이 0단계, 바로 이어진 순간부터 1단계·2단계…(부모 연결 BFS).
  // 부모 연결로 닿지 않는 순간은 가장 바깥 단계로 물린다(이상 데이터 방어 — 화면 밖으로 나가지 않게).
  function treeLevels(moments, edges) {
    const first = moments.find(m => m.first) || moments[0];
    const childrenOf = childrenMap(edges);
    const levelOf = {};
    let frontier = first ? [first.id] : [];
    if (first) levelOf[first.id] = 0;
    let level = 0, maxLevel = 0;
    while (frontier.length) {
      const next = [];
      for (const id of frontier) for (const c of childrenOf[id] || []) if (!(c in levelOf)) { levelOf[c] = level + 1; next.push(c); }
      level++;
      if (next.length) maxLevel = level;
      frontier = next;
    }
    for (const m of moments) if (!(m.id in levelOf)) { maxLevel += 1; levelOf[m.id] = maxLevel; }
    return { firstId: first?.id || null, levelOf, maxLevel, childrenOf };
  }

  // 첫 순간부터 이 순간까지 지나온 길: 부모 연결을 거슬러 올라가 first → 순간 순서로 돌려준다.
  // 부모 연결이 끊긴 순간은 자기 자신 하나만(길 강조 대상이 없어도 해제 동작은 같다).
  function originPath(momentId, moments, edges) {
    if (!moments?.some(m => m.id === momentId)) return [];
    const parentOf = {};
    for (const e of edges) if (e.kind === 'parent') parentOf[e.to] = e.from;
    const { firstId } = treeLevels(moments, edges);
    const chain = [];
    let cur = momentId, guard = moments.length + 2;
    while (cur && guard-- > 0) {
      chain.push(cur);
      if (cur === firstId) break;
      cur = parentOf[cur];
    }
    chain.reverse();
    return chain[0] === firstId ? chain : [momentId];
  }

  // 길 강조 세기 표(#366): 밝힌 길 / 흐린 나머지. 화면(network.js)은 이 값만 쓴다(강도가 여기 한 곳에 고정된다).
  const pathEmphasis = Object.freeze({ lit: 0.95, dim: 0.05, litNode: 1, dimNode: 0.14, hubDim: 0.2 });

  // 선 위 연결 이유(relation): 빈 이유는 '' — 화면은 ''면 표시를 생략한다(#366).
  function relationText(edge) {
    return typeof edge?.reason === 'string' ? edge.reason.trim() : '';
  }

  // #583 부채꼴 나무 판정과 배치 순서: 첫 순간부터 부모 연결을 따라 너비 우선(BFS)으로 순서를 세고,
  // 한 순간의 자식이 fanMin(기본 8)개 이상이면 '부채꼴 나무'로 본다 — 대표 트리처럼 첫 순간 하나에
  // 순간 대부분이 이어진 평평한 나무다. 닿지 않는 순간은 순서 맨 뒤에 붙인다(빠짐없이).
  function bfsOrder(moments, edges, fanMin = 8) {
    const ids = new Set(moments.map(m => m.id));
    const childrenOf = {};
    for (const e of edges) if (e.kind === 'parent' && ids.has(e.from) && ids.has(e.to)) (childrenOf[e.from] = childrenOf[e.from] || []).push(e.to);
    const first = moments.find(m => m.first) || moments[0];
    const order = [], seen = new Set();
    if (first) { order.push(first.id); seen.add(first.id); }
    let frontier = first ? [first.id] : [];
    while (frontier.length) {
      const next = [];
      for (const id of frontier) for (const c of childrenOf[id] || []) if (!seen.has(c)) { seen.add(c); order.push(c); next.push(c); }
      frontier = next;
    }
    for (const m of moments) if (!seen.has(m.id)) order.push(m.id);
    const fanHub = Object.keys(childrenOf).reduce((best, id) => childrenOf[id].length > (childrenOf[best]?.length || 0) ? id : best, null);
    const fanOut = fanHub ? childrenOf[fanHub].length : 0;
    return { order, childrenOf, fanHub, fanHeavy: fanOut >= fanMin };
  }

  // 그물형 배치(#461): 화면에 맞게 펼친다. 결과는 화면 좌표(배율 1 = 전체 보기)다.
  // ① 묶음을 화면 비율에 맞는 칸(gridFor)에 나눠 앉힌다 — 넓은 화면은 가로로, 좁고 긴 화면은 세로로.
  //    칸은 지그재그 순서(1줄 왼→오, 2줄 오→왼)라 이웃 묶음이 붙어 있고, 덜 찬 마지막 줄은 가운데로 모은다(빈 띠 쏠림 방지).
  // ② 묶음 안 순간은 칸에 맞춘 타원 위에 순서대로(12시부터 시계 방향). 묶음 점은 타원 가운데.
  // ③ 점 반지름은 가장 가까운 이웃·묶음 점과 겹치지 않을 만큼만(최대 dotR). 첫 순간은 고리까지 firstR로 본다.
  // opts.candidates는 나중에 AI가 제안하는 흐린 후보 점이 들어올 자리(이슈 #366 기록) — 지금은 받기만 한다.
  function networkLayout(moments, opts = {}) {
    void opts.candidates;
    const box = opts.box || { x: 0, y: 0, w: opts.width || 1200, h: opts.height || 800 };
    // #601: 묶음은 감정별(opts.groups — 순간 id 배열의 배열)이다. 없으면(옛 부름) 예전처럼 순서대로 7개씩 자른다.
    const groups = Array.isArray(opts.groups) && opts.groups.some(g => Array.isArray(g) && g.length) ? opts.groups : null;
    const n = moments.length;
    const gs = groups ? Math.max(1, ...groups.map(g => (g || []).length)) : groupSizeFor(n);
    const k = groups ? groups.length : Math.max(1, Math.ceil(n / gs));
    const slot = {};
    if (groups) groups.forEach((ids, g) => (ids || []).forEach((id, j) => { slot[id] = { g: Math.min(k - 1, g), j, size: Math.max(1, (ids || []).length) }; }));
    else moments.forEach((m, i) => { const g = Math.min(k - 1, Math.floor(i / gs)); slot[m.id] = { g, j: i - g * gs, size: Math.min(gs, n - g * gs) }; });
    const { cols, rows } = gridFor(k, box.w, box.h);
    const cw = box.w / cols, ch = box.h / rows;
    const maxR = opts.dotR ?? 5, firstR = opts.firstR ?? 20, gap = opts.gap ?? 8, hubR = opts.hubR ?? 9, inset = opts.inset ?? 12;
    // #583 부채꼴 나무(한 순간에 8개 이상 이어짐): 묶음 칸으로 쪼개지 않고 한 고리에 펼친다 —
    // 첫 순간에서 뻗는 선이 여러 묶음을 가로지르며 엉키던 모양(평평한 26순간 트리)을 없앤다.
    // 순간은 첫 순간부터 BFS 순서로 고리 위에 앉히고(형제가 이웃해 부채꼴로 읽힌다), 묶음 점은
    // 색·범례가 뜻하는 대상이 없어 화면에 내지 않는다(network.js가 hubs가 비었을 때 치운다).
    const tree = bfsOrder(moments, edgesOf(opts), opts.fanMin ?? 8);
    if (tree.fanHeavy) return fanLayout(moments, box, opts, tree, { maxR, firstR, gap, hubR, inset });
    const hubs = [];
    for (let i = 0; i < k; i++) {
      const row = Math.floor(i / cols), inRow = Math.min(cols, k - row * cols);
      let col = i - row * cols;
      if (row % 2) col = inRow - 1 - col;
      const shift = (cols - inRow) / 2;
      hubs.push({ x: box.x + (col + shift + 0.5) * cw, y: box.y + (row + 0.5) * ch, w: cw, h: ch });
    }
    // 칸 안 타원: 가장자리에서 inset+점 반지름만큼 들어오고(위아래는 맨 위에 앉는 첫 순간의 고리 firstR까지), 납작함은 2배까지만.
    let rx = Math.max(6, cw / 2 - inset - maxR), ry = Math.max(6, ch / 2 - Math.max(inset + maxR, firstR + 2));
    rx = Math.min(rx, ry * 2); ry = Math.min(ry, rx * 2);
    const points = {}, firstIdx = Math.max(0, moments.findIndex(m => m.first));
    moments.forEach((m) => {
      const { g, j, size } = slot[m.id] || { g: 0, j: 0, size: 1 }, c = hubs[g];
      const th = -Math.PI / 2 + (2 * Math.PI * j) / size;
      const f = size === 1 ? 0.55 : 1;
      points[m.id] = { x: c.x + Math.cos(th) * rx * f, y: c.y + Math.sin(th) * ry * f };
    });
    // 점 반지름: 이웃(같은 묶음)·묶음 점과 gap 이상 떨어지는 가장 큰 값(2.5~maxR).
    const ids = moments.map(m => m.id);
    const firstId = moments[firstIdx]?.id;
    const byGroup = [];
    for (const id of ids) { const g = slot[id]?.g ?? 0; (byGroup[g] = byGroup[g] || []).push(id); }
    let dotR = maxR;
    const fits = r => {
      for (let g = 0; g < k; g++) {
        const list = byGroup[g] || [];
        for (let i = 0; i < list.length; i++) {
          const a = points[list[i]], ra = list[i] === firstId ? Math.max(firstR, r) : r;
          if (hubs[g] && Math.hypot(a.x - hubs[g].x, a.y - hubs[g].y) < ra + hubR + gap) return false;
          for (let j = i + 1; j < list.length; j++) {
            const b = points[list[j]], rb = list[j] === firstId ? Math.max(firstR, r) : r;
            if (Math.hypot(a.x - b.x, a.y - b.y) < ra + rb + gap) return false;
          }
        }
      }
      return true;
    };
    while (dotR > 2.5 && !fits(dotR)) dotR -= 0.25;
    return { points, hubs, groupSize: gs, cols, rows, cell: { w: cw, h: ch }, rx, ry, dotR, hubR, box };
  }

  // #583 부채꼴 배치: 가장 많이 이어진 순간(첫 순간)을 상자 가운데에 두고, 나머지 순간을 상자에 맞춘
  // 타원 고리 위에 BFS 순서로 앉힌다(12시부터 시계 방향 — 형제가 이웃해 부채꼴로 읽힌다). 선은
  // 가운데에서 고리로 뻗는 방사형이 되어 서로 교차하지 않는다. 결과는 그물형과 같은 모양(points·cell·dotR)이고
  // fan:true·fanHub(가운데 순간)·center·order를 덜어 준다 — 화면이 이름표 방향·묶음 점 처리에 쓴다.
  function fanLayout(moments, box, opts, tree, sizes) {
    const { maxR, firstR, gap, hubR, inset } = sizes, n = moments.length;
    let rx = Math.max(6, box.w / 2 - inset - maxR), ry = Math.max(6, box.h / 2 - Math.max(inset + maxR, firstR + 2));
    rx = Math.min(rx, ry * 2); ry = Math.min(ry, rx * 2);
    const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    const points = {};
    tree.order.forEach((id, j) => {
      if (j === 0) { points[id] = { x: center.x, y: center.y }; return; }
      const th = -Math.PI / 2 + (2 * Math.PI * (j - 1)) / Math.max(1, n - 1);
      points[id] = { x: center.x + Math.cos(th) * rx, y: center.y + Math.sin(th) * ry };
    });
    // 점 반지름: 고리 위 이웃과 gap 이상 떨어지는 가장 큰 값(2.5~maxR) — 그물형과 같은 규칙.
    const ids = tree.order.slice(1), firstId = tree.order[0];
    let dotR = maxR;
    const fits = r => {
      for (let i = 0; i < ids.length; i++) {
        const a = points[ids[i]];
        if (Math.hypot(a.x - points[firstId].x, a.y - points[firstId].y) < Math.max(firstR, r) + r + gap) return false;
        for (let j = i + 1; j < ids.length; j++) {
          const b = points[ids[j]];
          if (Math.hypot(a.x - b.x, a.y - b.y) < r + r + gap) return false;
        }
      }
      return true;
    };
    while (dotR > 2.5 && !fits(dotR)) dotR -= 0.25;
    return { points, hubs: [], groupSize: n, cols: 1, rows: 1, cell: { w: box.w, h: box.h }, rx, ry, dotR, hubR, box, center, fan: true, fanHub: tree.fanHub, order: tree.order.slice() };
  }

  // 부채꼴 판정에 쓸 parent 연결: opts.edges(화면이 넘겨 주는 실제 연결)가 없으면 빈 연결로 본다 —
  // 연결 없이 배치만 부를 때(옛 부름)도 예전 동작을 그대로 유지한다.
  function edgesOf(opts) { return Array.isArray(opts.edges) ? opts.edges : []; }

  // 동심원형 배치: 첫 순간을 가운데, 1단계·2단계… 순서대로 바깥 원에(#366).
  // 같은 부모의 자식은 부모의 부채꼴 안에 하위 무게만큼 나눠 붙이고(부모 근처에 모임),
  // 같은 단계 이웃끼리 직선거리가 겹치지 않을 최소 반지름을 단계별로 계산한다.
  // #461 화면 맞춤:
  //  - 부모 연결이 없는 다른 시작 순간은 첫 순간에 기대어 자기 갈래를 갖는다(예전엔 하나마다 바깥 원을 새로 차지해 40개 예시가 30겹이 됐다).
  //  - 자식이 하나뿐인 순간은 부채꼴 안에서 조금씩 돌아가며 놓는다 — 한 줄로 이어진 트리도 한 방향 바늘처럼 몰리지 않는다.
  //  - 화면 상자(opts.box)에 맞춰 키운다(작은 트리도 작게 남지 않는다). 가로·세로는 따로 맞추되 납작함은 2배까지만.
  //    점 간격은 작은 쪽 축척 이상으로만 늘어나므로, 점 반지름(nodeR×min(1,축척))과 겹치지 않는다.
  // opts.candidates는 나중에 AI가 제안하는 흐린 후보 점이 들어올 자리(이슈 #366 기록) — 지금은 받기만 한다.
  function concentricLayout(moments, edges, opts = {}) {
    const width = opts.width || 1200, height = opts.height || 800;
    const pad = opts.pad ?? 46;
    const box = opts.box || { x: pad, y: pad, w: Math.max(20, width - 2 * pad), h: Math.max(20, height - 2 * pad) };
    const nodeR = opts.nodeR ?? 4.5;
    const gap = opts.gap ?? 8;
    const firstR = opts.firstR ?? nodeR;
    void opts.candidates;
    const minGap = 2 * nodeR + gap;
    const t = treeLevels(moments, edges);
    const firstId = t.firstId;
    const center = { x: opts.cx ?? box.x + box.w / 2, y: opts.cy ?? box.y + box.h / 2 };
    const points = {};
    if (!firstId) return { points, center, radii: [0], scale: 1, sx: 1, sy: 1, levelOf: t.levelOf, maxLevel: t.maxLevel, firstId, dotR: 0, firstDotR: 0 };
    // 0) 배치용 나무: 부모 연결 + (부모 없는 다른 시작 순간 → 첫 순간). 한 순간은 먼저 닿은 부모 하나에만 매단다.
    const ids = new Set(moments.map(m => m.id));
    const hasParent = new Set(edges.filter(e => e.kind === 'parent' && ids.has(e.from)).map(e => e.to));
    const linkOf = {};
    for (const [from, kids] of Object.entries(t.childrenOf)) linkOf[from] = kids.slice();
    for (const m of moments) if (m.id !== firstId && !hasParent.has(m.id)) (linkOf[firstId] = linkOf[firstId] || []).push(m.id);
    const levelOf = { [firstId]: 0 }, kidsOf = {};
    let frontier = [firstId], maxLevel = 0;
    while (frontier.length) {
      const next = [];
      for (const id of frontier) for (const c of linkOf[id] || []) {
        if (!ids.has(c) || c in levelOf) continue;
        levelOf[c] = levelOf[id] + 1; maxLevel = Math.max(maxLevel, levelOf[c]);
        (kidsOf[id] = kidsOf[id] || []).push(c); next.push(c);
      }
      frontier = next;
    }
    // 서로만 가리키는 고리처럼 그래도 닿지 않는 순간: 가장 바깥 단계에, 첫 순간에 기대 둔다(좌표가 NaN이 되지 않게).
    for (const m of moments) if (!(m.id in levelOf)) { maxLevel += 1; levelOf[m.id] = maxLevel; (kidsOf[firstId] = kidsOf[firstId] || []).push(m.id); }
    // 1) 하위 무게: 자신 + 자손 수. 부채꼴을 나누는 기준.
    const weightOf = {};
    const weight = id => {
      if (weightOf[id]) return weightOf[id];
      let w = 1;
      for (const c of kidsOf[id] || []) w += weight(c);
      return (weightOf[id] = w);
    };
    // 2) 각도 배분: 부모의 부채꼴을 자식 무게만큼 나눠 물려준다. 첫 순간은 위(12시)에서 시작.
    //    자식이 하나면 같은 부채꼴을 물려주되 부채꼴 폭의 0.3만큼 돌린 자리에 둔다(부채꼴 안에서 감아 돈다).
    const angleOf = {};
    const assign = (id, a0, a1, at) => {
      angleOf[id] = at;
      const ch = kidsOf[id] || [];
      if (!ch.length) return;
      const span = a1 - a0;
      if (ch.length === 1) {
        const turn = span > 0.6 ? a0 + ((at - a0 + span * 0.3) % span + span) % span : at;
        assign(ch[0], a0, a1, turn);
        return;
      }
      const total = ch.reduce((s, c) => s + weight(c), 0);
      let cur = a0;
      for (const c of ch) { const part = span * (weight(c) / total); assign(c, cur, cur + part, cur + part / 2); cur += part; }
    };
    assign(firstId, -Math.PI / 2, 3 * Math.PI / 2, -Math.PI / 2);
    // 3) 단계별 반지름: 이전 단계보다 링 간격 이상 + 같은 단계 이웃 각도 차로 겹침이 없는 반지름. 1단계는 첫 순간 고리 바깥.
    const byLevel = Array.from({ length: maxLevel + 1 }, () => []);
    for (const m of moments) if (m.id !== firstId) byLevel[levelOf[m.id]].push(m.id);
    const radii = [0];
    for (let L = 1; L <= maxLevel; L++) {
      const items = byLevel[L].slice().sort((a, b) => angleOf[a] - angleOf[b]);
      let r = Math.max(radii[L - 1] + minGap, L === 1 ? firstR + nodeR + gap : 0);
      for (let i = 0; i < items.length; i++) {
        const prev = items[(i - 1 + items.length) % items.length];
        const raw = Math.abs(angleOf[items[i]] - angleOf[prev]);
        const d = Math.min(raw, 2 * Math.PI - raw); // 이웃은 감김 방향의 짧은 호 기준
        if (items.length < 2) continue;
        if (d > 1e-9) r = Math.max(r, minGap / (2 * Math.sin(d / 2)));
        else r = Math.max(r, (items.length * minGap) / (2 * Math.PI));
      }
      radii[L] = r;
    }
    // 4) 화면 맞춤: 실제로 뻗은 가로·세로 범위(첫 순간 포함)를 상자에 맞추고, 그 범위의 가운데를 상자 가운데에 둔다.
    //    원의 중심(첫 순간)은 범위 가운데에서 비켜설 수 있다 — 한쪽으로만 뻗은 트리가 상자 한쪽에 빈 띠를 남기지 않게.
    //    범위가 아주 좁으면(한 줄로만 뻗음) 바닥(바깥 원 반지름의 0.7배)을 두어 지나치게 늘이지 않는다.
    const rMax = radii[maxLevel] || minGap;
    let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
    for (const m of moments) {
      const r = radii[levelOf[m.id]] || 0, th = angleOf[m.id];
      x0 = Math.min(x0, Math.cos(th) * r); x1 = Math.max(x1, Math.cos(th) * r);
      y0 = Math.min(y0, Math.sin(th) * r); y1 = Math.max(y1, Math.sin(th) * r);
    }
    const spanX = Math.max(x1 - x0, rMax * 0.7), spanY = Math.max(y1 - y0, rMax * 0.7);
    const ax = Math.max(8, box.w - 2 * (nodeR + 2)), ay = Math.max(8, box.h - 2 * (nodeR + 2));
    let sx = ax / spanX, sy = ay / spanY;
    const scale = Math.min(sx, sy);
    sx = Math.min(sx, scale * 2); sy = Math.min(sy, scale * 2);
    if (opts.cx == null) center.x = box.x + box.w / 2 - ((x0 + x1) / 2) * sx;
    if (opts.cy == null) center.y = box.y + box.h / 2 - ((y0 + y1) / 2) * sy;
    for (const m of moments) {
      const r = radii[levelOf[m.id]] || 0, th = angleOf[m.id];
      points[m.id] = { x: center.x + Math.cos(th) * r * sx, y: center.y + Math.sin(th) * r * sy };
    }
    const k = Math.min(1, scale);
    return { points, center, radii, scale, sx, sy, levelOf, maxLevel, firstId, dotR: nodeR * k, firstDotR: firstR * k, minGap: minGap * scale };
  }

  // #461 이름표 자리 고르기: 우선순위 순서대로, 상자 안 + 다른 이름표·점과 겹치지 않는 자리에만 붙인다(못 붙이면 뺀다).
  // cands: [{id, text, x, y, r, w, h, dir:{x,y}}] — dir은 바깥 방향(그쪽 자리를 먼저 본다). 점 기준 오른쪽·왼쪽·위·아래 네 자리.
  // obstacles: [{id, x, y, r}] 그려진 점·묶음 점. 결과: [{id, text, x, y, rect}] — x,y는 왼쪽 정렬 글자 기준선.
  function placeLabels(cands, obstacles, bounds, opts = {}) {
    const g = opts.gap ?? 4, space = opts.space ?? 2;
    const rects = [], out = [];
    const overlaps = (a, b) => a.l < b.r + space && a.r > b.l - space && a.t < b.b + space && a.b > b.t - space;
    const onDot = (a, o) => {
      const cx = Math.max(a.l, Math.min(o.x, a.r)), cy = Math.max(a.t, Math.min(o.y, a.b));
      return Math.hypot(o.x - cx, o.y - cy) < o.r + 1;
    };
    for (const c of cands) {
      const spots = {
        right: { l: c.x + c.r + g, t: c.y - c.h / 2 },
        left: { l: c.x - c.r - g - c.w, t: c.y - c.h / 2 },
        above: { l: c.x - c.w / 2, t: c.y - c.r - g - c.h },
        below: { l: c.x - c.w / 2, t: c.y + c.r + g }
      };
      const dx = c.dir?.x ?? 1, dy = c.dir?.y ?? 0;
      const first = dx > 0.35 ? 'right' : dx < -0.35 ? 'left' : dy < 0 ? 'above' : 'below';
      const order = [first, ...['right', 'left', 'above', 'below'].filter(k => k !== first)];
      for (const key of (c.only ? [first] : order)) {
        const s = spots[key], rect = { l: s.l, t: s.t, r: s.l + c.w, b: s.t + c.h };
        if (rect.l < bounds.x || rect.r > bounds.x + bounds.w || rect.t < bounds.y || rect.b > bounds.y + bounds.h) continue;
        if (rects.some(r => overlaps(rect, r))) continue;
        if (obstacles.some(o => onDot(rect, o))) continue;
        rects.push(rect);
        out.push({ id: c.id, text: c.text, x: rect.l, y: rect.t + c.h * 0.77, rect, tw: c.tw || 0 });
        break;
      }
    }
    return out;
  }

  return { branchPoint, groupSizeFor, shortTitle, clusterSpan, emotionGroups, monthGroups, pickGroups, labelTitle, fitBox, gridFor, bezierGeometry, routeEdges, bezierPoint, treeLevels, originPath, pathEmphasis, relationText, networkLayout, concentricLayout, placeLabels };
})();
