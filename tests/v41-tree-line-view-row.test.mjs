// 화면 줄: 책·보드·지도 같은 트리 줄, 이어 보기 하나, 트리 이름 한 번, 열 때 안내 토스트 없음.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';
let chromium, skip = false;
try { ({ chromium } = await import('playwright')); if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 건너뜀'; } catch { skip = 'playwright 없음'; }

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('화면 줄: 셸 머리줄에서 보기 토글을 걷어냈다', () => {
  const html = read('public/v41/index.html');
  assert.ok(!html.includes('id="book-display-toggle"'), '책 보기 토글은 머리줄에 없어야 한다');
  assert.ok(!html.includes('id="shelf-view-toggle"'), '서재 토글은 머리줄에 없어야 한다');
});

test('화면 줄: 책·보드·지도 트리 줄은 공용 부품 하나로 만든다', () => {
  const bar = read('public/v41/screen-toolbar.mjs');
  assert.ok(bar.includes('backEl') && bar.includes('lt-toolbar-left') && bar.includes('treeMetaText'), '공용 부품에 왼쪽 묶음과 메타를 둔다');
  for (const f of ['public/v41/views/track59-sketchbook.html', 'public/v41/views/track58-pinboard.html', 'public/v41/views/track56-network.html']) {
    const html = read(f);
    assert.ok(html.includes('mountScreenToolbar'), f + '도 공용 부품으로 줄을 만든다');
  }
});

test('화면 줄: 보드는 머리 띠·기억 보드 제목을 걷어내고 빈 보드일 때만 안내 한 줄을 둔다', () => {
  const html = read('public/v41/views/track58-pinboard.html');
  assert.ok(!html.includes('boardTitle'), '기억 보드 제목·설명은 없어야 한다');
  assert.ok(html.includes('id="boardEmptyGuide"'), '빈 보드 안내 한 줄이 있다');
  assert.ok(html.includes('▶ 이어 보기'), '보드 줄 오른쪽에 이어 보기가 있다');
  assert.ok(!html.includes('▶ 시네마 보기'), '띠 너머 시네마 보기 이름은 없어야 한다');
});

test('화면 줄: 보드 첫 진입 안내 토스트를 없앴다', () => {
  const ex = read('public/v41/views/board/board-extras.js');
  assert.ok(!ex.includes('boardGuide'), '처음 안내 말풍선은 없어야 한다');
  assert.ok(!ex.includes('순간을 선택해 연결된 기록을 살펴보세요'), '안내 문구도 없어야 한다');
});

test('화면 줄: 사진 표지에는 제목을 올리지 않고 표지 아래 두 줄을 쓴다', () => {
  const shelf = read('public/v41/views/shelf/shelf.js');
  assert.ok(shelf.includes("book.coverMedia?'':"), '사진 표지면 제목을 그리지 않는다');
  assert.ok(shelf.includes('book-card-meta-title') && shelf.includes('book-card-meta-date'), '표지 아래 두 줄이 있다');
});

test('화면 줄: 밝은 테마 이어 보기 띠 썸네일도 사진 순간으로 채운다', () => {
  const shelf = read('public/v41/views/shelf/shelf.js');
  assert.ok(shelf.includes('fallbackChapter'), '표지 사진이 없으면 사진 순간도 쓰러진다');
});

test('화면 줄 E2E: 세 화면 줄 높이·위치 같음, 이어 보기 하나, 트리 이름 한 번, 열 때 토스트 없음', { skip, timeout: 180000 }, async () => {
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
        const geo = await frame.evaluate(([screenKind, phoneShaped]) => {
          const bar = document.querySelector('.lt-screen-toolbar');
          const r = bar.getBoundingClientRect();
          const visible = [...document.querySelectorAll('*')].filter((e) => { if (e.textContent.trim() !== '리센느') return false; const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && r.bottom > 0 && r.right > 0 && r.left < innerWidth && r.top < innerHeight && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none'; }).length;
          const inBar = [...bar.querySelectorAll('button')].filter((b) => /이어 보기/.test(b.textContent)).length;
          const inNav = [...document.querySelectorAll('.nav-pill button')].filter((b) => /이어 보기/.test(b.textContent)).length;
          const buttons = [...bar.querySelectorAll('button,select')].filter((b) => b.getClientRects().length > 0 && getComputedStyle(b).display !== 'none');
          const heights = [...new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().height)))];
          const crossLine = buttons.filter((b) => { const q = b.getBoundingClientRect(); return q.top < r.top - 1 || q.bottom > r.bottom + 1; }).map((b) => b.id || b.className);
          const style = getComputedStyle(bar);
          const contentLeft = r.left + Number.parseFloat(style.paddingLeft);
          const contentRight = r.right - Number.parseFloat(style.paddingRight);
          const clipped = buttons.filter((b) => { const q = b.getBoundingClientRect(); return q.left < contentLeft - 1 || q.right > contentRight + 1; }).map((b) => b.id || b.className || b.textContent.trim());
          const textClipped = buttons.filter((b) => {
            const range = document.createRange();
            range.selectNodeContents(b);
            const buttonStyle = getComputedStyle(b);
            const padding = (Number.parseFloat(buttonStyle.paddingLeft) || 0) + (Number.parseFloat(buttonStyle.paddingRight) || 0);
            return range.getBoundingClientRect().width > b.clientWidth - padding + 1;
          }).map((b) => b.id || b.className || b.textContent.trim());
          const back = bar.querySelector('.shelf-back');
          return { h: Math.round(r.height), top: Math.round(r.top), plays: inBar + (screenKind === 'book' && phoneShaped ? inNav : 0), nameCount: visible, toastVisible: !!document.querySelector('#toast.show, .toast.show'), heights, crossLine, clipped, textClipped, back: back ? back.textContent.trim() : null, backTarget: back ? back.getAttribute('href') : null };
        }, [screen, vp.width === 390]);
        const label = `${screen} ${vp.width}`;
        assert.equal(geo.top, 4, `${label}: 줄 위쪽 위치`);
        assert.equal(geo.h, vp.width === 390 ? 48 : 52, `${label}: 줄 높이`);
        assert.equal(geo.plays, 1, `${label}: 이어 보기 하나`);
        assert.equal(geo.nameCount, 1, `${label}: 트리 이름 한 번`);
        assert.equal(geo.toastVisible, false, `${label}: 열 때 안내 토스트 없음`);
        assert.deepEqual(geo.heights, [36], `${label}: 줄 안 모든 단추 높이는 36px 하나`);
        assert.deepEqual(geo.crossLine, [], `${label}: 선택 단추가 줄 아래 선을 넘지 않음`);
        assert.deepEqual(geo.clipped, [], `${label}: 보이는 단추가 머리줄 안에 들어간다`);
        assert.deepEqual(geo.textClipped, [], `${label}: 보이는 단추의 글자가 잘리지 않는다`);
        assert.equal(geo.back, null, `${label}: 중복 서재 단추 없음`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});

test('화면 줄 E2E: 방문자 책·보드·지도는 공통 줄을 쓰고 쓰기 단추가 없다', { skip, timeout: 180000 }, async () => {
  const tree = {
    id: 't1', title: '리센느', subject: '확인 대상',
    moments: [1, 2, 3].map((i) => ({ id: 'm' + i, title: '시험 순간 ' + i, date: '2026-11-0' + i, emotion: '설렘', note: '가짜 기록', url: '', type: 'memo', first: i === 1 })),
    edges: [{ id: 'e1', a: 'm1', b: 'm2', why: '이어짐' }]
  };
  const routes = {
    book: '/v41/views/track59-sketchbook.html',
    board: '/v41/views/track58-pinboard.html',
    network: '/v41/views/track56-network.html'
  };
  const extra = {};
  for (const [screen, route] of Object.entries(routes)) {
    extra[`/${screen}-guest-host.html`] = `<html lang="ko"><body style="margin:0" data-member="out" data-record-source="share"><script>window.LT41={source:'share',writable:false,owned:false,momentId:'m1',prefs:{},tree:${JSON.stringify(tree)},trees:[${JSON.stringify(tree)}]};</script><iframe src="${route}" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;
  }
  const server = await serve(extra);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [screen] of Object.entries(routes)) {
      for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        const ctx = await browser.newContext({ viewport: vp });
        await ctx.route('**/*', (route) => {
          const u = new URL(route.request().url());
          if (u.origin !== base) return route.abort();
          if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, json: { ok: true, items: [] } });
          return route.continue();
        });
        const page = await ctx.newPage();
        await page.goto(`${base}/${screen}-guest-host.html`, { waitUntil: 'load', timeout: 20000 });
        const frame = page.frames().find((f) => f !== page.mainFrame());
        await frame.waitForSelector('.lt-screen-toolbar', { timeout: 12000 });
        const result = await frame.evaluate(() => {
          const row = document.querySelector('.lt-screen-toolbar');
          const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
          const buttons = [...row.querySelectorAll('button,select')].filter(visible);
          const writes = [...document.querySelectorAll('.moment-edit,[data-title-edit],[data-note-edit],[data-write],#write-menu,#shelfNewTree')].filter(visible);
          return {
            rowTop: Math.round(row.getBoundingClientRect().top),
            rowHeight: Math.round(row.getBoundingClientRect().height),
            displayToggleInRow: !!row.querySelector('.lt-toolbar-tools #book-display-inline'),
            displayLabels: [...row.querySelectorAll('#book-display-inline button')].map((button) => button.textContent.trim()),
            titleCount: [...document.querySelectorAll('.lt-toolbar-title')].filter((title) => visible(title) && title.textContent.trim() === '리센느').length,
            writeCount: writes.length,
            playCount: [...document.querySelectorAll('button')].filter((button) => visible(button) && /이어\s*보기/.test(button.textContent)).length,
            overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
            buttonHeights: [...new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().height)))].sort((a, b) => a - b),
            buttonDetails: buttons.map((button) => ({ text: button.textContent.trim(), id: button.id, className: button.className, height: Math.round(button.getBoundingClientRect().height) })),
            textClipped: buttons.filter((button) => {
              const range = document.createRange();
              range.selectNodeContents(button);
              const style = getComputedStyle(button);
              const padding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
              return range.getBoundingClientRect().width > button.clientWidth - padding + 1;
            }).map((button) => button.textContent.trim())
          };
        });
        const label = `방문자 ${screen} ${vp.width}`;
        if (screen === 'book') {
          assert.equal(result.displayToggleInRow, true, `${label}: 책·목록 전환이 공통 줄에 있다`);
          assert.deepEqual(result.displayLabels, ['책', '목록'], `${label}: 책·목록 단추를 유지한다`);
        }
        assert.equal(result.rowTop, 4, `${label}: 공통 줄 위치가 같다`);
        assert.equal(result.rowHeight, vp.width === 390 ? 48 : 52, `${label}: 공통 줄 높이가 같다`);
        assert.equal(result.titleCount, 1, `${label}: 트리 이름이 한 번 표시된다`);
        assert.equal(result.writeCount, 0, `${label}: 쓰기 단추가 없다`);
        assert.equal(result.playCount, 1, `${label}: 이어 보기 단추가 하나 보인다`);
        assert.equal(result.overflow, 0, `${label}: 가로 넘침이 없다`);
        assert.deepEqual(result.buttonHeights, [36], `${label}: 보이는 줄 단추 높이가 36px이다 ${JSON.stringify(result.buttonDetails)}`);
        assert.deepEqual(result.textClipped, [], `${label}: 보이는 단추 글자가 잘리지 않는다 ${JSON.stringify(result.textClipped)}`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

function shellWorkspace() {
  let tree = createTree({ subject: '시험', title: '시험 트리', note: '기록', emotion: '설렘', date: '2026-11-24', url: '' }, '2026-11-24T00:00:00.000Z');
  tree = addMoment(tree, { subject: '시험', title: '두 번째 순간', note: '', emotion: '설렘', date: '2026-11-24', url: '' }, tree.moments[0].id, '2026-11-24T00:01:00.000Z');
  return { revision: 1, state: { version: 1, trees: [tree], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-24T00:02:00.000Z' };
}

const shownPath = (page) => page.evaluate(() => {
  const frame = [...document.querySelectorAll('#view, #view-next')].find((f) => !f.hidden && f.getClientRects().length > 0);
  try { return frame?.contentWindow?.location?.pathname || ''; } catch { return ''; }
});

test('화면 줄: 중복 복귀 단추 없이 상단 서재 탭으로 이동한다(1440)', { skip, timeout: 120000 }, async () => {
  const workspace = shellWorkspace();
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('lt41.tips.firstTree', '1'); } catch {} });
    await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workspace) }));
    const page = await ctx.newPage();
    try {
      await page.goto(base + '/v41/?account=1#my/book', { waitUntil: 'load', timeout: 20000 });
      await page.waitForFunction(() => /track59-sketchbook/.test((() => {
        const f = [...document.querySelectorAll('#view, #view-next')].find((x) => !x.hidden && x.getClientRects().length > 0);
        try { return f?.contentWindow?.location?.pathname || ''; } catch { return ''; }
      })()), null, { timeout: 20000 });
      await page.waitForFunction(() => {
        const frame = [...document.querySelectorAll('#view, #view-next')].find((item) => !item.hidden && item.getClientRects().length > 0);
        return !!frame?.contentDocument?.querySelector('.lt-screen-toolbar');
      }, null, { timeout: 12000 });
      const back = await page.evaluate(() => {
        const frame = [...document.querySelectorAll('#view, #view-next')].find((item) => !item.hidden && item.getClientRects().length > 0);
        return !!frame?.contentDocument?.querySelector('.lt-screen-toolbar .shelf-back');
      });
      assert.equal(back, false, '공통 줄에 중복 복귀 단추가 없다');
      await page.locator('.main-nav button[data-view="track32-bookshelf.html"]').click();
      await page.waitForFunction(() => /track32-bookshelf/.test((() => {
        const f = [...document.querySelectorAll('#view, #view-next')].find((x) => !x.hidden && x.getClientRects().length > 0);
        try { return f?.contentWindow?.location?.pathname || ''; } catch { return ''; }
      })()), null, { timeout: 20000 });
      assert.match(await shownPath(page), /track32-bookshelf/, '서재로 이동했다');
    } finally { await ctx.close(); }
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});

test('390 떠 있는 ＋ 단추와 의견 보내기 링크의 겹침 0', { skip, timeout: 120000 }, async () => {
  const workspace = shellWorkspace();
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workspace) }));
    const page = await ctx.newPage();
    try {
      await page.goto(base + '/v41/?account=1#home', { waitUntil: 'load', timeout: 20000 });
      await page.waitForFunction(() => document.body.classList.contains('lt-fab-ok') && !!document.getElementById('feedback-link')?.getClientRects().length, null, { timeout: 20000 });
      const geo = await page.evaluate(() => {
        const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
        return { fab: box(document.getElementById('mobile-add')), link: box(document.getElementById('feedback-link')) };
      });
      const x = Math.max(0, Math.min(geo.fab.right, geo.link.right) - Math.max(geo.fab.left, geo.link.left));
      const y = Math.max(0, Math.min(geo.fab.bottom, geo.link.bottom) - Math.max(geo.fab.top, geo.link.top));
      assert.equal(x * y, 0, `떠 있는 단추가 의견 링크를 가린다(${x}×${y})`);
    } finally { await ctx.close(); }
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});

test('휴대폰 책: 초기화 순서와 관계없이 이어 보기는 아래 줄에 남는다', { skip }, async () => {
  const server = await serve({ '/book-toolbar-order.html': `<!doctype html><html data-v41-screen="book"><head>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="stylesheet" href="/v41/identity.css"><link rel="stylesheet" href="/v41/screen-toolbar.css">
    </head><body><header hidden><span id="sourceTitle">시험용 책</span>
    <div id="display" class="view-toggle"><button>책</button><button>목록</button></div>
    <div id="shape" class="view-toggle"><button>1장</button><button>2장</button></div>
    </header><nav class="nav-pill"><button id="playAllBtn">이어 보기</button></nav>
    <script type="module">import {mountScreenToolbar} from '/v41/screen-toolbar.mjs';
    mountScreenToolbar({screen:'book',titleFrom:document.getElementById('sourceTitle'),
      tools:['display','shape','playAllBtn'].map(id=>document.getElementById(id))});
    </script></body></html>` });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto('http://127.0.0.1:' + server.address().port + '/book-toolbar-order.html', { waitUntil: 'load' });
    await page.locator('.lt-screen-toolbar').waitFor();
    const check = async () => {
      assert.equal(await page.locator('.nav-pill > #playAllBtn').count(), 1);
      assert.equal(await page.locator('.lt-screen-toolbar #playAllBtn').count(), 0);
      for (const id of ['display', 'shape']) {
        assert.equal(await page.locator('.lt-toolbar-tools #' + id + ' > button:visible').count(), 2);
      }
    };
    await check();
    await page.evaluate(() => {
      document.documentElement.dataset.bookShape = 'phone';
      document.getElementById('sourceTitle').textContent = '긴 제목의 시험용 책';
    });
    await page.waitForFunction(() => document.querySelector('.lt-toolbar-title').textContent === '긴 제목의 시험용 책');
    await check();
  } finally {
    await browser.close();
    server.close();
  }
});


test('#1249 이어 보기: 화면·권한·폭별 공통 테두리, 장미색 채움 없음', { skip, timeout: 180000 }, async () => {
  const tree={id:'t1',title:'시험용',moments:[1,2,3].map(i=>({id:'m'+i,title:'시험 순간 '+i,date:'2026-11-0'+i,type:'memo',note:'가짜 기록',first:i===1})),edges:[]};
  const routes={book:['track59-sketchbook.html','playAllBtn'],board:['track58-pinboard.html','cinemaBtn'],network:['track56-network.html','mapPlayBtn']};
  const extra={};
  for(const [screen,[route]] of Object.entries(routes)) for(const visitor of [false,true]){
    const source=visitor?'share':'server';
    extra['/'+screen+'-'+source+'.html']=`<html><body style="margin:0" data-member="${visitor?'out':'in'}" data-record-source="${source}"><script>window.LT41=${JSON.stringify({source,writable:!visitor,owned:!visitor,momentId:'m1',prefs:{},tree,trees:[tree]})};</script><iframe src="/v41/views/${route}" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;
  }
  const server=await serve(extra),base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true});
  try{
    for(const theme of ['garden','night']){
      let expected;
      for(const width of [1440,390]) for(const visitor of [false,true]) for(const [screen,[,id]] of Object.entries(routes)){
        const ctx=await browser.newContext({viewport:{width,height:width===390?844:900}});
        try{
          await ctx.addInitScript(t=>localStorage.setItem('lt41.theme',t),theme);
          await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==base)return r.abort();if(u.pathname.startsWith('/api/'))return r.fulfill({status:200,json:{ok:true,items:[]}});return r.continue();});
          const page=await ctx.newPage();
          await page.goto(base+'/'+screen+'-'+(visitor?'share':'server')+'.html',{waitUntil:'load',timeout:20000});
          const frame=page.frames().find(f=>f!==page.mainFrame());
          const btn=frame.locator('#'+id);
          await btn.waitFor({state:'visible',timeout:12000});
          if(screen==='book'&&width===390) await frame.locator('.nav-pill #playAllBtn').waitFor({state:'visible',timeout:12000});
          const result=await btn.evaluate(el=>{
            const s=getComputedStyle(el),r=el.getBoundingClientRect(),range=document.createRange();
            range.selectNodeContents(el);
            const sample=document.createElement('span');sample.style.background='var(--lt-primary)';sample.style.color='var(--lt-pearl)';document.body.append(sample);
            const primary=getComputedStyle(sample).backgroundColor;sample.remove();
            return {style:{background:s.backgroundColor,image:s.backgroundImage,border:s.borderTopColor,borderWidth:s.borderTopWidth,borderStyle:s.borderTopStyle,radius:s.borderTopLeftRadius,color:s.color,font:s.fontWeight},primary,inside:r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1,clipped:range.getBoundingClientRect().width>el.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)+1};
          });
          const label=[theme,width,visitor?'방문자':'소유자',screen].join(' ');
          if(!expected)expected=result.style;
          assert.deepEqual(result.style,expected,label+' 동일한 공통 스타일');
          assert.notEqual(result.style.background,result.primary,label+' 기본 채움색 금지');
          assert.equal(result.style.image,'none',label+' 단색 테두리');
          assert.equal(result.style.borderWidth,'1px',label+' 테두리 두께');
          assert.equal(result.style.borderStyle,'solid',label+' 테두리 모양');
          assert.equal(result.inside,true,label+' 화면 안');
          assert.equal(result.clipped,false,label+' 글자 잘림 없음');
          console.log(label,JSON.stringify(result.style));
        }finally{await ctx.close();}
      }
    }
  }finally{await browser.close();await new Promise(r=>server.close(r));}
});


test('#1249 서재 검색칸: 390 안내 글자 전체 표시, 검색 동작, 가로 넘침 0', { skip, timeout: 120000 }, async () => {
  const makeTree=(id,title)=>({id,title,subject:title,moments:[{id:id+'m1',title:'시험 순간',type:'memo',date:'2026-11-01',note:'가짜 기록',first:true}],edges:[]});
  const trees=[makeTree('t1','시험용 사과'),makeTree('t2','시험용 바나나')];
  const host=`<html><body style="margin:0" data-member="in" data-record-source="server"><script>window.LT41=${JSON.stringify({source:'server',writable:true,owned:true,momentId:'t1m1',prefs:{},tree:trees[0],trees})};</script><iframe src="/v41/views/track32-bookshelf.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;
  const server=await serve({'/shelf-search-host.html':host}),base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true});
  try{
    for(const theme of ['garden','night']){
      const ctx=await browser.newContext({viewport:{width:390,height:844}});
      try{
        await ctx.addInitScript(t=>localStorage.setItem('lt41.theme',t),theme);
        await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==base)return r.abort();if(u.pathname.startsWith('/api/'))return r.fulfill({status:200,json:{ok:true,items:[]}});return r.continue();});
        const page=await ctx.newPage();
        await page.goto(base+'/shelf-search-host.html',{waitUntil:'load',timeout:20000});
        const frame=page.frames().find(f=>f!==page.mainFrame());
        await frame.waitForSelector('.lt-screen-toolbar',{timeout:12000});
        await frame.waitForFunction(()=>document.querySelectorAll('.book-card').length===2);
        const field=frame.locator('#searchInput');
        const measure=()=>field.evaluate(el=>{
          const s=getComputedStyle(el),placeholder=getComputedStyle(el,'::placeholder'),r=el.getBoundingClientRect();
          const canvas=document.createElement('canvas'),c=canvas.getContext('2d');
          c.font=[placeholder.fontWeight,placeholder.fontSize,placeholder.fontFamily].join(' ');
          const available=el.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight);
          const bar=document.querySelector('.lt-screen-toolbar').getBoundingClientRect();
          return {width:r.width,available,needed:Math.ceil(c.measureText(el.placeholder).width),below:r.top>=bar.bottom-1,inToolbar:!!el.closest('.lt-screen-toolbar'),overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),inside:r.left>=0&&r.right<=innerWidth+1,visible:r.width>0&&r.height>0,viewVisible:!!document.getElementById('shelf-view-inline').getClientRects().length,newVisible:!!document.getElementById('shelfNewTree').getClientRects().length};
        });
        let m=await measure();console.log(theme,390,JSON.stringify(m));
        assert.ok(m.available>=m.needed,theme+' 안내 문구 전체 폭');
        assert.ok(m.below&&!m.inToolbar&&m.inside&&m.visible,theme+' 별도 검색 줄');
        assert.equal(m.overflow,0,theme+' 가로 넘침 0');
        assert.ok(m.viewVisible&&m.newVisible,theme+' 기존 단추 유지');
        await field.fill('바나나');
        await frame.waitForFunction(()=>document.querySelectorAll('.book-card').length===1);
        assert.match(await frame.locator('.book-card').innerText(),/바나나/);
        await field.fill('');
        await frame.waitForFunction(()=>document.querySelectorAll('.book-card').length===2);
        await page.setViewportSize({width:1440,height:900});
        await frame.waitForFunction(()=>!!document.getElementById('searchInput').closest('.lt-toolbar-tools'));
        m=await measure();assert.ok(m.inToolbar&&m.available>=m.needed&&m.inside,theme+' 넓은 화면 기존 줄 유지');
        assert.equal(m.overflow,0);
        await page.setViewportSize({width:390,height:844});
        await frame.waitForFunction(()=>!!document.getElementById('searchInput').closest('.shelf-controls'));
        m=await measure();assert.ok(m.below&&m.available>=m.needed&&m.inside,theme+' 다시 좁은 화면');
      }finally{await ctx.close();}
    }
  }finally{await browser.close();await new Promise(r=>server.close(r));}
});


test('#1249 지도 390: 하단 한 줄, 전체 맞춤 유지, 묶음 선택 가능', { skip, timeout: 120000 }, async () => {
  const tree={id:'t1',title:'시험용',moments:[1,2,3,4,5,6].map(i=>({id:'m'+i,title:'시험 순간 '+i,type:'memo',date:'2026-0'+i+'-01',note:'가짜 기록',first:i===1})),edges:[]};
  const host=`<html><body style="margin:0" data-member="in" data-record-source="server"><script>window.LT41=${JSON.stringify({source:'server',writable:true,owned:true,momentId:'m1',prefs:{},tree,trees:[tree]})};</script><iframe src="/v41/views/track56-network.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;
  const server=await serve({'/map-ribbon-host.html':host}),base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true});
  try{
    for(const theme of ['garden','night']) for(const width of [360,390]){
      const ctx=await browser.newContext({viewport:{width,height:844}});
      try{
        await ctx.addInitScript(t=>localStorage.setItem('lt41.theme',t),theme);
        await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==base)return r.abort();if(u.pathname.startsWith('/api/'))return r.fulfill({status:200,json:{ok:true,items:[]}});return r.continue();});
        const page=await ctx.newPage();
        await page.goto(base+'/map-ribbon-host.html',{waitUntil:'load',timeout:20000});
        const frame=page.frames().find(f=>f!==page.mainFrame());
        await frame.waitForFunction(()=>window.__lt?.dots?.()?.length>0);
        const read=()=>frame.evaluate(()=>{
          const r=document.getElementById('mobileRibbon'),rr=r.getBoundingClientRect();
          const buttons=[...r.querySelectorAll(':scope>button')].filter(b=>b.getClientRects().length).map(b=>{
            const a=b.getBoundingClientRect(),s=getComputedStyle(b);
            const range=document.createRange();range.selectNodeContents(b);
            return {label:b.textContent,top:a.top,height:a.height,width:a.width,inside:a.left>=rr.left&&a.right<=rr.right&&a.bottom<=rr.bottom,clipped:range.getBoundingClientRect().width>b.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)+1};
          });
          return {height:rr.height,overflow:r.scrollWidth-r.clientWidth,buttons,rows:new Set(buttons.map(b=>b.top)).size,docOverflow:document.documentElement.scrollWidth-innerWidth};
        });
        const m=await read(),label=theme+'/'+width;
        console.log(label,JSON.stringify(m));
        assert.equal(m.rows,1,label+' 한 줄');
        assert.equal(m.overflow,0,label+' 줄 가로 넘침 0');
        assert.equal(m.docOverflow,0,label+' 화면 가로 넘침 0');
        assert.ok(m.buttons.some(b=>b.label==='전체 맞춤'),label+' 전체 맞춤 노출');
        assert.ok(m.buttons.every(b=>b.inside&&!b.clipped&&b.height>=44&&b.width>=44),label+' 단추 잘림 0 및 44px');
        const more=frame.locator('.ribbon-more');
        if(await more.isVisible()){
          await more.click();
          const chip=frame.locator('.ribbon-groups button[data-i]').first();
          await chip.waitFor({state:'visible'});
          await chip.click();
          assert.equal(await more.getAttribute('aria-expanded'),'false');
          assert.equal(await frame.locator('.ribbon-groups').isVisible(),false);
        }
        await frame.locator('#mobileRibbon button').filter({hasText:'전체 맞춤'}).click();
        assert.equal((await read()).rows,1);
      }finally{await ctx.close();}
    }
  }finally{await browser.close();await new Promise(r=>server.close(r));}
});
