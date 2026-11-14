import { chromium } from 'playwright';
import { serve } from '../tests/helpers/screen-audit.mjs';
const server = await serve({});
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(base + '/v41/#board', { waitUntil: 'networkidle' });
await page.waitForTimeout(1400);
const view = page.frames().find((f) => /track58/.test(f.url()));
console.log(JSON.stringify(await view.evaluate(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; };
  const lp = document.getElementById('leftPanel');
  const cards = [...document.querySelectorAll('#cardLayer .card')].map(r).filter(([l, t, rr, b]) => rr > 0 && l < innerWidth && b > 0 && t < innerHeight);
  // y별 카드 점유 x 구간(40px 띠로)
  const bands = [];
  for (let y = 66; y < innerHeight - 12; y += 40) {
    const xs = [];
    for (const [l, t, rr, b] of cards) if (t < y + 40 && b > y) xs.push([l, rr]);
    bands.push({ y, xs });
  }
  return { leftPanel: lp ? r(lp) : null, nCards: cards.length, bands };
})));
await browser.close(); server.close();
