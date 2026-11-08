// 기억 보드 순수 계산 시험(#231 보충). 화면(DOM) 없이 모델만 부른다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cardPosition, threadPath, fitZoom, clampZoom, removeConnection, editGuard, filterMoments } from '../public/v41/views/board/board-model.mjs';

test('카드 자리: 8장씩 줄바꿈, 세로 400px 간격, 회전 -2·0·2도', () => {
  assert.deepEqual(cardPosition(0), {x: 150, y: 150, rot: -2});
  assert.deepEqual(cardPosition(1), {x: 430, y: 150, rot: 0});
  assert.deepEqual(cardPosition(8), {x: 150, y: 550, rot: 2});
  // 실제 보드와 같은 첫 줄: 8장이 x=150..2110 사이에 280px 간격으로 놓인다.
  const firstRow = Array.from({length: 8}, (_, i) => cardPosition(i).x);
  assert.deepEqual(firstRow, [150, 430, 710, 990, 1270, 1550, 1830, 2110]);
});

test('실(연결선): 두 핀을 아래로 늘어뜨리고, dx가 크면 처짐이 커지되 140px에서 멈춘다', () => {
  const near = threadPath({x: 0, y: 0}, {x: 100, y: 50});
  assert.equal(near.sag, 63);
  assert.equal(near.cy, 113);
  assert.equal(near.d, 'M0,0 C0,113 100,113 100,50');
  assert.equal(threadPath({x: 0, y: 0}, {x: 5000, y: 0}).sag, 140);
  // 위쪽으로 가는 연결도 처짐 기준점은 항상 아래쪽 핀이다.
  assert.equal(threadPath({x: 0, y: 300}, {x: 100, y: 50}).cy, 300 + 63);
});

test('전체 맞춤 배율: 여백 40px·최대 0.92배', () => {
  assert.equal(fitZoom(1440, 900), Math.min(1400 / 2400, 860 / 2200, 0.92));
  assert.equal(fitZoom(390, 800), Math.min(350 / 2400, 760 / 2200, 0.92));
  assert.equal(fitZoom(6000, 6000), 0.92);
});

test('확대 범위: 손가락 0.20~1.55, 그 밖 0.24~1.55', () => {
  assert.equal(clampZoom(9, true), 1.55);
  assert.equal(clampZoom(9, false), 1.55);
  assert.equal(clampZoom(0.01, true), 0.2);
  assert.equal(clampZoom(0.01, false), 0.24);
  assert.equal(clampZoom(0.8, false), 0.8);
});

test('연결 지우기 계산: 고른 연결 하나만 빠지고 원본은 그대로다', () => {
  const list = [{id: 'c1'}, {id: 'c2'}, {id: 'c3'}];
  const out = removeConnection(list, 'c2');
  assert.deepEqual(out.map((c) => c.id), ['c1', 'c3']);
  assert.equal(list.length, 3, '원본 배열은 건드리지 않는다');
  assert.deepEqual(removeConnection(list, 'nope').map((c) => c.id), ['c1', 'c2', 'c3']);
});

test('연결 지우기 분기: 예시 판본은 지우고, 실제 기록은 읽기 전용 안내만 한다', () => {
  assert.deepEqual(editGuard(true), {blocked: false, message: ''});
  const guard = editGuard(false);
  assert.equal(guard.blocked, true);
  assert.equal(guard.message, '읽기 전용에서는 연결을 변경할 수 없어요.');
  // 막힌 판본에서는 목록을 지우지 않는다(문구만 보여준다).
  const list = [{id: 'c1'}];
  const next = guard.blocked ? list : removeConnection(list, 'c1');
  assert.equal(next.length, 1);
});

test('목록 필터: 종류·키워드로 순간을 고른다', () => {
  const list = [
    {id: 'a', type: 'photo', originalType: 'photo', keywords: ['첫만남']},
    {id: 'b', type: 'video', originalType: 'video', keywords: ['무대']},
    {id: 'c', type: 'note', originalType: 'note', keywords: ['첫만남', '무대']}
  ];
  assert.deepEqual(filterMoments(list).map((m) => m.id), ['a', 'b', 'c']);
  assert.deepEqual(filterMoments(list, 'video').map((m) => m.id), ['b']);
  assert.deepEqual(filterMoments(list, 'all', '무대').map((m) => m.id), ['b', 'c']);
  assert.deepEqual(filterMoments(list, 'note', '무대').map((m) => m.id), ['c']);
});
