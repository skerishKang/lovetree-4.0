// 화면 줄 캡처: 네 화면 × 1440·390 × 밝은/밤, 방문자 책 × 1440·390.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../tests/helpers/screen-audit.mjs';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'captures-view-row'));
await mkdir(OUT, { recursive: true });

const TREE = {
  id: 't1', title: '시험용', subject: '확인 대상',
  moments: [1, 2, 3, 4, 5].map((i) => ({
    id: 'm' + i, title: '시험 순간 ' + i, date: '2026-11-0' + i, emotion: '설렘',
    note: '화면 확인용 가짜 기록', url: i === 1 ? 'https://audit.invalid/photo1.jpg' : i === 3 ? 'https://audit.invalid/photo3.jpg' : '',
    type: i <= 3 ? 'photo' : 'memo', image: i <= 3 ? 'https://audit.invalid/photo' + i + '.jpg' : '', first: i === 1
  })),
  edges: [{ id: 'e1', a: 'm1', b: 'm2', why: '이어짐' }, { id: 'e2', a: 'm2', b: 'm3', why: '이어짐' }]
};
function hostFor(route, { visitor = false } = {}) {
  const source = visitor ? 'share' : 'server';
  const writable = !visitor;
  const owned = !visitor;
  return `<html><body style="margin:0" data-member="${visitor ? 'out' : 'in'}" data-record-source="${source}"><script>window.LT41={source:${JSON.stringify(source)},writable:${writable},owned:${owned},momentId:'m1',prefs:{},tree:${JSON.stringify(TREE)},trees:[${JSON.stringify(TREE)}]};</script><iframe src="${route}" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;
}
const ROUTES = {
  shelf: '/v41/views/track32-bookshelf.html',
  book: '/v41/views/track59-sketchbook.html',
  board: '/v41/views/track58-pinboard.html',
  network: '/v41/views/track56-network.html'
};
const extra = {};
for (const [k, r] of Object.entries(ROUTES)) extra['/' + k + '-host.html'] = hostFor(r);
extra['/visitor-book-host.html'] = hostFor(ROUTES.book, { visitor: true });
const server = await serve(extra);
const base = `http://127.0.0.1:${server.address().port}`;
const THUMB = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const browser = await chromium.launch();
async function capture(screen, themeKey, theme, vp, { visitor = false } = {}) {
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
  const host = visitor ? 'visitor-book-host.html' : `${screen}-host.html`;
  await page.goto(`${base}/${host}`, { waitUntil: 'load', timeout: 20000 }).catch(() => {});
  const frame = page.frames().find((f) => f !== page.mainFrame());
  assert.ok(frame, `${screen} ${vp.width}: 화면 프레임이 있어야 한다`);
  await frame.waitForSelector('.lt-screen-toolbar', { timeout: 12000 });
  await page.waitForTimeout(1500);
  const name = `${visitor ? 'visitor-book' : screen}-${themeKey}-${vp.width}.png`;
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  const metrics = await frame.evaluate(() => {
    const row = document.querySelector('.lt-screen-toolbar');
    const rect = (el) => el ? el.getBoundingClientRect() : null;
    const visible = (el) => {
      const r = rect(el);
      const style = getComputedStyle(el);
      return !!r && r.width > 0 && r.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
    };
    const title = row?.querySelector('.lt-toolbar-title')?.textContent.trim() || '';
    const titleCount = title ? [...document.querySelectorAll('*')].filter((el) => el.children.length === 0 && el.textContent.trim() === title && visible(el)).length : 0;
    const playButtons = [...document.querySelectorAll('button')].filter((button) => visible(button) && /이어\s*보기/.test(button.textContent));
    const buttons = [...(row?.querySelectorAll('button,select') || [])].filter(visible);
    const buttonHeights = [...new Set(buttons.map((button) => Math.round(rect(button).height)))].sort((a, b) => a - b);
    const clippedButtons = buttons.filter((button) => {
      const range = document.createRange();
      range.selectNodeContents(button);
      const style = getComputedStyle(button);
      const padding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
      return range.getBoundingClientRect().width > button.clientWidth - padding + 1;
    }).map((button) => button.id || button.textContent.trim());
    const writeButtons = [...document.querySelectorAll('.moment-edit,[data-title-edit],[data-note-edit],[data-delete-moment],#write-menu,#shelfNewTree,[data-write]')].filter(visible);
    return {
      rowTop: row ? Math.round(rect(row).top) : null,
      rowHeight: row ? Math.round(rect(row).height) : null,
      buttonHeights,
      treeTitleCount: titleCount,
      continueCount: playButtons.length,
      clippedButtons,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      visibleWriteButtonCount: writeButtons.length
    };
  });
  assert.equal(metrics.treeTitleCount, 1, `${name}: 화면에 트리 이름이 한 번 보여야 한다`);
  assert.deepEqual(metrics.clippedButtons, [], `${name}: 보이는 단추 글자가 잘리지 않아야 한다`);
  if (visitor) assert.equal(metrics.visibleWriteButtonCount, 0, `${name}: 방문자 화면에 쓰기 단추가 없어야 한다`);
  console.log(name, JSON.stringify(metrics), errors.length ? 'ERR ' + errors[0].slice(0, 120) : '');
  await ctx.close();
  return metrics;
}
try {
  for (const [screen] of Object.entries(ROUTES)) {
    for (const [themeKey, theme] of Object.entries({ bright: 'garden', night: 'night' })) {
      for (const [vwKey, vp] of Object.entries({ '1440': { width: 1440, height: 900 }, '390': { width: 390, height: 844 } })) {
        await capture(screen, themeKey, theme, vp);
      }
    }
  }
  await capture('book', 'bright', 'garden', { width: 1440, height: 900 }, { visitor: true });
  await capture('book', 'bright', 'garden', { width: 390, height: 844 }, { visitor: true });
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
console.log('done', OUT);
