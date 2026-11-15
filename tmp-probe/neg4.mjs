import { chromium } from 'playwright';
import { serve, AUDIT_FN } from '../tests/helpers/screen-audit.mjs';
const server = await serve({});
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/v41/#board`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const view = page.frames().find((f) => /track58/.test(f.url()));
const r = await view.evaluate(async () => {
  const out = {};
  out.openAtLoad = document.getElementById('detail').classList.contains('open');
  await new Promise((res) => setTimeout(res, 300));
  toast('순간을 선택해 연결된 기록을 살펴보세요.');
  await new Promise((res) => setTimeout(res, 400));
  const t = document.querySelector('.toast');
  const tr = t.getBoundingClientRect();
  out.toast = [Math.round(tr.left), Math.round(tr.top), Math.round(tr.right), Math.round(tr.bottom)];
  out.under = [];
  for (const el of document.querySelectorAll('#detail *')) {
    const r2 = el.getBoundingClientRect();
    const ox = Math.min(r2.right, tr.right) - Math.max(r2.left, tr.left), oy = Math.min(r2.bottom, tr.bottom) - Math.max(r2.top, tr.top);
    if (ox > 4 && oy > 4 && el.children.length === 0) out.under.push(el.tagName + '#' + (el.id || el.className) + ' ' + JSON.stringify([Math.round(r2.left), Math.round(r2.top), Math.round(r2.right), Math.round(r2.bottom)]) + ' "' + (el.textContent || '').trim().slice(0, 14) + '"');
  }
  const audit = eval('0');
  return out;
});
console.log(JSON.stringify(r, null, 1));
const audit = await view.evaluate(AUDIT_FN, { checkToast: true });
console.log('토스트 겹침:', JSON.stringify(audit.issues.filter((i) => /toast/.test(i.a + i.b))));
await browser.close(); server.close();
