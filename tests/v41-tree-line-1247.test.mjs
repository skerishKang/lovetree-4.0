// #1247: 책·보드·지도 같은 트리 줄, 이어 보기 하나, 트리 이름 한 번, 열 때 안내 토스트 없음.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { serve } from './helpers/screen-audit.mjs';
let chromium, skip = false;
try { ({ chromium } = await import('playwright')); if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 건너뜀'; } catch { skip = 'playwright 없음'; }

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('#1247: 셸 머리줄에서 보기 토글을 걷어냈다', () => {
  const html = read('public/v41/index.html');
  assert.ok(!html.includes('id="book-display-toggle"'), '책 보기 토글은 머리줄에 없어야 한다');
  assert.ok(!html.includes('id="shelf-view-toggle"'), '서재 토글은 머리줄에 없어야 한다');
});

test('#1247: 책·보드·지도 트리 줄은 공용 부품 하나로 만든다', () => {
  const bar = read('public/v41/screen-toolbar.mjs');
  assert.ok(bar.includes('backEl') && bar.includes('lt-toolbar-left') && bar.includes('treeMetaText'), '공용 부품에 왼쪽 묶음과 메타를 둔다');
  for (const f of ['public/v41/views/track59-sketchbook.html', 'public/v41/views/track58-pinboard.html', 'public/v41/views/track56-network.html']) {
    const html = read(f);
    assert.ok(html.includes('mountScreenToolbar'), f + '도 공용 부품으로 줄을 만든다');
  }
});

test('#1247: 보드는 머리 띠·기억 보드 제목을 걷어내고 빈 보드일 때만 안내 한 줄을 둔다', () => {
  const html = read('public/v41/views/track58-pinboard.html');
  assert.ok(!html.includes('boardTitle'), '기억 보드 제목·설명은 없어야 한다');
  assert.ok(html.includes('id="boardEmptyGuide"'), '빈 보드 안내 한 줄이 있다');
  assert.ok(html.includes('▶ 이어 보기'), '보드 줄 오른쪽에 이어 보기가 있다');
  assert.ok(!html.includes('▶ 시네마 보기'), '띠 너머 시네마 보기 이름은 없어야 한다');
});

test('#1247: 보드 첫 진입 안내 토스트를 없앴다', () => {
  const ex = read('public/v41/views/board/board-extras.js');
  assert.ok(!ex.includes('boardGuide'), '처음 안내 말풍선은 없어야 한다');
  assert.ok(!ex.includes('순간을 선택해 연결된 기록을 살펴보세요'), '안내 문구도 없어야 한다');
});

test('#1247: 사진 표지에는 제목을 올리지 않고 표지 아래 두 줄을 쓴다', () => {
  const shelf = read('public/v41/views/shelf/shelf.js');
  assert.ok(shelf.includes("book.coverMedia?'':"), '사진 표지면 제목을 그리지 않는다');
  assert.ok(shelf.includes('book-card-meta-title') && shelf.includes('book-card-meta-date'), '표지 아래 두 줄이 있다');
});

test('#1247: 밝은 테마 이어 보기 띠 썸네일도 사진 순간으로 채운다', () => {
  const shelf = read('public/v41/views/shelf/shelf.js');
  assert.ok(shelf.includes('fallbackChapter'), '표지 사진이 없으면 사진 순간도 쓰러진다');
});

test('#1247 E2E: 세 화면 줄 높이·위치 같음, 이어 보기 하나, 트리 이름 한 번, 열 때 토스트 없음', { skip, timeout: 180000 }, async () => {
  const tree = {
    id: 't1', title: '리센느', subject: '확인 대상',
    moments: [1, 2, 3].map((i) => ({ id: 'm' + i, title: '시험 순간 ' + i, date: '2026-11-0' + i, emotion: '설렘', note: '가짜 기록', url: '', type: 'photo', image: 'https://audit.invalid/p' + i + '.jpg', first: i === 1 })),
    edges: [{ id: 'e1', a: 'm1', b: 'm2', why: '이어짐' }]
  };
  const host = (route) => `<html><body style="margin:0"><script>window.LT41={source:'server',writable:true,owned:true,momentId:'m1',prefs:{},tree:${JSON.stringify(tree)},trees:[${JSON.stringify(tree)}]};</script><iframe src="${route}" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;
  const routes = { book: '/v41/views/track59-sketchbook.html', board: '/v41/views/track58-pinboard.html', network: '/v41/views/track56-network.html' };
  const extra = {};
  for (const [k, r] of Object.entries(routes)) extra['/' + k + '-host.html'] = host(r);
  const server = await serve(extra);
  const base = `http://127.0.0.1:${server.address().port}`;
  const thumb = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [screen] of Object.entries(routes)) {
      for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        const ctx = await browser.newContext({ viewport: vp });
        await ctx.route('**/*', (route) => {
          const u = new URL(route.request().url());
          if (u.origin !== base) return u.hostname === 'audit.invalid' ? route.fulfill({ status: 200, contentType: 'image/png', body: thumb }) : route.abort();
          if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, json: { ok: true, items: [] } });
          return route.continue();
        });
        const page = await ctx.newPage();
        await page.goto(`${base}/${screen}-host.html`, { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(2000);
        const frame = page.frames().find((f) => f !== page.mainFrame());
        const geo = await frame.evaluate(() => {
          const bar = document.querySelector('.lt-screen-toolbar');
          const r = bar.getBoundingClientRect();
          const visible = [...document.querySelectorAll('*')].filter((e) => { if (e.textContent.trim() !== '리센느') return false; const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && r.bottom > 0 && r.right > 0 && r.left < innerWidth && r.top < innerHeight && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none'; }).length;
          return { h: Math.round(r.height), top: Math.round(r.top), plays: [...bar.querySelectorAll('button')].filter((b) => /이어 보기/.test(b.textContent)).length, nameCount: visible, toastVisible: !!document.querySelector('#toast.show, .toast.show') };
        });
        const label = `${screen} ${vp.width}`;
        assert.equal(geo.top, 4, `${label}: 줄 위쪽 위치`);
        assert.equal(geo.h, vp.width === 390 ? 48 : 52, `${label}: 줄 높이`);
        assert.equal(geo.plays, 1, `${label}: 이어 보기 하나`);
        assert.equal(geo.nameCount, 1, `${label}: 트리 이름 한 번`);
        assert.equal(geo.toastVisible, false, `${label}: 열 때 안내 토스트 없음`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});
