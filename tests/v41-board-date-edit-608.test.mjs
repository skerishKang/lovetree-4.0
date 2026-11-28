import { listenOnSafePort } from './helpers/safe-port.mjs';
// #608: 보드 순간 수정 창에서도 날짜를 바꿀 수 있어야 한다 — 책의 '수정'과 같은 경로·같은 규칙.
// - 보드 수정 창은 날짜를 고정 글씨('DATE · …')로 보여주지 않고 책처럼 <input type="date">로 바꿔 준다.
// - 저장은 책의 editMoment가 쓰는 validateMomentInput 규칙(YYYY-MM-DD + 실제 날짜)과 같은 규칙으로 미리 걷고,
//   도메인은 저장 때 boardSync→validateState에서 같은 규칙으로 거른다.
// - 날짜가 바뀌면 '날짜순' 바둑판 자리를 새 날짜에 맞게 다시 꽂는다(#582). '내 배치'의 저장 자리는 그대로 둔다(#395).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMemberSession } from '../public/v41/member-session.mjs';
import { validateState } from '../public/v41/domain.mjs';
import { evaluateWhenReady } from './helpers/visible-frame.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUB = path.join(ROOT, 'public');
const TEST_PORT = Number(process.env.LT_BOARD_608_PORT || 0);

let chromium, skip = false;
// CI(미리보기 검사)에서는 LT_BOARD_608_REQUIRE=1 — 크롬이 준비된 잡에서 건너뜀을 실패로 본다.
const REQUIRE = process.env.LT_BOARD_608_REQUIRE === '1';
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 보드 날짜 수정 화면 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 보드 날짜 수정 화면 시험을 건너뜀'; }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

const chainTree = (n) => {
  const moments = Array.from({ length: n }, (_, i) => ({
    id: 'm' + (i + 1), title: '순간 ' + (i + 1), date: '2026-01-0' + (i + 1), emotion: '설렘', note: '메모',
    parentId: i ? 'm' + i : null, relation: i ? '이어서' : '', url: '', x: null, y: null, rot: 0, color: 'rose', keywords: [],
    createdAt: `2026-01-0${i + 1}T00:00:00.000Z`
  }));
  const edges = [];
  for (let i = 2; i <= n; i++) edges.push({ id: 'e' + i, kind: 'parent', from: 'm' + (i - 1), to: 'm' + i, reason: '이어서' });
  return { id: 't' + n, subject: '시험 사용자', title: '사슬 ' + n, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: `2026-01-0${n}T00:00:00.000Z`, moments, edges };
};

function serve(extra = {}) {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    if (extra[clean]) { res.writeHead(200, { 'content-type': MIME['.html'] }); res.end(extra[clean]); return; }
    for (const file of [path.join(PUB, clean), path.join(PUB, clean, 'index.html')]) {
      if (path.relative(PUB, file).startsWith('..')) continue;
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

async function openShellEditHost(browser, base, tree, { width = 1440, height = 900 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  await context.addInitScript(treeId => {
    localStorage.setItem('lt41.tips.firstTree', '1');
    localStorage.setItem('lt41.discoverAsked', JSON.stringify([treeId]));
    localStorage.setItem('lt41.advanced.member-A', '1');
  }, tree.id);
  const page = await context.newPage();
  page.on('dialog', dialog => dialog.accept());
  const problems = [];
  page.on('pageerror', error => problems.push(String(error.message || error)));
  page.on('console', message => { if (message.type() === 'error') problems.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`); });
  let state = { version: 1, prefs: {}, trees: [{ ...structuredClone(tree), openView: 'board' }] };
  let revision = 1;
  const puts = [];
  await context.route('**/api/account*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await context.route('**/api/youtube/oembed*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"title":"가짜 영상"}' }));
  await context.route('**/i.ytimg.com/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#765"/></svg>' }));
  await context.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
  await context.route('**/v41/home.html*', async route => route.fulfill({ response: await route.fetch({ url: `${base}/v41/` }) }));
  await context.route('**/api/workspace*', route => {
    const request = route.request();
    if (request.method() === 'PUT') {
      const body = JSON.parse(request.postData() || '{}');
      puts.push(body);
      state = structuredClone(body.state);
      revision += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision, subject: 'member-A' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision, subject: 'member-A', writeSubjectBound: true, savedAt: '2026-11-27T00:00:00.000Z', state }) });
  });
  await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
  await page.waitForFunction(treeId => window.LT41?.tree?.id === treeId, tree.id, { timeout: 20000 });
  await page.evaluate(() => document.querySelector('[data-view="track58-pinboard.html"]').click());
  await page.waitForFunction(count => document.querySelector('#view')?.contentDocument?.querySelectorAll('#cardLayer .card').length === count, tree.moments.length, { timeout: 20000 });
  await evaluateWhenReady(page, () => {
    const body = document.querySelector('#view')?.contentDocument?.body;
    if (!body) return false;
    body.classList.add('lt-advanced');
    return true;
  });
  await page.waitForTimeout(500);
  return { context, page, frame: await (await page.$('#view')).contentFrame(), problems, puts, state: () => state };
}

const cardPos = (frame, id) => frame.evaluate((mid) => {
  const el = document.querySelector(`.card[data-id="${mid}"]`);
  return el ? { x: el.offsetLeft, y: el.offsetTop } : null;
}, id);

test('#608 책 경로(editMoment)와 보드 경로(boardSync)가 같은 날짜를 받고, 같은 규칙으로 거른다', async () => {
  let server = { version: 1, trees: [] }, revision = 0;
  const api = {
    get: async () => ({ ok: true, revision, state: server, subject: 'member-A', writeSubjectBound: true }),
    put: async (body) => { server = structuredClone(body.state); return { ok: true, revision: ++revision }; },
    logout: async () => ({ ok: true })
  };
  const session = createMemberSession({ api, delay: () => new Promise(() => {}), makeClientKey: (() => { let i = 0; return () => 'key-' + (++i); })(), onState: () => {} });
  await session.start();
  const root = session.apply('new', { subject: '별', title: '처음', note: '기억할 마음', date: '2026-11-01', emotion: '설렘', url: '' });
  // 책의 '수정' 경로: 날짜를 바꾸면 그 날짜가 그대로 기록된다.
  session.apply('edit', { subject: '별', title: '처음', note: '기억할 마음', date: '2026-11-14', emotion: '설렘', url: '' }, root);
  assert.equal(session.state().trees[0].moments[0].date, '2026-11-14', '책 수정 경로가 바꾼 날짜');
  // 보드 경로: 보드가 보낸 moments(날짜를 바꾼 것)를 boardSync가 validateState로 받아들인다.
  const moments = structuredClone(session.state().trees[0].moments);
  moments[0].date = '2026-12-31';
  session.apply('boardSync', { moments }, root);
  assert.equal(session.state().trees[0].moments[0].date, '2026-12-31', '보드 저장 경로가 바꾼 날짜');
  validateState(session.state());
  // 거르기도 같다: 형식·실제 날짜가 아니면 책·보드 어느 경로로도 저장되지 않는다.
  // (빈 문자열은 도메인이 #547대로 '오늘'로 채우므로 거르지 않는다 — 보드 창은 책의 required 입력처럼 빈 채 저장을 막는다.)
  for (const bad of ['2026-13-40', '2026.11.14', '2026-2-3']) {
    assert.throws(() => session.apply('edit', { subject: '별', title: '처음', note: '기억할 마음', date: bad, emotion: '설렘', url: '' }, root), `책 경로가 잘못된 날짜(${bad})를 거른다`);
    const badMoments = structuredClone(session.state().trees[0].moments);
    badMoments[0].date = bad;
    assert.throws(() => session.apply('boardSync', { moments: badMoments }, root), `보드 경로가 잘못된 날짜(${bad})를 거른다`);
  }
});

test('#608 화면: 날짜를 바꾸면 카드 글·날짜순 자리가 바뀌고, 내 배치 자리는 그대로다', { skip: REQUIRE ? false : skip, timeout: 300000 }, async (t) => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = chainTree(6);
  const server = await serve();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); server.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const { context, page, frame, problems, puts, state } = await openShellEditHost(browser, base, tree);
  // m6(2026-01-06, 가장 최신)이 앉은 첫 칸 자리를 미리 재 둔다.
  const firstSlot = await cardPos(frame, 'm6');
  assert.ok(firstSlot, '최신 카드의 자리를 잰다');
  // 카드를 눌러 상세를 열고 '수정'을 누른다 — 날짜 입력이 오늘 값이 아니라 그 순간의 날짜로 채워진다.
  await frame.click('.card[data-id="m1"]');
  // #891: 수정 단추는 '⋯ 더 보기' 메뉴 안에 있다 — 메뉴를 열고 누른다.
  await frame.click('#detailMoreBtn');
  await frame.waitForSelector('#editMomentBtn', { timeout: 5000 });
  await frame.click('#editMomentBtn');
  await page.waitForSelector('#write-panel[open]', { timeout: 5000 });
  assert.equal(await page.inputValue('#moment-form [name="date"]'), '2026-01-01', '공용 수정 창이 현재 날짜로 시작한다');
  // 날짜를 바꿔 저장한다.
  await page.fill('#moment-form [name="date"]', '2026-12-31');
  await page.locator('#moment-form button[type="submit"]').click();
  await page.waitForFunction(() => !document.getElementById('write-panel').open, null, { timeout: 5000 });
  // 카드 글이 새 날짜로 바뀐다(책과 같은 dateText 규칙).
  const disp = await frame.evaluate(() => (window.LTTitle && window.LTTitle.formatDisplayDate ? window.LTTitle.formatDisplayDate('2026-12-31') : '2026-12-31'));
  await frame.waitForFunction((d) => document.querySelector('.card[data-id="m1"]')?.textContent.includes(d), disp, { timeout: 5000 });
  // '날짜순' 바둑판: 새 날짜가 가장 최신이므로 m1이 첫 칸(옛 m6 자리)으로 옮겨 앉는다.
  await frame.waitForFunction((want) => { const el = document.querySelector('.card[data-id="m1"]'); return el && el.offsetLeft === want.x && el.offsetTop === want.y; }, firstSlot, { timeout: 8000 });
  // 공용 편집기의 PUT: 같은 순간 ID에 바뀐 날짜가 실린다.
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && puts.length === 0) await page.waitForTimeout(100);
  assert.equal(puts.length, 1, '공용 편집 저장이 PUT를 한 번 보낸다');
  const sent = puts[0].state.trees[0].moments.find((m) => m.id === 'm1');
  assert.equal(sent.date, '2026-12-31', '공용 편집기가 보낸 날짜');
  assert.equal(sent.title, '순간 1', '순간 ID·제목은 그대로다');
  await frame.click('#detailClose');
  // '내 배치': 실제 pointer 끌기로 전환·저장하고, 날짜를 다시 바꿔도 그 자리가 유지되는지 본다(#395).
  const dragId = 'm6';
  const from = await frame.evaluate(id => {
    const r = document.querySelector(`.card[data-id="${id}"]`).getBoundingClientRect();
    return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
  }, dragId);
  const frameBox = await page.locator('#view').boundingBox();
  from.x += frameBox.x;
  from.y += frameBox.y;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 200, from.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
  assert.equal(await frame.evaluate(() => document.querySelector('[data-board-mode="mine"]').getAttribute('aria-pressed')), 'true', '끌면 내 배치로 자동 전환한다');
  const orderDeadline = Date.now() + 10000;
  while (Date.now() < orderDeadline && puts.length <= 1) await page.waitForTimeout(100);
  assert.ok(puts.length > 1, '끌기 순서가 저장 경로로 전달된다');
  const dragSync = puts.at(-1).state.trees[0].moments.find(m => m.id === dragId);
  const syncCountBefore = puts.length;
  const minePos = await cardPos(frame, dragId);
  await frame.click(`.card[data-id="${dragId}"]`);
  // #891: 수정 단추는 '⋯ 더 보기' 메뉴 안에 있다 — 메뉴를 열고 누른다.
  await frame.click('#detailMoreBtn');
  await frame.waitForSelector('#editMomentBtn', { timeout: 5000 });
  await frame.click('#editMomentBtn');
  await page.waitForSelector('#write-panel[open]', { timeout: 5000 });
  const dragOldDate = tree.moments.find((m) => m.id === dragId).id === 'm1' ? '2026-12-31' : tree.moments.find((m) => m.id === dragId).date;
  assert.equal(await page.inputValue('#moment-form [name="date"]'), dragOldDate, '두 번째 공용 수정 창도 앞서 저장한 날짜로 시작한다');
  await page.fill('#moment-form [name="date"]', '2026-11-30');
  await page.locator('#moment-form button[type="submit"]').click();
  await page.waitForFunction(() => !document.getElementById('write-panel').open, null, { timeout: 5000 });
  await page.waitForTimeout(800);
  assert.deepEqual(await cardPos(frame, dragId), minePos, "'내 배치'에서는 날짜를 바꿔도 자리가 그대로다");
  const secondDeadline = Date.now() + 8000;
  while (Date.now() < secondDeadline && puts.length <= syncCountBefore) await page.waitForTimeout(100);
  assert.ok(puts.length > syncCountBefore, '두 번째 공용 편집 저장이 PUT를 보낸다');
  const sent2 = puts.at(-1).state.trees[0].moments.find((m) => m.id === dragId);
  assert.equal(sent2.date, '2026-11-30', '두 번째 저장의 날짜');
  assert.deepEqual({ x: sent2.x, y: sent2.y }, { x: dragSync.x, y: dragSync.y }, '끌기로 저장한 자리(x·y)가 공용 편집 뒤에도 유지된다');
  assert.equal(problems.length, 0, `화면 문제 없음 (${problems.join(' | ') || '없음'})`);
  await context.close();
});

test('#736 편집 창은 고정 목록에 없는 꼬리표를 지우지 않는다 — 열고·더하고·지우기', { skip: REQUIRE ? false : skip, timeout: 300000 }, async (t) => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = chainTree(3);
  tree.moments[0].keywords = ['가수:PSY', '첫만남', '노래:Gangnam Style'];
  const server = await serve();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); server.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const { context, page, frame, problems, puts, state } = await openShellEditHost(browser, base, tree);

  const syncCount = () => puts.length;
  const lastKeywords = () => {
    const saved = puts.at(-1)?.state.trees[0].moments.find((x) => x.id === 'm1');
    return saved ? (saved.keywords || []) : null;
  };
  const openEdit = async () => {
    await frame.click('.card[data-id="m1"]');
    await frame.click('#detailMoreBtn');
    await frame.waitForSelector('#editMomentBtn', { timeout: 5000 });
    await frame.click('#editMomentBtn');
    await page.waitForSelector('#write-panel[open]', { timeout: 5000 });
  };
  const saveEdit = async () => {
    await page.locator('#moment-form button[type="submit"]').click();
    await page.waitForFunction(() => !document.getElementById('write-panel').open, null, { timeout: 5000 });
  };

  // ① 공용 편집기를 저장해도 기존 꼬리표를 지우지 않는다.
  await openEdit();
  const before1 = syncCount();
  await saveEdit();
  const firstDeadline = Date.now() + 10000;
  while (Date.now() < firstDeadline && puts.length <= before1) await page.waitForTimeout(100);
  assert.ok(puts.length > before1, '공용 편집 저장이 PUT를 보낸다');
  assert.deepEqual(await lastKeywords(), ['가수:PSY', '첫만남', '노래:Gangnam Style'], '① 저장만 해도 꼬리표가 그대로다');

  await frame.click('.card[data-id="m1"]');
  await frame.waitForSelector('#dTags [data-tag-raw="가수:PSY"]', { timeout: 5000 });
  const chipText = await frame.$eval('#dTags [data-tag-raw="가수:PSY"]', el => el.textContent.trim());
  assert.match(chipText, /가수 · PSY/, '고정 목록에 없는 꼬리표도 종류 · 값으로 보인다');

  // ② 상세의 공용 꼬리표 줄에서 직접 붙이기 → 원래 것 + 새 것.
  await frame.click('#dTags .lt-tagline-toggle');
  await frame.selectOption('#dTags .lt-tagline-kind', '');
  await frame.fill('#dTags .lt-tagline-value', '무대:인기가요 240524');
  const before2 = syncCount();
  await frame.click('#dTags .lt-tagline-add');
  const secondDeadline = Date.now() + 10000;
  while (Date.now() < secondDeadline && puts.length <= before2) await page.waitForTimeout(100);
  assert.ok(puts.length > before2, '꼬리표 붙이기가 PUT를 보낸다');
  assert.deepEqual(await lastKeywords(), ['가수:PSY', '첫만남', '노래:Gangnam Style', '무대:인기가요 240524'], '② 원래 것 + 새 것');

  // ③ 확정 칩을 빼면 그것만 빠지고, 같은 공용 줄에서 다시 붙인다.
  const before3 = syncCount();
  await frame.click('#dTags [data-tag-raw="가수:PSY"]');
  const thirdDeadline = Date.now() + 10000;
  while (Date.now() < thirdDeadline && puts.length <= before3) await page.waitForTimeout(100);
  assert.ok(puts.length > before3, '꼬리표 빼기가 저장을 보낸다');
  assert.deepEqual(await lastKeywords(), ['첫만남', '노래:Gangnam Style', '무대:인기가요 240524'], '③ 직접 지운 것만 빠진다');
  assert.equal(problems.length, 0, `화면 문제 없음 (${problems.join(' | ') || '없음'})`);
  await context.close();
});

// #1044: 보드는 배치·모양·연결·한마디만 바꾼다 — 구간·만든 시각은 기존 값을 지킨다.
const fixedAt = '2026-01-01T00:00:00.000Z';
const segmentTree = () => ({
  id: 'seg1', title: '구간 트리', subject: '별', coverMomentId: '', inbox: false, createdAt: fixedAt, updatedAt: fixedAt,
  moments: [
    { id: 'm1', title: '영상 순간', note: '', date: '2026-01-01', emotion: '설렘', url: 'https://youtu.be/dQw4w9WgXcQ', startSeconds: 90, endSeconds: 120, createdAt: fixedAt, parentId: null, relation: '', links: [], mediaMetadata: { title: '영상 제목' } },
    { id: 'm2', title: '빈 한마디 순간', note: '', date: '2026-01-02', emotion: '설렘', url: '', createdAt: fixedAt, parentId: 'm1', relation: '첫 번째 이유', links: [] },
    { id: 'm3', title: '셋 순간', note: '셋째 마음', date: '2026-01-03', emotion: '설렘', url: '', createdAt: fixedAt, parentId: 'm2', relation: '이어진 이유', links: [] }
  ],
  edges: [
    { id: 'e1', kind: 'parent', from: 'm1', to: 'm2', reason: '첫 번째 이유' },
    { id: 'e2', kind: 'parent', from: 'm2', to: 'm3', reason: '이어진 이유' }
  ]
});

function sessionOn(tree) {
  const state = { version: 1, trees: [structuredClone(tree)], prefs: {} };
  const api = {
    get: async () => ({ ok: true, revision: 1, state, subject: 'member-A', writeSubjectBound: true }),
    put: async (body) => { state.trees = structuredClone(body.state.trees); return { ok: true, revision: 2 }; },
    logout: async () => ({ ok: true })
  };
  return createMemberSession({ api, delay: () => new Promise(() => {}), makeClientKey: (() => { let i = 0; return () => 'key-' + (++i); })() });
}

test('#1044 셸 모델: 보드 저장 뒤 구간·만든 시각·빈 한마디가 그대로다', async () => {
  const tree = segmentTree();
  const session = sessionOn(tree);
  await session.start();
  // 보드가 보내는 목록: 구간 필드가 없고, 만든 시각은 새 값, 한마디는 빈 채.
  const moments = tree.moments.map(m => {
    const copy = structuredClone(m);
    delete copy.startSeconds; delete copy.endSeconds;
    return { ...copy, createdAt: '2026-11-21T12:00:00.000Z' };
  });
  session.apply('boardSync', { moments }, { treeId: tree.id, momentId: 'm1' });
  const saved = session.state().trees[0].moments.find(m => m.id === 'm1');
  assert.equal(saved.startSeconds, 90, '시작 구간 보존');
  assert.equal(saved.endSeconds, 120, '끝 구간 보존');
  assert.equal(saved.createdAt, fixedAt, '만든 시각 보존');
  assert.equal(saved.note, '', '빈 한마디 유지');
  validateState(session.state());
});

test('#1044 화면: 보드에서 저장한 뒤 셸 모델에 구간·만든 시각·빈 한마디가 그대로다', { skip: REQUIRE ? false : skip, timeout: 300000 }, async (t) => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = segmentTree();
  const server = await serve();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); server.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const { context, page, frame, problems, puts } = await openShellEditHost(browser, base, tree);
  // 카드에 보이는 글은 '이어진 이유'여도, 저장할 한마디는 빈 채로 남는다.
  const cardText = await frame.evaluate(() => document.querySelector('.card[data-id="m2"] .noteText')?.textContent || '');
  assert.ok(cardText.includes('이어진 이유'), `빈 한마디 카드에는 연결 이유가 보인다(${cardText})`);
  const before = puts.length;
  await frame.click('.card[data-id="m1"]');
  await frame.click('#detailMoreBtn');
  await frame.waitForSelector('#editMomentBtn', { timeout: 5000 });
  await frame.click('#editMomentBtn');
  await page.waitForSelector('#write-panel[open]', { timeout: 5000 });
  await page.locator('#moment-form button[type="submit"]').click();
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && puts.length <= before) await page.waitForTimeout(100);
  assert.ok(puts.length > before, '공용 편집 저장이 PUT를 보낸다');
  const moments = puts.at(-1).state.trees[0].moments;
  assert.equal(moments.find(m => m.id === 'm1').note, '', '공용 편집기가 보낸 한마디는 빈 채');
  assert.equal(moments.find(m => m.id === 'm2').note, '', '연결 이유가 있는 빈 한마디도 빈 채로 보낸다');
  // 화면이 보낸 목록을 실제 셸 모델에 적용해 최종 저장 값을 확인한다.
  const merged = sessionOn(tree);
  await merged.start();
  merged.apply('boardSync', { moments }, { treeId: tree.id, momentId: 'm1' });
  const saved = merged.state().trees[0].moments.find(m => m.id === 'm1');
  assert.equal(saved.startSeconds, 90, '화면 저장 뒤 시작 구간 보존');
  assert.equal(saved.endSeconds, 120, '화면 저장 뒤 끝 구간 보존');
  assert.equal(saved.createdAt, fixedAt, '화면 저장 뒤 만든 시각 보존');
  assert.equal(saved.note, '', '화면 저장 뒤 빈 한마디 유지');
  assert.deepEqual(problems, [], `화면 문제 없음 (${problems.join(' | ') || '없음'})`);
  await context.close();
});


test('#1434 공용 편집 창에서 카드·핀 모양을 저장하고 사진을 빼며 원래 값으로 돌아간다', {skip: REQUIRE ? false : skip, timeout: 120000}, async t => {
  if (skip) assert.fail(skip);
  const tree = chainTree(2);
  tree.moments[0].cardStyle = 'film';
  tree.moments[0].pinStyle = 'star';
  tree.moments[0].url = 'https://example.test/photo.jpg';
  const server = await serve();
  const browser = await chromium.launch({headless:true});
  t.after(async () => { await browser.close(); server.close(); });
  const {context,page,frame,puts,problems}=await openShellEditHost(browser,'http://127.0.0.1:'+server.address().port,tree);
  const open = async () => {
    await frame.locator('.card[data-id="m1"]').click();
    await frame.locator('#detailMoreBtn').click();
    await frame.locator('#editMomentBtn').click();
    await page.waitForSelector('#write-panel[open]');
  };
  await open();
  assert.equal(await page.inputValue('[name="cardStyle"]'),'film');
  assert.equal(await page.inputValue('[name="pinStyle"]'),'star');
  assert.equal(await page.locator('#editor-photo-clear').isVisible(),true);
  await page.locator('[name="cardStyle"]').selectOption('ticket');
  await page.locator('[name="pinStyle"]').selectOption('heart');
  await page.locator('#editor-photo-clear').click();
  assert.equal(await page.inputValue('#moment-form [name="url"]'),'');
  await page.locator('#editor-restore').click();
  assert.equal(await page.inputValue('[name="cardStyle"]'),'film');
  assert.equal(await page.inputValue('[name="pinStyle"]'),'star');
  assert.equal(await page.inputValue('#moment-form [name="url"]'),'https://example.test/photo.jpg');
  await page.locator('[name="cardStyle"]').selectOption('ticket');
  await page.locator('[name="pinStyle"]').selectOption('heart');
  await page.locator('#editor-photo-clear').click();
  await page.locator('#moment-form button[type="submit"]').click();
  await page.waitForFunction(()=>!document.querySelector('#write-panel')?.open);
  const deadline=Date.now()+10000;
  while(Date.now()<deadline&&!puts.length)await page.waitForTimeout(100);
  const last=puts.at(-1)?.state?.trees?.[0]?.moments?.find(m=>m.id==='m1');
  assert.ok(last,'저장 요청');
  assert.equal(last.cardStyle,'ticket');
  assert.equal(last.pinStyle,'heart');
  assert.equal(last.url,'');
  assert.deepEqual(problems,[]);
  await context.close();
});
