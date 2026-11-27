import { listenOnSafePort } from './helpers/safe-port.mjs';
// #619-5 쌓기 배치: 줄 맞춤이 아니라 열마다 위에서부터 쌓는다.
// 핀터레스트식 — 다음 카드는 가장 짧은 열에 들어가고, 가로 카드는 짧게·세로 카드는 길게 그대로다.
// 화면 폭이 바뀌면 칸 수만 바뀌고 순서는 같다. 크롬 화면 시험은 LT_BOARD_STACK_619_REQUIRE=1.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.window = globalThis;
import '../public/v41/html-escape.mjs'; // A-15: 글자 막기 정본을 먼저 등록한다.
await import('../public/v41/views/board/board-model.js');
const M = globalThis.LT58Model;
const REQUIRE = process.env.LT_BOARD_STACK_619_REQUIRE === '1';

test('#619-5 모델: 가장 짧은 열에 쌓고, 동점인 열은 가장 앞쪽이다', () => {
  const h = { a: 100, b: 100, c: 100, d: 100, e: 100, f: 100, g: 100 };
  const r = M.stackLayout(['a', 'b', 'c', 'd', 'e', 'f', 'g'], { cols: 3, reservedOf: (id) => h[id] });
  // 처음 세 장은 각 열의 맨 앞(동점 → 가장 앞쪽부터), 다음 장은 가장 짧은 열로 흐른다.
  assert.deepEqual(r.get('a'), { col: 0, y: 150 });
  assert.deepEqual(r.get('b'), { col: 1, y: 150 });
  assert.deepEqual(r.get('c'), { col: 2, y: 150 });
  assert.deepEqual(r.get('d'), { col: 0, y: 286 }); // 150 + 100(예약) + 36(여백)
  assert.deepEqual(r.get('g'), { col: 0, y: 422 }); // 세 장이 다 쌓이면 다시 가장 짧은 열
});

test('#619-5 모델: 긴 카드가 다른 열을 내리 누르지 않는다(줄 맞춤과의 차이)', () => {
  const h = { tall: 500, b: 100, c: 100, d: 100, e: 100 };
  const r = M.stackLayout(['tall', 'b', 'c', 'd', 'e'], { cols: 2, reservedOf: (id) => h[id] });
  // 줄 맞춤이면 b·c·d가 첫 줄이라 tall 높이(500+36)에 아래 장이 내려간다. 쌓기면 각 열이 따로 흐른다.
  assert.deepEqual(r.get('b'), { col: 1, y: 150 });
  assert.deepEqual(r.get('c'), { col: 1, y: 286 }); // tall아래(col 0)가 아니라 자기 열(1)에서
  assert.deepEqual(r.get('d'), { col: 1, y: 422 });
  assert.deepEqual(r.get('e'), { col: 1, y: 558 }); // 그 열(1)이 tall 아래(686)보다 계속 짧다
});

test('#619-5 모델: 화면 폭(칸 수)이 바뀌어도 같은 순서를 쌓는다', () => {
  const h = { a: 100, b: 300, c: 100, d: 100, e: 100, f: 100 };
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const wide = M.stackLayout(ids, { cols: 4, reservedOf: (id) => h[id] });
  const narrow = M.stackLayout(ids, { cols: 1, reservedOf: (id) => h[id] });
  const mid = M.stackLayout(ids, { cols: 2, reservedOf: (id) => h[id] });
  assert.deepEqual(wide.get('a'), { col: 0, y: 150 }, '첫 단추는 폭과 무관하게 왼쪽 위');
  assert.deepEqual(narrow.get('a'), { col: 0, y: 150 });
  assert.deepEqual(mid.get('a'), { col: 0, y: 150 });
  // 1칸에서는 같은 순서가 위에서 아래로 그대로 쌓인다( b=300이 길게).
  assert.deepEqual(narrow.get('b'), { col: 0, y: 286 });
  assert.deepEqual(narrow.get('c'), { col: 0, y: 622 }); // 286 + 300 + 36
  assert.deepEqual(narrow.get('d'), { col: 0, y: 758 });
  // 2칸에서는 순서대로 번갈아 흐른다.
  assert.deepEqual(mid.get('b'), { col: 1, y: 150 });
  assert.deepEqual(mid.get('c'), { col: 0, y: 286 });
  // 빈 순서·0칸도 안전하게.
  assert.equal(M.stackLayout([], { cols: 4 }).size, 0);
  assert.deepEqual(M.stackLayout(['a'], { cols: 0 }).get('a'), { col: 0, y: 150 });
  assert.equal(M.stackLayout(['a'], {}).size, 1);
});

// === 화면: 대표 트리처럼 가로·세로가 섞인 26순간을 390·1440·1980에서 잰다 ===
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  const { existsSync } = await import('node:fs');
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 쌓기 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 쌓기 시험을 건너뜀'; }

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function serve(extra = {}) {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    if (extra[clean]) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(extra[clean]); return; }
    const file = path.join(ROOT, clean);
    if (!file.startsWith(ROOT) || !(await readFile(file).catch(() => null))) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  });
  return listenOnSafePort(server, '127.0.0.1').then(() => server);
}

const starTree = (n) => {
  const moments = Array.from({ length: n }, (_, i) => ({
    id: 's' + i, title: '모은 순간 ' + (i + 1), date: '2026-0' + ((i % 9) + 1) + '-1' + (i % 9), emotion: '설렘', note: '메모 ' + (i + 1),
    parentId: i ? 's0' : null, relation: '',
    url: i ? (i % 2 === 0 ? 'https://www.youtube.com/shorts/dQw4w9WgXcQ' : 'https://youtu.be/dQw4w9WgXcQ') : '',
    keywords: [], x: null, y: null, rot: 0, color: 'violet'
  }));
  const edges = [];
  for (let i = 1; i < n; i++) edges.push({ id: 'e' + i, kind: 'parent', from: 's0', to: 's' + i, reason: '' });
  return { id: 'star' + n, title: '모아둔 ' + n, moments, edges };
};
const hostHTML = (tree) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>보드 호스트</title></head><body data-member="in" data-record-source="server">
<script>window.LT41={source:'server',writable:true,owned:true,momentId:${JSON.stringify(tree.moments[0].id)},prefs:{},tree:${JSON.stringify(tree)}};window.LT41_MESSAGES=[];addEventListener('message',(e)=>{if(e.data&&e.data.type)window.LT41_MESSAGES.push({type:e.data.type,momentId:e.data.momentId,treeId:e.data.treeId,moments:e.data.moments})});</script>
<iframe src="/v41/views/track58-pinboard.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;

const YT_THUMB_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="1600" height="1200" fill="#8a7a92"/><path d="M700 350 L700 850 L1050 600 Z" fill="#fff"/></svg>';

async function openHost(browser, url, { width, height }) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  await context.route('**/i.ytimg.com/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: YT_THUMB_SVG }));
  const problems = [];
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + String(e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) {
    frame = page.frames().find((f) => f !== page.mainFrame() && /views\/track58-pinboard/.test(f.url()));
    if (!frame) await new Promise((r) => setTimeout(r, 100));
  }
  try { await frame.waitForSelector('#cardLayer .card', { timeout: 20000 }); }
  catch (e) { throw new Error(`보드 화면이 열리지 않았다(${width}×${height}): ${String(e).slice(0, 200)}`); }
  await page.waitForTimeout(1200);
  return { context, page, frame, problems };
}

test('#619-5 화면: 열마다 차곡차곡 쌓이고, 폭이 바뀌면 칸 수만 바뀌어 순서는 같다', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = starTree(26);
  // 보드가 createdOrder를 순서대로(i+1) 매겨 날짜순을 매긴다 — 시험이 같은 규칙으로 기대 순서를 세운다.
  const expected = M.dateDescOrder(tree.moments.map((m, i) => ({ ...m, createdOrder: i + 1 })));
  const server = await serve({ '/__host-stack.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    // 1440: 4칸. 같은 열의 카드는 아래로 쌓이고, 겹침이 없다.
    const { context, page, frame, problems } = await openHost(browser, `${base}/__host-stack.html`, { width: 1440, height: 900 });
    assert.equal(await frame.evaluate(() => document.querySelector('[data-board-mode="date"]').getAttribute('aria-pressed')), 'true', '처음은 날짜순');
    const g = await frame.evaluate(() => {
      const cards = [...document.querySelectorAll('#cardLayer .card')].map((c) => ({ id: c.dataset.id, x: c.offsetLeft, y: c.offsetTop, w: c.offsetWidth, h: c.offsetHeight }));
      let pairs = 0;
      for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i], b = cards[j];
        if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2) pairs++;
      }
      const byCol = new Map();
      for (const c of cards) { const list = byCol.get(c.x) || []; list.push(c); byCol.set(c.x, list); }
      const stacks = [...byCol.values()].map((list) => list.sort((a, b) => a.y - b.y).map((c) => c.id));
      const topLeft = cards.sort((a, b) => a.y - b.y || a.x - b.x)[0];
      return { pairs, cols: byCol.size, stacks, topLeft: topLeft?.id, firstPos: cards.find((c) => c.id === topLeft?.id) };
    });
    assert.equal(g.cols, 4, '1440은 4칸');
    assert.equal(g.pairs, 0, '겹침 없음');
    for (const col of g.stacks) {
      assert.ok(col.length >= 2, '열마다 쌓인다(두 장 이상)');
      // 순서(spec): 첫 장은 날짜 최신순 첫 장이다(모든 폭에서 같다).
      assert.equal(g.topLeft, expected[0], '맨 위 왼쪽 카드는 날짜순 첫 장');
    }
    // 390: featured 한 장과 아래 두 열로 쌓이고, 맨 위는 날짜순 첫 장이다.
    await context.close();
    const narrow = await openHost(browser, `${base}/__host-stack.html`, { width: 390, height: 844 });
    const one = await narrow.frame.evaluate(() => {
      const cards = [...document.querySelectorAll('#cardLayer .card')].map((c) => ({ id: c.dataset.id, x: c.offsetLeft, y: c.offsetTop }));
      cards.sort((a, b) => a.y - b.y);
      return { cols: [...new Set(cards.map((c) => c.x))].length, top: cards[0]?.id };
    });
    assert.equal(one.cols, 3, '390은 featured 한 장과 두 열이다');
    assert.equal(one.top, expected[0], '390에서도 맨 위는 날짜순 첫 장(순서는 같다)');
    await narrow.context.close();
    // 1980: 6칸, 그래도 맨 위는 같다.
    const wideHost = await openHost(browser, `${base}/__host-stack.html`, { width: 1980, height: 1000 });
    const wide = await wideHost.frame.evaluate(() => {
      const cards = [...document.querySelectorAll('#cardLayer .card')].map((c) => ({ id: c.dataset.id, x: c.offsetLeft, y: c.offsetTop }));
      cards.sort((a, b) => a.y - b.y || a.x - b.x);
      return { cols: [...new Set(cards.map((c) => c.x))].length, top: cards[0]?.id };
    });
    assert.equal(wide.cols, 6, '1980은 6칸');
    assert.equal(wide.top, expected[0], '1980에서도 맨 위는 날짜순 첫 장');
    assert.equal(wideHost.problems.length, 0);
    assert.equal(problems.length, 0, `화면 문제 없음 (${problems.join(' | ') || '없음'})`);
    await wideHost.context.close();
  } finally { await browser.close(); server.close(); }
});

test('#619-5 화면 문구: updates.json 다음 버전(4.1.4)에 쌓기 한 줄이 team 출처로 있다', () => {
  const updates = JSON.parse(fs.readFileSync(new URL('../public/v41/updates.json', import.meta.url), 'utf8'));
  const next = updates.find((e) => e.version === '4.1.4');
  assert.ok(next, '다음 버전 항목이 있다');
  assert.ok(next.items.some((i) => /쌓|차곡차곡/.test(i.text) && i.source === 'team'), '쌓기 한 줄이 team 출처로 있다');
});
