// 보드 마감 후속(이슈 #553 뒤 화면 정리)의 실행 계약.
// - 따라오는 금색 커서 동그라미(cursorRing·cursorFX)를 완전히 없앤다: 요소·스타일·모델 판정 함수까지.
//   원래 마우스 커서를 쓰고, 끌기·핀 연결 같은 상태는 CSS cursor(grab·grabbing·crosshair·pointer)로 알린다.
//   화면 어디에도 cursor:none이 남으면 안 된다.
// - 순간 상세의 '다음 순간'('이전 순간'도)을 누르는 단추로 내놓는다: 누르면 판이 그 카드로
//   부드럽게 이동하고 카드가 선택되며 상세가 그 순간으로 바뀐다. 실제 <button>이므로 Tab·Enter도 된다.
//   (#601: 단추는 작은 썸네일 카드(connCard)로 진화 — 클릭·키보드 규칙은 그대로.)
//   이유(why) 글은 단추 아래 작은 글씨로 그대로, 3개 넘으면 '나머지 N개 보기'도 그대로.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, readFileSync } from 'node:fs';
import { stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUB = path.join(ROOT, 'public');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  const { existsSync } = await import('node:fs');
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 커서·단추 화면 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 커서·단추 화면 시험을 건너뜀'; }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

const chainTree = (n) => {
  const moments = Array.from({ length: n }, (_, i) => ({
    id: 'm' + (i + 1), title: '순간 ' + (i + 1), date: '2026-01-0' + ((i % 9) + 1), emotion: '설렘', note: '메모',
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

// 내 기록 보드 호스트: 셸처럼 data-member="in"을 본문에 남긴다.
const hostHTML = (tree) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>보드 호스트</title></head><body data-member="in" data-record-source="server">
<script>window.LT41={source:'server',writable:true,owned:true,momentId:${JSON.stringify(tree.moments[0].id)},prefs:{},tree:${JSON.stringify(tree)}};</script>
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
  return { context, page, frame, problems };
}

const worldTransform = (frame) => frame.$eval('.boardWorld', (el) => el.style.transform || '');

test('1. 커서 동그라미의 흔적이 남지 않는다(요소·스타일·모델 판정 함수 전부)', async () => {
  for (const rel of [
    'public/v41/views/track58-pinboard.html',
    'public/v41/views/board/board.css',
    'public/v41/views/board/board-extras.js',
    'public/v41/views/board/board.js',
    'public/v41/views/board/board-model.js'
  ]) {
    const s = read(rel);
    assert.doesNotMatch(s, /cursorRing|cursorFX|cursor-burst|cursor-ripple|cursor-drop|cursorSetDrag|cursorRefresh|cursorState/, `${rel}: 동그라미 배선 흔적`);
    assert.doesNotMatch(s, /cursorMode|cursorHover|cursorScale|cursorPresence|cursorEffectAllowed/, `${rel}: 모델 판정 함수 흔적`);
  }
  // public/v41 전체에 cursor:none이 없다 — 원래 마우스 커서를 가린 자리가 없어야 한다.
  const walk = async (dir) => {
    let hits = [];
    for (const ent of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) hits = hits.concat(await walk(p));
      else if (/\.(html|css|js)$/.test(ent.name) && /cursor\s*:\s*none/i.test(readFileSync(p, 'utf8'))) hits.push(p);
    }
    return hits;
  };
  assert.deepEqual(await walk(PUB), [], 'public/v41에 cursor:none 없음');
  // 상태 커서: 판 끌기 grab→grabbing, 카드 grab→끌 때 grabbing.
  // (#582: 핀 연결을 보드에서 없앴으므로 crosshair 연결 커서도 함께 거둔다)
  const css = read('public/v41/views/board/board.css');
  assert.match(css, /#viewport\{cursor:grab\}/);
  assert.match(css, /#viewport\.panning\{cursor:grabbing\}/);
  assert.match(css, /\.card\{cursor:grab\}/);
  assert.match(css, /\.card\.dragLift\{cursor:grabbing\}/);
  assert.ok(!css.includes('crosshair'), '연결이 없으므로 crosshair 커서도 없다');
  // 상태 클래스를 실제로 켜고 끈다.
  const board = read('public/v41/views/board/board.js');
  assert.match(board, /viewport\.classList\.add\('panning'\)/);
  assert.match(board, /viewport\.classList\.remove\('panning'\)/);
});

test('2. 상세의 다음·이전 순간은 단추다 — board.js의 열기와 extras의 다시 그리기가 같은 규칙', () => {
  const board = read('public/v41/views/board/board.js');
  const extras = read('public/v41/views/board/board-extras.js');
  // 실제 <button>이고 방향을 data-dir로 알린다(키보드 Tab·Enter 접근 보장). #601: 작은 썸네일 카드(connCard).
  for (const s of [board, extras]) {
    assert.match(s, /<button type="button" class="connCard" data-cid=/);
    assert.match(s, /data-dir=/);
    // 이유(why) 글은 단추 아래 작은 글씨로 그대로.
    assert.match(s, /connWhy/);
  }
  // 3개 넘으면 '나머지 N개 보기'를 유지한다.
  assert.match(board, /나머지 \$\{_rows\.length-3\}개 보기/);
  // 누름 처리: 다음은 실을 따라 이동, 이전은 거꾸로 — 이벤트 위임 한 벌.
  assert.match(extras, /\$\('#dConn'\)\.onclick=/);
  assert.match(extras, /b\.dataset\.dir==='next'\)moveViaConnection\(c\);else pulseConnection\(c,\(\)=>focusBoardMoment\(c\.a\)\)/);
});

test('3. 화면: 다음 순간 단추를 누르면 판이 이동하고 카드가 선택되며 상세가 바뀐다', { skip }, async (t) => {
  const tree = chainTree(6);
  const browser = await chromium.launch();
  const server = await serve({ '/host.html': hostHTML(tree) });
  t.after(async () => { await browser.close(); server.close(); });
  const { context, page, frame, problems } = await openHost(browser, `http://127.0.0.1:${server.address().port}/host.html`);
  assert.deepEqual(problems, [], '화면 오류 없음: ' + problems.join(' | '));
  // 동그라미가 살아 있었다면 화면에 남았을 요소 — 실제 화면에도 없다.
  assert.equal(await frame.evaluate(() => document.querySelectorAll('.cursorRing,.cursorFX').length), 0);
  assert.notEqual(await frame.evaluate(() => getComputedStyle(document.body).cursor), 'none');

  // 카드를 눌러 상세를 연다 — 다음 순간 단추가 보인다.
  await frame.click('.card[data-id="m2"]');
  await frame.waitForFunction(() => document.querySelector('.card.selected')?.dataset.id === 'm2', null, { timeout: 5000 });
  await frame.waitForSelector('#dConn .connCard[data-dir="next"]', { timeout: 5000 });
  const btnText = await frame.$eval('#dConn .connCard[data-dir="next"]', (b) => b.textContent.trim());
  assert.match(btnText, /순간 3/, '단추는 다음 순간의 제목을 보여준다: ' + btnText);
  assert.equal(await frame.$eval('#dConn .connWhy', (el) => el.textContent.trim()), '이어서', '이유 글은 단추 아래 작은 글씨로 그대로');

  // 누른다 — 판이 그 카드로 이동하고, 카드가 선택되고, 상세가 그 순간으로 바뀐다.
  const t1 = await worldTransform(frame);
  await frame.click('#dConn .connCard[data-dir="next"]');
  await frame.waitForFunction(() => document.querySelector('.card.selected')?.dataset.id === 'm3', null, { timeout: 8000 });
  await frame.waitForFunction(() => document.querySelector('#dTitle')?.textContent.includes('순간 3'), null, { timeout: 5000 });
  const t2 = await worldTransform(frame);
  assert.notEqual(t1, t2, '판이 해당 카드로 부드럽게 이동한다(변환 변화)');

  // 키보드: 실제 <button>이므로 Tab으로 닿고 Enter로 누른다.
  assert.equal(await frame.$eval('#dConn .connCard', (b) => b.tagName), 'BUTTON');
  await frame.focus('#dConn .connCard[data-dir="next"]');
  await page.keyboard.press('Enter');
  await frame.waitForFunction(() => document.querySelector('.card.selected')?.dataset.id === 'm4', null, { timeout: 8000 });
  await frame.waitForFunction(() => document.querySelector('#dTitle')?.textContent.includes('순간 4'), null, { timeout: 5000 });
});

test('4. 화면: 이전 순간 단추도 있다 — 사슬 끝에서 누르면 거꾸로 돌아간다', { skip }, async (t) => {
  const tree = chainTree(6);
  const browser = await chromium.launch();
  const server = await serve({ '/host.html': hostHTML(tree) });
  t.after(async () => { await browser.close(); server.close(); });
  const { context, page, frame, problems } = await openHost(browser, `http://127.0.0.1:${server.address().port}/host.html`);
  assert.deepEqual(problems, [], '화면 오류 없음: ' + problems.join(' | '));
  await frame.click('.card[data-id="m6"]');
  await frame.waitForFunction(() => document.querySelector('.card.selected')?.dataset.id === 'm6', null, { timeout: 5000 });
  await frame.waitForSelector('#dConn .connCard[data-dir="prev"]', { timeout: 5000 });
  const btnText = await frame.$eval('#dConn .connCard[data-dir="prev"]', (b) => b.textContent.trim());
  assert.match(btnText, /순간 5/, '이전 순간 단추: ' + btnText);
  await frame.click('#dConn .connCard[data-dir="prev"]');
  await frame.waitForFunction(() => document.querySelector('.card.selected')?.dataset.id === 'm5', null, { timeout: 8000 });
  await frame.waitForFunction(() => document.querySelector('#dTitle')?.textContent.includes('순간 5'), null, { timeout: 5000 });
});
