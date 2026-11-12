// #461 관계 지도를 화면에 맞게 펼치기 — 배치 계산(LT56Model)을 실제 예시 트리로 **실행**해서 본다.
// 기준(이슈 #461 확인 항목): 처음 열었을 때 모든 순간이 화면(지도 상자) 안, 서로 겹치지 않음,
// 상자의 70% 이상을 쓰고 빈 띠가 한쪽으로 쏠리지 않음, 이름표는 서로·점과 겹치지 않음.
// 지도 상자 값은 1440·1024·390 실측(예시 트리, 로그아웃)에서 잰 덮개(머리·안내 문구·왼쪽 패널·아래 줄)로 만든다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.window = globalThis;
await import('../public/v41/views/network/network-model.js');
const M = globalThis.LT56Model;
const { designData } = await import('../public/v41/example.mjs');
const JS = fs.readFileSync(new URL('../public/v41/views/network/network.js', import.meta.url), 'utf8');
const CSS = fs.readFileSync(new URL('../public/v41/views/network/network.css', import.meta.url), 'utf8');
const HTML = fs.readFileSync(new URL('../public/v41/views/track56-network.html', import.meta.url), 'utf8');

// 예시 트리를 n개로: 첫 순간에서 다음·갈래를 따라 너비 우선으로 n개(이어진 모양 유지) — 화면 측정과 같은 규칙.
function exampleTree(n) {
  const all = designData.moments, by = Object.fromEntries(all.map(m => [m.id, m]));
  const first = all.find(m => m.first) || all[0];
  const order = [], seen = new Set([first.id]), q = [first.id];
  while (q.length && order.length < n) { const id = q.shift(); order.push(id); for (const t of [by[id].next, by[id].branch]) if (t && !seen.has(t)) { seen.add(t); q.push(t); } }
  const keep = new Set(n >= all.length ? all.map(m => m.id) : order);
  const moments = all.filter(m => keep.has(m.id)).map(m => ({ id: m.id, title: m.title, first: !!m.first }));
  const edges = all.filter(m => keep.has(m.id)).flatMap(m => [m.next, m.branch].filter(t => t && keep.has(t)).map(to => ({ kind: 'parent', from: m.id, to, reason: m.whyNext || '' })));
  return { moments, edges };
}

// 값으로 적어 둔다(예전 코드에 같은 시험을 돌려도 상자 계산이 아니라 배치 자체로 비교되게). 아래 시험이 fitBox와 같은지 본다.
const SCREENS = {
  1440: { x: 256, y: 181, w: 1166, h: 636 },
  1024: { x: 256, y: 176, w: 750, h: 509 },
  390: { x: 16, y: 196, w: 356, h: 491 }
};

test('#461 지도 상자 값은 실측 덮개로 만든 fitBox 결과와 같다', () => {
  assert.deepEqual(M.fitBox(1438, 833, { top: 165, left: 240 }, 16), SCREENS[1440]);
  assert.deepEqual(M.fitBox(1022, 701, { top: 160, left: 240 }, 16), SCREENS[1024]);
  assert.deepEqual(M.fitBox(388, 785, { top: 180, bottom: 82 }, 16), SCREENS[390]);
});

function check(points, box, radius, label, extra = []) {
  const ids = Object.keys(points);
  for (const id of ids) {
    const p = points[id], r = radius(id);
    assert.ok(p.x - r >= box.x - 0.01 && p.x + r <= box.x + box.w + 0.01 && p.y - r >= box.y - 0.01 && p.y + r <= box.y + box.h + 0.01, `${label}: ${id} 상자 안`);
  }
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = points[ids[i]], b = points[ids[j]];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= radius(ids[i]) + radius(ids[j]) - 0.01, `${label}: ${ids[i]}·${ids[j]} 겹침`);
    }
    for (const h of extra) assert.ok(Math.hypot(points[ids[i]].x - h.x, points[ids[i]].y - h.y) >= radius(ids[i]) + h.r - 0.01, `${label}: ${ids[i]}이 묶음 점과 겹침`);
  }
  const xs = ids.map(id => points[id].x), ys = ids.map(id => points[id].y);
  const l = Math.min(...xs) - box.x, r = box.x + box.w - Math.max(...xs), t = Math.min(...ys) - box.y, b = box.y + box.h - Math.max(...ys);
  if (ids.length >= 5) {
    assert.ok((Math.max(...xs) - Math.min(...xs)) / box.w >= 0.7, `${label}: 가로 70% 이상 (${((Math.max(...xs) - Math.min(...xs)) / box.w * 100).toFixed(0)}%)`);
    assert.ok((Math.max(...ys) - Math.min(...ys)) / box.h >= 0.7, `${label}: 세로 70% 이상 (${((Math.max(...ys) - Math.min(...ys)) / box.h * 100).toFixed(0)}%)`);
  }
  assert.ok(Math.abs(l - r) <= box.w * 0.15 && Math.abs(t - b) <= box.h * 0.15, `${label}: 빈 띠 쏠림 (좌${l.toFixed(0)}·우${r.toFixed(0)}·위${t.toFixed(0)}·아래${b.toFixed(0)})`);
}

for (const [screen, box] of Object.entries(SCREENS)) {
  for (const n of [5, 15, 40]) {
    test(`#461 그물형 ${screen}·순간 ${n}: 상자 안·겹침 없음·70% 이상·쏠림 없음`, () => {
      const { moments } = exampleTree(n);
      const L = M.networkLayout(moments, { box, dotR: 5, firstR: 20, gap: 8, hubR: 9 });
      const firstId = moments.find(m => m.first).id;
      check(L.points, box, id => (id === firstId ? 20 : L.dotR), `그물 ${screen}·${n}`, L.hubs.map(h => ({ x: h.x, y: h.y, r: L.hubR })));
      assert.ok(L.dotR >= 3, '점이 너무 작아지지 않는다');
      if (Number(screen) >= 1024) assert.ok(L.cols >= L.rows, '넓은 화면은 가로로 펼친다');
      else assert.ok(L.rows >= L.cols, '세로로 긴 화면은 세로로 펼친다');
    });
    test(`#461 동심원 ${screen}·순간 ${n}: 상자 안·겹침 없음·70% 이상·쏠림 없음`, () => {
      const { moments, edges } = exampleTree(n);
      const nodeR = Number(screen) <= 640 ? 4.2 : 4.6;
      const L = M.concentricLayout(moments, edges, { box, nodeR, firstR: 20, gap: 8 });
      check(L.points, box, id => (id === L.firstId ? Math.min(1, L.scale) * 20 : L.dotR), `동심원 ${screen}·${n}`);
      assert.ok(L.dotR >= 3, '점이 너무 작아지지 않는다');
      assert.ok(L.maxLevel <= 16, `40개 예시가 수십 겹이 되지 않는다(${L.maxLevel}겹)`);
    });
  }
}

test('#461 이름표 자리: 우선순위대로, 서로·점과 겹치지 않게, 상자 안에만 — 자리가 없으면 뺀다', () => {
  const bounds = { x: 0, y: 0, w: 300, h: 200 };
  const cands = [
    { id: 'first', text: '여기서 시작 · 첫인상', x: 100, y: 100, r: 16, w: 110, h: 16, dir: { x: 0, y: -1 } },
    { id: 'b', text: '갈림길', x: 110, y: 104, r: 5, w: 40, h: 16, dir: { x: 1, y: 0 } },
    { id: 'edge', text: '아주 긴 이름표가 상자를 넘는다', x: 295, y: 195, r: 5, w: 280, h: 16, dir: { x: 1, y: 0 } },
    { id: 'c', text: '셋째', x: 60, y: 150, r: 5, w: 30, h: 16, dir: { x: -1, y: 0 } }
  ];
  const obstacles = [{ id: 'first', x: 100, y: 100, r: 16 }, { id: 'b', x: 110, y: 104, r: 5 }, { id: 'c', x: 60, y: 150, r: 5 }, { id: 'd', x: 140, y: 150, r: 5 }];
  const out = M.placeLabels(cands, obstacles, bounds);
  assert.equal(out[0].id, 'first', '첫 순간이 먼저 자리를 잡는다');
  assert.ok(out[0].rect.b <= 100 - 16, '바깥 방향(위)이 먼저');
  assert.ok(!out.some(o => o.id === 'edge'), '상자를 넘는 이름표는 뺀다');
  for (let i = 0; i < out.length; i++) {
    const a = out[i].rect;
    assert.ok(a.l >= 0 && a.r <= 300 && a.t >= 0 && a.b <= 200, `${out[i].id} 상자 안`);
    for (let j = i + 1; j < out.length; j++) { const b = out[j].rect; assert.ok(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t, `${out[i].id}·${out[j].id} 이름표 겹침`); }
    for (const o of obstacles) { const cx = Math.max(a.l, Math.min(o.x, a.r)), cy = Math.max(a.t, Math.min(o.y, a.b)); assert.ok(Math.hypot(o.x - cx, o.y - cy) >= o.r, `${out[i].id}가 점 ${o.id}을 덮음`); }
  }
});

test('#461 화면 배선: 덮개를 재어 상자를 만들고, 두 보기 모두 그 상자에 맞추며, 이름표는 한 벌로 고른다', () => {
  assert.match(JS, /BOX=LT56Model\.fitBox\(vw,vh,measureInsets\(\),16\)/, '창 크기가 바뀔 때 덮개를 재어 상자');
  assert.match(JS, /LT56Model\.networkLayout\(LTDEMO\.moments,\{box:BOX/, '그물형은 상자에 맞춘다');
  assert.match(JS, /LT56Model\.concentricLayout\(LTDEMO\.moments,LTDEMO\.edges,\{box:BOX/, '동심원형도 상자에 맞춘다');
  assert.match(JS, /LT56Model\.placeLabels\(labelCands\(\),obstacles,b\)/, '이름표 자리는 모델 한 벌');
  // 문서 끝의 <style>은 스크립트 뒤에 읽힌다 — 다 읽은 뒤·글꼴 뒤 한 번씩 다시 잰다.
  assert.match(JS, /addEventListener\('DOMContentLoaded',\(\)=>resize\(\),\{once:true\}\)/);
  assert.match(JS, /addEventListener\('load',\(\)=>resize\(\),\{once:true\}\)/);
  // 점 반지름은 그리기·누르기가 같은 한 곳(dotRadius)을 쓴다 — 동심원 겹침(그린 점 > 배치가 가정한 점)의 원인 제거.
  assert.match(JS, /let r=dotRadius\(n\);/, '그리기');
  assert.match(JS, /Math\.max\(12,dotRadius\(n\)\+6\)/, '누르기');
  // 유휴 rAF 0: requestAnimationFrame은 scheduleDraw·frame 두 곳뿐.
  assert.equal((JS.match(/requestAnimationFrame\(/g) || []).length, 2, '새 rAF 경로 없음');
  // 알기 쉬운 말: "위치 그룹" 대신 "묶음", 범례는 색 점 + 번호 + 이름.
  assert.doesNotMatch(JS, /위치 그룹/);
  assert.match(HTML, /<h3>순간 묶음<\/h3>/);
  assert.doesNotMatch(HTML, /세로형 순간 관계 지도/, '이제 세로로만 펼치지 않는다');
  // 지금 고른 보기는 다른 화면의 눌린 버튼과 같은 토큰으로 채운다(어두운 알약 규칙보다 구체적으로).
  assert.match(CSS, /html\[data-v41-screen=network\] \.top-actions \.view-switch \.pill\[aria-pressed=true\][^{]*\{background:var\(--lt-primary\);border-color:var\(--lt-primary\);color:var\(--lt-primary-ink\)/);
  assert.match(CSS, /\.progress-rail\{display:none\}/, '세로 진행 막대(오른쪽 빈 띠) 숨김');
});
