// 화면 줄 캡처: 서재·책·보드·지도 × 1440·390 × 밝은/밤 — 직접 눈으로 확인.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../tests/helpers/screen-audit.mjs';
import { mkdir } from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'captures-view-row'));
await mkdir(OUT, { recursive: true });

const TREE = {
  id: 't1', title: '리센느', subject: '확인 대상',
  moments: [1, 2, 3, 4, 5].map((i) => ({
    id: 'm' + i, title: '시험 순간 ' + i, date: '2026-11-0' + i, emotion: '설렘',
    note: '화면 확인용 가짜 기록', url: i === 1 ? 'https://audit.invalid/photo1.jpg' : i === 3 ? 'https://audit.invalid/photo3.jpg' : '',
    type: i <= 3 ? 'photo' : 'memo', image: i <= 3 ? 'https://audit.invalid/photo' + i + '.jpg' : '', first: i === 1
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
  for (const [screen] of Object.entries(ROUTES)) {
    for (const [themeKey, theme] of Object.entries({ bright: 'garden', night: 'night' })) {
      for (const [vwKey, vp] of Object.entries({ '1440': { width: 1440, height: 900 }, '390': { width: 390, height: 844 } })) {
        const ctx = await browser.newContext({ viewport: vp });
        await ctx.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
        await ctx.route('**/*', (route) => {
          const u = new URL(route.request().url());
          if (u.origin !== base) return u.hostname === 'audit.invalid' ? route.fulfill({ status: 200, contentType: 'image/png', body: THUMB }) : route.abort();
          if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, json: { ok: true, items: [] } });
          return route.continue();
        });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.goto(`${base}/${screen}-host.html`, { waitUntil: 'load', timeout: 20000 }).catch(() => {});
        const frame = page.frames().find((f) => f !== page.mainFrame());
        await page.waitForTimeout(2000);
        const name = `${screen}-${themeKey}-${vwKey}.png`;
        await page.screenshot({ path: path.join(OUT, name), fullPage: false });
        const geo = await frame.evaluate(() => {
          const bar = document.querySelector('.lt-screen-toolbar');
          const r = (el) => el ? { h: Math.round(el.getBoundingClientRect().height), top: Math.round(el.getBoundingClientRect().top), text: el.textContent.trim().slice(0, 60) } : null;
          const plays = [...document.querySelectorAll('.lt-screen-toolbar button')].filter((b) => /이어 보기|이어보기/.test(b.textContent)).length;
          return { bar: r(bar), title: r(bar && bar.querySelector('.lt-toolbar-title')), meta: bar && bar.querySelector('.lt-toolbar-meta') ? bar.querySelector('.lt-toolbar-meta').textContent : null, plays, htop: document.querySelector('header') ? Math.round(document.querySelector('header').getBoundingClientRect().height) : null };
        }).catch(() => null);
        console.log(name, JSON.stringify(geo), errors.length ? 'ERR ' + errors[0].slice(0, 120) : '');
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
console.log('done', OUT);
