// #583 부채꼴 나무·'이 순간 열기' — 지도 화면 실브라우저 시험.
// 평평한 트리(첫 순간 하나에 25개가 이어진 모양, 대표 트리와 같다)에서 그물 보기가 묶음 칸으로
// 쪼개지 않고 한 고리에 펼쳐 겹침 0인지, 주소 약속(?open=<순간> — 셸이 #my/network?moment=…로
// 열 때 붙인다)으로 열면 그 순간이 고른 상태로 화면 가운데에 오는지 잰다.
// 크롬이 없는 곳에서는 건너뛰고, LT_MAP_FAN_REQUIRE=1(미리보기 검사)에서는 건너뜀을 실패로 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flat26, lt41Stub } from './helpers/map-shapes.mjs';

const ROOT = path.resolve(process.env.LT_MAP_FAN_ROOT || fileURLToPath(new URL('../public', import.meta.url)));
const REQUIRE = process.env.LT_MAP_FAN_REQUIRE === '1';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 지도 부채꼴 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 지도 부채꼴 시험을 건너뜀'; }
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
// 지도 한 장을 셸 없이 직접 연다(셸이 LT41로 넘기는 문맥을 같은 모양으로 심는다).
async function openMap(browser, base, { width, query = '' }) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 852 : 900 }, reducedMotion: 'reduce', locale: 'ko-KR' });
  await ctx.addInitScript(({ stub }) => {
    try { localStorage.setItem('lt41.theme', 'night'); localStorage.setItem('lt41.boardTheme', 'night'); } catch {}
    window.LT41 = stub;
  }, { stub: lt41Stub(flat26(), 'm01') });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  await page.goto(`${base}/v41/views/track56-network.html${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__lt?.dots?.().length > 0, null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  return { ctx, page, errors };
}
// 화면에 실제로 그린 점·이름표를 읽어 겹침·잘림을 잰다(단언은 화면 기준 — 배치 함수의 자기 평가가 아니다).
async function measure(page) {
  return page.evaluate(() => {
    const lt = window.__lt, box = lt.box(), dots = lt.dots(), labels = lt.labels();
    let dotOverlaps = 0;
    for (let i = 0; i < dots.length; i++) for (let j = i + 1; j < dots.length; j++) {
      if (Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y) < dots[i].r + dots[j].r + 1) dotOverlaps++;
    }
    let labelOverlaps = 0, labelClipped = 0, labelOnDot = 0;
    for (let i = 0; i < labels.length; i++) {
      const a = labels[i].rect;
      if (a.l < box.x - 2 || a.r > box.x + box.w + 2 || a.t < box.y - 2 || a.b > box.y + box.h + 2) labelClipped++;
      if (dots.some(d => { const cx = Math.max(a.l, Math.min(d.x, a.r)), cy = Math.max(a.t, Math.min(d.y, a.b)); return Math.hypot(d.x - cx, d.y - cy) < d.r + 1; })) labelOnDot++;
      for (let j = i + 1; j < labels.length; j++) {
        const b = labels[j].rect;
        if (a.l < b.r + 2 && a.r > b.l - 2 && a.t < b.b + 2 && a.b > b.t - 2) labelOverlaps++;
      }
    }
    const outside = dots.filter(d => d.x < box.x || d.x > box.x + box.w || d.y < box.y || d.y > box.y + box.h).length;
    return { dots: dots.length, labels: labels.length, dotOverlaps, labelOverlaps, labelClipped, labelOnDot, outside, scale: lt.state.scale };
  });
}

test('평평한 26순간: 그물 보기가 한 고리(부채꼴)로 펼쳐 노드·이름표 겹침 0, 처음 보기는 화면에 맞게', { skip: REQUIRE ? false : skip, timeout: 120000 }, async () => {
  if (skip) assert.fail(`CI에서는 지도 부채꼴 시험 건너뜀이 실패다 — ${skip}`);
  const server = await serve(), base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390]) {
      const { ctx, page, errors } = await openMap(browser, base, { width });
      try {
        assert.deepEqual(errors, [], `페이지 오류 없이 떠야 한다(${width})`);
        const lt = await page.evaluate(() => ({ fan: window.__lt.fan(), mode: window.__lt.state.mode, selected: window.__lt.state.selected?.id || null }));
        assert.equal(lt.fan, true, `한 순간에 25개가 이어진 나무는 부채꼴 배치여야 한다(${width})`);
        assert.equal(lt.mode, 'OVERVIEW', `처음 보기는 전체 보기다(${width})`);
        const m = await measure(page);
        assert.equal(m.dots, 26, `순간 26개가 모두 그려져야 한다(${width})`);
        assert.equal(m.dotOverlaps, 0, `노드 겹침 0(${width})`);
        assert.equal(m.labelOverlaps, 0, `이름표 겹침 0(${width})`);
        assert.equal(m.labelClipped, 0, `이름표 잘림 0(${width})`);
        assert.equal(m.labelOnDot, 0, `이름표가 점 위에 겹치지 않는다(${width})`);
        assert.equal(m.outside, 0, `처음 보기에서 모든 순간이 화면 안이다(${width})`);
        assert.equal(m.scale, 1, `처음 보기는 화면에 맞게(배율 1)(${width})`);
      } finally { await ctx.close(); }
    }
  } finally { await browser.close(); server.close(); }
});

test("'이 순간 열기': ?open=<순간>으로 열면 그 순간이 고른 상태로 화면 가운데, 없으면 예전대로 전체 보기", { skip: REQUIRE ? false : skip, timeout: 120000 }, async () => {
  if (skip) assert.fail(`CI에서는 지도 부채꼴 시험 건너뜀이 실패다 — ${skip}`);
  const server = await serve(), base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { ctx, page, errors } = await openMap(browser, base, { width: 1440, query: '?open=m13' });
    try {
      assert.deepEqual(errors, [], '페이지 오류 없이 떠야 한다');
      const st = await page.evaluate(() => ({
        selected: window.__lt.state.selected?.id || null,
        mode: window.__lt.state.mode,
        detailOpen: document.getElementById('detail').classList.contains('open'),
        box: window.__lt.box(),
        dot: window.__lt.dots().find(d => d.id === 'm13') || null
      }));
      assert.equal(st.selected, 'm13', '주소가 가리킨 순간이 고른 상태여야 한다');
      assert.equal(st.mode, 'MOMENT_FOCUS', '고른 순간에 맞춘 모드여야 한다');
      assert.equal(st.detailOpen, true, '고른 순간의 상세 판이 열려야 한다');
      assert.ok(st.dot, '고른 순간이 화면에 그려져야 한다');
      const cx = st.box.x + st.box.w / 2, cy = st.box.y + st.box.h / 2;
      assert.ok(Math.abs(st.dot.x - cx) <= 30 && Math.abs(st.dot.y - cy) <= 30, `고른 순간이 화면 가운데여야 한다 — 점 (${Math.round(st.dot.x)},${Math.round(st.dot.y)}) / 상자 가운데 (${Math.round(cx)},${Math.round(cy)})`);
    } finally { await ctx.close(); }
    // ?open=이 없으면 예전대로: 전체 보기(배율 1)로 뜨고 상세는 닫혀 있다.
    const plain = await openMap(browser, base, { width: 1440 });
    try {
      const st = await plain.page.evaluate(() => ({
        mode: window.__lt.state.mode, scale: window.__lt.state.scale,
        detailOpen: document.getElementById('detail').classList.contains('open'),
        selected: window.__lt.state.selected?.id || null
      }));
      assert.equal(st.mode, 'OVERVIEW', '그냥 열면 전체 보기다');
      assert.equal(st.scale, 1, '그냥 열면 화면에 맞게(배율 1)이다');
      assert.equal(st.detailOpen, false, '그냥 열면 상세 판은 닫혀 있다');
      assert.equal(st.selected, 'm01', '셸이 고른 순간(첫 순간)은 선택으로 남는다(예전 동작)');
    } finally { await plain.ctx.close(); }
  } finally { await browser.close(); server.close(); }
});
