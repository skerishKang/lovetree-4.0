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
  const out = {};
  const d = document.getElementById('detail');
  out.openAtLoad = d.classList.contains('open');
  document.getElementById('detailClose').click();
  setTimeout(() => {
    const r = d.getBoundingClientRect();
    out.closedDetail = [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)];
    const b = document.getElementById('openMoment');
    const rb = b.getBoundingClientRect();
    out.btn = [Math.round(rb.left), Math.round(rb.top), Math.round(rb.right), Math.round(rb.bottom)];
    out.hitAt = [1434, 718];
    out.hit = document.elementsFromPoint(1434, 718).slice(0, 4).map((e) => e.tagName + '#' + (e.id || String(e.className).split(' ')[0]));
    out.detailPE = getComputedStyle(d).pointerEvents;
    res(out);
  }, 600);
}))));
await browser.close(); server.close();
