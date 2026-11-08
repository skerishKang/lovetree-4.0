// 셸의 첫 여정 연결 시험 (#231 1-B③-3 후속, 2026-11-09).
// 전: shell/journey.mjs 소스를 정규식으로 보던 시험(v41-first-journey 마지막 시험).
// 후: createJourney를 가짜 DOM·history·location으로 띄우고 함수를 직접 불러 결과를 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createJourney } from '../public/v41/shell/journey.mjs';
import { fakeEl } from './helpers/fake-dom.mjs';

const SCREENS = [
  ['첫 화면', 'src064-orbit.html'],
  ['내 책장', 'track32-bookshelf.html'],
  ['기억책', 'track59-sketchbook.html']
];

const DRAFT = {
  subject: '그날의 무대',
  url: 'https://www.youtube.com/watch?v=nqofkzQD19E',
  note: '우연히 보게 됐는데 하루 종일 생각났어.',
  emotion: '위로',
  date: '2026-11-07',
  reason: '다시 봐도 그 표정이 오래 남아서',
  nextUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  nextReason: '댓글을 따라 찾아봤어요',
  step: 4
};

function harness({
  owned = true, writable = true, source = 'server', current = 'src064-orbit.html',
  hash = '#home', depth = 0, trees = [{ id: 'tree-1', moments: [{ id: 'moment-1' }] }]
} = {}) {
  const calls = {
    postMessage: [], replace: [], historyPush: [], historyReplace: [], go: [],
    login: [], notify: [], panel: [], show: [], choose: [], writeLocation: [], handled: [], flow: 0, applied: []
  };
  const els = {
    view: fakeEl({
      contentWindow: {
        postMessage: (msg) => calls.postMessage.push(msg),
        location: { replace: (url) => calls.replace.push(url) }
      }
    }),
    empty: fakeEl(),
    'community-panel': fakeEl({ open: false, close() { this.open = false; } })
  };
  const saved = {
    document: globalThis.document, history: globalThis.history,
    location: globalThis.location, window: globalThis.window
  };
  globalThis.window = globalThis;
  const state = { lt41Journey: depth };
  globalThis.location = { origin: 'https://lovetree-4-0.pages.dev', hash };
  globalThis.history = {
    get state() { return state.lt41Journey ? { lt41Journey: state.lt41Journey } : null; },
    pushState(next, _t, url) { calls.historyPush.push(url); state.lt41Journey = next?.lt41Journey ?? 0; globalThis.location.hash = url; },
    replaceState(next, _t, url) { calls.historyReplace.push(url); state.lt41Journey = next?.lt41Journey ?? 0; globalThis.location.hash = url; },
    go(n) { calls.go.push(n); }
  };
  globalThis.document = { body: { classList: { remove: () => {} } }, querySelectorAll: () => [] };

  const member = {
    snapshot: () => ({ owned, writable, subject: 's1' }),
    state: () => ({ trees }),
    apply: (mode, payload, ids) => {
      calls.applied.push({ mode, payload, ids });
      return { treeId: 'tree-1', momentId: mode === 'new' ? 'moment-1' : 'moment-2' };
    }
  };
  let screen = current;

  const journey = createJourney({
    $: (id) => els[id] ?? null,
    getCurrent: () => screen,
    setCurrent: (next) => { screen = next; },
    getMember: () => member,
    getSource: () => source,
    notify: (msg) => calls.notify.push(msg),
    panel: (name) => calls.panel.push(name),
    show: (next) => { calls.show.push([next]); if (typeof next === 'string') screen = next; },
    screens: SCREENS,
    choose: (...args) => { calls.choose.push(args); },
    writeLocation: () => calls.writeLocation.push(1),
    openLoginStart: (kind) => calls.login.push(kind),
    flowNavigation: () => { calls.flow += 1; },
    setHandled: (value) => calls.handled.push(value)
  });

  const restore = () => {
    globalThis.document = saved.document;
    globalThis.history = saved.history;
    globalThis.location = saved.location;
    globalThis.window = saved.window;
  };
  return { journey, els, calls, restore, screen: () => screen };
}

test('새 트리 진입: 로그아웃이면 로그인으로, 편집 불가면 안내+기록 패널로 보낸다', () => {
  const out = harness({ owned: false });
  try {
    out.journey.openFirstJourney();
    assert.deepEqual(out.calls.login, ['new-tree']);
    assert.equal(out.calls.replace.length, 0, '여정 화면을 열지 않는다');
    assert.equal(out.screen(), 'src064-orbit.html');
  } finally { out.restore(); }

  const readOnly = harness({ owned: true, writable: false });
  try {
    readOnly.journey.openFirstJourney();
    assert.deepEqual(readOnly.calls.panel, ['records']);
    assert.equal(readOnly.calls.notify.length, 1);
    assert.match(readOnly.calls.notify[0], /편집 연결이 아직 준비되지 않았어요/);
  } finally { readOnly.restore(); }
});

test('새 트리 진입: 로그인·편집 가능이면 여정 화면을 열고 주소에 트리 이름을 붙인다', () => {
  const h = harness({ hash: '#home' });
  try {
    h.journey.openFirstJourney({ subject: '그날의 무대' });
    assert.equal(h.screen(), 'first-journey.html');
    assert.equal(h.calls.replace.length, 1);
    assert.equal(h.calls.replace[0], 'https://lovetree-4-0.pages.dev/v41/views/first-journey.html?subject=%EA%B7%B8%EB%82%A0%EC%9D%98+%EB%AC%B4%EB%8C%80');
    assert.equal(h.els.view.title, '러브트리 · 첫 여정');
    assert.equal(h.els.view.hidden, false);
    assert.equal(h.els.empty.hidden, true);
    assert.equal(h.calls.flow, 1, '헤더 탭을 여정 화면에 맞춘다');
    assert.deepEqual(h.calls.historyPush, ['#journey/00'], '첫 단계를 history에 남긴다');
    assert.deepEqual(h.calls.handled, ['#journey/00']);
  } finally { h.restore(); }

  const plain = harness();
  try {
    plain.journey.openFirstJourney();
    assert.equal(plain.calls.replace[0], 'https://lovetree-4-0.pages.dev/v41/views/first-journey.html', '이름이 없으면 물음표도 없다');
  } finally { plain.restore(); }
});

test('단계 이동·복귀: #journey/NN을 남기고, 뒤로가기는 그 기록만큼 되돌린다', () => {
  const h = harness({ current: 'first-journey.html', hash: '#journey/01' });
  try {
    h.journey.openFirstJourney({ step: 3, route: true });
    assert.equal(h.calls.replace[0].endsWith('?step=3'), true, '주소의 단계로 연다');
    assert.deepEqual(h.calls.historyReplace, ['#journey/03'], '들어올 때는 새 기록을 쌓지 않는다');

    h.journey.noteJourneyStep(2);
    assert.deepEqual(h.calls.historyPush.at(-1), '#journey/02');
    // 같은 단계로 다시 쓰지 않는다(주소가 이미 #journey/02면 history를 건드리지 않는다).
    const before = h.calls.historyPush.length + h.calls.historyReplace.length;
    h.journey.noteJourneyStep(2);
    h.journey.noteJourneyStep(2, { replace: true });
    assert.equal(h.calls.historyPush.length + h.calls.historyReplace.length, before, '같은 단계는 다시 쓰지 않는다');

    const back = harness({ current: 'first-journey.html', depth: 3 });
    try {
      back.journey.closeFirstJourney();
      assert.deepEqual(back.calls.go, [-3], '주소로 들어온 여정은 기록만큼 뒤로 간다');
      assert.equal(back.screen(), 'first-journey.html', '아직 화면을 닫지 않는다');
    } finally { back.restore(); }

    const normal = harness({ current: 'first-journey.html', hash: '#journey/02' });
    try {
      normal.journey.closeFirstJourney();
      assert.equal(normal.screen(), 'src064-orbit.html', '직접 연 여정은 첫 화면으로 닫는다');
      assert.deepEqual(normal.calls.historyReplace.at(-1), '#home');
    } finally { normal.restore(); }
  } finally { h.restore(); }
});

test('저장: 로그인·편집 가능·연결 상태에 따라 apply 인자와 응답이 달라진다', () => {
  const cases = [
    {
      name: '로그아웃',
      opts: { owned: false, source: 'example' },
      expect: { ok: false, message: /로그인한 뒤/ }
    },
    {
      name: '편집 불가',
      opts: { owned: true, writable: false, source: 'server' },
      expect: { ok: false, message: /편집 연결이 아직 준비되지 않았어요/ }
    }
  ];
  for (const c of cases) {
    const h = harness(c.opts);
    try {
      h.journey.saveFirstJourney(DRAFT);
      const reply = h.calls.postMessage.at(-1);
      assert.equal(reply.type, 'lt41-journey-result');
      assert.equal(reply.ok, c.expect.ok, c.name);
      assert.match(reply.message, c.expect.message, c.name);
      assert.equal(h.calls.applied.length, 0, '저장하지 않는다');
    } finally { h.restore(); }
  }

  const connected = harness({});
  try {
    connected.journey.saveFirstJourney(DRAFT);
    assert.deepEqual(connected.calls.applied.map((a) => a.mode), ['new', 'add'], '트리+첫 순간 뒤 이어진 순간');
    assert.deepEqual(connected.calls.applied[1].ids, { treeId: 'tree-1', momentId: 'moment-1' });
    const reply = connected.calls.postMessage.at(-1);
    assert.deepEqual(
      { ok: reply.ok, treeId: reply.treeId, firstMomentId: reply.firstMomentId, momentId: reply.momentId, connected: reply.connected },
      { ok: true, treeId: 'tree-1', firstMomentId: 'moment-1', momentId: 'moment-2', connected: true }
    );
  } finally { connected.restore(); }

  const single = harness({});
  try {
    single.journey.saveFirstJourney({ ...DRAFT, nextUrl: '', nextReason: '', skipped: true });
    assert.deepEqual(single.calls.applied.map((a) => a.mode), ['new'], '다음 링크가 없으면 첫 순간만');
    assert.equal(single.calls.postMessage.at(-1).connected, false);
  } finally { single.restore(); }

  const broken = harness({});
  try {
    broken.journey.saveFirstJourney({ ...DRAFT, url: 'ftp://example.com/a.png' });
    const reply = broken.calls.postMessage.at(-1);
    assert.equal(reply.ok, false);
    assert.match(reply.message, /http 또는 https/);
  } finally { broken.restore(); }
});

test('기억책 열기: 그 트리에 그 순간이 있을 때만 책장으로 넘어간다', () => {
  const ok = harness({ current: 'first-journey.html' });
  try {
    ok.journey.openJourneyBook({ treeId: 'tree-1', firstMomentId: 'moment-1' });
    assert.equal(ok.screen(), 'track59-sketchbook.html');
    assert.deepEqual(ok.calls.choose.at(-1), ['tree-1', 'moment-1']);
    assert.equal(ok.calls.show.length, 1);
    assert.equal(ok.calls.writeLocation.length, 1);
    assert.equal(ok.journey.saved(), true);
  } finally { ok.restore(); }

  const missing = harness({ current: 'first-journey.html' });
  try {
    missing.journey.openJourneyBook({ treeId: 'tree-1', firstMomentId: 'moment-9' });
    assert.equal(missing.screen(), 'first-journey.html', '없는 순간이면 그대로 둔다');
    assert.equal(missing.calls.choose.length, 0);
  } finally { missing.restore(); }
});

test('마치기·떠나기: 저장 뒤에는 첫 화면으로, 도중에 나가면 돌아올 화면으로', () => {
  const done = harness({ current: 'first-journey.html' });
  try {
    done.journey.finishJourney();
    assert.equal(done.calls.show.at(-1)[0], 'src064-orbit.html');
    assert.deepEqual(done.calls.historyReplace.at(-1), '#home');
    assert.equal(done.journey.saved(), false, '완료하면 저장 표시를 지운다');
  } finally { done.restore(); }

  const fromShelf = harness({ current: 'first-journey.html' });
  try {
    fromShelf.journey.openFirstJourney();          // 내 책장에서 열면 돌아올 곳이 책장이 된다
    fromShelf.journey.leaveJourney();
    assert.equal(fromShelf.calls.show.at(-1)[0], 'src064-orbit.html', '첫 화면에서 열었으면 첫 화면으로');
    assert.equal(fromShelf.calls.handled.at(-1), '#journey/00');
  } finally { fromShelf.restore(); }
});

// ── 주소 처리와 첫 여정의 조합 (6차, 2026-11-09) ─────────────────────────────
// 전: shell/location.mjs·journey.mjs 소스를 정규식으로 보던 시험(v41-journey-history 7번).
// 후: createLocation을 createJourney와 함께 띄우고 popstate·hashchange를 실제로 발생시킨다.
import { createLocation } from '../public/v41/shell/location.mjs';
import { fakeBrowser } from './helpers/fake-dom.mjs';

function browserHarness({hash = '#home', current = 'first-journey.html', saved = false} = {}) {
  const browser = fakeBrowser({hash});
  const moves = {goto: [], open: [], finish: 0, leave: 0, setCurrent: [], choose: [], notify: [], show: [], handled: [], startMember: 0, publicRoute: []};
  let screen = current;
  const locationApi = createLocation({
    $: () => null,
    getCurrent: () => screen,
    setCurrent: (next) => { screen = next; moves.setCurrent.push(next); },
    getMember: () => ({snapshot: () => ({owned: true, subject: 's1'})}),
    getSource: () => 'server',
    getActiveShareId: () => null,
    setHandled: (value) => moves.handled.push(value),
    getHandled: () => moves.handled.at(-1),
    show: (...args) => moves.show.push(args),
    choose: (...args) => moves.choose.push(args),
    notify: (msg) => moves.notify.push(msg),
    startMember: () => { moves.startMember += 1; },
    showPublicRoute: (route) => moves.publicRoute.push(route),
    journey: {saved: () => saved},
    gotoJourneyStep: (step) => moves.goto.push(step),
    openFirstJourney: (args) => moves.open.push(args),
    finishJourney: () => { moves.finish += 1; },
    leaveJourney: () => { moves.leave += 1; },
    getModel: () => ({trees: []})
  });
  return {browser, moves, locationApi, screen: () => screen, restore: () => browser.restore()};
}

test('popstate/hashchange 표: 여정 안이면 단계 복귀·닫기, 저장 뒤면 첫 화면, 닫혀 있으면 무시', () => {
  const cases = [
    {name: '여정 안 · 단계 기록', hash: '#journey/01', current: 'first-journey.html', saved: false, event: 'popstate', want: {goto: [1]}},
    {name: '여정 안 · 마지막 단계', hash: '#journey/04', current: 'first-journey.html', saved: false, event: 'hashchange', want: {goto: [4]}},
    {name: '여정 안 · 바깥 주소', hash: '#home', current: 'first-journey.html', saved: false, event: 'popstate', want: {leave: 1}},
    {name: '여정 안 · 저장 뒤 단계 기록', hash: '#journey/04', current: 'first-journey.html', saved: true, event: 'popstate', want: {finish: 1}},
    {name: '여정 밖 · 단계 기록(새로고침·직접 주소)', hash: '#journey/02', current: 'src064-orbit.html', saved: false, event: 'popstate', want: {open: [{step: 2, route: true}]}},
    {name: '여정 밖 · 다른 해시', hash: '#book', current: 'track59-sketchbook.html', saved: false, event: 'popstate', want: {setCurrent: ['track59-sketchbook.html']}}
  ];
  for (const c of cases) {
    const h = browserHarness({hash: c.hash, current: c.current, saved: c.saved});
    try {
      h.browser.fire(c.event);
      const got = {goto: h.moves.goto, open: h.moves.open, finish: h.moves.finish, leave: h.moves.leave};
      const want = {goto: [], open: [], finish: 0, leave: 0, ...c.want};
      assert.deepEqual(got, {goto: want.goto, open: want.open, finish: want.finish, leave: want.leave}, c.name);
      if (want.setCurrent) assert.deepEqual(h.moves.setCurrent, want.setCurrent, c.name);
      assert.deepEqual(h.moves.handled.at(-1), c.hash, `${c.name}: 같은 주소를 다시 처리하지 않도록 기억한다`);
    } finally { h.restore(); }
  }
});

test('이미 처리한 주소는 popstate가 다시 와도 한 번만 처리한다', () => {
  const h = browserHarness({hash: '#journey/01', current: 'first-journey.html'});
  try {
    h.browser.popstate();
    h.browser.popstate();
    h.browser.hashchange();
    assert.deepEqual(h.moves.goto, [1], '단계 이동은 한 번뿐');
  } finally { h.restore(); }
});

test('popstate·hashchange 감시를 실제로 건다', () => {
  const h = browserHarness({hash: '#home'});
  try {
    assert.equal(typeof h.browser.listeners.popstate?.[0], 'function', 'popstate 감시');
    assert.equal(typeof h.browser.listeners.hashchange?.[0], 'function', 'hashchange 감시');
  } finally { h.restore(); }
});

test('여정 화면과 셸이 주고받는 메시지: 단계 알림은 주소 기록으로, 복귀 지시는 화면으로', () => {
  // createJourney가 실제로 postMessage하는지 본다(3차 표의 보완).
  const j = harness({current: 'first-journey.html', hash: '#journey/01'});
  try {
    j.journey.gotoJourneyStep(3);
    const message = j.calls.postMessage.at(-1);
    assert.deepEqual(message, {type: 'lt41-journey-goto', step: 3}, '단계 복귀는 화면에 지시한다');
    j.journey.noteJourneyStep(3);
    assert.equal(j.calls.historyPush.at(-1), '#journey/03');
  } finally { j.restore(); }
});
