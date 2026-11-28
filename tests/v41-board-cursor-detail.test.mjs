import { listenOnSafePort } from './helpers/safe-port.mjs';
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
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { testBackNavigation } from './helpers/history-assert.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUB = path.join(ROOT, 'public');
const TEST_PORT = Number(process.env.LT_BOARD_583_PORT || 0);

let chromium, skip = false;
// CI(미리보기 검사)에서는 LT_BOARD_583_REQUIRE=1 — 크롬이 준비된 잡에서 건너뜀을 실패로 본다.
const REQUIRE = process.env.LT_BOARD_583_REQUIRE === '1';
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
  return listenOnSafePort(server, '127.0.0.1', { port: TEST_PORT }).then(() => server);
}

// 내 기록 보드 호스트: 셸처럼 data-member="in"을 본문에 남긴다.
const hostHTML = (tree) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>보드 호스트</title></head><body data-member="in" data-record-source="server">
<script>window.LT41={source:'server',writable:true,owned:true,momentId:${JSON.stringify(tree.moments[0].id)},prefs:{},tree:${JSON.stringify(tree)}};
addEventListener('message',e=>{if(e.data&&e.data.type==='lt41-tags')(window.__tagMessages=window.__tagMessages||[]).push({momentId:e.data.momentId,keywords:e.data.keywords})});
</script>
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

const shellWorkspace = () => {
  const moments = chainTree(6).moments.map((moment, index) => ({
    ...moment,
    links: index < 5 ? ['m' + (index + 2)] : [],
    createdAt: `2026-01-0${index + 1}T00:00:00.000Z`
  }));
  return {
    revision: 1,
    subject: 'trial-subject',
    writeSubjectBound: true,
    state: {
      version: 1,
      prefs: {},
      trees: [{
        id: 't6', subject: '시험 사용자', title: '사슬 6', coverMomentId: '', inbox: false,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-06T00:00:00.000Z', moments
      }]
    }
  };
};

async function openShellBoard(browser, base, { width = 1440, height = 900, workspace = shellWorkspace(), writeTab = 'easy', empty = false } = {}) {
  const treeId = workspace.state.trees[0]?.id || 't6';
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  await context.addInitScript(({ writeTab, treeId }) => {
    localStorage.setItem('lt41.tips.firstTree', '1');
    localStorage.setItem('lt41.writeTab', writeTab);
    localStorage.setItem('lt41.discoverAsked', JSON.stringify([treeId]));
  }, { writeTab, treeId });
  const page = await context.newPage();
  page.on('dialog', dialog => dialog.accept());
  if (process.env.LT_BOARD_CPU_RATE) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.LT_BOARD_CPU_RATE) });
  }
  const errors = [];
  page.on('pageerror', error => errors.push(String(error.message || error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  let stored = workspace;
  let revision = Number(stored.revision) || 1;
  const puts = [];
  await page.route('**/api/workspace*', route => {
    const request = route.request();
    if (request.method() === 'PUT') {
      const body = JSON.parse(request.postData() || '{}');
      puts.push(body);
      stored = { ...stored, state: body.state, revision: ++revision };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision, subject: stored.subject }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...stored, revision, ok: true, savedAt: '2026-11-27T00:00:00.000Z' }) });
  });
  await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
  try {
    await page.waitForFunction(treeId => window.LT41?.tree?.id === treeId, treeId, { timeout: 20000 });
    await page.evaluate(() => document.querySelector('[data-view="track58-pinboard.html"]').click());
    await page.waitForFunction(empty => {
      const frame = document.querySelector('#view');
      if (!frame?.contentDocument) return false;
      return empty
        ? !frame.contentDocument.querySelector('#boardEmptyGuide')?.hidden
        : frame.contentDocument.querySelectorAll('#cardLayer .card').length === 6 && !frame.contentDocument.querySelector('#detail.open');
    }, empty, { timeout: 20000 });
  } catch (error) {
    throw new Error(`${error.message} / ${errors.join(' | ')}`);
  }
  await page.waitForTimeout(500);
  const handle = await page.$('#view');
  return { context, page, frame: await handle.contentFrame(), puts, stored: () => stored };
}

// #952: 커서·상세 단추의 소스 글자 검사 10개를 걷어냈다. 남은 것은 화면에서 재는 동작이다.
test('1. 화면: 커서 동그라미가 없고, 판·카드는 grab·끌면 grabbing — 판을 끌면 panning이 켜졌다 꺼진다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const tree = chainTree(6);
  const browser = await chromium.launch();
  const server = await serve({ '/host.html': hostHTML(tree) });
  const { context, page, frame, problems } = await openHost(browser, `http://127.0.0.1:${server.address().port}/host.html`);
  t.after(async () => { await context.close().catch(() => {}); await browser.close(); server.close(); });
  assert.deepEqual(problems, [], '화면 오류 없음: ' + problems.join(' | '));
  const look = await frame.evaluate(() => ({
    rings: document.querySelectorAll('.cursorRing,.cursorFX,[class*="cursor-burst"],[class*="cursor-ripple"]').length,
    body: getComputedStyle(document.body).cursor,
    viewport: getComputedStyle(document.getElementById('viewport')).cursor,
    card: getComputedStyle(document.querySelector('#cardLayer .card')).cursor
  }));
  assert.equal(look.rings, 0, '따라오는 동그라미 요소가 없다');
  assert.notEqual(look.body, 'none', 'body에서 마우스 커서를 가리지 않는다');
  assert.equal(look.viewport, 'grab', `판 커서는 grab(${look.viewport})`);
  assert.equal(look.card, 'grab', `카드 커서는 grab(${look.card})`);
  // 판을 끌면 panning(grabbing)이 켜지고, 손을 떼면 꺼진다.
  const box = await frame.$eval('#viewport', (el) => {
    const r = el.getBoundingClientRect();
    // Find a real free portion of the board: card layout changes with the available viewport.
    for (let y = r.top + 24; y < r.bottom - 24; y += 24) {
      for (let x = r.left + 24; x < r.right - 24; x += 24) {
        const hit = document.elementFromPoint(x, y);
        if (hit && el.contains(hit) && !hit.closest('.card,button,select,input,textarea,a')) return { x, y };
      }
    }
    return null;
  });
  assert.ok(box, 'a free board point exists for panning');
  await frame.evaluate(() => { window.__pan = []; const v = document.getElementById('viewport');
    new MutationObserver(() => window.__pan.push(v.classList.contains('panning'))).observe(v, { attributes: true, attributeFilter: ['class'] }); });
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await frame.waitForTimeout(120);
  const midDrag = await frame.evaluate(() => ({ panning: document.getElementById('viewport').classList.contains('panning'), cursor: getComputedStyle(document.getElementById('viewport')).cursor }));
  await page.mouse.up();
  await frame.waitForTimeout(200);
  const afterDrag = await frame.evaluate(() => ({ panning: document.getElementById('viewport').classList.contains('panning'), seen: window.__pan.includes(true) && window.__pan.includes(false) }));
  assert.equal(midDrag.panning, true, '끄는 동안 panning이 켜진다');
  assert.equal(midDrag.cursor, 'grabbing', `끄는 동안 커서는 grabbing(${midDrag.cursor})`);
  assert.equal(afterDrag.panning, false, '손을 떼면 panning이 꺼진다');
  assert.equal(afterDrag.seen, true, '켜짐·꺼짐이 화면에 실제로 반영된다');
});

test('3. 화면: 다음 순간 단추를 누르면 판이 이동하고 카드가 선택되며 상세가 바뀐다', { skip: REQUIRE ? false : skip }, async (t) => {
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

test('4. 화면: 이전 순간 단추도 있다 — 사슬 끝에서 누르면 거꾸로 돌아간다', { skip: REQUIRE ? false : skip }, async (t) => {
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

// #840(운영센터 의견 34): 카드를 바꿔 누르면 상세 판 전부(제목·영상·마음·꼬리표 칩)가 그 순간으로 바뀌고,
// 이전 순간의 '확정' 칩이 남아 이전 순간의 꼬리표를 바꾸는 사고가 없어야 한다.
// 영상 칸 안의 '크게 보기'·'YouTube에서 열기'는 아래 단추 줄과 두 번씩 보이지 않는다(각 1개).
const tagDetailTree = (() => {
  const V = 'https://www.youtube.com/watch?v=';
  const moments = [
    { id: 'm1', title: '가 순간', date: '2026-11-01', emotion: '설렘', note: '가 순간에 남긴 마음', parentId: null, relation: '', url: V + 'aqz-KE-bpKQ', x: null, y: null, rot: 0, color: 'rose', keywords: ['가수:아이유'] },
    { id: 'm2', title: '나 순간', date: '2026-11-02', emotion: '그리움', note: '나 순간에 남긴 마음', parentId: 'm1', relation: '이어서', url: V + 'M7lc1UVf-VE', x: null, y: null, rot: 0, color: 'cyan', keywords: ['노래:Blueming'] }
  ];
  return { id: 't-tag-detail', title: '꼬리표 사슬', moments, edges: [{ id: 'e2', kind: 'parent', from: 'm1', to: 'm2', reason: '이어서' }] };
})();

const detailSnapshot = (frame) => frame.evaluate(() => {
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const chipOf = (el) => ({ text: el.textContent.trim(), confirmed: el.classList.contains('is-confirmed') });
  const actions = [...document.querySelectorAll('#detail button, #detail a')]
    .filter(visible)
    .map((el) => (el.textContent || '').trim().replace(/\s+/g, ' '))
    .filter((t) => t === 'YouTube ↗' || t === '크게 보기' || t.startsWith('원본 링크 열기'));
  return {
    title: document.getElementById('dTitle')?.textContent || '',
    heart: document.getElementById('dHeart')?.textContent || '',
    chips: [...document.querySelectorAll('#dTags .lt-tag-chip')].filter(visible).map(chipOf),
    player: !!document.querySelector('#detailPlayer .lt-media, #detailPlayer video, #detailPlayer img, #detailPlayer .detailNoteMedia'),
    actions: actions.reduce((acc, t) => { acc[t] = (acc[t] || 0) + 1; return acc; }, {})
  };
});

test('5. 화면: 카드를 바꿔 누르면 상세 판이 그 순간으로 바뀌고 꼬리표 칩도 다시 그려진다(#840)', { skip: REQUIRE ? false : skip }, async (t) => {
  const browser = await chromium.launch();
  const server = await serve({ '/host.html': hostHTML(tagDetailTree) });
  t.after(async () => { await browser.close(); server.close(); });
  const { context, page, frame, problems } = await openHost(browser, `http://127.0.0.1:${server.address().port}/host.html`);
  assert.deepEqual(problems, [], '화면 오류 없음: ' + problems.join(' | '));

  // 카드 A를 눌러 상세를 연다 — 판 제목·마음·꼬리표 칩이 A 것이다.
  await frame.click('.card[data-id="m1"]');
  await frame.waitForFunction(() => document.querySelector('#dTitle')?.textContent.includes('가 순간'), null, { timeout: 5000 });
  await frame.waitForFunction(() => !!document.querySelector('#dTags .lt-tag-chip'), null, { timeout: 8000 });
  const a = await detailSnapshot(frame);
  assert.match(a.title, /가 순간/, '판 제목은 A 것이다: ' + a.title);
  assert.equal(a.heart, '가 순간에 남긴 마음', '마음도 A 것이다: ' + a.heart);
  assert.ok(a.player, '영상 칸이 A 것으로 그려진다');
  assert.deepEqual(a.actions, { '크게 보기': 1, 'YouTube ↗': 1 }, `단추·링크는 한 벌만 있다(#891: YouTube는 영상 아래 작은 링크): ${JSON.stringify(a.actions)}`);
  assert.ok(a.chips.some((c) => c.text === '가수 · 아이유' && c.confirmed), 'A의 꼬리표 칩이 확정으로 보인다: ' + JSON.stringify(a.chips));

  // 카드 B를 누른다 — 판 전부가 B 것으로 바뀐다(칩 포함).
  await frame.click('.card[data-id="m2"]');
  await frame.waitForFunction(() => document.querySelector('#dTitle')?.textContent.includes('나 순간'), null, { timeout: 5000 });
  await frame.waitForFunction(() => document.querySelector('#dTags .lt-tag-chip')?.textContent.includes('Blueming'), null, { timeout: 8000 });
  const b = await detailSnapshot(frame);
  assert.match(b.title, /나 순간/, '판 제목은 B 것이다: ' + b.title);
  assert.equal(b.heart, '나 순간에 남긴 마음', '마음도 B 것이다: ' + b.heart);
  assert.ok(b.player, '영상 칸이 B 것으로 다시 그려진다');
  assert.deepEqual(b.actions, { '크게 보기': 1, 'YouTube ↗': 1 }, `바뀐 뒤에도 단추·링크는 각 1개다: ${JSON.stringify(b.actions)}`);
  assert.ok(b.chips.some((c) => c.text === '노래 · Blueming' && c.confirmed), 'B의 꼬리표 칩이 확정으로 다시 그려진다: ' + JSON.stringify(b.chips));
  assert.ok(!b.chips.some((c) => c.text.includes('아이유')), 'A의 꼬리표 칩이 남아 있지 않다: ' + JSON.stringify(b.chips));

  // B에서 칩을 누르면 저장 시도는 B에만 간다 — A의 꼬리표는 0건 바뀐다.
  await frame.click('#dTags .lt-tag-chip');
  await page.waitForTimeout(600);
  const messages = await page.evaluate(() => window.__tagMessages || []);
  assert.ok(messages.length >= 1, '칩 누름이 저장 경로에 닿는다: ' + JSON.stringify(messages));
  assert.ok(messages.every((m) => m.momentId === 'm2'), `저장 시도는 지금 순간(B)에만 간다: ${JSON.stringify(messages)}`);
  assert.ok(messages.every((m) => !m.keywords.includes('가수:아이유')), 'A의 꼬리표가 저장 시도에 섞이지 않는다: ' + JSON.stringify(messages));
  const keywords = await page.evaluate(() => window.LT41.tree.moments.map((m) => ({ id: m.id, keywords: m.keywords })));
  assert.deepEqual(keywords.find((m) => m.id === 'm1').keywords, ['가수:아이유'], 'A의 꼬리표는 그대로다(변경 0건)');
});

test('6. 화면: 판 제목(기억 보드·설명 줄)은 무대 밖 고정 머리글 — 화면 왼쪽에서 잘리지 않는다(#856)', { skip: REQUIRE ? false : skip }, async (t) => {
  // #856: 제목이 팬(이동)하는 무대(#world) 안에 있으면 맞춤·초점 계산이 왼쪽으로 밀 때 화면 끝에서 잘렸다.
  const tree = chainTree(6);
  const browser = await chromium.launch();
  const server = await serve({ '/host.html': hostHTML(tree) });
  t.after(async () => { await browser.close(); server.close(); });
  const { context, page, frame, problems } = await openHost(browser, `http://127.0.0.1:${server.address().port}/host.html`);
  assert.deepEqual(problems, [], '화면 오류 없음: ' + problems.join(' | '));
  // #1249: 보드 제목은 공통 도구 줄로 옮겼다 — 움직이는 판 밖 고정 제목의 왼쪽 여백을 같은 기준으로 잰다.
  const left = () => frame.$eval('.lt-screen-toolbar .lt-toolbar-tree-choice', (el) => Math.round(el.getBoundingClientRect().left));
  // 처음 자리에서도, 전체 보기로 다시 맞춘 뒤에도 왼쪽 24px 안쪽에서 시작한다.
  assert.ok(await left() >= 24, `처음 자리 제목 왼편 ${(await left())}px — 24px 이상`);
  await frame.evaluate(() => fitAll(true));
  await page.waitForTimeout(1200);
  assert.ok(await left() >= 24, `전체 보기 뒤 제목 왼편 ${(await left())}px — 24px 이상`);
});

test('7. 화면: 390px 고르기 칸은 순간 상세와 같은 원래 제목을 보여주고 갱신 뒤에도 따라간다', { skip: REQUIRE ? false : skip }, async (t) => {
  const tree = chainTree(3);
  tree.moments[0].title = 'super shy — official mv';
  tree.moments[0].mediaMetadata = { title: 'Super Shy — Official MV' };
  tree.moments[1].title = 'BTS 직캠 · Super Shy — 한글';
  const browser = await chromium.launch();
  const server = await serve({ '/host.html': hostHTML(tree) });
  t.after(async () => { await context.close().catch(() => {}); await browser.close(); server.close(); });
  const { context, page, frame, problems } = await openHost(browser, `http://127.0.0.1:${server.address().port}/host.html`, { width: 390, height: 844 });
  assert.deepEqual(problems, [], '화면 오류 없음: ' + problems.join(' | '));

  const optionLabels = () => frame.$$eval('.lt-moment-picker select option', options => options.map(option => option.textContent));
  assert.deepEqual(await optionLabels(), [
    '1. Super Shy — Official MV',
    '2. BTS 직캠 · Super Shy — 한글',
    '3. 순간 3'
  ], '고르기 칸은 상세의 표시 제목과 대소문자·한글이 같은 원래 글자를 보여준다');
  assert.equal(await frame.$eval('.lt-moment-picker select', select => getComputedStyle(select).textTransform), 'none', 'CSS가 제목 대소문자를 바꾸지 않는다');

  await frame.selectOption('.lt-moment-picker select', 'm1');
  await frame.click('.lt-moment-picker button');
  await frame.waitForFunction(() => document.getElementById('detail')?.classList.contains('open'), null, { timeout: 5000 });
  assert.equal(await frame.$eval('#dTitle', title => title.textContent), 'Super Shy — Official MV', '여는 순간의 상세 제목과 고르기 칸 글자가 같다');

  const changed = 'BTS 직캠 · SUPER SHY — 한글';
  await page.evaluate(title => {
    window.LT41.tree.moments.find(moment => moment.id === 'm2').title = title;
    document.querySelector('iframe').contentWindow.postMessage({ type: 'lt41-trees-saved', background: true }, location.origin);
  }, changed);
  await frame.waitForFunction(title => [...document.querySelectorAll('.lt-moment-picker select option')].some(option => option.textContent === `2. ${title}`), changed, { timeout: 5000 });
  assert.equal((await optionLabels())[1], `2. ${changed}`, '서버 기록이 갱신되면 고르기 칸도 새 원래 제목으로 바뀐다');
});

test('8. 화면: 보드의 테마·정렬·확대·필터는 뒤로 가기 기록을 늘리지 않는다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const browser = await chromium.launch();
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const { context, page, frame } = await openShellBoard(browser, base);
  t.after(async () => { await context.close(); await browser.close(); server.close(); });
  await testBackNavigation(page, { frame, recorded: false, action: () => frame.click('[data-board-mode="mine"]') });
  await testBackNavigation(page, { frame, recorded: false, action: async () => { await frame.click('#boardBgBtn'); await frame.click('.lt-bg-item[data-bg="paper"]'); } });
  await testBackNavigation(page, { frame, recorded: false, action: () => frame.evaluate(() => document.getElementById('plusBtn').click()) });
  await testBackNavigation(page, { frame, recorded: false, action: () => frame.evaluate(() => { const filter = document.getElementById('mediaFilter'); filter.value = 'note'; filter.dispatchEvent(new Event('change')); }) });
});

test('9. 화면: 보드 순간 열기는 뒤로 가기 한 번에 이전 순간·닫힌 상세로 돌아간다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const browser = await chromium.launch();
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const { context, page, frame } = await openShellBoard(browser, base);
  t.after(async () => { await context.close(); await browser.close(); server.close(); });
  await testBackNavigation(page, {
    frame,
    recorded: true,
    action: () => frame.evaluate(() => selectMoment('m2', true))
  });
});

test('10. 화면: 보드 크게 보기는 뒤로 가기로 닫히고 이전 상세 판으로 돌아간다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const browser = await chromium.launch();
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const { context, page, frame } = await openShellBoard(browser, base);
  t.after(async () => { await context.close(); await browser.close(); server.close(); });
  await frame.click('.card[data-id="m1"]');
  await frame.waitForSelector('#detail.open');
  await testBackNavigation(page, { frame, recorded: true, action: () => frame.click('#openMoment') });
});

test('11. 화면: 보드 수정 창은 뒤로 가기로 닫히고 이전 상세 판으로 돌아간다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const browser = await chromium.launch();
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const { context, page, frame } = await openShellBoard(browser, base);
  t.after(async () => { await context.close(); await browser.close(); server.close(); });
  await frame.click('.card[data-id="m1"]');
  await frame.waitForSelector('#detail.open');
  await testBackNavigation(page, {
    frame,
    recorded: true,
    action: () => frame.evaluate(() => { document.getElementById('detailMoreBtn').click(); document.getElementById('editMomentBtn').click(); })
  });
});

test('12. 화면: 보드 시네마는 뒤로 가기로 닫히고 이전 보드 상태로 돌아간다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const browser = await chromium.launch();
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const { context, page, frame } = await openShellBoard(browser, base);
  t.after(async () => { await context.close(); await browser.close(); server.close(); });
  await testBackNavigation(page, { frame, recorded: true, action: () => frame.click('#cinemaBtn') });
});

test('13. 화면: 보드에서 책으로 이동한 뒤 뒤로 가기는 이전 보드 상태로 돌아온다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const browser = await chromium.launch();
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const { context, page, frame } = await openShellBoard(browser, base);
  t.after(async () => { await context.close(); await browser.close(); server.close(); });
  await testBackNavigation(page, { frame, recorded: true, action: () => page.click('[data-view="track59-sketchbook.html"]') });
});

test('14. 화면: 390px 보드 도구 판은 뒤로 가기로 닫히고 스크롤 위치를 복구한다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const browser = await chromium.launch();
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const { context, page, frame } = await openShellBoard(browser, base, { width: 390, height: 844 });
  t.after(async () => { await context.close(); await browser.close(); server.close(); });
  await frame.evaluate(() => { document.getElementById('viewport').scrollTop = 120; });
  await testBackNavigation(page, { frame, recorded: true, action: () => frame.evaluate(() => document.getElementById('mobileTools').click()) });
});

test('15. 화면: 보드에서 지도로 이동한 뒤 뒤로 가기는 열린 순간 상세로 돌아온다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const browser = await chromium.launch();
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const { context, page, frame } = await openShellBoard(browser, base);
  t.after(async () => { await context.close(); await browser.close(); server.close(); });
  await frame.click('.card[data-id="m1"]');
  await frame.waitForSelector('#detail.open');
  await testBackNavigation(page, { frame, recorded: true, action: () => frame.evaluate(() => document.getElementById('detailMapBtn').click()) });
});

test('16. 화면: 보드의 트리 옮기기 창은 뒤로 가기로 닫히고 순간 상세로 돌아간다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const browser = await chromium.launch();
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const { context, page, frame } = await openShellBoard(browser, base);
  t.after(async () => { await context.close(); await browser.close(); server.close(); });
  await frame.click('.card[data-id="m1"]');
  await frame.waitForSelector('#detail.open');
  await testBackNavigation(page, { frame, recorded: true, action: () => frame.evaluate(() => document.getElementById('detailMoveBtn').click()) });
});

test('17. 화면: 시네마 장면에서 보드로 들어간 뒤 뒤로 가기는 시네마로 돌아간다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const browser = await chromium.launch();
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const { context, page, frame } = await openShellBoard(browser, base);
  t.after(async () => { await context.close(); await browser.close(); server.close(); });
  await frame.click('#cinemaBtn');
  await frame.waitForSelector('#cinemaOverlay.active');
  await testBackNavigation(page, { frame, recorded: true, action: () => frame.click('#enterBeat') });
});

test('18. 화면: 시네마 재생·장면 이동·다시 보기는 뒤로 가기 기록을 늘리지 않는다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const browser = await chromium.launch();
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const { context, page, frame } = await openShellBoard(browser, base);
  t.after(async () => { await context.close(); await browser.close(); server.close(); });
  await frame.click('#cinemaBtn');
  await frame.waitForSelector('#cinemaOverlay.active');
  await testBackNavigation(page, { frame, recorded: false, action: () => frame.click('#cinPlay') });
  await testBackNavigation(page, { frame, recorded: false, action: () => frame.click('#cinNext') });
  await testBackNavigation(page, { frame, recorded: false, action: () => frame.click('#cinRestart') });
  await testBackNavigation(page, { frame, recorded: false, action: () => frame.evaluate(() => { document.getElementById('finalCTA').classList.add('show'); document.getElementById('walkAgain').click(); }) });
});

test('19. 화면: 보드에서 고른 순간이 쉬운 추가의 부모로 저장되고 기존 기록은 그대로다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const browser = await chromium.launch({ headless: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const workspace = shellWorkspace();
  const { context, page, frame, puts, stored } = await openShellBoard(browser, base, { workspace });
  const before = await page.evaluate(() => structuredClone(window.LT41.tree.moments));
  t.after(async () => { await context.close(); await browser.close(); server.close(); });
  await frame.click('.card[data-id="m2"]');
  await frame.waitForSelector('.card.selected[data-id="m2"]');
  assert.equal(await page.evaluate(() => window.LT41.momentId), 'm2', '보드 선택이 셸의 현재 순간으로 전달된다');
  await page.click('#write-menu');
  await page.waitForSelector('#write-panel[open]');
  await page.fill('#quick-url', 'https://example.com/board-parent');
  await page.click('#quick-submit');
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && puts.length === 0) await page.waitForTimeout(100);
  assert.equal(puts.length, 1, '공용 쉬운 추가가 저장 요청을 한 번 보낸다');
  const moments = stored().state.trees[0].moments;
  assert.equal(moments.length, before.length + 1, '기존 순간을 지우지 않고 하나만 추가한다');
  assert.deepEqual(moments.slice(0, before.length), before, '기존 순간의 값과 순서가 바뀌지 않는다');
  assert.equal(moments.at(-1).parentId, 'm2', '고른 순간이 새 순간의 부모로 저장된다');
});

test('20. 화면: 보드에서 고른 순간이 자세한 추가의 부모로 저장된다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const browser = await chromium.launch({ headless: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const workspace = shellWorkspace();
  const { context, page, frame, puts, stored } = await openShellBoard(browser, base, { workspace });
  t.after(async () => { await context.close(); await browser.close(); server.close(); });
  await frame.click('.card[data-id="m2"]');
  await frame.waitForSelector('.card.selected[data-id="m2"]');
  await page.click('#write-menu');
  await page.waitForSelector('#write-panel[open]');
  await page.click('#write-tab-detailed');
  await page.waitForFunction(() => document.querySelector('#editor-context')?.textContent.includes('순간 2'), null, { timeout: 5000 });
  await page.fill('#moment-form [name="title"]', '고른 순간 다음');
  await page.fill('#moment-form [name="note"]', '부모 연결 시험 기록');
  await page.locator('#moment-form button[type="submit"]').click();
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && puts.length === 0) await page.waitForTimeout(100);
  assert.equal(puts.length, 1, '공용 자세한 추가가 저장 요청을 한 번 보낸다');
  assert.equal(stored().state.trees[0].moments.at(-1).parentId, 'm2', '자세한 추가도 고른 순간을 부모로 저장한다');
});

test('21. 화면: 순간 0개 트리도 보드 빈 상태를 열고 첫 순간을 추가한다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const browser = await chromium.launch({ headless: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const workspace = shellWorkspace();
  workspace.state.trees[0].moments = [];
  workspace.state.trees[0].edges = [];
  workspace.state.trees[0].coverMomentId = '';
  const { context, page, frame, puts, stored } = await openShellBoard(browser, base, { workspace, empty: true });
  t.after(async () => { await context.close(); await browser.close(); server.close(); });
  assert.equal(await page.evaluate(() => window.LT41.tree.id), 't6', '빈 트리를 트리 없음으로 바꾸지 않는다');
  assert.equal(await page.locator('#empty').isVisible(), false, '셸의 트리 0개 안내는 숨는다');
  assert.equal((await page.locator('body').innerText()).includes('열 수 없는 트리'), false, '빈 트리를 격리 안내로 만들지 않는다');
  assert.equal(await frame.locator('#boardEmptyGuide').isVisible(), true, '보드 프레임의 빈 안내가 보인다');
  assert.equal(await frame.locator('#boardFirstMoment').isVisible(), true, '첫 순간 추가 단추가 보인다');
  await frame.click('#boardFirstMoment');
  await page.waitForSelector('#write-panel[open]');
  await page.fill('#quick-url', 'https://example.com/first-board-moment');
  await page.click('#quick-submit');
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && puts.length === 0) await page.waitForTimeout(100);
  assert.equal(puts.length, 1, '첫 순간 추가가 저장 요청을 보낸다');
  const tree = stored().state.trees.find(item => item.id === 't6');
  assert.equal(tree.title, '사슬 6', '기존 트리와 이름을 유지한다');
  assert.equal(tree.moments.length, 1, '첫 순간 하나만 생긴다');
  assert.equal(tree.moments[0].parentId, null, '첫 순간은 시작 순간으로 저장된다');
});

test('22. 화면: 보드 수정은 공용 편집 창으로 저장하고 순간 정체성은 유지한다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const browser = await chromium.launch({ headless: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const { context, page, frame, puts, stored } = await openShellBoard(browser, base);
  t.after(async () => { await context.close(); await browser.close(); server.close(); });
  const before = await page.evaluate(() => structuredClone(window.LT41.tree.moments.find(moment => moment.id === 'm2')));
  await frame.click('.card[data-id="m2"]');
  await frame.waitForSelector('#detail.open');
  await frame.evaluate(() => { document.getElementById('detailMoreBtn').click(); document.getElementById('editMomentBtn').click(); });
  await page.waitForSelector('#write-panel[open]', { timeout: 5000 });
  assert.equal(await frame.locator('#editModal.open').count(), 0, '보드 자체 편집 창은 열리지 않는다');
  assert.equal(await page.locator('#write-panel-title').textContent(), '순간 수정');
  assert.equal(await page.inputValue('#moment-form [name="title"]'), '순간 2');
  await page.fill('#moment-form [name="title"]', '공용 창에서 고친 순간');
  await page.locator('#moment-form button[type="submit"]').click();
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && puts.length === 0) await page.waitForTimeout(100);
  assert.equal(puts.length, 1, '공용 편집 저장이 요청을 한 번 보낸다');
  const after = stored().state.trees[0].moments.find(moment => moment.id === 'm2');
  assert.equal(after.title, '공용 창에서 고친 순간');
  assert.equal(after.id, before.id);
  assert.equal(after.parentId, before.parentId);
  assert.equal(after.date, before.date);
  assert.deepEqual(after.links, before.links);
});

test('23. 화면: 보드 삭제는 공용 저장과 되돌리기로 원래 순간을 복원한다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const browser = await chromium.launch({ headless: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const { context, page, frame, puts, stored } = await openShellBoard(browser, base);
  t.after(async () => { await context.close(); await browser.close(); server.close(); });
  const before = await page.evaluate(() => structuredClone(window.LT41.tree.moments));
  await frame.click('.card[data-id="m2"]');
  await frame.waitForSelector('#detail.open');
  await frame.evaluate(() => { document.getElementById('detailMoreBtn').click(); document.getElementById('deleteMomentBtn').click(); });
  await page.waitForSelector('#lt-confirm[open]', { timeout: 10000 });
  await page.click('#lt-confirm-ok');
  let deadline = Date.now() + 10000;
  while (Date.now() < deadline && puts.length < 1) await page.waitForTimeout(100);
  assert.equal(puts.length, 1, '공용 삭제가 저장 요청을 한 번 보낸다');
  const deleted = stored().state.trees[0].moments;
  assert.equal(deleted.some(moment => moment.id === 'm2'), false, '고른 순간이 삭제된다');
  assert.equal(deleted.find(moment => moment.id === 'm3').parentId, 'm1', '자식 순간은 이전 순간으로 이어진다');
  assert.equal(deleted.some(moment => (moment.links || []).includes('m2')), false, '남은 관련 연결에서 삭제 순간을 뺀다');
  assert.equal(await page.locator('#toast .toast-action').textContent(), '되돌리기');
  await page.click('#toast .toast-action');
  deadline = Date.now() + 10000;
  while (Date.now() < deadline && puts.length < 2) await page.waitForTimeout(100);
  assert.equal(puts.length, 2, '되돌리기가 복원 저장 요청을 보낸다');
  assert.deepEqual(stored().state.trees[0].moments, before, '되돌리기가 순간·부모·연결·순서를 원래대로 복원한다');
  await frame.waitForSelector('.card[data-id="m2"]');
});

test('24. 화면: 보드 크게 보기는 공용 미디어 창을 쓰고 닫으면 흔적이 남지 않는다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const browser = await chromium.launch({ headless: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const workspace = shellWorkspace();
  workspace.state.trees[0].moments.forEach((moment, index) => {
    moment.url = `https://www.youtube.com/watch?v=${['aqz-KE-bpKQ', 'M7lc1UVf-VE', 'dQw4w9WgXcQ', '9bZkp7q19f0', 'kJQP7kiw5Fk', '3JZ_D3ELwOQ'][index]}`;
  });
  const { context, page, frame } = await openShellBoard(browser, base, { workspace });
  t.after(async () => { await context.close(); await browser.close(); server.close(); });
  await context.route('**/www.youtube-nocookie.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>가짜 영상</title>' }));
  await context.route('**/api/youtube/oembed*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"title":"가짜 영상"}' }));
  await context.route('**/i.ytimg.com/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#765"/></svg>' }));
  await frame.click('.card[data-id="m1"]');
  await frame.waitForSelector('#detail.open');
  await frame.click('#openMoment');
  await frame.waitForSelector('.lt-lightbox', { timeout: 5000 });
  await frame.waitForSelector('.lt-lightbox iframe', { timeout: 10000 });
  assert.equal(await frame.locator('#viewerModal.open').count(), 0, '보드 자체 뷰어는 열리지 않는다');
  assert.equal(await frame.locator('.lt-lightbox iframe').count(), 1, '공용 미디어 창이 영상을 연다');
  await page.keyboard.press('Escape');
  assert.equal(await frame.locator('.lt-lightbox').count(), 0, 'Esc로 공용 미디어 창이 닫힌다');
  assert.equal(await frame.locator('.lt-lightbox iframe').count(), 0, '닫은 뒤 영상 iframe이 남지 않는다');
});

test('25. 화면: 삭제 뒤 기록이 바뀌면 되돌리기 실패를 보여 주고 변경을 지우지 않는다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const browser = await chromium.launch({ headless: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const { context, page, frame, puts, stored } = await openShellBoard(browser, base);
  t.after(async () => { await context.close(); await browser.close(); server.close(); });
  await frame.click('.card[data-id="m2"]');
  await frame.evaluate(() => { document.getElementById('detailMoreBtn').click(); document.getElementById('deleteMomentBtn').click(); });
  await page.waitForSelector('#lt-confirm[open]', { timeout: 10000 });
  await page.click('#lt-confirm-ok');
  await page.waitForSelector('#toast .toast-action');
  await page.waitForFunction(() => document.getElementById('write-menu')?.textContent !== '저장 안 됨', null, { timeout: 10000 });
  await page.click('#write-menu');
  await page.waitForSelector('#write-panel[open]');
  await page.fill('#quick-url', 'https://example.com/after-delete');
  await page.click('#quick-submit');
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && !stored().state.trees[0].moments.some(moment => moment.url === 'https://example.com/after-delete')) await page.waitForTimeout(100);
  assert.equal(stored().state.trees[0].moments.some(moment => moment.url === 'https://example.com/after-delete'), true, '삭제 뒤 빠른 추가가 저장된다');
  await page.evaluate(() => document.getElementById('write-panel').close());
  await page.click('#toast .toast-action');
  await page.waitForFunction(() => document.getElementById('toast')?.textContent.includes('되돌릴 작업을 찾을 수 없어요'), null, { timeout: 5000 });
  assert.equal(stored().state.trees[0].moments.some(moment => moment.id === 'm2'), false, '실패한 되돌리기가 삭제 상태를 복원하지 않는다');
  assert.equal(stored().state.trees[0].moments.some(moment => moment.url === 'https://example.com/after-delete'), true, '뒤의 추가는 그대로 남는다');
});

test('26. 화면: 순간 0개 보드에서 시네마를 눌러도 브라우저 예외가 없다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const browser = await chromium.launch({ headless: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const workspace = shellWorkspace();
  workspace.state.trees[0].moments = [];
  workspace.state.trees[0].edges = [];
  const { context, page, frame } = await openShellBoard(browser, base, { workspace, empty: true });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error.message || error)));
  t.after(async () => { await context.close(); await browser.close(); server.close(); });
  await frame.click('#cinemaBtn');
  await page.waitForTimeout(300);
  assert.deepEqual(errors, [], '빈 보드 시네마 클릭에서 브라우저 예외가 없다');
  assert.equal(await frame.locator('#cinemaOverlay.active').count(), 0, '순간이 없으면 시네마를 시작하지 않는다');
});

test('#1538 실제 보드에서 초기 배열 참조와 세 QA 스냅샷을 유지한다', { skip: REQUIRE ? false : skip, timeout: 60000 }, async () => {
  const tree = {
    id: 'board-1538', title: '시험 보드', moments: [
      {id:'m1',title:'첫 순간',date:'2026-11-28',emotion:'설렘',note:'',parentId:null,relation:'',url:'',x:null,y:null,rot:0,color:'violet',keywords:[]},
      {id:'m2',title:'다음 순간',date:'2026-11-27',emotion:'행복',note:'',parentId:'m1',relation:'',url:'',x:null,y:null,rot:0,color:'rose',keywords:[]}
    ], edges: []
  };
  const fixture = JSON.stringify({ source: 'server', writable: true, owned: true, momentId: 'm1', prefs: {}, tree });
  const host = '<!doctype html><html lang="ko"><meta charset="utf-8"><body><script>window.LT41='
    + fixture + '</script><iframe id="board-frame" src="/v41/views/track58-pinboard.html"'
    + ' style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe></body></html>';
  const server = await serve({ '/__board-wiring-1538.html': host });
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await page.goto(base + '/__board-wiring-1538.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const frame = document.getElementById('board-frame')?.contentWindow;
      return !!frame?.__LT58V12 && !!frame.document.querySelector('#cardLayer .card');
    }, null, { timeout: 20000 });
    const state = await page.evaluate(() => {
      const w = document.getElementById('board-frame').contentWindow;
      w.bindBoardEvents();
      w.bindBoardEvents();
      return {
        early: !!w.__LT58,
        middle: !!w.__LT58V11,
        late: !!w.__LT58V12,
        distinct: w.__LT58 !== w.__LT58V11 && w.__LT58V11 !== w.__LT58V12,
        momentsRef: w.__LT58.refs.moments === w.__LT58.moments,
        connectionsRef: w.__LT58.refs.connections === w.__LT58.connections,
        filters: typeof w.LT58Board?.filters?.collectPathFrom === 'function',
        wiring: typeof w.LT58Board?.wiring?.bindBoardEvents === 'function'
      };
    });
    assert.deepEqual(state, {
      early: true, middle: true, late: true, distinct: true,
      momentsRef: true, connectionsRef: true, filters: true, wiring: true
    });
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
