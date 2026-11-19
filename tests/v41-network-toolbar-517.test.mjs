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
// #951: 순간 3개·8개짜리 주인 트리를 지도 화면에 직접 띄우는 호스트(셸 없이 — #792와 같은 틀).
const mapHostHTML = (n) => {
  const titles = ['Super Shy 무대', 'Ditto 직캠', 'OMG 앵콜', 'Hype Boy 연습실', 'Attention 무대', 'Cookie 직캠', 'ETA 뮤비', 'Get Up 무대'];
  const tree = {
    id: 't1', title: '뉴진스 순간', subject: '뉴진스',
    moments: Array.from({ length: n }, (_, i) => ({ id: `m${i + 1}`, title: titles[i] || `순간 ${i + 1}`, date: `2026-11-${String(10 + i).padStart(2, '0')}`, emotion: '설렘', note: '공연의 한 장면', url: '', parentId: i === 0 ? null : `m${i}`, relation: '' })),
    edges: Array.from({ length: Math.max(0, n - 1) }, (_, i) => ({ kind: 'parent', from: `m${i + 1}`, to: `m${i + 2}`, reason: '이 다음 장면이 궁금해서' }))
  };
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>지도 호스트</title></head><body data-member="in" data-record-source="server"><script>window.LT41={source:'server',writable:true,owned:true,momentId:'m1',prefs:{},tree:${JSON.stringify(tree)},trees:[]};location.hash='#network';</script><iframe src="/v41/views/track56-network.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;
};
const EXTRA_ROUTES = { '/map-host-3.html': mapHostHTML(3), '/map-host-8.html': mapHostHTML(8) };
async function serve() {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    if (EXTRA_ROUTES[clean]) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(EXTRA_ROUTES[clean]); return; }
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
            // #951 ①: 보기 방식은 붙은 단추 하나이고 좁으면 그 안에서 가로로 민다 — 묶음 칸 밖으로 나간 부분은 잘린 것으로 본다.
            const buttons = [...(row?.querySelectorAll('button') || [])].filter(vis).map((b) => {
              const r = b.getBoundingClientRect(), sw = b.closest('.view-switch'), st = sw ? sw.getBoundingClientRect() : null;
              return { id: b.id || (b.textContent || '').trim().slice(0, 10), l: Math.round(st ? Math.max(r.left, st.left) : r.left), r: Math.round(st ? Math.min(r.right, st.right) : r.right), h: Math.round(r.height) };
            });
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

// ── #951 ①② (대표 11-19): 위 단추 한 줄·작은 무리는 순간 8개 이하에서 가운데로 ──
test('#951 ①② 위 단추 한 줄(높이 같음·줄 수 1) + 순간 3개 작은 무리(선 ≤240px·가운데 ±10%·이름표 0개 빠짐)', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      await context.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); localStorage.removeItem('lt41.boardTheme'); } catch {} });
      const page = await context.newPage();
      await page.goto(`${base}/map-host-3.html`, { waitUntil: 'load' });
      let frame = null;
      for (let i = 0; i < 80 && !frame; i++) { frame = page.frames().find(f => /track56-network/.test(f.url())); if (!frame) await page.waitForTimeout(250); }
      assert.ok(frame, `${width}: 지도 프레임이 열린다`);
      await frame.waitForFunction(() => (window.__lt?.dots?.()?.length || 0) > 0, null, { timeout: 20000 });
      await page.waitForTimeout(500);
      const m = await frame.evaluate(() => {
        const vis = (el) => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const rect = (el) => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), h: Math.round(r.height) }; };
        const heroes = [...document.querySelectorAll('.top-actions button')].filter(vis);
        const boxes = heroes.map((b) => ({ id: b.id || b.textContent.trim().slice(0, 8), ...rect(b), oneLine: b.scrollHeight - b.clientHeight <= 1 }));
        // 단추끼리 겹침: 단추의 가운데 높이 세 점이 그 단추(또는 그 안 자식)에게 잡히지 않으면 가려진 것이다.
        const overlaps = [];
        for (const b of heroes) {
          const r = b.getBoundingClientRect();
          const own = (t) => !!t && (t === b || b.contains(t));
          const points = [[Math.max(r.left, r.left + 10), r.top + r.height / 2], [r.right - 10, r.top + r.height / 2], [r.left + r.width / 2, r.top + r.height / 2]];
          if (!points.every(([x, y]) => own(document.elementFromPoint(x, y)))) overlaps.push(b.id || b.textContent.trim());
        }
        const meta = document.getElementById('connection-tool');
        const dots = window.__lt.dots();
        const labels = new Set(window.__lt.labels().map((l) => l.id));
        const missing = dots.map((d) => d.id).filter((id) => !labels.has(id));
        const cx = dots.reduce((s, d) => s + d.x, 0) / dots.length, cy = dots.reduce((s, d) => s + d.y, 0) / dots.length;
        const picker = document.querySelector('.lt-moment-picker');
        const swRect = document.querySelector('.view-switch')?.getBoundingClientRect();
        const visibleSwitch = boxes.filter((b) => ['viewNet', 'viewConc', 'viewGraph'].includes(b.id));
        return {
          vw: innerWidth, vh: innerHeight, boxes, overlaps, heights: [...new Set(heroes.map((b) => Math.round(b.getBoundingClientRect().height)))],
          oneLineAll: heroes.every((b) => b.scrollHeight - b.clientHeight <= 1),
          meta: meta && meta.textContent.trim(), metaTop: meta ? rect(meta).t : null,
          pickerTop: vis(picker) ? rect(picker).t : null,
          compact: window.__lt.compact(), edgeMax: Math.max(0, ...window.__lt.edgeLen()),
          cx: Math.round(cx), cy: Math.round(cy), missing, dots: dots.length,
          switchFit: !!swRect && swRect.right <= innerWidth + 1 && visibleSwitch.every((b) => b.l >= (swRect.left - 1) && b.r <= swRect.right + 1 && b.t >= swRect.top - 1 && b.b <= swRect.bottom + 1),
          overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth, ...boxes.map((b) => Math.max(0, b.r - innerWidth)))
        };
      });
      assert.equal(m.boxes.length, 5, `${width}: 위 단추 5개(보기 3·⤢·⋯)`);
      assert.deepEqual(m.heights, [m.heights[0]], `${width}: 위 단추 높이 모두 같음(${m.heights})`);
      assert.ok(m.oneLineAll, `${width}: 위 단추 글자 줄 수 1`);
      assert.deepEqual(m.overlaps, [], `${width}: 위 단추끼리 겹침 없음(${m.overlaps})`);
      assert.equal(m.overflow, 0, `${width}: 화면 가로 넘침 0`);
      assert.ok(m.switchFit, `${width}: 보기 방식 붙은 단추는 한 덩어리로 화면 안에 있다`);
      assert.match(m.meta, /^순간 3 · 이어진 선 2개$/, `${width}: 아래 작은 글자`);
      assert.ok(m.metaTop != null && (m.pickerTop == null || m.metaTop < m.pickerTop), `${width}: 작은 글자는 순간 고르기 줄보다 위`);
      assert.ok(m.compact, `${width}: 순간 3개는 작은 무리 배치`);
      assert.ok(m.edgeMax <= 240, `${width}: 선 최대 길이 ≤240px(${m.edgeMax})`);
      const tolX = m.vw * 0.10, tolY = m.vh * 0.10;
      assert.ok(Math.abs(m.cx - m.vw / 2) <= tolX && Math.abs(m.cy - m.vh / 2) <= tolY, `${width}: 무리 중심이 화면 가운데 ±10%(${m.cx},${m.cy})`);
      assert.deepEqual(m.missing, [], `${width}: 이름표 없는 순간 0(${m.dots}개)`);
      // ⋯ 안: 배경(테마 따라가기·종이·밤)과 사용법이 함께 있고, 배경을 고르면 판 속성이 따라온다.
      await frame.click('#netBgBtn');
      const menu = await frame.evaluate(() => {
        const box = document.getElementById('netBgMenu');
        return { open: !box.hidden, items: [...box.querySelectorAll('button')].filter((b) => getComputedStyle(b).display !== 'none').map((b) => (b.textContent || '').trim()), expanded: document.getElementById('netBgBtn').getAttribute('aria-expanded') };
      });
      assert.ok(menu.open && menu.expanded === 'true', `${width}: ⋯를 누르면 메뉴가 열린다`);
      assert.deepEqual(menu.items, ['테마 따라가기', '종이', '밤', '사용법'], `${width}: 메뉴는 배경·도움말`);
      await page.keyboard.press('Escape');
      assert.ok(await frame.evaluate(() => document.getElementById('netBgMenu').hidden), `${width}: Esc로 메뉴가 닫힌다`);
      await frame.click('#netBgBtn');
      await frame.click('#netBgMenu .lt-bg-item[data-bg=night]');
      assert.equal(await frame.evaluate(() => document.documentElement.getAttribute('data-lt-board-theme')), 'night', `${width}: '밤'을 고르면 밤 판이 된다`);
      await context.close();
    }
  } finally {
    await browser?.close();
    server.close();
  }
});
