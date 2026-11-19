// 내 책장 계산·동작 시험 (#231 후속, 2026-11-09).
// 글자 검사 대신 함수를 직접 부른다: 표지·이름·정보 줄·검색·카드 배치·페이지·장 넘김.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COVER_PALETTE, addedLabel, allBooks, bookMeta, buildShelf, carouselTransform, coverStyle, escapeShelf,
  filterShelf, findBook, lastMomentDate, leftPageMarkup, pageMeta, pageTarget, resolveShelfIndex,
  resumeCard, rightPageMarkup, shelfBook, shelfRowLayout, treeTitleOf, youtubeId
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

test('표지 아래 정보 줄은 "순간 N개 · 언제 담았는지" 하나다(261118 대표 지적 5)', () => {
  const now = new Date(2026, 9, 9, 12, 0, 0); // 2026-10-09
  assert.equal(bookMeta({ chapters: [1, 2, 3], lastDate: '2026-10-02' }, now), '3개 순간 · 7일 전 추가');
  assert.equal(bookMeta({ chapters: [1], lastDate: '2026-10-08' }, now), '1개 순간 · 어제 추가');
  assert.equal(bookMeta({ chapters: [1], lastDate: '2026-10-09' }, now), '1개 순간 · 오늘 추가');
  assert.equal(bookMeta({ chapters: [], lastDate: '' }, now), '0개 순간');
  assert.equal(addedLabel('2026-10-04', now), '5일 전 추가');
  assert.equal(addedLabel('2026-10-01', now), '10월 1일 추가');
  assert.equal(addedLabel('2026-10-10', now), '오늘 추가'); // 미래 날짜는 오늘로 본다
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
    [0, { x: 0, y: 0, z: 0, scale: 1.06, rotate: 0, alpha: 1, zIndex: 100, pointerEvents: 'auto', filter: 'none' }],
    [1, { x: 200, y: 0, z: 0, scale: 1, rotate: -12, alpha: 0.9, zIndex: 99, pointerEvents: 'auto', filter: 'none' }],
    [-1, { x: -200, y: 0, z: 0, scale: 1, rotate: 12, alpha: 0.9, zIndex: 99, pointerEvents: 'auto', filter: 'none' }],
    [2, { x: 400, y: 0, z: 0, scale: 1, rotate: -12, alpha: 0.8, zIndex: 98, pointerEvents: 'auto', filter: 'none' }],
    [3, { x: 600, y: 0, z: 0, scale: 1, rotate: -12, alpha: 0.6, zIndex: 97, pointerEvents: 'auto', filter: 'saturate(.72) brightness(.86)' }],
    [4, { x: 800, y: 0, z: 0, scale: 1, rotate: -12, alpha: 0.6, zIndex: 96, pointerEvents: 'none', filter: 'saturate(.72) brightness(.86)' }]
  ];
  // 261118 대표 지적 2차: 배율·깊이 이동으로 글자를 줄이지 않는다 — 옆 책도 scale 1, 설명 글자는 실제 12px 렌더.
  // 4번째 이후 책 투명도는 0.6 이상으로 남는다.
  for (const [distance, expected] of table) assert.deepEqual({ ...carouselTransform(distance), z: carouselTransform(distance).z + 0 }, expected, 'distance ' + distance);
});

test('#서재-빈공간: 넓은 화면(레일 1800px 이상)에서는 흐림 기준이 ±2→±4로 완화된다 — 좌표·배율·돌림은 그대로', () => {
  const base = carouselTransform(3);
  const wide = carouselTransform(3, true);
  assert.equal(wide.x, base.x, '좌표는 같다');
  assert.equal(wide.rotate, base.rotate, '돌림은 같다');
  assert.equal(wide.filter, 'none', '3칸 옆 책은 흐리지 않는다(기준 ±4)');
  assert.equal(carouselTransform(4, true).filter, 'none', '4칸까지 선명');
  assert.equal(carouselTransform(5, true).filter, 'saturate(.72) brightness(.86)', '5칸부터 흐린다');
  assert.equal(carouselTransform(2, true).alpha, 0.85, '2칸 옆 책 투명도 완화');
  assert.equal(carouselTransform(4, true).alpha, 0.75);
  assert.equal(carouselTransform(6, true).pointerEvents, 'auto', '6칸까지는 누를 수 있다');
  assert.equal(carouselTransform(7, true).pointerEvents, 'none');
  // 좁은 화면(기존)은 그대로다.
  assert.equal(carouselTransform(3, false).filter, 'saturate(.72) brightness(.86)');
  assert.equal(carouselTransform(3).filter, 'saturate(.72) brightness(.86)');
});

test('#서재-빈공간 → 11-19 대표 결정 + #944: 책 위치는 늘 왼쪽 끝, 넘칠 때만 한 칸씩 민다', () => {
  // 1440(레일 1300): 책 1·3·4·6권은 다 들어간다 → 책장처럼 왼쪽 안쪽 여백부터 나란히.
  const row = shelfRowLayout(6, 1300);
  assert.equal(row.mode, 'row', '1440에서도 왼쪽부터');
  assert.equal(row.fits, true);
  assert.equal(row.wide, false, '1440은 넓은 화면 흐림 완화 대상이 아니다');
  assert.equal(row.leftX, 95 - 1300 / 2, '첫 책 시작점 = 책장 왼쪽 안쪽 여백');
  assert.equal(row.xOf(0), row.leftX, '첫 책은 왼쪽 안쪽 여백');
  assert.equal(row.xOf(5), row.leftX + 5 * 200, '끝 책도 같은 간격으로 나란히');
  assert.equal(row.xOf(2) - row.xOf(1), 200, '책 간격 고르게');
  assert.equal(row.xOf(3) - row.xOf(2), 200, '책 간격 고르게');
  assert.equal(row.maxOffset, 0, '다 들어가면 넘길 칸 없다');
  // 2560(레일 1818)도 같은 규칙. 첫 책은 왼쪽 끝에 그대로 있고 오른쪽만 여유가 늘어난다.
  const wide = shelfRowLayout(6, 1818);
  assert.equal(wide.mode, 'row');
  assert.equal(wide.wide, true);
  assert.equal(wide.xOf(0), 95 - 1818 / 2, '2560에서도 첫 책은 왼쪽 끝');
  assert.equal(wide.xOf(2) - wide.xOf(1), 200);
  // 책 1권도 왼쪽 끝에 고정(가운데에 두지 않는다).
  assert.equal(shelfRowLayout(1, 1300).xOf(0), 95 - 1300 / 2);
  assert.equal(shelfRowLayout(1, 1818).mode, 'row');
  // 390(레일 ≈ 280)에서도 1권은 왼쪽부터, 3·4권은 안 들어가 넘김 배치.
  assert.equal(shelfRowLayout(1, 280).mode, 'row');
  assert.equal(shelfRowLayout(1, 280).xOf(0), 95 - 280 / 2);
  const small = shelfRowLayout(3, 280);
  assert.equal(small.mode, 'carousel');
  assert.equal(small.fits, false);
  assert.equal(small.xOf(0, 0), small.leftX, '390 넘김도 첫 책은 왼쪽 끝');
  // #944: 1440에서 12권 — 가운데(x≈640)서 시작하지 않고 첫 책이 왼쪽 안쪽 여백에서 시작한다.
  const over1440 = shelfRowLayout(12, 1300);
  assert.equal(over1440.mode, 'carousel');
  assert.equal(over1440.fits, false, '화살표 2개');
  assert.equal(over1440.xOf(0, 0), over1440.leftX, '첫 화면 첫 책 = 왼쪽 끝(왼쪽 빈 영역 0)');
  assert.equal(over1440.xOf(1, 0) - over1440.xOf(0, 0), 200, '책 간격 고르게');
  assert.equal(over1440.visible, 6);
  assert.equal(over1440.maxOffset, 6);
  assert.equal(over1440.xOf(0, 1) - over1440.xOf(0, 0), -200, '화살표 한 번 = 한 칸(200px)');
  assert.equal(over1440.offsetFor(0, 0), 0, '첫 책이 고여 있으면 처음 위치 유지');
  // #944: 이어 보기로 뒤쪽 책이 고여도 가운데로 가지 않고 보이게만 최소로 민다.
  assert.equal(over1440.offsetFor(9, 0), 4, '9번 책은 오른쪽 끝에 보이게만');
  assert.equal(over1440.offsetFor(9, 4), 4, '이미 보이면 그대로');
  assert.equal(over1440.offsetFor(2, 4), 2, '앞쪽 책이면 왼쪽 끝에 보이게만');
  // 2560에서 12권도 같은 규칙(9권이 보이므로 3칸만 넘긴다).
  const over = shelfRowLayout(12, 1818);
  assert.equal(over.mode, 'carousel');
  assert.equal(over.fits, false, '화살표 2개');
  assert.equal(over.wide, true, '넘쳐도 넓은 화면 흐림 완화는 유지');
  assert.equal(over.xOf(0, 0), over.leftX, '2560 넘김도 첫 책은 왼쪽 끝');
  assert.equal(over.visible, 9);
  assert.equal(over.maxOffset, 3);
  assert.equal(over.offsetFor(11, 0), 3, '마지막 책도 가운데 아닌 오른쪽 끝에 보이게만');
  // 화살표 판정은 fits 하나에서 나온다: 다 들어가면 0개, 넘치면 2개.
  assert.equal(shelfRowLayout(3, 1300).fits, true, '다 들어가면 화살표 0개');
  assert.equal(shelfRowLayout(3, 280).fits, false, '넘치면 화살표 2개');
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

// ── 이어 읽기 칸(#256-1): 어떤 칸을 보여줄지·문구는 shelf-model 한 벌이 정한다 ──
test('이어 읽기 칸 표(출처·저장 위치·문구)', () => {
  const books = buildShelf([tree(), tree({ id: 'tree2', title: '바다', subject: '여름', moments: [moment('s1', { title: '파도 사진' })] })], COVER_PALETTE, (v) => v);
  const cases = [
    // [source, treeId, momentId, 기대 kind, 기대 문구, 기대 책, 기대 순간]
    ['server', 'tree1', 'm2', 'resume', '지난번 m2 순간까지 봤어요', 'tree1', 'm2'],
    ['server', 'tree1', '', 'resume', '지난번 p1 순간까지 봤어요', 'tree1', 'p1'],      // 위치 없으면 첫 순간
    ['server', 'gone', 'gone', 'resume', '지난번 p1 순간까지 봤어요', 'tree1', 'p1'],  // 지워진 트리 → 첫 책
    ['server', '', '', 'resume', '지난번 p1 순간까지 봤어요', 'tree1', 'p1'],
    ['example', '', '', 'example', '예시 책 펼쳐 보기', 'tree1', 'p1'],
    ['file', '', '', 'example', '예시 책 펼쳐 보기', 'tree1', 'p1'],
    ['server', '', '', 'first', '첫 책을 펼쳐 보세요', null, null] // books 비면(빈 계정) 아래에서 따로
  ];
  for (const [source, treeId, momentId, kind, title, bookId, momentId2] of cases.slice(0, -1)) {
    const info = resumeCard({ source, treeId, momentId, books });
    assert.equal(info.kind, kind, [source, treeId, momentId].join('/'));
    assert.equal(info.title, title);
    assert.equal(info.book ? info.book.id : null, bookId);
    assert.equal(info.moment ? info.moment.id : null, momentId2);
    assert.equal(info.action, kind === 'resume' ? '이어 보기' : '펼쳐 보기');
    // 이어 보기 띠(261118 대표 지적 4)가 쓰는 값: 트리 이름·순간 제목. 주소 문구는 없다.
    assert.equal(info.treeName, bookId ? '첫사랑, 나의 순간들' : '');
    if (momentId2) assert.equal(info.momentTitle, info.moment.title.replace(/[.。!?！？]+$/u, ''));
    assert.ok(!('url' in info));
  }
  // 기록이 없는(트리 0개) 계정
  const empty = resumeCard({ source: 'server', treeId: '', momentId: '', books: [] });
  assert.deepEqual({ kind: empty.kind, title: empty.title, book: empty.book }, { kind: 'first', title: '첫 책을 펼쳐 보세요', book: null });
  // 예시 칸은 '펼쳐 보기'로 부른다 — '이어 보기'는 저장 위치가 있을 때만.
  assert.equal(resumeCard({ source: 'example', books }).action, '펼쳐 보기');
});

test('이어 읽기 문구는 자동 제목 끝의 마침표를 덧붙이지 않는다', () => {
  const books = buildShelf([tree({ moments: [moment('p1', { title: '아침 커피와 함께 시작한 작은 기록.' })] })], COVER_PALETTE, (v) => v);
  const info = resumeCard({ source: 'server', treeId: 'tree1', momentId: 'p1', books });
  assert.equal(info.title, '지난번 아침 커피와 함께 시작한 작은 기록까지 봤어요');
});

// ── #256-1 보완(CTO 검토): 칸은 책 목록이 바뀔 때 다시 그린다 ──
// shelf.js를 가짜 DOM으로 싣어 본다. 모델 시험만으로는 "다시 그림"이 보이지 않기 때문이다.
test('새 책을 만들면 이어 보기 띠를 다시 그린다 · 검색으로 좁아져도 띠는 그대로', async () => {
  const els = new Map();
  const el = (selector) => {
    if (!els.has(selector)) els.set(selector, fakeEl({
      style: { setProperty(name, value) { this.props = { ...(this.props || {}), [name]: value }; }, props: {} },
      innerHTML: '',
      value: '',
      scrollTo() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
      reset() {},
      children: [],
      scrollLeft: 0, clientWidth: 100, scrollWidth: 100
    }));
    return els.get(selector);
  };
  const library = { list: [] };
  globalThis.window = globalThis;
  globalThis.document = {
    querySelector: (selector) => el(selector),
    querySelectorAll: () => [],
    addEventListener() {},
    body: fakeEl()
  };
  globalThis.parent = { LT41: { source: 'server', tree: { id: 'tree1', title: '트리' }, momentId: 'm1' }, postMessage() {} };
  globalThis.LTDEMO = { library: library.list, moments: [], get: () => globalThis.parent.LT41.momentId, select() {}, openBook() {} };
  globalThis.CSS = { escape: (value) => String(value).replace(/"/g, '\\"') };
  await import('../public/v41/views/shelf/shelf.js');
  // 처음: 책이 없으면 띠를 숨긴다(소개 문이 그 자리를 쓴다 — 트리 0개 화면은 #817)
  assert.equal(el('#resumeStrip').hidden, true, '책이 없으면 이어 보기 띠를 숨긴다');
  // 새 책 만들기 폼을 제출하면 띠가 다시 그려진다(숨은 채로 남지 않는다)
  el('#newBookName').value = '가을 산책';
  el('#newBookUrl').value = 'https://example.com/a';
  el('#newBookForm').dispatch('submit', { preventDefault() {} });
  assert.equal(el('#resumeStrip').hidden, false, '새 책 뒤에는 띠가 보인다');
  assert.equal(el('#resumeStrip').dataset.resumeKind, 'resume');
  assert.equal(el('#resumeTree').textContent, '가을 산책');
  assert.match(el('#resumeMoment').textContent, /처음 마음이 움직인 장면|첫 마음/);
  assert.equal(el('#resumeGo').textContent, '이어 보기 ▶');
  // 검색으로 레일이 좁아져도(0권) 띠는 전체 책 기준이라 그대로다
  el('#searchInput').value = '찾을 수 없는 책 이름';
  el('#searchInput').dispatch('input', { target: el('#searchInput') });
  assert.equal(el('#resultCount').textContent, '트리 0개');
  assert.equal(el('#resumeStrip').hidden, false, '검색으로 좁아져도 띠는 바뀌지 않는다');
  assert.equal(el('#resumeStrip').dataset.resumeKind, 'resume');
});
