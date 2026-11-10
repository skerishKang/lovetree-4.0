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
  assert.deepEqual(Object.keys(M).sort(), ['bezierGeometry', 'bezierPoint', 'branchPoint', 'clusterSpan', 'concentricLayout', 'groupSizeFor', 'mobileFit', 'networkLayout', 'originPath', 'pathEmphasis', 'relationText', 'routeEdges', 'smallTreeLayout', 'treeLevels']);
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

test('2. 묶음 나누기: 순간 수를 6묶음으로 올림하고, 최소 1개', () => {
  assert.equal(M.groupSizeFor(40), 7);
  assert.equal(M.groupSizeFor(36), 6);
  assert.equal(M.groupSizeFor(1), 1);
  assert.equal(M.groupSizeFor(0), 1);
});

test('3. 묶음 이름·개수: 앞뒤 순번 두 자리, 마지막 묶음은 남은 수만', () => {
  assert.deepEqual(M.clusterSpan(0, 7, 40), { name: '순간 01–07', sub: '순간의 연결', count: 7 });
  assert.deepEqual(M.clusterSpan(5, 7, 40), { name: '순간 36–40', sub: '순간의 연결', count: 5 });
  assert.equal(M.clusterSpan(5, 7, 36).count, 1);
  // 순간보다 묶음이 많으면 개수는 0(음수 아님).
  assert.equal(M.clusterSpan(6, 7, 36).count, 0);
});

test('4. 작은 트리 보정: 36개 이하면 세로 220px·무대 1600, 그보다 크면 보정 없음', () => {
  assert.deepEqual(M.smallTreeLayout(36), { spacing: 220, baseY: 250, worldHeight: 1600 });
  assert.equal(M.smallTreeLayout(37), null);
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

test('6. 손가락 맞춤 배율: 0.40~0.62로 묶는다', () => {
  assert.equal(M.mobileFit(390, 800, 100), Math.max(0.40, Math.min(0.62, Math.min((390 - 26) / 175, (800 - 190) / 125))));
  assert.equal(M.mobileFit(3000, 3000, 10), 0.62);
  // 손가락 화면에서 계산값이 0.40보다 작아도 0.40 아래로 내려가지 않는다.
  assert.equal(M.mobileFit(320, 480, 4000), 0.40);
  assert.equal(M.mobileFit(320, 480, 400), 0.42);
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
  for (const call of ['LT56Model.branchPoint', 'LT56Model.groupSizeFor', 'LT56Model.clusterSpan', 'LT56Model.smallTreeLayout', 'LT56Model.bezierGeometry', 'LT56Model.mobileFit', 'LT56Model.routeEdges', 'LT56Model.networkLayout', 'LT56Model.concentricLayout', 'LT56Model.originPath', 'LT56Model.pathEmphasis', 'LT56Model.bezierPoint', 'LT56Model.relationText']) {
    assert.ok(SCREEN.includes(call), call);
  }
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

test('14. 그물형 배치: 첫 순간은 묶음 0 허브 옆 고정 자리, 나머지는 지금 나선 공식 그대로', () => {
  const centers = [{ x: 660, y: 610 }, { x: 990, y: 1305 }, { x: 705, y: 2060 }, { x: 1010, y: 2800 }, { x: 690, y: 3540 }, { x: 950, y: 4290 }];
  const eight = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, first: i === 0 }));
  const L = M.networkLayout(eight, centers);
  assert.equal(L.groupSize, 2);
  assert.deepEqual(L.points.m0, { x: 626, y: 628 }, '첫 순간 고정 자리(660-34, 610+18)');
  assert.ok(Math.abs(L.points.m1.x - (660 + Math.cos(-2.02) * 138)) < 1e-9, '지금 화면 공식과 같은 값(각도 -2.02, 거리 138)');
  assert.ok(Math.abs(L.points.m1.y - (610 + Math.sin(-2.02) * 138)) < 1e-9);
  const forty = Array.from({ length: 40 }, (_, i) => ({ id: `m${i}`, first: i === 0 }));
  assert.deepEqual(M.networkLayout(forty, centers).points.m0, { x: 626, y: 628 }, '순간이 늘어도 첫 순간 자리는 흔들리지 않는다');
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
  test(`15. 동심원 배치(순간 ${n}): 첫 순간 가운데·겹침 없음·화면 안·단계는 바깥 원·부모 근처`, () => {
    const { moments, edges } = sizes[n] || treeOf(n);
    for (const [w, h] of [[1440, 900], [390, 780]]) {
      const pad = w < 700 ? 64 : 56;
      const L = M.concentricLayout(moments, edges, { width: w, height: h, pad, nodeR: w < 700 ? 4.2 : 4.6 });
      const pts = Object.values(L.points);
      const first = L.points[L.firstId];
      assert.ok(near(first.x, L.center.x) && near(first.y, L.center.y), '첫 순간은 가운데');
      for (const p of pts) {
        assert.ok(Math.hypot(p.x - L.center.x, p.y - L.center.y) <= Math.min(w, h) / 2 - pad / 2 + 0.5, `(${w}×${h}) 화면 밖 점 없음`);
      }
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        assert.ok(d >= 2 * L.dotR - 0.01, `(${w}×${h}) 두 점이 겹치지 않는다 ${d.toFixed(1)} < ${(2 * L.dotR).toFixed(1)}`);
      }
      let prevMax = 0;
      for (let lv = 1; lv <= L.maxLevel; lv++) {
        const ring = moments.filter(m => L.levelOf[m.id] === lv && m.id !== L.firstId).map(m => L.points[m.id]);
        if (!ring.length) continue;
        const rs = ring.map(p => Math.hypot(p.x - L.center.x, p.y - L.center.y));
        assert.ok(Math.min(...rs) > prevMax, `${lv}단계 원은 이전 단계보다 바깥에 있다`);
        prevMax = Math.max(...rs);
      }
      if (n >= 12) {
        const t = M.treeLevels(moments, edges);
        const angleOf = p => Math.atan2(p.y - L.center.y, p.x - L.center.x);
        for (const parent of Object.keys(t.childrenOf)) {
          const kids = t.childrenOf[parent];
          if (kids.length < 2) continue;
          const lv = t.levelOf[kids[0]];
          const ringIds = moments.map(m => m.id).filter(id => t.levelOf[id] === lv && id !== L.firstId)
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
test('16. 동심원 배치 방어: 부모 연결로 닿지 않는 순간도 유한한 화면 안 좌표를 받는다', () => {
  const moments = [{ id: 'a', first: true }, { id: 'b' }, { id: 'c' }];
  const edges = [{ kind: 'parent', from: 'a', to: 'b', reason: '' }];
  for (const [w, h] of [[1440, 900], [390, 780]]) {
    const pad = w < 700 ? 64 : 56;
    const L = M.concentricLayout(moments, edges, { width: w, height: h, pad, nodeR: w < 700 ? 4.2 : 4.6 });
    assert.equal(L.levelOf.a, 0);
    assert.equal(L.levelOf.b, 1);
    assert.equal(L.levelOf.c, 2, '부모 연결로 닿지 않으면 바깥 단계로 물린다');
    for (const [id, p] of Object.entries(L.points)) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${id} 좌표 유한 (${w}×${h})`);
      assert.ok(Math.hypot(p.x - L.center.x, p.y - L.center.y) <= Math.min(w, h) / 2 - pad / 2 + 0.5, `${id} 화면 안 (${w}×${h})`);
    }
    const r = id => Math.hypot(L.points[id].x - L.center.x, L.points[id].y - L.center.y);
    assert.ok(r('c') > r('b'), '닿지 않는 노드가 가장 바깥');
  }
});

function near(a, b) { return Math.abs(a - b) < 0.02; }
