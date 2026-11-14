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
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
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
  assert.match(board, /boardMode==='mine'&&m\.savedPos\)continue/, "'내 배치'는 저장 자리를 유지한다");
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
  const sync = await page.evaluate(() => window.LT41_MESSAGES);
  assert.ok(sync.length > 0, '보드 저장 메시지가 간다');
  const sent = sync.at(-1).moments.find((m) => m.id === 'm1');
  assert.equal(sent.date, '2026-12-31', '보드가 보낸 날짜');
  assert.equal(sent.title, '순간 1', '순간 ID·제목은 그대로다');
  // '내 배치': 아래쪽 보이는 카드를 골라 옆 칸으로 끌면 내 배치로 전환되고, 그 카드의 자리는 날짜를 다시 바꿔도 그대로다(#395).
  const dragId = await frame.evaluate(() => {
    for (const c of document.querySelectorAll('#cardLayer .card')) {
      const r = c.getBoundingClientRect();
      if (r.top > 80 && r.bottom < 880 && r.left > 0 && r.right < 1430) return c.dataset.id;
    }
    return null;
  });
  assert.ok(dragId, '끌 카드가 보인다');
  const from = await frame.evaluate((id) => { const r = document.querySelector(`.card[data-id="${id}"]`).getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; }, dragId);
  const drop = await frame.evaluate((id) => { const c = document.querySelector(`.card[data-id="${id}"]`); const r = c.getBoundingClientRect(), z = r.width / c.offsetWidth; return { x: r.right + 242 * z * 0.6, y: (r.top + r.bottom) / 2 }; }, dragId);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
  assert.equal(await frame.evaluate(() => document.querySelector('[data-board-mode="mine"]').getAttribute('aria-pressed')), 'true', '끌면 내 배치로 자동 전환(#601)');
  const minePos = await cardPos(frame, dragId);
  const dragSync = (await page.evaluate(() => window.LT41_MESSAGES)).at(-1).moments.find((m) => m.id === dragId);
  await frame.click(`.card[data-id="${dragId}"]`);
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
  const sent2 = sync2.at(-1).moments.find((m) => m.id === dragId);
  assert.equal(sent2.date, '2026-11-30', '두 번째 저장의 날짜');
  assert.deepEqual({ x: sent2.x, y: sent2.y }, { x: dragSync.x, y: dragSync.y }, '저장 메시지의 자리(x·y)도 그대로다');
  assert.equal(problems.length, 0, `화면 문제 없음 (${problems.join(' | ') || '없음'})`);
  await context.close();
});
