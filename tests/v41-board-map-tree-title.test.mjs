import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const BOARD_HTML=readFileSync(new URL('../public/v41/views/track58-pinboard.html',import.meta.url),'utf8');
const NETWORK_HTML=readFileSync(new URL('../public/v41/views/track56-network.html',import.meta.url),'utf8');
const MODULE=readFileSync(new URL('../public/v41/views/tree-title.mjs',import.meta.url),'utf8');
const CSS=readFileSync(new URL('../public/v41/views/tree-title.css',import.meta.url),'utf8');
const BOARD_CSS=readFileSync(new URL('../public/v41/views/board/board.css',import.meta.url),'utf8');
const MESSAGES=readFileSync(new URL('../public/v41/shell/messages.mjs',import.meta.url),'utf8');
const IDENTITY=readFileSync(new URL('../public/v41/identity.css',import.meta.url),'utf8');

test('#417: 보드·지도 머리는 책(#416)과 같은 왼쪽 묶음이다 — ← 내 트리 + 지금 트리 제목 + ▾',()=>{
 for(const [name,html] of [['보드',BOARD_HTML],['지도',NETWORK_HTML]]){
  assert.match(html,/class="topbar-left"><button[^>]*id="shelfBackBtn"[^>]*>← 내 트리<\/button>/,name+': 왼쪽 끝이 ← 내 트리다');
  assert.match(html,/id="treeTitleBtn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="treeMenuPanel"/,name+': 제목 단추는 팝업 단추로 자신을 알린다');
  assert.match(html,/class="tree-title-caret" aria-hidden="true">▾</,name+': ▾ 표시');
  assert.match(html,/id="treeMenuPanel" role="menu" aria-label="다른 트리" hidden/,name+': 트리 목록 자리');
  assert.doesNotMatch(html,/class="brand"/,name+': 안쪽 brand(러브트리)는 맨 위 메뉴 로고에 맡기고 뺀다');
  assert.match(html,/\/v41\/views\/tree-title\.mjs/,name+': 공통 모듈을 부른다');
  assert.match(html,/\/v41\/views\/tree-title\.css/,name+': 공통 모양을 부른다');
 }
 assert.match(BOARD_HTML,/id="treeTitleText">기억 보드</,'보드 제목 글자 자리');
 assert.match(NETWORK_HTML,/id="treeTitleText">관계 지도</,'지도 제목 글자 자리');
 assert.doesNotMatch(BOARD_HTML,/class="crumb"/,'보드 crumb(기억 보드)도 이 자리로 바꿔 넣는다');
});

test('#417: 트리 목록은 셸 데이터(parent LT41)에서 읽고, 이동은 셸이 듣는 lt41-open-view로 같은 보기로 간다',()=>{
 assert.match(MODULE,/window\.parent\.LT41 \|\| null/,'목록은 셸이 넘긴 LT41(tree·trees)에서 읽는다');
 assert.match(MODULE,/Number\(b\.inbox\) - Number\(a\.inbox\)/,'정리 전 트리가 먼저(셸과 같은 순서)');
 assert.match(MODULE,/role="menuitemradio" class="tree-item" data-tree-id=/,'셸과 같은 행 구조');
 assert.match(MODULE,/aria-checked="'\s*\+\s*\(row\.id === cur\)/,'지금 트리는 aria-checked');
 assert.match(MODULE,/row\.inbox \? '정리 전 ' \+ row\.count/,'개수 문구도 셸과 같다');
 assert.match(MODULE,/import \{coverChoice, COVER_PALETTE\} from '\/v41\/views\/shelf\/shelf-model\.mjs';/,'표지 판정은 책장과 같은 규칙을 재사용한다');
 assert.match(MODULE,/parent\.postMessage\(\{type: 'lt41-open-view', treeId: id, view\}, location\.origin\)/,'이동은 셸이 듣는 lt41-open-view 메시지로 간다');
 assert.match(MODULE,/parent\.postMessage\(\{type: 'lt41-navigate', view: 'track32-bookshelf\.html'\}, location\.origin\)/,'← 내 트리는 기존 lt41-navigate(책장) 메시지로 간다');
 assert.match(MESSAGES,/data\?\.type === 'lt41-open-view' && \['board', 'network'\]\.includes\(data\.view\)/,'셸은 보기가 board·network일 때만 받는다');
 assert.match(MESSAGES,/getModel\(\)\?\.trees\.some\(t => t\.id === data\.treeId\)/,'없는 트리는 무시한다');
 assert.match(IDENTITY,/html\[data-v41-screen=shelf\],html\[data-v41-screen=board\],html\[data-v41-screen=network\],#tree-design\{--lt-cover-1/,'표지 색 팔레트는 책장 것을 같이 쓴다(복사하지 않는다)');
});

test('#417: 공유·예시(읽기 전용)에서는 ▾와 ← 내 트리를 숨긴다',()=>{
 assert.match(MODULE,/return !c \|\| c\.source !== 'server' \|\| c\.writable !== true;/,'읽기 전용은 셸의 저장 판정(board.js)과 같은 근거로 내린다');
 assert.match(MODULE,/if \(ro\) \{ if \(caret\) caret\.hidden = true; if \(back\) back\.hidden = true; \}/,'▾와 ← 내 트리를 숨긴다');
 assert.match(MODULE,/if \(ro\) return;/,'읽기 전용에서는 목록을 열지 않는다');
});

test('#417: 목차 키보드 동작은 책(#416)과 같다 — Esc 닫기·위아래 이동·바깥 누르면 닫기',()=>{
 assert.match(MODULE,/e\.key === 'Escape' && !menu\.hidden/,'Esc로 닫고');
 assert.match(MODULE,/trigger\.focus\(\); close\(\);/,'단추로 초점을 돌려 준다(숨기기 전에 옮긴다)');
 assert.match(MODULE,/e\.key === 'ArrowDown' \|\| e\.key === 'Down'/,'아래로');
 assert.match(MODULE,/e\.key === 'ArrowUp' \|\| e\.key === 'Up'/,'위로');
 assert.match(MODULE,/!e\.target\.closest\('\.tree-title'\)\) close\(\)/,'바깥을 누르면 닫는다');
 assert.match(MODULE,/trigger\.setAttribute\('aria-expanded', 'true'\)/,'열림 상태를 단추에 남긴다');
});

test('#417: 좁은 폭에서 제목이 줄어들고 겹치지 않는다 — 보드 모바일에서도 ← 내 트리가 살아 있다',()=>{
 assert.match(CSS,/\.topbar-left\{display:flex;align-items:center;gap:10px;min-width:0;flex:0 1 auto\}/,'묶음은 줄어들 수 있다');
 assert.match(CSS,/\.tree-title-btn\{display:inline-flex;align-items:center;gap:7px;max-width:100%;min-width:0;min-height:44px;/,'제목 단추는 줄어들되 44px 손끝 크기는 지킨다');
 assert.match(CSS,/#treeTitleText\{font-weight:700;font-size:18px;/,'제목은 크고');
 assert.match(CSS,/overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/,'넘치면 줄임표');
 assert.match(BOARD_CSS,/\.headbtn\{display:none\}\.headbtn\.primary\{display:block[^}]*\}#shelfBackBtn\{display:inline-flex;min-height:44px;height:auto\}/,'보드 폰 폭에서 되돌리기 등은 숨기되 ← 내 트리는 남긴다');
 assert.match(CSS,/html\[data-v41-screen=network\] \.topbar-left\{pointer-events:auto;margin-right:auto\}/,'지도 topbar는 클릭을 막아 두었으므로 묶음을 다시 받고(#421) 왼쪽을 지킨다');
});
