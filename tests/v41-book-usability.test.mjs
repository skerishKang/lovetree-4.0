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
    assert.ok(src.includes('data-yt-play'), path + ': 재생 단추');
    assert.ok(src.includes('document.createElement(\'iframe\')'), path + ': 누른 뒤에만 iframe 을 만든다');
    assert.ok(src.includes("setAttribute('referrerpolicy','strict-origin-when-cross-origin')"), path + ': referrerpolicy');
    assert.ok(src.includes('YouTube ↗'), path + ': 원본 링크는 남긴다');
    assert.ok(src.includes('media-source-link'), path + ': 영상 아래 출처 한 줄의 링크');
    // #327 1부(대표 결정 2026-11-09): 내 기록(서버·로그인 소유자)은 썸네일을 처음부터 보여 준다.
    // #393: ytimg 주소는 media-preview.js 의 youtubeThumbUrl/loadUrl 한 벌로 옮겼다 — 화면에는 literal 이 없고,
    // 공유·예시는 여전히 요청 0이다(썸네일은 auto 판정을 통과한 가지에서만 그린다).
    assert.equal(src.split('i.ytimg.com').length - 1, 0, path + ': ytimg 주소는 화면에 하드코딩하지 않는다(LTMedia 한 벌)');
    assert.ok(/:auto\?'<img src="'\+t\(remoteThumb\)/.test(src), path + ': 썸네일은 내 기록 판정(auto)을 통과했을 때만 그린다');
    assert.ok(src.includes('LTMedia.youtubeThumbUrl(media.videoId,true)') && src.includes('media.loadUrl'), path + ': 썸네일 주소는 LTMedia 한 벌에서 온다');
    assert.ok(/autoLoadMedia\(ctx\.source,\s*ctx\.owned\)/.test(src), path + ': 판정은 media-preview 의 한 함수를 쓴다');
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
    assert.ok(html[path].includes('data-title-edit'), path + ': 제목 고치기 단추');
    assert.ok(html[path].includes("mode:'edit'"), path + ': 기존 저장 경로(편집)로 보낸다');
    assert.ok(html[path].includes('withoutAutoTitle('), path + ': 표시 단계에서 거른다');
  }
});

test('3. 1440·390에서 페이지 안 스크롤이 없다', () => {
  for (const path of VIEWS) {
    const src = html[path];
    assert.ok(/\.page-content\{position:absolute;inset:0;[^}]*overflow:hidden/.test(src), path + ': 페이지 내용은 넘치지 않는다');
    assert.ok(/html\[data-v41-screen=book\] \.page-content[^{]*\{[^}]*overflow:hidden/.test(src), path + ': 어댑터도 스크롤을 잠근다');
    assert.ok(/\.mobile-content[^{]*\{[^}]*overflow:hidden/.test(src), path + ': 모바일 한 페이지도 같다');
    assert.ok(/\.photo-piece img\{[^}]*height:clamp\(/.test(src), path + ': 사진 높이를 줄여 정보 줄·태그가 함께 보이게 한다');
  }
});

test('4. 오른쪽 빈 페이지는 다음 순간 안내 + 현재 순간을 부모로 여는 단추', () => {
  assert.equal(NEXT_PAGE_COPY, '이 순간 다음 이야기를 남겨 보세요');
  assert.equal(NEXT_PAGE_ACTION, '다음 순간 추가');
  assert.deepEqual(nextMomentMessage('m01'), {type: 'lt41-write', mode: 'add', parentId: 'm01'});
  for (const path of VIEWS) {
    const src = html[path];
    assert.ok(src.includes('data-next-moment'), path + ': 다음 순간 추가 단추');
    assert.ok(src.includes('nextMomentMessage('), path + ': 부모 순간을 함께 보낸다');
    assert.ok(src.includes("type:'lt41-select'"), path + ': 편집기가 이 순간을 기준으로 열린다');
  }
  for (const path of VIEWS) assert.ok(!html[path].includes('login-start'), path + ': 사라진 안내 창 요소를 찾지 않는다');
  // #231 1-B③-2: 편집기 모드·부모 지정은 shell/panels.mjs로 옮겼다. 두 파일을 함께 본다.
  const shell = read('public/v41/shell.mjs') + read('public/v41/shell/panels.mjs') + read('public/v41/shell/messages.mjs');
  assert.ok(/function openEditor\(requestedMode, *parentId = ''\)/.test(shell), '셸: 편집기가 부모를 받는다');
  assert.ok(/setEditorMode\(mode, *parentId\)/.test(shell), '셸: 부모를 그대로 넘긴다');
  assert.ok(/type === 'lt41-write'\) openEditor\(data\.mode, data\.parentId\)/.test(shell), '셸: 메시지의 부모를 쓴다');
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
    assert.ok(src.includes("id=\"lensBtn\""), path + ': 도구 줄의 돋보기 단추');
    assert.ok(src.includes('function paintLensButton'), path + ': 상태를 그리고');
    assert.ok(src.includes("aria-pressed"), path + ': 눌림 상태를 알린다');
    assert.ok(src.includes('cursor:pointer'), path + ': 카드는 누를 수 있는 모양');
    assert.ok(src.includes('readLens(window.localStorage)'), path + ': 저장값을 읽고 실패는 꺼짐으로');
  }
});

test('6. 상세 카드는 오른쪽 페이지가 비면 거기, 아니면 카드 옆 작은 패널', () => {
  assert.equal(detailPlacement(true), 'right-page');
  assert.equal(detailPlacement(false), 'card-side');
  for (const path of VIEWS) {
    const src = html[path];
    assert.ok(src.includes('id="detailSide"'), path + ': 옆에 붙는 패널');
    assert.ok(src.includes("e.key!=='Escape'"), path + ': Esc로 닫는다');
    assert.ok(src.includes('focus({preventScroll:true})'), path + ': 초점을 누른 카드로 돌려준다');
    assert.ok(src.includes('data-detail-close'), path + ': 닫기 단추');
  }
});

test('7. 글꼴: 본문·날짜·단추는 Pretendard, 큰 제목 한 줄만 마루부리, 외부 글꼴 요청 없음', () => {
  for (const path of VIEWS) {
    const src = html[path];
    assert.ok(src.includes('--book-serif:var(--lt-ui)'), path + ': 본문 계열은 UI 글꼴');
    assert.ok(/\.moment-title h3[^{]*\{[^}]*var\(--lt-reading\)/.test(src), path + ': 큰 제목은 읽기 글꼴(마루부리)');
    assert.ok(!/https:\/\/fonts\.(googleapis|gstatic)/.test(src), path + ': 외부 글꼴 요청 0');
    assert.ok(!/@font-face[^}]*https?:/.test(src), path + ': 글꼴은 저장소 안에서만 받는다');
  }
  const identity = read('public/v41/identity.css');
  assert.ok(identity.includes("--lt-ui:'Pretendard Variable',Pretendard"), 'UI 글꼴 토큰');
  assert.ok(identity.includes('/fonts/MaruBuri-Regular.woff2'), '마루부리는 저장소 안 파일을 쓴다');
  assert.ok(read('public/v41/shell.mjs').length > 0 && read('docs/PRODUCT.md').includes('MaruBuri'), 'PRODUCT.md 에 글꼴 조건 기록');
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
    assert.ok(/html\[data-v41-screen=book\]\[data-lt-theme=garden\] \.moment-title h3[^{]*\{[^}]*MaruBuri/.test(src), path + ': 정원 큰 제목 줄에 마루부리');
  }
  // #231 2단계: 주입 생성기 대신, 화면이 실제로 싣는 CSS가 규칙과 같은 값을 쓴다.
  const nightFont = bookTitleFont('night'), gardenFont = bookTitleFont('garden');
  assert.ok(BOOK_EXTRA_CSS.includes('--lt-reading:' + nightFont), '싣는 CSS가 밤 규칙 값을 쓴다');
  assert.ok(BOOK_EXTRA_CSS.includes('--lt-reading:' + gardenFont), '싣는 CSS가 정원 규칙 값을 쓴다');
});

test('8. 책 가운데 머리 표시(01 · 날짜)를 지우고, 날짜는 정보 줄에만 둔다', () => {
  for (const path of VIEWS) {
    const src = html[path];
    assert.ok(/\.eyebrow\{display:none\}/.test(src.replace(/\s*\{\s*/g, '{')), path + ': 눈금 머리 표시를 감춘다');
    assert.ok(src.includes('id="eyebrow"'), path + ': 원본 요소는 남겨 두고 감추기만 한다');
    assert.ok(src.includes('moment-title'), path + ': 날짜는 카드 정보 줄에서 보여 준다');
  }
});

test('9. 아래 연결 안내는 다음 순간이 있을 때만, 시스템 용어 없이 한 줄', () => {
  assert.equal(connectionLine('', '이유'), null);
  assert.equal(connectionLine('두 번째', '그날의 표정이 계속 생각나서'), '다음 순간으로 이어진 이유: 그날의 표정이 계속 생각나서');
  assert.equal(connectionLine('두 번째', ''), '다음 순간으로 이어진 이유: 이어진 이유를 아직 적지 않았어요');
  assert.ok(!connectionLine('두 번째', '이유').includes('실제 연결'));
  for (const path of VIEWS) {
    const src = html[path];
    assert.ok(src.includes("host.hidden=true"), path + ': 다음 순간이 없으면 줄을 숨긴다');
    assert.ok(src.includes('connectionLine('), path + ': 같은 문구 규칙을 쓴다');
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
  assert.match(src, /<link rel="stylesheet" href="\/v41\/views\/book\/book-usability\.css">/);
  assert.match(src, /<script type="module" src="\/v41\/views\/book\/book-extra\.js"><\/script>/);
  assert.match(EXTRA, /from '\/v41\/book-usability\.mjs'/);
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
  assert.ok(apply.includes('treeTitleText'), '어댑터가 같은 함수를 쓴다');
  for (const path of VIEWS) {
    const src = html[path];
    // 갈래 글자(.crumb)와 목차 머리(.archive-tree)가 저장값이 아니라 표시 이름을 쓴다.
    assert.ok(src.includes('function paintTreeTitles()'), path + ': 이름을 그리는 함수');
    assert.ok(src.includes('treeTitleText(LTDEMO&&LTDEMO.title)'), path + ': 표시 규칙을 거친다');
    assert.ok(src.includes("for(const el of document.querySelectorAll('.crumb'))"), path + ': 책 위쪽 갈래 글자');
    assert.ok(src.includes("line.className='archive-tree'"), path + ': 목차 머리');
    assert.ok(!/LTDEMO\.title\s*;/.test(src), path + ': 원본 제목을 그대로 쓰지 않는다');
    assert.ok(src.includes('.archive-tree{'), path + ': 이름 줄 스타일');
  }
});

test('12. 실제 기록에서도 그 자리 재생: 겹침·전파 차단에 지지 않고, 실패하면 원본 링크로 (#212 후속)', () => {
  const apply = EXTRA;
  assert.ok(apply.includes("document.addEventListener('pointerdown'"), 'pointerdown에서 먼저 잡는다');
  assert.ok(apply.includes('function playInline(yt,media)'), '재생은 한 곳에서 만든다');
  assert.ok(apply.includes("window.open(media.openUrl,'_blank','noopener')"), '재생 주소가 없으면 원본 링크를 연다');
  assert.ok(apply.includes("yt.parentElement.querySelector('iframe.yt-frame')"), '두 번 만들지 않는다');
  for (const path of VIEWS) {
    const src = html[path];
    assert.ok(src.includes('function playInline(yt,media)'), path + ': 재생 함수');
    assert.ok(src.includes("addEventListener('pointerdown'"), path + ': 먼저 잡는 리스너');
    assert.ok(src.includes('.yt-play{position:relative;z-index:3'), path + ': 겹침 위로');
    assert.ok(src.includes('.moment-title{pointer-events:none}'), path + ': 제목 겹침은 클릭을 막지 않는다');
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

// #296: 좁은 화면에서 손을 떼면 상세가 열린다 — 420ms 넘게 눌러 돋보기가 켜져도 그 자리에서 떼면 상세.
test('좁은 화면 탭 판정: 돋보기가 켜져도 같은 자리에서 떼면 상세를 연다(430 이하)', () => {
  const cases = [
    // [mode, longPressed, dx, dy, hasMoment, width, cancel, 기대]
    ['inspect', true, 1, 1, true, 390, false, 'detail'],
    ['inspect', true, 0, 0, true, 360, false, 'detail'],
    ['inspect', true, 30, 2, true, 390, false, 'close-lens'],   // 끌었으면 상세 아님
    ['inspect', true, 1, 1, false, 390, false, 'close-lens'],   // 카드 밖
    ['inspect', true, 1, 1, true, 390, true, 'close-lens'],     // 취소된 포인터
    ['inspect', true, 1, 1, true, 431, false, 'close-lens'],    // 431px은 예전 그대로(돋보기만)
    ['inspect', true, 1, 1, true, 1440, false, 'close-lens'],   // 큰 화면 그대로
    ['pending', false, 2, 2, true, 390, false, 'detail'],
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

test('15. #345 마크업: 이어진 순간·세로 타임라인·출처 줄·감정 점·마음 안내', () => {
  const src = html[VIEWS[0]];
  assert.ok(!src.includes('경로 한눈에'), '옛 이름은 남기지 않는다');
  assert.ok(src.includes('>이어진 순간</button>'), '도구 줄 버튼 이름(이슈 584: 이어진 순간)');
  assert.ok(src.includes('<h2 id="overviewTitle">이어진 순간</h2>'), '창 제목(이슈 584: 이어진 순간)');
  assert.ok(src.includes('처음 순간부터 지금까지 이어진 순간을 한눈에 보여 줘요. 누르면 그 장으로 넘어가요.'), '설명 문구(이슈 584)');
  assert.ok(src.includes('id="journeySummary"'), 'N단계 · N일 자리');
  assert.ok(src.includes('class="overview" id="overview" inert'), '닫힌 창은 포커스 대상이 아니다');
  assert.ok(src.includes('class="journey-item'), '세로 타임라인 칸');
  assert.ok(src.includes('journey-reason'), '칸 사이 연결 이유');
  assert.ok(src.includes('journey-now'), '지금 보는 순간');
  assert.ok(src.includes('media-source-link'), '영상 아래 원본 링크');
  assert.ok(src.includes('moment-emotion'), '감정 점+글자');
  assert.ok(src.includes('moment-date'), '제목 위 날짜');
  assert.ok(src.includes('data-note-edit'), '빈 마음 안내(누르면 쓰기)');
  assert.ok(src.includes("data-title-edit"), '제목 바로 고치기');
  // 세로 타임라인은 가로 흐름 스타일을 쓰지 않는다(옛 overview-flow 규칙 제거).
  assert.ok(!src.includes('.overview-flow{display:flex'), '옛 가로 흐름 CSS 없음');
  assert.ok(/html\[data-v41-screen=book\] \.journey\{[^}]*overflow-y:auto/.test(src), '390에서 세로 스크롤');
  assert.ok(/html\[data-v41-screen=book\] \.journey:before\{[^}]*background:var\(--lt-gold-line\)/.test(src), '금색 선 연결');
  assert.ok(/html\[data-v41-screen=book\] \.journey-item\.current \.journey-node\{[^}]*background:var\(--lt-gold\)/.test(src), '지금 보는 순간 금색 점');
  assert.ok(/\.moment-title \.moment-note\.is-empty\{[^}]*border-left:2px solid var\(--lt-gold-line\)/.test(src), '흐린 마음 안내');
});
