import { chromium } from 'playwright';
import { serve } from '../tests/helpers/screen-audit.mjs';
const server = await serve({});
const browser = await chromium.launch();
const OUT = 'E:/lovetree-qa/lane/local4-known2b';
for (const [w, h, theme] of [[1440, 900, 'night'], [1440, 900, 'garden'], [390, 844, 'night'], [390, 844, 'garden']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
  await page.goto(`http://127.0.0.1:${server.address().port}/v41/#board`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const view = page.frames().find((f) => /track58/.test(f.url()));
  // 판 닫힘 + 안내 뜸
  await view.evaluate(() => document.getElementById('detailClose').click());
  await view.waitForFunction(() => { const d = document.getElementById('detail'); const r = d.getBoundingClientRect(); return !d.classList.contains('open') && (r.left >= innerWidth || r.top >= innerHeight); }, null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  await view.evaluate(() => toast('순간을 선택해 연결된 기록을 살펴보세요.'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/board-after-${w}-${theme}.png` });
  // 판 열림 + 안내 사라짐
  await view.evaluate(() => selectMoment(LTDEMO.get()));
  await page.waitForTimeout(500);
  const toastHidden = !(await view.evaluate(() => document.querySelector('.toast').classList.contains('show')));
  await page.screenshot({ path: `${OUT}/board-detail-after-${w}-${theme}.png` });
  console.log(`${w}-${theme}: 판 닫힘+안내 / 판 열림(안내 숨음=${toastHidden}) 저장, 페이지오류 ${errors.length}`);
  await ctx.close();
}
await browser.close(); server.close();
