// #638-3 지도 날짜 'NaN월' 화면 시험 — 실제 기록과 같은 'YYYY-MM-DD' 날짜를 심고
// 점 아래 이름표(묶음 이름)·왼쪽 범례·아래 요약 줄(390 조작 줄) 글자에 NaN·undefined가 없는지 본다.
// 크롬이 없는 곳에서는 건너뛰고, LT_638_MAP_REQUIRE=1에서는 건너뜀을 실패로 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../public', import.meta.url)));
const REQUIRE = process.env.LT_638_MAP_REQUIRE === '1';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 지도 날짜 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 지도 날짜 시험을 건너뜀'; }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
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
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

// 사슬 모양(월별 묶음이 쓰이는 깊은 나무)에 실제 기록과 같은 대시 날짜를 심는다.
// 예시 판본의 점 날짜(2026.11.15)는 예전 코드에서도 걸리지 않았으므로, 이 시험은 실제 기록 모양으로 본다.
function chainWithDashDates() {
  const moments = Array.from({ length: 10 }, (_, i) => ({
    id: `m${i + 1}`,
    title: `순간 ${i + 1}`,
    date: `2026-${String(1 + (i % 3)).padStart(2, '0')}-${String(1 + i).padStart(2, '0')}`,
    emotion: ['설렘', '몰입', '호기심', '애정', '그리움', '기대'][i % 6],
    note: '', url: '',
    parentId: i === 0 ? null : `m${i}`
  }));
  const edges = moments.slice(1).map((m, i) => ({ kind: 'parent', from: `m${i + 1}`, to: m.id, reason: '' }));
  return { tree: { id: 'dash-tree', title: '날짜 시험 트리', moments, edges }, momentId: 'm1' };
}

async function openMap(base, { width, stub }) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 852 : 900 }, reducedMotion: 'reduce', locale: 'ko-KR' });
  await ctx.addInitScript((s) => {
    try { localStorage.setItem('lt41.theme', 'night'); localStorage.setItem('lt41.boardTheme', 'night'); } catch {}
    window.LT41 = s;
  }, stub);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  await page.goto(`${base}/v41/views/track56-network.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__lt?.dots?.().length > 0, null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  return { ctx, page, errors, browser };
}

async function collectTexts(page) {
  return page.evaluate(() => {
    const texts = [];
    // 점·묶음 이름표(캔버스에 그린 글자 — 묶음 이름은 점 아래에 붙는다).
    for (const label of (window.__lt?.labels?.() || [])) texts.push(String(label?.text || ''));
    // 왼쪽 범례(묶음 요약)와 아래 요약 줄(조작 줄 단추 글자).
    document.querySelectorAll('.legend-row').forEach(row => texts.push(row.textContent || ''));
    document.querySelectorAll('.mobile-ribbon button').forEach(button => texts.push(button.textContent || ''));
    const status = document.querySelector('#routeStatus');
    if (status) texts.push(status.textContent || '');
    return texts;
  });
}

test('#638-3 지도 글자에 NaN·undefined가 없다(390·1440, 실제 기록 날짜)', async () => {
  if (skip) return REQUIRE ? Promise.reject(new Error(skip)) : undefined;
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const width of [390, 1440]) {
      const { ctx, page, errors, browser } = await openMap(base, { width, stub: chainWithDashDates() });
      try {
        assert.deepEqual(errors, [], `${width}: 화면 오류가 없다`);
        const texts = await collectTexts(page);
        assert.ok(texts.length > 0, `${width}: 이름표·범례·요약 줄 글자를 읽는다`);
        for (const text of texts) assert.doesNotMatch(text, /NaN|undefined/, `${width}: '${text}'에 흔적 값이 없다`);
        // 월 묶음 이름이 실제로 'YYYY년 M월' 모양인지(고친 함수가 쓰였는지)도 본다.
        const monthNames = texts.filter(text => /년 .*월/.test(text));
        assert.ok(monthNames.length > 0, `${width}: 월 묶음 이름이 보인다`);
        for (const name of monthNames) assert.match(name, /\d{4}년 \d+(–\d+)?월/, `${width}: '${name}'`);
      } finally {
        await browser.close();
      }
    }
  } finally {
    server.close();
  }
});
