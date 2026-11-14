// #571(#549-2 대표 결정 '나'): '첫 트리를 만들었어요' 안내의 첫 항목을 '트리 이름은 지금 바꿀 수 있어요'로
// 바꾸고 [이름 바꾸기] 단추를 둔다(그림 E:\lovetree-qa\549\549-mock-na-390.png). 단추는 트리 관리 창의
// 이름 칸을 바로 열고(openTreeManager가 이름 칸에 초점을 둔다), 이름을 바꾸면 머리줄 '트리: …'와
// 트리 목록이 곧바로 바뀐다. 순간 추가 창(showModal)이 열려 있는 동안에도 눌린다 — 안내는 #566의
// placeTreeTips로 창 안으로 옮겨 뜨기 때문이다. 실제 크롬으로 로그인 상태(가짜 /api/workspace 응답)까지
// 부팅해 확인한다. 크롬이 없는 곳에서는 건너뛴다 — CI(LT_TREE_RENAME_571_REQUIRE=1)에서는 건너뜀을 실패로 본다.
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
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
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
      id: 'tree1', subject: '윤제', title: '모아둔 순간', coverMomentId: '', inbox: false,
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

test('#571 안내 첫 항목이 이름 바꾸기 안내로 바뀌고, 창이 열려 있어도 [이름 바꾸기]가 트리 관리의 이름 칸을 연다', { skip: REQUIRE ? false : skip, timeout: 60000 }, async () => {
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
    // 순간 추가 창을 연다(#566: 안내가 창 안으로 옮겨 뜬다) — 이 상태에서 이름 바꾸기를 누른다.
    await page.click('#mobile-add');
    await page.waitForFunction(() => document.getElementById('write-panel').open, null, { timeout: 10000 });
    await page.click('#tree-tips-rename');
    await page.waitForFunction(() => document.getElementById('tree-manager').open, null, { timeout: 10000 });
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
    await page.click('#record-menu');
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
