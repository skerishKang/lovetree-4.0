// #481 T6: 설정 배선(날짜 표기·제목 보기·페이지 넘김)을 **실행**으로 고정한다.
// 예전 시험(tests/v41-screen-defaults.test.mjs:39-75)은 minified 수식 문자열을 매칭하는 데 그쳐,
// "메시지가 실제로 발사되는가 / 받는 쪽이 실제로 어떻게 하는가"를 돌려 보지 않았다.
// 2026-11-12 첫 화면 무한 새로고침 사고가 바로 그 틈에서 났다(#476/#477).
// 여기서는 셸이 쓰는 바로 그 함수(public/v41/frame-wiring.mjs)를 돌려 보내는 시점과 받는 쪽 동작을 함께 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MSG, FRAME_MESSAGES } from '../public/v41/frame-messages.mjs';
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

// '배선 계약: 셸이 이 모듈의 함수로 값을 만들고, 메시지 타입을 따로 적지 않는다' 글자 검사는 지웠다(이슈 952).
// 이 모듈이 지키는 실제 계약 — 다시 띄우기 판정·보내는 시점·흐름 — 은 위 실행 시험들이 확인하고,
// 셸 연결 글자는 #477 사고의 방어(shouldReloadOnFrameMessage 판정)를 대신하지 못하는 문자열 고정이었다.

test('#1061 메시지 검사기는 보내는 값과 실제 수신 분기를 구별한다', async () => {
  const { messageUsage } = await import('./helpers/frame-message-usage.mjs');
  const usage = messageUsage(`
    // type: 'lt41-comment'
    card.classList.add('lt41-write');
    localStorage.getItem('lt41-write');
    const duplicateTable = { open: \`lt41-viewer\` };
    parent.postMessage({ type: 'lt41-unlisted-send' }, location.origin);
    send('lt41-unlisted-helper');
    function tellParent(type) { parent.postMessage({ type }); }
    tellParent('lt41-unlisted-wrapper');
    const name = 'lt41-unlisted-alias';
    postMessage({ type: name });
    postMessage({ type: \`lt41-unlisted-template\` });
    postMessage({ type: MSG.onlySent });
    function readSelection(event) {
      const type = event.data.type;
      switch (type) { case 'lt41-unlisted-case': break; case MSG.selected: break; }
      if (type === 'lt41-unlisted-receive' || MSG.changed === type) return;
      if (event.data.type === 'unknown-message' || event.data.item.type === 'picture') return;
    }
    addEventListener('message', readSelection);
  `, new Set(['lt41-write', 'lt41-viewer']));
  assert.deepEqual([...usage.literals].sort(), [
    'lt41-unlisted-alias', 'lt41-unlisted-case', 'lt41-unlisted-helper', 'lt41-unlisted-receive', 'lt41-unlisted-send',
    'lt41-unlisted-template', 'lt41-unlisted-wrapper', 'unknown-message'
  ]);
  assert.deepEqual([...usage.received].sort(), ['changed', 'selected']);
  assert.ok(usage.keys.has('onlySent'), '보내기만 한 이름은 수신처로 세지 않는다');
  assert.deepEqual([...usage.definitions], ['lt41-viewer'], '별도 표에 옮긴 이름을 잡고 화면용 글자와 저장 키는 건너뛴다');
});

test('#1061 셸과 화면은 한 표의 이름을 쓰고 이름마다 받는 곳이 있다', async () => {
  const { messageUsage } = await import('./helpers/frame-message-usage.mjs');
  const { readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const tableNames = new Set(Object.values(MSG));
  const files = ['reference/prototypes/graph-view.html'];
  for (const dir of ['public/v41', 'v41', 'src']) {
    for (const file of readdirSync(join(root, dir), { recursive: true })) {
      if (/\.(?:m?js|html)$/.test(file)) files.push(join(dir, file));
    }
  }
  const receivers = new Set();
  for (const file of files) {
    if (file === join('public/v41', 'frame-messages.js')) continue;
    const source = readFileSync(join(root, file), 'utf8');
    const scripts = file.endsWith('.html')
      ? [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
        .filter(([, attrs]) => !/\bsrc\s*=|\btype\s*=\s*["'](?:application\/json|importmap)/i.test(attrs))
        .map(match => match[2])
      : [source];
    for (const code of scripts) {
      const usage = messageUsage(code, tableNames);
      assert.deepEqual([...usage.literals], [], file + '에서 메시지 이름을 직접 썼다');
      assert.deepEqual([...usage.definitions], [], file + '에서 표의 이름을 다시 정의했다');
      for (const key of usage.keys) assert.ok(Object.hasOwn(MSG, key), file + '에 표 밖 이름이 있다 ' + key);
      if (!file.startsWith('reference/')) for (const key of usage.received) receivers.add(key);
    }
  }
  assert.equal(MSG, globalThis.LT41_MSG, '일반 스크립트와 모듈이 같은 표를 쓴다');
  assert.equal(new Set(Object.values(MSG)).size, Object.keys(MSG).length, '전송하는 이름이 겹치지 않는다');
  for (const [key, spec] of Object.entries(FRAME_MESSAGES)) {
    assert.equal(MSG[key], spec.name);
    assert.ok(spec.from && spec.to && spec.payload, spec.name + '의 방향과 본문이 있다');
  }
  assert.deepEqual(Object.keys(MSG).filter(key => !receivers.has(key)), [], '이름은 있지만 받는 곳이 없다');
  assert.equal(MSG.dateStyle, 'lt41-date-style');
  assert.equal(MSG.pageTurn, 'lt41-page-turn');
  assert.equal(MSG.write, 'lt41-write');
});
