import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

const REQUIRE = process.env.LT_TOPMENU_REQUIRE === '1';
const SHOT = process.env.LT_TOPMENU_SHOT_DIR || '';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 화면 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 화면 시험을 건너뜀'; }
if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip = '빌드 결과가 없어 화면 시험을 건너뜀';

function tree(n) {
  let t = createTree({ subject: '시험' + n, title: '시험 트리 ' + n, note: '', emotion: '설렘', date: '2026-11-18', url: '' }, '2026-11-18T00:00:00Z');
  for (let i = 1; i < 3; i++) t = addMoment(t, { title: '순간 ' + i, note: '', emotion: '설렘', date: '2026-11-1' + i, url: '' }, t.moments[0].id, '2026-11-18T00:0' + i + ':00Z');
  return t;
}

const SCREENS = [['shelf', '#my/shelf'], ['book', '#my/book'], ['board', '#my/board'], ['map', '#my/network']];

test('상단 메뉴: 같은 글자 크기·테두리 0·세로선 0·현재 탭 1·탭 x 고정', { skip: skip || !REQUIRE ? skip || 'LT_TOPMENU_REQUIRE=1 일 때 실행' : false }, async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const width of [1440, 390]) {
      for (const theme of ['night', 'garden']) {
        const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' });
        await ctx.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
        await ctx.route('**://i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#333"/></svg>' }));
        await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
        const state = { version: 1, trees: [tree(1), tree(2)], prefs: {} };
        await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-18T09:00:00.000Z' }) }));
        const page = await ctx.newPage();
        await page.goto(`${origin}/v41/?account=1`, { waitUntil: 'load', timeout: 60000 });
        await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
        await page.locator('#discover-ask-no').click().catch(() => {});
        const perScreen = {};
        for (const [name, hash] of SCREENS) {
          await page.evaluate((h) => { location.hash = h; }, hash);
          await page.waitForTimeout(900);
          perScreen[name] = await page.evaluate(() => {
            const record = document.getElementById('record-menu');
            const tabs = [...document.querySelectorAll('#tree-views > button')];
            const plain = tabs.filter((b) => b.id !== 'community-menu');
            const borders = (el) => { const cs = getComputedStyle(el); return ['Top', 'Right', 'Bottom', 'Left'].filter((side) => parseFloat(cs['border' + side + 'Width']) > 0).length; };
            return {
              recordFont: parseFloat(getComputedStyle(record).fontSize),
              tabFonts: tabs.map((b) => parseFloat(getComputedStyle(b).fontSize)),
              tabBorders: plain.reduce((n, b) => n + borders(b), 0),
              dividers: [record, ...plain].reduce((n, el) => n + (parseFloat(getComputedStyle(el).borderLeftWidth) > 0 ? 1 : 0), 0),
              current: tabs.filter((b) => b.getAttribute('aria-current') === 'true').length,
              xs: tabs.map((b) => Math.round(b.getBoundingClientRect().x)),
              recordVisible: !!record && record.getClientRects().length > 0
            };
          });
        }
        const base = perScreen.shelf;
        const xsStable = SCREENS.every(([name]) => JSON.stringify(perScreen[name].xs) === JSON.stringify(base.xs));
        assert.deepEqual([...new Set([base.recordFont, ...base.tabFonts])].length, 1, '트리 단추·탭 글자 크기 같음');
        assert.equal(base.tabBorders, 0, '탭 칸 테두리 0');
        assert.equal(base.dividers, 0, '세로선 0');
        assert.equal(base.current, 1, '현재 탭 1개');
        assert.equal(base.recordVisible, true, '서재에서 트리 단추 보임');
        assert.equal(xsStable, true, '4화면 탭 x 좌표 동일');
        results.push({ width, theme, ...base, xsStable });
        if (SHOT) {
          mkdirSync(SHOT, { recursive: true });
          await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
          await page.screenshot({ path: `${SHOT}/menu-${width}-${theme}.png` });
        }
        await ctx.close();
      }
    }
    console.log(JSON.stringify(results));
  } finally {
    await browser.close();
    await new Promise((ok) => server.close(ok));
  }
});

test("서재에서 트리를 고르면 가운데 책이 그 트리로 이동", { skip: skip || !REQUIRE ? skip || "LT_TOPMENU_REQUIRE=1 일 때 실행" : false }, async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true,"items":[]}' }));
    const two = [tree(1), tree(2)];
    const state = { version: 1, trees: two, prefs: {} };
    await ctx.route("**/api/workspace**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ revision: 1, state, subject: "시험계정", writeSubjectBound: true, savedAt: "2026-11-18T09:00:00.000Z" }) }));
    const page = await ctx.newPage();
    await page.goto(`${origin}/v41/?account=1`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
    await page.locator('#discover-ask-no').click().catch(() => {});
    await page.evaluate(() => { location.hash = '#my/shelf'; });
    await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some((f) => { try { return /track32-bookshelf/.test(f.contentWindow.location.href) && f.contentDocument.querySelector('.book-card.is-center'); } catch { return false; } }), null, { timeout: 15000 });
    await page.click('#record-menu');
    await page.click(`[data-tree-id="${two[1].id}"]`);
    await page.waitForFunction((id) => [...document.querySelectorAll('iframe')].some((f) => {
      try { return /track32-bookshelf/.test(f.contentWindow.location.href) && f.contentDocument.querySelector('.book-card.is-center [data-book-id]')?.dataset.bookId === id; } catch { return false; }
    }), two[1].id, { timeout: 10000 });
    assert.match(await page.evaluate(() => document.getElementById('source-label').textContent), /시험2/);
    console.log('SHELF_TREE_PICK', two[1].id);
    await ctx.close();
  } finally { await browser.close(); await new Promise((ok) => server.close(ok)); }
});
