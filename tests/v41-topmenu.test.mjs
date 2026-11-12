// #380 2번: 맨 위 메뉴 개편 — 로고→첫 화면, 첫 화면·내 책장 탭 삭제, [트리 ▾ │ 책│보드│지도] 한 틀.
// 셸 헤더는 그림자 DOM이라 소스 계약으로 고정하고, 계산 규칙(header-state)은 함수 직접 호출로 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const html = read('public/v41/index.html');
const css = read('public/v41/shell.css');
const shell = read('public/v41/shell.mjs');
const navigation = read('public/v41/shell/navigation.mjs');
const headerState = read('public/v41/header-state.mjs');
const postdeploy = read('tools/postdeploy/postdeploy.mjs');

const nav = html.slice(html.indexOf('<nav class="main-nav"'), html.indexOf('</nav>'));

test('첫 화면·내 책장 탭은 맨 위 메뉴에서 없어진다', () => {
  assert.doesNotMatch(nav, /data-view="src064-orbit\.html"/);
  assert.doesNotMatch(nav, /data-view="track32-bookshelf\.html"/);
  assert.doesNotMatch(nav, />첫 화면</);
  assert.doesNotMatch(nav, />내 책장</);
});

test('로고가 첫 화면으로 간다 — 링크·키보드(#home 해시)', () => {
  assert.match(html, /<a class="brand" href="#home" aria-label="[^"]*첫 화면/);
  // 주소 처리는 #home을 첫 화면으로 읽는다(location.mjs의 parseSelectionRoute + show).
  const location = read('public/v41/shell/location.mjs');
  assert.match(location, /addEventListener\('hashchange', applyBrowserLocation\)/);
  assert.match(navigation, /\['home', 'src064-orbit\.html', '첫 화면'\]/);
});

test('트리 선택과 보기 방식이 한 틀(.tree-frame)에 붙고 이름은 책·보드·지도다', () => {
  const frame = nav.slice(nav.indexOf('class="tree-frame"'), nav.indexOf('</nav>'));
  assert.ok(frame.includes('id="record-menu"') && frame.includes('id="tree-views"'), '트리 ▾와 보기 묶음이 같은 틀 안에 있다');
  assert.match(frame, /role="group" aria-label="이 트리 보기"/);
  assert.match(frame, />책<\/button>/);
  assert.match(frame, />보드<\/button>/);
  assert.match(frame, />지도<\/button>/);
  assert.doesNotMatch(frame, /기억책|기억 보드|관계 지도/);
  // 한 틀 모양: 알약 테두리 한 줄, 보기 버튼 사이는 안쪽 구분선.
  assert.match(css, /\.tree-frame\{display:flex;align-items:center;flex:0 0 auto;margin-left:6px;padding:1px;border:1px solid rgba\(255,255,255,\.16\);border-radius:999px/);
  assert.match(css, /\.tree-frame \.tree-views\{margin-left:0;padding-left:0;border-left:0;gap:0\}/);
  assert.match(css, /\.tree-frame \.tree-views>button\{min-height:40px;border-left:1px solid var\(--line\);border-radius:0\}/);
});

test('지금 보는 보기는 눌린 상태(aria-current)로 표시된다', () => {
  // screens.mjs show()가 data-view 버튼에 aria-current를 넣고, CSS가 금테로 칠한다.
  const screens = read('public/v41/shell/screens.mjs');
  assert.match(screens, /querySelectorAll\('\[data-view\]'\)\.forEach\(b => b\.setAttribute\('aria-current', String\(b\.dataset\.view === file\)\)\)/);
  assert.match(css, /nav button\[aria-current=true\]\{[^}]*box-shadow:inset 0 0 0 1px var\(--lt-gold-line\)/);
});

test('트리 ▾를 누르면 그 트리로 이동하는 동작이 그대로다', () => {
  // 책·보드·지도를 보던 중이면 같은 보기로, 아니면 그 트리의 책으로(#381).
  assert.match(shell, /const wasTreeView=TREE_VIEWS\.has\(current\);choose\(id\);if\(!wasTreeView\)show\('track59-sketchbook\.html',false\);flowNavigation\(\);writeLocation\(\);/);
});

test('트리 드롭다운 맨 아래 "내 트리 전체 보기"가 책장 화면을 연다', () => {
  assert.match(shell, /data-tree-action="shelf">내 트리 전체 보기<\/button>/);
  assert.match(shell, /querySelector\('\[data-tree-action="shelf"\]'\)\?\.addEventListener\('click',\(\)=>\{closeTreeMenu\(\);show\('track32-bookshelf\.html'\);\}\)/);
  // 로그인 상태에서만 그려진다(로그아웃 드롭다운은 아예 열리지 않지만 이중으로 걸러 둔다).
  assert.match(shell, /const shelfEntry=member\?\.snapshot\(\)\.owned\?/);
});

test('모바일 접기 메뉴(메뉴 더보기)도 같은 구조다', () => {
  const fold = shell.slice(shell.indexOf('function buildFoldMenu'), shell.indexOf('const escHTML'));
  const order = ["add('첫 화면'", "add('둘러보기'", "add('책'", "add('보드'", "add('지도'", "add('내 트리 전체 보기'"];
  let at = -1;
  for (const token of order) {
    const next = fold.indexOf(token, at + 1);
    assert.ok(next > at, token + ' 순서');
    at = next;
  }
  // 첫 화면은 로고 클릭과 같은 동작, 책장은 로그인 상태에 따라 로그인 시작 또는 책장 화면.
  assert.match(fold, /add\('첫 화면',\(\)=>document\.querySelector\('\.brand'\)\.click\(\),current==='src064-orbit\.html'\)/);
  assert.match(fold, /member\?\.snapshot\(\)\.owned\?show\('track32-bookshelf\.html'\):openLoginStart\('shelf'\)/);
});

test('간단·고급 모드와 상관없이 맨 위 메뉴 높이 규칙은 유지된다', () => {
  // 2026-11-10 메뉴 정리의 높이 규칙(최소 64px + 아래 경계선)을 그대로 둔다.
  assert.match(css, /\.app-header\{min-height:64px;padding:10px 20px/);
  // 한 틀 안의 버튼도 40px 높이 규칙을 쓴다 — 틀이 메뉴 높이를 키우지 않는다(변경 전 65px 유지).
  assert.match(css, /\.tree-frame \.tree-views>button\{min-height:40px;/);
  // 고급 기능 보기(lt-advanced)는 계정 메뉴 안의 일이라 맨 위 메뉴 구조를 바꾸지 않는다.
  assert.match(shell, /document\.body\.classList\.toggle\('lt-advanced',on\)/);
  assert.doesNotMatch(css, /\.lt-advanced [^{]*\.tree-frame/);
});

test('둘러보기 패널 닫기 버튼은 맨 위 메뉴의 계정 버튼과 겹치지 않는다(407)', () => {
  // 닫기 버튼을 맨 위 메뉴(약 66px) 아래로 내린다.
  assert.match(css, /#community-panel \.community-top\{padding-top:44px\}/);
});

test('화면 제목과 안내 글도 줄인 이름을 쓴다', () => {
  assert.match(navigation, /\['book', 'track59-sketchbook\.html', '책'\]/);
  assert.match(navigation, /\['board', 'track58-pinboard\.html', '보드'\]/);
  assert.match(navigation, /\['network', 'track56-network\.html', '지도'\]/);
  assert.match(navigation, /\['shelf', 'track32-bookshelf\.html', '내 책장'\]/);
  assert.match(headerState, /title: '책·보드·지도로 다르게 봐요'/);
});

test('postdeploy 기대값도 새 메뉴 구조를 센다', () => {
  // 기본 탭은 둘러보기 하나. 트리 있음 = 둘러보기 + 트리 ▾ + 책·보드·지도 = 5.
  assert.match(postdeploy, /const BASE_HEADER_TABS = 1;/);
  assert.match(postdeploy, /tabs: state === 'in-trees' \? 5 : 1/);
  // 없어진 내 책장 탭을 클릭하는 검사는 남아 있으면 안 된다.
  assert.doesNotMatch(postdeploy, /nav button\[data-view="track32-bookshelf\.html"\]/);
  assert.match(postdeploy, /내 트리 전체 보기/);
});
