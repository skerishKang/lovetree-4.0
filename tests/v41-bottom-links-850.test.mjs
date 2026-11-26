import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

const REQUIRE = process.env.LT_BOTTOM_LINKS_REQUIRE === '1';
const CAPTURE_DIR = process.env.LT_BOTTOM_LINKS_SHOT_DIR || '';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 화면 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 화면 시험을 건너뜀'; }
if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip = '빌드 결과가 없어 화면 시험을 건너뜀';

function fixtureTree() {
  let tree = createTree({ subject: '겹침 시험', title: '겹침 시험', note: '', emotion: '설렘', date: '2026-11-18', url: '' }, '2026-11-18T00:00:00Z');
  for (const [title, date] of [['첫 순간', '2026-11-18'], ['둘 순간', '2026-11-17'], ['셋 순간', '2016-10-16']]) {
    tree = addMoment(tree, { title, note: '', emotion: '설렘', date, url: '' }, tree.moments[0].id, '2026-11-18T00:00:01Z');
  }
  return tree;
}

async function openScreen(page, view, file, selector) {
  await page.evaluate((v) => { location.hash = '#my/' + v; }, view);
  let frame = null;
  for (let i = 0; i < 60 && !frame; i++) {
    frame = page.frames().find((f) => new RegExp(file).test(f.url()));
    if (!frame) await page.waitForTimeout(250);
  }
  assert.ok(frame, `${file} 화면이 열린다`);
  await frame.waitForSelector(selector, { state: 'attached', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
  return frame;
}

function measure(shellPage, file, selector) {
  return shellPage.evaluate(([file, selector]) => {
    const frame = [...document.querySelectorAll('iframe')].find((f) => new RegExp(file).test(f.contentWindow?.location?.href || ''));
    const links = document.querySelector('.home-links');
    const ls = getComputedStyle(links);
    const lr = links.getBoundingClientRect();
    const linksVisible = ls.display !== 'none' && ls.visibility !== 'hidden' && lr.width > 0 && lr.height > 0;
    const target = frame?.contentDocument?.querySelector(selector);
    if (!target) return { file, linksVisible, found: false, overlap: false };
    const fr = frame.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    const a = { left: fr.left + r.left, top: fr.top + r.top, right: fr.left + r.right, bottom: fr.top + r.bottom };
    const b = { left: lr.left, top: lr.top, right: lr.right, bottom: lr.bottom };
    const overlap = linksVisible && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    return { file, linksVisible, found: true, target: { x: Math.round(a.left), y: Math.round(a.top), w: Math.round(a.right - a.left), h: Math.round(a.bottom - a.top) }, links: { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.right - b.left), h: Math.round(b.bottom - b.top) }, overlap };
  }, [file, selector]);
}

test('#850 하단 링크와 지도·그래프 하단 요소 겹침 0(1440·390)', { skip: skip || !REQUIRE ? skip || 'LT_BOTTOM_LINKS_REQUIRE=1 일 때 실행' : false }, async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); } catch {} });
      await ctx.route('**://i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }));
      await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
      const tree = fixtureTree();
      await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [tree], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-18T09:00:00.000Z' }) }));
      const page = await ctx.newPage();
      await page.goto(`${origin}/v41/?account=1`, { waitUntil: 'load' });
      await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });

      for (const [file, selector, name, view] of [['track56-network', '.left-rail .controls', 'map', 'network'], ['track60-graph', '.g-shelf', 'graph', 'graph']]) {
        await openScreen(page, view, file, selector);
        const m = await measure(page, file, selector);
        m.viewport = `${width}x${height}`;
        m.name = name;
        results.push(m);
        if (CAPTURE_DIR) { mkdirSync(CAPTURE_DIR, { recursive: true }); await page.screenshot({ path: path.join(CAPTURE_DIR, `${name}-${width}.png`) }); }
      }
      await ctx.close();
    }
    console.log(JSON.stringify(results));
    for (const r of results) assert.equal(r.overlap, false, `${r.name} ${r.viewport} 하단 링크 겹침 0`);
  } finally {
    await browser.close();
    await new Promise((ok) => server.close(ok));
  }
});
