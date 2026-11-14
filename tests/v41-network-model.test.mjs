// 관계 지도 계산 한 벌 시험(#231). 화면이 부르는 같은 파일을 그대로 실행해 검사한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.window = globalThis;
await import('../public/v41/views/network/network-model.js');
const M = globalThis.LT56Model;
const SCREEN = fs.readFileSync(new URL('../public/v41/views/network/network.js', import.meta.url), 'utf8');
const HTML = fs.readFileSync(new URL('../public/v41/views/track56-network.html', import.meta.url), 'utf8');

test('0. 계산 한 벌은 화면이 실제로 부르는 함수만 노출하고, 모델을 먼저 부른다', () => {
  assert.deepEqual(Object.keys(M).sort(), ['bezierGeometry', 'bezierPoint', 'branchPoint', 'clusterSpan', 'concentricLayout', 'emotionGroups', 'fitBox', 'gridFor', 'groupSizeFor', 'labelTitle', 'monthGroups', 'networkLayout', 'originPath', 'pathEmphasis', 'pickGroups', 'placeLabels', 'relationText', 'routeEdges', 'shortTitle', 'treeLevels']);
  assert.ok(HTML.indexOf('network-model.js') < HTML.indexOf('network.js'), '모델을 화면보다 먼저 부른다');
});

test('1. 갈래 점: 진행률 0이면 중심에 붙고, 갈래가 홀수/짝수면 좌우로 다르게 휜다', () => {
  const c = { x: 100, y: 200, spread: 100 };
  const start = M.branchPoint(c, 0, 0, 5, 0);
  assert.equal(start.x, 100 + Math.cos(0) * 16 + Math.sin(0) * 12);
  assert.equal(start.y, 200 + Math.sin(0) * 16 * 0.8 + Math.cos(0) * 10);
  const even = M.branchPoint(c, 0, 2, 5, 0);
  const odd = M.branchPoint(c, 0, 2, 5, 1);
  assert.notDeepEqual(even.y, odd.y);
  // 같은 입력은 같은 점(순수 계산).
  assert.deepEqual(M.branchPoint(c, 0, 2, 5, 1), odd);
});

test('2. 묶음 나누기: 한 묶음 7개 안팎·묶음은 최대 6개, 작은 트리는 억지로 쪼개지 않는다(#461)', () => {
  assert.equal(M.groupSizeFor(40), 7);
  assert.equal(M.groupSizeFor(36), 6);
  assert.equal(M.groupSizeFor(15), 5, '15개 → 3묶음');
  assert.equal(M.groupSizeFor(5), 5, '5개 → 한 묶음');
  assert.equal(M.groupSizeFor(1), 1);
  assert.equal(M.groupSizeFor(0), 1);
});

test('3. 묶음 이름·개수(#461): 첫 순간 제목으로 "…부터 n개", 순간 목록이 없으면 번호 범위', () => {
  assert.deepEqual(M.clusterSpan(0, 7, 40), { name: '순간 01–07', sub: '', count: 7 });
  assert.deepEqual(M.clusterSpan(5, 7, 40), { name: '순간 36–40', sub: '', count: 5 });
  assert.equal(M.clusterSpan(5, 7, 36).count, 1);
  // 순간보다 묶음이 많으면 개수는 0(음수 아님).
  assert.equal(M.clusterSpan(6, 7, 36).count, 0);
  const moments = Array.from({ length: 9 }, (_, i) => ({ id: `m${i}`, title: i === 0 ? '첫인상' : i === 7 ? '의자에 앉은 모습' : `t${i}` }));
  assert.equal(M.clusterSpan(0, 7, 9, moments).name, '첫인상부터 7개');
  assert.equal(M.clusterSpan(1, 7, 9, moments).name, '의자에 앉은…부터 2개', '긴 제목은 잘라 …');
  assert.equal(M.clusterSpan(0, 1, 1, [{ title: '첫인상' }]).name, '첫인상', '한 개뿐이면 제목만');
  assert.equal(M.shortTitle('  짧음 '), '짧음');
});

test('4. 지도 상자(#461): 덮개를 뺀 남는 곳, 너무 좁으면 창 전체(음수·0 크기 없음)', () => {
  assert.deepEqual(M.fitBox(1440, 830, { top: 160, left: 240, right: 0, bottom: 0 }, 16), { x: 256, y: 176, w: 1168, h: 638 });
  // 아래 줄(모바일)도 뺀다.
  assert.deepEqual(M.fitBox(390, 785, { top: 180, bottom: 80 }, 16), { x: 16, y: 196, w: 358, h: 493 });
  // 준비 중인 낮은 iframe: 덮개를 빼면 남는 곳이 없다 → 창 전체, 그래도 40px 바닥.
  const tiny = M.fitBox(390, 240, { top: 180, bottom: 80 }, 16);
  assert.deepEqual(tiny, { x: 8, y: 8, w: 374, h: 224 });
  const zero = M.fitBox(0, 0, {}, 16);
  assert.ok(zero.w >= 40 && zero.h >= 40, '크기는 늘 양수');
});

// 5. 연결선 베지에 분기 표.
//  종류                         | bend
//  bridge·bridgeSecondary·origin | min(64, |dx|*0.10+18)
//  그 밖(parent·related·…)      | 12
test('5. 연결선 베지에: 종류별 굽힘과 조절점', () => {
  const A = { x: 0, y: 0 }, B = { x: 200, y: 100 };
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const plain = M.bezierGeometry(A, B, 'parent');
  assert.ok(near(plain.cp1.x, 0 + 200 * 0.34 + 12), 'parent cp1.x');
  assert.ok(near(plain.cp1.y, 100 * 0.28), 'parent cp1.y');
  assert.ok(near(plain.cp2.x, 200 - 200 * 0.30 - 12 * 0.55), 'parent cp2.x');
  assert.ok(near(plain.cp2.y, 100 - 100 * 0.26), 'parent cp2.y');
  const bridge = M.bezierGeometry(A, B, 'bridge');
  assert.ok(near(bridge.cp1.x, 200 * 0.34 + 38), 'bridge cp1.x');
  // dx가 아주 크면 굽힘은 64에서 멈춘다.
  assert.ok(near(M.bezierGeometry({ x: 0, y: 0 }, { x: 5000, y: 0 }, 'origin').cp1.x, 5000 * 0.34 + 64));
  // 왼쪽으로 가면 부호가 뒤집힌다.
  assert.ok(near(M.bezierGeometry({ x: 200, y: 0 }, { x: 0, y: 0 }, 'bridge').cp1.x, 200 - 200 * 0.34 - 38));
});

test('6. 묶음 칸(#461): 넓은 화면은 가로로, 좁고 긴 화면은 세로로 — 칸은 정사각형에 가깝게', () => {
  assert.deepEqual(M.gridFor(6, 1168, 638), { cols: 3, rows: 2 }, '1440: 가로 3칸 × 2줄');
  assert.deepEqual(M.gridFor(6, 356, 500), { cols: 2, rows: 3 }, '390: 2칸 × 3줄');
  assert.deepEqual(M.gridFor(3, 1168, 638), { cols: 3, rows: 1 }, '넓으면 한 줄로');
  assert.deepEqual(M.gridFor(1, 300, 900), { cols: 1, rows: 1 });
  assert.deepEqual(M.gridFor(0, 300, 300), { cols: 1, rows: 1 }, '빈 트리 방어');
});

test('7. 경로에 놓인 연결: 이웃한 두 순간을 잇는 연결만 순서대로', () => {
  const pathById = { p1: { id: 'p1', nodes: ['m1', 'm2', 'm3'] } };
  const edges = [
    { id: 'e1', a: 'm1', b: 'm2', pathId: 'p1' },
    { id: 'e2', a: 'm2', b: 'm3', pathId: 'p1' },
    { id: 'e3', a: 'm1', b: 'm3', pathId: 'p1' },
    { id: 'e4', a: 'm2', b: 'm3', pathId: 'other' }
  ];
  assert.deepEqual(M.routeEdges('p1', pathById, edges).map((e) => e.id), ['e1', 'e2']);
  assert.deepEqual(M.routeEdges('nope', pathById, edges), []);
  assert.deepEqual(M.routeEdges('p1', { p1: { id: 'p1', nodes: ['m1'] } }, edges), []);
});

test('8. 화면은 같은 계산을 다시 구현하지 않고 한 벌을 부른다', () => {
  assert.doesNotMatch(SCREEN, /const curve=Math\.sin\(t\*Math\.PI\)/);
  assert.doesNotMatch(SCREEN, /const groupSize=Math\.max\(1,Math\.ceil\(LTDEMO\.moments\.length\/6\)\)/);
  assert.doesNotMatch(SCREEN, /c\.name=`순간 \$\{String\(i\*groupSize\+1\)/);
  assert.doesNotMatch(SCREEN, /let bend=12;if\(\['bridge'/);
  assert.doesNotMatch(SCREEN, /clamp\(Math\.min\(\(vw-26\)/);
  assert.doesNotMatch(SCREEN, /for\(let i=0;i<p\.nodes\.length-1;i\+\+\)/);
  assert.doesNotMatch(SCREEN, /a=-2\.8\+j\*\.78,dist=100\+j\*38/, '#366 나선 배치 공식은 LT56Model.networkLayout 한 벌로 옮겨졌다');
  for (const call of ['LT56Model.branchPoint', 'LT56Model.pickGroups', 'LT56Model.labelTitle', 'LT56Model.fitBox', 'LT56Model.bezierGeometry', 'LT56Model.placeLabels', 'LT56Model.shortTitle', 'LT56Model.routeEdges', 'LT56Model.networkLayout', 'LT56Model.concentricLayout', 'LT56Model.originPath', 'LT56Model.pathEmphasis', 'LT56Model.bezierPoint', 'LT56Model.relationText']) {
    assert.ok(SCREEN.includes(call), call);
  }
  // #601: 묶음은 감정별 — 화면이 7개씩 자르거나 묶음 이름을 다시 만들지 않는다(모델 한 벌).
  assert.doesNotMatch(SCREEN, /LT56Model\.groupSizeFor/);
  assert.doesNotMatch(SCREEN, /LT56Model\.clusterSpan/);
  // 예시 판본 판단(canPlay)은 그대로 한 곳에 있다.
  assert.match(SCREEN, /const canPlay=LTDEMO\.example;/);
  // #366 성능 원칙(#346): 상시 rAF 루프는 없다 — 상태가 바뀔 때 scheduleDraw 한 번.
  assert.doesNotMatch(SCREEN, /requestAnimationFrame\(loop\)/);
  assert.match(SCREEN, /function scheduleDraw\(\)/);
  // #366: 한 줄 안내·보기 전환 버튼·연결 이유 툴팁·기기 기억이 화면 문서·코드에 있다.
  assert.ok(HTML.includes('첫 순간에서 어떻게 이어졌는지 보는 지도예요'), '맨 위 한 줄 안내');
  assert.ok(HTML.includes('id="viewNet"') && HTML.includes('id="viewConc"'), '보기 방식 고르기 버튼');
  assert.ok(HTML.includes('id="edgeTip"'), '연결 이유 툴팁');
  assert.match(SCREEN, /lt41\.network\.view/, '보기 선택은 이 기기에 기억된다');
});

// ===== #366 보기별 배치·길 강조(2026-11-10) =====

// 부모 연결 트리: a(첫 순간) → b·c, b → d. e는 부모 연결 없는 방어 케이스, 관련 연결 2개.
const MOMS = [
  { id: 'a', first: true }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }
];
const EDGES = [
  { kind: 'parent', from: 'a', to: 'b', reason: '첫 장면이 이어져서' },
  { kind: 'parent', from: 'a', to: 'c', reason: '' },
  { kind: 'parent', from: 'b', to: 'd', reason: '같은 무대를 다시' },
  { kind: 'related', from: 'c', to: 'd' },
  { kind: 'related', from: 'd', to: 'e' }
];

test('9. 단계 계산: 첫 순간 0단계, 부모 연결로 1·2단계, 관련 연결은 단계가 아니다', () => {
  const t = M.treeLevels(MOMS, EDGES);
  assert.equal(t.firstId, 'a');
  assert.deepEqual([t.levelOf.a, t.levelOf.b, t.levelOf.c, t.levelOf.d], [0, 1, 1, 2]);
  assert.deepEqual(t.childrenOf.a, ['b', 'c']);
  // e는 부모 연결로 닿지 않아 방어적으로 가장 바깥 단계(3)로 물린다(시험 10과 같은 규칙)
  assert.equal(t.levelOf.e, 3);
  assert.equal(t.maxLevel, 3);
});

test('10. 단계 계산 방어: 부모 연결로 닿지 않는 순간은 가장 바깥 단계로 물린다', () => {
  const t = M.treeLevels(MOMS, EDGES);
  assert.equal(t.levelOf.e, 3);
});

test('11. 지나온 길: 첫 순간부터 부모 연결을 따라가고, 관련 연결은 길이 아니다', () => {
  assert.deepEqual(M.originPath('d', MOMS, EDGES), ['a', 'b', 'd']);
  assert.deepEqual(M.originPath('c', MOMS, EDGES), ['a', 'c']);
  assert.deepEqual(M.originPath('a', MOMS, EDGES), ['a']);
  assert.deepEqual(M.originPath('x', MOMS, EDGES), [], '없는 순간');
  assert.deepEqual(M.originPath('e', MOMS, EDGES), ['e'], '길이 끊긴 순간은 자기 자신만');
});

test('12. 길 강조 세기: 밝힌 길이 흐린 나머지보다 크고, 세기는 이 한 곳에 고정된다', () => {
  assert.ok(Object.isFrozen(M.pathEmphasis), 'pathEmphasis는 바꿀 수 없다');
  assert.ok(M.pathEmphasis.lit > M.pathEmphasis.dim, '선 강도');
  assert.ok(M.pathEmphasis.litNode > M.pathEmphasis.dimNode, '점 강도');
  assert.ok(M.pathEmphasis.hubDim < 0.5, '길 강조 중 묶음 허브는 흐리게');
});

test('13. 연결 이유: 앞뒤 공백은 잘라내고, 빈 이유는 ""(화면이 표시를 생략한다)', () => {
  assert.equal(M.relationText({ reason: '  이유  ' }), '이유');
  assert.equal(M.relationText({ reason: '' }), '');
  assert.equal(M.relationText({ reason: null }), '');
  assert.equal(M.relationText({}), '');
  assert.equal(M.relationText(), '');
});

test('14. 그물형 배치(#461): 묶음을 화면 비율 칸에 앉히고, 첫 순간은 첫 칸 맨 위 — 상자 안·겹침 없음', () => {
  const box = { x: 256, y: 176, w: 1168, h: 638 };
  const forty = Array.from({ length: 40 }, (_, i) => ({ id: `m${i}`, first: i === 0 }));
  const L = M.networkLayout(forty, { box, dotR: 5, firstR: 20, gap: 8, hubR: 9 });
  assert.equal(L.groupSize, 7);
  assert.deepEqual([L.cols, L.rows], [3, 2], '넓은 화면은 가로 3칸');
  // 첫 순간은 첫 칸의 타원 맨 위(12시) — 순간 수와 상관없이 같은 규칙.
  assert.ok(Math.abs(L.points.m0.x - L.hubs[0].x) < 1e-9 && L.points.m0.y < L.hubs[0].y, '첫 순간은 첫 묶음 맨 위');
  // 지그재그: 둘째 줄은 오른쪽에서 시작(4번째 묶음이 3번째 묶음 바로 아래).
  assert.ok(Math.abs(L.hubs[3].x - L.hubs[2].x) < 1e-9 && L.hubs[3].y > L.hubs[2].y, '둘째 줄은 오른쪽부터');
  for (const p of Object.values(L.points)) {
    assert.ok(p.x - L.dotR >= box.x - 1e-9 && p.x + L.dotR <= box.x + box.w + 1e-9 && p.y - L.dotR >= box.y - 1e-9 && p.y + L.dotR <= box.y + box.h + 1e-9, '상자 안');
  }
  const ids = Object.keys(L.points);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = L.points[ids[i]], b = L.points[ids[j]];
    const ra = ids[i] === 'm0' ? 20 : L.dotR, rb = ids[j] === 'm0' ? 20 : L.dotR;
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= ra + rb, `${ids[i]}·${ids[j]} 겹치지 않음`);
  }
  // 덜 찬 마지막 줄은 가운데로: 순간 15개(3묶음)를 세로 화면에 놓으면 2칸+1칸, 마지막 칸은 가운데.
  const tall = { x: 16, y: 196, w: 358, h: 493 };
  const T = M.networkLayout(forty.slice(0, 15), { box: tall });
  assert.deepEqual([T.cols, T.rows], [2, 2]);
  assert.ok(Math.abs(T.hubs[2].x - (tall.x + tall.w / 2)) < 1e-9, '마지막 줄 한 칸은 가운데(한쪽 빈 띠 없음)');
});

// 동심원 시험 트리: 한 줄로 이어지다 다섯마다 갈라지는 n순간(가지 2 이상), 관련 연결 몇 개.
function treeOf(n) {
  const moments = Array.from({ length: n }, (_, i) => ({ id: `m${i}`, first: i === 0 }));
  const edges = [];
  for (let i = 1; i < n; i++) {
    const parent = i % 5 === 0 ? i - 4 : i - 1;
    edges.push({ kind: 'parent', from: `m${Math.max(0, parent)}`, to: `m${i}`, reason: i % 2 ? '이유 있음' : '' });
    if (i % 7 === 0 && i > 6) edges.push({ kind: 'related', from: `m${i - 6}`, to: `m${i}` });
  }
  return { moments, edges };
}

const sizes = {
  1: { moments: [{ id: 'a', first: true }], edges: [] },
  3: { moments: [{ id: 'a', first: true }, { id: 'b' }, { id: 'c' }], edges: [{ kind: 'parent', from: 'a', to: 'b' }, { kind: 'parent', from: 'a', to: 'c' }] }
};

for (const n of [1, 3, 12, 40]) {
  test(`15. 동심원 배치(순간 ${n}): 첫 순간이 원의 중심·겹침 없음·상자 안·단계는 바깥 원·부모 근처`, () => {
    const { moments, edges } = sizes[n] || treeOf(n);
    for (const [w, h] of [[1440, 900], [390, 780]]) {
      const pad = w < 700 ? 64 : 56;
      const nodeR = w < 700 ? 4.2 : 4.6;
      const L = M.concentricLayout(moments, edges, { width: w, height: h, pad, nodeR, firstR: 20, gap: 8 });
      const pts = Object.values(L.points);
      const first = L.points[L.firstId];
      assert.ok(near(first.x, L.center.x) && near(first.y, L.center.y), '첫 순간은 원의 중심');
      // #461: 원은 상자에 맞춰 키우고(가로·세로 따로, 납작함 2배까지), 범위 가운데를 상자 가운데에 둔다.
      for (const p of pts) {
        assert.ok(p.x - nodeR >= pad - 0.5 && p.x + nodeR <= w - pad + 0.5 && p.y - nodeR >= pad - 0.5 && p.y + nodeR <= h - pad + 0.5, `(${w}×${h}) 상자 밖 점 없음`);
      }
      assert.ok(L.sx <= 2 * Math.min(L.sx, L.sy) + 1e-9 && L.sy <= 2 * Math.min(L.sx, L.sy) + 1e-9, '납작함 2배까지');
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        assert.ok(d >= 2 * L.dotR - 0.01, `(${w}×${h}) 두 점이 겹치지 않는다 ${d.toFixed(1)} < ${(2 * L.dotR).toFixed(1)}`);
      }
      // 첫 순간(고리까지 firstR)과 1단계는 겹치지 않는다.
      for (const p of pts) if (p !== first) assert.ok(Math.hypot(p.x - first.x, p.y - first.y) >= Math.min(1, L.scale) * 20 + L.dotR - 0.01, '첫 순간 고리와 겹치지 않음');
      const ringR = p => Math.hypot((p.x - L.center.x) / L.sx, (p.y - L.center.y) / L.sy);
      let prevMax = 0;
      for (let lv = 1; lv <= L.maxLevel; lv++) {
        const ring = moments.filter(m => L.levelOf[m.id] === lv && m.id !== L.firstId).map(m => L.points[m.id]);
        if (!ring.length) continue;
        const rs = ring.map(ringR);
        assert.ok(Math.min(...rs) > prevMax, `${lv}단계 원은 이전 단계보다 바깥에 있다`);
        prevMax = Math.max(...rs);
      }
      if (n >= 12) {
        const t = M.treeLevels(moments, edges);
        const angleOf = p => Math.atan2(p.y - L.center.y, p.x - L.center.x);
        for (const parent of Object.keys(t.childrenOf)) {
          const kids = t.childrenOf[parent];
          if (kids.length < 2) continue;
          const lv = L.levelOf[kids[0]];
          const ringIds = moments.map(m => m.id).filter(id => L.levelOf[id] === lv && id !== L.firstId)
            .sort((x, y) => angleOf(L.points[x]) - angleOf(L.points[y]));
          const idx = kids.map(k => ringIds.indexOf(k)).sort((a, b) => a - b);
          const gaps = idx.map((v, i) => { const nxt = idx[(i + 1) % idx.length]; return nxt > v ? nxt - v : ringIds.length - v + nxt; });
          assert.ok(gaps.filter(g => g !== 1).length <= 1, `${parent}의 자식들이 원 위에서 붙어 있다(감김 하나 허용)`);
        }
      }
    }
  });
}

// 닿지 않는 노드 방어: 동심원 배치가 NaN 좌표를 만들 수 없다(#366).
// #461: 부모 연결이 없는 다른 시작 순간은 첫 순간에 기대어 자기 갈래(1단계)를 갖는다 — 예전엔 하나마다 바깥 원을 새로 만들었다.
test('16. 동심원 배치 방어: 부모 연결로 닿지 않는 순간도 유한한 상자 안 좌표를 받고, 원을 하나씩 늘리지 않는다', () => {
  const moments = [{ id: 'a', first: true }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const edges = [{ kind: 'parent', from: 'a', to: 'b', reason: '' }, { kind: 'parent', from: 'c', to: 'd', reason: '' }];
  for (const [w, h] of [[1440, 900], [390, 780]]) {
    const pad = w < 700 ? 64 : 56;
    const L = M.concentricLayout(moments, edges, { width: w, height: h, pad, nodeR: w < 700 ? 4.2 : 4.6 });
    assert.deepEqual([L.levelOf.a, L.levelOf.b, L.levelOf.c, L.levelOf.d], [0, 1, 1, 2], '시작 순간 c는 1단계 갈래, 그 다음 d는 2단계');
    assert.equal(L.maxLevel, 2);
    for (const [id, p] of Object.entries(L.points)) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${id} 좌표 유한 (${w}×${h})`);
      assert.ok(p.x >= pad - 0.5 && p.x <= w - pad + 0.5 && p.y >= pad - 0.5 && p.y <= h - pad + 0.5, `${id} 상자 안 (${w}×${h})`);
    }
  }
  // 서로만 가리키는 고리(시작 순간 없음)는 가장 바깥에 물려도 좌표가 유한하다.
  const loop = M.concentricLayout([{ id: 'a', first: true }, { id: 'x' }, { id: 'y' }], [{ kind: 'parent', from: 'x', to: 'y' }, { kind: 'parent', from: 'y', to: 'x' }], { width: 800, height: 600 });
  for (const p of Object.values(loop.points)) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
});

// #461 한 줄로만 이어진 트리도 한 방향 바늘이 되지 않고, 상자를 고르게 쓴다.
test('17. 동심원 배치(#461): 한 줄 트리는 돌아가며 놓여 가로·세로를 모두 쓰고, 상자 가운데에 놓인다', () => {
  const chain = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, first: i === 0 }));
  const edges = chain.slice(1).map((m, i) => ({ kind: 'parent', from: `m${i}`, to: m.id }));
  const box = { x: 256, y: 176, w: 1168, h: 638 };
  const L = M.concentricLayout(chain, edges, { box, nodeR: 4.6, firstR: 20 });
  const xs = Object.values(L.points).map(p => p.x), ys = Object.values(L.points).map(p => p.y);
  const useW = (Math.max(...xs) - Math.min(...xs)) / box.w, useH = (Math.max(...ys) - Math.min(...ys)) / box.h;
  assert.ok(useW >= 0.7 && useH >= 0.7, `가로 ${useW.toFixed(2)}·세로 ${useH.toFixed(2)} 모두 70% 이상`);
  const left = Math.min(...xs) - box.x, right = box.x + box.w - Math.max(...xs);
  const top = Math.min(...ys) - box.y, bottom = box.y + box.h - Math.max(...ys);
  assert.ok(Math.abs(left - right) < 2 && Math.abs(top - bottom) < 2, '빈 띠가 한쪽으로 쏠리지 않는다');
});

function near(a, b) { return Math.abs(a - b) < 0.02; }
