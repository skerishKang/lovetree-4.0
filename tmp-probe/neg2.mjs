import { chromium } from 'playwright';
import { serve, AUDIT_FN } from '../tests/helpers/screen-audit.mjs';
const server = await serve({});
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/v41/#board`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const view = page.frames().find((f) => /track58/.test(f.url()));
// 판을 열고(안내가 치워짐) 억지로 풍선을 다시 띄운 뒤 검사 → 풍선×판 겹침이 잡혀야 한다
const r = await view.evaluate(async () => {
  selectMoment(LTDEMO.get());
  await new Promise((res) => setTimeout(res, 500));
  const hidden = !document.querySelector('.toast').classList.contains('show');
  toast('순간을 선택해 연결된 기록을 살펴보세요.'); // 억지로 다시 띄움(검사가 물리는지 보려는 것)
  await new Promise((res) => setTimeout(res, 400));
  return { hidden };
});
const audit = await view.evaluate(AUDIT_FN, { checkToast: true });
console.log('판 열림 때 안내 치워짐:', r.hidden, '| 억지 풍선과의 겹침:', JSON.stringify(audit.issues.filter((i) => /toast/.test(i.a + i.b))));
await browser.close(); server.close();
