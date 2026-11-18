import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

const REQUIRE = process.env.LT_CHIPS_REQUIRE === '1';
const SHOT = process.env.LT_CHIPS_SHOT_DIR || '';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 화면 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 화면 시험을 건너뜀'; }
if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip = '빌드 결과가 없어 화면 시험을 건너뜀';

const MINE = ['BTS', 'RESCENE'];
const PUBLIC = ['하츠투하츠', '아이브', 'RIIZE', '뉴진스', '에스파', '레드벨벳'];
const GROUPS = PUBLIC.map((value, index) => ({ value, count: 20 - index }));

function tree() {
  let t = createTree({ subject: '시험', title: '시험 트리', note: '', emotion: '설렘', date: '2026-11-18', url: '' }, '2026-11-18T00:00:00Z');
  t.moments[0].keywords = [`가수:${MINE[0]}`];
  t = addMoment(t, { title: '둘째', note: '', emotion: '설렘', date: '2026-11-17', url: '' }, t.moments[0].id, '2026-11-18T00:00:01Z');
  t.moments.at(-1).keywords = [`가수:${MINE[1]}`];
  return t;
}

test('#784 그룹 칩 한 줄·내 가수 먼저·페이지 넘침 0', { skip: skip || !REQUIRE ? skip || 'LT_CHIPS_REQUIRE=1 일 때 실행' : false }, async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); } catch {} });
      await ctx.route('**://i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#333"/></svg>' }));
      await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
      const state = { version: 1, trees: [tree()], prefs: {} };
      await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-18T09:00:00.000Z' }) }));
      await ctx.route('**/api/community/shares**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], totalVisible: 0, nextCursor: '', groups: GROUPS }) }));
      const page = await ctx.newPage();
      await page.goto(`${origin}/v41/?account=1`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
      await page.locator('#discover-ask-no').click().catch(() => {});
      if (await page.locator('#community-menu').isVisible()) await page.locator('#community-menu').click();
      else { await page.click('#mobile-more'); await page.click('#header-overflow button:text-is("둘러보기")'); }
      await page.waitForFunction(() => document.getElementById('community-panel')?.open && document.querySelectorAll('#community-groups .community-group-chip').length > 1, null, { timeout: 15000 });
      await page.waitForTimeout(500);
      const m = await page.evaluate(() => {
        const rail = document.getElementById('community-groups');
        const chips = [...rail.querySelectorAll('.community-group-chip')];
        const tops = chips.map((c) => Math.round(c.getBoundingClientRect().top));
        return {
          labels: chips.map((c) => (c.textContent || '').trim()),
          rows: new Set(tops).size,
          railOverflow: rail.scrollWidth - rail.clientWidth,
          pageOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
          minHeight: Math.min(...chips.map((c) => Math.round(c.getBoundingClientRect().height))),
          flexWrap: getComputedStyle(rail).flexWrap
        };
      });
      assert.ok(m.labels.length >= 8, `칩 ${m.labels.length}개`);
      assert.deepEqual(m.labels.slice(1, 3), MINE, '앞 두 개가 내 가수');
      assert.equal(m.rows, 1, '칩 줄 1줄');
      assert.equal(m.flexWrap, 'nowrap');
      if (width === 390) assert.ok(m.railOverflow > 0, '좁은 화면에서 칩 줄 안 가로 스크롤');
      assert.equal(m.pageOverflow, 0, '페이지 가로 넘침 0');
      assert.ok(m.minHeight >= 44, '칩 누름 영역 44px');
      await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
      if (SHOT) { mkdirSync(SHOT, { recursive: true }); await page.screenshot({ path: `${SHOT}/chips-${width}.png` }); }
      console.log('CHIPS', width, JSON.stringify(m));
      await ctx.close();
    }
  } finally { await browser.close(); await new Promise((ok) => server.close(ok)); }
});
