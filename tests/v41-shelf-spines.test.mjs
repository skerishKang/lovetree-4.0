// 내 책장 책등 목차(#256 2번, 2026-11-09).
// 계산(보일지 말지·책등 목록·누른 책 → 넘기기 위치)은 shelf-model.mjs 함수를 직접 부르고,
// 화면 연결·누르는 영역 크기 같은 규격만 글자로 본다(docs/TESTING.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spineItems, spineScrollLeft, spineStyle, spineTargetIndex, spineVisible } from '../public/v41/views/shelf/shelf-model.mjs';

const read = (relative) => readFileSync(fileURLToPath(new URL('../' + relative, import.meta.url)), 'utf8');
const book = (id, name) => ({ id, name, color: 'var(--lt-cover-' + ((id.length % 4) + 1) + ')' });
const books = (count) => Array.from({ length: count }, (_, index) => book('tree-' + String(index + 1).padStart(2, '0'), '책 ' + (index + 1) + '권째'));

test('책등 목차는 책이 3권부터 보이고 0·1·2권은 숨긴다', () => {
  assert.equal(spineVisible(0), false);
  assert.equal(spineVisible(1), false);
  assert.equal(spineVisible(2), false);
  assert.equal(spineVisible(3), true);
  assert.equal(spineVisible(12), true);
});

test('책등 목록은 책장 순서 그대로 한 줄에 세운다', () => {
  assert.deepEqual(spineItems([]), []);
  assert.deepEqual(spineItems([book('t1', '윤슬')]), [{ id: 't1', name: '윤슬', index: 0, color: 'var(--lt-cover-3)', tilt: -2 }]);
  const twelve = spineItems(books(12));
  assert.equal(twelve.length, 12);
  assert.deepEqual(twelve.map((item) => item.id), books(12).map((b) => b.id)); // 순서 유지
  assert.deepEqual(twelve.map((item) => item.index), Array.from({ length: 12 }, (_, index) => index));
  // 기울임은 눈금(3개)을 돌아가며 살짝씩만 — 책장에 꽂힌 모양.
  assert.deepEqual(twelve.map((item) => item.tilt), [-2, 0, 2, -2, 0, 2, -2, 0, 2, -2, 0, 2]);
  assert.deepEqual(twelve.map((item) => item.name), books(12).map((b) => b.name));
});

test('책등 모양은 표지 색 변수와 기울임을 한 줄 스타일로 넘긴다', () => {
  assert.equal(spineStyle({ color: 'var(--lt-cover-1)', tilt: -2 }), '--cover:var(--lt-cover-1);--tilt:-2deg;');
  assert.equal(spineStyle({ color: 'var(--lt-cover-3)', tilt: 0 }), '--cover:var(--lt-cover-3);--tilt:0deg;');
});

test('누른 책등 → 아래 넘기기가 이동할 자리', () => {
  const list = books(12);
  assert.equal(spineTargetIndex(list, 'tree-01'), 0);
  assert.equal(spineTargetIndex(list, 'tree-07'), 6);
  assert.equal(spineTargetIndex(list, 'tree-12'), 11);
  assert.equal(spineTargetIndex(list, '없는 책'), -1);  // 목차에 없는 책은 무시
  assert.equal(spineTargetIndex([], 'tree-01'), -1);
  // 검색 등으로 목록이 좁아진 상태에서도 남은 책의 자리를 그대로 돌려 준다.
  assert.equal(spineTargetIndex(list.slice(3, 6), 'tree-05'), 1);
});

test('활성 책등을 가운데로 모는 가로 위치는 목차 줄 안에서만 자른다(조상 스크롤 없음)', () => {
  // 390px 줄에 내용 600px(최대 넘김 210px)인 12권 상태 기준.
  assert.equal(spineScrollLeft(390, 600, 0, 46), 0);       // 첫 책등: 이상적 위치가 음수 → 0
  assert.equal(spineScrollLeft(390, 600, 150, 46), 0);     // 이미 보이는 책등: 그대로 0
  assert.equal(spineScrollLeft(390, 600, 277, 46), 105);   // 가운데로 모는 중간값
  assert.equal(spineScrollLeft(390, 600, 554, 46), 210);   // 마지막 책등: 최대값으로 자름
  assert.equal(spineScrollLeft(300, 300, 500, 46), 0);     // 넘침 없는 줄은 늘 0
});

test('화면은 목차 계산을 shelf-model 한 벌에서 불러 쓰고, 목차 자리를 마크업에 둔다', () => {
  const shelfJs = read('public/v41/views/shelf/shelf.js');
  // 모듈 연결: 계산 함수를 shelf-model.mjs에서만 가져와 쓴다.
  assert.match(shelfJs, /spineItems as spineItemsOf, spineScrollLeft as spineScrollLeftOf, spineStyle as spineStyleOf, spineTargetIndex as spineTargetIndexOf, spineVisible as spineVisibleOf,\n  treeTitleOf/);
  assert.match(shelfJs, /var spineVisible = spineVisibleOf, spineItems = spineItemsOf, spineStyle = spineStyleOf, spineTargetIndex = spineTargetIndexOf, spineScrollLeft = spineScrollLeftOf;/);
  // 렌더: 3권부터만 세우고, 책등 누르기는 data-book-id로 넘길 자리를 계산한다.
  assert.match(shelfJs, /nav\.hidden=!visible;/);
  assert.match(shelfJs, /spineItems\(list\)\.map/);
  assert.match(shelfJs, /spineTargetIndex\(state\.shelfList,spine\.dataset\.bookId\)/);
  // 목차 줄의 가로 스크롤만 움직인다(scrollIntoView 금지 — 조상 문서까지 움직인다).
  assert.match(shelfJs, /syncSpines\(true\);/);
  assert.match(shelfJs, /row\.scrollTo\(\{left:spineScrollLeft\(row\.clientWidth,row\.scrollWidth,rect\.left-rowRect\.left\+row\.scrollLeft,rect\.width\),behavior:instant\?'auto':'smooth'\}\)/);
  assert.ok(!/\.scrollIntoView\(/.test(shelfJs), 'scrollIntoView 호출은 조상 문서도 움직이므로 쓰지 않는다');
  // 레일이 움직이면 목차 선택도 함께 맞춘다.
  assert.match(shelfJs, /syncSpines\(\);\n        setShelfAtmosphere/);
  const html = read('public/v41/views/track32-bookshelf.html');
  assert.match(html, /<nav class="shelf-spines" id="shelfSpines" aria-label="트리 목차" hidden>/);
  assert.match(html, /<div class="shelf-spine-row" id="shelfSpineRow"><\/div>/);
});

test('책등은 누르는 영역이 44px 이상이고, 넘치는 목차는 가로로만 넘긴다', () => {
  const css = read('public/v41/views/shelf/shelf.css');
  // 누르는 영역: 46×118px (44px 이상). 키보드는 기본 button 포커스·Enter로 이동한다.
  assert.match(css, /\.shelf-spine \{[^}]*width: 46px; height: 118px;/s);
  assert.match(css, /\.shelf-spine-row \{[^}]*overflow-x: auto; overflow-y: hidden;/s, '12권처럼 많아지면 이 줄만 가로로 넘긴다(줄바꿈 금지)');
  assert.ok(!/\.shelf-spine-row \{[^}]*flex-wrap/s.test(css), '책등 목차는 줄바꿈하지 않는다');
  // 표시 글꼴은 테마를 따른다(밤=Pretendard·정원=MaruBuri — identity.css가 --lt-font-display를 정한다).
  assert.match(css, /\.shelf-spine-title \{[^}]*font: 700 12px\/1\.25 var\(--lt-font-display,var\(--display\)\);/s);
  // 밤 덧칠은 identity.css 밤 책장 블록에만 둔다.
  const identity = read('public/v41/identity.css');
  assert.match(identity, /html\[data-v41-screen=shelf\]:not\(\[data-lt-theme=garden\]\) \.shelf-spine\{color:var\(--lt-pearl\)/);
  assert.match(identity, /html\[data-v41-screen=shelf\]:not\(\[data-lt-theme=garden\]\) \.shelf-spine\.is-active\{box-shadow:0 0 0 1px var\(--lt-gold-line\)/);
  assert.ok(!/shelf-spine/.test(read('public/v41/views/shelf/shelf-extra.css')), '책등 규칙은 겉모습 덧칠 파일에 섞지 않는다');
});
