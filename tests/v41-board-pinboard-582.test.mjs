import { listenOnSafePort } from './helpers/safe-port.mjs';
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
import { createGzip } from 'node:zlib';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.window = globalThis;
import '../public/v41/html-escape.mjs'; // A-15: 글자 막기 정본을 먼저 등록한다.
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
        const type = MIME[path.extname(file)] || 'application/octet-stream';
        // Slow-network measurements use compressed static text, as on Pages.
        const gzip = process.env.LT_BOARD_582_SLOW === '1' && /^(text\/|application\/json)/.test(type);
        res.writeHead(200, { 'content-type': type, ...(gzip ? { 'content-encoding': 'gzip' } : {}) });
        const stream = createReadStream(file);
        (gzip ? stream.pipe(createGzip()) : stream).pipe(res); return;
      } catch {}
    }
    res.writeHead(404); res.end('not found');
  });
  return listenOnSafePort(server, '127.0.0.1').then(() => server);
}

const hostHTML = (tree) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>보드 호스트</title><style>html,body{margin:0;overflow:hidden}iframe{display:block}</style></head><body data-member="in" data-record-source="server">
<script>window.LT41={source:'server',writable:true,owned:true,momentId:${JSON.stringify(tree.moments[0].id)},prefs:{},tree:${JSON.stringify(tree)}};window.LT41_MESSAGES=[];addEventListener('message',(e)=>{if(e.data&&e.data.type)window.LT41_MESSAGES.push({type:e.data.type,momentId:e.data.momentId,treeId:e.data.treeId,n:e.data.moments?e.data.moments.length:undefined})});</script>
<iframe src="/v41/views/track58-pinboard.html" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe></body></html>`;

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
  const cards = [...document.querySelectorAll('#cardLayer .card')].map((c) => ({ id: c.dataset.id, x: c.offsetLeft, y: c.offsetTop, w: c.offsetWidth, h: c.offsetHeight, featured: c.classList.contains('isFeatured') }));
  let pairs = 0;
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const a = cards[i], b = cards[j];
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ox > 2 && oy > 2) pairs++;
  }
  const cols = [...new Set(cards.map((c) => c.x))].sort((a, b) => a - b);
  const slots = cards.length ? cols.length * ([...new Set(cards.map((c) => c.y))].length) : 0;
  const rest = cards.filter(card => !card.featured);
  const restCols = [...new Set(rest.map((c) => c.x))].length;
  const restRows = [...new Set(rest.map((c) => c.y))].length;
  const restFilledRatio = rest.length ? rest.length / (restCols * restRows) : 1;
  return { n: cards.length, pairs, cols: cols.length, filledRatio: cards.length ? cards.length / slots : 0, restFilledRatio, threads: document.querySelectorAll('svg.threads,.threadGroup').length };
});

// #952: 줄·핀 연결·이유 창·배치 전환·상세 지도 단추·시네마 비트를 소스 글자로 고정하던 30개 단정을 걷어냈다.
// 화면에서 남길 것(줄 요소 0·연결 창 0·배치 전환 단추·지도 메시지)은 아래 실브라우저 시험이 직접 잰다.
test('#582 화면: 모아둔 순간 26(평평한 트리) — 1440 4칸·390 featured+2칸, 겹침 0, 빈 칸 비율, 줄 요소 0', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = starTree(26);
  const server = await serve({ '/__host-582.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [w, h, cols] of [[1440, 900, 4], [390, 844, 3]]) {
      const { context, frame, problems } = await openHost(browser, `${base}/__host-582.html`, { width: w, height: h });
      const g = await geometry(frame);
      assert.equal(g.n, 26, `${w}: 순간 26장이 모두 꽂힌다`);
      assert.equal(g.pairs, 0, `${w}: 겹친 카드 쌍 0`);
      assert.equal(g.cols, cols, `${w}: 칸 수는 화면 폭이 정한다(${cols}칸)`);
      const filledRatio = w === 390 ? g.restFilledRatio : g.filledRatio;
      assert.ok(filledRatio >= 0.9, `${w}: 빈 칸 비율 ${(filledRatio * 100).toFixed(0)}% — 바둑판은 구멍 없이 채운다`);
      assert.equal(g.threads, 0, `${w}: 줄 요소 0개`);
      const gone = await frame.evaluate(() => ['threadSvg', 'whyModal', 'whyBubble', 'postAdd', 'pathModeBtn'].filter((id) => document.getElementById(id)).length);
      assert.equal(gone, 0, `${w}: #582에서 치운 연결 요소가 화면에 없다`);
      const modes = await frame.evaluate(() => [...document.querySelectorAll('[data-board-mode]')].map((b) => ({ mode: b.dataset.boardMode, text: b.textContent.trim(), shown: b.offsetParent !== null })));
      assert.deepEqual(modes.map((m) => m.mode), ['date', 'mine'], `${w}: 날짜순·내 배치 전환이 보인다`);
      assert.deepEqual(modes.map((m) => m.shown), [true, true], `${w}: 두 단추가 화면에 보인다`);
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
    // #987: 날짜순 첫 줄이 먼저 보여도 다음 순간이 있는 뿌리 카드로 이동해 상세 동작을 시험한다.
    await frame.evaluate(id => focusBoardMoment(id, false), tree.moments[0].id);
    await page.waitForTimeout(400);
    const vis = await frame.evaluate(id => {
      const c = document.querySelector('#cardLayer .card[data-id="' + id + '"]');
      const r = c.getBoundingClientRect();
      return { id, x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
    }, tree.moments[0].id);
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
// #886 항목3: 터치 타깃 CSS가 track58-pinboard.html 인라인 <style id="lt-touch-targets">에서 board-extra.css로 이동했다.
// 소스 글자 단정(v41-touch-targets의 lt-touch-targets 블록 파싱·하드코딩 크기)은 리팩터링에 깨지고 실제 크기와도 어긋나
// (예: #detailYtLink 실제 높이 24px를 34px로 잘못 가정) 거짓 통과를 냈다. 그 단정은 지우고 실제 렌더링 히트박스를 잰다.
// 보이는 버튼 rect + ::after inset(음수만큼 확장)으로 실효 누름 영역을 계산한다.
test('조작 버튼 히트박스는 44x44 이상이다(렌더링 ::after 터치 영역)', { skip: REQUIRE ? false : skip }, async (t) => {
  // 별 모양 8순간(카드가 고르게 퍼져 클릭 가능). note를 비워 memo가 없게 하면 #dHeartSave(마음 입력)가 보이고,
  // s1은 YouTube 주소가 있어 #detailYtLink도 보인다.
  const tree = starTree(8);
  tree.moments.forEach((m) => { m.note = ''; });
  const browser = await chromium.launch();
  const server = await serve({ '/host.html': hostHTML(tree) });
  t.after(async () => { await browser.close(); server.close(); });
  const { context, page, frame, problems } = await openHost(browser, `http://127.0.0.1:${server.address().port}/host.html`, { width: 1440, height: 900 });
  assert.deepEqual(problems, [], '화면 오류 없음: ' + problems.join(' | '));
  await frame.evaluate(() => document.body.classList.add('lt-advanced'));
  await frame.click('.card[data-id="s1"]');
  await frame.waitForFunction(() => document.querySelector('.card.selected')?.dataset.id === 's1', null, { timeout: 5000 });
  await page.waitForTimeout(500);
  // #1249: 이어 보기는 공통 도구 줄로 이동했다 — 같은 44×44 터치 기준으로 그 단추를 잰다.
  const TARGETS = ['#minusBtn', '#plusBtn', '#resetBtn', '#openMoment', '#detailYtLink', '#cinemaFromMoment', '#dHeartSave', '#cinemaBtn', '#toolFit', '#detailClose'];
  const hits = await frame.evaluate((sels) => sels.map((sel) => {
    const el = document.querySelector(sel); if (!el) return { sel, missing: true };
    const r = el.getBoundingClientRect(); const af = getComputedStyle(el, '::after');
    const parts = (af.inset || '').trim().split(/\s+/).map(parseFloat);
    let tt = 0, rr = 0, bb = 0, ll = 0;
    if (parts.length === 1) { tt = rr = bb = ll = parts[0]; }
    else if (parts.length === 2) { tt = bb = parts[0]; rr = ll = parts[1]; }
    else if (parts.length === 3) { tt = parts[0]; rr = ll = parts[1]; bb = parts[2]; }
    else if (parts.length >= 4) { tt = parts[0]; rr = parts[1]; bb = parts[2]; ll = parts[3]; }
    const expand = af.content && af.content !== 'none' && af.position === 'absolute';
    const w = r.width - (expand ? ll + rr : 0); const h = r.height - (expand ? tt + bb : 0);
    return { sel, w: Math.round(w), h: Math.round(h), rw: Math.round(r.width), rh: Math.round(r.height), inset: af.inset, content: af.content, pos: af.position, expand };
  }), TARGETS);
  for (const hit of hits) {
    assert.ok(!hit.missing, `${hit.sel} 버튼이 있다`);
    assert.ok(hit.rw > 0 && hit.rh > 0, `${hit.sel} 버튼이 보인다(${hit.rw}x${hit.rh})`);
    // 터치 타깃 ::after 메커니즘이 살아있다(이동이 규칙을 잃지 않았다).
    assert.ok(hit.expand && hit.inset && hit.inset !== 'auto', `${hit.sel}에 ::after inset 터치 규칙이 있다(content ${hit.content}, inset ${hit.inset})`);
    assert.ok(hit.w >= 44 && hit.h >= 44, `\${hit.sel} 히트박스 \${hit.w}x\${hit.h}가 44 미만이다(inset \${hit.inset})`);
  }
   await context.close();
 });

// #1026 묶음 C: 썸네일이 늦게 도착해도 카드 자리를 다시 잡지 않는다(보통 조건 CLS 0.01 이하).
test('#1026 동작: 그림 지연 도착에도 카드 top 변화 0, 보드 CLS 0.01 이하', { skip: REQUIRE ? false : skip, timeout: 180000 }, async (t) => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const { chromium: browserChromium } = await import('playwright');
  const tree = starTree(8);
  const server = await serve({ '/__host-1026.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await browserChromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    window.__shift1026 = [];
    try {
      const rect = (r) => ({ x: r.x, y: r.y, width: r.width, height: r.height });
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) {
          window.__shift1026.push({
            v: +e.value.toFixed(6), t: Math.round(e.startTime),
            src: (e.sources || []).map(s => ({
              node: s.node ? (s.node.nodeName + (s.node.id ? '#' + s.node.id : '') + (typeof s.node.className === 'string' ? '.' + s.node.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) : '?',
              previousRect: rect(s.previousRect), currentRect: rect(s.currentRect)
            }))
          });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
  });
  await context.route('**/i.ytimg.com/**', async (route) => {
    await new Promise((ok) => setTimeout(ok, 500));
    await route.fulfill({ contentType: 'image/svg+xml', body: YT_THUMB_SVG });
  });
  try {
    const page = await context.newPage();
    if (process.env.LT_BOARD_582_SLOW === '1') {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false, latency: 400, downloadThroughput: 50000, uploadThroughput: 50000, connectionType: 'cellular3g'
      });
    }
    await page.goto(`${base}/__host-1026.html`, { waitUntil: 'domcontentloaded' });
    let frame = null;
    for (let i = 0; i < 80 && !frame; i++) {
      frame = page.frames().find((f) => f !== page.mainFrame() && /views\/track58-pinboard/.test(f.url()));
      if (!frame) await page.waitForTimeout(100);
    }
    assert.ok(frame, '보드 프레임이 열린다');
    await frame.waitForSelector('#cardLayer .card', { timeout: 20000 });
    const topsBefore = await frame.evaluate(() => [...document.querySelectorAll('#cardLayer .card')].map((el) => el.offsetTop));
    await page.waitForTimeout(1600);
    const result = await frame.evaluate(() => ({
      tops: [...document.querySelectorAll('#cardLayer .card')].map((el) => el.offsetTop),
      shifts: window.__shift1026 || []
    }));
    const cls = result.shifts.reduce((sum, item) => sum + item.v, 0);
    t.diagnostic(JSON.stringify({ cls: +cls.toFixed(6), entries: result.shifts }));
    const moved = result.tops.filter((top, i) => top !== topsBefore[i]).length;
    assert.equal(moved, 0, `그림 도착 뒤 옮겨진 카드 ${moved}개 — 처음 자리가 최종 자리여야 한다`);
    assert.ok(cls <= 0.01, `보드 CLS ${cls.toFixed(6)}가 0.01을 넘었다`);
  } finally { await browser.close(); server.close(); }
});


test('#1249 390에서 모든 카드가 판 안에 있음: 밝은·밤, 스크롤로 5장 모두 접근', { skip: REQUIRE ? false : skip, timeout: 120000 }, async () => {
  const tree = starTree(5);
  tree.moments = tree.moments.map((m,i)=>({...m,date:'2026-11-0'+(i+1),type:i<3?'photo':'memo',url:'',image:i<3?'https://audit.invalid/photo'+i+'.jpg':'',first:i===0}));
  const server = await serve({'/scroll-host.html':hostHTML(tree)});
  const base = 'http://127.0.0.1:'+server.address().port;
  const browser = await chromium.launch();
  try {
    for (const theme of ['garden','night']) {
      const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
      try {
        await ctx.addInitScript(t=>localStorage.setItem('lt41.theme',t),theme);
        await ctx.route('**/*',r=>{
          const u=new URL(r.request().url());
          if(u.origin===base && u.pathname.startsWith('/api/')) return r.fulfill({status:200,json:{ok:true,items:[]}});
          if(u.origin===base) return r.continue();
          if(u.hostname==='audit.invalid') return r.fulfill({contentType:'image/svg+xml',body:YT_THUMB_SVG});
          return r.abort();
        });
        const page=await ctx.newPage();
        await page.goto(base+'/scroll-host.html',{waitUntil:'load'});
        const frame=page.frames().find(f=>f!==page.mainFrame());
        await frame.waitForFunction(()=>document.querySelectorAll('#cardLayer .card').length===5 && document.getElementById('viewport').classList.contains('board-scroll'));
        const read=()=>frame.evaluate(()=>{
          const vp=document.getElementById('viewport'),vr=vp.getBoundingClientRect(),sr=document.querySelector('.surface').getBoundingClientRect();
          const picker=document.querySelector('.lt-moment-picker');
          const safeTop=Math.max(vr.top,picker?.getBoundingClientRect().bottom||0);
          return {height:vp.clientHeight,scrollHeight:vp.scrollHeight,scrollTop:vp.scrollTop,scrollWidth:vp.scrollWidth,width:vp.clientWidth,
            cards:[...document.querySelectorAll('#cardLayer .card')].map(e=>{
              const r=e.getBoundingClientRect();
              return {id:e.dataset.id,top:e.offsetTop,contentTop:r.top-vr.top+vp.scrollTop,contentBottom:r.bottom-vr.top+vp.scrollTop,
                inside:r.top>=sr.top-1&&r.bottom<=sr.bottom+1&&r.left>=sr.left-1&&r.right<=sr.right+1&&r.left>=vr.left-1&&r.right<=vr.right+1,
                visible:r.top>=safeTop-1&&r.bottom<=vr.bottom+1};
            })};
        });
        let first=await read();
        assert.equal(first.scrollTop,0,theme+' 첫 카드부터 표시');
        assert.ok(first.scrollHeight>first.height,theme+' 실제 세로 스크롤 길이');
        assert.ok(first.scrollWidth<=first.width,theme+' 가로 넘침 0');
        assert.equal(first.cards.filter(c=>c.visible).length,3,theme+' 첫 화면에 카드 세 장');
        assert.equal(first.cards.filter(c=>c.inside&&c.contentTop>=0&&c.contentBottom<=first.scrollHeight+1).length,5,theme+' 모든 카드가 판과 스크롤 범위 안');
        const reached=new Set(first.cards.filter(c=>c.visible).map(c=>c.id));
        await page.mouse.move(30,550);
        while (first.scrollTop<first.scrollHeight-first.height-1) {
          const before=first.scrollTop;
          await page.mouse.wheel(0,260);
          await frame.waitForFunction(y=>document.getElementById('viewport').scrollTop>y,before);
          first=await read();
          for(const c of first.cards) if(c.visible) reached.add(c.id);
        }
        assert.equal(reached.size,5,theme+' 실제 휠로 카드 5장 모두 접근');
        assert.ok(first.cards.find(c=>c.id===tree.moments[0].id).visible,theme+' 맨 아래 마지막 카드');
        // 휴대폰 손가락으로도 카드 위에서 스크롤할 수 있어야 한다.
        await frame.evaluate(()=>document.getElementById('viewport').scrollTop=0);
        const cdp=await ctx.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:195,y:330}]});
        for(const y of [300,260,220,180]) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:195,y}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await frame.waitForFunction(()=>document.getElementById('viewport').scrollTop>0);
        console.log('#1249',theme,JSON.stringify({판높이:first.height,스크롤높이:first.scrollHeight,카드top:first.cards.map(c=>c.top),도달:reached.size,끝:first.scrollTop}));
      } finally {await ctx.close();}
    }
  } finally {await browser.close();await new Promise(r=>server.close(r));}
});

test('#1529 844x390: 세로 스크롤로 마지막 카드 접근·끌기 두 방향 저장', { skip: REQUIRE ? false : skip, timeout: 120000 }, async (t) => {
  const tree = starTree(8);
  const server = await serve({ '/__host-1529.html': hostHTML(tree) });
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); server.close(); });
  const { context, page, frame, problems } = await openHost(browser,
    'http://127.0.0.1:' + server.address().port + '/__host-1529.html', { width: 844, height: 390 });
  t.after(async () => context.close());
  await frame.evaluate(() => document.body.classList.add('lt-advanced'));
  const touch = await frame.evaluate(() => [...document.querySelectorAll('#leftPanel .filterSelect,#leftPanel .wideTool,#leftPanel .themeBtn,#leftPanel .styleMini,#leftPanel .collapseBtn')]
    .filter(e => e.getClientRects().length).map(e => ({ id: e.id, height: e.getBoundingClientRect().height, width: e.getBoundingClientRect().width })));
  assert.ok(touch.length >= 8, '844 고급 도구의 선택·테마 단추 존재');
  for (const hit of touch) assert.ok(hit.height >= 44 && hit.width >= 44, '844 고급 도구 누름 영역 44px: ' + JSON.stringify(hit));
  const before = await frame.evaluate(() => {
    const viewport = document.querySelector('#viewport');
    return { scrollable: viewport.scrollHeight > viewport.clientHeight,
      height: viewport.clientHeight, total: viewport.scrollHeight };
  });
  assert.ok(before.scrollable, '844 가로 화면 카드 세로 스크롤 활성화');
  await frame.evaluate(() => { const v = document.querySelector('#viewport'); v.scrollTop = v.scrollHeight; });
  await page.waitForTimeout(250);
  const end = await frame.evaluate(() => {
    const cards = [...document.querySelectorAll('.card')];
    const bottom = Math.max(...cards.map(c => c.getBoundingClientRect().bottom));
    const v = document.querySelector('#viewport').getBoundingClientRect();
    return { bottom, viewportBottom: v.bottom };
  });
  assert.ok(end.bottom <= end.viewportBottom + 8, '끝까지 스크롤하면 모든 카드 아래끝에 접근');
  await frame.evaluate(() => { document.querySelector('#viewport').scrollTop = 0; });
  await page.waitForTimeout(250);
  const dragOnce = async (direction) => {
    const pair = await frame.evaluate(() => {
      const v = document.querySelector('#viewport').getBoundingClientRect();
      return [...document.querySelectorAll('.card')].map(c => {
        const r = c.getBoundingClientRect();
        return { id: c.dataset.id, x: r.x + r.width / 2, y: r.y + r.height / 2, visible: r.top >= v.top && r.bottom <= v.bottom };
      }).filter(c => c.visible).slice(0, 2);
    });
    assert.equal(pair.length, 2, '화면에 끌 카드 두 장 표시');
    const [a,b] = direction === 'forward' ? pair : pair.reverse();
    await page.mouse.move(a.x,a.y); await page.mouse.down();
    await page.mouse.move(b.x,b.y,{steps:12}); await page.mouse.up();
    await page.waitForTimeout(350);
  };
  await dragOnce('forward');
  assert.equal(await frame.locator('[data-board-mode="mine"]').getAttribute('aria-pressed'), 'true', '첫 끌기 뒤 내 배치');
  const first = await page.evaluate(() => window.LT41_MESSAGES.filter(m => m.type === 'lt41-board-sync').length);
  assert.ok(first > 0, '첫 끌기 저장 메시지');
  await dragOnce('back');
  const second = await page.evaluate(() => window.LT41_MESSAGES.filter(m => m.type === 'lt41-board-sync').length);
  assert.ok(second > first, '반대 방향 끌기 저장 메시지');
  assert.deepEqual(problems, [], '브라우저 오류 없음');
});

test('#1529 390: 접힌 도구 줄을 통해 두 종류의 거르기 사용', { skip: REQUIRE ? false : skip, timeout: 90000 }, async (t) => {
  const tree = starTree(8);
  tree.moments.forEach((m,i) => { m.keywords = [i%2 ? '여행' : '일상']; });
  const server = await serve({ '/__host-1529-filter.html': hostHTML(tree) });
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); server.close(); });
  const { context, page, frame, problems } = await openHost(browser,
    'http://127.0.0.1:' + server.address().port + '/__host-1529-filter.html', { width: 390, height: 844 });
  t.after(async () => context.close());
  await frame.evaluate(() => document.body.classList.add('lt-advanced'));
  if (!await frame.locator('#mobileTools').isVisible()) await frame.locator('.lt-toolbar-more').click();
  await frame.locator('#mobileTools').click();
  await frame.locator('#keywordFilter').selectOption('여행');
  assert.equal(await frame.locator('.card:not(.filteredOut)').count(), 4, '꼬리표 조건 결과 4장');
  await frame.locator('#keywordFilter').selectOption('all');
  await frame.locator('#mediaFilter').selectOption('video');
  assert.equal(await frame.locator('.card:not(.filteredOut)').count(), 7, '영상 조건 결과 7장');
  assert.deepEqual(problems, [], '브라우저 오류 없음');
});

test('#1529 1440: 카드 40장 상세 판을 열어도 읽을 수 있는 크기 유지', { skip: REQUIRE ? false : skip, timeout: 120000 }, async (t) => {
  const tree = starTree(40);
  const server = await serve({ '/__host-1529-many.html': hostHTML(tree) });
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); server.close(); });
  const { context, frame, problems } = await openHost(browser,
    'http://127.0.0.1:' + server.address().port + '/__host-1529-many.html', { width: 1440, height: 900 });
  t.after(async () => context.close());
  await frame.evaluate(() => selectMoment('s1', true));
  await frame.waitForFunction(() => document.querySelector('#detail')?.classList.contains('open'));
  const result = await frame.evaluate(() => {
    const detail = document.querySelector('#detail').getBoundingClientRect();
    const area = document.querySelector('#viewport').getBoundingClientRect();
    const cards = [...document.querySelectorAll('.card')].map(c => c.getBoundingClientRect());
    const visible = cards.filter(r => r.right > area.left && r.left < area.right && r.bottom > area.top && r.top < area.bottom);
    return { maxWidth: Math.max(0, ...visible.map(r => r.width)), panel: detail.right,
      overlap: visible.filter(r => r.left < detail.right && r.right > detail.left && r.top < detail.bottom && r.bottom > detail.top).length };
  });
  assert.ok(result.maxWidth >= 180, '1440 40장 상세 판의 보이는 카드 너비는 180px 이상: ' + JSON.stringify(result));
  assert.equal(result.overlap, 0, '상세 판과 보이는 카드 겹침 0');
  assert.deepEqual(problems, [], '브라우저 오류 없음');
});
