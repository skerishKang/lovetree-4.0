// #1425 전시 보기 시제품 — 계산 한 벌(exhibit-model.mjs)과 개발용 진입 주소 판정을 함수 호출로 본다(화면 없음).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXHIBIT_ORDERS, normalizeExhibitOrder, pathOrder, dateOrder, orderMoments, pageNumber, pageText,
  railMetrics, railNode, sceneSlot, sceneWindow, createMotion, aimMotion, stepMotion, releaseTarget,
  createWheelGate, artRatio, artWidthCap
} from '../public/v41/views/exhibit/exhibit-model.mjs';
import { screenUrl, screens } from '../public/v41/shell/navigation.mjs';
import { parseSelectionRoute, ownerSelectionRoute } from '../public/v41/selection-location.mjs';

const m = (id, parentId, date, createdAt) => ({ id, parentId, date, createdAt: createdAt || date + 'T00:00:00.000Z' });
// 줄기 a→b→c→d, b에서 갈린 e→f(나중에 만들었지만 날짜는 앞), a에서 갈린 g.
const TREE = [
  m('a', null, '2026-01-01'), m('b', 'a', '2026-01-05'), m('c', 'b', '2026-01-09'), m('d', 'c', '2026-01-12'),
  m('e', 'b', '2026-01-03', '2026-02-01T00:00:00.000Z'), m('f', 'e', '2026-01-04', '2026-02-02T00:00:00.000Z'),
  m('g', 'a', '2026-03-01')
];
const ids = (list) => list.map((x) => x.id).join('');

test('#1425 차례: 트리 차례는 먼저 이어진 길을 끝까지 간 뒤 가까운 갈림으로 돌아온다', () => {
  assert.equal(ids(pathOrder(TREE)), 'abcdefg');
  assert.equal(ids(orderMoments(TREE)), 'abcdefg', '기본은 트리 차례');
  assert.equal(ids(orderMoments(TREE, '모르는 값')), 'abcdefg');
  assert.deepEqual([...EXHIBIT_ORDERS], ['path', 'date']);
  assert.equal(normalizeExhibitOrder('date'), 'date');
  assert.equal(normalizeExhibitOrder(undefined), 'path');
});

test('#1425 차례: 날짜 차례는 순간 날짜가 이른 것부터, 같은 날은 만든 차례, 날짜 없는 순간은 맨 뒤', () => {
  assert.equal(ids(dateOrder(TREE)), 'aefbcdg');
  const mixed = [m('x', null, ''), { id: 'y', parentId: 'x', date: '', createdAt: '' }, m('z', 'x', '2026.1.2'), m('w', 'x', '2026-01-02', '2026-01-01T00:00:00.000Z')];
  assert.equal(ids(dateOrder(mixed)), 'wzyx', '날짜 표기가 달라도(2026.1.2) 같은 날로 읽고, 날짜를 모르는 둘은 맨 뒤');
});

test('#1425 차례: 빈 목록·깨진 기록에서도 순간을 잃지 않는다', () => {
  assert.deepEqual(pathOrder([]), []);
  assert.deepEqual(dateOrder(null), []);
  const broken = [m('a', null, '2026-01-01'), m('b', '없는 부모', '2026-01-02'), m('c', 'c', '2026-01-03'), m('a', null, '2026-01-04')];
  assert.equal(pathOrder(broken).length, 3, '같은 id는 한 번만, 부모를 못 찾은 순간도 나무에 붙는다');
  assert.equal(dateOrder(broken).length, 3);
  assert.equal(new Set(pathOrder(broken).map((x) => x.id)).size, 3);
});

test('#1425 쪽 번호: 두 자리부터, 순간 수의 자릿수를 따라간다', () => {
  assert.equal(pageText(0, 7), '01 / 07');
  assert.equal(pageText(29, 30), '30 / 30');
  assert.equal(pageText(4, 120), '005 / 120');
  assert.equal(pageText(0, 0), '00 / 00');
  assert.equal(pageNumber(99, 7), '07', '범위를 넘는 차례는 끝 번호로');
});

test('#1425 레일: 가운데 점이 가장 낮고, 이웃 이름표 사이가 이름표 폭보다 넓다(390·844×390·1440·2560)', () => {
  for (const [w, h, layout] of [[388, 733, 'narrow'], [842, 268, 'short'], [1438, 777, 'wide'], [2558, 1317, 'huge']]) {
    const metrics = railMetrics(w, h);
    assert.equal(metrics.layout, layout, w + '×' + h);
    const center = railNode(3, 3, metrics);
    assert.ok(Math.abs(center.x - w / 2) < 1e-6 && Math.abs(center.y - metrics.stationY) < 1e-6, '가운데 점은 정거장 자리');
    assert.ok(center.active && center.labelled);
    const right = railNode(4, 3, metrics), left = railNode(2, 3, metrics);
    assert.ok(right.x > center.x && left.x < center.x, '다음 순간은 오른쪽, 앞 순간은 왼쪽');
    assert.ok(right.y < center.y && Math.abs(right.y - left.y) < 1e-6, '양옆 점은 가운데보다 위, 좌우 대칭');
    const gap = right.x - center.x;
    assert.ok(gap >= metrics.nodeArc * 0.95 && gap >= 100, '이웃 사이 ' + Math.round(gap) + 'px');
    assert.ok(metrics.nodeArc - 16 <= gap, '이름표 폭(호 길이-16)이 이웃 사이보다 좁다');
    assert.ok(!railNode(40, 3, metrics).visible, '멀리 있는 점은 그리지 않는다');
    assert.equal(metrics.sceneSpacing, w, '쉬고 있을 때 이웃 장면은 한 화면 밖');
  }
  assert.equal(railNode(4, 3, railMetrics(388, 733)).labelled, true, '좁은 화면은 양옆 하나씩 이름표');
  assert.equal(railNode(5, 3, railMetrics(388, 733)).labelled, false);
});

test('#1425 장면: 가운데 장면만 또렷하고 이웃은 화면 밖·투명, 그려 두는 범위는 가운데 양옆 하나씩', () => {
  const metrics = railMetrics(1438, 777);
  assert.deepEqual(sceneSlot(2, 2, metrics), { x: 0, scale: 1, opacity: 1, active: true });
  const next = sceneSlot(3, 2, metrics);
  assert.equal(next.x, 1438); assert.equal(next.opacity, 0); assert.equal(next.active, false);
  assert.deepEqual(sceneWindow(0, 30), [0, 1]);
  assert.deepEqual(sceneWindow(6, 30), [5, 7]);
  assert.deepEqual(sceneWindow(6.4, 30), [5, 8]);
  assert.deepEqual(sceneWindow(29, 30), [28, 29]);
  assert.deepEqual(sceneWindow(0, 0), [0, -1]);
  assert.deepEqual(sceneWindow(0, 1), [0, 0]);
});

test('#1425 움직임: 한 장 넘김은 1초 안에 목표에 서고 지나침은 3% 아래다. 움직임 줄이기는 곧바로 선다', () => {
  const motion = createMotion(30, 0);
  aimMotion(motion, 1);
  let frames = 0, peak = 0;
  while (stepMotion(motion, 1) && frames < 600) { frames += 1; peak = Math.max(peak, motion.phase); }
  assert.equal(motion.phase, 1); assert.equal(motion.velocity, 0);
  assert.ok(frames > 10 && frames < 60, '프레임 ' + frames);
  assert.ok(peak < 1.03, '지나침 ' + peak.toFixed(3));
  // 느린 화면(30프레임)·빠른 화면(120프레임)에서도 같은 자리에 선다.
  for (const dt of [2, 0.5]) {
    const other = createMotion(30, 0);
    aimMotion(other, 1);
    let n = 0, top = 0;
    while (stepMotion(other, dt) && n < 600) { n += 1; top = Math.max(top, other.phase); }
    assert.equal(other.phase, 1);
    assert.ok(top < 1.05 && n * dt < 70, dt + '배 프레임: 지나침 ' + top.toFixed(3) + ', 걸린 프레임 ' + n);
  }
  const calm = createMotion(30, 4);
  aimMotion(calm, 5);
  assert.equal(stepMotion(calm, 1, { reduced: true }), false);
  assert.equal(calm.phase, 5);
});

test('#1425 움직임: 멀리 건너뛸 때는 목표 옆으로 옮긴 뒤 한 장만 움직이고, 범위 밖 차례는 끝에 선다', () => {
  const motion = createMotion(30, 0);
  assert.equal(aimMotion(motion, 29), 29);
  assert.equal(motion.phase, 28, '중간 장면 스물일곱 장을 훑지 않는다');
  assert.equal(aimMotion(motion, 99), 29);
  assert.equal(aimMotion(motion, -5), 0);
  const jump = createMotion(30, 0);
  aimMotion(jump, 12, { jump: true });
  assert.equal(jump.phase, 12);
  const single = createMotion(1, 0);
  assert.equal(aimMotion(single, 1), 0);
  assert.equal(createMotion(0).max, 0);
});

test('#1425 끌기: 20% 넘게 끌거나 빠르게 튕기면 한 장, 조금 끌면 제자리', () => {
  assert.equal(releaseTarget(3.1, 3, 0, 29), 3);
  assert.equal(releaseTarget(3.25, 3, 0, 29), 4);
  assert.equal(releaseTarget(2.75, 3, 0, 29), 2);
  assert.equal(releaseTarget(3.05, 3, 0.03, 29), 4, '빠른 튕기기');
  assert.equal(releaseTarget(3.7, 3, 0, 29), 4);
  assert.equal(releaseTarget(5.6, 3, 0, 29), 6, '멀리 끌면 끈 만큼');
  assert.equal(releaseTarget(28.9, 29, 0.05, 29), 29, '끝을 넘지 않는다');
  assert.equal(releaseTarget(0.1, 0, -0.05, 29), 0);
  assert.equal(releaseTarget(3.3, 3, -0.04, 29), 2, '끌다가 반대로 튕기면 그 방향이 먼저다');
});

test('#1425 휠: 마우스 한 칸은 한 장, 쉬는 시간 안의 굴림은 넘기지 않고, 작은 굴림은 모여서 한 장', () => {
  const wheel = createWheelGate({ threshold: 50, restMs: 240 });
  assert.equal(wheel(0, 100, 1000), 1);
  assert.equal(wheel(0, 100, 1100), 0, '쉬는 시간');
  assert.equal(wheel(0, 100, 1300), 1);
  assert.equal(wheel(0, -100, 1600), -1);
  const pad = createWheelGate({ threshold: 50, restMs: 240 });
  assert.equal(pad(0, 20, 0), 0); assert.equal(pad(0, 20, 16), 0); assert.equal(pad(0, 20, 32), 1, '작은 굴림이 모여 한 장');
  assert.equal(pad(30, 4, 400), 0); assert.equal(pad(30, 4, 416), 1, '옆으로 미는 굴림도 센다');
  assert.equal(pad(0, 0, 800), 0);
});

test('#1425 작품 틀: 유튜브는 16:9·9:16 고정, 사진은 실제 비율을 9:16~16:9 안으로, 작은 그림은 1.35배까지만', () => {
  assert.equal(artRatio('youtube', 480, 360), 16 / 9, '4:3 썸네일도 16:9 틀(위아래 띠를 잘라 보인다)');
  assert.equal(artRatio('youtube-vertical', 405, 720), 9 / 16);
  assert.equal(artRatio('photo', 372, 480), 372 / 480);
  assert.equal(artRatio('photo', 3000, 500), 16 / 9);
  assert.equal(artRatio('photo', 300, 2000), 9 / 16);
  assert.equal(artRatio('photo', 0, 0), 4 / 3);
  assert.equal(artWidthCap(480), 648);
  assert.equal(artWidthCap(1280), 1728);
  assert.equal(artWidthCap(0), 0);
});

test('#1425 본 연결: 전시 보기와 소유·공유 주소', () => {
  const origin = 'https://lovetree-4-0.pages.dev';
  assert.equal(new URL(screenUrl('exhibit.html','server',origin)).pathname,'/v41/views/exhibit/exhibit.html');
  assert.equal(new URL(screenUrl('track61-tree.html','server',origin)).pathname,'/v41/views/track61-tree.html');
  assert.ok(screens.some(row=>row[0]==='exhibit' && row[1]==='exhibit.html'));
  assert.equal(parseSelectionRoute('#share/test/exhibit').view,'exhibit');
  assert.equal(parseSelectionRoute('#visit/test/exhibit').view,'exhibit');
  assert.equal(parseSelectionRoute('#visit/test/exhibit').kind,'visit');
  assert.equal(parseSelectionRoute(ownerSelectionRoute({view:'exhibit',treeId:'a'})).view,'exhibit');
});
test('#1425 0·1·5·30·200개 순서 보존', () => {
 for(const count of [0,1,5,30,200]) {
  const list=Array.from({length:count},(_,i)=>m(String(i),i?String(i-1):null,'2026-01-01'));
  const ordered=orderMoments(list);
  assert.equal(ordered.length,count);
  assert.deepEqual(ordered.map(row=>row.id),list.map(row=>row.id));
  assert.equal(createMotion(count).max,Math.max(0,count-1));
 }
});
