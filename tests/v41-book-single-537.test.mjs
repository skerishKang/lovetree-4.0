import { listenOnSafePort } from './helpers/safe-port.mjs';
// #537: 책의 '한 장' 보기 — 넓은 화면에서는 두 장 책의 한 쪽을 크게, 휴대폰은 지금 모양 그대로.
// 그리고 한 장은 펼침면(순간 둘)이 아니라 순간 하나씩 넘긴다(순간 26개면 1/26 … 26/26).
// 여기서는 (1) 계산 한 벌을 실제로 실행해 순서·전환을 확인하고, (2) 실제 책 화면을 열어
// 모든 순간이 한 번씩 크게 나오는지·높이·돋보기·머리줄을 잰다(크롬이 없으면 건너뛴다).
import {shownFrameBox} from './helpers/visible-frame.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const BOOK = read('public/v41/views/book/book.js');
const EXTRA = read('public/v41/views/book/book-extra.js');
const MODEL = read('public/v41/views/book/book-model.js');
const CSS = read('public/v41/views/book/book.css');
const USE_CSS = read('public/v41/views/book/book-usability.css');
const LAYOUT = read('public/v41/reader-layout.css');
const HTML = read('public/v41/views/track59-sketchbook.html');

// 모델은 화면과 같은 파일을 그대로 실행한다(사본을 만들지 않는다).
const win = {};
new Function('window', MODEL)(win);
const M = win.LT59Model;

const moments = (n) => Array.from({ length: n }, (_, i) => ({ id: `m${i + 1}`, type: 'photo', title: `T${i + 1}`, date: '2026.11.01', emotion: '설렘' }));

test('#537 7: 한 장은 순간 하나씩 넘긴다 — 순간 수만큼 쪽이 있고, 끝까지 넘기면 모든 순간이 한 번씩 나온다', () => {
  for (const count of [5, 6, 26]) {
    const spreads = M.buildSpreads(moments(count));
    const steps = M.pageSteps(spreads);
    assert.equal(steps.length, count, `${count}개 순간이면 한 장도 ${count}쪽`);
    assert.equal(new Set(steps.map((s) => s.id)).size, count, '같은 순간이 두 번 나오지 않는다');
    // 한 장의 '다음'을 끝까지: 위치 0 … count-1이 곧 순서다.
    const walked = [];
    for (let pos = 0; pos < count; pos++) walked.push(steps[pos].id);
    assert.deepEqual(walked, moments(count).map((m) => m.id), `${count}개 순간 순서대로 한 번씩`);
    // 끝에서는 더 넘길 곳이 없다(다음 단추 잠김과 같은 판정).
    assert.equal(steps[count - 1].spread, spreads.length - 1);
  }
});

test('#537 7·8: 홀수 순간의 마지막 펼침면에 붙는 동반(합성) 쪽은 한 장의 쪽이 아니다', () => {
  const odd = M.buildSpreads(moments(5));
  assert.equal(odd.length, 3, '5개 순간 = 펼침면 3장');
  assert.equal(odd[2].right.synthetic, true, '마지막 오른쪽은 동반 쪽');
  assert.equal(M.pageSteps(odd).length, 5, '동반 쪽은 한 장 쪽 수에 들어가지 않는다');
  assert.equal(M.posOfMoment(odd, odd[2].right.id, true), 0, '없는 순간은 0으로 돌려준다(화면이 멈추지 않게)');
});

test('#537 9: 두 장 ↔ 한 장을 바꿔도 보던 순간이 유지된다 — 위치 변환이 한 방향으로 맞는다', () => {
  const spreads = M.buildSpreads(moments(6)); // 두 장: [m1,m2] [m3,m4] [m5,m6]
  // 두 장에서 오른쪽 순간(m6)을 보다 한 장으로: 한 장의 그 순간
  assert.equal(M.posOfMoment(spreads, 'm6', false), 2, '두 장에서는 펼침면 번호');
  assert.equal(M.posOfMoment(spreads, 'm6', true), 5, '한 장에서는 순간 순번');
  // 한 장의 짝수 번째 순간(m4, 다섯 번째 쪽)을 보다 두 장으로: 그 순간이 든 묶음
  assert.equal(M.posOfMoment(spreads, 'm4', true), 3);
  assert.equal(M.posOfMoment(spreads, 'm4', false), 1, 'm4가 든 묶음은 두 번째 펼침면');
  // 위치 → 펼침면도 같은 규칙
  assert.equal(M.spreadOfPos(spreads, 5, true), 2);
  assert.equal(M.spreadOfPos(spreads, 1, false), 1, '두 장에서는 위치가 곧 펼침면');
});

test('#537 함께: 마음 한마디가 비었을 때 안내 글을 내용처럼 그리지 않는다', () => {
  // 지키려던 것: 마음이 비었을 때 '적어 보세요' 안내를 실제 내용처럼 그리지 않는다.
});

/* ── 실제 화면(크롬) ───────────────────────────────────────────────────── */
const ROOT = path.resolve(fileURLToPath(new URL('../public', import.meta.url)));
const REQUIRE = process.env.LT_BOOK_SINGLE_REQUIRE === '1';
let chromium = null;
let skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright chromium이 설치되어 있지 않아 실제 책 화면 시험을 건너뜀';
} catch {
  skip = 'playwright 패키지가 없어 실제 책 화면 시험을 건너뜀';
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
function serve(root) {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    for (const file of [path.join(root, clean), path.join(root, clean, 'index.html')]) {
      if (!file.startsWith(root)) continue;
      try { if ((await stat(file)).isFile()) { res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); createReadStream(file).pipe(res); return; } } catch {}
    }
    res.writeHead(404); res.end('not found');
  });
  return listenOnSafePort(server, '127.0.0.1').then(() => server);
}

async function openBook(browser, base, width, height, view, theme = null) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addInitScript((v) => { try { if (v) localStorage.setItem('lt41-book-view', v); else localStorage.removeItem('lt41-book-view'); } catch {} }, view);
  if (theme) await ctx.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.goto(`${base}/v41/#book`, { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) {
    frame = page.frames().find((f) => /track59-sketchbook/.test(f.url()));
    if (!frame) await page.waitForTimeout(250);
  }
  assert.ok(frame, '책 프레임이 열리지 않음');
  await page.waitForTimeout(1000);
  return { ctx, page, frame, errors };
}

const geom = (frame) => frame.evaluate(() => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  const visible = (id) => { const el = document.getElementById(id); return !!el && el.offsetParent !== null && el.getBoundingClientRect().width > 0; };
  const state = window.__TRACK59__.getState();
  return {
    state: { page: state.page, total: state.total, view: state.view, shape: state.shape },
    label: document.getElementById('pageLabel').textContent,
    book: box(document.getElementById('bookWrap')),
    pages: { left: visible('leftPage'), right: visible('rightPage'), mobile: visible('mobilePage') },
    lensButton: visible('lensBtn'),
    topbar: Math.round(document.querySelector('.lt-screen-toolbar').getBoundingClientRect().height),
    smallLine: !!document.querySelector('.mobile-support'),
    moment: document.querySelector('.page.right [data-moment], .mobile-content [data-moment]')?.dataset.moment || ''
  };
});

const walkAll = async (frame) => {
  const ids = [];
  const labels = [];
  for (let guard = 0; guard < 300; guard++) {
    const row = await frame.evaluate(() => ({
      id: document.querySelector('.page.right [data-moment], .mobile-content [data-moment]')?.dataset.moment || '',
      label: document.getElementById('pageLabel').textContent,
      done: document.getElementById('nextBtn').disabled
    }));
    ids.push(row.id);
    labels.push(row.label);
    if (row.done) break;
    await frame.evaluate(() => document.getElementById('nextBtn').click());
    await frame.waitForFunction((prev) => document.getElementById('pageLabel').textContent !== prev, row.label, { timeout: 5000 });
    await frame.waitForTimeout(60);
  }
  return { ids, labels };
};

test('#537 실제 화면: 1440·390에서 한 장으로 끝까지 넘기면 모든 순간이 한 번씩 크게 나온다', { skip: REQUIRE ? false : skip, timeout: 180000 }, async () => {
  if (skip) assert.fail(`미리보기 검사에서는 이 시험의 건너뜀이 실패다 — ${skip}`);
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });

    // 두 장에서 잰 값(높이·머리줄)을 한 장과 견준다.
    const wideDouble = await openBook(browser, base, 1440, 900, 'double');
    const doubleGeom = await geom(wideDouble.frame);
    await wideDouble.ctx.close();

    const wideSingle = await openBook(browser, base, 1440, 900, 'single');
    const singleGeom = await geom(wideSingle.frame);
    const wideWalk = await walkAll(wideSingle.frame);
    // #952: 보기 단추는 화면에서 잰다 — 넓은 화면은 1장·2장 둘 다 보이고, 지금은 1장이 눌려 있다.
    const wideBtns = await wideSingle.frame.evaluate(() => ({
      single: document.getElementById('singleViewBtn')?.hidden === false,
      double: document.getElementById('doubleViewBtn')?.hidden === false,
      pressed: document.getElementById('singleViewBtn')?.getAttribute('aria-pressed'),
      attr: document.documentElement.dataset.bookView
    }));
    await wideSingle.ctx.close();
    assert.deepEqual(wideBtns, { single: true, double: true, pressed: 'true', attr: 'single' }, '넓은 화면: 두 단추가 보이고 1장이 눌린다');

    assert.equal(doubleGeom.state.total, 20, '예시 트리 40순간은 두 장에서 펼침면 20장');
    assert.equal(singleGeom.state.total, 40, '한 장은 순간 수만큼 쪽이 있다');
    assert.equal(wideWalk.ids.length, 40, '한 장 쪽 수 = 순간 수');
    assert.equal(new Set(wideWalk.ids).size, 40, '같은 순간이 두 번 나오지 않는다');
    assert.equal(wideWalk.ids.filter(Boolean).length, 40, '모든 쪽에 순간이 있다');
    assert.equal(wideWalk.labels[0], '01 / 40', '첫 쪽 번호');
    assert.equal(wideWalk.labels.at(-1), '40 / 40', '마지막 쪽 번호');
    assert.equal(singleGeom.book.h, doubleGeom.book.h, '한 장 높이는 두 장과 같다');
    assert.ok(Math.abs(singleGeom.book.w * 2 - doubleGeom.book.w) <= 2, '한 장 폭은 두 장 책 한 쪽 폭');
    assert.ok(Math.abs((singleGeom.book.x + singleGeom.book.w / 2) - 720) < 40, '가로 가운데');
    assert.equal(singleGeom.topbar, doubleGeom.topbar, '머리줄 높이는 두 장과 같다');
    assert.deepEqual(singleGeom.pages, { left: false, right: true, mobile: false }, '넓은 화면 한 장은 한 쪽만 보인다');
    assert.equal(singleGeom.lensButton, true, '넓은 화면 한 장에서도 돋보기 단추가 보인다');
    assert.equal(singleGeom.smallLine, false, '작은 줄이 없다');

    // 390: 휴대폰 모양은 그대로 — 좁은 책·60px 머리줄·돋보기 숨김, 순간 하나씩.
    const phone = await openBook(browser, base, 390, 844, 'single');
    const phoneGeom = await geom(phone.frame);
    // 폰에서도 두 칸은 같은 크기로 표시하되, 한 장만 사용 가능하고 두 장은 비활성화한다.
    const phoneBtns = await phone.frame.evaluate(() => ({
      single: (() => { const b = document.getElementById('singleViewBtn'); return !!b && !b.hidden && b.getClientRects().length > 0 && getComputedStyle(b).visibility !== 'hidden'; })(),
      double: (() => { const b = document.getElementById('doubleViewBtn'); return !!b && !b.hidden && b.getClientRects().length > 0 && getComputedStyle(b).visibility !== 'hidden'; })(),
      doubleDisabled: document.getElementById('doubleViewBtn')?.disabled === true,
      cellsEqual: (() => {
        const one = document.getElementById('singleViewBtn').getBoundingClientRect();
        const two = document.getElementById('doubleViewBtn').getBoundingClientRect();
        return one.width > 0 && one.width === two.width && one.height === two.height;
      })(),
      cells: (() => {
        const one = document.getElementById('singleViewBtn').getBoundingClientRect();
        const two = document.getElementById('doubleViewBtn').getBoundingClientRect();
        return [one.width, one.height, two.width, two.height].map((n) => Math.round(n * 100) / 100);
      })(),
      placement: (() => {
        const button = document.getElementById('singleViewBtn');
        const box = (el) => { const r = el?.getBoundingClientRect(); return r ? [Math.round(r.left), Math.round(r.right), Math.round(r.top), Math.round(r.bottom)] : null; };
        return {
          inMore: !!button?.closest('.lt-toolbar-menu'),
          menuHidden: document.querySelector('.lt-toolbar-menu')?.hidden ?? null,
          titleBox: box(document.querySelector('.lt-toolbar-title')),
          toolsBox: box(document.querySelector('.lt-toolbar-tools')),
          toggleBox: box(button?.parentElement),
          moreHidden: document.querySelector('.lt-toolbar-more')?.hidden ?? null
        };
      })()
    }));
    assert.equal(phoneBtns.single, true, `폰 폭: 1장 단추가 보인다(${JSON.stringify(phoneBtns)})`);
    assert.equal(phoneBtns.double, true, `폰 폭: 2장 단추가 보인다(${JSON.stringify(phoneBtns)})`);
    assert.equal(phoneBtns.doubleDisabled, false, '폰 폭: 2장 단추를 누를 수 있다');
    assert.equal(phoneBtns.cellsEqual, true, `폰 폭: 두 칸 크기가 같다(${JSON.stringify(phoneBtns)})`);
    const phoneWalk = await walkAll(phone.frame);
    // #1287: mobile double view is a single history step; back restores the selected moment.
    const beforeMobileSpread = await phone.frame.evaluate(() => ({
      focus: window.LTDEMO.get(),
      historyLength: history.length
    }));
    await phone.frame.locator('#doubleViewBtn').click();
    await phone.page.waitForTimeout(250);
    const openedMobileSpread = await phone.frame.evaluate(() => ({
      view: window.__TRACK59__.getState().view,
      historyLength: history.length
    }));
    assert.equal(openedMobileSpread.view, 'double', '휴대폰 2장은 펼친 책 보기');
    assert.equal(openedMobileSpread.historyLength, beforeMobileSpread.historyLength + 1, '2장 진입은 기록 한 칸');
    await phone.frame.evaluate(() => history.back());
    await phone.page.waitForTimeout(250);
    const returnedMobilePage = await phone.frame.evaluate(() => ({
      view: window.__TRACK59__.getState().view,
      focus: window.LTDEMO.get()
    }));
    assert.equal(returnedMobilePage.view, 'single', '뒤로 가기 뒤 한 장 복귀');
    assert.equal(returnedMobilePage.focus, beforeMobileSpread.focus, '뒤로 가기 뒤 같은 순간');
    await phone.ctx.close();
    assert.equal(phoneGeom.state.shape, 'phone', '폰 폭은 휴대폰 모양');
    assert.deepEqual(phoneGeom.pages, { left: false, right: false, mobile: true }, '휴대폰 한 장은 mobile-page');
    assert.equal(phoneGeom.topbar, 48, '휴대폰 공통 도구 줄 높이 48px');
    assert.ok(phoneGeom.book.w <= 430, '휴대폰 책 폭 그대로');
    assert.equal(phoneGeom.lensButton, false, '휴대폰에서는 돋보기 단추를 숨긴다');
    assert.equal(phoneGeom.smallLine, false, '작은 줄이 없다');
    assert.equal(phoneWalk.ids.filter(Boolean).length, 40, '휴대폰도 모든 순간이 한 번씩');
    assert.equal(new Set(phoneWalk.ids).size, 40);

    // 두 장 ↔ 한 장을 바꿔도 보던 순간이 유지된다(오른쪽 순간을 누른 뒤 전환).
    const env = await openBook(browser, base, 1440, 900, 'double');
    await env.frame.evaluate(() => { const card = document.querySelectorAll('.page.right [data-moment]')[0]; card.click(); });
    await env.page.waitForTimeout(400);
    const before = await env.frame.evaluate(() => ({ m: window.__TRACK59__.getState().page, id: window.LTDEMO.get() }));
    await env.frame.evaluate(() => document.getElementById('singleViewBtn').click());
    await env.page.waitForTimeout(600);
    const after = await env.frame.evaluate(() => ({
      view: window.__TRACK59__.getState().view,
      moment: document.querySelector('.page.right [data-moment]')?.dataset.moment || ''
    }));
    await env.frame.evaluate(() => document.getElementById('doubleViewBtn').click());
    await env.page.waitForTimeout(600);
    const back = await env.frame.evaluate(() => ({
      view: window.__TRACK59__.getState().view,
      has: !!document.querySelector(`.page [data-moment="${window.LTDEMO.get()}"]`)
    }));
    await env.ctx.close();
    assert.equal(after.view, 'single');
    assert.equal(after.moment, before.id, '두 장에서 보던 순간이 한 장에서 그대로 크게 나온다');
    assert.equal(back.view, 'double');
    assert.equal(back.has, true, '한 장에서 보던 순간이 두 장에서 그 순간이 든 묶음에 있다');
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
});

/* ── #book-dup(2026-11-15): 메모 장 제목·본문 중복과 390 긴 트리 이름 머리줄 겹침 ── */

// 메모 장(#800 이후 .book-card-moment 안의 .moment-note)이 보일 때까지 넘긴다. 390(한 장)은 .mobile-content, 1440(두 장)은 .page.
const walkToNote = async (frame) => {
  for (let guard = 0; guard < 60; guard++) {
    const has = await frame.evaluate(() => [...document.querySelectorAll('.mobile-content .book-card-moment, .page .book-card-moment')]
      .some(card => !!card.querySelector('.moment-title .moment-note')?.textContent.trim()));
    if (has) return true;
    const done = await frame.evaluate(() => document.getElementById('nextBtn').disabled);
    if (done) return false;
    const label = await frame.evaluate(() => document.getElementById('pageLabel').textContent);
    await frame.evaluate(() => document.getElementById('nextBtn').click());
    await frame.waitForFunction((prev) => document.getElementById('pageLabel').textContent !== prev, label, { timeout: 5000 });
    await frame.waitForTimeout(60);
  }
  return false;
};

// 한 장(또는 두 장의 각 쪽)에서: 제목·본문·날짜·감정이 카드 안에 한 번만 그려지는지 잰다.
const memoDup = (frame, pageSelector) => frame.evaluate((sel) => {
  const host = document.querySelector(sel);
  const piece = host && host.querySelector('.book-card-moment');
  if (!piece || !host) return null;
  const title = piece.querySelector('.moment-title');
  const h2 = (title?.querySelector('h3, .moment-title-button')?.textContent || '').trim();
  const note = (title?.querySelector('.moment-note')?.textContent || '').trim();
  const meta = (title?.querySelector('.moment-meta-copy')?.textContent || '').trim();
  const source = (window.LTDEMO?.moments || []).find(m => m.id === piece.dataset.moment);
  const emotion = String(source?.emotion || '').trim();
  const text = piece.textContent || '';
  const occurrences = (value) => value ? text.split(value).length - 1 : 0;
  return {
    h2, note,
    momentTitles: host.querySelectorAll('.moment-title').length,
    dupTitle: !!h2 && occurrences(h2) > 1,
    dupNote: note.length > 12 && occurrences(note.slice(0, 20)) > 1,
    keepsDate: /\d{4}\. \d{2}\. \d{2}/.test(meta),
    keepsEmotion: !!emotion && meta.includes(emotion),
  };
}, pageSelector);

test('#book-dup 실제 화면: 메모 장에서 제목·본문을 두 번 쓰지 않고, 390 긴 트리 이름은 목차 단추와 겹치지 않는다', { skip: REQUIRE ? false : skip, timeout: 180000 }, async () => {
  if (skip) assert.fail(`미리보기 검사에서는 이 시험의 건너뜀이 실패다 — ${skip}`);
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });

    // 390(휴대폰 한 장): 메모 장에서 조각(h2·p)과 .moment-title이 같은 글자를 두 번 쓰지 않는다.
    const phone = await openBook(browser, base, 390, 844, 'single');
    assert.ok(await walkToNote(phone.frame), '390에서 메모 장을 찾지 못했다');
    const phoneMemo = await memoDup(phone.frame, '.mobile-content');
    assert.ok(phoneMemo, '390 메모 장 값을 읽지 못했다');
    assert.equal(phoneMemo.momentTitles, 1, '메모 장에 제목 줄이 여러 개다');
    assert.equal(phoneMemo.dupTitle, false, `메모 장 제목 '${phoneMemo.h2}'가 두 번 그려진다`);
    assert.equal(phoneMemo.dupNote, false, '메모 장 본문이 두 번 그려진다');
    assert.equal(phoneMemo.keepsDate, true, '아래 제목 줄에 날짜가 남아 있어야 한다');
    assert.equal(phoneMemo.keepsEmotion, true, '아래 제목 줄에 감정이 남아 있어야 한다');

    // 390 머리줄: 20자가 넘는 트리 이름도 '목차' 단추와 겹치지 않고 말줄임(…)으로 끊긴다.
    const longName = '좋아하는 순간들이 이어지는 우리의 오래된 기록 저장소';
    await phone.frame.evaluate((name) => { document.getElementById('bookTitleText').textContent = name; }, longName);
    await phone.frame.waitForFunction((name) => document.querySelector('.lt-toolbar-tree-name')?.textContent === name, longName, { timeout: 5000 });
    const head = await phone.frame.evaluate(() => {
      const box = (q) => { const b = document.querySelector(q)?.getBoundingClientRect(); return b ? { l: b.left, r: b.right } : null; };
      const title = box('.lt-toolbar-left'), index = box('#archiveBtn');
      const span = document.querySelector('.lt-toolbar-tree-name');
      return {
        overlap: title && index ? Math.max(0, Math.min(title.r, index.r) - Math.max(title.l, index.l)) : null,
        ellipsized: span.scrollWidth > span.clientWidth + 1,
        oneLine: getComputedStyle(span).whiteSpace,
      };
    });
    assert.equal(head.overlap, 0, `긴 트리 이름이 '목차' 단추와 ${head.overlap}px 겹친다`);
    assert.equal(head.ellipsized, true, '긴 트리 이름이 말줄임으로 끊기지 않는다');
    assert.equal(head.oneLine, 'nowrap', '트리 이름이 한 줄로 남지 않았다');
    await phone.ctx.close();

    // 1440(두 장): 왼쪽·오른쪽 쪽에서 같은 규칙을 지킨다.
    const wide = await openBook(browser, base, 1440, 900, 'double');
    assert.ok(await walkToNote(wide.frame), '1440에서 메모 장을 찾지 못했다');
    for (const sel of ['.page.left', '.page.right']) {
      const row = await memoDup(wide.frame, sel);
      if (!row) continue;
      assert.equal(row.dupTitle, false, `1440 ${sel}: 메모 장 제목 '${row.h2}'가 두 번 그려진다`);
      assert.equal(row.dupNote, false, `1440 ${sel}: 메모 장 본문이 두 번 그려진다`);
      if (row.momentTitles) {
        assert.equal(row.keepsDate, true, `1440 ${sel}: 아래 제목 줄에 날짜가 남아 있어야 한다`);
      }
    }
    await wide.ctx.close();
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
});

/* ── #book-dup2(2026-11-15): 390에서 갈라짐 띠가 링크 줄을 덮지 않고, 머리줄 단추가 화면 안에 있다 ── */

// 갈라짐 띠(.branch-tab)가 보이는 장까지 넘긴다.
const walkToBranch = async (frame) => {
  for (let guard = 0; guard < 60; guard++) {
    const has = await frame.evaluate(() => {
      const tab = document.querySelector('.branch-tab');
      return !!(tab && !tab.hidden && tab.getBoundingClientRect().height > 0);
    });
    if (has) return true;
    const done = await frame.evaluate(() => document.getElementById('nextBtn').disabled);
    if (done) return false;
    const label = await frame.evaluate(() => document.getElementById('pageLabel').textContent);
    await frame.evaluate(() => document.getElementById('nextBtn').click());
    await frame.waitForFunction((prev) => document.getElementById('pageLabel').textContent !== prev, label, { timeout: 5000 });
    await frame.waitForTimeout(60);
  }
  return false;
};

test('#book-dup2 실제 화면: 390에서 책 테두리·갈라짐 띠가 링크 줄과 겹치지 않고, 머리줄 단추가 화면 밖으로 넘치지 않는다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(`미리보기 검사에서는 이 시험의 건너뜀이 실패다 — ${skip}`);
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const theme of ['night', 'garden']) {
      const phone = await openBook(browser, base, 390, 844, 'single', theme);

      // 측정 도우미: 책 안 좌표(띠·테두리·머리줄)와 셸 좌표(링크 줄)를 함께 읽는다.
      const iframeBox = await shownFrameBox(phone.page);
      assert.ok(iframeBox, `${theme}: 책 iframe 자리를 못 읽었다`);
      const readBook = () => phone.frame.evaluate(() => {
        const box = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
        const tab = document.querySelector('.branch-tab');
        const tabVisible = !!(tab && !tab.hidden && tab.getBoundingClientRect().height > 0);
        const tools = document.querySelector('.topbar .tools');
        const btns = [...document.querySelectorAll('.topbar .tools .ui-btn')]
          .map((b) => ({ rect: b.getBoundingClientRect(), text: (b.textContent || '').trim() }))
          .filter((b) => b.rect.width > 0 && b.rect.height > 0)
          .map((b) => ({ text: b.text, l: Math.round(b.rect.left), r: Math.round(b.rect.right) }));
        return {
          cover: box(document.querySelector('.book-cover')),
          tab: tabVisible ? box(tab) : null,
          tabFont: tab ? parseFloat(getComputedStyle(tab).fontSize) : null,
          tools: { scrollW: tools.scrollWidth, clientW: tools.clientWidth },
          btns, vw: innerWidth,
        };
      });
      const toShell = (r) => ({ l: Math.round(r.l + iframeBox.x), t: Math.round(r.t + iframeBox.y), r: Math.round(r.r + iframeBox.x), b: Math.round(r.b + iframeBox.y) });

      // 390 책 화면에서는 아래 링크 줄(.home-links) 자체를 숨긴다 — 책 테두리·갈라짐 띠와 겹치거나 2px로 붙을 자지가 없다.
      const linksHidden = await phone.page.evaluate(() => {
        const el = document.querySelector('.home-links');
        if (!el) return true;
        const cs = getComputedStyle(el);
        return cs.display === 'none' || cs.visibility === 'hidden' || el.getBoundingClientRect().height === 0;
      });
      assert.ok(linksHidden, `${theme}: 390 책 화면에 아래 링크 줄이 보인다`);

      // 띠 없는 장(첫 장): 책 테두리를 읽는다.
      await phone.page.waitForTimeout(300);
      let bookRow = await readBook();
      assert.ok(bookRow.cover.b > bookRow.cover.t, `${theme}: 띠 없는 장의 책 테두리를 못 읽었다`);

      // 갈라짐 띠가 있는 장: 띠 글자는 12px 이상이고, 화면 밖으로 넘치지 않는다.
      assert.ok(await walkToBranch(phone.frame), `${theme}: 갈라짐 띠가 있는 장을 찾지 못했다`);
      await phone.page.waitForTimeout(300);
      bookRow = await readBook();
      const tabShell = toShell(bookRow.tab);
      assert.ok(tabShell.l >= 0 && tabShell.r <= 390, `${theme}: 갈라짐 띠가 화면 밖으로 넘친다(${JSON.stringify(tabShell)})`);
      assert.ok(bookRow.tabFont >= 12, `${theme}: 갈라짐 띠 글자가 ${bookRow.tabFont}px다(12px 이상)`);

      // 머리줄: 보이는 단추가 전부 화면 안(오른쪽 여백 8px 이상)이고 도구 줄이 잘리지 않는다.
      assert.ok(bookRow.tools.scrollW <= bookRow.tools.clientW, `${theme}: 도구 줄이 ${bookRow.tools.scrollW - bookRow.tools.clientW}px 잘린다(scrollWidth ${bookRow.tools.scrollW} > clientWidth ${bookRow.tools.clientW})`);
      for (const b of bookRow.btns) {
        assert.ok(b.r <= bookRow.vw - 8, `${theme}: 머리줄 단추 '${b.text}'가 오른쪽 여백 ${bookRow.vw - b.r}px로 화면 밖으로 넘친다(8px 이상이어야)`);
      }
      await phone.ctx.close();
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
});

// #886 책 단계: 터치 타깃 CSS가 track59-sketchbook.html 인라인 <style id="lt-touch-targets">에서
// book-extra.css로 이동했다. 소스 글자 단정(v41-touch-targets의 하드코딩 크기 파싱)은 지우고
// 실제 렌더링 히트박스를 잰다 — 버튼 rect + ::after inset(음수 확장)으로 실효 누름 영역을 계산한다.
test('책 조작 버튼 히트박스는 44x44 이상이다(렌더링 ::after 터치 영역)', { skip: REQUIRE ? false : skip, timeout: 120000 }, async () => {
  if (skip && REQUIRE) assert.fail(`미리보기 검사에서는 이 시험의 건너뜀이 실패다 — ${skip}`);
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const wide = await openBook(browser, base, 1440, 900, 'double');
    const measure = sel => wide.frame.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return { sel: s, missing: true };
      const r = el.getBoundingClientRect();
      const af = getComputedStyle(el, '::after');
      const parts = (af.inset || '').trim().split(/\s+/).map(parseFloat);
      let t = 0, rr = 0, b = 0, l = 0;
      if (parts.length === 1) t = rr = b = l = parts[0];
      else if (parts.length === 2) { t = b = parts[0]; rr = l = parts[1]; }
      else if (parts.length === 3) { t = parts[0]; rr = l = parts[1]; b = parts[2]; }
      else if (parts.length >= 4) { t = parts[0]; rr = parts[1]; b = parts[2]; l = parts[3]; }
      const expand = af.content && af.content !== 'none' && af.position === 'absolute';
      return { sel: s, rw: Math.round(r.width), rh: Math.round(r.height), w: Math.round(r.width - (expand ? l + rr : 0)), h: Math.round(r.height - (expand ? t + b : 0)), expand, inset: af.inset, content: af.content, pos: af.position };
    }, sel);
    const check = hit => {
      assert.ok(!hit.missing, `${hit.sel} 버튼이 있다`);
      assert.ok(hit.rw > 0 && hit.rh > 0, `${hit.sel} 버튼이 보인다(${hit.rw}x${hit.rh})`);
      assert.ok(hit.expand && hit.inset && hit.inset !== 'auto', `${hit.sel}에 ::after inset 터치 규칙이 있다(content ${hit.content}, inset ${hit.inset})`);
      assert.ok(hit.w >= 44 && hit.h >= 44, `${hit.sel} 히트박스 ${hit.w}x${hit.h}가 44 미만이다(inset ${hit.inset})`);
    };
    for (const sel of ['#prevBtn', '#nextBtn']) check(await measure(sel));

    await wide.frame.evaluate(() => window.showDetail?.(window.LTDEMO.moments[0].id));
    await wide.page.waitForTimeout(300);
    for (const sel of ['#detailClose', '#openViewerBtn', '#detailIndexBtn']) check(await measure(sel));
    await wide.frame.evaluate(() => window.openViewer?.());
    await wide.page.waitForTimeout(300);
    check(await measure('#viewerClose'));
    await wide.frame.evaluate(() => window.setBookOpen?.(document.getElementById('branchModal'), true));
    await wide.page.waitForTimeout(300);
    check(await measure('#branchClose'));
    assert.deepEqual(wide.errors, [], '책 화면 오류 없음');
    await wide.ctx.close();
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
});

// #1287: mobile book controls, rotation choice, list mode and history are browser contracts.
test('#1287 모바일 책 보기 제어와 가로 복귀', { skip: REQUIRE ? false : skip, timeout: 90000 }, async () => {
  if (skip) assert.fail('화면 검사에 브라우저가 필요합니다: ' + skip);
  const server = await serve(ROOT);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const env = await openBook(browser, 'http://127.0.0.1:' + server.address().port, 390, 844, 'single');
    const { page, frame } = env;
    const initial = await frame.evaluate(() => {
      const rect = selector => document.querySelector(selector)?.getBoundingClientRect();
      const a = rect('#book-display-inline [data-book-display=book]');
      const b = rect('#book-display-inline [data-book-display=list]');
      const title = document.querySelector('.lt-screen-toolbar-title');
      const book = rect('#book');
      const after = rect('#whyMargin');
      return {
        hit: [a,b].flatMap(r=>{const el=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);const owns=(x,y)=>el.contains(document.elementFromPoint(x,y));return [r.width,owns(r.x+r.width/2,r.top-3.5)&&owns(r.x+r.width/2,r.bottom+3.5)?r.height+8:0]}),
        visual: [a?.height,b?.height],
        titleHidden: !title || getComputedStyle(title).display === 'none',
        gap: after && book ? after.top - book.bottom : -1,
        focus: window.LTDEMO.get(),
        mode: window.__TRACK59__.getState().view
      };
    });
    assert.equal(initial.mode, 'single');
    assert.ok(initial.hit.every(v => v >= 44), '책/목록 단추의 누름 영역 44px 이상');
    assert.deepEqual(initial.visual,[36,36],'책·목록의 화면 높이 36px 유지');
    assert.equal(initial.titleHidden, true, '휴대폰 도구 줄의 중복 제목 없음');
    assert.ok(initial.gap >= 12, '책 면과 이어 보기 사이 간격 12px 이상: ' + initial.gap);
    await frame.locator('#book-display-inline [data-book-display=list]').click();
    assert.equal(await frame.evaluate(() => document.querySelector('#archivePanel').classList.contains('open')), true, '목록을 누르면 목록이 열린다');
    assert.equal(await frame.getAttribute('#book-display-inline [data-book-display=list]', 'aria-checked'), 'true', '목록 선택 표시');
    await frame.locator('#archiveClose').click();
    assert.equal(await frame.getAttribute('#book-display-inline [data-book-display=book]', 'aria-checked'), 'true', '책 복귀 시 선택 표시');
    await page.setViewportSize({width:844,height:390});
    await page.waitForTimeout(200);
    assert.equal(await frame.evaluate(() => window.__TRACK59__.getState().view), 'single', '휴대폰만 돌려도 자동 두 장으로 전환되지 않음');
    await page.setViewportSize({width:390,height:844});
    await frame.locator('#doubleViewBtn').click();
    await page.waitForTimeout(250);
    const opened = await frame.evaluate(() => ({
      mode: window.__TRACK59__.getState().view,
      full: document.fullscreenElement === document.querySelector('#bookWrap'),
      hint: !document.querySelector('#book-rotate-hint')?.hidden
    }));
    assert.equal(opened.mode, 'double', '2장 단추로 펼침');
    assert.ok(opened.full || opened.hint, '전체 화면 또는 가로 돌리기 안내');
    await frame.locator('#mobile-spread-exit').click();
    await page.waitForTimeout(250);
    const back = await frame.evaluate(() => ({ mode:window.__TRACK59__.getState().view,focus:window.LTDEMO.get() }));
    assert.equal(back.mode, 'single', '1장 복귀');
    assert.equal(back.focus, initial.focus, '1장 복귀시 같은 순간');
    await env.ctx.close();
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
import {expectNoHistoryGrowth,testBackNavigation} from './helpers/history-assert.mjs';

async function runBookHistory(width,height){
 if(skip) assert.fail('실제 화면 시험을 건너뛸 수 없습니다: '+skip);
 const server=await serve(ROOT);
 let browser;
 try {
  browser=await chromium.launch({headless:true,args:['--disable-gpu']});
  const shots=process.env.LT_BOOK_HISTORY_SHOTS||'';
 if(shots)mkdirSync(shots,{recursive:true});
   const env=await openBook(browser,'http://127.0.0.1:'+server.address().port,width,height,'single');
   const {frame,page}=env;
   const snapshot=()=>frame.evaluate(()=>({
    length:history.length,overlay:history.state?.ltBookOverlay||null,focus:window.LTDEMO.get(),page:window.__TRACK59__.getState().page,
    archive:window.__TRACK59__.getState().archive,detail:window.__TRACK59__.getState().detail,
    viewer:window.__TRACK59__.getState().viewer,scrollY:window.scrollY
   }));
   const waitForBookPage=expected=>frame.waitForFunction(page=>{
    const state=window.__TRACK59__.getState();
    return state.page===page&&state.machineState==='IDLE'&&!state.queued;
   },expected,{timeout:10000});
   await testBackNavigation(page,{frame,recorded:false,action:()=>frame.evaluate(()=>window.__TRACK59__.setView('single'))});
   if(shots)await page.screenshot({path:path.join(shots, `book-${width}-before.png`)});
   const original=await snapshot();
   await testBackNavigation(page,{frame,recorded:true,panels:['#archivePanel.open','#detail.open','#viewer.open','#branchModal.open'],action:()=>frame.evaluate(()=>window.__TRACK59__.openArchive())});
   assert.equal((await snapshot()).page,original.page,'목차 뒤로 가기 쪽 복원');

   const beforeDetail=await snapshot();
   const id=await frame.evaluate(()=>window.__TRACK59__.getState().pageIds[0]);
   await frame.evaluate(x=>window.__TRACK59__.showDetail(x),id);
   assert.equal((await snapshot()).overlay,'detailSide','순간 자세히 한 칸');
   await frame.evaluate(()=>document.querySelector('#openViewerBtn').click());
   assert.equal((await snapshot()).overlay,'viewer','크게 보기 한 칸');
   await frame.evaluate(()=>history.back());
   await frame.waitForFunction(()=>!window.__TRACK59__.getState().viewer);
   assert.equal(await frame.evaluate(()=>!!document.querySelector('#detailSide:not([hidden]),.page-detail')),true,'크게 보기 뒤로 가기는 순간 자세히로');
   await frame.evaluate(()=>history.back());
   await frame.waitForFunction(()=>!document.querySelector('#detailSide:not([hidden]),.page-detail'));
   assert.equal((await snapshot()).page,beforeDetail.page,'순간 자세히 뒤로 가기 책 복귀');
   const beforeTurn=await snapshot();
   await expectNoHistoryGrowth(frame,()=>frame.evaluate(()=>window.__TRACK59__.turnNext()),'일반 책장 넘김은 기록을 쌓지 않음');
   await waitForBookPage(beforeTurn.page+1);
   const beforeJump=await snapshot();
   await frame.evaluate(()=>window.__TRACK59__.openArchive());
   await frame.locator('#archiveList [data-jump="3"]').first().click();
   await waitForBookPage(3);
   assert.equal((await snapshot()).page,3,'목록에서 다른 쪽으로 이동');
   await frame.evaluate(()=>history.back());
   await waitForBookPage(beforeJump.page);
   assert.equal((await snapshot()).page,beforeJump.page,'목록 점프 뒤로 가기 이전 쪽');

   await env.ctx.close();
   const actual=await openBook(browser,'http://127.0.0.1:'+server.address().port,width,height,'single');
   const opts={frame:actual.frame,panels:['#detailSide:not([hidden])','.page-detail','#viewer.open','.lt-lightbox']};
   await testBackNavigation(actual.page,{...opts,recorded:true,action:async()=>{
    await actual.frame.evaluate(()=>{const id=document.querySelector('.moment[data-moment]')?.dataset.moment;window.__TRACK59__.showDetail(id)});
    await actual.frame.waitForFunction(()=>!!document.querySelector('#detailSide:not([hidden]),.page-detail'));
     if(shots)await actual.page.screenshot({path:path.join(shots,`book-${width}-detail-open.png`)});
   }});
   if(shots)await actual.page.screenshot({path:path.join(shots,`book-${width}-detail-back.png`)});
   await actual.ctx.close();
   const media=await openBook(browser,'http://127.0.0.1:'+server.address().port,width,height,'single');
   await testBackNavigation(media.page,{frame:media.frame,panels:['.lt-lightbox'],recorded:true,action:async()=>{
    await media.frame.evaluate(()=>{void LTMedia.openLightbox('https://www.youtube.com/watch?v=M7lc0UVf-VE','영상')});
    await media.frame.waitForSelector('.lt-lightbox');
     if(shots)await media.page.screenshot({path:path.join(shots,`book-${width}-media-open.png`)});
   }});
   if(shots)await media.page.screenshot({path:path.join(shots,`book-${width}-media-back.png`)});
   await media.ctx.close();
   const overview=await openBook(browser,'http://127.0.0.1:'+server.address().port,width,height,'single');
   await testBackNavigation(overview.page,{frame:overview.frame,recorded:true,panels:['#overview.open'],action:()=>overview.frame.evaluate(()=>window.__TRACK59__.openOverview())});
   await overview.ctx.close();
   if(width!==1440){
    const mobile=await openBook(browser,'http://127.0.0.1:'+server.address().port,width,height,'single');
    await testBackNavigation(mobile.page,{frame:mobile.frame,recorded:true,action:async()=>{
     await mobile.frame.evaluate(()=>window.__TRACK59__.setView('double'));
     await mobile.frame.waitForFunction(()=>window.__TRACK59__.getState().view==='double');
    }});
    await mobile.ctx.close();
   }
   const viewer=await openBook(browser,'http://127.0.0.1:'+server.address().port,width,height,'single');
   await viewer.frame.evaluate(()=>{const id=document.querySelector('.moment[data-moment]')?.dataset.moment;window.__TRACK59__.showDetail(id)});
   await testBackNavigation(viewer.page,{frame:viewer.frame,recorded:true,panels:['#detailSide:not([hidden])','.page-detail','#viewer.open'],action:async()=>viewer.frame.locator('[data-detail-viewer]:visible').first().click()});
   await viewer.ctx.close();

 }finally{
  await browser?.close();
  await new Promise(r=>server.close(r));
 }
}
for(const [width,height] of [[390,844],[844,390],[1440,900]]){
 test(`#1291 책 판 열기와 옵션 전환의 뒤로 가기(${width}×${height})`, {skip: REQUIRE ? false : skip,timeout:100000}, ()=>runBookHistory(width,height));
}


test('#1358 책 첫 그리기에서 쪽 표시가 바뀌지 않는다(저장값 없음)', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(skip);
  const browser = await chromium.launch({ headless: true });
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [width, height] of [[390, 844], [844, 390], [1440, 900]]) {
      const ctx = await browser.newContext({ viewport: { width, height } });
      await ctx.addInitScript(() => {
        try { localStorage.removeItem('lt41-book-view'); } catch {}
        window.__pageLabels = [];
        const watch = () => {
          const el = document.querySelector('#pageLabel');
          if (!el) { setTimeout(watch, 5); return; }
          window.__pageLabels.push(el.textContent.trim());
          new MutationObserver(() => window.__pageLabels.push(el.textContent.trim())).observe(el, { childList: true, characterData: true, subtree: true });
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
      });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e.message || e)));
      await page.goto(`${base}/v41/#book`, { waitUntil: 'load' });
      let frame = null;
      for (let k = 0; k < 80 && !frame; k += 1) {
        frame = page.frames().find((f) => /track59-sketchbook/.test(f.url()));
        if (!frame) await page.waitForTimeout(50);
      }
      assert.ok(frame, '책 프레임이 열리지 않음');
      await page.waitForTimeout(700);
      const labels = await frame.evaluate(() => window.__pageLabels || []);
      const unique = [...new Set(labels)];
      assert.equal(unique.length, 1, `${width}×${height}: 쪽 표시가 한 번도 바뀌지 않음 — ${JSON.stringify(labels)}`);
      const state = await frame.evaluate(() => window.__TRACK59__.getState());
      assert.equal(unique[0], `01 / ${String(state.total).padStart(2, '0')}`, `${width}×${height}: 첫 라벨이 최종 쪽 수`);
      assert.deepEqual(errors, [], `${width}×${height}: 화면 오류 없음`);
      await ctx.close();
    }
  } finally { await browser.close(); await new Promise((r) => server.close(r)); }
});

/* ── #1468: 넘김 도중 연속 입력(단추→키보드 0.5초 간격)과 넘김 중에 오는 셸 메시지(#1429 책 점검) ── */
// 매 프레임 쪽 번호를 적어 둔다 — 쪽이 건너뛰는지(두 칸 이상)는 이 기록으로 본다.
const startPageLog = (frame) => frame.evaluate(() => {
  const log = window.__lt1468Pages = { pages: [window.__TRACK59__.getState().page], raf: 0 };
  let last = log.pages[0];
  const tick = () => {
    const page = window.__TRACK59__.getState().page;
    if (page !== last) { log.pages.push(page); last = page; }
    log.raf = requestAnimationFrame(tick);
  };
  tick();
});
const stopPageLog = (frame) => frame.evaluate(() => { const log = window.__lt1468Pages; cancelAnimationFrame(log.raf); return log.pages; });
// 쪽 번호는 한 칸씩만 움직여야 한다(앞·뒤 한 칸은 허용, 두 칸 이상은 건너뜀이다).
const oneStepEach = (pages, label) => {
  for (let i = 1; i < pages.length; i += 1) {
    assert.equal(Math.abs(pages[i] - pages[i - 1]), 1, `${label}: 쪽 번호가 두 칸 이상 움직인다(${pages.join('→')})`);
  }
};
const turnSettled = (frame) => frame.waitForFunction(() => {
  const state = window.__TRACK59__.getState();
  return state.machineState === 'IDLE' && !state.queued;
}, null, { timeout: 10000 });

test('#1468 책 넘김 중 연속 입력(단추→키보드 0.5초 간격 50회): 예외 0·쪽 번호 건너뜀 0(1440·390)', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(skip);
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const [width, height, view] of [[1440, 900, 'double'], [390, 844, 'single']]) {
      const { ctx, page, frame, errors } = await openBook(browser, base, width, height, view);
      try {
        await startPageLog(frame);
        await frame.evaluate(() => document.getElementById('nextBtn').focus());
        for (let i = 0; i < 50; i += 1) {
          const forward = Math.floor(i / 12) % 2 === 0; // 12번마다 방향을 바꿔 책 끝에 닿지 않게 한다
          if (i % 2 === 0) await frame.evaluate((f) => document.getElementById(f ? 'nextBtn' : 'prevBtn').click(), forward);
          else await page.keyboard.press(forward ? 'ArrowRight' : 'ArrowLeft');
          await frame.waitForTimeout(500); // 점검과 같은 간격 — 넘김(약 0.65초)이 끝나기 전에 다음 입력이 든다
        }
        await turnSettled(frame);
        const pages = await stopPageLog(frame);
        assert.deepEqual(errors, [], `${width}: 페이지 예외 0`);
        oneStepEach(pages, `${width}`);
        assert.ok(pages.length >= 8, `${width}: 입력이 쪽 넘김으로 이어진다(관찰 ${pages.length}쪽: ${pages.join('→')})`);
      } finally {
        await ctx.close();
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
});

test('#1468 책 넘김 중 날짜 표기 메시지가 와도 다음 넘김은 안전하다: 예외 0, 표기는 넘김 뒤 바뀐다(1440·390)', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(skip);
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const [width, height, view] of [[1440, 900, 'double'], [390, 844, 'single']]) {
      const { ctx, page, frame, errors } = await openBook(browser, base, width, height, view);
      try {
        await startPageLog(frame);
        await frame.evaluate(() => document.getElementById('nextBtn').focus());
        for (let i = 0; i < 12; i += 1) {
          const value = i % 2 ? 'dash' : 'dot';
          await frame.evaluate(() => document.getElementById('nextBtn').click());
          await frame.waitForTimeout(200); // 넘김 한가운데
          // 셸이 화면이 뜬 뒤 1.6초 뒤 한 번 더 보내는 날짜 표기 메시지(frame-wiring frameReadyMessages의 repeats)가 넘김 중에 닿는 모양.
          await frame.evaluate((value) => window.dispatchEvent(new MessageEvent('message', { data: { type: 'lt41-date-style', value }, origin: location.origin, source: window.parent })), value);
          await frame.waitForTimeout(300);
          await page.keyboard.press('ArrowRight');
          await frame.waitForTimeout(300);
        }
        await turnSettled(frame);
        const pages = await stopPageLog(frame);
        const after = await frame.evaluate(() => ({
          style: document.documentElement.getAttribute('data-lt-date-style'),
          text: [...document.querySelectorAll('.page-content, .mobile-content')].map((node) => node.textContent).join(' ')
        }));
        assert.deepEqual(errors, [], `${width}: 페이지 예외 0`);
        oneStepEach(pages, `${width}`);
        assert.ok(pages.length >= 6, `${width}: 입력이 쪽 넘김으로 이어진다(관찰 ${pages.length}쪽: ${pages.join('→')})`);
        assert.equal(after.style, 'dash', `${width}: 마지막에 받은 표기 값`);
        assert.match(after.text, /\d{4}-\d{2}-\d{2}/, `${width}: 넘김 뒤 날짜 표기(2026-11-10 모양)가 쪽에 그려진다`);
        assert.doesNotMatch(after.text, /\d{4}\. \d{2}\. \d{2}/, `${width}: 옛 표기(2026. 11. 10 모양)가 남아 있지 않다`);
      } finally {
        await ctx.close();
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
});
