import { listenOnSafePort } from './helpers/safe-port.mjs';
import {clickToolbarTreeChoice,treeChoiceExpanded,treeChoiceFocused} from './helpers/tree-picker-pr3.mjs';
// #571(#549-2 대표 결정 '나'): '첫 트리를 만들었어요' 안내의 첫 항목을 '트리 이름은 지금 바꿀 수 있어요'로
// 바꾸고 [이름 바꾸기] 단추를 둔다(그림 549-mock-na-390.png). 단추는 트리 관리 창의
// 이름 칸을 바로 열고(openTreeManager가 이름 칸에 초점을 둔다), 이름을 바꾸면 머리줄 '트리: …'와
// 트리 관리 창의 이름 칸을 바로 열고(openTreeManager가 이름 칸에 초점을 둔다), 이름을 바꾸면 머리줄 '트리: …'와
// 트리 목록이 곧바로 바뀐다. 261118 대표 결정(#845 1단계)으로 창이 열려 있는 동안은 안내 판이 숨고
// (#566의 창 안 붙이기는 없어졌다), 창을 닫으면 다시 보인다 — '봇음'으로 적지 않는다. 실제 크롬으로
// 로그인 상태(가짜 /api/workspace 응답)까지 부팅해 확인한다. 크롬이 없는 곳에서는 건너뛴다 —
// CI(LT_TREE_RENAME_571_REQUIRE=1)에서는 건너뜀을 실패로 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRE = process.env.LT_TREE_RENAME_571_REQUIRE === '1';
let chromium = null;
let skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright chromium이 설치되어 있지 않아 건너뜀(npx playwright install chromium 뒤 실행)';
} catch {
  skip = 'playwright 패키지가 없어 건너뜀';
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
function serve(root) {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    for (const file of [path.join(root, clean), path.join(root, clean, 'index.html')]) {
      if (!file.startsWith(root)) continue;
      try { if ((await stat(file)).isFile()) { res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); createReadStream(file).pipe(res); return; } } catch {}
    }
    res.writeHead(404); res.end('not found');
  });
  return listenOnSafePort(server, '127.0.0.1').then(() => server);
}

// 첫 트리 안내가 뜨는 상태 = 서버 기록에 트리 1개(순간 1개, 자동 이름 '모아둔 순간').
const WORKSPACE = () => ({
  revision,
  subject: 'trial-subject',
  writeSubjectBound: true,
  state: {
    version: 1,
    prefs: {},
    trees: [{
      id: 'tree1', subject: '시험 사용자', title: '모아둔 순간', coverMomentId: '', inbox: false,
      createdAt: '2026-11-15T00:00:00.000Z', updatedAt: '2026-11-15T00:00:00.000Z',
      moments: [{
        id: 'm1', parentId: null, links: [], createdAt: '2026-11-15T00:00:00.000Z',
        title: '첫 순간', note: '처음 남기는 마음', emotion: '설렘', date: '2026-11-15', relation: '', url: '',
      }],
    }],
  },
});
// 저장(PUT)은 받은 상태를 그대로 인정한다 — 시험은 클라이언트가 먼저 바꾼 로컬 상태(머리줄)를 보며,
// 서버 응답이 옛 값으로 되돌리지 않게 revision만 올려 준다.
let revision = 1;

async function openWithFirstTree(page) {
  await page.route('**/api/workspace*', (route) => {
    const request = route.request();
    if (request.method() === 'PUT') {
      revision += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(WORKSPACE()) });
  });
  await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const tips = document.getElementById('tree-tips');
    return tips && tips.hidden === false;
  }, null, { timeout: 20000 });
}

let server, base;

test.before(async () => { server = await serve(path.resolve(fileURLToPath(new URL('../public', import.meta.url)))); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => new Promise((ok) => server.close(ok)));

test('#571 안내 첫 항목이 이름 바꾸기 안내로 바뀌고, [이름 바꾸기]가 트리 관리의 이름 칸을 연다(창 열림 동안 안내 숨깄 — #845)', { skip: REQUIRE ? false : skip, timeout: 60000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await openWithFirstTree(page);
    // 첫 항목·단추가 그림(나)대로인지
    const tips = await page.evaluate(() => ({
      first: document.querySelector('#tree-tips-list li strong')?.textContent,
      body: document.querySelector('#tree-tips-list li span')?.textContent,
      rename: document.getElementById('tree-tips-rename')?.textContent,
      close: document.getElementById('tree-tips-close')?.textContent,
    }));
    assert.equal(tips.first, '트리 이름은 지금 바꿀 수 있어요', '안내 첫 항목');
    assert.match(tips.body, /모아둔 순간/, '자동 이름을 말해 주는 설명');
    assert.equal(tips.rename, '이름 바꾸기');
    assert.equal(tips.close, '알겠어요');
    // [이름 바꾸기]로 트리 관리 창을 연다 — 창이 열려 있는 동안 안내 판은 숨는다(#845 1단계).
    await page.click('#tree-tips-rename');
    await page.waitForFunction(() => document.getElementById('tree-manager').open, null, { timeout: 10000 });
    const held = await page.evaluate(() => ({
      tips: document.getElementById('tree-tips').hidden,
      embedded: document.querySelectorAll('.lt-tips-embedded').length,
      seen: localStorage.getItem('lt41.tips.firstTree'),
    }));
    assert.deepEqual(held, { tips: true, embedded: 0, seen: null }, '트리 관리 창이 열려 있는 동안 안내 판 숨김·봇음 미기록');
    const manager = await page.evaluate(() => ({
      focused: document.activeElement === document.querySelector('#tree-form [name="title"]'),
      value: document.querySelector('#tree-form [name="title"]').value,
    }));
    assert.equal(manager.focused, true, '이름 칸에 초점이 옮겨 간다');
    assert.equal(manager.value, '모아둔 순간', '이름 칸에 지금 이름이 담겨 있다');
    // 이름을 바꿔 저장한다 → 머리줄 '트리: …'가 곧바로 바뀐다.
    await page.fill('#tree-form [name="title"]', '우리의 첫 가을');
    await page.click('#tree-form button[type="submit"]');
    await page.waitForFunction(() => document.getElementById('source-label')?.textContent.includes('우리의 첫 가을'), null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => document.getElementById('tree-manager').open), false, '저장하면 트리 관리 창이 닫힌다');
    // 창이 닫히면 안내 판이 다시 보인다 — 이름 바꾸기를 마쳐도 봇음으로 적지 않는다(#845·#571).
    await page.waitForFunction(() => document.getElementById('tree-tips').hidden === false, null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => localStorage.getItem('lt41.tips.firstTree')), null, '이름 바꾸기를 마쳐도 봇음 미기록');
    assert.deepEqual(errors, [], '페이지 오류 없음');
  } finally { await browser.close(); }
});

test('#571 바꾼 이름이 트리 목록에도 보이고, 알겠어요를 누르면 다시 안내하지 않는다', { skip: REQUIRE ? false : skip, timeout: 60000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await openWithFirstTree(page);
    await page.click('#tree-tips-rename');
    await page.waitForFunction(() => document.getElementById('tree-manager').open, null, { timeout: 10000 });
    await page.fill('#tree-form [name="title"]', '우리의 첫 가을');
    await page.click('#tree-form button[type="submit"]');
    await page.waitForFunction(() => document.getElementById('source-label')?.textContent.includes('우리의 첫 가을'), null, { timeout: 10000 });
    // 트리 목록(머리 트리 고르기 메뉴)에도 바뀐 이름이 보인다.
    await clickToolbarTreeChoice(page);
    await page.waitForFunction(() => document.getElementById('tree-popover')?.hidden === false, null, { timeout: 10000 });
    const rows = await page.evaluate(() => [...document.querySelectorAll('#tree-popover .tree-item .tree-name')].map((b) => b.textContent));
    assert.ok(rows.some((t) => t.includes('우리의 첫 가을')), `트리 목록에 바뀐 이름이 있다: ${rows.join(' · ')}`);
    // 트리 고르기 메뉴를 열면 안내가 숨는(닫히는) 규칙이 있어, 알겠어요 확인은 새로 부팅해 누른다.
    await page.reload({ waitUntil: 'load' });
    await openWithFirstTree(page);
    await page.click('#tree-tips-close');
    assert.equal(await page.evaluate(() => document.getElementById('tree-tips').hidden), true, '알겠어요로 안내가 닫힌다');
    assert.equal(await page.evaluate(() => localStorage.getItem('lt41.tips.firstTree')), '1', '닫으면 기억한다');
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(3000);
    assert.equal(await page.evaluate(() => document.getElementById('tree-tips').hidden), true, '다시 부팅해도 안내하지 않는다');
  } finally { await browser.close(); }
});

// 이슈 970: 표지 — 책 표지에 제목이 보이고 잘리지 않는다(390·1440 좌표 판정). 표지 바꾸기(서재 ⋯ → 트리 관리)를
// 열어 디자인을 고르면 저장·반영되고, 취소하면 그대로다. 가짜 작업장만 쓴다(운영 API·운영 계정 없음).
// LT_970_REQUIRE=1 일 때 실행(CI 화면 잡 — 건너뜀=실패).
const REQUIRE970 = process.env.LT_970_REQUIRE === '1';
const CLOCK970 = '2026-11-19T00:00:00.000Z';
const COVER_TREE = {
  id: 'tree1', subject: '리센느', title: '리센느의 기록', coverMomentId: '', coverDesign: '', inbox: false,
  createdAt: CLOCK970, updatedAt: CLOCK970,
  moments: [
    { id: 'm1', parentId: null, links: [], createdAt: CLOCK970, title: '첫 순간', note: '처음 남기는 마음', emotion: '설렘', date: '2026-11-19', relation: '', url: '' },
    { id: 'm2', parentId: 'm1', links: [], createdAt: CLOCK970, title: '두 번째 순간', note: '', emotion: '위로', date: '2026-11-19', relation: '이어서', url: '' },
  ],
};

test('970 실행: 표지 — 제목 보임·안 잘림(390·1440), 고르면 반영·취소하면 그대로', { skip: skip || !REQUIRE970 ? skip || 'LT_970_REQUIRE=1 일 때 실행' : false, timeout: 180000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const browser = await chromium.launch();
  try {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e.message || e)));
      // 가짜 작업장: PUT으로 받은 트리를 그대로 보관한다 — 다시 열어도 저장한 표지가 보여야 한다.
      let storedTree = JSON.parse(JSON.stringify(COVER_TREE));
      let rev = 1;
      const puts = [];
      const workspace = () => ({ ok: true, revision: rev, subject: '시험 사용자', writeSubjectBound: true, savedAt: CLOCK970, state: { version: 1, prefs: {}, trees: [storedTree] } });
      await page.route('**/api/workspace*', (route) => {
        const req = route.request();
        if (req.method() === 'PUT') {
          const body = JSON.parse(req.postData() || '{}');
          puts.push(body);
          const edited = body?.state?.trees?.find((t) => t.id === 'tree1');
          if (edited) storedTree = edited;
          rev += 1;
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision: rev }) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workspace()) });
      });
      await page.route('**/api/account', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, email: 't@t.test', name: '시험' }) }));
      const confirms = [];
      page.on('dialog', (d) => { confirms.push(d.message()); d.accept(); });
      const findShelf = async () => {
        let frame = null;
        for (let i = 0; i < 80 && !frame; i++) {
          frame = page.frames().find((f) => /views\/track32-bookshelf/.test(f.url()));
          if (!frame) await page.waitForTimeout(250);
        }
        assert.ok(frame, `${w}: 서재(책장) 프레임이 열린다`);
        await frame.waitForSelector('.book-card .cover-title', { timeout: 20000 });
        await page.waitForTimeout(800);
        return frame;
      };
      await page.goto(`${base}/v41/?account=1#my/shelf`, { waitUntil: 'load', timeout: 60000 });
      let frame = await findShelf();
      // ① 책 표지 제목 — 보이는 자리(표지 안·화면 안)에 있고 잘리지 않는다(좌표·스크롤 크기 판정).
      const cover = await frame.evaluate(() => {
        const title = document.querySelector('.book-card .cover-title');
        const box = document.querySelector('.book-card .book-cover');
        const t = title.getBoundingClientRect(), b = box.getBoundingClientRect();
        return {
          text: title.textContent.trim(),
          insideCover: t.left >= b.left - 1 && t.top >= b.top - 1 && t.right <= b.right + 1 && t.bottom <= b.bottom + 1,
          insideScreen: t.left >= 0 && t.top >= 0 && t.right <= innerWidth && t.bottom <= innerHeight,
          clipped: title.scrollHeight > title.clientHeight + 1 || title.scrollWidth > title.clientWidth + 1,
          w: Math.round(t.width), h: Math.round(t.height),
        };
      });
      assert.equal(cover.text, '리센느의 기록', `${w}: 표지 제목 글자`);
      assert.equal(cover.insideCover, true, `${w}: 제목이 표지 안에 있다 ${JSON.stringify(cover)}`);
      assert.equal(cover.insideScreen, true, `${w}: 제목이 화면 안에 있다`);
      assert.equal(cover.clipped, false, `${w}: 제목이 잘리지 않는다(보이는 폭·높이 ${cover.w}×${cover.h})`);
      // ② 표지 바꾸기 — 서재 ⋯ → 트리 관리 → 디자인 고르기 → 저장.
      const openManager = async () => {
        await frame.locator('.book-card').first().hover();
        await frame.locator('.book-manage[data-manage-id="tree1"]').click();
        await page.waitForFunction(() => document.getElementById('tree-manager')?.open === true, null, { timeout: 10000 });
      };
      await openManager();
      await page.evaluate(() => {
        document.querySelector('#tree-form input[name="coverMode"][value="design"]').click();
        document.querySelector('#tree-form input[name="coverDesign"][value="texture-3"]').click();
      });
      await page.click('#tree-form button[type="submit"]');
      await page.waitForFunction(() => document.getElementById('tree-manager').open === false, null, { timeout: 10000 });
      for (let i = 0; i < 40 && puts.length < 1; i++) await page.waitForTimeout(250);
      assert.equal(puts.length, 1, `${w}: 저장은 한 번(PUT)`);
      const savedTree = puts[0]?.state?.trees?.find((t) => t.id === 'tree1');
      assert.equal(savedTree?.coverMode, 'design', `${w}: 저장한 표지 방법은 디자인`);
      assert.equal(savedTree?.coverDesign, 'texture-3', `${w}: 저장한 디자인은 texture-3`);
      // ③ 반영 — 머리줄 트리 목록의 표지는 고른 디자인으로 바로 보인다.
      if (w === 1440) {
        await clickToolbarTreeChoice(page);
        await page.waitForFunction(() => document.getElementById('tree-popover')?.hidden === false, null, { timeout: 10000 });
        const listDesign = await page.evaluate(() => {
          const row = [...document.querySelectorAll('#tree-popover .tree-item')].find((r) => r.textContent.includes('리센느의 기록'));
          return row?.querySelector('.tree-cover')?.getAttribute('data-cover-design') || '';
        });
        assert.equal(listDesign, 'texture-3', `${w}: 트리 목록 표지가 고른 디자인으로 반영`);
        await page.keyboard.press('Escape');
      }
      // 서재 책 표지 — #984: 저장 직후(다시 열기 없이) 라이브 값이 새 디자인이어야 한다.
      await frame.waitForFunction(() => document.querySelector('.book-card .book-cover')?.getAttribute('data-cover-design') === 'texture-3', null, { timeout: 10000 });
      await page.reload({ waitUntil: 'load' });
      frame = await findShelf();
      const afterDesign = await frame.evaluate(() => document.querySelector('.book-card .book-cover')?.getAttribute('data-cover-design') || '');
      assert.equal(afterDesign, 'texture-3', `${w}: 다시 열면 표지가 저장한 디자인으로 보인다`);
      // ④ 취소 — 다른 디자인을 고르고 닫으면 한 번 묻고, 저장 없이 그대로다.
      await openManager();
      const preChecked = await page.evaluate(() => document.querySelector('#tree-form input[name="coverDesign"]:checked')?.value || '');
      assert.equal(preChecked, 'texture-3', `${w}: 창을 다시 열면 저장한 디자인이 checked`);
      await page.evaluate(() => {
        document.querySelector('#tree-form input[name="coverDesign"][value="texture-5"]').click();
      });
      // #978: 닫기 확인은 앱 안 틀(#lt-close-confirm)이다 — 예를 눌러 닫는다(저장 없음).
      await page.keyboard.press('Escape');
      await page.waitForSelector('#lt-close-confirm[open]', { timeout: 8000 });
      assert.match(await page.locator('#lt-close-confirm-title').textContent(), /저장하지 않고 닫을까요/, `${w}: 쓰던 내용이 있으면 닫기 전 한 번 묻는다`);
      await page.click('#lt-close-confirm-yes');
      await page.waitForFunction(() => document.getElementById('tree-manager').open === false, null, { timeout: 10000 });
      assert.equal(puts.length, 1, `${w}: 취소는 저장하지 않는다`);
      const keptDesign = await frame.evaluate(() => document.querySelector('.book-card .book-cover')?.getAttribute('data-cover-design') || '');
      assert.equal(keptDesign, 'texture-3', `${w}: 취소하면 표지가 그대로다`);
      assert.deepEqual(errors, [], `${w}: 페이지 오류 없음`);
      await page.close();
    }
  } finally { await browser.close(); }
});

// 이슈 984: 표지 저장 직후 반영 — 서재 책장과 열린 책(리더)이 다시 열기 없이 새 표지로 바뀐다.
// 저장 실패(가짜 500)면 원래 표지 그대로 + 셸의 기존 저장 안내 떠가 실패를 알린다.
// 가짜 작업장·가짜 응답만 쓴다(운영 API·운영 계정 없음). 390·1440.
// LT_TREE_RENAME_571_REQUIRE=1 일 때 실행(CI 첫 트리 안내 잡 — 건너뜀=실패).
async function findShelfFrame984(page, w) {
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) {
    frame = page.frames().find((f) => /views\/track32-bookshelf/.test(f.url()));
    if (!frame) await page.waitForTimeout(250);
  }
  assert.ok(frame, `${w}: 서재(책장) 프레임이 열린다`);
  await frame.waitForSelector('.book-card .cover-title', { timeout: 20000 });
  await page.waitForTimeout(800);
  return frame;
}

function mockWorkspace984(page, { storedTree, puts, failPut }) {
  let rev = 1;
  const workspace = () => ({ ok: true, revision: rev, subject: '시험 사용자', writeSubjectBound: true, savedAt: CLOCK970, state: { version: 1, prefs: {}, trees: [storedTree.tree] } });
  return page.route('**/api/workspace*', (route) => {
    const req = route.request();
    if (req.method() === 'PUT') {
      const body = JSON.parse(req.postData() || '{}');
      puts.push(body);
      if (failPut) {
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'server_error', message: '가짜 서버 오류' } }) });
      }
      const edited = body?.state?.trees?.find((t) => t.id === 'tree1');
      if (edited) storedTree.tree = edited;
      rev += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision: rev }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workspace()) });
  });
}

async function pickDesign984(page, design) {
  await page.waitForFunction(() => document.getElementById('tree-manager')?.open === true, null, { timeout: 10000 });
  await page.evaluate((value) => {
    document.querySelector('#tree-form input[name="coverMode"][value="design"]').click();
    document.querySelector(`#tree-form input[name="coverDesign"][value="${value}"]`).click();
  }, design);
  await page.click('#tree-form button[type="submit"]');
  await page.waitForFunction(() => document.getElementById('tree-manager').open === false, null, { timeout: 10000 });
}

test('984 실행: 표지 — 저장 직후 서재·열린 책 반영, 실패하면 원래 표지·안내(390·1440)', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const browser = await chromium.launch();
  try {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      // ① 저장 성공 → 서재 책장 표지가 새로고침 없이 바로 새 값.
      {
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e.message || e)));
        const storedTree = { tree: JSON.parse(JSON.stringify(COVER_TREE)) };
        const puts = [];
        await mockWorkspace984(page, { storedTree, puts, failPut: false });
        await page.route('**/api/account', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, email: 't@t.test', name: '시험' }) }));
        await page.goto(`${base}/v41/?account=1#my/shelf`, { waitUntil: 'load', timeout: 60000 });
        const frame = await findShelfFrame984(page, w);
        const before = await frame.evaluate(() => document.querySelector('.book-card .book-cover')?.getAttribute('data-cover-design') || '');
        assert.equal(before, '', `${w}: 처음 표지는 디자인 없음(기본)`);
        await frame.locator('.book-card').first().hover();
        await frame.locator('.book-manage[data-manage-id="tree1"]').click();
        await pickDesign984(page, 'texture-3');
        for (let i = 0; i < 40 && puts.length < 1; i++) await page.waitForTimeout(250);
        assert.equal(puts.length, 1, `${w}: 저장은 한 번(PUT)`);
        assert.equal(puts[0]?.state?.trees?.find((t) => t.id === 'tree1')?.coverDesign, 'texture-3', `${w}: 저장한 디자인은 texture-3`);
        await frame.waitForFunction(() => document.querySelector('.book-card .book-cover')?.getAttribute('data-cover-design') === 'texture-3', null, { timeout: 10000 });
        assert.deepEqual(errors, [], `${w}: 페이지 오류 없음(성공)`);
        await page.close();
      }
      // ② 열린 책(리더) — 저장 성공 직후 표지가 새 값. 책 화면으로의 넘어감을 가짜 응답으로 늦춰 리더를 관찰한다.
      {
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e.message || e)));
        const storedTree = { tree: { ...JSON.parse(JSON.stringify(COVER_TREE)), coverMode: 'design', coverDesign: 'texture-3' } };
        const puts = [];
        await mockWorkspace984(page, { storedTree, puts, failPut: false });
        await page.route('**/api/account', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, email: 't@t.test', name: '시험' }) }));
        await page.route('**/views/track59-sketchbook.html*', async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 10000));
          await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html lang="ko"><head><title>책</title></head><body>책</body></html>' });
        });
        await page.goto(`${base}/v41/?account=1#my/shelf`, { waitUntil: 'load', timeout: 60000 });
        const frame = await findShelfFrame984(page, w);
        // #1094: 기본(책) 방식은 서재에서 바로 책으로 가므로, 열린 책(목록)을 관찰하려면 설정에서 목록을 택한다(머리줄 토글은 책 화면 줄로 옮겨졌다).
        await page.click('#account-avatar');
        await page.click('#account-open-settings');
        await page.click('#account-settings [data-book-display="list"]');
        await page.waitForFunction(() => window.LT41?.prefs?.bookDisplay === 'list', null, { timeout: 10000 });
        await page.click('#account-settings [data-close="account-settings"]');
        await frame.locator('.book-card button[data-book-id="tree1"]').click();
        await frame.waitForSelector('#readerScreen.active', { timeout: 10000 });
        const readerBefore = await frame.evaluate(() => document.getElementById('bookCoverFace')?.getAttribute('data-cover-design') || '');
        assert.equal(readerBefore, 'texture-3', `${w}: 열린 책 표지는 저장된 디자인`);
        await clickToolbarTreeChoice(page);
        await page.waitForFunction(() => document.getElementById('tree-popover')?.hidden === false, null, { timeout: 10000 });
        await page.click('#tree-popover [data-tree-action="manage"]');
        await pickDesign984(page, 'texture-5');
        for (let i = 0; i < 40 && puts.length < 1; i++) await page.waitForTimeout(250);
        assert.equal(puts.length, 1, `${w}: 저장은 한 번(PUT)`);
        await frame.waitForFunction(() => document.getElementById('bookCoverFace')?.getAttribute('data-cover-design') === 'texture-5', null, { timeout: 8000 });
        await frame.waitForFunction(() => document.querySelector('.book-card .book-cover')?.getAttribute('data-cover-design') === 'texture-5', null, { timeout: 8000 });
        assert.deepEqual(errors, [], `${w}: 페이지 오류 없음(열린 책)`);
        await page.close();
      }
      // ③ 저장 실패(가짜 500) → 원래 표지 그대로 + 기존 저장 안내 떠. 새로고침 없음.
      {
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e.message || e)));
        const storedTree = { tree: JSON.parse(JSON.stringify(COVER_TREE)) };
        const puts = [];
        await mockWorkspace984(page, { storedTree, puts, failPut: true });
        await page.route('**/api/account', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, email: 't@t.test', name: '시험' }) }));
        await page.goto(`${base}/v41/?account=1#my/shelf`, { waitUntil: 'load', timeout: 60000 });
        const frame = await findShelfFrame984(page, w);
        await page.evaluate(() => { window.__lt984Page = 'kept'; });
        await frame.evaluate(() => { window.__lt984Frame = 'kept'; });
        await frame.locator('.book-card').first().hover();
        await frame.locator('.book-manage[data-manage-id="tree1"]').click();
        await pickDesign984(page, 'texture-3');
        for (let i = 0; i < 40 && puts.length < 1; i++) await page.waitForTimeout(250);
        assert.equal(puts.length, 1, `${w}: 저장은 한 번 시도(PUT)`);
        await page.waitForFunction(() => document.getElementById('save-feedback')?.hidden === false, null, { timeout: 10000 });
        const message = await page.evaluate(() => document.getElementById('save-message')?.textContent || '');
        assert.match(message, /서버에 저장되지 않았어요/, `${w}: 기존 실패 안내 문구`);
        const retry = await page.evaluate(() => [...document.querySelectorAll('#save-actions button')].some((b) => b.textContent.includes('다시 시도')));
        assert.equal(retry, true, `${w}: 실패 안내에 다시 시도 단추`);
        const kept = await frame.evaluate(() => document.querySelector('.book-card .book-cover')?.getAttribute('data-cover-design') || '');
        assert.equal(kept, '', `${w}: 실패하면 원래 표지 그대로`);
        assert.equal(await page.evaluate(() => window.__lt984Page), 'kept', `${w}: 페이지 새로고침 없음`);
        assert.equal(await frame.evaluate(() => window.__lt984Frame), 'kept', `${w}: 책장 프레임 새로고침 없음`);
        assert.deepEqual(errors, [], `${w}: 페이지 오류 없음(실패)`);
        await page.close();
      }
    }
  } finally { await browser.close(); }
});

// 이슈 984 후속: 이름 바꾸기 알림(lt41-trees-renamed)도 표지 알림과 같은 원인이었다 — 셸의 frames()는
// iframe 요소를 돌려주는데 f?.postMessage로 보내려다 TypeError가 나고 catch에 삼켜져 한 번도 나가지 않았다.
// 트리 관리에서 이름만 바꾸면 서재 책 제목이 다시 열기 없이 바로 바뀌어야 한다(프레임 새로고침 없음).
// 가짜 작업장·가짜 응답만 쓴다(운영 API·운영 계정 없음). LT_TREE_RENAME_571_REQUIRE=1 일 때 실행. 390·1440.
test('984 이름 바꾸기 실행: 트리 관리에서 이름 저장 → 서재 책 제목이 다시 열기 없이 바로 바뀜(390·1440)', { skip: REQUIRE ? false : skip, timeout: 180000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const browser = await chromium.launch();
  try {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e.message || e)));
      const storedTree = { tree: JSON.parse(JSON.stringify(COVER_TREE)) };
      const puts = [];
      await mockWorkspace984(page, { storedTree, puts, failPut: false });
      await page.route('**/api/account', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, email: 't@t.test', name: '시험' }) }));
      await page.goto(`${base}/v41/?account=1#my/shelf`, { waitUntil: 'load', timeout: 60000 });
      const frame = await findShelfFrame984(page, w);
      await frame.evaluate(() => {
        window.__lt984RenameFrame = 'kept';
        // 이름 바꾸기 알림이 실제로 서재에 도착하는지 센다(표지 알림과 별개의 길 — 190줄 수리의 계약).
        window.__lt984RenamedMsgs = 0;
        addEventListener('message', (e) => { if (e.data?.type === 'lt41-trees-renamed') window.__lt984RenamedMsgs += 1; });
      });
      const before = await frame.evaluate(() => document.querySelector('.book-card .cover-title')?.textContent || '');
      assert.equal(before, '리센느의 기록', `${w}: 처음 책 제목`);
      await frame.locator('.book-card').first().hover();
      await frame.locator('.book-manage[data-manage-id="tree1"]').click();
      await page.waitForFunction(() => document.getElementById('tree-manager')?.open === true, null, { timeout: 10000 });
      await page.evaluate(() => {
        const input = document.querySelector('#tree-form input[name="title"]');
        input.value = '바뀐 트리 이름';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.click('#tree-form button[type="submit"]');
      await page.waitForFunction(() => document.getElementById('tree-manager').open === false, null, { timeout: 10000 });
      for (let i = 0; i < 40 && puts.length < 1; i++) await page.waitForTimeout(250);
      assert.equal(puts.length, 1, `${w}: 저장은 한 번(PUT)`);
      assert.equal(puts[0]?.state?.trees?.find((t) => t.id === 'tree1')?.title, '바뀐 트리 이름', `${w}: 저장한 이름`);
      await frame.waitForFunction(() => window.__lt984RenamedMsgs >= 1, null, { timeout: 10000 });
      await frame.waitForFunction(() => document.querySelector('.book-card .cover-title')?.textContent === '바뀐 트리 이름', null, { timeout: 10000 });
      assert.equal(await frame.evaluate(() => window.__lt984RenameFrame), 'kept', `${w}: 책장 프레임 새로고침 없음`);
      assert.deepEqual(errors, [], `${w}: 페이지 오류 없음`);
      await page.close();
    }
  } finally { await browser.close(); }
});

// #1001 (b)②: 표지 바꾸기 — 업로드 → 추가(add) 뒤에 추가 화면만 뜨고, 표지 편집(editTree)은
// 모델만 갱신해야 한다(재적재 0회).
// 전: 업로드로 추가 재적재 + 표지 편집도 재적재 = 2회(같은 흐름에서). 후: 추가 1회 + 편집 0회 = 1회.
test('970/1001b-2 실행: 표지 사진 올리기 — 저장 뒤 재적재 1회(편집은 모델만 갱신)', { skip: skip || !REQUIRE970 ? skip || 'LT_970_REQUIRE=1 일 때 실행' : false, timeout: 240000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const { createTree } = await import('../public/v41/domain.mjs');
  const COVER_TREE = {
    id: 'tree1', subject: '리센느', title: '리센느의 기록', coverMomentId: '', coverDesign: '', inbox: false,
    createdAt: '2026-11-19T00:00:00.000Z', updatedAt: '2026-11-19T00:00:00.000Z',
    moments: [
      { id: 'm1', parentId: null, links: [], createdAt: '2026-11-19T00:00:00.000Z', title: '첫 순간', note: '처음 남기는 마음', emotion: '설렘', date: '2026-11-19', relation: '', url: '' },
      { id: 'm2', parentId: 'm1', links: [], createdAt: '2026-11-19T00:00:00.000Z', title: '두 번째 순간', note: '', emotion: '위로', date: '2026-11-19', relation: '이어서', url: '' },
    ],
  };
  const { serve } = await import('./helpers/screen-audit.mjs');
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    let tree = createTree(COVER_TREE);
    let rev = 1; const puts = [];
    await ctx.route('**/api/**', r => {
      if (r.request().url().includes('/api/account')) {
        // ② #1001: 계정 정보(주제 이름)를 줘서 업로드가 진행되게 한다
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, subject: 'test-account' }) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' });
    });
    await ctx.route('**/api/media*', async r => {
      // ② #1001: 업로드(POST) 통과 후 onUploaded(url) 로 표지 생성(steps 은 샌드박스에서 가정)
      if (r.request().method() === 'POST') {
        // api.mjs call()은 media:payload 전체를 반환하므로 url이 본문 최상위에 있어야 한다.
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: `${base}/api/media/cover-test.png`, name: 'cover-test.png' }) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' });
    });
    await ctx.route('**/api/media/cover-test.png**', r => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", 'base64') }));
    await ctx.route('**/api/workspace**', r => {
      const req = r.request();
      const body = JSON.parse(req.postData() || '{}');
      if (req.method() === 'PUT') {
        puts.push({ at: Date.now() });
        const edited = body?.state?.trees?.find(t => t.id === tree.id);
        if (edited) tree = edited;
        rev += 1;
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision: rev, subject: 'test-account' }) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision: rev, subject: 'test-account', writeSubjectBound: true, savedAt: '2026-11-20T00:00:00.000Z', source: 'server', state: { version: 1, trees: [JSON.parse(JSON.stringify(tree))], prefs: {} } }) });
    });
    const page = await ctx.newPage();
    const navs = [];
    let counting = false;
    page.on('framenavigated', f => { if (counting && /\/v41\/(views\/|home\.html)/.test(f.url())) navs.push({ url: f.url(), at: Date.now() }); });
    await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
    await page.locator('.tree-views [data-view="track59-sketchbook.html"]').click();
    await page.waitForFunction(() => document.querySelector('[data-popover-target="quick-add"]') === null, null, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(900);
    // 트리 관리 창 → 사진 표지 모드 → 올리기
    await clickToolbarTreeChoice(page);
    await page.waitForFunction(() => document.getElementById('tree-popover')?.hidden === false, null, { timeout: 10000 });
    await page.click('[data-tree-action="manage"]');
    await page.waitForFunction(() => document.getElementById('tree-manager').open, null, { timeout: 10000 });
    await page.evaluate(() => {
      const radio = document.querySelector('[name="coverMode"][value="photo"]');
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));  // 라벨 span 이 덮으므로 JS 로 change 전파
    });
    await page.waitForFunction(() => !document.getElementById('tree-cover-upload')?.hidden, null, { timeout: 5000 });
    await page.waitForFunction(() => document.getElementById('empty-records')?.textContent === '＋ 첫 트리 만들기', null, { timeout: 25000 }).catch(() => {});  // writable 준비 대기
    counting = true;
    await page.locator('#tree-form [data-media-file]').setInputFiles({ name: 'cover-test.png', mimeType: 'image/png', buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", 'base64') });
    const waitPuts = (n) => new Promise((res, rej) => { const t0 = Date.now(); const iv = setInterval(() => { if (puts.length >= n) { clearInterval(iv); res(); } else if (Date.now() - t0 > 25000) { clearInterval(iv); rej(new Error('PUT 대기 초과')); } }, 100); });
    await waitPuts(1);
    await page.waitForTimeout(3000);
    const state = await page.evaluate(() => ({
      moments: window.LT41?.tree?.moments?.length,
      coverMomentId: window.LT41?.tree?.coverMomentId,
      coverMode: window.LT41?.tree?.moments?.find(m => m.id === window.LT41?.tree?.coverMomentId)?.url || '',
    }));
    assert.equal(navs.length, 1, `표지 올리기 흐름에서 화면 재적재는 1회여야 한다(실측 ${navs.length}): ${JSON.stringify(navs)}`);
    assert.equal(state.moments, 2, '표지 추가로 순간이 늘어난다(루트 1 + 사진 순간 1 — 추가 동작 발동)');
    assert.ok(state.coverMomentId !== '', '추가된 순간이 표지로 지정된다');
    assert.ok(state.coverMode.includes('/api/media/cover-test.png'), '사진 표지 순간(모델)이 화면에 반영된다');
    // 표지 편집(editTree)이 모델 전용인지 직접 확인 — 추가(add)의 재적재가 끝난 뒤 이름만 바꿔 저장하면
    // 책 문서는 그대로여야 한다. 이 검사가 없으면 빠른 흐름에서 두 재적재가 겹쳐 1로 보여 회귀를 놓친다.
    const bookFrame = page.frames().find(f => /views\/track59-sketchbook/.test(f.url()));
    assert.ok(bookFrame, '표지 추가 뒤 책 프레임이 열려 있다');
    await bookFrame.evaluate(() => { window.__coverDoc1001 = 'alive'; });
    await page.fill('#tree-form [name="title"]', '표지 바꾼 트리');
    await page.evaluate(() => document.getElementById('tree-form').requestSubmit());
    await page.waitForTimeout(2500);
    const keptDoc = await bookFrame.evaluate(() => window.__coverDoc1001 || null);
    assert.equal(keptDoc, 'alive', '표지·이름 편집(editTree)은 화면을 다시 띄우지 않는다(모델만 갱신)');
    assert.equal(navs.length, 1, `이름 편집 뒤에도 재적재는 1회(추가 때만)여야 한다(실측 ${navs.length})`);
    await ctx.close();
  } finally { await browser.close(); server.close(); }
});
