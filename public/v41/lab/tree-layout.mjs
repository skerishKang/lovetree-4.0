// #777 트리 보기 시안 — 자리 잡기와 가지 모양 계산. 화면(DOM)을 모르는 순수 함수만 둔다.
//
// 자리: 가변 크기 tidy tree. van der Ploeg(2013) 'Drawing Non-layered Tidy Trees in Linear Time'
// (d3-flextree 가 쓰는 알고리즘)을 직접 구현했다. 부분 나무끼리 윤곽선(실·끝 노드)만 비교해 떼어 놓으므로
// 카드 크기가 제각각이어도 O(n)이고, 겹침이 없다. 계산은 '뿌리가 위, 자식이 아래'로 하고 마지막에
// 세로 좌표만 뒤집어 위로 자라게 한다.
//
// 이 시안에서 더한 것 두 가지(둘 다 겹침 없는 성질은 그대로다):
//  1. 가지 띠 — 부모 카드와 자식 카드 사이에 '띠' 상자를 하나 끼운다. 띠의 가로 폭은 자식들이 놓인 뒤에
//     정해지고(첫 자식 중심~끝 자식 중심), 가지 곡선은 이 띠 안에서만 휜다. 띠도 배치 상자라서
//     다른 가지의 카드가 띠에 들어오지 못한다 → 가지가 남의 카드 위를 지나가지 않는다.
//  2. 무게 중심 — 부모는 자식들 한가운데가 아니라 '달린 순간 수'로 무게를 준 중심 아래에 선다.
//     길게 이어진 쪽(줄기)은 거의 곧게 위로 가고, 짧은 갈림은 옆으로 빠진다. 자식이 하나면 정확히 수직이다.
//
// 순서: 형제는 데이터 순서(만든 순서) 그대로 왼쪽→오른쪽에 놓는다. 크기로 다시 줄 세우지 않는다.

export const LAYOUT_DEFAULTS = Object.freeze({
  foldOver: 6,      // 갈림이 이 수를 넘으면 접는다
  foldShow: 3,      // 접었을 때 보이는 갈림 수(나머지는 '+N개' 묶음 가지)
  gapX: 16,         // 나란한 카드 사이 가로 틈
  gapY: 12,         // 카드와 그 위쪽(가지 띠·다른 가지 카드) 사이 세로 틈
  bandMin: 44,      // 가지 띠 높이: 자식 하나일 때
  bandPerChild: 7,  // 자식이 하나 늘 때마다 띠가 높아지는 만큼(넓게 퍼지는 가지는 길게)
  bandMax: 100,
  bandPad: 12,      // 띠 양끝 여유 — 가장 굵은 가지 반폭보다 커야 한다
  balance: 'weight',// 'weight' = 무게 중심, 'middle' = 첫·끝 자식의 한가운데(고전 tidy tree)
  weightPower: 1.5
});

/* ── 1. 순간 목록 → 나무 ─────────────────────────────────────────────── */

/**
 * 순간 배열(앱 모양: { id, parentId, … })을 나무로 엮는다. 형제 순서는 배열 순서 그대로다.
 * 앱 데이터는 시작 순간이 하나지만, 깨진 기록(부모 없음·여러 시작·고리)이 와도 화면이 비지 않게
 * 첫 시작 순간 아래에 다시 붙인다.
 */
export function buildHierarchy(moments) {
  const list = Array.isArray(moments) ? moments.filter((m) => m && m.id != null) : [];
  if (!list.length) return null;
  const byId = new Map();
  for (const m of list) if (!byId.has(m.id)) byId.set(m.id, { id: m.id, moment: m, parent: null, children: [], depth: 0, size: 1, order: byId.size });
  const nodes = [...byId.values()];
  const lead = nodes.find((n) => n.moment.parentId == null) || nodes[0];
  for (const n of nodes) {
    if (n === lead) continue;
    const p = byId.get(n.moment.parentId);
    n.parent = p && p !== n ? p : lead;
  }
  // 고리 끊기: 부모를 따라 올라가 시작 순간에 닿지 못하면 시작 순간에 붙인다.
  const state = new Map([[lead, 2]]);
  for (const n of nodes) {
    const path = [];
    let at = n;
    while (at && !state.has(at)) { state.set(at, 1); path.push(at); at = at.parent; }
    if (at && state.get(at) === 1) at.parent = lead;
    for (const p of path) state.set(p, 2);
  }
  for (const n of nodes) if (n.parent) n.parent.children.push(n);
  // 깊이(앞에서부터), 달린 순간 수(뒤에서부터).
  const order = [];
  const stack = [lead];
  while (stack.length) {
    const n = stack.pop();
    order.push(n);
    for (let i = n.children.length - 1; i >= 0; i--) { n.children[i].depth = n.depth + 1; stack.push(n.children[i]); }
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const n = order[i];
    n.size = 1;
    for (const c of n.children) n.size += c.size;
  }
  lead.count = order.length;
  return lead;
}

/**
 * 한 순간에서 화면에 보일 갈림. 갈림이 foldOver 를 넘고 펼치지 않았으면 앞의 foldShow 개와 묶음 하나.
 * 펼친 상태면 전부와 '접기' 단추 자리 하나.
 */
export function visibleChildren(node, options = {}, expanded = null) {
  const foldOver = options.foldOver ?? LAYOUT_DEFAULTS.foldOver;
  const foldShow = options.foldShow ?? LAYOUT_DEFAULTS.foldShow;
  const kids = node.children;
  if (kids.length <= foldOver) return { shown: kids, bundle: null };
  if (expanded && expanded.has(node.id)) return { shown: kids, bundle: { open: true, count: 0, size: 0, hidden: [] } };
  const hidden = kids.slice(foldShow);
  let size = 0;
  for (const h of hidden) size += h.size;
  return { shown: kids.slice(0, foldShow), bundle: { open: false, count: hidden.length, size, hidden } };
}

/* ── 2. 가변 크기 tidy tree (van der Ploeg) ──────────────────────────── */

function box(kind, w, h) {
  return { kind, w, h, y: 0, x: 0, c: [], prelim: 0, mod: 0, shift: 0, change: 0, tl: null, tr: null, el: null, er: null, msel: 0, mser: 0, ax: w / 2 };
}

const bottom = (t) => t.y + t.h;
const nextLeft = (t) => (t.c.length ? t.c[0] : t.tl);
const nextRight = (t) => (t.c.length ? t.c[t.c.length - 1] : t.tr);

function updateIYL(lowY, index, ih) {
  while (ih !== null && lowY >= ih.lowY) ih = ih.nxt;
  return { lowY, index, nxt: ih };
}

function moveSubtree(t, i, si, dist) {
  const c = t.c[i];
  c.mod += dist; c.msel += dist; c.mser += dist;
  // 사이에 낀 작은 부분 나무들을 벌어진 틈에 고르게 나눠 놓는다.
  if (si !== i - 1) {
    const nr = i - si;
    t.c[si + 1].shift += dist / nr;
    c.shift -= dist / nr;
    c.change -= dist - dist / nr;
  }
}

function setLeftThread(t, i, cl, modsumcl) {
  const li = t.c[0].el;
  li.tl = cl;
  const diff = (modsumcl - cl.mod) - t.c[0].msel;
  li.mod += diff; li.prelim -= diff;
  t.c[0].el = t.c[i].el; t.c[0].msel = t.c[i].msel;
}

function setRightThread(t, i, sr, modsumsr) {
  const ri = t.c[i].er;
  ri.tr = sr;
  const diff = (modsumsr - sr.mod) - t.c[i].mser;
  ri.mod += diff; ri.prelim -= diff;
  t.c[i].er = t.c[i - 1].er; t.c[i].mser = t.c[i - 1].mser;
}

function separate(t, i, ih) {
  let sr = t.c[i - 1], mssr = sr.mod;
  let cl = t.c[i], mscl = cl.mod;
  let first = true;
  while (sr !== null && cl !== null) {
    if (bottom(sr) > ih.lowY) ih = ih.nxt;
    const dist = (mssr + sr.prelim + sr.w) - (mscl + cl.prelim);
    // 첫 비교(형제 상자끼리)에서는 떨어져 있어도 맞붙인다 — 자식들이 넓게 퍼진 형제 옆에 헛틈이 남지 않는다
    // (d3-flextree 와 같은 처리). 그 아래 윤곽선 비교는 겹칠 때만 민다.
    if (dist > 0 || (first && dist < 0)) { mscl += dist; moveSubtree(t, i, ih.index, dist); }
    first = false;
    const sy = bottom(sr), cy = bottom(cl);
    if (sy <= cy) { sr = nextRight(sr); if (sr !== null) mssr += sr.mod; }
    if (sy >= cy) { cl = nextLeft(cl); if (cl !== null) mscl += cl.mod; }
  }
  if (sr === null && cl !== null) setLeftThread(t, i, cl, mscl);
  else if (sr !== null && cl === null) setRightThread(t, i, sr, mssr);
}

// 사이에 낀 형제들의 밀림을 실제 자리에 반영한다. 원 알고리즘은 둘째 걸음에서 하지만, 무게 중심을
// 구하려면 형제 자리가 모두 필요해 형제 떼어 놓기가 끝난 바로 뒤에 한다(첫·끝 자식은 변하지 않는다).
function spreadChildren(t) {
  let d = 0, delta = 0;
  for (const c of t.c) {
    d += c.shift;
    delta += d + c.change;
    c.mod += delta;
    c.shift = 0; c.change = 0;
  }
}

function placeParent(t, options) {
  const first = t.c[0], last = t.c[t.c.length - 1];
  if (t.kind === 'band') {
    // 띠: 첫 자식 중심 ~ 끝 자식 중심(+여유). 부모가 설 자리(ax)는 무게 중심 또는 한가운데.
    const a0 = first.prelim + first.mod + first.ax;
    const a1 = last.prelim + last.mod + last.ax;
    let target = (a0 + a1) / 2;
    if (options.balance === 'weight') {
      let sum = 0, total = 0;
      for (const c of t.c) {
        const w = Math.pow(c.weight || 1, options.weightPower);
        sum += w * (c.prelim + c.mod + c.ax);
        total += w;
      }
      target = sum / total;
    }
    t.prelim = a0 - options.bandPad;
    t.w = a1 - a0 + options.bandPad * 2;
    t.ax = target - t.prelim;
    return;
  }
  if (t.c.length === 1 && first.kind === 'band') {
    // 카드: 띠가 정해 준 자리 위에 카드 중심을 맞춘다.
    t.prelim = first.prelim + first.mod + first.ax - t.ax;
    return;
  }
  // 띠 없는 고전 배치: 첫·끝 자식의 한가운데.
  t.prelim = (first.prelim + first.mod + last.mod + last.prelim + last.w) / 2 - t.w / 2;
}

function combine(t, options) {
  const cs = t.c.length;
  if (cs === 0) { t.el = t; t.er = t; t.msel = 0; t.mser = 0; return; }
  let ih = updateIYL(bottom(t.c[0].el), 0, null);
  for (let i = 1; i < cs; i++) {
    const lowY = bottom(t.c[i].er);
    separate(t, i, ih);
    ih = updateIYL(lowY, i, ih);
  }
  spreadChildren(t);
  placeParent(t, options);
  t.el = t.c[0].el; t.msel = t.c[0].msel;
  t.er = t.c[cs - 1].er; t.mser = t.c[cs - 1].mser;
}

/**
 * 상자 나무({ w, h, c: [자식…] })에 x·y 를 매긴다. 뿌리가 y=0, 자식은 부모 바로 아래(y = 부모 y + 부모 h).
 * x 는 상자의 왼쪽 끝. 깊은 나무에서도 호출 스택을 쓰지 않도록 되부름 없이 돈다.
 */
export function tidy(root, options = {}) {
  const opt = { ...LAYOUT_DEFAULTS, ...options };
  const order = [];
  const stack = [root];
  root.y = 0;
  while (stack.length) {
    const t = stack.pop();
    order.push(t);
    // 거꾸로 쌓아 두면 꺼낼 때 데이터 순서가 된다 → order 는 '부모 먼저, 형제는 왼쪽부터'.
    for (let i = t.c.length - 1; i >= 0; i--) { const c = t.c[i]; c.y = t.y + t.h; stack.push(c); }
  }
  for (let i = order.length - 1; i >= 0; i--) combine(order[i], opt);
  const walk = [[root, 0]];
  while (walk.length) {
    const [t, sum] = walk.pop();
    const modsum = sum + t.mod;
    t.x = t.prelim + modsum;
    for (const c of t.c) walk.push([c, modsum]);
  }
  return order;
}

/** 시험·비교용: { w, h, children } 나무를 고전 방식(띠 없음)으로 놓고 같은 모양에 x·y 를 적어 돌려준다. */
export function tidyBoxes(tree, options = {}) {
  const make = (n) => { const b = box('plain', n.w, n.h); b.ref = n; return b; };
  const root = make(tree);
  const stack = [root];
  while (stack.length) {
    const b = stack.pop();
    for (const child of b.ref.children || []) { const cb = make(child); b.c.push(cb); stack.push(cb); }
  }
  for (const b of tidy(root, options)) { b.ref.x = b.x; b.ref.y = b.y; }
  return tree;
}

/* ── 3. 순간 나무 → 화면 좌표 ────────────────────────────────────────── */

/**
 * 나무를 놓는다.
 *  root     buildHierarchy 결과
 *  options  sizeOf(item) → { w, h } (item: { kind: 'moment'|'bundle'|'fold', node, root })
 *           expanded: 펼친 순간 id 의 Set, 그 밖은 LAYOUT_DEFAULTS
 * 돌려주는 좌표는 화면 방향(y 가 아래로 커진다)이고 뿌리 카드의 아래 가운데가 (0, 0)이다.
 * 나무는 위(y 가 작아지는 쪽)로 자란다.
 */
export function layoutTree(root, options = {}) {
  const opt = { ...LAYOUT_DEFAULTS, ...options };
  const sizeOf = opt.sizeOf || (() => ({ w: 108, h: 96 }));
  const expanded = opt.expanded || null;
  if (!root) return { cards: [], bands: [], edges: [], bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 }, total: 0, visible: 0, hidden: 0 };

  const cardBox = (item) => {
    const s = sizeOf(item);
    const b = box('card', s.w + opt.gapX, s.h + opt.gapY);
    b.item = item; b.cw = s.w; b.ch = s.h;
    b.weight = item.size;
    return b;
  };

  const rootItem = { kind: 'moment', id: root.id, node: root, moment: root.moment, root: true, size: root.size, depth: 0, parentId: null };
  const rootBox = cardBox(rootItem);
  const pending = [rootBox];
  while (pending.length) {
    const b = pending.pop();
    const node = b.item.node;
    if (b.item.kind !== 'moment') continue;
    const { shown, bundle } = visibleChildren(node, opt, expanded);
    b.item.folded = bundle && !bundle.open ? bundle.count : 0;
    const count = shown.length + (bundle ? 1 : 0);
    if (!count) continue;
    const band = box('band', opt.bandPad * 2, Math.min(opt.bandMax, opt.bandMin + opt.bandPerChild * (count - 1)));
    band.owner = b;
    b.c.push(band);
    b.band = band;
    for (const child of shown) {
      const cb = cardBox({ kind: 'moment', id: child.id, node: child, moment: child.moment, root: false, size: child.size, depth: child.depth, parentId: node.id });
      cb.up = b;
      band.c.push(cb);
      pending.push(cb);
    }
    if (bundle) {
      const item = bundle.open
        ? { kind: 'fold', id: node.id + ':fold', node, size: 1, count: node.children.length, depth: node.depth + 1, parentId: node.id }
        : { kind: 'bundle', id: node.id + ':bundle', node, size: bundle.size, count: bundle.count, depth: node.depth + 1, parentId: node.id };
      const cb = cardBox(item);
      cb.up = b;
      band.c.push(cb);
    }
  }

  const boxes = tidy(rootBox, opt);

  // 뿌리 카드 아래 가운데를 (0,0)으로, 세로는 뒤집는다.
  const ox = rootBox.x + rootBox.ax;
  const cards = [], bands = [], edges = [];
  for (const b of boxes) {
    if (b.kind === 'band') {
      bands.push({ parentId: b.owner.item.id, x: b.x - ox, y: -(b.y + b.h), w: b.w, h: b.h });
      continue;
    }
    const left = b.x + opt.gapX / 2 - ox;
    const card = {
      id: b.item.id, kind: b.item.kind, moment: b.item.moment || null, root: !!b.item.root,
      parentId: b.item.parentId, depth: b.item.depth, size: b.item.size, count: b.item.count || 0, folded: b.item.folded || 0,
      x: left, y: -(b.y + b.ch), w: b.cw, h: b.ch, cx: left + b.cw / 2
    };
    b.card = card;
    cards.push(card);
  }
  for (const b of boxes) {
    if (b.kind !== 'card' || !b.band) continue;
    const p = b.card;
    let main = null;
    for (const cb of b.band.c) if (!main || cb.item.size > main.item.size) main = cb;
    for (const cb of b.band.c) {
      const c = cb.card;
      edges.push({
        from: p.id, to: c.id, kind: c.kind, size: c.size, parentSize: p.size, main: cb === main,
        x0: p.cx, y0: p.y, x1: c.cx, y1: c.y + c.h,
        stem: opt.gapY   // 부모 카드 위 이만큼은 곧게 오른 뒤 띠 안에서 휜다
      });
    }
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, visible = 0;
  for (const c of cards) {
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x + c.w);
    minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y + c.h);
    if (c.kind === 'moment') visible++;
  }
  const total = root.size;
  return { cards, bands, edges, bounds: { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY }, total, visible, hidden: total - visible };
}

/* ── 4. 가지 모양 ─────────────────────────────────────────────────────── */

/**
 * 가지 굵기. 달린 순간 수(size)가 많을수록 굵다 — 뿌리 쪽이 가장 굵고 끝으로 갈수록 가늘다.
 * power 0.5 는 '갈라진 가지 단면의 합 = 원래 가지 단면'(다빈치 규칙)에 해당한다.
 */
export function branchWidth(size, total, style = {}) {
  const min = style.min ?? 1.6, max = style.max ?? 8, power = style.power ?? 0.6;
  const ratio = Math.max(0, Math.min(1, size / Math.max(1, total)));
  return min + (max - min) * Math.pow(ratio, power);
}

/**
 * 한 가지의 양끝 굵기. w1 = 자식 쪽(그 가지에 달린 순간 수), w0 = 부모 쪽.
 * 가장 무거운 갈림(줄기)은 부모 굵기에서 이어지고, 곁가지는 제 굵기에서 조금만 굵게 시작한다.
 */
export function edgeWidths(edge, total, style = {}) {
  const w1 = branchWidth(edge.size, total, style);
  const wp = branchWidth(edge.parentSize, total, style);
  const w0 = edge.main ? wp : Math.min(wp, w1 * (style.flare ?? 1.25));
  return [Math.max(w0, w1), w1];
}

/** 가지 중심선: 부모 카드 위에서 곧게 조금 오른 뒤(stem), 띠 안에서 부드럽게 휘어 자식 카드 아래로 곧게 닿는다. */
export function branchCurve(edge, style = {}) {
  const lean = style.lean ?? 0.1, k1 = style.k1 ?? 0.5, k2 = style.k2 ?? 0.5;
  const sy = edge.y0 - (edge.stem || 0);
  const h = sy - edge.y1;
  const dx = edge.x1 - edge.x0;
  return {
    x0: edge.x0, y0: edge.y0,
    p0: [edge.x0, sy],
    p1: [edge.x0 + dx * lean, sy - h * k1],
    p2: [edge.x1, edge.y1 + h * k2],
    p3: [edge.x1, edge.y1]
  };
}

function cubicAt(c, t) {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
  return [a * c.p0[0] + b * c.p1[0] + d * c.p2[0] + e * c.p3[0], a * c.p0[1] + b * c.p1[1] + d * c.p2[1] + e * c.p3[1]];
}

function cubicTangent(c, t) {
  const u = 1 - t;
  const x = 3 * u * u * (c.p1[0] - c.p0[0]) + 6 * u * t * (c.p2[0] - c.p1[0]) + 3 * t * t * (c.p3[0] - c.p2[0]);
  const y = 3 * u * u * (c.p1[1] - c.p0[1]) + 6 * u * t * (c.p2[1] - c.p1[1]) + 3 * t * t * (c.p3[1] - c.p2[1]);
  const len = Math.hypot(x, y) || 1;
  return [x / len, y / len];
}

/** 가지 중심선 위의 점들(곧은 부분 시작점 포함). */
export function branchPoints(edge, style = {}, steps = 12) {
  const c = branchCurve(edge, style);
  const pts = [[c.x0, c.y0]];
  for (let i = 0; i <= steps; i++) pts.push(cubicAt(c, i / steps));
  return pts;
}

/**
 * 굵기가 w0(부모 쪽)에서 w1(자식 쪽)로 가늘어지는 가지를 닫힌 도형으로 만든다.
 * 돌려주는 값: { d: SVG path, outline: [[x,y]…] }
 */
export function branchRibbon(edge, w0, w1, style = {}, steps = 12) {
  const c = branchCurve(edge, style);
  const leftSide = [], rightSide = [];
  const push = (p, n, w) => {
    leftSide.push([p[0] + n[0] * w / 2, p[1] + n[1] * w / 2]);
    rightSide.push([p[0] - n[0] * w / 2, p[1] - n[1] * w / 2]);
  };
  // 곧은 부분(카드 위 틈): 굵기 w0 그대로, 법선은 가로.
  push([c.x0, c.y0], [1, 0], w0);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = cubicAt(c, t);
    const tan = cubicTangent(c, t);
    // 위로 가는 선의 왼쪽 법선. 끝점에서는 접선이 수직이라 가로 법선이 된다.
    const n = [-tan[1], tan[0]];
    const ease = t * t * (3 - 2 * t);
    push(p, n[0] < 0 ? [-n[0], -n[1]] : n, w0 + (w1 - w0) * ease);
  }
  const outline = leftSide.concat(rightSide.reverse());
  let d = '';
  for (let i = 0; i < outline.length; i++) d += (i ? 'L' : 'M') + outline[i][0].toFixed(1) + ' ' + outline[i][1].toFixed(1);
  return { d: d + 'Z', outline };
}
