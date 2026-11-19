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

// 이슈 970: 썸네일 — 영상·사진 순간의 썸네일이 화면 안에 보이고(390·1440 좌표 판정), 그림을 불러오지 못하면
// 대체 표시가 뜬다(깨진 그림 아이콘 없음). 가짜 데이터·가짜 그림만 쓴다(외부 요청은 시험 서버가 대답).
// LT_970_REQUIRE=1 일 때 실행(CI 화면 잡 — 건너뜀=실패).
const REQUIRE970 = process.env.LT_970_REQUIRE === '1';
const MEDIA_TREE = {
  id: 'media1', title: '미디어 순간들',
  moments: [
    { id: 'v1', title: '영상 순간', date: '2026-11-19', emotion: '설렘', note: '메모', parentId: null, relation: '', url: 'https://youtu.be/dQw4w9WgXcQ', x: null, y: null, rot: 0, color: 'violet', keywords: [] },
    { id: 'p1', title: '사진 순간', date: '2026-11-19', emotion: '평온', note: '메모', parentId: 'v1', relation: '', url: 'https://lovetree-4-0.pages.dev/api/media/12345678-1234-4234-8234-123456789abc.png', x: null, y: null, rot: 0, color: 'rose', keywords: [] },
    { id: 'v2', title: '세로 영상', date: '2026-11-18', emotion: '그리움', note: '메모', parentId: 'v1', relation: '', url: 'https://www.youtube.com/shorts/9NXOCr-T8LU', x: null, y: null, rot: 0, color: 'cyan', keywords: [] },
    { id: 'v3', title: '또 다른 영상', date: '2026-11-17', emotion: '위로', note: '메모', parentId: 'v1', relation: '', url: 'https://youtu.be/abc123DEF45', x: null, y: null, rot: 0, color: 'amber', keywords: [] },
  ],
  edges: [
    { id: 'e1', kind: 'parent', from: 'v1', to: 'p1', reason: '' },
    { id: 'e2', kind: 'parent', from: 'v1', to: 'v2', reason: '' },
    { id: 'e3', kind: 'parent', from: 'v1', to: 'v3', reason: '' },
  ],
};

// openHost와 같은 모양이되 그림 응답을 시험이 정한다(성공=가짜 SVG, 실패=404). 사진(/api/media)도 같은 규칙.
async function openMediaHost(browser, url, { width, height, fail = false }) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  const answer = (route) => fail
    ? route.fulfill({ status: 404, contentType: 'text/plain', body: 'gone' })
    : route.fulfill({ contentType: 'image/svg+xml', body: YT_THUMB_SVG });
  await context.route('**/i.ytimg.com/**', answer);
  await context.route('**/api/media/**', answer);
  const problems = [];
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + String(e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) {
    frame = page.frames().find((f) => f !== page.mainFrame() && /views\/track58-pinboard/.test(f.url()));
    if (!frame) await page.waitForTimeout(250);
  }
  assert.ok(frame, '보드 프레임이 열린다');
  await frame.waitForSelector('.surface', { timeout: 20000 });
  await frame.waitForFunction(() => document.querySelectorAll('#cardLayer .card').length > 0, null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  return { context, page, frame, problems };
}

test('970 실행: 썸네일 — 영상·사진이 화면 안에 보인다(가짜 그림, 390·1440)', { skip: skip || !REQUIRE970 ? skip || 'LT_970_REQUIRE=1 일 때 실행' : false, timeout: 240000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve({ '/__host-media.html': hostHTML(MEDIA_TREE) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const { context, page, frame, problems } = await openMediaHost(browser, `${base}/__host-media.html`, { width: w, height: h });
      // 전체 보기로 모든 카드를 화면 안에 둔다(머리줄 단추와 같은 fitAll).
      await frame.evaluate(() => { if (typeof fitAll === 'function') fitAll(false); });
      await page.waitForTimeout(900);
      await frame.waitForFunction(() => {
        const imgs = [...document.querySelectorAll('.lt-yt-preview img')];
        return imgs.length >= 3 && imgs.every((i) => i.complete && i.naturalWidth > 0);
      }, null, { timeout: 20000 });
      // 사진 순간은 카드 안에 '사진 불러오기' 자리가 보인다. 누르기 전에는 그림 요청이 없다.
      const p1Button = await frame.evaluate(() => {
        const b = document.querySelector('.card[data-id="p1"] [data-lt-load]');
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { text: b.textContent.trim(), inside: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 };
      });
      assert.ok(p1Button && p1Button.text.includes('사진 불러오기'), `${w}: 사진 순간에 불러오기 자리가 있다`);
      assert.equal(p1Button?.inside, true, `${w}: 사진 불러오기 자리가 화면 안에 있다`);
      const m = await frame.evaluate(() => {
        const vw = innerWidth, vh = innerHeight;
        const cards = [...document.querySelectorAll('#cardLayer .card')].map((c) => {
          const r = c.getBoundingClientRect();
          const img = c.querySelector('.lt-yt-preview img, .lt-media-body img');
          const ir = img ? img.getBoundingClientRect() : null;
          return {
            id: c.dataset.id,
            fullyInside: r.left >= -1 && r.top >= -1 && r.right <= vw + 1 && r.bottom <= vh + 1,
            card: { l: r.left, t: r.top, r: r.right, b: r.bottom },
            img: ir ? { l: ir.left, t: ir.top, r: ir.right, b: ir.bottom, complete: img.complete, nw: img.naturalWidth } : null,
          };
        });
        const broken = [...document.querySelectorAll('#cardLayer .lt-yt-preview img, #cardLayer .lt-media-body img')].filter((i) => i.complete && i.naturalWidth === 0).length;
        return { cards, broken, vw, vh };
      });
      assert.equal(m.broken, 0, `${w}: 깨진 그림(왔는데 폭 0) 0장`);
      const visible = m.cards.filter((c) => c.fullyInside && c.img);
      assert.ok(visible.length >= (w === 1440 ? 3 : 1), `${w}: 화면 안에 썸네일 실린 카드 ${visible.length}장(기대 ${w === 1440 ? 3 : 1}+)`);
      for (const c of visible) {
        assert.ok(c.img.complete && c.img.nw > 0, `${w}:${c.id} 썸네일이 실제로 실린다`);
        assert.ok(c.img.l >= c.card.l - 2 && c.img.t >= c.card.t - 2 && c.img.r <= c.card.r + 2 && c.img.b <= c.card.b + 2, `${w}:${c.id} 썸네일이 카드 안에 있다`);
        assert.ok(c.img.l >= -2 && c.img.t >= -2 && c.img.r <= m.vw + 2 && c.img.b <= m.vh + 2, `${w}:${c.id} 썸네일이 화면 안에 있다`);
      }
      const v1 = m.cards.find((c) => c.id === 'v1');
      assert.ok(v1 && v1.img && v1.img.nw > 0, `${w}: 영상 순간 썸네일이 실린다`);
      const p1 = m.cards.find((c) => c.id === 'p1');
      assert.ok(p1 && p1.fullyInside, `${w}: 사진 순간 카드가 화면 안에 있다`);
      const beforeLoadErrors = problems.length;
      await frame.locator('.card[data-id="p1"] [data-lt-load]').click();
      await frame.waitForFunction(() => {
        const img = document.querySelector('.card[data-id="p1"] .lt-media-body img');
        return !!img && img.complete && img.naturalWidth > 0;
      }, null, { timeout: 20000 });
      const p1Load = await frame.evaluate(() => {
        const img = document.querySelector('.card[data-id="p1"] .lt-media-body img');
        const r = img.getBoundingClientRect(), c = img.closest('.card').getBoundingClientRect();
        return {
          nw: img.naturalWidth,
          inCard: r.left >= c.left - 2 && r.top >= c.top - 2 && r.right <= c.right + 2 && r.bottom <= c.bottom + 2,
          inScreen: r.left >= -2 && r.top >= -2 && r.right <= innerWidth + 2 && r.bottom <= innerHeight + 2,
          status: !!document.querySelector('.card[data-id="p1"] .lt-media-status'),
        };
      });
      assert.ok(p1Load.nw > 0, `${w}: 카드에서 사진 불러오기를 누르면 그림이 실린다`);
      assert.equal(p1Load.inCard, true, `${w}: 불러온 사진이 카드 안에 있다`);
      assert.equal(p1Load.inScreen, true, `${w}: 불러온 사진이 화면 안에 있다`);
      assert.equal(p1Load.status, false, `${w}: 카드는 상태 글자 없이 그림만 실린다(compact 유지)`);
      assert.deepEqual(problems.slice(beforeLoadErrors), [], `${w}: 사진 불러오기에서 새 콘솔 오류 0 (${problems.join(' | ') || '없음'})`);
      // 상세 창의 같은 단추는 비-compact 마크업 — 상태 글자와 함께 계속 동작한다.
      await frame.evaluate(() => window.openViewer('p1'));
      await frame.waitForSelector('#viewerModal.open', { timeout: 5000 });
      const detailBefore = await frame.evaluate(() => {
        const root = document.querySelector('#viewerMedia .lt-media');
        return { button: !!root?.querySelector('[data-lt-load]'), status: root?.querySelector('.lt-media-status')?.textContent || '' };
      });
      assert.equal(detailBefore.button, true, `${w}: 상세 창에 사진 불러오기 단추가 있다`);
      assert.ok(detailBefore.status.length > 0, `${w}: 상세 창에는 기존 상태 글이 있다`);
      const beforeDetailErrors = problems.length;
      await frame.locator('#viewerMedia [data-lt-load]').click();
      await frame.waitForFunction(() => document.querySelector('#viewerMedia .lt-media-status')?.textContent === '사진을 불러왔어요.', null, { timeout: 20000 });
      await frame.waitForFunction(() => {
        const img = document.querySelector('#viewerMedia .lt-media-body img');
        return !!img && img.complete && img.naturalWidth > 0;
      }, null, { timeout: 20000 });
      const detailAfter = await frame.evaluate(() => ({
        nw: document.querySelector('#viewerMedia .lt-media-body img')?.naturalWidth || 0,
        status: document.querySelector('#viewerMedia .lt-media-status')?.textContent || '',
      }));
      assert.ok(detailAfter.nw > 0, `${w}: 상세 창에서도 사진이 실린다`);
      assert.equal(detailAfter.status, '사진을 불러왔어요.', `${w}: 상세 창은 기존 상태 글자를 유지한다`);
      assert.deepEqual(problems.slice(beforeDetailErrors), [], `${w}: 상세 창 불러오기에서도 새 콘솔 오류 0`);
      await frame.evaluate(() => document.getElementById('viewerModal').classList.remove('open'));
      await context.close();
    }
  } finally { await browser.close(); server.close(); }
});

test('970 실행: 썸네일 — 불러오기 실패면 대체 표시, 깨진 그림 아이콘 없다(390·1440)', { skip: skip || !REQUIRE970 ? skip || 'LT_970_REQUIRE=1 일 때 실행' : false, timeout: 240000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve({ '/__host-media-fail.html': hostHTML(MEDIA_TREE) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const { context, page, frame } = await openMediaHost(browser, `${base}/__host-media-fail.html`, { width: w, height: h, fail: true });
      await frame.evaluate(() => { if (typeof fitAll === 'function') fitAll(false); });
      await page.waitForTimeout(600);
      // 영상 후보가 모두 실패하면 글 카드(대체 표시)로 내려간다.
      await frame.waitForFunction(() => document.querySelectorAll('#cardLayer .lt-fallback-card').length >= 3, null, { timeout: 25000 });
      const fb = await frame.evaluate(() => {
        const card = document.querySelector('.card[data-id="v1"]');
        return {
          count: document.querySelectorAll('#cardLayer .lt-fallback-card').length,
          title: card?.querySelector('.lt-fallback-title')?.textContent || '',
          notice: card?.querySelector('.lt-media-vanished-note')?.textContent || '',
          badge: card?.querySelector('.lt-media-vanished-badge')?.textContent || '',
          broken: [...document.querySelectorAll('#cardLayer .lt-yt-preview img, #cardLayer .lt-media-body img')].filter((i) => i.complete && i.naturalWidth === 0).length,
        };
      });
      assert.ok(fb.count >= 3, `${w}: 영상 순간 3개가 대체 표시로 내려간다(${fb.count})`);
      assert.equal(fb.title, '영상 순간', `${w}: 대체 표시에 사용자 제목이 보인다`);
      assert.equal(fb.badge, '사라진 영상', `${w}: 대체 표시 배지`);
      assert.match(fb.notice, /영상이 삭제되었거나 비공개예요/, `${w}: 대체 표시 안내 문구`);
      assert.equal(fb.broken, 0, `${w}: 깨진 그림 아이콘 없음(실패한 그림은 치워진다)`);
      // 사진 순간은 누르기 전에는 그림이 없다(비공개 파일은 요청 0).
      const pf = await frame.evaluate(() => {
        const card = document.querySelector('.card[data-id="p1"]');
        return {
          retry: !!card?.querySelector('[data-lt-load]'),
          imgs: card?.querySelectorAll('.lt-media-body img').length ?? -1,
        };
      });
      assert.equal(pf.retry, true, `${w}: 사진 불러오기 자리가 있다`);
      assert.equal(pf.imgs, 0, `${w}: 누르기 전에는 사진 그림이 없다`);
      await context.close();
    }
  } finally { await browser.close(); server.close(); }
});
