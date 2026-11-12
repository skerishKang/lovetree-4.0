// #504: real rendered pixels/styles, and a required browser in the preview job.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installMapPaintProbe, measureMap, worstMapRoles, settleMap } from './helpers/map-contrast.mjs';

const ROOT = path.resolve(process.env.LT_MAP_CONTRAST_ROOT || fileURLToPath(new URL('../public', import.meta.url)));
const REQUIRE = process.env.LT_MAP_CONTRAST_REQUIRE === '1';
const OUT = process.env.LT_MAP_CONTRAST_OUT;
let chromium, skip = false;
try { ({ chromium } = await import('playwright')); if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없음'; }
catch { skip = 'playwright 패키지가 없음'; }
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };

function serve(root) {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    for (const file of [path.join(root, clean), path.join(root, clean, 'index.html')]) {
      if (!file.startsWith(root + path.sep)) continue;
      try { if ((await stat(file)).isFile()) { res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); createReadStream(file).pipe(res); return; } } catch {}
    }
    res.writeHead(404); res.end('not found');
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

test('지도 실제 대비: 앱 2 × 판 2 × 1440·390, 두 보기·선택 상태의 글자 4.5와 점·선 3 이상', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 지도 대비 시험 건너뜀이 실패다 — ${skip}`);
  const server = await serve(ROOT), base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const failures = [], evidence = [];
  try {
    if (OUT) await mkdir(OUT, { recursive: true });
    browser = await chromium.launch({ headless: true });
    for (const width of [1440, 390]) for (const appTheme of ['night', 'garden']) for (const plate of ['paper', 'night']) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
      try {
        await ctx.addInitScript(({ plate, appTheme }) => { localStorage.setItem('lt41.theme', appTheme); localStorage.setItem('lt41.boardTheme', plate); localStorage.setItem('lt41.network.view', 'network'); }, { plate, appTheme });
        await ctx.addInitScript(installMapPaintProbe);
        const page = await ctx.newPage(), errors = [];
        page.on('pageerror', e => errors.push(String(e.message || e)));
        await page.goto(`${base}/v41/#network`, { waitUntil: 'load' });
        await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some(f => f.contentWindow?.__lt?.dots?.().length > 0), null, { timeout: 15000 });
        const frame = page.frames().find(f => /track56-network/.test(f.url()));
        assert.ok(frame, '지도 프레임을 찾지 못함');
        await frame.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(500);
        const results = [];
        for (const view of ['network', 'concentric']) {
          if (view === 'concentric') { await frame.locator('#viewConc').click(); await settleMap(frame); }
          for (const state of view === 'network' ? ['overview', 'focus', 'cluster'] : ['overview', 'focus']) {
            if (state === 'focus') {
              const dot = await frame.evaluate(() => window.__lt.dots().find(d => !d.first));
              await frame.locator('#stage').click({ position: { x: dot.x, y: dot.y } });
              await settleMap(frame);
              assert.ok(await frame.locator('#detail').evaluate(el => el.classList.contains('open')), '점을 누르면 상세가 열려야 함');
            }
            if (state === 'cluster') {
              const hub = await frame.evaluate(() => window.__lt.hubs()[0]);
              await frame.locator('#stage').click({ position: { x: hub.x, y: hub.y } });
              await settleMap(frame);
              assert.equal(await frame.evaluate(() => window.__lt.state.mode), 'CLUSTER_PATH_OVERVIEW', '묶음을 누르면 묶음 보기');
              await frame.waitForFunction(() => performance.now() - window.__lt.state.revealStart > 1700);
            }
            const measured = await measureMap(frame), tag = `${width}-${appTheme}-${plate}-${view}-${state}`;
            results.push(measured);
            for (const row of measured.canvas.rows) {
              const threshold = ['label', 'hub-number'].includes(row.role) ? 4.5 : 3;
              if (row.ratio < threshold) failures.push(`${tag} canvas ${row.role}(${row.id}) ${row.fg}/${row.bg} ${row.ratio}:1 < ${threshold}`);
            }
            for (const row of measured.dom) if (row.ratio < 4.5) failures.push(`${tag} DOM ${row.role}(${row.id}) ${row.fg}/${row.bg} ${row.ratio}:1 < 4.5`);
            evidence.push({ tag, canvas: measured.canvas, dom: measured.dom });
            if (OUT) await writeFile(path.join(OUT, `${tag}.png`), measured.screenshot);
            if (state === 'focus') { await frame.locator('#detailClose').click(); await frame.locator('#overviewBtn').click(); await settleMap(frame); }
            if (state === 'cluster') { await frame.locator('#overviewBtn').click(); await settleMap(frame); }
          }
        }
        const worst = worstMapRoles(results), canvasRoles = new Set(worst.filter(r => r.kind === 'canvas').map(r => r.role)), domRoles = new Set(worst.filter(r => r.kind === 'dom').map(r => r.role));
        for (const role of ['label', 'hub-number', 'dot', 'first-dot', 'first-inner-ring', 'first-ring', 'line', 'arrow', 'guide-ring']) assert.ok(canvasRoles.has(role), `${width}-${appTheme}-${plate}: ${role} 캡처 픽셀 누락`);
        for (const role of ['toolbar', 'hint', 'detail', width === 1440 ? 'legend' : 'ribbon', ...(width === 1440 ? ['explorer'] : ['picker'])]) assert.ok(domRoles.has(role), `${width}-${appTheme}-${plate}: ${role} 글자 측정 누락`);
        assert.deepEqual(errors, [], `${width}-${appTheme}-${plate}: 페이지 오류`);
        console.log(JSON.stringify({ combination: `${width}-${appTheme}-${plate}`, minimums: worst.map(({ kind, role, ratio, fg, bg }) => ({ kind, role, ratio, fg, bg })) }));
      } finally { await ctx.close(); }
    }
    if (OUT) await writeFile(path.join(OUT, 'contrast.json'), JSON.stringify(evidence, null, 2));
    assert.equal(failures.length, 0, `실제 화면 대비 미달 ${failures.length}건:\n${failures.slice(0, 80).join('\n')}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
  }
});
