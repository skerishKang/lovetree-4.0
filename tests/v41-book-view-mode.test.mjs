import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const BOOK=readFileSync(new URL('../public/v41/views/book/book.js',import.meta.url),'utf8');
const EXTRA=readFileSync(new URL('../public/v41/views/book/book-extra.js',import.meta.url),'utf8');
const CSS=readFileSync(new URL('../public/v41/views/book/book.css',import.meta.url),'utf8');
const USE_CSS=readFileSync(new URL('../public/v41/views/book/book-usability.css',import.meta.url),'utf8');
const LAYOUT=readFileSync(new URL('../public/v41/reader-layout.css',import.meta.url),'utf8');
const HTML=readFileSync(new URL('../public/v41/views/track59-sketchbook.html',import.meta.url),'utf8');

test('#393 4: 한 장/두 장은 폭 자동이 아니라 사용자 선택이다 — 기본값은 컴퓨터 두 장·좁은 화면 한 장',()=>{
 assert.match(BOOK,/const VIEW_KEY='lt41-book-view'/,'선택값은 localStorage에 저장된다');
 assert.match(BOOK,/function storedView\(\)\{try\{const v=localStorage\.getItem\(VIEW_KEY\)/,'읽기는 try/catch로 감싼다');
 assert.match(BOOK,/function defaultView\(\)\{return innerWidth<=820\?'single':'double'\}/,'고르지 않았을 때 기본값: 820px 이하 한 장, 초과 두 장');
 assert.match(BOOK,/function narrow\(\)\{return innerWidth<600\}/,'폰 폭(600px 미만) 판정은 한 곳(narrow)');
assert.match(BOOK,/function single\(\)\{return narrow\(\)\|\|\(viewChoice\?\?defaultView\(\)\)\==='single'\}/,'폰 폭에서는 두 장을 쓰지 않는다');
 assert.match(BOOK,/viewChoice=v;try\{localStorage\.setItem\(VIEW_KEY,v\)\}catch\{\}/,'고른 값 저장도 실패해도 책은 계속 동작한다');
});

test('#393 4: 책 위쪽 버튼 줄에 [한 장|두 장] 단추가 있고 aria-pressed로 눌린 쪽을 알린다',()=>{
 assert.match(HTML,/class="view-toggle" role="group" aria-label="책 보기 방식"/,'단추 한 벌은 role=group으로 묶인다');
 assert.match(HTML,/id="singleViewBtn" aria-pressed="false">한 장</,'한 장 단추');
 assert.match(HTML,/id="doubleViewBtn" aria-pressed="false">두 장</,'두 장 단추');
 assert.match(BOOK,/applyViewAttr\(\);\n\$\('#singleViewBtn'\)\.onclick/,'단추는 book.js에서 연결된다');
 assert.match(BOOK,/one\.setAttribute\('aria-pressed',String\(s\)\)/,'한 장 aria-pressed 갱신');
 assert.match(BOOK,/two\.setAttribute\('aria-pressed',String\(!s\)\)/,'두 장 aria-pressed 갱신');
 // 버튼 요소이므로 키보드 기본 조작(탭·Enter·Space)이 한다
 assert.match(HTML,/<button class="ui-btn" type="button" id="singleViewBtn"/,'button 요소 — 키보드 조작 기본 제공');
});

test('#393 4: 보기 모드는 data-book-view 속성으로 정해진다 — 폭 미디어쿼리로 페이지 배치를 정하지 않는다',()=>{
 assert.match(BOOK,/document\.documentElement\.dataset\.bookView=single\(\)\?'single':'double'/,'html에 보기 모드 속성');
 assert.doesNotMatch(CSS,/max-width:820px/,'book.css의 820px 미디어쿼리를 속성 규칙으로 바꾼다');
 assert.doesNotMatch(USE_CSS,/max-width:820px/,'book-usability.css도 같다');
 assert.match(BOOK,/dataset\.bookShape=narrow\(\)\?'phone':'wide'/,'화면 모양은 휴대폰/넓은 화면으로 따로 매긴다');
assert.match(CSS,/html\[data-book-shape=phone\] \.page\.left,\nhtml\[data-book-shape=phone\] \.page\.right,\nhtml\[data-book-shape=phone\] \.eyebrow\{display:none\}/,'휴대폰 한 장: 두 페이지 접기');
assert.match(CSS,/html\[data-book-view=single\]\[data-book-shape=wide\] \.page\.left,\nhtml\[data-book-view=single\]\[data-book-shape=wide\] \.mobile-page,\nhtml\[data-book-view=single\]\[data-book-shape=wide\] \.mobile-inspect,\nhtml\[data-book-view=single\]\[data-book-shape=wide\] \.eyebrow\{display:none\}/,'넓은 화면 한 장: 오른쪽 한 쪽만 남긴다');
assert.match(CSS,/html\[data-book-view=single\]\[data-book-shape=wide\] \.book-wrap\{width:calc\(min\(1160px,80vw\)\/2\);height:min\(650px,calc\(100vh - 250px\)\);min-height:380px\}/,'넓은 화면 한 장: 두 장 책 한 쪽 크기·같은 높이');
 assert.match(CSS,/html\[data-book-shape=phone\] \.mobile-page\{display:block/,'휴대폰 한 장: 한 장 페이지 펼치기');
 assert.match(LAYOUT,/html\[data-book-shape=phone\]\[data-v41-screen=book\] \.book\{position:relative;inset:auto;transform:none;display:block\}/,'휴대폰 한 장: 책 종이도 세로 흐름으로');
 assert.match(CSS,/html\[data-book-shape=phone\] \.desktop-only\{display:none!important\}/,'휴대폰 한 장에서만 돋보기(데스크톱 전용)를 숨긴다 — 넓은 화면 한 장은 쓸 수 있다(#537 3)');
});

test('#393 4: 폰 폭에서는 두 장 단추를 숨기고, 태블릿 가로에서는 둘 다 보인다',()=>{
 assert.match(CSS,/max-width:599px\)\{#doubleViewBtn\{display:none\}\}/,'600px 미만에서 두 장 단추 숨김');
 assert.match(BOOK,/if\(two\)two\.hidden=narrow\(\)/,'JS에서도 두 장 단추를 숨긴다');
 // 600~820(태블릿 세로)과 821+(태블릿 가로·컴퓨터)에서는 두 장 단추가 살아 있다 — 숨김 규칙이 599px 이하에만 걸려 있으면 충분하다
 assert.doesNotMatch(CSS,/max-width:(8|7|6)\d\dpx\)\{#doubleViewBtn/,'넓은 폭에서 두 장 단추를 숨기지 않는다');
});

test('#393 4: 넘김과 상세·돋보기 판정은 폭이 아니라 보기 모드를 따른다',()=>{
 assert.match(BOOK,/if\(phone&&\(land\|\|focusId\)\)window\.scrollTo/,'휴대폰 한 장 착지 시 맨 위로');
 assert.match(BOOK,/else\{front\.innerHTML=dir==='next'\?pageFace/,'두 장 넘김 면 준비');
 assert.match(BOOK,/if\(!single\(\)\)\{if\(smoothTurn\(\)\)\{leftPage\.innerHTML/,'두 장 아래 페이지 준비');
 assert.match(BOOK,/if\(narrow\(\)\|\|!lensOn\|\|!\['IDLE','INSPECTING'\]\.includes\(machineState\)\)return/,'돋보기는 휴대폰 폭에서만 막는다 — 넓은 화면 한 장에서는 쓸 수 있다(#537 3)');
 assert.match(BOOK,/bookWrap\.addEventListener\('pointerdown',e=>\{if\(!narrow\(\)\|\|e\.pointerType==='mouse'\)return/,'휴대폰 한 장 터치 넘김');
 assert.match(BOOK,/mobile:single\(\),view:single\(\)\?'single':'double'\}/,'상태 노출에 보기 모드');
 assert.match(EXTRA,/const rightEmpty=!!currentSpread\(\)\?\.right\?\.synthetic&&!single\(\)/,'상세 자리도 보기 모드가 정한다');
});

test('#393 4: 보기를 바꿔도 지금 보던 순간이 그대로다',()=>{
 assert.match(BOOK,/applyViewAttr\(\);renderSpread\(posOfMoment\(focus\),focus\|\|null,false\)/,'전환 시 보던 순간(focus)이 새 보기의 자리로 옮겨 간다(#537 9)');
 assert.match(BOOK,/if\(machineState!=='IDLE'\)\{\/\* 넘기는 동안에는 모드를 바꾸지 않는다 — 잠깐 뒤 다시 시도한다\. \*\/setTimeout\(\(\)=>setViewChoice\(v\),120\);return\}/,'넘김 중에는 전환을 미룬다');
 assert.match(BOOK,/window\.addEventListener\('resize',\(\)=>\{applyViewAttr\(\);/,'폭이 변해도 모드를 다시 매긴다');
});

test('#393 4: 숨은 상세 패널이 바탕에 바닥을 가리지 않는다 — hidden이면 display:none',()=>{
 assert.match(USE_CSS,/html\[data-v41-screen=book\] \.detail-panel\[hidden\]\{display:none\}/,'hidden 속성을 display:flex가 이기지 못하게 한다');
});
