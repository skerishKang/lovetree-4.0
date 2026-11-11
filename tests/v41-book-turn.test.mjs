import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const BOOK=readFileSync(new URL('../public/v41/views/book/book.js',import.meta.url),'utf8');
const EXTRA=readFileSync(new URL('../public/v41/views/book/book-extra.js',import.meta.url),'utf8');
const CSS=readFileSync(new URL('../public/v41/views/book/book.css',import.meta.url),'utf8');
const HTML=readFileSync(new URL('../public/v41/views/track59-sketchbook.html',import.meta.url),'utf8');
const between=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b));

test('#393 3: 넘기는 동안 아래 페이지를 다시 그리지 않는다 — 그림은 prepareTurn에서 한 번',()=>{
 const setTurn=between(BOOK,'function setTurnProgress','function prepareTurn');
 assert.doesNotMatch(setTurn,/innerHTML/,'setTurnProgress는 innerHTML을 쓰지 않는다');
 assert.doesNotMatch(setTurn,/markOverflowPages/,'setTurnProgress는 매 프레임 판정하지 않는다');
 const prepare=between(BOOK,'function prepareTurn','function finishTurn');
 // 아래 페이지 그림 한 번 + 판정 한 번
 assert.match(prepare,/rightPage\.innerHTML=momentContent\(\{\.\.\.tar\.right,spread:t\}\)/,'next: 아래 오른쪽 페이지를 준비에서 한 번 그린다');
 assert.match(prepare,/leftPage\.innerHTML=momentContent\(\{\.\.\.tar\.left,spread:t\}\)/,'prev: 아래 왼쪽 페이지를 준비에서 한 번 그린다');
 assert.match(prepare,/mobileContent\.innerHTML=mobileSpreadContent\(tar\)/,'모바일: 아래 한 장을 준비에서 한 번 그린다');
 assert.match(prepare,/markOverflowPages\(\);turn\.frontFace=front/,'그린 직후 넘침 판정 한 번');
 // 그림자·어둠·광은 미리 만든 층의 opacity만
 assert.match(setTurn,/shadowLayer\.style\.opacity/,'그림자 층 opacity');
 assert.match(setTurn,/shadeLayer\.style\.opacity/,'어둠 층 opacity');
 assert.match(setTurn,/sheenLayer\.style\.opacity/,'광 층 opacity');
 assert.doesNotMatch(setTurn,/setProperty\('--turn'/,'--turn 변수 매 프레임 갱신을 없앤다');
});

test('#393 3: 휘어짐·그림자가 매 프레임 var() 계산을 하지 않는다 — CSS에서 --turn 계산식 제거',()=>{
 assert.doesNotMatch(CSS,/drop-shadow\(calc\(/,'flip-sheet filter drop-shadow 계산 제거');
 assert.doesNotMatch(CSS,/clip-path:polygon\(calc\(var\(--turn\)/,'curl clip-path var 계산 제거');
 assert.doesNotMatch(CSS,/calc\(var\(--turn\)\*\.18\)|calc\(\(1 - var\(--turn\)\)/,'face:after 그라디언트 var 계산 제거');
 assert.match(CSS,/\.flip-sheet \.flip-shadow\{[^}]*box-shadow:[^}]*opacity:0\}/,'미리 만든 그림자 층');
 assert.match(CSS,/\.flip-sheet \.flip-shade\{[^}]*opacity:0\}/,'미리 만든 어둠 층');
 assert.match(CSS,/\.flip-sheet \.flip-sheen\{[^}]*opacity:0\}/,'미리 만든 광 층');
 assert.match(HTML,/class="flip-shadow"/,'층은 미리 심어 둔다(넘김 첫 프레임이 노드 만들기를 하지 않는다)');
});

test('#393 3: 내용 페이드 — 앞면은 흐려지고 새 면은 또렷해진다',()=>{
 const setTurn=between(BOOK,'function setTurnProgress','function prepareTurn');
 assert.match(setTurn,/frontFace\.style\.opacity=\(1-p\*\.92\)/,'앞면 서서히 흐려짐');
 assert.match(setTurn,/backFace\.style\.opacity=\(\.08\+p\*\.92\)/,'새 면 서서히 또렷');
});

test('#393 3: 넘김 끝 빈 틈 0 — 새 페이지를 먼저 완성하고 같은 프레임에 종이를 치운다',()=>{
 const finish=between(BOOK,'function finishTurn','function autoTurn');
 assert.doesNotMatch(finish,/setTimeout\(/,'착지 setTimeout 틈을 없앤다');
 const commitIdx=finish.indexOf("machineState='LANDING'");
 const spreadIdx=finish.indexOf('renderSpread(target,landingFocus,true)');
 const cleanIdx=finish.indexOf("sh.className='flip-sheet'");
 assert.ok(commitIdx>-1&&spreadIdx>-1&&cleanIdx>spreadIdx,'renderSpread(새 페이지 완성)이 종이 치우기보다 먼저 같은 프레임에 있다');
 // 취소 때도 같은 프레임 복귀
 assert.match(finish,/machineState='IDLE';renderSpread\(current,LTDEMO\.get\(\),false\)/);
});

test('#393 3: 넘김 시간 0.65초·ease-in-out — 천천히 들리고 천천히 내려앉는다',()=>{
 const finish=between(BOOK,'function finishTurn','function autoTurn');
 assert.match(finish,/650\*Math\.abs\(to-from\)/,'기본 넘김 0.65초(거리 비례)');
 assert.match(finish,/Math\.max\(220,/,'부분 넘김 최소 0.22초');
 assert.match(finish,/q<\.5\?2\*q\*q:1-Math\.pow\(-2\*q\+2,2\)\/2/,'ease-in-out');
 assert.doesNotMatch(finish,/1-Math\.pow\(1-q,3\)/,'급하게 시작하는 cubic-out은 버린다');
});

test('#393 3: 재생 중인 영상은 넘길 때 잠깐 멈추고 면은 썸네일로 다시 그린다',()=>{
 const prepare=between(BOOK,'function prepareTurn','function finishTurn');
 assert.match(prepare,/for\(const v of book\.querySelectorAll\('video'\)\)try\{v\.pause\(\)\}catch\{\}/,'살아 있는 페이지의 video 일시정지');
 // 면은 momentContent(썸네일)로 새로 그려진다 — #409 세로·가로 틀 규칙을 그대로 탄다
 assert.match(prepare,/pageFace\(\{\.\.\.cur\.right,spread:current\},'right'\)/);
 assert.match(prepare,/pageFace\(\{\.\.\.tar\.left,spread:t\},'left'\)/);
});

test('#393 3 + #368 2차: 움직임 줄이기·페이지 넘김(부드럽게) — 0.35초 페이드',()=>{
 // #368 2차: 페이지 넘김은 이 기기 저장값(lt41.pageTurn)을 따르고, 시스템 움직임 줄이기가 있으면 무조건 부드럽게다.
 assert.match(BOOK,/const PAGE_TURN_KEY='lt41\.pageTurn';/);
 assert.match(BOOK,/let pageTurn='paper';try\{pageTurn=localStorage\.getItem\(PAGE_TURN_KEY\)==='smooth'\?'smooth':'paper'\}catch\{\}/,'기본은 종이처럼, 읽지 못해도 종이처럼');
 assert.match(BOOK,/function smoothTurn\(\)\{return reduced\|\|pageTurn==='smooth'\}/,'움직임 줄이기가 우선한다');
 assert.match(BOOK,/function setPageTurnMode\(value\)\{pageTurn=value==='smooth'\?'smooth':'paper'\}/,'설정 바꾸면 메시지로 받는다');
 assert.match(EXTRA,/type!=='lt41-page-turn'/,'book-extra가 lt41-page-turn을 받는다');
 const prepare=between(BOOK,'function prepareTurn','function finishTurn');
 const finish=between(BOOK,'function finishTurn','function autoTurn');
 assert.match(prepare,/smoothTurn\(\)\?' reduced':''/,'페이드 모드(움직임 줄이기·부드럽게)에서는 페이드 전용 면을 쓴다');
 assert.match(prepare,/reduced-faces/,'컴퓨터는 펼침 두 면을 한 장의 덮개로');
 assert.match(finish,/smoothTurn\(\)\?350:/,'페이드 0.35초');
 assert.match(CSS,/\.flip-sheet\.reduced\{width:100%;left:0!important;filter:none\}/);
 assert.match(CSS,/\.reduced-faces\{display:grid;grid-template-columns:1fr 1fr/);
 const setTurn=between(BOOK,'function setTurnProgress','function prepareTurn');
 assert.match(setTurn,/if\(smoothTurn\(\)\)\{sh\.style\.opacity=\(1-p\)\.toFixed\(3\);return\}/,'페이드 모드는 opacity만 바꾼다');
});

test('#393 3: 모바일 한 장 넘김은 손가락을 미는 만큼 따라온다(기존 스와이프 경로 유지)',()=>{
 assert.match(BOOK,/touch\.mode='swipe';clearTimeout\(pressTimer\);const dir=dx<0\?'next':'prev';if\(prepareTurn\(dir\)\)/,'스와이프 시작이 prepareTurn을 쓴다');
 assert.match(BOOK,/touch\.mode==='swipe'&&turn\)\{const dx2=e\.clientX-touch\.x;const denom=Math\.max\(180,bookWrap\.clientWidth\*\.72\);setTurnProgress\(Math\.abs\(dx2\)\/denom\)\}/,'미는 만큼 setTurnProgress');
 assert.match(BOOK,/if\(mode==='swipe'&&turn\)\{finishTurn\(!cancel&&turn\.progress>=\.34\);return\}/,'놓으면 끝까지 넘기거나 돌아온다');
});
