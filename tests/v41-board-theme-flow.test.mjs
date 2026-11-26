import { listenOnSafePort } from './helpers/safe-port.mjs';
// #467: 보드·지도 판 테마(종이/밤) 배선 및 대비(contrast) 검증 시험
// #952: 마크업·카피·셸 정규식 단정 31개를 걷어냈다. 화면 배선에서 남길 것은 하나다 —
// 배경 드롭이 실제로 열리고, 고른 값이 셸로 가며, 열린 판이 그 자리에서 바뀌는가.
// (설정 창의 '보드·지도 판' 행은 카피 고정, 밤 판 카드 대비는 v41-board-card-contrast가 실브라우저로 잰다.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FRAME_MESSAGE_TYPES, frameMessage, shouldReloadOnFrameMessage
} from '../public/v41/frame-wiring.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUB = path.join(ROOT, 'public');
let chromium, skip = false;
// CI(미리보기 검사)에서는 LT_BOARD_467_REQUIRE=1 — 크롬이 준비된 잡에서 건너뜀을 실패로 본다.
const REQUIRE = process.env.LT_BOARD_467_REQUIRE === '1';
try {
  ({ chromium } = await import('playwright'));
  const { existsSync } = await import('node:fs');
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 판 테마 화면 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 판 테마 화면 시험을 건너뜀'; }
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
  return listenOnSafePort(server, '127.0.0.1').then(() => server);
}

const moment = (id, title) => ({ id, title, date: '2026-01-01', emotion: '설렘', note: '메모', parentId: null, url: '', x: 120, y: 120, rot: 0, color: 'rose', keywords: [] });
// 셸 흉내: 프레임이 보내는 판 테마 요청을 모은다(셸은 이 값을 저장하고 열린 프레임에 되돌려 준다).
const HOST = (view) => `<!doctype html><html lang="ko" data-lt-theme="garden"><head><meta charset="utf-8"><title>판 테마 호스트</title></head><body>
<script>
window.__choices=[];
const tree={id:'t1',title:'판 테마 트리',moments:[${JSON.stringify(moment('m1', '첫 순간'))},${JSON.stringify(moment('m2', '둘째 순간'))}],edges:[]};
window.LT41={source:'server',writable:true,owned:true,momentId:'m1',prefs:{},tree};
addEventListener('message',e=>{if(e.data&&e.data.type==='lt41-board-theme-choice')window.__choices.push(e.data.value)});
</script>
<iframe src="/v41/views/${view}" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;

async function openFrame(browser, url, re) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const problems = [];
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + String(e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) {
    frame = page.frames().find((f) => f !== page.mainFrame() && re.test(f.url()));
    if (!frame) await page.waitForTimeout(250);
  }
  assert.ok(frame, `프레임이 열린다(${re})`);
  await page.waitForTimeout(800);
  return { context, page, frame, problems };
}

test('보드·지도 판 테마 메시지: night/paper 정규화 및 모르는 값은 paper 기본', () => {
  assert.equal(FRAME_MESSAGE_TYPES.boardTheme, 'lt41-board-theme');
  assert.deepEqual(frameMessage('boardTheme', 'night'), { type: 'lt41-board-theme', value: 'night' });
  assert.deepEqual(frameMessage('boardTheme', 'paper'), { type: 'lt41-board-theme', value: 'paper' });
  assert.deepEqual(frameMessage('boardTheme', 'invalid'), { type: 'lt41-board-theme', value: 'paper' }, '모르는 값은 기본 종이 판');
  assert.deepEqual(frameMessage('boardTheme', undefined), { type: 'lt41-board-theme', value: 'paper' });
});

test('보드·지도 판 테마 수신: 어떤 화면에서도 다시 띄우지 않는다(location.reload 없음, 인플레이스 반영)', () => {
  const msg = frameMessage('boardTheme', 'night');
  for (const screen of ['home', 'shelf', 'book', 'board', 'network']) {
    assert.equal(
      shouldReloadOnFrameMessage(screen, msg, { rendered: 'paper', mirror: 'night' }),
      false,
      `${screen}: 보드·지도 판 테마로 다시 띄우지 않고 열린 채로 그린다`
    );
  }
});

test('#467 화면: 보드 배경 드롭에서 고른 값이 셸로 가고 판이 그 자리에서 바뀐다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const browser = await chromium.launch();
  const server = await serve({ '/host.html': HOST('track58-pinboard.html') });
  const { context, page, frame, problems } = await openFrame(browser, `http://127.0.0.1:${server.address().port}/host.html`, /views\/track58-pinboard/);
  t.after(async () => { await context.close().catch(() => {}); await browser.close(); server.close(); });
  assert.deepEqual(problems, [], '화면 오류 없음: ' + problems.join(' | '));
  assert.equal(await frame.evaluate(() => document.getElementById('boardBgBtn')?.hidden === false), true, '머리 줄에 배경 드롭이 보인다');
  await frame.click('#boardBgBtn');
  await frame.waitForSelector('#boardBgMenu:not([hidden])', { timeout: 5000 });
  const items = await frame.evaluate(() => [...document.querySelectorAll('#boardBgMenu .lt-bg-item')].map((b) => ({ bg: b.dataset.bg, label: b.textContent.trim(), checked: b.getAttribute('aria-checked') })));
  assert.deepEqual(items.map((i) => i.bg), ['auto', 'paper', 'night'], '테마 따라가기·종이·밤 세 항목');
  assert.deepEqual(items.map((i) => i.label), ['테마 따라가기', '종이', '밤']);
  assert.equal(items.filter((i) => i.checked === 'true').length, 1, '지금 고른 하나만 체크');
  // 밤을 고르면 판이 그 자리에서 바뀌고(다시 뜨지 않는다), 셸에 고른 값이 간다.
  await frame.click('#boardBgMenu .lt-bg-item[data-bg="night"]');
  await page.waitForTimeout(400);
  const night = await frame.evaluate(() => ({ attr: document.documentElement.getAttribute('data-lt-board-theme'), card: getComputedStyle(document.querySelector('#cardLayer .card')).backgroundImage.slice(0, 40) }));
  assert.equal(night.attr, 'night', '판이 밤으로 바뀐다');
  assert.match(night.card, /gradient/, '카드는 밝은 종이 카드로 남는다(밤 판 규칙)');
  assert.deepEqual(await page.evaluate(() => window.__choices), ['night'], '셸에 고른 값을 보낸다(보드가 저장소에 직접 쓰지 않는다)');
  // 종이를 고르면 다시 종이 판.
  await frame.click('#boardBgBtn');
  await frame.waitForSelector('#boardBgMenu:not([hidden])', { timeout: 5000 });
  await frame.click('#boardBgMenu .lt-bg-item[data-bg="paper"]');
  await page.waitForTimeout(400);
  assert.equal(await frame.evaluate(() => document.documentElement.getAttribute('data-lt-board-theme')), 'paper', '종이로 돌아온다');
  assert.deepEqual(await page.evaluate(() => window.__choices), ['night', 'paper']);
  assert.deepEqual(problems, [], '판을 바꾸는 동안 오류 없음');
});

test('#467 화면: 지도 도구 줄에도 같은 배경 드롭이 있고, 고른 값이 셸로 간다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async (t) => {
  const browser = await chromium.launch();
  const server = await serve({ '/host.html': HOST('track56-network.html') });
  const { context, page, frame, problems } = await openFrame(browser, `http://127.0.0.1:${server.address().port}/host.html`, /views\/track56-network/);
  t.after(async () => { await context.close().catch(() => {}); await browser.close(); server.close(); });
  assert.deepEqual(problems, [], '화면 오류 없음: ' + problems.join(' | '));
  assert.equal(await frame.evaluate(() => document.getElementById('netBgBtn')?.hidden === false), true, '지도 도구 줄에 배경 드롭이 보인다');
  await frame.click('#netBgBtn');
  await frame.waitForSelector('#netBgMenu:not([hidden])', { timeout: 5000 });
  // #951 ①: 지도의 배경 드롭은 ⋯ 메뉴 안으로 들어갔다(같은 항목 + '사용법') — 배경 항목만 골라 센다.
  const bgs = await frame.evaluate(() => [...document.querySelectorAll('#netBgMenu .lt-bg-item[data-bg]')].map((b) => b.dataset.bg));
  assert.deepEqual(bgs, ['auto', 'paper', 'night']);
  await frame.click('#netBgMenu .lt-bg-item[data-bg="night"]');
  await page.waitForTimeout(400);
  assert.deepEqual(await page.evaluate(() => window.__choices), ['night'], '지도에서도 고른 값이 셸로 간다');
});
