import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync, existsSync} from 'node:fs';
import {embedUrl} from '../public/v41/book-usability.mjs';
import {serve} from './helpers/screen-audit.mjs';
import {parseMomentLink} from '../src/media.js';
// media-preview.js 는 클래식 스크립트(IIFE)라 vm 으로 읽어 window.LTMedia 를 본다(기존 시험과 같은 방법).
const scope={window:{},URL,URLSearchParams};vm.runInNewContext(readFileSync(new URL('../public/v41/media-preview.js',import.meta.url),'utf8'),scope);const media=scope.window.LTMedia;
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const SHORTS='https://www.youtube.com/shorts/9NXOCr-T8LU';
const WATCH='https://www.youtube.com/watch?v=abc123DEF45';
const OWNER={source:'server',owned:true};

test('#393 세로 판정 한 벌: /shorts/ 주소는 세로, 그 밖의 YouTube 형태는 가로',()=>{
 const rows=[
  [SHORTS,true],[SHORTS+'?t=30',true],['https://youtube.com/shorts/abc123DEF45',true],['https://m.youtube.com/shorts/abc123DEF45',true],
  [WATCH,false],['https://youtu.be/abc123DEF45',false],['https://youtube.com/live/abc123DEF45',false],['https://youtube.com/embed/abc123DEF45',false],
  ['https://example.test/a.mp4',false],['https://example.test/a.png',false],['https://example.test/notes',false],['',false]];
 for(const [url,want] of rows)assert.equal(media.verticalVideo(url),want,url);
 // 주소 판정은 src/media.js 파서와 같다(파서 동기화).
 for(const url of [SHORTS,WATCH])assert.equal(media.describe(url).vertical,parseMomentLink(url).vertical,url);
});

test('#393 세로 판정: 영상 정보의 가로세로(세로가 더 길면 세로)도 같은 함수로',()=>{
 assert.equal(media.verticalVideo(WATCH,{width:1080,height:1920}),true,'세로 비율 정보 → 세로 틀');
 assert.equal(media.verticalVideo(WATCH,{width:1920,height:1080}),false,'가로 비율 정보 → 가로 틀');
 assert.equal(media.verticalVideo(WATCH,{width:0,height:0}),false,'0 값은 판정에 쓰지 않는다');
 assert.equal(media.verticalVideo(WATCH,null),false);
 assert.equal(media.verticalVideo('https://example.test/a.mp4',{width:1080,height:1920}),false,'YouTube 가 아니면 주소·정보 모두 세로 아님');
});

test('#393 썸네일 주소 한 벌: 세로는 원본 비율(oardefault·잘림 없음), 가로는 hqdefault',()=>{
 assert.equal(media.youtubeThumbUrl('abc123DEF45',true),'https://i.ytimg.com/vi/abc123DEF45/oardefault.jpg');
 assert.equal(media.youtubeThumbUrl('abc123DEF45',false),'https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg');
 assert.equal(media.describe(SHORTS).loadUrl,'https://i.ytimg.com/vi/9NXOCr-T8LU/oardefault.jpg');
 assert.equal(media.describe(WATCH).loadUrl,'https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg');
});

test('#393 세로 영상 마크업: 세로 틀 표시·원본 비율 썸네일·hqdefault/mqdefault 물러남·크게 보기 단추',()=>{
 const html=media.markup(SHORTS,'세로 영상',null,'m1',OWNER);
 assert.match(html,/data-lt-vertical="1"/);
 assert.match(html,/src="https:\/\/i\.ytimg\.com\/vi\/9NXOCr-T8LU\/oardefault\.jpg"/);
 assert.match(html,/data-lt-candidates="[^"]*oardefault\.jpg[^"]*hqdefault\.jpg[^"]*mqdefault\.jpg[^"]*"/);
 assert.match(html,/data-lt-expand/);
 assert.match(html,/크게 보기/);
 // 누르기 전에는 iframe·autoplay 가 없다(기존 규칙 그대로).
 assert.doesNotMatch(html,/<iframe/i);
 assert.doesNotMatch(html,/autoplay/);
 assert.match(html,/referrerpolicy="no-referrer"/);
});

test('#393 가로 영상 마크업: 가로 틀 유지·잘림 없는 썸네일·크게 보기 단추',()=>{
 const html=media.markup(WATCH,'가로 영상',null,'m1',OWNER);
 assert.doesNotMatch(html,/data-lt-vertical/);
 assert.match(html,/src="https:\/\/i\.ytimg\.com\/vi\/abc123DEF45\/hqdefault\.jpg"/);
 assert.match(html,/data-lt-expand/);
 // 세로 비율 정보가 붙은 watch 주소도 세로 틀 + 원본 비율 썸네일(물러남 포함).
 const meta=media.markup(WATCH,'세로 정보', {width:1080,height:1920},'m1',OWNER);
 assert.match(meta,/data-lt-vertical="1"/);
 assert.match(meta,/oardefault\.jpg/);
 assert.match(meta,/data-lt-candidates="[^"]*hqdefault\.jpg[^"]*mqdefault\.jpg/);
});

test('#393 공유·예시·로그아웃: 누르기 전 외부 요청 0 그대로 — 크게 보기는 눌렀을 때만 연다',()=>{
 for(const ctx of [{source:'share',owned:true},{source:'example',owned:true},{source:'server',owned:false},undefined]){
  const html=media.markup(SHORTS,'제목',null,'m1',ctx);
  assert.doesNotMatch(html,/<img|<iframe/i,'ctx='+JSON.stringify(ctx));
  assert.doesNotMatch(html,/i\.ytimg\.com/,'ctx='+JSON.stringify(ctx));
  assert.match(html,/data-lt-load/);
  assert.match(html,/data-lt-expand/,'크게 보기 단추는 있어도 눌렀을 때만 요청한다');
 }
 // 사진·일반 링크에는 크게 보기 단추를 붙이지 않는다(영상 전용).
 assert.doesNotMatch(media.markup('https://example.test/a.png','사진',null,'m1',OWNER),/data-lt-expand/);
 assert.doesNotMatch(media.markup('https://example.test/notes','링크',null,'m1',OWNER),/data-lt-expand/);
 assert.doesNotMatch(media.markup('javascript:alert(1)','x',null,'m1',OWNER),/data-lt-expand/);
});

/* ── 이슈 952: 소스 글자 검사(크게 보기·기억책·궤도·공통 CSS)를 동작 검사로 바꾼 자리 ──
   글자로 고정하던 연결·CSS 규칙은 실제 화면(크롬)에서 잰다. 판정 기준은 느슨해지지 않았다 —
   세로 틀 9:16·가로 16:9·크게 보기 닫힘·초점 복귀·재생 주소 한 벌을 결과로 확인한다. */
let chromium952 = null;
let skip952 = false;
try {
  ({ chromium: chromium952 } = await import('playwright'));
  if (!existsSync(chromium952.executablePath())) skip952 = 'Playwright chromium이 설치되어 있지 않아 실행 시험을 건너뜀';
} catch {
  skip952 = 'playwright 패키지가 없어 실행 시험을 건너뜀';
}

// 미디어 조각만 담는 최소 호스트: media-preview.js와 공통 CSS(identity.css)를 실제로 읽는다.
const MEDIA_HOST = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/v41/identity.css"></head>' +
  '<body data-record-source="server" data-member="in"><script src="/v41/media-preview.js"></script><div id="host"></div></body></html>';
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

let server952, base952;
test.before(async () => { server952 = await serve({ '/host-media-952': MEDIA_HOST }); base952 = `http://127.0.0.1:${server952.address().port}`; });
test.after(() => new Promise((ok) => server952.close(ok)));

async function mediaPage952(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const outside = (u) => { try { return /(^|\.)?(ytimg\.com|youtube\.com|youtube-nocookie\.com|googlevideo\.com)$/.test(new URL(u).hostname); } catch { return false; } };
  await page.route(outside, (route) => route.abort());
  await page.route('**/api/youtube/oembed*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"videoId":"x","title":"영상","authorName":"채널","thumbnailUrl":""}' }));
  await page.route('**://i.ytimg.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }));
  await page.goto(`${base952}/host-media-952`, { waitUntil: 'load' });
  return { ctx, page };
}

const RATIO = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); return el ? getComputedStyle(el).aspectRatio : null; })()`;

test('952 실행: 세로 영상 틀은 화면에서 9:16, 가로는 16:9다(미리보기·재생 틀 둘 다)', { skip: skip952 || undefined }, async () => {
  const browser = await chromium952.launch();
  try {
    const { ctx, page } = await mediaPage952(browser);
    try {
      await page.evaluate((urls) => {
        document.getElementById('host').innerHTML =
          LTMedia.markup(urls.shorts, '세로 영상', null, 'm1', { source: 'server', owned: true }) +
          LTMedia.markup(urls.watch, '가로 영상', null, 'm2', { source: 'server', owned: true });
      }, { shorts: SHORTS, watch: WATCH });
      assert.equal(await page.evaluate(RATIO('.lt-media[data-lt-vertical="1"] .lt-yt-preview')), '9 / 16', '세로 미리보기 틀');
      // 그 자리 재생: 누른 뒤 만들어지는 재생 틀도 같은 판정을 따르고, 재생 주소는 embedUrl 한 벌에서 온다.
      await page.evaluate(() => document.querySelector('.lt-media[data-lt-moment-id="m2"] [data-lt-play]')?.click());
      await page.waitForSelector('.lt-media[data-lt-moment-id="m2"] .lt-yt-frame', { timeout: 10000 });
      assert.equal(await page.evaluate(RATIO('.lt-media[data-lt-moment-id="m2"] .lt-yt-frame')), '16 / 9', '가로 재생 틀');
      const playSrc = await page.evaluate(() => document.querySelector('.lt-media[data-lt-moment-id="m2"] .lt-yt-frame')?.getAttribute('src'));
      assert.equal(playSrc, embedUrl('abc123DEF45', 0), '재생 주소는 book-usability 의 embedUrl 한 벌');
      await page.evaluate(() => document.querySelector('.lt-media[data-lt-moment-id="m1"] [data-lt-play]')?.click());
      await page.waitForSelector('.lt-media[data-lt-moment-id="m1"] .lt-yt-frame', { timeout: 10000 });
      assert.equal(await page.evaluate(RATIO('.lt-media[data-lt-moment-id="m1"] .lt-yt-frame')), '9 / 16', '세로 재생 틀');
    } finally { await ctx.close(); }
  } finally { await browser.close(); }
});

test('952 실행: 크게 보기는 눌렀을 때 열고, Esc로 닫으며, 초점이 단추로 돌아온다', { skip: skip952 || undefined }, async () => {
  const browser = await chromium952.launch();
  try {
    const { ctx, page } = await mediaPage952(browser);
    try {
      await page.evaluate((urls) => {
        document.getElementById('host').innerHTML =
          LTMedia.markup(urls.shorts, '세로 영상', null, 'm1', { source: 'server', owned: true }) +
          LTMedia.markup(urls.watch, '가로 영상', null, 'm2', { source: 'server', owned: true });
      }, { shorts: SHORTS, watch: WATCH });
      // 세로: 창이 세로 틀(9:16)로 열린다.
      await page.evaluate(() => { const b = document.querySelector('.lt-media[data-lt-moment-id="m1"] [data-lt-expand]'); b.focus(); b.click(); });
      await page.waitForSelector('.lt-lightbox iframe.lt-lightbox-media', { timeout: 10000 });
      const opened = await page.evaluate(() => ({
        vertical: document.querySelector('.lt-lightbox').classList.contains('lt-lightbox-vertical'),
        src: document.querySelector('.lt-lightbox iframe.lt-lightbox-media')?.getAttribute('src'),
        ratio: getComputedStyle(document.querySelector('.lt-lightbox iframe.lt-lightbox-media')).aspectRatio
      }));
      assert.equal(opened.vertical, true, '세로 영상의 크게 보기 창');
      assert.equal(opened.src, embedUrl('9NXOCr-T8LU', 0), '크게 보기 재생 주소도 embedUrl 한 벌');
      assert.equal(opened.ratio, '9 / 16', '크게 보기 세로 틀');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.lt-lightbox'), null, { timeout: 5000 });
      assert.equal(await page.evaluate(() => document.activeElement?.dataset?.ltExpand !== undefined), true, '닫으면 초점이 크게 보기 단추로 돌아온다');
      // 가로: 같은 창이 16:9로 열린다.
      await page.evaluate(() => { const b = document.querySelector('.lt-media[data-lt-moment-id="m2"] [data-lt-expand]'); b.focus(); b.click(); });
      await page.waitForSelector('.lt-lightbox iframe.lt-lightbox-media', { timeout: 10000 });
      assert.equal(await page.evaluate(RATIO('.lt-lightbox iframe.lt-lightbox-media')), '16 / 9', '크게 보기 가로 틀');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.lt-lightbox'), null, { timeout: 5000 });
    } finally { await ctx.close(); }
  } finally { await browser.close(); }
});

test('#1038: 저장된 세로값은 주소 판정보다 먼저 본다(가로 주소의 세로 쇼츠 포함)', async () => {
  const { isVerticalMoment } = await import('../public/v41/youtube-id.mjs');
  const watch = { url: WATCH, mediaMetadata: { vertical: true, width: 1080, height: 1920 } };
  assert.equal(isVerticalMoment(watch), true, 'watch 주소여도 저장값이 세로면 세로');
  assert.equal(isVerticalMoment({ url: SHORTS, mediaMetadata: { vertical: false } }), false, '저장값이 가로면 주소보다 우선');
  assert.equal(isVerticalMoment({ url: WATCH, mediaMetadata: { width: 1080, height: 1920 } }), true, '저장된 크기로도 판정');
  assert.equal(isVerticalMoment({ url: WATCH }), false, '저장값이 없으면 옛 주소 판정');
  assert.equal(media.verticalVideo(WATCH, { vertical: true }), true, '화면 판정도 저장값 우선');
  assert.equal(media.verticalVideo(WATCH, { vertical: false }), false);
  assert.equal(media.verticalVideo(SHORTS, { vertical: false }), false);
});

test('#1038 실행: watch 쇼츠를 저장값으로 다시 열면 처음부터 세로 칸, 실측으로 바뀜 0회', { skip: skip952 || undefined }, async () => {
  const browser = await chromium952.launch();
  try {
    const { ctx, page } = await mediaPage952(browser);
    try {
      const result = await page.evaluate(async (url) => {
        const saved = { vertical: true, width: 1080, height: 1920 };
        // 책이 저장값으로 그리는 것과 같은 순서: 판정 → 칸 클래스 → 실측 호출.
        const vertical = LTMedia.verticalVideo(url, saved);
        const host = document.getElementById('host');
        host.innerHTML = '<div class="clipping moment" data-moment="m1"><button class="yt-play' + (vertical ? ' is-vertical' : '') + '" data-yt-play="abc123DEF45" data-yt-vertical="' + (vertical ? '1' : '0') + '"></button></div>';
        const el = host.querySelector('.yt-play');
        const first = { vertical, cls: el.className, attr: el.dataset.ytVertical };
        let changes = 0;
        new MutationObserver(() => { changes++; }).observe(el, { attributes: true, attributeFilter: ['class', 'data-yt-vertical'] });
        window.LTDEMO = { moments: [{ id: 'm1', url, mediaMetadata: saved }] };
        LTMedia.upgradeVerticals(document);
        await new Promise(r => setTimeout(r, 400));
        return { first, changes, after: { cls: el.className, attr: el.dataset.ytVertical } };
      }, WATCH);
      assert.equal(result.first.vertical, true, '저장값이 주소보다 먼저다');
      assert.match(result.first.cls, /is-vertical/, '첫 그림부터 세로 칸');
      assert.equal(result.first.attr, '1', '세로 표도 처음부터 있다');
      assert.equal(result.changes, 0, '가로 → 세로로 바뀐 횟수 0');
      assert.deepEqual(result.after, { cls: result.first.cls, attr: result.first.attr }, '실측 뒤에도 칸이 그대로다');
    } finally { await ctx.close(); }
  } finally { await browser.close(); }
});
