import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const REQUIRE = process.env.LT_TOKEN_COLOR_886_REQUIRE === '1';
let chromium = null;
let skip = '';
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright chromium이 설치되어 있지 않아 실행 시험을 건너뜀';
} catch {
  skip = 'playwright 패키지가 없어 실행 시험을 건너뜀';
}
if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip = '빌드 결과가 없어 실행 시험을 건너뜀';

test('#886 계산된 단추 색이 전역 토큰과 같다', { skip: REQUIRE ? false : skip || 'LT_TOKEN_COLOR_886_REQUIRE=1 일 때 실행', timeout: 60000 }, async () => {
  if (skip) assert.fail(`화면 잡에서는 건너뜀이 실패다 — ${skip}`);
  const { serve } = await import('./helpers/screen-audit.mjs');
  const server = await serve({});
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const theme of ['night', 'garden']) {
      const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
      try {
        await ctx.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
        const page = await ctx.newPage();
        await page.goto(base + '/v41/', { waitUntil: 'load' });
        const got = await page.evaluate(() => {
          const root = getComputedStyle(document.documentElement);
          const host = document.createElement('div'); host.className = 'lt-media-body';
          const button = document.createElement('button'); host.append(button); document.body.append(host);
          const color = getComputedStyle(button).backgroundColor;
          host.remove();
          return { color, token: root.getPropertyValue('--lt-btn-ink').trim() };
        });
        assert.ok(got.token, `${theme}: --lt-btn-ink 토큰이 있다`);
        const [r, g, b] = got.color.match(/\d+/g).map(Number);
        const [tr, tg, tb] = got.token.match(/[\da-f]{2}/gi).map(v => parseInt(v, 16));
        assert.deepEqual([r, g, b], [tr, tg, tb], `${theme}: 계산된 단추 바탕 ${got.color}이 토큰 ${got.token}과 같다`);
      } finally { await ctx.close(); }
    }
  } finally {
    await browser.close();
    await new Promise((ok) => server.close(ok));
  }
});
