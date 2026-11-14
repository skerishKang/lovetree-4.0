// #537: 책의 '한 장' 보기 — 넓은 화면에서는 두 장 책의 한 쪽을 크게, 휴대폰은 지금 모양 그대로.
// 그리고 한 장은 펼침면(순간 둘)이 아니라 순간 하나씩 넘긴다(순간 26개면 1/26 … 26/26).
// 여기서는 (1) 계산 한 벌을 실제로 실행해 순서·전환을 확인하고, (2) 실제 책 화면을 열어
// 모든 순간이 한 번씩 크게 나오는지·높이·돋보기·머리줄을 잰다(크롬이 없으면 건너뛴다).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
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

test('#537 1·2: 넓은 화면 한 장은 두 장 책의 한 쪽 크기·같은 높이이고, 휴대폰 모양은 폰 폭에만 걸린다', () => {
  // 화면 모양은 보기 모드와 따로 매긴다(폰 폭 = phone, 그 밖 = wide).
  assert.match(BOOK, /function narrow\(\)\{return innerWidth<600\}/, '폰 폭 판정 한 곳');
  assert.match(BOOK, /dataset\.bookShape=narrow\(\)\?'phone':'wide'/, '화면 모양 속성');
  // 두 장과 같은 높이 식 + 두 장 책 폭의 절반 = 한 쪽 크기, 위아래 가운데는 .stage의 place-items가 맡는다.
  assert.match(CSS, /html\[data-book-view=single\]\[data-book-shape=wide\] \.book-wrap\{width:calc\(min\(1160px,80vw\)\/2\);height:min\(920px,calc\(100vh - 215px\)\);min-height:380px\}/, '넓은 화면 한 장 크기(이슈 584: 두 장과 같은 식)');
  assert.match(CSS, /html\[data-book-view=single\]\[data-book-shape=wide\] \.book\{grid-template-columns:1fr\}/, '한 쪽만 놓는 격자');
  assert.match(CSS, /html\[data-book-view=single\]\[data-book-shape=wide\] \.page\.left,\nhtml\[data-book-view=single\]\[data-book-shape=wide\] \.mobile-page,\nhtml\[data-book-view=single\]\[data-book-shape=wide\] \.mobile-inspect,\nhtml\[data-book-view=single\]\[data-book-shape=wide\] \.eyebrow\{display:none\}/, '넓은 화면 한 장: 오른쪽 한 쪽만');
  // 휴대폰 모양(좁은 책·작은 머리줄)은 폰 폭에만 남는다.
  assert.match(CSS, /html\[data-book-shape=phone\] \.book-wrap\{width:min\(92vw,430px\)/, '휴대폰 책 폭');
  assert.match(CSS, /html\[data-book-shape=phone\] \.topbar\{height:60px;padding:0 12px\}/, '휴대폰 머리줄');
  assert.match(CSS, /html\[data-book-shape=phone\] \.tools \.ui-btn\{padding:7px 9px;font-size:13px\}/, '휴대폰 단추 크기(#548 기준선: 단추 13px)');
  assert.doesNotMatch(CSS, /html\[data-book-view=single\] \.topbar\{/, '넓은 화면 한 장은 두 장 머리줄을 그대로 쓴다');
  // 세로 흐름(스크롤) 한 장도 폰 폭 전용이다.
  assert.match(LAYOUT, /html\[data-book-shape=phone\]\[data-v41-screen=book\]\{height:auto;min-height:100%;overflow-x:hidden;overflow-y:auto\}/);
});

test('#537 3: 돋보기는 넓은 화면 한 장에서도 쓸 수 있고, 휴대폰 폭에서만 막는다', () => {
  assert.match(CSS, /html\[data-book-shape=phone\] \.desktop-only\{display:none!important\}/, '휴대폰에서만 돋보기 단추 숨김');
  assert.doesNotMatch(CSS, /html\[data-book-view=single\] \.desktop-only/, '넓은 화면 한 장에서는 숨기지 않는다');
  assert.match(BOOK, /function lensActive\(\)\{return overBook&&lensOn&&!narrow\(\)&&machineState==='INSPECTING'\}/, '따라오기 게이트도 폰 폭 기준');
  assert.match(BOOK, /if\(narrow\(\)\|\|!lensOn\|\|!\['IDLE','INSPECTING'\]/, '가리키기 판정도 폰 폭 기준');
  assert.match(EXTRA, /lensOn=lensPref;writeLens/, '단추를 켜면 책의 돋보기도 함께 켜진다(켜기→따라오기→끄기→다시 켜기)');
});

test('#537 4·5: 쪽 번호·넘김 단추 자리와 머리줄은 두 장과 같다 — 한 장 전용 이동 규칙을 만들지 않는다', () => {
  assert.doesNotMatch(CSS, /html\[data-book-view=single\]\[data-book-shape=wide\] \.nav-pill\{/, '넘김 단추 자리는 두 장 규칙 그대로');
  assert.doesNotMatch(CSS, /html\[data-book-view=single\]\[data-book-shape=wide\] \.topbar\{/, '머리줄 자리도 그대로');
  assert.match(BOOK, /\$\('#rightFolio'\)\.textContent=single\(\)\?pad2\(current\+1\):pad2\(si\*2\+2\)/, '한 장 쪽 번호는 그 순간의 번호');
  assert.match(BOOK, /\$\('#pageLabel'\)\.textContent=`\$\{pad2\(current\+1\)\} \/ \$\{pad2\(total\)\}`/, '이동 줄은 지금 쪽 / 전체 쪽');
});

test('#537 8: 한 장 아래 작은 줄(.mobile-support)은 그리지 않는다', () => {
  assert.doesNotMatch(BOOK, /mobile-support/, 'book.js에 작은 줄이 없다');
  assert.doesNotMatch(EXTRA, /mobile-support/, 'book-extra에도 없다');
  assert.doesNotMatch(CSS, /\.mobile-support/, 'book.css 규칙도 지운다');
  assert.doesNotMatch(USE_CSS, /\.mobile-support/, 'book-usability.css 규칙도 지운다');
  assert.doesNotMatch(LAYOUT, /\.mobile-support/, 'reader-layout.css 규칙도 지운다');
  // 마지막 순간 뒤의 '다음 순간' 안내는 두 장의 빈 오른쪽 페이지와 같은 자리에 흐름으로 붙는다.
  assert.match(EXTRA, /insertAdjacentHTML\('beforeend','<div class="next-page">/, '한 장에서도 다음 순간 안내');
  assert.match(USE_CSS, /html\[data-book-view=single\]\[data-v41-screen=book\] \.next-page\{position:static/, '한 장에서는 그 순간 글 아래 흐름에 놓는다(쪽을 덮지 않는다)');
  assert.match(USE_CSS, /html\[data-v41-screen=book\] \.next-page\{position:absolute;inset:0 0 56px\}/, '두 장은 빈 오른쪽 페이지를 그대로 채운다');
});

test('#537 10: 목차·이어진 순간에서 들어와도 그 순간이 바로 크게 나온다', () => {
  assert.match(BOOK, /jumpToMoment:id=>renderSpread\(posOfMoment\(id\),id,false\)/, '순간 id로 바로 그 쪽');
  assert.match(BOOK, /data-jump="\$\{at\}" data-focus="\$\{m.id\}"/, '목차 항목은 위치(순간 순번/펼침면 번호)를 싣는다');
  assert.match(EXTRA, /const target=posOfMoment\(focus\);/, "'이어진 순간'도 같은 위치 규칙");
  assert.match(BOOK, /const focus=LTDEMO\.get\(\)\|\|'';viewChoice=v;try\{localStorage\.setItem\(VIEW_KEY,v\)\}catch\{\}applyViewAttr\(\);renderSpread\(posOfMoment\(focus\),focus\|\|null,false\)/, '보기 전환도 같은 위치 규칙');
});

test('#537 6: 제목 고치기는 두 장·한 장이 같은 규칙(제목 위에 올릴 때만 보인다)', () => {
  assert.match(USE_CSS, /html\[data-book-view=double\]\[data-v41-screen=book\] \.title-edit-hint,\nhtml\[data-book-view=single\]\[data-book-shape=wide\]\[data-v41-screen=book\] \.title-edit-hint\{opacity:0;pointer-events:none\}/, '넓은 화면 한 장도 두 장처럼 숨긴다');
});

test('#537 함께: 마음 한마디가 비었을 때 안내 글을 내용처럼 그리지 않는다', () => {
  assert.doesNotMatch(EXTRA, /class="moment-note is-empty/, '빈 안내 글 단추를 그리지 않는다');
  assert.match(EXTRA, /const tail=parts\.main&&parts\.note\?'<p class="moment-note">'/, '마음이 있을 때만 그 줄을 그린다');
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
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function openBook(browser, base, width, height, view) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addInitScript((v) => { try { localStorage.setItem('lt41-book-view', v); } catch {} }, view);
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
    topbar: Math.round(document.querySelector('.topbar').getBoundingClientRect().height),
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
    await wideSingle.ctx.close();

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
    const phoneWalk = await walkAll(phone.frame);
    await phone.ctx.close();
    assert.equal(phoneGeom.state.shape, 'phone', '폰 폭은 휴대폰 모양');
    assert.deepEqual(phoneGeom.pages, { left: false, right: false, mobile: true }, '휴대폰 한 장은 mobile-page');
    assert.equal(phoneGeom.topbar, 60, '휴대폰 머리줄 60px 그대로');
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
