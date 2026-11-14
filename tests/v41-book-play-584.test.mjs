// 이슈 584: 책의 YouTube 재생·크게 보기·두 장 모드 손보기.
//  (1) 크게 보기 오류 153 — media-preview.js 의 두 iframe 이 referrerpolicy="no-referrer" 라
//      YouTube 가 플레이어 구성 오류(오류 153)를 냈다(2026-11-14 실측: 같은 영상을 no-referrer 로는
//      오류 153, strict-origin-when-cross-origin 으로는 재생). 두 자리를 strict-origin-when-cross-origin 으로 바꾼다.
//  (2) '여기서 재생' → '▶ 재생'(시작 시점 있으면 '▶ 재생 · 1:23'), 안내 문구도 '바로 재생할 수 없어요'로 맞춘다.
//  (3) YouTube ↗(왼쪽)·크게 보기(오른쪽)를 카드 아래 한 줄로 옮긴다(영상 위 겹침 해소).
//  (4) 넓은 화면 두 장 모드: 책을 화면 높이에 맞게 키우고, 넘치면 영상 틀을 줄인다(글자는 #548 기준선 유지).
//      세로 판정도 썸네일 실측(oardefault)으로 보강한다 — oEmbed 가로세로는 watch 주소 기준 항상 200×113이라 신호가 못 된다.
//  (5·6) 머리줄: 1장|2장 한 묶음, 돋보기 아이콘+금색, 말풍선 설명, '여기까지 온 길'→'이어진 순간'.
// 크롬이 없는 곳에서는 실행 시험을 건너뛴다 — 이유를 남긴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const MP = read('public/v41/media-preview.js');
const EXTRA = read('public/v41/views/book/book-extra.js');
const BOOK = read('public/v41/views/book/book.js');
const BOOK_CSS = read('public/v41/views/book/book.css');
const USE_CSS = read('public/v41/views/book/book-usability.css');
const IDENTITY = read('public/v41/identity.css');
const HTML = read('public/v41/views/track59-sketchbook.html');
const ORBIT = read('src/views/orbit.js');

/* ── (1) 오류 153: iframe referrerpolicy ─────────────────────────────── */
test('584-1: 그 자리 재생·크게 보기 iframe은 strict-origin-when-cross-origin을 쓴다(오류 153 수정)', () => {
  // iframe 두 자리(그 자리 재생·크게 보기)만 바꾼다. img·a의 no-referrer는 그대로 둔다(요청 헤더용).
  const iframePolicies = [...MP.matchAll(/frame\.setAttribute\('referrerpolicy','([^']+)'\)/g)].map(m => m[1]);
  assert.equal(iframePolicies.length, 2, 'iframe referrerpolicy 지정은 두 자리뿐이다');
  for (const policy of iframePolicies) assert.equal(policy, 'strict-origin-when-cross-origin', 'iframe은 strict-origin-when-cross-origin');
  assert.doesNotMatch(MP, /frame\.setAttribute\('referrerpolicy','no-referrer'\)/, 'iframe에 no-referrer를 남기지 않는다');
  assert.match(MP, /referrerpolicy="no-referrer"/, 'img·a의 no-referrer는 그대로다(요청 헤더용)');
  // 안내 문구도 함께 맞춘다.
  assert.doesNotMatch(MP, /여기서 재생할 수 없어요/, '옛 안내 문구를 남기지 않는다');
  assert.match(MP, /바로 재생할 수 없어요/, '안내 문구는 바로 재생에 맞춘다');
  assert.match(MP, /aria-label="바로 재생"/, '재생 단추 이름도 바로 재생');
  // 첫 화면(궤도)의 재생 단추도 같은 이름.
  assert.match(ORBIT, /aria-label="바로 재생"/, '첫 화면 재생 단추도 바로 재생');
});

/* ── (2) 단추 이름 ───────────────────────────────────────────────────── */
test('584-2: 책 재생 단추는 ▶ 재생(시작 시점 있으면 ▶ 재생 · N:N)', () => {
  assert.match(EXTRA, /'▶ 재생 · '\+media\.label/, '시작 시점 라벨');
  assert.match(EXTRA, /:'▶ 재생'/, '기본 라벨');
  assert.doesNotMatch(EXTRA, /여기서 재생/, '옛 이름을 남기지 않는다');
});

/* ── (3) 카드 아래 한 줄 ─────────────────────────────────────────────── */
test('584-3: YouTube ↗와 크게 보기가 카드 아래 한 줄(.media-links)에 있다', () => {
  assert.doesNotMatch(EXTRA, /class="yt-expand"/, '영상 위 크게 보기 줄을 남기지 않는다');
  const row = EXTRA.match(/class="media-links"[\s\S]*?<\/div>/)?.[0] || '';
  assert.ok(row, 'media-links 한 줄을 그린다');
  const linkAt = row.indexOf('media-source-link');
  const expandAt = row.indexOf('data-yt-expand');
  assert.ok(linkAt >= 0 && expandAt >= 0 && linkAt < expandAt, '왼쪽 YouTube ↗, 오른쪽 크게 보기 순서');
  assert.match(USE_CSS, /\.media-links\{display:flex/, '한 줄 배치 규칙');
  assert.match(USE_CSS, /\.media-links button\{[^}]*margin-left:auto/, '크게 보기는 오른쪽 끝');
  assert.match(USE_CSS, /\.media-links button\{[^}]*font-size:13px/, '단추 글자는 #548 기준선(13px) 이상');
  assert.doesNotMatch(USE_CSS, /\.yt-expand/, '옛 영상 위 단추 규칙을 남기지 않는다');
});

/* ── (4) 두 장 모드: 책 높이·넘침 줄이기 ─────────────────────────────── */
test('584-4: 책은 화면 높이에 맞게 커지고(920px 한도), 넘치면 영상 틀을 줄인다', () => {
  assert.match(BOOK_CSS, /\.book-wrap\{[^}]*height:min\(920px,calc\(100vh - 215px\)\)/, '책 높이 한도를 올린다(650px → 920px)');
  // 줄이기는 두 장 모드에서만 — 390 한 장 모드(#537)는 그대로.
  assert.match(BOOK, /function fitPageMedia\(el\)\{\n?[^}]*bookView!=='double'/, '두 장 모드에서만 줄인다');
  assert.match(BOOK, /querySelectorAll\('\.yt-play,\.yt-frame'\)/, '영상 틀을 줄인다');
  assert.match(BOOK, /is-vertical'\)\?220:180/, '세로 틀은 220px, 가로는 180px 아래로는 안 줄인다');
  assert.match(BOOK, /markOverflowPages\(root\)\{[^}]*fitPageMedia\(el\)/, '넘침 판정 앞에서 영상 틀을 맞춘다');
  const fitBody = BOOK.match(/function fitPageMedia\(el\)\{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(fitBody, 'fitPageMedia 함수를 찾는다');
  assert.doesNotMatch(fitBody, /font-size/, '글자는 줄이지 않는다(#548 기준선)');
});

/* ── (4) 세로 판정 보강 ──────────────────────────────────────────────── */
test('584-4: 세로 판정은 주소·정보 다음 썸네일 실측(oardefault)으로 보강한다', () => {
  assert.match(MP, /function probeVertical\(url\)/, '썸네일 실측 함수');
  assert.match(MP, /oardefault\.jpg/, 'oardefault(원본 비율 썸네일)를 잰다');
  assert.match(MP, /naturalHeight > naturalWidth|img\.naturalHeight>img\.naturalWidth|verticalFromProbe\(\{ width: img\.naturalWidth, height: img\.naturalHeight \}\)/, '높이가 더 크면 세로');
  assert.match(MP, /function upgradeVerticals\(/, '그려진 칸을 올려 고치는 함수');
  assert.match(MP, /verticalVideo,probeVertical,upgradeVerticals/, 'LTMedia에 한 벌로 내놓는다');
  // 책은 그려진 뒤 올려 고친다(내 기록일 때만 — 공유는 누르기 전 외부 요청 0 유지).
  assert.match(EXTRA, /LTMedia\.upgradeVerticals\(document\)/, '책 화면이 보강을 부른다');
  assert.match(EXTRA, /autoLoadMedia\(ctx\.source,ctx\.owned\)/, '내 기록일 때만 외부 요청을 한다(#327 규칙 유지)');
});

/* ── (5) 1장|2장 한 묶음 ─────────────────────────────────────────────── */
test('584-5: 1장|2장이 한 테두리 안 두 칸이고 칸마다 설명이 있다', () => {
  const toggle = HTML.match(/<div class="view-toggle"[\s\S]*?<\/div>/)?.[0] || '';
  assert.ok(toggle, 'view-toggle 묶음이 있다');
  assert.match(toggle, /id="singleViewBtn"[^>]*>1장</, '왼쪽 칸은 1장');
  assert.match(toggle, /id="doubleViewBtn"[^>]*>2장</, '오른쪽 칸은 2장');
  assert.match(toggle, /data-lt-tip="한 쪽씩 크게 보기"/, '1장 설명');
  assert.match(toggle, /data-lt-tip="펼친 책처럼 두 쪽 보기"/, '2장 설명');
  assert.match(toggle, /aria-label="1장 — 한 쪽씩 크게 보기"/, '1장 낭독 이름');
  assert.match(toggle, /aria-label="2장 — 펼친 책처럼 두 쪽 보기"/, '2장 낭독 이름');
  // 한 묶음 모양은 identity.css가 이긴다(#464 자리).
  assert.match(IDENTITY, /\.tools \.view-toggle\{border:1px solid/, '묶음에 한 테두리');
  assert.match(IDENTITY, /\.tools \.view-toggle \.ui-btn\{border:0;border-radius:0;background:transparent/, '칸은 테두리 없이');
  assert.match(IDENTITY, /\.tools \.view-toggle \.ui-btn\[aria-pressed=true\][^{]*\{[^}]*background:var\(--lt-gold\)/, '고른 칸만 금색 채움');
});

/* ── (6) 돋보기 아이콘·말풍선·이어진 순간 ────────────────────────────── */
test('584-6: 돋보기는 SVG 아이콘(켜지면 금색), 설명은 말풍선으로 뜬다', () => {
  const lens = HTML.match(/<button[^>]*id="lensBtn"[\s\S]*?<\/button>/)?.[0] || '';
  assert.ok(lens, '돋보기 단추가 있다');
  assert.match(lens, /<svg[^>]*class="lens-icon"/, '글자 대신 SVG 아이콘');
  assert.doesNotMatch(lens, /돋보기 ON|돋보기 OFF/, '글자 이름을 남기지 않는다');
  assert.match(IDENTITY, /\.tools #lensBtn\.active\{color:var\(--lt-gold\)\}/, '켜지면 금색');
  assert.match(EXTRA, /data-lt-tip',tip\)/, '상태가 바뀌면 말풍선·낭독 이름도 바뀐다');
  // 말풍선: 브라우저 title이 아니라 자체 요소. 마우스 올림·초점·휴대폰 길게 누름.
  assert.match(EXTRA, /function mountTips\(\)/, '말풍선 배선');
  assert.match(EXTRA, /focusin/, '키보드 초점에도 뜬다');
  assert.match(EXTRA, /setTimeout\(\(\)=>showTip\(el\),500\)/, '휴대폰은 길게 누르면 뜬다');
  assert.match(USE_CSS, /\.lt-tip-bubble\{position:fixed/, '말풍선 모양 규칙');
  assert.match(USE_CSS, /\.lt-tip-bubble\{[^}]*font-size:13px/, '말풍선 글자도 #548 기준선(13px) 이상');
  assert.match(EXTRA, /role","tooltip"|setAttribute\('role','tooltip'\)|bubble\.setAttribute\('role','tooltip'\)/, '낭독기에는 tooltip으로 읽힌다');
});

test('584-6: 목차·이어진 순간에도 한 줄 설명이 있고 이름이 바뀌었다', () => {
  assert.match(HTML, /id="archiveBtn"[^>]*data-lt-tip="순간 목차 — 순간을 한눈에 훑어 보기"/, '목차 설명');
  assert.match(HTML, /id="overviewBtn"[^>]*data-lt-tip="처음 순간부터 지금까지 이어진 순간을 한눈에"/, '이어진 순간 설명');
  assert.match(HTML, /id="overviewBtn"[^>]*>이어진 순간</, '단추 이름: 이어진 순간');
  assert.match(HTML, /<h2 id="overviewTitle">이어진 순간<\/h2>/, '창 제목: 이어진 순간');
  assert.match(HTML, /처음 순간부터 지금까지 이어진 순간을 한눈에 보여 줘요/, '창 안내 문구');
  assert.doesNotMatch(HTML, /여기까지 온 길/, '옛 이름을 남기지 않는다');
});

/* ── 실제 화면(크롬) ─────────────────────────────────────────────────── */
const ROOT = path.resolve(fileURLToPath(new URL('../public', import.meta.url)));
const REQUIRE = process.env.LT_BOOK_584_REQUIRE === '1';
let chromium = null;
let skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright chromium이 설치되어 있지 않아 실행 시험을 건너뜀';
} catch {
  skip = 'playwright 패키지가 없어 실행 시험을 건너뜀';
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
function serve(root) {
  const server = createServer(async (req, res) => {
    const url = req.url || '/';
    // 시험용 어미 페이지: 셸 대신 LT41을 직접 준다(책 iframe이 읽는 계약과 같은 모양).
    // 트리 데이터는 addInitScript 로 넘긴다(주소에 실으면 차단 규칙의 'youtube.com' 문자열에 걸린다).
    if (url.startsWith('/host584')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(hostHtml());
      return;
    }
    if (url.startsWith('/host-media')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><body data-record-source="server" data-member="in"><script src="/v41/media-preview.js"></script><div id="host"></div></body></html>');
      return;
    }
    const clean = decodeURIComponent(url.split('?')[0]);
    for (const file of [path.join(root, clean), path.join(root, clean, 'index.html')]) {
      if (!file.startsWith(root)) continue;
      try { if ((await stat(file)).isFile()) { res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); createReadStream(file).pipe(res); return; } } catch {}
    }
    res.writeHead(404); res.end('not found');
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

function hostHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%}iframe{position:fixed;inset:0;width:100%;height:100%;border:0}</style></head>` +
    `<body data-record-source="server" data-member="in"><script>` +
    `window.LT41={tree:window.__TREE__,trees:[window.__TREE__],source:'server',momentId:'m01',prefs:{},writable:true};` +
    `</script><iframe src="/v41/views/track59-sketchbook.html" title="책"></iframe></body></html>`;
}

// 가로·세로 YouTube가 섞인 26순간 시험 데이터. 세로는 두 종류: /shorts/ 주소(주소 판정)와
// watch 주소(썸네일 실측 판정 — oardefault만 세로 영상에 있다).
function tree26() {
  const moments = [];
  for (let i = 1; i <= 26; i++) {
    const id = 'm' + String(i).padStart(2, '0');
    let url;
    if (i <= 14) url = `https://www.youtube.com/watch?v=h${String(i).padStart(10, '0')}`;
    else if (i <= 16) url = `https://www.youtube.com/watch?v=v${String(i - 14).padStart(10, '0')}`; // 세로(실측 판정)
    else if (i <= 25) url = `https://www.youtube.com/shorts/s${String(i - 16).padStart(10, '0')}`; // 세로(주소 판정)
    else url = 'https://www.youtube.com/watch?v=h0000000015&t=83s'; // 시작 시점 라벨 확인용
    moments.push({
      id, parentId: i === 1 ? null : 'm01', links: [], createdAt: '2026-11-01T00:00:00.000Z',
      title: `순간 ${i}`, note: `이 순간의 마음 ${i}`, emotion: '설렘', date: '2026.11.01', relation: '', url,
    });
  }
  return { id: 'tree1', subject: '윤제', title: '시험 트리', coverMomentId: '', inbox: false, moments, edges: [] };
}

let server, base;
test.before(async () => { server = await serve(ROOT); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => new Promise((ok) => server.close(ok)));

async function openBook(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addInitScript((tree) => { window.__TREE__ = tree; }, tree26());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  // 외부 요청은 모두 막되, 세로 실측 판정용 oardefault만 세로 그림(1×2)으로 답한다.
  // (Playwright는 나중에 등록한 규칙이 이긴다 — 막는 규칙을 먼저, 채우는 규칙을 나중에.
  //  판정은 호스트명만 본다 — 주소 문자열에 'youtube.com'이 들어 있는 시험 데이터를 지키려다.)
  const external = (u) => { try { return /(^|\.)?(ytimg\.com|youtube\.com|youtube-nocookie\.com|googlevideo\.com)$/.test(new URL(u).hostname); } catch { return false; } };
  await page.route(external, (route) => route.abort());
  await page.route('**/api/youtube/oembed*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videoId: 'x', title: '영상', authorName: '채널', thumbnailUrl: '' }) }));
  await page.route('**/i.ytimg.com/vi/v0000000001/oardefault.jpg*', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: VERTICAL_PNG }));
  await page.goto(`${base}/host584`, { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) {
    frame = page.frames().find((f) => /track59-sketchbook/.test(f.url()));
    if (!frame) await page.waitForTimeout(250);
  }
  assert.ok(frame, '책 프레임이 열리지 않음');
  await frame.waitForSelector('.yt-play', { timeout: 15000 });
  return { ctx, page, frame, errors };
}

const VERTICAL_PNG = readFileSync(new URL('./fixtures/vertical-1x2.png', import.meta.url));

// 페이지 넘김은 부드러운 애니메이션이라 라벨이 바뀔 때까지 기다려야 다음 자리를 잰다.
async function step(frame) {
  const label = await frame.evaluate(() => document.getElementById('pageLabel').textContent);
  await frame.evaluate(() => document.getElementById('nextBtn').click());
  await frame.waitForFunction((prev) => document.getElementById('pageLabel').textContent !== prev, label, { timeout: 5000 });
  await frame.waitForTimeout(80);
}

test('584 실행: 두 장 모드에서 두 쪽 모두 스크롤 없이 한 순간이 온전히 보인다(1440·1920)', { skip }, async () => {
  const browser = await chromium.launch();
  try {
    for (const [width, height] of [[1440, 900], [1920, 1080]]) {
      const { ctx, frame, errors } = await openBook(browser, width, height);
      try {
        assert.equal(await frame.evaluate(() => document.documentElement.dataset.bookView), 'double', `${width}px에서 두 장 모드`);
        for (let guard = 0; guard < 13; guard++) {
          const overflows = await frame.evaluate(() => [...document.querySelectorAll('.page-content')].map(el => el.scrollHeight - el.clientHeight));
          assert.ok(overflows.every(v => v <= 4), `${width}px ${guard + 1}펼침면: 넘침 없음(${overflows.join(',')})`);
          const done = await frame.evaluate(() => document.getElementById('nextBtn').disabled);
          if (done) break;
          await step(frame);
        }
        assert.deepEqual(errors, [], `${width}px에서 페이지 오류 없음`);
      } finally { await ctx.close(); }
    }
  } finally { await browser.close(); }
});

test('584 실행: 세로 판정 보강 — watch 주소의 세로 영상도 썸네일 실측으로 9:16 틀이 된다', { skip }, async () => {
  const browser = await chromium.launch();
  try {
    const { ctx, frame, errors } = await openBook(browser, 1440, 900);
    try {
      // 가로 영상은 가로 틀을 유지한다(실측 실패 = 가로) — 첫 펼침면에서 잰다.
      await frame.waitForTimeout(600);
      const horiz = await frame.evaluate(() => {
        const el = document.querySelector('.yt-play[data-yt-play^="h0"]');
        return { vertical: el.dataset.ytVertical === '1', cls: el.classList.contains('is-vertical') };
      });
      assert.ok(!horiz.vertical && !horiz.cls, '가로 영상은 가로 틀을 유지한다');
      // 세로 사례는 뒤쪽 펼침면에 있다(m15·m16 = 8번째 펼침면). 넘겨 가며 확인한다.
      for (let i = 0; i < 7; i++) {
        const at = await frame.evaluate(() => !!document.querySelector('.yt-play[data-yt-play^="v0"]'));
        if (at) break;
        await step(frame);
      }
      // watch 주소(정보 없음)는 썸네일 실측 뒤 세로 틀로 올려 고쳐진다.
      await frame.waitForFunction(() => {
        const el = document.querySelector('.yt-play[data-yt-play^="v0"]');
        return el && el.dataset.ytVertical === '1';
      }, null, { timeout: 15000 });
      const probed = await frame.evaluate(() => {
        const el = document.querySelector('.yt-play[data-yt-play^="v0"]');
        return { vertical: el.dataset.ytVertical === '1', cls: el.classList.contains('is-vertical'), thumb: el.querySelector('img')?.getAttribute('src') || '' };
      });
      assert.ok(probed.cls, '실측 뒤 세로 틀(is-vertical)');
      assert.match(probed.thumb, /oardefault/, '세로 썸네일로 내려간다');
      // 주소 판정(/shorts/)은 곧바로 세로 틀(m17은 다음 펼침면) — 한 번 더 넘긴 뒤 잰다.
      await step(frame);
      await frame.waitForSelector('.yt-play[data-yt-play^="s0"]', { timeout: 10000 });
      const shorts = await frame.evaluate(() => {
        const el = document.querySelector('.yt-play[data-yt-play^="s0"]');
        return el ? { vertical: el.dataset.ytVertical === '1', cls: el.classList.contains('is-vertical') } : null;
      });
      assert.ok(shorts?.vertical && shorts.cls, '/shorts/ 주소는 곧바로 세로 틀');
      assert.deepEqual(errors, [], '페이지 오류 없음');
    } finally { await ctx.close(); }
  } finally { await browser.close(); }
});

test('584 실행: 책이 화면 높이에 맞게 커지고 페이지 넘김 알약과 겹치지 않는다(1920)', { skip }, async () => {
  const browser = await chromium.launch();
  try {
    const { ctx, frame } = await openBook(browser, 1920, 1080);
    try {
      const geo = await frame.evaluate(() => {
        const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: Math.round(r.height) }; };
        return { book: box(document.getElementById('bookWrap')), pill: box(document.querySelector('.nav-pill')), stage: box(document.querySelector('.stage')) };
      });
      assert.ok(geo.book.h > 700, `책이 화면 높이를 크게 쓴다(${geo.book.h}px > 700px)`);
      assert.ok(geo.book.h <= 920, '한도 920px를 넘지 않는다');
      assert.ok(geo.pill.bottom <= geo.stage.bottom + 1, '페이지 넘김 알약이 화면 안에 있다(잘리지 않음)');
    } finally { await ctx.close(); }
  } finally { await browser.close(); }
});

test('584 실행: 크게 보기 창의 iframe은 strict-origin-when-cross-origin이다(오류 153 수정 확인)', { skip }, async () => {
  const browser = await chromium.launch();
  try {
    const { ctx, frame } = await openBook(browser, 1440, 900);
    try {
      await frame.evaluate(() => document.querySelector('.media-links [data-yt-expand]')?.click());
      await frame.waitForSelector('.lt-lightbox iframe', { timeout: 10000 });
      const policy = await frame.evaluate(() => document.querySelector('.lt-lightbox iframe')?.getAttribute('referrerpolicy'));
      assert.equal(policy, 'strict-origin-when-cross-origin', '크게 보기 iframe의 referrerpolicy');
      await frame.evaluate(() => document.querySelector('.lt-lightbox-close')?.click());
    } finally { await ctx.close(); }
  } finally { await browser.close(); }
});

test('584 실행: 그 자리 재생 iframe도 strict-origin-when-cross-origin이다(media-preview 경로)', { skip }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.route(/ytimg\.com|youtube\.com|youtube-nocookie\.com|googlevideo\.com/, (route) => route.abort());
    // 같은 오리진의 어미 페이지에서 LTMedia.markup → 그 자리 재생까지 잰다(가져오기가 절대경로 /v41/…라 about:blank 에서는 안 된다).
    await page.goto(`${base}/host-media`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.LTMedia?.markup, null, { timeout: 10000 });
    await page.evaluate(() => {
      document.getElementById('host').innerHTML = window.LTMedia.markup('https://www.youtube.com/watch?v=h0000000001', '영상', null, 'm1', { source: 'server', owned: true });
    });
    await page.click('.lt-yt-play');
    await page.waitForSelector('iframe.lt-yt-frame', { state: 'attached', timeout: 10000 });
    const policy = await page.evaluate(() => document.querySelector('iframe.lt-yt-frame')?.getAttribute('referrerpolicy'));
    assert.equal(policy, 'strict-origin-when-cross-origin', '그 자리 재생 iframe의 referrerpolicy');
    await browser.close();
  } catch (e) { await browser.close(); throw e; }
});

test('584 실행: 머리줄 — 1장|2장 한 묶음, 돋보기 아이콘, 말풍선, 이어진 순간', { skip }, async () => {
  const browser = await chromium.launch();
  try {
    const { ctx, frame } = await openBook(browser, 1440, 900);
    try {
      const head = await frame.evaluate(() => {
        const toggle = document.querySelector('.view-toggle');
        const cells = [...toggle.querySelectorAll('.ui-btn')];
        const lens = document.getElementById('lensBtn');
        const pill = (el) => { const s = getComputedStyle(el); return { border: s.borderTopWidth + '/' + s.borderRadius, bg: s.backgroundColor }; };
        return {
          cells: cells.map(b => ({ text: b.textContent, pressed: b.getAttribute('aria-pressed'), tip: b.getAttribute('data-lt-tip'), aria: b.getAttribute('aria-label') })),
          toggleStyle: pill(toggle),
          lens: { svg: !!lens.querySelector('svg.lens-icon'), text: lens.textContent.trim(), aria: lens.getAttribute('aria-label'), pressed: lens.getAttribute('aria-pressed') },
          overview: { text: document.getElementById('overviewBtn').textContent, tip: document.getElementById('overviewBtn').getAttribute('data-lt-tip') },
          archive: { tip: document.getElementById('archiveBtn').getAttribute('data-lt-tip') },
        };
      });
      assert.equal(head.cells.length, 2, '두 칸이 한 묶음에 있다');
      assert.equal(head.cells[0].text, '1장'); assert.equal(head.cells[1].text, '2장');
      assert.equal(head.cells[0].tip, '한 쪽씩 크게 보기');
      assert.equal(head.cells[1].tip, '펼친 책처럼 두 쪽 보기');
      assert.match(head.toggleStyle.border, /^[01]px\/9999px$|^[01]px\/999px/, '묶음은 알약 테두리 한 줄');
      assert.ok(head.lens.svg, '돋보기는 SVG 아이콘');
      assert.equal(head.lens.text, '', '아이콘뿐이다(글자 없음)');
      assert.match(head.lens.aria, /돋보기 — 마우스 근처를 크게 보기 · 꺼짐/);
      assert.equal(head.overview.text, '이어진 순간');
      assert.equal(head.overview.tip, '처음 순간부터 지금까지 이어진 순간을 한눈에');
      assert.equal(head.archive.tip, '순간 목차 — 순간을 한눈에 훑어 보기');
      // 말풍선: 키보드 초점에 뜬다(브라우저 title이 아니다).
      await frame.focus('#lensBtn');
      await frame.waitForSelector('#lt-tip-bubble:not([hidden])', { timeout: 5000 });
      const tip = await frame.evaluate(() => ({ text: document.getElementById('lt-tip-bubble').textContent, title: document.getElementById('lensBtn').getAttribute('title') }));
      assert.match(tip.text, /돋보기 — 마우스 근처를 크게 보기 · 꺼짐/, '초점에 말풍선이 뜬다');
      assert.equal(tip.title, null, '브라우저 기본 title은 쓰지 않는다');
      // 돋보기를 켜면 금색 + 말풍선 상태가 바뀐다.
      await frame.click('#lensBtn');
      await frame.waitForTimeout(100);
      const on = await frame.evaluate(() => ({
        cls: document.getElementById('lensBtn').classList.contains('active'),
        color: getComputedStyle(document.getElementById('lensBtn')).color,
        aria: document.getElementById('lensBtn').getAttribute('aria-label'),
      }));
      assert.ok(on.cls, '켜짐 상태');
      assert.match(on.aria, /· 켜짐$/, '말풍선·낭독 이름에 상태가 들어간다');
      // 이어진 순간 창.
      await frame.click('#overviewBtn');
      await frame.waitForSelector('#overview.open', { timeout: 5000 });
      const title = await frame.evaluate(() => document.getElementById('overviewTitle').textContent);
      assert.equal(title, '이어진 순간', '창 제목');
    } finally { await ctx.close(); }
  } finally { await browser.close(); }
});
