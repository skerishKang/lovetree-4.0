import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const EXTRA=readFileSync(new URL('../public/v41/views/book/book-extra.js',import.meta.url),'utf8');
const BOOK=readFileSync(new URL('../public/v41/views/book/book.js',import.meta.url),'utf8');
const CSS=readFileSync(new URL('../public/v41/views/book/book.css',import.meta.url),'utf8');
const USE_CSS=readFileSync(new URL('../public/v41/views/book/book-usability.css',import.meta.url),'utf8');
const HTML=readFileSync(new URL('../public/v41/views/track59-sketchbook.html',import.meta.url),'utf8');
const NAV=readFileSync(new URL('../public/v41/view-navigation.js',import.meta.url),'utf8');

test('#393 5: "← 내 책장"이 "← 내 트리"가 되고, 그 옆에 지금 책 제목 + ▾가 붙는다',()=>{
 assert.match(HTML,/id="shelfBackBtn" type="button">← 내 트리</,'왼쪽 위 단추 이름');
 assert.match(HTML,/class="topbar-left".*id="shelfBackBtn"/s,'← 내 트리와 제목은 한 묶음(왼쪽)');
 assert.match(HTML,/id="bookTitleBtn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="treeMenuPanel"/,'제목 단추는 팝업 단추로 자신을 알린다');
 assert.match(HTML,/id="bookTitleText">책</,'제목 글자 자리');
 assert.match(HTML,/class="book-title-caret" aria-hidden="true">▾</,'▾ 표시');
 assert.match(CSS,/\.topbar-left\{display:flex;align-items:center;gap:10px;min-width:0;margin-right:auto\}/,'셸이 책 화면 topbar를 오른쪽 정렬로 둬서 묶음이 왼쪽에 붙는다');
 assert.match(EXTRA,/const titleText=document\.getElementById\('bookTitleText'\);/,'제목은 #212 이름 규칙으로 칠한다');
});

test('#393 5: 제목 ▾의 트리 목록은 셸의 드롭다운과 같은 내용·같은 이동 규칙이다',()=>{
 // 셸 파일은 고치지 않는다 — 셸이 만든 LTDEMO.library와 셸가 듣는 lt41-open-book(openBook)을 그대로 쓴다
 assert.match(NAV,/LTDEMO\.library=\(c\?\.trees\|\|\[c\.tree\]\)/,'목록 내용은 셸 데이터(LT41.trees)에서 온다');
 assert.match(NAV,/parent\.postMessage\(\{type:'lt41-open-book',treeId,id\}/,'이동은 셸이 이미 듣는 메시지로 간다');
 assert.match(EXTRA,/const orderedTrees=\(\)=>\{const list=Array\.isArray\(LTDEMO\.library\)\?\[\.\.\.LTDEMO\.library\]:\[\];return list\.sort\(\(a,b\)=>Number\(b\?\.inbox===true\)-Number\(a\?\.inbox===true\)\)\}/,'정리 전 트리가 먼저(셸과 같은 순서)');
 assert.match(EXTRA,/role="menuitemradio" class="tree-item" data-tree-id=/,'셸과 같은 행 구조');
 assert.match(EXTRA,/aria-checked="'\+\(tree\.id===currentId\)/,'지금 트리는 aria-checked');
 assert.match(EXTRA,/tree\.inbox===true\?'정리 전 '/,'개수 문구도 셸과 같다');
 assert.match(EXTRA,/if\(first\)LTDEMO\.openBook\(first,id\)/,'고르면 그 트리의 책으로 간다');
 assert.doesNotMatch(EXTRA,/shell\.mjs|shell\/header\.mjs/,'셸 파일을 고치지 않는다(부르기만 한다)');
});

test('#393 5: 마지막 장에 "다른 트리 보기"와 다른 트리 표지가 둔다 — 없으면 그리지 않는다',()=>{
 assert.match(EXTRA,/function otherTreesBlock\(\)\{\n if\(LTDEMO\.readOnly\)return;/,'공유·예시에서는 다른 트리로 갈 수 없으므로 숨긴다');
 assert.match(EXTRA,/const others=orderedTrees\(\)\.filter\(tree=>tree\.id!==currentTreeId\(\)\)\.slice\(0,3\)/,'다른 트리 표지 2~3개');
 assert.match(EXTRA,/rightPage\.innerHTML='<div class="next-page">[^;]*otherTreesBlock\(\)/,'빈 오른쪽 페이지의 다음 순간 추가 아래');
 assert.match(EXTRA,/insertAdjacentHTML\('beforeend','<div class="next-page">[^;]*otherTreesBlock\(\)/,'한 장에서도 마지막 순간 뒤 같은 자리에 붙인다');
 assert.match(EXTRA,/class="other-trees"><b>다른 트리 보기<\/b>/,'이름표');
 assert.ok(EXTRA.includes(`data-open-tree="'+t(tree.id)+'" data-open-moment="'+t(tree.moments?.[0]?.id||'')+'"`),'표지에는 그 트리 첫 순간으로 가는 근거를 남긴다');
 assert.match(USE_CSS,/html\[data-v41-screen=book\] \.next-page \.other-tree\{display:grid/,'표지 단추 모양(다음 순간 단추와 섞이지 않게)');
});

test('#393 5: 표지는 책장과 같은 판정을 쓴다 — 표지 사진 > 디자인 표지 > 기본 색',()=>{
 assert.match(EXTRA,/import \{coverChoice,COVER_PALETTE\} from '\/v41\/views\/shelf\/shelf-model\.mjs';/,'책장 모듈을 재사용한다');
 assert.match(EXTRA,/const choice=coverChoice\(tree,index,COVER_PALETTE\);/,'같은 판정');
 assert.ok(EXTRA.includes(`choice.design?' data-cover-design="'+t(choice.design)+'"`),'디자인 표지 속성');
 assert.ok(EXTRA.includes(`choice.coverMedia?'<img src="'+t(choice.coverMedia)`),'표지 사진');
});

test('#393 5: 좁은 폭에서 도구 줄이 스크롤되고 제목 단추가 줄어든다',()=>{
 assert.match(USE_CSS,/max-width:600px\)\{html\[data-v41-screen=book\] \.topbar \.tools\{max-width:40vw\}\}/,'폰 폭에서 도구 최대 폭 제한(넘치는 만큼 스크롤)');
 assert.match(CSS,/\.book-title-btn\{display:inline-flex;align-items:center;gap:7px;max-width:100%;min-width:0;min-height:44px;/,'제목 단추는 줄어들되 44px 손끝 크기는 지킨다');
 assert.match(CSS,/#bookTitleText\{font:700 18px var\(--book-serif\);letter-spacing:-\.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/,'제목은 넘치면 줄임표');
});
