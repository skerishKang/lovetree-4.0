// 이슈 #1365: 책을 열 때 YouTube IFrame API를 받지 않는다. '이어 보기'를 누를 때 처음 받고, 다시 눌러도 다시 받지 않는다.
// 실행 시험: 가짜 데이터·가짜 API 응답만 쓴다. 크롬이 없으면 건너뛴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const API_URL = 'https://www.youtube.com/iframe_api';

let chromium = null;
let skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright chromium이 설치되어 있지 않아 실행 시험을 건너뜀';
} catch {
  skip = 'playwright 패키지가 없어 실행 시험을 건너뜀';
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const HOST = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%}iframe{position:fixed;inset:0;width:100%;height:100%;border:0}</style></head><body><script>window.LT41={tree:window.__TREE__,trees:[window.__TREE__],source:'server',momentId:'m01',prefs:{},writable:true};</script><iframe src="/v41/views/track59-sketchbook.html" title="책"></iframe></body></html>`;

// 가짜 YouTube IFrame API: 재생기 생성·준비 신호만 흉내 낸다.
const FAKE_API = `(() => {
  class Player {
    constructor(el, opts) {
      const f = document.createElement('iframe');
      f.setAttribute('title', 'fake-youtube');
      el.replaceChildren(f);
      this.f = f;
      this.opts = opts || {};
      setTimeout(() => this.opts.events?.onReady?.({ target: this }), 0);
    }
    getIframe() { return this.f; }
    playVideo() {} pauseVideo() {} stopVideo() {} loadVideoById() {} cueVideoById() {}
    getCurrentTime() { return 0; } getDuration() { return 0; } getPlayerState() { return 2; }
    seekTo() {} destroy() {} mute() {} unMute() {} setVolume() {}
  }
  window.YT = { Player, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5, UNSTARTED: -1 } };
  window.onYouTubeIframeAPIReady?.();
})();`;

function tree() {
  const moments = [];
  for (let i = 1; i <= 6; i++) {
    moments.push({ id: 'm' + String(i).padStart(2, '0'), parentId: i === 1 ? null : 'm01', links: [], createdAt: '2026-11-01T00:00:00.000Z', title: `순간 ${i}`, note: `메모 ${i}`, emotion: '설렘', date: '2026.11.01', relation: '', url: `https://www.youtube.com/watch?v=h${String(i).padStart(10, '0')}` });
  }
  return { id: 'tree1', subject: '시험 사용자', title: '시험 트리', coverMomentId: '', inbox: false, moments, edges: [] };
}

function treeWithoutVideo() {
  const data = tree();
  data.moments = data.moments.map((moment) => ({ ...moment, url: '' }));
  return data;
}

function serve() {
  const server = createServer(async (req, res) => {
    const url = req.url || '/';
    if (url.startsWith('/host')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(HOST); return; }
    const clean = decodeURIComponent(url.split('?')[0]);
    for (const file of [path.join(ROOT, clean), path.join(ROOT, clean, 'index.html')]) {
      if (!file.startsWith(ROOT)) continue;
      try {
        if ((await stat(file)).isFile()) { res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); createReadStream(file).pipe(res); return; }
      } catch {}
    }
    res.writeHead(404);
    res.end('not found');
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

// 책을 열고 첫 쪽이 그려질 때까지 기다린다. API 요청은 apiState 에 센다.
async function openBook(browser, server, width, height, apiRoute, data = tree()) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addInitScript(() => localStorage.setItem('lt41.theme', 'night'));
  await ctx.addInitScript((t) => { window.__TREE__ = t; }, data);
  // 첫 쪽이 처음 그려진 시각을 프레임 안에서 남긴다(바깥 시각과 같은 시계).
  await ctx.addInitScript(() => {
    const mark = () => {
      if (window.__firstPageAt) return;
      const drawn = (document.querySelector('#leftPage')?.children.length || document.querySelector('#mobileContent')?.children.length) > 0;
      if (drawn) window.__firstPageAt = performance.timeOrigin + performance.now();
    };
    new MutationObserver(mark).observe(document, { childList: true, subtree: true });
    if (document.readyState !== 'loading') mark();
  });
  const page = await ctx.newPage();
  const apiState = { count: 0, times: [] };
  await page.route(/(^|\.)(ytimg\.com|googlevideo\.com|youtube-nocookie\.com)(\/|$)/, (route) => route.abort());
  await page.route(API_URL, (route) => { apiState.count++; apiState.times.push(Date.now()); return apiRoute(route); });
  await page.goto(`http://127.0.0.1:${server.address().port}/host`);
  const frame = await waitFrame(page);
  await frame.waitForFunction(() => (document.querySelector('#leftPage')?.children.length || document.querySelector('#mobileContent')?.children.length) > 0, null, { timeout: 20000 });
  return { ctx, page, frame, apiState };
}

async function waitFrame(page) {
  for (let i = 0; i < 300; i++) {
    const frame = page.frames().find((f) => /track59-sketchbook/.test(f.url()));
    if (frame) return frame;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('책 프레임을 찾지 못했습니다');
}

const VIEWPORTS = [[1440, 900], [390, 844]];

for (const [w, h] of VIEWPORTS) {
  test(`#1365 책 열기: 첫 쪽 그려지기 전 요청 0번, 뒤이어 한 번(${w}·밤)`, { skip }, async () => {
    const server = await serve();
    const browser = await chromium.launch();
    try {
      const { ctx, frame, apiState } = await openBook(browser, server, w, h, (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_API }));
      const firstPageAt = await frame.evaluate(() => window.__firstPageAt);
      assert.ok(firstPageAt > 0, '첫 쪽이 그려진 시각을 남겨야 한다');
      assert.ok(apiState.times.every((at) => at > firstPageAt), '첫 쪽이 그려지기 전에는 iframe_api 를 요청하면 안 된다');
      await new Promise((r) => setTimeout(r, 800));
      assert.equal(apiState.count, 1, '첫 쪽 뒤 한가할 때 API를 한 번 미리 받는다');
      assert.equal(await frame.evaluate(() => typeof window.YT), 'object', '미리 받은 재생기가 준비된다');
      await ctx.close();
    } finally {
      await browser.close();
      server.close();
    }
  });

  test(`#1365 이어 보기: 누를 때 API를 한 번 받고, 다시 눌러도 다시 받지 않는다(${w}·밤)`, { skip }, async () => {
    const server = await serve();
    const browser = await chromium.launch();
    try {
      const { ctx, frame, apiState } = await openBook(browser, server, w, h, (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_API }));
      await new Promise((r) => setTimeout(r, 800));
      assert.equal(apiState.count, 1, '재생 전에 API를 한 번 미리 받는다');
      await frame.locator('#playAllBtn').click();
      await frame.waitForFunction(() => document.querySelector('#pbPlayer iframe'), null, { timeout: 15000 });
      assert.equal(apiState.count, 1, '첫 재생은 미리 받은 것을 그대로 쓴다');
      await frame.locator('#pbClose').click();
      await new Promise((r) => setTimeout(r, 400));
      await frame.locator('#playAllBtn').click();
      await frame.waitForFunction(() => document.querySelector('#pbPlayer iframe'), null, { timeout: 15000 });
      await new Promise((r) => setTimeout(r, 400));
      assert.equal(apiState.count, 1, '두 번째 재생에서 API를 다시 받으면 안 된다');
      await ctx.close();
    } finally {
      await browser.close();
      server.close();
    }
  });

  test(`#1365 영상 없는 책은 API를 미리 받지 않는다(${w}·밤)`, { skip }, async () => {
    const server = await serve();
    const browser = await chromium.launch();
    try {
      const { ctx, frame, apiState } = await openBook(browser, server, w, h, (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_API }), treeWithoutVideo());
      await new Promise((r) => setTimeout(r, 800));
      assert.equal(apiState.count, 0, '영상 순간이 없으면 미리 받지 않는다');
      assert.equal(await frame.evaluate(() => typeof window.YT), 'undefined');
      await ctx.close();
    } finally {
      await browser.close();
      server.close();
    }
  });

  test(`#1365 이어 보기: API 를 받지 못하면 안내를 보인다(${w}·밤)`, { skip }, async () => {
    const server = await serve();
    const browser = await chromium.launch();
    try {
      const { ctx, frame } = await openBook(browser, server, w, h, (route) => route.abort());
      await frame.locator('#playAllBtn').click();
      await frame.waitForFunction(() => document.getElementById('pbStatus')?.textContent.includes('재생기를 불러오지 못했어요'), null, { timeout: 15000 });
      await ctx.close();
    } finally {
      await browser.close();
      server.close();
    }
  });
}
