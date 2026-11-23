// #1247 상호작용 확인: 책·보드·지도 '▶ 이어 보기' 누르기 + 서재 간격 재기.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../tests/helpers/screen-audit.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TREE = {
  id: 't1', title: '리센느', subject: '확인 대상',
  moments: [1, 2, 3, 4, 5].map((i) => ({
    id: 'm' + i, title: '시험 순간 ' + i, date: '2026-11-0' + i, emotion: '설렘',
    note: '화면 확인용 가짜 기록', url: i === 3 ? 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' : i <= 2 ? 'https://audit.invalid/photo' + i + '.jpg' : '',
    type: i === 3 ? 'youtube' : i <= 2 ? 'photo' : 'memo', image: i <= 2 ? 'https://audit.invalid/photo' + i + '.jpg' : '', first: i === 1
  })),
  edges: [{ id: 'e1', a: 'm1', b: 'm2', why: '이어짐' }, { id: 'e2', a: 'm2', b: 'm3', why: '이어짐' }]
};
function hostFor(route) {
  return `<html><body style="margin:0"><script>window.LT41={source:'server',writable:true,owned:true,momentId:'m1',prefs:{},tree:${JSON.stringify(TREE)},trees:[${JSON.stringify(TREE)}]};</script><iframe src="${route}" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;
}
const ROUTES = {
  shelf: '/v41/views/track32-bookshelf.html',
  book: '/v41/views/track59-sketchbook.html',
  board: '/v41/views/track58-pinboard.html',
  network: '/v41/views/track56-network.html'
};
const extra = {};
for (const [k, r] of Object.entries(ROUTES)) extra['/' + k + '-host.html'] = hostFor(r);
const server = await serve(extra);
const base = `http://127.0.0.1:${server.address().port}`;
const THUMB = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const browser = await chromium.launch();
try {
  for (const [screen, route] of Object.entries(ROUTES)) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.origin !== base) return u.hostname === 'audit.invalid' ? route.fulfill({ status: 200, contentType: 'image/png', body: THUMB }) : route.abort();
      if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, json: { ok: true, items: [] } });
      return route.continue();
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(screen, 'pageerror', String(e).slice(0, 150)));
    await page.goto(`${base}/${screen}-host.html`, { waitUntil: 'load', timeout: 20000 }).catch(() => {});
    const frame = page.frames().find((f) => f !== page.mainFrame());
    await page.waitForTimeout(2000);
    // 줄 높이·위치 비교用
    const geo = await frame.evaluate(() => {
      const bar = document.querySelector('.lt-screen-toolbar');
      const r = bar.getBoundingClientRect();
      return { h: Math.round(r.height), top: Math.round(r.top), plays: [...bar.querySelectorAll('button')].filter((b) => /이어 보기|이어보기/.test(b.textContent)).length, playIds: [...bar.querySelectorAll('button')].filter((b) => /이어 보기/.test(b.textContent)).map((b) => b.id || b.textContent.trim()) };
    });
    console.log('\n', screen, JSON.stringify(geo));
    // 서재 간격
    if (screen === 'shelf') {
      const gaps = await frame.evaluate(() => {
        const bar = document.querySelector('.lt-screen-toolbar').getBoundingClientRect();
        const hero = document.querySelector('.hero').getBoundingClientRect();
        const controls = document.querySelector('.shelf-controls')?.getBoundingClientRect();
        const viewport = document.querySelector('.shelf-viewport')?.getBoundingClientRect();
        return { barBottom: Math.round(bar.bottom), heroTop: Math.round(hero.top), gapBarHero: Math.round(hero.top - bar.bottom), controlsTop: controls ? Math.round(controls.top) : null, viewportTop: Math.round(viewport.top) };
      });
      console.log(screen, 'gaps', JSON.stringify(gaps));
    }
    // 이어 보기 누르기
    const btnSel = screen === 'book' ? '#playAllBtn' : screen === 'board' ? '#cinemaBtn' : '#mapPlayBtn';
    if (screen !== 'shelf') {
      const before = await frame.evaluate((s) => {
        if (document.querySelector(s)) { document.querySelector(s).click(); return 'clicked'; }
        return 'missing';
      }, btnSel);
      await page.waitForTimeout(1200);
      const after = await frame.evaluate((k) => {
        if (k === 'book') return { overlayOpen: !!document.querySelector('#playback.open, #playback:not([inert])') ? document.querySelector('#playback').classList.contains('open') || getComputedStyle(document.querySelector('#playback')).visibility : document.querySelector('#playback').outerHTML.slice(0, 80), btnHidden: document.querySelector('#playAllBtn') ? document.querySelector('#playAllBtn').hidden : null, inBar: !!document.querySelector('.lt-screen-toolbar #playAllBtn') };
        if (k === 'board') return { cinemaOpen: document.querySelector('#cinemaOverlay') ? getComputedStyle(document.querySelector('#cinemaOverlay')).display : 'no' };
        return { playExposed: typeof window.startPlayback };
      }, screen);
      console.log(screen, 'play click', before, JSON.stringify(after));
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
console.log('done');
