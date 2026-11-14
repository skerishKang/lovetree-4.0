// #635 PR A: 감상 화면(공유 링크·예시)의 고장 2개 + 문구 정리 — 데이터·규칙은 그대로, 화면만.
// 1. 책 마지막 장 'undefined': otherTreesBlock()이 readOnly에서 맨 return(=undefined)을 문자열에 붙였다.
//    감상 화면에서는 '다음 이야기' 안내 자체를 감추고, 내 트리에서는 안내 문장+단추를 그대로 둔다.
// 2. 첫 화면 '어떻게 쓰나요': 별도 사용법 안내 화면이 없다(home.js #388 주석 — "기존 안내가 없어 둘러보기와 같은 동작").
//    새로 만들지 않는다. 대신 같은 첫 화면의 안내 패널(orbit-dialog 틀)을 열게 하고, 둘러보기가 같이 열리지 않는지 검사한다.
// 3. 감상 화면의 빈 값 안내('다음 순간으로 이어진 이유: 이어진 이유를 아직 적지 않았어요')는 감춘다 — 내 트리는 그대로.
// 4. 제목 중복: 사용자 제목과 유튜브 제목이 같으면(앞뒤 공백·대소문자 무시) '▶ 유튜브 제목' 줄을 감춘다.
// 크롬이 없는 곳에서는 화면 시험을 건너뛰고, LT_635A_REQUIRE=1(미리보기 검사)에서는 건너뜀을 실패로 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const BUILT = path.join(REPO, 'dist');
const ROOT = path.resolve(existsSync(path.join(BUILT, 'v41', 'home.html')) ? BUILT : path.join(REPO, 'public'));
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

let chromium, skip = false;
const REQUIRE = process.env.LT_635A_REQUIRE === '1';
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 #635 화면 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 #635 화면 시험을 건너뜀'; }
if (REQUIRE && !existsSync(path.join(ROOT, 'v41', 'home.html'))) skip = `빌드 결과가 없어 #635 화면 시험을 건너뜀(${ROOT}/v41/home.html 없음 — npx vite build 필요)`;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
function serve() {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    if (EXTRA_ROUTES[clean]) { res.writeHead(200, { 'content-type': MIME['.html'] }); res.end(EXTRA_ROUTES[clean]); return; }
    for (const file of [path.join(ROOT, clean), path.join(ROOT, clean, 'index.html')]) {
      if (path.relative(ROOT, file).startsWith('..')) continue;
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

// 시험 트리: 순간 3개 사슬. 첫 순간은 유튜브(사용자 제목이 영상 제목과 대소문자만 다르다),
// 둘째는 연결 이유가 있고, 셋째(마지막)는 연결 이유가 비어 있다.
const VIDEO_TITLE = 'Super Shy — Official MV';
const tree = (() => {
  const moments = [
    { id: 'm1', title: 'super shy — official mv', date: '2026-11-01', emotion: '설렘', note: '첫 날의 글', parentId: null, relation: '', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', mediaMetadata: { title: VIDEO_TITLE, channel: '예시 채널' }, x: null, y: null, rot: 0, color: 'rose', keywords: [], privacy: 'public' },
    { id: 'm2', title: '둘째 순간', date: '2026-11-02', emotion: '행복', note: '이어지는 글', parentId: 'm1', relation: '같이 들어서', url: '', mediaMetadata: null, x: null, y: null, rot: 0, color: 'sky', keywords: ['무대'], privacy: 'public' },
    { id: 'm3', title: '마지막 순간', date: '2026-11-03', emotion: '그리움', note: '끝의 글', parentId: 'm2', relation: '', url: '', mediaMetadata: null, x: null, y: null, rot: 0, color: 'gold', keywords: [], privacy: 'public' }
  ];
  const edges = [
    { id: 'e2', kind: 'parent', from: 'm1', to: 'm2', reason: '같이 들어서' },
    { id: 'e3', kind: 'parent', from: 'm2', to: 'm3', reason: '' }
  ];
  return { id: 't1', title: '시험 트리', moments, edges };
})();

// 감상(공유) 호스트: 셸처럼 LT41.source='share'를 iframe에 넘긴다. 셸이 받을 메시지를 통째로 기록한다.
const hostHTML = (source, owned) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>호스트</title></head><body data-member="${owned ? 'in' : 'out'}" data-record-source="${source}">
<script>window.LT41={source:${JSON.stringify(source)},writable:${owned},owned:${owned},momentId:'m1',prefs:{},tree:${JSON.stringify(tree)},trees:[${JSON.stringify(tree)}]};window.LT41_MESSAGES=[];addEventListener('message',(e)=>{if(e.data&&String(e.data.type||'').startsWith('lt41-'))window.LT41_MESSAGES.push(e.data.type)});</script>
<iframe src="/v41/views/track59-sketchbook.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;

// 첫 화면 호스트: 로그아웃 상태(셸이 home.html을 iframe으로 여는 것과 같은 틀).
const homeHostHTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>첫 화면 호스트</title></head><body data-member="out" data-record-source="file" data-tree-count="0">
<script>window.LT41={source:'file',member:'out',treeCount:0,trees:[],prefs:{}};window.LT41_MESSAGES=[];addEventListener('message',(e)=>{if(e.data&&String(e.data.type||'').startsWith('lt41-'))window.LT41_MESSAGES.push(e.data.type)});</script>
<iframe src="/v41/home.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;

const CAPTURE_DIR = 'E:\\lovetree-qa\\lane\\local1-635a';
const shot = (page, name) => { mkdirSync(CAPTURE_DIR, { recursive: true }); return page.screenshot({ path: path.join(CAPTURE_DIR, name + '.png'), fullPage: false }); };

async function openBook(browser, url, { width = 1440, height = 900, theme = 'night' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  await context.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
  const problems = [];
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + String(e).slice(0, 200)));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) {
    frame = page.frames().find((f) => f !== page.mainFrame() && /track59-sketchbook/.test(f.url()));
    if (!frame) await page.waitForTimeout(250);
  }
  assert.ok(frame, '책 프레임이 열린다');
  await frame.waitForFunction(() => !!document.querySelector('.moment'), null, { timeout: 20000 });
  await page.waitForTimeout(800);
  return { context, page, frame, problems };
}

// 화면 글자 전체에서 흔적 값(undefined·null·NaN·[object Object])을 찾는다.
const scanPage = (frame) => frame.evaluate(() => {
  const text = (document.body?.innerText || '') + ' ' + (document.body?.textContent || '');
  return ['undefined', 'null', 'NaN', '[object Object]'].filter((bad) => text.includes(bad));
});

// 첫 장부터 마지막 장까지 전부 넘기며 매 장마다 흔적 값을 검사한다.
async function sweepPages(frame, { expectGuide = null } = {}) {
  const found = [];
  for (let i = 0; i < 40; i++) {
    const bad = await scanPage(frame);
    if (bad.length) found.push({ page: i, bad });
    const next = frame.locator('#nextBtn');
    if (await next.isDisabled()) break;
    await next.click();
    await frame.waitForTimeout(450);
  }
  return found;
}

test('#635 규칙(정적): 감상 화면에서 다음 이야기 안내를 감추고, undefined의 근원을 끊는다', () => {
  const extra = read('public/v41/views/book/book-extra.js');
  // undefined의 근원: readOnly에서 맨 return은 문자열에 그대로 붙었다.
  assert.match(extra, /function otherTreesBlock\(\)\{\s*\n\s*if\(LTDEMO\.readOnly\)return ''/, 'otherTreesBlock은 빈 문자열을 돌려준다');
  // 감상 화면(공유·예시)에서는 '다음 이야기' 안내 자체를 감춘다 — 한 장·두 장 모두.
  assert.match(extra, /if\(!LTDEMO\.readOnly\)\{\s*\n\s*const flow=host\.querySelector\('\.page-content'\)\|\|host;/, '한 장: 감상 화면에서 안내를 붙이지 않는다');
  assert.match(extra, /rightPage\.innerHTML=LTDEMO\.readOnly\?'':'<div class="next-page">/, '두 장: 감상 화면의 마지막 오른쪽 쪽은 깨끗하게 비운다');
  // 내 트리에서는 안내 문장+단추를 그대로 둔다(감추지 않는다).
  assert.ok(extra.includes("t(NEXT_PAGE_COPY)"), '내 트리 안내 문장 유지');
  assert.ok(extra.includes('data-next-moment'), '내 트리 다음 순간 추가 단추 유지');
});

test('#635 규칙(정적): 감상 화면의 빈 이유 안내를 감추고, 제목 중복 줄을 가른다', () => {
  const usability = read('public/v41/book-usability.mjs');
  // connectionLine: 감상 화면에서는 이유가 비었을 때 줄 자체를 내지 않는다.
  assert.match(usability, /hideEmptyWhy = false/, 'connectionLine에 hideEmptyWhy 옵션');
  assert.match(usability, /if \(hideEmptyWhy && !why\) return null;/, '이유가 비면 null(줄을 숨긴다)');
  const extra = read('public/v41/views/book/book-extra.js');
  // 책 안내줄(#whyMargin)과 상세 판 둘 다 감상 화면에서는 감춘다.
  assert.match(extra, /connectionLine\(next&&next\.reason,\{hideEmptyWhy:!!LTDEMO\.readOnly\}\)|connectionLine\(next&&next\.title,next&&next\.reason,\{hideEmptyWhy:!!LTDEMO\.readOnly\}\)/, '안내줄이 감상 판정을 넘긴다');
  assert.match(extra, /connectionLine\(nextInfo\?\.title,nextInfo\?\.reason,\{hideEmptyWhy:!!LTDEMO\.readOnly\}\)/, '상세 판도 감상 판정을 넘긴다');
  assert.match(extra, /\(line\?'<div class="detail-why">'\)?\+?t\(line\)|line\?'<div class="detail-why">'/, '상세 판은 줄이 있을 때만 그린다');
  // 제목 중복: 사용자 제목과 영상 제목의 같음 판정은 앞뒤 공백·대소문자를 무시한다.
  assert.match(usability, /title\.toLowerCase\(\) === media\.toLowerCase\(\)/, 'userTitleText의 같음 판정');
});

test('#635 규칙(단위): connectionLine·userTitleText가 감상·중복 규칙을 지킨다', async () => {
  const { connectionLine, userTitleText, titleView } = await import('../public/v41/book-usability.mjs');
  // 내 트리: 이유가 비면 안내 문장(예전 그대로).
  assert.equal(connectionLine('다음', ''), '다음 순간으로 이어진 이유: 이어진 이유를 아직 적지 않았어요');
  // 감상 화면: 이유가 비면 줄 자체가 없다. 이유가 있으면 그대로 보인다.
  assert.equal(connectionLine('다음', '', { hideEmptyWhy: true }), null);
  assert.equal(connectionLine('다음', '함께 뛰었으니까', { hideEmptyWhy: true }), '다음 순간으로 이어진 이유: 함께 뛰었으니까');
  // 제목 중복: 앞뒤 공백·대소문자가 달라도 같은 제목이면 '내 제목'은 없는 것이 된다(영상 제목 하나만 보인다).
  assert.equal(userTitleText({ title: '  super shy — official mv ', mediaMetadata: { title: VIDEO_TITLE } }), '');
  assert.equal(userTitleText({ title: 'SUPER SHY — OFFICIAL MV', mediaMetadata: { title: VIDEO_TITLE } }), '');
  // 정말 다른 제목은 그대로 둔다.
  assert.equal(userTitleText({ title: '우리의 첫 콘서트', mediaMetadata: { title: VIDEO_TITLE } }), '우리의 첫 콘서트');
  // titleView: 같은 제목이면 sub(▶ 줄)가 비고, 다르면 남는다.
  assert.equal(titleView({ title: 'super shy — official mv', mediaMetadata: { title: VIDEO_TITLE } }).sub, '');
  assert.equal(titleView({ title: '우리의 첫 콘서트', mediaMetadata: { title: VIDEO_TITLE } }).sub, VIDEO_TITLE);
});

test('#635 화면: 공유 링크 책(로그아웃) 전 장에서 undefined·null·NaN 흔적이 없고, 마지막 장은 깨끗하다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(`미리보기 검사에서는 화면 시험 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      for (const theme of ['night', 'garden']) {
        const { context, page, frame, problems } = await openBook(browser, `${base}/share-host.html?w=${width}&t=${theme}`, { width, height, theme });
        const found = await sweepPages(frame);
        assert.deepEqual(found, [], `${width}·${theme}: 화면 흔적 값 ${JSON.stringify(found)}`);
        assert.equal(problems.length, 0, `${width}·${theme}: 화면 오류 ${problems.join(' | ')}`);
        // 감상 화면에서는 '다음 이야기' 안내가 어디에도 없다.
        const copy = await frame.evaluate(() => document.body.textContent.includes('이 순간 다음 이야기를 남겨 보세요'));
        assert.equal(copy, false, `${width}·${theme}: 감상 화면에 다음 이야기 안내가 보인다`);
        // 마지막 장 캡처(390·1440 × 밤·정원).
        if (theme === 'night' || theme === 'garden') await shot(page, `share-last-${width}-${theme}`);
        await context.close();
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
});

test('#635 화면: 내 트리 책(로그인) 전 장에서 흔적 값이 없고, 마지막 장에 안내 문장이 남는다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(`미리보기 검사에서는 화면 시험 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const { context, page, frame, problems } = await openBook(browser, `${base}/own-host.html?w=${width}`, { width, height, theme: 'night' });
      const found = await sweepPages(frame);
      assert.deepEqual(found, [], `${width}: 화면 흔적 값 ${JSON.stringify(found)}`);
      assert.equal(problems.length, 0, `${width}: 화면 오류 ${problems.join(' | ')}`);
      // 내 트리에서는 안내 문장+단추가 그대로 보인다.
      const hasGuide = await frame.evaluate(() => document.body.textContent.includes('이 순간 다음 이야기를 남겨 보세요') && !!document.querySelector('[data-next-moment]'));
      assert.equal(hasGuide, true, `${width}: 내 트리 마지막 장의 안내 문장·단추`);
      await context.close();
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
});

test('#635 화면: 첫 화면 어떻게 쓰나요 → 안내 패널이 열리고 둘러보기는 열리지 않는다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(`미리보기 검사에서는 화면 시험 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      for (const theme of ['night', 'garden']) {
        const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
        await context.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
        const page = await context.newPage();
        await page.goto(`${base}/home-host.html?w=${width}&t=${theme}`, { waitUntil: 'domcontentloaded' });
        let frame = null;
        for (let i = 0; i < 80 && !frame; i++) {
          frame = page.frames().find((f) => f !== page.mainFrame() && /home\.html/.test(f.url()));
          if (!frame) await page.waitForTimeout(250);
        }
        assert.ok(frame, '첫 화면 프레임이 열린다');
        await frame.waitForFunction(() => {
          const r = document.getElementById('orbit')?.shadowRoot;
          return !!r?.querySelector('[data-do=guide]');
        }, null, { timeout: 20000 });
        await page.waitForTimeout(800);
        // 전: 첫 화면 모습.
        await shot(page, `home-before-${width}-${theme}`);
        // '어떻게 쓰나요' 클릭 → 안내 패널이 열린다.
        await frame.evaluate(() => document.getElementById('orbit').shadowRoot.querySelector('[data-do=guide]').click());
        await frame.waitForFunction(() => {
          const r = document.getElementById('orbit')?.shadowRoot;
          const d = r?.querySelector('dialog[aria-label="어떻게 쓰나요"]');
          return !!d?.open;
        }, null, { timeout: 5000 });
        // 안내 내용 4줄이 보인다.
        const guideText = await frame.evaluate(() => document.getElementById('orbit').shadowRoot.querySelector('dialog[aria-label="어떻게 쓰나요"]').textContent);
        for (const line of ['영상 링크를 붙여 넣으면', '트리로 묶여요', '책·보드·지도로', '둘러보기에서 다른 팬도 볼 수 있어요']) {
          assert.ok(guideText.includes(line), `${width}·${theme}: 안내 줄 누락 — ${line}`);
        }
        // 후: 패널이 열린 모습.
        await shot(page, `home-after-${width}-${theme}`);
        // 둘러보기는 열리지 않았다(셸에 lt41-community를 보내지 않았다).
        let sent = await page.evaluate(() => window.LT41_MESSAGES);
        assert.ok(!sent.includes('lt41-community'), `${width}·${theme}: 안내 패널을 열었을 때 둘러보기가 같이 열렸다`);
        // '둘러보기' 단추는 닫고 나서 둘러보기로 보낸다.
        await frame.evaluate(() => document.getElementById('orbit').shadowRoot.querySelector('[data-do=guide-community]').click());
        await page.waitForTimeout(300);
        sent = await page.evaluate(() => window.LT41_MESSAGES);
        assert.ok(sent.includes('lt41-community'), `${width}·${theme}: 둘러보기 단추가 둘러보기로 보내지 않았다`);
        // '첫 순간 추가'는 로그아웃 첫 단추와 같은 동작(lt41-start)이다.
        await frame.evaluate(() => document.getElementById('orbit').shadowRoot.querySelector('[data-do=guide]').click());
        await frame.waitForFunction(() => document.getElementById('orbit')?.shadowRoot?.querySelector('dialog[aria-label="어떻게 쓰나요"]')?.open, null, { timeout: 5000 });
        await frame.evaluate(() => document.getElementById('orbit').shadowRoot.querySelector('[data-do=guide-new]').click());
        await page.waitForTimeout(300);
        sent = await page.evaluate(() => window.LT41_MESSAGES);
        assert.ok(sent.includes('lt41-start'), `${width}·${theme}: 첫 순간 추가 단추가 시작 흐름으로 보내지 않았다`);
        await context.close();
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
});

// 호스트 페이지: 셸이 iframe에 LT41을 넘기는 것과 같은 틀(공유 감상·내 트리·첫 화면). 저장소 파일을 더럽히지 않는다.
const EXTRA_ROUTES = { '/share-host.html': hostHTML('share', false), '/own-host.html': hostHTML('server', true), '/home-host.html': homeHostHTML };
