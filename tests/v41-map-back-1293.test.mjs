// #1293 지도의 뒤로 가기 — 보기 옵션은 넣지 않고 화면 이동만 기록한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocation } from '../public/v41/shell/location.mjs';
import { fakeBrowser } from './helpers/fake-dom.mjs';
import { records, createHistoryStack, assertRecord } from './helpers/back-navigation.mjs';

test('#1293 지도 동작 표 — 화면 이동·상세·크게 보기는 기록하고 보기 옵션은 넣지 않는다', () => {
  assert.equal(records('screen'), true);
  assert.equal(records('moment'), true, '순간 상세 열기');
  assert.equal(records('viewer'), true, '크게 보기');
  for (const kind of ['theme', 'sort', 'viewOption']) assert.equal(records(kind), false, `${kind}는 단순 전환`);
});

test('#1293 보기 옵션(이어진 길·묶음·시간 순)은 기록을 늘리지 않는다', () => {
  const stack = createHistoryStack({ hash: '#network' });
  const before = stack.history.length;
  // 보기 옵션은 화면을 바꾸지 않고 같은 주소에 머문다.
  const viewOption = () => stack.history.replaceState(null, '', stack.location.hash);
  viewOption();
  assert.equal(assertRecord(stack, 'viewOption', before, stack.history.length), true);
  assert.equal(stack.history.length, before);
});

test('#1293 지도 → 책 화면 이동은 기록을 늘리고, 뒤로 가면 지도로 돌아온다', () => {
  const browser = fakeBrowser({ hash: '#network' });
  globalThis.window = globalThis;
  let screen = 'track56-network.html';
  const calls = { publicRoute: [], show: [], handled: [] };
  const api = createLocation({
    $: () => null,
    getCurrent: () => screen,
    setCurrent: next => { screen = next; },
    getMember: () => ({ snapshot: () => ({ owned: false }) }),
    getSource: () => 'example',
    getActiveShareId: () => null,
    setHandled: value => calls.handled.push(value),
    getHandled: () => calls.handled.at(-1),
    show: (...args) => calls.show.push(args),
    choose: () => {}, notify: () => {}, startMember: () => {},
    showPublicRoute: route => calls.publicRoute.push(route),
    leaveShare: () => {},
    requestNetworkOpen: () => {}, requestBoardOpen: () => {},
    journey: { saved: () => false },
    gotoJourneyStep: () => {}, openFirstJourney: () => {}, finishJourney: () => {}, leaveJourney: () => {},
    getModel: () => ({ trees: [] })
  });
  try {
    screen = 'track59-sketchbook.html';
    api.writeLocation();
    assert.deepEqual(browser.calls.push.map(c => c.url), ['#book']);
    browser.setHash('#network');
    browser.popstate();
    assert.equal(screen, 'track56-network.html', '뒤로 가면 지도 화면으로 돌아온다');
  } finally { browser.restore(); }
});
