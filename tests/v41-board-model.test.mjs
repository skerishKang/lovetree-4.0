// 기억 보드 계산 한 벌 시험(#231). 화면이 부르는 같은 파일(board-model.js)을 그대로 실행해 검사한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// 화면과 같은 조건: 일반 스크립트가 window.LT58Model 하나를 남긴다.
globalThis.window = globalThis;
await import('../public/v41/views/board/board-model.js');
const M = globalThis.LT58Model;
const BOARD = fs.readFileSync(new URL('../public/v41/views/board/board.js', import.meta.url), 'utf8');
const EXTRAS = fs.readFileSync(new URL('../public/v41/views/board/board-extras.js', import.meta.url), 'utf8');

test('0. 계산 한 벌은 화면이 실제로 부르는 함수만 노출한다', () => {
  assert.deepEqual(Object.keys(M).sort(), ['cardPosition', 'cinemaBeats', 'collectPath', 'detailButtonState', 'editGuard', 'escapeHTML', 'fitZoom', 'nextConnections', 'removeConnection', 'threadPath']);
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

test('8. 경로 수집: 부모 연결을 따라가고, 순환·끊김에서 멈춘다', () => {
  const cons = [
    { id: 'c1', kind: 'parent', a: 'm1', b: 'm2' },
    { id: 'c2', kind: 'parent', a: 'm2', b: 'm3' },
    { id: 'r1', kind: 'related', a: 'm1', b: 'm9' },
    { id: 'c3', kind: 'parent', a: 'm3', b: 'm1' } // 순환
  ];
  // 순환으로 돌아오면 그 연결까지 기록하고 멈춘다(예전 규칙 그대로).
  assert.deepEqual(M.collectPath('m1', 5, cons), { ids: ['m1', 'm2', 'm3'], cons: ['c1', 'c2', 'c3'] });
  assert.deepEqual(M.collectPath('m3', 5, cons), { ids: ['m3', 'm1', 'm2'], cons: ['c3', 'c1', 'c2'] });
  // 갈래가 여럿이면 첫 연결을 따른다(예전과 같은 규칙).
  const two = [{ id: 'a', kind: 'parent', a: 'm1', b: 'm2' }, { id: 'b', kind: 'parent', a: 'm1', b: 'm3' }];
  assert.deepEqual(M.collectPath('m1', 5, two).ids, ['m1', 'm2']);
  // 상한(순간 수)을 넘겨 돌지 않는다.
  const loop = [{ id: 'x', kind: 'parent', a: 'm1', b: 'm2' }, { id: 'y', kind: 'parent', a: 'm2', b: 'm1' }];
  assert.ok(M.collectPath('m1', 3, loop).ids.length <= 3);
});

test('9. 다음/이전 후보: 고른 순간에 이어진 부모 연결만 고른다', () => {
  const cons = [
    { id: 'c1', kind: 'parent', a: 'm1', b: 'm2' },
    { id: 'c2', kind: 'parent', a: 'm1', b: 'm3' },
    { id: 'r1', kind: 'related', a: 'm1', b: 'm4' },
    { id: 'c3', kind: 'parent', a: 'm3', b: 'm1' }
  ];
  assert.deepEqual(M.nextConnections('next', 'm1', cons).map((c) => c.id), ['c1', 'c2']);
  assert.deepEqual(M.nextConnections('prev', 'm1', cons).map((c) => c.id), ['c3']);
  assert.deepEqual(M.nextConnections('next', 'zzz', cons), []);
});

test('10. 상세 버튼 상태: 연결이 없으면 잠그고 안내 문구를 붙인다', () => {
  assert.deepEqual(M.detailButtonState([], []), { nextDisabled: true, nextTitle: '다음으로 연결된 순간이 없어요', prevDisabled: true });
  assert.deepEqual(M.detailButtonState([{}], [{}]), { nextDisabled: false, nextTitle: '', prevDisabled: false });
});

test('11. 시네마 비트: 순간·연결·이유·갈림·마무리 순서와 길이', () => {
  const moments = [{ id: 'm1', first: true }, { id: 'm2' }];
  const cons = [{ id: 'c1', kind: 'parent', a: 'm1', b: 'm2' }, { id: 'c2', kind: 'parent', a: 'm1', b: 'm3' }];
  const beats = M.cinemaBeats(['m1', 'm2'], moments, cons);
  assert.deepEqual(beats.map((b) => b.type), ['moment', 'connection', 'why', 'branch', 'moment', 'bloom', 'final']);
  assert.equal(beats[0].label, '첫 순간');
  assert.equal(beats[0].dur, 2200);
  assert.equal(beats[1].cid, 'c1');
  assert.equal(beats[1].dur, 2300);
  assert.equal(beats[4].label, 'NEXT 순간');
  assert.equal(beats[4].dur, 1800);
  assert.equal(beats[5].dur, 2300);
  assert.equal(beats[6].dur, 999999);
  // 빈 경로에서도 마무리 비트는 남는다(예전과 같은 모양).
  assert.deepEqual(M.cinemaBeats([], moments, cons).map((b) => b.type), ['bloom', 'final']);
});

test('12. board-extras.js는 같은 계산을 다시 구현하지 않고 한 벌을 부른다', () => {
  assert.doesNotMatch(EXTRAS, /while\(guard\+\+<moments\.length\)/);
  assert.doesNotMatch(EXTRAS, /connections\.filter\(c=>c\.kind==='parent'&&\(dir==='next'/);
  assert.doesNotMatch(EXTRAS, /beats\.push\(\{type:'moment'/);
  assert.doesNotMatch(EXTRAS, /\$\('#nextMoment'\)\.disabled=outs\.length===0/);
  for (const call of ['LT58Model.collectPath', 'LT58Model.nextConnections', 'LT58Model.detailButtonState', 'LT58Model.cinemaBeats']) {
    assert.ok(EXTRAS.includes(call), call);
  }
});
