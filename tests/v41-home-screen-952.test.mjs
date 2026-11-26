// 이슈 952(2026-11-20): 첫 화면(홈·궤도·설정 배선)의 소스 글자 계약을 "그려진 첫 화면"의
// 동작 검사로 옮긴 자리다. tests/v41-home-cards.test.mjs·v41-home-youtube-cards.test.mjs·
// v41-home-hero-261111.test.mjs에서 지운 단정의 약속을 실제 화면에서 잰다.
// - #429: 카드는 언제나 불투명(opacity 1), 깊이는 밝기 필터로, 내 카드는 금빛 테두리.
// - #340: 내 YouTube 순간은 영상 썸네일 카드(▶ 표시·no-referrer), '영상 포스터 예시'는 예시 카드에만.
// - #380 5번: 설정 창의 카드 출처·움직임이 첫 화면에 메시지로 닿는다(저장 키 포함).
// - #466 M2·2026-11-12 사고: 같은 날짜 표기를 몇 번 보내도 첫 화면은 한 번만 다시 뜬다.
// - #379: 공개(인기) 카드를 누르면 #share/ 공유 화면으로 간다.
// - #426·#635·#388: 추가·둘러보기 단추와 '어떻게 쓰나요' 안내 패널(이름·단추·처리방침/약관 링크·누름 영역 44px).
// - #1487: 트리 0개 첫 화면의 덮개·추가 입구, 로그인 확인 중 서재 주소의 첫 그림.
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

async function boot952(browser, { width = 1440, height = width === 390 ? 844 : 900, member = false, motion = 'reduce', initStorage = {}, routes = {}, thumb = THUMB, waitUntil = 'load', initScript = null } = {}) {
  const server = await serve({});
  const base = `http://127.0.0.1:${server.address().port}`;
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: motion });
  await ctx.addInitScript((entries) => {
    for (const [k, v] of Object.entries(entries)) { try { localStorage.setItem(k, v); } catch {} }
  }, initStorage);
  if (initScript) await ctx.addInitScript(initScript);
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
                height:media.getBoundingClientRect().height, fit:thumb && style(thumb).objectFit, thumbW:thumb && thumb.getBoundingClientRect().width, thumbH:thumb && thumb.getBoundingClientRect().height,
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
                // #1084: 세로 영상은 16:9 칸 가운데에 9:16 크기로 놓고(cover), 양옆은 흐린 같은 썸네일이 카드 끝까지 채운다.
                assert.equal(stats.fit,'cover');
                assert.ok(stats.thumbW/stats.thumbH<=9/16+0.02&&stats.thumbW/stats.thumbH>=0.35, '세로 썸네일은 9:16 이하 폭(쇼츠 썸네일 양옆 띠는 잘라 냄): '+JSON.stringify(stats));
                assert.ok(stats.thumbW<stats.width*0.4, '가운데 좁은 칸만 원래 썸네일, 나머지는 흐린 배경: '+JSON.stringify(stats));
                // 대표 11-24: 뒤에 같은 영상이 크고 흐리게 보여야 한다 — 2.8배·blur 6px(실제 약 17px). 3.6배·18px는 칸 전체가 한 색으로 뭉개졌다.
                assert.match(stats.blur,/blur\(6px\)/);
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
        assert.equal(await media.locator('.recent-video-status').isVisible(),false, '실패 안내 대신 표지가 보인다');
        assert.equal(await media.locator('.lt-recent-fallback').isVisible(),failed, '썸네일 실패 시 표지와 제목');
        const after=await card.boundingBox();
        assert.equal(after.height,before.height);
        if(failed){
          const notice=await media.locator('.lt-recent-fallback').boundingBox(),title=await card.locator('.recent-meta strong').boundingBox();
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
      assert.deepEqual(texts, [['순간 4', '정리 전 2'], ['모두의 트리 11', '모두의 순간 42'], ['내 트리 2', '내 공개 트리 1']], JSON.stringify(texts));
      const spoken = await groups.evaluateAll(es => es.map(e => [...e.querySelectorAll('.home-count button')].map(b => b.getAttribute('aria-label'))));
      assert.deepEqual(spoken, [
        ['내 순간 4개 목록 열기', '정리 전 순간 2개 정리하기'],
        ['모두의 트리 11개, 둘러보기 트리 보기로 이동', '모두의 순간 42개, 둘러보기 순간 보기로 이동'],
        ['내 트리 2개, 서재 전체 보기로 이동', '내 공개 트리 1개, 서재 공개만 보기로 이동']
      ], JSON.stringify(spoken));

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

      await h.page.evaluate(() => { window.__msgs1087 = []; window.__msgData1087 = []; addEventListener('message', e => { if (e.data?.type) { window.__msgs1087.push(e.data.type); window.__msgData1087.push({...e.data}); } }); });
      await groups.nth(0).locator('.home-count button', { hasText: '순간 4' }).evaluate(el => el.click());
      await frame.locator('.orbit-dialog .index-list').waitFor({ state: 'visible', timeout: 5000 });
      await h.page.keyboard.press('Escape');
      await frame.locator('.orbit-dialog[open]').waitFor({ state: 'detached', timeout: 5000 });
      await groups.nth(0).locator('.home-count button', { hasText: '정리 전 2' }).evaluate(el => el.click());
      await h.page.waitForFunction(() => window.__msgs1087.includes('lt41-cleanup'), null, { timeout: 5000 });
      await groups.nth(1).locator('.home-count button', { hasText: '모두의 트리 11' }).evaluate(el => el.click());
      await groups.nth(1).locator('.home-count button', { hasText: '모두의 순간 42' }).evaluate(el => el.click());
      await h.page.waitForFunction(() => window.__msgs1087.filter(type => type === 'lt41-community').length >= 2, null, { timeout: 5000 });
      const communityTabs = await h.page.evaluate(() => window.__msgData1087.filter(d => d.type === 'lt41-community').map(d => d.tab));
      assert.ok(communityTabs.includes('trees') && communityTabs.includes('moments'), '가운데 두 줄 → 둘러보기 트리·순간 보기 ' + JSON.stringify(communityTabs));
      await groups.nth(2).locator('.home-count button', { hasText: '내 트리 2' }).evaluate(el => el.click());
      await groups.nth(2).locator('.home-count button', { hasText: '내 공개 트리 1' }).evaluate(el => el.click());
      const navs = await h.page.evaluate(() => window.__msgs1087.filter(t => t === 'lt41-navigate').length);
      assert.ok(navs >= 2, '트리 숫자 둘 → 서재 ' + navs);
      const destinations = await h.page.evaluate(() => window.__msgData1087.filter(d => d.type === 'lt41-navigate' && d.view === 'track32-bookshelf.html').map(d => d.filter));
      assert.ok(destinations.includes('all') && destinations.includes('public'), '오른쪽 두 줄 → 서재 전체·공개만 ' + JSON.stringify(destinations));

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
        if(process.env.LT_1284_BAND_CAPTURE_DIR)await h.page.screenshot({path:`${process.env.LT_1284_BAND_CAPTURE_DIR}/band-${theme}-390.png`,animations:'disabled'});
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
      const open = async () => { await frame.locator('.recent-meta strong').click(); await viewer.waitFor({ state: 'visible', timeout: 5000 }); };
      await open();
      assert.equal(await viewer.getAttribute('aria-hidden'), 'false', '크게 보기 열림');
      assert.equal(await frame.evaluate(() => document.querySelector('#orbit').shadowRoot.activeElement?.id || ''),'mediaCloseHome','설명 창 열면 닫기에 초점');
      assert.equal(await frame.locator('#mediaVisualHome iframe').count(),0,'설명 창은 영상이 즉시 재생되지 않는다');
      await frame.locator('#mediaPlayHome').click();
      const src = await frame.locator('#mediaVisualHome iframe').getAttribute('src');
      assert.match(src, /a1111111111/, '영상 id');
      assert.match(src, /autoplay=1/, '누름 안에서 재생 시작');
      assert.ok(await frame.locator('#mediaBookHome').isVisible(), '책에서 이어 보기');
      assert.ok(await frame.locator('#mediaExternalHome').isVisible(), '원본 보기');
      assert.ok(await h.page.evaluate(() => getComputedStyle(document.getElementById('updates-card')).display === 'none'), '열린 동안 아래 띠가 숨는다');
      assert.equal(await h.page.evaluate(() => location.hash), hashBefore, '주소 moved 0');
      assert.deepEqual(await h.page.evaluate(() => window.__nav1088), [], '화면 이동 요청 0');


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
        // 가운데 빛은 원래 크기 이내로 유지하고, 바깥 테두리의 빛 0은 아래 픽셀 검사로 확인한다.
        assert.ok(state.box.glow[2]<=820&&state.box.glow[3]<=560&&
          (width===1440 ? state.box.glow[2]<state.box.app[2] : state.box.glow[2]<=state.box.app[2]*1.04+2),
          'glow stays in original bounded box: '+JSON.stringify(state.box));
        const capture=process.env.LT_HOME_1204_CAPTURE_DIR;
        if(capture){const {mkdirSync}=await import('node:fs');mkdirSync(capture,{recursive:true});await h.page.screenshot({path:`${capture}/home-1204-${width}-${theme}-${route}.png`});}
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
        // edge. Together with the original bounded scrim geometry assertion
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

// 안내 시계는 페이지 안에서 잰다(addInitScript). 나타난 순간부터 0·150·300ms 시점의 카드·투영 사각형을 기록하고,
// Node는 기록을 읽어 단정만 한다. 기준값과 대기 시간은 바꾸지 않는다.
function TIP_RECORDER() {
  if (window.__LT_TIP_REC__) return;
  const rec = (window.__LT_TIP_REC__ = { tipAt: null, appearAt: null, removedAt: null, snaps: [] });
  const snap = (label) => {
    try {
      const root = document.querySelector('#orbit').shadowRoot, hook = window.__LT_ORBIT_TEST__;
      const index = hook.hintIndex(), card = root.querySelectorAll('.card')[index], tip = card?.querySelector('.lt-card-tip');
      hook.syncDomPoses();
      const app = root.querySelector('.app')?.getBoundingClientRect(), cr = card?.getBoundingClientRect(), tr = tip?.getBoundingClientRect(), pose = hook.poses()[index], box = pose?.box;
      rec.snaps.push({
        label, dt: performance.now() - rec.appearAt, index,
        shown: !!tip && getComputedStyle(tip).opacity === '1' && root.querySelector('.world').classList.contains('lt-hint-ready'),
        bound: tip?.parentElement === card,
        domInside: !!tr && !!cr && tr.left >= cr.left && tr.right <= cr.right && tr.top >= cr.top && tr.bottom <= cr.bottom,
        projected: !!box,
        projInside: !!tr && !!app && !!box && tr.left - app.left >= box.l && tr.top - app.top >= box.t && tr.right - app.left <= box.r && tr.bottom - app.top <= box.b,
        bottomGap: tr && cr ? cr.bottom - tr.bottom : null,
        floatingTip: !!root.querySelector('.lt-orbit-tip'), pulse: card ? getComputedStyle(card, '::after').animationName : null,
        canvasReady: hook.canvasReady(),
      });
    } catch (e) { rec.snaps.push({ label, error: String(e) }); }
  };
  const watch = (root, world) => {
    const check = () => {
      const now = performance.now(), on = world.classList.contains('lt-hint-ready');
      if (rec.tipAt === null && root.querySelector('.lt-card-tip')) rec.tipAt = now;
      if (on && rec.appearAt === null) {
        rec.appearAt = now;
        setTimeout(() => snap('0ms'), 0);
        setTimeout(() => snap('150ms'), 150);
        setTimeout(() => snap('300ms'), 300);
      }
      if (!on && rec.appearAt !== null && rec.removedAt === null) rec.removedAt = now;
    };
    new MutationObserver(check).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    check();
  };
  const find = () => {
    const root = document.querySelector('#orbit')?.shadowRoot, world = root?.querySelector('.world');
    if (world && window.__LT_ORBIT_TEST__) watch(root, world);
    else requestAnimationFrame(find);
  };
  find();
}

test('#1309 첫 방문 안내는 나타나 3초 뒤 사라지고, 누르면 바로 사라지며 재방문에는 나오지 않는다', { skip: REQUIRE952 ? false : skip952, timeout: 240000 }, async () => {
 if (skip952) assert.fail(skip952);
 const browser = await chromium952.launch({ headless: true });
 try {
  const h = await boot952(browser, { width: 1440, motion: 'no-preference', initStorage: { 'lt41.theme': 'night' }, initScript: TIP_RECORDER });
  try {
   await h.frame.waitForFunction(() => window.__LT_TIP_REC__?.snaps.length >= 1, null, { timeout: 20000, polling: 50 });
   const capture = process.env.LT_HOME_1204_CAPTURE_DIR;
   if (capture) { const { mkdirSync } = await import('node:fs'); mkdirSync(capture, { recursive: true }); await h.page.screenshot({ path: capture + '/home-1309-hint-1440-night.png' }); }
   await h.frame.waitForFunction(() => { const r = window.__LT_TIP_REC__; return r.snaps.length >= 3 && r.removedAt !== null; }, null, { timeout: 30000, polling: 50 });
   const rec = await h.frame.evaluate(() => window.__LT_TIP_REC__);
   assert.deepEqual(rec.snaps.map(s => s.label), ['0ms', '150ms', '300ms'], JSON.stringify(rec));
   // 정확한 정렬 2px는 #1382에서 모든 카드에 적용한다. 여기서는 안내 글자가 카드 안, 투영 사각형이 있으면 그 안에 있는지만 본다.
   assert.ok(rec.snaps.every(s => s.index >= 0 && s.shown && s.bound && s.domInside && s.bottomGap >= 0 && s.bottomGap < 40 && !s.floatingTip && s.pulse === 'lt-card-pulse' && (!s.projected || s.projInside)), JSON.stringify(rec.snaps));
   const visibleMs = rec.removedAt - rec.appearAt;
   assert.ok(visibleMs >= 2500 && visibleMs <= 3500, '안내는 약 3초 보인다: ' + visibleMs);
   assert.equal(await h.frame.locator('.lt-card-tip').count(), 0, '3초가 지나면 사라진다');
   assert.equal(await h.frame.evaluate(() => localStorage.getItem('lt41-orbit-card-opened')), '1');
   console.log('TIP_MEASURE ' + JSON.stringify({ tipAt: rec.tipAt, appearAt: rec.appearAt, removedAt: rec.removedAt, visibleMs, snaps: rec.snaps.map(s => ({ label: s.label, dt: Math.round(s.dt), domInside: s.domInside, projected: s.projected, projInside: s.projInside, canvasReady: s.canvasReady })) }));
  } finally { await close952(h); }
  const clicked = await boot952(browser, { width: 1440, motion: 'no-preference', initStorage: { 'lt41.theme': 'night' }, initScript: TIP_RECORDER });
  try {
   await clicked.frame.waitForFunction(() => window.__LT_TIP_REC__?.appearAt != null, null, { timeout: 20000, polling: 50 });
   const index = await clicked.frame.evaluate(() => globalThis.__LT_ORBIT_TEST__.hintIndex());
   await clicked.frame.locator('.card').nth(index).locator('.surface').evaluate(e => e.click());
   assert.equal(await clicked.frame.locator('.lt-card-tip').count(), 0, '누르면 즉시 사라진다');
   assert.equal(await clicked.frame.evaluate(() => localStorage.getItem('lt41-orbit-card-opened')), '1');
   await clicked.page.reload({ waitUntil: 'load' });
   await clicked.page.waitForTimeout(2400);
   assert.equal(await clicked.page.frameLocator('#view').locator('.lt-card-tip').count(), 0, '다음 방문에는 나오지 않는다');
  } finally { await close952(clicked); }
  const returning = await boot952(browser, { width: 1440, initStorage: { 'lt41-orbit-card-opened': '1' } });
  try {
   await returning.page.waitForTimeout(1800);
   assert.equal(await returning.frame.locator('.lt-card-tip').count(), 0, '저장된 첫 방문 기록은 새 문맥에서도 적용된다');
  } finally { await close952(returning); }
 } finally { await browser.close(); }
});

test('#1309 움직임 줄이기에서는 카드 안 글자만 보이고 반짝임은 없다', { skip: REQUIRE952 ? false : skip952, timeout: 180000 }, async () => {
 if (skip952) assert.fail(skip952);
 const browser = await chromium952.launch({ headless: true });
 try {
  const h = await boot952(browser, { width: 1440, motion: 'reduce' }); // #1314 이후 390 세로 리본은 글자가 없어 괤도 배치에서 본다
  try {
   await h.frame.locator('.lt-card-tip').waitFor({ state: 'visible', timeout: 20000 });
   const sample = () => h.frame.evaluate(() => {
    const root = document.querySelector('#orbit').shadowRoot, card = root.querySelector('.lt-card-hint'), tip = card.querySelector('.lt-card-tip');
    const r = tip.getBoundingClientRect(); return { x: r.x, y: r.y, opacity: getComputedStyle(tip).opacity, pulse: getComputedStyle(card, '::after').animationName, rate: card.getAnimations().filter(a => a.effect.target === card).map(a => a.playbackRate) };
   });
   const first = await sample(); await h.page.waitForTimeout(550); const next = await sample();
   assert.equal(first.opacity, '1'); assert.equal(next.opacity, '1');
   assert.equal(first.pulse, 'none'); assert.equal(next.pulse, 'none');
   assert.deepEqual([next.x, next.y], [first.x, first.y]);
   assert.ok(first.rate.every(rate => rate === 0), '움직임 줄이기에서는 띠도 멈춘다');
  } finally { await close952(h); }
 } finally { await browser.close(); }
});

test('#1309 휴대폰 세로는 8장 리본이 흐르고 숫자판·단추·링크와 겹치지 않는다', { skip: REQUIRE952 ? false : skip952, timeout: 240000 }, async () => {
 if (skip952) assert.fail(skip952);
 const browser = await chromium952.launch({ headless: true });
 const sample = (frame) => frame.evaluate(() => {
  const host = document.querySelector('#orbit'), root = host.shadowRoot, hook = globalThis.__LT_ORBIT_TEST__, app = root.querySelector('.app').getBoundingClientRect();
  const all = [...root.querySelectorAll('.card')], cards = all.filter(e => !e.classList.contains('off'));
  const boxes = hook.poses().map((p, i) => p && !p.hidden && cards.includes(all[i]) ? { l: app.left + p.box.l, t: app.top + p.box.t, r: app.left + p.box.r, b: app.top + p.box.b } : null).filter(Boolean);
  const rect = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; };
  const protectedZones = [...root.querySelectorAll('.home-count,.subtleBtn')].map(rect).filter(Boolean);
  const shell = parent.document, ox = frameElement.getBoundingClientRect().left, oy = frameElement.getBoundingClientRect().top;
  for (const e of shell.querySelectorAll('.home-links a,.home-links button,#updates-card,#mobile-add')) {
   const r = rect(e); if (r) protectedZones.push({ l: r.l - ox, t: r.t - oy, r: r.r - ox, b: r.b - oy });
  }
  const hit = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
  let overlaps = 0;
  for (const box of boxes) for (const zone of protectedZones) if (hit(box, zone) > 1) overlaps++;
  const first = boxes[0];
  const bandBottom = protectedZones.length ? Math.min(...protectedZones.map(zone => zone.t)) : null;
  const inBand = bandBottom === null ? boxes.length === 0 : boxes.every(box => box.t >= app.top - 1 && box.b <= bandBottom + 1);
  return { mode: host.dataset.ltLayout, active: cards.length, visible: boxes.length, overlaps, zones: protectedZones.length, first: first && [(first.l + first.r) / 2, (first.t + first.b) / 2], rates: cards.flatMap(e => e.getAnimations().filter(a => a.effect.target === e && !a.effect.pseudoElement).map(a => a.playbackRate)), bandBottom, inBand };
 });
 try {
  for (const theme of ['night', 'garden']) {
   const h = await boot952(browser, { width: 390, height: 844, motion: 'no-preference', initStorage: { 'lt41.theme': theme } });
   try {
    await h.frame.waitForFunction(() => globalThis.__LT_ORBIT_TEST__?.canvasReady(), null, { timeout: 20000 });
    await h.frame.waitForFunction(() => {
     const host=document.querySelector('#orbit'),cards=[...host.shadowRoot.querySelectorAll('.card:not(.off)')];
     return host.dataset.ltLayout==='ribbon'&&cards.length===8&&cards.every(card=>card.getAnimations().filter(a=>a.effect.target===card&&!a.effect.pseudoElement).length===1);
    },null,{timeout:20000});
    // #1314 리본은 배경 띠라서 안내 글자를 띄우지 않는다(테두리 반짝임만 유지). 글자가 제목과 겹치는 것을 막는다.
    await h.frame.waitForFunction(() => document.querySelector('#orbit').shadowRoot.querySelector('.world.lt-hint-ready'), null, { timeout: 20000 });
    const ribbonHint = await h.frame.evaluate(() => { const root = document.querySelector('#orbit').shadowRoot; return { tips: root.querySelectorAll('.lt-card-tip').length, hinted: root.querySelectorAll('.lt-card-hint').length }; });
    assert.equal(ribbonHint.tips, 0, '390 세로 리본에서는 첫 방문 안내 글자를 띄우지 않는다');
    assert.equal(ribbonHint.hinted, 1, '390 세로 리본에서도 첫 방문 테두리 반짝임은 남는다');
    const samples = [];
    for (let i = 0; i < 7; i++) { samples.push(await sample(h.frame)); if (i < 6) await h.page.waitForTimeout(500); }
    assert.ok(samples.every(s => s.mode === 'ribbon' && s.active === 8), JSON.stringify(samples[0]));
    assert.ok(samples.every(s => s.visible >= 3 && s.zones >= 4 && s.overlaps === 0 && s.inBand), JSON.stringify(samples));
    assert.ok(samples.every(s => s.rates.length === 8 && s.rates.every(rate => rate === 1)), '여덟 카드가 같은 느린 흐름으로 움직인다: '+JSON.stringify(samples.map(s=>s.rates)));
    const distance = Math.hypot(samples[6].first[0] - samples[0].first[0], samples[6].first[1] - samples[0].first[1]);
    assert.ok(distance > 3, '3초 동안 카드가 실제로 흐른다: ' + distance);
    console.log('#1309 RIBBON', theme, JSON.stringify({ active: samples[0].active, visible: samples.map(s => s.visible), overlaps: samples.reduce((n, s) => n + s.overlaps, 0), distance: Math.round(distance * 10) / 10 }));
    const capture = process.env.LT_HOME_1204_CAPTURE_DIR;
    if (capture) { const { mkdirSync } = await import('node:fs'); mkdirSync(capture, { recursive: true }); await h.page.screenshot({ path: capture + '/home-1309-ribbon-390-' + theme + '.png' }); }
   } finally { await close952(h); }
  }
 } finally { await browser.close(); }
});

test('#1309 가로 화면과 폴더블 펼침은 겹침·잘림 0이고 궤도 성능을 측정한다', { skip: REQUIRE952 ? false : skip952, timeout: 300000 }, async () => {
 if (skip952) assert.fail(skip952);
 const browser = await chromium952.launch({ headless: true });
 const inspect = (frame, phase) => frame.evaluate(async phase => {
  const host = document.querySelector('#orbit'), root = host.shadowRoot, hook = globalThis.__LT_ORBIT_TEST__, app = root.querySelector('.app').getBoundingClientRect(), center = root.querySelector('.center').getBoundingClientRect();
  hook.seek(phase); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const zone = { l: center.left - 32, t: center.top - 32, r: center.right + 32, b: center.bottom + 32 };
  const hit = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
  const cards = [...root.querySelectorAll('.card')], poses = hook.poses();
  const visible = poses.map((p, i) => p && !p.hidden && !cards[i].classList.contains('off') && !cards[i].classList.contains('clash') ? { l: app.left + p.box.l, t: app.top + p.box.t, r: app.left + p.box.r, b: app.top + p.box.b } : null).filter(Boolean);
  const intrude = visible.filter(b => hit(zone, b) > 1).length;
  const clipped = visible.filter(b => b.l < app.left - 1 || b.t < app.top - 1 || b.r > app.right + 1 || b.b > app.bottom + 1).length;
  const controls = [...root.querySelectorAll('.center h1,.center .actions,.home-count')].map(e => e.getBoundingClientRect());
  const controlClipped = controls.filter(r => r.width > 0 && r.height > 0 && (r.left < app.left - 1 || r.top < app.top - 1 || r.right > app.right + 1 || r.bottom > app.bottom + 1)).length;
  return { mode: host.dataset.ltLayout, visible: visible.length, intrude, clipped, controlClipped, app: { l: app.left, t: app.top, r: app.right, b: app.bottom } };
 }, phase);
 try {
  for (const [width, height, mode] of [[844, 390, 'compact'], [800, 900, 'orbit']]) for (const theme of ['night', 'garden']) {
   const h = await boot952(browser, { width, height, motion: 'reduce', initStorage: { 'lt41.theme': theme } });
   try {
    await h.frame.waitForFunction(() => globalThis.__LT_ORBIT_TEST__?.canvasReady(), null, { timeout: 20000 });
    const samples = [];
    for (const phase of [0, .2, .5, .8]) samples.push(await inspect(h.frame, phase));
    assert.ok(samples.every(s => s.mode === mode && s.visible > 0), JSON.stringify(samples));
    assert.ok(samples.every(s => s.intrude === 0 && s.controlClipped === 0), JSON.stringify(samples));
    if (mode === 'compact') assert.ok(samples.every(s => s.clipped === 0), '가로 카드 잘림 0: ' + JSON.stringify(samples));
    console.log('#1309 VIEWPORT', width, theme, JSON.stringify(samples.map(s => ({ visible: s.visible, intrude: s.intrude, clipped: s.clipped, controlClipped: s.controlClipped }))));
    const capture = process.env.LT_HOME_1204_CAPTURE_DIR;
    if (capture) { const { mkdirSync } = await import('node:fs'); mkdirSync(capture, { recursive: true }); await h.page.screenshot({ path: capture + '/home-1309-' + width + '-' + theme + '.png' }); }
   } finally { await close952(h); }
  }
 } finally { await browser.close(); }
});

test('#1026 첫 화면 카드는 첫 궤도 자리를 받은 뒤에만 보이고 글귀와 같은 프레임에 풀린다', { skip: REQUIRE952 ? false : skip952, timeout: 180000 }, async () => {
  if (skip952) assert.fail(skip952);
  const browser = await chromium952.launch({ headless: true });
  try {
    const h = await boot952(browser, {
      width: 1440, member: false, motion: 'no-preference',
      initScript: () => {
        window.__firstFrame1026 = [];
        const timer = setInterval(() => {
          const sr = document.querySelector('#orbit')?.shadowRoot;
          if (!sr) return;
          const cards = [...sr.querySelectorAll('button.card')];
          const hidden = cards.filter(e => e.classList.contains('lt-first-frame'));
          if (hidden.some(e => e.style.transform)) window.__firstFrame1026.push({ kind: 'hidden-with-position' });
          if (!hidden.length) {
            const shown = cards.filter(e => !e.classList.contains('off'));
            window.__firstFrame1026.push({ kind: 'shown', missing: shown.filter(e => !e.style.transform).length, wait: sr.querySelector('.center')?.hasAttribute('data-lt-home-wait') ? 1 : 0 });
            clearInterval(timer);
          }
        }, 16);
      }
    });
    try {
      await h.frame.waitForFunction(() => window.__firstFrame1026?.some(x => x.kind === 'shown'), null, { timeout: 15000 });
      const frames = await h.frame.evaluate(() => window.__firstFrame1026);
      // 첫 자리를 받은 뒤에도 공개 전까지는 숨겨 유지된다(hidden-with-position은 정상 중간 상태).
      const shown = frames.find(x => x.kind === 'shown');
      assert.equal(shown.missing, 0, '보이는 순간 모든 카드에 궤도 자리가 있다: ' + JSON.stringify(shown));
      assert.equal(shown.wait, 0, '카드와 글귀의 시작이 같은 프레임이다: ' + JSON.stringify(shown));
    } finally { await close952(h); }
  } finally { await browser.close(); }
});

// #1365: 지도에서 첫 화면으로 돌아올 때 빈 구간이 없음을 페이지 안 시계로 잰다.
// 고치기 전 1440·390 모두 약 1.05~1.10초였고, 지금은 0.2초 안이다.
// 최종 기준은 실측 보고로 정하므로 여기서는 '고치기 전보다 빠르다'만 확인하고 측정값을 출력에 남긴다.
test('#1365 지도→첫 화면 전환에서 뼈대가 고치기 전보다 빨리 보인다', { skip: REQUIRE952 ? false : skip952, timeout: 180000 }, async () => {
  if (skip952) assert.fail(skip952);
  const browser = await chromium952.launch({ headless: true });
  try {
    for (const width of [390, 1440]) {
      const h = await boot952(browser, { width, member: true, motion: 'no-preference' });
      try {
        await h.page.evaluate(() => { location.hash = '#network'; });
        await h.page.waitForFunction(() => {
          try { return /track56-network\.html/.test(document.querySelector('#view:not([hidden])')?.contentWindow.location.pathname || ''); }
          catch { return false; }
        }, null, { timeout: 20000 });
        await h.page.waitForTimeout(1200);
        await h.page.evaluate(() => {
          const R = { t0: null, marks: {} };
          window.__LT1365 = R;
          const mark = k => { if (R.t0 !== null && !(k in R.marks)) R.marks[k] = Math.round(performance.now() - R.t0); };
          const poll = () => {
            for (const f of document.querySelectorAll('iframe')) {
              try {
                if (f.hidden || f.closest('[hidden]') || !/home\.html$/.test(f.contentWindow.location.pathname)) continue;
              } catch { continue; }
              mark('frameRevealed');
              const sr = f.contentDocument?.getElementById('orbit')?.shadowRoot;
              const center = sr?.querySelector('.center'), card = sr?.querySelector('.card');
              if (center && !center.hasAttribute('data-lt-home-wait') && card && !card.classList.contains('lt-first-frame')) mark('skeletonVisible');
            }
            if (!('skeletonVisible' in R.marks)) requestAnimationFrame(poll);
          };
          document.querySelector('.brand').addEventListener('click', () => { R.t0 = performance.now(); poll(); }, { once: true, capture: true });
        });
        await h.page.locator('.brand').first().click();
        await h.page.waitForFunction(() => 'skeletonVisible' in window.__LT1365.marks, null, { timeout: 15000 });
        const marks = await h.page.evaluate(() => window.__LT1365.marks);
        console.log(`#1365 ${width} 지도→첫 화면: ${JSON.stringify(marks)}`);
        assert.ok(marks.skeletonVisible < 800, `${width} 뼈대가 고치기 전(약 1050ms)보다 빨라야 한다: ${marks.skeletonVisible}ms`);
      } finally { await close952(h); }
    }
  } finally { await browser.close(); }
});

test('#1378 첫 화면 YouTube 크게 보기 390·1440 × 밤·정원과 닫기', {skip: REQUIRE952 ? false : skip952,timeout:180000},async()=>{
  if(skip952)assert.fail(skip952);
  const {inspectYoutubeIframe,countYoutubeAutoplay}=await import('./helpers/youtube-embed-audit.mjs');
  const browser=await chromium952.launch({headless:true});
  try{
    for(const width of [390,1440])for(const theme of ['night','garden']){
      const tree=createTree({subject:'기억',title:'첫 번째 영상',date:'2026-11-20',emotion:'설렘',note:'기록',url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'},'2026-11-20T00:00:00Z');
      tree.moments[0].image='https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
      tree.moments[0].youtubeThumb=true;
      const workspace={revision:1,state:{version:1,trees:[tree],prefs:{}},subject:'visual-audit-fake',writeSubjectBound:true,savedAt:'2026-11-20T00:00:00Z'};
      const h=await boot952(browser,{member:true,width,initStorage:{'lt41.theme':theme,'lt41.boardTheme':theme==='night'?'night':'paper'},routes:{
        '/api/workspace':r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(workspace)}),
        '/api/youtube/oembed':r=>r.fulfill({status:200,contentType:'application/json',body:'{"title":"Test"}'})
      }});
      try{
        const frame=h.frame;
        await frame.locator('.recent-card').waitFor({state:'visible',timeout:15000});
        const capture=process.env.LT_HOME_YT_CAPTURE_DIR;
        if(capture){const fs=await import('node:fs');fs.mkdirSync(capture,{recursive:true});await h.page.screenshot({path:`${capture}/before-${width}-${theme}.png`});}
        assert.equal(await frame.locator('#mediaVisualHome iframe').count(),0,'카드 상태에서 iframe 없음');
        await frame.locator('.recent-meta strong').click();
        await frame.locator('#mediaViewerHome.open').waitFor({state:'visible'});
        const play=frame.locator('#mediaPlayHome');
        await play.waitFor({state:'visible',timeout:10000});
        await play.click();
        const iframe=frame.locator('#mediaVisualHome iframe');
        await iframe.waitFor({state:'visible'});
        await h.page.locator('body.lt-viewer-open').waitFor({state:'attached'});
        const m=await inspectYoutubeIframe(iframe);
        const outerBlockers=await h.page.evaluate(()=>{
          const host=document.querySelector('#view'),root=host.contentDocument.querySelector('#orbit').shadowRoot;
          const video=root.querySelector('#mediaVisualHome iframe');
          const a=host.getBoundingClientRect(),b=video.getBoundingClientRect();
          return [0.1,0.5,0.9].flatMap(y=>[0.1,0.5,0.9].filter(x=>document.elementFromPoint(a.left+b.left+b.width*x,a.top+b.top+b.height*y)!==host)).length;
        });
        console.log('HOME_PLAYER',JSON.stringify({width,theme,w:m.width,h:m.height,blocked:m.blocked,outerBlockers}));
          assert.equal(m.minimum200,true,`${width} ${theme} player ${m.width}x${m.height}`);
          assert.equal(m.blocked,0,`${width} ${theme} blockers ${m.blockers}`);
          assert.equal(outerBlockers,0,`${width} ${theme} shell overlays on player`);
          assert.ok(await countYoutubeAutoplay(frame)<=1,'autoplay <=1');
          if(capture)await h.page.screenshot({path:`${capture}/after-${width}-${theme}.png`});
          await frame.locator('#mediaCloseHome').evaluate(button=>button.click());
          assert.equal(await frame.locator('#mediaVisualHome iframe').count(),0,'닫은 후 iframe 0');
          assert.equal(await frame.locator('#mediaViewerHome.open').count(),0,'뷰어 닫힘');
      }finally{await close952(h);}
    }
  }finally{await browser.close();}
});

test('#1378 첫 화면 YouTube 재생 불가 시 iframe 제거·원본 링크', {skip: REQUIRE952 ? false : skip952,timeout:120000},async()=>{
  if(skip952)assert.fail(skip952);
  const browser=await chromium952.launch({headless:true});
  try{
    for(const status of [401,404]){
      const tree=createTree({subject:'기억',title:'재생 불가 순간',date:'2026-11-20',emotion:'설렘',note:'기록',url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'},'2026-11-20T00:00:00Z');
      tree.moments[0].image='https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
      tree.moments[0].youtubeThumb=true;
      const workspace={revision:1,state:{version:1,trees:[tree],prefs:{}},subject:'visual-audit-fake',writeSubjectBound:true,savedAt:'2026-11-20T00:00:00Z'};
      const h=await boot952(browser,{member:true,width:390,routes:{
        '/api/workspace':r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(workspace)}),
        '/api/youtube/oembed':r=>r.fulfill({status,contentType:'application/json',body:'{}'})
      }});
      try{
        await h.frame.locator('.recent-meta strong').click();
        await h.frame.locator('#mediaViewerHome.open').waitFor({state:'visible'});
        await h.frame.locator('#mediaExternalHome').waitFor({state:'visible',timeout:15000});
        assert.equal(await h.frame.locator('#mediaVisualHome iframe').count(),0,'재생 불가에서 iframe 0');
        assert.equal(await h.frame.locator('#mediaPlayHome').isVisible(),false,'재생 단추 숨김');
        assert.match(await h.frame.locator('#mediaExternalHome').getAttribute('href'),/youtube\.com\/watch\?v=dQw4w9WgXcQ/,'원본 링크');
        await h.frame.locator('#mediaCloseHome').evaluate(el=>el.click());
        assert.equal(await h.frame.locator('#mediaVisualHome iframe').count(),0,'닫기 후 iframe 0');
      }finally{await close952(h);}
    }
  }finally{await browser.close();}
});


test('#1437 delayed member response does not paint guest title, corrects stale hint without CLS', {skip:REQUIRE952?false:skip952,timeout:180000}, async()=>{
 if(skip952)assert.fail(skip952);
 const {mkdirSync}=await import('node:fs');
 const {join}=await import('node:path');
 const browser=await chromium952.launch({headless:true});
 const server=await serve({},{ port: 4143 }),base='http://127.0.0.1:4143';
 const tree=tree952({subject:'시험 순간',count:3});
 const testCases=[
  {key:'member',member:true,trees:[tree],hint:false,expected:'다시, 그 순간으로.',neverGuest:true},
  {key:'remembered',member:true,trees:[tree],hint:true,expected:'다시, 그 순간으로.',neverGuest:true},
  {key:'empty',member:true,trees:[],hint:true,expected:'내 첫 순간'},
  {key:'logout',member:false,trees:[],hint:true,expected:'좋아하는 순간부터.'}
 ];
 try{
  for(const width of [1440,390])for(const scenario of testCases){
   const ctx=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'reduce'});
   try{
    await ctx.addInitScript(hint=>{
     if(hint){try{localStorage.setItem('lt41.homeTitleHasMoments.v1','1')}catch{}}
     globalThis.__1437Titles=[];
     if(location.pathname.endsWith('/home.html')){
      const probe=()=>{
       const root=document.querySelector('#orbit')?.shadowRoot,center=root?.querySelector('.center');
       if(center){const title=center.querySelector('h1')?.textContent||'',r=center.getBoundingClientRect();
        const last=globalThis.__1437Titles.at(-1);
        if(!last||last.title!==title||last.pending!==center.hasAttribute('data-lt-title-pending'))globalThis.__1437Titles.push({title,pending:center.hasAttribute('data-lt-title-pending'),height:r.height});}
       requestAnimationFrame(probe);
      };requestAnimationFrame(probe);
     }
    },scenario.hint);
    const workspace={revision:1,state:{version:1,trees:scenario.trees,prefs:{}},subject:'home-title-test',writeSubjectBound:true,savedAt:'2026-11-26T00:00:00Z'};
    await ctx.route('**/*',async route=>{
     const u=new URL(route.request().url());
     if(u.origin!==base)return route.abort();
     if(u.pathname==='/api/workspace'){
      await new Promise(resolve=>setTimeout(resolve,1500));
      return scenario.member?route.fulfill({status:200,json:workspace}):route.fulfill({status:401,json:{error:'unauthorized'}});
     }
     if(u.pathname.startsWith('/api/'))return route.fulfill({status:200,json:{ok:true,items:[]}});
     return route.continue();
    });
    const page=await ctx.newPage();
    const capture=process.env.LT_HOME_1437_CAPTURE_DIR;
    await page.goto(base+'/v41/'+(scenario.member?'?account=1':'')+'#home',{waitUntil:'domcontentloaded'});
    if(capture&&scenario.key==='member'){
     mkdirSync(capture,{recursive:true});
     await page.screenshot({path:join(capture,`home-${width}-before.png`)});
     await page.waitForTimeout(700);
     await page.screenshot({path:join(capture,`home-${width}-during.png`)});
    }
    await page.waitForFunction(expect=>{
     const frame=document.querySelector('#view');
     return frame?.contentDocument?.querySelector('#orbit')?.shadowRoot?.querySelector('.center h1')?.textContent===expect;
    },scenario.expected,{timeout:20000});
    if(capture&&scenario.key==='member')await page.screenshot({path:join(capture,`home-${width}-after.png`)});
    const result=await page.evaluate(()=>{
     const f=document.querySelector('#view'),doc=f.contentDocument;
     return {titles:doc.defaultView.__1437Titles||[],phase:document.documentElement.dataset.ltAuthPhase,headline:doc.querySelector('#orbit')?.shadowRoot?.querySelector('.center h1')?.textContent};
    });
    if(scenario.neverGuest)assert.ok(result.titles.every(row=>row.title!=='좋아하는 순간부터.'),JSON.stringify({width,scenario:scenario.key,result}));
    assert.equal(result.headline,scenario.expected);
    assert.equal(result.phase,'ready');
    const h=result.titles.filter(t=>t.height>0).map(t=>t.height);
    if(h.length>1)assert.ok(Math.max(...h)-Math.min(...h)<=1,`${width} ${scenario.key}: center shift ${h.join(',')}`);
    console.log('#1437',width,scenario.key,JSON.stringify(result));
    await page.close();
   }finally{await ctx.close()}
  }
 }finally{await browser.close();await new Promise(ok=>server.close(ok));}
});


test('#1437 pending center is text-free until confirmed response and reserves stable height', {skip:REQUIRE952?false:skip952,timeout:90000},async()=>{
 if(skip952)assert.fail(skip952);
 const browser=await chromium952.launch({headless:true,args:['--disable-gpu']});
 const server=await serve({'/1437-harness.html':'<!doctype html><html><head><script>document.documentElement.dataset.ltAuthPhase="pending";</script></head><body data-member="out" style="margin:0"><iframe src="/v41/home.html" style="border:0;width:100vw;height:100vh"></iframe></body></html>'},{ port: 4144 }),base='http://127.0.0.1:4144';
 const {mkdirSync}=await import('node:fs');const {join}=await import('node:path');
 const tree=tree952({subject:'시험 순간',count:3});
 try{
  for(const width of [1440,390])for(const asMember of [true,false]){
   const ctx=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'reduce'});
   try{
    await ctx.route('**/*',route=>{
     const u=new URL(route.request().url());if(u.origin!==base)return route.abort();
     if(u.pathname.startsWith('/api/'))return route.fulfill({status:200,json:{ok:true,items:[]}});
     return route.continue();
    });
    const page=await ctx.newPage();
    await page.goto(base+'/1437-harness.html',{waitUntil:'domcontentloaded'});
    const frame=await (await page.$('iframe')).contentFrame();
    await frame.waitForFunction(()=>document.querySelector('#orbit')?.shadowRoot?.querySelector('.center[data-lt-title-pending]'),null,{timeout:15000});
    const measure=()=>frame.evaluate(()=>{
     const center=document.querySelector('#orbit').shadowRoot.querySelector('.center');
     return {title:center.querySelector('h1')?.textContent||'',eyebrow:center.querySelector('.eyebrow')?.textContent||'',p:center.querySelector('p')?.textContent||'',actions:[...center.querySelectorAll('.actions button')].map(b=>b.textContent),pending:center.hasAttribute('data-lt-title-pending'),actionsHidden:getComputedStyle(center.querySelector('.actions')).visibility==='hidden',height:center.getBoundingClientRect().height};
    });
    const before=await measure();
    assert.ok(before.pending&&!before.title&&!before.eyebrow&&!before.p&&before.actionsHidden,JSON.stringify(before));
    const capture=process.env.LT_HOME_1437_PENDING_CAPTURE_DIR;
    if(capture&&asMember){mkdirSync(capture,{recursive:true});await page.screenshot({path:join(capture,`pending-${width}-before.png`),animations:'disabled',timeout:15000});}
    await page.waitForTimeout(750);
    const middle=await measure();assert.equal(middle.title,'');assert.equal(middle.pending,true);
    if(capture&&asMember)await page.screenshot({path:join(capture,`pending-${width}-during.png`),animations:'disabled',timeout:15000});
    await page.waitForTimeout(750);
    await page.evaluate(({tree,asMember})=>{
     window.LT41={trees:asMember?[tree]:[]};document.body.dataset.member=asMember?'in':'out';document.documentElement.dataset.ltAuthPhase='ready';
    },{tree,asMember});
    await frame.waitForFunction(expected=>document.querySelector('#orbit')?.shadowRoot?.querySelector('.center h1')?.textContent===expected,asMember?'다시, 그 순간으로.':'좋아하는 순간부터.',{timeout:5000});
    const after=await measure();
    if(capture&&asMember)await page.screenshot({path:join(capture,`pending-${width}-after.png`),animations:'disabled',timeout:15000});
    assert.equal(after.pending,false);assert.equal(after.actionsHidden,false);assert.ok(after.actions.every(Boolean));
    assert.ok(Math.abs(after.height-before.height)<=1,`${width}: ${before.height} -> ${after.height}`);
    console.log('#1437 PENDING',width,asMember?'member':'guest',JSON.stringify({before,middle,after}));
    await page.close();
   }finally{await ctx.close()}
  }
 }finally{await browser.close();await new Promise(ok=>server.close(ok));}
});


test('#1442 title wait 400ms and slow 5s, owned empty has no example cards', {skip:REQUIRE952?false:skip952,timeout:180000}, async()=>{
 if(skip952)assert.fail(skip952);
 const {mkdirSync}=await import('node:fs');const {join}=await import('node:path');
 const capture=process.env.LT_HOME_1442_CAPTURE_DIR;
 const harness=(member,phase)=>`<!doctype html><html><head><script>document.documentElement.dataset.ltAuthPhase='${phase}';</script></head><body data-member='${member}' data-tree-count='0' style='margin:0'><iframe src='/v41/home.html' style='width:100vw;height:100vh;border:0'></iframe></body></html>`;
 const server=await serve({'/1442-pending.html':harness('out','pending'),'/1442-empty.html':harness('in','ready'),'/1442-guest.html':harness('out','ready')},{ port: 4147 });
 const browser=await chromium952.launch({headless:true,args:['--disable-gpu']});
 const tree=tree952({subject:'시험 순간',count:3});
 try{
  for(const width of [1440,390])for(const theme of ['night','garden']){
   const ctx=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'reduce'});
   try{
    await ctx.addInitScript(themeName=>{try{localStorage.setItem('lt41.theme',themeName)}catch{}},theme);
    await ctx.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://127.0.0.1:4147')return route.abort();if(u.pathname.startsWith('/api/'))return route.fulfill({status:200,json:{ok:true,items:[]}});return route.continue();});
    const page=await ctx.newPage();
    const snap=async state=>{if(capture){mkdirSync(capture,{recursive:true});await page.screenshot({path:join(capture,`home-${width}-${theme}-${state}.png`),animations:'disabled',timeout:20000});}};
    const center=async frame=>frame.evaluate(()=>{const root=document.querySelector('#orbit')?.shadowRoot,c=root?.querySelector('.center'),indicator=c?.querySelector('.lt-home-pending-indicator');return {title:c?.querySelector('h1')?.textContent||'',height:c?.getBoundingClientRect().height||0,pending:!!c?.hasAttribute('data-lt-title-pending'),loading:!!indicator&&!indicator.hidden,slow:!!indicator&&!indicator.querySelector('.lt-home-pending-retry')?.hidden,exampleCards:[...(root?.querySelectorAll('.card')||[])].filter(e=>e.dataset.example==='1').length,allCards:root?.querySelectorAll('.card').length||0,buttons:[...(c?.querySelectorAll('.actions button')||[])].filter(b=>!b.hidden).map(b=>b.textContent),motion:indicator?getComputedStyle(indicator.querySelector('.lt-home-pending-orbit')).animationName:''};});
    await page.goto('http://127.0.0.1:4147/1442-pending.html',{waitUntil:'domcontentloaded'});
    let frame=await (await page.$('iframe')).contentFrame();
    await frame.waitForFunction(()=>document.querySelector('#orbit')?.shadowRoot?.querySelector('.center[data-lt-title-pending]'),null,{timeout:15000});
    const initial=await center(frame);assert.equal(initial.title,'');
    await page.waitForTimeout(650);
    const pending=await center(frame);assert.equal(pending.loading,true);assert.equal(pending.slow,false);assert.equal(pending.motion,'none');assert.equal(pending.title,'');await snap('pending');
    await page.waitForTimeout(4700);
    const slow=await center(frame);assert.equal(slow.slow,true);assert.equal(slow.title,'');await snap('slow');
    await page.evaluate(t=>{window.LT41={trees:[t]};document.body.dataset.member='in';document.body.dataset.treeCount='1';document.documentElement.dataset.ltAuthPhase='ready';},tree);
    await frame.waitForFunction(()=>document.querySelector('#orbit')?.shadowRoot?.querySelector('.center h1')?.textContent==='다시, 그 순간으로.',null,{timeout:5000});
    const ready=await center(frame);assert.equal(ready.loading,false);assert.equal(ready.pending,false);assert.ok(Math.abs(ready.height-pending.height)<=1);await snap('ready');
    console.log('#1442 WAIT',width,theme,JSON.stringify({initial,pending,slow,ready}));
    await page.goto('http://127.0.0.1:4147/1442-empty.html',{waitUntil:'domcontentloaded'});
    frame=await (await page.$('iframe')).contentFrame();
    await frame.waitForFunction(()=>document.querySelector('#orbit')?.shadowRoot?.querySelector('.center h1')?.textContent==='내 첫 순간',null,{timeout:15000});
    await frame.evaluate(async()=>{
      await document.fonts.ready;
      const root=document.querySelector('#orbit')?.shadowRoot;
      await Promise.all([...root.querySelectorAll('.center .lt-home-enter')].flatMap(el=>el.getAnimations()).map(anim=>anim.finished.catch(()=>{})));
     });
     const ink=await frame.evaluate(()=>{const root=document.querySelector('#orbit')?.shadowRoot,eyebrow=root?.querySelector('.center .eyebrow'),line=root?.querySelector('.center .lt-home-line');return {eyebrow:eyebrow?.textContent,description:line?.textContent,color:line?getComputedStyle(line).color:null,animation:line?.getAnimations().map(a=>a.playState)||[]};});
     assert.equal(ink.eyebrow,'처음 시작해요');assert.equal(ink.description,'첫 순간을 남겨 보세요.');
     assert.ok(ink.color);assert.ok(ink.animation.every(state=>state==='finished'||state==='idle'));
     console.log('#1442 TREE0_TEXT',width,theme,JSON.stringify(ink));
     const zero=await center(frame);assert.equal(zero.allCards,0);assert.equal(zero.exampleCards,0);assert.equal(zero.buttons.length,2);assert.deepEqual(zero.buttons,['첫 순간 추가','예시 둘러보기']);await snap('tree0');
    await page.goto('http://127.0.0.1:4147/1442-guest.html',{waitUntil:'domcontentloaded'});
    frame=await (await page.$('iframe')).contentFrame();
    await frame.waitForFunction(()=>document.querySelector('#orbit')?.shadowRoot?.querySelector('.center h1')?.textContent==='좋아하는 순간부터.',null,{timeout:15000});
    const guest=await center(frame);assert.ok(guest.allCards>0);console.log('#1442 EMPTY',width,theme,JSON.stringify({zero,guest}));
    await page.goto('http://127.0.0.1:4147/1442-pending.html',{waitUntil:'domcontentloaded'});
    frame=await (await page.$('iframe')).contentFrame();
    await frame.waitForFunction(()=>document.querySelector('#orbit')?.shadowRoot?.querySelector('.center[data-lt-title-pending]'));
    const zeroBefore=await center(frame);
    await page.evaluate(()=>{window.LT41={trees:[]};document.body.dataset.member='in';document.body.dataset.treeCount='0';document.documentElement.dataset.ltAuthPhase='ready';});
    await frame.waitForFunction(()=>document.querySelector('#orbit')?.shadowRoot?.querySelector('.center h1')?.textContent==='내 첫 순간');
    const zeroAfter=await center(frame);
    console.log('#1442 ZERO_TRANSITION',width,theme,JSON.stringify({zeroBefore,zeroAfter}));
    assert.equal(zeroAfter.allCards,0);
    assert.ok(Math.abs(zeroAfter.height-zeroBefore.height)<=1,`${width} ${theme} tree0 CLS height: ${zeroBefore.height} vs ${zeroAfter.height}`);
    await page.evaluate(()=>{window.__homeMessages=[];window.addEventListener('message',event=>window.__homeMessages.push(event.data));});
    await frame.locator('.center .actions button').first().click();
    await page.waitForFunction(()=>window.__homeMessages?.some(message=>message?.mode==='new'),null,{timeout:4000});
    const firstMomentMessages=await page.evaluate(()=>window.__homeMessages.filter(message=>message?.mode==='new').length);
    assert.equal(firstMomentMessages,1,`첫 순간 추가 동작은 한 번만 보내야 합니다: ${width} ${theme}`);
    await page.evaluate(()=>localStorage.setItem('lt41.homeTitleHasMoments.v1','1'));
    await page.goto('http://127.0.0.1:4147/1442-pending.html',{waitUntil:'domcontentloaded'});
    frame=await (await page.$('iframe')).contentFrame();
    await frame.waitForFunction(()=>document.querySelector('#orbit')?.shadowRoot?.querySelector('.center h1')?.textContent==='다시, 그 순간으로.',null,{timeout:15000});
    const hint=await center(frame);
    assert.equal(hint.loading,false);assert.equal(hint.pending,false);
    await page.evaluate(()=>localStorage.removeItem('lt41.homeTitleHasMoments.v1'));

    await page.close();
   }finally{await ctx.close()}
  }
 }finally{await browser.close();await new Promise(ok=>server.close(ok));}
});


// #1487(2026-11-27): 트리 0개 계정의 첫 화면과, 로그인 확인 중 안쪽 화면 주소의 첫 그림.
// - 트리 0개로 확정되면 '불러오는 중' 덮개가 걷히고, 가운데 '첫 순간 추가'·머리줄 추가(1440)·+ 단추(390)가 보인다.
//   (덮개는 궤도 카드가 생길 때만 걷혀, 카드를 없애는 트리 0개 화면에서 영원히 남았다.)
// - 로그인 확인 중에는 안쪽 화면 주소도 '불러오는 중'이고, 손님 안내(로그인하면 내 … 보여요)는 손님으로 확정된 뒤에만 보인다.
async function boot1487(browser, { width, hash, workspace, hold = false }) {
  const server = await serve({});
  const base = 'http://127.0.0.1:' + server.address().port;
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('lt41.updatesSeen', '999.0.0'); localStorage.setItem('lt41.tips.firstTree', '1'); } catch {}
    // 확인 중(data-lt-auth-phase=pending)에 손님 안내가 한 번이라도 보였는지 기록한다.
    window.__lt1487 = { guestWhilePending: false };
    setInterval(() => {
      const empty = document.getElementById('empty');
      if (document.documentElement.dataset.ltAuthPhase === 'pending' && empty && !empty.hidden && empty.dataset.emptyGuest === '1') window.__lt1487.guestWhilePending = true;
    }, 25);
  });
  let release = () => {};
  const held = hold ? new Promise(ok => { release = ok; }) : null;
  await ctx.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== base) return route.abort();
    if (u.pathname === '/api/workspace' || u.pathname === '/api/account') {
      if (held) await held;
      if (!workspace) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' }).catch(() => {});
      if (u.pathname === '/api/account') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, subject: workspace.subject }) }).catch(() => {});
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workspace) }).catch(() => {});
    }
    if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' });
    return route.continue();
  });
  const page = await ctx.newPage();
  await page.goto(base + '/v41/?account=1' + hash, { waitUntil: 'load' });
  return { server, ctx, page, release: () => release() };
}

const visible1487 = (page, id) => page.evaluate((i) => { const e = document.getElementById(i); return !!e && !e.hidden && e.checkVisibility({ opacityProperty: true, visibilityProperty: true }); }, id);

test('#1487 트리 0개 첫 화면: 불러오는 중이 걷히고 첫 순간 추가·머리줄 추가·+ 단추가 보인다(1440·390)', { skip: REQUIRE952 ? false : skip952, timeout: 180000 }, async () => {
  if (skip952) assert.fail(skip952);
  const browser = await chromium952.launch({ headless: true });
  const workspace = { revision: 1, state: { version: 1, trees: [], prefs: {} }, subject: 'qa-empty-fake', writeSubjectBound: true, savedAt: '2026-11-27T00:00:00.000Z' };
  try {
    for (const width of [1440, 390]) {
      // 실제 방문처럼 주소 꼬리 없이 연다(첫 화면 덮개가 이 길로 시작된다).
      const h = await boot1487(browser, { width, hash: '', workspace });
      try {
        await h.page.waitForFunction(() => document.documentElement.dataset.ltAuthPhase === 'ready' && document.body.dataset.member === 'in', null, { timeout: 20000 });
        // 가운데 트리 0개 안내가 그려질 때까지(덮개가 있어도 아래에는 그려진다).
        const add = h.page.frameLocator('#view').locator('.center[data-lt-empty-owned] .actions [data-do="new"]');
        await add.waitFor({ state: 'attached', timeout: 15000 });
        // 덮개는 표시 지연(0.8초)이 지난 뒤에도 걷혀 있어야 한다(느림 안내는 10초) — 이전에는 끝까지 남아 '느리게 불러오고 있어요'가 떴다.
        await h.page.waitForTimeout(1500);
        const lifted = await h.page.waitForFunction(() => document.getElementById('stage-loading')?.hidden === true, null, { timeout: 6000 }).then(() => true, () => false);
        assert.equal(lifted, true, width + ': 트리 0개로 확정된 뒤 불러오는 중 덮개가 걷힌다');
        assert.equal(await visible1487(h.page, 'stage-loading-retry'), false, width + ': 느림 안내가 없다');
        // 가운데 '첫 순간 추가'가 보이고, 그 자리를 셸에서 눌러도 덮개가 아니라 화면이 받는다.
        assert.equal(await add.isVisible(), true, width + ': 가운데 첫 순간 추가 단추가 보인다');
        const box = await add.boundingBox();
        assert.ok(box, width + ': 첫 순간 추가 단추 위치');
        const hit = await h.page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e ? (e.id || e.tagName) : ''; }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
        assert.equal(hit, 'view', width + ': 첫 순간 추가 자리를 덮는 셸 요소가 없다 (' + hit + ')');
        // 머리줄 추가(넓은 화면)·떠 있는 + 단추(휴대폰)가 첫 순간 입구로 보인다.
        if (width === 1440) assert.equal(await visible1487(h.page, 'write-menu'), true, '1440: 머리줄 ＋ 순간 추가가 보인다');
        else assert.equal(await visible1487(h.page, 'mobile-add'), true, '390: 떠 있는 ＋ 단추가 보인다');
      } finally {
        await h.ctx.close();
        await new Promise(r => h.server.close(r));
      }
    }
  } finally { await browser.close(); }
});

test('#1487 로그인 확인 중 서재 주소: 불러오는 중을 보이고, 손님 안내는 손님으로 확정된 뒤에만 보인다', { skip: REQUIRE952 ? false : skip952, timeout: 180000 }, async () => {
  if (skip952) assert.fail(skip952);
  const browser = await chromium952.launch({ headless: true });
  const tree = tree952({ subject: '확인 중 시험', count: 2 });
  const member = { revision: 1, state: { version: 1, trees: [tree], prefs: {} }, subject: 'qa-pending-fake', writeSubjectBound: true, savedAt: '2026-11-27T00:00:00.000Z' };
  try {
    // 주소로 들어온 경우와, 첫 화면에서 확인 중에 머리줄 탭으로 서재를 연 경우(#1487 후속).
    for (const [label, workspace, via] of [['손님', null, 'address'], ['회원', member, 'address'], ['손님·탭', null, 'tab'], ['회원·탭', member, 'tab']]) {
      const h = await boot1487(browser, { width: 1440, hash: via === 'tab' ? '' : '#my/shelf', workspace, hold: true });
      try {
        if (via === 'tab') {
          await h.page.waitForTimeout(500);
          await h.page.locator('#tree-views button[data-view="track32-bookshelf.html"]').click();
        }
        // 계정 확인 응답을 붙잡은 채 1.5초(덮개 표시 지연 0.8초보다 길게) 본다.
        await h.page.waitForTimeout(1500);
        assert.equal(await h.page.evaluate(() => document.documentElement.dataset.ltAuthPhase), 'pending', label + ': 아직 확인 중');
        assert.equal(await visible1487(h.page, 'stage-loading'), true, label + ': 확인 중에는 불러오는 중 덮개가 보인다');
        assert.equal(await visible1487(h.page, 'empty'), false, label + ': 확인 중에는 빈 상태 안내를 보이지 않는다');
        h.release();
        await h.page.waitForFunction(() => document.documentElement.dataset.ltAuthPhase === 'ready', null, { timeout: 20000 });
        if (!workspace) {
          await h.page.waitForFunction(() => { const e = document.getElementById('empty'); return e && !e.hidden && e.dataset.emptyGuest === '1'; }, null, { timeout: 10000 });
          await h.page.waitForFunction(() => document.getElementById('stage-loading')?.hidden === true, null, { timeout: 5000 });
        } else {
          await h.page.waitForFunction(() => { const f = document.getElementById('view'); try { return !f.hidden && f.contentWindow.location.pathname.endsWith('/track32-bookshelf.html'); } catch { return false; } }, null, { timeout: 20000 });
          assert.equal(await visible1487(h.page, 'empty'), false, '회원: 서재가 열리면 빈 상태 안내가 없다');
          const lifted = await h.page.waitForFunction(() => document.getElementById('stage-loading')?.hidden === true, null, { timeout: 5000 }).then(() => true, () => false);
          assert.equal(lifted, true, '회원: 서재가 열리면 불러오는 중 덮개가 걷힌다');
        }
        assert.equal(await h.page.evaluate(() => window.__lt1487.guestWhilePending), false, label + ': 확인 중에 손님 안내가 한 번도 보이지 않았다');
      } finally {
        await h.ctx.close();
        await new Promise(r => h.server.close(r));
      }
    }
  } finally { await browser.close(); }
});
