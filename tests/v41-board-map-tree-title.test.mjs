// #417: 보드·지도 머리의 트리 제목 ▾ — 책(#416)과 같은 내용·키보드 동작.
// #952: 화면 배선을 글자로 고정하던 33개 단정을 걷어내고, 보드 화면을 띄워 결과로 잰다 —
// 제목 글자·▾ 열기·행 순서(정리 전 먼저)·지금 트리 표시·행을 눌러 lt41-open-view·← 서재는
// lt41-navigate·Esc 닫기(단추로 초점 복귀)·위아래 이동·바깥 누르기·읽기 전용에서 숨김.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUB = path.join(ROOT, 'public');
let chromium, skip = false;
const REQUIRE = process.env.LT_BOARD_417_REQUIRE === '1';
try {
  ({ chromium } = await import('playwright'));
  const { existsSync } = await import('node:fs');
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 트리 제목 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 트리 제목 시험을 건너뜀'; }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

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

const moment = (id, title) => ({ id, title, date: '2026-01-01', emotion: '설렘', note: '메모', parentId: null, url: '', x: 120, y: 120, rot: 0, color: 'rose', keywords: [] });

// 셸 흉내: 보기·읽기 전용 여부와 트리 목록을 넘기고, 프레임이 보내는 메시지를 모은다.
const hostHTML = ({ source, writable, trees, treeId }) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>보드 호스트</title></head><body>
<script>
window.__msgs=[];
addEventListener('message',e=>{if(e.data&&/^lt41-/.test(String(e.data.type||'')))window.__msgs.push(e.data)});
window.LT41={source:${JSON.stringify(source)},writable:${writable},owned:true,momentId:${JSON.stringify(trees[0].moments[0].id)},prefs:{},trees:${JSON.stringify(trees)},tree:${JSON.stringify(trees.find(t => t.id === treeId))}};
</script>
<iframe src="/v41/views/track58-pinboard.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;

const TREES = [
  { id: 't1', title: '지금 보는 트리', moments: [moment('a1', '첫 순간'), moment('a2', '둘째 순간')], edges: [] },
  { id: 't2', title: '정리 전 트리', inbox: true, moments: [moment('b1', '쌓인 순간')], edges: [] },
  { id: 't3', title: '다른 트리', moments: [moment('c1', '한 순간')], edges: [] }
];

async function openHost(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
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
  await frame.waitForSelector('#treeTitleBtn', { timeout: 20000 });
  await page.waitForTimeout(400);
  return { context, page, frame, problems };
}

test('#417 화면: 제목 ▾는 셸 목록을 정리 전 트리부터 보여 주고, 행을 누르면 같은 보기로 열어 달라 한다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const browser = await chromium.launch();
  const server = await serve({ '/host.html': hostHTML({ source: 'server', writable: true, trees: TREES, treeId: 't1' }) });
  const { context, page, frame, problems } = await openHost(browser, `http://127.0.0.1:${server.address().port}/host.html`);
  t.after(async () => { await context.close().catch(() => {}); await browser.close(); server.close(); });
  assert.deepEqual(problems, [], '화면 오류 없음: ' + problems.join(' | '));

  // 머리 줄: ← 서재 + 지금 트리 제목 + ▾ — 셋 다 보인다.
  const head = await frame.evaluate(() => ({
    back: !!document.getElementById('shelfBackBtn') && document.getElementById('shelfBackBtn').hidden === false,
    title: document.getElementById('treeTitleText')?.textContent.trim(),
    caretHidden: document.querySelector('.tree-title-caret')?.hidden === true,
    menuHidden: document.getElementById('treeMenuPanel').hidden
  }));
  assert.equal(head.back, true, '← 서재가 보인다');
  assert.equal(head.title, '지금 보는 트리', `제목은 지금 트리(${head.title})`);
  assert.equal(head.caretHidden, false, '▾ 표시가 보인다');
  assert.equal(head.menuHidden, true, '목록은 처음에 닫혀 있다');

  // 단추를 누르면 목록이 열리고, 행 순서는 셸과 같다(정리 전이 먼저).
  await frame.click('#treeTitleBtn');
  await frame.waitForSelector('#treeMenuPanel:not([hidden])', { timeout: 5000 });
  const menu = await frame.evaluate(() => {
    const rows = [...document.querySelectorAll('#treeMenuPanel .tree-item')];
    return {
      expanded: document.getElementById('treeTitleBtn').getAttribute('aria-expanded'),
      role: document.getElementById('treeMenuPanel').getAttribute('role'),
      ids: rows.map((r) => r.dataset.treeId),
      checked: rows.filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.dataset.treeId),
      counts: rows.map((r) => r.querySelector('.tree-count')?.textContent.trim()),
      focusedRow: document.activeElement?.dataset?.treeId || null
    };
  });
  assert.equal(menu.expanded, 'true', '열림 상태를 단추에 남긴다');
  assert.equal(menu.role, 'menu', '목록은 메뉴로 알린다');
  assert.deepEqual(menu.ids, ['t2', 't1', 't3'], '정리 전 트리가 먼저 온다');
  assert.deepEqual(menu.checked, ['t1'], '지금 트리 하나만 체크된다');
  assert.deepEqual(menu.counts, ['정리 전 1', '2개의 순간', '1개의 순간'], '개수 문구는 셸과 같다');
  assert.equal(menu.focusedRow, 't2', '열면 첫 행에 초점이 간다');

  // 위아래 이동·Esc 닫기(단추로 초점 복귀) — 책(#416)과 같은 규칙.
  await page.keyboard.press('ArrowDown');
  await frame.waitForTimeout(120);
  assert.equal(await frame.evaluate(() => document.activeElement?.dataset?.treeId), 't1', '아래로 가면 다음 행');
  await page.keyboard.press('ArrowUp');
  await frame.waitForTimeout(120);
  assert.equal(await frame.evaluate(() => document.activeElement?.dataset?.treeId), 't2', '위로 가면 앞 행');
  await page.keyboard.press('Escape');
  await frame.waitForTimeout(200);
  const closed = await frame.evaluate(() => ({ hidden: document.getElementById('treeMenuPanel').hidden, expanded: document.getElementById('treeTitleBtn').getAttribute('aria-expanded'), focused: document.activeElement?.id }));
  assert.equal(closed.hidden, true, 'Esc 로 닫는다');
  assert.equal(closed.expanded, 'false', '닫힘을 단추에 알린다');
  assert.equal(closed.focused, 'treeTitleBtn', 'Esc 뒤 초점은 단추로 돌아온다');

  // 바깥을 누르면 닫힌다.
  await frame.click('#treeTitleBtn');
  await frame.waitForSelector('#treeMenuPanel:not([hidden])', { timeout: 5000 });
  await page.mouse.click(720, 700);
  await frame.waitForTimeout(250);
  assert.equal(await frame.evaluate(() => document.getElementById('treeMenuPanel').hidden), true, '바깥을 누르면 닫힌다');

  // 다른 트리를 누르면 셸에 같은 보기로 열어 달라고 한다(보드가 스스로 화면을 바꾸지 않는다).
  await frame.click('#treeTitleBtn');
  await frame.waitForSelector('#treeMenuPanel:not([hidden])', { timeout: 5000 });
  await frame.click('#treeMenuPanel .tree-item[data-tree-id="t3"]');
  await page.waitForTimeout(300);
  const msgs = await page.evaluate(() => window.__msgs);
  assert.deepEqual(msgs.at(-1), { type: 'lt41-open-view', treeId: 't3', view: 'board' }, '행을 누르면 lt41-open-view로 같은 보기를 연다');
  // ← 서재는 책장으로 간다.
  await frame.click('#shelfBackBtn');
  await page.waitForTimeout(300);
  const last = await page.evaluate(() => window.__msgs.at(-1));
  assert.equal(last?.type, 'lt41-navigate', '← 서재는 lt41-navigate로 책장에 간다');
  assert.match(String(last?.view), /track32-bookshelf/, `책장 화면으로(${last?.view})`);
});

test('#417 화면: 공유·예시(읽기 전용)에서는 ▾와 ← 서재를 숨기고 목록을 열지 않는다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const browser = await chromium.launch();
  const server = await serve({ '/host.html': hostHTML({ source: 'share', writable: false, trees: TREES, treeId: 't1' }) });
  const { context, page, frame, problems } = await openHost(browser, `http://127.0.0.1:${server.address().port}/host.html`);
  t.after(async () => { await context.close().catch(() => {}); await browser.close(); server.close(); });
  assert.deepEqual(problems, [], '화면 오류 없음: ' + problems.join(' | '));
  const ro = await frame.evaluate(() => ({
    caret: document.querySelector('.tree-title-caret')?.hidden === true,
    back: document.getElementById('shelfBackBtn')?.hidden === true
  }));
  assert.equal(ro.caret, true, '읽기 전용에서는 ▾를 숨긴다');
  assert.equal(ro.back, true, '읽기 전용에서는 ← 서재를 숨긴다');
  await frame.click('#treeTitleBtn');
  await page.waitForTimeout(300);
  assert.equal(await frame.evaluate(() => document.getElementById('treeMenuPanel').hidden), true, '읽기 전용에서는 목록을 열지 않는다');
  assert.deepEqual(await page.evaluate(() => window.__msgs), [], '셸로 보내는 메시지가 없다');
});
