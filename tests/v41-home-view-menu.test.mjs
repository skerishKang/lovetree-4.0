// 2026-11-08 #213 2번: 첫 화면 도구 줄을 "보기 ▾" 메뉴 하나로 묶은 뒤의 회귀 시험.
// 메뉴 항목(움직임·테마·카드 출처), 키보드/마우스/Esc/바깥 클릭 규칙, 저장값 유지, 도구 줄 버튼 2개를 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  VIEW_MENU_ID, VIEW_MENU_LABEL, viewMenuItems, viewMenuGroups, viewMenuInitialIndex, viewMenuKey, viewMenuValue
} from '../v41/home-view-menu.js';
import {readTheme, writeTheme} from '../public/v41/header-state.mjs';
import {HOME_CARDS_KEY, readHomeCardsMode, writeHomeCardsMode} from '../v41/home-cards.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const homeJS = read('v41/home.js');
const orbitJS = read('src/views/orbit.js');

function memoryStorage(initial = {}) {
  const data = {...initial};
  return {data, getItem: key => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = String(value); }, removeItem: key => { delete data[key]; }};
}

test('보기 메뉴는 움직임·테마·카드 출처를 한 곳에 모은다', () => {
  assert.equal(VIEW_MENU_ID, 'home-view-menu');
  assert.equal(VIEW_MENU_LABEL, '보기');

  const loggedIn = viewMenuItems({theme: 'night', paused: false, cardsMode: 'mix', loggedIn: true});
  assert.equal(loggedIn.length, 7, '움직임 1 + 테마 2 + 카드 4');
  assert.deepEqual(loggedIn.map(item => item.kind), ['motion', 'theme', 'theme', 'cards', 'cards', 'cards', 'cards']);
  assert.deepEqual(loggedIn.filter(item => item.kind === 'cards').map(item => item.label), ['예시', '인기', '내 것만', '섞어서']);
  assert.equal(loggedIn[0].label, '움직임 멈춤');
  assert.equal(loggedIn[0].role, 'menuitemcheckbox');
  assert.equal(loggedIn[0].checked, false, '움직임이 켜져 있으면 "멈춤" 항목은 꺼진 상태다');
  assert.deepEqual(loggedIn.filter(item => item.kind === 'theme').map(item => item.label), ['밤', '정원']);
  assert.equal(loggedIn.find(item => item.value === 'night').checked, true);
  assert.equal(loggedIn.find(item => item.value === 'garden').checked, false);
  assert.equal(loggedIn.find(item => item.value === 'mix').checked, true);
  for (const item of loggedIn) assert.ok(['menuitemradio', 'menuitemcheckbox'].includes(item.role), item.role);
});

test('로그아웃에는 카드 출처가 예시·인기 둘뿐이고 저장값이 남아 있어도 예시로 떨어진다', () => {
  const loggedOut = viewMenuItems({theme: 'garden', paused: true, cardsMode: 'mine', loggedIn: false});
  const cards = loggedOut.filter(item => item.kind === 'cards');
  assert.deepEqual(cards.map(item => item.label), ['예시', '인기']);
  assert.equal(cards.find(item => item.value === 'example').checked, true, '로그아웃에서 "내 것만" 저장값은 무시한다');
  assert.equal(cards.find(item => item.value === 'popular').checked, false);
  assert.equal(loggedOut.find(item => item.value === 'garden').checked, true);
  assert.equal(loggedOut[0].label, '움직임 켜기');
  assert.equal(loggedOut[0].checked, true, '멈춤 상태면 항목이 켜져 있다');
});

test('메뉴는 움직임·테마·카드 출처 세 묶음이다', () => {
  const groups = viewMenuGroups({theme: 'night', paused: false, cardsMode: 'example', loggedIn: true});
  assert.deepEqual(groups.map(group => group.name), ['움직임', '테마', '카드 출처']);
  assert.deepEqual(groups.map(group => group.items.length), [1, 2, 4]);
  const out = viewMenuGroups({loggedIn: false});
  assert.deepEqual(out.map(group => group.items.length), [1, 2, 2]);
});

test('키보드 규칙: ArrowDown·ArrowUp 순환, Home·End, Esc 닫기, Enter·Space 실행', () => {
  assert.deepEqual(viewMenuKey('ArrowDown', 0, 3), {type: 'focus', index: 1});
  assert.deepEqual(viewMenuKey('ArrowDown', 2, 3), {type: 'focus', index: 0});
  assert.deepEqual(viewMenuKey('ArrowUp', 0, 3), {type: 'focus', index: 2});
  assert.deepEqual(viewMenuKey('Home', 2, 3), {type: 'focus', index: 0});
  assert.deepEqual(viewMenuKey('End', 0, 3), {type: 'focus', index: 2});
  assert.deepEqual(viewMenuKey('Escape', 1, 3), {type: 'close'});
  assert.deepEqual(viewMenuKey('Enter', 1, 3), {type: 'activate', index: 1});
  assert.deepEqual(viewMenuKey(' ', 2, 3), {type: 'activate', index: 2});
  assert.deepEqual(viewMenuKey('Tab', 0, 3), {type: 'none'});
  // 초점을 잃어 index가 -1이어도 첫 항목으로 돌아온다.
  assert.deepEqual(viewMenuKey('ArrowDown', -1, 3), {type: 'focus', index: 1});
  assert.deepEqual(viewMenuKey('ArrowDown', 0, 0), {type: 'none'});
});

test('메뉴를 열면 지금 고른 카드 출처에 초점이 간다', () => {
  const items = viewMenuItems({theme: 'night', paused: false, cardsMode: 'popular', loggedIn: true});
  assert.equal(items[viewMenuInitialIndex(items)].value, 'popular');
  assert.equal(viewMenuInitialIndex(viewMenuItems({theme: 'night', loggedIn: false})), 3, '로그아웃은 예시 카드 항목(움직임1+테마2 뒤)');
});

test('메뉴 항목이 다루는 값: 테마 두 값, 움직임은 반대, 카드 출처는 정규화', () => {
  assert.equal(viewMenuValue({kind: 'theme', value: 'garden'}, {}), 'garden');
  assert.equal(viewMenuValue({kind: 'theme', value: '밤'}, {}), 'night');
  assert.equal(viewMenuValue({kind: 'motion', value: 'off'}, {paused: false}), true);
  assert.equal(viewMenuValue({kind: 'motion', value: 'on'}, {paused: true}), false);
  assert.equal(viewMenuValue({kind: 'cards', value: 'mix'}, {}), 'mix');
  assert.equal(viewMenuValue({kind: 'cards', value: 'nope'}, {}), 'example');
  assert.equal(viewMenuValue(null), null);
});

test('메뉴 선택은 기존 저장값을 그대로 쓴다(테마·카드 출처)', () => {
  const storage = memoryStorage();
  assert.equal(readTheme(storage), 'night');
  assert.equal(writeTheme(storage, 'garden'), 'garden');
  assert.equal(storage.data['lt41.theme'], 'garden');
  assert.equal(readTheme(storage), 'garden');

  const cards = memoryStorage({[HOME_CARDS_KEY]: 'popular'});
  assert.equal(readHomeCardsMode(cards, {loggedIn: true}), 'popular');
  assert.equal(readHomeCardsMode(cards, {loggedIn: false}), 'popular', '로그아웃도 예시·인기만 쓰므로 유지된다');
  assert.equal(writeHomeCardsMode(cards, 'mine'), 'mine');
  assert.equal(readHomeCardsMode(cards, {loggedIn: false}), 'example', '로그아웃에서는 내 것만을 무시한다');
});

test('도구 줄은 보기·순간 목록 두 버튼이고 순간 목록은 메뉴로 들어가지 않는다', () => {
  // 도구 줄에서 사라진 옛 버튼들: 움직임·테마·카드 출처는 메뉴 항목이 됐다.
  assert.equal(homeJS.includes('data-lt-theme-toggle'), false, 'home.js에 테마 토글 버튼이 남음');
  assert.equal(homeJS.includes('data-lt-card-source'), false, 'home.js에 카드 메뉴 버튼이 남음');
  assert.equal(homeJS.includes('dataset.ltCardSource'), false);
  // 순간 목록은 궤도 도구 줄에 그대로 남고, 움직임 버튼은 없어졌다.
  assert.match(orbitJS, /<button class="menuBtn" data-do="index">순간 목록<\/button>/);
  assert.equal(orbitJS.includes('data-do="pause"'), false, '움직임 버튼은 메뉴로 옮겼다');
  assert.match(orbitJS, /dispose\.motion=\{get paused\(\)\{return paused;\}/, '메뉴가 움직임 상태를 읽고 바꾼다');
  // 보기 버튼 하나를 도구 줄에 붙인다.
  assert.match(homeJS, /viewButton\.dataset\.ltViewMenu=''/);
  assert.match(homeJS, /shadow\.querySelector\('\.top-actions'\)\.append\(viewWrap\)/);
  assert.match(homeJS, /\.top-actions>\.menuBtn,?\.top-actions>\.view-menu-wrap>\.menuBtn\{position:relative;height:36px;min-height:36px/, '시각 높이 36(보기·순간 목록 둘 다)');
  assert.match(homeJS, /:after\{content:'';position:absolute;inset:-4px/, '누르는 영역 44');
  // 로그아웃 도구 줄에는 보기·순간 목록만 보여야 하므로 숨김 규칙을 도구 줄 규칙보다 뒤에 다시 둔다.
  assert.match(homeJS, /\.top-actions>\.home-community,\.top-actions>\[data-home-account\]\{display:none\}/, '계정·둘러보기 버튼은 도구 줄에 남기지 않는다');
  assert.match(homeJS, /shadow\.querySelector\('\[data-home-account\]'\)\?\.remove\(\)/, '중복 로그인 버튼은 DOM에서 지운다');
  assert.equal(homeJS.includes('home-community'), true, '숨김 규칙은 남겨 둔다');
});

test('보기 메뉴는 마우스·키보드·Esc·바깥 클릭으로 열고 닫는다', () => {
  assert.match(homeJS, /viewButton\.setAttribute\('aria-haspopup','menu'\)/);
  assert.match(homeJS, /viewButton\.setAttribute\('aria-expanded','false'\)/);
  assert.match(homeJS, /b\.setAttribute\('aria-checked',String\(item\.checked\)\)/, '항목 상태는 aria-checked로 알린다');
  assert.match(homeJS, /viewButton\.onclick=\(\)=>\{if\(viewMenu\.hidden\)openViewMenu\(\);else closeViewMenu\(\);\}/);
  assert.match(homeJS, /if\(e\.key==='ArrowDown'\|\|e\.key==='ArrowUp'\)\{e\.preventDefault\(\);openViewMenu\(\);\}/);
  assert.match(homeJS, /if\(next\.type==='close'\)\{e\.preventDefault\(\);closeViewMenu\(true\);\}/);
  // 바깥 클릭은 카드 메뉴 때 쓰던 clickWithin을 그대로 쓴다(#196). 그림자 루트 밖 클릭도 닫힌다.
  assert.match(homeJS, /document\.addEventListener\('click',e=>\{if\(!clickWithin\(e,viewWrap\)\)closeViewMenu\(\);\}\)/);
  // 카드 출처 안내(aria-live, #201)는 그대로 남는다.
  assert.match(homeJS, /shadow\.querySelector\('\.center-note'\)\?\.setAttribute\('aria-live','polite'\)/);
});
