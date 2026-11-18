// #549: '첫 트리를 만들었어요' 안내와 모달 창의 관계. 원래 #566은 창이 열려 있는 동안 안내를 창 안
// 맨 위로 옮겨 붙였지만, 안내 판이 창 내용 위에 포개지는 일이 반복됐다(#845·#846 사용 일지 — 순간 추가·
// 내 의견 창, PR #851 캡처). 261118 대표 결정(#845 1단계): 창 안으로 옮기지 않고, 모달 창이 하나라도
// 열려 있는 동안은 안내 판을 숨기고, 창이 모두 닫히면 다시 보인다 — 이때 '봇음'으로 적지 않는다.
// 여기서는 실제 크롬으로 로그인 상태(가짜 /api/workspace 응답)까지 부팅해 첫 트리 안내가 뜬 상태에서
// (1) 순간 추가 창을 열면 안내 판이 숨는지(창 안으로 옮겨지지 않는지), (2) 창을 닫으면 다시 보이는지,
// (3) 내 의견 창도 같은지, (4) 알겠어요를 눌러 닫으면 다시 보여 주지 않는지 확인한다.
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
      id: 'tree1', subject: '시험 사용자', title: '모아둔 순간', coverMomentId: '', inbox: false,
      createdAt: '2026-11-15T00:00:00.000Z', updatedAt: '2026-11-15T00:00:00.000Z',
      moments: [{
        id: 'm1', parentId: null, links: [], createdAt: '2026-11-15T00:00:00.000Z',
        title: '첫 순간', note: '처음 남기는 마음', emotion: '설렘', date: '2026-11-15', relation: '', url: '',
      }],
    }],
  },
};

// #619-5: 트리가 2개고 순간이 26개인 계정. 첫 트리 안내가 뜨지 않아야 한다.
const WORKSPACE_TWO_TREES_26_MOMENTS = {
  revision: 1,
  subject: 'trial-subject',
  writeSubjectBound: true,
  state: {
    version: 1,
    prefs: {},
    trees: [
      {
        id: 'tree1', subject: '시험 사용자', title: '모아둔 순간', coverMomentId: '', inbox: false,
        createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-15T00:00:00.000Z',
        moments: Array.from({ length: 13 }, (_, i) => ({
          id: `m${i + 1}`, parentId: null, links: [], createdAt: `2026-11-${(i % 28) + 1 < 10 ? '0' + (i % 28) + 1 : i % 28 + 1}T00:00:00.000Z`,
          title: `순간 ${i + 1}`, note: '', emotion: '기쁨', date: `2026-11-${(i % 28) + 1}`, relation: '', url: '',
        })),
      },
      {
        id: 'tree2', subject: '시험 사용자', title: '리센느', coverMomentId: '', inbox: false,
        createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-15T00:00:00.000Z',
        moments: Array.from({ length: 13 }, (_, i) => ({
          id: `m${i + 14}`, parentId: null, links: [], createdAt: `2026-11-${(i % 28) + 1 < 10 ? '0' + (i % 28) + 1 : i % 28 + 1}T00:00:00.000Z`,
          title: `리센느 순간 ${i + 1}`, note: '', emotion: '설렘', date: `2026-11-${(i % 28) + 1}`, relation: '', url: '',
        })),
      },
    ],
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

// #619-5: 트리가 2개이고 순간이 26개인 계정은 첫 트리 안내가 뜨지 않아야 한다.
async function openWithTwoTrees26(page) {
  await page.route('**/api/workspace*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(WORKSPACE_TWO_TREES_26_MOMENTS) }));
  await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
  // 첫 트리 안내가 절대로 뜨지 않아야 한다.
  await page.waitForFunction(() => {
    const tips = document.getElementById('tree-tips');
    return tips && tips.hidden === true;
  }, null, { timeout: 5000 });
}

let server, base;

test.before(async () => { server = await serve(ROOT); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => new Promise((ok) => server.close(ok)));

test('#549+#845 순간 추가 창을 열면 안내 판이 숨고, 닫으면 다시 보인다(봇음 미기록)', { skip: REQUIRE ? false : skip }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await openWithFirstTree(page);
    // 순간 추가 창을 실제 입구로 열어 본다 — 390에서는 화면 오른쪽 아래 ＋ 단추(#mobile-add)가 입구다.
    await page.click('#mobile-add');
    await page.waitForFunction(() => document.getElementById('write-panel').open, null, { timeout: 10000 });
    // 창이 열려 있는 동안 안내 판은 숨는다 — 창 안으로 옮겨지지 않는다(#845 1단계).
    const held = await page.evaluate(() => ({
      tips: document.getElementById('tree-tips').hidden,
      parent: document.getElementById('tree-tips').parentElement === document.body,
      embedded: document.querySelectorAll('.lt-tips-embedded').length,
      seen: localStorage.getItem('lt41.tips.firstTree'),
    }));
    assert.deepEqual(held, { tips: true, parent: true, embedded: 0, seen: null }, '창이 열려 있는 동안 안내 판 숨김·창 안 붙이기 없음·봇음 미기록');
    // 창을 닫으면 안내 판이 다시 보인다 — 봇음으로 적지 않았으므로.
    await page.click('#write-panel button[data-close="write-panel"]');
    await page.waitForFunction(() => !document.getElementById('write-panel').open && document.getElementById('tree-tips').hidden === false, null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => localStorage.getItem('lt41.tips.firstTree')), null, '미룼다고 봇음으로 적지 않는다');
    // 알겠어요를 누르면 닫히고 기억한다(#549 본래 규칙).
    await page.click('#tree-tips-close');
    assert.equal(await page.evaluate(() => document.getElementById('tree-tips').hidden), true, '알겠어요로 안내가 닫힌다');
    assert.equal(await page.evaluate(() => localStorage.getItem('lt41.tips.firstTree')), '1', '닫으면 기억한다');
    assert.deepEqual(errors, [], '페이지 오류 없음');
  } finally { await browser.close(); }
});

test('#845 2단계 뒤로가기는 창을 닫는다(주소 그대로·초점은 연 단추로)', { skip: REQUIRE ? false : skip }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__log=[];const st=()=>{new MutationObserver((ms)=>{for(const m of ms)if(m.target.id==='tree-tips')window.__log.push(m.target.getAttribute('hidden'))}).observe(document,{subtree:true,attributes:true,attributeFilter:['hidden']})};if(document.documentElement)st();else document.addEventListener('readystatechange',st,{once:true});" });
    await openWithFirstTree(page);
    const before = page.url();
    await page.click('#write-menu');
    await page.waitForFunction(() => document.getElementById('write-panel').open, null, { timeout: 10000 });
    // 뒤로가기 → 창이 닫히고 주소는 그대로다(✕·Esc와 같은 판정을 탄다).
    await page.evaluate(() => history.back());
    // 창이 닫히고 안내 판이 다시 보이는 최종 상태를 기다린다(닫힘 직후 한 박자 늦게 다시 띄우는 판이 있어도 기다린다).
    await page.waitForFunction(() => !document.getElementById('write-panel').open && document.getElementById('tree-tips').hidden === false, null, { timeout: 10000 });
    const after = await page.evaluate(() => ({
      url: location.href,
      panelOpen: document.getElementById('write-panel').open,
      focused: document.activeElement?.id || '',
      tips: document.getElementById('tree-tips').hidden,
      seen: localStorage.getItem('lt41.tips.firstTree'),
    }));
    assert.equal(after.url, before, '주소가 뒤로 가지 않는다(창 닫기로 쓴다)');
    assert.equal(after.panelOpen, false, '뒤로가기로 창이 닫힌다');
    assert.equal(after.focused, 'write-menu', '창을 연 단추로 초점이 돌아온다');
    assert.equal(after.tips, false, '창이 닫혔으므로 안내 판이 다시 보인다');
    assert.equal(after.seen, null, '봇음 미기록');
    // 창이 없어진 뒤에는 뒤로가기가 원래대로 주소를 뒤로 간다.
    await page.evaluate(() => history.back());
    await page.waitForTimeout(500);
    assert.notEqual(page.url(), before, '창이 없으면 뒤로가기는 주소를 뒤로 간다');
    assert.deepEqual(errors, [], '페이지 오류 없음');
  } finally { await browser.close(); }
});

test('#845 2단계 더러운 창은 뒤로가기로 닫을 때 한 번 묻는다(✕·Esc와 같은 판정)', { skip: REQUIRE ? false : skip }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await openWithFirstTree(page);
    const before = page.url();
    await page.click('#write-menu');
    await page.waitForFunction(() => document.getElementById('write-panel').open, null, { timeout: 10000 });
    // 제목을 적어 더럽힌다 — 닫을 때 '저장하지 않고 닫을까요?'를 묻는다(#380 4 규칙).
    await page.fill('#quick-url', 'https://example.com/back-check');
    // 취소하면 창이 남고, 가드가 다시 쌓여 다음 뒤로가기도 같은 질문을 한다.
    page.once('dialog', (d) => d.dismiss());
    await page.evaluate(() => history.back());
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => document.getElementById('write-panel').open), true, '확인을 취소하면 창이 남는다');
    // 받아들이면 닫힌다.
    page.once('dialog', (d) => d.accept());
    await page.evaluate(() => history.back());
    await page.waitForFunction(() => !document.getElementById('write-panel').open, null, { timeout: 10000 });
    assert.equal(page.url(), before, '주소가 그대로다(창 닫기로 썼다)');
    assert.deepEqual(errors, [], '페이지 오류 없음');
  } finally { await browser.close(); }
});

test('#845 내 의견 창을 열면 안내 판이 숨고, 닫으면 다시 보인다', { skip: REQUIRE ? false : skip }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await openWithFirstTree(page);
    await page.route('**/api/board/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[],"replies":[]}' }));
    // 계정 메뉴 → 내 의견(#666: 메뉴가 열려 있는 동안에도 안내는 미뤄 둔다).
    await page.click('#account-avatar');
    await page.waitForFunction(() => !document.getElementById('account-popover').hidden, null, { timeout: 10000 });
    await page.click('#account-my-posts');
    await page.waitForFunction(() => document.getElementById('myposts-panel').open, null, { timeout: 10000 });
    const held = await page.evaluate(() => ({
      tips: document.getElementById('tree-tips').hidden,
      embedded: document.querySelectorAll('.lt-tips-embedded').length,
      seen: localStorage.getItem('lt41.tips.firstTree'),
    }));
    assert.deepEqual(held, { tips: true, embedded: 0, seen: null }, '내 의견 창이 열려 있는 동안 안내 판 숨김·봇음 미기록');
    await page.click('#myposts-panel button[data-close="myposts-panel"]');
    await page.waitForFunction(() => !document.getElementById('myposts-panel').open && document.getElementById('tree-tips').hidden === false, null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => localStorage.getItem('lt41.tips.firstTree')), null, '창을 닫고 다시 보여 준 뒤에도 봇음 미기록');
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

// #619-5: 트리가 2 개고 순간이 26 개인 계정은 첫 트리 안내가 뜨지 않는다.
test('#619-5 트리가 2 개·순간이 26 개여도 첫 트리 안내는 뜨지 않는다', { skip: REQUIRE ? false : skip }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await openWithTwoTrees26(page);
    const tips = await page.$('#tree-tips');
    const hidden = await page.evaluate((el) => el && el.hidden === true, tips);
    assert.equal(hidden, true, '트리 2 개·순간 26 개여도 첫 트리 안내는 뜨지 않는다');
    const seen = await page.evaluate(() => localStorage.getItem('lt41.tips.firstTree'));
    assert.equal(seen, null, 'localStorage 에도 기록되지 않는다');
    // 보드를 여도 다시 뜨지 않는다.
    await page.goto(`${base}/v41/?view=board`, { waitUntil: 'load' });
    const tipsAgain = await page.$('#tree-tips');
    const hiddenAgain = await page.evaluate((el) => el && el.hidden === true, tipsAgain);
    assert.equal(hiddenAgain, true, '보드 전환 후에도 첫 트리 안내는 뜨지 않는다');
  } finally { await browser.close(); }
});
