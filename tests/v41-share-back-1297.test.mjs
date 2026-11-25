// #1297 뒤로 가기 — 공유 화면(방문자). 누름 → 뒤로 가기 → 바로 전 상태를 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocation } from '../public/v41/shell/location.mjs';
import { fakeBrowser } from './helpers/fake-dom.mjs';
import { records, assertRecord } from './helpers/back-navigation.mjs';

const SHARE = 'share-1297-00000000000000000001';

function harness({ hash = `#share/${SHARE}/book`, view = 'track59-sketchbook.html' } = {}) {
  const browser = fakeBrowser({ hash });
  globalThis.window = globalThis;
  let screen = view;
  const calls = { push: [], replace: [], publicRoute: [], show: [], leave: 0, handled: [] };
  const api = createLocation({
    $: () => null,
    getCurrent: () => screen,
    setCurrent: next => { screen = next; },
    getMember: () => ({ snapshot: () => ({ owned: false }) }),
    getSource: () => 'share',
    getActiveShareId: () => SHARE,
    setHandled: value => calls.handled.push(value),
    getHandled: () => calls.handled.at(-1),
    show: (...args) => calls.show.push(args),
    choose: () => {},
    notify: () => {},
    startMember: () => {},
    showPublicRoute: route => calls.publicRoute.push(route),
    leaveShare: () => { calls.leave += 1; },
    requestNetworkOpen: () => {},
    requestBoardOpen: () => {},
    journey: { saved: () => false },
    gotoJourneyStep: () => {},
    openFirstJourney: () => {},
    finishJourney: () => {},
    leaveJourney: () => {},
    getModel: () => ({ trees: [] })
  });
  return { browser, api, calls, setView: next => { screen = next; }, restore: () => browser.restore() };
}

test('#1297 공유 화면 동작 표 — 화면 이동·창·순간·크게 보기는 기록하고 단순 전환은 넣지 않는다', () => {
  for (const kind of ['screen', 'panel', 'moment', 'viewer']) assert.equal(records(kind), true, kind);
  for (const kind of ['theme', 'sort', 'viewOption', 'hint']) assert.equal(records(kind), false, kind);
  assert.equal(records('unknown'), false, '모르는 동작은 넣지 않는다');
  const stack = { before: 2, after: 3 };
  assert.equal(assertRecord(stack, 'screen', 2, 3), true);
  assert.equal(assertRecord(stack, 'theme', 2, 2), true);
  assert.equal(assertRecord(stack, 'theme', 2, 3), false, '단순 전환이 기록을 늘리면 어긋남');
});

test('#1297 공유 화면에서 책→보드 이동은 기록을 하나 늘리고, 뒤로 가면 책으로 돌아온다', () => {
  const h = harness();
  try {
    h.setView('track58-pinboard.html');
    h.api.writeLocation();
    assert.deepEqual(h.browser.calls.push.map(c => c.url), [`#share/${SHARE}/board`]);
    assert.equal(h.browser.calls.replace.length, 0);
    const beforeBack = h.calls.publicRoute.length;
    h.browser.setHash(`#share/${SHARE}/book`);
    h.browser.popstate();
    assert.equal(h.calls.publicRoute.length, beforeBack + 1, '뒤로 가면 바로 전 공유 화면을 다시 연다');
    assert.deepEqual(h.calls.publicRoute.at(-1), { scope: 'public', shareId: SHARE, view: 'book', explicit: true });
  } finally { h.restore(); }
});

test('#1297 공유 주소 직접 열기는 기록을 늘리지 않는다(되돌아갈 화면이 없음)', () => {
  const h = harness();
  try {
    h.api.writeLocation('replace');
    assert.equal(h.browser.calls.push.length, 0, '주소가 이미 같으면 새 기록을 만들지 않는다');
    assert.equal(h.browser.calls.replace.length, 0, '같은 주소는 바꾸지도 않는다');
  } finally { h.restore(); }
});

test('#1297 공유 밖 주소로 뒤로 가면 남은 공유 상태를 치운다', () => {
  const h = harness();
  try {
    h.browser.setHash('#home');
    h.browser.popstate();
    assert.equal(callsLeave(h), 1);
  } finally { h.restore(); }
});

function callsLeave(h) { return h.calls.leave; }
