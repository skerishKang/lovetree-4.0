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

  // 묶음 나누기: 순간을 6묶음으로 나눈다(최소 1개, 올림).
  function groupSizeFor(total) {
    return Math.max(1, Math.ceil(total / 6));
  }

  // 묶음 하나의 이름·개수: "순간 01–06" 처럼 앞뒤 순번을 붙인다.
  function clusterSpan(index, groupSize, total) {
    return {
      name: `순간 ${String(index * groupSize + 1).padStart(2, '0')}–${String(Math.min((index + 1) * groupSize, total)).padStart(2, '0')}`,
      sub: '순간의 연결',
      count: Math.max(0, Math.min(groupSize, total - index * groupSize))
    };
  }

  // 작은 트리 보정: 순간이 36개 이하면 묶음을 세로로 촘촘히(220px 간격) 놓고 무대 높이를 1600으로 줄인다.
  function smallTreeLayout(count) {
    return count <= 36 ? { spacing: 220, baseY: 250, worldHeight: 1600 } : null;
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

  // 손가락 화면의 묶음 맞춤 배율: 0.40~0.62 사이로 묶는다.
  function mobileFit(vw, vh, spread) {
    const raw = Math.min((vw - 26) / (spread * 1.75), (vh - 190) / (spread * 1.25));
    return Math.max(0.40, Math.min(0.62, raw));
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

  // 그물형 배치: 지금의 묶음 나선 공식을 그대로 옮긴 것(겉모습 유지).
  // 첫 순간만 묶음 0 허브 옆 고정 자리에 앉는다 — 순간 수가 늘어도 시작점 자리가 흔들리지 않는다(#366).
  // opts.candidates는 나중에 AI가 제안하는 흐린 후보 점이 들어올 자리(이슈 #366 기록) — 지금은 받기만 한다.
  function networkLayout(moments, centers, opts = {}) {
    void opts.candidates;
    const gs = groupSizeFor(moments.length);
    const points = {};
    moments.forEach((m, i) => {
      const c = centers[Math.min(centers.length - 1, Math.floor(i / gs))];
      const j = i % gs;
      const a = -2.8 + j * .78, dist = 100 + j * 38;
      points[m.id] = i === 0
        ? { x: c.x - 34, y: c.y + 18 }
        : { x: c.x + Math.cos(a) * dist, y: c.y + Math.sin(a) * dist };
    });
    return { points, groupSize: gs };
  }

  // 동심원형 배치: 첫 순간을 가운데, 1단계·2단계… 순서대로 바깥 원에(#366).
  // 같은 부모의 자식은 부모의 부채꼴 안에 하위 무게만큼 나눠 붙이고(부모 근처에 모임),
  // 같은 단계 이웃끼리 직선거리가 겹치지 않을 최소 반지름을 단계별로 계산한 뒤
  // 화면에 맞춰 균일 축척으로 줄인다 — 점 크기도 축척을 따라가므로 겹침이 남지 않는다.
  // opts.candidates는 나중에 AI가 제안하는 흐린 후보 점이 들어올 자리(이슈 #366 기록) — 지금은 받기만 한다.
  function concentricLayout(moments, edges, opts = {}) {
    const width = opts.width || 1200, height = opts.height || 800;
    const pad = opts.pad ?? 46;
    const nodeR = opts.nodeR ?? 4.5;
    const gap = opts.gap ?? 8;
    void opts.candidates;
    const minGap = 2 * nodeR + gap;
    const { firstId, levelOf, maxLevel, childrenOf } = treeLevels(moments, edges);
    const center = { x: opts.cx ?? width / 2, y: opts.cy ?? height / 2 };
    const points = {};
    const empty = { points, center, radii: [0], scale: 1, levelOf, maxLevel, firstId, dotR: 0 };
    if (!firstId) return empty;
    // 1) 하위 무게: 자신 + 자손 수. 부채꼴을 나누는 기준.
    const weightOf = {};
    const weight = id => {
      if (weightOf[id]) return weightOf[id];
      let w = 1;
      for (const c of childrenOf[id] || []) w += weight(c);
      weightOf[id] = w;
      return w;
    };
    // 2) 각도 배분: 부모의 부채꼴을 자식 무게만큼 나눠 물려준다. 첫 순간은 위(12시)에서 시작.
    const angleOf = {};
    const assign = (id, a0, a1) => {
      angleOf[id] = (a0 + a1) / 2;
      const ch = childrenOf[id] || [];
      if (!ch.length) return;
      const total = ch.reduce((s, c) => s + weight(c), 0);
      let cur = a0;
      for (const c of ch) { const span = (a1 - a0) * (weight(c) / total); assign(c, cur, cur + span); cur += span; }
    };
    assign(firstId, -Math.PI / 2, 3 * Math.PI / 2);
    // 3) 단계별 반지름: 이전 단계보다 링 간격 이상 + 같은 단계 이웃 각도 차로 겹침이 없는 반지름.
    const byLevel = Array.from({ length: maxLevel + 1 }, () => []);
    for (const m of moments) if (m.id !== firstId) byLevel[levelOf[m.id]].push(m.id);
    const radii = [0];
    for (let L = 1; L <= maxLevel; L++) {
      const items = byLevel[L].slice().sort((a, b) => angleOf[a] - angleOf[b]);
      let r = radii[L - 1] + minGap;
      for (let i = 0; i < items.length; i++) {
        const prev = items[(i - 1 + items.length) % items.length];
        const raw = Math.abs(angleOf[items[i]] - angleOf[prev]);
        const d = Math.min(raw, 2 * Math.PI - raw); // 이웃은 감김 방향의 짧은 호 기준
        if (d > 1e-9) r = Math.max(r, minGap / (2 * Math.sin(d / 2)));
        else r = Math.max(r, (items.length * minGap) / (2 * Math.PI));
      }
      radii[L] = r;
    }
    // 4) 화면 맞춤: 균일 축척 — 간격과 점이 같이 줄어들어 겹침 비율이 유지된다.
    const rMax = radii[maxLevel] + nodeR;
    const available = Math.max(20, Math.min(width, height) / 2 - pad);
    const scale = Math.min(1, available / rMax);
    for (const m of moments) {
      const L = levelOf[m.id];
      const r = L === 0 ? 0 : radii[L] * scale;
      const th = angleOf[m.id];
      points[m.id] = { x: center.x + Math.cos(th) * r, y: center.y + Math.sin(th) * r };
    }
    return { points, center, radii, scale, levelOf, maxLevel, firstId, dotR: nodeR * scale, minGap: minGap * scale };
  }

  return { branchPoint, groupSizeFor, clusterSpan, smallTreeLayout, bezierGeometry, mobileFit, routeEdges, bezierPoint, treeLevels, originPath, pathEmphasis, relationText, networkLayout, concentricLayout };
})();
