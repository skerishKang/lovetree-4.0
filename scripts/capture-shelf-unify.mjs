// #212 내 책장 테마·카드 캡처. 실제 로그인 대신 /api/workspace 응답을 가짜 세션으로 대체한다.
// 사용: node scripts/capture-shelf-unify.mjs
import { chromium } from '/usr/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('dist');
const OUT = path.resolve('out/shelf-unify');
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (url.pathname.startsWith('/v41/') && !path.extname(url.pathname)) file = path.join(ROOT, 'v41/index.html');
  else if (url.pathname === '/v41/' || url.pathname === '/v41') file = path.join(ROOT, 'v41/index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const NOW = '2026-11-08T00:00:00.000Z';
// 각 트리의 첫 순간만 parentId=null, 나머지는 그 트리의 첫 순간에 이어진다.
const moment = (id, title, note, date, emotion, parentId = null) => ({ id, parentId, relation: '', links: [], title, note, emotion, date, url: '', createdAt: NOW });

// 자동 접미사가 붙은 옛 데이터와 그렇지 않은 새 데이터를 함께 둔다.
const STATE = {
  version: 1,
  trees: [
    { id: 't1', subject: '윤슬', title: '윤슬, 나의 순간들', coverMomentId: '', createdAt: NOW, updatedAt: NOW, moments: [moment('m1', '첫 목소리', '라디오에서 처음 들은 목소리', '2026-11-01', '설렘'), moment('m2', '두 번째 무대', '같은 노래를 다시 들었다', '2026-11-05', '설렘', 'm1'), moment('m3', '긴 제목의 순간', '아주 긴 마음 한마디를 적어 둔 날', '2026-11-08', '평온', 'm1')] },
    { id: 't2', subject: '하루', title: '하루', coverMomentId: '', createdAt: NOW, updatedAt: NOW, moments: [moment('n1', '아침 산책', '공기가 좋았다', '2026-10-20', '평온')] },
    { id: 't3', subject: '겨울 정원', title: '겨울 정원, 나의 순간들', coverMomentId: '', createdAt: NOW, updatedAt: NOW, moments: [moment('w1', '서리 내린 날', '조용했다', '2026-10-31', '그리움'), moment('w2', '첫눈', '창밖을 오래 봤다', '2026-11-07', '설렘', 'w1')] }
  ]
};

function json(route, body, status = 200) { return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); }

async function run(theme, width, height, name) {
  const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', error => errors.push(String(error)));

  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/workspace') {
      if (route.request().method() === 'GET') return json(route, { revision: 7, writeSubjectBound: true, subject: 'screener@example.test', savedAt: NOW, state: STATE });
      return json(route, { revision: 8, writeSubjectBound: true, savedAt: NOW });
    }
    if (path === '/api/account') return json(route, { email: 'screener@example.test', subject: 'screener@example.test' });
    if (path === '/api/community/shares') return json(route, { shares: [] });
    return json(route, {}, 404);
  });

  await page.route('**/auth/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

  const base = 'http://localhost:' + server.address().port;
  await page.goto(base + '/v41/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(value => {
    try { localStorage.setItem('lt41.theme', value); localStorage.setItem('lt41.homeCards', 'example'); } catch {}
  }, theme);
  await page.goto(base + '/v41/#my/shelf?tree=t1&moment=m1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2400);
  // 책장 iframe 안쪽이 실제 책 카드로 그려질 때까지 기다린다.
  const frame = page.frames().find(f => f.url().includes('track32-bookshelf'));
  if (frame) await frame.waitForSelector('.book-card', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(900);

  await page.screenshot({ path: path.join(OUT, name), fullPage: false });

  let audit = { theme, width, height, frame: !!frame };
  if (frame) {
    const measured = await frame.evaluate(() => {
      const cover = document.querySelector('.book-card.is-center .book-cover');
      const card = document.querySelector('.book-card.is-center');
      const rail = document.querySelector('.shelf-rail');
      const rose = [];
      for (const el of document.querySelectorAll('*')) {
        // 화면에 실제로 그려지는 요소만 본다(셸이 숨기는 자체 브랜드 등은 제외).
        if (!el.getClientRects().length) continue;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        for (const prop of ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor']) {
          const value = style[prop];
          if (!value) continue;
          const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (!match) continue;
          const [r, g, b] = [+match[1], +match[2], +match[3]];
          // 밤 화면에서 장미색 계열(붉은 기가 강하고 초록·파랑이 낮은 색)을 찾는다.
          if (r > 150 && r - g > 45 && r - b > 25 && g < 175) rose.push({ tag: el.tagName, cls: el.className, prop, value });
        }
      }
      const cardRect = card?.getBoundingClientRect();
      const railRect = rail?.getBoundingClientRect();
      const coverRect = cover?.getBoundingClientRect();
      return {
        themeAttr: document.documentElement.getAttribute('data-lt-theme') || 'night(default)',
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        heroBackground: getComputedStyle(document.querySelector('.hero')).backgroundColor,
        cardLine: document.querySelector('.book-card.is-center .book-card-meta span')?.textContent || '',
        coverTitles: [...document.querySelectorAll('.book-card .cover-title')].map(el => el.textContent),
        heroTitles: [...document.querySelectorAll('#heroBooks .hero-book span')].map(el => el.textContent),
        suffixLeft: [...document.querySelectorAll('.book-card .cover-title')].some(el => el.textContent.includes('나의 순간들')) ? 'present' : 'absent',
        coverNumber: document.querySelector('.cover-number') ? 'present' : 'absent',
        // 화면에 보이는 글자에 내부 표시가 남았는지 본다(주석 제외).
        defaultCover: [...document.querySelectorAll('.book-card, .book-card-meta')].some(el => el.textContent.includes('기본 표지')) ? 'present' : 'absent',
        bookNN: [...document.querySelectorAll('.book-card')].some(el => /책 · \d\d/.test(el.textContent)) ? 'present' : 'absent',
        cardCount: document.querySelectorAll('.book-card').length,
        heroBooks: document.querySelectorAll('#heroBooks .hero-book').length,
        coverClippedTop: coverRect && cardRect ? Math.round(cardRect.top - coverRect.top) : null,
        overflowX: Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth),
        roseCount: rose.length,
        roseSamples: rose.slice(0, 6),
        railTop: railRect ? Math.round(railRect.top) : null,
        coverTop: coverRect ? Math.round(coverRect.top) : null
      };
    });
    audit = { theme, width, height, frame: true, ...measured };
  }
  audit.errors = errors.slice(0, 5);
  await browser.close();
  return audit;
}

await new Promise(resolve => server.listen(0, resolve));
const results = [];
for (const theme of ['night', 'garden']) {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    results.push(await run(theme, w, h, `shelf-${theme}-${w}.png`));
  }
}
server.close();
fs.writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
