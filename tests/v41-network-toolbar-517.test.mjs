// #517: 390·360 지도 머리 도구 줄이 화면 밖으로 넘치지 않는지(전: 사용법 339~399 9px 잘림,
// 이어진 선 n개 404~504 화면 밖), 모든 단추가 44px 누름 높이를 유지하는지,
// 내려온 도구 줄과 순간 선택 패널·안내 문구가 겹치지 않는지 시험한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.env.LT_MAP_CONTRAST_ROOT || fileURLToPath(new URL('../public', import.meta.url)));
const REQUIRE = process.env.LT_MAP_CONTRAST_REQUIRE === '1';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 지도 도구 줄 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 지도 도구 줄 시험을 건너뜀'; }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
async function serve() {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    for (const file of [path.join(ROOT, clean), path.join(ROOT, clean, 'index.html')]) {
      if (path.relative(ROOT, file).startsWith('..')) continue;
      try {
        if (!(await stat(file)).isFile()) continue;
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
        createReadStream(file).pipe(res); return;
      } catch {}
    }
    res.writeHead(404); res.end('not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function openMap(browser, base, { width, theme }) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await context.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); localStorage.removeItem('lt41.boardTheme'); } catch {} }, theme);
  const page = await context.newPage();
  await page.goto(`${base}/v41/#network`, { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) {
    frame = page.frames().find((f) => /track56-network/.test(f.url()));
    if (!frame) await page.waitForTimeout(250);
  }
  assert.ok(frame, '지도 프레임이 열린다');
  // #517: 글꼴·판 테마 적용으로 머리 높이가 바뀐 뒤 --lt-picker-top이 다시 잡힐 때까지 기다린다(측정 타이밍 흔들림 방지).
  await frame.waitForFunction(() => {
    const tb = document.querySelector('.topbar')?.getBoundingClientRect().bottom;
    if (!tb) return false;
    const v = parseFloat(document.documentElement.style.getPropertyValue('--lt-picker-top') || '0');
    return Math.abs(v - (tb + 8)) < 1;
  }, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
  return { context, page, frame };
}

test('지도 도구 줄: 390·360 × 밤·정원에서 넘침 0·누름 44px·겹침 0(판 색은 기하와 무관 — #512 흐름 시험이 전환을 검증)', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const width of [390, 360]) {
      for (const theme of ['night', 'garden']) {
          const { context, page, frame } = await openMap(browser, base, { width, theme });
          const m = await frame.evaluate(() => {
            const vw = innerWidth;
            const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
            const row = document.querySelector('.top-actions');
            const buttons = [...(row?.querySelectorAll('button') || [])].filter(vis).map((b) => { const r = b.getBoundingClientRect(); return { id: b.id || (b.textContent || '').trim().slice(0, 10), l: Math.round(r.left), r: Math.round(r.right), h: Math.round(r.height) }; });
            const rect = (sel) => { const el = document.querySelector(sel); if (!el || !vis(el)) return null; const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
            const topbar = rect('.topbar');
            const picker = rect('.lt-moment-picker');
            const hero = rect('.hero p');
            const overlap = (a, b) => { if (!a || !b) return 0; const w = Math.max(0, Math.round(Math.min(a.r, b.r) - Math.max(a.l, b.l))); const h = Math.max(0, Math.round(Math.min(a.b, b.b) - Math.max(a.t, b.t))); return w * h; };
            const firstLabel = window.__lt?.labels?.()[0];
            return {
              vw,
              outside: buttons.filter((b) => b.r > vw + 1 || b.l < -1),
              short: buttons.filter((b) => b.h < 44),
              topbar, picker, hero,
              pickerOverlap: overlap(topbar, picker),
              heroOverlap: overlap(picker, hero),
              labelY: firstLabel ? Math.round(firstLabel.y) : null,
            };
          });
          assert.deepEqual(m.outside, [], `${width} ${theme}: 도구 줄 단추가 화면 밖(뷰폭 ${m.vw})`);
          assert.deepEqual(m.short, [], `${width} ${theme}: 44px 미만 단추`);
          assert.ok(!m.pickerOverlap, `${width} ${theme}: 도구 줄과 순간 선택 패널 겹침 ${m.pickerOverlap}`);
          assert.ok(!m.heroOverlap, `${width} ${theme}: 선택 패널과 안내 문구 겹침 ${m.heroOverlap}`);
          if (m.labelY != null && m.hero) assert.ok(m.labelY >= m.hero.b - 2, `${width} ${theme}: 첫 순간 이름표(${m.labelY})가 안내 문구(아래 ${Math.round(m.hero.b)})와 겹친다`);
          await context.close();
      }
    }
  } finally {
    await browser?.close();
    server.close();
  }
});
