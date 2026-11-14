// #458 계약: 모바일에 늘 떠 있는 ＋ 순간 추가 단추와 ☰ 메뉴의 지금 화면 표시.
// 1) 떠 있는 단추(#mobile-add)는 모바일 폭에서 아래 오른쪽 56px 원 — 쓰기 가능한 내 기록(body.lt-fab-ok)에서만 뜬다.
//    공유·예시 화면·로그아웃·읽기 전용·창(dialog) 열림·화상 키보드(lt-kbd)에서는 숨긴다. 781px 이상에는 영향이 없다.
// 2) ☰ 접기 메뉴의 지금 화면 항목에 aria-current="true"를 남기고 금테(--lt-gold-deep 토큰)로 표시한다.
// 3) 알림 줄(#toast)은 단추 왼쪽에 닿게 오른쪽 76px을 비워 둔다. 첫 화면 안내 줄(.hint)은 단추 자리만큼 왼쪽을 비운다.
// 4) 화면마다 아래쪽에 이미 있는 단추·탭 위로 단추를 올린다(data-fab-lift: 책 104·보드 68·지도 76, 책장은 낮은 화면 24).
//    지도 상세(#detail)·책 링크 창(#linkModal)이 열려 있으면 화면 아래를 덮으므로 단추도 숨긴다(lt-sheet-open).
//    첫 화면 궤도는 data-lt-fab 표시를 받아 오른쪽 아래 단추 자리를 비낀다(가로 당김 bound).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell = readFileSync(new URL('../public/v41/shell.mjs', import.meta.url), 'utf8');
const shellCSS = readFileSync(new URL('../public/v41/shell.css', import.meta.url), 'utf8');
const header = readFileSync(new URL('../public/v41/shell/header.mjs', import.meta.url), 'utf8');
const indexHTML = readFileSync(new URL('../public/v41/index.html', import.meta.url), 'utf8');
const orbitJS = readFileSync(new URL('../src/views/orbit.js', import.meta.url), 'utf8');

test('#458: 떠 있는 ＋ 단추가 있고, 모바일에서 아래 오른쪽 56px 원이다', () => {
  assert.match(indexHTML, /<button id="mobile-add" type="button" aria-label="순간 추가" aria-haspopup="dialog">＋<\/button>/, '단추 이름은 "순간 추가"다');
  const block = shellCSS.slice(shellCSS.indexOf('이슈 458: 모바일에서 늘 떠 있는'));
  assert.match(block, /#mobile-add\{position:fixed;right:14px;bottom:calc\(12px \+ env\(safe-area-inset-bottom\)\)/, '아래 오른쪽 고정');
  assert.match(block, /width:56px;height:56px;/, '누르는 영역 56px(44px 이상)');
  assert.match(block, /@media\(max-width:780px\)/, '모바일 폭에서만');
  assert.match(shellCSS, /#mobile-add\{display:none\}/, '781px 이상에는 영향이 없다(기본 숨김)');
});

test('#458: 단추는 쓰기 가능한 내 기록에서만 뜬다', () => {
  assert.match(header, /document\.body\.classList\.toggle\('lt-fab-ok',!\$\('write-menu'\)\.hidden&&getSource\(\)==='server'&&owned\)/, '서버·쓰기 가능·로그인에서만 lt-fab-ok');
  assert.match(shell, /\$\('mobile-add'\)\.addEventListener\('click',\(\)=>\$\('write-menu'\)\.click\(\)\)/, '헤더의 ＋ 순간 추가와 같은 길을 연다');
  assert.match(shellCSS, /body\.lt-fab-ok #mobile-add\{display:flex\}/, 'lt-fab-ok일 때만 표시');
  assert.match(shellCSS, /body\.lt-fab-ok:has\(dialog\[open\]\) #mobile-add\{display:none\}/, '창이 열려 있으면 숨긴다');
  assert.match(shellCSS, /body\.lt-fab-ok\.lt-kbd #mobile-add\{display:none\}/, '화상 키보드가 올라오면 숨긴다');
  assert.match(shellCSS, /body\.lt-fab-ok\.lt-sheet-open #mobile-add\{display:none\}/, '화면 안의 큰 창(지도 상세·책 링크 창)이 열리면 숨긴다');
  assert.match(shell, /watchFrameSheet\(frame\)/, '셸은 프레임의 창 열림/닫힘을 알아챈다');
  assert.match(shell, /\['detail','linkModal'\]\.map\(id=>d\.getElementById\(id\)\)/, '감시 대상은 지도·책의 상세 창(#detail)과 책 링크 창(#linkModal)이다');
  assert.match(shell, /visualViewport\.height<window\.innerHeight-120/, '키보드 판정은 시각 창이 120px 이상 눌릴 때다');
});

test('#458: 화면별로 이미 있는 아래쪽 단추 위로 올린다', () => {
  assert.match(header, /document\.body\.dataset\.fabLift=\{'track59-sketchbook\.html':'book','track58-pinboard\.html':'board','track56-network\.html':'network','track32-bookshelf\.html':'shelf'\}\[getCurrent\(\)\]\|\|''/, 'flowNavigation이 지금 화면의 끌어올림 값을 정한다');
  assert.match(shellCSS, /body\.lt-fab-ok\[data-fab-lift="book"\] #mobile-add\{bottom:calc\(104px \+ env\(safe-area-inset-bottom\)\)\}/, '책: 갈라치기 탭(753~797) 위');
  assert.match(shellCSS, /body\.lt-fab-ok\[data-fab-lift="board"\] #mobile-add\{bottom:calc\(68px \+ env\(safe-area-inset-bottom\)\)\}/, '보드: 시네마 보기(784~828) 위');
  assert.match(shellCSS, /body\.lt-fab-ok\[data-fab-lift="network"\] #mobile-add\{bottom:calc\(76px \+ env\(safe-area-inset-bottom\)\)\}/, '지도: 이동 리본(781~825) 위');
  const shelf = shellCSS.slice(shellCSS.indexOf('책장의 넘김 화살표'));
  assert.match(shelf, /@media\(max-width:780px\) and \(max-height:749px\)\{\n  body\.lt-fab-ok\[data-fab-lift="shelf"\] #mobile-add\{bottom:calc\(24px \+ env\(safe-area-inset-bottom\)\)\}\n \}/, '책장은 화면이 낮을 때만 올린다(390×844는 그대로)');
});

test('#458: 첫 화면 궤도는 단추 자리를 비낀다', () => {
  assert.match(shell, /d\.documentElement\.dataset\.ltFab='1'/, '셸은 모바일에서 프레임 html에 data-lt-fab을 표시한다');
  assert.match(orbitJS, /const fabPad=document\.documentElement\.hasAttribute\('data-lt-fab'\)\?76:0;/, '궤도는 표시를 읽어 76px를 비낀다');
  assert.match(orbitJS, /else if\(maxX>w-fabPad\)\{const over=maxX-\(w-fabPad\);px-=over;maxX-=over;minX-=over;\}/, '좁은 화면 가로 당김 bound가 단추 자리를 피한다');
});

test('#458: ☰ 메뉴 항목과 화면 파일이 짝을 이룬다', () => {
  assert.match(shell, /const add=\(label,click,mark\)=>\{[^}]*if\(mark\)b\.setAttribute\('aria-current','true'\)/, 'add가 표시를 받는다');
  assert.match(shell, /add\('책'[^;]*current==='track59-sketchbook\.html'\)/);
  assert.match(shell, /add\('첫 화면'[^;]*current==='src064-orbit\.html'\)/);
  assert.match(shell, /add\('보드'[^;]*current==='track58-pinboard\.html'\)/);
  assert.match(shell, /add\('지도'[^;]*current==='track56-network\.html'\)/);
  assert.match(shell, /add\('내 트리 전체 보기'[^;]*current==='track32-bookshelf\.html'\)/);
});

test('#458: 지금 화면 항목은 금테(테마 토큰)로 표시된다', () => {
  const at = shellCSS.indexOf('이슈 458: 접기 메뉴');
  let rule = shellCSS.slice(shellCSS.indexOf('#header-overflow button[aria-current="true"]', at));
  rule = rule.slice(0, rule.indexOf('}') + 1);
  assert.match(rule, /box-shadow:inset 0 0 0 1px var\(--lt-gold-deep\)/, '금테는 --lt-gold-deep 토큰(밤·정원 각각의 값)');
  assert.doesNotMatch(rule, /#[0-9a-fA-F]{3,8}\b/, '색 상수를 쓰지 않는다');
});

test('#458: 알림 줄과 첫 화면 안내 줄이 단추와 겹치지 않게 자리를 피한다', () => {
  const block = shellCSS.slice(shellCSS.indexOf('이슈 458: 모바일에서 늘 떠 있는'));
  assert.match(block, /body\.lt-fab-ok #toast\{max-width:calc\(100% - 104px\);transform:translateX\(calc\(-50% - 38px\)\)\}/, '알림 줄은 오른쪽 76px을 비워 둔다');
  assert.match(orbitJS, /.hint\{font-size:13px;bottom:18px;right:80px\}/, '첫 화면 안내 줄은 단추 자리(오른쪽 76px+여백)만큼 왼쪽을 비운다(#548: 안내 13px)');
});
