// #515·#516: 정원 책의 '다음 순간으로 이어진 이유'·보기 알약·페이지 수를 실제 그려진 화면에서 잰다.
// getComputedStyle의 글자색(+opacity)과 그 자리에 실제로 칠해진 바탕 픽셀(스크린샷의 가장 많은 색)으로 대비를 낸다.
// 밤 테마는 손대지 않았음을 색·opacity 값으로 함께 고정한다.
// 크롬이 없는 곳에서는 건너뛰고, LT_BOOK_CONTRAST_REQUIRE=1(미리보기 검사)에서는 건너뜀을 실패로 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.env.LT_BOOK_CONTRAST_ROOT || fileURLToPath(new URL('../public', import.meta.url)));
const REQUIRE = process.env.LT_BOOK_CONTRAST_REQUIRE === '1';
let chromium = null;
let skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright chromium이 설치되어 있지 않아 실제 화면 대비 시험을 건너뜀';
} catch {
  skip = 'playwright 패키지가 없어 실제 화면 대비 시험을 건너뜀';
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

const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over = (t, u) => ({ r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a), a: 1 });

async function measure(page, frame, selector) {
  const loc = frame.locator(selector).first();
  if (!(await loc.count()) || !(await loc.isVisible())) return null;
  const box = await loc.boundingBox();
  if (!box || box.width < 1 || box.height < 1) return null;
  const style = await loc.evaluate((el) => { const cs = getComputedStyle(el); return { color: cs.color, opacity: cs.opacity, text: el.textContent.trim() }; });
  const b64 = (await page.screenshot({ clip: { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.max(1, Math.ceil(box.width)), height: Math.max(1, Math.ceil(box.height)) } })).toString('base64');
  const dominant = await page.evaluate(async (data) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; const counts = new Map();
    for (let i = 0; i < d.length; i += 4) { const k = `${d[i]},${d[i + 1]},${d[i + 2]}`; counts.set(k, (counts.get(k) || 0) + 1); }
    return [...counts].sort((a, b) => b[1] - a[1])[0][0];
  }, b64);
  const [r, g, b] = dominant.split(',').map(Number);
  const bg = { r, g, b, a: 1 };
  const color = parse(style.color);
  const fg = over({ ...color, a: color.a * Number(style.opacity) }, bg);
  return { text: style.text.slice(0, 40), color: style.color, opacity: style.opacity, bg: dominant, ratio: Math.round(ratio(fg, bg) * 100) / 100 };
}

async function openBook(browser, base, width, theme) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : width === 1024 ? 768 : 900 } });
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
  assert.ok(frame, '책 프레임이 열리지 않음');
  await frame.waitForFunction(() => document.querySelector('.why-margin')?.textContent.trim().length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(1800);
  return { ctx, page, frame, errors };
}

test('#515·#516 정원 책: 이유 줄·보기 알약(고른 쪽/안 고른 쪽)·페이지 수가 4.5:1 이상', { skip: REQUIRE ? false : skip, timeout: 180000 }, async () => {
  if (skip) assert.fail(`미리보기 검사에서는 화면 대비 시험 건너뜀이 실패다 — ${skip}`);
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const failures = [];
    for (const width of [1440, 1024, 390]) {
      for (const theme of ['night', 'garden']) {
        const { ctx, page, frame, errors } = await openBook(browser, base, width, theme);
        const why = await measure(page, frame, '.why-margin');
        const single = await measure(page, frame, '#singleViewBtn');
        const double = await measure(page, frame, '#doubleViewBtn');
        const pageLabel = await measure(page, frame, '#pageLabel');
        await ctx.close();
        assert.equal(errors.length, 0, `${width}·${theme}: 페이지 오류 ${errors.join(' | ')}`);
        assert.ok(pageLabel, `${width}·${theme}: 페이지 수를 찾지 못함`);
        if (theme === 'night') {
          // 밤은 이번에 바꾸지 않는다 — 값 자체를 고정한다.
          assert.equal(why?.color, 'rgb(228, 210, 203)', `${width}·밤: 이유 줄 색이 바뀌면 안 됨`);
          assert.equal(why?.opacity, '0.78', `${width}·밤: 이유 줄 opacity가 바뀌면 안 됨`);
        } else {
          assert.ok(why, `${width}·정원: 이유 줄이 화면에 보이지 않음`);
          if (why.ratio < 4.5) failures.push(`${width}·정원 이유 줄 ${why.color}/${why.bg} = ${why.ratio}:1`);
        }
        // 고른 쪽·안 고른 쪽을 둘 다 잰다(390은 '두 장'이 숨김).
        for (const [name, row] of [['한 장', single], ['두 장', double]]) {
          if (!row) continue;
          if (theme === 'garden' && row.ratio < 4.5) failures.push(`${width}·정원 ${name} ${row.color}/${row.bg} = ${row.ratio}:1`);
        }
        if (theme === 'garden' && pageLabel.ratio < 4.5) failures.push(`${width}·정원 페이지 수 ${pageLabel.color}/${pageLabel.bg} = ${pageLabel.ratio}:1`);
      }
    }
    assert.deepEqual(failures, [], `대비 4.5:1 미만:\n${failures.join('\n')}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
});
