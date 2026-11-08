// 2026-11-07 첫 화면 테마 A/B(밤/정원)와 워드마크 LoveTree 통일 1단계의 회귀 시험.
// 기본은 A, 저장·재방문은 유지, 저장 실패는 A, 안쪽 네 화면은 항상 A, 워드마크 문구와 외부 글꼴 요청 0건을 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  readTheme, writeTheme, nextTheme, themeButtonLabel, themeButtonAriaLabel, themePressed,
  appliedTheme, applyThemeAttribute, THEME_KEY
} from '../public/v41/header-state.mjs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const navigation = read('public/v41/shell/navigation.mjs');
const themeModule = read('public/v41/shell/theme.mjs');
const html = read('public/v41/index.html');
const css = read('public/v41/identity.css');
const shell = read('public/v41/shell.mjs');
const homeJS = read('v41/home.js');
const menuJS = read('public/v41/home-view-menu.mjs');
const homeHTML = read('v41/home.html');

function memoryStorage(initial = {}) {
  const data = {...initial};
  return {
    data,
    getItem: key => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); }
  };
}

function brokenStorage() {
  return {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); }
  };
}

function fakeRoot() {
  const attributes = {};
  return {
    attributes,
    setAttribute: (key, value) => { attributes[key] = value; },
    removeAttribute: key => { delete attributes[key]; },
    getAttribute: key => attributes[key] ?? null
  };
}

// 선택자 이름으로 시작하는 첫 CSS 블록을 꺼낸다.
function cssBlock(source, selector) {
  const start = source.indexOf(`${selector}{`);
  if (start < 0) return '';
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return '';
}

const garden = cssBlock(css, 'html[data-lt-theme=garden]');

test('기본은 A(밤)이고 저장값이 없으면 A다', () => {
  assert.equal(THEME_KEY, 'lt41.theme');
  assert.equal(readTheme(memoryStorage()), 'night');
  assert.equal(readTheme(undefined), 'night');
  assert.equal(appliedTheme('night', 'home'), 'night');
  const root = fakeRoot();
  applyThemeAttribute(root, 'night');
  assert.equal(root.getAttribute('data-lt-theme'), null, '속성 없음 = A');
});

test('B를 저장하면 다시 방문해도 유지된다', () => {
  const storage = memoryStorage();
  assert.equal(writeTheme(storage, 'garden'), 'garden');
  assert.equal(storage.data['lt41.theme'], 'garden');
  assert.equal(readTheme(storage), 'garden');
  assert.equal(appliedTheme('garden', 'home'), 'garden');
  const root = fakeRoot();
  applyThemeAttribute(root, 'garden');
  assert.equal(root.getAttribute('data-lt-theme'), 'garden');
});

test('저장에 실패하면 A로 남는다', () => {
  const storage = brokenStorage();
  assert.equal(readTheme(storage), 'night');
  assert.equal(writeTheme(storage, 'garden'), 'night');
});

test('정원 대상: 책장·기억책·기억 보드·관계 지도(#212, 2026-11-08 정원 적용 레인)', () => {
  assert.equal(appliedTheme('garden', 'book'), 'garden');
  for (const view of ['board', 'network']) {
    assert.equal(appliedTheme('garden', view), 'garden', view);
    assert.equal(appliedTheme('night', view), 'night', view);
  }
  assert.equal(appliedTheme('garden', 'shelf'), 'garden');
  assert.equal(appliedTheme('night', 'shelf'), 'night');
  assert.equal(appliedTheme('garden', 'inner'), 'night');
  // 문서 속성도 화면에 따라 정해진다.
  // #231 1-B: 화면별 테마 대상 계산은 shell/navigation.mjs, 문서 반영은 shell/theme.mjs가 맡는다.
  assert.match(navigation, /if \(file === 'src064-orbit\.html'\) return 'home';/);
  assert.match(navigation, /if \(file === 'track59-sketchbook\.html'\) return 'book';/);
  assert.match(navigation, /if \(file === 'track58-pinboard\.html'\) return 'board';/);
  assert.match(navigation, /if \(file === 'track56-network\.html'\) return 'network';/);
  assert.match(navigation, /return 'inner';/);
  assert.match(themeModule, /appliedTheme\(theme, themedViewFor\(file\)\)/);
});

test('전환 버튼은 누르면 갈 곳(밤/정원)과 aria-pressed를 쓴다', () => {
  assert.equal(themeButtonLabel('night'), '정원');
  assert.equal(themeButtonLabel('garden'), '밤');
  assert.equal(themeButtonAriaLabel('night'), '정원 테마로 바꾸기');
  assert.equal(themeButtonAriaLabel('garden'), '밤 테마로 바꾸기');
  assert.equal(themePressed('night'), false);
  assert.equal(themePressed('garden'), true);
  assert.equal(nextTheme('night'), 'garden');
  assert.equal(nextTheme('garden'), 'night');
  // #213 2번: 첫 화면 테마는 "보기" 메뉴 항목이 맡는다(도구 줄 버튼 하나로 묶었다).
  // 표시 문구는 계정 메뉴 항목과 같은 header-state 규칙을 그대로 쓴다.
  // 2026-11-11: 메뉴 로직은 public/v41/home-view-menu.mjs로 옮겼다(연결만 home.js).
  assert.match(menuJS, /viewButton\.dataset\.ltViewMenu = ''/);
  assert.match(menuJS, /shadow\.querySelector\('\.top-actions'\)\.append\(viewWrap\)/);
  assert.match(menuJS, /kind === 'theme'\)[^\n]*writeTheme\(storage/, '메뉴에서 고른 테마를 저장한다');
  assert.match(menuJS, /sendTheme\(theme\)/, '셸에 테마를 알리는 기존 메시지를 그대로 쓴다');
  assert.match(homeJS, /sendTheme:theme=>parent\.postMessage\(\{type:'lt41-theme',theme\}/, '첫 화면이 lt41-theme를 그대로 보낸다');
  assert.match(html, /id="account-theme" data-lt-theme-toggle aria-pressed="false"/);
  // #231 1-B: 테마 버튼 반영은 shell/theme.mjs로 옮겼다(같은 선택자·같은 문구).
  assert.match(themeModule, /document\.querySelectorAll\('\[data-lt-theme-toggle\]'\)/);
});

test('워드마크는 LoveTree + 4.1이고 MEMORY ORBIT·새싹이 없다', () => {
  assert.match(html, /<a class="brand" href="#home" aria-label="LoveTree 4\.1 첫 화면"><span class="brand-word">LoveTree<small>4\.1<\/small><\/span><\/a>/);
  assert.doesNotMatch(html, /MEMORY ORBIT/);
  assert.doesNotMatch(html, /brand-sub/);
  assert.doesNotMatch(html, /러브트리 4\.1 첫 화면/);
});

test('첫 그리기 전에 테마를 적용하는 인라인 스크립트가 head에 있다', () => {
  const scriptAt = html.indexOf("if(localStorage.getItem('lt41.theme')==='garden')");
  assert.ok(scriptAt > 0, 'head 인라인 스크립트가 있어야 한다');
  assert.ok(scriptAt < html.indexOf('<link rel="stylesheet" href="shell.css">'), '스타일시트보다 먼저 실행되어야 한다');
  assert.ok(scriptAt < html.indexOf('<body'), '첫 그리기 전이어야 한다');
  assert.match(html, /catch\(e\)\{\}/, '저장소 접근이 막히면 A로 남는다');
});

test('정원 색은 identity.css의 한 블록에만 있고 B 값은 참조 원본 색이다', () => {
  assert.ok(garden, 'html[data-lt-theme=garden] 블록이 있어야 한다');
  assert.match(garden, /--lt-stage:#f7f0e8/);
  assert.match(garden, /--lt-ink:#403536/);
  assert.match(garden, /--lt-rose:#c86e79/);
  assert.match(garden, /--lt-gold-deep:#98505e/);
  assert.doesNotMatch(garden, /#040407/, 'B 블록은 A 무대색으로 되돌리지 않는다');
  // 새 색 값이 블록 밖(다른 규칙)에 흩어지지 않는다. 블록 머리 주석부터 파일 끝까지가 정원 구역이다.
  const themeSection = css.slice(css.indexOf('/* 4.1 첫 화면 테마 A/B'));
  for (const value of ['#f7f0e8', '#403536', '#c86e79', '#98505e']) {
    const everywhere = (css.match(new RegExp(value, 'g')) || []).length;
    const inSection = (themeSection.match(new RegExp(value, 'g')) || []).length;
    assert.equal(everywhere, inSection, `${value}는 정원 구역 안에만`);
  }
  // 첫 화면 그림자 루트용 규칙은 :host로만 둔다.
  assert.match(css, /:host\(\[data-lt-theme=garden\]\) \.app\{background:radial-gradient/);
  assert.match(css, /:host\(\[data-lt-theme=garden\]\) \.card\.memo\{border-color:var\(--lt-ink\)\}/, '연한 메모 카드는 크림 배경에서 테두리 대비를 확보한다');
  // 궤도 배치·움직임은 건드리지 않는다.
  assert.doesNotMatch(garden, /transform|animation|@keyframes/);
});

test('움직임 줄이기 설정이면 전환 애니메이션을 끈다', () => {
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{html\[data-lt-theme=garden\] body[^{]*\{transition:none\}\}/);
});

test('글꼴은 저장소 안에서만 받고 외부 글꼴 요청이 0건이다', () => {
  assert.match(css, /@font-face\{font-family:'Gowun Batang'[^}]*\/fonts\/gowun-batang\/GowunBatang-Bold\.latin\.woff2/);
  for (const [name, source] of [['index.html', html], ['identity.css', css], ['shell', shell], ['home.html', homeHTML], ['home.js', homeJS]]) {
    assert.doesNotMatch(source, /fonts\.(googleapis|gstatic)\.com/, name);
    assert.doesNotMatch(source, /https?:\/\/fonts\./, name);
  }
  assert.ok(fs.existsSync(new URL('../public/fonts/gowun-batang/OFL.txt', import.meta.url)), 'OFL 라이선스가 함께 있어야 한다');
  assert.ok(fs.existsSync(new URL('../public/fonts/gowun-batang/GowunBatang-Bold.latin.woff2', import.meta.url)), 'woff2 서브셋이 저장소에 있어야 한다');
});

test('정원 워드마크만 Gowun Batang이고 A는 지금 헤더와 같은 굵기·자간이다', () => {
  assert.match(css, /html\[data-lt-theme=garden\] \.brand>span\{font-family:'Gowun Batang'[^}]*font-weight:700[^}]*letter-spacing:\.22em\}/);
  const brand = cssBlock(read('public/v41/shell.css'), '.brand>span');
  assert.match(brand, /font-weight:700/);
  assert.match(brand, /letter-spacing:\.22em/);
});
