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
        const cards = await cardStats(h.frame.locator('.card'));
        assert.ok(cards.length > 0, `${member ? '회원' : '예시'} 궤도에 카드가 그려진다`);
        assert.ok(cards.every(c => c.opacity === '1'), '카드는 인라인으로 불투명도를 낮추지 않는다(전: 예시 카드가 반투명했던 #429 결함)');
        assert.ok(cards.some(c => c.filter.includes('brightness')), '깊이는 밝기(brightness) 필터로 낸다');
        if (member) {
          const mine = cards.filter(c => c.mine);
          assert.ok(mine.length > 0, '내 카드가 궤도에 있다');
          assert.ok(mine.every(c => c.borderWidth === '3px' && c.border === 'rgb(230, 177, 76)'), '내 카드는 금빛 테두리(--lt-gold-deep)다: ' + JSON.stringify(mine[0]));
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
      // 내 카드를 누르면 예시 문구 대신 내 순간(책)으로 간다 — lt41-open-book이 셸에 닿는다.
      await h.page.evaluate(() => { window.__opened = []; addEventListener('message', e => { if (e.data?.type === 'lt41-open-book') window.__opened.push(e.data.treeId + '/' + e.data.id); }); });
      await video.first().locator('.surface').evaluate(e => e.click());
      await h.page.waitForFunction(() => (window.__opened || []).length > 0, null, { timeout: 5000 });
      assert.ok((await h.page.evaluate(() => window.__opened))[0].length > 0, '내 영상 카드는 내 순간 열기(lt41-open-book)로 이어진다');
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
      const cardY = () => h.frame.locator('.card').first().evaluate(e => e.getBoundingClientRect().y);
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
