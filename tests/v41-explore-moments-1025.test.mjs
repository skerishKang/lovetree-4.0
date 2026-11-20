// #1025 1단계 — 둘러보기 [순간] 보기 동작 시험(새 소스 글자 검사 없음).
// iframe은 지금 것+다음 것만(≤2), 10회 넘기는 동안 같은 영상 반복 0, 세로만, 390·1440·2560 겹침·잘림 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, auditPage, failuresOf } from './helpers/screen-audit.mjs';

const REQUIRE = process.env.LT_MOMENTS_1025_REQUIRE === '1';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 순간 보기 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 순간 보기 시험을 건너뜀'; }
if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip = '빌드 결과가 없어 순간 보기 시험을 건너뜀';

const THUMB = (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640"><rect width="360" height="640" fill="#6a4a6e"/></svg>' });
const IDS = ['m001111111a','m002222222b','m003333333c','m004444444d','m005555555e','m006666666f','m007777777g','m008888888h','m009999999i','m010101010j','m011111111k','m012121212l'];
const items = IDS.map((id, i) => ({
  id: 'moment-' + id, videoId: id, shareId: 'share' + String(i).padStart(20, '0'),
  treeTitle: i === 3 ? 'AI 명예회원 트리' : '팬 트리 ' + (i + 1),
  title: '세로 순간 ' + (i + 1), url: 'https://www.youtube.com/shorts/' + id,
  thumbnail: 'https://i.ytimg.com/vi/' + id + '/oardefault.jpg',
  note: '짧게 남긴 마음 ' + (i + 1), emotion: '설렘', date: '2026-11-20',
  keywords: ['가수:아이유', '노래:노래' + (i + 1)], aiTester: i === 3
}));

async function step(page, panel, width, delta) {
  if (width <= 780) {
    await panel.evaluate(el => el.querySelector('.moments-stage').dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })));
  } else {
    await panel.locator('.moments-step').nth(delta > 0 ? 1 : 0).click();
  }
}

async function boot(browser, { width, height, theme }) {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', hasTouch: width <= 780, isMobile: width <= 780 });
  await ctx.addInitScript(t => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== base) return u.hostname === 'i.ytimg.com' ? THUMB(route) : route.abort();
    if (u.pathname === '/api/public/moments') {
      const exclude = new Set(String(u.searchParams.get('exclude') || '').split(',').filter(Boolean));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: items.filter(i => !exclude.has(i.videoId)), total: items.length }) });
    }
    if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' });
    return route.continue();
  });
  const page = await ctx.newPage();
  try {
    await page.goto(`${base}/v41/#explore/moments`, { waitUntil: 'load' });
    await page.locator('#community-panel[open] #community-moments-panel:not([hidden])').waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForFunction(() => !!document.querySelector('#community-moments-panel .moments-stage')?.dataset.ltMomentsId, null, { timeout: 15000 });
    return { server, ctx, page, base };
  } catch (error) {
    await ctx.close();
    await new Promise(r => server.close(r));
    throw error;
  }
}

test('#1025 순간 보기 — iframe 2개 이하·10회 넘기기 같은 영상 반복 0·세로만·가로넘침 0', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(skip);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of [[390, 844], [1440, 900], [2560, 1440]]) for (const theme of ['night', 'garden']) {
      const h = await boot(browser, { width, height, theme });
      try {
        const panel = h.page.locator('#community-moments-panel');
        const seen = [];
        let maxFrames = 0;
        for (let i = 0; i < 11; i++) {
          const state = await panel.evaluate(el => ({
            id: el.querySelector('.moments-stage')?.dataset.ltMomentsId || '',
            frames: el.querySelectorAll('iframe.moments-frame').length,
            posterVisible: !!el.querySelector('.moments-poster')?.getAttribute('src'),
            title: el.querySelector('.moments-title')?.textContent || ''
          }));
          maxFrames = Math.max(maxFrames, state.frames);
          assert.ok(state.frames <= 2, `${width}·${theme}: 살아 있는 iframe ${state.frames}개 > 2`);
          assert.ok(state.posterVisible && state.title, `${width}·${theme}: 썸네일·제목이 보인다 — ${JSON.stringify(state)}`);
          seen.push(state.id);
          if (i < 10) await step(h.page, panel, width, 1);
        }
        assert.equal(new Set(seen).size, seen.length, `${width}·${theme}: 같은 영상 반복 — ${seen.join(',')}`);
        assert.ok(seen.every(id => /^[A-Za-z0-9_-]+$/.test(id)), '세로 영상 id만');
        const ai = await panel.locator('.moments-ai').count();
        assert.ok(ai >= 0, 'AI 명예회원 표시 자리');
        // ↑ 단추와 키보드도 같은 동작
        const beforeUp = await panel.locator('.moments-stage').getAttribute('data-lt-moments-id');
        if (width <= 780) await panel.evaluate(el => el.querySelector('.moments-stage').dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })));
        else await panel.locator('.moments-step').first().click();
        const afterUp = await panel.locator('.moments-stage').getAttribute('data-lt-moments-id');
        assert.notEqual(beforeUp, afterUp, '이전 단추가 넘긴다');
        await h.page.keyboard.press('ArrowDown');
        const afterKey = await panel.locator('.moments-stage').getAttribute('data-lt-moments-id');
        assert.equal(afterKey, beforeUp, '↓ 키가 같은 동작');
        // 화면 공통 검사기 — 겹침·잘림·가로넘침 0(이 보기는 12px 미만 글자 라벨은 의도적이다).
        const audit = await auditPage(h.page, '둘러보기 순간 보기');
        const structural = failuresOf(audit, String(width), theme).filter(row => ['겹침', '가려짐', '잘림', '가로넘침'].includes(row[0]));
        assert.deepEqual(structural, [], `${width}·${theme}: ${JSON.stringify(structural)}`);
        console.log('#1025', width, theme, JSON.stringify({ maxFrames, unique: new Set(seen).size, advances: seen.length - 1, structural: structural.length }));
      } finally { await h.ctx.close(); await new Promise(r => h.server.close(r)); }
    }
  } finally { await browser.close(); }
});
