import { listenOnSafePort } from './helpers/safe-port.mjs';
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
import { settleMap } from './helpers/map-contrast.mjs';
import { evaluateWhenReady } from './helpers/visible-frame.mjs';

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
const PNG16 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAOUlEQVR42u3NMQEAAAgDoC251a3gLzSgmXBPFEVRFEVRFEVRFEVRFEVRFEVRFEVRFEVRFEVRFEVRFEXxWnwXTQGx6y1+AAAAAElFTkSuQmCC';
// #951 ③: 점 자리 썸네일 세 경우(그림 있음 · 깨진 주소 · 그림 없음)를 한 판에 둔다.
const mapHostThumbHTML = () => {
  const tree = {
    id: 't1', title: '뉴진스 순간', subject: '뉴진스',
    moments: [
      { id: 'm1', title: 'Ditto 직캠', date: '2026-11-10', emotion: '설렘', note: '공연', url: '', parentId: null },
      { id: 'm2', title: 'OMG 앵콜', date: '2026-11-11', emotion: '설렘', note: '공연', url: '', parentId: 'm1' },
      { id: 'm3', title: 'Hype Boy 연습실', date: '2026-11-12', emotion: '설렘', note: '공연', url: '', parentId: 'm2' }
    ],
    edges: [{ kind: 'parent', from: 'm1', to: 'm2', reason: '' }, { kind: 'parent', from: 'm2', to: 'm3', reason: '' }]
  };
  // 그림은 셸이 exampleMedia로 넘긴다(runtime.js의 image 경로) — m1 있음 · m2 깨진 주소 · m3 없음.
  const media = { m1: { image: PNG16, type: 'photo' }, m2: { image: '/v41/definitely-missing-thumb.png', type: 'photo' } };
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>지도 호스트</title></head><body data-member="in" data-record-source="server"><script>window.LT41={source:'server',tree:${JSON.stringify(tree)},exampleMedia:${JSON.stringify(media)},momentId:'m1'};</script><iframe src="/v41/views/track56-network.html" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe></body></html>`;
};
// #951 ⑤(CTO 261120): 서재에서 내 트리 지도로 들어온 상태 — 셸이 넘기는 문맥(source:'server'·writable:true)과 같게 둔다.
// 이 상태에서만 '← 서재'가 보인다(읽기 전용인 공유·예시에서는 일부러 숨긴다 — tree-title.mjs의 readOnly).
// 1×1 사진 — 상세 판 사진 칸이 비지 않게(그림 내용은 시험 대상이 아니다).
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
const mapHostMemberHTML = (n) => {
  const titles = ['Super Shy 무대', 'Ditto 직캠', 'OMG 앵콜', 'Hype Boy 연습실', 'Attention 무대', 'Cookie 직캠', 'ETA 뮤비', 'Get Up 무대'];
  const ids = Array.from({ length: n }, (_, i) => `m${i + 1}`);
  const tree = {
    id: 't1', title: '뉴진스 순간', subject: '뉴진스', owned: true,
    moments: ids.map((id, i) => ({ id, title: titles[i] || `순간 ${i + 1}`, date: `2026-11-${String(10 + i).padStart(2, '0')}`, emotion: '설렘', note: '공연', url: '', parentId: i ? ids[i - 1] : null })),
    edges: ids.slice(1).map((id, i) => ({ kind: 'parent', from: ids[i], to: id, reason: '이 다음 장면이 궁금해서' }))
  };
  const media = Object.fromEntries(ids.map((id) => [id, { image: PHOTO, type: 'photo' }]));
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>지도 호스트</title></head><body data-member="in" data-record-source="server"><script>window.LT41={source:'server',writable:true,tree:${JSON.stringify(tree)},trees:[${JSON.stringify(tree)}],exampleMedia:${JSON.stringify(media)},momentId:'m1'};</script><iframe src="/v41/views/track56-network.html" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe></body></html>`;
};
// #951 ⑥: 묶음 2개짜리 데이터(사슬 10순간, 10월·11월) — 범례가 보이는 쪽을 확인한다.
const mapHostMember2GHTML = () => {
  const titles = ['Super Shy 무대', 'Ditto 직캠', 'OMG 앵콜', 'Hype Boy 연습실', 'Attention 무대', 'Cookie 직캠', 'ETA 뮤비', 'Get Up 무대', '첫 팝업 사진', '라디오 한마디'];
  const ids = Array.from({ length: 10 }, (_, i) => `m${i + 1}`);
  const tree = {
    id: 't1', title: '뉴진스 순간', subject: '뉴진스', owned: true,
    moments: ids.map((id, i) => ({ id, title: titles[i], date: `2026-${i < 5 ? '10' : '11'}-${String(10 + i).padStart(2, '0')}`, emotion: '설렘', note: '공연', url: '', parentId: i ? ids[i - 1] : null })),
    edges: ids.slice(1).map((id, i) => ({ kind: 'parent', from: ids[i], to: id, reason: '이 다음 장면이 궁금해서' }))
  };
  const media = Object.fromEntries(ids.map((id) => [id, { image: PHOTO, type: 'photo' }]));
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>지도 호스트</title></head><body data-member="in" data-record-source="server"><script>window.LT41={source:'server',writable:true,tree:${JSON.stringify(tree)},trees:[${JSON.stringify(tree)}],exampleMedia:${JSON.stringify(media)},momentId:'m1'};</script><iframe src="/v41/views/track56-network.html" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe></body></html>`;
};
const mapHost1574HTML = (n) => {
  const ids = Array.from({ length: n }, (_, i) => `m${String(i + 1).padStart(2, '0')}`);
  const dateOf = i => {
    const d = new Date(Date.UTC(2026, 0, 1 + i));
    return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
  };
  const moments = ids.map((id, i) => ({
    id, title: i === 0 ? '처음 눈에 들어온 순간의 긴 제목 '.repeat(14).slice(0, 240) : `순간 제목 ${String(i + 1).padStart(2, '0')} — 알아볼 수 있는 이름`,
    date: dateOf(i), emotion: '설렘', note: i === 0 ? '긴 제목의 나머지 내용도 상세 판에서 끝까지 읽을 수 있어야 한다.' : '',
    url: '', parentId: i ? ids[0] : null
  }));
  const tree = {
    id: 't1574', title: '지도 시험', subject: '시험', owned: true, moments,
    demoData: { moments: moments.map((m, i) => ({ ...m, first: i === 0 })) },
    edges: ids.slice(1).map(id => ({ kind: 'parent', from: ids[0], to: id, reason: '같은 순간에서 이어졌다.' }))
  };
  const media = Object.fromEntries(ids.map(id => [id, { image: PHOTO, type: 'photo' }]));
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>지도 시험</title></head><body data-member="in" data-record-source="server"><script>window.LT41={source:'server',writable:true,tree:${JSON.stringify(tree)},trees:[],exampleMedia:${JSON.stringify(media)},momentId:'m01'};location.hash='#network';</script><iframe src="/v41/views/track56-network.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;
};
const EXTRA_ROUTES = { '/map-host-3.html': mapHostHTML(3), '/map-host-8.html': mapHostHTML(8), '/map-host-thumb.html': mapHostThumbHTML(), '/map-host-member-3.html': mapHostMemberHTML(3), '/map-host-member-8.html': mapHostMemberHTML(8), '/map-host-member-2g.html': mapHostMember2GHTML(), '/map-host-1574-26.html': mapHost1574HTML(26), '/map-host-1574-60.html': mapHost1574HTML(60) };
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
  await listenOnSafePort(server, '127.0.0.1');
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
    const v = parseFloat(document.documentElement?.style?.getPropertyValue('--lt-picker-top') || '0');
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
    for (const [width, height] of [[1440, 900], [390, 844], [375, 812], [360, 780]]) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      await context.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); localStorage.removeItem('lt41.boardTheme'); } catch {} });
      const page = await context.newPage();
      await page.goto(`${base}/map-host-3.html`, { waitUntil: 'load' });
      let frame = null;
      for (let i = 0; i < 80 && !frame; i++) { frame = page.frames().find(f => /track56-network/.test(f.url())); if (!frame) await page.waitForTimeout(250); }
      assert.ok(frame, `${width}: 지도 프레임이 열린다`);
      await frame.waitForFunction(() => (window.__lt?.dots?.()?.length || 0) > 0, null, { timeout: 20000 });
      await page.waitForTimeout(500);
      if (width < 431) {
        const more = frame.locator('.lt-screen-toolbar .lt-toolbar-more');
        if (await more.isVisible()) await more.click();
      }
      const m = await evaluateWhenReady(frame, () => {
        const root = document.documentElement;
        if (!root || !document.body) return false;
        const vis = (el) => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const rect = (el) => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), h: Math.round(r.height) }; };
        // 도구 줄로 옮긴 단추와 접힌 메뉴의 단추를 확인한다(이어 보기는 줄 끝 공통 단추라 세지 않는다).
        const rowHeroes = [...document.querySelectorAll('.lt-screen-toolbar .lt-toolbar-tools button:not(#mapPlayBtn):not(#playAllBtn):not(#cinemaBtn)')];
        const menuHeroes = [...document.querySelectorAll('.lt-screen-toolbar .lt-toolbar-menu button:not(#mapPlayBtn):not(#playAllBtn):not(#cinemaBtn)')];
        const more = document.querySelector('.lt-screen-toolbar .lt-toolbar-more');
        const heroes = rowHeroes.filter(vis);
        const menuButtons = menuHeroes.filter(vis);
        const allHeroes = [...heroes, ...menuButtons];
        const rowControls = [...heroes, ...(vis(more) ? [more] : [])];
        // #951 ①: 보기 방식 묶음은 좁으면 안에서 가로로 민다 — 묶음 칸 밖으로 나간 부분은 잘린 것으로 보고 잰다.
        const visRect = (b) => {
          const sw = b.closest('.view-switch'), r = b.getBoundingClientRect(), st = sw ? sw.getBoundingClientRect() : null;
          const l = st ? Math.max(r.left, st.left) : r.left, rr = st ? Math.min(r.right, st.right) : r.right;
          return { left: l, right: rr, top: r.top, bottom: r.bottom, width: Math.max(0, rr - l), height: r.height };
        };
        const boxes = heroes.map((b) => ({ id: b.id || b.textContent.trim().slice(0, 8), l: Math.round(visRect(b).left), r: Math.round(visRect(b).right), t: Math.round(visRect(b).top), b: Math.round(visRect(b).bottom), h: Math.round(b.getBoundingClientRect().height), oneLine: b.scrollHeight - b.clientHeight <= 1 }));
        // 단추끼리 겹침: 단추의 가운데 높이 세 점이 그 단추(또는 그 안 자식)에게 잡히지 않으면 가려진 것이다.
        const overlaps = [];
        for (const b of heroes) {
          const r = visRect(b);
          if (r.width < 2) continue; // 묶음 칸 밖으로 완전히 밀린 단추는 그려지지 않는다
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
          vw: innerWidth, vh: innerHeight, boxes, overlaps, total: allHeroes.length, heights: [...new Set(rowControls.map((b) => Math.round(b.getBoundingClientRect().height)))],
          oneLineAll: heroes.every((b) => b.scrollHeight - b.clientHeight <= 1),
          meta: meta && meta.textContent.trim(), metaTop: meta ? rect(meta).t : null,
          pickerTop: vis(picker) ? rect(picker).t : null,
          compact: window.__lt.compact(), edgeMax: Math.max(0, ...window.__lt.edgeLen()),
          cx: Math.round(cx), cy: Math.round(cy), missing, dots: dots.length,
          switchFit: !!swRect && swRect.right <= innerWidth + 1 && visibleSwitch.every((b) => b.l >= (swRect.left - 1) && b.r <= swRect.right + 1 && b.t >= swRect.top - 1 && b.b <= swRect.bottom + 1),
          overflow: Math.max(0, root.scrollWidth - innerWidth, ...boxes.map((b) => Math.max(0, b.r - innerWidth))),
          // CTO 지적(11-19): 390에서 트리 선택 단추가 보기 방식 묶음에 가려 '뉴진'만 보였다 — 겹침 0과 네 글자 보임을 함께 잰다.
          // CTO 지적(11-19): 390·375에서 세 보기 이름이 다 보이고 위 단추끼리 겹치지 않아야 한다.
          viewsFull: [...document.querySelectorAll('.view-switch .pill')].filter(vis).map((b) => { const r = b.getBoundingClientRect(), st = document.querySelector('.view-switch').getBoundingClientRect(); return [b.textContent.trim(), r.left >= st.left - 0.5 && r.right <= st.right + 0.5, getComputedStyle(b).fontSize]; }),
          // CTO 지시(261119): 폰 폭은 두 줄 — 첫 줄(되돌아가기·트리 선택·전체 보기·더 보기), 둘째 줄(보기 셋).
          rows: (() => {
            const top = (id) => Math.round(document.getElementById(id).getBoundingClientRect().top);
            return { shown: rowControls.map((b) => Math.round(b.getBoundingClientRect().top)), views: ['viewNet', 'viewConc', 'viewGraph'].filter(id => vis(document.getElementById(id))).map(top), barH: Math.round(document.querySelector('.lt-screen-toolbar').getBoundingClientRect().height) };
          })(),
          // 보기 세 단추: 폭 같음·안쪽 여백 8px 이상·글자가 단추 안에.
          viewBox: [...document.querySelectorAll('.view-switch .pill')].filter(vis).map((b) => {
            const cs = getComputedStyle(b), r = b.getBoundingClientRect(), range = document.createRange();
            range.selectNodeContents(b);
            return { id: b.id, w: Math.round(r.width * 10) / 10, h: Math.round(r.height), padL: parseFloat(cs.paddingLeft), padR: parseFloat(cs.paddingRight), fs: parseFloat(cs.fontSize), textW: Math.round(range.getBoundingClientRect().width * 10) / 10 };
          }),
          // 되돌아가기 화살표는 하나(글자 + ::before) — 예전 폰 규칙이 화살표를 하나 더 그려 '←←'가 됐다.
          back: !!document.getElementById('shelfBackBtn'),
          title: (() => {
            const el = document.querySelector('.lt-screen-toolbar .lt-toolbar-tree-name');
            const cs = getComputedStyle(el), probe = document.createElement('span');
            probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${cs.font}`;
            probe.textContent = (el.textContent || '').trim().slice(0, 4);
            document.body.append(probe);
            const four = probe.getBoundingClientRect().width; probe.remove();
            const tb = el.getBoundingClientRect();
            const clamp = (b) => { const sw = b.closest('.view-switch'), st = sw ? sw.getBoundingClientRect() : null, r = b.getBoundingClientRect(); return { id: b.id, left: st ? Math.max(r.left, st.left) : r.left, right: st ? Math.min(r.right, st.right) : r.right, top: r.top, bottom: r.bottom }; };
            const over = allHeroes.filter(vis).map(clamp).filter((b) => tb.left < b.right - 0.5 && b.left < tb.right - 0.5 && tb.top < b.bottom - 0.5 && b.top < tb.bottom - 0.5).map((b) => b.id);
            return { client: Math.round(el.clientWidth), four: Math.round(four), over };
          })()
        };
      });
      assert.equal(m.total, 5, `${width}: 위 단추 5개(보기 3·⤢·⋯)`);
      assert.deepEqual(m.heights, [m.heights[0]], `${width}: 위 단추 높이 모두 같음(${m.heights})`);
      assert.ok(m.oneLineAll, `${width}: 위 단추 글자 줄 수 1`);
      assert.deepEqual(m.overlaps, [], `${width}: 위 단추끼리 겹침 없음(${m.overlaps})`);
      assert.deepEqual(m.title.over, [], `${width}: 트리 선택이 위 단추에 가리지 않는다(${m.title.over})`);
      assert.deepEqual(m.viewsFull.map((v) => v[1]), [true, true, true], `${width}: 보기 방식 세 이름이 다 보인다(${JSON.stringify(m.viewsFull)})`);
      assert.deepEqual(m.viewsFull.map((v) => parseFloat(v[2]) >= 13), [true, true, true], `${width}: 보기 방식 글자는 13px 이상이다(${JSON.stringify(m.viewsFull)})`);
      assert.ok(m.title.client >= m.title.four, `${width}: 트리 이름 네 글자 이상 보인다(보이는 폭 ${m.title.client} ≥ 네 글자 ${m.title.four})`);
      assert.equal(m.back, false, '중복 서재 복귀 단추 없음');
      assert.ok(m.viewBox.every((v) => v.textW <= v.w - v.padL - v.padR + 1), `${width}: 보기 글자가 단추 안에 있다(${JSON.stringify(m.viewBox.map((v) => [v.textW, v.w]))})`);
      assert.ok(m.viewBox.every((v) => v.fs >= 13), `${width}: 보기 글자 13px 이상(${JSON.stringify(m.viewBox.map((v) => v.fs))})`);
      if (width < 431) {
        // 공통 도구 줄: 보이는 단추는 한 줄이고, 넘치는 것은 더보기에 접힌다(줄 높이 48px).
        assert.equal(new Set(m.rows.shown).size, 1, `${width}: 보이는 단추는 한 줄이다(${JSON.stringify(m.rows)})`);
        assert.equal(m.rows.barH, 48, `${width}: 도구 줄은 한 줄 48px(${m.rows.barH})`);
        assert.ok(m.viewBox.length > 0, `${width}: 보기 전환은 줄에 남는다`);
        const ws = m.viewBox.map((v) => v.w);
        assert.ok(Math.max(...ws) - Math.min(...ws) <= 2, `${width}: 보기 세 단추 폭 차이 ≤2px(${JSON.stringify(ws)})`);
        assert.ok(m.viewBox.every((v) => v.padL >= 3 && v.padR >= 3), `${width}: 보기 단추 안쪽 여백 ≥3px(${JSON.stringify(m.viewBox.map((v) => [v.padL, v.padR]))})`);
        assert.ok(m.viewBox.every((v) => v.h === 36), `${width}: 보기 단추 높이 36px(${JSON.stringify(m.viewBox.map((v) => v.h))})`);
      } else {
        assert.ok(Math.max(...[...m.rows.shown, ...m.rows.views]) - Math.min(...[...m.rows.shown, ...m.rows.views]) <= 6, `${width}: 위 단추는 한 줄(${JSON.stringify(m.rows)})`);
      }
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
      assert.equal(await evaluateWhenReady(frame, () => document.documentElement?.dataset?.ltBoardTheme || false), 'night', `${width}: '밤'을 고르면 밤 판이 된다`);
      await context.close();
    }
  } finally {
    await browser?.close();
    server.close();
  }
});

// ── #951 ③④ (CTO 261120): 점 자리에 순간 썸네일(작은 원·테두리는 점 색), 보기 이름 새 이름 ──
test('#951 ③④ 점 자리 썸네일(있음·깨짐·없음) + 이름표 말줄임 없음 + 보기 새 이름', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const [width, height] of [[375, 812], [1440, 900]]) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      await context.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); localStorage.removeItem('lt41.boardTheme'); } catch {} });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', (e) => errors.push(String(e.message || e)));
      await page.goto(`${base}/map-host-thumb.html`, { waitUntil: 'load' });
      let frame = null;
      for (let i = 0; i < 80 && !frame; i++) { frame = page.frames().find((f) => /track56-network/.test(f.url())); if (!frame) await page.waitForTimeout(250); }
      assert.ok(frame, `${width}: 지도 프레임이 열린다`);
      await frame.waitForFunction(() => (window.__lt?.dots?.()?.length || 0) > 0, null, { timeout: 20000 });
      // 그림을 읽은 뒤 한 번 다시 그린다(지연 로드) — 점 자리 사진이 그려질 때까지.
      await frame.waitForFunction(() => (window.__lt.thumbRects?.() || []).length > 0, null, { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(400);
      const m = await frame.evaluate(() => {
        const dots = window.__lt.dots(), rects = window.__lt.thumbRects?.() || [], labels = window.__lt.labels();
        const thumbs = window.__lt.thumbs();
        const near = (id, r) => {
          const d = dots.find((x) => x.id === id);
          if (!d) return null;
          const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
          return Math.round(Math.hypot(cx - d.x, cy - d.y));
        };
        return {
          dots: dots.length, rects: rects.length, thumbs,
          atDot: rects.map((r) => ({ w: Math.round(r.w), h: Math.round(r.h), m1: near('m1', r) })),
          // 그림이 없는 순간(m2 깨짐·m3 없음)은 지금의 점으로 남는다 — 그 점 근처에 사진이 없어야 한다.
          strayNearM2: rects.filter((r) => (() => { const d = dots.find((x) => x.id === 'm2'); return d && Math.hypot(r.x + r.w / 2 - d.x, r.y + r.h / 2 - d.y) < 12; })()).length,
          labels: labels.map((l) => ({ id: l.id, text: l.text, rect: l.rect })),
          viewNames: [...document.querySelectorAll('.view-switch .pill')].map((b) => ({ id: b.id, text: b.textContent.trim() })),
          ribbon: [...document.querySelectorAll('#mobileRibbon button')].map((b) => b.textContent.trim())
        };
      });
      assert.deepEqual(errors, [], `${width}: 지도 화면 오류 없음`);
      assert.equal(m.dots, 3, `${width}: 순간 3개`);
      assert.equal(m.rects, 1, `${width}: 사진이 있는 순간 하나만 원형 사진(깨짐·없음은 점) — ${JSON.stringify(m)}`);
      assert.ok(m.atDot[0].m1 != null && m.atDot[0].m1 <= 2, `${width}: 사진이 점 자리 가운데에 있다(중심 차 ${m.atDot[0]?.m1}px)`);
      assert.ok(m.atDot[0].w >= 18 && Math.abs(m.atDot[0].w - m.atDot[0].h) <= 1, `${width}: 사진은 작은 원(지름 ${m.atDot[0].w}×${m.atDot[0].h})`);
      assert.equal(m.strayNearM2, 0, `${width}: 깨진 그림 순간에는 사진이 남지 않는다`);
      assert.ok(m.thumbs.some((t) => t.id === 'm1' && t.ok), `${width}: 그림을 읽었다(지연 로드)`);
      // 이름표: 375에서도 'Ditto 직캠'이 다 보이고(말줄임 없음), 셋 다 있으며 서로·점과 겹치지 않는다.
      assert.deepEqual(m.labels.map((l) => l.id).sort(), ['m1', 'm2', 'm3'], `${width}: 이름표 셋 다 있다`);
      const ditto = m.labels.find((l) => l.id === 'm1');
      // 첫 순간은 '여기서 시작 · '가 앞에 붙는다 — 이름 자체가 잘리지 않았는지만 본다.
      assert.ok(ditto.text.endsWith('Ditto 직캠') && !ditto.text.includes('…'), `${width}: 짧은 이름은 말줄임 없이 다 보인다(${ditto.text})`);
      const ov = [];
      for (let i = 0; i < m.labels.length; i++) {
        for (let j = i + 1; j < m.labels.length; j++) {
          const a = m.labels[i].rect, b = m.labels[j].rect;
          if (a.l < b.r + 2 && a.r > b.l - 2 && a.t < b.b + 2 && a.b > b.t - 2) ov.push([m.labels[i].id, m.labels[j].id]);
        }
      }
      assert.deepEqual(ov, [], `${width}: 이름표끼리 겹침 없음(${JSON.stringify(ov)})`);
      // ④ 보기 이름: 무엇을 보는지로 — 저장값(id)은 그대로다.
      assert.deepEqual(m.viewNames, [{ id: 'viewNet', text: '이어진 길' }, { id: 'viewConc', text: '묶음' }, { id: 'viewGraph', text: '시간 순' }], `${width}: 보기 이름`);
      const clickView = async (selector) => {
        const button = frame.locator(selector);
        if (!(await button.isVisible())) {
          const more = frame.locator('.lt-screen-toolbar .lt-toolbar-more');
          await more.click();
          await button.waitFor({ state: 'visible', timeout: 5000 });
        }
        await button.click();
      };
      await clickView('#viewConc');
      assert.equal(await frame.evaluate(() => window.__lt.state.view), 'tag', `${width}: [묶음]을 누르면 꼬리표 묶음 보기`);
      await clickView('#viewNet');
      assert.equal(await frame.evaluate(() => window.__lt.state.view), 'network', `${width}: [이어진 길]을 누르면 그물 보기`);
      await context.close();
    }
  } finally {
    await browser?.close();
    server.close();
  }
});

// ── #951 ⑤ (CTO 261120): 서재에서 지도로 들어오면 '← 서재' 단추가 하나, 묶음 단추는 '1묶음 · 1–2월' ──
test('#951 ⑤ 서재에서 들어온 지도: ← 서재 단추 1개 + 묶음 단추 글자 형식(겹침·잘림 0) + 보기 이름', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const [width, height] of [[360, 780], [390, 844], [1440, 900]]) {
      for (const n of [3, 8]) {
        const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
        await context.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); localStorage.removeItem('lt41.boardTheme'); } catch {} });
        const page = await context.newPage(), errors = [];
        page.on('pageerror', (e) => errors.push(String(e.message || e)));
        await page.goto(`${base}/map-host-member-${n}.html`, { waitUntil: 'load' });
        let frame = null;
        for (let i = 0; i < 80 && !frame; i++) { frame = page.frames().find((f) => /track56-network/.test(f.url())); if (!frame) await page.waitForTimeout(250); }
        assert.ok(frame, `${width}/${n}: 지도 프레임이 열린다`);
        await frame.waitForFunction(() => (window.__lt?.dots?.()?.length || 0) > 0, null, { timeout: 20000 });
        await page.waitForTimeout(500);
        // #1249: 휴대폰 묶음 단추는 한 줄의 더 보기에서 열고 기존 검사를 그대로 한다.
        const more = frame.locator('#mobileRibbon .ribbon-more');
        if (await more.isVisible()) await more.click();
        const m = await frame.evaluate(() => {
          const vis = (el) => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
          const box = (el) => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) }; };
          const backs = [...document.querySelectorAll('#shelfBackBtn')].filter(vis);
          const topBtns = [...document.querySelectorAll('.lt-screen-toolbar button')].filter(vis);
          const overlap = [];
          for (let i = 0; i < topBtns.length; i++) for (let j = i + 1; j < topBtns.length; j++) {
            const sw = topBtns[i].closest('.view-switch'), sw2 = topBtns[j].closest('.view-switch');
            if (sw && sw === sw2) continue; // 붙은 단추 하나 안의 이웃은 겹침으로 보지 않는다
            const a = box(topBtns[i]), b = box(topBtns[j]);
            if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) overlap.push((topBtns[i].id || topBtns[i].textContent.trim()) + '×' + (topBtns[j].id || topBtns[j].textContent.trim()));
          }
          const chips = [...document.querySelectorAll('#mobileRibbon button[data-i]')].filter(vis).map((b) => ({ text: b.textContent.trim(), ...box(b), h: Math.round(b.getBoundingClientRect().height), fs: parseFloat(getComputedStyle(b).fontSize) }));
          const chipOverlap = [];
          for (let i = 0; i < chips.length; i++) for (let j = i + 1; j < chips.length; j++) {
            const a = chips[i], b = chips[j];
            if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) chipOverlap.push([a.text, b.text]);
          }
          return {
            vw: innerWidth,
            back: backs.map((b) => ({ text: b.textContent.trim(), aria: b.getAttribute('aria-label'), ...box(b) })),
            overlap, chips, chipOverlap,
            chipClip: chips.filter((c) => c.l < -1 || c.r > innerWidth + 1).map((c) => c.text),
            views: [...document.querySelectorAll('.view-switch .pill')].map((b) => b.textContent.trim()),
            barClip: Math.max(0, document.querySelector('.lt-screen-toolbar').getBoundingClientRect().right - innerWidth),
            legend: [...document.querySelectorAll('.legend-row')].filter((r) => !r.hidden).map((r) => r.textContent.trim()),
            ribbon: vis(document.getElementById('mobileRibbon')),
            ribbonBtns: [...document.querySelectorAll('#mobileRibbon button')].filter(vis).length,
            controls: vis(document.querySelector('.controls'))
          };
        });
        const tag = `${width}/${n}`;
        assert.deepEqual(errors, [], `${tag}: 지도 화면 오류 없음`);
        assert.equal(m.back.length, 0, `${tag}: 중복 서재 복귀 단추 없음`);
        assert.deepEqual(m.overlap, [], `${tag}: 위 단추끼리 겹침 없음(${JSON.stringify(m.overlap)})`);
        assert.equal(m.barClip, 0, `${tag}: 위 줄이 화면 밖으로 넘치지 않는다`);
        assert.deepEqual(m.views, ['이어진 길', '묶음', '시간 순'], `${tag}: 보기 이름`);
        // 묶음 단추(아래 조작 줄): '1묶음 · 1–2월' — 앞 0 없음, 범례와 같은 번호, 겹침·잘림 0.
        // #951 ⑥: 641px 이상도 아래 단추 줄이 보인다(큰 탐색 판 숨김) — 이 데이터는 묶음 1개라 범례는 숨는다.
        if (width <= 640) {
          assert.ok(m.chips.length >= 1, `${tag}: 묶음 단추가 있다`);
          for (const c of m.chips) assert.match(c.text, /^[1-9]\d*묶음 · .+/, `${tag}: 묶음 단추 글자 형식(${c.text})`);
          // #951 ⑥: 이 데이터는 묶음 1개 — 범례는 숨는다(2개 이상부터 보임; 보이는 쪽은 아래 ⑥ 시험이 2묶음 데이터로 확인).
          assert.equal(m.legend.length, 0, `${tag}: 묶음 1개 — 범례 숨김`);
          assert.deepEqual(m.chipOverlap, [], `${tag}: 묶음 단추끼리 겹침 없음(${JSON.stringify(m.chipOverlap)})`);
          assert.deepEqual(m.chipClip, [], `${tag}: 묶음 단추가 화면 밖으로 잘리지 않는다(${JSON.stringify(m.chipClip)})`);
          assert.ok(m.chips.every((c) => c.h <= 48), `${tag}: 단추 높이 안에 글자가 들어 있다(${JSON.stringify(m.chips.map((c) => c.h))})`);
        } else {
          assert.equal(m.controls, false, `${tag}: 넓은 화면에 큰 탐색 판은 없다`);
          assert.ok(m.ribbon && m.ribbonBtns >= 4, `${tag}: 넓은 화면 아래 단추 줄(단추 ${m.ribbonBtns}개)`);
          assert.equal(m.legend.length, 0, `${tag}: 묶음 1개 — 범례 숨김(2개부터 보임은 #951 ⑥ 시험)`);
        }
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    server.close();
  }
});

// #951 ⑤(CTO 261120): 판이 열린 상태에서 안내(토스트·묶음 카드)의 겹침·중복을 재는 한 벌.
// 실제로 보이는 안내만 센다(숨은 토스트는 opacity 0) — 위 단추 줄·순간 고르기 줄·묶음 단추 줄·판 단추와 겹침 0,
// '지나온 길을 밝' 문구는 화면에 한 번만(카드가 보이는 넓은 화면에서는 토스트를 띄우지 않는다).
const guideProbe = () => {
  const vis = (el) => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
  const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
  const guides = [];
  const toastEl = document.getElementById('toast'), rsEl = document.getElementById('routeStatus');
  if (vis(toastEl)) guides.push({ kind: 'toast', ...box(toastEl) });
  if (vis(rsEl)) guides.push({ kind: 'routeStatus', ...box(rsEl) });
  const targets = [
    ...document.querySelectorAll('.lt-screen-toolbar button'),
    ...document.querySelectorAll('.lt-moment-picker, .lt-moment-picker select, .lt-moment-picker button'),
    ...document.querySelectorAll('#mobileRibbon button'),
    ...document.querySelectorAll('#detailActions button, #detailClose')
  ].filter(vis).map((b) => ({ id: b.id || b.textContent.trim(), ...box(b) }));
  const guideOverlaps = [];
  for (const g of guides) for (const t of targets) if (hit(g, t)) guideOverlaps.push(`${g.kind}×${t.id}`);
  if (guides.length === 2 && hit(guides[0], guides[1])) guideOverlaps.push('toast×routeStatus');
  const phraseCount = [...document.querySelectorAll('body *')].filter((el) => vis(el) && el.children.length === 0 && /지나온 길을 밝/.test(el.textContent || '')).length;
  return { guides: guides.map((g) => g.kind), guideOverlaps, phraseCount };
};

// ── #951 ⑤ (CTO 261120): 지도에서 순간을 누르면 보드 상세 판과 같은 오른쪽 판이 열린다 ──
test('#951 ⑤ 지도 상세 판: 보드와 같은 틀(제목·사진·마음·날짜·아래 44px 세 단추), 1440 판 밖으로 밀기, 390 시트 겹침 0, Esc 초점 복귀', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const [width, height] of [[360, 780], [390, 844], [1440, 900]]) {
      for (const n of [3, 8]) {
        for (const theme of ['night', 'garden']) {
          const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
          await context.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); localStorage.removeItem('lt41.boardTheme'); } catch {} }, theme);
          const page = await context.newPage(), errors = [];
          page.on('pageerror', (e) => errors.push(String(e.message || e)));
          await page.goto(`${base}/map-host-member-${n}.html`, { waitUntil: 'load' });
          let frame = null;
          for (let i = 0; i < 80 && !frame; i++) { frame = page.frames().find((f) => /track56-network/.test(f.url())); if (!frame) await page.waitForTimeout(250); }
          assert.ok(frame, `${width}/${n}/${theme}: 지도 프레임이 열린다`);
          await frame.waitForFunction(() => (window.__lt?.dots?.()?.length || 0) > 0, null, { timeout: 20000 });
          await page.waitForTimeout(500);
          const tag = `${width}/${n}/${theme}`;
          const canvas = await frame.locator('#stage').boundingBox();
          const dots = await frame.evaluate(() => window.__lt.dots());
          const target = dots[Math.min(1, dots.length - 1)];
          await page.mouse.click(canvas.x + target.x, canvas.y + target.y);
          await page.waitForTimeout(700);
          const m = await frame.evaluate(() => {
            const vis = (el) => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
            const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
            const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
            const det = document.getElementById('detail'), sel = window.__lt.state.selected;
            const dot = window.__lt.dots().find((d) => d.id === sel?.id);
            const labels = (window.__lt.labels() || []).filter((l) => l.id === sel?.id).map((l) => l.rect);
            const panel = box(det), acts = box(document.getElementById('detailActions'));
            const ribbon = document.getElementById('mobileRibbon'), rib = vis(ribbon) ? box(ribbon) : null;
            const btns = [...document.querySelectorAll('#detailActions button')].filter(vis).map((b) => ({ id: b.id, text: b.textContent.trim(), ...box(b) }));
            const dotBox = dot ? { l: dot.x - dot.r, r: dot.x + dot.r, t: dot.y - dot.r, b: dot.y + dot.r } : null;
            const labelHit = labels.some((r) => hit(panel, r));
            return {
              open: det.classList.contains('open'),
              title: document.getElementById('detailTitle').textContent.trim(),
              media: !!document.getElementById('detailPlayer').innerHTML.trim(),
              note: document.getElementById('detailNote').textContent.trim(),
              basic: document.getElementById('dBasic').textContent.trim(),
              btns, panel, acts, dotInPanel: dotBox ? hit(panel, dotBox) : null, labelHit,
              sheetVsRibbon: rib ? hit(panel, rib) : false,
              actsInsidePanel: acts.t >= panel.t - 1 && acts.b <= panel.b + 1,
              selId: sel?.id || '',
              active: document.activeElement?.id || '',
              hScroll: document.getElementById('detailScroll').scrollWidth - document.getElementById('detailScroll').clientWidth
            };
          });
          // #951 ⑤(CTO 261120): 안내 겹침·중복은 guideProbe 한 벌로 따로 재어 합친다(함수 인자는 직렬화되지 않는다).
          Object.assign(m, await frame.evaluate('(' + guideProbe.toString() + ')()'));
          assert.deepEqual(errors, [], `${tag}: 지도 화면 오류 없음`);
          assert.equal(m.open, true, `${tag}: 순간을 누르면 상세 판이 열린다`);
          assert.ok(m.title.length > 0 && !/undefined|null|NaN/.test(m.title), `${tag}: 제목 글자(${m.title})`);
          assert.ok(m.media, `${tag}: 판에 사진/영상 칸이 찬다`);
          assert.ok(m.basic.includes('·'), `${tag}: 날짜·감정·트리 줄(${m.basic})`);
          assert.ok(!/undefined|null|NaN/.test(m.basic + m.note), `${tag}: 판 글자에 빈 값 없음`);
          assert.equal(m.hScroll, 0, `${tag}: 판 안에서 옆으로 넘치지 않는다`);
          assert.deepEqual(m.btns.map((b) => b.text), ['크게 보기', '여기부터 시네마', '⋯ 더 보기'], `${tag}: 단추 세 개`);
          assert.deepEqual(m.btns.map((b) => Math.round(b.h)), [44, 44, 44], `${tag}: 단추 높이 44`);
          assert.ok(m.actsInsidePanel, `${tag}: 단추 줄은 판 안(굴리는 영역 밖)에 붙는다`);
          assert.ok(m.btns.every((b) => b.l >= m.panel.l - 1 && b.r <= m.panel.r + 1), `${tag}: 단추가 판 밖으로 나가지 않는다`);
          if (width > 980) {
            assert.equal(m.dotInPanel, false, `${tag}: 고른 순간이 판에 가려지지 않는다`);
            assert.equal(m.labelHit, false, `${tag}: 고른 순간 이름표도 판 밖`);
          } else {
            assert.equal(m.sheetVsRibbon, false, `${tag}: 시트가 아래 묶음 단추 줄을 덮지 않는다`);
          }
          // #951 ⑤(CTO 261120): 안내는 위 단추 줄·순간 고르기 줄·묶음 단추 줄과 겹치지 않고, 같은 문구는 화면에 한 번만 보인다.
          assert.ok(m.guides.length >= 1, `${tag}: 길을 밝혔다는 안내가 보인다(토스트 또는 묶음 카드)`);
          assert.deepEqual(m.guideOverlaps, [], `${tag}: 안내와 단추 줄·고르기 줄 겹침 0(${JSON.stringify(m.guideOverlaps)})`);
          assert.equal(m.phraseCount, 1, `${tag}: '지나온 길을 밝' 문구는 화면에 한 번만(${m.phraseCount})`);
          const other = dots.find((d) => d.id !== target.id);
          if (other) {
            if (width > 980) {
              // 넓은 화면: 지도에 보이는 다른 순간을 그대로 누른다(판이 열린 채 내용만 바뀐다).
              const dots2 = await frame.evaluate(() => window.__lt.dots());
              const o = dots2.find((d) => d.id === other.id) || other;
              await page.mouse.click(canvas.x + o.x, canvas.y + o.y);
            } else {
              // 좁은 화면: 시트가 지도를 덮으므로 '순간 고르기' 줄과 같은 길(selectMoment)로 고른다.
              await frame.evaluate((id) => window.__lt.selectMoment(window.__lt.nodes.find((n) => n.id === id), true), other.id);
            }
            await page.waitForTimeout(600);
            const after = await frame.evaluate(() => ({ open: document.getElementById('detail').classList.contains('open'), title: document.getElementById('detailTitle').textContent.trim(), sel: window.__lt.state.selected?.id || '' }));
            Object.assign(after, await frame.evaluate('(' + guideProbe.toString() + ')()'));
            assert.equal(after.open, true, `${tag}: 다른 순간을 눌러도 판은 열린 채`);
            assert.equal(after.sel, other.id, `${tag}: 고른 순간이 바뀐다`);
            assert.notEqual(after.title, m.title, `${tag}: 판 내용이 그 순간으로 바뀐다(${after.title})`);
            assert.deepEqual(after.guideOverlaps, [], `${tag}: 두 번째 순간에서도 안내와 단추 줄 겹침 0(${JSON.stringify(after.guideOverlaps)})`);
            assert.equal(after.phraseCount, 1, `${tag}: 두 번째 순간에서도 문구는 한 번만(${after.phraseCount})`);
          }
          await frame.evaluate(() => document.getElementById('detailClose').focus());
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
          const esc = await frame.evaluate(() => ({ open: document.getElementById('detail').classList.contains('open'), active: document.activeElement?.id || '', sel: window.__lt.state.selected?.id || '', focusMoment: document.getElementById('stage').dataset.ltFocusMoment || '' }));
          assert.equal(esc.open, false, `${tag}: Esc로 판이 닫힌다`);
          assert.equal(esc.active, 'stage', `${tag}: 닫은 뒤 초점은 지도(누른 순간)로 돌아온다`);
          assert.equal(esc.focusMoment, esc.sel, `${tag}: 초점이 기억한 순간 = 고른 순간(${esc.focusMoment})`);
          assert.deepEqual(errors, [], `${tag}: 닫는 동안 오류 없음`);
          await context.close();
        }
      }
    }
  } finally {
    await browser?.close();
    server.close();
  }
});

// #951 ⑥ 화면 계약 — 큰 탐색 판을 숨기고 아래 단추 줄을 넣는다.
// 측정 도구·기준값(겹침 0, 44px, 한 줄, 범례 표시 조건)은 그대로 두고
// 무엇을 재는지(대상 요소)만 '탐색 판' → '단추 줄'로 옮긴다.
test('#951 ⑥ 넓은 화면 단추 줄: 1440·2560에 큰 판 없음, 단추 44px 한 줄, 열림·닫힘 겹침 0, 범례는 묶음 2개부터', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const MEASURE = () => {
    const vis = el => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
    const box = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    const rib = document.getElementById('mobileRibbon');
    const ribB = vis(rib) ? box(rib) : null;
    const btns = [...rib.querySelectorAll('button')].filter(vis).map(b => ({ text: b.textContent.trim(), fs: parseFloat(getComputedStyle(b).fontSize), h: b.clientHeight, top: Math.round(b.getBoundingClientRect().top) }));
    const det = document.getElementById('detail');
    const detB = vis(det) ? box(det) : null;
    const card = document.getElementById('routeStatus'), toast = document.getElementById('toast');
    const cardB = vis(card) ? box(card) : null, toastB = vis(toast) ? box(toast) : null;
    const labels = (window.__lt.labels() || []).map(l => l.rect ? { l: l.rect.left, t: l.rect.top, r: l.rect.right, b: l.rect.bottom } : { l: l.x, t: l.y - l.h, r: l.x + l.w, b: l.y });
    const hits = (a, b) => a && b && a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
    const ov = [];
    if (ribB) {
      if (detB && hits(ribB, detB)) ov.push('ribbon×detail');
      if (cardB && hits(ribB, cardB)) ov.push('ribbon×card');
      if (toastB && hits(ribB, toastB)) ov.push('ribbon×toast');
      for (const lb of labels) if (hits(ribB, lb)) ov.push('ribbon×label');
    }
    if (cardB && toastB && hits(cardB, toastB)) ov.push('card×toast');
    for (const b of document.querySelectorAll('.lt-screen-toolbar button')) if (vis(b) && hits(ribB, box(b))) ov.push('ribbon×toolbar');
    return { ribbon: ribB, buttons: btns, oneRow: btns.length > 0 && new Set(btns.map(b => b.top)).size === 1, detail: detB, detailOpen: det.classList.contains('open'), legendVisible: vis(document.querySelector('.legend')), legendRows: [...document.querySelectorAll('.legend-row')].filter(r => !r.hidden).length, controls: vis(document.querySelector('.controls')), card: cardB, toast: toastB, overlaps: ov, labelCount: labels.length, inViewport: ribB ? (ribB.l >= 0 && ribB.r <= innerWidth + 1 && ribB.b <= innerHeight + 1) : false };
  };
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    // [route, width, bundles] — member-3/8은 묶음 1개(범례 숨김), 2g는 묶음 2개(범례 보임).
    for (const [route, width, bundles] of [['/map-host-member-3.html', 1440, 1], ['/map-host-member-8.html', 1440, 1], ['/map-host-member-2g.html', 1440, 2], ['/map-host-member-2g.html', 2560, 2]]) {
      const tag = `${route} ${width}`;
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', locale: 'ko-KR' });
      await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); localStorage.removeItem('lt41.boardTheme'); } catch {} });
      const page = await ctx.newPage(), errors = [];
      page.on('pageerror', e => errors.push(String(e.message || e)));
      await page.goto(base + route, { waitUntil: 'load' });
      let frame = null;
      for (let i = 0; i < 80 && !frame; i++) { frame = page.frames().find(f => /track56-network/.test(f.url())); if (!frame) await page.waitForTimeout(250); }
      assert.ok(frame, `${tag}: 지도 프레임이 열린다`);
      await frame.waitForFunction(() => (window.__lt?.dots?.()?.length || 0) > 0, null, { timeout: 20000 });
      await frame.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(600);
      // 닫힘 상태: 큰 판 없음 + 단추 줄 44px 한 줄 + 범례는 묶음 수대로.
      const closed = await frame.evaluate('(' + MEASURE.toString() + ')()');
      assert.equal(closed.controls, false, `${tag}: 큰 탐색 판은 숨는다`);
      assert.ok(closed.ribbon && closed.inViewport, `${tag}: 단추 줄이 화면 안에 보인다`);
      assert.ok(closed.buttons.length >= 4, `${tag}: 단추 줄에 단추가 있다(${closed.buttons.length}개)`);
      assert.ok(closed.buttons.every(b => b.h === 44), `${tag}: 넓은 화면 단추 높이 44px(${JSON.stringify(closed.buttons.map(b => b.h))})`);
      assert.equal(closed.oneRow, true, `${tag}: 단추 한 줄(${JSON.stringify(closed.buttons.map(b => b.top))})`);
      assert.equal(closed.legendVisible, bundles >= 2, `${tag}: 범례는 묶음 2개부터 보인다`);
      assert.equal(closed.legendRows, bundles >= 2 ? bundles : 0, `${tag}: 범례 줄 수(묶음 ${bundles}개)`);
      assert.deepEqual(closed.overlaps, [], `${tag}: 닫힘 겹침 0`);
      // 열림 상태: 두 번째 순간을 누르면 상세 판이 열린다 — 단추 줄은 판 왼쪽 밖에서만 논다.
      const canvas = await frame.locator('#stage').boundingBox();
      const dots = await frame.evaluate(() => window.__lt.dots());
      const target = dots[Math.min(1, dots.length - 1)];
      await page.mouse.click(canvas.x + target.x, canvas.y + target.y);
      await page.waitForTimeout(900);
      const open = await frame.evaluate('(' + MEASURE.toString() + ')()');
      assert.ok(open.detailOpen && open.detail, `${tag}: 상세 판 열림`);
      assert.ok(open.ribbon && open.ribbon.r < open.detail.l - 8, `${tag}: 단추 줄이 판 왼쪽 밖(겹침 0)`);
      assert.deepEqual(open.overlaps, [], `${tag}: 열림 겹침 0`);
      // 묶음 단추: 카드+토스트가 같이 떠도 겹침 0.
      const chip = frame.locator('#mobileRibbon button[data-i]').first();
      if (await chip.count()) {
        await chip.click();
        await page.waitForTimeout(600);
        const cluster = await frame.evaluate('(' + MEASURE.toString() + ')()');
        assert.ok(cluster.card, `${tag}: 묶음 카드가 뜬다`);
        assert.deepEqual(cluster.overlaps, [], `${tag}: 묶음 카드 겹침 0`);
      }
      // 전체 보기: 토스트가 떠도 겹침 0.
      const allBtn = frame.locator('#mobileRibbon button').filter({ hasText: '전체 보기' }).first();
      if (await allBtn.count()) {
        await allBtn.click();
        await page.waitForTimeout(500);
        const overview = await frame.evaluate('(' + MEASURE.toString() + ')()');
        assert.ok(overview.toast, `${tag}: 전체 보기 토스트가 뜬다`);
        assert.deepEqual(overview.overlaps, [], `${tag}: 전체 보기 겹침 0`);
      }
      assert.deepEqual(errors, [], `${tag}: 화면 오류 없음`);
      await ctx.close();
    }
    // 390 단추 줄은 지금 그대로(#638): 왼쪽 8·오른쪽 8, 아래 38px 줄 위, 단추 44px(터치 타깃)·글자 14px, 탐색 판 없음.
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'ko-KR' });
      const page = await ctx.newPage();
      await page.goto(base + '/map-host-member-8.html', { waitUntil: 'load' });
      let frame = null;
      for (let i = 0; i < 80 && !frame; i++) { frame = page.frames().find(f => /track56-network/.test(f.url())); if (!frame) await page.waitForTimeout(250); }
      assert.ok(frame, '390: 지도 프레임이 열린다');
      await frame.waitForFunction(() => (window.__lt?.dots?.()?.length || 0) > 0, null, { timeout: 20000 });
      await page.waitForTimeout(600);
      const before = await frame.evaluate(() => {
        const rib = document.getElementById('mobileRibbon');
        const r = rib.getBoundingClientRect();
        const b = rib.querySelector('button');
        const cs = getComputedStyle(b);
        return { left: r.left, right: r.right, bottom: r.bottom, h: b.clientHeight, fs: parseFloat(cs.fontSize), controls: getComputedStyle(document.querySelector('.controls')).display !== 'none', legend: getComputedStyle(document.querySelector('.legend')).display !== 'none' };
      });
      assert.equal(before.left, 8, '390: 왼쪽 8');
      assert.equal(before.right, 382, '390: 오른쪽 8(390−8)');
      assert.equal(before.bottom, 806, '390: 아래 38px 줄 위(844−38)');
      assert.equal(before.h, 44, '390: 단추 높이 44px(머리말 터치 타깃 min-height 그대로)');
      assert.equal(before.fs, 14, '390: 단추 글자 14px(identity.css 그대로)');
      assert.equal(before.controls, false, '390: 탐색 판 없음');
      assert.equal(before.legend, false, '390: 범례 없음');
      await ctx.close();
    }
  } finally {
    await browser?.close();
    server.close();
  }
});

test('#1574 밀집 이름표·점·안내 겹침 0, 가로 상세 판과 가로 32/44px 닫기, 긴 제목 전체 보기', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const PROBE = () => {
    const root = document.documentElement;
    if (!root || !document.body) return false;
    const lt = window.__lt, box = lt.box(), dots = lt.dots(), labels = lt.labels();
    const effective = d => Math.max(d.r, d.tr || 0);
    const rect = l => ({ l: l.rect.l, t: l.rect.t, r: l.rect.r, b: l.rect.b });
    const dotRect = d => ({ l: d.x - d.r, t: d.y - d.r, r: d.x + d.r, b: d.y + d.r });
    const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
    let dotOverlaps = 0, effectiveDotOverlaps = 0, labelOverlaps = 0, labelClipped = 0, labelOnDot = 0;
    for (let i = 0; i < dots.length; i++) for (let j = i + 1; j < dots.length; j++) {
      const distance = Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y);
      if (distance < dots[i].r + dots[j].r + 1) dotOverlaps++;
      if (distance < effective(dots[i]) + effective(dots[j]) + 1) effectiveDotOverlaps++;
    }
    for (let i = 0; i < labels.length; i++) {
      const a = rect(labels[i]);
      if (a.l < box.x - 2 || a.r > box.x + box.w + 2 || a.t < box.y - 2 || a.b > box.y + box.h + 2) labelClipped++;
      if (dots.some(d => hit(a, dotRect(d)))) labelOnDot++;
      for (let j = i + 1; j < labels.length; j++) if (hit(a, rect(labels[j]))) labelOverlaps++;
    }
    const guide = document.querySelector('.hero p');
    const guideRect = guide?.getBoundingClientRect();
    const guideHits = guideRect ? [...labels.filter(l => hit(rect(l), guideRect)).map(l => l.id), ...dots.filter(d => hit(dotRect(d), guideRect)).map(d => d.id)] : [];
    const doc = root;
    return {
      view: lt.state.view, box, dots: dots.length, labels: labels.length,
      dotOverlaps, effectiveDotOverlaps, labelOverlaps, labelClipped, labelOnDot, guideHits,
      documentOverflow: Math.max(0, doc.scrollWidth - doc.clientWidth, document.body.scrollWidth - doc.clientWidth)
    };
  };
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const [width, height, n] of [[390, 844, 26], [390, 844, 60], [844, 390, 60]]) {
      for (const theme of ['night', 'garden']) {
        const tag = `${width}x${height}/${n}/${theme}`;
        const context = await browser.newContext({ viewport: { width, height }, locale: 'ko-KR', reducedMotion: 'reduce' });
        await context.addInitScript(t => { try { localStorage.setItem('lt41.theme', t); localStorage.removeItem('lt41.boardTheme'); } catch {} }, theme);
        const page = await context.newPage(), errors = [];
        page.on('pageerror', e => errors.push(String(e.message || e)));
        await page.goto(`${base}/map-host-1574-${n}.html`, { waitUntil: 'load' });
        let frame = null;
        for (let i = 0; i < 80 && !frame; i++) { frame = page.frames().find(f => /track56-network/.test(f.url())); if (!frame) await page.waitForTimeout(100); }
        assert.ok(frame, `${tag}: 지도 프레임이 열린다`);
        await frame.waitForFunction(count => window.__lt?.dots?.()?.length === count, n, { timeout: 20000 });
        await frame.waitForFunction(() => !!document.querySelector('.lt-screen-toolbar'), null, { timeout: 20000 });
        await settleMap(frame, { timeout: 8000 });
        for (const [view, id] of [['network', 'viewNet'], ['tag', 'viewConc'], ['time', 'viewGraph']]) {
          await frame.evaluate(id => { window.__lt.overview(false); document.getElementById(id).click(); }, id);
          await settleMap(frame, { timeout: 8000 });
          const overview = await evaluateWhenReady(frame, '(' + PROBE.toString() + ')()');
          assert.equal(overview.view, view, `${tag}: ${view} 보기`);
          assert.ok(overview.labels > 1, `${tag}: ${view} 전체 보기 이름표가 1개보다 많다(${overview.labels})`);
          assert.equal(overview.dotOverlaps, 0, `${tag}: ${view} 전체 보기 점 겹침 0`);
          assert.equal(overview.effectiveDotOverlaps, 0, `${tag}: ${view} 전체 보기 썸네일 포함 점 겹침 0`);
          assert.equal(overview.labelOverlaps, 0, `${tag}: ${view} 전체 보기 이름표 겹침 0`);
          assert.equal(overview.labelClipped, 0, `${tag}: ${view} 전체 보기 이름표 잘림 0`);
          assert.equal(overview.labelOnDot, 0, `${tag}: ${view} 전체 보기 이름표와 점 겹침 0`);
          assert.deepEqual(overview.guideHits, [], `${tag}: ${view} 전체 보기 안내 문구 겹침 0`);
          assert.equal(overview.documentOverflow, 0, `${tag}: ${view} 전체 보기 문서 가로 넘침 0`);
          for (const zoom of ['zoomIn', 'zoomOut']) {
            await frame.evaluate(id => document.getElementById(id).click(), zoom);
            await settleMap(frame, { timeout: 8000 });
            const m = await evaluateWhenReady(frame, '(' + PROBE.toString() + ')()');
            assert.equal(m.dotOverlaps, 0, `${tag}: ${view}/${zoom} 점 겹침 0`);
            assert.equal(m.effectiveDotOverlaps, 0, `${tag}: ${view}/${zoom} 썸네일 포함 점 겹침 0`);
            assert.equal(m.labelOverlaps, 0, `${tag}: ${view}/${zoom} 이름표 겹침 0`);
            assert.equal(m.labelClipped, 0, `${tag}: ${view}/${zoom} 이름표 잘림 0`);
            assert.equal(m.labelOnDot, 0, `${tag}: ${view}/${zoom} 이름표와 점 겹침 0`);
            assert.deepEqual(m.guideHits, [], `${tag}: ${view}/${zoom} 안내 문구 겹침 0`);
            assert.equal(m.documentOverflow, 0, `${tag}: ${view}/${zoom} 문서 가로 넘침 0`);
          }
        }
        await frame.evaluate(() => { document.getElementById('viewNet').click(); window.__lt.selectMoment(window.__lt.FIRST, true); });
        await settleMap(frame, { timeout: 8000 });
        await frame.waitForFunction(() => !document.getElementById('detailTitleToggle').hidden, null, { timeout: 5000 });
        const detail = await frame.evaluate(() => {
          const panel = document.getElementById('detail'), scroll = document.getElementById('detailScroll');
          const title = document.getElementById('detailTitle'), toggle = document.getElementById('detailTitleToggle');
          const close = document.getElementById('detailClose'), r = close.getBoundingClientRect(), after = getComputedStyle(close, '::after');
          const inset = k => parseFloat(after[k]) || 0;
          const pr = panel.getBoundingClientRect();
          const ribbon = document.getElementById('mobileRibbon').getBoundingClientRect();
          return {
            open: panel.classList.contains('open'), width: pr.width, left: pr.left, ribbonRight: ribbon.right,
            box: window.__lt.box(), contentHeight: scroll.clientHeight,
            title: title.textContent, titleClient: title.clientHeight, titleScroll: title.scrollHeight,
            toggleText: toggle.textContent, expanded: toggle.getAttribute('aria-expanded'),
            close: { width: r.width, height: r.height, hitWidth: r.width - inset('left') - inset('right'), hitHeight: r.height - inset('top') - inset('bottom') },
            labelsInPanel: window.__lt.labels().some(l => { const a = l.rect; return a.l < pr.right - 1 && pr.left < a.r - 1 && a.t < pr.bottom - 1 && pr.top < a.b - 1; })
          };
        });
        assert.equal(detail.open, true, `${tag}: 상세 판 열림`);
        assert.ok(detail.title.length >= 200, `${tag}: 240자 제목을 판에 표시`);
        assert.ok(detail.titleScroll > detail.titleClient, `${tag}: 긴 제목은 세 줄로 접힌다`);
        assert.equal(detail.expanded, 'false', `${tag}: 처음에는 접힌 상태`);
        assert.deepEqual(detail.close, width > 640
          ? { width: 32, height: 32, hitWidth: 44, hitHeight: 44 }
          : { width: 44, height: 44, hitWidth: 56, hitHeight: 56 }, `${tag}: 가로 닫기 32/44px·모바일 닫기 44/56px`);
        if (width > 640) {
          assert.equal(detail.width, 400, `${tag}: 가로 상세 판 폭 400px`);
          assert.ok(detail.contentHeight > 139, `${tag}: 상세 내용 높이 139px 증가(${detail.contentHeight})`);
          assert.ok(detail.box.x + detail.box.w < detail.left, `${tag}: 지도가 상세 판 왼쪽으로 밀린다`);
          assert.ok(detail.ribbonRight < detail.left, `${tag}: 아래 단추 줄이 상세 판 왼쪽에 있다`);
          assert.equal(detail.labelsInPanel, false, `${tag}: 이름표가 상세 판에 가려지지 않는다`);
        }
        await frame.locator('#detailTitleToggle').click();
        const expanded = await frame.evaluate(() => {
          const title = document.getElementById('detailTitle'), toggle = document.getElementById('detailTitleToggle');
          return { expanded: title.classList.contains('is-expanded'), aria: toggle.getAttribute('aria-expanded'), text: toggle.textContent, client: title.clientHeight, scroll: title.scrollHeight };
        });
        assert.equal(expanded.expanded, true, `${tag}: 전체 보기로 제목을 편다`);
        assert.equal(expanded.aria, 'true', `${tag}: 전체 보기 상태를 보조기술에 알린다`);
        assert.equal(expanded.text, '제목 접기', `${tag}: 접기 단추로 바뀐다`);
        assert.ok(expanded.client >= detail.titleClient, `${tag}: 펼친 제목 높이 증가`);
        assert.ok(expanded.client + 1 >= expanded.scroll, `${tag}: 펼친 제목을 끝까지 볼 수 있다(${expanded.client}/${expanded.scroll})`);
        await frame.evaluate(() => window.__lt.selectMoment(window.__lt.nodes.find(n => n.id === 'm02'), false));
        await settleMap(frame, { timeout: 8000 });
        await frame.waitForFunction(() => document.getElementById('detailTitleToggle').hidden, null, { timeout: 5000 });
        await frame.locator('#detailClose').click();
        await settleMap(frame, { timeout: 8000 });
        const closed = await frame.evaluate(() => ({ open: document.getElementById('detail').classList.contains('open'), right: window.__lt.box().w + window.__lt.box().x }));
        assert.equal(closed.open, false, `${tag}: 닫기 단추로 판이 닫힌다`);
        if (width > 640) assert.ok(closed.right > 800, `${tag}: 닫으면 지도 폭을 되찾는다(${closed.right})`);
        assert.deepEqual(errors, [], `${tag}: 화면 오류 없음`);
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    server.close();
  }
});
