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

// #845 2단계 초점 순서: 안내 판이 처음 뜰 때(직접 열림)는 닫기 단추에 초점을 둔다. 창이 닫히면서
// 자동으로 다시 뜰 때는 초점을 뺏지 않는다 — 초점은 창을 연 단추로 돌아가고, 안내 판 안 단추는 Tab으로 닿는다.
test('#845 2단계 안내 판 초점: 직접 뜨면 닫기 단추, 창 닫힘 뒤 자동 표시는 연 단추 유지·Tab 진입', { skip: REQUIRE ? false : skip }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await openWithFirstTree(page);
    assert.equal(await page.evaluate(() => document.activeElement?.id || ''), 'tree-tips-close', '처음 뜬 안내 판은 닫기 단추에 초점을 둔다');
    await page.click('#write-menu');
    await page.waitForFunction(() => document.getElementById('write-panel').open, null, { timeout: 10000 });
    await page.evaluate(() => history.back());
    await page.waitForFunction(() => !document.getElementById('write-panel').open && document.getElementById('tree-tips').hidden === false, null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => document.activeElement?.id || ''), 'write-menu', '자동으로 다시 뜬 안내 판은 초점을 뺏지 않는다');
    // 안내 판 안 단추는 Tab 순서에 그대로 있다 — 닫기 단추에 닿을 수 있다.
    let reached = false;
    for (let i = 0; i < 15 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.id === 'tree-tips-close');
    }
    assert.equal(reached, true, 'Tab으로 안내 판 닫기 단추에 닿는다');
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
    // #978: 물음은 앱 안 확인 틀이다 — 아니오를 누르면 창이 남고, 다음 뒤로가기도 같은 질문을 한다.
    const nativeDialogs = [];
    page.on('dialog', (d) => { nativeDialogs.push(d.message()); void d.dismiss().catch(() => {}); });
    await page.evaluate(() => history.back());
    await page.waitForSelector('#lt-close-confirm[open]', { timeout: 8000 });
    await page.click('#lt-close-confirm-no');
    await page.waitForFunction(() => !document.querySelector('#lt-close-confirm')?.open, null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => document.getElementById('write-panel').open), true, '확인을 취소하면 창이 남는다');
    // 예를 누르면 닫힌다.
    await page.evaluate(() => history.back());
    await page.waitForSelector('#lt-close-confirm[open]', { timeout: 8000 });
    await page.click('#lt-close-confirm-yes');
    await page.waitForFunction(() => !document.getElementById('write-panel').open, null, { timeout: 10000 });
    assert.equal(page.url(), before, '주소가 그대로다(창 닫기로 썼다)');
    assert.deepEqual(nativeDialogs, [], '브라우저 기본 confirm은 불리지 않는다');
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

// 이슈 933: 새 트리 만들기(첫 여정) 화면에서는 안내 판을 띄우지 않는다 — 아직 트리를 만든 적이 없는데
// '첫 트리를 만들었어요' 판이 화면 오른쪽 미리보기 판을 덮던 문제.
test('#933 새 트리 만들기 화면에서는 첫 트리 안내 판이 뜨지 않고, 만든 뒤 화면에서는 다시 뜬다', { skip: REQUIRE ? false : skip }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await openWithFirstTree(page);
    // 트리 고르기 → '+ 새 트리'
    await page.locator('#record-menu').click();
    await page.waitForFunction(() => !document.getElementById('tree-popover')?.hidden, null, { timeout: 15000 });
    // 단추가 실제로 보이는 것을 확인한 뒤 진짜 마우스로 누른다(창 항목은 pointer 이벤트로도 반응한다).
    const newTree = page.locator('[data-tree-action="new"]').first();
    await newTree.waitFor({ state: 'visible', timeout: 15000 });
    await newTree.click();
    // 셸은 iframe 두 장을 번갈아 쓴다 — #view 한 장의 주소만 보면 화면이 바뀐 뒤에도 낡은 주소를 볼 수 있다.
    // 사용자가 보는 상태(주소 #journey/NN + 보이는 프레임이 첫 여정)로 기다린다.
    await page.waitForFunction(() => {
      if (!/^#journey\/\d+/.test(location.hash)) return false;
      return [...document.querySelectorAll('#view, #view-next')].some(f => {
        if (f.hidden || !f.getClientRects().length) return false;
        try { return /first-journey/.test(f.contentWindow.location.pathname); } catch { return false; }
      });
    }, null, { timeout: 15000 });
    const state = await page.evaluate(() => {
      const shown = (el) => !!el && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
      // 안내 판과 겹치는지 재려면 '지금 보이는' 프레임을 봐야 한다.
      const frame = [...document.querySelectorAll('#view, #view-next')].find(f => !f.hidden && f.getClientRects().length) || document.getElementById('view');
      const base = frame.getBoundingClientRect();
      const panes = [...(frame.contentDocument?.querySelectorAll('.pane, .grow, .grow-stage, .steps, .journey-head, .media-host') || [])]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => { const r = el.getBoundingClientRect(); return { l: r.left + base.left, t: r.top + base.top, r: r.right + base.left, b: r.bottom + base.top }; });
      const tips = document.getElementById('tree-tips');
      const t = tips.getBoundingClientRect();
      const overlap = panes.reduce((sum, p) => sum + Math.max(0, Math.min(t.right, p.r) - Math.max(t.left, p.l)) * Math.max(0, Math.min(t.bottom, p.b) - Math.max(t.top, p.t)), 0);
      return {
        dialogs: [...document.querySelectorAll('dialog[open]')].map((d) => d.id),
        tipsShown: shown(tips),
        tipsOverlapWithPane: Math.round(overlap)
      };
    });
    assert.deepEqual(state.dialogs, [], '트리 관리 창은 닫혀 있다(창 0장)');
    assert.equal(state.tipsShown, false, '새 트리 만들기 화면에서는 안내 판이 뜨지 않는다');
    assert.equal(state.tipsOverlapWithPane, 0, '미리보기 판과 겹치는 안내 판이 없다');
    // 트리를 만든 뒤 화면(서재)으로 돌아오면 다시 보인다 — 안내를 없애 버린 것이 아니다.
    await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => { const tips = document.getElementById('tree-tips'); return tips && tips.hidden === false; }, null, { timeout: 20000 });
    assert.equal(await page.evaluate(() => document.getElementById('tree-tips').hidden), false, '다른 화면에서는 안내가 그대로 뜬다');
  } finally { await browser.close(); }
});

// #845 3단계: 창 위에 창을 여는 규칙(이슈 #845 규칙표). showModal을 여는 입장에서 판정한다 —
// 잠깐 판(옮길 트리 고르기·내 보관 파일 고르기·둘러보기 미리보기)은 위에 겹침을 허용하고, 그 밖의
// 큰 창이 열릴 때는 앞 창을 공통 판정(requestPanelClose)으로 닫고 열린다.
test('#845 3단계 잠깐 판은 위에 겹친다 — 순간 추가 위에 내 보관 파일 고르기', { skip: REQUIRE ? false : skip }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await openWithFirstTree(page);
    await page.click('#write-menu');
    await page.waitForFunction(() => document.getElementById('write-panel').open, null, { timeout: 10000 });
    // 내 보관 파일에서 고르기 단추는 자세한 추가 탭 안에 있다.
    await page.click('#write-tab-detailed');
    await page.click('#editor-assets-open');
    await page.waitForFunction(() => document.getElementById('account-assets').open, null, { timeout: 10000 });
    const both = await page.evaluate(() => ({
      write: document.getElementById('write-panel').open,
      assets: document.getElementById('account-assets').open,
    }));
    assert.equal(both.write, true, '앞 창(순간 추가)이 닫히지 않는다');
    assert.equal(both.assets, true, '잠깐 판(내 보관 파일 고르기)이 위에 열린다');
    // 고르기를 닫으면 앞 창으로 돌아온다.
    await page.click('[data-close="account-assets"]');
    await page.waitForFunction(() => !document.getElementById('account-assets').open, null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => document.getElementById('write-panel').open), true, '고르기를 닫아도 순간 추가가 남는다');
    assert.deepEqual(errors, [], '페이지 오류 없음');
  } finally { await browser.close(); }
});

test('#845 3단계 큰 창 위에 큰 창을 열면 앞 창을 닫고 연다', { skip: REQUIRE ? false : skip }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await openWithFirstTree(page);
    const before = page.url();
    await page.click('#write-menu');
    await page.waitForFunction(() => document.getElementById('write-panel').open, null, { timeout: 10000 });
    // 트리 관리 위에 순간 추가가 겹치는 길은 지금 화면에 없다(모달 뒤는 눌리지 않는다) — 열림 한곳의
    // 규칙을 직접 showModal로 확인한다. 규칙표: 새 창이 큰 창이면 앞 창을 닫고 연다.
    await page.evaluate(() => document.getElementById('tree-manager').showModal());
    await page.waitForFunction(() => document.getElementById('tree-manager').open, null, { timeout: 10000 });
    const after = await page.evaluate(() => ({
      write: document.getElementById('write-panel').open,
      tree: document.getElementById('tree-manager').open,
    }));
    assert.equal(after.tree, true, '새 큰 창(트리 관리)이 열린다');
    assert.equal(after.write, false, '앞 창(순간 추가)이 닫힌다');
    assert.equal(page.url(), before, '주소가 그대로다');
    assert.deepEqual(errors, [], '페이지 오류 없음');
  } finally { await browser.close(); }
});

test('#845 3단계 앞 창이 더러우면 한 번 묻고, 취소하면 겹친다', { skip: REQUIRE ? false : skip }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    const nativeDialogs = [];
    page.on('dialog', (d) => { nativeDialogs.push(d.message()); void d.dismiss().catch(() => {}); });
    await openWithFirstTree(page);
    await page.click('#write-menu');
    await page.waitForFunction(() => document.getElementById('write-panel').open, null, { timeout: 10000 });
    await page.fill('#quick-url', 'https://example.com/stack-check');
    // #978: 물음은 앱 안 확인 틀 — 아니오를 누르면 앞 창이 남고, 규칙표대로 새 창은 그 위에 겹친다.
    // (확인 물음은 비동기라 새 창은 먼저 열리고, 아니오를 누르면 확인 틀만 닫힌다.)
    await page.evaluate(() => document.getElementById('tree-manager').showModal());
    await page.waitForSelector('#lt-close-confirm[open]', { timeout: 8000 });
    await page.click('#lt-close-confirm-no');
    await page.waitForFunction(() => !document.querySelector('#lt-close-confirm')?.open, null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => document.getElementById('write-panel').open), true, '취소하면 앞 창이 남는다');
    assert.equal(await page.evaluate(() => document.getElementById('tree-manager').open), true, '새 창은 겹쳐 열린다');
    // 예를 누르면 앞 창이 닫히고 새 창만 남는다.
    await page.evaluate(() => { document.getElementById('tree-manager').close(); document.getElementById('tree-manager').showModal(); });
    await page.waitForSelector('#lt-close-confirm[open]', { timeout: 8000 });
    await page.click('#lt-close-confirm-yes');
    await page.waitForFunction(() => document.getElementById('tree-manager').open && !document.getElementById('write-panel').open, null, { timeout: 10000 });
    assert.deepEqual(nativeDialogs, [], '브라우저 기본 confirm은 불리지 않는다');
    assert.deepEqual(errors, [], '페이지 오류 없음');
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

// #978: 닫기 확인은 앱 안 틀(#lt-close-confirm)이다. 담기 뒤 화면을 다시 그리며 창을 닫으려다
// 뜨는 물음(옛 브라우저 confirm 을 시험이 자동으로 dismiss 하던 자리)은 '아니요'로 답해 창을 그대로 둔다.
async function answerCloseConfirmIfAny(page) {
  for (let i = 0; i < 20; i += 1) {
    if (await page.evaluate(() => document.getElementById('lt-close-confirm')?.open)) {
      await page.click('#lt-close-confirm-no');
      await page.waitForFunction(() => !document.querySelector('#lt-close-confirm')?.open, null, { timeout: 5000 });
      return true;
    }
    await page.waitForTimeout(100);
  }
  return false;
}

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
    // #978: 담기 뒤 화면 다시 그리기가 띄우는 닫기 물음은 '아니요'로 답해 창을 그대로 둔다.
    await answerCloseConfirmIfAny(page);
    await page.evaluate(() => history.back());
    await page.waitForFunction(() => !document.getElementById('video-dup-panel').open, null, { timeout: 10000 });
    // 뒤로가기로 안내 창을 닫은 뒤, 남은 순간 추가 창을 닫으려다 뜨는 물음도 '아니요'로 답한다.
    await answerCloseConfirmIfAny(page);
    assert.equal(await momentCount(page), 1, '뒤로가기로 닫아도 아무것도 담지 않는다');
    assert.equal(await page.evaluate(() => location.href.includes('youtu.be')), false, '주소가 그대로다');
    assert.deepEqual(errors, [], '페이지 오류 없음');
  } finally { await browser.close(); }
});

// #37(AI 고객 37회차): 쉬운 추가에서 꼬리표 칩 — ① 확정이 저장되면 '담았어요 · 지금 다듬기 →'가
// 눈에 띄게 뜨고(is-lit), ② 확정 칩을 다시 눌러 빼면 조용히 지우지 않고 '꼬리표를 뺐어요 · 되돌리기'
// 알림(5초)을 보여 준다. 되돌리기를 누르면 다시 붙여 저장한다.
test('#37 꼬리표 칩: 확정 뒤 안내가 도드라지고, 다시 눌러 빼면 되돌리기 알림이 뜬다', { skip: REQUIRE ? false : skip }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await openWith(page, WORKSPACE_DUP);
    // #876 안내에 걸리지 않는 다른 영상을 담는다.
    await openQuickAndFill(page, 'https://youtu.be/xGFc2kvAbM8');
    await page.waitForFunction(() => !document.getElementById('quick-url').value, null, { timeout: 10000 });
    // #978: 담기 뒤 화면 다시 그리기가 띄우는 닫기 물음은 '아니요'로 답해 창을 그대로 둔다.
    await answerCloseConfirmIfAny(page);
    const keywordsOf = () => page.evaluate(() => JSON.stringify(window.LT41.trees[0].moments.find((m) => m.id !== 'm1')?.keywords ?? []));
    assert.equal(await keywordsOf(), '[]', '담은 직후 꼬리표는 없다');
    // 직접 붙이기로 꼬리표를 확정한다 — 제안이 없는 제목이라 직접 붙이는 길을 쓴다.
    await page.click('#quick-tagline .lt-tagline-toggle');
    await page.fill('#quick-tagline .lt-tagline-value', '윤슬');
    await page.click('#quick-tagline .lt-tagline-add');
    await page.waitForFunction(() => document.querySelector('#quick-tagline .lt-tag-chip.is-confirmed'), null, { timeout: 10000 });
    assert.equal(await keywordsOf(), '["가수:윤슬"]', '확정한 꼬리표가 저장된다');
    // ① 확정이 저장되면 안내 줄이 도드라진다 — '담았어요 · 지금 다듬기 →'가 눈에 보인다.
    const lit = await page.evaluate(() => ({
      row: document.getElementById('quick-notice-row').classList.contains('is-lit'),
      notice: document.getElementById('quick-notice').textContent,
      refine: !document.getElementById('quick-refine').hidden,
    }));
    assert.equal(lit.row, true, '안내 줄이 도드라진다(is-lit)');
    assert.ok(lit.notice.includes('담았어요'), `안내: ${lit.notice}`);
    assert.equal(lit.refine, true, '지금 다듬기 단추가 보인다');
    // ② 확정 칩을 다시 누른다(빼기) — 조용히 지우지 않고 되돌리기 알림을 보여 준다.
    await page.click('#quick-tagline .lt-tag-chip.is-confirmed');
    await page.waitForFunction(() => document.querySelector('#quick-tagline .lt-tagline-undo'), null, { timeout: 10000 });
    assert.equal(await keywordsOf(), '[]', '빼기도 저장된다');
    const undo = await page.evaluate(() => document.querySelector('#quick-tagline .lt-tagline-undo')?.textContent || '');
    assert.ok(undo.includes('꼬리표를 뺐어요'), `알림: ${undo}`);
    assert.ok(undo.includes('되돌리기'), `되돌리기 길: ${undo}`);
    // 되돌리기를 누르면 다시 붙여 저장한다.
    await page.click('#quick-tagline .lt-tagline-undo-btn');
    await page.waitForFunction(() => JSON.stringify(window.LT41.trees[0].moments.find((m) => m.id !== 'm1')?.keywords ?? []) === '["가수:윤슬"]', null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => !!document.querySelector('#quick-tagline .lt-tagline-undo')), false, '되돌렸으면 알림을 거둔다');
    assert.deepEqual(errors, [], '페이지 오류 없음');
  } finally { await browser.close(); }
});
