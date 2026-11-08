// 2026-11-07: 390·360에서 헤더 탭 7개가 폭을 넘어 잘리던 문제의 회귀 시험.
// 좁은 폭에서만 탭 줄이 가로 스크롤이 되고, 현재 탭을 가운데로 보여 주며, 넘치는 쪽에 페이드를 두는지 확인한다.
// 데스크톱 배치(스크롤 없음)는 그대로여야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readFileSync} from 'node:fs';

const css = fs.readFileSync(new URL('../public/v41/shell.css', import.meta.url), 'utf8');
const header = readFileSync(new URL('../public/v41/shell/header.mjs', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('../public/v41/shell.mjs', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../public/v41/index.html', import.meta.url), 'utf8');

// 주어진 미디어 블록 본문을 모두 꺼내 하나로 이어 붙인다. 같은 조건의 블록이 여러 개일 수 있다.
function mediaBlock(source, query) {
  const bodies = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf(`@media(${query})`, from);
    if (start < 0) break;
    const open = source.indexOf('{', start);
    let depth = 0;
    let end = -1;
    for (let i = open; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end < 0) break;
    bodies.push(source.slice(open + 1, end));
    from = end + 1;
  }
  return bodies.join('\n');
}

const narrow = mediaBlock(css, 'max-width:780px');

test('좁은 폭에서 탭 줄은 가로 스크롤이고 스크롤바를 숨긴다', () => {
  assert.match(narrow, /nav\{[^}]*overflow-x:auto/, 'nav에 overflow-x:auto 가 있어야 한다');
  assert.match(narrow, /nav\{[^}]*scrollbar-width:none/, '스크롤바를 숨겨야 한다');
  assert.match(narrow, /nav\{[^}]*scroll-snap-type:x/, 'scroll-snap 이 있어야 한다');
});

test('좁은 폭에서 탭은 줄어들지 않고 스크롤로 닿는다', () => {
  // flex:1 로 눌러 담으면 7개가 다시 잘린다. 좁은 폭에서는 고정 폭이어야 한다.
  assert.match(narrow, /nav>button\{flex:0 0 auto\}/, 'nav 직속 버튼은 flex:0 0 auto');
  assert.match(narrow, /\.tree-views>button\{flex:0 0 auto\}/, '트리 보기 버튼도 flex:0 0 auto');
  assert.doesNotMatch(narrow, /nav>button\{flex:1\}/, 'nav>button{flex:1} 로 되돌아가면 안 된다');
});

test('트리 선택은 좁은 폭에서 112px 말줄임이다', () => {
  assert.match(narrow, /nav #record-menu\{[^}]*max-width:112px/, '트리 선택 max-width 112px');
  assert.match(css, /nav #record-menu #source-label\{[^}]*text-overflow:ellipsis/, '말줄임 규칙 유지');
  // 420 이하에서도 112px 아래로 줄이지 않는다(더 좁히면 이름을 못 읽는다).
  const small = mediaBlock(css, 'max-width:420px');
  assert.match(small, /nav #record-menu\{max-width:112px\}/, '420 이하도 112px');
});

test('넘치는 쪽 끝에만 --lt-stage 기반 페이드가 붙는다', () => {
  const fade = mediaBlock(css, 'max-width:780px');
  assert.match(fade, /nav\.fade-start\{mask-image:linear-gradient\(to right,transparent/, '왼쪽 페이드');
  assert.match(fade, /nav\.fade-end\{mask-image:linear-gradient\(to left,transparent/, '오른쪽 페이드');
  assert.match(fade, /nav\.fade-start\.fade-end\{mask-image:linear-gradient/, '양쪽 페이드');
  assert.match(fade, /--nav-fade:28px/, '페이드 폭 토큰');
});

test('데스크톱에는 스크롤·스냅·페이드를 걸지 않는다', () => {
  // 미디어 블록을 모두 지운 나머지가 데스크톱 규칙이다.
  const wide = css.replace(/@media\([^)]*\)\{/g, '@media-removed{');
  const desktop = wide.split('@media-removed{').map((part, i) => {
    if (i === 0) return part;
    let depth = 1;
    let j = 0;
    for (; j < part.length && depth > 0; j += 1) {
      if (part[j] === '{') depth += 1;
      else if (part[j] === '}') depth -= 1;
    }
    return part.slice(j);
  }).join('');
  assert.doesNotMatch(desktop, /scroll-snap-type/, '데스크톱에 스냅 없음');
  assert.doesNotMatch(desktop, /nav\.fade-start/, '데스크톱에 페이드 없음');
  assert.doesNotMatch(desktop, /nav\{[^}]*overflow-x:auto/, '데스크톱 nav 는 스크롤이 아니다');
});

test('화면을 바꿀 때 현재 탭을 가운데로 보여 준다', () => {
  // #231 1-B②-2: 탭 드러내기는 shell/header.mjs로 옮겼다.
  assert.match(header, /function revealCurrentTab\(\)/, 'revealCurrentTab 함수가 있어야 한다');
  assert.match(header, /scrollIntoView\(\{inline:'center'/, 'inline:center 로 당긴다');
  assert.match(header, /prefers-reduced-motion: reduce/, '동작 줄이기 설정을 존중한다');
  // flowNavigation 이 화면 전환마다 현재 탭을 드러내야 한다.
  const flow = header.slice(header.indexOf('function flowNavigation()'), header.indexOf('function updateNavFade()'));
  assert.match(flow, /revealCurrentTab\(\)/, 'flowNavigation 이 revealCurrentTab 을 부른다');
});

test('페이드는 스크롤 위치에 따라 켜고 끈다', () => {
  assert.match(header, /function updateNavFade\(\)/, 'updateNavFade 함수');
  assert.match(header, /classList\.toggle\('fade-start'/, 'fade-start 토글');
  assert.match(header, /classList\.toggle\('fade-end'/, 'fade-end 토글');
  assert.match(header, /addEventListener\('scroll',updateNavFade/, '스크롤에 반응');
  assert.match(header, /addEventListener\('resize'/, '폭 변경에 반응');
});

test('탭 7개가 헤더에 있다', () => {
  const nav = html.slice(html.indexOf('<nav aria-label="화면 선택">'), html.indexOf('</nav>'));
  const buttons = nav.match(/<button/g) || [];
  assert.equal(buttons.length, 7, `탭 ${buttons.length}개 (기대 7)`);
  for (const label of ['첫 화면', '내 책장', '둘러보기', '기억책', '기억 보드', '관계 지도']) {
    assert.match(nav, new RegExp(label), `${label} 탭`);
  }
  assert.match(nav, /id="record-menu"/, '트리 선택 탭');
});
