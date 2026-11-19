// #458 계약: 모바일에 늘 떠 있는 ＋ 순간 추가 단추와 ☰ 메뉴의 지금 화면 표시.
// 1) 떠 있는 단추(#mobile-add)는 모바일 폭에서 아래 오른쪽 56px 원 — 쓰기 가능한 내 기록(body.lt-fab-ok)에서만 뜬다.
//    공유·예시 화면·로그아웃·읽기 전용·창(dialog) 열림·화상 키보드(lt-kbd)에서는 숨긴다. 781px 이상에는 영향이 없다.
// 2) #987: ☰ 접기 메뉴의 지금 화면 항목에 aria-current="true"를 남기고 글자 밑줄로 표시한다.
// 3) 알림 줄(#toast)은 단추 왼쪽에 닿게 오른쪽 76px을 비워 둔다. 첫 화면 안내 줄(.hint)은 단추 자리만큼 왼쪽을 비운다.
// 4) 화면마다 아래쪽에 이미 있는 단추·탭 위로 단추를 올린다(data-fab-lift: 책 104·보드 68·지도 160, 책장은 낮은 화면 24).
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
  const block = shellCSS.slice(shellCSS.indexOf('이슈 458: 모바일에서 늘 떠 있는'));
  assert.match(block, /#mobile-add\{position:fixed;right:14px;bottom:calc\(12px \+ env\(safe-area-inset-bottom\)\)/, '아래 오른쪽 고정');
  assert.match(block, /width:56px;height:56px;/, '누르는 영역 56px(44px 이상)');
  assert.match(block, /@media\(max-width:780px\)/, '모바일 폭에서만');
});

test('#458: 화면별로 이미 있는 아래쪽 단추 위로 올린다', () => {
  const shelf = shellCSS.slice(shellCSS.indexOf('책장의 넘김 화살표'));
  assert.match(shelf, /@media\(max-width:780px\) and \(max-height:749px\)\{\n  body\.lt-fab-ok\[data-fab-lift="shelf"\] #mobile-add\{bottom:calc\(24px \+ env\(safe-area-inset-bottom\)\)\}\n \}/, '책장은 화면이 낮을 때만 올린다(390×844는 그대로)');
});

test('#987: 지금 화면 항목은 테두리 없이 글자 밑줄로 표시된다', () => {
  const at = shellCSS.indexOf('이슈 458: 접기 메뉴');
  let rule = shellCSS.slice(shellCSS.indexOf('#header-overflow button[aria-current="true"]', at));
  rule = rule.slice(0, rule.indexOf('}') + 1);
  assert.match(rule, /text-decoration:underline/, '지금 화면의 글자에 밑줄');
  assert.match(rule, /box-shadow:none;\s*border:0/, '줄 전체 테두리 없음');
  assert.doesNotMatch(rule, /#[0-9a-fA-F]{3,8}\b/, '색 상수를 쓰지 않는다');
});

test('#458: 알림 줄과 첫 화면 안내 줄이 단추와 겹치지 않게 자리를 피한다', () => {
  const block = shellCSS.slice(shellCSS.indexOf('이슈 458: 모바일에서 늘 떠 있는'));
  // #666: 예전에는 알림 줄이 오른쪽 76px을 비켜 섰다. 이제는 아래에 붙은 것들(링크 줄·＋ 단추·새 소식 카드)
  // 위로 통째로 올라가므로 비켜 설 필요가 없다 — 자리는 셸이 재서 --lt-toast-bottom에 넣는다.
  assert.doesNotMatch(block, /body\.lt-fab-ok #toast\{max-width/, '알림 줄이 단추를 피해 옆으로 비켜 서지 않는다');
});
