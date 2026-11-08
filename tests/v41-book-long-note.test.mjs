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
  assert.ok(/mobileSpreadContent\(SPREADS\[turn\.target\]\)\}markOverflowPages\(\)\}/.test(BOOK_JS), '페이지 넘김 중간 그림에도 다시 판정한다');
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
