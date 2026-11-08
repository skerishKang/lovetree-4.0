// 기억 보드 계산 한 벌 시험(#231). 화면이 부르는 같은 파일(board-model.js)을 그대로 실행해 검사한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// 화면과 같은 조건: 일반 스크립트가 window.LT58Model 하나를 남긴다.
globalThis.window = globalThis;
await import('../public/v41/views/board/board-model.js');
const M = globalThis.LT58Model;
const BOARD = fs.readFileSync(new URL('../public/v41/views/board/board.js', import.meta.url), 'utf8');

test('0. 계산 한 벌은 화면이 실제로 부르는 함수만 노출한다', () => {
  assert.deepEqual(Object.keys(M).sort(), ['cardPosition', 'editGuard', 'escapeHTML', 'fitZoom', 'removeConnection', 'threadPath']);
  for (const fn of Object.keys(M)) assert.equal(typeof M[fn], 'function', fn);
});

test('1. 카드 자리: 8장씩 줄바꿈, 세로 400px 간격, 회전 -2·0·2도', () => {
  assert.deepEqual(M.cardPosition(0), { x: 150, y: 150, rot: -2 });
  assert.deepEqual(M.cardPosition(1), { x: 430, y: 150, rot: 0 });
  assert.deepEqual(M.cardPosition(8), { x: 150, y: 550, rot: 2 });
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => M.cardPosition(i).x), [150, 430, 710, 990, 1270, 1550, 1830, 2110]);
});

test('2. 실(연결선): 두 핀을 아래로 늘어뜨리고, dx가 크면 처짐이 커지되 140px에서 멈춘다', () => {
  const near = M.threadPath({ x: 0, y: 0 }, { x: 100, y: 50 });
  assert.equal(near.sag, 63);
  assert.equal(near.cy, 113);
  assert.equal(near.d, 'M 0 0 C 32 113, 68 113, 100 50');
  assert.equal(M.threadPath({ x: 0, y: 0 }, { x: 5000, y: 0 }).sag, 140);
});

test('3. 실(연결선): 위로 가는 연결도 처짐 기준점은 항상 아래쪽 핀이다', () => {
  assert.equal(M.threadPath({ x: 0, y: 300 }, { x: 100, y: 50 }).cy, 363);
  assert.equal(M.threadPath({ x: 10, y: 10 }, { x: 10, y: 10 }).d, 'M 10 10 C 10 65, 10 65, 10 10');
});

test('4. 전체 맞춤 배율: 여백 40px·최대 0.92배', () => {
  assert.equal(M.fitZoom(1440, 900), Math.min(1400 / 2400, 860 / 2200, 0.92));
  assert.equal(M.fitZoom(390, 800), Math.min(350 / 2400, 760 / 2200, 0.92));
  assert.equal(M.fitZoom(6000, 6000), 0.92);
});

test('5. 연결 지우기 계산: 고른 연결 하나만 빠지고 원본은 그대로다', () => {
  const list = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];
  assert.deepEqual(M.removeConnection(list, 'c2').map((c) => c.id), ['c1', 'c3']);
  assert.equal(list.length, 3);
  assert.deepEqual(M.removeConnection(list, 'nope').map((c) => c.id), ['c1', 'c2', 'c3']);
});

test('6. 지우기 분기: 예시 판본은 지우고, 실제 기록은 읽기 전용 안내만 한다', () => {
  assert.deepEqual(M.editGuard(true), { blocked: false, message: '' });
  const guard = M.editGuard(false);
  assert.equal(guard.blocked, true);
  assert.equal(guard.message, '읽기 전용에서는 연결을 변경할 수 없어요.');
  const list = [{ id: 'c1' }];
  assert.equal((guard.blocked ? list : M.removeConnection(list, 'c1')).length, 1);
});

test('7. 화면(board.js)은 같은 계산을 다시 구현하지 않고 이 한 벌을 부른다', () => {
  // 예전 중복 계산이 남아 있지 않다.
  assert.doesNotMatch(BOARD, /x:150\+\(i%8\)\*280/);
  assert.doesNotMatch(BOARD, /Math\.min\(\(vw-40\)\/2400/);
  assert.doesNotMatch(BOARD, /Math\.min\(140,55\+Math\.abs\(dx\)\*\.08\)/);
  assert.doesNotMatch(BOARD, /connections\.filter\(c=>c\.id!==selectedConn\)/);
  assert.doesNotMatch(BOARD, /function esc\(s\)/);
  // 부르는 자리(6곳)가 있다.
  for (const call of ['LT58Model.escapeHTML', 'LT58Model.cardPosition', 'LT58Model.threadPath', 'LT58Model.fitZoom', 'LT58Model.removeConnection', 'LT58Model.editGuard']) {
    assert.ok(BOARD.includes(call), call);
  }
  assert.match(BOARD, /toast\(guard\.message\)/);
});
