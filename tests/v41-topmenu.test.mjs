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

// '첫 화면 탭은 맨 위 메뉴에 없다' 소스 글자 시험(3 단정)은 지웠다(이슈 952) —
// 실제 메뉴의 탭 구성은 tests/v41-topmenu-885.test.mjs가 1440·390 화면에서 잰다.

test('로고가 첫 화면으로 간다 — 링크·키보드(#home 해시)', () => {
  // brand 마크업 글자 검사는 지웠다(이슈 952) — 로고가 첫 화면으로 가는 결과는
  // tests/v41-shell-location.test.mjs가 createLocation으로, 접근성 이름은 a11y 실행 시험이 확인한다.
  assert.deepEqual(screens[0], ['home', 'src064-orbit.html', '첫 화면']);
});

// '트리 선택과 보기 방식이 한 틀' 소스 글자 시험(7 단정)은 지웠다(이슈 952) —
// 단추 폭·⌄ 자리·판 배경·탭 순서·둘러보기 자리는 tests/v41-topmenu-885.test.mjs가
// 1440·390 실제 화면에서 숫자로 잰다.

test('지금 보는 보기는 눌린 상태(aria-current)로 표시된다', () => {
  // show()가 data-view 버튼에 aria-current를 넣는 동작은 tests/v41-shell-screens.test.mjs가
  // createScreens로 직접 부러 본다. 눌린 탭의 색(밑줄·채우지 않음)은 885 실행 시험이 잰다.
});

// '트리 ▾ 이동'·'서재 전체 보기' 셸 배선 글자 시험(4 단정)은 지웠다(이슈 952) —
// 트리 고르기·행선지 동작은 tests/v41-shell-screens.test.mjs가 createScreens로,
// 트리 목록 아래 메뉴(새 트리·관리·공유·꼬리표)는 885 실행 시험이 화면에서 확인한다.

// '모바일 접기 메뉴' 소스 글자 시험(7 단정)은 지웠다(이슈 952) — 접기 메뉴의 항목과 동작은
// tests/v41-header-tabs-mobile.test.mjs의 390 실행 시험이 화면에서 확인한다.

// '메뉴 높이 규칙' 소스 글자 시험(3 단정)은 지웠다(이슈 952) — 머리줄 높이·누름 영역은
// 885 실행 시험과 화면 감사(겹침·간격)가 실측한다.

// '둘러보기 닫기 단추가 계정 단추와 겹치지 않는다' CSS 글자 검사는 지웠다(이슈 952) —
// 겹침 여부는 화면 감사(겹침 0 판정)와 둘러보기 화면 시험이 잰다.

test('화면 제목과 안내 글도 줄인 이름을 쓴다', () => {
  // navigation.mjs의 screens 한 벌과 header-state.mjs의 FIRST_TREE_TIPS를 직접 확인한다(글자 검사 대신).
  assert.deepEqual(screens.find(s => s[0] === 'book'), ['book', 'track59-sketchbook.html', '책']);
  assert.deepEqual(screens.find(s => s[0] === 'board'), ['board', 'track58-pinboard.html', '보드']);
  assert.deepEqual(screens.find(s => s[0] === 'network'), ['network', 'track56-network.html', '지도']);
  assert.deepEqual(screens.find(s => s[0] === 'shelf'), ['shelf', 'track32-bookshelf.html', '서재']);
  assert.ok(FIRST_TREE_TIPS.some(tip => tip.title === '책·보드·지도로 다르게 봐요'), '보기 전환 말풍선 제목');
});

// 'postdeploy 기대값' 소스 글자 시험(4 단정)은 지웠다(이슈 952) — 배포 뒤 실제 잰 값은
// 배포 검사(postdeploy) 실행 자체가 내놓고, 그 실행 규칙은 tests/postdeploy-frame-reload-check.test.mjs가
// 실행으로 확인한다.

test('screens의 안쪽 화면 파일은 주소가 가리키는 자리에 실제로 있다', () => {
  for (const [view, file] of screens) {
    if (file === 'src064-orbit.html') continue; // 첫 화면은 vite 빌드 진입점(v41/home.html)이 만든다
    const rel = decodeURIComponent(new URL(screenUrl(file, 'server', 'https://lovetree-4-0.pages.dev')).pathname).replace(/^\/v41\//, '');
    assert.ok(fs.existsSync(new URL('../public/v41/' + rel, import.meta.url)), `${view} 화면 파일이 없다: ${rel}`);
  }
});
