// #464(2026-11-13) — 읽기 전용(예시·공유) 책에서 '고치기'·마음 안내를 숨기고,
// 한 장/두 장 단추에 '지금 고른 쪽'을 눈으로 보이게 한다.
//
// 실측으로 확인한 고장 두 가지(1440·390 × 밤·정원):
//   ① 예시 책에 '✎ 고치기' 7개, '이 순간에 남기고 싶은 마음을 적어 보세요…' 7개가 보였다.
//      runtime.js가 readOnly를 source==='share'만으로 내려서, 예시(example·demoData)가 '쓸 수 있는 책'으로 판정됐다.
//   ② aria-pressed 값은 맞는데 색이 같았다. identity.css의 `html[data-v41-screen=book] .tools .ui-btn`(배경 지정)이
//      book.css보다 뒤에 실려 [aria-pressed=true] 금테를 덮었다 — 눌린 쪽과 안 눌린 쪽 배경이 똑같았다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { editAffordances } from '../public/v41/book-usability.mjs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const runtime = read('public/v41/runtime.js');
const identity = read('public/v41/identity.css');
const bookCss = read('public/v41/views/book/book.css');
const bookExtra = read('public/v41/views/book/book-extra.js');
const sketchbook = read('public/v41/views/track59-sketchbook.html');

// ── ① 판정: 예시도 읽기 전용 ──
test('#464 runtime은 예시(example)와 demoData를 읽기 전용으로 판정한다', async () => {
  const vm = await import('node:vm');
  const run = (source, tree) => {
    const scope = {
      window: {},
      document: { querySelectorAll: () => [], getElementById: () => null, addEventListener: () => {} },
      parent: { LT41: { source, tree } },
      addEventListener: () => {},
      setTimeout, clearTimeout
    };
    scope.window = scope;
    vm.runInNewContext(runtime, scope);
    return scope.window.LTDEMO;
  };
  const plain = { id: 't1', title: '내 트리', moments: [], edges: [] };
  const example = { ...plain, id: 'limone-example', demoData: { moments: [], edges: [] } };

  assert.equal(run('server', plain).readOnly, false, '내 책은 그대로 쓸 수 있다');
  assert.equal(run('share', plain).readOnly, true, '공유 감상은 읽기 전용');
  assert.equal(run('example', plain).readOnly, true, '예시는 읽기 전용(#464)');
  assert.equal(run('server', example).readOnly, true, 'demoData가 붙으면 source와 무관하게 읽기 전용');
});

test('#464 편집 손잡이는 읽기 전용에서 하나도 나오지 않는다(고치기·마음 안내)', () => {
  for (const readOnly of [true]) {
    const hands = editAffordances({ readOnly, synthetic: false, hasTitle: true, hasNote: false });
    assert.equal(hands.hint, false, '읽기 전용에서는 "✎ 고치기"를 그리지 않는다');
    assert.equal(hands.guide, false, '읽기 전용에서는 마음 안내("…적어 보세요")를 그리지 않는다');
    assert.equal(hands.title, false, '읽기 전용에서는 제목을 단추로 만들지 않는다');
  }
  const mine = editAffordances({ readOnly: false, synthetic: false, hasTitle: true, hasNote: false });
  assert.equal(mine.hint, true, '내 책에서는 지금 그대로 "고치기"가 보인다');
  assert.equal(mine.guide, true, '내 책에서는 지금 그대로 마음 안내가 보인다');
});

test('#464 책 렌더는 editAffordances 한 곳으로만 손잡이를 정한다(다른 경로가 남아 있지 않다)', () => {
  assert.match(bookExtra, /const hands=editAffordances\(\{readOnly:!!LTDEMO\.readOnly,/, '판정은 한 곳에서');
  // 안내 문구와 '고치기'는 hands를 통해서만 붙는다 — 예전처럼 무조건 붙는 자리가 없어야 한다.
  // #537: 마음 한마디가 비었을 때의 흐린 안내("…적어 보세요")는 내용처럼 읽혀 아예 그리지 않는다.
  // (판정 자체는 그대로 editAffordances 한 곳이 맡는다 — hands.guide는 다른 곳에서 쓸 수 있게 남겨 둔다.)
  assert.doesNotMatch(bookExtra, /class="moment-note is-empty/, '빈 마음 안내는 그리지 않는다(#537)');
  assert.match(bookExtra, /hands\.hint\?'<button type="button" class="title-edit-hint"/, '"고치기"는 hands.hint일 때만');
});

// ── ② 한 장/두 장: 지금 고른 쪽이 눈으로 보인다 ──
test('#464 눌린 보기 단추의 금테가 identity.css 마지막 규칙으로 이긴다', () => {
  // identity.css가 book.css 뒤에 실리므로(스크레치북 17행), 눌린 모양은 identity.css 끝에 있어야 이긴다.
  const idxIdentity = identity.lastIndexOf('[aria-pressed=true]');
  assert.ok(idxIdentity > 0, 'identity.css에 눌린 쪽 규칙이 있다');
  const rule = identity.slice(idxIdentity - 200, idxIdentity + 260);
  assert.match(rule, /view-toggle/, '보기 단추(view-toggle)를 겨냥한다');
  assert.match(rule, /background:var\(--lt-gold\)/, '눌린 쪽은 금빛 바탕(맨 위 메뉴의 지금 보기와 같은 결)');
  assert.match(rule, /border-color:var\(--lt-gold\)/, '금테');
  // book.css의 옛 규칙은 남겨 두되(문서화), identity.css가 덮는다는 사실을 여기서 고정한다.
  assert.match(bookCss, /\.view-toggle \.ui-btn\[aria-pressed=true\]/, 'book.css의 원래 규칙은 그대로 있다');
});

test('#464 스크레치북은 book.css 뒤에 identity.css를 싣는다(그래서 이기는 자리가 identity.css 끝이다)', () => {
  const iBook = sketchbook.indexOf('views/book/book.css');
  const iIdentity = sketchbook.indexOf('/v41/identity.css');
  assert.ok(iBook > 0, 'book.css를 싣는다');
  assert.ok(iIdentity > iBook, 'identity.css가 뒤에 온다 — 눌린 규칙이 뒤에 있어야 이긴다');
});

test('#464 보기 단추는 aria-pressed로 상태를 알리고, 눌린 쪽과 안 눌린 쪽 배경이 다르다', () => {
  const book = read('public/v41/views/book/book.js');
  assert.match(book, /one\.setAttribute\('aria-pressed',String\(s\)\)/, '한 장: aria-pressed로 알린다');
  assert.match(book, /two\.setAttribute\('aria-pressed',String\(!s\)\)/, '두 장: aria-pressed로 알린다');
  // 두 쪽의 배경 규칙이 서로 다른 값을 낸다(같은 값이면 #464가 다시 생긴다).
  const goldRule = /view-toggle \.ui-btn\[aria-pressed=true\][^{]*\{[^}]*background:var\(--lt-gold\)/;
  const mutedRule = /view-toggle \.ui-btn\[aria-pressed=false\][^{]*\{[^}]*background:rgba\(9,8,14,\.35\)/;
  assert.match(identity, goldRule, '눌린 쪽 배경은 금빛');
  assert.match(identity, mutedRule, '안 눌린 쪽 배경은 눌러 둔 색 — 같지 않다');
});
