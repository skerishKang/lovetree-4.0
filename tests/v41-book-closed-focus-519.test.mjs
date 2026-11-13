// #519: 읽기 전용(예시) 책에서 닫힌 창(opacity 0)의 입력칸이 Tab 초점을 받던 문제.
// 실제 책 프레임에서 닫힌 창이 inert인지, Tab 18번 동안 그 안으로 초점이 들어가지 않는지,
// 링크 창을 열면 다시 초점이 들어가고 닫으면 inert로 돌아오는지 확인한다.
// 크롬이 없는 곳에서는 건너뛰고, LT_BOOK_FOCUS_REQUIRE=1(미리보기 검사)에서는 건너뜀을 실패로 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.env.LT_BOOK_FOCUS_ROOT || fileURLToPath(new URL('../public', import.meta.url)));
const REQUIRE = process.env.LT_BOOK_FOCUS_REQUIRE === '1';
let chromium = null;
let skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright chromium이 설치되어 있지 않아 초점 시험을 건너뜀';
} catch {
  skip = 'playwright 패키지가 없어 초점 시험을 건너뜀';
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
function serve(root) {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    for (const file of [path.join(root, clean), path.join(root, clean, 'index.html')]) {
      if (!file.startsWith(root)) continue;
      try { if ((await stat(file)).isFile()) { res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); createReadStream(file).pipe(res); return; } } catch {}
    }
    res.writeHead(404); res.end('not found');
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

const CLOSED = '.archive-panel,.detail,.viewer,.link-modal,.branch-modal,.overview';

test('#519 책의 닫힌 창은 초점을 받지 않고, 열면 받고 닫으면 다시 빠진다', { skip: REQUIRE ? false : skip, timeout: 120000 }, async () => {
  if (skip) assert.fail(`미리보기 검사에서는 초점 시험 건너뜀이 실패다 — ${skip}`);
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const theme of ['night', 'garden']) {
      const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
      await ctx.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e.message || e)));
      await page.goto(`${base}/v41/#book`, { waitUntil: 'load' });
      let frame = null;
      for (let i = 0; i < 80 && !frame; i++) {
        frame = page.frames().find((f) => /track59-sketchbook/.test(f.url()));
        if (!frame) await page.waitForTimeout(250);
      }
      assert.ok(frame, `${theme}: 책 프레임이 열리지 않음`);
      await page.waitForTimeout(1500);

      const closed = await frame.evaluate((sel) => [...document.querySelectorAll(sel)].map((el) => ({ id: el.id, inert: el.inert, open: el.classList.contains('open') })), CLOSED);
      assert.equal(closed.length, 6, `${theme}: 닫힌 창 6개를 찾지 못함`);
      for (const item of closed) {
        assert.equal(item.open, false, `${theme}: ${item.id}가 열린 채로 시작함`);
        assert.equal(item.inert, true, `${theme}: 닫힌 ${item.id}에 inert가 없음`);
      }

      const seen = [];
      for (let i = 0; i < 18; i++) {
        await page.keyboard.press('Tab');
        seen.push(await frame.evaluate(() => {
          const a = document.activeElement;
          return a ? { tag: a.tagName, id: a.id, hiddenWindow: !!a.closest('.link-modal[inert],.viewer[inert],.branch-modal[inert],.overview[inert],.detail[inert],.archive-panel[inert]') } : null;
        }));
      }
      assert.deepEqual(seen.filter((x) => x?.hiddenWindow), [], `${theme}: 닫힌 창 안으로 Tab 초점이 들어감`);

      // 링크 창을 실제 열기 경로로 연다(예시는 읽기 전용이라 이 시험에서만 쓰기 상태로 바꾼다).
      const opened = await frame.evaluate(() => {
        try { LTDEMO.readOnly = false; } catch { return { error: 'LTDEMO 없음' }; }
        window.__TRACK59__.openAddLink();
        const m = document.querySelector('#linkModal');
        return { open: m.classList.contains('open'), inert: m.inert };
      });
      assert.deepEqual(opened, { open: true, inert: false }, `${theme}: 링크 창을 열지 못함`);
      await page.waitForTimeout(250);
      const active = await frame.evaluate(() => ({ id: document.activeElement?.id, inside: !!document.activeElement?.closest('#linkModal') }));
      assert.deepEqual(active, { id: 'linkUrl', inside: true }, `${theme}: 연 창의 입력칸으로 초점이 가지 않음`);
      const closedAgain = await frame.evaluate(() => {
        document.querySelector('#linkCancel').click();
        const m = document.querySelector('#linkModal');
        return { open: m.classList.contains('open'), inert: m.inert };
      });
      assert.deepEqual(closedAgain, { open: false, inert: true }, `${theme}: 닫은 뒤 inert로 돌아오지 않음`);
      assert.equal(errors.length, 0, `${theme}: 페이지 오류 ${errors.join(' | ')}`);
      await ctx.close();
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
});
