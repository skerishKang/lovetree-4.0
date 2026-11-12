// #481 T6: 설정 배선(날짜 표기·제목 보기·페이지 넘김)을 **실행**으로 고정한다.
// 예전 시험(tests/v41-screen-defaults.test.mjs:39-75)은 minified 수식 문자열을 매칭하는 데 그쳐,
// "메시지가 실제로 발사되는가 / 받는 쪽이 실제로 어떻게 하는가"를 돌려 보지 않았다.
// 2026-11-12 첫 화면 무한 새로고침 사고가 바로 그 틈에서 났다(#476/#477).
// 여기서는 셸이 쓰는 바로 그 함수(public/v41/frame-wiring.mjs)를 돌려 보내는 시점과 받는 쪽 동작을 함께 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FRAME_MESSAGE_TYPES, frameMessage, frameReadyMessages, shouldReloadOnFrameMessage, runFrameFlow
} from '../public/v41/frame-wiring.mjs';

test('보내는 값: 정규화되고, 모르는 값은 기본으로 떨어진다(셸·화면이 같은 기본을 쓴다)', () => {
  assert.deepEqual(frameMessage('dateStyle', 'dash'), { type: 'lt41-date-style', value: 'dash' });
  assert.deepEqual(frameMessage('dateStyle', '엉뚱한값'), { type: 'lt41-date-style', value: 'dot' }, '모르는 날짜 표기는 점 표기');
  assert.deepEqual(frameMessage('titleDisplay', 'video'), { type: 'lt41-title-display', value: 'video' });
  assert.deepEqual(frameMessage('titleDisplay', undefined), { type: 'lt41-title-display', value: 'both' }, '모르는 제목 보기는 둘 다');
  assert.deepEqual(frameMessage('pageTurn', true), { type: 'lt41-page-turn', value: 'true' });
  assert.deepEqual(frameMessage('pageTurn', false), { type: 'lt41-page-turn', value: 'false' });
  assert.throws(() => frameMessage('없는종류', 1));
});

test('보내는 시점: 프레임이 뜰 때 페이지 넘김 1 + 날짜 표기 1, 1.6초 뒤 날짜 표기 1 (그 외 없음)', () => {
  const ready = frameReadyMessages({ dateStyle: 'dash', pageTurn: true });
  // 뜰 때: 페이지 넘김 → 날짜 표기 순서 그대로.
  assert.deepEqual(ready.first.map((m) => m.type), [FRAME_MESSAGE_TYPES.pageTurn, FRAME_MESSAGE_TYPES.dateStyle]);
  assert.deepEqual(ready.first.map((m) => m.value), ['true', 'dash']);
  // 1.6초 뒤: 날짜 표기 한 번(같은 값).
  assert.deepEqual(ready.repeats.map((m) => m.type), [FRAME_MESSAGE_TYPES.dateStyle]);
  assert.deepEqual(ready.repeats.map((m) => m.value), ['dash']);
  // 제목 보기는 '뜰 때마다' 보내지 않는다 — 설정에서 바꿀 때만(setTitleDisplay → postTitleDisplay).
  const everyType = [...ready.first, ...ready.repeats].map((m) => m.type);
  assert.ok(!everyType.includes(FRAME_MESSAGE_TYPES.titleDisplay), 'lt41-title-display는 프레임이 뜰 때 오지 않는다');
});

test('받는 쪽: 다시 띄우기가 필요한 화면은 첫 화면·책장뿐이고, 그마저 값이 바뀔 때만이다', () => {
  const ds = frameMessage('dateStyle', 'dash');
  const td = frameMessage('titleDisplay', 'mine');
  // 날짜 표기: 첫 화면만 다시 띄운다(값이 바뀌고 미러가 그 값일 때). 책·보드·지도는 열린 채로 그린다.
  assert.equal(shouldReloadOnFrameMessage('home', ds, { rendered: 'dot', mirror: 'dash' }), true);
  assert.equal(shouldReloadOnFrameMessage('home', ds, { rendered: 'dash', mirror: 'dash' }), false, '같은 값이면 안 뜬다');
  for (const screen of ['book', 'board', 'network', 'shelf']) {
    assert.equal(shouldReloadOnFrameMessage(screen, ds, { rendered: 'dot', mirror: 'dash' }), false, `${screen}: 날짜 표기로 다시 띄우지 않는다`);
  }
  // 제목 보기: 첫 화면·책장이 값이 바뀔 때만. 책·보드는 열린 채로 그린다.
  assert.equal(shouldReloadOnFrameMessage('home', td, { rendered: 'both', mirror: 'mine' }), true);
  assert.equal(shouldReloadOnFrameMessage('shelf', td, { rendered: 'both', mirror: 'mine' }), true);
  assert.equal(shouldReloadOnFrameMessage('shelf', td, { rendered: 'mine', mirror: 'mine' }), false, '같은 값이면 안 뜬다');
  for (const screen of ['book', 'board', 'network']) {
    assert.equal(shouldReloadOnFrameMessage(screen, td, { rendered: 'both', mirror: 'mine' }), false, `${screen}: 제목 보기로 다시 띄우지 않는다`);
  }
  // 페이지 넘김은 어느 화면에서도 다시 띄우지 않는다.
  for (const screen of ['home', 'shelf', 'book', 'board', 'network']) {
    assert.equal(shouldReloadOnFrameMessage(screen, frameMessage('pageTurn', true), { rendered: 'dot', mirror: 'dot' }), false);
  }
});

test('흐름: 셸이 뜰 때마다 같은 값을 보내도 첫 화면은 한 번 뜨고 끝난다(사고 재현)', () => {
  // 실제 셸 onFrameReady가 쓰는 바로 그 목록으로 매 뜸마다 보낸다.
  const messagesFor = () => frameReadyMessages({ dateStyle: 'dot', pageTurn: false });
  const result = runFrameFlow({ screen: 'home', messagesFor, renderedAtBoot: 'dot', mirrorAt: () => 'dot' });
  assert.equal(result.loads, 1, '같은 값이 계속 와도 다시 뜨지 않는다');
  // 20번 뜨는 상황을 강제로 돌려도(상한) 다시 뜸이 늘지 않는다 — 상한까지 가는 것은 '무조건 다시 띄우는' 판정뿐이다.
  const forced = runFrameFlow({ screen: 'home', messagesFor, renderedAtBoot: 'dot', mirrorAt: () => 'dot', maxLoads: 20 });
  assert.equal(forced.loads, 1);
});

test('흐름: 값이 실제로 바뀌면 첫 화면·책장이 한 번만 더 뜬다', () => {
  // 첫 뜸은 점 표기로 그려졌는데 계정 값이 줄표다 → 한 번 다시 뜨고, 그 뒤로는 같은 값이라 멈춘다.
  const bump = runFrameFlow({
    screen: 'home',
    messagesFor: () => frameReadyMessages({ dateStyle: 'dash', pageTurn: false }),
    renderedAtBoot: 'dot',
    mirrorAt: () => 'dash'
  });
  assert.equal(bump.loads, 2, '한 번 더 뜨고 멈춘다');
  assert.equal(bump.rendered, 'dash', '다시 뜬 문서는 새 값으로 그려진다');
});

test('흐름: 미러를 못 읽으면(저장소 차단) 다시 띄우지 않는다 — 끝없이 도는 것보다 낫다', () => {
  const result = runFrameFlow({
    screen: 'home',
    messagesFor: () => frameReadyMessages({ dateStyle: 'long', pageTurn: false }),
    renderedAtBoot: 'dot',
    mirrorAt: () => null
  });
  assert.equal(result.loads, 1, '미러가 없으면 그린 채로 둔다');
});

test('흐름 대조: 예전 판정(받으면 무조건 다시 띄우기)이면 같은 흐름에서 끝없이 돈다', () => {
  // 세기 증명 — 이 시험이 '아무것도 세지 않는 시험'이 아님을 보인다.
  const messagesFor = () => frameReadyMessages({ dateStyle: 'dot', pageTurn: false });
  const always = (screen, message) => message?.type === FRAME_MESSAGE_TYPES.dateStyle;
  let loads = 0;
  const maxLoads = 12;
  // runFrameFlow의 판정만 바꾼 사본(같은 메시지 목록·같은 미러).
  let rendered = 'dot';
  while (loads < maxLoads) {
    loads += 1;
    const { first, repeats } = messagesFor(loads);
    let reloaded = false;
    for (const message of [...first, ...repeats]) {
      if (always('home', message, { rendered, mirror: 'dot' })) { reloaded = true; break; }
    }
    if (!reloaded) break;
  }
  assert.equal(loads, maxLoads, '무조건 판정은 상한까지 돈다(사고 그대로)');
});

test('배선 계약: 셸이 이 모듈의 함수로 값을 만들고, 메시지 타입을 따로 적지 않는다', async () => {
  const { readFileSync } = await import('node:fs');
  const shell = readFileSync(new URL('../public/v41/shell.mjs', import.meta.url), 'utf8');
  assert.match(shell, /import \{frameMessage, frameReadyMessages, FRAME_MESSAGE_TYPES\} from '\.\/frame-wiring\.mjs';/);
  assert.match(shell, /const ready=frameReadyMessages\(\{dateStyle:currentDateStyle\(\),pageTurn:currentPageTurn\(\)==='on'\}\);/);
  assert.match(shell, /const message=frameMessage\('dateStyle',currentDateStyle\(\)\);/);
  assert.match(shell, /postMessage\(frameMessage\('titleDisplay',titleDisplayValue\(\)\),location\.origin\)/);
  // 셸이 메시지 타입 문자열을 직접 적지 않는다(한 곳에서만 정한다).
  assert.doesNotMatch(shell, /type:'lt41-date-style',value:/, '날짜 표기 메시지를 직접 만들지 않는다');
  assert.doesNotMatch(shell, /type:'lt41-title-display',value:/, '제목 보기 메시지를 직접 만들지 않는다');
});
