import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { serve } from './helpers/screen-audit.mjs';
import { evaluateWhenReady } from './helpers/visible-frame.mjs';
import { testBackNavigation } from './helpers/history-assert.mjs';
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

async function openShelf(browser, origin, width = 1440, count = 1) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
  await ctx.route('**://i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#333"/></svg>' }));
  await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
  const state = { version: 1, trees: Array.from({ length: count }, (_, i) => tree(i + 1)), prefs: {} };
  await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-18T09:00:00.000Z' }) }));
  const page = await ctx.newPage();
  await page.goto(`${origin}/v41/?account=1`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
  await page.evaluate(() => { location.hash = '#my/shelf'; });
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some((f) => {
    const doc = f.contentDocument;
    return !!doc && /track32-bookshelf/.test(doc.URL) && !!doc.querySelector('.book-card');
  }), null, { timeout: 15000 });
  await page.waitForFunction(() => { const f = document.querySelector('#view:not([hidden])'); return f?.contentDocument?.documentElement?.dataset?.v41Screen === 'shelf'; }, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  return { ctx, page };
}

const countBooks = (page) => evaluateWhenReady(page, () => {
  const frame = [...document.querySelectorAll('iframe')].find((f) => !f.hidden && /track32-bookshelf/.test(f.contentDocument?.URL || ''));
  const doc = frame?.contentDocument;
  return doc ? doc.querySelectorAll('.book-card').length : false;
});

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
      const doc = f.contentDocument;
      return !!doc && /track32-bookshelf/.test(doc.URL) && doc.querySelectorAll('.book-card').length === 2;
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

/* #1290 서재 뒤로 가기 계약 — #1298 공용 판정 사용.
 * 기록함: 책 선택·이어 보기·새 트리 창·트리 관리 창·상단 화면 이동.
 * 기록 안 함: 검색·진열 방식·선반 이동·트리 선택(화면 전환 없는 경우).
 */
test('#1290 서재 검색·진열은 기록하지 않고 책 열기는 바로 전 서재로 돌아온다(390·1440)', { skip: skip || !REQUIRE ? skip || 'LT_SHELF_NEWTREE_REQUIRE=1 일 때 실행' : false, timeout: 180000 }, async () => {
  const server = await serve();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1440]) {
      const { ctx, page } = await openShelf(browser, `http://127.0.0.1:${server.address().port}`, width);
      try {
        const frame = page.frames().find(f => /track32-bookshelf/.test(f.url()));
        assert.ok(frame, '서재 프레임');
        await testBackNavigation(page, { frame, recorded: false, action: () => frame.fill('#searchInput', '시험') });
        await testBackNavigation(page, { frame, recorded: false, action: () => frame.fill('#searchInput', '') });
        await testBackNavigation(page, { frame, recorded: false, action: () => frame.click('[data-shelf-view="carousel"]') });
        await testBackNavigation(page, { frame, recorded: false, action: () => frame.click('[data-shelf-view="shelf"]') });
        // #1631: 기본은 미리보기다. #1290의 '기록 1칸 → 책 → 서재' 계약은
        // 사용자가 '바로 펼치기'를 고른 경로로 검사한다(선택 변경 자체는 기록하지 않음).
        await testBackNavigation(page, { frame, recorded: false, action: () => frame.click('#shelf-open-choice [data-shelf-open-mode="direct"]') });
        await page.waitForFunction(() => document.documentElement.dataset.ltShelfOpenMode === 'direct', null, { timeout: 10000 });
        await page.screenshot({ path: `E:/tmp/lt1290-${width}-before.png` });
        await testBackNavigation(page, { frame, recorded: true, action: () => frame.click('[data-book-id]') , settleMs: 450, timeoutMs: 10000 });
        const back = page.frames().find(f => /track32-bookshelf/.test(f.url()));
        if (back) await page.screenshot({ path: `E:/tmp/lt1290-${width}-after.png` });
      } finally { await ctx.close(); }
    }
  } finally { await browser.close(); server.closeAllConnections?.(); await new Promise(ok => server.close(ok)); }
});

test('#1290 서재 창과 이어 보기의 기록·복귀(390·1440)', { skip: skip || !REQUIRE ? skip || 'LT_SHELF_NEWTREE_REQUIRE=1 일 때 실행' : false, timeout: 180000 }, async () => {
  const server = await serve();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1440]) for (const [name, action] of [
      ['새 트리', frame => frame.click('#shelfNewTree')],
      ['트리 관리', frame => frame.evaluate(() => document.querySelector('[data-manage-id]').click())],
      ['이어 보기', frame => frame.click('#resumeStrip')]
    ]) {
      const { ctx, page } = await openShelf(browser, `http://127.0.0.1:${server.address().port}`, width);
      try {
        const frame = page.frames().find(f => /track32-bookshelf/.test(f.url()));
        await testBackNavigation(page, { frame, recorded: true, action: () => action(frame), timeoutMs: 10000 });
        console.log('SHELF_BACK', width, name);
      } finally { await ctx.close(); }
    }
  } finally { await browser.close(); server.closeAllConnections?.(); await new Promise(ok => server.close(ok)); }
});

test('#1290 서재 선반 이동·선택·검색은 방문 기록을 늘리지 않는다', { skip: skip || !REQUIRE ? skip || 'LT_SHELF_NEWTREE_REQUIRE=1 일 때 실행' : false, timeout: 120000 }, async () => {
  const server = await serve();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1440]) {
      const { ctx, page } = await openShelf(browser, `http://127.0.0.1:${server.address().port}`, width, 3);
      try {
        const frame = page.frames().find(f => /track32-bookshelf/.test(f.url()));
        assert.equal(await frame.locator('.book-card').count(), 3, '책 3권에서 이동 시험');
        await testBackNavigation(page, { frame, recorded: false, action: () => frame.evaluate(() => document.getElementById('shelfNext').click()) });
        await testBackNavigation(page, { frame, recorded: false, action: () => frame.evaluate(() => document.getElementById('shelfPrev').click()) });
      } finally { await ctx.close(); }
    }
  } finally { await browser.close(); server.closeAllConnections?.(); await new Promise(ok => server.close(ok)); }
});

test('#1290 서재에서 보드·책 상단 화면 이동은 뒤로 가기 한 번에 서재로 복귀한다', { skip: skip || !REQUIRE ? skip || 'LT_SHELF_NEWTREE_REQUIRE=1 일 때 실행' : false, timeout: 120000 }, async () => {
  const server = await serve();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1440]) for (const target of ['track58-pinboard.html', 'track59-sketchbook.html']) {
      const { ctx, page } = await openShelf(browser, `http://127.0.0.1:${server.address().port}`, width);
      try {
        const frame = page.frames().find(f => /track32-bookshelf/.test(f.url()));
        await testBackNavigation(page, { frame, recorded: true, action: () => page.evaluate(file => document.querySelector('[data-view="' + file + '"]').click(), target), timeoutMs: 10000 });
        console.log('SHELF_TAB_BACK', width, target);
      } finally { await ctx.close(); }
    }
  } finally { await browser.close(); server.closeAllConnections?.(); await new Promise(ok => server.close(ok)); }
});

// #1298/#1400: 선반·회전 전환은 기록에 넣지 않는다 — 3번 바꿔도 뒤로 가기 한 번이면 서재를 떠난다.
test('#1400 서재 선반·회전 3번 전환 뒤 뒤로 가기 한 번에 서재를 떠난다(390·1440)', { skip: skip || !REQUIRE ? skip || 'LT_SHELF_NEWTREE_REQUIRE=1 일 때 실행' : false, timeout: 180000 }, async () => {
  const server = await serve();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1440]) {
      const { ctx, page } = await openShelf(browser, `http://127.0.0.1:${server.address().port}`, width);
      try {
        const frame = page.frames().find(f => /track32-bookshelf/.test(f.url()));
        assert.ok(frame, '서재 프레임');
        for (let i = 0; i < 3; i += 1) {
          const view = i % 2 ? 'shelf' : 'carousel';
          await testBackNavigation(page, { frame, recorded: false, action: () => frame.click(`[data-shelf-view="${view}"]`) });
        }
        const historyBefore = await page.evaluate(() => history.length);
        await page.evaluate(() => history.back());
        await page.waitForFunction(() => {
          const f = document.querySelector('#view:not([hidden])');
          try { return !!f && !/track32-bookshelf/.test(f.contentWindow.location.href || ''); } catch { return false; }
        }, null, { timeout: 10000 });
        const after = await page.evaluate(() => ({
          hash: location.hash,
          history: history.length,
          shelfStillShown: (() => { try { return /track32-bookshelf/.test(document.querySelector('#view:not([hidden])')?.contentWindow.location.href || ''); } catch { return false; } })()
        }));
        assert.equal(after.history, historyBefore, '전환 3번은 기록을 늘리지 않는다');
        assert.equal(after.shelfStillShown, false, '뒤로 가기 한 번에 서재를 떠난다');
        console.log('SHELF_VIEW_BACK', width, JSON.stringify(after));
      } finally { await ctx.close(); }
    }
  } finally { await browser.close(); server.closeAllConnections?.(); await new Promise(ok => server.close(ok)); }
});
