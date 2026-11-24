// #619-6 '내 배치' = 끌어서 끼워 넣고 순서로 저장한다.
// 저장 경로는 서버 문서 PUT 그대로 — 좌표 y 값에 순위(-10000+rank)를 실어 보내고, 서버 검증(boardLayoutOf)은 그대로 통과시킨다(서버·DB 변경 없음).
// 크롬 화면 시험은 LT_BOARD_ORDER_619_REQUIRE=1.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.window = globalThis;
import '../public/v41/html-escape.mjs'; // A-15: 글자 막기 정본을 먼저 등록한다.
await import('../public/v41/views/board/board-model.js');
const M = globalThis.LT58Model;
const REQUIRE = process.env.LT_BOARD_ORDER_619_REQUIRE === '1';

test('#619-6 모델: 순서 값(y)은 -10000+순위이며, 순서로 읽는 조건이 맞는다', () => {
  assert.equal(M.ORDER_Y_BASE, -10000);
  assert.equal(M.isOrderY(-10000), true, '순위 0');
  assert.equal(M.isOrderY(-9975), true, '순위 25');
  assert.equal(M.isOrderY(-3000), false, '상한 밖');
  assert.equal(M.isOrderY(150), false, '옛 좌표는 순서가 아니다');
  assert.equal(M.isOrderY(null), false);
  assert.equal(M.isOrderY(-9999.5), false, '정수가 아니라면 순서가 아니다');
});

test('#619-6 모델: 순서가 실린 트리는 그 순서대로 읽는다(폭·날짜와 무관하게)', () => {
  const ms = [
    { id: 'a', y: -10000 + 2 }, { id: 'b', y: -10000 + 0 }, { id: 'c', y: -10000 + 1 }
  ];
  assert.deepEqual(M.orderOfMoments(ms), ['b', 'c', 'a']);
  assert.equal(M.orderOfMoments([{ id: 'a', y: 150 }, { id: 'b', y: 300 }]), null, '옛 좌표 트리는 순서가 없다');
  // 순위가 0부터 끊김 없이 이어지지 않으면 순서가 아니라고 본다(옛 음수 좌표 오인 방지).
  assert.equal(M.orderOfMoments([{ id: 'a', y: -10000 + 3 }, { id: 'b', y: -10000 + 7 }]), null);
  // 일부만 실렸으면(새 순간 추가 직후) 실린 순서 + 나머지를 날짜순을 이어 붙인다.
  const partial = M.orderOfMoments([
    { id: 'new', y: 150, date: '2026-11-14', createdOrder: 3 },
    { id: 'b', y: -10000 + 0, date: '2026-11-10', createdOrder: 2 },
    { id: 'a', y: -10000 + 1, date: '2026-11-09', createdOrder: 1 }
  ]);
  assert.deepEqual(partial, ['b', 'a', 'new']);
  // 중복 순위 → 순서가 아니다.
  assert.equal(M.orderOfMoments([{ id: 'a', y: -10000 }, { id: 'b', y: -10000 }]), null);
});

test('#619-6 모델: 옛 x·y는 순서로 한 번 바꿔 읽는다 — 저장 자리는 줄→칸 순, 나머지는 날짜순', () => {
  const saved = new Map([
    ['a', { col: 2, row: 1 }],
    ['b', { col: 0, row: 0 }],
    ['c', { col: 1, row: 0 }],
    ['d', { col: 0, row: 2 }]
  ]);
  assert.deepEqual(M.orderFromSaved(saved, ['e', 'f']), ['b', 'c', 'a', 'd', 'e', 'f']);
  assert.deepEqual(M.orderFromSaved(new Map(), ['x']), ['x']);
  assert.deepEqual(M.orderFromSaved(null, []), []);
});

test('#619-6 서버 왕복: 순위 y는 검증(boardLayoutOf)을 그대로 통과한다 — 서버·DB 변경 없음', async () => {
  const { validateState } = await import('../src/domain.js');
  const state = {
    version: 1, prefs: {},
    trees: [{
      id: 't1', subject: '대상', title: '트리', createdAt: '2026-11-14T00:00:00Z', updatedAt: '2026-11-14T00:00:00Z',
      coverMomentId: '', coverDesign: '', inbox: false,
      moments: [
        { id: 'm0', parentId: null, links: [], createdAt: '2026-11-14T00:00:00Z', title: '첫', note: '메모', emotion: '설렘', date: '2026-11-14', y: -10000 + 1, x: 150 },
        { id: 'm1', parentId: 'm0', links: [], createdAt: '2026-11-14T00:00:00Z', title: '둘', note: '메모', emotion: '설렘', date: '2026-11-13', y: -10000 + 0, x: 150 }
      ]
    }]
  };
  const out = validateState(state);
  const byId = new Map(out.trees[0].moments.map((m) => [m.id, m]));
  assert.equal(byId.get('m0').y, -9999, '순위 y가 그대로 남는다');
  assert.equal(byId.get('m1').y, -10000);
  assert.deepEqual(M.orderOfMoments(out.trees[0].moments), ['m1', 'm0'], '저장 후에도 순서를 읽는다');
  assert.equal(byId.get('m0').x, 150, 'x(옛 칸 자리)는 지우지 않는다');
});

// === 화면: 순서 저장 트리 + 끼워 넣기 + 옛 x·y 트리 ===
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  const { existsSync } = await import('node:fs');
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 순서 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 순서 시험을 건너뜀'; }

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
    const body = file.startsWith(ROOT) ? await readFile(file).catch(() => null) : null;
    if (!body) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

const starTree = (n, { old = false, mixed = false } = {}) => {
  const moments = Array.from({ length: n }, (_, i) => ({
    id: 's' + i, title: '모은 순간 ' + (i + 1), date: '2026-0' + ((i % 9) + 1) + '-1' + (i % 9), emotion: '설렘', note: '메모 ' + (i + 1),
    parentId: i ? 's0' : null, relation: '',
    url: i ? (mixed && i % 2 === 0 ? 'https://www.youtube.com/shorts/dQw4w9WgXcQ' : 'https://youtu.be/dQw4w9WgXcQ') : '',
    keywords: [], color: 'violet',
    ...(old ? { x: 173.5 + i * 37.13, y: 218.7 + (i % 7) * 53.9, rot: (i % 5) - 2 } : { x: null, y: null, rot: 0 })
  }));
  const edges = [];
  for (let i = 1; i < n; i++) edges.push({ id: 'e' + i, kind: 'parent', from: 's0', to: 's' + i, reason: '' });
  return { id: 'star' + n + (old ? 'old' : ''), title: '모아둔 ' + n, moments, edges };
};
const hostHTML = (tree) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>보드 호스트</title></head><body data-member="in" data-record-source="server">
<script>window.LT41={source:'server',writable:true,owned:true,momentId:${JSON.stringify(tree.moments[0].id)},prefs:{},tree:${JSON.stringify(tree)}};window.LT41_MESSAGES=[];addEventListener('message',(e)=>{if(e.data&&e.data.type)window.LT41_MESSAGES.push({type:e.data.type,momentId:e.data.momentId,treeId:e.data.treeId,moments:e.data.moments})});</script>
<iframe src="/v41/views/track58-pinboard.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;
const hostHTMLWithSaveReplies = (tree, { saveOk = true } = {}) =>
  hostHTML(tree).replace(
    '</script>\n<iframe',
    `window.LT41_SAVE_OK=${JSON.stringify(saveOk)};window.LT41_SAVES=[];addEventListener('message',(e)=>{if(e.data?.type!=='lt41-board-sync')return;const moments=Array.isArray(e.data.moments)?e.data.moments:[];window.LT41_SAVES.push(moments.map(m=>({...m})));if(window.LT41_SAVE_OK)window.LT41_REMOTE_ORDER=moments.map(m=>({id:m.id,x:m.x,y:m.y}));e.source?.postMessage({type:'lt41-board-saved',ok:window.LT41_SAVE_OK,error:window.LT41_SAVE_OK?undefined:'저장할 수 없어요.',requestId:e.data.requestId},location.origin);});</script>\n<iframe`
  );

const YT_THUMB_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="1600" height="1200" fill="#8a7a92"/><path d="M700 350 L700 850 L1050 600 Z" fill="#fff"/></svg>';

async function openHost(browser, url, { width, height, touch = false }) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: 'reduce',
    ...(touch ? { hasTouch: true, isMobile: true } : {})
  });
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

const geometry = (frame) => frame.evaluate(() => {
  const cards = [...document.querySelectorAll('#cardLayer .card')].map((c) => ({ id: c.dataset.id, x: c.offsetLeft, y: c.offsetTop, w: c.offsetWidth, h: c.offsetHeight }));
  let pairs = 0;
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const a = cards[i], b = cards[j];
    if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2) pairs++;
  }
  return { cards, pairs, cols: [...new Set(cards.map((c) => c.x))].length };
});

test('#619-6 화면: 순서로 저장된 트리는 그 순서대로 보이고, 끌면 그 자리에 끼어든다', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  // 순서가 날짜순과 다르게 저장된 트리(rank = 뒤집힌 순서). 처음엔 '날짜순'이라 날짜순으로 보인다.
  const tree = starTree(8);
  tree.moments.forEach((m, i) => { m.y = -10000 + (8 - 1 - i); m.x = 150; });
  const server = await serve({ '/__host-order.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page, frame, problems } = await openHost(browser, `${base}/__host-order.html`, { width: 1440, height: 900 });
    // '내 배치'를 열면 저장된 순서가 그대로 보인다 — 순서 맨 앞(s7)이 왼쪽 위.
    await frame.evaluate(() => document.querySelector('[data-board-mode="mine"]').click());
    await page.waitForTimeout(900);
    const g0 = await geometry(frame);
    const firstByPos = [...g0.cards].sort((a, b) => a.y - b.y || a.x - b.x)[0]?.id;
    assert.equal(firstByPos, 's7', '맨 위 왼쪽 카드는 저장 순서의 첫 장(날짜순이 아니다)');
    assert.equal(g0.pairs, 0, '겹침 없음');
    // 순서 5번(s2)을 순서 2번(s5) 뒤로 끌어 끼운다.
    const grab = await frame.evaluate(() => {
      const el = document.querySelector('[data-id="s2"]');
      const r = el.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, onButton: !!document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('button') };
    });
    assert.equal(grab.onButton, false, '카드 가운데는 끌 수 있다');
    const target = await frame.evaluate(() => {
      const el = document.querySelector('[data-id="s5"]');
      const r = el.getBoundingClientRect(), z = r.width / (el.offsetWidth || 1);
      // s5의 월드 중심에서 200px 오른쪽 — 끼워 넣기 판정의 '뒤'.
      return { x: r.left + r.width / 2 + 200 * z, y: r.top + r.height / 2 };
    });
    await page.mouse.move(grab.cx, grab.cy);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(1000);
    const sync = await page.evaluate(() => window.LT41_MESSAGES.filter((m) => m.type === 'lt41-board-sync').at(-1));
    assert.ok(sync?.moments, '저장 메시지가 간다');
    const sent = new Map(sync.moments.map((m) => [m.id, m.y]));
    for (const [id, y] of sent) assert.ok(M.isOrderY(y), `보내는 y가 순서 값이다(${id}=${y})`);
    const ranks = [...new Set(sync.moments.map((m) => m.y))].sort((a, b) => a - b);
    assert.deepEqual(ranks, Array.from({ length: 8 }, (_, i) => -10000 + i), '순위가 0부터 끊김 없이 간다');
    assert.equal(sent.get('s2'), -10000 + 3, '끈 카드는 s5 바로 뒤(순위 3)로 끼어든다');
    // 삽입점 앞사용자(s6, 순위1)는 그대로, بین(insert) 뒤(s4)는 한 칸 밀린다.
    assert.equal(sent.get('s6'), -10000 + 1, '삽입점 앞 사용자는 그대로');
    assert.equal(sent.get('s4'), -10000 + 4, '삽입점 뒤 사용자는 한 칸 밀린다');
    const g1 = await geometry(frame);
    assert.equal(g1.pairs, 0, '끼운 뒤에도 겹침 0');
    // 폭을 바꾸면 순서도 그대로다(390에서 다시 열면 순서 첫 장이 맨 위).
    await context.close();
    const narrow = await openHost(browser, `${base}/__host-order.html`, { width: 390, height: 844 });
    const n1 = await geometry(narrow.frame);
    const topAt390 = [...n1.cards].sort((a, b) => a.y - b.y)[0]?.id;
    assert.equal(topAt390, 's7', '390에서도 맨 위는 저장 순서의 첫 장(폭이 바뀌어도 순서는 같다)');
    await narrow.context.close();
    assert.equal(problems.length, 0, `화면 문제 없음 (${problems.join(' | ') || '없음'})`);
  } finally { await browser.close(); server.close(); }
});

test('#619-6 화면: 옛 x·y만 있는 트리도 내 배치에서 세로 한 줄이 되지 않는다', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = starTree(26, { old: true, mixed: true });
  const server = await serve({ '/__host-legacy.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page, frame, problems } = await openHost(browser, `${base}/__host-legacy.html`, { width: 1440, height: 900 });
    await frame.evaluate(() => document.querySelector('[data-board-mode="mine"]').click());
    await page.waitForTimeout(900);
    const g = await geometry(frame);
    assert.ok(g.cols >= 3, `열이 여러 개다(${g.cols}열) — 세로 한 줄이 아니다`);
    assert.equal(g.pairs, 0, '겹침 없음');
    assert.equal(problems.length, 0, `화면 문제 없음 (${problems.join(' | ') || '없음'})`);
    await context.close();
  } finally { await browser.close(); server.close(); }
});

test('#619-6 문서: updates.json 다음 버전(4.1.4)에 끼워 넣기 한 줄이 team 출처로 있다', () => {
  const updates = JSON.parse(fs.readFileSync(new URL('../public/v41/updates.json', import.meta.url), 'utf8'));
  const next = updates.find((e) => e.version === '4.1.4');
  assert.ok(next, '다음 버전 항목이 있다');
  assert.ok(next.items.some((i) => /끼워|사이/.test(i.text) && i.source === 'team'), '끼워 넣기 한 줄이 team 출처로 있다');
});

test('#1072 A-17 화면: 카드 앞으로·뒤로 단추로 순서를 바꾸고 초점이 단추에 남는다', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  // 날짜순(초기 순서): s7→s0. s5(순위 2)의 '앞으로'를 누르면 s6(순위 1)과 자리를 바꾼다.
  const tree = starTree(8);
  const server = await serve({ '/__host-order-btn.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page, frame, problems } = await openHost(browser, `${base}/__host-order-btn.html`, { width: 1440, height: 900 });
    await frame.evaluate(() => document.querySelector('[data-board-mode="mine"]').click());
    await page.waitForTimeout(900);
    // 단추가 카드마다 있고, 이름은 카드 제목과 함께 '한 장 앞으로/뒤로'를 말한다.
    const btns = await frame.evaluate(() => [...document.querySelectorAll('.orderBtn')].map((b) => ({ id: b.dataset.orderId, dir: b.dataset.orderDir, label: b.getAttribute('aria-label') })));
    assert.equal(btns.length, 16, '카드 8장에 앞으로·뒤로 단추가 하나씩 있다');
    const s5prev = btns.find((b) => b.id === 's5' && b.dir === 'prev');
    assert.equal(s5prev.label, '모은 순간 6 카드를 한 장 앞으로', `단추 이름에 카드 제목이 들어간다: ${s5prev.label}`);
    // '앞으로'를 누른다 — s5는 한 자리 앞으로(s6와 자리를 바꾼다), 나머지는 그대로다.
    await frame.evaluate(() => document.querySelector('.orderBtn[data-order-id="s5"][data-order-dir="prev"]').click());
    await page.waitForTimeout(900);
    const sync = await page.evaluate(() => window.LT41_MESSAGES.filter((m) => m.type === 'lt41-board-sync').at(-1));
    assert.ok(sync?.moments, '순서 저장 메시지가 간다');
    const rank = new Map(sync.moments.map((m) => [m.id, m.y]));
    assert.equal(rank.get('s5'), -10000 + 1, 's5는 한 자리 앞으로 간다');
    assert.equal(rank.get('s6'), -10000 + 2, '밀린 s6은 한 자리 뒤로 간다');
    assert.equal(rank.get('s7'), -10000 + 0, '맨 앞은 그대로다');
    assert.equal(rank.get('s4'), -10000 + 3, 's4는 그대로다');
    const focus = await frame.evaluate(() => { const a = document.activeElement; return a && a.classList.contains('orderBtn') ? { id: a.dataset.orderId, dir: a.dataset.orderDir } : null; });
    assert.deepEqual(focus, { id: 's5', dir: 'prev' }, '옮긴 뒤에도 같은 단추에 초점이 남아 여러 장을 이어서 옮길 수 있다');
    // '뒤로'를 다시 누르면 원래 자리로 돌아온다(되돌리기와 별개의 자리 이동).
    await frame.evaluate(() => document.querySelector('.orderBtn[data-order-id="s5"][data-order-dir="next"]').click());
    await page.waitForTimeout(900);
    const sync2 = await page.evaluate(() => window.LT41_MESSAGES.filter((m) => m.type === 'lt41-board-sync').at(-1));
    const rank2 = new Map(sync2.moments.map((m) => [m.id, m.y]));
    assert.equal(rank2.get('s5'), -10000 + 2, '뒤로를 누르면 원래 순위로 돌아온다');
    assert.equal(rank2.get('s6'), -10000 + 1, 's6도 원래 순위로 돌아온다');
    const g = await geometry(frame);
    assert.equal(g.pairs, 0, '순서를 옮긴 뒤에도 겹침 0');
    assert.equal(problems.length, 0, `화면 문제 없음 (${problems.join(' | ') || '없음'})`);
    await context.close();
  } finally { await browser.close(); server.close(); }
});

test('#1072 A-17 화면: 공유·예시로 보는 읽기 전용 보드에는 순서 단추가 없다', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = starTree(6);
  const host = hostHTML(tree).replace('writable:true', 'writable:false').replace('owned:true', 'owned:false');
  const server = await serve({ '/__host-order-readonly.html': host });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, frame } = await openHost(browser, `${base}/__host-order-readonly.html`, { width: 1440, height: 900 });
    const count = await frame.evaluate(() => document.querySelectorAll('.orderBtn').length);
    assert.equal(count, 0, '읽기 전용 보드에는 순서 단추를 만들지 않는다');
    await context.close();
  } finally { await browser.close(); server.close(); }
});

test('#1245 화면: 날짜순에서 끌면 내 배치로 바뀌고 점선 칸·카드 이동·되돌리기 저장이 이어진다', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = starTree(8);
  tree.moments.forEach((m, i) => { m.x = 150; m.y = -10000 + i; });
  const initialOrder = M.orderOfMoments(tree.moments);
  const server = await serve({ '/__host-board-drag.html': hostHTMLWithSaveReplies(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page, frame, problems } = await openHost(browser, `${base}/__host-board-drag.html`, { width: 1440, height: 900 });
    const before = await frame.evaluate(() => Object.fromEntries([...document.querySelectorAll('#cardLayer .card')].map((el) => { const r = el.getBoundingClientRect(); return [el.dataset.id, { x: r.x, y: r.y }]; })));
    assert.equal(await frame.locator('[data-board-mode="date"]').getAttribute('aria-pressed'), 'true', '처음은 날짜순이다');
    const dragged = await frame.locator('.card[data-id="s2"]').boundingBox();
    await page.mouse.move(dragged.x + dragged.width / 2, dragged.y + dragged.height / 2);
    await page.mouse.down();
    await page.mouse.move(dragged.x + dragged.width / 2 + 9, dragged.y + dragged.height / 2 + 6);
    await page.waitForTimeout(220);
    assert.equal(await frame.locator('[data-board-mode="mine"]').getAttribute('aria-pressed'), 'true', '4px 넘게 움직이면 내 배치로 바뀐다');
    const target = await frame.locator('.card[data-id="s7"]').boundingBox();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
    await page.waitForTimeout(250);
    const preview = await frame.evaluate((old) => {
      const dragged = document.querySelector('.card.dragLift');
      const placeholder = document.querySelector('.boardDropPlaceholder');
      const moved = [...document.querySelectorAll('#cardLayer .card')].filter((el) => {
        if (el === dragged) return false;
        const r = el.getBoundingClientRect();
        const was = old[el.dataset.id];
        return Math.abs(r.x - was.x) > 8 || Math.abs(r.y - was.y) > 8;
      }).length;
      return {
        count: document.querySelectorAll('.boardDropPlaceholder').length,
        border: placeholder && getComputedStyle(placeholder).borderTopStyle,
        size: placeholder && { w: placeholder.offsetWidth, h: placeholder.offsetHeight },
        draggedSize: dragged && { w: dragged.offsetWidth, h: dragged.offsetHeight },
        duration: (() => { const moving = document.querySelector('.card.shiftPreview:not(.dragLift)'); return moving && getComputedStyle(moving).transitionDuration; })(),
        moved
      };
    }, before);
    assert.equal(preview.count, 1, '끄는 동안 빈 칸은 하나다');
    assert.equal(preview.border, 'dashed', '빈 칸 테두리는 점선이다');
    assert.deepEqual(preview.size, preview.draggedSize, '빈 칸 크기는 끄는 카드와 같다');
    assert.match(preview.duration, /0\.2s/, '다른 카드는 약 200ms에 걸쳐 움직인다');
    assert.ok(preview.moved > 0, '끄는 동안 다른 카드 위치가 바뀐다');
    await page.mouse.up();
    await frame.locator('.boardOrderUndo').waitFor({ state: 'visible', timeout: 5000 });
    const saved = await page.evaluate(() => window.LT41_SAVES[0]);
    assert.ok(saved, '놓은 순서가 저장 호출에 실린다');
    assert.notDeepEqual(M.orderOfMoments(saved), initialOrder, '놓은 뒤 저장 순서가 달라진다');
    assert.match(await frame.locator('#toast').innerText(), /배치를 저장했어요/);
    assert.equal(await frame.locator('.boardOrderUndo').innerText(), '되돌리기');
    await frame.locator('.boardOrderUndo').click();
    await page.waitForFunction(() => window.LT41_SAVES.length === 2, undefined, { timeout: 5000 });
    const restored = await page.evaluate(() => window.LT41_SAVES[1]);
    assert.deepEqual(M.orderOfMoments(restored), initialOrder, '되돌리기가 이전 순서를 복원한다');
    assert.equal((await page.evaluate(() => window.LT41_SAVES.length)), 2, '되돌리기도 저장 호출을 한 번 보낸다');
    assert.equal(problems.length, 0, `화면 오류 없음 (${problems.join(' | ') || '없음'})`);
    await context.close();
  } finally { await browser.close(); server.close(); }
});

test('#1245 처음대로: 확인 한 번 뒤 순서 값이 비워지고 날짜순으로 돌아간다', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = starTree(8);
  tree.moments.forEach((m, i) => { m.x = 150; m.y = -10000 + i; });
  const server = await serve({ '/__host-board-reset.html': hostHTMLWithSaveReplies(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page, frame } = await openHost(browser, `${base}/__host-board-reset.html`, { width: 1440, height: 900 });
    let confirmations = 0;
    page.on('dialog', async (dialog) => { confirmations++; await dialog.accept(); });
    await frame.locator('#boardResetOrderBtn').click();
    await page.waitForFunction(() => window.LT41_SAVES.length === 1);
    const saved = await page.evaluate(() => window.LT41_SAVES[0]);
    assert.equal(confirmations, 1, '처음대로는 확인을 한 번 받는다');
    assert.equal(M.orderOfMoments(saved), null, '저장 문서에 순서 값이 남지 않는다');
    assert.ok(saved.every((m) => m.x === null && m.y === null), '기존 칸 위치도 함께 정리한다');
    assert.equal(await frame.locator('[data-board-mode="date"]').getAttribute('aria-pressed'), 'true', '날짜순으로 돌아간다');
    const top = await frame.evaluate(() => [...document.querySelectorAll('#cardLayer .card')].map((el) => ({ id: el.dataset.id, y: el.offsetTop, x: el.offsetLeft })).sort((a, b) => a.y - b.y || a.x - b.x)[0]?.id);
    assert.equal(top, 's7', '날짜순의 최신 카드가 먼저 보인다');
    await context.close();
  } finally { await browser.close(); server.close(); }
});

test('#1245 저장 실패: 끌기 전 자리로 돌아가고 실패 안내를 보인다', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = starTree(8);
  tree.moments.forEach((m, i) => { m.x = 150; m.y = -10000 + i; });
  const server = await serve({ '/__host-board-fail.html': hostHTMLWithSaveReplies(tree, { saveOk: false }) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page, frame } = await openHost(browser, `${base}/__host-board-fail.html`, { width: 1440, height: 900 });
    const before = await frame.evaluate(() => Object.fromEntries([...document.querySelectorAll('#cardLayer .card')].map((el) => { const r = el.getBoundingClientRect(); return [el.dataset.id, { x: r.x, y: r.y }]; })));
    const dragged = await frame.locator('.card[data-id="s2"]').boundingBox();
    await page.mouse.move(dragged.x + dragged.width / 2, dragged.y + dragged.height / 2);
    await page.mouse.down();
    await page.mouse.move(dragged.x + dragged.width / 2 + 9, dragged.y + dragged.height / 2 + 6);
    await page.waitForTimeout(220);
    const target = await frame.locator('.card[data-id="s7"]').boundingBox();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
    await page.waitForTimeout(250);
    await page.mouse.up();
    await frame.locator('#saveFail.show').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(250);
    const restored = await frame.evaluate(() => ({
      mode: document.querySelector('[data-board-mode="date"]').getAttribute('aria-pressed'),
      positions: Object.fromEntries([...document.querySelectorAll('#cardLayer .card')].map((el) => { const r = el.getBoundingClientRect(); return [el.dataset.id, { x: r.x, y: r.y }]; }))
    }));
    assert.equal(restored.mode, 'true', '실패하면 시작한 날짜순으로 돌아간다');
    for (const [id, pos] of Object.entries(before)) {
      assert.ok(Math.abs(restored.positions[id].x - pos.x) <= 2, `${id}의 가로 자리를 되돌린다`);
      assert.ok(Math.abs(restored.positions[id].y - pos.y) <= 2, `${id}의 세로 자리를 되돌린다`);
    }
    assert.match(await frame.locator('#saveFail').innerText(), /배치를 저장하지 못했어요/);
    assert.equal(await frame.locator('.boardOrderUndo').count(), 0, '실패 때 되돌리기 단추는 띄우지 않는다');
    await context.close();
  } finally { await browser.close(); server.close(); }
});

test('#1245 390px 손가락: 짧게 누르면 순간을 열고 끌면 빈 칸·저장·되돌리기가 같다', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = starTree(8);
  tree.moments.forEach((m, i) => { m.x = 150; m.y = -10000 + i; });
  const initialOrder = M.orderOfMoments(tree.moments);
  const server = await serve({ '/__host-board-touch.html': hostHTMLWithSaveReplies(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page, frame, problems } = await openHost(browser, `${base}/__host-board-touch.html`, { width: 390, height: 844, touch: true });
    const tap = await frame.evaluate(() => {
      const el = [...document.querySelectorAll('#cardLayer .card')].find((card) => { const r = card.getBoundingClientRect(); return r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight; });
      const r = el.getBoundingClientRect();
      return { id: el.dataset.id, x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.touchscreen.tap(tap.x, tap.y);
    await frame.locator('#detail.open').waitFor({ state: 'visible', timeout: 3000 });
    await frame.locator('#detailClose').click();
    await page.waitForTimeout(350);
    await frame.evaluate(() => {
      window.__pointerTrace = [];
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'])
        document.addEventListener(type, (event) => window.__pointerTrace.push({ type, pointerType: event.pointerType, x: event.clientX, y: event.clientY, id: event.target?.dataset?.id || '' }), true);
    });
    const visible = await frame.evaluate(() => [...document.querySelectorAll('#cardLayer .card')].map((el) => { const r = el.getBoundingClientRect(); return { id: el.dataset.id, x: r.x, y: r.y, w: r.width, h: r.height, visible: r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight }; }).filter((item) => item.visible));
    const dragged = visible.find((item) => item.id === tap.id) || visible[0];
    const target = visible.find((item) => item.id !== dragged.id);
    const cdp = await context.newCDPSession(page);
    const point = (x, y) => ({ id: 1, x, y, radiusX: 2, radiusY: 2, force: 1, rotationAngle: 0 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(dragged.x + dragged.w / 2, dragged.y + dragged.h / 2)] });
    await page.waitForTimeout(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(dragged.x + dragged.w / 2 + 10, dragged.y + dragged.h / 2 + 5)] });
    await page.waitForTimeout(220);
    const touchState = await frame.evaluate(() => ({
      mode: document.querySelector('[data-board-mode="mine"]').getAttribute('aria-pressed'),
      trace: window.__pointerTrace
    }));
    assert.equal(touchState.mode, 'true', `손가락 끌기도 내 배치로 바뀐다 ${JSON.stringify(touchState)}`);
    assert.ok(touchState.trace.some((event) => event.type === 'pointerdown' && event.pointerType === 'touch'), '손가락 포인터 입력이 전달된다');
    const targetBox = await frame.locator(`.card[data-id="${target.id}"]`).boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2)] });
    await page.waitForTimeout(250);
    const preview = await frame.evaluate(() => {
      const placeholder = document.querySelector('.boardDropPlaceholder');
      return {
        count: document.querySelectorAll('.boardDropPlaceholder').length,
        dashed: placeholder && getComputedStyle(placeholder).borderTopStyle === 'dashed',
        duration: (() => { const moving = document.querySelector('.card.shiftPreview:not(.dragLift)'); return moving && getComputedStyle(moving).transitionDuration; })(),
        moved: [...document.querySelectorAll('#cardLayer .card.shiftPreview')].length
      };
    });
    assert.equal(preview.count, 1, '손가락 끄는 동안 빈 칸 하나가 보인다');
    assert.equal(preview.dashed, true, '빈 칸은 점선이다');
    assert.match(preview.duration, /0\.2s/, '390px에서도 다른 카드는 약 200ms에 걸쳐 움직인다');
    assert.ok(preview.moved > 0, '다른 카드가 움직인다');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await frame.locator('.boardOrderUndo').waitFor({ state: 'visible', timeout: 5000 });
    assert.equal((await page.evaluate(() => window.LT41_SAVES.length)), 1, '손가락으로 놓은 배치를 저장한다');
    await frame.locator('.boardOrderUndo').click();
    await page.waitForFunction(() => window.LT41_SAVES.length === 2, undefined, { timeout: 5000 });
    const restored = await page.evaluate(() => window.LT41_SAVES[1]);
    assert.deepEqual(M.orderOfMoments(restored), initialOrder, '손가락 끌기도 이전 순서로 되돌린다');
    assert.equal(problems.length, 0, `화면 오류 없음 (${problems.join(' | ') || '없음'})`);
    await context.close();
  } finally { await browser.close(); server.close(); }
});
