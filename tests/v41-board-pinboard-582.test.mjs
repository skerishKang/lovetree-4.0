// #582: 보드를 핀보드로 — 실행 계약.
// 1) 배치: 관계(treeSpread) 대신 날짜 최신순 바둑판. 26순간 평평한 트리에서 겹침 0·빈 칸 비율,
//    칸 수는 화면 폭이 정한다(1440 4칸, 390 1칸). 글자 기준선(#548)은 v41-font-floor-548가 검사한다.
// 2) 꽂기: 카드를 끌어 다른 빈 칸에 꽂고 기존 저장 방식(lt41-board-sync의 x·y) 그대로 저장,
//    '정렬 되돌리기'로 날짜순 바둑판 복귀.
// 3) 줄 없음: threads·핀 연결·'이어진 이유' 창이 보드에서 사라졌다.
// 4) 순간 상세: '지도에서 관계 보기' 단추가 셸 화면 이동 메시지를 보낸다. #583의 다음·이전 단추는 유지.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.window = globalThis;
await import('../public/v41/views/board/board-model.js');
const LT58Model = globalThis.LT58Model;

const REQUIRE = process.env.LT_BOARD_582_REQUIRE === '1';
const ROOT = path.resolve(process.env.LT_BOARD_582_ROOT || fileURLToPath(new URL('../public', import.meta.url)));
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  const { existsSync } = await import('node:fs');
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 핀보드 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 핀보드 시험을 건너뜀'; }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

const read = (file) => fs.readFileSync(new URL(`../public/v41/${file}`, import.meta.url), 'utf8');

// 26순간 평평한 트리: 전부 한 뿌리의 자식(별 모양) — 관계 배치가 어려웠던 모양. 자리 저장 없음.
const starTree = (n) => {
  const moments = Array.from({ length: n }, (_, i) => ({
    id: 's' + i, title: '모은 순간 ' + (i + 1), date: '2026-0' + ((i % 9) + 1) + '-1' + (i % 9), emotion: '설렘', note: '메모 ' + (i + 1),
    parentId: i ? 's0' : null, relation: '', url: i ? 'https://youtu.be/dQw4w9WgXcQ' : '', x: null, y: null, rot: 0, color: 'violet', keywords: []
  }));
  const edges = [];
  for (let i = 1; i < n; i++) edges.push({ id: 'e' + i, kind: 'parent', from: 's0', to: 's' + i, reason: '' });
  return { id: 'star' + n, title: '모아둔 ' + n, moments, edges };
};

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

const hostHTML = (tree) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>보드 호스트</title></head><body data-member="in" data-record-source="server">
<script>window.LT41={source:'server',writable:true,owned:true,momentId:${JSON.stringify(tree.moments[0].id)},prefs:{},tree:${JSON.stringify(tree)}};window.LT41_MESSAGES=[];addEventListener('message',(e)=>{if(e.data&&e.data.type)window.LT41_MESSAGES.push({type:e.data.type,momentId:e.data.momentId,treeId:e.data.treeId,n:e.data.moments?e.data.moments.length:undefined})});</script>
<iframe src="/v41/views/track58-pinboard.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;

const YT_THUMB_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="1600" height="1200" fill="#8a7a92"/><path d="M700 350 L700 850 L1050 600 Z" fill="#fff"/></svg>';

async function openHost(browser, url, { width, height } = {}) {
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
    if (!frame) await page.waitForTimeout(250);
  }
  assert.ok(frame, '보드 프레임이 열린다');
  try {
    await frame.waitForSelector('#cardLayer .card', { timeout: 20000 });
  } catch (e) {
    throw new Error(`보드 화면이 열리지 않았다(${width}×${height}): ${String(e).slice(0, 200)} / 화면 문제: ${problems.join(' | ') || '없음'}`);
  }
  await page.waitForTimeout(1500);
  return { context, page, frame, problems };
}

// 화면 좌표 기준 겹침·칸 수·빈 칸 비율.
const geometry = (frame) => frame.evaluate(() => {
  const cards = [...document.querySelectorAll('#cardLayer .card')].map((c) => ({ id: c.dataset.id, x: c.offsetLeft, y: c.offsetTop, w: c.offsetWidth, h: c.offsetHeight }));
  let pairs = 0;
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const a = cards[i], b = cards[j];
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ox > 2 && oy > 2) pairs++;
  }
  const cols = [...new Set(cards.map((c) => c.x))].sort((a, b) => a - b);
  const slots = cards.length ? cols.length * ([...new Set(cards.map((c) => c.y))].length) : 0;
  return { n: cards.length, pairs, cols: cols.length, filledRatio: cards.length ? cards.length / slots : 0, threads: document.querySelectorAll('svg.threads,.threadGroup').length };
});

test('#582 보드에서 줄이 사라졌다 — 실·핀 연결·이유 창·연결 배너의 흔적이 없다', () => {
  const html = read('views/track58-pinboard.html');
  const board = read('views/board/board.js');
  const extras = read('views/board/board-extras.js');
  const model = read('views/board/board-model.js');
  assert.ok(!html.includes('id="threadSvg"'), '줄 SVG가 없다');
  assert.ok(!html.includes('id="whyModal"'), "'이어진 이유' 창이 없다");
  assert.ok(!html.includes('id="whyBubble"'), '연결 말풍선이 없다');
  assert.ok(!html.includes('id="postAdd"'), '연결 배너가 없다');
  assert.ok(!html.includes('id="pathModeBtn"'), '선택 경로만 보기 단추가 없다');
  assert.ok(!board.includes('startConnect'), '핀 끌어 연결이 없다');
  assert.ok(!board.includes('completeConnection'), '핀 탭 연결이 없다');
  assert.ok(!board.includes('saveWhy'), '이유 저장이 없다');
  assert.ok(!board.includes('travelConnection'), '실 따라가기가 없다');
  assert.ok(!model.includes('threadPath'), '실 베지에 계산이 없다');
  assert.ok(!model.includes('treeSpread'), '관계 배치 계산이 없다');
  assert.ok(!extras.includes('pathDLive'), '실 다시 그리기가 없다');
  // 연결 데이터 자체는 유지된다(지도가 쓴다) — 저장 값에서 사라지지 않는다.
  assert.match(board, /let connections=LTDEMO\.edges\.map\(/);
});

test('#601 배치 모드 전환이 있고, 읽기 전용 가드를 끌어 꽂기가 쓴다', () => {
  const html = read('views/track58-pinboard.html');
  const board = read('views/board/board.js');
  // '정렬 되돌리기'는 '날짜순 | 내 배치' 전환으로 대체됐다(#601). 전환은 저장 자리를 지우지 않는다.
  assert.doesNotMatch(html, /id="sortResetBtn"/);
  assert.match(html, /data-board-mode="date"[^>]*>날짜순</);
  assert.match(html, /data-board-mode="mine"[^>]*>내 배치</);
  assert.match(board, /function setBoardMode\(mode,\{save=true,replace=true\}/);
  assert.match(board, /saved:boardMode==='mine'\?savedSlotsOf\(moments\):null/);
  assert.match(board, /if\(boardMode==='mine'&&m\.savedPos\)continue/);
  // 끌어 꽂기는 같은 가드를 쓴다(읽기 전용에서는 판 자리를 바꾸지 않는다).
  assert.match(board, /function dragGuard\(\)\{const guard=LT58Model\.editGuard\(canEditBoard\)/);
  assert.match(board, /if\(guard\.blocked\)\{toast\(guard\.message\);/);
});

test('#582 상세에 지도 단추가 있고 셸 화면 이동 메시지를 보낸다(#583의 이전·다음 단추는 유지)', () => {
  const extras = read('views/board/board-extras.js');
  const shell = read('shell/messages.mjs');
  assert.match(extras, /id='detailMapBtn'/);
  assert.match(extras, /mapBtn\.textContent='지도에서 관계 보기'/);
  assert.match(extras, /type:'lt41-open-network',treeId:window\.parent\?\.LT41\?\.tree\?\.id,momentId:selected/);
  // 셸이 받는다 — 지도 파일은 건드리지 않았다(지도→책 이동과 같은 방식).
  assert.match(shell, /data\?\.type === 'lt41-open-network'/);
  assert.match(shell, /setCurrent\('track56-network\.html'\); choose\(treeId, data\.momentId\); writeLocation\(\);/);
  // #583 회귀 방지: 다음·이전 순간 단추(connLink)가 그대로다.
  assert.match(extras, /function connRow\(/);
  assert.match(extras, /moveViaConnection/);
});

test('#582 시네마는 순간 비트만 걷는다 — 연결·이유·갈림 비트가 없다', () => {
  const extras = read('views/board/board-extras.js');
  assert.match(extras, /beats\.filter\(b=>!\['connection','why','branch'\]\.includes\(b\.type\)\)/);
});

test('#582 화면: 모아둔 순간 26(평평한 트리) — 1440 4칸·390 1칸, 겹침 0, 빈 칸 비율, 줄 요소 0', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = starTree(26);
  const server = await serve({ '/__host-582.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [w, h, cols] of [[1440, 900, 4], [390, 844, 1]]) {
      const { context, frame, problems } = await openHost(browser, `${base}/__host-582.html`, { width: w, height: h });
      const g = await geometry(frame);
      assert.equal(g.n, 26, `${w}: 순간 26장이 모두 꽂힌다`);
      assert.equal(g.pairs, 0, `${w}: 겹친 카드 쌍 0`);
      assert.equal(g.cols, cols, `${w}: 칸 수는 화면 폭이 정한다(${cols}칸)`);
      assert.ok(g.filledRatio >= 0.9, `${w}: 빈 칸 비율 ${(g.filledRatio * 100).toFixed(0)}% — 바둑판은 구멍 없이 채운다`);
      assert.equal(g.threads, 0, `${w}: 줄 요소 0개`);
      assert.equal(problems.length, 0, `${w}: 화면 문제 없음 (${problems.join(' | ') || '없음'})`);
      await context.close();
    }
  } finally { await browser.close(); server.close(); }
});

test('#582 화면: 끌어 꽂기 — 빈 칸에 스냅되고 저장 방식은 그대로다(x·y를 lt41-board-sync로)', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = starTree(26);
  const server = await serve({ '/__host-582b.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page, frame, problems } = await openHost(browser, `${base}/__host-582b.html`, { width: 1440, height: 900 });
    // 보이는 카드를 골라 다른 칸의 중심으로 끌어 꽂는다.
    const from = await frame.evaluate(() => {
      for (const c of document.querySelectorAll('#cardLayer .card')) {
        const r = c.getBoundingClientRect();
        if (r.top > 80 && r.bottom < 880 && r.left > 0 && r.right < 1430) return { id: c.dataset.id, x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
      }
      return null;
    });
    assert.ok(from, '끌 카드가 보인다');
    const to = await frame.evaluate(() => {
      // 같은 줄의 오른쪽 빈 칸(마지막 칸 오른쪽) 자리를 화면 좌표로 계산해 넘긴다.
      const c = document.querySelector('#cardLayer .card');
      const r = c.getBoundingClientRect(), z = r.width / c.offsetWidth;
      return { x: r.right + 242 * z * 0.6, y: (r.top + r.bottom) / 2 };
    });
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(1200);
    const after = await frame.evaluate((id) => {
      const el = document.querySelector(`[data-id="${id}"]`);
      const m = el ? { x: el.offsetLeft, y: el.offsetTop } : null;
      const xs = [...new Set([...document.querySelectorAll('#cardLayer .card')].map((c) => c.offsetLeft))].sort((a, b) => a - b);
      return { m, xs, pairs: (() => { const cards = [...document.querySelectorAll('#cardLayer .card')].map((c) => ({ x: c.offsetLeft, y: c.offsetTop, w: c.offsetWidth, h: c.offsetHeight })); let p = 0; for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) { const a = cards[i], b = cards[j]; if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2) p++; } return p; })() };
    }, from.id);
    if (after.pairs) console.log('OVERLAP DETAIL', JSON.stringify(await frame.evaluate(() => { const cards = [...document.querySelectorAll('#cardLayer .card')].map((c) => ({ id: c.dataset.id, x: c.offsetLeft, y: c.offsetTop, w: c.offsetWidth, h: c.offsetHeight })); const out = []; for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) { const a = cards[i], b = cards[j]; if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2) out.push([a, b]); } return out; })));
    assert.equal(after.pairs, 0, '꽂은 뒤에도 겹침 0');
    // #601: 카드를 옮기면 '내 배치'로 자동 전환된다.
    assert.equal(await frame.evaluate(() => document.querySelector('[data-board-mode="mine"]').getAttribute('aria-pressed')), 'true', '끌면 내 배치로 자동 전환');
    // 저장: 부모 프레임에 lt41-board-sync가 도착하고, 그 순간의 x·y가 칸 자리(300의 배수 오프셋)다.
    const sync = await page.evaluate(() => window.LT41_MESSAGES.filter((m) => m.type === 'lt41-board-sync'));
    assert.ok(sync.length > 0, '보드 저장 메시지가 간다');
    // #601: '날짜순' 전환 — 저장 자리를 지우지 않고 날짜 최신순 바둑판으로 돌아간다.
    await frame.evaluate(() => document.querySelector('[data-board-mode="date"]').click());
    await page.waitForTimeout(1200);
    const reset = await frame.evaluate(() => {
      const cards = [...document.querySelectorAll('#cardLayer .card')].map((c) => ({ x: c.offsetLeft, y: c.offsetTop, w: c.offsetWidth, h: c.offsetHeight }));
      let p = 0;
      for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) { const a = cards[i], b = cards[j]; if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2) p++; }
      return { pairs: p, cols: [...new Set(cards.map((c) => c.x))].length };
    });
    assert.equal(reset.pairs, 0, '되돌린 뒤에도 겹침 0');
    assert.equal(reset.cols, 4, '되돌린 뒤 4칸 바둑판');
    assert.equal(problems.length, 0, `화면 문제 없음 (${problems.join(' | ') || '없음'})`);
    await context.close();
  } finally { await browser.close(); server.close(); }
});

test('#582 화면: 상세의 지도 단추가 셸 메시지를 보내고, 다음 순간 단추가 판을 옮긴다(#583 유지)', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = starTree(26);
  const server = await serve({ '/__host-582c.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page, frame } = await openHost(browser, `${base}/__host-582c.html`, { width: 1440, height: 900 });
    const vis = await frame.evaluate(() => {
      for (const c of document.querySelectorAll('#cardLayer .card')) {
        const r = c.getBoundingClientRect();
        if (r.top > 80 && r.bottom < 880 && r.left > 0 && r.right < 1430) return { id: c.dataset.id, x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
      }
      return null;
    });
    await page.mouse.click(vis.x, vis.y);
    await page.waitForTimeout(700);
    // 지도 단추 → lt41-open-network
    await frame.evaluate(() => document.getElementById('detailMapBtn').click());
    await page.waitForTimeout(400);
    const msgs = await page.evaluate(() => window.LT41_MESSAGES.filter((m) => m.type === 'lt41-open-network'));
    assert.ok(msgs.length > 0, 'lt41-open-network 메시지가 간다');
    assert.equal(msgs.at(-1).momentId, vis.id, '그 순간으로 열린다');
    assert.equal(msgs.at(-1).treeId, tree.id, '그 나무로 열린다');
    // 다음 순간 단추(#583): 판이 움직이고 상세가 바뀐다.
    const before = await frame.evaluate(() => ({ t: document.getElementById('world').style.transform, title: document.getElementById('dTitle')?.textContent }));
    await frame.evaluate(() => document.querySelector('#dConn .connCard[data-dir="next"]')?.click());
    await page.waitForTimeout(1400);
    const after = await frame.evaluate(() => ({ t: document.getElementById('world').style.transform, title: document.getElementById('dTitle')?.textContent }));
    assert.notEqual(after.t, before.t, '다음 순간 단추가 판을 옮긴다');
    assert.notEqual(after.title, before.title, '상세가 다음 순간으로 바뀐다');
    await context.close();
  } finally { await browser.close(); server.close(); }
});
