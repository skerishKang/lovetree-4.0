// #212 내 책장을 첫 화면과 맞추기의 회귀 시험.
// 1) 밤 장미색 0  2) 카드 정보 줄  3) 자동 접미사 표시 규칙·생성 경로  4) 예시 그림
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { displayTreeTitle, autoTreeTitle, hasAutoTitleSuffix, AUTO_TITLE_SUFFIX } from '../public/v41/tree-name.mjs';
import { createTree } from '../public/v41/domain.mjs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
// 2026-11-09 #231 후속: 스타일·스크립트를 views/shelf/로 나눴다(마크업+옮긴 파일을 함께 본다).
const shelf = [
  read('public/v41/views/track32-bookshelf.html'),
  read('public/v41/views/shelf/shelf.css'),
  read('public/v41/views/shelf/shelf-reader.css'),
  read('public/v41/views/shelf/shelf-extra.css'),
  read('public/v41/views/shelf/shelf.js'),
  read('public/v41/views/shelf/shelf-reader.js'),
  read('public/v41/views/shelf/shelf-model.mjs')
].join('\n');
const css = read('public/v41/identity.css');

// 선택자로 시작하는 첫 CSS 블록을 꺼낸다.
function cssBlock(source, selector) {
  const start = source.indexOf(`${selector}{`);
  if (start < 0) return '';
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return '';
}

const NIGHT = 'html[data-v41-screen=shelf]:not([data-lt-theme=garden])';

// 1. 밤 테마: 장미색을 쓰지 않는다.
test('#212 밤 책장은 장미색 토큰을 쓰지 않는다', () => {
  // 밤 선택자로 시작하는 모든 규칙 블록을 중괄호 깊이로 모은다.
  const blocks = [];
  let index = css.indexOf(NIGHT);
  while (index >= 0) {
    let depth = 0;
    let end = index;
    for (; end < css.length; end += 1) {
      if (css[end] === '{') depth += 1;
      if (css[end] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const block = css.slice(index, end + 1);
    if (block.trim()) blocks.push(block);
    index = css.indexOf(NIGHT, end + 1);
  }
  assert.ok(blocks.length >= 2, '밤 책장 규칙 블록이 있다');
  for (const block of blocks) {
    assert.ok(!/--lt-rose(?!-ink)/.test(block), `장미 토큰을 쓰지 않는다: ${block.slice(0, 60)}`);
    assert.ok(!/#(d97889|bd5d72|d88f9c|c86e79|98505e)/i.test(block), `장미 hex를 쓰지 않는다: ${block.slice(0, 60)}`);
  }
});

test('#212 밤 책장은 무대·진주 글자·금 포인트와 Pretendard를 쓴다', () => {
  assert.match(css, /--shelf-paper:var\(--lt-stage\)/);
  assert.match(css, /--shelf-ink:var\(--lt-pearl\)/);
  assert.match(css, /--shelf-accent:var\(--lt-gold-deep\)/);
  assert.match(css, /:not\(\[data-lt-theme=garden\]\) body,.*font-family:var\(--lt-ui\)/);
});

test('#212 "한 권의 책" 강조는 장미색이 아니라 흐린 진주색이다', () => {
  const block = cssBlock(css, `${NIGHT} .hero h1 em`);
  assert.ok(block, '강조 규칙이 있다');
  assert.match(block, /color:var\(--lt-muted\)/);
  assert.ok(!block.includes('rose'));
});

// 2. 책 카드 정보 줄.
test('#212 카드 표지에는 이름이 한 번만 나오고 아래는 "순간 N개 · 마지막 YYYY-MM-DD"다', () => {
  assert.match(shelf, /<strong class="cover-title">'\+esc\(book\.name\)\+'<\/strong><\/div>/);
  assert.ok(!/book-card-meta"><strong>/.test(shelf), '표지 아래 중복 제목을 두지 않는다');
  // 2026-11-09: 정보 줄·마지막 날짜 계산은 shelf-model.mjs로 옮겼다.
  assert.match(shelf, /export const bookMeta = \(book\) => book\.chapters\.length \+ '개 순간 · 마지막 ' \+ \(book\.lastDate \|\| '-'\)/);
  assert.match(shelf, /export function lastMomentDate\(tree\)/, '마지막 날짜를 순간에서 계산한다');
});

test('#212 "책 · 02"·"기본 표지" 같은 내부 표시를 카드에서 뺀다', () => {
  assert.ok(!/cover-number/.test(shelf.split('<script')[0].replace(/\.cover-number \{[^}]*\}/g, '')), '카드 마크업에 cover-number가 없다');
  assert.ok(!/'기본 표지'/.test(shelf), '기본 표지 문구가 없다');
  assert.ok(!/책 · '\+String/.test(shelf), '책 · NN 표시를 만들지 않는다');
});

test('#212 선택 카드에서 표지 윗부분이 잘리지 않는다', () => {
  assert.match(shelf, /absolute === 0 \? 1\.06/, '중앙 카드 배율을 레일 높이에 맞춘다');
  assert.ok(!/absolute === 0 \? -9/.test(shelf), '중앙 카드를 위로 띄우지 않는다');
  assert.ok(!/absolute === 0 \? 1\.12/.test(shelf), '레일을 넘던 배율을 쓰지 않는다');
});

// 3. 자동 접미사: 표시 단계에서만, 정확히 일치할 때만.
test('#212 자동 접미사는 표시에서만, 정확히 일치할 때만 뺀다', () => {
  assert.equal(AUTO_TITLE_SUFFIX, ', 나의 순간들');
  assert.equal(displayTreeTitle('윤슬, 나의 순간들'), '윤슬');
  assert.equal(displayTreeTitle('윤슬, 나의 순간들 그 다음'), '윤슬, 나의 순간들 그 다음');
  assert.equal(displayTreeTitle('윤슬'), '윤슬');
  assert.equal(displayTreeTitle(''), '');
  assert.equal(displayTreeTitle(null), '');
  assert.equal(displayTreeTitle('나의 순간들'), '나의 순간들');
  assert.equal(displayTreeTitle(AUTO_TITLE_SUFFIX), AUTO_TITLE_SUFFIX, '앞부분이 비면 그대로 둔다');
});

test('#212 표시 규칙은 저장 데이터를 바꾸지 않는다', () => {
  const tree = { id: 't1', title: '윤슬, 나의 순간들', subject: '윤슬', moments: [] };
  const snapshot = JSON.stringify(tree);
  displayTreeTitle(tree.title);
  hasAutoTitleSuffix(tree.title);
  assert.equal(JSON.stringify(tree), snapshot);
});

test('#212 새 트리 생성 경로는 자동 접미사를 붙이지 않는다', () => {
  const tree = createTree({ subject: '윤슬', note: '첫 마음', emotion: '설렘', date: '2026-11-08', url: '' });
  assert.equal(tree.title, '윤슬');
  assert.equal(hasAutoTitleSuffix(tree.title), false);
  assert.equal(autoTreeTitle('윤슬'), '윤슬, 나의 순간들', '옛 문구는 표시 규칙 확인용으로만 남는다');
});

test('#212 책장은 공용 표시 함수를 싣고 카드 이름에 적용한다', () => {
  assert.match(shelf, /<script src="\/v41\/tree-name\.js"><\/script>/);
  assert.match(shelf, /LTTreeName\.displayTreeTitle/);
});

// 4. 예시 그림 자리 → 이어 읽기 칸(#256-1, 2026-11-09). #212의 "실제 내 책 4권" 작은 책장은
//    역할이 아래 책장과 겹쳐 이어 읽기 칸으로 바뀌었다(이슈 #256 1번).
test('#256-1 오른쪽 위 칸은 이어 읽기이고 문구·이동은 shelf-model 한 벌에서 온다', () => {
  const markup = shelf.slice(0, shelf.indexOf('<script'));
  assert.ok(!/<span>순간 0[1-4]<\/span>/.test(shelf), '가짜 예시 4권을 두지 않는다');
  assert.equal((markup.match(/class="hero-book"/g) || []).length, 0, '작은 책장 그림은 남기지 않는다');
  assert.ok(markup.includes('id="resumeCard"'), '이어 읽기 칸을 둔다');
  assert.match(shelf, /function renderResumeCard\(\)/);
  assert.match(shelf, /resumeCard\(\{/, '문구·칸 판정은 shelf-model의 resumeCard를 쓴다');
  assert.match(shelf, /renderShelf\(\);renderResumeCard\(\);bind\(\);/, '화면 진입 때 한 번 그린다');
  // 마지막 위치를 새로 저장하지 않는다(읽기만).
  assert.ok(!/setItem\(/.test(shelf), 'shelf.js는 위치를 저장하지 않는다');
});

// 화면은 모듈이 아니라 클래식 스크립트를 싣는다. 두 판본이 같은 결과를 내야 한다.
test('#212 클래식 판본(tree-name.js)이 모듈과 같은 결과를 낸다', async () => {
  const vm = await import('node:vm');
  const source = read('public/v41/tree-name.js');
  const scope = { window: {} };
  vm.runInNewContext(source, scope);
  const classic = scope.window.LTTreeName;
  assert.ok(classic, 'window.LTTreeName을 만든다');
  const samples = ['윤슬, 나의 순간들', '윤슬', '', ', 나의 순간들', '윤슬, 나의 순간들 그 다음', null, '겨울 정원, 나의 순간들'];
  for (const value of samples) {
    assert.equal(classic.displayTreeTitle(value), displayTreeTitle(value), String(value));
    assert.equal(classic.hasAutoTitleSuffix(value), hasAutoTitleSuffix(value), String(value));
  }
  assert.equal(classic.autoTreeTitle('윤슬'), autoTreeTitle('윤슬'));
  assert.match(shelf, /<script src="\/v41\/tree-name\.js"><\/script>/);
});

// #256-1: 책장 어댑터(view-navigation.js)가 이어 읽기 칸을 장식 취급하지 않는다.
test('#256-1 view-navigation 어댑터가 이어 읽기 칸의 문구·접근성을 덮어 쓰지 않는다', () => {
  const nav = read('public/v41/view-navigation.js');
  assert.match(nav, /stage\.closest\('#resumeCard'\)/, 'stage-label 덮어쓰기는 이어 읽기 칸을 제외한다');
  assert.match(nav, /hero-stage:not\(#resumeCard\)/, 'aria-hidden은 이어 읽기 칸에 다시 붙이지 않는다');
});

// #256-1: 칸을 바꾸면서 닫는 태그를 하나 남기면 아래 책장이 밀린다(실제로 그랬었다). 균형을 검사한다.
test('#256-1 책장 마크업 태그 균형(div·section·button)', () => {
  const markup = shelf.slice(0, shelf.indexOf('<script'));
  for (const tag of ['div', 'section', 'button', 'span']) {
    const open = (markup.match(new RegExp('<' + tag + '(\\s|>)', 'g')) || []).length;
    const close = (markup.match(new RegExp('</' + tag + '>', 'g')) || []).length;
    assert.equal(open, close, '<' + tag + '> 열림/닫힘이 같아야 한다');
  }
});

// 261117 대표 확정: '내 트리' 화면 이름을 '서재'로 — 화면 글자와 aria-label만(코드 이름은 그대로).
test('#서재 서재 화면의 머리말·고리칸·접근성 이름이 서재다', () => {
  const html = read('public/v41/views/track32-bookshelf.html');
  assert.ok(html.includes('<title>러브트리 4.1 · 서재</title>'), '문서 제목');
  assert.match(html, /id="crumbLabel">서재</, '고리칸(머리말 꼬리표)');
  assert.match(html, /<p class="eyebrow">서재</, 'hero 꼬리표');
  assert.match(html, /id="shelfViewport" aria-label="서재"/, '책장 진열 접근성 이름');
  const reader = read('public/v41/views/shelf/shelf-reader.js');
  assert.match(reader, /crumbLabel'\)\.textContent='서재'/, '책에서 돌아올 때도 서재');
  const nav = read('public/v41/view-navigation.js');
  assert.match(nav, /stage\.textContent='서재'/, '장식 단계 이름도 서재');
});

// 261117 대표 확정: 서재 책 줄(책등 목차) 끝·책장 진열 끝에 '+ 새 트리' 빈 책 한 권 —
// 누르면 지금의 새 트리 만들기 흐름(이어 읽기 칸 first 경로와 같은 lt41-write new).
test('#서재 "+ 새 트리" 빈 책이 책등 줄 끝·진열 끝에 서고 누르면 새 트리 만들기 흐름을 연다', () => {
  const js = read('public/v41/views/shelf/shelf.js');
  assert.match(js, /book-card--new"><button type="button" data-new-book aria-label="새 트리 만들기"/, '진열 끝 빈 책');
  assert.match(js, /shelf-spine--new" data-new-book aria-label="새 트리 만들기"/, '책등 줄 끝 빈 책');
  assert.match(js, /<strong class="cover-title">\+ 새 트리<\/strong>/, '빈 책 이름');
  // 배선은 한 벌: data-new-book 클릭 → lt41-write new(#256-1 first 경로와 같은 메시지).
  assert.match(js, /closest\('\[data-new-book\]'\)\)\{openNewTree\(\);return;\}/, '책등 줄 배선');
  assert.match(js, /closest\('\[data-new-book\]'\)\)openNewTree\(\);/, '진열 배선');
  // lt41-write new는 두 곳에서 쓴다 — 이어 읽기 칸의 'first' 경로와 빈 책의 openNewTree(같은 흐름).
  assert.equal((js.match(/lt41-write',mode:'new'/g) || []).length, 2, '이어 읽기 first 경로 + 빈 책');
  assert.match(js, /var openNewTree=function\(\)\{parent\.postMessage\(\{type:'lt41-write',mode:'new'\},location\.origin\);\};/, '빈 책 배선은 openNewTree 한 벌');
  // 진열 3D 배치: 빈 책도 마지막 책 다음 자리에 선다(책이 없으면 가운데).
  assert.match(js, /carouselTransform\(state\.shelfList\.length-center\)/, '빈 책 자리는 진열 끝');
  assert.match(js, /newCard=rail\.querySelector\('\.book-card--new'\)/, '빈 책을 배치 대상으로 본다');
  // 모양 — 점선 테두리·가운데 ＋, 색은 --lt-* 토큰만. 책등 규칙은 shelf.css(덧칠 파일에 섞지 않는다).
  const extra = read('public/v41/views/shelf/shelf-extra.css');
  const spineCss = read('public/v41/views/shelf/shelf.css');
  assert.match(extra, /book-card--new \.book-cover \{[^}]*border: 2px dashed/, '진열 빈 책 점선 테두리');
  assert.match(spineCss, /shelf-spine--new \{[^}]*border: 2px dashed/, '책등 빈 책 점선 테두리');
  assert.match(extra, /new-book-plus \{[^}]*color: var\(--lt-gold,#ffe6a6\)/, '밤: ＋는 금빛');
  assert.match(extra, /\[data-lt-theme=garden\] \.book-card--new \.new-book-plus \{ color: var\(--lt-gold-ink,#8a6420\)/, '정원: ＋는 종이 위 금빛');
});

// 261117 대표 확정: 이어 읽기 칸이 테마를 따른다 — 정원에서도 검은 밤 카드로 남지 않는다.
test('#서재 이어 읽기 칸은 정원에서 밝은 종이 카드(--lt-paper 위 --lt-ink)다', () => {
  const extra = read('public/v41/views/shelf/shelf-extra.css');
  assert.match(extra, /\[data-lt-theme=garden\] \.hero-stage \{[^}]*background: var\(--lt-paper,#f5efe2\)/, '정원: 카드 면은 종이');
  assert.match(extra, /\[data-lt-theme=garden\] \.hero-stage \{[^}]*color: var\(--lt-ink,#433a34\)/, '정원: 글자는 종이 위 잉크');
  assert.match(extra, /\[data-lt-theme=garden\] \.resume-copy strong \{ color: var\(--lt-ink,#433a34\)/, '정원: 이어 읽기 문구');
  assert.match(extra, /\[data-lt-theme=garden\] \.resume-copy em \{ color: var\(--lt-gold-ink,#8a6420\)/, '정원: 행동 글자는 종이 위 금빛');
  // 밤 규칙은 그대로다(정원에서만 고쳤다) — 밤 카드 면은 shelf.css의 원본 블록.
  const base = read('public/v41/views/shelf/shelf.css');
  assert.match(base, /\.hero-stage \{[^}]*linear-gradient\(135deg,#29272a,#161517 82%\)/, '밤 카드는 지금 그대로');
});
