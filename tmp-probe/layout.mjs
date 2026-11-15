import { chromium } from 'playwright';
import { serve } from '../tests/helpers/screen-audit.mjs';
const server = await serve({});
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/v41/#board`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const view = page.frames().find((f) => /track58/.test(f.url()));
const r = await view.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('#detail, #detail *')) {
    const r2 = el.getBoundingClientRect();
    if (r2.bottom < 600 || r2.top > 720) continue;
    out.push(el.tagName + '#' + (el.id || String(el.className).split(' ')[0]) + ' ' + JSON.stringify([Math.round(r2.left), Math.round(r2.top), Math.round(r2.right), Math.round(r2.bottom)]) + ' "' + (el.textContent || '').trim().slice(0, 16) + '"');
  }
  return out;
});
console.log(r.join('\n'));
await browser.close(); server.close();
