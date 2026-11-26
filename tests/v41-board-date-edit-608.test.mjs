import { listenOnSafePort } from './helpers/safe-port.mjs';
// #608: 보드 순간 수정 창에서도 날짜를 바꿀 수 있어야 한다 — 책의 '수정'과 같은 경로·같은 규칙.
// - 보드 수정 창은 날짜를 고정 글씨('DATE · …')로 보여주지 않고 책처럼 <input type="date">로 바꿔 준다.
// - 저장은 책의 editMoment가 쓰는 validateMomentInput 규칙(YYYY-MM-DD + 실제 날짜)과 같은 규칙으로 미리 걷고,
//   도메인은 저장 때 boardSync→validateState에서 같은 규칙으로 거른다.
// - 날짜가 바뀌면 '날짜순' 바둑판 자리를 새 날짜에 맞게 다시 꽂는다(#582). '내 배치'의 저장 자리는 그대로 둔다(#395).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, readFileSync, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMemberSession } from '../public/v41/member-session.mjs';
import { validateState } from '../public/v41/domain.mjs';
await import('../public/v41/views/board/viewer-meta.js');

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUB = path.join(ROOT, 'public');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

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
    parentId: i ? 'm' + i : null, relation: i ? '이어서' : '', url: '', x: null, y: null, rot: 0, color: 'rose', keywords: []
  }));
  const edges = [];
  for (let i = 2; i <= n; i++) edges.push({ id: 'e' + i, kind: 'parent', from: 'm' + (i - 1), to: 'm' + i, reason: '이어서' });
  return { id: 't' + n, title: '사슬 ' + n, moments, edges };
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
  return listenOnSafePort(server, '127.0.0.1').then(() => server);
}

// 내 기록 보드 호스트: 셸처럼 data-member="in"을 본문에 남기고, 보드가 보낸 lt41-board-sync를 통째로 기록한다.
const hostHTML = (tree) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>보드 호스트</title></head><body data-member="in" data-record-source="server">
<script>window.LT41={source:'server',writable:true,owned:true,momentId:${JSON.stringify(tree.moments[0].id)},prefs:{},tree:${JSON.stringify(tree)}};window.LT41_MESSAGES=[];addEventListener('message',(e)=>{if(e.data&&e.data.type==='lt41-board-sync')window.LT41_MESSAGES.push({type:e.data.type,moments:JSON.parse(JSON.stringify(e.data.moments||[]))})});</script>
<iframe src="/v41/views/track58-pinboard.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;

async function openHost(browser, url, { width = 1440, height = 900 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
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
    await frame.waitForSelector('.surface', { timeout: 20000 });
    await frame.waitForFunction(() => document.querySelectorAll('#cardLayer .card').length > 0, null, { timeout: 20000 });
  } catch (e) {
    throw new Error(`보드 화면이 열리지 않았다(${width}×${height}): ${String(e).slice(0, 200)} / 화면 문제: ${problems.join(' | ') || '없음'}`);
  }
  await page.waitForTimeout(600);
  // 보드의 '수정' 단추는 고급 모드(body.lt-advanced)에서만 보인다 — 셸이 lt41-advanced 메시지로 켜는 판을 그대로 켠다.
  await frame.evaluate(() => document.body.classList.add('lt-advanced'));
  return { context, page, frame, problems };
}

const cardPos = (frame, id) => frame.evaluate((mid) => {
  const el = document.querySelector(`.card[data-id="${mid}"]`);
  return el ? { x: el.offsetLeft, y: el.offsetTop } : null;
}, id);

test('#608 보드 수정 창에 날짜 입력이 있고, 책과 같은 규칙으로 저장한다', () => {
  // 보드의 수정 창은 board-detail.js가 board-extras.js의 정의를 덮어 쓴 오버레이가 산다 — 실제로 살아 있는 쪽을 본다.
  const detail = read('public/v41/views/board/board-detail.js');
  assert.match(detail, /openEdit=function\(\)/, 'board-detail.js가 살아 있는 openEdit을 내놓는다');
  // 고정 글씨('DATE · …')는 없앴다 — 책처럼 <input type="date">로 바꾼다.
  assert.doesNotMatch(detail, /DATE · \$\{esc\(m\.date\)\}/, '고정 날짜 글씨 흔적');
  assert.match(detail, /<input class="field" id="editDate" type="date" value="\$\{esc\(m\.date\|\|''\)\}"/, '날짜 입력이 있다');
  // 미리 보기·저장이 같은 입력을 읽는다.
  assert.match(detail, /date:\$\('#editDate'\)\?\$\('#editDate'\)\.value:m\.date/, 'editPreviewState가 날짜 입력을 읽는다');
  // 저장 규칙은 책의 editMoment(validateMomentInput)와 같다: YYYY-MM-DD + 실제 날짜(toISOString 왕복).
  assert.match(detail, /\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(_d\)/, 'YYYY-MM-DD 형식 검사');
  assert.match(detail, /new Date\(_d\)\.toISOString\(\)\.slice\(0,10\)!==_d/, '실제 날짜 검사(왕복)');
  assert.match(detail, /toast\('날짜를 확인해 주세요\.'\)/, '말투도 도메인과 같다');
  // 날짜가 바뀌면 '날짜순' 자리를 다시 꽂는다. '내 배치'의 저장 자리는 placeAll이 건드리지 않는다(#395).
  assert.match(detail, /if\(editBase&&m\.date!==editBase\.date\)placeAll\(\)/, '날짜 변화 때 다시 꽂기');
  const board = read('public/v41/views/board/board.js');
  // #619-6: 내 배치는 저장 자리가 아니라 저장된 순서를 유지한다(순서대로 다시 쌓는다).
  assert.match(board, /boardMode\s*===\s*'date'\s*\?\s*LT58Model\.dateDescOrder\(moments\)\s*:\s*momentOrder/, "내 배치는 저장 순서를 유지한다");
  // 순간 신원은 그대로다 — 관계도 시절의 invariant에서 날짜만 뺀다(id·privacy·x·y·rot·first·createdOrder 유지).
  assert.match(detail, /invariant=\{id:m\.id,privacy:m\.privacy/, '신원 보존은 유지한다');
  assert.doesNotMatch(detail, /date:m\.date,privacy:m\.privacy/, '날짜는 더 이상 고정하지 않는다');
  // 어두운 창에서 달력 아이콘도 보이게 한다.
  assert.match(read('public/v41/views/board/board.css'), /#editDate\{color-scheme:dark\}/);
});

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
  const server = await serve({ '/host.html': hostHTML(tree) });
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); server.close(); });
  const { context, page, frame, problems } = await openHost(browser, 'http://127.0.0.1:' + server.address().port + '/host.html');
  // m6(2026-01-06, 가장 최신)이 앉은 첫 칸 자리를 미리 재 둔다.
  const firstSlot = await cardPos(frame, 'm6');
  assert.ok(firstSlot, '최신 카드의 자리를 잰다');
  // 카드를 눌러 상세를 열고 '수정'을 누른다 — 날짜 입력이 오늘 값이 아니라 그 순간의 날짜로 채워진다.
  await frame.click('.card[data-id="m1"]');
  // #891: 수정 단추는 '⋯ 더 보기' 메뉴 안에 있다 — 메뉴를 열고 누른다.
  await frame.click('#detailMoreBtn');
  await frame.waitForSelector('#editMomentBtn', { timeout: 5000 });
  await frame.click('#editMomentBtn');
  await frame.waitForSelector('#editModal.open', { timeout: 5000 });
  assert.equal(await frame.$eval('#editDate', (el) => el.value), '2026-01-01', '수정 창이 현재 날짜로 시작한다');
  // 날짜를 바꿔 저장한다.
  await frame.fill('#editDate', '2026-12-31');
  await frame.click('#editSave');
  await frame.waitForFunction(() => !document.querySelector('#editModal').classList.contains('open'), null, { timeout: 5000 });
  // 카드 글이 새 날짜로 바뀐다(책과 같은 dateText 규칙).
  const disp = await frame.evaluate(() => (window.LTTitle && window.LTTitle.formatDisplayDate ? window.LTTitle.formatDisplayDate('2026-12-31') : '2026-12-31'));
  await frame.waitForFunction((d) => document.querySelector('.card[data-id="m1"]')?.textContent.includes(d), disp, { timeout: 5000 });
  // '날짜순' 바둑판: 새 날짜가 가장 최신이므로 m1이 첫 칸(옛 m6 자리)으로 옮겨 앉는다.
  await frame.waitForFunction((want) => { const el = document.querySelector('.card[data-id="m1"]'); return el && el.offsetLeft === want.x && el.offsetTop === want.y; }, firstSlot, { timeout: 8000 });
  // 저장 메시지: 같은 순간 ID에 바뀐 날짜가 실린다 — 책이 이 값을 받아 같은 날짜로 보인다(위 도메인 시험).
  // 위치 갱신이 persistBoard보다 먼저 보일 수 있으므로 메시지 도착을 기다린다.
  await page.waitForFunction(() => window.LT41_MESSAGES.some((m) => m.type === 'lt41-board-sync' && m.moments?.some((x) => x.id === 'm1' && x.date === '2026-12-31')), null, { timeout: 8000 });
  const sync = await page.evaluate(() => window.LT41_MESSAGES);
  assert.ok(sync.length > 0, '보드 저장 메시지가 간다');
  const sent = sync.at(-1).moments.find((m) => m.id === 'm1');
  assert.equal(sent.date, '2026-12-31', '보드가 보낸 날짜');
  assert.equal(sent.title, '순간 1', '순간 ID·제목은 그대로다');
  // '내 배치': 아래쪽 보이는 카드를 골라 옆 칸으로 끌면 내 배치로 전환되고, 그 카드의 자리는 날짜를 다시 바꿔도 그대로다(#395).
  // .leftPanel(왼쪽 도구 판, z 56)이 판 위를 덮는다 — 판에 가려진 카드는 가운데를 눌러도 끌 수 없으니(누르면 판이 눌린다)
  // 가운데가 판 오른쪽 밖인 카드만 고른다. 예전에는 .app 세로 스크롤 부작용으로 판이 걸러 올라가 우연히 통과했다(#627 2차 overflow:clip 정리).
  const dragId = await frame.evaluate(() => {
    const sb = document.querySelector('.leftPanel');
    const sr = sb && sb.getBoundingClientRect();
    for (const c of document.querySelectorAll('#cardLayer .card')) {
      const r = c.getBoundingClientRect();
      if (r.top > 80 && r.bottom < 880 && r.right < 1430 && (!sr || (r.left + r.right) / 2 > sr.right)) return c.dataset.id;
    }
    return null;
  });
  assert.ok(dragId, '끌 카드가 보인다');
  const syncCountBefore = await page.evaluate(() => window.LT41_MESSAGES.length);
  const from = await frame.evaluate((id) => { const r = document.querySelector(`.card[data-id="${id}"]`).getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; }, dragId);
  const drop = await frame.evaluate((id) => { const c = document.querySelector(`.card[data-id="${id}"]`); const r = c.getBoundingClientRect(), z = r.width / c.offsetWidth; return { x: r.right + 242 * z * 0.6, y: (r.top + r.bottom) / 2 }; }, dragId);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
  assert.equal(await frame.evaluate(() => document.querySelector('[data-board-mode="mine"]').getAttribute('aria-pressed')), 'true', '끌면 내 배치로 자동 전환(#601)');
  const minePos = await cardPos(frame, dragId);
  await page.waitForFunction((n) => window.LT41_MESSAGES.length > n, syncCountBefore, { timeout: 8000 });
  const dragSync = (await page.evaluate(() => window.LT41_MESSAGES)).at(-1).moments.find((m) => m.id === dragId);
  await frame.click(`.card[data-id="${dragId}"]`);
  // #891: 수정 단추는 '⋯ 더 보기' 메뉴 안에 있다 — 메뉴를 열고 누른다.
  await frame.click('#detailMoreBtn');
  await frame.waitForSelector('#editMomentBtn', { timeout: 5000 });
  await frame.click('#editMomentBtn');
  await frame.waitForSelector('#editModal.open', { timeout: 5000 });
  const dragOldDate = tree.moments.find((m) => m.id === dragId).id === 'm1' ? '2026-12-31' : tree.moments.find((m) => m.id === dragId).date;
  assert.equal(await frame.$eval('#editDate', (el) => el.value), dragOldDate, '두 번째 수정 창도 앞서 저장한 날짜로 시작한다');
  await frame.fill('#editDate', '2026-11-30');
  await frame.click('#editSave');
  await frame.waitForFunction(() => !document.querySelector('#editModal').classList.contains('open'), null, { timeout: 5000 });
  await page.waitForTimeout(800);
  assert.deepEqual(await cardPos(frame, dragId), minePos, "'내 배치'에서는 날짜를 바꿔도 자리가 그대로다");
  const sync2 = await page.evaluate(() => window.LT41_MESSAGES);
  const sent2 = sync2.filter((m) => m.moments?.some((x) => x.id === dragId && x.date === '2026-11-30')).at(-1)?.moments.find((m) => m.id === dragId);
  assert.ok(sent2, '두 번째 저장 메시지가 간다');
  assert.equal(sent2.date, '2026-11-30', '두 번째 저장의 날짜');
  assert.deepEqual({ x: sent2.x, y: sent2.y }, { x: dragSync.x, y: dragSync.y }, '저장 메시지의 자리(x·y)도 그대로다');
  assert.equal(problems.length, 0, `화면 문제 없음 (${problems.join(' | ') || '없음'})`);
  await context.close();
});

test('#736 편집 창은 고정 목록에 없는 꼬리표를 지우지 않는다 — 열고·더하고·지우기', { skip: REQUIRE ? false : skip, timeout: 300000 }, async (t) => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = chainTree(3);
  tree.moments[0].keywords = ['가수:PSY', '첫만남', '노래:Gangnam Style'];
  const server = await serve({ '/host.html': hostHTML(tree) });
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); server.close(); });
  const { context, page, frame, problems } = await openHost(browser, 'http://127.0.0.1:' + server.address().port + '/host.html');

  const syncCount = () => page.evaluate(() => window.LT41_MESSAGES.filter((m) => m.type === 'lt41-board-sync').length);
  const lastKeywords = () => page.evaluate(() => {
    const sync = window.LT41_MESSAGES.filter((m) => m.type === 'lt41-board-sync').at(-1);
    return sync ? (sync.moments.find((x) => x.id === 'm1')?.keywords || []) : null;
  });
  const openEdit = async () => {
    await frame.click('.card[data-id="m1"]');
    await frame.click('#detailMoreBtn');
    await frame.waitForSelector('#editMomentBtn', { timeout: 5000 });
    await frame.click('#editMomentBtn');
    await frame.waitForSelector('#editModal.open', { timeout: 5000 });
  };

  await openEdit();
  // 고정 목록에 없는 꼬리표도 칩으로 보인다 — 종류·값 표기는 꼬리표 칩과 같은 모양, 켜진 상태로.
  const chips = await frame.evaluate(() => [...document.querySelectorAll('#editKeywordPicker .keywordBtn.is-custom-tag')].map((b) => ({ key: b.dataset.key, text: b.textContent, on: b.classList.contains('on') })));
  assert.deepEqual(chips, [
    { key: '가수:PSY', text: '가수 · PSY', on: true },
    { key: '노래:Gangnam Style', text: '노래 · Gangnam Style', on: true }
  ], '고정 목록에 없는 꼬리표도 칩으로 보인다(종류 · 값 표기)');

  // ① 아무것도 안 바꾸고 저장 → 꼬리표 그대로
  const before1 = await syncCount();
  await frame.click('#editSave');
  await frame.waitForFunction(() => !document.querySelector('#editModal').classList.contains('open'), null, { timeout: 5000 });
  await page.waitForFunction((n) => window.LT41_MESSAGES.filter((m) => m.type === 'lt41-board-sync').length > n, before1, { timeout: 8000 });
  assert.deepEqual(await lastKeywords(), ['가수:PSY', '첫만남', '노래:Gangnam Style'], '① 저장만 해도 꼬리표가 그대로다');

  // ② 다른 꼬리표를 더해 저장 → 원래 것 + 새 것
  await openEdit();
  await frame.fill('#editCustomKeyword', '무대:인기가요 240524');
  await frame.click('#editAddKeyword');
  await frame.waitForSelector('#editKeywordPicker .keywordBtn.on[data-key="무대:인기가요 240524"]', { timeout: 5000 });
  const before2 = await syncCount();
  await frame.click('#editSave');
  await frame.waitForFunction(() => !document.querySelector('#editModal').classList.contains('open'), null, { timeout: 5000 });
  await page.waitForFunction((n) => window.LT41_MESSAGES.filter((m) => m.type === 'lt41-board-sync').length > n, before2, { timeout: 8000 });
  assert.deepEqual(await lastKeywords(), ['가수:PSY', '첫만남', '노래:Gangnam Style', '무대:인기가요 240524'], '② 원래 것 + 새 것');

  // ③ 하나를 지우고 저장 → 그것만 빠진다
  await openEdit();
  await frame.click('#editKeywordPicker .keywordBtn[data-key="가수:PSY"]');
  const before3 = await syncCount();
  await frame.click('#editSave');
  await frame.waitForFunction(() => !document.querySelector('#editModal').classList.contains('open'), null, { timeout: 5000 });
  await page.waitForFunction((n) => window.LT41_MESSAGES.filter((m) => m.type === 'lt41-board-sync').length > n, before3, { timeout: 8000 });
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
  const server = await serve({ '/host.html': hostHTML(tree) });
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); server.close(); });
  const { context, page, frame, problems } = await openHost(browser, 'http://127.0.0.1:' + server.address().port + '/host.html');
  // 카드에 보이는 글은 '이어진 이유'여도, 저장할 한마디는 빈 채로 남는다.
  const cardText = await frame.evaluate(() => document.querySelector('.card[data-id="m2"] .noteText')?.textContent || '');
  assert.ok(cardText.includes('이어진 이유'), `빈 한마디 카드에는 연결 이유가 보인다(${cardText})`);
  const before = await page.evaluate(() => window.LT41_MESSAGES.filter((m) => m.type === 'lt41-board-sync').length);
  await frame.click('.card[data-id="m1"]');
  await frame.click('#detailMoreBtn');
  await frame.waitForSelector('#editMomentBtn', { timeout: 5000 });
  await frame.click('#editMomentBtn');
  await frame.waitForSelector('#editModal.open', { timeout: 5000 });
  await frame.click('#editSave');
  await page.waitForFunction((n) => window.LT41_MESSAGES.filter((m) => m.type === 'lt41-board-sync').length > n, before, { timeout: 8000 });
  const sync = await page.evaluate(() => window.LT41_MESSAGES.filter((m) => m.type === 'lt41-board-sync').at(-1));
  assert.equal(sync.moments.find(m => m.id === 'm1').note, '', '보드가 보낸 한마디는 빈 채');
  assert.equal(sync.moments.find(m => m.id === 'm2').note, '', '연결 이유가 있는 빈 한마디도 빈 채로 보낸다');
  // 화면이 보낸 목록을 실제 셸 모델에 적용해 최종 저장 값을 확인한다.
  const merged = sessionOn(tree);
  await merged.start();
  merged.apply('boardSync', { moments: sync.moments }, { treeId: tree.id, momentId: 'm1' });
  const saved = merged.state().trees[0].moments.find(m => m.id === 'm1');
  assert.equal(saved.startSeconds, 90, '화면 저장 뒤 시작 구간 보존');
  assert.equal(saved.endSeconds, 120, '화면 저장 뒤 끝 구간 보존');
  assert.equal(saved.createdAt, fixedAt, '화면 저장 뒤 만든 시각 보존');
  assert.equal(saved.note, '', '화면 저장 뒤 빈 한마디 유지');
  assert.deepEqual(problems, [], `화면 문제 없음 (${problems.join(' | ') || '없음'})`);
  await context.close();
});

test('#1273 2번 크게 보기: 영어 라벨 없이 한국어로 그리고 빈 값 줄은 숨긴다', () => {
  const html = read('public/v41/views/track58-pinboard.html');
  assert.match(html, /순간 크게 보기/, '뷰어 제목은 한국어');
  assert.doesNotMatch(html, /VIEWER · PROVENANCE PRESERVED/);
  assert.doesNotMatch(html, /EDIT 순간 · PROVENANCE PRESERVED/);
  for (const file of ['board.js', 'board-extras.js', 'board-detail.js']) {
    const src = read(`public/v41/views/board/${file}`);
    assert.ok(src.includes('window.viewerMetaHTML'), `${file}: 공통 메타 함수를 쓴다`);
    assert.doesNotMatch(src, /Keywords:/, `${file}: 영어 꼬리표 라벨 없음`);
    assert.doesNotMatch(src, /<br>URL:/, `${file}: 영어 주소 라벨 없음`);
    assert.doesNotMatch(src, /videoSource[^)]*toUpperCase\(\)/, `${file}: 뷰어의 개발용 표식 대문자화 없음`);
  }
  const build = globalThis.viewerMetaHTML;
  assert.equal(typeof build, 'function');
  const full = build({ head: '사진 · 2026-11-24 · 설렘', source: '내 기록', url: 'https://example.test/v', keywords: ['가수:BTS'], memo: '좋아요', mediaTitle: '노래 제목' });
  assert.match(full, /출처: 내 기록/);
  assert.match(full, /주소: https:\/\/example\.test\/v/);
  assert.match(full, /꼬리표: #가수:BTS/);
  assert.match(full, /마음 한마디: 좋아요/);
  assert.doesNotMatch(full, /Keywords:|URL:|Source:|Note:/);
  const empty = build({ head: '사진 · 2026-11-24 · 설렘', source: '', url: '', keywords: [], memo: '' });
  assert.doesNotMatch(empty, /마음 한마디/, '빈 한마디 줄은 아예 만들지 않는다');
  assert.doesNotMatch(empty, /꼬리표/, '빈 꼬리표 줄도 숨긴다');
  assert.doesNotMatch(empty, /출처:|주소:/);
});
