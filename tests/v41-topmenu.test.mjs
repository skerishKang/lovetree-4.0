// #380 2번: 맨 위 메뉴 개편 — 로고→첫 화면, 첫 화면·내 책장 탭 삭제, [트리 ▾ │ 책│보드│지도] 한 틀.
// 셸 헤더는 그림자 DOM이라 소스 계약으로 고정하고, 화면 목록(screens)·말풍선 제목(FIRST_TREE_TIPS)은
// 데이터를 직접 확인하고, 배선은 함수 시험(v41-shell-location·v41-shell-screens)에 맡긴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {screens, screenUrl} from '../public/v41/shell/navigation.mjs';
import {FIRST_TREE_TIPS} from '../public/v41/header-state.mjs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const html = read('public/v41/index.html');
const css = read('public/v41/shell.css');
const shell = read('public/v41/shell.mjs');
const postdeploy = read('tools/postdeploy/postdeploy.mjs');

const nav = html.slice(html.indexOf('<nav class="main-nav"'), html.indexOf('</nav>'));

test('첫 화면 탭은 맨 위 메뉴에 없다 — data-view 탭은 서재·책·보드·지도뿐이다(261117 서재 첫 자리)', () => {
  assert.doesNotMatch(nav, /data-view="src064-orbit\.html"/);
  assert.doesNotMatch(nav, />첫 화면</);
  assert.doesNotMatch(nav, />내 책장</);
});

test('로고가 첫 화면으로 간다 — 링크·키보드(#home 해시)', () => {
  assert.match(html, /<a class="brand" href="#home" aria-label="[^"]*첫 화면/);
  // 해시 감시 배선(popstate·hashchange)은 tests/v41-shell-location.test.mjs가 createLocation으로 지키고,
  // 화면 목록·제목은 navigation.mjs의 screens 한 벌로 본다.
  assert.deepEqual(screens[0], ['home', 'src064-orbit.html', '첫 화면']);
});

test('트리 선택과 보기 방식이 한 틀(.tree-frame)에 붙고 이름은 서재·책·보드·지도다', () => {
  const frame = nav.slice(nav.indexOf('class="tree-frame"'), nav.indexOf('</nav>'));
  assert.ok(frame.includes('id="record-menu"') && frame.includes('id="tree-views"'), '트리 ▾와 보기 묶음이 같은 틀 안에 있다');
  // 261117 대표 확정: 탭 줄은 [서재][책][보드][지도] — 서재가 첫 자리(나중에 '트리' 보기 탭이 서재 다음에 온다).
  assert.match(frame, /role="group" aria-label="서재·이 트리 보기"/);
  const tabIndex = frame.indexOf('>서재</button>');
  assert.ok(tabIndex > -1, '서재 탭이 있다');
  assert.ok(tabIndex < frame.indexOf('>책</button>'), '서재는 책보다 앞자리다');
  assert.match(frame, /data-view="track32-bookshelf\.html">서재<\/button>/);
  assert.match(frame, />책<\/button>/);
  assert.match(frame, />보드<\/button>/);
  assert.match(frame, />지도<\/button>/);
  assert.doesNotMatch(frame, /기억책|기억 보드|관계 지도/);
  // 한 틀 모양: 알약 테두리 한 줄, 보기 버튼 사이는 안쪽 구분선.
  assert.match(css, /\.tree-frame\{display:flex;align-items:center;flex:0 0 auto;margin-left:6px;padding:1px;border:1px solid rgba\(255,255,255,\.16\);border-radius:999px/);
  assert.match(css, /\.tree-frame \.tree-views\{margin-left:0;padding-left:0;border-left:0;gap:0;align-self:stretch;align-items:stretch\}/);
  assert.match(css, /\.tree-frame \.tree-views>button\{min-height:0;align-self:stretch;border-left:1px solid var\(--line\);border-radius:0/);
});

test('지금 보는 보기는 눌린 상태(aria-current)로 표시된다', () => {
  // show()가 data-view 버튼에 aria-current를 넣는 동작은 tests/v41-shell-screens.test.mjs가
  // createScreens로 직접 부러 본다. 여기서는 그 표시를 칠하는 CSS(금테)만 고정한다.
  assert.match(css, /nav button\[aria-current=true\]\{[^}]*box-shadow:inset 0 0 0 1px var\(--lt-gold-line\)/);
});

test('트리 ▾를 누르면 그 트리로 이동하는 동작이 그대로다', () => {
  // 책·보드·지도를 보던 중이면 같은 보기로, 아니면 그 트리의 책으로(#381).
  assert.match(shell, /const wasTreeView=TREE_VIEWS\.has\(current\);choose\(id\);if\(!wasTreeView\)show\('track59-sketchbook\.html',false\);flowNavigation\(\);writeLocation\(\);/);
});

test('트리 드롭다운 맨 아래 "서재 전체 보기"가 책장 화면을 연다', () => {
  assert.match(shell, /data-tree-action="shelf">서재 전체 보기<\/button>/);
  assert.match(shell, /querySelector\('\[data-tree-action="shelf"\]'\)\?\.addEventListener\('click',\(\)=>\{closeTreeMenu\(\);show\('track32-bookshelf\.html'\);\}\)/);
  // 로그인 상태에서만 그려진다(로그아웃 드롭다운은 아예 열리지 않지만 이중으로 걸러 둔다).
  assert.match(shell, /const shelfEntry=member\?\.snapshot\(\)\.owned\?/);
});

test('모바일 접기 메뉴(메뉴 더보기)도 같은 구조다', () => {
  const fold = shell.slice(shell.indexOf('function buildFoldMenu'), shell.indexOf('const escHTML'));
  const order = ["add('첫 화면'", "add('둘러보기'", "add('서재'", "add('책'", "add('보드'", "add('지도'"];
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
  assert.match(css, /\.tree-frame \.tree-views>button\{min-height:0;align-self:stretch;/);
  // 고급 기능 보기(lt-advanced)는 계정 메뉴 안의 일이라 맨 위 메뉴 구조를 바꾸지 않는다.
  assert.match(shell, /document\.body\.classList\.toggle\('lt-advanced',on\)/);
  assert.doesNotMatch(css, /\.lt-advanced [^{]*\.tree-frame/);
});

test('둘러보기 패널 닫기 버튼은 맨 위 메뉴의 계정 버튼과 겹치지 않는다(407)', () => {
  // 닫기 버튼을 맨 위 메뉴(약 66px) 아래로 내린다.
  assert.match(css, /#community-panel \.community-top\{padding-top:44px\}/);
});

test('화면 제목과 안내 글도 줄인 이름을 쓴다', () => {
  // navigation.mjs의 screens 한 벌과 header-state.mjs의 FIRST_TREE_TIPS를 직접 확인한다(글자 검사 대신).
  assert.deepEqual(screens.find(s => s[0] === 'book'), ['book', 'track59-sketchbook.html', '책']);
  assert.deepEqual(screens.find(s => s[0] === 'board'), ['board', 'track58-pinboard.html', '보드']);
  assert.deepEqual(screens.find(s => s[0] === 'network'), ['network', 'track56-network.html', '지도']);
  assert.deepEqual(screens.find(s => s[0] === 'shelf'), ['shelf', 'track32-bookshelf.html', '서재']);
  assert.ok(FIRST_TREE_TIPS.some(tip => tip.title === '책·보드·지도로 다르게 봐요'), '보기 전환 말풍선 제목');
});

test('postdeploy 기대값도 새 메뉴 구조를 센다', () => {
  // 기본 탭은 둘러보기 하나. 트리 있음 = 둘러보기 + 트리 ▾ + 책·보드·지도 = 5.
  assert.match(postdeploy, /const BASE_HEADER_TABS = 1;/);
  assert.match(postdeploy, /tabs: state === 'in-trees' \? 5 : 1/);
  // 없어진 내 책장 탭을 클릭하는 검사는 남아 있으면 안 된다.
  assert.doesNotMatch(postdeploy, /nav button\[data-view="track32-bookshelf\.html"\]/);
  assert.match(postdeploy, /내 트리 전체 보기/);
});

// #713 후속(2026-11-16 보고): 그래프 화면 파일이 views/graph/ 아래로 옮겨졌는데 셸 주소는 그대로
// views/track60-graph.html을 써 배포가 4.0 첫 화면으로 되돌려 주었다. screens의 안쪽 화면 파일이
// 실제로 존재하는지 검사해 주소·파일 위치 어긋남을 미리 잡는다.
test('screens의 안쪽 화면 파일은 주소가 가리키는 자리에 실제로 있다', () => {
  for (const [view, file] of screens) {
    if (file === 'src064-orbit.html') continue; // 첫 화면은 vite 빌드 진입점(v41/home.html)이 만든다
    const rel = decodeURIComponent(new URL(screenUrl(file, 'server', 'https://lovetree-4-0.pages.dev')).pathname).replace(/^\/v41\//, '');
    assert.ok(fs.existsSync(new URL('../public/v41/' + rel, import.meta.url)), `${view} 화면 파일이 없다: ${rel}`);
  }
});
