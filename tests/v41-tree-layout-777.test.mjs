// #777 트리 보기 시안 — 자리 잡기(가변 크기 tidy tree) 단위 시험.
// 화면 없이 숫자로만 본다: 겹침 0, 부모가 항상 아래, 갈림 순서 유지, 접기 개수, 가지가 남의 카드를 지나지 않음.
// 시험 데이터는 시안 페이지가 쓰는 세 벌(10·40·120개) 그대로와, 크기·모양이 제각각인 무작위 나무다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LAYOUT_DEFAULTS, buildHierarchy, visibleChildren, layoutTree, tidyBoxes,
  branchWidth, edgeWidths, branchPoints, branchRibbon
} from '../public/v41/views/tree/tree-layout.mjs';
import { DATASETS, EMOTIONS, dataset } from '../tests/fixtures/tree-777-data.mjs';
import { EMOTIONS as APP_EMOTIONS } from '../public/v41/domain.mjs';
import { testBackNavigation } from './helpers/history-assert.mjs';

const EPS = 1e-6;
const COUNTS = [10, 40, 120];

// 시안 페이지와 같은 카드 크기 두 벌(넓은 화면·좁은 화면). 뿌리·사진 카드·글 카드·묶음이 서로 다르다.
const SIZES = {
  wide: (it) => (it.kind !== 'moment' ? { w: 80, h: 38 } : it.root ? { w: 132, h: 122 } : it.moment.thumb ? { w: 108, h: 100 } : { w: 108, h: 66 }),
  narrow: (it) => (it.kind !== 'moment' ? { w: 68, h: 34 } : it.root ? { w: 112, h: 106 } : it.moment.thumb ? { w: 92, h: 88 } : { w: 92, h: 60 })
};
// 시안 ①(가는 곡선)·②(굵은 나무)의 가지 설정 — 페이지의 값과 같은 범위에서 가장 굵은 경우로 본다.
const STYLES = [
  { name: '시안 1', bandPad: 12, width: { min: 1.6, max: 8, power: 0.6 }, curve: {} },
  { name: '시안 2', bandPad: 22, width: { min: 2.4, max: 34, power: 0.5 }, curve: { lean: 0.16, k1: 0.42, k2: 0.6 } }
];

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const allFoldable = (root) => {
  const ids = new Set();
  const stack = [root];
  while (stack.length) { const n = stack.pop(); if (n.children.length > LAYOUT_DEFAULTS.foldOver) ids.add(n.id); stack.push(...n.children); }
  return ids;
};

/** 겹치는 쌍과, 가로·세로로 너무 붙은 쌍을 센다. */
function crowding(cards, others, gapX, gapY) {
  let overlap = 0, tightX = 0, tightY = 0;
  const rects = [...cards, ...others];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      const xo = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const yo = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (xo > EPS && yo > EPS) overlap++;
      if (i >= cards.length || j >= cards.length) continue;
      if (yo > EPS && xo <= EPS && -xo < gapX - EPS) tightX++;
      if (xo > EPS && yo <= EPS && -yo < gapY - EPS) tightY++;
    }
  }
  return { overlap, tightX, tightY };
}

function everyLayout(fn) {
  for (const count of COUNTS) {
    const root = buildHierarchy(dataset(count));
    for (const [sizeName, sizeOf] of Object.entries(SIZES)) {
      for (const balance of ['weight', 'middle']) {
        for (const style of STYLES) {
          for (const open of [false, true]) {
            const options = { sizeOf, balance, bandPad: style.bandPad, expanded: open ? allFoldable(root) : new Set() };
            fn(layoutTree(root, options), { count, root, options, style, label: `${count}개·${sizeName}·${balance}·${style.name}·${open ? '펼침' : '접힘'}` });
          }
        }
      }
    }
  }
}

/* ── 시험 데이터 ─────────────────────────────────────────────────────── */

test('#777 시험 데이터 세 벌은 앱의 순간 모양 그대로다(10·40·120개, 시작 순간 하나)', () => {
  assert.deepEqual(EMOTIONS, APP_EMOTIONS, '감정 값은 앱(domain)과 같다');
  for (const count of COUNTS) {
    const moments = dataset(count);
    assert.equal(moments.length, count);
    assert.equal(new Set(moments.map((m) => m.id)).size, count, 'id 는 겹치지 않는다');
    assert.equal(moments.filter((m) => m.parentId === null).length, 1, '시작 순간은 하나');
    const seen = new Set();
    for (const m of moments) {
      assert.deepEqual(Object.keys(m), ['id', 'parentId', 'title', 'date', 'thumb', 'emotion']);
      assert.ok(m.parentId === null || seen.has(m.parentId), '이전 순간이 먼저 만들어져 있다');
      assert.match(m.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(m.thumb === null || m.thumb.startsWith('/v41/example-media/'), '썸네일은 저장소 안 그림만');
      assert.ok(EMOTIONS.includes(m.emotion));
      seen.add(m.id);
    }
    assert.deepEqual(dataset(count), moments, '같은 데이터가 다시 나온다');
  }
  const fan = (count) => Math.max(...flat(buildHierarchy(dataset(count))).map((n) => n.children.length));
  assert.equal(fan(10), 2, '10개: 갈림은 두 갈래까지');
  assert.equal(fan(40), 27, '40개: 한 순간에 갈림 27개');
  assert.equal(flat(buildHierarchy(dataset(10))).filter((n) => n.children.length > 1).length, 2, '10개: 갈림 지점 2곳');
  assert.ok(Object.keys(DATASETS).every((k) => COUNTS.includes(Number(k))));
});

function flat(root) {
  const out = [];
  const stack = [root];
  while (stack.length) { const n = stack.pop(); out.push(n); stack.push(...n.children); }
  return out;
}

test('#777 순간 목록 → 나무: 형제 순서는 만든 순서, 달린 순간 수가 맞고, 깨진 기록도 한 나무로 엮는다', () => {
  for (const count of COUNTS) {
    const moments = dataset(count);
    const root = buildHierarchy(moments);
    assert.equal(root.size, count);
    assert.equal(root.count, count);
    const at = new Map(moments.map((m, i) => [m.id, i]));
    for (const n of flat(root)) {
      const orders = n.children.map((c) => at.get(c.id));
      assert.deepEqual(orders, [...orders].sort((a, b) => a - b), '형제는 배열 순서 그대로');
      assert.equal(n.size, 1 + n.children.reduce((s, c) => s + c.size, 0));
      if (n.parent) assert.equal(n.depth, n.parent.depth + 1);
    }
  }
  assert.equal(buildHierarchy([]), null);
  const broken = buildHierarchy([
    { id: 'a', parentId: null }, { id: 'b', parentId: 'a' },
    { id: 'c', parentId: '없는 순간' }, { id: 'd', parentId: null },
    { id: 'e', parentId: 'f' }, { id: 'f', parentId: 'e' }, { id: 'g', parentId: 'g' }
  ]);
  assert.equal(broken.id, 'a');
  assert.equal(broken.size, 7, '끊기거나 고리를 이룬 기록도 빠지지 않는다');
  assert.equal(flat(broken).length, 7);
});

/* ── 알고리즘 자체 ───────────────────────────────────────────────────── */

test('#777 고전 방식(띠 없음) 좌표는 d3-flextree 2.1.2 와 같다 — 고정 사례 4개', () => {
  const { cases } = JSON.parse(readFileSync(new URL('./fixtures/tree-layout-777-flextree.json', import.meta.url), 'utf8'));
  for (const rows of cases) {
    const nodes = rows.map(([, w, h]) => ({ w, h, children: [] }));
    rows.forEach(([parent], i) => { if (parent >= 0) nodes[parent].children.push(nodes[i]); });
    tidyBoxes(nodes[0]);
    const rootCenter = nodes[0].x + nodes[0].w / 2;
    rows.forEach(([, , , cx, y], i) => {
      assert.ok(Math.abs(nodes[i].x + nodes[i].w / 2 - rootCenter - cx) < 1e-3, `${i}번 가로: ${nodes[i].x + nodes[i].w / 2 - rootCenter} ≠ ${cx}`);
      assert.equal(nodes[i].y, y, `${i}번 세로`);
    });
  }
});

test('#777 무작위 상자 나무 300그루: 겹침 0, 형제 순서 유지, 자식은 부모 바로 다음 줄', () => {
  let nodesTotal = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const r = seeded(seed);
    const n = 2 + Math.floor(r() * 140);
    const nodes = [{ w: 10 + Math.floor(r() * 130), h: 10 + Math.floor(r() * 130), children: [] }];
    while (nodes.length < n) {
      const p = nodes[Math.floor(Math.pow(r(), 0.6) * nodes.length)];
      const c = { w: 10 + Math.floor(r() * 130), h: 10 + Math.floor(r() * 130), children: [], up: p };
      p.children.push(c); nodes.push(c);
    }
    tidyBoxes(nodes[0]);
    nodesTotal += n;
    assert.equal(crowding(nodes, [], 0, 0).overlap, 0, `씨앗 ${seed}: 겹침`);
    for (const p of nodes) {
      for (let i = 0; i < p.children.length; i++) {
        assert.equal(p.children[i].y, p.y + p.h, '자식은 부모 바로 다음');
        if (i) assert.ok(p.children[i].x >= p.children[i - 1].x + p.children[i - 1].w - EPS, `씨앗 ${seed}: 형제 순서`);
      }
    }
  }
  assert.ok(nodesTotal > 15000);
});

test('#777 깊은 나무(한 줄 4,000개)와 넓은 나무(한 순간에 3,000갈림)도 스택 넘침 없이 놓는다', () => {
  const chain = [{ id: 0, parentId: null }];
  for (let i = 1; i < 4000; i++) chain.push({ id: i, parentId: i - 1 });
  const deep = layoutTree(buildHierarchy(chain), { sizeOf: SIZES.wide });
  assert.equal(deep.visible, 4000);
  assert.ok(deep.cards.every((c) => Math.abs(c.cx) < EPS), '한 줄로 이어지면 곧게 위로');
  const wideMoments = [{ id: 0, parentId: null }];
  for (let i = 1; i <= 3000; i++) wideMoments.push({ id: i, parentId: 0 });
  const wideRoot = buildHierarchy(wideMoments);
  const wide = layoutTree(wideRoot, { sizeOf: SIZES.wide, expanded: new Set([0]) });
  assert.equal(wide.visible, 3001);
  const xs = wide.cards.filter((c) => c.kind === 'moment' && !c.root).map((c) => c.x);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1], '순서 그대로');
  // 두 층으로 엇갈리므로 같은 층(하나 건너)끼리는 카드 폭 + 틈만큼 떨어진다.
  for (let i = 2; i < xs.length; i++) assert.ok(xs[i] - xs[i - 2] >= 108 + LAYOUT_DEFAULTS.gapX - EPS);
});

/* ── 시안 배치: 겹침·방향·순서 ────────────────────────────────────────── */

test('#777 겹침 0 — 세 데이터 × 카드 크기 두 벌 × 접힘·펼침, 카드 사이 틈도 지킨다', () => {
  let layouts = 0;
  everyLayout((layout, { label, options }) => {
    const { overlap, tightX, tightY } = crowding(layout.cards, [...layout.bands, ...layout.stems], LAYOUT_DEFAULTS.gapX, LAYOUT_DEFAULTS.gapY);
    assert.equal(overlap, 0, `${label}: 카드·가지 띠·대 겹침 ${overlap}쌍`);
    assert.equal(tightX, 0, `${label}: 가로 틈 ${LAYOUT_DEFAULTS.gapX}px 미만 ${tightX}쌍`);
    assert.equal(tightY, 0, `${label}: 세로 틈 ${LAYOUT_DEFAULTS.gapY}px 미만 ${tightY}쌍`);
    assert.deepEqual(layoutTree(buildHierarchy(dataset(layout.total)), options).cards.map((c) => [c.id, c.x, c.y]), layout.cards.map((c) => [c.id, c.x, c.y]), `${label}: 같은 입력이면 같은 자리`);
    layouts++;
  });
  assert.equal(layouts, 3 * 2 * 2 * 2 * 2);
});

test('#777 무작위 순간 나무 200그루(카드 크기 제각각, 큰 갈림 포함): 겹침 0 · 부모 아래 · 순서 유지', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const r = seeded(seed * 7919);
    const n = 2 + Math.floor(r() * 160);
    const moments = [{ id: 'm0', parentId: null }];
    const hubs = [0, Math.floor(r() * 5), Math.floor(r() * 12)];
    while (moments.length < n) {
      const roll = r();
      const parent = roll < 0.25 ? hubs[Math.floor(r() * hubs.length)] % moments.length
        : roll < 0.7 ? moments.length - 1
          : Math.floor(r() * moments.length);
      moments.push({ id: 'm' + moments.length, parentId: 'm' + parent });
    }
    const dims = new Map(moments.map((m) => [m.id, { w: 40 + Math.floor(r() * 140), h: 30 + Math.floor(r() * 130) }]));
    const sizeOf = (it) => (it.kind === 'moment' ? dims.get(it.id) : { w: 60 + (seed % 40), h: 30 });
    const root = buildHierarchy(moments);
    const expanded = new Set(seed % 3 === 0 ? allFoldable(root) : []);
    for (const balance of ['weight', 'middle']) {
      const layout = layoutTree(root, { sizeOf, balance, expanded, bandPad: 12 + (seed % 12) });
      const c = crowding(layout.cards, [...layout.bands, ...layout.stems], LAYOUT_DEFAULTS.gapX, LAYOUT_DEFAULTS.gapY);
      assert.deepEqual(c, { overlap: 0, tightX: 0, tightY: 0 }, `씨앗 ${seed}·${balance}`);
      checkDirectionAndOrder(layout, root, `씨앗 ${seed}·${balance}`);
      assert.equal(layout.visible + layout.hidden, n);
    }
  }
});

function checkDirectionAndOrder(layout, root, label) {
  const byId = new Map(layout.cards.map((c) => [c.id, c]));
  const kidsOf = new Map();
  for (const c of layout.cards) {
    if (c.parentId === null) continue;
    if (!kidsOf.has(c.parentId)) kidsOf.set(c.parentId, []);
    kidsOf.get(c.parentId).push(c);
  }
  const rootCard = byId.get(root.id);
  assert.ok(rootCard.root, `${label}: 첫 순간이 뿌리`);
  assert.ok(Math.abs(rootCard.y + rootCard.h) < EPS && Math.abs(rootCard.cx) < EPS, `${label}: 뿌리 카드 아래 가운데가 원점`);
  for (const c of layout.cards) {
    assert.ok(c.y + c.h <= rootCard.y + rootCard.h + EPS, `${label}: 뿌리가 맨 아래`);
    if (c.parentId === null) continue;
    const p = byId.get(c.parentId);
    assert.ok(p, `${label}: 부모 카드가 화면에 있다`);
    // 부모가 항상 아래: 자식 카드의 아래 끝이 부모 카드 위 끝보다 가지 띠 높이만큼 위에 있다.
    assert.ok(c.y + c.h <= p.y - (LAYOUT_DEFAULTS.gapY + LAYOUT_DEFAULTS.bandMin) + EPS, `${label}: ${c.id} 가 부모 ${p.id} 위에 있지 않다`);
  }
  const nodeById = new Map(flat(root).map((n) => [n.id, n]));
  for (const [pid, kids] of kidsOf) {
    const p = byId.get(pid);
    const node = nodeById.get(pid);
    // 갈림 순서 유지: 화면의 왼쪽→오른쪽 순서가 데이터 순서와 같고, 묶음·접기 단추는 맨 끝이다.
    const moments = kids.filter((k) => k.kind === 'moment');
    const want = node.children.slice(0, moments.length).map((n) => n.id);
    assert.deepEqual([...moments].sort((a, b) => a.cx - b.cx).map((k) => k.id), want, `${label}: ${pid} 의 갈림 순서`);
    const sorted = [...kids].sort((a, b) => a.cx - b.cx);
    for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].cx > sorted[i - 1].cx + EPS, `${label}: 형제가 같은 자리`);
    for (const extra of kids.filter((k) => k.kind !== 'moment')) assert.equal(sorted[sorted.length - 1], extra, `${label}: 묶음은 맨 끝`);
    // 부모는 첫·끝 자식 사이에 선다. 자식이 하나면 정확히 수직(이어진 순간 = 위로).
    assert.ok(p.cx >= sorted[0].cx - EPS && p.cx <= sorted[sorted.length - 1].cx + EPS, `${label}: ${pid} 가 자식들 밖에 있다`);
    if (sorted.length === 1) assert.ok(Math.abs(p.cx - sorted[0].cx) < EPS, `${label}: 한 줄로 이어진 순간은 곧게 위로`);
  }
}

test('#777 부모가 항상 아래, 뿌리가 맨 아래 — 갈림 순서는 데이터 순서 그대로(왼쪽→오른쪽)', () => {
  everyLayout((layout, { root, label }) => checkDirectionAndOrder(layout, root, label));
});

test('#777 무게 중심: 길게 이어진 쪽이 줄기가 된다 — 10개 데이터의 줄기는 거의 곧고, 한가운데 방식보다 덜 흔들린다', () => {
  const root = buildHierarchy(dataset(10));
  const trunkDrift = (balance) => {
    const layout = layoutTree(root, { sizeOf: SIZES.wide, balance });
    const byId = new Map(layout.cards.map((c) => [c.id, c]));
    let node = root, drift = 0;
    while (node.children.length) {
      const next = node.children.reduce((a, b) => (b.size > a.size ? b : a));
      drift += Math.abs(byId.get(next.id).cx - byId.get(node.id).cx);
      node = next;
    }
    return drift;
  };
  const weight = trunkDrift('weight'), middle = trunkDrift('middle');
  assert.ok(weight < middle * 0.6, `무게 중심 ${weight.toFixed(1)}px, 한가운데 ${middle.toFixed(1)}px`);
  assert.ok(weight < 60, `줄기 가로 흔들림 합 ${weight.toFixed(1)}px`);
});

/* ── 접기 ────────────────────────────────────────────────────────────── */

test('#777 접기 개수: 27갈림 = 3개 + "+24개" 묶음, 누르면(펼침) 27개 모두와 접기 단추', () => {
  const root = buildHierarchy(dataset(40));
  const hub = flat(root).find((n) => n.children.length === 27);
  const folded = layoutTree(root, { sizeOf: SIZES.wide });
  const kids = folded.cards.filter((c) => c.parentId === hub.id);
  assert.equal(kids.filter((c) => c.kind === 'moment').length, 3);
  assert.deepEqual(kids.filter((c) => c.kind === 'moment').map((c) => c.id), hub.children.slice(0, 3).map((n) => n.id), '앞의 세 갈림이 보인다');
  const bundle = kids.find((c) => c.kind === 'bundle');
  assert.equal(bundle.count, 24);
  assert.equal(bundle.size, hub.children.slice(3).reduce((s, n) => s + n.size, 0), '묶음이 숨긴 순간 수');
  assert.equal(bundle.weight, Math.max(...hub.children.slice(3).map((n) => n.size)), '묶음 가지 굵기 = 숨은 갈림 중 가장 큰 것(굵은 가지 하나로 그리지 않는다)');
  assert.equal(folded.cards.find((c) => c.id === hub.id).folded, 24);
  assert.equal(folded.hidden, bundle.size);
  assert.equal(folded.visible, 40 - bundle.size);
  assert.equal(folded.cards.filter((c) => c.kind === 'bundle').length, 1);

  const open = layoutTree(root, { sizeOf: SIZES.wide, expanded: new Set([hub.id]) });
  const openKids = open.cards.filter((c) => c.parentId === hub.id);
  assert.equal(openKids.filter((c) => c.kind === 'moment').length, 27);
  assert.equal(openKids.filter((c) => c.kind === 'fold').length, 1);
  assert.equal(open.cards.filter((c) => c.kind === 'bundle').length, 0);
  assert.equal(open.visible, 40);
  assert.equal(open.hidden, 0);
});

test('#777 접기 경계: 갈림 6개까지는 그대로, 7개부터 3개 + 묶음', () => {
  const star = (n) => buildHierarchy([{ id: 'r', parentId: null }, ...Array.from({ length: n }, (_, i) => ({ id: 'k' + i, parentId: 'r' }))]);
  for (const [n, shown, hidden] of [[1, 1, 0], [6, 6, 0], [7, 3, 4], [27, 3, 24]]) {
    const v = visibleChildren(star(n));
    assert.equal(v.shown.length, shown, `${n}갈림`);
    assert.equal(v.bundle ? v.bundle.count : 0, hidden, `${n}갈림 묶음`);
    const layout = layoutTree(star(n), { sizeOf: SIZES.wide });
    assert.equal(layout.cards.filter((c) => c.kind === 'moment').length, 1 + shown);
    assert.equal(layout.hidden, hidden);
  }
  const custom = visibleChildren(star(10), { foldOver: 4, foldShow: 2 });
  assert.equal(custom.shown.length, 2);
  assert.equal(custom.bundle.count, 8);
  assert.equal(visibleChildren(star(10), {}, new Set(['r'])).shown.length, 10);
  // 120개 데이터: 10갈림 한 곳만 접힌다(3 + 묶음 7), 5갈림은 그대로.
  const big = layoutTree(buildHierarchy(dataset(120)), { sizeOf: SIZES.wide });
  assert.deepEqual(big.cards.filter((c) => c.kind === 'bundle').map((c) => c.count), [7]);
});

/* ── 엇갈림·띠 높이 ──────────────────────────────────────────────────── */

test('#777 갈림이 많으면 두 층으로 엇갈린다 — 27갈림을 펼친 폭이 한 줄일 때보다 30% 넘게 줄고 순서는 그대로', () => {
  const root = buildHierarchy(dataset(40));
  const hub = flat(root).find((n) => n.children.length === 27);
  const expanded = new Set([hub.id]);
  const row = layoutTree(root, { sizeOf: SIZES.wide, expanded, staggerOver: 0 });
  const two = layoutTree(root, { sizeOf: SIZES.wide, expanded });
  assert.equal(row.stems.length, 0);
  assert.ok(two.bounds.width < row.bounds.width * 0.7, `한 줄 ${Math.round(row.bounds.width)}px → 두 층 ${Math.round(two.bounds.width)}px`);
  const kids = two.cards.filter((c) => c.parentId === hub.id);
  assert.deepEqual(kids.filter((c) => c.kind === 'moment').map((c) => c.id), hub.children.map((n) => n.id), '왼쪽→오른쪽 순서는 데이터 순서');
  const base = Math.max(...kids.map((c) => c.y + c.h));
  const upper = kids.map((c) => c.y + c.h < base - EPS);
  assert.equal(upper.filter(Boolean).length, two.stems.length, '위층 가지마다 대가 하나');
  for (let i = 1; i < kids.length; i++) assert.ok(upper[i] || upper[i - 1], '아래층 카드가 나란히 붙지 않는다(사이에 위층 가지의 대가 지나간다)');
  hub.children.forEach((n, i) => { if (n.children.length) assert.ok(upper[i], '더 이어지는 갈림은 위층'); });
  for (const e of two.edges.filter((x) => x.from === hub.id)) assert.equal(e.rise > 0, upper[kids.findIndex((c) => c.id === e.to)], '올린 가지에만 곧은 대가 있다');
  // 이어지는 갈림이 없는 27갈림이면 폭이 38% 넘게 준다.
  const star = buildHierarchy([{ id: 'r', parentId: null, thumb: 'x' }, ...Array.from({ length: 27 }, (_, i) => ({ id: 'k' + i, parentId: 'r', thumb: 'x' }))]);
  const starRow = layoutTree(star, { sizeOf: SIZES.wide, expanded: new Set(['r']), staggerOver: 0 });
  const starTwo = layoutTree(star, { sizeOf: SIZES.wide, expanded: new Set(['r']) });
  assert.ok(starTwo.bounds.width < starRow.bounds.width * 0.62, `한 줄 ${Math.round(starRow.bounds.width)}px → 두 층 ${Math.round(starTwo.bounds.width)}px`);
  // 접힌 상태(3개 + 묶음)는 갈림이 4개라 엇갈리지 않는다.
  assert.equal(layoutTree(root, { sizeOf: SIZES.wide }).stems.length, 0);
});

test('#777 가지 띠 높이: 곧게 이어지면 가장 낮고, 옆으로 뻗을수록 높다(위·아래 한계 안)', () => {
  everyLayout((layout, { options, label }) => {
    const pad = options.bandPad;
    const kidsOf = new Map();
    for (const c of layout.cards) if (c.parentId !== null) kidsOf.set(c.parentId, (kidsOf.get(c.parentId) || 0) + 1);
    for (const band of layout.bands) {
      assert.ok(band.h >= LAYOUT_DEFAULTS.bandMin - EPS && band.h <= LAYOUT_DEFAULTS.bandMax + EPS, `${label}: 띠 높이 ${band.h}`);
      if (kidsOf.get(band.parentId) === 1) {
        assert.ok(Math.abs(band.h - LAYOUT_DEFAULTS.bandMin) < EPS, `${label}: 한 줄로 이어지는 띠는 가장 낮다`);
        assert.ok(Math.abs(band.w - pad * 2) < EPS);
      }
    }
  });
  const wideFan = layoutTree(buildHierarchy(dataset(40)), { sizeOf: SIZES.wide, expanded: new Set(['b003']) });
  const chain = layoutTree(buildHierarchy(dataset(10)), { sizeOf: SIZES.wide });
  assert.ok(Math.max(...wideFan.bands.map((b) => b.h)) > Math.max(...chain.bands.map((b) => b.h)) + 40, '27갈림의 띠가 두 갈래 띠보다 훨씬 높다');
});

/* ── 가지 모양 ───────────────────────────────────────────────────────── */

test('#777 가지 굵기: 뿌리 쪽이 굵고 끝으로 갈수록 가늘다', () => {
  for (const style of STYLES) {
    let prev = -Infinity;
    for (let size = 1; size <= 120; size++) {
      const w = branchWidth(size, 120, style.width);
      assert.ok(w >= prev, '달린 순간이 많을수록 굵다');
      prev = w;
    }
    assert.ok(Math.abs(branchWidth(120, 120, style.width) - style.width.max) < EPS);
    assert.ok(branchWidth(1, 120, style.width) < style.width.max / 2);
  }
  everyLayout((layout, { style, label }) => {
    const leafW = branchWidth(1, layout.total, style.width);
    for (const e of layout.edges) {
      const [w0, w1] = edgeWidths(e, layout.total, style.width);
      assert.ok(w0 >= w1 - EPS, `${label}: 가지는 부모 쪽이 굵다`);
      assert.ok(w1 >= leafW - EPS && w0 <= style.width.max + EPS);
      assert.ok(w0 / 2 <= style.bandPad, `${label}: 가지 반폭이 띠 여유보다 크다`);
    }
    const mains = new Map();
    for (const e of layout.edges) if (e.main) mains.set(e.from, (mains.get(e.from) || 0) + 1);
    assert.ok([...mains.values()].every((n) => n === 1), `${label}: 갈림마다 줄기는 하나`);
  });
});

test('#777 가지는 자기 띠 안에서만 휘고, 부모·자식이 아닌 카드에 닿지 않는다', () => {
  let checked = 0;
  everyLayout((layout, { style, label }) => {
    const bandOf = new Map(layout.bands.map((b) => [b.parentId, b]));
    for (const e of layout.edges) {
      const band = bandOf.get(e.from);
      // 중심선: 가로는 띠 안, 세로는 부모 카드 위 끝 ~ 자식 카드 아래 끝.
      for (const [x, y] of branchPoints(e, style.curve)) {
        assert.ok(x >= band.x + style.bandPad - EPS && x <= band.x + band.w - style.bandPad + EPS, `${label}: ${e.to} 가지가 띠 밖으로 나감`);
        assert.ok(y <= e.y0 + EPS && y >= e.y1 - EPS);
      }
      const [w0, w1] = edgeWidths(e, layout.total, style.width);
      const { outline, d } = branchRibbon(e, w0, w1, style.curve);
      assert.ok(d.startsWith('M') && d.endsWith('Z') && !/NaN|undefined|Infinity/.test(d));
      for (const [x, y] of outline) {
        // 굵기를 더한 바깥선도 띠의 가로 범위를 넘지 않는다.
        assert.ok(x >= band.x - 0.5 && x <= band.x + band.w + 0.5, `${label}: ${e.to} 가지 바깥선이 띠 밖`);
        for (const card of layout.cards) {
          if (card.id === e.from || card.id === e.to) continue;
          const inside = x > card.x + 0.5 && x < card.x + card.w - 0.5 && y > card.y + 0.5 && y < card.y + card.h - 0.5;
          assert.ok(!inside, `${label}: ${e.from}→${e.to} 가지가 ${card.id} 카드 위를 지난다`);
        }
        checked++;
      }
    }
  });
  assert.ok(checked > 50000);
});

// #1295 트리 보기 뒤로 가기 — 화면에서 실제로 누르고 돌아온다(390·1440).
let chromium, skip = false;
const REQUIRE = process.env.LT_TREE_777_REQUIRE === '1';
try {
  ({ chromium } = await import('playwright'));
  const { existsSync } = await import('node:fs');
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 트리 보기 뒤로 가기 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 트리 보기 뒤로 가기 시험을 건너뜀'; }

const treeWorkspace = () => {
  const moments = Array.from({ length: 6 }, (_, i) => ({
    id: 'm' + (i + 1), parentId: i ? 'm' + i : null, relation: i ? '이어짐' : '',
    title: '순간 ' + (i + 1), date: `2026-01-0${i + 1}`, emotion: '설렘', note: '기록 ' + (i + 1),
    type: 'memo', url: '', keywords: [], createdOrder: i + 1, links: i < 5 ? ['m' + (i + 2)] : [],
    createdAt: `2026-01-0${i + 1}T00:00:00.000Z`
  }));
  return { revision: 1, subject: 'trial-subject', writeSubjectBound: true, state: { version: 1, prefs: {}, trees: [{
    id: 't6', subject: '시험 사용자', title: '사슬 6', coverMomentId: '', inbox: false,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-06T00:00:00.000Z', moments
  }] } };
};

async function openShellTree(browser, base, width, theme = 'night') {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' });
  await context.addInitScript(theme => { localStorage.setItem('lt41.tips.firstTree', '1'); localStorage.setItem('lt41.theme', theme); }, theme);
  const page = await context.newPage();
  await page.route('**/api/workspace*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(treeWorkspace()) }));
  await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.LT41?.tree?.id === 't6', null, { timeout: 20000 });
  await page.evaluate(() => document.querySelector('[data-view="track61-tree.html"]').click());
  await page.waitForFunction(() => document.querySelector('#view')?.contentDocument?.querySelectorAll('#cards [data-kind="moment"]').length >= 6, null, { timeout: 20000 });
  await page.waitForTimeout(400);
  const handle = await page.$('#view');
  return { context, page, frame: await handle.contentFrame() };
}

test('#1295 화면: 트리 보기 동작별 뒤로 가기 기록', { skip: REQUIRE ? false : skip, timeout: 300000 }, async (t) => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const browser = await chromium.launch();
  const { serve } = await import('./helpers/screen-audit.mjs');
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await browser.close(); server.close(); });
  for (const width of [390, 1440]) {
    const { context, page, frame } = await openShellTree(browser, base, width);
    // 기록함: 카드 누름 → 상세. 한 번 뒤로 가면 닫힌 상태로 돌아온다.
    await testBackNavigation(page, { frame, recorded: true, panels: ['.ts-detail[open]'], action: () => frame.evaluate(() => document.querySelector('#cards [data-kind="moment"]:not(.is-root)').click()) });
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#cards [data-kind]').length), 6, '뒤로 가기 뒤에도 카드 여섯 장이 보인다');
    // 기록 안 함: 확대·축소, 뿌리로, 전체, 묶음 펼치기 — 여러 번 눌러도 기록이 늘지 않는다.
    await testBackNavigation(page, { frame, recorded: false, action: () => frame.evaluate(() => document.getElementById('zoomIn').click()) });
    await testBackNavigation(page, { frame, recorded: false, action: () => frame.evaluate(() => document.getElementById('zoomOut').click()) });
    await testBackNavigation(page, { frame, recorded: false, action: () => frame.evaluate(() => document.getElementById('goRoot').click()) });
    await testBackNavigation(page, { frame, recorded: false, action: () => frame.evaluate(() => document.getElementById('goFit').click()) });
    await testBackNavigation(page, { frame, recorded: false, action: () => frame.evaluate(() => { const chip = document.querySelector('#cards [data-kind="bundle"]'); if (chip) chip.click(); }) });
    await context.close();
  }
});

test('#1333 화면: 트리 보기에서 고른 순간이 책·보드로 옮겨도 이어진다', { skip: REQUIRE ? false : skip, timeout: 300000 }, async (t) => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const browser = await chromium.launch();
  const { serve } = await import('./helpers/screen-audit.mjs');
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await browser.close(); server.close(); });
  for (const width of [390, 1440]) {
    const { context, page, frame } = await openShellTree(browser, base, width);
    const target = await frame.evaluate(() => {
      const cards = [...document.querySelectorAll('#cards [data-kind="moment"]:not(.is-root)')];
      return cards[0]?.dataset.id || '';
    });
    assert.ok(target, `${width}: 고를 순간이 있다`);
    await frame.evaluate(id => document.querySelector(`#cards [data-id="${id}"]`)?.click(), target);
    await frame.waitForSelector('#treeDetail[open]', { timeout: 5000 });
    await frame.click('#treeDetailClose');
    assert.equal(await page.evaluate(() => window.LT41?.momentId || ''), target, `${width}: 셸의 현재 순간이 고른 순간이다`);
    await page.evaluate(() => document.querySelector('button[data-view="track59-sketchbook.html"]')?.click());
    await page.waitForFunction(() => /track59-sketchbook/.test(document.querySelector('#view')?.contentWindow?.location?.href || ''), null, { timeout: 20000 });
    const handle = await page.$('#view');
    const book = await handle.contentFrame();
    await book.waitForFunction(() => !!window.LTDEMO, null, { timeout: 20000 });
    assert.equal(await book.evaluate(() => String(window.LTDEMO.get() || '')), target, `${width}: 책에서 방금 고른 순간이 열린다`);
    await context.close();
  }
});


/* #1368: 트리 상세는 DOM [open]뿐 아니라 실제 픽셀에서도 글자가 읽혀야 한다. */
test('#1368 트리 상세 판 글자 대비와 무대 흐림 — 390·1440 밤·정원', {
  skip: REQUIRE ? false : skip, timeout: 180000
}, async (t) => {
  if (skip) assert.fail(`필수 화면 시험 환경 누락: ${skip}`);
  const { serve } = await import('./helpers/screen-audit.mjs');
  const server = await serve();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); server.close(); });
  for (const width of [390, 1440]) for (const theme of ['night', 'garden']) {
    await t.test(`${width} ${theme} 상세 판 실제 픽셀`, async () => {
      const { page, frame, context } = await openShellTree(browser, `http://127.0.0.1:${server.address().port}`, width, theme);
      try {
        const card = frame.locator('#cards [data-kind="moment"]:not(.is-root)').first();
        const rect = await card.boundingBox();
        assert.ok(rect && rect.width > 0, '실제 누를 카드가 있다');
        await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
        const dialog = frame.locator('#treeDetail[open]');
        await dialog.waitFor({ state: 'visible' });
        for (const selector of ['#treeDetailTitle', '#treeDetailNote', '#treeDetailClose', '#openMoment']) {
          assert.ok(await frame.locator(selector).isVisible(), `${selector} 화면에 표시`);
        }
        const png = await dialog.screenshot({
          path: process.env.LT_DETAIL_1368_SHOTS ? `${process.env.LT_DETAIL_1368_SHOTS}/tree-${width}-${theme}.png` : undefined
        });
        // PNG의 제목 글자 영역을 캔버스로 읽어, 계산된 색만 정상인 가림 현상을 잡는다.
        const pixels = await page.evaluate(async data => {
          const img = new Image();
          img.src = 'data:image/png;base64,' + data;
          await img.decode();
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          const { width, data: rgb } = ctx.getImageData(0, 0, canvas.width, canvas.height);
          let min = 255, max = 0, changed = 0;
          const lum = i => .2126 * rgb[i] + .7152 * rgb[i + 1] + .0722 * rgb[i + 2];
          const base = lum((Math.min(10, canvas.height - 1) * width + 5) * 4);
          for (let y = 15; y < Math.min(48, canvas.height); y++) for (let x = 16; x < Math.min(150, width); x++) {
            const l = lum((y * width + x) * 4);
            min = Math.min(min, l); max = Math.max(max, l);
            if (Math.abs(l - base) >= 80) changed++;
          }
          return { min, max, contrast: max - min, changed };
        }, png.toString('base64'));
        assert.ok(pixels.contrast >= 125 && pixels.changed >= 20,
          `${width} ${theme}: 상세 판 제목 실제 픽셀 대비가 충분해야 함 ${JSON.stringify(pixels)}`);
        const outside = await frame.evaluate(() => ({
          blur: getComputedStyle(document.querySelector('.ts-world')).filter,
          backdrop: getComputedStyle(document.querySelector('#treeDetail'), '::backdrop').backgroundColor
        }));
        assert.match(outside.blur, /blur\(3px\)/, '판 바깥 트리 무대만 흐려짐');
        assert.equal(outside.backdrop, 'rgba(0, 0, 0, 0)', '상세 판을 가리는 덮개 효과 제거');
      } finally { await context.close(); }
    });
  }
});
