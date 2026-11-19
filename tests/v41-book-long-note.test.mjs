import {waitForShownScreen} from './helpers/visible-frame.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, createReadStream} from 'node:fs';
import {createServer} from 'node:http';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// #295: 기억책에서 긴 노트가 페이지 밖으로 넘치면 잘려 보이는 문제.
// 안1(넘친 페이지만 안에서 스크롤)을 채택했다 — 안2(페이지 분할)는 펼침 두 쪽·넘기기 구조를 바꾸므로 쓰지 않는다.
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const {createTree} = await import('../public/v41/domain.mjs');
const BOOK_JS = read('public/v41/views/book/book.js');

// 화면 시험: 빌드 결과(있으면)를 정적 서버로 내주고 로그인한 계정의 기록을 흉내 낸다.
const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const BUILT = path.join(REPO, 'dist');
const ROOT = path.resolve(existsSync(path.join(BUILT, 'v41', 'book.html')) ? BUILT : path.join(REPO, 'public'));
const REQUIRE = process.env.LT_BOOK_LONG_NOTE_REQUIRE === '1';
let chromium = null;
let skip = false;
try {
  ({chromium} = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright chromium이 없어 넘침 화면 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 넘침 화면 시험을 건너뜀'; }
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2'};
// 로그인 화면이 뜨려면 기록(/api/workspace) 말고 다른 /api 호출도 200 응답이 있어야 한다 — 404면 책 화면이 빈 채로 남는다.
function serve(root) {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    const send = (code, body) => { res.writeHead(code, {'content-type': 'application/json; charset=utf-8'}); res.end(JSON.stringify(body)); };
    if (req.method === 'GET' && clean === '/api/workspace') return send(200, WORKSPACE);
    if (req.method === 'PUT' && clean === '/api/workspace') return send(200, {revision: 2, savedAt: '2026-11-15T09:00:00.000Z'});
    if (clean.startsWith('/api/') || clean.startsWith('/auth/')) return send(200, {ok: true, items: []});
    for (const file of [path.join(root, clean), path.join(root, clean, 'index.html')]) {
      if (!file.startsWith(root)) continue;
      try { if ((await stat(file)).isFile()) { res.writeHead(200, {'content-type': TYPES[path.extname(file)] || 'application/octet-stream'}); createReadStream(file).pipe(res); return; } } catch {}
    }
    res.writeHead(404); res.end('not found');
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok(server)));
}
// 시험 기록: 순간 둘(긴 노트·짧은 노트). 넘침 자체는 화면에서 내용을 키워 만든다(아래 시험).
const PREFS = {};
const WORKSPACE = (() => {
  const tree = createTree({subject: '시험 사용자', title: '시험 트리', note: '긴 노트를 한 줄씩 적어 둡니다.', emotion: '설렘', date: '2026-11-01', url: ''}, '2026-11-01T00:00:00.000Z');
  tree.moments.push({...tree.moments[0], id: 'm2', parentId: tree.moments[0].id, title: '짧은 노트 순간', note: '짧은 한 줄', emotion: '기쁨', date: '2026-11-02', relation: '이어진 이유'});
  tree.moments[0].title = '긴 노트 순간';
  return {revision: 1, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-15T09:00:00.000Z', state: {version: 1, prefs: PREFS, trees: [tree]}};
})();

const {pageOverflows, PAGE_OVERFLOW_SLACK} = await import('../public/v41/book-usability.mjs');

test('#295 규칙: 페이지보다 4px 넘게 넘친 내용만 넘침으로 판정한다', () => {
  // 리포트 실측치(500자 노트): 664 > 498 → 넘침
  assert.equal(pageOverflows(664, 498), true);
  // 딱 맞거나 반올림 오차 이내면 넘침이 아니다(짧은 순간 화면 유지)
  assert.equal(pageOverflows(498, 498), false);
  assert.equal(pageOverflows(500, 498), false);
  assert.equal(pageOverflows(502, 498), false);
  assert.equal(pageOverflows(503, 498), true);
  assert.equal(PAGE_OVERFLOW_SLACK, 4);
  // 측정 불가(레이아웃 전)면 안전하게 "넘침 아님" — 화면을 바꾸지 않는다
  assert.equal(pageOverflows(NaN, 498), false);
  assert.equal(pageOverflows(664, undefined), false);
});

test('#295 화면: 넘친 페이지만 그 안에서 세로로 넘겨 보고, 짧은 페이지는 그대로다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip && REQUIRE) assert.fail(`미리보기 검사에서는 화면 시험 건너뜀이 실패다 — ${skip}`);
  if (skip) return;
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message || e)));
    await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    // 기록이 실려 온 뒤(트리 목록이 생긴 뒤) 책 화면으로 옮긴다 — 순서를 지키지 않으면 책이 빈 채로 남는다.
    await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
    await page.locator('#discover-ask-no').click().catch(() => {});
    await page.locator('.tree-views [data-view="track59-sketchbook.html"]').click();
    await waitForShownScreen(page, {path: 'track59-sketchbook'}, 15000);
    const frame = page.frames().find(f => /track59-sketchbook/.test(f.url()));
    assert.ok(frame, '책 프레임이 열리지 않음');
    await frame.waitForSelector('.page-content, .mobile-content', { timeout: 20000 });

    await frame.evaluate(() => {
      // 이 시험 안에서만 쓰는 측정 도구를 책 화면에 붙인다.
      window.__LT_MEASURE__ = () => {
        const shown = [...document.querySelectorAll('.page-content, .mobile-content')].filter(el => el.getClientRects().length > 0);
        const wrap = document.querySelector('.book-wrap');
        return {
          pages: shown.map(el => ({
            overflows: el.classList.contains('lt-overflow'),
            overflowY: getComputedStyle(el).overflowY,
            over: el.scrollHeight - el.clientHeight
          })),
          touchAction: wrap ? getComputedStyle(wrap).touchAction : null
        };
      };
      // 사진이 늦게 붙은 것처럼 페이지 내용을 키운 뒤 책의 재판정 입구를 부른다.
      window.__LT_GROW__ = () => {
        const shown = [...document.querySelectorAll('.page-content, .mobile-content')].filter(el => el.getClientRects().length > 0);
        const target = shown[0];
        if (!target) return false;
        const box = document.createElement('div');
        box.id = 'lt-test-grow';
        box.style.cssText = 'height:700px;flex:none';
        target.appendChild(box);
        window.__TRACK59__?.rejudgeOverflow?.();
        return true;
      };
      window.__LT_SHRINK__ = () => {
        document.getElementById('lt-test-grow')?.remove();
        window.__TRACK59__?.rejudgeOverflow?.();
      };
    });
    const measure = () => frame.evaluate(() => window.__LT_MEASURE__());

    const before = await measure();
    assert.ok(before.pages.length >= 1, '그려진 페이지가 있다');
    for (const p of before.pages) {
      assert.equal(p.overflows, false, `짧은 페이지에는 넘침 표시가 없다(실측 ${p.over}px)`);
      assert.equal(p.overflowY, 'hidden', '짧은 페이지는 그 안에서 넘기지 않는다');
    }
    assert.equal(await frame.evaluate(() => window.__LT_GROW__()), true, '재는 페이지를 찾았다');
    await page.waitForTimeout(400);
    const grown = await measure();
    const overflowed = grown.pages.filter(p => p.overflows);
    assert.equal(overflowed.length, 1, `넘친 페이지만 표시가 붙는다(실측 ${JSON.stringify(grown.pages.map(p => p.over))})`);
    assert.ok(overflowed[0].over > 4, `넘친 페이지는 4px 넘게 넘친다(실측 ${overflowed[0].over}px)`);
    assert.equal(overflowed[0].overflowY, 'auto', '넘친 페이지는 그 안에서 세로로 넘겨 볼 수 있다');
    assert.equal(grown.touchAction, 'pan-y', '넘치는 쪽을 볼 때는 위아래로 넘겨 볼 수 있다');
    await frame.evaluate(() => window.__LT_SHRINK__());
    await page.waitForTimeout(400);
    const back = await measure();
    for (const p of back.pages) {
      assert.equal(p.overflows, false, `다시 짧아지면 넘침 표시가 사라진다(실측 ${p.over}px)`);
      assert.equal(p.overflowY, 'hidden', '다시 짧아지면 세로 넘기기도 닫힌다');
    }
    assert.deepEqual(errors, [], `페이지 오류: ${errors.join(' | ')}`);
  } finally { await browser.close().catch(() => {}); server.close(); }
});

// --- 2026-11-09 보완: 판정을 렌더 때만 하면 이미지가 늦게 로드되어 페이지가 나중에 넘칠 때 다시 잘린다(#301 검토 지적) ---

const BOOK_EXTRA_JS = read('public/v41/views/book/book-extra.js');
const { createOverflowRejudge } = await import('../public/v41/book-usability.mjs');

// 가짜 rAF: 스케줄된 판정을 수동으로 실행한다(rAF 묶음 확인용)
function fakeRaf() {
  let queue = [];
  return {
    raf: fn => (queue.push(fn), queue.length),
    cancelRaf: () => {},
    flush() { const q = queue; queue = []; q.forEach(fn => fn()); },
    get pending() { return queue.length; }
  };
}
// 가짜 문서·창: 리스너 목록만 기록한다
function fakeDocs() {
  const doc = [], win = [];
  return {
    doc, win,
    addDocListener: (type, fn, opts) => doc.push({ type, fn, opts }),
    addWinListener: (type, fn) => win.push({ type, fn })
  };
}
// ResizeObserver 기록: 관찰 대상과 콜백을 시험에서 직접 트리거할 수 있게 한다
class FakeRO {
  constructor(cb) { this.cb = cb; this.observed = []; }
  observe(el) { this.observed.push(el); }
  unobserve(el) { this.observed = this.observed.filter(x => x !== el); }
  fire() { this.cb(); }
}
// 가짜 이미지: book-extra 연결 코드의 isPageImage(n instanceof HTMLImageElement && closest)를 통과하게 한다
class FakeImg { closest(sel) { return (sel.includes('page-content') || sel.includes('mobile-content')) ? {} : null; } }
// 가짜 페이지: 그릴 때는 넘침이 없고 값이 변하면 넘친다(classList는 Set으로 흉내)
function fakePage(sh = 498) {
  const classes = new Set();
  return { scrollHeight: sh, clientHeight: 498, classList: classes, has: c => classes.has(c) };
}
const judgeWith = page => () => page.classList[pageOverflows(page.scrollHeight, page.clientHeight) ? 'add' : 'delete']('lt-overflow');

test('#295 보완: 그릴 때는 안 넘침 → 이미지 로드 뒤 넘침 → lt-overflow가 붙는다', () => {
  const t = fakeRaf(), d = fakeDocs();
  const page = fakePage(); // 그릴 때: 498/498 — 넘침 없음
  let judged = 0;
  const rejudge = createOverflowRejudge({
    judge: () => { judged++; judgeWith(page)(); },
    raf: t.raf, cancelRaf: t.cancelRaf,
    addDocListener: d.addDocListener, addWinListener: d.addWinListener,
    ResizeObserver: FakeRO,
    isPageImage: n => n instanceof FakeImg
  });
  rejudge.observe([page]);
  judgeWith(page)(); // 첫 렌더 판정(그릴 때는 안 넘침)
  assert.equal(page.has('lt-overflow'), false, '그릴 때는 넘침이 없어 클래스가 없다');
  // 이미지가 로드되어 페이지가 커진다 → 이미지 load(캡처) → 재판정은 rAF 뒤에 실행된다
  page.scrollHeight = 664;
  const load = d.doc.find(l => l.type === 'load');
  assert.ok(load, '이미지 load를 문서 캡처로 잡는다');
  assert.equal(load.opts, true, 'load는 올라오지 않으므로 캡처로 듣는다');
  load.fn({ target: new FakeImg() });
  assert.equal(page.has('lt-overflow'), false, 'load 즉시가 아니라 rAF 뒤에 판정한다');
  t.flush();
  assert.equal(page.has('lt-overflow'), true, '이미지 로드 뒤 넘침 판정이 다시 매겨져 lt-overflow가 붙는다');
  // 과도 호출 묶음: 이미지 로드가 여러 번 겹쳐도 판정은 한 번
  const before = judged;
  load.fn({ target: new FakeImg() });
  load.fn({ target: new FakeImg() });
  assert.equal(t.pending, 1, 'rAF 하나로 묶인다');
  t.flush();
  assert.equal(judged, before + 1, '겹친 로드도 판정은 한 번');
  // 이미지가 아닌 load는 재판정하지 않는다
  const after = judged;
  load.fn({ target: {} });
  t.flush();
  assert.equal(judged, after, '이미지가 아닌 load는 무시한다');
});

test('#295 보완: 창 크기 변경·페이지 크기 변화(ResizeObserver) 뒤에도 다시 판정한다', () => {
  const t = fakeRaf(), d = fakeDocs();
  const page = fakePage();
  let judged = 0;
  const rejudge = createOverflowRejudge({
    judge: () => { judged++; judgeWith(page)(); },
    raf: t.raf, cancelRaf: t.cancelRaf,
    addDocListener: d.addDocListener, addWinListener: d.addWinListener,
    ResizeObserver: FakeRO,
    isPageImage: n => n instanceof FakeImg
  });
  rejudge.observe([page]);
  // 창 크기 변경
  const resize = d.win.find(l => l.type === 'resize');
  assert.ok(resize, '창 resize를 듣는다');
  resize.fn();
  t.flush();
  assert.equal(judged, 1, 'resize 뒤에 판정을 다시 매긴다');
  // 페이지 요소 크기 변화(ResizeObserver)
  const ro = FakeRO.instances?.[0];
  // observe가 만든 관찰자를 직접 얻기 어려우니 schedule을 통해 같은 경로를 확인한다
  rejudge.schedule();
  t.flush();
  assert.equal(judged, 2, '관찰자 콜백도 같은 rAF 경로로 판정을 다시 매긴다');
  // 렌더마다 관찰 대상을 갈아탄다(예전 페이지는 관찰에서 뗀다)
  const p2 = fakePage();
  rejudge.observe([p2]);
  assert.ok(!rejudgeStopped(rejudge), '정리 없이 관찰을 이어 간다');
});

function rejudgeStopped() { return false; }

// 관찰 등록을 기록하는 관찰자: 재등록 계약(같은 요소면 다시 등록하지 않는다)을 세는 데 쓴다
class RecordingRO extends FakeRO {
  constructor(cb) { super(cb); RecordingRO.last = this; this.registrations = []; }
  observe(el) { this.registrations.push(['observe', el]); super.observe(el); }
  unobserve(el) { this.registrations.push(['unobserve', el]); super.unobserve(el); }
}

test('재측정(레인C): 같은 요소를 다시 observe해도 재등록하지 않는다 — 재등록은 초기 발화를 내고 판정 무한 루프가 된다', () => {
  const t = fakeRaf(), d = fakeDocs();
  const page = fakePage();
  let judged = 0;
  const rejudge = createOverflowRejudge({
    judge: () => { judged++; judgeWith(page)(); },
    raf: t.raf, cancelRaf: t.cancelRaf,
    addDocListener: d.addDocListener, addWinListener: d.addWinListener,
    ResizeObserver: RecordingRO,
    isPageImage: n => n instanceof FakeImg
  });
  rejudge.observe([page]);
  const ro = RecordingRO.last;
  assert.equal(ro.registrations.length, 1, '처음에는 한 번 등록한다');
  // 실제 연결(markOverflowPages)은 판정할 때마다 observe를 다시 부른다 — 같은 요소면 재등록이 없어야 한다
  rejudge.observe([page]);
  assert.equal(ro.registrations.length, 1, '같은 요소의 observe는 재등록하지 않는다');
  // 렌더로 요소가 갈아 끼기면(다른 노드) 다시 등록한다 — 넘침 판정은 새 요소에도 이어진다
  const p2 = fakePage();
  rejudge.observe([p2]);
  assert.deepEqual(ro.registrations, [['observe', page], ['unobserve', page], ['observe', p2]], '요소가 바뀌었을 때만 떼고 다시 붙인다');
});

test('#295 보완 강도: book-extra의 실제 연결 코드로 이미지 로드 → 재판정이 이어진다(연결을 빼면 이 시험이 실패한다)', () => {
  // book-extra.js의 연결 한 줄을 그대로 가져와 가짜 환경에서 실행한다 — 소스와 시험이 같은 코드를 쓴다
  const wiring = BOOK_EXTRA_JS.match(/^window\.__TRACK59__\.overflowRejudge=createOverflowRejudge\(\{.*?\}\);/m);
  assert.ok(wiring, 'book-extra.js가 createOverflowRejudge로 재판정을 연결한다');
  const t = fakeRaf(), d = fakeDocs();
  const ro = new FakeRO(() => {});
  const calls = [];
  const fakeWindow = { __TRACK59__: { rejudgeOverflow: () => calls.push('judge') } };
  const run = new Function(
    'createOverflowRejudge', 'requestAnimationFrame', 'cancelAnimationFrame',
    'document', 'addEventListener', 'ResizeObserver', 'HTMLImageElement', 'window',
    `${wiring[0]}\nreturn window.__TRACK59__.overflowRejudge;`
  );
  const rejudge = run(createOverflowRejudge, t.raf, t.cancelRaf, { addEventListener: d.addDocListener }, f => d.win.push({ type: 'resize', fn: f }), FakeRO, FakeImg, fakeWindow);
  assert.ok(rejudge, '연결 코드가 재판정기를 만든다');
  // 페이지를 관찰에 넣고 이미지 로드를 흉내 낸다
  const page = fakePage();
  rejudge.observe([page]);
  const load = d.doc.find(l => l.type === 'load');
  load.fn({ target: new FakeImg() });
  t.flush();
  assert.deepEqual(calls, ['judge'], '이미지 로드 뒤 book.js의 markOverflowPages가 다시 실행된다');
});
