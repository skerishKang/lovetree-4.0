import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

const REQUIRE = process.env.LT_SHELF_NEWTREE_REQUIRE === '1';
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

async function openShelf(browser, origin) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route('**://i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#333"/></svg>' }));
  await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
  const state = { version: 1, trees: [tree(1)], prefs: {} };
  await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-18T09:00:00.000Z' }) }));
  const page = await ctx.newPage();
  await page.goto(`${origin}/v41/?account=1`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
  await page.locator('#discover-ask-no').click().catch(() => {});
  await page.evaluate(() => { location.hash = '#my/shelf'; });
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some((f) => {
    try { return /track32-bookshelf/.test(f.contentWindow.location.href) && f.contentDocument.querySelector('.book-card'); } catch { return false; }
  }), null, { timeout: 15000 });
  return { ctx, page };
}

const countBooks = (page) => page.evaluate(() => [...document.querySelectorAll('iframe')].reduce((n, f) => { try { return n + f.contentDocument.querySelectorAll('.book-card').length; } catch { return n; } }, 0));

for (const [name, fn] of [
  ['서재 + 새 트리 → 트리 만들기 창', async (page) => {
    await page.evaluate(() => { window.__msgs = []; addEventListener('message', (e) => window.__msgs.push(e.data?.type || '')); });
    const shelf = page.frames().find((f) => /track32-bookshelf/.test(f.url()));
    await shelf.evaluate(() => document.getElementById('shelfNewTree')?.click());
    await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some((f) => /first-journey/.test(f.contentWindow?.location?.href || '')), null, { timeout: 10000 });
    const msgs = await page.evaluate(() => window.__msgs);
    assert.ok(msgs.includes('lt41-new-tree'), '새 트리 메시지');
    assert.equal(msgs.includes('lt41-write'), false, '순간 추가 메시지 없음');
    assert.equal(await page.evaluate(() => !!document.getElementById('write-panel')?.open), false, '순간 추가 창이 열리지 않음');
    console.log('NEW_TREE', JSON.stringify(msgs));
  }],
  ['새 트리 뒤 서재 책 수 = 트리 수', async (page) => {
    const before = await countBooks(page);
    assert.equal(before, 1);
    const fresh = tree(2);
    const shelf = page.frames().find((f) => /track32-bookshelf/.test(f.url()));
    await page.evaluate((t) => { window.LT41.trees.push(t); }, fresh);
    await shelf.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'lt41-trees-renamed', titles: [] }, origin: location.origin, source: window.parent })));
    await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some((f) => {
      try { return /track32-bookshelf/.test(f.contentWindow.location.href) && f.contentDocument.querySelectorAll('.book-card').length === 2; } catch { return false; }
    }), null, { timeout: 10000 });
    const after = await countBooks(page);
    assert.equal(after, 2, '책 수 = 트리 수');
    console.log('BOOK_COUNT', before, after);
  }]
]) {
  test(name, { skip: skip || !REQUIRE ? skip || 'LT_SHELF_NEWTREE_REQUIRE=1 일 때 실행' : false }, async () => {
    const server = await serve();
    const browser = await chromium.launch({ headless: true });
    try {
      const { ctx, page } = await openShelf(browser, `http://127.0.0.1:${server.address().port}`);
      try { await fn(page); } finally { await ctx.close(); }
    } finally {
      await browser.close();
      server.closeAllConnections?.();
      await new Promise((ok) => server.close(ok));
    }
  });
}
