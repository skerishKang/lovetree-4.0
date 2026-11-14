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

test('0. 보드 한 벌: 화면이 부르는 함수가 전부 있다', () => {
  assert.deepEqual(Object.keys(M).sort(), ['boardSize', 'cinemaBeats', 'clampView', 'collectPath', 'contentBox', 'dateDescOrder', 'decorationMotion', 'detailButtonState', 'editGuard', 'escapeHTML', 'filterVisible', 'fitBox', 'fitZoom', 'gridColumns', 'gridPosition', 'gridRowTops', 'isPinboardSlot', 'maxCreatedOrder', 'nextConnections', 'pinboardSpread', 'rememberView', 'savedView', 'settleColumnGaps', 'slotOf', 'startView', 'visibleCards']);
  for (const fn of Object.keys(M)) assert.equal(typeof M[fn], 'function', fn);
});

test('1. 바둑판 칸 수: 화면 폭이 정한다(#582) — 1440은 4칸, 390은 1칸, 1920은 6칸(상한)', () => {
  assert.equal(M.gridColumns(1440), 4);
  assert.equal(M.gridColumns(390), 1);
  assert.equal(M.gridColumns(1920), 6);
  assert.equal(M.gridColumns(0), 1);
});

test('2. 바둑판 순서: 날짜 최신순, 같은 날짜면 최근에 만든 순간부터(#582)', () => {
  const ms = [
    { id: 'a', date: '2026-01-02', createdOrder: 1 },
    { id: 'b', date: '2026-01-05', createdOrder: 2 },
    { id: 'c', date: '2026-01-02', createdOrder: 3 },
    { id: 'd', date: '', createdOrder: 9 }
  ];
  assert.deepEqual(M.dateDescOrder(ms), ['b', 'c', 'a', 'd']);
});

test('3. 바둑판 자리: 저장 자리는 그대로 남고(#395 계약) 나머지를 빈 칸에 채운다, 세로 간격은 예약 높이+여백(#553)', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
  const saved = new Map([['a', { col: 2, row: 0 }]]);
  const r = M.pinboardSpread(ids, { cols: 4, saved });
  // a는 사람이 꽂은 자리(2,0)에 그대로, b·c·d가 나머지 첫 줄을 채운다.
  assert.deepEqual(r.get('a'), { col: 2, row: 0 });
  assert.deepEqual(r.get('b'), { col: 0, row: 0 });
  assert.deepEqual(r.get('c'), { col: 1, row: 0 });
  assert.deepEqual(r.get('d'), { col: 3, row: 0 });
  assert.deepEqual(r.get('e'), { col: 0, row: 1 });
  assert.deepEqual(r.get('i'), { col: 0, row: 2 });
  // 자리가 겹치지 않는다.
  const keys = [...r.values()].map((s) => s.col + ':' + s.row);
  assert.equal(new Set(keys).size, keys.length);
  // 줄의 y: 그 줄의 최대 예약 높이 + 여백(#553 규칙) — YouTube(480)가 있는 줄은 516px 간격이 된다.
  const slots2 = new Map([['a', { col: 0, row: 0 }], ['b', { col: 0, row: 1 }], ['c', { col: 1, row: 1 }]]);
  const tops = M.gridRowTops(slots2, (id) => (id === 'a' ? 480 : 424));
  assert.deepEqual(tops, [150, 666], '첫 줄은 480+36 간격으로 벌어진다');
  assert.deepEqual(M.gridPosition(0, tops[0], 0), { x: 150, y: 150, rot: -2 });
  assert.deepEqual(M.gridPosition(1, tops[1], 1), { x: 450, y: 666, rot: 0 });
  // 같은 열 위아래 간격은 위 카드의 예약 높이 이상이다(겹침 없음).
  assert.ok(tops[1] - tops[0] >= 480);
  // 픽셀 → 슬롯(끌어 꽂기): 같은 규칙으로 되새긴다.
  assert.deepEqual(M.slotOf(460, 610), { col: 1, row: 1 });
  assert.deepEqual(M.slotOf(-50, -50), { col: 0, row: 0 });
});

test('4. 전체 맞춤 배율: 여백 40px·최대 0.92배', () => {
  assert.equal(M.fitZoom(1440, 900), Math.min(1400 / 2400, 860 / 2200, 0.92));
  assert.equal(M.fitZoom(390, 800), Math.min(350 / 2400, 760 / 2200, 0.92));
  assert.equal(M.fitZoom(6000, 6000), 0.92);
});

test('6. 지우기 분기: 예시 판본은 지우고, 실제 기록은 읽기 전용 안내만 한다', () => {
  assert.deepEqual(M.editGuard(true), { blocked: false, message: '' });
  const guard = M.editGuard(false);
  assert.equal(guard.blocked, true);
  assert.equal(guard.message, '읽기 전용에서는 연결을 변경할 수 없어요.');
  // #582: 연결 지우기는 지도가 맡는다 — 보드 모델은 지우기 허용 판단만 남긴다.
});

test('7. 화면(board.js)은 같은 계산을 다시 구현하지 않고 이 한 벌을 부른다', () => {
  // 예전 중복 계산이 남아 있지 않다.
  assert.doesNotMatch(BOARD, /x:150\+\(i%8\)\*280/);
  assert.doesNotMatch(BOARD, /Math\.min\(\(vw-40\)\/2400/);
  assert.doesNotMatch(BOARD, /Math\.min\(140,55\+Math\.abs\(dx\)\*\.08\)/);
  assert.doesNotMatch(BOARD, /connections\.filter\(c=>c\.id!==selectedConn\)/);
  assert.doesNotMatch(BOARD, /function esc\(s\)/);
  // 부르는 자리(6곳)가 있다.
  for (const call of ['LT58Model.escapeHTML', 'LT58Model.gridColumns', 'LT58Model.pinboardSpread', 'LT58Model.gridPosition', 'LT58Model.fitZoom', 'LT58Model.editGuard']) {
    assert.ok(BOARD.includes(call), call);
  }
  // #582: 줄 그리기는 사라진다 — 실 계산(threadPath)을 부르는 곳도 없다.
  assert.doesNotMatch(BOARD, /LT58Model\.threadPath/);
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

// 13. 목록 필터 판정 — 분기 표(PR 본문) 그대로.
//  미디어 \ 키워드 | all          | 키워드 있음
//  all            | 모두 보임     | 그 키워드를 가진 순간만
//  first          | first인 순간만 | first 이고 키워드도 있는 순간만
//  unconnected    | 연결 없는 순간 | 연결 없고 키워드도 있는 순간
//  recent         | 최근 3개(최대-2 이상) | 최근 3개 중 키워드 있는 순간
//  photo/video/note(link 등) | 그 종류만 | 그 종류 + 키워드
test('13. 목록 필터 판정: 미디어 × 키워드 조건을 표대로 본다', () => {
  const connections = [{ id: 'c1', a: 'm1', b: 'm2' }];
  const mk = (id, extra = {}) => ({ id, type: 'photo', originalType: 'photo', createdOrder: 1, keywords: [], ...extra });
  const m1 = mk('m1', { first: true, createdOrder: 1, keywords: ['첫만남'] });
  const m2 = mk('m2', { createdOrder: 2, keywords: ['무대'] });
  const m3 = mk('m3', { type: 'video', originalType: 'video', createdOrder: 3, keywords: ['첫만남', '무대'] });
  const m4 = mk('m4', { type: 'note', originalType: 'note', createdOrder: 4, keywords: [] });
  const all = [m1, m2, m3, m4];
  const maxOrder = M.maxCreatedOrder(all);
  assert.equal(maxOrder, 4);
  const visible = (filter, keyword = 'all') => all.filter((m) => M.filterVisible(m, { mediaFilter: filter, keywordFilter: keyword, maxOrder }, connections)).map((m) => m.id);

  assert.deepEqual(visible('all'), ['m1', 'm2', 'm3', 'm4']);
  assert.deepEqual(visible('all', '무대'), ['m2', 'm3']);
  assert.deepEqual(visible('first'), ['m1']);
  assert.deepEqual(visible('first', '첫만남'), ['m1']);
  assert.deepEqual(visible('first', '무대'), []);
  assert.deepEqual(visible('unconnected'), ['m3', 'm4']);
  assert.deepEqual(visible('unconnected', '무대'), ['m3']);
  assert.deepEqual(visible('recent'), ['m2', 'm3', 'm4']);
  assert.deepEqual(visible('recent', '첫만남'), ['m3']);
  assert.deepEqual(visible('video'), ['m3']);
  assert.deepEqual(visible('note', '무대'), []);
  assert.deepEqual(visible('photo', '무대'), ['m2']);
  // 종류 판정은 originalType이 없으면 type으로 대신한다.
  assert.equal(M.filterVisible({ id: 'x', type: 'video', createdOrder: 1 }, { mediaFilter: 'video' }, []), true);
  // 필터 값이 없으면(요소 미존재) 전체로 본다 — 예전 `|| 'all'`과 같다.
  assert.equal(M.filterVisible(m1, {}, []), true);
  // 기록 종류(예시/실제)로 갈리지 않는다: 판정 함수에 그런 입력이 없다.
  assert.deepEqual(Object.keys(M).filter((k) => /example|demo|real/i.test(k)), []);
});

test('16. 상시 루프·무한 글로우 애니메이션이 남아 있지 않다(#346 강도 가드)', () => {
  const CSS = fs.readFileSync(new URL('../public/v41/views/board/board.css', import.meta.url), 'utf8');
  assert.ok(!EXTRAS.includes('livingThreadLoop'), '상시 rAF 루프 이름이 남아 있으면 실패');
  assert.ok(!/requestAnimationFrame\(livingThreadLoop\)/.test(EXTRAS), '자기 자신을 다시 거는 루프가 없어야 한다');
  assert.ok(!EXTRAS.includes('LT58Model.threadRedrawStep'), '#582: 줄이 없으므로 실 다시 그리기 예약 판정도 함께 거둔다');
  assert.ok(EXTRAS.includes('scheduleThreadFrame()'), '드래그·크기 변경은 예약 함수로 묶는다');
  assert.doesNotMatch(EXTRAS, /el\.style\.top=m\.y\+'px';rerenderThreads\(\)/, '드래그에서 매 이동마다 바로 그리지 않는다');
  const glow = CSS.match(/\.spaceGlow\{([^}]*)\}/)?.[1] || '';
  assert.ok(glow, '.spaceGlow 규칙이 있어야 한다');
  assert.doesNotMatch(glow, /animation/, '큰 흐림 배경에 무한 애니메이션을 걸지 않는다');
  assert.ok(!CSS.includes('@keyframes spaceBreath'), 'spaceBreath 키프레임이 남아 있으면 실패');
});

test('17. 장식 애니메이션 정지 판정(#346 2단계): 이동·확대·드래그·터치 중에는 멈춘다', () => {
  assert.equal(M.decorationMotion({}), 'running');
  assert.equal(M.decorationMotion(), 'running', '입력 없음 = 그대로 흐른다');
  assert.equal(M.decorationMotion({ pan: true }), 'paused');
  assert.equal(M.decorationMotion({ pinch: true }), 'paused');
  assert.equal(M.decorationMotion({ dragging: true }), 'paused');
  assert.equal(M.decorationMotion({ touches: 2 }), 'paused');
  assert.equal(M.decorationMotion({ touches: 0 }), 'running');
  assert.equal(M.decorationMotion({ pan: true, dragging: true, touches: 1 }), 'paused');
});

test('18. 정지 배선: 셸이 decor-paused를 토글하고, CSS가 장식 애니메이션만 멈춘다', () => {
  const CSS = fs.readFileSync(new URL('../public/v41/views/board/board.css', import.meta.url), 'utf8');
  assert.match(EXTRAS, /LT58Model\.decorationMotion\(\{pan:!!pan,pinch:!!pinch,dragging:!!drag,touches:boardTouches\.size\}\)/, '판정 한 벌을 쓴다');
  assert.match(EXTRAS, /classList\.toggle\('decor-paused'/, '클래스 토글이 있다');
  assert.match(EXTRAS, /addEventListener\('pointerdown',\(\)=>queueMicrotask\(applyDecorMotion\)\)/, '손을 대면 적용');
  assert.match(EXTRAS, /addEventListener\('pointerup',\(\)=>queueMicrotask\(applyDecorMotion\)\)/, '손을 떼면 해제');
  assert.ok(CSS.includes('body.decor-paused .threadWave,body.decor-paused .pin::after{animation-play-state:paused}'), 'CSS 정지 규칙이 있다');
});

test('14. board-extras.js는 필터 판정을 다시 구현하지 않고 한 벌을 부른다', () => {
  assert.doesNotMatch(EXTRAS, /ok=(m\.createdOrder\|\|0)>=maxOrder-2/);
  assert.doesNotMatch(EXTRAS, /ok=!connections\.some\(c=>c\.a===m\.id\|\|c\.b===m\.id\)/);
  assert.doesNotMatch(EXTRAS, /ok=ok&&\(m\.keywords\|\|\[\]\)\.includes\(kf\)/);
  assert.doesNotMatch(EXTRAS, /maxOrder=Math\.max\(\.\.\.moments\.map\(m=>m\.createdOrder/);
  assert.ok(EXTRAS.includes('LT58Model.filterVisible(m,state,connections)'));
  assert.ok(EXTRAS.includes('LT58Model.maxCreatedOrder(moments)'));
  // DOM 반영(클래스 토글)은 화면에 그대로 남는다.
  assert.ok(EXTRAS.includes("el.classList.toggle('filteredOut',!ok)"));
});

test('처음 배치(#395 → #582 바둑판): 관계를 버려도 처음 꽂힌 자리는 남는다 — 저장 자리가 있으면 그 칸을 쓴다', () => {
  const ids = Array.from({ length: 14 }, (_, i) => 'm' + i);
  // 관계(줄)는 이제 배치에 아무 영향이 없다: 같은 입력이면 edges와 무관하게 같은 자리.
  const saved = new Map([['m0', { col: 0, row: 0 }], ['m1', { col: 3, row: 1 }]]);
  const withEdges = M.pinboardSpread(ids, { cols: 4, saved: new Map(saved) });
  const noEdges = M.pinboardSpread(ids, { cols: 4, saved: new Map(saved) });
  assert.deepEqual(withEdges.get('m1'), noEdges.get('m1'));
  assert.deepEqual(withEdges.get('m1'), { col: 3, row: 1 });
  // 나머지는 빈 칸에 순서대로 채워진다.
  assert.deepEqual(withEdges.get('m2'), { col: 1, row: 0 });
  assert.equal(withEdges.size, 14);
});

// #460 컴퓨터에서 보드를 읽을 수 있는 크기로 연다.
const chain = (n) => Array.from({ length: n }, (_, i) => ({ id: 'm' + i, x: 150 + i * 300, y: 150, w: 242, h: 300 }));
const grid = (n) => Array.from({ length: n }, (_, i) => ({ id: 'm' + i, x: 150 + (i % 7) * 300, y: 150 + Math.floor(i / 7) * 420, w: 242, h: 300 }));
const VP1440 = { w: 1440, h: 834 }, SAFE1440 = { x: 244, y: 12, w: 810, h: 810 };
const onScreen = (v, c) => ({ x: c.x * v.z + v.x, y: c.y * v.z + v.y, w: c.w * v.z, h: c.h * v.z });
const inside = (r, a) => r.x >= a.x - 0.5 && r.y >= a.y - 0.5 && r.x + r.w <= a.x + a.w + 0.5 && r.y + r.h <= a.y + a.h + 0.5;

test('#460 카드 묶음 사각형과 맞춤: 실제 순간이 있는 곳만 기준으로 한다', () => {
  assert.equal(M.contentBox([]), null);
  assert.deepEqual(M.contentBox([{ x: 100, y: 200, w: 242, h: 300 }, { x: 700, y: 200, w: 242, h: 300 }]), { x: 60, y: 160, w: 922, h: 380 });
  const v = M.fitBox({ x: 0, y: 0, w: 1000, h: 500 }, { x: 0, y: 0, w: 500, h: 500 }, 1);
  assert.equal(v.z, 0.5);
  assert.equal(v.y, 125); // 세로 가운데
  assert.equal(M.fitBox({ x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 1000, h: 1000 }, 0.92).z, 0.92);
});

test('#460 처음 열 때(1440): 많은 트리는 0.8배(제목 12.8px)로 그 순간 근처, 적은 트리는 한눈에', () => {
  for (const n of [15, 40]) {
    const cards = grid(n);
    const v = M.startView({ viewport: VP1440, safe: SAFE1440, cards, focusId: 'm0' });
    assert.equal(v.mode, 'focus');
    assert.equal(v.z, 0.8);
    assert.ok(16 * v.z >= 12, '카드 제목 12px 이상');
    assert.ok(inside(onScreen(v, cards[0]), SAFE1440), '첫 순간이 도구·상세 창에 가리지 않는다');
    assert.ok(M.visibleCards(v, SAFE1440, cards) >= 6, '보이는 칸에 여러 장');
    // 판(흰 판)이 화면을 채운다: 위·아래·오른쪽 빈 띠 없음(왼쪽은 도구 창 뒤).
    assert.ok(48 * v.z + v.y <= 0 && 2152 * v.z + v.y >= VP1440.h && 2352 * v.z + v.x >= VP1440.w);
  }
  for (const n of [1, 3]) {
    const cards = chain(n);
    const v = M.startView({ viewport: VP1440, safe: SAFE1440, cards, focusId: 'm0' });
    assert.equal(v.mode, 'fit');
    assert.ok(v.z >= 0.8 && v.z <= 1, `${n}개: ${v.z}`);
    for (const c of cards) assert.ok(inside(onScreen(v, c), SAFE1440), `${n}개 모두 보인다`);
  }
  // 마지막으로 보던 순간(가운데쯤)이 있으면 그 근처를 연다.
  const cards = grid(40);
  const v = M.startView({ viewport: VP1440, safe: SAFE1440, cards, focusId: 'm24' });
  assert.ok(inside(onScreen(v, cards[24]), SAFE1440));
  // 세기 증명: 예전 전체 맞춤(무대 2400x2200)은 33%라 제목이 6px도 안 됐다.
  assert.ok(16 * M.fitZoom(1440, 834) < 6);
});

test('#460 처음 열 때(1024·순간 없음): 좁아도 그 순간은 보이고, 순간이 없으면 무대 전체', () => {
  const safe = { x: 244, y: 12, w: 394, h: 676 };
  const cards = chain(5);
  const v = M.startView({ viewport: { w: 1024, h: 700 }, safe, cards, focusId: 'm0' });
  assert.equal(v.z, 0.8);
  assert.ok(inside(onScreen(v, cards[0]), safe));
  const e = M.startView({ viewport: VP1440, safe: SAFE1440, cards: [] });
  assert.equal(e.mode, 'empty');
  assert.equal(e.z, M.fitZoom(1440, 834));
});

test('#460 판 채우기: 판이 칸보다 크면 빈 곳이 드러나지 않게 밀고, 작으면 그대로 둔다', () => {
  const rect = { x: 0, y: 0, w: 1000, h: 1000 }, area = { x: 0, y: 0, w: 500, h: 500 };
  assert.deepEqual(M.clampView({ z: 1, x: 100, y: -900 }, rect, area), { z: 1, x: 0, y: -500 });
  assert.deepEqual(M.clampView({ z: 0.2, x: 100, y: 50 }, rect, area), { z: 0.2, x: 100, y: 50 });
});

test('#460 보던 자리 기억: 트리별로 남기고, 최근 20개만, 이상한 값은 버린다', () => {
  let all = {};
  for (let i = 0; i < 25; i++) all = M.rememberView(all, 't' + i, { cx: 100.4, cy: 200.6, z: 0.8333 }, i);
  assert.equal(Object.keys(all).length, 20);
  assert.ok(!('t0' in all) && 't24' in all);
  assert.deepEqual(all.t24, { cx: 100, cy: 201, z: 0.833, t: 24 });
  assert.deepEqual(M.savedView(all.t24), { cx: 100, cy: 201, z: 0.833 });
  assert.equal(M.savedView(null), null);
  assert.equal(M.savedView({ cx: 1, cy: 2, z: 9 }), null);
  assert.equal(M.savedView({ cx: 'a', cy: 2, z: 1 }), null);
  // 같은 트리를 다시 쓰면 한 개로 남는다.
  all = M.rememberView(all, 't24', { cx: 5, cy: 6, z: 1 }, 99);
  assert.equal(Object.keys(all).length, 20);
  assert.deepEqual(M.savedView(all.t24), { cx: 5, cy: 6, z: 1 });
  assert.equal(M.visibleCards({ z: 1, x: 0, y: 0 }, { x: 0, y: 0, w: 500, h: 500 }, chain(5)), 2);
});

test('#460 화면은 처음 자리·전체 보기·기억을 이 계산으로 하고, 휴대폰(700 미만)은 그대로 둔다', () => {
  const DETAIL = fs.readFileSync(new URL('../public/v41/views/board/board-detail.js', import.meta.url), 'utf8');
  assert.match(BOARD, /LT58Model\.startView\(/);
  assert.match(BOARD, /LT58Model\.contentBox\(/);
  assert.match(BOARD, /LT58Model\.rememberView\(/);
  assert.match(BOARD, /function boardStartView\(\)\{if\(innerWidth<700\)\{fitAll\(false\);viewMode='start';return\}/);
  // #490: 숨은 프레임(폭 0)에서 한 맞춤은 '전체 보기'가 아니다 — 드러난 뒤 resize가 처음 자리(또는 기억한 자리)를 다시 계산한다.
  assert.ok(BOARD.includes("function boardResize(){if(innerWidth<700||cinema)return;if(moments.some(m=>!m.savedPos))placeAll();if(viewMode==='fit')fitAll(false);else boardStartView()}"), "boardResize: 저장 자리 없는 카드 재꽂기 포함")
  assert.match(DETAIL, /boardStartView\(\);applyPathHighlight\(\)/);
  assert.match(EXTRAS, /setTimeout\(boardStartView,40\)/);
  assert.match(EXTRAS, /addEventListener\('resize',boardResize\)/);
  // 저장소는 try로 감싼다(사생활 창·차단에서도 화면은 뜬다).
  assert.match(BOARD, /function readBoardView\(\)\{[^\n]*try\{/);
  assert.match(BOARD, /function writeBoardView\(v\)\{[^\n]*try\{/);
  // 확대 단추는 화면 가운데 기준.
  assert.match(BOARD, /\$\('#plusBtn'\)\.onclick=\(\)=>zoomAtCenter\(/);
});

test('#460 판 크기: 순간이 기본 무대 아래까지 놓이면 판을 늘려 카드가 판 밖에 떨어지지 않는다', () => {
  assert.deepEqual(M.boardSize([]), { w: 2400, h: 2200 });
  assert.deepEqual(M.boardSize(grid(15)), { w: 2400, h: 2200 });
  // 예시 트리처럼 아래로 길게 펼쳐진 경우(세로 5610까지)
  assert.deepEqual(M.boardSize([{ x: 150, y: 5610, w: 242, h: 300 }, { x: 1950, y: 360, w: 242, h: 300 }]), { w: 2400, h: 6100 });
  const cards = [...grid(7), { id: 'far', x: 150, y: 5610, w: 242, h: 300 }];
  const world = M.boardSize(cards);
  const v = M.startView({ viewport: VP1440, safe: SAFE1440, cards, world, focusId: 'm0' });
  assert.ok(2 * 48 + 0 <= world.h && (world.h - 48) * v.z + v.y >= VP1440.h, '판이 아래까지 채운다');
});

test('#460 상세 창이 열릴 때 초점은 옮기되 화면(.app)은 굴리지 않는다', () => {
  const a11y = fs.readFileSync(new URL('../public/v41/view-a11y.mjs', import.meta.url), 'utf8');
  assert.match(a11y, /\(focusables\(el\)\[0\] \|\| el\)\.focus\?\.\(\{ preventScroll: true \}\)/);
  // 닫힐 때의 초점 복귀(연 곳 또는 고른 순간 카드)도 화면을 굴리지 않는다.
  assert.match(a11y, /target\.focus\?\.\(\{ preventScroll: true \}\)/);
});
