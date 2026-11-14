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
    const combos = [];
    for (const width of [1440, 390]) for (const appTheme of ['night', 'garden']) for (const plate of ['paper', 'night']) combos.push({ width, appTheme, plate });
    // 한 브라우저에서 조합을 둘씩 동시에 돌린다(지도 잡 시간 단축): 픽셀 해석이 페이지(렌더러 프로세스)별로
    // 나뉘어 실행기 코어를 함께 쓴다. 단언·기준값·측정 방식은 그대로고, 한 조합이 실패해도 나머지를 끝까지
    // 돌려 실패를 모두 보고한 뒤 처음 실패로 끝난다.
    const runCombo = async ({ width, appTheme, plate }) => {
      const ctx = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
      try {
        await ctx.addInitScript(({ plate, appTheme }) => { localStorage.setItem('lt41.theme', appTheme); localStorage.setItem('lt41.boardTheme', plate); localStorage.setItem('lt41.network.view', 'network'); }, { plate, appTheme });
        await ctx.addInitScript(installMapPaintProbe);
        const page = await ctx.newPage(), errors = [];
        page.on('pageerror', e => errors.push(String(e.message || e)));
        await page.goto(`${base}/v41/#network`, { waitUntil: 'load' });
        // #583: 전체 자리(npm test)에서는 여러 브라우저 시험이 함께 도는 — 첫 그리기 대기만 넉넉히(단언·측정은 그대로).
        await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some(f => f.contentWindow?.__lt?.dots?.().length > 0), null, { timeout: 30000 });
        const frame = page.frames().find(f => /track56-network/.test(f.url()));
        assert.ok(frame, '지도 프레임을 찾지 못함');
        await frame.evaluate(() => document.fonts.ready);
        // 환경 확인: 한글 글꼴이 없는 실행기에서는 이름표가 가는 대체 글리프로 그려져 '글자 속' 표본이 0이 된다(#529).
        // 제품 대비 미달과 섞이지 않게, 재기 전에 환경 문제로 분명히 멈춘다.
        const inkDark = await frame.evaluate(() => {
          const c = document.createElement('canvas'); c.width = 96; c.height = 48; c.lang = document.documentElement.lang;
          const x = c.getContext('2d', { alpha: false, willReadFrequently: true });
          x.fillStyle = '#fff'; x.fillRect(0, 0, 96, 48); x.scale(2, 2); x.font = '600 12px Pretendard, sans-serif'; x.fillStyle = '#000'; x.fillText('도시의 창', 2, 16);
          const d = x.getImageData(0, 0, 96, 48).data; let n = 0;
          for (let i = 0; i < d.length; i += 4) if (Math.max(d[i], d[i + 1], d[i + 2]) <= 10) n++;
          return n;
        });
        assert.ok(inkDark > 20, `환경 문제: 이 실행기에 한글 글꼴이 없어 이름표 글자를 잴 수 없음(글자 속 픽셀 ${inkDark}) — 제품 대비 문제가 아님. 작업 흐름의 한글 글꼴 준비 단계를 확인`);
        await page.waitForTimeout(500);
        const results = [];
        for (const view of ['network', 'concentric']) {
          if (view === 'concentric') { await frame.locator('#viewConc').click(); await settleMap(frame); }
          for (const state of view === 'network' ? ['overview', 'focus', 'cluster'] : ['overview', 'focus']) {
            if (state === 'focus') {
              await settleMap(frame);
              const dot = await frame.evaluate(() => window.__lt.dots().find(d => !d.first));
              await frame.locator('#stage').click({ position: { x: dot.x, y: dot.y } });
              await settleMap(frame);
              assert.ok(await frame.locator('#detail').evaluate(el => el.classList.contains('open')), '점을 누르면 상세가 열려야 함');
            }
            if (state === 'cluster') {
              await settleMap(frame);
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
              if (row.ratio < threshold) failures.push(`${tag} canvas ${row.role}(${row.id}) ${row.fg}/${row.bg} ${row.ratio}:1 < ${threshold}${row.why ? ' ' + JSON.stringify(row.why) : ''}`);
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
    };
    let next = 0;
    const problems = [];
    const worker = async () => { while (next < combos.length) { const combo = combos[next++]; try { await runCombo(combo); } catch (error) { problems.push(error); } } };
    await Promise.all([worker(), worker()]);
    if (problems.length) throw problems[0];
    if (OUT) await writeFile(path.join(OUT, 'contrast.json'), JSON.stringify(evidence, null, 2));
    assert.equal(failures.length, 0, `실제 화면 대비 미달 ${failures.length}건:\n${failures.slice(0, 80).join('\n')}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
  }
});
