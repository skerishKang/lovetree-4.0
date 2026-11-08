import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// 2026-11-08 대표 피드백: 기억책(트랙59) 사용성 1~9.
// 규칙은 public/v41/book-usability.mjs 한 곳에 있고, 두 벌의 화면 파일은 같은 어댑터를 받는다.
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const VIEWS = ['public/v41/views/track59-sketchbook.html', 'public/v41/design/views/track59-sketchbook.html'];
const html = Object.fromEntries(VIEWS.map(path => [path, read(path)]));

const {
  isUserTitle, displayTitle, withoutAutoTitle, titleParts, videoTitle,
  embedUrl, connectionLine, NEXT_PAGE_COPY, NEXT_PAGE_ACTION,
  LENS_KEY, readLens, writeLens, detailPlacement, nextMomentMessage,
  BOOK_UI_FONT, BOOK_TITLE_FONT, bookTheme, bookTitleFont, treeTitleText,
} = await import('../public/v41/book-usability.mjs');

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
    assert.ok(src.includes('YouTube에서 열기'), path + ': 원본 링크는 남긴다');
    assert.ok(!/i\.ytimg\.com/.test(src), path + ': 누르기 전 썸네일 요청을 만들지 않는다');
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
  assert.equal(NEXT_PAGE_ACTION, '다음 순간 남기기');
  assert.deepEqual(nextMomentMessage('m01'), {type: 'lt41-write', mode: 'add', parentId: 'm01'});
  for (const path of VIEWS) {
    const src = html[path];
    assert.ok(src.includes('data-next-moment'), path + ': 다음 순간 남기기 단추');
    assert.ok(src.includes('nextMomentMessage('), path + ': 부모 순간을 함께 보낸다');
    assert.ok(src.includes("type:'lt41-select'"), path + ': 편집기가 이 순간을 기준으로 열린다');
  }
  for (const path of VIEWS) assert.ok(!html[path].includes('login-start'), path + ': 사라진 안내 창 요소를 찾지 않는다');
  const shell = read('public/v41/shell.mjs');
  assert.ok(/function openEditor\(requestedMode,parentId=''\)/.test(shell), '셸: 편집기가 부모를 받는다');
  assert.ok(/setEditorMode\(mode,parentId\)/.test(shell), '셸: 부모를 그대로 넘긴다');
  assert.ok(shell.includes("type==='lt41-write')openEditor(e.data.mode,e.data.parentId)"), '셸: 메시지의 부모를 쓴다');
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
  // 두 벌과 생성기가 같은 값을 쓴다.
  const apply = read('scripts/apply-book-usability.mjs');
  assert.ok(apply.includes("bookTitleFont('night')"), '적용 스크립트가 규칙을 가져다 쓴다');
  assert.ok(apply.includes("bookTitleFont('garden')"), '적용 스크립트가 정원 규칙도 가져다 쓴다');
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

test('두 벌의 화면 파일이 같은 어댑터를 받는다(손으로 고치지 않는다)', () => {
  const block = path => {
    const match = html[path].match(/<script type="module">([\s\S]*?)<\/script>\s*<\/body>/);
    assert.ok(match, path + ': 어댑터 스크립트');
    return match[1].replace(/'\.\.\/\.\.\//g, "'../").replace(/"\.\.\/\.\.\//g, '"../');
  };
  const [a, b] = VIEWS.map(block);
  assert.equal(a.replace(/'\.\/book-usability/g, 'PATH'), b.replace(/'\.\/book-usability/g, 'PATH'), '두 파일의 어댑터는 같다');
  assert.ok(read('scripts/apply-book-usability.mjs').includes('변경 없음'), '적용 스크립트는 두 번 돌려도 같다');
});

test('11. 기억책 트리 이름: "리센느, 나의 순간들" → "리센느", 직접 쓴 이름은 그대로 (#212)', () => {
  assert.equal(treeTitleText('리센느, 나의 순간들'), '리센느');
  assert.equal(treeTitleText('리센느'), '리센느');
  assert.equal(treeTitleText('리센느, 나의 순간들 2'), '리센느, 나의 순간들 2');
  assert.equal(treeTitleText(''), '');
  assert.equal(treeTitleText(undefined), '');
  const apply = read('scripts/apply-book-usability.mjs');
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
