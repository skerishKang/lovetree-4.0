import { chromium } from 'playwright';
import { serve } from '../tests/helpers/screen-audit.mjs';
const server = await serve({});
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/v41/#board`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const view = page.frames().find((f) => /track58/.test(f.url()));
console.log(JSON.stringify(await view.evaluate(() => new Promise((res) => {
  document.getElementById('detailClose').click();
  setTimeout(() => {
    const b = document.getElementById('openMoment');
    const rb = b.getBoundingClientRect();
    const out = { btn: [Math.round(rb.left), Math.round(rb.right)], pe: getComputedStyle(b).pointerEvents, vis: getComputedStyle(b).visibility, hits: {} };
    for (const x of [1430, 1435, 1439, 1441, 1450, 1470]) out.hits[x] = document.elementsFromPoint(x, 718).slice(0, 2).map((e) => e.tagName + '#' + (e.id || String(e.className).split(' ')[0]));
    // 판 자체도
    out.detailHits = [1435, 1450, 1500].map((x) => document.elementsFromPoint(x, 400).slice(0, 2).map((e) => e.tagName + '#' + (e.id || String(e.className).split(' ')[0])));
    res(out);
  }, 600);
}))));
await browser.close(); server.close();
