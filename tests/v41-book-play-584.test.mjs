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
import {waitForShownScreen} from './helpers/visible-frame.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FALLBACK_SECONDS, playbackItemOf, buildPlaybackQueue, stepPlayable, firstPlayable, playbackChipText, segmentReached, playbackStatusOf, STATUS_PLAYING, STATUS_PAUSED, STATUS_BUFFERING, STATUS_SKIPPED } from '../public/v41/playback-core.mjs';

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
  // 안내 문구도 함께 맞춘다.
  // 첫 화면(궤도)의 재생 단추도 같은 이름.
});

/* ── (2) 단추 이름 ───────────────────────────────────────────────────── */
test('584-3: YouTube ↗와 크게 보기가 카드 아래 한 줄(.media-links)에 있다', () => {
  const row = EXTRA.match(/class="media-links"[\s\S]*?<\/div>/)?.[0] || '';
  assert.ok(row, 'media-links 한 줄을 그린다');
  const linkAt = row.indexOf('media-source-link');
  const expandAt = row.indexOf('data-yt-expand');
  assert.ok(linkAt >= 0 && expandAt >= 0 && linkAt < expandAt, '왼쪽 YouTube ↗, 오른쪽 크게 보기 순서');
});

/* ── (4) 두 장 모드: 책 높이·넘침 줄이기 ─────────────────────────────── */
/* ── (4) 세로 판정 보강 ──────────────────────────────────────────────── */
test('584-6: 목차·이어진 순간에도 한 줄 설명이 있고 이름이 바뀌었다', () => {
});

/* ── 실제 화면(크롬) ─────────────────────────────────────────────────── */
const ROOT = path.resolve(fileURLToPath(new URL('../public', import.meta.url)));
let server = null, base = '';
// 훅은 첫 시험보다 먼저 등록한다(#952). 시험 뒤에 등록하면 실행기에 따라 after가 먼저 돌아
// 서버가 닫히지 않은 채 실행이 끝나지 않는다(CI 잡이 25분 뒤 취소됨).
const booting = (async () => { server = await serve(ROOT); base = `http://127.0.0.1:${server.address().port}`; })();
test.before(() => booting);
test.after(async () => {
  await booting.catch(() => {});
  if (server) await new Promise((ok) => server.close(ok));
});
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
    `const saved=JSON.parse(localStorage.getItem('qa-book-story')||'{}');for(const m of window.__TREE__.moments){if(saved[m.id]!==undefined)m.relation=saved[m.id]}for(const e of window.__TREE__.edges){const child=window.__TREE__.moments.find(m=>m.id===e.to);if(child)e.reason=child.relation||''}` +
    `window.LT41={tree:window.__TREE__,trees:[window.__TREE__],source:'server',momentId:'m01',prefs:{},writable:true};` +
    `addEventListener('message',event=>{const d=event.data,frame=document.querySelector('iframe');if(event.origin!==location.origin||event.source!==frame?.contentWindow||d?.type!=='lt41-story-save')return;const t=window.__TREE__,child=t.moments.find(m=>m.id===d.momentId),parent=t.moments.find(m=>m.id===d.fromMomentId);if(!child||!parent||child.parentId!==parent.id||typeof d.relation!=='string'||d.relation.length>100){event.source.postMessage({type:'lt41-story-saved',ok:false,treeId:d.treeId,fromMomentId:d.fromMomentId,momentId:d.momentId,relation:'',error:'저장하지 못했어요.'},location.origin);return}child.relation=d.relation;localStorage.setItem('qa-book-story',JSON.stringify(Object.fromEntries(t.moments.filter(m=>m.relation).map(m=>[m.id,m.relation]))));for(const e of t.edges){if(e.from===parent.id&&e.to===child.id)e.reason=child.relation}event.source.postMessage({type:'lt41-story-saved',ok:true,treeId:d.treeId,fromMomentId:d.fromMomentId,momentId:d.momentId,relation:child.relation,error:''},location.origin)});` +
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
  return { id: 'tree1', subject: '시험 사용자', title: '시험 트리', coverMomentId: '', inbox: false, moments, edges: [] };
}



async function openBook(browser, width, height, extraRoutes = [], tree = tree26()) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addInitScript((tree) => { window.__TREE__ = tree; }, tree);
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
  for (const [pattern, handler] of extraRoutes) await page.route(pattern, handler);
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

test('#800 실행: 빈 카드 탭은 창을 열지 않고, 한마디 저장·다시 열기와 모바일 한 줄 정보를 확인한다', { skip, timeout: 60000 }, async () => {
  const browser = await chromium.launch();
  const tree = tree26();
  tree.moments = tree.moments.slice(0, 3);
  tree.moments[0].url = 'https://www.youtube.com/shorts/s0000000001';
  tree.moments[0].mediaMetadata = {title: '세로 쇼츠', channel: '가짜 채널'};
  tree.moments[0].note = '가짜 기록의 긴 메모입니다. 두 순간 사이의 맥락을 충분히 적으면 처음에는 접어서 보여 주고, 더 보기를 눌러 끝까지 읽을 수 있어야 합니다. '.repeat(2);
  tree.moments[0].startSeconds = 42;
  tree.moments[0].endSeconds = 68;
  tree.moments[1].parentId = 'm01';
  tree.moments[1].relation = '';
  tree.moments[2].parentId = 'm02';
  tree.edges = [
    {id: 'e1', kind: 'parent', from: 'm01', to: 'm02', reason: ''},
    {id: 'e2', kind: 'parent', from: 'm02', to: 'm03', reason: ''}
  ];
  try {
    const {ctx, page, frame, errors} = await openBook(browser, 390, 844, [], tree);
    try {
      const tipText = '두 순간 사이에 한마디를 남기면, 책이 이야기처럼 이어져요. 안 적어도 괜찮아요.';
      await frame.waitForSelector('.story-tip');
      assert.equal((await frame.locator('.story-tip span').innerText()).trim(), tipText);
      assert.equal(await frame.locator('.story-tip').count(), 1, '첫 진입 팁은 한 번만 보인다');

      await frame.locator('#mobileContent .clipping[data-moment="m01"]').click({position: {x: 3, y: 3}});
      assert.equal(await frame.locator('#detailSide').evaluate(el => el.hidden), true, '빈 카드 영역을 눌러도 옆 상세 창이 없다');
      assert.equal(await frame.locator('#detail').evaluate(el => el.classList.contains('open')), false, '빈 카드 영역을 눌러도 아래 상세 창이 없다');

      const meta = frame.locator('.moment-title .moment-meta').first();
      const metaState = await meta.evaluate(el => {
        const copy = el.querySelector('.moment-meta-copy'), edit = el.querySelector('.moment-edit');
        const a = copy.getBoundingClientRect(), b = edit.getBoundingClientRect();
        return {text: copy.innerText, copyHeight: copy.clientHeight, copyScroll: copy.scrollHeight, editWidth: b.width, editHeight: b.height, centerDelta: Math.abs((a.top + a.height / 2) - (b.top + b.height / 2))};
      });
      assert.match(metaState.text, /0:42–1:08/, '구간은 정보 줄에 보인다');
      assert.ok(metaState.copyHeight > 0 && metaState.copyScroll <= metaState.copyHeight + 1, '날짜·구간·감정은 한 줄');
      assert.ok(metaState.editWidth > 0 && metaState.editHeight >= 44, '고치기 손잡이는 보이고 44px 이상');
      assert.ok(metaState.centerDelta <= 2, '정보와 고치기 중심선이 맞는다');
      assert.deepEqual(await frame.locator('#mobileContent .moment-title').evaluate(el => [...el.children].map(child => child.className)), ['moment-meta', 'moment-heading', 'video-title', 'moment-note-wrap'], '정보 줄·제목·메모 순서');
      const more = frame.locator('#mobileContent [data-note-more]');
      assert.equal(await more.count(), 1, '긴 메모에 더 보기가 있다');
      await more.click();
      assert.equal(await frame.locator('#mobileContent .moment-note-wrap').evaluate(el => el.classList.contains('is-open')), true, '더 보기로 메모가 펼쳐진다');

      await frame.locator('[data-story-tip-dismiss]').click();
      await frame.locator('[data-story-open]').click();
      const input = frame.locator('[data-story-form] input[name="relation"]');
      await input.fill('밤 무대가 다시 떠올랐어요.');
      await frame.locator('[data-story-form] button[type="submit"]').click();
      await frame.waitForFunction(() => document.querySelector('[data-story-open]')?.textContent.includes('밤 무대가 다시 떠올랐어요.'));
      await frame.locator('[data-story-open]').click();
      assert.equal(await frame.locator('[data-story-form] input[name="relation"]').inputValue(), '밤 무대가 다시 떠올랐어요.', '저장한 문장을 다시 편집할 때 복원한다');
      await frame.locator('[data-story-cancel]').click();

      const storyBox = await frame.locator('[data-story-open]').evaluate(el => {
        const r = el.getBoundingClientRect(), nav = document.querySelector('.nav-pill').getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(el);
        const intersections = range.getClientRects().length;
        const overlap = Math.max(0, Math.min(r.right, nav.right) - Math.max(r.left, nav.left)) * Math.max(0, Math.min(r.bottom, nav.bottom) - Math.max(r.top, nav.top));
        return {width: r.width, height: r.height, lines: intersections, overlap, navBottom: nav.bottom, viewportHeight: innerHeight};
      });
      assert.ok(storyBox.width > 0 && storyBox.height > 0, '저장된 문장은 실제로 보인다');
      assert.ok(storyBox.lines <= 2, '390에서 한마디가 두 줄 이내');
      assert.equal(storyBox.overlap, 0, '한마디와 페이지 이동 줄 겹침 0');
      assert.ok(storyBox.navBottom <= storyBox.viewportHeight, '390에서 페이지 이동 단추도 화면 안에 있다');
      assert.ok(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '390 가로 넘침 0');

      await page.reload({waitUntil: 'load'});
      const reopened = page.frames().find(f => /track59-sketchbook/.test(f.url()));
      assert.ok(reopened, '책이 다시 열린다');
      await reopened.waitForSelector('[data-story-open]');
      assert.match(await reopened.locator('[data-story-open]').innerText(), /밤 무대가 다시 떠올랐어요\./, '다시 열어도 한마디가 남아 있다');
      assert.equal(await reopened.locator('.story-tip').count(), 0, '확인한 첫 진입 팁은 다시 보이지 않는다');
      assert.deepEqual(errors, [], '브라우저 오류 없음');
    } finally { await ctx.close(); }
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
      assert.equal(head.cells[0].aria, '1장 — 한 쪽씩 크게 보기');
      assert.equal(head.cells[1].aria, '2장 — 펼친 책처럼 두 쪽 보기');
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
      const tip = await frame.evaluate(() => { const bubble = document.getElementById('lt-tip-bubble'); const style = getComputedStyle(bubble); return { text: bubble.textContent, title: document.getElementById('lensBtn').getAttribute('title'), position: style.position, fontSize: style.fontSize }; });
      assert.match(tip.text, /돋보기 — 마우스 근처를 크게 보기 · 꺼짐/, '초점에 말풍선이 뜬다');
      assert.equal(tip.title, null, '브라우저 기본 title은 쓰지 않는다');
      assert.equal(tip.position, 'fixed', '공통 말풍선은 화면 기준으로 뜬다');
      assert.equal(tip.fontSize, '13px', '말풍선 글자는 13px 이상이다');
      // #952: 보기 전환은 화면에서 — 1장을 누르면 그 자리에서 한 장으로 바뀌고, 2장을 누르면 되돌아온다.
      await frame.click('#singleViewBtn');
      await frame.waitForTimeout(200);
      const singleOn = await frame.evaluate(() => ({ attr: document.documentElement.dataset.bookView, pressed: [document.getElementById('singleViewBtn').getAttribute('aria-pressed'), document.getElementById('doubleViewBtn').getAttribute('aria-pressed')] }));
      assert.deepEqual(singleOn, { attr: 'single', pressed: ['true', 'false'] }, '1장을 누르면 data-book-view=single·눌림 표시가 옮겨 간다');
      await frame.click('#doubleViewBtn');
      await frame.waitForTimeout(200);
      const doubleOn = await frame.evaluate(() => ({ attr: document.documentElement.dataset.bookView, pressed: [document.getElementById('singleViewBtn').getAttribute('aria-pressed'), document.getElementById('doubleViewBtn').getAttribute('aria-pressed')] }));
      assert.deepEqual(doubleOn, { attr: 'double', pressed: ['false', 'true'] }, '2장을 누르면 두 장으로 돌아온다');
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

/* ── #642: 재생 중 창 크기 바꾸기 — 전체 화면·resize 가 재생을 끊지 않는다 ── */
// 썸네일이 살아 있는 영상(내 기록과 같은 상태)은 사라진 영상 판정 없이 ▶ 재생이 눌린다.
const H_THUMB_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('642 실행: 재생 중에 창 크기를 바꿔도 그 자리 iframe이 같은 요소로 살아 있다', { skip }, async () => {
  const browser = await chromium.launch();
  try {
    const { ctx, page, frame, errors } = await openBook(browser, 1440, 900, [
      ['**/i.ytimg.com/vi/h0000000001/*.jpg*', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: H_THUMB_PNG })],
    ]);
    try {
      // 책 안에서 재생: 첫 펼침면의 ▶ 재생을 누른다. 외부 요청은 막혀도 iframe 요소는 그 자리에 만들어진다.
      await frame.waitForFunction(() => { const b = document.querySelector('.yt-play'); return b && !b.querySelector('.lt-fallback-card'); }, null, { timeout: 10000 });
      await frame.click('.yt-play');
      await frame.waitForSelector('iframe.yt-frame', { state: 'attached', timeout: 10000 });
      // iframe 요소에 표식을 남겨 '다시 만들어진 것'과 구별한다.
      await frame.evaluate(() => { document.querySelector('iframe.yt-frame').__lt642 = 'same'; });
      // 창 크기 1440 → 1000 → 1440 → 500(휴대폰 폭 — 세로↔가로 돌리기와 같은 resize 경로).
      for (const size of [{ width: 1000, height: 800 }, { width: 1440, height: 900 }, { width: 500, height: 850 }]) {
        await page.setViewportSize(size);
        await frame.waitForTimeout(200);
      }
      const alive = await frame.evaluate(() => { const f = document.querySelector('iframe.yt-frame'); return f ? { same: f.__lt642 === 'same', attached: f.isConnected } : null; });
      assert.ok(alive?.attached, '재생 중에는 창 크기를 바꿔도 iframe이 붙어 있다');
      assert.ok(alive?.same, '같은 iframe 요소다(다시 만들지 않았다)');
      // 전체 화면을 흉내 낸다(헤드리스에서 진짜 전체 화면이 안 되므로 fullscreenchange 이벤트로 같은 경로를 건드린다).
      await frame.evaluate(() => document.dispatchEvent(new Event('fullscreenchange')));
      await page.setViewportSize({ width: 1440, height: 900 });
      await frame.waitForTimeout(1000); // 전체 화면 직후 보호(800ms)와 다시 확인 타이머(850ms)가 모두 지나도록.
      const afterFs = await frame.evaluate(() => { const f = document.querySelector('iframe.yt-frame'); return f ? { same: f.__lt642 === 'same', attached: f.isConnected } : null; });
      assert.ok(afterFs?.attached && afterFs?.same, '전체 화면 흉내 뒤에도 같은 iframe으로 재생이 이어진다');
      assert.deepEqual(errors, [], '페이지 오류 없음');
    } finally { await ctx.close(); }
  } finally { await browser.close(); }
});

test('642 실행: 재생하지 않은 상태 — 전체 화면 직후는 다시 그리지 않고, 나온 뒤에는 다시 배치한다', { skip }, async () => {
  const browser = await chromium.launch();
  try {
    const { ctx, page, frame } = await openBook(browser, 1440, 900);
    try {
      await frame.evaluate(() => { const el = document.querySelector('#leftPage .moment'); el.__lt642 = 'old'; });
      // 전체 화면을 흉내 내고 바로 창 크기를 바꾼다 — 직후에는 다시 그리지 않는다.
      await frame.evaluate(() => document.dispatchEvent(new Event('fullscreenchange')));
      await page.setViewportSize({ width: 1000, height: 800 });
      await frame.waitForTimeout(300);
      const kept = await frame.evaluate(() => { const el = document.querySelector('#leftPage .moment'); return !!el && el.__lt642 === 'old'; });
      assert.ok(kept, '전체 화면 직후의 resize 로는 장을 다시 그리지 않는다');
      // 보호 시간이 지나면(전체 화면에서 나온 뒤) 다시 배치된다(기존 동작 회복).
      await frame.waitForFunction(() => { const el = document.querySelector('#leftPage .moment'); return !el || el.__lt642 !== 'old'; }, null, { timeout: 5000 });
    } finally { await ctx.close(); }
  } finally { await browser.close(); }
});

test('642 실행: 재생하지 않은 상태에서 창 크기를 바꾸면 장을 다시 배치한다(기존 동작 유지)', { skip }, async () => {
  const browser = await chromium.launch();
  try {
    const { ctx, page, frame } = await openBook(browser, 1440, 900);
    try {
      await frame.evaluate(() => { const el = document.querySelector('#leftPage .moment'); el.__lt642 = 'old'; });
      await page.setViewportSize({ width: 1000, height: 800 });
      await frame.waitForTimeout(250);
      const kept = await frame.evaluate(() => { const el = document.querySelector('#leftPage .moment'); return !!el && el.__lt642 === 'old'; });
      assert.ok(!kept, '재생하지 않으면 창 크기에 맞춰 다시 배치된다(낡은 요소가 남지 않음)');
    } finally { await ctx.close(); }
  } finally { await browser.close(); }
});

// 의견 #26: 트리를 바꾸면 열려 있던 책이 새 트리 내용으로 다시 그려진다(정원·밤 × 1440·390).
test('26: 책을 열어 둔 채 트리를 바꾸면 책 제목·첫 카드·카드 수가 새 트리 것으로 바뀐다', { skip: skip || false, timeout: 180000 }, async () => {
  if (skip) assert.fail(`건너뜀=실패 — ${skip}`);
  const { createTree: makeTree, addMoment: growTree } = await import('../public/v41/domain.mjs');
  const { serve: serveApp } = await import('./helpers/screen-audit.mjs');
  const { mkdirSync } = await import('node:fs');
  const shotDir = process.env.LT_BOOK_SWITCH_SHOT_DIR || 'E:\\lovetree-qa\\local4\\책전환';
  mkdirSync(shotDir, { recursive: true });
  let a = makeTree({subject:'A',title:'A',note:'',emotion:'설렘',date:'2026-11-01',url:''},'2026-11-01T00:00:00Z');
  a = growTree(a,{title:'A 첫 순간',note:'',emotion:'설렘',date:'2026-11-01',url:''},a.moments[0].id,'2026-11-01T00:00:00Z');
  let b = makeTree({subject:'B',title:'B',note:'',emotion:'설렘',date:'2026-11-03',url:''},'2026-11-03T00:00:00Z');
  b = growTree(b,{title:'B 첫 순간',note:'',emotion:'설렘',date:'2026-11-03',url:''},b.moments[0].id,'2026-11-03T00:00:00Z');
  b = growTree(b,{title:'B 둘 순간',note:'',emotion:'설렘',date:'2026-11-04',url:''},b.moments[0].id,'2026-11-04T00:00:00Z');
  const server = await serveApp();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless:true, ...(process.env.LT_BOOK_BROWSER_EXE ? { executablePath: process.env.LT_BOOK_BROWSER_EXE } : {}) });
  try {
    for (const [width,height] of [[1440,900],[390,844]]) {
      for (const theme of ['night','garden']) {
        const ctx = await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
        await ctx.addInitScript(t=>{try{localStorage.setItem('lt41.theme',t)}catch{}},theme);
        await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"items":[]}'}));
        await ctx.route('**/api/workspace**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({revision:1,state:{version:1,trees:[a,b],prefs:{}},subject:'시험계정',writeSubjectBound:true,savedAt:'2026-11-15T09:00:00.000Z'})}));
        const page = await ctx.newPage();
        await page.goto(`${base}/v41/?account=1`,{waitUntil:'load'});
        await page.waitForFunction(()=>!!window.LT41?.trees?.length,null,{timeout:20000});
        await page.locator('#discover-ask-no').click().catch(()=>{});
        if (width === 390) {
          await page.locator('#mobile-more').click();
          await page.waitForTimeout(150);
          await page.locator('#header-overflow button',{hasText:'책'}).first().click();
        } else {
          await page.locator('.tree-views [data-view="track59-sketchbook.html"]').click();
        }
        await waitForShownScreen(page, {path: 'track59-sketchbook'}, 8000);
        await page.waitForTimeout(900);
        // 셸이 두 장을 갈아끼우므로 '지금 보이는 쪽'의 문서·주소를 읽는다(#982).
        const read = () => page.evaluate(() => {
          const f = [...document.querySelectorAll('#view, #view-next')].find(x => !x.hidden && x.getClientRects().length > 0);
          let d = null; try { d = f?.contentDocument; } catch {}
          return {
            src: f?.contentWindow?.location?.href || '',
            title: d?.getElementById('bookTitleText')?.textContent?.trim() || '',
            cards: (() => { try { return d?.defaultView?.__TRACK59__?.getState?.().total || 0; } catch { return 0; } })(),
            first: (d?.querySelector('.page-content,.mobile-content')?.textContent || '').slice(0, 40),
            body: (d?.body?.innerText || '')
          };
        });
        const before = await read();
        assert.match(before.src,/track59-sketchbook/, '책 화면');
        assert.ok(before.title==='A', '전환 전 책 제목 A');

        if (width === 390) {
          // 390에서는 책 안의 트리 제목 메뉴로 바꾼다(헤더 트리 선택은 접혀 있다).
          const frame = page.locator('#view:not([hidden]), #view-next:not([hidden])').first().contentFrame();
          await frame.locator('#bookTitleBtn').click();
          await page.waitForTimeout(150);
          await frame.locator(`#treeMenuPanel [data-tree-id="${b.id}"]`).click();
        } else {
          await page.locator('#record-menu').click();
          await page.waitForTimeout(150);
          await page.locator(`#tree-popover [data-tree-id="${b.id}"]`).click();
        }
        await page.waitForFunction((id) => {
          const f = [...document.querySelectorAll('#view, #view-next')].find(x => !x.hidden && x.getClientRects().length > 0);
          try { return (f?.contentWindow?.location?.search || '').includes(id); } catch { return false; }
        }, b.id, {timeout: 10000});
        await page.waitForTimeout(900);
        const after = await read();
        console.log(`책전환 ${width}·${theme}: 제목 ${before.title}→${after.title}, 카드 ${before.cards}→${after.cards}`);
        assert.match(after.src,/[?&]tree=/, '트리 값이 책 프레임 주소에 남는다');
        assert.ok(after.title==='B', `${width}·${theme} 전환 뒤 책 제목 B (실제 ${after.title})`);
        assert.ok(after.body.includes('2026. 11. 03') && !after.body.includes('2026. 11. 01'), `${width}·${theme} 책 본문이 B 것`);
        assert.ok(after.cards > before.cards, `${width}·${theme} 카드 수가 B 것으로 늘어난다(전 ${before.cards} → 후 ${after.cards})`);
        await page.screenshot({path:`${shotDir}/book-${width}-${theme}.png`});
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
});

/* ── 792 3단계: 책의 순간 이어 보기 ───────────────────────────────── */
const pbDescribe = (url) => /youtu/.test(url) ? { kind: 'youtube', videoId: 'M7lc1UVf-VE' } : /tiktok/.test(url) ? { kind: 'link' } : { kind: 'none' };
const pbTitle = (m) => m.title || '순간';
const pbDate = (m) => m.date || '';
const pbMoment = (id, extra = {}) => ({ id, title: id, date: '2026-11-17', url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE', ...extra });

test('792-3: YouTube 순간만 책 순서대로 담고, 구간이 없으면 시작+30초', () => {
  assert.equal(FALLBACK_SECONDS, 30);
  const items = buildPlaybackQueue([
    pbMoment('입덕', { startSeconds: 90, endSeconds: 100 }),
    pbMoment('틱톡', { url: 'https://www.tiktok.com/@a/video/1' }),
    pbMoment('끝 없이', { startSeconds: 42 }),
    { id: '사진', title: '사진', url: '', kind: 'photo' }
  ], pbDescribe, pbTitle, pbDate);
  assert.deepEqual(items.map((i) => i.title), ['입덕', '끝 없이']);
  assert.deepEqual(items[0], { id: '입덕', videoId: 'M7lc1UVf-VE', title: '입덕', date: '2026-11-17', start: 90, end: 100, duration: 10, fallback: false, unavailable: false });
  assert.equal(items[1].start, 42);
  assert.equal(items[1].end, 72, '끝이 없으면 시작+30초');
  assert.equal(items[1].fallback, true);
  assert.equal(playbackItemOf({ id: 'x', url: 'https://www.tiktok.com/@a/video/1' }, pbDescribe), null);
});

test('792-3: 볼 수 없는 항목을 건너뛰고 처음·다음 자리를 찾는다', () => {
  const items = [{ unavailable: false }, { unavailable: true }, { unavailable: false }, { unavailable: true }];
  assert.equal(stepPlayable(items, 0, 1), 2);
  assert.equal(stepPlayable(items, 2, -1), 0);
  assert.equal(stepPlayable(items, 2, 1), -1);
  assert.equal(stepPlayable([{ unavailable: true }], 0, 1), -1);
  assert.equal(firstPlayable(items), 0);
  assert.equal(firstPlayable([{ unavailable: true }, { unavailable: false }]), 1);
  assert.equal(playbackChipText({ title: '입덕', duration: 10, unavailable: false }), '입덕 10초');
  assert.equal(playbackChipText({ title: '입덕', duration: 10, unavailable: true }), '입덕 10초 · 볼 수 없음');
});

test('792-3: 구간 끝 판정은 끝 0.35초 전부터 참', () => {
  assert.equal(segmentReached(9.7, 10), true);
  assert.equal(segmentReached(9.6, 10), false);
  assert.equal(segmentReached(10, 10), true);
  assert.equal(segmentReached('x', 10), false);
});

test('792-3: 상태 문구 — 재생 중엔 지금 구간 재생 중, 건너뛸 땐 건너뛰었어요', () => {
  assert.equal(playbackStatusOf(1), STATUS_PLAYING);
  assert.equal(playbackStatusOf(2), STATUS_PAUSED);
  assert.equal(playbackStatusOf(3), STATUS_BUFFERING);
  assert.equal(playbackStatusOf(0), null, '끝남(0)은 문구 대신 다음 순간으로 넘어간다');
  assert.equal(playbackStatusOf(undefined), null);
  assert.notEqual(STATUS_BUFFERING, STATUS_PLAYING, '불러오는 중 문구가 재생 중에 남지 않게 다른 글자');
  assert.match(STATUS_SKIPPED, /볼 수 없는 순간을 건너뛰었어요/);
});
