import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

const REQUIRE = process.env.LT_QUICK_GAP_REQUIRE === '1';
const SHOT = process.env.LT_QUICK_GAP_SHOT_DIR || '';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 화면 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 화면 시험을 건너뜀'; }
if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip = '빌드 결과가 없어 화면 시험을 건너뜀';

const IMG = '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#3a3a4a"/></svg>';

function fixtureTree() {
  let tree = createTree({ subject: '시험', title: '시험 트리', note: '', emotion: '설렘', date: '2026-11-18', url: '' }, '2026-11-18T00:00:00Z');
  for (const title of ['첫 순간', '둘 순간', '셋 순간']) {
    tree = addMoment(tree, { title, note: '', emotion: '설렘', date: '2026-11-18', url: '' }, tree.moments[0].id, '2026-11-18T00:00:01Z');
  }
  return tree;
}

test('쉬운 추가 담겨요 줄과 담기 단추 사이 간격', { skip: skip || !REQUIRE ? skip || 'LT_QUICK_GAP_REQUIRE=1 일 때 실행' : false }, async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); } catch {} });
      await ctx.route('**://i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: IMG }));
      await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
      await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [fixtureTree()], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-18T09:00:00.000Z' }) }));
      const page = await ctx.newPage();
      await page.goto(`${origin}/v41/?account=1`, { waitUntil: 'load' });
      await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
      await page.locator('#discover-ask-no').click().catch(() => {});
      if (await page.locator('#write-menu').isVisible()) await page.click('#write-menu');
      else await page.click('#mobile-add');
      await page.waitForFunction(() => document.getElementById('write-panel')?.open === true, null, { timeout: 10000 });
      await page.fill('#quick-url', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => {
        const r = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const b = el.getBoundingClientRect();
          return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height), hidden: el.hidden };
        };
        return {
          line: r('#quick-tree-line'),
          noticeRow: r('.quick-notice-row'),
          tagline: r('#quick-tagline'),
          submit: r('#quick-submit')
        };
      });
      const gap = m.submit.top - m.line.bottom;
      assert.equal(gap, 16, `${width}에서 담겨요 줄과 담기 단추 사이 16px`);
      assert.equal(m.noticeRow.h, 0, '빈 안내 줄은 접힌다');
      results.push({ width, ...m, gap });
      if (SHOT) { mkdirSync(SHOT, { recursive: true }); await page.screenshot({ path: path.join(SHOT, `quick-gap-${width}.png`) }); }
      await ctx.close();
    }
    console.log(JSON.stringify(results));
  } finally {
    await browser.close();
    await new Promise((ok) => server.close(ok));
  }
});
