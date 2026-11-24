// #635 PR A: 감상 화면(공유 링크·예시)의 고장 2개 + 문구 정리 — 데이터·규칙은 그대로, 화면만.
// #635 PR B(2026-11-15, 대표 캡처 지적 3가지)를 같은 잡에서 검사한다:
//   5. 안내 패널 다듬기 — 패널 여백이 네 방향 같게(#guidePanel id 누락 수리), 열자마자 닫기 포커스 테두리 없음(초점은 제목),
//      word-break:keep-all, 단추는 오른쪽 아래·주 단추가 오른쪽 끝.
//   6. 공유 책 마지막 장 — 책장 넘기기 힌트 상자(.turn-why)가 글 위에 반투명으로 겹치지 않는다(감상에서는 내지 않는다),
//      공책 줄이 글 줄 높이(31px 격자)와 맞고, 390에서 책이 남은 화면을 쓴다.
//   7. 영상 칸 — 재생 전 빈 크림 상자 금지: 보관 썸네일을 먼저, 없거나 깨지면 제목 글 카드.
//   좌표·DOM 검사(elementFromPoint)로 확인한다 — 눈 확인에 기대지 않는다.
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
import { tmpdir } from 'node:os';
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

const CAPTURE_DIR = process.env.LT_SHARE635_CAPTURE_DIR || path.join(tmpdir(), 'lt-share635-captures');
const shot = (page, name) => { mkdirSync(CAPTURE_DIR, { recursive: true }); return page.screenshot({ path: path.join(CAPTURE_DIR, name + '.png'), fullPage: false }); };

async function openBook(browser, url, { width = 1440, height = 900, theme = 'night', route = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  await context.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
  if (route) await context.route('**://i.ytimg.com/**', route);
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

// #635 PR B: 겹침 검사 — 보이는 글자 요소끼리 겹치거나, 다른 요소에 가려지면(점 검사) 실패다.
// 판정은 좌표·DOM으로 한다(눈 확인 금지). 부모-자식 관계는 겹침이 아니다.
const scanOverlap = (frame) => frame.evaluate(() => {
  const seen = (el) => {
    // 요소 자신뿐 아니라 조상 사슬도 본다 — 렌즈 복제본(#lens)·닫힌 패널은 opacity:0로만 숨겨져 있어
    // 요소 하나만 보면 '보이는 것'으로 잘못 잡힌다(#635 PR B).
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
    }
    const r = el.getBoundingClientRect();
    if (!(r.width > 2 && r.height > 2)) return false;
    // 화면 밖(닫힌 패널이 transform으로 치워진 것 등)은 겹침 판정에서 뺀다.
    return r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
  };
  const texts = [...document.querySelectorAll('h1,h2,h3,h4,p,span,b,strong,small,li,button,a,label')]
    .filter((el) => !el.closest('#lens,#mobileLensStage') && seen(el) && (el.textContent || '').trim() && !el.closest('.flip-sheet,[hidden]'));
  const issues = [];
  const related = (a, b) => a === b || a.contains(b) || b.contains(a);
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    if (related(a, b)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
    const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ox > 4 && oy > 4) issues.push({ a: String(a.className || a.tagName).slice(0, 40), b: String(b.className || b.tagName).slice(0, 40) });
  }
  const covered = [];
  for (const el of texts) {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!top || related(top, el)) continue;
    // 렌즈 복제본(#lens·#mobileLensStage, 보이지 않는 거울)은 실제로 가리는 것이 아니다.
    if (top.closest('#lens,#mobileLensStage')) continue;
    covered.push({ el: String(el.className || el.tagName).slice(0, 40), by: String(top.className || top.tagName).slice(0, 40) });
  }
  return { issues, covered };
});

// #635 PR B: 책장 넘기기 힌트 상자가 감상에서는 보이지 않는다 + 390에서 책이 남은 화면을 쓴다.
const scanBookLayout = (frame) => frame.evaluate(() => {
  const tw = document.querySelector('#turnWhy');
  const mp = document.querySelector('.mobile-page')?.getBoundingClientRect();
  const wrap = document.querySelector('.book-wrap')?.getBoundingClientRect();
  return {
    turnWhyShown: tw ? tw.classList.contains('show') : null,
    turnWhyOpacity: tw ? Number(getComputedStyle(tw).opacity) : null,
    pageBottom: mp ? Math.round(mp.bottom) : null,
    wrapBottom: wrap ? Math.round(wrap.bottom) : null,
    viewport: innerHeight
  };
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

test('#635 PR B 규칙(정적): 안내 패널 여백·포커스·줄바꿈·단추 자리와 힌트 상자·영상 칸 규칙', () => {
  const home = read('v41/home.js');
  // guideStyle의 규칙은 전부 #guidePanel로 적혀 있다 — id가 없으면 패딩·테마 규칙이 통째로 무시됐다(내용이 테두리에 붙은 원인).
  assert.match(home, /guideDialog\.id='guidePanel';/, '안내 패널에 #guidePanel id를 준다');
  assert.match(home, /#guidePanel\{word-break:keep-all\}/, '단어 중간 줄바꿈 금지(keep-all)');
  assert.match(home, /#guidePanel \.guide-body\{padding:42px/, '패널 안쪽 여백은 다른 창과 같은 42px');
  assert.match(home, /#guidePanel \.detail-buttons\{margin-top:24px;justify-content:flex-end\}/, '단추를 오른쪽 아래로 모은다');
  // 주 단추('첫 순간 추가')가 오른쪽 끝 — DOM 순서(탭 순서)도 보이는 순서와 같다.
  const buttons = home.indexOf('data-do="guide-community"'), primary = home.indexOf('data-do="guide-new"');
  assert.ok(buttons > -1 && primary > buttons, '주 단추가 DOM에서 뒤(오른쪽 끝)에 있다');
  // 열자마자 포커스 테두리가 보이지 않게: 처음 포커스는 닫기가 아니라 패널 제목(tabindex=-1)이다.
  assert.match(home, /<h2 tabindex="-1">/, '패널 제목이 포커스를 받을 수 있다');
  assert.match(home, /guideDialog\.querySelector\('h2'\)\?\.focus\(\);/, '처음 포커스는 패널 제목이다');
  assert.ok(!/querySelector\('\.close'\)\?\.focus\(\)/.test(home.split('guideDialog.addEventListener')[0]), '닫기 단추에 프로그램 포커스를 주지 않는다');
  // 책장 넘기기 힌트 상자: 감상 화면에서는 내지 않는다(내 트리는 그대로).
  const book = read('public/v41/views/book/book.js');
  assert.match(book, /classList\.toggle\('show',p>\.16&&!LTDEMO\.readOnly\)/, '힌트 상자는 감상 화면에서 나오지 않는다');
  // 공책 줄: 줄 간격(31px)과 글 줄 높이를 맞춘다.
  const bookCss = read('public/v41/views/book/book.css');
  assert.match(bookCss, /\.note-piece h2\{font-size:28px;line-height:31px;margin:0 0 31px/, '공책 제목 줄 높이 = 줄 간격');
  assert.match(bookCss, /\.note-piece p\{font-size:16px;line-height:31px\}/, '공책 본문 줄 높이 = 줄 간격');
  assert.match(bookCss, /\.note-piece:before\{[^}]*top:66px;bottom:0;background:repeating-linear-gradient/, '첫 줄은 윗줄바닥(35+31px)에 두고 줄은 카드 아래까지 그린다');
  const usabilityCss = read('public/v41/views/book/book-usability.css');
  assert.match(usabilityCss, /\.mobile-page \.note-piece:before\{top:49px\}/, '모바일 첫 줄도 패딩+31px');
  assert.match(usabilityCss, /\.mobile-page \.note-piece h2\{margin-bottom:31px\}/, '모바일 제목 아래 여백도 한 칸');
  assert.match(usabilityCss, /\.mobile-page \.note-piece p\{font-size:14px;line-height:31px\}/, '모바일 본문 줄 높이 = 줄 간격');
  // 390에서 책이 남은 화면을 쓴다.
  const reader = read('public/v41/reader-layout.css');
  assert.match(reader, /phone\]\[data-v41-screen=book\] \.stage\{[^}]*display:flex;flex-direction:column[^}]*min-height:calc\(100dvh - 60px\)/, 'stage가 남은 화면 높이를 세운다');
  assert.match(reader, /phone\]\[data-v41-screen=book\] \.book-wrap\{[^}]*flex:1 1 auto/, '책이 남은 칸을 채운다');
  assert.match(reader, /phone\]\[data-v41-screen=book\] \.mobile-page\{[^}]*flex:1 1 auto/, '쪽이 책 높이를 채운다');
  // 영상 칸(빈 상자 금지·썸네일/글카드)은 아래 화면 시험이 실제로 그려진 칸을 재서 판정한다.
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
        const { context, page, frame, problems } = await openBook(browser, `${base}/share-host.html?w=${width}&t=${theme}`, { width, height, theme, route: (r) => r.abort() });
        // 책장을 끝까지 넘기기만 한다 — 매 장의 흔적 값·겹침·가려짐은 화면 공통 검사기(#657)가 같은 규칙으로 잡는다.
        await sweepPages(frame);
        assert.equal(problems.length, 0, `${width}·${theme}: 화면 오류 ${problems.join(' | ')}`);
        // #635 PR B: 책장 넘기기 힌트 상자가 보이지 않는다(겹침·가려짐 판정은 #657 검사기가 잡는다).
        const layout = await scanBookLayout(frame);
        assert.equal(layout.turnWhyShown, false, `${width}·${theme}: 감상 화면에 책장 넘기기 힌트 상자가 보인다`);
        assert.equal(layout.turnWhyOpacity, 0, `${width}·${theme}: 힌트 상자가 반투명으로 남는다`);
        // #635 PR B: 영상 칸은 빈 상자가 아니다(영상이 있는 장에서) — 썸네일 또는 제목 글 카드다.
        const videoCell = await frame.evaluate(() => {
          const btn = document.querySelector('.yt-play');
          if (!btn) return { kind: '없음' };
          const img = btn.querySelector('img');
          const card = btn.querySelector('.lt-fallback-card');
          const empty = btn.querySelector('.yt-placeholder');
          return { kind: img ? '썸네일' : card ? '글카드' : empty ? '빈상자' : '기타', imgOk: img ? img.naturalWidth > 0 : null };
        });
        if (videoCell.kind !== '없음') assert.equal(videoCell.kind, '글카드', `${width}·${theme}: 재생 전 영상 칸이 빈 상자다(${JSON.stringify(videoCell)})`);
        // #635 PR B: 390에서 책 아래 빈 공간이 화면의 1/5를 넘지 않는다(예전 1/4 → 책이 남은 화면을 쓴다).
        if (width === 390) {
          const emptyRatio = (layout.viewport - layout.wrapBottom) / layout.viewport;
          assert.ok(emptyRatio <= 0.2, `390·${theme}: 책 아래 빈 공간이 화면의 ${Math.round(emptyRatio * 100)}%다`);
        }
        // 감상 화면에서는 '다음 이야기' 안내가 어디에도 없다(글자와 요소 둘 다).
        const copy = await frame.evaluate(() => ({
          text: document.body.textContent.includes('이 순간 다음 이야기를 남겨 보세요'),
          block: !!document.querySelector('.next-page'),
          nextButton: !!document.querySelector('[data-next-moment]'),
          emptyWhy: document.body.textContent.includes('이어진 이유를 아직 적지 않았어요') || document.body.textContent.includes('연결 이유는 아직 적지 않았어요'),
          undefinedTrace: /undefined|null|NaN/.test(document.body.textContent)
        }));
        assert.equal(copy.text, false, `${width}·${theme}: 감상 화면에 다음 이야기 안내가 보인다`);
        assert.equal(copy.block, false, `${width}·${theme}: 감상 화면에 다음 이야기 블록(.next-page)이 남아 있다`);
        assert.equal(copy.nextButton, false, `${width}·${theme}: 감상 화면에 다음 순간 단추가 남아 있다`);
        assert.equal(copy.emptyWhy, false, `${width}·${theme}: 감상 화면에 빈 이유 안내가 남아 있다`);
        assert.equal(copy.undefinedTrace, false, `${width}·${theme}: 감상 화면 글자에 undefined·null·NaN이 있다`);
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
      const hasGuide = await frame.evaluate(() => ({
        text: document.body.textContent.includes('이 순간 다음 이야기를 남겨 보세요'),
        button: !!document.querySelector('[data-next-moment]'),
        block: !!document.querySelector('.next-page')
      }));
      assert.equal(hasGuide.text, true, `${width}: 내 트리 마지막 장의 안내 문장`);
      assert.equal(hasGuide.button, true, `${width}: 내 트리 마지막 장의 다음 순간 단추`);
      assert.equal(hasGuide.block, true, `${width}: 내 트리 마지막 장의 다음 이야기 블록`);
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
        // #635 PR B: 패널 여백이 네 방향 같고(첫 글자·단추 기준), 열자마자 포커스 테두리가 없으며, 단어 중간 줄바꿈이 없고, 단추는 오른쪽 아래(주 단추가 오른쪽 끝)다.
        const geo = await frame.evaluate(() => {
          const r = document.getElementById('orbit').shadowRoot;
          const d = r.querySelector('#guidePanel');
          const db = d.getBoundingClientRect();
          const h2 = d.querySelector('h2').getBoundingClientRect();
          const list = d.querySelector('.guide-list').getBoundingClientRect();
          const btns = [...d.querySelectorAll('.detail-buttons button')];
          // 처리방침·약관 줄이 단추 아래에 추가됐다 — 아래 여백은 마지막 내용(그 줄)에서 잰다.
          const policy = d.querySelector('.guide-policy');
          const last = (policy && policy.getBoundingClientRect().height > 0 ? policy : btns[btns.length - 1]).getBoundingClientRect();
          const active = r.activeElement;
          return {
            top: Math.round(h2.top - db.top), left: Math.round(list.left - db.left), right: Math.round(db.right - list.right), bottom: Math.round(db.bottom - last.bottom),
            focusTag: active ? active.tagName + '.' + (active.className || '') : 'none',
            closeFocused: active === d.querySelector('.close'),
            keepAll: getComputedStyle(d.querySelector('.guide-list li')).wordBreak,
            btns: btns.map((b) => ({ text: b.textContent.trim(), primary: b.classList.contains('primary-cta'), x: Math.round(b.getBoundingClientRect().x) }))
          };
        });
        const sides = [geo.top, geo.left, geo.right, geo.bottom];
        // #635 PR B: 패딩 자체가 네 방향 같은 값(42px — 첫 화면 다른 창과 같다)이고, 첫 글자·단추에서 테두리까지 거리가 네 방향 모두 그 값 이상이다.
        // 좌우 여백은 본문 최대 폭(620px)을 가운데 둔 여분이니 패딩과 같거나 그보다 크면 된다.
        const bodyPad = await frame.evaluate(() => getComputedStyle(document.getElementById('orbit').shadowRoot.querySelector('#guidePanel .guide-body')).padding);
        assert.equal(bodyPad, '42px', `${width}·${theme}: 패널 안쪽 여백이 네 방향 같지 않다(${bodyPad})`);
        assert.ok(Math.min(...sides) >= 40, `${width}·${theme}: 패널 여백이 작다 ${JSON.stringify(sides)}`);
        assert.ok(Math.abs(sides[1] - sides[2]) <= 3 && Math.abs(sides[0] - sides[3]) <= 3, `${width}·${theme}: 패널 여백이 좌우/위아래가 다르다 ${JSON.stringify(sides)}`);
        assert.equal(geo.closeFocused, false, `${width}·${theme}: 열자마자 닫기 단추에 포커스가 있다(포커스 테두리가 보인다)`);
        assert.ok(/H2/.test(geo.focusTag), `${width}·${theme}: 처음 포커스가 패널 제목이 아니다(${geo.focusTag})`);
        assert.equal(geo.keepAll, 'keep-all', `${width}·${theme}: 단어 중간 줄바꿈 허용됨`);
        assert.ok(geo.btns.length >= 2 && geo.btns[geo.btns.length - 1].primary && geo.btns[geo.btns.length - 1].x > geo.btns[0].x, `${width}·${theme}: 주 단추가 오른쪽 끝이 아니다 ${JSON.stringify(geo.btns)}`);
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

// #635 PR B: 영상 칸 세 상태 — 유튜브 보관 썸네일이 있으면 그것이 먼저고, 못 부르면(없음·깨짐) 제목 글 카드다.
// 보관 썸네일 요청은 i.ytimg.com — 시험에서는 경로 가로채기(route)로 있음/없음을 정한다(외부 회선에 기대지 않는다).
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('#635 PR B 화면: 영상 칸 — 보관 썸네일을 먼저 보이고, 없거나 깨지면 제목 글 카드다(빈 상자 금지)', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(`미리보기 검사에서는 화면 시험 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const thumbOk = (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(TINY_PNG, 'base64') });
    for (const [route, expect, options] of [
      ['/share-host.html', '썸네일', { route: thumbOk }],          // 유튜브 보관 썸네일 있음 → 썸네일이 먼저
      ['/share-host.html', '글카드', { route: (r) => r.abort() }]  // 썸네일이 없거나 깨지면 → 제목 글 카드
    ]) {
      const { context, frame, problems } = await openBook(browser, `${base}${route}`, { width: 390, height: 844, theme: 'garden', ...options });
      assert.equal(problems.length, 0, `${route}: 화면 오류 ${problems.join(' | ')}`);
      const cell = await frame.evaluate(() => {
        const btn = document.querySelector('.yt-play');
        if (!btn) return { kind: '버튼 없음' };
        const img = btn.querySelector('img');
        const card = btn.querySelector('.lt-fallback-card');
        const empty = btn.querySelector('.yt-placeholder');
        const r = btn.getBoundingClientRect();
        return { kind: img ? '썸네일' : card ? '글카드' : empty ? '빈상자' : '기타', imgOk: img ? img.naturalWidth > 0 : null, w: Math.round(r.width), h: Math.round(r.height), title: (btn.textContent || '').includes('Super Shy — Official MV') };
      });
      assert.equal(cell.kind, expect, `${route}: 영상 칸이 ${expect}가 아니다(${JSON.stringify(cell)})`);
      if (expect === '썸네일') assert.equal(cell.imgOk, true, `${route}: 썸네일이 실제로 그려지지 않았다`);
      if (expect === '글카드') assert.equal(cell.title, true, `${route}: 글 카드에 제목이 없다`);
      assert.ok(cell.w > 100 && cell.h > 60, `${route}: 영상 칸이 너무 작다 ${JSON.stringify(cell)}`);
      await context.close();
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
});

// ===================== #635 PR C (2026-11-15): 남은 4가지 + 마무리 =====================
// 8. 로그아웃 메뉴(≡) 맨 위 '내 러브트리 시작하기' — 첫 화면의 '첫 순간 추가'와 같은 시작 흐름(openLoginStart('first')).
// 9. '1단계 · 0일' → 같은 날이면 '첫날', 그 뒤는 'N일째'(#549의 '0일 전 → 오늘' 원칙과 맞춤). 화면에 '0일' 글자가 없다.
// 10. 책 영상 칸 '크게 보기' — '재생' 단추와 같은 정도로 읽힌다(대비 4.5:1 이상, 실측).
// 11. 390 아래쪽 간격 — 책과 '새 소식 · 의견 보내기' 링크 줄 사이 16px 이상·겹침 0,
//     첫 화면에서는 '드래그 · 금테 카드를 눌러 감상' 안내를 단추 묶음 바로 아래(안내 줄 옆)로 올리고 링크 줄과 16px 이상 띄운다.

test('#635 PR C 규칙(정적): 시작 입구·첫날 표기·크게 보기 대비·아래쪽 간격·안내 자리', () => {
  const shell = read('public/v41/shell/navigation-menu.mjs');
  // 8. 로그아웃 메뉴 맨 위 시작 입구 — 로그인 상태에서는 붙지 않는다(조건이 add('첫 화면'…) 앞에 있다).
  const fold = shell.match(/function\s+buildFoldMenu\s*\(\s*\)\s*\{([\s\S]*?)^\s*\}/m);
  assert.ok(fold, '접기 메뉴 함수가 존재한다');
  const startEntry = fold[1].search(/if\s*\(\s*!\s*ctx\.member\?\.snapshot\s*\(\s*\)\s*\.owned\s*\)\s*add\s*\(\s*'내 러브트리 시작하기'\s*,\s*\(\s*\)\s*=>\s*\(\s*0\s*,\s*ctx\.openLoginStart\s*\)\s*\(\s*'first'\s*\)\s*\)\s*;/);
  assert.ok(startEntry >= 0, '접기 메뉴(≡)에 로그아웃 시작 입구를 넣는다');
  assert.ok(fold[1].search(/add\s*\(\s*'첫 화면'/) > startEntry, '시작 입구는 첫 화면보다 먼저다');
  // 9. '0일' 표기 — '이어진 순간' 요약이 첫날·N일째로 읽힌다.
  const extra = read('public/v41/views/book/book-extra.js');
  assert.match(extra, /journey\.days===0\?'첫날':journey\.days\+'일째'/, "'이어진 순간' 요약: 같은 날은 '첫날', 그 뒤는 'N일째'");
  assert.ok(!extra.includes("journey.days+'일'"), "예전 'N일' 표기가 남지 않는다");
  // 10. '크게 보기' 대비 — 밤은 '재생' 단추와 같은 바탕·글자, 정원은 종이 바탕·잉크 글자.
  const useCss = read('public/v41/views/book/book-usability.css');
  assert.match(useCss, /\.media-links button\{[^}]*background:rgba\(7,7,12,\.72\);color:var\(--lt-pearl\)/, "밤 '크게 보기'는 '재생'과 같은 바탕·글자다");
  assert.match(useCss, /html\[data-lt-theme=garden\] \.media-links button\{background:var\(--lt-paper\);color:var\(--lt-gold-ink\)\}/, "정원 '크게 보기'는 종이 바탕·잉크 글자다");
  // 11. 간격·안내 자리.
  const layout = read('public/v41/reader-layout.css');
  /* #book-dup2: 여백 60→68px — 보라색 책 테두리(.book-cover)가 wrap 아래로 14px 내려와 60px로는
     테두리 아래끝이 링크 줄 위 11px(정원에서는 10px 겹침)이었다. 68px로 테두리 아래끝을 링크 줄 위 17px에 둔다. */
  assert.match(layout, /padding:24px 14px 68px/, '390 책 화면: 아래 고정 링크 줄과 책 테두리가 겹치지 않게 16px 이상 띄울 여백을 둔다');
  // #1204 removed the old two-line orbit guidance; its absence and spacing are browser-tested.
});

// 실제 셸(/v41/)을 여는 도우미 — 로그아웃 상태 그대로(예시 기록).
async function openShell(browser, base, hash, { width = 1440, height = 900, theme = 'night' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  await context.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(String(e.message || e)));
  await page.goto(`${base}/v41/${hash}`, { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) {
    frame = page.frames().find((f) => /track59-sketchbook|src064-orbit|home/.test(f.url()));
    if (!frame) await page.waitForTimeout(250);
  }
  await page.waitForTimeout(1200);
  return { context, page, frame, problems };
}

// 대비 실측: 글자색(+opacity)과 그 자리에 실제 칠해진 바탕(스크린샷 최다 색)으로 4.5:1을 낸다(#515·#516과 같은 방법).
const parseColor = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
const lumOf = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
const ratioOf = (a, b) => { const x = lumOf(a), y = lumOf(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const blend = (t, u) => ({ r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a), a: 1 });

async function measureContrast(page, frame, selector) {
  const loc = frame.locator(selector).first();
  if (!(await loc.count()) || !(await loc.isVisible())) return null;
  const box = await loc.boundingBox();
  if (!box || box.width < 1 || box.height < 1) return null;
  const style = await loc.evaluate((el) => { const cs = getComputedStyle(el); return { color: cs.color, opacity: cs.opacity, text: el.textContent.trim() }; });
  const b64 = (await page.screenshot({ clip: { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.max(1, Math.ceil(box.width)), height: Math.max(1, Math.ceil(box.height)) } })).toString('base64');
  const dominant = await page.evaluate(async (data) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; const counts = new Map();
    for (let i = 0; i < d.length; i += 4) { const k = `${d[i]},${d[i + 1]},${d[i + 2]}`; counts.set(k, (counts.get(k) || 0) + 1); }
    return [...counts].sort((a, b) => b[1] - a[1])[0][0];
  }, b64);
  const [r, g, b] = dominant.split(',').map(Number);
  const color = parseColor(style.color);
  const fg = blend({ ...color, a: color.a * Number(style.opacity) }, { r, g, b, a: 1 });
  return { text: style.text.slice(0, 20), color: style.color, bg: `rgb(${r},${g},${b})`, ratio: Math.round(ratioOf(fg, { r, g, b, a: 1 }) * 100) / 100 };
}

test('#635 PR C 화면: 메뉴 시작 입구·첫날 표기·크게 보기 대비·아래쪽 간격(390·1440 × 밤·정원)', { skip: REQUIRE ? false : skip, timeout: 360000 }, async () => {
  if (skip) assert.fail(`미리보기 검사에서는 화면 시험 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });

    // 8. 로그아웃 메뉴(≡): 첫 항목이 '내 러브트리 시작하기'이고, 누르면 첫 화면의 시작 흐름(로그인 화면 이동)으로 간다.
    {
      const { context, page, problems } = await openShell(browser, base, '#book', { width: 390, height: 844, theme: 'night' });
      assert.equal(problems.length, 0, `메뉴 화면 오류 ${problems.join(' | ')}`);
      await page.click('#mobile-more');
      const items = page.locator('#header-overflow button');
      const first = await items.first().textContent();
      assert.equal((first || '').trim(), '내 러브트리 시작하기', `메뉴 첫 항목이 시작 입구가 아니다(${first})`);
      await shot(page, 'menu-open-390-night');
      await items.first().click();
      // location.assign 이동은 waitForURL가 가로채지 못하는 경우가 있어 주소를 직접 확인한다.
      let target = null;
      for (let i = 0; i < 20 && !target; i++) { if (/auth\/login/.test(page.url())) target = page.url(); else await page.waitForTimeout(200); }
      assert.ok(target, '시작 입구를 눌렀는데 시작 흐름(로그인 화면)으로 가지 않는다 — ' + page.url());
      await context.close();
    }

    for (const width of [390, 1440]) {
      for (const theme of ['night', 'garden']) {
        const height = width === 390 ? 844 : 900;

        // 11-책. 390에서는 아래 링크 줄을 숨겨 책과 겹치지 않게 하고, 1440에서는 책과 링크 줄 사이 16px 이상·겹침 0.
        // 9·10. 첫날 표기와 '크게 보기' 대비.
        {
          const { context, page, frame, problems } = await openShell(browser, base, '#book', { width, height, theme });
          assert.equal(problems.length, 0, `책 ${width}·${theme}: 화면 오류 ${problems.join(' | ')}`);
          const bookBox = await frame.locator(width === 390 ? '.mobile-page' : '.book-wrap').first().boundingBox();
          assert.ok(bookBox, `${width}·${theme}: 책 자리를 못 읽었다`);
          if (width === 390) {
            const hidden = await page.evaluate(() => {
              const el = document.querySelector('.home-links');
              if (!el) return true;
              const cs = getComputedStyle(el);
              return cs.display === 'none' || cs.visibility === 'hidden' || el.getBoundingClientRect().height === 0;
            });
            assert.ok(hidden, `${width}·${theme}: 책 화면에 아래 링크 줄이 보인다`);
          } else {
            const linksTop = await page.evaluate(() => { const l = document.querySelector('.home-links')?.getBoundingClientRect(); return l ? Math.round(l.top) : null; });
            assert.ok(linksTop !== null, `${width}·${theme}: 링크 줄 자리를 못 읽었다`);
            const spacing = Math.round(linksTop - (bookBox.y + bookBox.height));
            assert.ok(spacing >= 16, `${width}·${theme}: 책과 링크 줄 사이가 ${spacing}px다(16px 이상)`);
          }
          await shot(page, `book-after-${width}-${theme}`);
          const overviewButton = frame.locator('#overviewBtn');
          if (!(await overviewButton.isVisible())) {
            const moreButton = frame.locator('.lt-toolbar-more');
            assert.equal(await moreButton.isVisible(), true, `${width}·${theme}: 접힌 도구를 여는 단추가 없다`);
            await moreButton.click();
            await overviewButton.waitFor({ state: 'visible', timeout: 5000 });
          }
          await overviewButton.click();
          await frame.waitForFunction(() => (document.querySelector('#journeySummary')?.textContent || '').length > 0, null, { timeout: 8000 });
          const summary = await frame.evaluate(() => document.querySelector('#journeySummary').textContent.trim());
          assert.match(summary, /^\d+단계 · (첫날|\d+일째)$/, `${width}·${theme}: '이어진 순간' 요약이 첫날·N일째 모양이 아니다(${summary})`);
          assert.ok(!/(^|[^\d])0일/.test(summary), `${width}·${theme}: 요약에 '0일'이 남아 있다(${summary})`);
          await frame.click('#overviewClose');
          await page.waitForTimeout(300);
          await shot(page, `book-after-${width}-${theme}`);
          await context.close();
        }

        // 11-첫 화면. #1204 removed the guidance below the actions; action row and fixed links remain apart.
        {
          const { context, page, frame, problems } = await openShell(browser, base, '', { width, height, theme });
          assert.equal(problems.length, 0, `첫 화면 ${width}·${theme}: 화면 오류 ${problems.join(' | ')}`);
          // #book-dup2. 첫 화면이 실제로 그려졌는지 먼저 확인한다 — 첫 화면 문서(/v41/home.html)는 빌드 산출물(dist)에만
          // 있어서 시험 서버가 소스(public)를 서빙하면 404('nf')가 그려지고, 이후 측정이 전부 무의미해진다.
          const drawn = await frame.evaluate(() => {
            const root = document.getElementById('orbit');
            const sr = root && root.shadowRoot ? root.shadowRoot : document;
            const text = document.body ? document.body.textContent : '';
            return { nf: /Not Found/i.test(text) || text.trim() === 'nf', cards: sr.querySelectorAll('.card').length, center: !!sr.querySelector('.center') };
          });
          assert.equal(drawn.nf, false, `${width}·${theme}: 첫 화면이 404('nf')로 그려졌다 — 시험 서버가 dist(빌드 산출물)를 서빙하는지 확인`);
          assert.ok(drawn.cards > 0 || drawn.center, `${width}·${theme}: 첫 화면(궤도)이 그려지지 않았다(카드 0개)`);
          const noteBox = await frame.locator('.center .actions').first().boundingBox();
          const linksBox = await page.locator('.home-links').boundingBox();
          assert.ok(noteBox && linksBox, `${width}·${theme}: 단추 줄·링크 줄 자리를 못 읽었다`);
          const gapHome = Math.round(linksBox.y - (noteBox.y + noteBox.height));
          const overlapHome = Math.max(0, Math.min(noteBox.y + noteBox.height, linksBox.y + linksBox.height) - Math.max(noteBox.y, linksBox.y));
          assert.equal(overlapHome, 0, `${width}·${theme}: 첫 화면 단추와 링크 줄이 ${overlapHome}px 겹친다`);
          assert.ok(gapHome >= 16, `${width}·${theme}: 첫 화면 단추와 링크 줄 사이가 ${gapHome}px다(16px 이상)`);
          assert.equal(await frame.locator('.center-note,.center-hint').count(), 0, `${width}·${theme}: 지운 안내 문구가 다시 나타났다`);
          // #book-dup. 새 소식 카드: 390에서 머리줄 바로 아래 자리는 '순간 목록'·테마 단추를 가렸다(실측 겹침 133×66px).
          // 이제 화면 아래, 링크 줄 위에 놓인다 — 어떤 단추와도 겹침 0. 1440 자리(오른쪽 아래)는 그대로다.
          {
            const card = page.locator('.updates-card');
            await card.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
            const cardBox = await card.boundingBox();
            assert.ok(cardBox, `${width}·${theme}: 첫 화면에 새 소식 카드가 보이지 않는다`);
            // 로그아웃/게스트에서는 첫 화면의 '순간 목록'·◐를 두지 않고, 테마는 머리줄 단추 하나로 바꾼다(#776 규칙).
            assert.equal(await frame.locator('.menuBtn').count(), 0, `${width}·${theme}: 첫 화면에 '순간 목록'이 있다`);
            assert.equal(await frame.locator('.theme-quick').count(), 0, `${width}·${theme}: 첫 화면에 ◐가 있다`);
            const themeToggle = await page.locator('#theme-toggle').boundingBox();
            assert.ok(themeToggle, `${width}·${theme}: 머리줄 테마 단추가 없다`);
            const overlapWith = (b) => cardBox && b ? Math.max(0, Math.min(cardBox.x + cardBox.width, b.x + b.width) - Math.max(cardBox.x, b.x)) * Math.max(0, Math.min(cardBox.y + cardBox.height, b.y + b.height) - Math.max(cardBox.y, b.y)) : 0;
            assert.equal(overlapWith(themeToggle), 0, `${width}·${theme}: 새 소식 카드가 머리줄 테마 단추와 겹친다`);
            assert.equal(overlapWith(linksBox), 0, `${width}·${theme}: 새 소식 카드가 링크 줄과 겹친다`);
            if (width === 390) assert.ok(cardBox.y + cardBox.height <= linksBox.y, `${width}·${theme}: 새 소식 카드가 링크 줄 위에 있지 않다(카드 아래 ${Math.round(linksBox.y - cardBox.y - cardBox.height)}px)`);
          }
          await shot(page, `home-after-${width}-${theme}`);
          await context.close();
        }
      }
    }

    // 10. '크게 보기' 대비 실측 — 유튜브 순간이 있는 책(share-host)에서 밤·정원 각각 잰다.
    //    (예시 기록의 '영상'은 보관 그림이라 '크게 보기'가 없다 — 대비는 유튜브 칸에서만 의미가 있다.)
    for (const theme of ['night', 'garden']) {
      const { context, page, frame, problems } = await openBook(browser, `${base}/share-host.html`, { width: 390, height: 844, theme, route: (r) => r.abort() });
      assert.equal(problems.length, 0, `대비 ${theme}: 화면 오류 ${problems.join(' | ')}`);
      const expand = await measureContrast(page, frame, '.media-links button');
      assert.ok(expand, `${theme}: '크게 보기' 단추를 찾지 못함`);
      assert.ok(expand.ratio >= 4.5, `${theme}: '크게 보기' 대비 ${expand.ratio}:1(${expand.color} on ${expand.bg})`);
      await context.close();
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
});

// 2026-11-15 보고(게스트 책·자동 공개 안내) — AI 고객(#635 회차)이 본 '게스트 책 마지막 장 → 순간 추가 창' 수사.
// 남은 경로 세 가지를 확인한 결론: ① 둘러보기 패널 '미리보기'는 책 화면·iframe을 만들지 않는다(아래 정적 검사),
// ② 넓은 화면 두 장 보기의 마지막 펼침면·③ 홀수 순간 마지막 장(시험 트리는 순간 3개)은 아래 동작 검사에서
// 공유 링크 책과 같은 길로 잰다. 재현되지 않았으므로 '막혀 있다'는 동작을 시험으로 고정한다(코드 변경 없음).
test('#635 규칙(정적): 둘러보기 미리보기는 책 화면·iframe을 만들지 않는다', () => {
  const panel = read('public/v41/community-panel.mjs');
  assert.doesNotMatch(panel, /track59-sketchbook/, '둘러보기 패널 안에 책 화면을 만들지 않는다 — 미리보기는 카드다');
  assert.doesNotMatch(panel, /createElement\('iframe'\)|<iframe/, '둘러보기 패널은 iframe을 만들지 않는다 — 쓰기 창이 생길 곳이 없다');
});

test('공유 책 마지막 장에서 → 를 눌러도 쓰기 창·쓰기 메시지가 생기지 않는다(390 한 장·1440 두 장, 홀수 마지막)', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(`미리보기 검사에서는 화면 시험 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const { context, page, frame, problems } = await openBook(browser, `${base}/share-host.html`, { width, height, theme: 'night', route: (r) => r.abort() });
      assert.equal(problems.length, 0, `${width}: 화면 오류 ${problems.join(' | ')}`);
      // 끝까지 넘긴다(단추가 비활성이 되면 마지막 장이다).
      for (let i = 0; i < 40; i++) {
        const next = frame.locator('#nextBtn');
        if (await next.isDisabled()) break;
        await next.click();
        await frame.waitForTimeout(450);
      }
      const atLast = await frame.evaluate(() => {
        const st = window.__TRACK59__.getState();
        // #722: 책의 '링크 순간 추가' 창·단추는 지웠다 — 요소 자체가 없어야 한다(읽기 전용에서 없음이 더 강하게 성립).
        return { last: st.page === st.total - 1, nextDisabled: document.querySelector('#nextBtn').disabled, addLinkGone: document.querySelector('#addLinkBtn') === null };
      });
      assert.equal(atLast.last, true, `${width}: 마지막 장까지 넘기지 못했다(${JSON.stringify(atLast)})`);
      assert.equal(atLast.nextDisabled, true, `${width}: 마지막 장에서 → 단추는 비활성이다`);
      assert.equal(atLast.addLinkGone, true, `${width}: 책에는 '＋ 링크 순간' 단추가 없다(지운 뒤)`);
      // 실제 사용자 길: → 단추(disabled — 브라우저가 클릭 이벤트를 만들지 않는다)·키보드 →.
      await frame.click('#nextBtn', { force: true, timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(300);
      await frame.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
      await page.waitForTimeout(500);
      const after = await frame.evaluate(() => ({
        linkModalPresent: document.querySelector('#linkModal') !== null,
        linkModalOpen: document.querySelector('#linkModal')?.classList.contains('open') === true,
        page: window.__TRACK59__.getState().page,
        total: window.__TRACK59__.getState().total,
        writeMessages: (parent.LT41_MESSAGES || []).filter((t) => t === 'lt41-write')
      }));
      assert.equal(after.linkModalPresent, false, `${width}: 책에 링크(쓰기) 창 요소가 남아 있다`);
      assert.equal(after.linkModalOpen, false, `${width}: 마지막 장에서 → 로 링크(쓰기) 창이 열렸다`);
      assert.equal(after.page, after.total - 1, `${width}: 마지막 장에서 → 로 장이 바뀌었다`);
      assert.deepEqual(after.writeMessages, [], `${width}: 쓰기 메시지(lt41-write)가 셸에 남았다`);
      await context.close();
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
});

// #792 4단계 ⑤(대표 캡처 지적 후속): 공유 책 순간 상세의 옆 창이 210px 고정이라
// '순간 열기 · 이 무대 담기' 단추가 창 아래에서 잘렸다. 이제 창 높이는 내용을 따르고 화면보다 길 때만
// 창 전체가 스크롤한다. 숫자 판정: 두 단추 rect가 창 rect 안에 온전히 있고(잘림 0px), 높이 44px 이상,
// 창 안쪽 스크롤이 생기지 않는다(1440·390, 밤).
test('#792 ⑤ 화면: 공유 책 순간 상세에서 순간 열기·이 무대 담기가 창 안에 온전히 있다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(`미리보기 검사에서는 화면 시험 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const { context, page, frame, problems } = await openBook(browser, `${base}/share-host.html`, { width, height, theme: 'night', route: (r) => r.abort() });
      assert.equal(problems.length, 0, `${width}: 화면 오류 ${problems.join(' | ')}`);
      // 공유 번호는 주소에서 읽는다 — 시험 호스트에 #share/<id>/book 주소를 만든다.
      await page.evaluate(() => { location.hash = '#share/' + 's'.repeat(24) + '/book'; });
      // #792 ⑤: 표지 순간이 공개 무대임을 서버가 알려 주면 단추가 선다(드물게 반만 보이던 때를 재현).
      await page.route('**/api/**', (route) => {
        const url = route.request().url();
        if (/\/moments\/[^/]+\/stage$/.test(url)) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ stageId: 'stage-a' }) });
        if (/\/api\/community\/stages\/[^/]+$/.test(url)) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ stageId: 'stage-a', title: 'Super Shy', voted: false, saved: false, weeklyVoters: 9, publicTreeCount: 6 }) });
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, items: [] }) });
      });
      // 상세 창을 연다 — book-extra의 placeDetail이 그리는 길(제목 보기 메시지로 그 길을 태운다).
      await frame.evaluate(() => window.__TRACK59__.showDetail(window.__TRACK59__.pageSteps()[0].id));
      await page.evaluate(() => document.querySelector('iframe').contentWindow.postMessage({ type: 'lt41-title-display', value: 'both' }, location.origin));
      await frame.waitForSelector('#detailSide:not([hidden]) [data-detail-stage]:not([hidden])', { timeout: 8000 });
      const measured = await frame.evaluate(() => {
        const panel = document.querySelector('#detailSide').getBoundingClientRect();
        const fit = (node) => {
          const r = node.getBoundingClientRect();
          return { h: Math.round(r.height), top: Math.round(r.top - panel.top), bottom: Math.round(panel.bottom - r.bottom), left: Math.round(r.left - panel.left), right: Math.round(panel.right - r.right) };
        };
        return {
          viewer: fit(document.querySelector('[data-detail-viewer]')),
          stage: fit(document.querySelector('[data-detail-stage]')),
          sideScroll: document.querySelector('.side-detail').scrollHeight - document.querySelector('.side-detail').clientHeight,
          panelScroll: document.querySelector('#detailSide').scrollHeight - document.querySelector('#detailSide').clientHeight
        };
      });
      for (const [label, box] of [['순간 열기', measured.viewer], ['이 무대 담기', measured.stage]]) {
        assert.ok(box.h >= 44, `${width}: ${label} 단추 높이 44 이상(${box.h})`);
        assert.ok(box.top >= 0 && box.bottom >= 0 && box.left >= 0 && box.right >= 0,
          `${width}: ${label} 단추가 창 안에 온전히 있다(잘림 0px — ${JSON.stringify(box)})`);
      }
      assert.ok(measured.sideScroll <= 1 && measured.panelScroll <= 1, `${width}: 창이 내용에 맞춰 늘어나고 안에서 잘리지 않는다(side ${measured.sideScroll}px·panel ${measured.panelScroll}px)`);
      await context.close();
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
});

// 방문자 보기: 같은 셸·같은 책/보드/지도 문서를 사용하며 쓰기 요청은 내지 않는다.
// 모든 사진은 테스트 서버의 고정 트리에서 만든다. 실계정·실제 공유 주소를 열지 않는다.
test('방문자 공용 화면: 1440·390 책·보드·지도, 옛 공유 주소, 로고·둘러보기, 쓰기 0', {
  skip: REQUIRE ? false : skip, timeout: 240000
}, async () => {
  if (skip) assert.fail('필수 브라우저가 없어 방문자 화면 검증을 진행할 수 없어요: '+skip);
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port;
  const shareId='visitor-fixture-000000001';
  const time='2026-11-23T00:00:00.000Z';
  const fixtureTree={...tree,subject:'시험 트리',coverMomentId:'',coverDesign:'',inbox:false,createdAt:time,updatedAt:time,
    moments:tree.moments.map(m=>({...m,createdAt:time,links:[]}))};
  const {workspaceModel}=await import('../public/v41/workspace-model.mjs');
  assert.equal(workspaceModel({revision:1,state:{version:1,trees:[fixtureTree]}}).trees.length,1,'공유와 내 화면이 동일한 유효 자료를 쓴다');
  const screens = {book:'track59-sketchbook.html',board:'track58-pinboard.html',network:'track56-network.html'};
  const matrix = [];
  let browser;
  try {
    browser = await chromium.launch({headless:true});
    const openShell = async ({width=1440,theme='night',view='book',owner=false,legacy=false,authenticatedShare=false}={}) => {
      const context = await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
      await context.addInitScript(t => {localStorage.setItem('lt41.theme',t);localStorage.setItem('lt41.boardTheme',t==='garden'?'paper':'night');},theme);
      const writes=[];
      await context.route('**/api/**', route => {
        const request = route.request(), u=new URL(request.url());
        if (!['GET','HEAD','OPTIONS'].includes(request.method())) writes.push({method:request.method(),path:u.pathname});
        if(u.pathname==='/api/public/shares/'+shareId) return route.fulfill({status:200,json:{
          ok:true,share:{id:shareId,view:'book',entryMomentId:'m1'},tree:fixtureTree
        }});
        if(u.pathname==='/api/workspace') return route.fulfill({status:200,json:{
          revision:1,state:{version:1,trees:[fixtureTree],prefs:{}},subject:'fixture-visitor-owner',writeSubjectBound:true,savedAt:'2026-11-23T00:00:00.000Z'
        }});
        if(u.pathname==='/api/account') return route.fulfill(authenticatedShare||owner
          ? {status:200,json:{ok:true,subject:'fixture-visitor-owner',email:'방문자'}}
          : {status:401,json:{ok:false,error:{code:'not_logged_in'}}});
        return route.fulfill({status:200,json:{ok:true,items:[],shares:[]}});
      });
      await context.route('**://i.ytimg.com/**',route=>route.abort());
      const page=await context.newPage(), errors=[];
      page.on('pageerror',e=>errors.push(String(e).slice(0,160)));
      const hash=owner?'#my/'+view+'?tree=t1':('#share/'+shareId+(legacy?'':'/'+view));
      await page.goto(base+'/v41/'+hash,{waitUntil:'domcontentloaded'});
      try {
        await page.waitForFunction(({filename,mode})=>{
          const v=document.querySelector('#view'),ctx=window.LT41;
          return ctx?.source===mode && v&&!v.hidden&&v.contentDocument?.readyState==='complete'
            && v.contentWindow?.location?.pathname?.endsWith(filename)
            && (v.contentDocument?.querySelector('.lt-screen-toolbar') || v.contentDocument?.querySelector('header'));
        },{filename:screens[view],mode:owner?'server':'share'},{timeout:10000});
      } catch (error) {
        const diagnostic=await page.evaluate(()=>({
          hash:location.hash,source:window.LT41?.source,tree:window.LT41?.tree?.id,
          frames:[...document.querySelectorAll('#stage>iframe')].map(f=>({id:f.id,hidden:f.hidden,url:f.contentWindow?.location.href,ready:f.contentDocument?.readyState})),
          empty:document.querySelector('#empty')?.innerText?.slice(0,150),
          body:document.body?.dataset
        }));
        throw Error('화면 진입 검증 실패: '+JSON.stringify({owner,view,diagnostic,errors}));
      }
      await page.waitForTimeout(350);
      assert.deepEqual(errors,[], '화면 스크립트 오류: '+errors.join('; '));
      return {context,page,writes};
    };
    const metrics=async(page)=>page.evaluate(()=>{
      const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
      const v=document.querySelector('#view'), doc=v?.contentDocument;
      return {
        header:box(document.querySelector('.app-header')),
        toolbar:box(doc?.querySelector('.lt-screen-toolbar')||doc?.querySelector('header')),
        stage:box(document.querySelector('#stage')),
        tabs:[...document.querySelectorAll('#tree-views button[data-view]')].filter(x=>x.getBoundingClientRect().width>0).map(x=>x.textContent.trim()),
        browseVisible:!!document.querySelector('#community-menu')?.getClientRects().length,
        pickerVisible:!!document.querySelector('.tree-slot')?.getClientRects().length,
        writeVisible:!!document.querySelector('#write-menu')?.getClientRects().length,
        readonly:v?.contentWindow?.LTDEMO?.readOnly,
        writable:window.LT41?.writable,
        source:window.LT41?.source,
        frameUrl:v?.contentWindow?.location?.pathname,
        theme:document.documentElement.getAttribute('data-lt-theme')||'night'
      };
    });
    const owner=await openShell({owner:true,view:'book',width:1440});
    const ownerMetrics=await metrics(owner.page);
    assert.equal(ownerMetrics.source,'server');
    const ownerPhone=await openShell({owner:true,view:'book',width:390});
    await ownerPhone.page.setViewportSize({width:390,height:844});
    const ownerLayouts={1440:{book:ownerMetrics,board:ownerMetrics,network:ownerMetrics},390:{book:await metrics(ownerPhone.page)}};
    for(const view of ['board','network']){
      const ownedView=await openShell({owner:true,view,width:390});
      try{
        await ownedView.page.setViewportSize({width:390,height:844});
        ownerLayouts[390][view]=await metrics(ownedView.page);
      } finally{await ownedView.context.close();}
    }
    // 비교 캡처는 첫 방문 권유 창·몇 초 뒤 사라지는 토스트 없이 동일한 내용 판으로 찍는다.
    await owner.page.getByRole('button',{name:'지금은 안 할래요'}).click({timeout:2000}).catch(()=>{});
    await owner.page.evaluate(()=>{const toast=document.querySelector('#toast');if(toast)toast.hidden=true;});
    let ownerBuffer=await owner.page.screenshot(), visitorBookBuffer=null;
    for(const [width,height] of [[1440,900],[390,844]]){
      for(const theme of ['night','garden']){
        for(const view of ['book','board','network']){
          const visiting=await openShell({width,theme,view});
          try{
            await visiting.page.setViewportSize({width,height});
            const m=await metrics(visiting.page);
            if(width===1440){
              assert.deepEqual(m.tabs,['책','보드','지도'],width+' '+theme+' '+view+': 공유 탭 구성');
              assert.equal(m.browseVisible,true,'데스크톱 둘러보기 단추');
            } else {
              assert.deepEqual(m.tabs,[],'모바일은 내 화면처럼 접기 메뉴에서 탭을 표시한다');
              await visiting.page.locator('#mobile-more').click();
              const items=await visiting.page.locator('#header-overflow button').allTextContents();
              for(const name of ['책','보드','지도','둘러보기'])assert.ok(items.includes(name),'모바일 메뉴 '+name);
              assert.ok(!items.includes('서재'),'방문자 메뉴에는 서재가 없다');
              assert.ok(!items.some(x=>x.includes('순간 추가')),'방문자 메뉴에는 쓰기 입구가 없다');
              await visiting.page.locator('#mobile-more').click();
            }
            assert.equal(m.source,'share');
            assert.equal(m.readonly,true,'안쪽 화면이 공유 읽기 전용이다');
            assert.equal(m.writable,false,'쓰기 권한이 없다');
            assert.equal(m.writeVisible,false,'쓰기 단추가 없다');
            assert.equal(m.pickerVisible,false,'트리 고르기 화면이 없다');
            const baseline=ownerLayouts[width][view];
            assert.ok(Math.abs(m.header.height-baseline.header.height)<=2,'공용 머리줄 높이 오차 2px 이하: '+JSON.stringify({width,view,theme,visitor:m.header,owner:baseline.header}));
            assert.ok(Math.abs(m.stage.y-baseline.stage.y)<=2,'공용 화면 시작 위치 오차 2px 이하');
            if(view==='book'){
              assert.ok(m.toolbar && baseline.toolbar,'책 도구 줄을 실제로 표시한다');
              assert.ok(Math.abs(m.toolbar.height-baseline.toolbar.height)<=2,'책 도구 줄 높이 오차 2px 이하');
              // 비교 캡처는 아래에서 임시 알림을 정리한 뒤 만든다.
            }
            const key='visitor-'+view+'-'+width+'-'+theme;
            await visiting.page.evaluate(()=>{const toast=document.querySelector('#toast');if(toast)toast.hidden=true;});
            if(view==='book'&&width===1440&&theme==='night') visitorBookBuffer=await visiting.page.screenshot();
            await shot(visiting.page,key);
            matrix.push({width,theme,view,header:m.header.height,toolbar:m.toolbar?.height});
            if(view==='book'&&width===1440&&theme==='night'){
              const frame=visiting.page.frames().find(f=>f.url().endsWith('/'+screens.book));
              if(frame){
                await frame.evaluate(()=>{parent.postMessage({type:'lt41-new-tree'},location.origin);parent.postMessage({type:'lt41-write',mode:'edit',momentId:'m1'},location.origin)});
                await visiting.page.waitForTimeout(180);
                assert.equal(await visiting.page.locator('#write-panel').evaluate(el=>el.open),false,'방문자가 쓰기 창을 열 수 없다');
              }
            }
            assert.deepEqual(visiting.writes,[],'공유 탐색 중 변경 API 요청 0');
            if(view==='book'&&width===390&&theme==='night'){
              await visiting.page.locator('#mobile-more').click();
              await visiting.page.getByRole('menuitem',{name:'둘러보기'}).click();
              await visiting.page.waitForFunction(()=>location.hash.startsWith('#explore')&&document.querySelector('#community-panel')?.open,{timeout:9000}).catch(async()=>{throw Error('둘러보기로 나가지 못함')});
              assert.equal(visiting.writes.length,0);
              await visiting.page.locator('.brand').click();
              await visiting.page.waitForFunction(()=>location.hash==='#home',{timeout:9000}).catch(async()=>{throw Error('로고로 나가지 못함')});
            }
          }finally{await visiting.context.close();}
        }
      }
    }
    assert.ok(visitorBookBuffer,'비교용 방문자 책 캡처가 만들어졌다');
    const comparison=await browser.newPage({viewport:{width:2880,height:900}});
    await comparison.setContent('<style>body{margin:0;display:flex}img{width:1440px;height:900px;object-fit:contain}</style>'+
      '<img alt="내 책" src="data:image/png;base64,'+ownerBuffer.toString('base64')+'">'+
      '<img alt="방문자 책" src="data:image/png;base64,'+visitorBookBuffer.toString('base64')+'">');
    await comparison.screenshot({path:path.join(CAPTURE_DIR,'owner-vs-visitor-book-1440-night.png')});
    await comparison.close();
    await owner.context.close();
    await ownerPhone.context.close();
    const legacy=await openShell({width:1440,view:'book',legacy:true});
    assert.equal((await metrics(legacy.page)).source,'share','#share/<id> 옛 주소도 감상한다');
    await legacy.context.close();
    const authenticated=await openShell({width:1440,view:'book',authenticatedShare:true});
    try{
      await authenticated.page.waitForFunction(()=>!document.querySelector('#account-avatar')?.hidden,{timeout:8000});
      assert.equal(await authenticated.page.locator('#account-entry').isHidden(),true,'로그인한 방문자는 계정 단추를 본다');
      await authenticated.page.locator('#account-avatar').click();
      await authenticated.page.waitForFunction(()=>location.hash.startsWith('#my/home'),null,{timeout:8000});
    }finally{await authenticated.context.close();}
    const signedLogo=await openShell({width:1440,view:'book',authenticatedShare:true});
    try{
      await signedLogo.page.waitForFunction(()=>!document.querySelector('#account-avatar')?.hidden,null,{timeout:8000});
      await signedLogo.page.locator('.brand').click();
      await signedLogo.page.waitForFunction(()=>location.hash==='#home'&&window.LT41?.source==='server',null,{timeout:12000});
      assert.equal(signedLogo.writes.length,0,'방문자 로고는 내 계정을 읽기만 한다');
    }finally{await signedLogo.context.close();}
    assert.equal(matrix.length,12,'지시한 1440·390 × 밤·정원 × 책·보드·지도 12장');
    console.log('방문자 캡처 12장 + 비교 1장 확인:',CAPTURE_DIR);
  }finally{
    await browser?.close().catch(()=>{});
    server.close();
  }
});

test('#1259 방문자 책 첫 안내가 제목과 크게 보기 영상 조작부를 가리지 않는다', {skip:REQUIRE?false:skip,timeout:90000}, async()=>{
 if(skip)assert.fail(skip);
 const server=await serve(),base='http://127.0.0.1:'+server.address().port;
 const shareId='visitor-notice-1259-fixture',time='2026-11-24T00:00:00.000Z';
 const fixture={...tree,subject:'시험 트리',coverMomentId:'',coverDesign:'',inbox:false,createdAt:time,updatedAt:time,moments:tree.moments.map((m,i)=>({...m,createdAt:time,links:[],...(i===0?{title:'세로 영상과 함께 남긴 첫 순간',url:'https://www.youtube.com/shorts/dQw4w9WgXcQ',mediaMetadata:{title:'시험 세로 영상',vertical:true}}:{})}))};
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  for(const [width,height] of [[1440,900],[390,844]])for(const theme of ['garden','night']){
   const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
   const key=width+'-'+theme;
   try{
    await context.addInitScript(t=>{localStorage.setItem('lt41.theme',t)},theme);
    await context.route('**/*',r=>{
     const u=new URL(r.request().url());
     if(u.origin!==base){
      if(u.hostname.includes('youtube')&&u.pathname.startsWith('/embed/'))return r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{margin:0;background:#24212b;color:#fff;display:grid;place-items:center;height:100vh}footer{position:absolute;bottom:0;left:0;right:0;padding:12px;background:#131018}</style><body><main>시험용 세로 영상</main><footer id="controls">▶　0:01 / 0:16　━━━━━━</footer></body></html>'});
      if(u.hostname==='i.ytimg.com')return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="180" height="320"><rect width="180" height="320" fill="#51404e"/><circle cx="90" cy="160" r="35" fill="#e9d3bd"/></svg>'});
      return r.abort();
     }
     if(u.pathname==='/api/public/shares/'+shareId)return r.fulfill({json:{ok:true,share:{id:shareId,view:'book',entryMomentId:'m1'},tree:fixture,aiTester:true}});
     if(u.pathname==='/api/account')return r.fulfill({status:401,json:{ok:false,error:{code:'not_logged_in'}}});
     if(u.pathname.startsWith('/api/'))return r.fulfill({json:{ok:true,items:[],shares:[]}});
     return r.continue();
    });
    const p=await context.newPage();await p.goto(base+'/v41/#share/'+shareId+'/book',{waitUntil:'domcontentloaded'});
    await p.waitForFunction(()=>window.LT41?.source==='share'&&!document.querySelector('#view').hidden&&!!document.querySelector('#view').contentDocument?.querySelector('.moment-title'),null,{timeout:15000});
    const f=p.frameLocator('#view'),toast=p.locator('#toast');
    await toast.filter({hasText:'공개된 트리를 감상하는 화면이에요'}).waitFor({state:'visible'});
    const measure=()=>p.evaluate(()=>{
     const t=document.querySelector('#toast'),f=document.querySelector('#view'),d=f.contentDocument;
     const box=(e,dx=0,dy=0)=>{const r=e.getBoundingClientRect();return {left:r.left+dx,right:r.right+dx,top:r.top+dy,bottom:r.bottom+dy,width:r.width,height:r.height}};
     const shown=e=>!!e&&e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
     const tr=shown(t)?box(t):null,fr=box(f);
     const titles=[...d.querySelectorAll('.moment-title')].filter(shown).map(e=>box(e,fr.left,fr.top));
     const media=d.querySelector('.lt-lightbox-media');
     const mr=shown(media)?box(media,fr.left,fr.top):null;
     const intersection=(a,b)=>a&&b?Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)):0;
     const nav=d.querySelector(".nav-pill");const nr=shown(nav)?box(nav,fr.left,fr.top):null;
     return {nav:nr,notice:tr,frame:fr,titles,titleOverlap:titles.map(r=>intersection(tr,r)),frameOverlap:intersection(tr,fr),media:mr,mediaOverlap:intersection(tr,mr),hidden:t.hidden};
    });
    assert.equal(await f.locator('.story-tip').count(),0,key+' 방문자 쓰기 안내 0개');
    assert.equal(await p.evaluate(()=>localStorage.getItem('lt41.tips.bookStory')),null,key+' 방문자는 내 기록의 최초 안내 상태를 소비하지 않는다');
    const book=await measure();
    assert.ok(book.notice&&book.titles.length,key+' 첫 안내와 제목이 실제로 표시된다');
    assert.equal(book.frameOverlap,0,key+' 책 화면과 안내의 교차 면적 0: '+JSON.stringify(book));
    assert.ok(book.titleOverlap.every(x=>x===0),key+' 제목 교차 면적 0');
    if(width===390){
     assert.ok(book.nav&&book.nav.bottom<=book.frame.bottom+0.5,key+' 페이지 이동 줄 전체 표시: '+JSON.stringify(book));
     const next=f.locator('.nav-pill #nextBtn');
     const target=await next.evaluate(e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}});
     assert.ok(target.w>=44&&target.h>=44&&target.hit,key+' 페이지 이동 단추 실제 클릭 영역: '+JSON.stringify(target));
    }
    await shot(p,'1259-'+key+'-book');
    const linksBefore=await p.evaluate(()=>{const l=document.querySelector('.home-links');return !!l&&l.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})});
    await f.locator('[data-yt-expand]:visible').first().click({timeout:3000});
    await f.locator('.lt-lightbox-media').waitFor({state:'visible'});
    await p.waitForFunction(()=>document.body.classList.contains('lt-book-lightbox-open'),null,{timeout:2000});
    const video=await measure();
    assert.ok(video.media,key+' 영상 재생 칸 표시');
    assert.equal(video.hidden,false,key+' 안내 시간 안에 크게 보기 검사');
    assert.equal(video.notice,null,key+' 크게 보기 중 첫 안내 숨김');
    assert.equal(video.mediaOverlap,0,key+' 재생 조작부를 포함한 영상 영역 교차 면적 0');
    assert.equal(await p.evaluate(()=>{const l=document.querySelector('.home-links');return !!l&&l.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})}),false,key+' 크게 보기 중 아래 링크(새 소식·의견 보내기…) 숨김');
    await shot(p,'1259-'+key+'-vertical');
    await f.locator('.lt-lightbox-close').click();
    await p.waitForFunction(()=>!document.body.classList.contains('lt-book-lightbox-open'),null,{timeout:2000});
    assert.equal(await p.evaluate(()=>{const l=document.querySelector('.home-links');return !!l&&l.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})}),linksBefore,key+' 크게 보기를 닫으면 아래 링크가 열기 전 상태로 돌아온다');
    console.log('#1259',key,'제목 교차 0, 영상 교차 0');
   }finally{await context.close()}
  }
 }finally{await browser?.close();server.close()}
});
