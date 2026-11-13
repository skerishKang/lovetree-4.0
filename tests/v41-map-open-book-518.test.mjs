// #518: 지도 상세의 '책에서 보기'(#openMoment)가 지도에서 고른 그 순간의 책으로 가는지,
// 그리고 안내 문구 자리에 영어 프로토타입 스텁('Prototype: …')이 돌아오지 않는지 시험한다.
// 셸(shell.mjs)이 문서 캡처 단계에서 #openMoment 클릭을 잡아 track59 책으로 옮긴다 —
// network.js에 개별 핸들러·토스트를 다시 붙이면 캡처가 먼저라 실행되지 않는 죽은 코드가 된다(이 시험이 막는다).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.env.LT_MAP_CONTRAST_ROOT || fileURLToPath(new URL('../public', import.meta.url)));
const REQUIRE = process.env.LT_MAP_CONTRAST_REQUIRE === '1';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 지도→책 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 지도→책 시험을 건너뜀'; }
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

async function openMap(browser, base, width) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 852 : 900 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); } catch {} });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.goto(`${base}/v41/#network`, { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) {
    frame = page.frames().find((f) => /track56-network/.test(f.url()));
    if (!frame) await page.waitForTimeout(250);
  }
  assert.ok(frame, '로그아웃 예시 지도 프레임이 열린다');
  await frame.waitForFunction(() => [...document.querySelectorAll('iframe')].length >= 0 && !!window.__lt?.dots, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2100);
  return { context, page, frame, errors };
}

test('지도 상세 책에서 보기: 누르면 지도에서 고른 그 순간의 책이 열리고 영어 안내는 없다(1440)', { skip: REQUIRE ? false : skip, timeout: 120000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const { context, page, frame, errors } = await openMap(browser, base, 1440);
    // 첫 순간을 고른다(상세 창이 열린다) → '책에서 보기' 클릭
    await frame.locator('#focusFirst').click({ timeout: 8000 });
    await page.waitForTimeout(700);
    assert.equal(await frame.evaluate(() => document.getElementById('detail')?.classList.contains('open')), true, '순간 상세가 열린다');
    await frame.locator('#openMoment').click({ timeout: 8000 });
    await page.waitForTimeout(1800);
    assert.equal(await page.evaluate(() => location.hash), '#book', '책 화면으로 옮겨간다');
    const book = page.frames().find((f) => /track59-sketchbook/.test(f.url()));
    assert.ok(book, '책 프레임이 열린다');
    const at = await book.evaluate(() => ({ moment: window.LTDEMO?.get?.(), first: window.LTDEMO?.moments?.find((m) => m.first)?.id }));
    assert.equal(at.moment, at.first, '지도에서 고른(첫) 순간의 책이 열린다');
    // 영어 프로토타입 안내가 남지 않았는지: network.js에 스텁 문자열이 없다(되돌리면 이 시험은 빨강이다).
    const js = readFileSync(path.join(ROOT, 'v41/views/network/network.js'), 'utf8');
    assert.equal(js.includes('Prototype'), false, 'network.js에 Prototype 스텁 안내가 없다');
    assert.equal(js.includes('lovetree.example'), false, 'network.js에 임시 주소 값이 없다');
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser?.close();
    server.close();
  }
});

test('지도 상세 책에서 보기: 390 선택 패널의 책 열기로도 그 순간의 책이 열린다', { skip: REQUIRE ? false : skip, timeout: 120000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const { context, page, frame, errors } = await openMap(browser, base, 390);
    await frame.locator('#focusFirst').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    // 모바일 선택 패널(책 열기) = onOpen → #openMoment 클릭과 같은 경로
    await frame.evaluate(() => document.getElementById('openMoment')?.click());
    await page.waitForTimeout(1800);
    assert.equal(await page.evaluate(() => location.hash), '#book', '책 화면으로 옮겨간다');
    const book = page.frames().find((f) => /track59-sketchbook/.test(f.url()));
    assert.ok(book, '책 프레임이 열린다');
    assert.equal(await book.evaluate(() => window.LTDEMO?.get?.()), await book.evaluate(() => window.LTDEMO?.moments?.find((m) => m.first)?.id), '선택한 순간의 책이 열린다');
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser?.close();
    server.close();
  }
});
