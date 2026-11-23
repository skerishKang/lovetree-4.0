// 이슈 952(2026-11-20): 첫 화면(홈·궤도·설정 배선)의 소스 글자 계약을 "그려진 첫 화면"의
// 동작 검사로 옮긴 자리다. tests/v41-home-cards.test.mjs·v41-home-youtube-cards.test.mjs·
// v41-home-hero-261111.test.mjs에서 지운 단정의 약속을 실제 화면에서 잰다.
// - #429: 카드는 언제나 불투명(opacity 1), 깊이는 밝기 필터로, 내 카드는 금빛 테두리.
// - #340: 내 YouTube 순간은 영상 썸네일 카드(▶ 표시·no-referrer), '영상 포스터 예시'는 예시 카드에만.
// - #380 5번: 설정 창의 카드 출처·움직임이 첫 화면에 메시지로 닿는다(저장 키 포함).
// - #466 M2·2026-11-12 사고: 같은 날짜 표기를 몇 번 보내도 첫 화면은 한 번만 다시 뜬다.
// - #379: 공개(인기) 카드를 누르면 #share/ 공유 화면으로 간다.
// - #426·#635·#388: 추가·둘러보기 단추와 '어떻게 쓰나요' 안내 패널(이름·단추·처리방침/약관 링크·누름 영역 44px).
// LT_HOME_952_REQUIRE=1 일 때 실행(CI 화면 잡 — 건너뜀=실패).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

const REQUIRE952 = process.env.LT_HOME_952_REQUIRE === '1';
let chromium952 = null;
let skip952 = false;
try {
  ({ chromium: chromium952 } = await import('playwright'));
  if (!existsSync(chromium952.executablePath())) skip952 = 'Playwright chromium이 설치되어 있지 않아 실행 시험을 건너뜀';
} catch {
  skip952 = 'playwright 패키지가 없어 실행 시험을 건너뜀';
}
if (REQUIRE952 && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip952 = '빌드 결과가 없어 실행 시험을 건너뜀';

const THUMB = (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') });

function tree952({ subject, count, youtube = false }) {
  const input = i => ({ subject, title: '시험 순간 ' + (i + 1), date: '2026-11-' + String(i + 1).padStart(2, '0'), emotion: '설렘', note: '화면 확인용 가짜 기록', url: youtube && i % 2 === 0 ? 'https://www.youtube.com/watch?v=abc123DEF4' + i : '' });
  const clock = i => '2026-11-' + String(i + 1).padStart(2, '0') + 'T00:00:00.000Z';
  let t = createTree(input(0), clock(0));
  for (let i = 1; i < count; i++) t = addMoment(t, input(i), t.moments[0].id, clock(i));
  return t;
}

async function boot952(browser, { width = 1440, member = false, motion = 'reduce', initStorage = {}, routes = {}, thumb = THUMB, waitUntil = 'load' } = {}) {
  const server = await serve({});
  const base = `http://127.0.0.1:${server.address().port}`;
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: motion });
  await ctx.addInitScript((entries) => {
    for (const [k, v] of Object.entries(entries)) { try { localStorage.setItem(k, v); } catch {} }
  }, initStorage);
  const trees = [tree952({ subject: '좋아하는 순간들', count: 8, youtube: true }), tree952({ subject: '여름', count: 3 })];
  const workspace = { revision: 1, state: { version: 1, trees, prefs: { displayName: '화면검사 시험계정' } }, subject: 'visual-audit-fake', writeSubjectBound: true, savedAt: '2026-11-20T00:00:00.000Z' };
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== base) return u.hostname === 'i.ytimg.com' || u.hostname === 'audit.invalid' ? thumb(route, u) : route.abort();
    for (const [pattern, handler] of Object.entries(routes)) {
      if (new RegExp(pattern).test(u.pathname + u.search)) return handler(route, u);
    }
    if (u.pathname === '/api/workspace' && member) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workspace) });
    if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' });
    return route.continue();
  });
  const page = await ctx.newPage();
  await page.goto(`${base}/v41/${member ? '?account=1' : ''}#home`, { waitUntil });
  if (member) {
    await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
    const ask = page.locator('#discover-ask-no');
    await ask.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
    if (await ask.isVisible()) await ask.click();
  }
  await page.frameLocator('#view').locator('.center .actions').waitFor({ state: 'visible', timeout: 15000 });
  // 셸은 두 장(#view·#view-next)을 교대한다(#428) — 숨은 장이 about:blank로 비워질 때까지 기다려
  // 교체가 끝난 뒤 보이는 장(#view)에 붙은 프레임을 골라야 한다.
  await page.waitForFunction(() => {
    const f = document.getElementById('view-next');
    try { return !f || f.contentWindow.location.href === 'about:blank'; } catch { return false; }
  }, null, { timeout: 15000 }).catch(() => {});
  const handle = await page.evaluateHandle(() => document.getElementById('view'));
  const frame = await handle.asElement().contentFrame();
  assert.ok(frame, '첫 화면 프레임을 찾았다: ' + page.frames().map(f => f.url()).join(' | '));
  return { server, ctx, page, frame, base };
}

async function close952({ server, ctx }) {
  await ctx.close();
  await new Promise(r => server.close(r));
}

// 카드의 계산된 스타일 요약(궤도 안쪽에서 잰다).
const cardStats = (locator) => locator.evaluateAll(es => es.map(e => {
  const s = getComputedStyle(e);
  return { mine: e.classList.contains('mine'), opacity: s.opacity, filter: s.filter, border: s.borderTopColor, borderWidth: s.borderTopWidth };
}));

test('#429 첫 화면 카드는 언제나 불투명하고, 깊이는 밝기 필터로, 내 카드는 금빛 테두리다', { skip: REQUIRE952 ? false : skip952, timeout: 180000 }, async () => {
  if (skip952) assert.fail(skip952);
  const browser = await chromium952.launch({ headless: true });
  try {
    for (const member of [false, true]) {
      const h = await boot952(browser, { member, motion: 'no-preference' });
      try {
        await h.frame.waitForFunction(() => globalThis.__LT_ORBIT_TEST__?.canvasReady());
        const cards = await h.frame.evaluate(async () => {
          const hook=globalThis.__LT_ORBIT_TEST__;
          const nodes=[...document.querySelector('#orbit').shadowRoot.querySelectorAll('.card')];
          return hook.rasterStats().map((s,i)=>s&&({...s,mine:nodes[i].classList.contains('mine')})).filter(Boolean);
        });
        assert.ok(cards.length > 0, `${member ? '회원' : '예시'} 궤도에 카드가 그려진다`);
        assert.ok(cards.every(c => c.baseAlpha === 255 && (c.alpha === 255 || c.alpha === null)) && cards.some(c => c.alpha === 255), '카드는 인라인으로 불투명도를 낮추지 않는다(전: 예시 카드가 반투명했던 #429 결함)');
        assert.ok(cards.some(c => c.brightness < 1) && cards.every(c => c.brightness > 0 && c.brightness <= 1 && c.bakedBlur === c.blur), '깊이는 밝기(brightness) 필터로 낸다');
        if (member) {
          const mine = cards.filter(c => c.mine);
          assert.ok(mine.length > 0, '내 카드가 궤도에 있다');
          assert.ok(mine.every(c => c.borderWidth === 3 && c.borderColor === 'rgb(230, 177, 76)' && c.rimWidth === 1), '내 카드는 금빛 테두리(--lt-gold-deep)다: ' + JSON.stringify(mine[0]));
        }
      } finally { await close952(h); }
    }
  } finally { await browser.close(); }
});

test('#340 내 YouTube 순간은 ▶·유튜브 썸네일 카드로, 예시 포스터 카드와는 다르게', { skip: REQUIRE952 ? false : skip952, timeout: 180000 }, async () => {
  if (skip952) assert.fail(skip952);
  const browser = await chromium952.launch({ headless: true });
  try {
    // 내 기록: YouTube 순간이 ▶ 표시·no-referrer 썸네일 카드로 그려진다.
    const h = await boot952(browser, { member: true });
    try {
      const video = h.frame.locator('.card.video');
      await video.first().waitFor({ state: 'visible', timeout: 15000 });
      const img = await video.first().locator('img').evaluate(e => ({ src: e.src, rp: e.getAttribute('referrerpolicy'), loading: e.getAttribute('loading'), decoding: e.getAttribute('decoding') }));
      assert.ok(img.src.startsWith('https://i.ytimg.com/'), '썸네일은 LTMedia.describe 한 벌의 주소다: ' + img.src);
      assert.equal(img.rp, 'no-referrer');
      assert.equal(img.loading, 'lazy');
      assert.equal(img.decoding, 'async');
      const glyph = await video.first().locator('.playGlyph').evaluate(e => ({ hidden: e.getAttribute('aria-hidden'), text: e.textContent.trim() }));
      assert.equal(glyph.hidden, 'true');
      assert.equal(glyph.text, '▶');
      // 내 카드를 누르면 화면을 옮기지 않고 그 자리에서 크게 보기를 연다.
      await h.page.evaluate(() => { window.__opened = []; addEventListener('message', e => { if (e.data?.type === 'lt41-open-book') window.__opened.push(e.data.treeId + '/' + e.data.id); }); });
      await video.first().locator('.surface').evaluate(e => e.click());
      await h.frame.locator('#mediaViewerHome.open').waitFor({ state: 'visible', timeout: 5000 });
      assert.deepEqual(await h.page.evaluate(() => window.__opened), [], '누름에 화면 이동 요청이 없다');
    } finally { await close952(h); }
    // 예시(로그아웃 데모): 포스터 예시 카드는 재생 표시·유튜브 썸네일 없이 그려진다 —
    // ▶ 표시와 i.ytimg.com 썸네일은 내 YouTube 순간 카드만 붙는다(자세히 보기의
    // '영상 포스터 예시' 문구는 데모 카드의 누름이 openMine으로 새는 4.1 첫 화면에서 열리지 않는다).
    const g = await boot952(browser, { member: false });
    try {
      const demoVideo = g.frame.locator('.card.video');
      await demoVideo.first().waitFor({ state: 'visible', timeout: 15000 });
      const demo = await demoVideo.evaluateAll(es => es.map(e => ({ glyph: !!e.querySelector('.playGlyph'), src: e.querySelector('img')?.src || '' })));
      assert.ok(demo.length > 0, '예시 궤도에도 영상 포스터 카드가 있다');
      assert.ok(demo.every(d => !d.glyph), '예시 카드에는 ▶ 재생 표시가 없다');
      assert.ok(demo.every(d => !d.src.startsWith('https://i.ytimg.com/')), '예시 카드는 유튜브 썸네일 한 벌을 쓰지 않는다');
    } finally { await close952(g); }
  } finally { await browser.close(); }
});

test('#380 5번 설정의 카드 출처 단추: 저장 키를 쓰고 첫 화면을 다시 그린다', { skip: REQUIRE952 ? false : skip952, timeout: 180000 }, async () => {
  if (skip952) assert.fail(skip952);
  const browser = await chromium952.launch({ headless: true });
  try {
    const h = await boot952(browser, { member: true });
    try {
      await h.frame.evaluate(() => { window.__boot952 = 'v1'; });
      await h.page.click('#account-avatar');
      await h.page.waitForFunction(() => !document.getElementById('account-popover')?.hidden, null, { timeout: 5000 });
      await h.page.click('#account-open-settings');
      await h.page.waitForFunction(() => document.getElementById('account-settings')?.open, null, { timeout: 5000 });
      const mineBtn = h.page.locator('[data-home-cards="mine"]');
      await mineBtn.click();
      assert.equal(await mineBtn.getAttribute('aria-checked'), 'true', '고른 출처가 곧 표시된다');
      assert.equal(await h.page.evaluate(() => localStorage.getItem('lt41.homeCards')), 'mine', '저장 키 lt41.homeCards는 그대로다');
      // 첫 화면이 메시지를 받아 다시 그렸다 — 부팅 표식이 사라진다.
      let reloaded = false;
      for (let i = 0; i < 40 && !reloaded; i++) {
        await h.page.waitForTimeout(250);
        try { reloaded = (await h.frame.evaluate(() => window.__boot952 ?? null)) === null; } catch {}
      }
      assert.ok(reloaded, '첫 화면은 lt41-home-cards를 받아 다시 그린다');
    } finally { await close952(h); }
  } finally { await browser.close(); }
});

test('#380 5번 설정의 움직임 스위치: 첫 화면에 lt41-motion이 닿고 궤도가 멈춘다', { skip: REQUIRE952 ? false : skip952, timeout: 180000 }, async () => {
  if (skip952) assert.fail(skip952);
  const browser = await chromium952.launch({ headless: true });
  try {
    const h = await boot952(browser, { member: true, motion: 'no-preference' });
    try {
      await h.frame.evaluate(() => { window.__motion = []; addEventListener('message', e => { if (e.data?.type === 'lt41-motion') window.__motion.push(!!e.data.paused); }); });
      await h.frame.waitForFunction(() => globalThis.__LT_ORBIT_TEST__?.canvasReady());
      const cardY = () => h.frame.evaluate(() => globalThis.__LT_ORBIT_TEST__.poses().find(p=>p&&!p.hidden).y);
      const moving = async () => { const a = await cardY(); await h.page.waitForTimeout(400); return Math.abs(await cardY() - a) > 0.5; };
      assert.equal(await moving(), true, '움직임이 켜져 있으면 카드가 움직인다');
      await h.page.click('#account-avatar');
      await h.page.waitForFunction(() => !document.getElementById('account-popover')?.hidden, null, { timeout: 5000 });
      await h.page.click('#account-open-settings');
      await h.page.waitForFunction(() => document.getElementById('account-settings')?.open, null, { timeout: 5000 });
      const motionBtn = h.page.locator('#settings-motion');
      await motionBtn.click();
      assert.equal(await motionBtn.getAttribute('aria-checked'), 'false', '스위치가 꺼짐을 표시한다');
      assert.equal(await motionBtn.textContent(), '끔');
      await h.frame.waitForFunction(() => (window.__motion || []).length > 0, null, { timeout: 5000 }).catch(() => {});
      const msgs = await h.frame.evaluate(() => window.__motion);
      assert.ok(msgs.length >= 1 && msgs.every(m => m === true), '첫 화면이 lt41-motion(paused)을 받았다: ' + JSON.stringify(msgs) + ' frame=' + h.frame.url());
      assert.equal(await moving(), false, '궤도 카드가 실제로 멈춘다');
    } finally { await close952(h); }
  } finally { await browser.close(); }
});

test('#466 M2 같은 날짜 표기를 몇 번 보내도 첫 화면은 한 번만 다시 뜬다(2026-11-12 사고 재현)', { skip: REQUIRE952 ? false : skip952, timeout: 180000 }, async () => {
  if (skip952) assert.fail(skip952);
  const browser = await chromium952.launch({ headless: true });
  try {
    const h = await boot952(browser, { member: false, initStorage: { 'lt41.dateStyle': 'dot' } });
    try {
      const post = (value) => h.frame.evaluate(v => postMessage({ type: 'lt41-date-style', value: v }, location.origin), value);
      const marker = () => h.frame.evaluate(() => window.__boot952 ?? null).catch(() => 'busy');
      await h.frame.evaluate(() => { window.__boot952 = 'v1'; });
      // 셸은 뜰 때마다 같은 값을 보낸다 — 같은 값 세 번은 새로고침 0번이어야 한다.
      await post('dot'); await h.page.waitForTimeout(300);
      await post('dot'); await h.page.waitForTimeout(300);
      await post('dot'); await h.page.waitForTimeout(500);
      assert.equal(await marker(), 'v1', '같은 값이면 다시 뜨지 않는다(전: 끝없이 새로고침한 사고)');
      // 값이 실제로 바뀌면(미러를 먼저 쓴 뒤) 한 번만 다시 뜬다.
      await h.page.evaluate(() => localStorage.setItem('lt41.dateStyle', 'dash'));
      await post('dash');
      let reloaded = false;
      for (let i = 0; i < 40 && !reloaded; i++) { await h.page.waitForTimeout(250); reloaded = (await marker()) === null; }
      assert.ok(reloaded, '바뀐 값에는 한 번 다시 뜬다');
      await h.frame.evaluate(() => { window.__boot952 = 'v2'; });
      await post('dash'); await h.page.waitForTimeout(700);
      assert.equal(await marker(), 'v2', '다시 뜬 뒤 같은 값이 또 와도 멈춘다');
    } finally { await close952(h); }
  } finally { await browser.close(); }
});

test('#379 인기 카드를 누르면 #share/ 공유 화면으로 간다', { skip: REQUIRE952 ? false : skip952, timeout: 180000 }, async () => {
  if (skip952) assert.fail(skip952);
  const browser = await chromium952.launch({ headless: true });
  try {
    const share = { shareId: 'share-pop-00000001', view: 'book', title: '공개 트리', subject: '공개 대상', momentCount: 1 };
    const h = await boot952(browser, {
      member: false,
      initStorage: { 'lt41.homeCards': 'popular' },
      routes: {
        '^/api/community/shares': r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [share] }) }),
        '^/api/public/shares/share-pop-00000001': r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, tree: { id: 't-pub', title: '공개 트리', moments: [{ id: 'm-pub', title: '공개 순간', date: '2026-11-01', mediaMetadata: { thumbnail: '/media/p.jpg' } }] } }) }),
      },
    });
    try {
      // 인기 카드는 createdAt이 없어 궤도 끝에 그려진다 — 캡션(공개 순간 제목)으로 찾는다.
      const card = h.frame.locator('.card').filter({ hasText: '공개 순간' }).first();
      await card.waitFor({ state: 'visible', timeout: 15000 });
      await card.locator('.surface').evaluate(e => e.click());
      await h.page.waitForFunction(() => location.hash.startsWith('#share/'), null, { timeout: 5000 });
      assert.equal(await h.page.evaluate(() => location.hash), '#share/share-pop-00000001/book', '공개 카드는 공유 화면으로 이동한다');
    } finally { await close952(h); }
  } finally { await browser.close(); }
});

test('#426·#635 추가·둘러보기 단추와 안내 패널이 실제로 동작한다', { skip: REQUIRE952 ? false : skip952, timeout: 180000 }, async () => {
  if (skip952) assert.fail(skip952);
  const browser = await chromium952.launch({ headless: true });
  try {
    const h = await boot952(browser, { member: true });
    try {
      // 추가 단추(카드 위) → 쓰기 창이 열린다. 궤도 .world가 포인터를 가로채는지는
      // 화면 공통 검사(v41-screen-audit)의 겹침·가림 검사가 맡으므로, 여기서는 눌렀을 때의 동작을 잰다.
      await h.frame.locator('.home-add-top').evaluate(e => e.click());
      await h.page.waitForFunction(() => document.getElementById('write-panel')?.open, null, { timeout: 5000 });
      await h.page.evaluate(() => document.getElementById('write-panel').close());
      // 가운데 '둘러보기' → 둘러보기 판이 열린다.
      await h.frame.locator('.center .actions [data-do="community"]').evaluate(e => e.click());
      await h.page.waitForFunction(() => document.getElementById('community-panel')?.open, null, { timeout: 5000 });
      await h.page.evaluate(() => document.getElementById('community-panel').close());
      // '어떻게 쓰나요' — 회원의 입구는 계정 메뉴(셸이 lt41-open-guide로 같은 안내 패널을 연다).
      // 예시(로그아웃) 가운데 세트의 [data-do="guide"]도 같은 패널을 연다.
      const guide = h.frame.locator('#guidePanel');
      await h.page.click('#account-avatar');
      await h.page.waitForFunction(() => !document.getElementById('account-popover')?.hidden, null, { timeout: 5000 });
      await h.page.click('#account-guide');
      await guide.waitFor({ state: 'visible', timeout: 5000 });
      assert.equal(await guide.getAttribute('aria-label'), '어떻게 쓰나요', '안내 패널은 기존 orbit-dialog 틀의 이름을 쓴다');
      assert.ok(await guide.locator('[data-do="guide-new"]').count(), '안내 패널의 첫 순간 추가 단추');
      assert.ok(await guide.locator('[data-do="guide-community"]').count(), '안내 패널의 둘러보기 단추');
      const links = await guide.locator('.guide-policy a').evaluateAll(es => es.map(e => ({ href: e.href, target: e.target, rel: e.rel, minH: parseFloat(getComputedStyle(e).minHeight), text: e.textContent.trim() })));
      assert.deepEqual(links.map(l => l.text), ['개인정보 처리방침', '이용약관']);
      assert.ok(links.every(l => l.target === '_blank' && l.rel.includes('noopener')), '두 링크 모두 새 창이다');
      assert.equal(links[0].href, 'https://auth.padiem.net/privacy#lovetree', '처리방침은 러브트리 절로 바로 간다');
      assert.equal(links[1].href, 'https://auth.padiem.net/terms');
      assert.ok(links.every(l => l.minH >= 44), '누름 영역 44px: ' + JSON.stringify(links.map(l => l.minH)));
    } finally { await close952(h); }
    // 예시(로그아웃) 가운데 세트의 '어떻게 쓰나요' 단추도 같은 패널을 연다.
    const g = await boot952(browser, { member: false });
    try {
      const guide = g.frame.locator('#guidePanel');
      await g.frame.locator('.center .actions [data-do="guide"]').evaluate(e => e.click());
      await guide.waitFor({ state: 'visible', timeout: 5000 });
      assert.equal(await guide.getAttribute('aria-label'), '어떻게 쓰나요');
    } finally { await close952(g); }
  } finally { await browser.close(); }
});

test('#1027 정원 이어 보기 카드의 종이색과 글 대비, 세로 영상 칸', { skip: REQUIRE952 ? false : skip952, timeout: 180000 }, async () => {
  if (skip952) assert.fail(skip952);
  const browser = await chromium952.launch({ headless: true });
  const contrast = (fg, bg) => {
    const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => {
      const c = v / 255;
      return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
    }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const a = luminance(fg), b = luminance(bg);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  };
  try {
    for (const [kind, url] of [['vertical', 'https://www.youtube.com/shorts/abc123DEF45'], ['horizontal', 'https://youtu.be/abc123DEF45'], ['memo', '']]) {
      const tree = createTree({subject:'시험 트리',title:'시험 순간',note:'사진 없는 글',date:'2026-11-18',emotion:'여운',url}, '2026-11-18T00:00:00.000Z');
      const workspace = {revision:1,state:{version:1,trees:[tree],prefs:{}},subject:'visual-audit-fake',writeSubjectBound:true};
      for (const theme of ['garden', 'night']) {
        const h = await boot952(browser, { member:true, width:390, initStorage:{'lt41.theme':theme}, routes:{'/api/workspace':route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(workspace)})} });
        try {
          for (const width of [390, 1440]) {
            await h.page.setViewportSize({width,height:width === 390 ? 844 : 900});
            const stats = await h.frame.locator('.recent-card').evaluate(card => {
              const media = card.querySelector('.recent-media'), meta = card.querySelector('.recent-meta');
              const before = getComputedStyle(media, '::before'), thumb = card.querySelector('.recent-thumb');
              const style = el => getComputedStyle(el);
              return {card:style(card).backgroundColor,media:style(media).backgroundColor,meta:style(meta).backgroundColor,
                border:style(meta).borderTopWidth, width:media.getBoundingClientRect().width, metaWidth:meta.getBoundingClientRect().width,
                height:media.getBoundingClientRect().height, fit:thumb && style(thumb).objectFit,
                blur:before.filter, opacity:before.opacity, bgImage:before.backgroundImage, thumbSrc:thumb && thumb.src,
                colors:[...card.querySelectorAll('.recent-head,.recent-head-arrow,.recent-meta strong,.recent-meta small,.recent-memo')].map(e=>style(e).color)};
            });
            if (theme === 'garden') {
              assert.equal(stats.card,'rgb(255, 253, 248)');
              assert.equal(stats.meta,stats.card);
              assert.equal(stats.media,stats.card);
              assert.equal(stats.border,'1px');
              assert.ok(stats.colors.every(color=>contrast(color,stats.meta)>=4.5), JSON.stringify(stats));
              assert.ok(Math.abs(stats.width-stats.metaWidth)<1, JSON.stringify(stats));
              if (kind === 'vertical') {
                assert.equal(stats.fit,'contain');
                assert.match(stats.blur,/blur\(18px\)/);
                assert.equal(stats.opacity,'0.7');
                assert.ok(stats.bgImage.includes(stats.thumbSrc),'같은 썸네일을 CSS 변수로 깐다(#1084): '+JSON.stringify(stats));
              }
            } else {
              assert.equal(stats.card,'rgba(10, 9, 14, 0.82)');
              assert.equal(stats.media,'rgb(11, 10, 16)');
              assert.equal(stats.border,'0px');
              if (kind === 'vertical') assert.equal(stats.opacity,'0.86');
            }
            if (kind === 'horizontal') assert.equal(stats.fit,'cover');
          }
        } finally { await close952(h); }
      }
    }
  } finally { await browser.close(); }
});

test('#1026 마지막 순간 영상은 확인 전 실패를 보이지 않고 높이를 유지한다', {skip: REQUIRE952 ? false : skip952, timeout:180000}, async()=>{
  if(skip952)assert.fail(skip952);
  const browser=await chromium952.launch({headless:true});
  try {
    for(const failed of [false,true]){
      const tree=createTree({subject:'시험 트리',title:'두 줄이 될 만큼 긴 제목을 가진 영상 순간',date:'2026-11-20',emotion:'설렘',url:'https://youtu.be/abc123DEF45'},'2026-11-20T00:00:00.000Z');
      const workspace={revision:1,state:{version:1,trees:[tree],prefs:{}},subject:'visual-audit-fake',writeSubjectBound:true};
      let release;const pending=new Promise(r=>release=r);
      const h=await boot952(browser,{member:true,width:390,motion:'no-preference',waitUntil:'domcontentloaded',initStorage:{'lt41.theme':'garden'},routes:{'/api/workspace':route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(workspace)})},thumb:async route=>{await pending;return failed?route.abort():THUMB(route)}});
      try{
        const card=h.frame.locator('.recent-card'), media=card.locator('.recent-media');
        const before=await card.boundingBox();
        assert.equal(await media.getAttribute('data-recent-state'),'loading');
        assert.equal(await media.locator('.recent-video-status').isVisible(),false);
        release();
        await media.locator('.recent-thumb').evaluate(img=>new Promise(r=>{if(img.complete&&img.naturalWidth)r();else img.addEventListener('load',r,{once:true});setTimeout(r,5000)}));
        await h.frame.waitForFunction(v=>document.querySelector('#orbit').shadowRoot.querySelector('.recent-media').dataset.recentState===v,failed?'failed':'ready');
        assert.equal(await media.locator('.recent-video-status').isVisible(),failed);
        const after=await card.boundingBox();
        assert.equal(after.height,before.height);
        if(failed){
          const notice=await media.locator('.recent-video-status').boundingBox(),title=await card.locator('.recent-meta strong').boundingBox();
          assert.ok(notice.y+notice.height<=title.y,'안내와 제목 겹침 없음');
        }
      }finally{release();await close952(h)}
    }
  }finally{await browser.close()}
});

test('#1087 카드 바꾸기·숫자 두 줄·숫자 누르기', { skip: REQUIRE952 ? false : skip952, timeout: 180000 }, async () => {
  if (skip952) assert.fail(skip952);
  const at = i => '2026-11-' + String(i + 1).padStart(2, '0') + 'T00:00:00.000Z';
  let tree = createTree({ subject: '팬 트리', title: '팬 트리', date: '2026-11-20', emotion: '설렘', note: '순간', url: '' }, at(0));
  tree = addMoment(tree, { title: '둘째', note: '', emotion: '설렘', date: '2026-11-21', url: '' }, tree.moments[0].id, at(1));
  let inbox = createTree({ subject: '팬 트리', title: '모아둔 순간', date: '2026-11-19', emotion: '설렘', note: '모음', url: '' }, at(0));
  inbox = addMoment(inbox, { title: '모은 것', note: '', emotion: '설렘', date: '2026-11-20', url: '' }, inbox.moments[0].id, at(1));
  inbox.inbox = true;
  const workspace = { revision: 1, state: { version: 1, trees: [tree, inbox], prefs: {} }, subject: 'visual-audit-fake', writeSubjectBound: true, savedAt: at(2) };
  const browser = await chromium952.launch({ headless: true });
  try {
    const h = await boot952(browser, { member: true, routes: {
      '/api/workspace': route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workspace) }),
      '/api/shares': route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, shares: [{ id: 's'.repeat(24), treeId: tree.id, status: 'active' }] }) }),
      '/api/community/stats': route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ trees: 11, moments: 42 }) })
    } });
    try {
      const frame = h.frame;
      await frame.locator('.home-count-line').first().waitFor({ state: 'visible', timeout: 15000 });
      const groups = frame.locator('.home-action-group');
      assert.equal(await groups.count(), 3);
      for (const group of await groups.all()) assert.equal(await group.locator('.home-count-line').count(), 2, '단추마다 두 줄');
      const texts = await groups.evaluateAll(es => es.map(e => [...e.querySelectorAll('.home-count-line')].map(row => row.textContent.trim())));
      assert.deepEqual(texts, [['순간 4', '모아둔 2'], ['공개 트리 11', '공개 순간 42'], ['트리 2', '공개 트리 1']], JSON.stringify(texts));

      await frame.locator('.recent-change').click();
      await frame.locator('.recent-menu').waitFor({ state: 'visible', timeout: 5000 });
      const items = await frame.locator('.recent-menu button').allTextContents();
      assert.ok(items.some(text => text.includes('마지막에 담은 순간')) && items.some(text => text.includes('무작위')), '바꾸기 목록 ' + JSON.stringify(items));
      const menuFit = await frame.locator('.recent-menu').evaluate(el => {
        const list = el.querySelector('.recent-menu-list');
        for (let i = 0; i < 20; i += 1) { const b = document.createElement('button'); b.textContent = '트리 ' + i; list.append(b); }
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), viewport: el.ownerDocument.documentElement.clientHeight, scrollable: list.scrollHeight > list.clientHeight };
      });
      assert.ok(menuFit.top >= 0 && menuFit.bottom <= menuFit.viewport, '목록이 화면 안에 있다: ' + JSON.stringify(menuFit));
      assert.ok(menuFit.scrollable, '목록 안에서만 스크롤된다: ' + JSON.stringify(menuFit));
      await h.page.keyboard.press('Escape');
      assert.equal(await frame.locator('.recent-menu').count(), 0, 'Esc로 닫힌다');

      await h.page.evaluate(() => { window.__msgs1087 = []; addEventListener('message', e => { if (e.data?.type) window.__msgs1087.push(e.data.type); }); });
      await groups.nth(0).locator('.home-count button', { hasText: '순간 4' }).evaluate(el => el.click());
      await frame.locator('.orbit-dialog .index-list').waitFor({ state: 'visible', timeout: 5000 });
      await h.page.keyboard.press('Escape');
      await frame.locator('.orbit-dialog[open]').waitFor({ state: 'detached', timeout: 5000 });
      await groups.nth(0).locator('.home-count button', { hasText: '모아둔 2' }).evaluate(el => el.click());
      await h.page.waitForFunction(() => window.__msgs1087.includes('lt41-cleanup'), null, { timeout: 5000 });
      await groups.nth(1).locator('.home-count button', { hasText: '공개 트리 11' }).evaluate(el => el.click());
      await groups.nth(1).locator('.home-count button', { hasText: '공개 순간 42' }).evaluate(el => el.click());
      await h.page.waitForFunction(() => window.__msgs1087.filter(type => type === 'lt41-community').length >= 2, null, { timeout: 5000 });
      await groups.nth(2).locator('.home-count button', { hasText: '트리 2' }).evaluate(el => el.click());
      await groups.nth(2).locator('.home-count button', { hasText: '공개 트리 1' }).evaluate(el => el.click());
      const navs = await h.page.evaluate(() => window.__msgs1087.filter(t => t === 'lt41-navigate').length);
      assert.ok(navs >= 2, '트리 숫자 둘 → 서재 ' + navs);

      await h.page.evaluate(() => document.querySelector('[data-home-moment="random"]').click());
      await h.page.waitForFunction(() => window.__msgs1087.includes('lt41-home-moment'), null, { timeout: 5000 });
    } finally { await close952(h); }
  } finally { await browser.close(); }
});

test('#1087 390 새 소식 띠와 숫자 두 줄 겹침 0', { skip: REQUIRE952 ? false : skip952, timeout: 180000 }, async () => {
  if (skip952) assert.fail(skip952);
  const browser = await chromium952.launch({ headless: true });
  try {
    for (const theme of ['garden', 'night']) {
      const at = i => '2026-11-' + String(i + 1).padStart(2, '0') + 'T00:00:00.000Z';
      let tree = createTree({ subject: '팬 트리', title: '팬 트리', date: '2026-11-20', emotion: '설렘', note: 'n', url: 'https://www.youtube.com/shorts/a1111111111' }, at(0));
      tree.moments[0].mediaMetadata = { vertical: true, width: 1080, height: 1920 };
      tree.moments[0].image = 'https://i.ytimg.com/vi/a1111111111/oardefault.jpg';
      tree.moments[0].youtubeThumb = true;
      tree = addMoment(tree, { title: '둘째', note: '', emotion: '설렘', date: '2026-11-21', url: 'https://www.youtube.com/shorts/a1111111111' }, tree.moments[0].id, at(1));
      tree.moments[1].mediaMetadata = { vertical: true, width: 1080, height: 1920 };
      tree.moments[1].image = 'https://i.ytimg.com/vi/a1111111111/oardefault.jpg';
      tree.moments[1].youtubeThumb = true;
      let inbox = createTree({ subject: '팬 트리', title: '모아둔 순간', date: '2026-11-19', emotion: '설렘', note: '모음', url: '' }, at(0));
      inbox = addMoment(inbox, { title: '모은 것', note: '', emotion: '설렘', date: '2026-11-20', url: '' }, inbox.moments[0].id, at(1));
      inbox.inbox = true;
      const workspace = { revision: 1, state: { version: 1, trees: [tree, inbox], prefs: {} }, subject: 'visual-audit-fake', writeSubjectBound: true, savedAt: at(2) };
      const h = await boot952(browser, { member: true, width: 390, initStorage: { 'lt41.theme': theme }, routes: {
        '/api/workspace': route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workspace) }),
        '/api/community/stats': route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ trees: 11, moments: 42 }) })
      } });
      try {
        const frame = h.frame;
        await frame.locator('.home-count-line').first().waitFor({ state: 'visible', timeout: 15000 });
        const geo = await h.page.evaluate(() => {
          const bandEl = document.getElementById('updates-card');
          bandEl.hidden = false;
          const band = bandEl.getBoundingClientRect();
          const iframe = document.getElementById('view');
          const off = iframe.getBoundingClientRect();
          const root = iframe.contentDocument.querySelector('#orbit').shadowRoot;
          const rows = [...root.querySelectorAll('.home-count-line')].map(row => {
            const el = row.lastElementChild || row;
            if (!el.textContent.trim()) return null;
            const r = el.getBoundingClientRect();
            return { text: el.textContent.trim(), left: Math.round(r.left + off.left), right: Math.round(r.right + off.left), top: Math.round((r.top + off.top) * 10) / 10, bottom: Math.round((r.bottom + off.top) * 10) / 10 };
          }).filter(Boolean);
          const links = document.querySelector('.home-links').getBoundingClientRect();
          const area = r => Math.max(0, Math.min(band.right, r.right) - Math.max(band.left, r.left)) * Math.max(0, Math.min(band.bottom, r.bottom) - Math.max(band.top, r.top));
          return { theme: localStorage.getItem('lt41.theme'), bandTop: Math.round(band.top), bandBottom: Math.round(band.bottom), rows, overlaps: rows.map(area), links: area(links) };
        });
        console.log('#1087 BAND', JSON.stringify(geo));
        assert.ok(geo.rows.length >= 2, '두 줄 숫자가 실제로 그려진다: ' + JSON.stringify(geo));
        assert.ok(geo.overlaps.every(v => Math.round(v) === 0), '띠와 숫자 두 줄 겹침 0: ' + JSON.stringify(geo));
        assert.equal(Math.round(geo.links), 0, '띠와 바닥 링크 겹침 0: ' + JSON.stringify(geo));
      } finally { await close952(h); }
    }
  } finally { await browser.close(); }
});

test('#1088 가운데 카드 누름은 화면 이동 없이 크게 보기를 연다', { skip: REQUIRE952 ? false : skip952, timeout: 180000 }, async () => {
  if (skip952) assert.fail(skip952);
  const at = i => '2026-11-' + String(i + 1).padStart(2, '0') + 'T00:00:00.000Z';
  const tree = createTree({ subject: '팬 트리', title: '마지막 순간', date: '2026-11-20', emotion: '설렘', note: '순간', url: 'https://www.youtube.com/shorts/a1111111111' }, at(0));
  tree.moments[0].mediaMetadata = { vertical: true, width: 1080, height: 1920 };
  tree.moments[0].image = 'https://i.ytimg.com/vi/a1111111111/oardefault.jpg';
  tree.moments[0].youtubeThumb = true;
  const workspace = { revision: 1, state: { version: 1, trees: [tree], prefs: {} }, subject: 'visual-audit-fake', writeSubjectBound: true, savedAt: at(1) };
  const browser = await chromium952.launch({ headless: true });
  try {
    const h = await boot952(browser, { member: true, width: 1440, routes: { '/api/workspace': route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workspace) }) } });
    try {
      const frame = h.frame;
      await frame.locator('.recent-card').waitFor({ state: 'visible', timeout: 15000 });
      await h.page.evaluate(() => { window.__nav1088 = []; addEventListener('message', e => { if (['lt41-navigate', 'lt41-community', 'lt41-cleanup'].includes(e.data?.type)) window.__nav1088.push(e.data.type); }); });
      const hashBefore = await h.page.evaluate(() => location.hash);
      const viewer = frame.locator('#mediaViewerHome');
      const open = async () => { await frame.locator('.recent-play').click(); await viewer.waitFor({ state: 'visible', timeout: 5000 }); };
      await open();
      assert.equal(await viewer.getAttribute('aria-hidden'), 'false', '크게 보기 열림');
      const src = await frame.locator('#mediaVisualHome iframe').getAttribute('src');
      assert.match(src, /a1111111111/, '영상 id');
      assert.match(src, /autoplay=1/, '누름 안에서 재생 시작');
      assert.ok(await frame.locator('#mediaBookHome').isVisible(), '책에서 이어 보기');
      assert.ok(await frame.locator('#mediaExternalHome').isVisible(), '원본 보기');
      assert.ok(await h.page.evaluate(() => getComputedStyle(document.getElementById('updates-card')).display === 'none'), '열린 동안 아래 띠가 숨는다');
      assert.equal(await h.page.evaluate(() => location.hash), hashBefore, '주소 moved 0');
      assert.deepEqual(await h.page.evaluate(() => window.__nav1088), [], '화면 이동 요청 0');
      const focusAfterOpen = await frame.evaluate(() => document.querySelector('#orbit').shadowRoot.activeElement?.id || '');
      assert.equal(focusAfterOpen, 'mediaCloseHome', '열면 닫기 단추에 초점');

      await h.page.keyboard.press('Escape');
      assert.equal(await viewer.getAttribute('aria-hidden'), 'true', 'Esc로 닫힘');
      const focusAfterEsc = await frame.evaluate(() => document.querySelector('#orbit').shadowRoot.activeElement?.className || '');
      assert.match(focusAfterEsc, /recent-card/, 'Esc 뒤 카드로 초점 복귀');

      await open();
      await frame.locator('#mediaCloseHome').click();
      assert.equal(await viewer.getAttribute('aria-hidden'), 'true', '×로 닫힘');
      const focusAfterX = await frame.evaluate(() => document.querySelector('#orbit').shadowRoot.activeElement?.className || '');
      assert.match(focusAfterX, /recent-card/, '× 뒤 카드로 초점 복귀');

      await open();
      await viewer.evaluate(el => el.click());
      assert.equal(await viewer.getAttribute('aria-hidden'), 'true', '바깥 누름으로 닫힘');
      const focusAfterBackdrop = await frame.evaluate(() => document.querySelector('#orbit').shadowRoot.activeElement?.className || '');
      assert.match(focusAfterBackdrop, /recent-card/, '바깥 누름 뒤 카드로 초점 복귀');
    } finally { await close952(h); }
  } finally { await browser.close(); }
});

test('#1088 2단계 떠 있는 카드도 그 자리에서 크게 보기', { skip: REQUIRE952 ? false : skip952, timeout: 180000 }, async () => {
  if (skip952) assert.fail(skip952);
  const at = '2026-11-20T00:00:00.000Z';
  let tree = createTree({ subject: '팬 트리', title: '이유가 있는 순간', date: '2026-11-20', emotion: '설렘', note: '기억', url: 'https://www.youtube.com/shorts/a1111111111' }, at);
  tree.moments[0].mediaMetadata = { vertical: true, width: 1080, height: 1920 };
  tree.moments[0].image = 'https://i.ytimg.com/vi/a1111111111/oardefault.jpg';
  tree.moments[0].youtubeThumb = true;
  tree.moments[0].whyNext = '다음에 이어 볼 이유';
  for (let i = 1; i < 8; i += 1) tree = addMoment(tree, { title: '순간 ' + i, note: '', emotion: '설렘', date: '2026-11-20', url: '' }, tree.moments[0].id, at);
  const workspace = { revision: 1, state: { version: 1, trees: [tree], prefs: {} }, subject: 'visual-audit-fake', writeSubjectBound: true, savedAt: at };
  const browser = await chromium952.launch({ headless: true });
  try {
    const h = await boot952(browser, { member: true, width: 1440, routes: { '/api/workspace': route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workspace) }) } });
    try {
      const frame = h.frame;
      const viewer = frame.locator('#mediaViewerHome');
      await frame.locator('.recent-card').waitFor({ state: 'visible', timeout: 15000 });
      await h.page.evaluate(() => { window.__nav2 = []; addEventListener('message', e => { if (['lt41-navigate', 'lt41-community', 'lt41-cleanup'].includes(e.data?.type)) window.__nav2.push(e.data.type); }); });
      const before = await frame.evaluate(() => {
        const root = document.querySelector('#orbit').shadowRoot;
        return { hidden: root.querySelector('#mediaViewerHome .mediaWhy').hidden, text: root.querySelector('#mediaWhyHome').textContent };
      });
      assert.equal(before.hidden, true, '창을 열기 전에는 이유 줄이 없다: ' + JSON.stringify(before));

      await frame.locator('.recent-card').click();
      await viewer.waitFor({ state: 'visible', timeout: 5000 });
      const withWhy = await frame.evaluate(() => {
        const root = document.querySelector('#orbit').shadowRoot;
        return { hidden: root.querySelector('#mediaViewerHome .mediaWhy').hidden, text: root.querySelector('#mediaWhyHome').textContent };
      });
      assert.equal(withWhy.hidden, true, '이유 내용이 없으면 WHY NEXT 제목도 숨는다: ' + JSON.stringify(withWhy));
      const buttons = await frame.evaluate(() => {
        const root = document.querySelector('#orbit').shadowRoot;
        const a = root.querySelector('#mediaBookHome'), b = root.querySelector('#mediaExternalHome');
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        return { heights: [Math.round(ra.height), Math.round(rb.height)], tops: [Math.round(ra.top), Math.round(rb.top)] };
      });
      assert.equal(buttons.heights[0], buttons.heights[1], '두 단추 높이 같다: ' + JSON.stringify(buttons));
      assert.equal(buttons.tops[0], buttons.tops[1], '두 단추 윗변 같다: ' + JSON.stringify(buttons));
      await h.page.keyboard.press('Escape');
      assert.equal(await viewer.getAttribute('aria-hidden'), 'true', 'Esc로 닫힘');

      const surface = frame.locator('.card.video .surface').first();
      const label = await surface.evaluate(el => el.getAttribute('aria-label') || '');
      const expectedTitle = await surface.evaluate(el => el.closest('.card').querySelector('.caption span').firstChild.textContent);
      assert.ok(expectedTitle, '대상 영상 카드 제목');
      await frame.waitForFunction(() => globalThis.__LT_ORBIT_TEST__?.canvasSettled());
      const point = await surface.evaluate(el => {
        const root=el.getRootNode(),canvas=root.querySelector('.orbit-canvas'),orbit=globalThis.__LT_ORBIT_TEST__;
        const cards=[...root.querySelectorAll('.card')],index=cards.indexOf(el.closest('.card')),r=canvas.getBoundingClientRect();
        orbit.hold(true);
        for(let step=0;step<48;step++){
          orbit.seek(step/48);const poses=orbit.poses(),p=poses[index];
          if(!p||p.hidden||p.x<8||p.y<8||p.x>r.width-8||p.y>r.height-8)continue;
          if(poses.some((v,i)=>i!==index&&v&&!v.hidden&&v.box.l<=p.x&&v.box.r>=p.x&&v.box.t<=p.y&&v.box.b>=p.y))continue;
          const x=r.left+p.x,y=r.top+p.y;if(root.elementFromPoint(x,y)===canvas)return {x,y};
        }return null;
      });
      assert.ok(point,'대상 영상 카드가 그려진 실제 좌표');
      const iframe = await (await frame.frameElement()).boundingBox();
      assert.ok(iframe,'첫 화면 틀 좌표');
      await h.page.mouse.click(iframe.x+point.x,iframe.y+point.y);
      await frame.locator('#mediaViewerHome[aria-hidden="false"]').waitFor({ state: 'visible', timeout: 5000 });
      assert.equal(await frame.locator('#mediaTitleHome').textContent(),expectedTitle,'첫 클릭에 대상 카드가 열린다');
      const topmost = await frame.evaluate(({ x, y }) => {
        const root = document.querySelector('#orbit').shadowRoot;
        const hit = root.elementFromPoint(x, y);
        const mid = root.querySelector('#mediaVisualHome').getBoundingClientRect();
        const hitMid = root.elementFromPoint(Math.round(mid.left + mid.width / 2), Math.round(mid.top + mid.height / 2));
        return { cls: hit ? String(hit.className || hit.tagName) : '', insideViewer: !!hit && !!root.querySelector('#mediaViewerHome').contains(hit), midCls: hitMid ? String(hitMid.className || hitMid.tagName) : '', midInside: !!hitMid && !!root.querySelector('#mediaViewerHome').contains(hitMid) };
      }, point);
      assert.equal(topmost.midInside, true, '가림막이 맨 위다: ' + JSON.stringify(topmost));
      const dlg = await frame.evaluate(() => { const d = document.querySelector('#orbit').shadowRoot.querySelector('.orbit-dialog'); return d?.open || false; });
      assert.equal(dlg, false, '뒤에 상세 창이 열리지 않는다');
      assert.deepEqual(await h.page.evaluate(() => window.__nav2), [], '화면 이동 요청 0');
      await h.page.keyboard.press('Escape');
      const focused = await frame.evaluate(() => document.querySelector('#orbit').shadowRoot.activeElement?.getAttribute('aria-label') || '');
      assert.equal(focused, label, '떠 있는 카드로 초점 복귀');
      await h.page.keyboard.press('Shift+Tab');
      await h.page.keyboard.press('Tab');
      assert.equal(await frame.evaluate(() => document.querySelector('#orbit').shadowRoot.activeElement?.getAttribute('aria-label') || ''),label,'탭으로 동일 카드 초점');
      await h.page.keyboard.press('Enter');
      await frame.locator('#mediaViewerHome[aria-hidden="false"]').waitFor({state:'visible',timeout:5000});
      assert.equal(await frame.locator('#mediaTitleHome').textContent(),expectedTitle,'키보드로 동일 카드 열기');
      await h.page.keyboard.press('Escape');
    } finally { await close952(h); }
  } finally { await browser.close(); }
});


// #1204: Pixel regression for the glow over the orbit. Inspect the *real*
// page theme toggle or a saved theme; never change just the iframe host.
test('#1204 실제 테마 전환·저장값 및 가운데 빛 직선 경계 픽셀 검사', {skip: REQUIRE952 ? false : skip952, timeout: 180000}, async () => {
  if (skip952) assert.fail(skip952);
  const {inflateSync} = await import('node:zlib');
  function rgbRows(png) {
    assert.equal(png.subarray(1,4).toString(),'PNG');
    let width=0,height=0,channels=0,pos=8,parts=[];
    while(pos<png.length){
      const len=png.readUInt32BE(pos),tag=png.toString('ascii',pos+4,pos+8),data=png.subarray(pos+8,pos+8+len);
      if(tag==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);channels=data[9]===6?4:data[9]===2?3:0;assert.ok(channels,'expected RGB/RGBA PNG');}
      if(tag==='IDAT')parts.push(data);
      pos+=len+12;
      if(tag==='IEND')break;
    }
    const packed=inflateSync(Buffer.concat(parts)),stride=width*channels,rows=[];
    let previous=new Uint8Array(stride);
    let offset=0;
    for(let y=0;y<height;y++){
      const filter=packed[offset++],row=new Uint8Array(stride);
      for(let i=0;i<stride;i++){
        const raw=packed[offset++],left=i>=channels?row[i-channels]:0,up=previous[i],ul=i>=channels?previous[i-channels]:0;
        const p=left+up-ul,pa=Math.abs(p-left),pb=Math.abs(p-up),pc=Math.abs(p-ul);
        const predict=pa<=pb&&pa<=pc?left:pb<=pc?up:ul;
        row[i]=(raw+(filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):filter===4?predict:0))&255;
      }
      rows.push(row);previous=row;
    }
    return {width,height,pixel:(x,y)=>{const i=(y*0+Math.max(0,Math.min(width-1,x)))*channels,r=rows[Math.max(0,Math.min(height-1,y))];return [r[i],r[i+1],r[i+2]];}};
  }
  const browser=await chromium952.launch({headless:true});
  try {
    for(const width of [1440,390]) for(const theme of ['garden','night']) for(const route of ['stored','toggle']){
      const initStorage=route==='stored'?{'lt41.theme':theme}:{'lt41.theme':'night'};
      const h=await boot952(browser,{width,motion:'reduce',initStorage});
      try {
        if(route==='toggle'&&theme==='garden'){
          await h.page.locator('#theme-toggle').click();
          await h.page.waitForFunction(()=>document.documentElement.getAttribute('data-lt-theme')==='garden');
        }
        await h.frame.waitForFunction(expected=>(document.querySelector('#orbit')?.getAttribute('data-lt-theme')||'night')===expected,theme,{timeout:10000});
        const state=await h.page.evaluate(()=>{
          const frame=document.querySelector('#view')?.contentDocument;
          const host=frame?.querySelector('#orbit'),root=host?.shadowRoot;
          const app=root?.querySelector('.app'),scrim=root?.querySelector('.center-scrim');
          const a=app?.getBoundingClientRect(),b=scrim?.getBoundingClientRect();
          return {shell:document.documentElement.getAttribute('data-lt-theme')||'night',
            frame:frame?.documentElement.getAttribute('data-lt-theme')||'night',
            host:host?.getAttribute('data-lt-theme')||'night',
            stage:getComputedStyle(app).backgroundImage,
            glow:getComputedStyle(scrim).backgroundImage,
            box:a&&b?{app:[a.x,a.y,a.width,a.height],glow:[b.x,b.y,b.width,b.height]}:null};
        });
        assert.equal(state.shell,theme,'shell header must follow actual theme');
        assert.equal(state.frame,theme,'iframe document must follow actual theme');
        assert.equal(state.host,theme,'orbit must follow actual theme');
        assert.ok(state.box,JSON.stringify(state));
        assert.ok(Math.abs(state.box.glow[2]-state.box.app[2])<=2&&Math.abs(state.box.glow[3]-state.box.app[3])<=2,'glow occupies entire app: '+JSON.stringify(state.box));
        const capture=process.env.LT_HOME_1204_CAPTURE_DIR;
        if(capture){const {mkdirSync}=await import('node:fs');mkdirSync(capture,{recursive:true});await h.page.screenshot({path:`${capture}/home-1204-${width}-${theme}-${route}.png`});}
        // Temporary #1204 CI evidence transfer: the COM1 remote session has
        // exhausted its quota. Emit only the two new garden PNGs in bounded
        // base64 chunks so they can be copied to lovetree-sc without putting
        // binary captures in the application repository.
        if(process.env.GITHUB_ACTIONS==='true'&&route==='stored'){
          const capturePng=await h.page.screenshot({type:'png'});
          const encoded=capturePng.toString('base64'),partSize=12000;
          console.log('LT1204PNG_BEGIN '+width+' '+theme+' '+encoded.length);
          for(let at=0;at<encoded.length;at+=partSize)
            console.log('LT1204PNG_PART '+width+' '+theme+' '+Math.floor(at/partSize)+' '+encoded.slice(at,at+partSize));
          console.log('LT1204PNG_END '+width+' '+theme);
        }
        // Render the computed live scrim into a separate, static pixel stage:
        // isolate the gradient from animated orbit canvases and GPU repaints.
        // Keep the actual geometry, gradient, clip and mask properties.
        await h.frame.evaluate(()=>{
          const scrim=document.querySelector('#orbit').shadowRoot.querySelector('.center-scrim');
          const computed=getComputedStyle(scrim),rect=scrim.getBoundingClientRect();
          const stage=document.createElement('div');stage.id='lt1204-pixel-stage';
          stage.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#050509;pointer-events:none';
          const overlay=document.createElement('div');overlay.id='lt1204-pixel-glow';
          Object.assign(overlay.style,{position:'absolute',left:rect.left+'px',top:rect.top+'px',
            width:rect.width+'px',height:rect.height+'px',backgroundImage:computed.backgroundImage,
            backgroundRepeat:'no-repeat',borderRadius:computed.borderRadius,
            maskImage:computed.maskImage,clipPath:computed.clipPath});
          stage.append(overlay);document.body.append(stage);
        });
        const element=h.frame.locator('body');
        const on=rgbRows(await element.screenshot({animations:'disabled'}));
        await h.frame.evaluate(()=>document.querySelector('#lt1204-pixel-glow').style.display='none');
        const off=rgbRows(await element.screenshot({animations:'disabled'}));
        assert.equal(on.width,off.width);assert.equal(on.height,off.height);
        const delta=(x,y)=>on.pixel(x,y).reduce((s,c,i)=>s+Math.abs(c-off.pixel(x,y)[i]),0);
        const midX=Math.floor(on.width/2),midY=Math.floor(on.height/2);
        // Rectangular clipping used to create a discontinuity on horizontal/
        // vertical scanlines, whereas a feathered radial must change smoothly.
        const hline=Array.from({length:on.width},(_,x)=>delta(x,midY));
        const vline=Array.from({length:on.height},(_,y)=>delta(midX,y));
        // Screenshot pixels must show a fully feathered perimeter at every
        // edge. Together with the live scrim == viewport rectangle assertion
        // above, this excludes the previous interior rectangular clipping
        // without treating isolated GPU/color-management pixels as a border.
        for(const fraction of [0,.25,.5,.75,1]){
          const x=Math.round((on.width-1)*fraction),y=Math.round((on.height-1)*fraction);
          assert.ok(delta(x,0)<=3&&delta(x,on.height-1)<=3,
            'glow must fade at top/bottom: '+JSON.stringify({width,theme,route,x}));
          assert.ok(delta(0,y)<=3&&delta(on.width-1,y)<=3,
            'glow must fade at left/right: '+JSON.stringify({width,theme,route,y}));
        }
        if(theme==='garden')assert.ok(delta(midX,midY)>120,'garden center glow must be visible in rendered screenshot');
      } finally {await close952(h);}
    }
  } finally {await browser.close();}
});

test('#1204 첫 화면 순차 등장·안내 삭제·WebGL 말풍선·기억·겹침·접근성', { skip: REQUIRE952 ? false : skip952, timeout: 180000 }, async () => {
  if (skip952) assert.fail(skip952);
  const browser = await chromium952.launch({headless:true});
  try {
    for (const width of [1440,390]) for (const theme of ['garden','night']) {
      const h=await boot952(browser,{width,motion:'no-preference',initStorage:{'lt41.theme':theme}});
      try {
        const inspect=()=>h.frame.evaluate(()=>{
          const root=document.querySelector('#orbit').shadowRoot;
          const tip=root.querySelector('.lt-orbit-tip'),center=root.querySelector('.center'),actions=center.querySelector('.actions');
          const tr=tip.getBoundingClientRect(),cr=center.getBoundingClientRect(),ar=actions.getBoundingClientRect();
          const intersects=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
          const poses=globalThis.__LT_ORBIT_TEST__?.poses()||[];
          const host=document.querySelector('#orbit').getBoundingClientRect();
          const closeToCard=poses.some(p=>p&&!p.hidden&&p.box&&(
            // Orbit projections and the HTML hint share the same local canvas coordinates.
            (tr.left-host.left>=p.box.l-125&&tr.left-host.left<=p.box.r+125)&&
            (tr.top-host.top>=p.box.t-50&&tr.top-host.top<=p.box.b+50)
          ));
          return {visible:tip.hasAttribute('data-visible'),x:tr.x,y:tr.y,closeToCard,
            overlaps:intersects(tr,cr)||intersects(tr,ar),pointer:getComputedStyle(tip).pointerEvents,
            labels:[...root.querySelectorAll('.card .surface')].map(e=>e.getAttribute('aria-label')),
            notes:root.querySelectorAll('.center-note').length,centerRect:{x:cr.x,y:cr.y,w:cr.width,h:cr.height},
            animations:[...root.querySelectorAll('.center .lt-home-enter')].map(e=>({delay:getComputedStyle(e).animationDelay,duration:getComputedStyle(e).animationDuration}))};
        });
        await h.frame.waitForFunction(()=>globalThis.__LT_ORBIT_TEST__?.canvasReady(),null,{timeout:20000});
        await h.frame.locator('.center .actions .home-action-group').first().waitFor({state:'visible',timeout:15000});
        const opening=await inspect();
        assert.equal(opening.notes,0,'두 안내 줄을 그리지 않는다');
        assert.ok(opening.animations.length>=4,'머리말·제목·설명·단추가 차례로 나타난다');
        const delays=opening.animations.map(a=>parseFloat(a.delay));
        assert.ok(delays.every((v,i)=>i===0||v-delays[i-1]>=.08&&v-delays[i-1]<=.12),JSON.stringify(delays));
        assert.ok(opening.animations.every(a=>parseFloat(a.duration)>=.4&&parseFloat(a.duration)<=.5));
        assert.ok(opening.labels.length>0&&opening.labels.every(x=>x?.includes('눌러서 크게 보기')));
        await h.frame.waitForFunction(()=>document.querySelector('#orbit')?.shadowRoot?.querySelector('.lt-orbit-tip')?.hasAttribute('data-visible'),null,{timeout:15000});
        for (let sample=0;sample<3;sample++){
          const state=await inspect();
          assert.equal(state.visible,true);
          assert.equal(state.pointer,'none');
          assert.equal(state.closeToCard,true,'말풍선은 투영된 카드 곁에 있다: '+JSON.stringify(state));
          assert.equal(state.overlaps,false,'중앙 글자·단추와 겹치지 않는다');
          await h.page.waitForTimeout(440);
        }
        // #1204: Scrub several real WebGL orbit phases, not just adjacent frames.
        // The hint must hand off to an on-screen card instead of holding a rear card.
        for (const phase of [0.2, 0.5, 0.8]) {
          await h.frame.evaluate(t => globalThis.__LT_ORBIT_TEST__.seek(t), phase);
          await h.page.waitForTimeout(1050);
          const state=await inspect();
          assert.equal(state.visible,true,'말풍선이 단계별로 앞 카드에 나타난다');
          assert.equal(state.closeToCard,true,'투영 카드 곁에 남는다: '+JSON.stringify(state));
          assert.equal(state.overlaps,false,'중앙 내용·단추를 가리지 않는다');
        }
        await h.frame.evaluate(()=>globalThis.__LT_ORBIT_TEST__.restore());
        await h.page.waitForTimeout(1100);
        assert.deepEqual((await inspect()).centerRect,opening.centerRect,'중앙 영역은 등장 전후에도 재배치되지 않는다');
        const {mkdirSync}=await import('node:fs');
        const capture=process.env.LT_HOME_1204_CAPTURE_DIR;
        if(capture){mkdirSync(capture,{recursive:true});await h.page.screenshot({path: `${capture}/home-1204-${width}-${theme}.png`});}
        const clicked=await h.frame.evaluate(()=>{
          const host=document.querySelector('#orbit'),root=host.shadowRoot;
          const world=root.querySelector('.world'),board=[...world.querySelectorAll('.orbit-canvas')].find(e=>getComputedStyle(e).display!=='none');
          const poses=globalThis.__LT_ORBIT_TEST__.poses();
          if(!board)return {board:false};
          const r=board.getBoundingClientRect();
          let hit=null;
          for(const p of poses){
            if(!p||p.hidden||!p.box||p.box.r<0||p.box.l>world.clientWidth)continue;
            for(const fx of [.3,.5,.7])for(const fy of [.3,.5,.7]){
              const x=r.left+p.box.l+(p.box.r-p.box.l)*fx,y=r.top+p.box.t+(p.box.b-p.box.t)*fy;
              board.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:x,clientY:y,pointerId:1,pointerType:'mouse'}));
              if(board.style.cursor==='pointer'){hit={x,y};break;}
            }
            if(hit)break;
          }
          if(!hit)return {board:true,position:false};
          board.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:hit.x,clientY:hit.y,pointerId:1,pointerType:'mouse'}));
          board.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:hit.x,clientY:hit.y,detail:1}));
          return {board:true,position:true,stored:localStorage.getItem('lt41-orbit-card-opened')};
        });
        assert.equal(clicked.stored,'1','실제 캔버스 클릭 경로에서 기기에 기억한다: '+JSON.stringify(clicked));
        assert.equal((await inspect()).visible,false,'누른 즉시 말풍선이 사라진다');
        await h.page.reload({waitUntil:'load'});
        await h.page.waitForTimeout(2400);
        assert.equal(await h.page.frameLocator('#view').locator('.lt-orbit-tip').evaluate(e=>e.hasAttribute('data-visible')),false,'새로고침해도 말풍선이 나타나지 않는다');
      } finally {await close952(h);}
    }
    const reduced=await boot952(browser,{width:390,motion:'reduce'});
    try{
      await reduced.frame.waitForFunction(()=>globalThis.__LT_ORBIT_TEST__?.canvasReady(),null,{timeout:20000});
      await reduced.page.waitForTimeout(2400);
      const snapshot=()=>reduced.frame.evaluate(()=>{
        const root=document.querySelector('#orbit').shadowRoot,tip=root.querySelector('.lt-orbit-tip');
        return {x:tip.getBoundingClientRect().x,y:tip.getBoundingClientRect().y,
          styles:[...root.querySelectorAll('.center .lt-home-enter')].map(e=>({animation:getComputedStyle(e).animationName,opacity:getComputedStyle(e).opacity}))};
      });
      const first=await snapshot();await reduced.page.waitForTimeout(550);const next=await snapshot();
      assert.deepEqual([next.x,next.y],[first.x,first.y],'움직임 줄이기에서는 말풍선 좌표 고정');
      assert.ok(first.styles.every(x=>x.animation==='none'&&x.opacity==='1'));
    }finally{await close952(reduced);}
  }finally{await browser.close();}
});
