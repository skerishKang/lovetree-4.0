import { chromium } from 'playwright';
import { serve } from '../tests/helpers/screen-audit.mjs';
const server = await serve({});
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
for (const [w, h] of [[390, 844], [1440, 900]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(base + '/v41/#board', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400); // 토스트(900ms에 뜨고 3100ms에 사라짐)가 떠 있는 시점
  const view = page.frames().find((f) => /track58/.test(f.url()));
  console.log(w + 'px:', JSON.stringify(await view.evaluate(() => {
    const t = document.querySelector('.toast');
    const tr = t.getBoundingClientRect();
    const cs = getComputedStyle(t);
    // 카드 사각형 목록(화면과 걸치는)
    const cards = [];
    for (const c of document.querySelectorAll('#cardLayer .card')) {
      const r = c.getBoundingClientRect();
      if (r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight) cards.push([Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]);
    }
    // 토스트 상자와 겹치는 카드 수
    let overlap = 0;
    for (const [l, tp, r, b] of cards) if (Math.min(r, tr.right) - Math.max(l, tr.left) > 4 && Math.min(b, tr.bottom) - Math.max(tp, tr.top) > 4) overlap++;
    const cb = document.querySelector('.cinemaBtn');
    const cbr = cb ? cb.getBoundingClientRect() : null;
    return { toast: [Math.round(tr.left), Math.round(tr.top), Math.round(tr.right), Math.round(tr.bottom)], toastColor: cs.color, toastBg: cs.backgroundColor, show: t.classList.contains('show'), text: t.textContent.trim().slice(0, 24), cards: cards.length, overlapCards: overlap, cinemaBtn: cbr ? [Math.round(cbr.left), Math.round(cbr.top), Math.round(cbr.right), Math.round(cbr.bottom)] : null };
  })));
  await page.close();
}
await browser.close(); server.close();
