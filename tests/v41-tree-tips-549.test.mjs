// #549: '첫 트리를 만들었어요' 안내의 '알겠어요'가 순간 추가 창이 열려 있는 동안 눌리지 않았다.
// 원인은 빈 알림 요소가 아니라 순간 추가 창이 showModal()로 열려 창 밖 요소(#tree-tips 포함)가
// 전부 inert가 되었기 때문이다(창 위에 popover를 띄워도 이 크롬은 누름을 창에 막았다). 고친 뒤에는
// 모달 창이 열려 있는 동안 안내가 창 안 맨 위로 옮겨 뜨니 창이 열려 있어도 눌린다. 여기서는 실제
// 크롬으로 로그인 상태(가짜 /api/workspace 응답)까지 부팅해 첫 트리 안내가 뜬 상태에서
// (1) 순간 추가 창을 열면 안내가 창 안으로 옮겨 뜨는지, (2) 알겠어요가 눌려 안내가 닫히고 제자리로
// 돌아오는지, (3) 닫으면 다시 보여 주지 않는지 확인한다.
// 크롬(Playwright chromium)이 없는 곳에서는 건너뛴다 — 이유를 남긴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../public', import.meta.url)));
let chromium = null;
let skip = false;
// CI(미리보기 검사)에서는 LT_TREE_TIPS_549_REQUIRE=1 — 크롬이 준비된 잡에서 건너뜀을 실패로 본다.
const REQUIRE = process.env.LT_TREE_TIPS_549_REQUIRE === '1';
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

// 첫 트리 안내가 뜨는 상태 = 서버 기록에 트리 1개(순간 1개). 도메인 검증(validateState)을 통과하는 최소 모양.
const WORKSPACE = {
  revision: 1,
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
};

async function openWithFirstTree(page) {
  await page.route('**/api/workspace*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(WORKSPACE) }));
  await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
  // 첫 트리 안내가 실제 배선(syncTreeTips → showTreeTips)으로 뜰 때까지 기다린다.
  await page.waitForFunction(() => {
    const tips = document.getElementById('tree-tips');
    return tips && tips.hidden === false;
  }, null, { timeout: 20000 });
}

let server, base;

test.before(async () => { server = await serve(ROOT); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => new Promise((ok) => server.close(ok)));

test('#549 순간 추가 창이 열려 있어도 첫 트리 안내의 알겠어요가 눌린다', { skip: REQUIRE ? false : skip }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await openWithFirstTree(page);
    // 순간 추가 창을 실제 입구로 열어 본다 — 390에서는 화면 오른쪽 아래 ＋ 단추(#mobile-add)가 입구다.
    await page.click('#mobile-add');
    await page.waitForFunction(() => document.getElementById('write-panel').open, null, { timeout: 10000 });
    // 안내가 창 안 맨 위로 옮겨 뜬다(창 밖은 모달 창이 열려 있는 동안 눌리지 않음).
    const placed = await page.evaluate(() => {
      const tips = document.getElementById('tree-tips');
      const dialog = document.getElementById('write-panel');
      return tips.parentElement === dialog
        && tips.classList.contains('lt-tips-embedded')
        && getComputedStyle(tips).display !== 'none';
    });
    assert.equal(placed, true, '창이 열려 있는 동안 안내는 창 안 맨 위에 뜬다');
    // 실제 누름(히트 테스트 포함) — 고치기 전에는 모달 창이 누름을 가로채 안내가 닫히지 않았다.
    await page.click('#tree-tips-close');
    const closed = await page.evaluate(() => {
      const tips = document.getElementById('tree-tips');
      return tips.hidden === true && tips.parentElement === document.body && !tips.classList.contains('lt-tips-embedded');
    });
    assert.equal(closed, true, '창이 열려 있는 상태에서 알겠어요가 눌려 안내가 닫히고 제자리로 돌아온다');
    assert.deepEqual(errors, [], '페이지 오류 없음');
  } finally { await browser.close(); }
});

test('#549 알겠어요를 누르면 다시 보여 주지 않는다(기억)', { skip: REQUIRE ? false : skip }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await openWithFirstTree(page);
    await page.click('#tree-tips-close');
    const closed = await page.evaluate(() => {
      const tips = document.getElementById('tree-tips');
      return tips.hidden === true && tips.parentElement === document.body;
    });
    assert.equal(closed, true, '알겠어요를 누르면 안내가 닫히고 제자리로 돌아온다');
    const seen = await page.evaluate(() => localStorage.getItem('lt41.tips.firstTree'));
    assert.equal(seen, '1', '닫으면 기억한다');
  } finally { await browser.close(); }
});
