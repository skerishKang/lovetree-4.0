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

// #876: 같은 영상을 다시 담을 때 — 막지 말고 담기 전에 한 번 알려 준다(대표 결정 2026-11-18).
// 쉬운 추가 창에서 같은 트리·같은 영상(주소 모양이 달라도 id가 같음)을 담으면 안내 창이 열리고,
// [그래도 담기]는 담고, [그 순간 보기]는 담지 않고 이미 담은 순간을 열어 준다. 구간이 다르면 다른
// 장면이라 그냥 담고, 다른 트리에 같은 영상이 있으면 담은 뒤 한 줄 알린다.
const YT_ID = 'dQw4w9WgXcQ';
const momentShape = (id, date, url, extra = {}) => ({
  id, parentId: null, links: [], createdAt: '2026-11-15T00:00:00.000Z',
  title: `순간 ${id}`, note: '', emotion: '설렘', date, relation: '', url, ...extra,
});
const WORKSPACE_DUP = {
  revision: 1, subject: 'trial-subject', writeSubjectBound: true,
  state: { version: 1, prefs: {}, trees: [{
    id: 'tree1', subject: '시험 사용자', title: '모아둔 순간', coverMomentId: '', inbox: false,
    createdAt: '2026-11-15T00:00:00.000Z', updatedAt: '2026-11-15T00:00:00.000Z',
    moments: [momentShape('m1', '2026-11-13', `https://youtu.be/${YT_ID}`)],
  }] },
};
const WORKSPACE_DUP_TWO_TREES = {
  revision: 1, subject: 'trial-subject', writeSubjectBound: true,
  state: { version: 1, prefs: {}, trees: [
    {
      id: 'tree1', subject: '시험 사용자', title: '모아둔 순간', coverMomentId: '', inbox: false,
      createdAt: '2026-11-15T00:00:00.000Z', updatedAt: '2026-11-15T00:00:00.000Z',
      moments: [momentShape('m1', '2026-11-13', `https://youtu.be/${YT_ID}`)],
    },
    {
      id: 'tree2', subject: '리센느', title: '리센느', coverMomentId: '', inbox: false,
      createdAt: '2026-11-15T00:00:00.000Z', updatedAt: '2026-11-15T00:00:00.000Z',
      moments: [momentShape('m2', '2026-11-14', '')],
    },
  ] },
};

async function openWith(page, workspace) {
  await page.route('**/api/workspace*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workspace) }));
  await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => Array.isArray(window.LT41?.trees) && window.LT41.trees.length > 0, null, { timeout: 20000 });
}
async function openQuickAndFill(page, url) {
  await page.click('#write-menu');
  await page.waitForFunction(() => document.getElementById('write-panel').open, null, { timeout: 10000 });
  await page.fill('#quick-url', url);
  await page.click('#quick-submit');
}
const momentCount = (page, treeIndex = 0) => page.evaluate((i) => window.LT41.trees[i].moments.length, treeIndex);

test('#876 같은 트리 같은 영상: 안내 창이 열리고 [그래도 담기]로 담는다(주소 모양이 달라도)', { skip: REQUIRE ? false : skip }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await openWith(page, WORKSPACE_DUP);
    // 이미 담은 순간은 youtu.be, 다시 담는 주소는 watch?v= — 주소 모양이 달라도 같은 영상이다(규칙 5).
    await openQuickAndFill(page, `https://www.youtube.com/watch?v=${YT_ID}`);
    await page.waitForFunction(() => document.getElementById('video-dup-panel').open, null, { timeout: 10000 });
    const text = await page.evaluate(() => document.getElementById('video-dup-text').textContent);
    assert.ok(text.includes('이미 담은 영상이에요'), `안내 문구: ${text}`);
    assert.ok(text.includes('11월 13일'), `담은 날짜가 함께 보인다: ${text}`);
    assert.equal(await momentCount(page), 1, '안내 창에서는 아직 담지 않는다');
    // [그래도 담기]: 원래 하려던 담기를 그대로 한다.
    await page.click('#video-dup-continue');
    await page.waitForFunction(() => !document.getElementById('video-dup-panel').open, null, { timeout: 10000 });
    assert.equal(await momentCount(page), 2, '그래도 담기로 담는다');
    assert.deepEqual(errors, [], '페이지 오류 없음');
  } finally { await browser.close(); }
});

test('#876 같은 트리 같은 영상: [그 순간 보기]는 담지 않고 이미 담은 순간을 열어 준다', { skip: REQUIRE ? false : skip }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await openWith(page, WORKSPACE_DUP);
    // 구간을 적지 않은 같은 영상 — '둘 다 없음'이라 같은 장면으로 본다(규칙 1).
    await openQuickAndFill(page, `https://youtu.be/${YT_ID}`);
    await page.waitForFunction(() => document.getElementById('video-dup-panel').open, null, { timeout: 10000 });
    // 그 순간 보기: 순간 추가 창을 닫는다 — 적어 둔 값이 있으면 기존 규칙대로 한 번 묻는다(받아들인다).
    page.once('dialog', (d) => d.accept());
    await page.click('#video-dup-view');
    await page.waitForFunction(() => !document.getElementById('video-dup-panel').open, null, { timeout: 10000 });
    await page.waitForFunction(() => document.getElementById('write-panel').open, null, { timeout: 10000 });
    assert.equal(await momentCount(page), 1, '아무것도 담지 않는다');
    const editing = await page.evaluate(() => document.getElementById('moment-form')?.elements?.url?.value || '');
    assert.ok(editing.includes(YT_ID), '이미 담은 순간을 편집기로 열어 준다');
    assert.deepEqual(errors, [], '페이지 오류 없음');
  } finally { await browser.close(); }
});

test('#876 구간이 다르면 다른 장면이라 안내 없이 담는다(규칙 2)', { skip: REQUIRE ? false : skip }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    // 이미 담은 순간의 구간은 90초 — 30초부터의 장면은 다른 장면이다.
    const workspace = JSON.parse(JSON.stringify(WORKSPACE_DUP));
    workspace.state.trees[0].moments[0].startSeconds = 90;
    await openWith(page, workspace);
    await openQuickAndFill(page, `https://youtu.be/${YT_ID}?t=30`);
    await page.waitForFunction(() => !document.getElementById('quick-url').value, null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => document.getElementById('video-dup-panel').open), false, '안내 창을 열지 않는다');
    assert.equal(await momentCount(page), 2, '바로 담는다');
    assert.deepEqual(errors, [], '페이지 오류 없음');
  } finally { await browser.close(); }
});

test('#876 다른 트리에 같은 영상: 막지 않고 담은 뒤 한 줄 알린다(규칙 3)', { skip: REQUIRE ? false : skip }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await openWith(page, WORKSPACE_DUP_TWO_TREES);
    await page.click('#write-menu');
    await page.waitForFunction(() => document.getElementById('write-panel').open, null, { timeout: 10000 });
    // 담을 트리를 리센느(tree2)로 바꾼다 — 같은 영상은 모아둔 순간(tree1)에 있다.
    await page.selectOption('#quick-tree-select', 'tree2');
    await page.fill('#quick-url', `https://youtu.be/${YT_ID}`);
    await page.click('#quick-submit');
    await page.waitForFunction(() => !document.getElementById('quick-url').value, null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => document.getElementById('video-dup-panel').open), false, '안내 창을 열지 않는다');
    assert.equal(await momentCount(page, 1), 2, '리센느에 담는다');
    const toast = await page.evaluate(() => ({ text: document.getElementById('toast').textContent, hidden: document.getElementById('toast').hidden }));
    assert.equal(toast.hidden, false, '알림이 보인다');
    assert.ok(toast.text.includes("'모아둔 순간' 트리에도 있어요"), `알림 한 줄: ${toast.text}`);
    assert.deepEqual(errors, [], '페이지 오류 없음');
  } finally { await browser.close(); }
});

test('#876 안내 창도 #845 창 규칙을 탄다 — Esc·뒤로가기로 닫히면 아무것도 담지 않는다', { skip: REQUIRE ? false : skip }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await openWith(page, WORKSPACE_DUP);
    await openQuickAndFill(page, `https://youtu.be/${YT_ID}`);
    await page.waitForFunction(() => document.getElementById('video-dup-panel').open, null, { timeout: 10000 });
    // Esc: 맨 위 창(안내 창)만 닫고 아무것도 담지 않는다 — 순간 추가 창은 그대로 남는다.
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('video-dup-panel').open, null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => document.getElementById('write-panel').open), true, '순간 추가 창은 남는다');
    assert.equal(await momentCount(page), 1, '아무것도 담지 않는다');
    // 뒤로가기: 같은 창을 다시 열어 뒤로가기로 닫는다(#845 2단계 — 창이 열려 있으면 뒤로가기는 창을 닫는다).
    await page.click('#quick-submit');
    await page.waitForFunction(() => document.getElementById('video-dup-panel').open, null, { timeout: 10000 });
    await page.evaluate(() => history.back());
    await page.waitForFunction(() => !document.getElementById('video-dup-panel').open, null, { timeout: 10000 });
    assert.equal(await momentCount(page), 1, '뒤로가기로 닫아도 아무것도 담지 않는다');
    assert.equal(await page.evaluate(() => location.href.includes('youtu.be')), false, '주소가 그대로다');
    assert.deepEqual(errors, [], '페이지 오류 없음');
  } finally { await browser.close(); }
});
