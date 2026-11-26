import { listenOnSafePort } from './helpers/safe-port.mjs';
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
import { createReadStream, readFileSync, mkdirSync } from 'node:fs';
import { inspectYoutubeIframe, countYoutubeAutoplay } from './helpers/youtube-embed-audit.mjs';
import { createTree } from '../public/v41/domain.mjs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dismissDiscoverAskIfOpen } from './helpers/discover-ask.mjs';

globalThis.window = globalThis;
import '../public/v41/html-escape.mjs'; // A-15: 글자 막기 정본을 먼저 등록한다.
await import('../public/v41/views/board/board-model.js');
const LT58Model = globalThis.LT58Model;

const REQUIRE = process.env.LT_BOARD_YT_REQUIRE === '1';
const TEST_PORT = Number(process.env.LT_BOARD_YT_PORT || 0);
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
  return listenOnSafePort(server, '127.0.0.1', { port: TEST_PORT }).then(() => server);
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
  return { pairs, area: Math.round(area), cols: new Set(cards.map(card => card.x)).size, minColumnGap: Math.round(minColumnGap), zoom: document.getElementById('zoomLabel').textContent, ys: [...new Set(cards.map((c) => c.y))].sort((a, b) => a - b), maxH: Math.max(...cards.map((c) => c.h)), thumbs: [...document.querySelectorAll('#cardLayer .lt-yt-preview img,#cardLayer .ytThumbWrap img[data-stage]')].filter((i) => i.complete && i.naturalWidth > 0).length };
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
      // 새 Chromium은 화면 밖 lazy 이미지를 끝내 로드하지 않는다. 전제 장수(25장)는 그대로 두고
      // 카드 그림을 eager로 바꿔 실제로 로드된 장 수를 센다(대기 시간은 늘리지 않는다).
      await frame.evaluate(() => { for (const img of document.querySelectorAll('#cardLayer img')) img.loading = 'eager'; });
      await frame.waitForFunction(() => [...document.querySelectorAll('#cardLayer img')].filter(i => i.complete && i.naturalWidth > 0).length >= 25, null, { timeout: 20000 });
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

test('#1434 화면: 390 보드는 첫 카드와 두 열 카드로 세 장 이상을 보여 주고 기존 간격을 지킨다', { skip: REQUIRE ? false : skip, timeout: 180000 }, async () => {
  if (skip) assert.fail(skip);
  const tree = starTree(6);
  tree.moments.forEach((moment, index) => { moment.date = `2026-01-0${index + 1}`; });
  const server = await serve({ '/__host-1434.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page, frame } = await openHost(browser, `${base}/__host-1434.html`, { width: 390, height: 844 });
    const g = await geometry(frame);
    const visible = await frame.evaluate(() => {
      const viewport = document.getElementById('viewport').getBoundingClientRect();
      return [...document.querySelectorAll('#cardLayer .card')].filter(card => {
        const r = card.getBoundingClientRect();
        const w = Math.max(0, Math.min(r.right, viewport.right) - Math.max(r.left, viewport.left));
        const h = Math.max(0, Math.min(r.bottom, viewport.bottom) - Math.max(r.top, viewport.top));
        return w * h >= r.width * r.height * 0.5;
      }).length;
    });
    const widest = await frame.evaluate(() => {
      const viewport = document.getElementById('viewport').getBoundingClientRect();
      return Math.max(...[...document.querySelectorAll('#cardLayer .card')].map(card => {
        const r = card.getBoundingClientRect();
        return Math.min(r.right, viewport.right) - Math.max(r.left, viewport.left);
      }));
    });
    const rootWidth = await frame.$eval('.card[data-id="s0"]', card => card.getBoundingClientRect().width);
    assert.equal(Math.round(rootWidth), 160, '최신 순간이 아닌 시작 카드는 일반 폭을 유지한다');
    assert.ok(g.cols >= 2, `390 보드는 두 열 이상이다(${g.cols}열)`);
    assert.ok(visible >= 3, `390 보드에서 절반 이상 보이는 카드가 ${visible}장이다`);
    assert.ok(widest >= 200, `보이는 카드의 가장 넓은 폭은 ${widest}px로 기존 200px 기준을 지킨다`);
    assert.equal(g.pairs, 0, '좁은 보드 카드 겹침 0');
    assert.ok(g.minColumnGap >= YT_RESERVED_H, `같은 열 위아래 간격 ${g.minColumnGap}px ≥ ${YT_RESERVED_H}px`);
    assert.ok(g.maxH >= 260 && g.maxH <= 460, `카드 높이 ${g.maxH}px는 기존 상한을 지킨다`);
    const featuredId = await frame.locator('.card.isFeatured').getAttribute('data-id');
    const featured = frame.locator(`.card[data-id="${featuredId}"]`);
    const featuredBox = await featured.boundingBox();
    await page.mouse.move(featuredBox.x + featuredBox.width / 2, featuredBox.y + featuredBox.height - 24);
    await page.mouse.down();
    await page.mouse.move(featuredBox.x + featuredBox.width / 2 + 120, featuredBox.y + featuredBox.height - 24, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    const draggedRight = await featured.evaluate(card => card.getBoundingClientRect().right);
    assert.ok(draggedRight <= 391, `넓은 카드를 오른쪽으로 끌어도 화면 밖으로 나가지 않는다(${draggedRight}px)`);
    await frame.evaluate(() => {
      momentOrder = ['s0', 's1', 's2', 's3', 's4', 's5'];
      setBoardMode('mine');
    });
    await page.waitForTimeout(500);
    const mine = await geometry(frame);
    assert.equal(mine.pairs, 0, '저장 순서와 날짜순서가 달라도 카드가 겹치지 않는다');
    assert.equal(await frame.locator('.card.isFeatured').getAttribute('data-id'), 's0', 'featured 카드는 현재 배치의 첫 순간과 일치한다');
    assert.equal(Math.round(await frame.$eval('.card[data-id="s0"]', card => card.getBoundingClientRect().width)), 264, 'featured로 바뀐 시작 카드는 넓은 카드가 된다');
    await context.close();
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
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
      // 공용 크게 보기는 사진을 바로 불러온다.
      await frame.evaluate(() => window.openViewer('p1'));
      await frame.waitForSelector('.lt-lightbox', { timeout: 5000 });
      const beforeDetailErrors = problems.length;
      await frame.waitForSelector('.lt-lightbox img.lt-lightbox-photo', { timeout: 20000 });
      await frame.waitForFunction(() => {
        const img = document.querySelector('.lt-lightbox img.lt-lightbox-photo');
        return !!img && img.complete && img.naturalWidth > 0;
      }, null, { timeout: 20000 });
      const detailAfter = await frame.evaluate(() => ({
        nw: document.querySelector('.lt-lightbox img.lt-lightbox-photo')?.naturalWidth || 0,
        status: document.querySelector('.lt-lightbox .lt-media-status')?.textContent || '',
      }));
      assert.ok(detailAfter.nw > 0, `${w}: 공용 크게 보기에서도 사진이 실린다`);
      assert.equal(detailAfter.status, '', `${w}: 큰 사진에는 불러오기 상태 글자를 덧붙이지 않는다`);
      assert.deepEqual(problems.slice(beforeDetailErrors), [], `${w}: 공용 크게 보기 불러오기에서도 새 콘솔 오류 0`);
      await frame.evaluate(() => LTMedia.closeLightbox());
      await context.close();
    }
  } finally { await browser.close(); server.close(); }
});

test('#1273 8번 휴대폰 보드: 카드가 예약 칸을 더 채워 빈 틈을 줄인다(간격 기준은 그대로)', () => {
  const js = readFileSync(new URL('../public/v41/views/board/board.js', import.meta.url), 'utf8');
  assert.match(js, /narrow \? 16 : 24/, '좁은 화면에서만 벌림 간격을 줄인다');
  assert.match(js, /BASE_RESERVED_H = 330/, '예약 높이 기준 330px은 그대로');
});

test('#1273 2번 화면: 크게 보기에 영어 라벨과 빈 한마디 줄이 없다', { skip, timeout: 180000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = {
    id: 'viewer', title: '뷰어 확인',
    moments: [{ id: 'm1', title: '순간', date: '2026-11-24', emotion: '설렘', note: '', keywords: ['가수:BTS'], url: '', type: 'memo', source: '내 기록', x: null, y: null, rot: 0 }],
    edges: []
  };
  const server = await serve({ '/__host-viewer.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, frame } = await openHost(browser, `${base}/__host-viewer.html`, { width: 1440, height: 900 });
    await frame.evaluate(() => window.openViewer('m1'));
    await frame.waitForSelector('.lt-lightbox', { timeout: 5000 });
    const text = await frame.locator('.lt-lightbox').innerText();
    assert.match(text, /순간 크게 보기/);
    assert.match(text, /꼬리표: #가수:BTS/);
    assert.doesNotMatch(text, /PROVENANCE|VIEWER|Keywords:|URL:|Source:|Note:/, `영어 라벨 없음: ${text}`);
    assert.doesNotMatch(text, /마음 한마디:/, `빈 한마디 줄은 화면에 없다: ${text}`);
    await context.close();
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
      for (const id of ['v1', 'v2', 'v3']) {
        await frame.locator(`.card[data-id="${id}"]`).scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
      }
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

test('#1378 보드: 카드 썸네일에서 크게 보기 재생·닫기(390·1440 × 밤·정원)', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(skip);
  const tree = starTree(3);
  const server = await serve({ '/__host-board-youtube.html': hostHTML(tree) });
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [w,h] of [[390,844],[1440,900]]) for (const theme of ['night','garden']) {
      const {context,page,frame}=await openHost(browser,base+'/__host-board-youtube.html',{width:w,height:h});
      try {
        await context.route('**/www.youtube-nocookie.com/**',route=>route.fulfill({
          status:200,contentType:'text/html',body:'<!doctype html><title>YouTube video</title>'
        }));
        await context.route('**/www.youtube.com/embed/**',route=>route.fulfill({
          status:200,contentType:'text/html',body:'<!doctype html><title>YouTube video</title>'
        }));
        await context.route('**/api/youtube/oembed*',route=>route.fulfill({
          status:200,contentType:'application/json',body:'{"title":"영상"}'
        }));
        await frame.evaluate(t=>{document.body.dataset.theme=t;document.documentElement.dataset.ltTheme=t;},theme);
        const card=frame.locator('#cardLayer .card[data-id="s1"]');
        const open=card.locator('[data-lt-play]');
        assert.equal(await open.count(),1,w+'/'+theme+': 카드의 크게 보기 단추');
        assert.equal(await card.locator('iframe').count(),0,'카드 iframe 0');
        const geometryBefore=await card.evaluate(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height};});
        const capture=process.env.LT_1378_BOARD_CAPTURE_DIR;
        if(capture){mkdirSync(capture,{recursive:true});await page.screenshot({path:path.join(capture,'before-'+w+'-'+theme+'.png')});}
        await open.focus();
        await open.press('Enter');
        await frame.waitForSelector('.lt-lightbox',{timeout:10000});
        assert.equal(await card.locator('iframe').count(),0,'크게 보기 뒤 카드 iframe 0');
        await frame.waitForSelector('.lt-lightbox iframe.lt-lightbox-media',{timeout:10000});
        const player=frame.locator('.lt-lightbox iframe.lt-lightbox-media');
        await player.scrollIntoViewIfNeeded();
        const measure=await inspectYoutubeIframe(player);
        assert.equal(measure.minimum200,true,w+'/'+theme+': 최소 200×200 '+measure.width+'×'+measure.height);
        assert.equal(measure.blocked,0,w+'/'+theme+': 가림 0 '+measure.blockers.join(','));
        assert.ok(await countYoutubeAutoplay(frame)<=1,w+'/'+theme+': 자동 재생 1개 이하');
        assert.equal(await card.locator('iframe').count(),0,'재생 중에도 카드 iframe 0');
        if(capture)await page.screenshot({path:path.join(capture,'after-'+w+'-'+theme+'.png')});
        if(w===390)await frame.locator('.lt-lightbox-close').click();
        else await frame.locator('.lt-lightbox-close').press('Escape');
        assert.equal(await frame.locator('.lt-lightbox').count(),0,'닫힘');
        assert.equal(await frame.locator('.lt-lightbox iframe').count(),0,'닫은 뒤 iframe 0');
        const geometryAfter=await card.evaluate(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height};});
        assert.deepEqual(geometryAfter,geometryBefore,'카드 크기 유지');
      } finally {await context.close();}
    }
  } finally {await browser.close(); await new Promise(r=>server.close(r));}
});

test('#1378 보드: 재생 불가면 크게 보기 iframe 제거·원본 링크', { skip: REQUIRE ? false : skip, timeout: 120000 }, async () => {
  if (skip) assert.fail(skip);
  const tree=starTree(3),server=await serve({'/__host-board-noembed.html':hostHTML(tree)});
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true});
  try {
    const {context,frame}=await openHost(browser,base+'/__host-board-noembed.html',{width:390,height:844});
    try {
      await context.route('**/api/youtube/oembed*',route=>route.fulfill({
        status:401,contentType:'application/json',body:'{"error":"youtube_embed_forbidden"}'
      }));
      await context.route('**/www.youtube-nocookie.com/**',route=>route.fulfill({
        status:200,contentType:'text/html',body:'<title>YouTube video</title>'
      }));
      await frame.locator('.card[data-id="s1"] [data-lt-play]').click({force:true});
      await frame.waitForSelector('.lt-lightbox',{timeout:10000});
      await frame.waitForSelector('.lt-lightbox .lt-lightbox-note',{timeout:10000});
      assert.equal(await frame.locator('.lt-lightbox iframe').count(),0,'재생 불가 플레이어 제거');
      assert.equal(await frame.locator('.lt-lightbox a[href*="youtube.com"]').count(),1,'원본 링크 제공');
      await frame.locator('.lt-lightbox-close').press('Escape');
      assert.equal(await frame.locator('.lt-lightbox iframe').count(),0,'닫은 뒤 iframe 0');
    }finally{await context.close();}
  }finally{await browser.close();await new Promise(r=>server.close(r));}
});

// #1298: 보드 영상 크게 보기 — 뒤로 가기 한 번으로 닫히고 스크롤은 그대로다.
test('#1298 보드 영상 크게 보기 뒤로 가기: 창 닫힘·iframe 0·스크롤 유지(390·1440)', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(skip);
  const tree = createTree({ subject: '시험', title: '시험 순간', date: '2026-11-20', emotion: '설렘', note: '', url: 'https://youtu.be/dQw4w9WgXcQ' }, '2026-11-20T00:00:00.000Z');
  const workspace = { revision: 1, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-01-01T00:00:00.000Z', state: { version: 1, trees: [tree], prefs: {} } };
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'no-preference' });
      try {
        await context.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
        await context.route('**/api/account**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"email":"measure@example.invalid","subject":"시험계정"}' }));
        await context.route('**/api/workspace**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workspace) }));
        await context.route('**/i.ytimg.com/**', r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: YT_THUMB_SVG }));
        await context.route('**/www.youtube-nocookie.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>YouTube</title>' }));
        await context.route('**/api/youtube/oembed*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"title":"영상"}' }));
        const page = await context.newPage();
        await page.goto(base + '/v41/?account=1#home', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 30000 });
        await dismissDiscoverAskIfOpen(page);
        await page.evaluate(() => document.querySelector('[data-view="track58-pinboard.html"]').click());
        await page.waitForFunction(() => { const f = document.querySelector('#view:not([hidden])'); try { return !!f && /track58-pinboard/.test(f.contentWindow.location.href); } catch { return false; } }, null, { timeout: 20000 });
        const frame = await (await page.$('#view:not([hidden])')).contentFrame();
        await frame.waitForSelector('#cardLayer .card', { timeout: 20000 });
        await frame.waitForFunction(() => { const a = [...document.querySelectorAll('#cardLayer .lt-yt-preview img')]; return a.length > 0 && a.every(i => i.complete); }, null, { timeout: 15000 }).catch(() => {});
        await frame.evaluate(() => { const v = document.getElementById('viewport'); v.scrollTop = 120; v.scrollLeft = 40; });
        const scroll = () => frame.evaluate(() => { const v = document.getElementById('viewport'); return { top: v.scrollTop, left: v.scrollLeft }; });
        const before = await scroll();
        const historyBefore = await page.evaluate(() => history.length);
        await frame.evaluate(() => document.querySelector('#cardLayer .card [data-lt-play]').click());
        await frame.waitForSelector('.lt-lightbox', { timeout: 8000 });
        assert.ok(await page.evaluate(() => history.length) > historyBefore, '크게 보기가 뒤로 가기 기록을 하나 추가한다');
        await page.goBack();
        await page.waitForFunction(() => !document.querySelector('#view')?.contentDocument?.querySelector('.lt-lightbox'), null, { timeout: 10000 });
        await page.waitForFunction(({ top, left }) => {
          const viewport = document.querySelector('#view')?.contentDocument?.getElementById('viewport');
          return !!viewport && viewport.scrollTop === top && viewport.scrollLeft === left;
        }, before, { timeout: 10000 });
        const after = await frame.evaluate(() => ({ open: !!document.querySelector('.lt-lightbox'), iframes: document.querySelectorAll('.lt-lightbox iframe').length }));
        assert.equal(after.open, false, '뒤로 가기로 크게 보기가 닫힌다');
        assert.equal(after.iframes, 0, '뒤로 가기 뒤 iframe 0');
        assert.deepEqual(await scroll(), before, '보드 스크롤 위치 유지');
        console.log('BOARD_BACK', width, JSON.stringify({ before, after }));
      } finally { await context.close(); }
    }
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
});
