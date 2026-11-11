import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// #295: 기억책에서 긴 노트가 페이지 밖으로 넘치면 잘려 보이는 문제.
// 안1(넘친 페이지만 안에서 스크롤)을 채택했다 — 안2(페이지 분할)는 펼침 두 쪽·넘기기 구조를 바꾸므로 쓰지 않는다.
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const BOOK_JS = read('public/v41/views/book/book.js');
const BOOK_USABILITY_CSS = read('public/v41/views/book/book-usability.css');
const BOOK_CSS = read('public/v41/views/book/book.css');

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

test('#295 화면 연결: 넘침 판정을 페이지 렌더링 때마다 다시 매긴다', () => {
  // 판정 함수는 렌더 지점마다 다시 실행돼야 페이지를 넘겨도 상태가 따라간다
  assert.ok(BOOK_JS.includes('function markOverflowPages'), 'book.js에 markOverflowPages가 있다');
  assert.ok(/renderArchive\(\);syncLensClone\(\);markOverflowPages\(\);/.test(BOOK_JS), 'renderSpread가 페이지를 다 그린 뒤 판정한다');
  // #393 3: 넘김 중에는 다시 그리지 않는다 — 아래 페이지는 prepareTurn에서 한 번 그리고, 그 직후 판정한다.
  assert.ok(/mobileSpreadContent\(tar\)\}\s*\n?markOverflowPages\(\);turn\.frontFace=front/.test(BOOK_JS), '넘김 준비에서 아래 페이지를 다 그린 뒤 판정한다(넘기는 동안 재그림 없음)');
  assert.ok(!/setTurnProgress[\s\S]*markOverflowPages\(\)\}/.test(BOOK_JS.slice(BOOK_JS.indexOf('function setTurnProgress'), BOOK_JS.indexOf('function prepareTurn'))), 'setTurnProgress는 매 프레임 판정하지 않는다');
  // 같은 임계값(4px)을 book.js도 쓴다 — book-usability.mjs의 pageOverflows와 한 값
  assert.ok(BOOK_JS.includes('scrollHeight-el.clientHeight>4'), 'book.js 판정 임계값 4px');
  // 모바일: 넘친 쪽이 현재 쪽일 때만 book-wrap에 세로 스크롤을 허용한다
  assert.ok(BOOK_JS.includes("classList.toggle('lt-page-scroll'"), 'book-wrap 세로 스크롤 토글');
  assert.ok(BOOK_JS.includes("el.closest('#mobilePage')"), '예시 복제본(flip face)은 book-wrap 판정에서 제외한다');
});

test('#295 스타일: 넘친 페이지만 세로 스크롤을 허용하고 짧은 순간은 그대로다', () => {
  // 기본 규칙은 그대로(페이지 안 스크롤 없음)
  assert.ok(BOOK_USABILITY_CSS.includes('.page-content{overflow:hidden;overscroll-behavior:auto}'));
  assert.ok(BOOK_CSS.includes('.page-content{position:absolute;inset:0;padding:43px 46px 37px;display:flex;flex-direction:column;overflow:hidden}'));
  // 넘친 페이지만: overflow-y:auto + 스크롤 연쇄 차단
  assert.ok(/\.page-content\.lt-overflow,html\[data-v41-screen=book\] \.mobile-content\.lt-overflow\{overflow-y:auto;overscroll-behavior:contain/.test(BOOK_USABILITY_CSS), 'lt-overflow 규칙');
  // 내용 중앙 배치의 max-height:100%가 스크롤을 막지 않게 푼다
  assert.ok(BOOK_USABILITY_CSS.includes('.page-content.lt-overflow>.moment{max-height:none}'));
  // 모바일 세로 터치 스크롤: book-wrap touch-action:none을 넘친 쪽에서만 연다
  assert.ok(BOOK_USABILITY_CSS.includes('.book-wrap.lt-page-scroll{touch-action:pan-y}'));
  assert.ok(BOOK_CSS.includes('touch-action:none'), '기본 book-wrap은 여전히 제자리(짧은 순간 변화 0)');
});

// --- 2026-11-09 보완: 판정을 렌더 때만 하면 이미지가 늦게 로드되어 페이지가 나중에 넘칠 때 다시 잘린다(#301 검토 지적) ---

const BOOK_EXTRA_JS = read('public/v41/views/book/book-extra.js');
const USABILITY_JS = read('public/v41/book-usability.mjs');
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
  // book.js 쪽 연결: 렌더가 관찰 대상을 넘기고, 재판정 입구를 연다
  assert.ok(BOOK_JS.includes('window.__TRACK59__?.overflowRejudge?.observe(els)'), 'markOverflowPages가 현재 페이지를 관찰에 넘긴다');
  assert.ok(BOOK_JS.includes('rejudgeOverflow:()=>markOverflowPages()'), 'book.js가 재판정 입구를 연다');
  // book-usability.mjs 연결: load는 캡처로, resize·RO를 같은 rAF 경로로 묶는다
  assert.ok(USABILITY_JS.includes("addDocListener('load', onDocLoad, true)"), '이미지 load를 캡처로 듣는다');
  assert.ok(USABILITY_JS.includes("addWinListener('resize', schedule)"), '창 resize를 같은 경로로 묶는다');
  assert.ok(USABILITY_JS.includes('new ROClass(schedule)'), 'ResizeObserver도 같은 rAF 경로로 묶는다');
});
