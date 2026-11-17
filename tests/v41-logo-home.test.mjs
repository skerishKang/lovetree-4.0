import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createHomeLink } from '../public/v41/shell/home-link.mjs';
import { createLocation } from '../public/v41/shell/location.mjs';
import { ownerSelectionRoute } from '../public/v41/selection-location.mjs';

const HOME = 'src064-orbit.html';
const VIEWS = [
  ['home', HOME],
  ['shelf', 'track32-bookshelf.html'],
  ['book', 'track59-sketchbook.html'],
  ['board', 'track58-pinboard.html'],
  ['network', 'track56-network.html']
];

function link(current, overrides = {}) {
  const calls = [];
  const api = createHomeLink({
    $: () => null,
    getCurrent: () => current,
    show: (file, write) => calls.push(['show', file, write]),
    closePanels: () => { calls.push(['close']); return overrides.closeOk !== false; },
    setHomeHash: hash => calls.push(['hash', hash]),
    scrollToTop: () => calls.push(['scroll'])
  });
  return { api, calls };
}

test('다른 화면에서 로고를 누르면 첫 화면을 보여 주고 주소를 #home으로 pushes한다', () => {
  for (const [, file] of VIEWS.slice(1)) {
    const { api, calls } = link(file);
    let prevented = false;
    assert.equal(api.goHome({ preventDefault() { prevented = true; } }), true);
    assert.equal(prevented, true, '기본 링크 이동을 막는다');
    assert.deepEqual(calls, [['close'], ['show', HOME, false], ['hash', '#home']]);
  }
});

test('첫 화면에서 로고를 누르면 화면을 다시 띄우지 않고 맨 위로만 간다', () => {
  const { api, calls } = link(HOME);
  api.goHome({ preventDefault() {} });
  assert.deepEqual(calls, [['close'], ['scroll'], ['hash', '#home']]);
});

test('열린 창 닫기가 취소되면(더러움 확인) 화면 이동·주소 변경을 하지 않는다', () => {
  const { api, calls } = link('track32-bookshelf.html', { closeOk: false });
  assert.equal(api.goHome({ preventDefault() {} }), false);
  assert.deepEqual(calls, [['close']]);
});

test('mount는 .brand 클릭에 직접 핸들러를 붙인다', () => {
  const listeners = [];
  const brand = { addEventListener: (type, fn) => listeners.push([type, fn]) };
  const previous = globalThis.document;
  globalThis.document = { querySelector: sel => sel === '.brand' ? brand : null };
  try {
    const { api } = link('track32-bookshelf.html');
    assert.equal(api.mount(), true);
    assert.equal(listeners.length, 1);
    assert.equal(listeners[0][0], 'click');
    let prevented = false;
    listeners[0][1]({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  } finally {
    globalThis.document = previous;
  }
});

function locationHarness({ source = 'example', owned = false, current = HOME, hash = '#home' } = {}) {
  const historyCalls = [];
  const calls = [];
  globalThis.location = { hash };
  globalThis.history = {
    pushState(_s, _t, url) { historyCalls.push(['push', url]); globalThis.location.hash = url; },
    replaceState(_s, _t, url) { historyCalls.push(['replace', url]); globalThis.location.hash = url; }
  };
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  globalThis.addEventListener = () => {};
  globalThis.window = { LT41: owned ? { tree: { id: 't1' }, momentId: 'm1' } : null };
  const state = { current, handled: hash, member: owned ? { snapshot: () => ({ owned: true, subject: 's1' }) } : null };
  const api = createLocation({
    $: () => null,
    getCurrent: () => state.current,
    setCurrent: file => { state.current = file; calls.push(['current', file]); },
    getMember: () => state.member,
    getSource: () => source,
    getModel: () => ({ trees: [] }),
    getActiveShareId: () => null,
    getHandled: () => state.handled,
    setHandled: h => { state.handled = h; },
    show: (file, write) => calls.push(['show', file, write]),
    choose: (treeId, momentId) => calls.push(['choose', treeId, momentId]),
    notify() {}, startMember() {}, showPublicRoute() {},
    requestNetworkOpen() {},
    journey: { saved: () => false },
    gotoJourneyStep() {}, openFirstJourney() {}, finishJourney() {}, leaveJourney() {}
  });
  return { api, historyCalls, calls, state };
}

test('로그인 전: 다섯 화면 모두 주소가 서로 다르게 바뀐다(서재도 #shelf)', () => {
  for (const [view, file] of VIEWS) {
    const { api, historyCalls } = locationHarness({ current: file });
    api.writeLocation();
    assert.deepEqual(historyCalls, view === 'home' ? [] : [['push', '#' + view]], view + ' 화면 주소');
  }
});

test('로그인 후: 다섯 화면 모두 #my/<view> 주소로 바뀐다(서재 포함)', () => {
  for (const [view, file] of VIEWS) {
    const { api, historyCalls } = locationHarness({ source: 'server', owned: true, current: file });
    api.writeLocation();
    const expected = ownerSelectionRoute({ view, treeId: 't1', momentId: 'm1' });
    assert.deepEqual(historyCalls, [['push', expected]], view + ' 화면 주소');
  }
});

test('로고로 #home을 pushed 뒤 뒤로 가기 — 로그인 전·후 다섯 화면 모두 원래 화면으로 돌아온다', () => {
  for (const [view, file] of VIEWS.slice(1)) {
    for (const loggedIn of [false, true]) {
      const hash = loggedIn ? ownerSelectionRoute({view, treeId: 't1', momentId: 'm1'}) : '#' + view;
      const { api, calls, state } = locationHarness({
        source: loggedIn ? 'server' : 'example',
        owned: loggedIn,
        current: HOME,
        hash
      });
      state.handled = '#home'; // 로고 클릭 직후
      api.applyBrowserLocation();
      const label = view + (loggedIn ? '(로그인 후)' : '(로그인 전)') + ' 뒤로 가기';
      assert.deepEqual(calls[0], ['current', file], label + ' — 원래 화면으로 ' + JSON.stringify(calls));
      assert.ok(calls.some(c => c[0] === 'show' && c[2] === false) || calls.some(c => c[0] === 'choose'), label + ' — 화면 표시 ' + JSON.stringify(calls));
      assert.equal(state.handled, hash);
    }
  }
});

// 화면 이름·주소는 숫자(값)로 판정한다. 크롬이 없는 곳에서는 건너뛴다.
let chromium = null, launchOptions = {}, browserSkip = '';
try {
  ({ chromium } = await import('playwright'));
  const candidates = [chromium.executablePath()];
  // 로컬에서 브라우저가 따로 있을 때만 지정 경로를 쓴다(npm test의 브라우저 없음 대역에서는 건너뛴다).
  if (process.env.LT_LOGO_BROWSER_EXE) candidates.push(process.env.LT_LOGO_BROWSER_EXE);
  const exe = candidates.find(p => p && existsSync(p));
  if (!exe) browserSkip = 'Playwright Chromium이 없어 로고 화면 시험을 건너뜀';
  else launchOptions = { executablePath: exe };
} catch { browserSkip = 'playwright 패키지가 없어 로고 화면 시험을 건너뜀'; }

if (!browserSkip) {
  const { serve } = await import('./helpers/screen-audit.mjs');
  test('로그인 전 다섯 화면 × 로고 클릭 → 첫 화면·#home', { timeout: 90000 }, async () => {
    const server = await serve();
    const port = server.address().port;
    let browser = null;
    try {
      browser = await chromium.launch({ headless: true, ...launchOptions });
      const errors = [];
      const open = async () => {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        page.on('pageerror', e => errors.push(String(e)));
        await page.goto(`http://127.0.0.1:${port}/v41/`, { waitUntil: 'load' });
        await page.waitForTimeout(800);
        return page;
      };
      const snap = page => page.evaluate(() => {
        const names = {
          'home.html': 'home',
          'track32-bookshelf.html': 'shelf',
          'track59-sketchbook.html': 'book',
          'track58-pinboard.html': 'board',
          'track56-network.html': 'network'
        };
        let screen = '';
        try {
          const frame = document.querySelector('#view');
          const file = (frame?.contentWindow?.location?.pathname || '').split('/').pop();
          screen = names[file] || frame?.contentDocument?.documentElement?.dataset?.v41Screen || '';
        } catch {}
        return { hash: location.hash, screen, home: document.body.classList.contains('home-screen') };
      });
      const waitFor = async (page, ok, timeout = 8000) => {
        const started = Date.now();
        let last;
        while (Date.now() - started < timeout) {
          last = await snap(page);
          if (ok(last)) return last;
          await page.waitForTimeout(100);
        }
        throw new Error('화면 전환 대기 초과: ' + JSON.stringify(last));
      };
      const waitScreen = (page, want) => waitFor(page, s => want === 'home'
        ? s.hash === '#home' && s.home && s.screen === 'home'
        : s.hash === '#' + want && s.screen === want);
      for (const [view] of VIEWS) {
        // 화면마다 새 문서에서 시작 — 앞 화면의 프레임 교대가 남지 않게 한다.
        const page = await open();
        try {
          await page.evaluate(v => { location.hash = '#' + v; }, view);
          await waitScreen(page, view);
          const before = await snap(page);
          if (view === 'home') assert.equal(before.home, true);
          else assert.equal(before.screen, view, view + ' 화면 진입');

          await page.click('.brand');
          await waitScreen(page, 'home');
          const after = await snap(page);
          assert.equal(after.hash, '#home', view + '에서 로고 → #home');
          assert.equal(after.home, true, view + '에서 로고 → 첫 화면');
        } finally {
          await page.close();
        }
      }
      assert.deepEqual(errors, [], '페이지 오류 없음');
    } finally {
      await browser.close();
      server.close();
    }
  });
} else {
  test('로그인 전 다섯 화면 × 로고 클릭 — 건너뜀: ' + browserSkip, { skip: browserSkip }, () => {});
}
