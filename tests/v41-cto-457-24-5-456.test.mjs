// CTO 점검 2차 PR 2: #457 4번(안내 겹침)·5번(공유할 트리 없을 때 단추)·#456(제목 옆 ▾ 크기).
// (#457 1·2·3번은 각각 src/views/orbit.js의 390 카드 배치 PR, tests/v41-header-states.test.mjs,
// tests/v41-header-tabs-mobile.test.mjs에서 다룬다.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const orbitCSS = read('src/views/orbit-source.css');
const treeTitleCSS = read('public/v41/views/tree-title.css');
const bookCSS = read('public/v41/views/book/book.css');
const communityPanel = read('public/v41/community-panel.mjs');
const messages = read('public/v41/shell/messages.mjs');

test('이슈 457 4번: 390 첫 화면 ".hint" 안내는 셸 토스트(#toast, 아래 가운데)와 겹치지 않게 더 위로', () => {
  // 셸 토스트는 #toast{bottom:max(22px,...);left:50%}로 가운데·아래쪽에 뜬다(shell.css).
  // .hint는 같은 bottom 14px대였다 — 오른쪽 끝이라도 토스트가 넓으면 겹친다. 70px로 띄운다.
  const narrow = orbitCSS.slice(orbitCSS.indexOf('@media(max-width:700px){.topbar{padding:18px 18px}'));
  assert.match(narrow, /\.hint\{right:16px;bottom:70px\}/);
  assert.doesNotMatch(narrow, /\.hint\{right:16px;bottom:14px\}/, '옛 값(토스트와 겹치는 높이)이 남지 않는다');
});

test('이슈 457 5번: 공유할 내 트리가 없으면(로그아웃·트리 0개) "내 트리 공유하기"가 "첫 트리 만들기"로 바뀐다', () => {
  assert.match(communityPanel, /export function mountCommunity\(\{button,dialog,onOpenShare,onStartRecord,onShareOwn,hasOwnTree\}\)/);
  assert.match(communityPanel, /const canShare=!!hasOwnTree\?\.\(\);/);
  assert.match(communityPanel, /canShare\?'내 트리 공유하기':'첫 트리 만들기'/);
  // 공유할 트리가 있을 때만 공유 흐름(onShareOwn), 없을 때는 첫 트리 만들기 흐름(onStartRecord)으로 보낸다.
  assert.match(communityPanel, /share\.onclick=canShare\?\(\(\)=>onShareOwn\?\.\(\)\):\(\(\)=>onStartRecord\?\.\(\)\);/);
  // 눌렀을 때 지금 동작 확인: messages.mjs가 넘기는 hasOwnTree는 로그인한 서버 소스 + 내 트리 1개 이상일 때만 참이다.
  assert.match(messages, /hasOwnTree: \(\) => getSource\(\) === 'server' && !!getMember\(\)\?\.snapshot\(\)\.owned && \(getModel\(\)\?\.trees\?\.length \|\| 0\) > 0,/);
});

test('이슈 456: 책·보드·지도 제목 옆 ▾는 14px 이상이고, 누르는 영역은 44px 그대로', () => {
  // 보드·지도(tree-title.css, 공용)
  assert.match(treeTitleCSS, /\.tree-title-caret\{flex:none;font-size:14px;transition:transform \.15s\}/);
  assert.doesNotMatch(treeTitleCSS, /\.tree-title-caret\{flex:none;font-size:10px/, '옛 10px가 남지 않는다');
  assert.match(treeTitleCSS, /\.tree-title-btn\{[^}]*min-height:44px/, '누르는 영역 44px 유지');
  // 책(book.css, 자기 구현 — #416/#393 5)
  assert.match(bookCSS, /\.book-title-caret\{flex:none;font-size:14px;color:#a78f92;transition:transform \.15s\}/);
  assert.doesNotMatch(bookCSS, /\.book-title-caret\{flex:none;font-size:10px/, '옛 10px가 남지 않는다');
  assert.match(bookCSS, /\.book-title-btn\{[^}]*min-height:44px/, '누르는 영역 44px 유지');
});
