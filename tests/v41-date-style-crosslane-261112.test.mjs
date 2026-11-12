// 오늘 머지분 레인 사이 리뷰(이슈 #466 M1~M5): 날짜 표기(dateStyle)가 첫 화면·공용 썸네일
// 카드·로그인 미러 캐시에서 설정을 무시하던 결함. 문자열 고정이 아니라 실제 함수를 불러
// 결과 값으로 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatDisplayDate } from '../public/v41/book-usability.mjs';
import { fallbackCardData } from '../public/v41/thumb-fallback.mjs';
import { ltDateStyle } from '../v41/home-moments.js';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('M1: formatDisplayDate는 이미 포맷된 문자열을 같은 스타일로 다시 받아도 값이 바뀌지 않는다(이중 포맷 안전)', () => {
  // dash로 이미 포맷된 문자열(home-moments.cardOf가 만드는 값)을 dateOf가 같은 스타일로 다시 포맷해도
  // dot으로 되돌아가면 안 된다 — #441 이전에는 style 인자가 빠져 항상 dot으로 되돌아갔다.
  const dash = formatDisplayDate('2026-11-10', 'dash');
  assert.equal(dash, '2026-11-10');
  assert.equal(formatDisplayDate(dash, 'dash'), '2026-11-10', '이미 dash인 문자열을 dash로 다시 포맷해도 그대로다');
  assert.notEqual(formatDisplayDate(dash, 'dash'), '2026. 11. 10', 'dot으로 되돌아가면 안 된다(M1 회귀)');

  const long = formatDisplayDate('2026-11-10', 'long');
  assert.equal(long, '11월 10일');
  assert.equal(formatDisplayDate(long, 'long'), '11월 10일', '이미 long인 문자열을 long으로 다시 포맷해도 그대로다');

  const dot = formatDisplayDate('2026-11-10', 'dot');
  assert.equal(dot, '2026. 11. 10');
  assert.equal(formatDisplayDate(dot, 'dot'), '2026. 11. 10', '이미 dot인 문자열을 dot으로 다시 포맷해도 그대로다');
});

test('M1: 원본(저장) 날짜 문자열에 style을 주면 설정대로 포맷된다(인자 없으면 항상 dot이던 결함)', () => {
  const raw = '2026-11-10T00:00:00Z';
  assert.equal(formatDisplayDate(raw, 'dash'), '2026-11-10');
  assert.equal(formatDisplayDate(raw, 'long'), '11월 10일');
  assert.equal(formatDisplayDate(raw, 'dot'), '2026. 11. 10');
  assert.notEqual(formatDisplayDate(raw), formatDisplayDate(raw, 'dash'), 'style 없이 부르면 dash와 달라야 한다(dot 기본값 확인)');
});

test('M4: 공용 썸네일 글 카드·최소 카드의 날짜도 dateStyle을 따른다', () => {
  const moment = { date: '2026-11-10', emotion: '설렘', url: 'https://example.com/post' };
  const dot = fallbackCardData(moment, {});
  const dash = fallbackCardData(moment, { dateStyle: 'dash' });
  const long = fallbackCardData(moment, { dateStyle: 'long' });
  assert.equal(dot.date, '2026. 11. 10', '기본(인자 없음)은 기존과 같은 dot');
  assert.equal(dash.date, '2026-11-10', 'dateStyle=dash를 주면 대시로 바뀐다(M4 수리 전에는 항상 dot)');
  assert.equal(long.date, '11월 10일', 'dateStyle=long도 반영된다');
});

test('M5: 로그인 기기 미러(ltDateStyle)는 문서 속성을 localStorage보다 먼저 보고, 둘 다 없으면 dot', () => {
  const savedDoc = globalThis.document, savedStorage = globalThis.localStorage;
  try {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
    globalThis.document = { documentElement: { attrs: {}, getAttribute(name) { return this.attrs[name] ?? null; } } };

    assert.equal(ltDateStyle(), 'dot', '아무것도 없으면 기본 dot');

    globalThis.localStorage.setItem('lt41.dateStyle', 'dash');
    assert.equal(ltDateStyle(), 'dash', '문서 속성이 없으면 기기 미러(localStorage)를 따른다');

    globalThis.document.documentElement.attrs['data-lt-date-style'] = 'long';
    assert.equal(ltDateStyle(), 'long', '문서 속성이 있으면 미러보다 먼저 본다(셸이 심어 준 최신 값)');
  } finally {
    if (savedDoc === undefined) delete globalThis.document; else globalThis.document = savedDoc;
    if (savedStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = savedStorage;
  }
});

test('M3: 기억책 "여기까지 온 길" 날짜도 상세 kicker와 같은 styledDate(dateStyle 적용)를 쓴다', () => {
  // book-extra.js는 LTDEMO 전역에 의존하는 classic script라 직접 실행하지 않고(이 파일의 다른 시험과
  // 같은 이유), 소스가 journey 항목에서도 화면 안 다른 날짜와 같은 한 벌을 쓰는지 확인한다.
  const bookExtra = read('public/v41/views/book/book-extra.js');
  assert.match(bookExtra, /const styledDate=v=>formatDisplayDate\(v,ltDateStyle\(\)\);/, 'styledDate 정의가 있다');
  assert.match(bookExtra, /journey-date">'\+t\(styledDate\(item\.date\)\)/, 'journey 항목 날짜가 styledDate를 쓴다(M3 수리 전에는 formatDisplayDate(item.date)로 style 누락)');
  assert.doesNotMatch(bookExtra, /journey-date">'\+t\(formatDisplayDate\(item\.date\)\)/, '더 이상 style 없는 포맷을 쓰지 않는다');
});
