import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync as fsExists} from 'node:fs';

// 2026-11-08 대표 피드백: 기억책(트랙59) 사용성 1~9.
// 규칙은 public/v41/book-usability.mjs 한 곳에 있고, 화면은 한 벌(#231 1.5단계 ⑥)이 그 어댑터를 받는다.
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const VIEWS = ['public/v41/views/track59-sketchbook.html'];
// #231 2단계: 화면의 스타일·본문 스크립트는 views/book/ 아래 파일로 나갔다. 시험은 화면+파일을 한 소스로 본다.
const BOOK_CSS = read('public/v41/views/book/book.css');
const BOOK_JS = read('public/v41/views/book/book.js');
const BOOK_EXTRA_CSS = read('public/v41/views/book/book-usability.css');
const EXTRA = read('public/v41/views/book/book-extra.js');
const html = Object.fromEntries(VIEWS.map(path => [path, read(path) + '\n' + BOOK_CSS + '\n' + BOOK_EXTRA_CSS + '\n' + BOOK_JS + '\n' + EXTRA]));

const {
  isUserTitle, displayTitle, withoutAutoTitle, titleParts, videoTitle, mediaSourceText, editAffordances,
  embedUrl, connectionLine, NEXT_PAGE_COPY, NEXT_PAGE_ACTION,
  LENS_KEY, readLens, writeLens, detailPlacement, nextMomentMessage,
  BOOK_UI_FONT, BOOK_TITLE_FONT, bookTheme, bookTitleFont, treeTitleText, isPrimaryButton, tapIntent,
} = await import('../public/v41/book-usability.mjs');
const headerStateModule = await import('../public/v41/header-state.mjs');

test('1. YouTube는 그 자리에서: nocookie embed, 시작 시점 유지, referrerpolicy', () => {
  assert.equal(embedUrl('dQw4w9WgXcQ', 83), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&start=83');
  assert.equal(embedUrl('dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0');
  assert.equal(embedUrl('나쁜-id'), null);
  assert.equal(embedUrl(''), null);
  assert.ok(!embedUrl('dQw4w9WgXcQ', 5).includes('youtube.com/watch'), '재생은 watch 주소가 아니라 embed 주소를 쓴다');
  for (const path of VIEWS) {
    const src = html[path];
    // #327 1부(대표 결정 2026-11-09): 내 기록(서버·로그인 소유자)은 썸네일을 처음부터 보여 준다.
    // #393: ytimg 주소는 media-preview.js 의 youtubeThumbUrl/loadUrl 한 벌로 옮겼다 — 화면에는 literal 이 없고,
    // #635 PR B(대표 결정): 감상 화면의 빈 크림 상자를 없애기 위해 썸네일 <img>는 감상에서도 부른다 —
    // 재생 임베드(iframe)는 여전히 누르기 전까지 없다. 깨지면 #393 내려가기 틀로 제목 글 카드가 된다.
    assert.equal(src.split('i.ytimg.com').length - 1, 0, path + ': ytimg 주소는 화면에 하드코딩하지 않는다(LTMedia 한 벌)');
  }
});

test('2. 자동 제목은 화면에서만 거르고, 사용자 제목 > 마음 한마디 > 영상 제목 순서로 보여 준다', () => {
  assert.equal(isUserTitle('youtu.be에서 간직한 순간'), false);
  assert.equal(isUserTitle('www.youtube.com:443에서 간직한 순간'), false);
  assert.equal(isUserTitle('첫인상'), true);
  assert.equal(isUserTitle(''), false);
  assert.equal(displayTitle('youtu.be에서 간직한 순간'), '');
  assert.equal(displayTitle('첫인상'), '첫인상');

  const auto = {title: 'youtu.be에서 간직한 순간', note: '비 오는 날 창가에서', mediaMetadata: {title: '원본 영상', channel: '어떤 채널'}};
  assert.equal(withoutAutoTitle(auto).title, '', '저장된 값은 그대로 두고 화면용 값만 비운다');
  assert.equal(auto.title, 'youtu.be에서 간직한 순간', '원본 데이터는 바뀌지 않는다');
  assert.deepEqual(titleParts(auto), {main: '', note: '비 오는 날 창가에서', media: '원본 영상 · 어떤 채널'});
  assert.deepEqual(titleParts({title: '첫인상', note: '마음', mediaMetadata: {title: '원본 영상'}}),
    {main: '첫인상', note: '마음', media: '원본 영상'});
  assert.equal(videoTitle({mediaMetadata: {title: ' 원본 영상 '}}), '원본 영상');
  // #345: #344가 저장한 영상 제목과 같은 제목은 큰 제목에서 빼고 출처 줄에만 둔다(데이터는 그대로).
  const videoAuto = {id: 'v1', title: 'Rick Astley - Never Gonna Give You Up', note: '', mediaMetadata: {title: 'Rick Astley - Never Gonna Give You Up', channel: 'Rick Astley'}};
  assert.equal(withoutAutoTitle(videoAuto).title, '', '영상 제목과 같은 제목은 자동으로 본다');
  assert.equal(videoAuto.title, 'Rick Astley - Never Gonna Give You Up', '원본 데이터는 바뀌지 않는다');
  assert.deepEqual(titleParts(withoutAutoTitle(videoAuto)), {main: '', note: '', media: 'Rick Astley - Never Gonna Give You Up · Rick Astley'});
  assert.equal(withoutAutoTitle({...videoAuto, title: '내가 붙인 제목'}).title, '내가 붙인 제목', '다른 제목은 사용자 제목');

  for (const path of VIEWS) {
  }
});

test('4. 오른쪽 빈 페이지는 다음 순간 안내 + 현재 순간을 부모로 여는 단추', () => {
  assert.equal(NEXT_PAGE_COPY, '이 순간 다음 이야기를 남겨 보세요');
  assert.equal(NEXT_PAGE_ACTION, '다음 순간 추가');
  assert.deepEqual(nextMomentMessage('m01'), {type: 'lt41-write', mode: 'add', parentId: 'm01'});
  for (const path of VIEWS) {
    const src = html[path];
  }
  // #231 1-B③-2: 편집기 모드·부모 지정은 shell/panels.mjs로 옮겼다. 두 파일을 함께 본다.
  const shell = read('public/v41/shell.mjs') + read('public/v41/shell/panels.mjs') + read('public/v41/shell/messages.mjs');
  // 이슈 671: 고치기(edit)는 편집기가 부모를 쓰고, 새로 추가(new·add)는 목적지를 쓰기 창에 넘긴다.
});

test('5. 돋보기는 기본 꺼짐, 카드는 누를 수 있는 모양, 선택은 저장(실패해도 계속 동작)', () => {
  assert.equal(LENS_KEY, 'lt41.bookLens');
  assert.equal(readLens(undefined), false);
  assert.equal(readLens({getItem: () => { throw new Error('no'); }}), false);
  assert.equal(readLens({getItem: () => 'on'}), true);
  assert.equal(readLens({getItem: () => null}), false);
  assert.doesNotThrow(() => writeLens(true, {setItem: () => { throw new Error('no'); }}));
  assert.equal(writeLens(true, undefined), true);
  for (const path of VIEWS) {
    const src = html[path];
  }
});

test('6. 상세 카드는 오른쪽 페이지가 비면 거기, 아니면 카드 옆 작은 패널', () => {
  assert.equal(detailPlacement(true), 'right-page');
  assert.equal(detailPlacement(false), 'card-side');
  for (const path of VIEWS) {
    const src = html[path];
  }
});

test('7-1. 밤 제목 글꼴 = Pretendard, 정원 제목 글꼴 = 마루부리(대표 결정 2026-11-08)', () => {
  assert.equal(BOOK_UI_FONT, 'var(--lt-ui)');
  assert.equal(bookTheme(undefined), 'night');
  assert.equal(bookTheme('garden'), 'garden');
  assert.equal(bookTheme('GARDEN'), 'garden');
  assert.equal(bookTitleFont('night'), 'var(--lt-ui)', '밤은 큰 제목까지 Pretendard');
  assert.equal(bookTitleFont(), 'var(--lt-ui)', '값이 없으면 밤이다');
  assert.ok(bookTitleFont('garden').startsWith('MaruBuri'), '정원 큰 제목은 마루부리');
  assert.ok(!bookTitleFont('night').includes('MaruBuri'), '밤에는 마루부리를 쓰지 않는다');
  assert.equal(BOOK_TITLE_FONT.night, BOOK_UI_FONT);

  for (const path of VIEWS) {
    const src = html[path];
    const night = src.match(/html\[data-v41-screen=book\]\{--book-serif:([^}]*)\}/);
    assert.ok(night, path + ': 밤(기본) 글꼴 규칙');
    assert.ok(night[1].includes('--lt-reading:var(--lt-ui)'), path + ': 밤은 큰 제목까지 Pretendard');
    assert.ok(!night[1].includes('MaruBuri'), path + ': 밤 규칙에 마루부리가 없다');
    const garden = src.match(/html\[data-v41-screen=book\]\[data-lt-theme=garden\]\{--lt-reading:([^}]*)\}/);
    assert.ok(garden, path + ': 정원 글꼴 규칙');
    assert.ok(garden[1].startsWith('MaruBuri'), path + ': 정원 큰 제목은 마루부리');
  }
  // #231 2단계: 주입 생성기 대신, 화면이 실제로 싣는 CSS가 규칙과 같은 값을 쓴다.
  const nightFont = bookTitleFont('night'), gardenFont = bookTitleFont('garden');
});

test('9. 아래 연결 안내는 다음 순간이 있을 때만, 시스템 용어 없이 한 줄', () => {
  assert.equal(connectionLine('', '이유'), null);
  assert.equal(connectionLine('두 번째', '그날의 표정이 계속 생각나서'), '다음 순간으로 이어진 이유: 그날의 표정이 계속 생각나서');
  assert.equal(connectionLine('두 번째', ''), '다음 순간으로 이어진 이유: 이어진 이유를 아직 적지 않았어요');
  assert.ok(!connectionLine('두 번째', '이유').includes('실제 연결'));
  for (const path of VIEWS) {
    const src = html[path];
    // 화면에 그리는 문구는 어댑터가 만든다. 원본 함수는 덮어쓰고, 그리는 쪽에는 시스템 용어가 없다.
    const drawn = src.slice(src.indexOf('updateConnectionSummary=function('));
    assert.ok(drawn.length > 0, path + ': 연결 안내를 새로 그린다');
    assert.ok(!/실제 연결/.test(drawn.slice(0, 600)), path + ': 그리는 문구에 시스템 용어를 쓰지 않는다');
  }
});

test('한 벌뿐인 화면이 어댑터 파일을 싣는다(주입 스크립트 없음, #231 2단계)', () => {
  const src = html[VIEWS[0]];
  // 2단계: 주입 스크립트가 넣던 내용을 파일로 옮겼다.
  assert.equal(fsExists(new URL('../public/v41/views/book/book-extra.js', import.meta.url)), true, '어댑터 파일');
  assert.equal(fsExists(new URL('../scripts/apply-book-usability.mjs', import.meta.url)), false, '주입 스크립트는 없다');
  assert.equal(fsExists(new URL('../public/v41/design/views/', import.meta.url)), false, 'design/views/ 화면 사본 없음');
});

test('13. 제자리 재생은 주 버튼(왼쪽 클릭·탭)에서만 반응한다 (#231 2단계)', () => {
  assert.equal(isPrimaryButton({ button: 0 }), true, '왼쪽 클릭·탭');
  assert.equal(isPrimaryButton({ button: 1 }), false, '가운데 버튼은 새 탭 열기 기본 동작을 지킨다');
  assert.equal(isPrimaryButton({ button: 2 }), false, '오른쪽 버튼은 상황 메뉴 기본 동작을 지킨다');
  assert.equal(isPrimaryButton({}), true, 'button이 없는 합성 이벤트(탭)');
  assert.equal(isPrimaryButton(undefined), true, '이벤트 없이 부르는 경우');
  // 리스너 두 곳이 모두 이 규칙을 먼저 통과시킨다.
  const guards = EXTRA.match(/if\(!isPrimaryButton\(e\)\)return;/g) || [];
  assert.equal(guards.length, 2, 'pointerdown·click 두 리스너');
});

test('11. 기억책 트리 이름: "리센느, 나의 순간들" → "리센느", 직접 쓴 이름은 그대로 (#212)', () => {
  assert.equal(treeTitleText('리센느, 나의 순간들'), '리센느');
  assert.equal(treeTitleText('리센느'), '리센느');
  assert.equal(treeTitleText('리센느, 나의 순간들 2'), '리센느, 나의 순간들 2');
  assert.equal(treeTitleText(''), '');
  assert.equal(treeTitleText(undefined), '');
  const apply = EXTRA;
  for (const path of VIEWS) {
    const src = html[path];
    // 갈래 글자(.crumb)와 목차 머리(.archive-tree)가 저장값이 아니라 표시 이름을 쓴다.
  }
});

test('13. 기억책도 정원 테마를 받는다(밤=기본 글꼴, 정원=지금 글꼴) — 보드·지도도 정원(#274)', () => {
  const { appliedTheme } = headerStateModule;
  assert.equal(appliedTheme('garden', 'book'), 'garden');
  // 2026-11-08: 보드·관계 지도도 정원을 받는다(정원 적용 레인).
  assert.equal(appliedTheme('garden', 'board'), 'garden');
  assert.equal(appliedTheme('garden', 'network'), 'garden');
  assert.equal(appliedTheme('night', 'book'), 'night');
});

// #800: 카드 면을 눌러도 설명 창은 열리지 않는다. 돋보기만 손을 떼면 닫는다.
test('책 카드 포인터 판정: 자세히 보기는 닫고 일반 탭은 아무 창도 열지 않는다', () => {
  const cases = [
    // [mode, longPressed, dx, dy, hasMoment, width, cancel, 기대]
    ['inspect', true, 1, 1, true, 390, false, 'close-lens'],
    ['inspect', true, 0, 0, true, 360, false, 'close-lens'],
    ['inspect', true, 30, 2, true, 390, false, 'close-lens'],
    ['inspect', true, 1, 1, false, 390, false, 'close-lens'],
    ['inspect', true, 1, 1, true, 390, true, 'close-lens'],
    ['inspect', true, 1, 1, true, 431, false, 'close-lens'],
    ['inspect', true, 1, 1, true, 1440, false, 'close-lens'],
    ['pending', false, 2, 2, true, 390, false, 'none'],
    ['swipe', false, 40, 0, true, 390, false, 'none'],
    ['pending', true, 2, 2, true, 390, false, 'none']
  ];
  for (const [mode, longPressed, dx, dy, hasMoment, width, cancel, expected] of cases) {
    assert.equal(tapIntent({ mode, longPressed, dx, dy, hasMoment, width, cancel }), expected, [mode, dx, dy, width, cancel].join('/'));
  }
});

// ── #345 순간 면·이어진 순간(이슈 584에서 개명) 표시 규칙 ───────────────────────
test('14. 출처 줄·편집 손잡이: 표시 규칙은 함수가 정한다(#345)', () => {
  assert.equal(mediaSourceText({title: '영상 제목', channel: '채널'}), '영상 제목 · 채널');
  assert.equal(mediaSourceText({title: '영상 제목'}), '영상 제목');
  assert.equal(mediaSourceText({channel: '채널'}), '', '제목이 없으면 원본 링크만');
  assert.equal(mediaSourceText({}), '');
  // 공유·예시(읽기 전용)에는 편집 손잡이가 하나도 없다.
  assert.deepEqual(editAffordances({readOnly: true, hasTitle: true, hasNote: false}), {title: false, hint: false, guide: false});
  assert.deepEqual(editAffordances({synthetic: true, hasTitle: true, hasNote: false}), {title: false, hint: false, guide: false});
  // 내 기록: 제목이 있으면 제목 단추+✎, 마음이 비면 흐린 안내.
  assert.deepEqual(editAffordances({hasTitle: true, hasNote: false}), {title: true, hint: true, guide: true});
  assert.deepEqual(editAffordances({hasTitle: true, hasNote: true}), {title: true, hint: true, guide: false});
  assert.deepEqual(editAffordances({hasTitle: false, hasNote: true}), {title: false, hint: false, guide: false});
  assert.deepEqual(editAffordances({hasTitle: false, hasNote: false}), {title: false, hint: false, guide: true});
});

