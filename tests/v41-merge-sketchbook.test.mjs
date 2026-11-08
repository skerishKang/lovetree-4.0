// 1.5단계 ⑤: 기억책(track59-sketchbook) 두 벌 합치기(#231). 마지막 화면, 예시 분기 0곳.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../public/v41/${file}`, import.meta.url), 'utf8');
const SERVER = read('views/track59-sketchbook.html');
const EXAMPLE = read('design/views/track59-sketchbook.html');
const INJECT = fs.readFileSync(new URL('../scripts/apply-book-usability.mjs', import.meta.url), 'utf8');

test('기억책 두 벌은 바이트 단위로 같다', () => {
  assert.equal(SERVER, EXAMPLE);
});

test('런타임 한 벌만 부르고 자원 경로는 /v41/ 절대 경로', () => {
  assert.match(SERVER, /src="\/v41\/runtime\.js"/);
  assert.match(SERVER, /src="\/v41\/media-preview\.js"/);
  assert.match(SERVER, /src="\/v41\/view-navigation\.js"/);
  assert.doesNotMatch(SERVER, /shared\.js/);
  assert.ok(!SERVER.includes('../'), '상대 경로가 남아 있으면 폴더마다 다른 파일을 찾는다');
});

test('주입 스크립트도 한 벌·절대 경로 기준으로 동작한다', () => {
  assert.match(INJECT, /const COPIES = \[\n  \['public\/v41\/views\/track59-sketchbook\.html', '\/v41\/'\],\n\];/);
  assert.doesNotMatch(INJECT, /design\/views\/track59-sketchbook\.html/);
  assert.match(SERVER, /<style id="lt-book-usability">/);
  assert.match(SERVER, /from '\/v41\/book-usability\.mjs'/);
});

test('실제 기록 동작은 그대로 남는다(제자리 재생·읽기 스크롤·돋보기 예외·연결 이유·정원 제목)', () => {
  assert.match(SERVER, /<style id="member-reading-scroll">/);
  assert.match(SERVER, /\.lt-media/, '미디어 위 돋보기 예외');
  assert.match(SERVER, /LTDEMO\.edges\.filter\(e=>e\.kind==='parent'/);
  assert.match(SERVER, /synthetic:true/);
  // 정원 명조 제목(#228): 주입 블록이 정원 테마의 읽기 글꼴을 따로 정의한다(값은 book-usability.mjs가 만든다).
  assert.match(SERVER, /\[data-lt-theme=garden\]\{--lt-reading:/);
  assert.match(SERVER, /yt-frame/, '제자리 재생');
});

test('예시 분기를 남기지 않는다(문구·동작은 데이터 상태로 갈린다)', () => {
  assert.equal((SERVER.match(/LTDEMO\.example/g) || []).length, 0);
  assert.doesNotMatch(SERVER, /source===['"]example['"]/);
});

test('연결 이유 줄과 제목 고치기·다음 순간 남기기 연결이 살아 있다', () => {
  assert.match(SERVER, /연결 이유 · 실제 연결/);
  assert.match(SERVER, /title-edit/);
  assert.match(SERVER, /NEXT_PAGE_ACTION|next-page/);
  assert.match(SERVER, /__BOOK_USABILITY__/);
});
