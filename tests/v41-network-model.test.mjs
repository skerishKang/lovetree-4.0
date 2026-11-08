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
  assert.deepEqual(Object.keys(M).sort(), ['bezierGeometry', 'branchPoint', 'clusterSpan', 'groupSizeFor', 'mobileFit', 'routeEdges', 'smallTreeLayout']);
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
  for (const call of ['LT56Model.branchPoint', 'LT56Model.groupSizeFor', 'LT56Model.clusterSpan', 'LT56Model.smallTreeLayout', 'LT56Model.bezierGeometry', 'LT56Model.mobileFit', 'LT56Model.routeEdges']) {
    assert.ok(SCREEN.includes(call), call);
  }
  // 예시 판본 판단(canPlay)은 그대로 한 곳에 있다.
  assert.match(SCREEN, /const canPlay=LTDEMO\.example;/);
});
