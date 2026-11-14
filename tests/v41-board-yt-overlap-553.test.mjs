// #553: 썸네일이 실린 긴 YouTube 카드가 treeSpread 줄 간격(세로 420px)을 넘어 같은 열 위아래
// 카드와 겹치던 문제의 실행 계약.
// - 모델: 줄 간격을 카드 종류별 최대 높이(예약 높이)에 맞춘다. 기본 카드(260px)뿐인 트리는
//   간격이 420px로 같으므로 예시 40순간 배치가 그대로다.
// - 화면: 카드를 그린 뒤 실제 높이를 재어 같은 열 안에서 겹침을 벌린다(settleColumnGaps —
//   다시 그리지 않고 top만 고친다). 자리를 저장한 순간은 그대로 둔다(#395 계약).
// - 실제 화면(썸네일이 실린 상태): 모아둔 순간 26 구조에서 인접 겹침 0쌍, 390·1440 모두.
//   예시 40순간(사슬) 처음 보기는 읽을 수 있는 0.8배와 카드 줄 위치가 그대로다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.window = globalThis;
await import('../public/v41/views/board/board-model.js');
const LT58Model = globalThis.LT58Model;

const REQUIRE = process.env.LT_BOARD_YT_REQUIRE === '1';
const ROOT = path.resolve(process.env.LT_BOARD_YT_ROOT || fileURLToPath(new URL('../public', import.meta.url)));
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  const { existsSync } = await import('node:fs');
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 보드 YouTube 겹침 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 보드 YouTube 겹침 시험을 건너뜀'; }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

// 모아둔 순간과 같은 만들기 경로(빠른 추가): 전부 한 뿌리의 자식(별 모양), 자리 저장 없음.
const starTree = (n) => {
  const moments = Array.from({ length: n }, (_, i) => ({
    id: 's' + i, title: '모은 순간 ' + (i + 1), date: '2026-01-01', emotion: '설렘', note: '메모 ' + (i + 1),
    parentId: i ? 's0' : null, relation: '', url: i ? 'https://youtu.be/dQw4w9WgXcQ' : '', x: null, y: null, rot: 0, color: 'violet', keywords: []
  }));
  const edges = [];
  for (let i = 1; i < n; i++) edges.push({ id: 'e' + i, kind: 'parent', from: 's0', to: 's' + i, reason: '' });
  return { id: 'star' + n, title: '모아둔 ' + n, moments, edges };
};
const chainTree = (n) => {
  const moments = Array.from({ length: n }, (_, i) => ({
    id: 'm' + (i + 1), title: '순간 ' + (i + 1), date: '2026-01-0' + ((i % 9) + 1), emotion: '설렘', note: '메모',
    parentId: i ? 'm' + i : null, relation: i ? '이어서' : '', url: '', x: null, y: null, rot: 0, color: 'rose', keywords: []
  }));
  const edges = [];
  for (let i = 2; i <= n; i++) edges.push({ id: 'e' + i, kind: 'parent', from: 'm' + (i - 1), to: 'm' + i, reason: '이어서' });
  return { id: 't' + n, title: '사슬 ' + n, moments, edges };
};

// 화면이 넘기는 카드 종류별 예약 높이(board.js의 상수와 같은 값).
const YT_RESERVED_H = 330, YT_VERTICAL_RESERVED_H = 440, BASE_RESERVED_H = 330;
const reservedHeights = (tree) => new Map(tree.moments.map((m) => [m.id, m.url ? (m.url.includes('/shorts/') ? YT_VERTICAL_RESERVED_H : YT_RESERVED_H) : BASE_RESERVED_H]));

function serve(extra = {}) {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    if (extra[clean]) { res.writeHead(200, { 'content-type': MIME['.html'] }); res.end(extra[clean]); return; }
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
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

// 내 기록(썸네일이 자동으로 실리는) 보드 호스트: 셸처럼 data-member="in"을 본문에 남긴다.
const hostHTML = (tree) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>보드 호스트</title></head><body data-member="in" data-record-source="server">
<script>window.LT41={source:'server',writable:true,owned:true,momentId:${JSON.stringify(tree.moments[0].id)},prefs:{},tree:${JSON.stringify(tree)}};</script>
<iframe src="/v41/views/track58-pinboard.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;

// 썸네일을 외부(i.ytimg.com)에서 받지 않는다 — 16:9 그림을 즉시 대답해 실제와 같은 높은 카드(가로 약 465px)를 만든다.
// CI 네트워크에서 외부 그림이 늦거나 막혀도 시험이 흔들리지 않고, 긴 카드 상황을 항상 재현한다.
const YT_THUMB_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="1600" height="1200" fill="#8a7a92"/><path d="M700 350 L700 850 L1050 600 Z" fill="#fff"/></svg>';

async function openHost(browser, url, { width, height } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  await context.route('**/i.ytimg.com/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: YT_THUMB_SVG }));
  const problems = [];
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + String(e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 300)); });
  // load 대신 domcontentloaded — 화면이 뜬 뒤 남은 그림을 기다리지 않는다.
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) {
    frame = page.frames().find((f) => f !== page.mainFrame() && /views\/track58-pinboard/.test(f.url()));
    if (!frame) await page.waitForTimeout(250);
  }
  assert.ok(frame, '보드 프레임이 열린다');
  try {
    await frame.waitForSelector('.surface', { timeout: 20000 });
    await frame.waitForFunction(() => document.querySelectorAll('#cardLayer .card').length > 0, null, { timeout: 20000 });
    await frame.waitForFunction(() => [...document.querySelectorAll('.lt-yt-preview img')].every((i) => i.complete), null, { timeout: 15000 }).catch(() => {});
  } catch (e) {
    throw new Error(`보드 화면이 열리지 않았다(${width}×${height}): ${String(e).slice(0, 200)} / 화면 문제: ${problems.join(' | ') || '없음'}`);
  }
  await page.waitForTimeout(1200);
  return { context, page, frame, problems };
}

// 겹친 쌍 수·면적(화면 좌표, 회전 포함)과 같은 열 위아래 간격.
const geometry = (frame) => frame.evaluate(() => {
  const cards = [...document.querySelectorAll('#cardLayer .card')].map((c) => {
    const r = c.getBoundingClientRect();
    return { id: c.dataset.id, left: r.left, top: r.top, right: r.right, bottom: r.bottom, x: c.offsetLeft, y: c.offsetTop, h: c.offsetHeight };
  });
  let pairs = 0, area = 0;
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const ox = Math.min(cards[i].right, cards[j].right) - Math.max(cards[i].left, cards[j].left);
    const oy = Math.min(cards[i].bottom, cards[j].bottom) - Math.max(cards[i].top, cards[j].top);
    if (ox > 2 && oy > 2) { pairs++; area += ox * oy; }
  }
  const columns = new Map();
  for (const c of cards) {
    const list = columns.get(c.x) || [];
    list.push(c);
    columns.set(c.x, list);
  }
  let minColumnGap = Infinity;
  for (const list of columns.values()) {
    list.sort((a, b) => a.y - b.y);
    for (let i = 1; i < list.length; i++) minColumnGap = Math.min(minColumnGap, list[i].y - list[i - 1].y);
  }
  return { pairs, area: Math.round(area), minColumnGap: Math.round(minColumnGap), zoom: document.getElementById('zoomLabel').textContent, ys: [...new Set(cards.map((c) => c.y))].sort((a, b) => a - b), maxH: Math.max(...cards.map((c) => c.h)), thumbs: [...document.querySelectorAll('.lt-yt-preview img')].filter((i) => i.complete && i.naturalWidth > 0).length };
});

test('#553 모델 → #582 바둑판: 줄 간격이 카드 종류별 최대 높이를 따른다 — YouTube 카드 줄은 위아래 간격이 예약 높이 이상', () => {
  const tree = starTree(26);
  const slots = LT58Model.pinboardSpread(LT58Model.dateDescOrder(tree.moments), { cols: LT58Model.gridColumns(1440) });
  const tops = LT58Model.gridRowTops(slots, (id) => reservedHeights(tree).get(id));
  const list = tree.moments.map((m) => ({ id: m.id, ...slots.get(m.id), y: tops[slots.get(m.id).row], h: reservedHeights(tree).get(m.id) }));
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (a.col !== b.col) continue;
    assert.ok(Math.abs(a.y - b.y) >= Math.max(a.h, b.h), `같은 칸 위아래 간격 ${Math.abs(a.y - b.y)}px ≥ 카드 높이 ${Math.max(a.h, b.h)}px (${a.id}~${b.id})`);
  }
});

test('#553 모델 → #582 바둑판: 기본 카드뿐인 트리(예시 40순간)는 줄 간격이 460px로 같다', () => {
  const tree = chainTree(40);
  const slots = LT58Model.pinboardSpread(LT58Model.dateDescOrder(tree.moments), { cols: LT58Model.gridColumns(1440) });
  const tops = LT58Model.gridRowTops(slots, (id) => reservedHeights(tree).get(id));
  // 전부 기본 카드(330px 예약)이므로 모든 줄이 366px 간격이다(#601 — 간소화된 카드 높이에 맞춘 값).
  assert.deepEqual(tops, Array.from({ length: Math.ceil(40 / 4) }, (_, r) => 150 + r * 366));
});

test('#553 모델: settleColumnGaps — 겹친 카드만 아래로 밀리고 저장 자리는 그대로다', () => {
  // 위 카드 450px, 아래 카드가 420px 간격으로 겹치는 상태(전 결함) → 아래 카드가 24px 여백을 두고 내려간다.
  const moved = LT58Model.settleColumnGaps(
    [{ id: 'a', x: 150, y: 150, h: 450 }, { id: 'b', x: 150, y: 570, h: 260 }],
    new Set(['a', 'b']), 24);
  assert.equal(moved.get('a'), 150, '위 카드는 그대로');
  assert.equal(moved.get('b'), 624, '아래 카드는 위 카드 아래(150+450+24)로');
  // 저장 자리 카드는 움직이지 않고, 그 아래 배치 카드가 저장 카드를 피해 내려간다.
  const kept = LT58Model.settleColumnGaps(
    [{ id: 'saved', x: 150, y: 700, h: 300 }, { id: 'b', x: 150, y: 420, h: 200 }, { id: 'c', x: 150, y: 1100, h: 200 }],
    new Set(['b', 'c']), 24);
  assert.equal(kept.get('saved'), 700, '저장 자리는 그대로(#395)');
  assert.equal(kept.get('b'), 420, '저장 카드 위의 배치 카드는 위로 당겨지지 않는다');
  assert.equal(kept.get('c'), 1100, '저장 카드 아래에서 이미 충분히 벌어진 배치 카드는 그대로(위로 당겨지지 않는다)');
  // 겹치지 않으면 아무도 움직이지 않는다.
  const same = LT58Model.settleColumnGaps(
    [{ id: 'a', x: 150, y: 150, h: 260 }, { id: 'b', x: 150, y: 570, h: 260 }],
    new Set(['a', 'b']), 24);
  assert.deepEqual([...same], [[ 'a', 150 ], [ 'b', 570 ]], '간격이 충분하면 그대로');
  // 다른 열은 서로에게 영향을 주지 않는다.
  const cols = LT58Model.settleColumnGaps(
    [{ id: 'a', x: 150, y: 150, h: 450 }, { id: 'b', x: 450, y: 150, h: 260 }],
    new Set(['a', 'b']), 24);
  assert.deepEqual([...cols], [['a', 150], ['b', 150]], '다른 열 카드는 밀리지 않는다');
});

test('#553 화면: 썸네일이 실린 모아둔 순간 26 — 인접 겹침 0쌍(1440·390)', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = starTree(26);
  const server = await serve({ '/__host-star.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const { context, frame } = await openHost(browser, `${base}/__host-star.html`, { width: w, height: h });
      const g = await geometry(frame);
      assert.equal(g.pairs, 0, `${w}: 겹친 카드 쌍 0 (전: 22쌍)`);
      assert.equal(g.area, 0, `${w}: 겹친 면적 0px² (전: 390 153,337px²·1440 98,136px²)`);
      assert.ok(g.thumbs >= 25, `${w}: 썸네일 ${g.thumbs}장이 실려 긴 카드 상황을 재현한다`);
      // #601: 카드 높이 상한 — 썸네일이 실려도 카드는 460px를 넘지 않는다(세로 영상 9:16 상한 300px 포함).
      assert.ok(g.maxH >= 260 && g.maxH <= 460, `${w}: YouTube 카드 높이 ${g.maxH}px — 260px 이상 460px 이하(상한)`);
      assert.ok(g.minColumnGap >= YT_RESERVED_H, `${w}: 같은 열 위아래 간격 ${g.minColumnGap}px ≥ YouTube 예약 높이 ${YT_RESERVED_H}px`);
      if (w === 1440) assert.equal(g.zoom, '80%', '읽을 수 있는 0.8배 처음 보기 유지');
      await context.close();
    }
  } finally { await browser.close(); server.close(); }
});

test('#553 화면: 예시 40순간(사슬) 처음 보기는 그대로다 — 0.8배·카드 줄 위치·겹침 0', { skip: REQUIRE ? false : skip, timeout: 180000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = chainTree(40);
  const server = await serve({ '/__host-40.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, frame } = await openHost(browser, `${base}/__host-40.html`, { width: 1440, height: 900 });
    const g = await geometry(frame);
    assert.equal(g.zoom, '80%', '읽을 수 있는 0.8배 처음 보기 유지(#460·#536)');
    // #582 바둑판: 4칸 × 10줄 — 줄 간격은 간소화된 카드 높이의 366px(#601).
    assert.deepEqual(g.ys, Array.from({ length: 10 }, (_, r) => 150 + r * 366), '카드 줄 위치는 366px 간격 10줄이다');
    assert.equal(g.pairs, 0, '겹침 0 유지');
    await context.close();
  } finally { await browser.close(); server.close(); }
});
