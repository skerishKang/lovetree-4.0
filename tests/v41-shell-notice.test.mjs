import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
// #353 후속: 담기·중복·로그인 필요 안내가 상태 안내보다 먼저 일정 시간 보이는지 가짜 DOM·가짜 시계로 직접 부른다.
// shell.mjs 배선(입구 안내를 hold로 보내는 한 줄)은 글자로 고정한다(#245 전례와 같은 이유).
import { createNotifier, NOTICE_HOLD_MS, NOTICE_HIDE_MS, syncedNoticeText, newlyPublishedTrees, AUTO_PUBLISH_MIN_MOMENTS } from '../public/v41/shell/notice.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

function harness() {
  const els = {};
  for (const id of ['settings-feedback', 'toast', 'account-settings']) els[id] = { textContent: '', hidden: false, open: false };
  let clock = 1000;
  let nextId = 1;
  const timers = [];
  const notifier = createNotifier({
    $: (id) => els[id],
    now: () => clock,
    setTimer: (fn, ms) => { const timer = { id: nextId++, fn, ms, cleared: false }; timers.push(timer); return timer; },
    clearTimer: (timer) => { if (timer) timer.cleared = true; },
  });
  return { els, notifier, timers, advance: (ms) => { clock += ms; } };
}

test('상태 안내: 토스트·설정 상태 줄에 함께 뜨고 숨김 타이머를 다시 건다', () => {
  const h = harness();
  assert.equal(h.notifier.notify('내 기록을 불러왔어요.'), true);
  assert.equal(h.els['toast'].textContent, '내 기록을 불러왔어요.');
  // #453 C2: 설정이 닫혀 있을 때 온 안내는 창 안 줄에 쌓이지 않는다.
  assert.equal(h.els['settings-feedback'].textContent, '', '닫힌 설정 창에는 쓰지 않는다');
  assert.equal(h.els['toast'].hidden, false);
  // 안내 하나에 숨김 타이머 1과 자리 다시 재기 2(600·1400 — 화면이 늦게 편성돼도 알림이 아래 내용을 덮지 않게)가 걸린다.
  assert.equal(h.timers.length, 3);
  assert.equal(h.timers[0].ms, 600);
  assert.equal(h.timers[1].ms, 1400);
  assert.equal(h.timers[2].ms, NOTICE_HIDE_MS);
  // 자리 다시 재기는 토스트를 숨기지 않는다.
  h.timers[0].fn();
  h.timers[1].fn();
  assert.equal(h.els['toast'].hidden, false);

  h.els['account-settings'].open = true;
  assert.equal(h.notifier.notify('설정 창이 열려 있을 때의 안내'), true);
  assert.equal(h.els['settings-feedback'].textContent, '설정 창이 열려 있을 때의 안내');
  assert.equal(h.els['toast'].hidden, true, '설정이 열려 있으면 토스트는 숨는다');
  assert.equal(h.timers[2].cleared, true, '이전 숨김 타이머를 지운다');
  h.timers[3].fn();
  assert.equal(h.els['toast'].hidden, true);
});

test('담기 안내 우선: hold 동안 상태 안내가 와도 덮지 않고, hold가 지나면 다시 보인다(#353 후속)', () => {
  const h = harness();
  h.els['account-settings'].open = true;
  assert.equal(h.notifier.notify('모아둔 순간에 담았어요', { hold: true }), true);
  h.advance(2000);
  assert.equal(h.notifier.notify('서버에 저장됐어요.'), false, 'hold 동안 상태 안내는 미룬다');
  assert.equal(h.els['toast'].textContent, '모아둔 순간에 담았어요');
  assert.equal(h.els['settings-feedback'].textContent, '모아둔 순간에 담았어요');
  h.advance(NOTICE_HOLD_MS - 2000 + 1);
  assert.equal(h.notifier.notify('내 기록을 불러왔어요.'), true, 'hold가 지나면 상태 안내가 보인다');
  assert.equal(h.els['toast'].textContent, '내 기록을 불러왔어요.');
  assert.equal(h.els['settings-feedback'].textContent, '내 기록을 불러왔어요.');
});

test('synced 안내 문구(#549): 기록 0개 새 계정은 첫 순간 안내로, 기록이 있으면 예전 문구', () => {
  assert.equal(syncedNoticeText({ writable: true, previousDirty: false, momentCount: 0 }), '반가워요. 첫 순간을 남겨 보세요.');
  assert.equal(syncedNoticeText({ writable: true, previousDirty: false, momentCount: 1 }), '내 기록을 불러왔어요.');
  assert.equal(syncedNoticeText({ writable: true, previousDirty: false, momentCount: 12 }), '내 기록을 불러왔어요.');
  // #905: 자동 저장 성공 안내('서버에 저장됐어요.')는 거뒀다 — previousDirty 를 넘겨도 저장 안내가 나지 않는다.
  assert.equal(syncedNoticeText({ writable: true, previousDirty: true, momentCount: 0 }), '반가워요. 첫 순간을 남겨 보세요.');
  assert.equal(syncedNoticeText({ writable: false, previousDirty: false, momentCount: 0 }), '기록을 읽었어요. 서버 편집 연결은 아직 준비되지 않았어요.');
});

// '셸은 synced 안내를 notice.mjs의 한 벌에서 가져온다' 소스 글자 시험(3 단정)은 지웠다(이슈 952) —
// 부팅 뒤 실제로 토스트에 안내가 뜨는 결과를 아래 실행 시험이 확인한다(문구는 이 파일의
// syncedNoticeText 함수 시험이 입출력으로 잠근다).

test('중복·로그인 필요 안내도 같은 규칙으로 지켜진다', () => {
  const dup = harness();
  assert.equal(dup.notifier.notify('이미 모아둔 순간에 있는 주소예요.', { hold: true }), true);
  dup.advance(1000);
  assert.equal(dup.notifier.notify('내 기록을 불러왔어요.'), false);
  assert.equal(dup.els['toast'].textContent, '이미 모아둔 순간에 있는 주소예요.');

  const retry = harness();
  retry.els['account-settings'].open = true;
  assert.equal(retry.notifier.notify('로그인한 뒤 다시 공유해 주세요.', { hold: true }), true);
  retry.advance(1000);
  assert.equal(retry.notifier.notify('로그인이 필요해요.'), false, '재시도 안내가 상태 안내에 덮이지 않는다');
  assert.equal(retry.els['settings-feedback'].textContent, '로그인한 뒤 다시 공유해 주세요.');
});

// '셸이 입구 안내를 hold로 보낸다' 소스 글자 시험(3 단정)은 지웠다(이슈 952) — hold 규칙 자체
// (hold 동안 상태 안내가 덮지 않는다)는 위 createNotifier 실행 시험들이 입출력으로 확인하고,
// 셸 연결 글자는 #245 전례의 문자열 고정으로는 사고를 막지 못했다(#477 같은 사례).

// 2026-11-15 보고(게스트 책·자동 공개 안내) — 판정·문구·단추·셸 배선.
test('자동 공개 판정: 순간 3개에 처음 도달한 트리만 새로 공개다', () => {
  assert.deepEqual(newlyPublishedTrees({ t1: 2, t2: 3 }, { t1: 3, t2: 4 }), [{ treeId: 't1', momentCount: 3 }], '3 미만 → 3 이상 전이만 대상');
  assert.deepEqual(newlyPublishedTrees({ t1: 3 }, { t1: 5 }), [], '이미 3개 이상이었던 트리는 새로 공개가 아니다');
  assert.deepEqual(newlyPublishedTrees(null, { t1: 3 }), [{ treeId: 't1', momentCount: 3 }], '기기 첫 관측(before 없음)은 prev=0 — 3개 이상이면 대상');
  assert.deepEqual(newlyPublishedTrees({}, { t1: 2 }), [], '3개 미만은 대상이 아니다');
  assert.deepEqual(newlyPublishedTrees({}, { t1: 3, t2: 4 }).map((row) => row.treeId), ['t1', 't2'], '여러 트리는 전부 돌려준다 — 셸이 하나씩 안내한다');
  assert.equal(AUTO_PUBLISH_MIN_MOMENTS, 3, '둘러보기 소개 기준(#538 SQL moment_count>=3)과 같다');
});


test('hold+단추 안내: hold 동안 상태 안내가 덮지 않고, 단추 없는 안내는 기존 길을 탄다', () => {
  const h = harness();
  const holdText = '둘러보기에 소개했어요. 공유 판에서 언제든 끌 수 있어요.';
  assert.equal(h.notifier.notify(holdText, { hold: true, action: { label: '끄기', run: () => {} } }), true);
  assert.equal(h.els['toast'].textContent, holdText, '가짜 DOM(replaceChildren 없음)에서는 문장만 — 진짜 단추 모양은 화면 검사가 잡는다');
  h.advance(1000);
  assert.equal(h.notifier.notify('서버에 저장됐어요.'), false, 'hold 동안 상태 안내가 덮지 않는다');
  h.advance(NOTICE_HOLD_MS + 1);
  assert.equal(h.notifier.notify('내 기록을 불러왔어요.'), true, 'hold가 지나면 상태 안내가 보인다');
  // 단추가 없는 안내는 기존과 같다(가짜 DOM에서도).
  const h2 = harness();
  h2.notifier.notify('서버에 저장됐어요.');
  assert.equal(h2.els['toast'].textContent, '서버에 저장됐어요.');
});

// '셸 배선: 질문 창 트리거·discoverAsked 기억' 소스 글자 시험(9 단정)은 지웠다(이슈 952) —
// 자동 공개 판정은 위 newlyPublishedTrees 함수 시험이, 소개 스위치의 discover PUT 저장은
// tests/v41-share-steps.test.mjs가, 질문 창 흐름은 둘러보기 화면 시험이 확인한다.

/* ── 이슈 952: 지운 소스 글자 시험의 대체 실행 시험 ──
   부팅(예시 → 실제 기록 교대)이 끝나면 셸이 notice.mjs 한 벌의 synced 안내를 토스트에 띄운다.
   글자 배선 대신 실제로 뜬 안내를 확인한다(문구 값 자체는 위 syncedNoticeText 함수 시험이 잠근다).
   LT_SHELL_952_REQUIRE=1 일 때 실행(CI 화면 잡 — 건너뜀=실패). */
const REQUIRE952N = process.env.LT_SHELL_952_REQUIRE === '1';
let chromium952n = null;
let skip952n = false;
try {
  ({ chromium: chromium952n } = await import('playwright'));
  if (!existsSync(chromium952n.executablePath())) skip952n = 'Playwright chromium이 설치되어 있지 않아 실행 시험을 건너뜀';
} catch {
  skip952n = 'playwright 패키지가 없어 실행 시험을 건너뜀';
}
if (REQUIRE952N && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip952n = '빌드 결과가 없어 실행 시험을 건너뜀';

function tree952(n, momentCount = 1) {
  let t = createTree({ subject: '시험' + n, title: '시험 트리 ' + n, note: '', emotion: '설렘', date: '2026-11-18', url: '' }, '2026-11-18T00:00:00Z');
  for (let i = 1; i < momentCount; i += 1) t = addMoment(t, { title: '순간 ' + i, note: '', emotion: '설렘', date: '2026-11-18', url: '' }, t.moments[0].id, '2026-11-18T00:0' + i + ':00Z');
  return t;
}

test('952 실행: 부팅이 끝나면 synced 안내가 토스트에 뜬다(기록 있음·없음)', { skip: skip952n || undefined }, async () => {
  const { serve } = await import('./helpers/screen-audit.mjs');
  const server = await serve({});
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium952n.launch();
  try {
    for (const [trees, expected] of [
      [[tree952(1)], '내 기록을 불러왔어요.'],
      [[], '반가워요. 첫 순간을 남겨 보세요.']
    ]) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); } catch {} });
      await ctx.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
      await ctx.route('**/api/workspace*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees }, subject: '검사기계정', writeSubjectBound: true, savedAt: '2026-11-16T09:00:00.000Z' }) }));
      await ctx.addInitScript(() => {
        window.__noticeTrace = [];
        let previous = '';
        new MutationObserver(() => {
          const snapshot = ['tree-tips', 'updates-card', 'toast'].map(id => {
            const el = document.getElementById(id);
            return [id, el?.hidden, id === 'toast' ? el?.textContent : ''];
          });
          const key = JSON.stringify(snapshot);
          if (key !== previous) { previous = key; window.__noticeTrace.push([Math.round(performance.now()), snapshot]); }
        }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
      });
      const page = await ctx.newPage();
      try {
        await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
        // #1103: 안내는 차례로 온다 — 첫 트리 판·새 소식 띠를 닫으면 정보 안내가 그 자리에 뜬다.
        // 첫 트리 판·새 소식 띠는 부팅 뒤 늦게 나타날 수 있다. 한 번만 보고 지나가면, 늦게 뜬 판이 줄을 잡아
        // 정보 안내가 5초 대기 규칙(#1103)으로 건너뛰어져 시험이 흔들렸다. 그래서 끝까지 지켜보며 나타나는 대로 닫는다.
        // 판정은 그대로다: 20초 안에 기대한 문구의 토스트가 떠야 한다.
        const deadline = Date.now() + 20000;
        let seen = false;
        while (Date.now() < deadline) {
          const state = await page.evaluate((want) => {
            const tips = document.getElementById('tree-tips'), card = document.getElementById('updates-card'), toast = document.getElementById('toast');
            return { tips: !!tips && !tips.hidden, card: !!card && !card.hidden, done: !!toast && !toast.hidden && toast.textContent === want };
          }, expected);
          if (state.done) { seen = true; break; }
          if (state.tips) await page.click('#tree-tips-close').catch(() => {});
          else if (state.card) await page.click('#updates-dismiss').catch(() => {});
          await page.waitForTimeout(100);
        }
        assert.ok(seen, `20초 안에 '${expected}' 안내가 토스트에 떠야 한다`);
      } catch (error) {
        console.log('안내 변화', trees.length, JSON.stringify(await page.evaluate(() => window.__noticeTrace)));
        throw error;
      } finally { await ctx.close(); }
    }
  } finally { await browser.close(); server.close(); }
});

test('#952: 늦은 새 소식·회원 응답에서도 부팅 완료 안내는 한 번만 뜬다', { skip: REQUIRE952N ? false : skip952n || undefined, timeout: 180000 }, async () => {
  if (skip952n) assert.fail(skip952n);
  const { serve } = await import('./helpers/screen-audit.mjs');
  const server = await serve({});
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium952n.launch();
  try {
    for (const scenario of [
      { name: '기록 있음', trees: [tree952(1)], status: 200, delay: 0, cpu: 1 },
      { name: '기록 없음', trees: [], status: 200, delay: 0, cpu: 1 },
      { name: '응답 지연', trees: [], status: 200, delay: 600, cpu: 1 },
      { name: '느린 기기', trees: [tree952(1)], status: 200, delay: 600, cpu: 4 },
      { name: '인증 실패', trees: [], status: 401, delay: 600, cpu: 4 },
      { name: '조회 실패', trees: [], status: 503, delay: 600, cpu: 4 }
    ]) {
      const { name, trees, status, delay, cpu } = scenario;
      const expected = trees.length ? '내 기록을 불러왔어요.' : '반가워요. 첫 순간을 남겨 보세요.';
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      try {
        await ctx.addInitScript(() => {
          localStorage.setItem('lt41.theme', 'night');
          window.__bootNotices = [];
          let visible = '';
          new MutationObserver(() => {
            const t = document.getElementById('toast');
            const next = t && !t.hidden ? t.textContent : '';
            if (next && next !== visible) window.__bootNotices.push(next);
            visible = next;
          }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
        });
        await ctx.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
        await ctx.route('**/api/workspace*', async route => {
          if (delay) await new Promise(resolve => setTimeout(resolve, delay));
          await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 200
            ? { revision: 1, state: { version: 1, trees }, subject: '검사기계정', writeSubjectBound: true, savedAt: '2026-11-16T09:00:00.000Z' }
            : { ok: false, code: status === 401 ? 'unauthenticated' : 'unavailable' }) });
        });
        // 기록이 먼저 도착하고 새 소식이 나중에 줄에 들어오는 순서를 고정한다.
        await ctx.route('**/v41/updates.json', async route => {
          await new Promise(resolve => setTimeout(resolve, 900));
          await route.continue();
        });
        const page = await ctx.newPage();
        if (cpu !== 1) {
          const cdp = await ctx.newCDPSession(page);
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
        }
        await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
        // 새 소식·첫 트리 안내를 각각 한 번만 닫는다. 완료 안내를 다시 요청하지 않는다.
        for (const id of ['tree-tips', 'updates-card']) {
          if (id === 'tree-tips' && !trees.length) continue;
          await page.waitForFunction(id => !document.getElementById(id)?.hidden, id, { timeout: 10000 });
          await page.click(id === 'tree-tips' ? '#tree-tips-close' : '#updates-dismiss');
        }
        if (status === 200) {
          await page.waitForFunction(want => {
            const t = document.getElementById('toast');
            return !!t && !t.hidden && t.textContent === want;
          }, expected, { timeout: 20000 });
          // 같은 안내가 다시 나타나지 않으며 기존 표시 시간이 지나면 사라진다.
          await page.waitForFunction(() => document.getElementById('toast').hidden, null, { timeout: 10000 });
        } else {
          await page.waitForFunction(() => document.body.dataset.member === 'out' && document.getElementById('account-avatar').hidden, null, { timeout: 10000 });
          if (status === 503) assert.equal(await page.evaluate(() => window.__bootNotices.some(t => t.includes('확인하지 못했어요'))), true, name);
        }
        const notices = await page.evaluate(() => window.__bootNotices);
        const count = notices.filter(text => ['내 기록을 불러왔어요.', '반가워요. 첫 순간을 남겨 보세요.'].includes(text)).length;
        assert.equal(count, status === 200 ? 1 : 0, name + ': ' + JSON.stringify(notices));
        console.log(name, '완료 안내', count, '회');
      } finally { await ctx.close(); }
    }
  } finally { await browser.close(); server.close(); }
});

test('#1076: 같은 열쇠 안내는 한 번만, 다른 안내는 그 뒤에도 보인다', () => {
  const h = harness();
  assert.equal(h.notifier.notifyOnce('내 기록을 불러왔어요.', 'synced'), true);
  assert.equal(h.notifier.notifyOnce('내 기록을 불러왔어요.', 'synced'), false, '화면 이동으로 다시 온 같은 안내는 무시');
  assert.equal(h.els['toast'].textContent, '내 기록을 불러왔어요.');
  assert.equal(h.notifier.onceShown(), 1);
  assert.equal(h.notifier.notifyOnce('다른 안내', 'other'), true, '다른 열쇠는 그대로 보인다');
  assert.equal(h.notifier.onceShown(), 2);
  const held = harness();
  held.els['account-settings'].open = true;
  assert.equal(held.notifier.notifyOnce('내 기록을 불러왔어요.', 'synced'), true);
  // 창이 열려 있으면 토스트는 숨지만 안내 자체는 한 번으로 센다(다시 뜨지 않는다).
  assert.equal(held.notifier.notifyOnce('내 기록을 불러왔어요.', 'synced'), false);
});

/* #1076 화면: 첫 진입에서만 synced 안내가 뜨고, 책→지도→첫 화면 이동에서는 0번. 계정 메뉴를 열면 바로 숨는다.
   CI 셸 화면 잡(LT_SHELL_952_REQUIRE=1)에서 돈다 — 건너뜀=실패. */
test('1076 실행: synced 안내는 첫 진입 1번, 화면 이동 0번, 계정 메뉴를 열면 숨는다', { skip: REQUIRE952N ? false : skip952n || undefined, timeout: 180000 }, async () => {
  if (skip952n) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip952n}`);
  const { serve } = await import('./helpers/screen-audit.mjs');
  const server = await serve({});
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium952n.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await ctx.addInitScript(() => {
      try { localStorage.setItem('lt41.theme', 'garden'); } catch {}
      window.__toastShows = 0;
      let wasVisible = false;
      setInterval(() => {
        const t = document.getElementById('toast');
        const visible = !!t && !t.hidden && t.textContent.includes('불러왔어요');
        if (visible && !wasVisible) window.__toastShows += 1;
        wasVisible = visible;
      }, 20);
    });
    await ctx.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx.route('**/api/workspace*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [tree952(1)] }, subject: '검사기계정', writeSubjectBound: true, savedAt: '2026-11-16T09:00:00.000Z' }) }));
    const page = await ctx.newPage();
    try {
      await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
      if (!await page.evaluate(() => document.getElementById('tree-tips')?.hidden)) await page.click('#tree-tips-close');
      await page.waitForFunction(() => {
        const card = document.getElementById('updates-card'), toast = document.getElementById('toast');
        return (card && !card.hidden) || (toast && !toast.hidden && toast.textContent.includes('불러왔어요'));
      }, null, { timeout: 10000 });
      if (!await page.evaluate(() => document.getElementById('updates-card')?.hidden)) await page.click('#updates-dismiss');
      await page.waitForFunction(() => window.__toastShows === 1, null, { timeout: 20000 });
      for (const view of ['track59-sketchbook.html', 'track56-network.html']) {
        await page.evaluate((v) => document.querySelector(`button[data-view="${v}"]`)?.click(), view);
        await page.waitForTimeout(700);
        assert.equal(await page.evaluate(() => window.__toastShows), 1, `${view} 이동에서 안내가 다시 뜨지 않는다`);
      }
      await page.click('.brand');
      await page.waitForTimeout(700);
      assert.equal(await page.evaluate(() => window.__toastShows), 1, '첫 화면 복귀에서도 다시 뜨지 않는다');
      await page.click('#account-avatar');
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => document.getElementById('toast').hidden), true, '계정 메뉴를 열면 안내가 바로 사라진다');
    } finally { await ctx.close(); }
  } finally { await browser.close(); server.close(); }
});

import { createNoticeQueue } from '../public/v41/shell/notice-queue.mjs';

test('#1103: 세 안내는 한 줄을 차례로 지나가고 동시에 1개만 보인다', () => {
  let clock = 1000;
  const visible = [];
  const q = createNoticeQueue({ now: () => clock });
  const show = id => visible.push(id);
  const hide = id => { const i = visible.indexOf(id); if (i >= 0) visible.splice(i, 1); assert.equal(visible.length <= 1, true); };
  assert.equal(q.request('tips', { show: () => show('tips'), hide: () => hide('tips') }), true);
  assert.equal(q.request('updates', { show: () => show('updates'), hide: () => hide('updates') }), true);
  assert.equal(q.request('toast', { show: () => show('toast'), hide: () => hide('toast'), maxWait: 5000 }), true);
  assert.deepEqual(visible, ['tips'], '먼저 온 안내가 떠 있다');
  assert.equal(q.visibleCount(), 1);
  assert.deepEqual(q.pendingIds().sort(), ['toast', 'updates']);
  q.release('tips');
  assert.deepEqual(visible, ['updates'], '그다음 ②');
  q.release('updates');
  assert.deepEqual(visible, ['toast'], '마지막 ③');
  assert.equal(q.visibleCount(), 1);
});

test('#1103: 정보 안내는 5초 넘게 기다리면 건너뛴다', () => {
  let clock = 1000;
  const visible = [];
  const q = createNoticeQueue({ now: () => clock });
  q.request('tips', { show: () => visible.push('tips'), hide: () => {} });
  q.request('toast', { show: () => visible.push('toast'), hide: () => {}, maxWait: 5000 });
  clock += 5001;
  q.release('tips');
  assert.deepEqual(visible, ['tips'], '5초가 지난 정보 안내는 뜨지 않는다');
  assert.equal(q.visibleCount(), 0);
  assert.equal(q.currentId(), null);
});

test('#1103: 우선순위가 앞서는 안내는 나중에 와도 먼저 뜬다', () => {
  const visible = [];
  const q = createNoticeQueue();
  q.request('updates', { show: () => visible.push('updates'), hide: () => { visible.splice(visible.indexOf('updates'), 1); } });
  q.request('tips', { show: () => visible.push('tips'), hide: () => { visible.splice(visible.indexOf('tips'), 1); } });
  assert.deepEqual(visible, ['tips'], '안내 판이 새 소식 띠를 선점');
  assert.deepEqual(q.pendingIds(), ['updates']);
  q.release('tips');
  assert.deepEqual(visible, ['updates'], '밀린 새 소식 띠가 그다음에 뜬다');
});
