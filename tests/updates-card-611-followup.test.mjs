import { listenOnSafePort } from './helpers/safe-port.mjs';
// #625: 390 에서 새 소식 알림 카드가 책 화면 '순간 목차' 단추를 가리지 않는다.
// 카드는 첫 화면(빈 주소·#home) 전용이다 — 안쪽 화면(책·보드·지도·내 트리)은 상단 도구 줄과
// 아래 컨트롤이 화면을 채워 어떤 고정 위치도 단추를 가린다(390 실측: 카드 76~132 vs 책 단추 64~110).
// 첫 화면을 벗어나면 카드를 숨기고, '접속 때 한 번' 규칙은 그대로 둔다.
// 크롬이 필요한 실행형 시험이라 LT_UPDATES_CARD_611_REQUIRE=1 에서만 돈다(미리보기 검사 '책' 잡에 연결).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../public', import.meta.url)));
const REQUIRE = process.env.LT_UPDATES_CARD_611_REQUIRE === '1';
let chromium = null;
let skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright chromium이 설치되어 있지 않아 실행 시험을 건너뜀';
} catch {
  skip = 'playwright 패키지가 없어 실행 시험을 건너뜀';
}
if (REQUIRE && skip) throw new Error(`LT_UPDATES_CARD_611_REQUIRE=1 인데 실행 시험을 건너뛴다: ${skip}`);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
// 셸 헤더는 390 에서 실측 57px(세로 2줄 그리드). 책 iframe 은 그 아래에서 시작한다.
const SHELL_HEADER = 57;

const moments = Array.from({ length: 8 }, (_, i) => ({
  id: 'm' + String(i + 1).padStart(2, '0'), parentId: i ? 'm01' : null, links: [], createdAt: '2026-11-0' + ((i % 9) + 1) + 'T00:00:00.000Z',
  title: '순간 ' + (i + 1), note: '마음 ' + (i + 1), emotion: '설렘', date: '2026.11.0' + ((i % 9) + 1), relation: '', url: ''
}));
const tree = { id: 'tree1', subject: '나', title: '시험 트리', coverMomentId: '', inbox: false, moments, edges: [] };

function hostHtml(theme) {
  return `<!doctype html><html lang="ko"${theme === 'garden' ? ' data-lt-theme="garden"' : ''}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/v41/shell.css"><link rel="stylesheet" href="/v41/identity.css">
<style>html,body{margin:0;height:100%}#stage{position:absolute;inset:${SHELL_HEADER}px 0 0}#stage>iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head>
<body>
<header class="app-header" style="height:${SHELL_HEADER}px;min-height:${SHELL_HEADER}px;padding:0 12px"><a class="brand" href="#home"><span class="brand-word">LoveTree<small>4.1</small></span></a><nav class="main-nav"><button type="button">기억책</button><button type="button">보드</button></nav></header>
<main id="stage"><iframe src="/v41/views/track59-sketchbook.html" title="책"></iframe></main>
<div id="toast" hidden></div>
<div id="updates-card" class="updates-card" role="status" hidden><p class="updates-card-text" id="updates-card-text"></p><div class="updates-card-actions"><button type="button" id="updates-view">보기</button><button type="button" id="updates-dismiss" aria-label="새 소식 알림 닫기">×</button></div></div>
<script>window.LT41={tree:${JSON.stringify(tree)},trees:[${JSON.stringify(tree)}],source:'server',momentId:'m01',prefs:{},writable:true};</script>
<script type="module">import {mountUpdates} from '/v41/updates.mjs';const $=id=>document.getElementById(id);mountUpdates({$,showPanel:()=>{},onDot:()=>{}}).start();</script>
</body></html>`;
}

function serve() {
  const server = createServer(async (req, res) => {
    const url = req.url || '/';
    if (url.startsWith('/host611card')) {
      const theme = url.includes('theme=garden') ? 'garden' : 'night';
      res.writeHead(200, { 'content-type': TYPES['.html'] });
      res.end(hostHtml(theme));
      return;
    }
    const clean = decodeURIComponent(url.split('?')[0]);
    for (const file of [path.join(ROOT, clean), path.join(ROOT, clean, 'index.html')]) {
      if (!file.startsWith(ROOT)) continue;
      try { if ((await stat(file)).isFile()) { res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); createReadStream(file).pipe(res); return; } } catch {}
    }
    res.writeHead(404); res.end('not found');
  });
  return listenOnSafePort(server, '127.0.0.1').then(() => server);
}

let server, base;
test.before(async () => { server = await serve(); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => new Promise((ok) => server.close(ok)));

const cardState = (page) => page.evaluate(() => {
  const card = document.getElementById('updates-card');
  const b = card.getBoundingClientRect();
  return { hidden: card.hidden, display: getComputedStyle(card).display, top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) };
});

const overlaps = (a, b) => !!(a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom);

async function openBookWithCard(browser, theme, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.goto(`${base}/host611card?theme=${theme}`, { waitUntil: 'load' });
  await page.locator('#updates-card').waitFor({ state: 'visible', timeout: 8000 });
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) {
    frame = page.frames().find((f) => /track59-sketchbook/.test(f.url()));
    if (!frame) await page.waitForTimeout(200);
  }
  assert.ok(frame, '책 프레임이 열린다');
  await frame.waitForSelector('#archiveBtn', { state: 'attached', timeout: 15000 });
  // #1249: 휴대폰의 보관함은 공통 줄의 더 보기 안에 들어갈 수 있다.
  if (!(await frame.locator('#archiveBtn').isVisible())) {
    await frame.locator('.lt-toolbar-more').click();
    await frame.waitForSelector('#archiveBtn', { timeout: 15000 });
  }
  await page.waitForTimeout(700);
  return { ctx, page, frame, errors };
}

// 책 화면의 '순간 목차' 단추 사각형을 셸 좌표로 옮긴다(iframe 좌표 + 셸 헤더).
async function archiveRect(frame) {
  const b = await frame.evaluate(() => {
    const r = document.getElementById('archiveBtn').getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  });
  return { top: Math.round(b.top + SHELL_HEADER), bottom: Math.round(b.bottom + SHELL_HEADER), left: b.left, right: b.right };
}

async function checkAt390(browser, theme) {
  const { ctx, page, frame, errors } = await openBookWithCard(browser, theme, 390, 844);
  try {
    // 첫 화면: 카드가 보인다.
    const onHome = await cardState(page);
    assert.equal(onHome.hidden, false, '첫 화면에서는 카드가 보인다');
    assert.ok(onHome.right > onHome.left, '카드 사각형이 있다');
    // 책 화면으로 이동: 카드가 숨겨져 '순간 목차' 단추를 가리지 않는다.
    await page.evaluate(() => { location.hash = '#book'; });
    await page.waitForTimeout(500);
    const onBook = await cardState(page);
    assert.equal(onBook.hidden, true, '책 화면에서는 카드가 숨겨진다');
    const archive = await archiveRect(frame);
    assert.equal(overlaps(onBook.hidden ? null : onBook, archive), false, `'순간 목차' 단추(${JSON.stringify(archive)})와 겹치지 않는다`);
    assert.deepEqual(errors, [], '페이지 오류 없음');
    return { onHome, onBook, archive };
  } finally {
    await ctx.close();
  }
}

test('625 실행: 390 밤 테마 — 책 화면에서 새 소식 카드가 순간 목차 단추를 가리지 않는다', { skip }, async () => {
  const browser = await chromium.launch();
  try { await checkAt390(browser, 'night'); } finally { await browser.close(); }
});

test('625 실행: 390 종이 테마 — 책 화면에서 새 소식 카드가 순간 목차 단추를 가리지 않는다', { skip }, async () => {
  const browser = await chromium.launch();
  try { await checkAt390(browser, 'garden'); } finally { await browser.close(); }
});

test('625 실행: 1440 — 첫 화면 카드는 화면 안에, 책 화면에서는 숨겨진다', { skip }, async () => {
  const browser = await chromium.launch();
  try {
    const { ctx, page, frame, errors } = await openBookWithCard(browser, 'night', 1440, 900);
    const onHome = await cardState(page);
    assert.equal(onHome.hidden, false, '첫 화면에서 카드가 보인다');
    assert.ok(onHome.left >= 0 && onHome.right <= 1440 && onHome.top >= 0 && onHome.bottom <= 900, '카드가 1440 화면 안에 든다');
    const archive = await archiveRect(frame);
    assert.equal(overlaps(onHome, archive), false, '넓은 화면 첫 화면에서도 책 단추와 겹치지 않는다');
    await page.evaluate(() => { location.hash = '#book'; });
    await page.waitForTimeout(400);
    assert.equal((await cardState(page)).hidden, true, '책 화면에서는 숨겨진다');
    assert.deepEqual(errors, [], '페이지 오류 없음');
    await ctx.close();
  } finally { await browser.close(); }
});