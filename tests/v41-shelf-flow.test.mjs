// 내 책장 계산·동작 시험 (#231 후속, 2026-11-09).
// 글자 검사 대신 함수를 직접 부른다: 표지·이름·정보 줄·검색·카드 배치·페이지·장 넘김.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COVER_PALETTE, allBooks, bookMeta, buildShelf, carouselTransform, coverStyle, escapeShelf,
  filterShelf, findBook, lastMomentDate, leftPageMarkup, pageMeta, pageTarget, resolveShelfIndex,
  rightPageMarkup, shelfBook, treeTitleOf, youtubeId
} from '../public/v41/views/shelf/shelf-model.mjs';
import { createReader } from '../public/v41/views/shelf/shelf-reader.js';
import { fakeEl } from './helpers/fake-dom.mjs';

const moment = (id, extra = {}) => ({ id, title: id + ' 순간', date: '2026-10-0' + (id.length % 9 + 1), emotion: '설렘', type: 'photo', ...extra });
const tree = (extra = {}) => ({
  id: 'tree1', title: '첫사랑, 나의 순간들', subject: '첫사랑', coverMomentId: 'p1',
  moments: [moment('p1', { type: 'photo', image: 'https://img.test/1.jpg' }), moment('m2', { memo: '메모 본문' })],
  ...extra
});

test('표지 색은 테마 변수를 순서대로 돌려 쓰고 이름은 표시 규칙을 한 번만 통과한다', () => {
  const namer = (value) => String(value).replace(/, 나의 순간들$/, '');
  const books = buildShelf([tree(), tree({ id: 'tree2', title: '두번째' }), tree({ id: 'tree3' }), tree({ id: 'tree4' }), tree({ id: 'tree5' })], COVER_PALETTE, namer);
  assert.deepEqual(books.map((b) => b.color), ['var(--lt-cover-1)', 'var(--lt-cover-2)', 'var(--lt-cover-3)', 'var(--lt-cover-4)', 'var(--lt-cover-1)']);
  assert.equal(books[0].name, '첫사랑');
  assert.equal(books[1].name, '두번째');
  // 표지 사진은 coverMomentId가 사진 순간일 때만 쓴다.
  assert.equal(books[0].coverMedia, 'https://img.test/1.jpg');
  assert.equal(buildShelf([tree({ coverMomentId: 'm2' })], COVER_PALETTE, namer)[0].coverMedia, '');
  assert.equal(treeTitleOf('그대로', null), '그대로');
});

test('책 설명·꼬리표·장 목록은 실제 기록에서 오고 note는 memo를 먼저 쓴다', () => {
  const book = shelfBook(tree(), 0, COVER_PALETTE, (v) => v);
  assert.equal(book.description, '좋아하는 대상 · 첫사랑');
  assert.deepEqual(book.tags, ['첫사랑']);
  assert.equal(shelfBook(tree({ subject: '' }), 0, COVER_PALETTE, (v) => v).description, '좋아하는 대상을 기록한 책입니다.');
  assert.deepEqual(shelfBook(tree({ subject: '' }), 0, COVER_PALETTE, (v) => v).tags, ['좋아하는 대상']);
  assert.deepEqual(book.chapters.map((c) => c.note), ['', '메모 본문']);
  assert.equal(book.chapters[0].url, '');
  assert.equal(lastMomentDate(tree()), '2026-10-03');
  assert.equal(lastMomentDate({ moments: [] }), '');
});

test('표지 아래 정보 줄은 "순간 N개 · 마지막 날짜" 하나다', () => {
  assert.equal(bookMeta({ chapters: [1, 2, 3], lastDate: '2026-10-02' }), '3개 순간 · 마지막 2026-10-02');
  assert.equal(bookMeta({ chapters: [], lastDate: '' }), '0개 순간 · 마지막 -');
  assert.equal(coverStyle({ id: 'a', color: 'c1', accent: 'c2' }), '--cover:c1;--cover-accent:c2;--tilt:-1deg;');
  assert.equal(coverStyle({ id: 'ab', color: 'c1', accent: 'c2' }), '--cover:c1;--cover-accent:c2;--tilt:0deg;');
  assert.equal(escapeShelf('<b>&"</b>'), '&lt;b&gt;&amp;&quot;&lt;/b&gt;');
});

test('검색은 이름·설명·꼬리표·장 제목을 보고 앞뒤 공백은 무시한다', () => {
  const books = buildShelf([tree(), tree({ id: 'tree2', title: '바다', subject: '여름', moments: [moment('s1', { title: '파도' })] })], COVER_PALETTE, (v) => v);
  const titles = (filter, query) => filterShelf(books, filter, query).map((b) => b.name);
  assert.deepEqual(titles('all', ''), ['첫사랑, 나의 순간들', '바다']);
  assert.deepEqual(titles('all', '  바다 '), ['바다']);
  assert.deepEqual(titles('all', '여름'), ['바다']);           // 꼬리표·설명
  assert.deepEqual(titles('all', 'm2 순간'), ['첫사랑, 나의 순간들']); // 장 제목
  assert.deepEqual(titles('all', '파도'), ['바다']);
  assert.deepEqual(titles('all', '없는말'), []);
  assert.equal(allBooks([books[0]], []).length, 1);
  assert.equal(findBook(books, 'tree2').name, '바다');
});

test('목록이 바뀌면 가운데 책을 다시 고른다', () => {
  const books = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(resolveShelfIndex([], 'b', 2), 0);
  assert.equal(resolveShelfIndex(books, 'c', 0), 2);
  assert.equal(resolveShelfIndex(books, 'zzz', 2), 2);
  assert.equal(resolveShelfIndex(books, 'zzz', 9), 2);
  assert.equal(resolveShelfIndex(books, null, -3), 0);
});

test('레일 위 카드 배치 표(거리 → 좌표·배율·투명도)', () => {
  const table = [
    [0, { x: 0, y: 6, z: 0, scale: 1.06, rotate: 0, alpha: 1, zIndex: 100, pointerEvents: 'auto', filter: 'none' }],
    [1, { x: 166, y: 8, z: -78, scale: 0.82, rotate: -22, alpha: 0.9, zIndex: 99, pointerEvents: 'auto', filter: 'none' }],
    [-1, { x: -166, y: 8, z: -78, scale: 0.82, rotate: 22, alpha: 0.9, zIndex: 99, pointerEvents: 'auto', filter: 'none' }],
    [2, { x: 332, y: 16, z: -156, scale: 0.66, rotate: -22, alpha: 0.66, zIndex: 98, pointerEvents: 'auto', filter: 'none' }],
    [3, { x: 496, y: 24, z: -234, scale: 0.54, rotate: -22, alpha: 0.28, zIndex: 97, pointerEvents: 'auto', filter: 'saturate(.72) brightness(.86)' }],
    [4, { x: 654, y: 28, z: -312, scale: 0.54, rotate: -22, alpha: 0, zIndex: 96, pointerEvents: 'none', filter: 'saturate(.72) brightness(.86)' }]
  ];
  // z는 원본 계산식(-absolute*78)이라 거리 0에서 -0이 된다. 값은 같으므로 부호만 맞춰 본다.
  for (const [distance, expected] of table) assert.deepEqual({ ...carouselTransform(distance), z: carouselTransform(distance).z + 0 }, expected, 'distance ' + distance);
});

test('페이지 표시·화살표 상태·넘김 가능 범위', () => {
  assert.deepEqual(pageMeta(0, 3), { counter: 'PAGE 01 / 03', prevDisabled: true, nextDisabled: false });
  assert.deepEqual(pageMeta(2, 3), { counter: 'PAGE 03 / 03', prevDisabled: false, nextDisabled: true });
  assert.equal(pageTarget(1, 3, 1, undefined), 2);
  assert.equal(pageTarget(1, 3, -1, undefined), 0);
  assert.equal(pageTarget(1, 3, 1, 0), 0);       // 강제 이동
  assert.equal(pageTarget(0, 3, -1, undefined), null);
  assert.equal(pageTarget(2, 3, 1, undefined), null);
});

test('책 안 두 쪽 문구는 첫 장/지난 장·영상 안내를 그대로 쓴다', () => {
  const book = shelfBook(tree(), 0, COVER_PALETTE, (v) => v);
  assert.match(leftPageMarkup(book, 0), /첫 마음 · 첫사랑, 나의 순간들/);
  assert.match(leftPageMarkup(book, 1), /PREVIOUS CHAPTER · 01.*p1 순간/s);
  const photo = rightPageMarkup(book, 0);
  assert.match(photo, /순간 · 01 · 설렘/);
  assert.match(photo, /사진 · 내 기록/);
  assert.match(photo, /<img src="https:\/\/img\.test\/1\.jpg"/);
  const video = rightPageMarkup({ ...book, chapters: [{ ...book.chapters[0], type: 'video', image: '' }] }, 0);
  assert.match(video, /영상의 예시 이미지입니다/);
  assert.match(video, /영상 예시 · 내 기록/);
});

test('유튜브 주소에서 영상 ID를 뽑고 LTMedia 설명이 있으면 그것을 먼저 쓴다', () => {
  assert.equal(youtubeId('https://youtu.be/abcdefghijk'), 'abcdefghijk');
  assert.equal(youtubeId('https://www.youtube.com/watch?v=abcdefghijk'), 'abcdefghijk');
  assert.equal(youtubeId('https://www.youtube.com/shorts/abcdefghijk'), 'abcdefghijk');
  assert.equal(youtubeId('https://example.test/watch?v=abcdefghijk'), '');
  assert.equal(youtubeId('ftp://youtu.be/abcdefghijk'), '');
  assert.equal(youtubeId('https://youtu.be/short'), '');
  assert.equal(youtubeId('https://www.youtube.com/watch?v=abcdefghijk', () => ({ kind: 'youtube', videoId: 'zzzzzzzzzzz' })), 'zzzzzzzzzzz');
  assert.equal(youtubeId('', null), '');
});

// 책을 펼친 화면: 장 끝에서 안내 문구, 넘기면 840ms 뒤 장이 바뀐다.
function readerHarness() {
  const ids = ['leftPage', 'rightPage', 'underPage', 'pageCounter', 'prevPage', 'nextPage', 'turnSheet', 'chapterList', 'toast', 'shelfRail'];
  const nodes = Object.fromEntries(ids.map((id) => [id, fakeEl({ style: { setProperty() {}, removeProperty() {} }, innerHTML: '', className: '' })]));
  const toasts = [];
  const state = { chapterIndex: 0, open: true, pageTurning: false, selectedId: 'tree1', shelfList: [] };
  const book = shelfBook(tree(), 0, COVER_PALETTE, (v) => v);
  const reader = createReader({
    $: (selector) => nodes[selector.replace('#', '')] || fakeEl(),
    $$: () => [],
    state,
    getBook: () => book,
    showToast: (message) => toasts.push(message),
    save: () => {},
    renderShelf: () => {},
    getShelfCard: () => null
  });
  reader.renderPage(book);
  return { reader, state, nodes, toasts, book };
}

test('책 안에서 첫/마지막 장을 더 넘기면 안내만 하고 장은 그대로다', () => {
  const h = readerHarness();
  assert.equal(h.nodes.pageCounter.textContent, 'PAGE 01 / 02');
  h.reader.turnPage(-1);
  assert.deepEqual(h.toasts, ['첫 순간예요.']);
  assert.equal(h.state.chapterIndex, 0);
  assert.equal(h.state.pageTurning, false);

  h.reader.turnPage(1);
  assert.equal(h.state.pageTurning, true);            // 넘김 애니메이션 동안 잠금
  assert.equal(h.nodes.turnSheet.className, 'sheet turn-next');
  h.reader.turnPage(1);                               // 잠금 중 두 번째 요청은 무시
  assert.equal(h.state.pageTurning, true);
  h.reader.turnPage(1, 5);                            // 잠금 중이면 범위 밖 요청도 조용히 지나간다
  assert.deepEqual(h.toasts, ['첫 순간예요.']);

  return new Promise((resolve) => setTimeout(() => {
    assert.equal(h.state.chapterIndex, 1);
    assert.equal(h.state.pageTurning, false);
    assert.equal(h.nodes.turnSheet.className, 'sheet');
    assert.equal(h.nodes.pageCounter.textContent, 'PAGE 02 / 02');
    assert.equal(h.nodes.nextPage.disabled, true);
    assert.equal(h.nodes.prevPage.disabled, false);
    // 마지막 장에서는 넘길 수 없다 — 안내만.
    h.reader.turnPage(1);
    assert.deepEqual(h.toasts, ['첫 순간예요.', '마지막 순간예요.']);
    resolve();
  }, 900));
});

test('책을 열면 셸에 기록 id를 넘기고, 이미 열려 있으면 다시 열지 않는다', () => {
  const h = readerHarness();
  h.state.open = false;
  const opened = [];
  const openedBooks = [];
  globalThis.LTDEMO = { get: () => 'm2', openBook: (momentId, treeId) => { opened.push(momentId); openedBooks.push(treeId); } };
  const nodes = {
    bookCoverFace: fakeEl({ style: { setProperty() {}, removeProperty() {} }, getBoundingClientRect: () => ({ left: 10, top: 10, width: 100, height: 100 }), querySelector: () => fakeEl({ style: { setProperty() {} } }) }),
    shelfScreen: fakeEl({ style: {}, classList: fakeEl().classList }),
    readerScreen: fakeEl({ style: {}, classList: fakeEl().classList })
  };
  const stub = () => fakeEl({ style: { setProperty() {}, removeProperty() {} }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }), querySelector: () => stub() });
  const reader = createReader({
    $: (selector) => nodes[selector.replace('#', '')] || stub(),
    $$: () => [],
    state: h.state,
    getBook: () => h.book,
    showToast: () => {},
    save: () => {},
    renderShelf: () => {},
    getShelfCard: () => null
  });
  reader.openReader('tree1', null);
  assert.equal(h.state.selectedId, 'tree1');
  assert.equal(h.state.chapterIndex, 1);           // 셸이 기억한 순간(m2)에서 시작
  assert.deepEqual(opened, ['m2']);
  assert.deepEqual(openedBooks, ['tree1']);
  delete globalThis.LTDEMO;
});
