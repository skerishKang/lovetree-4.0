import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

const REQUIRE = process.env.LT_WRITE_PANEL_REQUIRE === '1';
const SHOT = process.env.LT_WRITE_PANEL_SHOT_DIR || '';
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

async function openWrite(browser, origin, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); } catch {} });
  await ctx.route('**://i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: IMG }));
  await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
  await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [fixtureTree()], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-18T09:00:00.000Z' }) }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.goto(`${origin}/v41/?account=1#shelf`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
  await page.locator('#discover-ask-no').click().catch(() => {});
  if (await page.locator('#write-menu').isVisible()) await page.click('#write-menu');
  else await page.click('#mobile-add');
  await page.waitForFunction(() => document.getElementById('write-panel')?.open === true, null, { timeout: 10000 });
  await page.evaluate(() => {
    for (const d of document.querySelectorAll('dialog[open]')) {
      if (d.id !== 'write-panel') d.close();
    }
  });
  return { ctx, page, errors };
}

test('#868 순간 추가 창 미리보기·연결 이유 숫자 확인', { skip: skip || !REQUIRE ? skip || 'LT_WRITE_PANEL_REQUIRE=1 일 때 실행' : false }, async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const { ctx, page, errors } = await openWrite(browser, origin, width, height);
      const relation = await page.evaluate(() => ({
        placeholder: document.querySelector('#relation-label input')?.getAttribute('placeholder') || '',
        hint: (document.getElementById('relation-hint')?.textContent || '').trim()
      }));
      const before = await page.evaluate(() => Math.round(document.getElementById('quick-preview').getBoundingClientRect().height));
      await page.fill('#quick-url', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      await page.waitForFunction(() => document.querySelector('#quick-preview[data-media="yes"] img'), null, { timeout: 10000 });
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => {
        const box = document.getElementById('quick-preview').getBoundingClientRect();
        const img = document.querySelector('#quick-preview img').getBoundingClientRect();
        const dialogs = [...document.querySelectorAll('dialog[open]')].map((d) => d.id);
        return {
          boxW: Math.round(box.width),
          boxH: Math.round(box.height),
          ratio: Math.round((img.width / box.width) * 100),
          dialogs
        };
      });
      assert.equal(before, 120, '주소 전 미리보기 높이 120px');
      assert.ok(Math.abs(after.boxH - after.boxW * 9 / 16) <= 8, `주소 후 ${after.boxH} ≈ ${after.boxW}의 16:9`);
      assert.ok(after.ratio >= 95, `미리보기 img가 칸 폭의 ${after.ratio}%`);
      assert.ok(relation.placeholder.length > 0, '연결 이유 placeholder 있음');
      assert.ok(relation.hint.length > 0, '연결 이유 도움말 있음');
      assert.deepEqual(after.dialogs, ['write-panel'], '열린 dialog는 순간 추가 하나');
      assert.deepEqual(errors, [], '페이지 오류 없음');
      results.push({ width, before, after, relation });
      if (SHOT) { mkdirSync(SHOT, { recursive: true }); await page.screenshot({ path: path.join(SHOT, `write-panel-${width}.png`) }); }
      await ctx.close();
    }
    console.log(JSON.stringify(results));
  } finally {
    await browser.close();
    await new Promise((ok) => server.close(ok));
  }
});
