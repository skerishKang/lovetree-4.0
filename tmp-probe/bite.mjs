import { chromium } from 'playwright';
import { serve } from '../tests/helpers/screen-audit.mjs';
const server = await serve({});
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/v41/#board`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const view = page.frames().find((f) => /track58/.test(f.url()));
console.log(JSON.stringify(await view.evaluate(async () => {
  document.getElementById('detailClose').click();
  await new Promise((r) => setTimeout(r, 600));
  toast('순간을 선택해 연결된 기록을 살펴보세요.');
  await new Promise((r) => setTimeout(r, 1200)); // 닫힘 상태의 검사 시간만큼
  const before = document.querySelector('.toast').classList.contains('show'); // hideToast 없었다면 이때도 켜져 있음
  selectMoment(LTDEMO.get());
  await new Promise((r) => setTimeout(r, 500));
  return { 열리기직전풍선: before, 열린뒤풍선: document.querySelector('.toast').classList.contains('show') };
})));
await browser.close(); server.close();
