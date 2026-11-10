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
  assert.deepEqual(Object.keys(M).sort(), ['cardPosition', 'cinemaBeats', 'collectPath', 'cursorEffectAllowed', 'cursorHover', 'cursorMode', 'cursorScale', 'decorationMotion', 'detailButtonState', 'editGuard', 'escapeHTML', 'filterVisible', 'fitZoom', 'maxCreatedOrder', 'nextConnections', 'removeConnection', 'threadPath', 'threadRedrawStep']);
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

test('15. 실 다시 그리기 판정(#346): 예약 중복·숨김·시네마는 건너뛰고, 그 외에만 한 프레임 그린다', () => {
  assert.equal(M.threadRedrawStep({}), 'draw');
  assert.equal(M.threadRedrawStep({ pending: true }), 'queued', '이미 한 프레임 예약됨');
  assert.equal(M.threadRedrawStep({ hidden: true }), 'skip', '안 보이면 정지');
  assert.equal(M.threadRedrawStep({ cinema: true }), 'skip', '시네마가 자기 갱신을 맡는다');
  assert.equal(M.threadRedrawStep({ pending: true, hidden: true, cinema: true }), 'queued', '예약 판정이 먼저다');
  assert.equal(M.threadRedrawStep({ hidden: false, cinema: false, pending: false }), 'draw');
  assert.equal(M.threadRedrawStep(), 'draw', '입력 없음 = 그린다(기본값)');
});

test('16. 상시 루프·무한 글로우 애니메이션이 남아 있지 않다(#346 강도 가드)', () => {
  const CSS = fs.readFileSync(new URL('../public/v41/views/board/board.css', import.meta.url), 'utf8');
  assert.ok(!EXTRAS.includes('livingThreadLoop'), '상시 rAF 루프 이름이 남아 있으면 실패');
  assert.ok(!/requestAnimationFrame\(livingThreadLoop\)/.test(EXTRAS), '자기 자신을 다시 거는 루프가 없어야 한다');
  assert.ok(EXTRAS.includes('LT58Model.threadRedrawStep'), '예약 판정은 계산 한 벌을 부른다');
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

test('19. 커서 동작: 끔 조건·움직임 줄임·반응 대상·크기 배율', () => {
  // 끔 조건
  assert.equal(M.cursorMode({ pointerType: 'touch' }), 'off');
  assert.equal(M.cursorMode({ coarse: true }), 'off');
  assert.equal(M.cursorMode({ cinema: true }), 'off');
  assert.equal(M.cursorMode({ reducedMotion: true }), 'position');
  assert.equal(M.cursorMode({}), 'full');
  // 반응 대상: 입력 위 숨김, 카드·핀·실·버튼 위 반응
  assert.equal(M.cursorHover({ text: true }), 'hidden');
  assert.equal(M.cursorHover({ text: true, card: true }), 'hidden');
  assert.equal(M.cursorHover({ card: true }), 'interactive');
  assert.equal(M.cursorHover({ pin: true }), 'interactive');
  assert.equal(M.cursorHover({ thread: true }), 'interactive');
  assert.equal(M.cursorHover({ button: true }), 'interactive');
  assert.equal(M.cursorHover({}), 'default');
  // 크기 배율: 끔 0, 드래그 작은 점, 누름 0.8, 반응 1.6, 기본 1
  assert.equal(M.cursorScale({ mode: 'off' }), 0);
  assert.equal(M.cursorScale({ dragging: true }), 0.3);
  assert.equal(M.cursorScale({ down: true }), 0.8);
  assert.equal(M.cursorScale({ hover: 'interactive' }), 1.6);
  assert.equal(M.cursorScale({}), 1);
  assert.equal(M.cursorScale({ hover: 'interactive', down: true }), 0.8, '누름이 반응 확대보다 우선');
});

test('20. 커서 동작 세기 증명: 끔·숨김·축소를 풀어 버리면 답이 달라진다', () => {
  const mode = (o) => M.cursorMode(o);
  const hover = (o) => M.cursorHover(o);
  const scale = (o) => M.cursorScale(o);
  assert.notEqual(mode({ pointerType: 'touch' }), mode({ pointerType: 'mouse' }));
  assert.notEqual(mode({ cinema: true }), mode({ cinema: false }));
  assert.notEqual(mode({ reducedMotion: true }), mode({ reducedMotion: false }));
  assert.notEqual(hover({ text: true }), hover({ text: false }));
  assert.notEqual(hover({ button: true }), hover({ button: false }));
  assert.notEqual(scale({ down: true }), scale({ down: false }));
  assert.notEqual(scale({ dragging: true }), scale({ dragging: false }));
  assert.notEqual(scale({ hover: 'interactive' }), scale({ hover: 'default' }));
  assert.notEqual(scale({ mode: 'off' }), scale({ mode: 'full' }));
});

test('21. 클릭 효과 한도: 동시에 켜진 묶음이 넘으면 새 묶음을 막는다', () => {
  assert.equal(M.cursorEffectAllowed(0, 3), true);
  assert.equal(M.cursorEffectAllowed(2, 3), true);
  assert.equal(M.cursorEffectAllowed(3, 3), false);
  assert.equal(M.cursorEffectAllowed(4, 3), false);
  assert.equal(M.cursorEffectAllowed(0, 1), true);
  assert.equal(M.cursorEffectAllowed(1, 1), false);
});

test('22. 클릭 효과 한도 세기 증명: 한도를 풀면 넘치는 묶음도 허용해 버린다', () => {
  assert.notEqual(M.cursorEffectAllowed(3, 3), M.cursorEffectAllowed(3, 4));
  assert.equal(M.cursorEffectAllowed(3, 4), true);
  assert.equal(M.cursorEffectAllowed(3, 3), false);
});

test('23. 커서 화면 배선: 위치는 translate3d·프레임당 1회, 크기는 transform으로만, 끌기는 작은 점', () => {
  const CSS = fs.readFileSync(new URL('../public/v41/views/board/board.css', import.meta.url), 'utf8');
  const ring = CSS.match(/\.cursorRing\{([^}]*)\}/)?.[1] || '';
  assert.ok(ring, '.cursorRing 규칙이 있어야 한다');
  assert.match(ring, /translate3d\(-100px,-100px,0\)/, '위치는 transform으로만 옮긴다(레이아웃 값 left/top 없음)');
  assert.match(ring, /scale\(var\(--cursor-scale/, '크기는 transform 배율로만 바꾼다');
  assert.doesNotMatch(ring, /transition:[^;}]*width/, 'width/height 전환을 두지 않는다');
  assert.match(CSS, /\.cursorRing\.drag-dot\{width:44px;height:44px;/, '끌기 점 크기는 transform 배율과 함께 44px 기준');
  assert.match(CSS, /@media \(pointer:coarse\)\{\.cursorRing,\.cursorFX\{display:none!important\}\}/, '거친 포인터에서는 숨긴다');
  assert.match(CSS, /@keyframes cursorRipple[\s\S]*?@keyframes cursorDrop/, '물결·물방울 효과가 있다');
  assert.match(EXTRAS, /translate3d\(\$\{cursorState\.x\}px,\$\{cursorState\.y\}px,0\)/, '화면이 translate3d로 위치를 쓴다');
  assert.match(EXTRAS, /if\(!cursorState\.raf\)cursorState\.raf=requestAnimationFrame\(cursorApply\)/, '프레임당 1회만 예약한다');
  assert.match(EXTRAS, /document\.elementFromPoint\(cursorState\.x,cursorState\.y\)/, 'elementFromPoint는 프레임당 1회');
  assert.doesNotMatch(EXTRAS, /ring\.style\.left=/, 'left로 위치를 쓰지 않는다');
  assert.match(EXTRAS, /LT58Model\.cursorMode\(/, '끔 조건은 계산 한 벌을 쓴다');
  assert.match(EXTRAS, /LT58Model\.cursorHover\(/, '반응 대상은 계산 한 벌을 쓴다');
  assert.match(EXTRAS, /LT58Model\.cursorScale\(/, '배율은 계산 한 벌을 쓴다');
  assert.match(EXTRAS, /LT58Model\.cursorEffectAllowed\(/, '효과 한도는 계산 한 벌을 쓴다');
});
