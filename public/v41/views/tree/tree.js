// #777 2단계 — 실제 워크스페이스의 parentId 사슬로 그리는 트리 보기.
// 시험 데이터는 lab 파일에만 둔다. 이 화면은 셸이 넘긴 트리/예시 트리만 읽는다.
import { mountScreenToolbar } from '../../screen-toolbar.mjs';

const stage = document.getElementById('treeMain');
const world = document.getElementById('treeWorld');
const lines = document.getElementById('treeLines');
const nodes = document.getElementById('treeNodes');
const status = document.getElementById('treeStatus');

const perf = { drawMs: 0, applyMs: 0, maxApplyMs: 0, applyCount: 0, over50: 0, lastApply: 0 };
const state = { tree: null, root: null, cfg: null, scale: 1, tx: 0, ty: 0, expanded: new Set(), pointers: new Map(), pinch: null, drag: null, focusId: '' };

mountScreenToolbar({
  screen: 'tree',
  initialBar: document.querySelector('.lt-screen-toolbar'),
  titleFrom: document.getElementById('treeTitleText'),
  tools: [document.getElementById('treeFit'), document.getElementById('treeZoomOut'), document.getElementById('treeZoomIn')]
});

function momentsOf(tree) {
  if (!tree) return [];
  return tree.demoData ? tree.demoData.moments : (tree.moments || []);
}

function parentMap(tree) {
  const moments = momentsOf(tree);
  const ids = new Set(moments.map((m) => m.id));
  const parent = new Map();
  for (const edge of tree.edges || []) {
    if (edge.kind === 'parent' && ids.has(edge.from) && ids.has(edge.to) && !parent.has(edge.to)) parent.set(edge.to, edge.from);
  }
  for (const m of moments) {
    if (m.parentId && ids.has(m.parentId) && !parent.has(m.id)) parent.set(m.id, m.parentId);
  }
  return parent;
}

function buildTree(tree) {
  const moments = momentsOf(tree);
  if (!moments.length) return null;
  const parent = parentMap(tree);
  const byId = new Map(moments.map((m) => [m.id, m]));
  const children = new Map(moments.map((m) => [m.id, []]));
  const roots = [];
  for (const m of moments) {
    const p = parent.get(m.id);
    if (p && p !== m.id && children.has(p) && p !== m.id) children.get(p).push(m);
    else roots.push(m);
  }
  // 사슬이 끊긴 기록이 있어도 시작 순간 하나 아래에 다시 붙여 화면이 비지 않게 한다.
  const lead = roots.find((m) => m.first || m.parentId === null) || roots[0] || moments[0];
  for (const m of roots) if (m !== lead) children.get(lead.id).push(m);
  const seen = new Set();
  function walk(m, depth, prev) {
    if (seen.has(m.id)) return null;
    seen.add(m.id);
    const node = { id: m.id, moment: m, depth, prev, children: [], kind: 'moment', trunk: false };
    node.children = children.get(m.id).map((c) => walk(c, depth + 1, m.title)).filter(Boolean);
    return node;
  }
  const root = walk(lead, 0, '');
  root.kind = 'root';
  // 첫 순간에서 이어지는 첫 갈래를 줄기로 삼는다. 곁가지는 제자리에 두고 줄기만 세로선에 맞춘다.
  let cursor = root;
  while (cursor) { cursor.trunk = true; cursor = cursor.children[0]; }
  return root;
}

function collapsedChildren(node, cfg) {
  const kids = node.children;
  if (kids.length <= 6 || state.expanded.has(node.id)) return kids;
  const shown = kids.slice(0, 3).map((k) => k);
  shown.push({ kind: 'bundle', id: node.id + ':bundle', hidden: kids.length - 3, title: `+${kids.length - 3}개`, children: [], depth: node.depth + 1, prev: node.moment.title, parent: node });
  for (const k of kids) k.parent = node;
  return shown;
}

function config() {
  const phone = stage.clientWidth <= 600;
  return phone
    ? { card: [110, 92], bundle: [72, 38], gapX: 1300, gapY: 104, offset: 58, thumb: 44, pad: 12, maxScale: 1.6, minScale: .05, compactAt: 80 }
    : { card: [140, 108], bundle: [82, 40], gapX: 1300, gapY: 130, offset: 74, thumb: 60, pad: 24, maxScale: 1.5, minScale: .05, compactAt: 80 };
}

function build(spec, parent, depth, cfg) {
  const kids = parent ? collapsedChildren(spec, cfg) : (spec.children || []);
  const n = Object.assign({}, spec, { parent, depth, children: [], x: 0, y: 0, ax: 0, ay: 0, cardSide: parent && spec.trunk ? (depth % 2 ? -1 : 1) : 0 });
  n.children = kids.map((c) => build(c, n, depth + 1, cfg));
  n.leaves = n.kind === 'bundle' ? n.hidden : (n.children.length ? n.children.reduce((sum, c) => sum + c.leaves, 0) : 1);
  const box = n.kind === 'bundle' ? cfg.bundle : cfg.card;
  n.w = box[0]; n.h = box[1];
  n.effH = n.h + (n.children.length ? cfg.gapY : 0);
  return n;
}

function mergeSegments(segments, op) {
  const points = [...new Set(segments.flatMap((s) => [s.y0, s.y1]))].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    let best = null;
    for (const s of segments) {
      if (s.y0 <= a + 1e-6 && s.y1 >= b - 1e-6) best = best === null ? s.x : op(best, s.x);
    }
    if (best === null) continue;
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - best) < 1e-6 && Math.abs(last.y1 - a) < 1e-6) last.y1 = b;
    else out.push({ y0: a, y1: b, x: best });
  }
  return out;
}

function layout(root, cfg) {
  function firstWalk(n) {
    if (!n.children.length) {
      n.l = [{ y0: 0, y1: n.effH, x: 0 }];
      n.r = [{ y0: 0, y1: n.effH, x: n.w }];
      return;
    }
    let placedRight = null;
    n.children.forEach((child, i) => {
      firstWalk(child);
      let shift = 0;
      if (i > 0) {
        for (const a of placedRight) for (const b of child.l) {
          if (a.y1 <= b.y0 || b.y1 <= a.y0) continue;
          shift = Math.max(shift, a.x + cfg.gapX - b.x);
        }
      }
      child.x = shift; child.y = n.effH;
      const right = child.r.map((s) => ({ y0: s.y0, y1: s.y1, x: s.x + child.x }));
      placedRight = placedRight ? mergeSegments(placedRight.concat(right), Math.max) : right;
    });
    let leftEdge = Infinity, rightEdge = -Infinity;
    for (const child of n.children) {
      for (const s of child.l) leftEdge = Math.min(leftEdge, s.x + child.x);
      for (const s of child.r) rightEdge = Math.max(rightEdge, s.x + child.x);
    }
    const dx = n.w / 2 - (leftEdge + rightEdge) / 2;
    for (const child of n.children) child.x += dx;
    const left = [{ y0: 0, y1: n.effH, x: 0 }];
    const right = [{ y0: 0, y1: n.effH, x: n.w }];
    for (const child of n.children) {
      for (const s of child.l) left.push({ y0: s.y0, y1: s.y1, x: s.x + child.x });
      for (const s of child.r) right.push({ y0: s.y0, y1: s.y1, x: s.x + child.x });
    }
    n.l = mergeSegments(left, Math.min);
    n.r = mergeSegments(right, Math.max);
  }
  firstWalk(root);
  function secondWalk(n, ax, ay) {
    n.ax = ax + n.x; n.ay = ay + n.y;
    n.wx = n.ax;
    n.wy = -(n.ay + n.h);
    for (const c of n.children) secondWalk(c, n.ax, n.ay);
  }
  secondWalk(root, 0, 0);
  const target = root.wx + root.w / 2;
  function straighten(n) {
    if (n.trunk && n.parent) { n.ax += target - (n.wx + n.w / 2); n.wx = n.ax; }
    for (const c of n.children) straighten(c);
  }
  straighten(root);
  const rows = new Map();
  for (const n of allNodes(root, [])) {
    const row = Math.round(n.wy);
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row).push(n);
  }
  function moveSubtree(n, dx) { n.ax += dx; n.wx = n.ax; for (const c of n.children) moveSubtree(c, dx); }
  for (let pass = 0; pass < 3; pass++) {
    for (const group of rows.values()) {
      group.sort((a, b) => (a.wx + a.cardSide * cfg.offset) - (b.wx + b.cardSide * cfg.offset));
      for (let i = 1; i < group.length; i++) {
        const prev = group[i - 1], curr = group[i];
        const prevRight = prev.wx + prev.cardSide * cfg.offset + prev.w;
        const currLeft = curr.wx + curr.cardSide * cfg.offset;
        if (prevRight <= currLeft + 4) continue;
        const dx = prevRight - currLeft + 8;
        if (curr.trunk && !prev.trunk) moveSubtree(prev, -dx);
        else if (!curr.trunk) moveSubtree(curr, dx);
      }
    }
  }
  return root;
}

function allNodes(n, list) {
  list.push(n);
  for (const c of n.children) allNodes(c, list);
  return list;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function draw() {
  const t0 = performance.now();
  const cfg = config();
  state.cfg = cfg;
  const raw = buildTree(state.tree);
  state.root = raw ? layout(build(raw, null, 0, cfg), cfg) : null;
  const list = state.root ? allNodes(state.root, []) : [];
  const paths = [];
  for (const n of list) {
    const jx = n.wx + n.w / 2;
    const width = 1.1 + 7.6 * Math.pow(n.leaves / (state.root?.leaves || 1), .62);
    const alpha = (0.52 + 0.38 * n.leaves / (state.root?.leaves || 1)).toFixed(2);
    if (n.cardSide) {
      const left = n.wx + n.cardSide * cfg.offset;
      const edge = n.cardSide > 0 ? left : left + n.w;
      const cy = (n.wy + n.h / 2).toFixed(1);
      paths.push(`<path d="M${jx.toFixed(1)},${cy} L${edge.toFixed(1)},${cy}" stroke-width="${(width * .45).toFixed(2)}" stroke-opacity="${alpha}"></path>`);
    }
    if (!n.parent) continue;
    const p = n.parent;
    const sx = p.wx + p.w / 2, sy = p.wy;
    const tx = jx, ty = n.wy + n.h;
    const dy = Math.max(1, sy - ty);
    const c1 = n.trunk ? .55 : .38, c2 = n.trunk ? .55 : .68;
    paths.push(`<path d="M${sx.toFixed(1)},${sy.toFixed(1)} C${sx.toFixed(1)},${(sy - dy * c1).toFixed(1)} ${tx.toFixed(1)},${(ty + dy * c2).toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)}" stroke-width="${width.toFixed(2)}" stroke-opacity="${alpha}"></path>`);
  }
  lines.innerHTML = paths.join('');

  const cards = [];
  for (const n of list) {
    const x = n.wx + n.cardSide * cfg.offset;
    const pos = `--x:${x}px;--y:${n.wy}px;--w:${n.w}px;--h:${n.h}px;`;
    if (n.kind === 'bundle') {
      cards.push(`<button type="button" class="tv-bundle" data-pos="${pos}" data-expand="${esc(n.id)}" aria-label="묶인 ${n.hidden}개 순간 펼치기">+${n.hidden}개</button>`);
      continue;
    }
    const m = n.moment;
    const image = m.image || m.thumb || '';
    const thumb = image ? `<img src="${esc(image)}" alt="" draggable="false">` : '';
    const label = `깊이 ${n.depth}, 이전 순간 ${n.prev || '없음'}, ${m.title || '제목 없음'}`;
    cards.push(`<button type="button" class="tv-card${n.kind === 'root' ? ' tv-root' : ''}" data-pos="${pos}--thumb-h:${cfg.thumb}px" data-id="${esc(n.id)}" aria-label="${esc(label)}">` +
      `<span class="tv-thumb">${thumb}</span><span class="tv-cap"><span class="tv-date">${esc(m.date || '')}</span><span class="tv-name">${esc(m.title || '제목 없음')}</span></span></button>`);
  }
  nodes.innerHTML = cards.join('');
  for (const el of nodes.children) {
    const value = el.getAttribute('data-pos');
    if (!value) continue;
    for (const decl of value.split(';')) {
      const at = decl.indexOf(':');
      if (at > 0) el.style.setProperty(decl.slice(0, at), decl.slice(at + 1));
    }
    el.removeAttribute('data-pos');
  }
  status.textContent = state.root
    ? `순간 ${list.filter((n) => n.kind !== 'bundle').length}개 · ${state.tree.title || '트리'} · 뿌리에서 위로`
    : '이 트리에 아직 순간이 없어요.';
  document.getElementById('treeTitleText').textContent = state.tree?.title || '트리';
  perf.drawMs = performance.now() - t0;
  // #777 3단계: 처음 화면도 맞춤(전체 보기)으로 연다.
  fitAll();
}

function bounds() {
  if (!state.root) return { cx: 0, cy: 0, w: 1, h: 1 };
  const list = allNodes(state.root, []);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of list) {
    const x = n.wx + n.cardSide * state.cfg.offset;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x + n.w);
    minY = Math.min(minY, n.wy); maxY = Math.max(maxY, n.wy + n.h);
  }
  return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

function apply() {
  const t = performance.now();
  // 카드가 화면에서 80px보다 작아지면 사진만 남긴다. 확대하면 두 줄 글자가 다시 보인다.
  const compact = state.cfg ? state.cfg.card[0] * state.scale < state.cfg.compactAt : false;
  stage.dataset.compact = compact ? 'true' : 'false';
  world.style.transform = `translate(${state.tx}px,${state.ty}px) scale(${state.scale})`;
  const dt = performance.now() - t;
  perf.applyMs = dt;
  perf.maxApplyMs = Math.max(perf.maxApplyMs, dt);
  perf.applyCount++;
  if (state.lastApply && t - state.lastApply > 50) perf.over50++;
  state.lastApply = t;
}

function focusRoot() {
  if (!state.root) { state.scale = 1; state.tx = stage.clientWidth / 2; state.ty = stage.clientHeight - 90; apply(); return; }
  state.scale = 1;
  state.tx = stage.clientWidth / 2 - (state.root.wx + state.root.w / 2);
  state.ty = stage.clientHeight - 70 - state.root.h - state.root.wy;
  apply();
}

function fitAll() {
  const b = bounds();
  const pad = state.cfg.pad;
  const scale = Math.max(state.cfg.minScale, Math.min(state.cfg.maxScale,
    (stage.clientWidth - pad * 2) / Math.max(1, b.w),
    (stage.clientHeight - pad * 2) / Math.max(1, b.h)));
  state.scale = scale;
  state.tx = stage.clientWidth / 2 - b.cx * scale;
  state.ty = stage.clientHeight / 2 - b.cy * scale;
  apply();
}

function zoom(factor, px, py) {
  const x = px ?? stage.clientWidth / 2, y = py ?? stage.clientHeight / 2;
  const wx = (x - state.tx) / state.scale, wy = (y - state.ty) / state.scale;
  const next = Math.max(.08, Math.min(5, state.scale * factor));
  state.scale = next;
  state.tx = x - wx * next;
  state.ty = y - wy * next;
  apply();
}

function ensureVisible(el) {
  if (!el) return;
  const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
  let dx = 0, dy = 0;
  if (r.left < s.left + 12) dx = s.left + 12 - r.left;
  else if (r.right > s.right - 12) dx = s.right - 12 - r.right;
  if (r.top < s.top + 12) dy = s.top + 12 - r.top;
  else if (r.bottom > s.bottom - 12) dy = s.bottom - 12 - r.bottom;
  if (dx || dy) { state.tx += dx; state.ty += dy; apply(); }
}

function cardOrder() {
  return [...nodes.querySelectorAll('.tv-card:not([data-id=""])')];
}

function openDetail(id) {
  if (!id || !state.tree) return;
  parent.postMessage({ type: globalThis.LT41_MSG.selection, id }, location.origin);
  parent.postMessage({ type: globalThis.LT41_MSG.openBook, treeId: state.tree.id, id, fromTree: true }, location.origin);
}

nodes.addEventListener('click', (e) => {
  const bundle = e.target.closest('[data-expand]');
  if (bundle) {
    state.expanded.add(bundle.dataset.expand);
    draw();
    return;
  }
  const card = e.target.closest('[data-id]');
  if (card) { state.focusId = card.dataset.id; openDetail(state.focusId); }
});

nodes.addEventListener('keydown', (e) => {
  const order = cardOrder();
  const at = order.indexOf(document.activeElement);
  if (at < 0) return;
  let next = at;
  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = Math.min(order.length - 1, at + 1);
  else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = Math.max(0, at - 1);
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = order.length - 1;
  else return;
  e.preventDefault();
  order[next].focus({ preventScroll: true });
  state.focusId = order[next].dataset.id;
  ensureVisible(order[next]);
});

stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = stage.getBoundingClientRect();
  zoom(Math.exp(-e.deltaY * .0015), e.clientX - r.left, e.clientY - r.top);
}, { passive: false });

stage.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  stage.setPointerCapture(e.pointerId);
  if (state.pointers.size === 1) state.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, tx: state.tx, ty: state.ty };
  if (state.pointers.size === 2) {
    const [a, b] = [...state.pointers.values()];
    state.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: state.scale, tx: state.tx, ty: state.ty,
      cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    state.drag = null;
  }
});

stage.addEventListener('pointermove', (e) => {
  if (!state.pointers.has(e.pointerId)) return;
  state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (state.pinch && state.pointers.size === 2) {
    const [a, b] = [...state.pointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const r = stage.getBoundingClientRect();
    const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
    const wx = (state.pinch.tx ? (state.pinch.cx - r.left - state.pinch.tx) / state.pinch.scale : 0);
    const wy = (state.pinch.ty ? (state.pinch.cy - r.top - state.pinch.ty) / state.pinch.scale : 0);
    state.scale = Math.max(.08, Math.min(5, state.pinch.scale * distance / Math.max(1, state.pinch.distance)));
    state.tx = cx - wx * state.scale;
    state.ty = cy - wy * state.scale;
    apply();
    return;
  }
  if (!state.drag || state.drag.id !== e.pointerId) return;
  state.tx = state.drag.tx + e.clientX - state.drag.x;
  state.ty = state.drag.ty + e.clientY - state.drag.y;
  apply();
});

function endPointer(e) {
  state.pointers.delete(e.pointerId);
  if (state.pointers.size < 2) state.pinch = null;
  if (state.drag?.id === e.pointerId) state.drag = null;
}
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);

document.getElementById('treeFit').addEventListener('click', fitAll);
document.getElementById('treeZoomIn').addEventListener('click', () => zoom(1.25));
document.getElementById('treeZoomOut').addEventListener('click', () => zoom(.8));

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(draw, 120);
});

function loadTree(tree) {
  state.tree = tree;
  state.expanded.clear();
  perf.over50 = 0; perf.applyCount = 0; perf.maxApplyMs = 0; perf.lastApply = 0;
  draw();
}

window.__LT41_TREE__ = {
  loadTree,
  getPerf: () => ({ ...perf }),
  fitAll,
  focusRoot,
  zoom,
  getScale: () => state.scale,
  cardCount: () => nodes.querySelectorAll('.tv-card').length,
  bundleCount: () => nodes.querySelectorAll('.tv-bundle').length
};

loadTree(parent.LT41?.tree || null);
