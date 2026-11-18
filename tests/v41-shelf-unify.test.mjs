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
test('#212 카드 표지에는 이름이 한 번만 나오고 아래는 "순간 N개 · 언제 담았는지"다(261118 대표 지적 5)', () => {
  assert.match(shelf, /<strong class="cover-title">'\+esc\(book\.name\)\+'<\/strong><\/div>/);
  assert.ok(!/book-card-meta"><strong>/.test(shelf), '표지 아래 중복 제목을 두지 않는다');
  // 2026-11-09: 정보 줄 계산은 shelf-model.mjs로 옮겼다. 261118: '마지막 YYYY-MM-DD' 대신 쉰 말('어제 추가'·'3일 전 추가', 7일 넘으면 날짜).
  assert.match(shelf, /export function addedLabel\(lastDate, now = new Date\(\)\)/);
  assert.match(shelf, /if \(days <= 7\) return days \+ '일 전 추가'/, '7일 안은 상대 표기');
  assert.ok(!/'마지막 '/.test(shelf), "'마지막 2026-11-13' 기계 표기를 쓰지 않는다");
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

// 4. 예시 그림 자리 → 이어 보기 띠(261118 대표 지적 4). 트리가 있으면 소개 문 대신 띠 한 줄.
test('#서재 이어 보기 띠는 문구·이동·썸네일을 shelf-model 한 벌에서 온다', () => {
  const markup = shelf.slice(0, shelf.indexOf('<script'));
  assert.ok(!/<span>순간 0[1-4]<\/span>/.test(shelf), '가짜 예시 4권을 두지 않는다');
  assert.equal((markup.match(/class="hero-book"/g) || []).length, 0, '작은 책장 그림은 남기지 않는다');
  assert.ok(markup.includes('id="resumeStrip"'), '이어 보기 띠를 둔다');
  assert.ok(markup.includes('id="resumeThumb"'), '가로 썸네일 칸을 둔다');
  assert.ok(markup.includes('id="resumeTree"') && markup.includes('id="resumeMoment"'), '트리 이름·순간 제목 칸을 둔다');
  assert.ok(markup.includes('이어 보기 ▶'), "단추 말은 '이어 보기'로 통일한다");
  assert.ok(!/youtube\.com에서/.test(shelf), '주소 문구를 띠에 넣지 않는다');
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

// 261118 대표 지적 4: 책장 어댑터(view-navigation.js)는 트리 0개 소개 문의 보조 문·단추 말만 덮는다 —
// 이어 보기 띠 문구는 shelf.js·shelf-model이 정한다.
test('#서재 view-navigation 어댑터는 트리 0개 소개 문만 덮고 이어 보기 띠를 만지지 않는다', () => {
  const nav = read('public/v41/view-navigation.js');
  assert.match(nav, /'책을 누르면 읽던 순간부터 책이 열려요\.'/, '소개 문 보조 문');
  assert.match(nav, /jump\.textContent='책 열기'/, "트리 0개 단추 말은 '책 열기'");
  assert.ok(!/resumeStrip|resumeCard|stage-label/.test(nav), '띠·이전 칸 요소를 어댑터가 만지지 않는다');
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
});

// 261118 대표 지적 2·3: 세로 책등 줄은 지우고, '+ 새 트리' 입구는 오른쪽 단추 하나로 모은다.
test('#서재 책등 줄은 없고 "+ 새 트리" 입구는 오른쪽 단추 하나다', () => {
  const js = read('public/v41/views/shelf/shelf.js');
  const html = read('public/v41/views/track32-bookshelf.html');
  const model = read('public/v41/views/shelf/shelf-model.mjs');
  const css = read('public/v41/views/shelf/shelf.css');
  const extra = read('public/v41/views/shelf/shelf-extra.css');
  // 책등 줄 흔적이 남지 않는다.
  assert.ok(!/shelfSpine|shelf-spine/.test(html), '책장 문서에 책등 줄이 없다');
  assert.ok(!/spine/i.test(js), 'shelf.js에 책등 코드가 없다');
  assert.ok(!/spine/i.test(model), 'shelf-model에 책등 계산이 없다');
  assert.ok(!/spine/i.test(css) && !/spine/i.test(extra), '책등 규칙이 남지 않는다');
  assert.ok(!read('public/v41/identity.css').includes('shelf-spine'), 'identity.css에도 책등 규칙이 없다');
  // '+ 새 트리' 입구는 단추 하나. 점선 빈 책·빈 칸은 없다.
  assert.ok(html.includes('id="shelfNewTree"'), "오른쪽 '+ 새 트리' 단추를 둔다");
  assert.ok(!/book-card--new|data-new-book|new-book-plus/.test(js + html), '점선 빈 책을 두지 않는다');
  assert.match(js, /\$\('#shelfNewTree'\)\.addEventListener\('click',openNewTree\)/, '단추는 새 트리 만들기 흐름을 연다');
  assert.equal((js.match(/lt41-write',mode:'new'/g) || []).length, 2, '이어 보기 띠 first 경로 + 새 트리 단추');
});

// 261118 대표 지적 4: 이어 보기 띠가 테마를 따른다 — 정원에서도 검은 밤 카드로 남지 않는다.
test('#서재 이어 보기 띠는 정원에서 밝은 종이 카드(--lt-paper 위 --lt-ink)다', () => {
  const extra = read('public/v41/views/shelf/shelf-extra.css');
  assert.match(extra, /\[data-lt-theme=garden\] \.resume-strip \{[^}]*background: var\(--lt-paper,#f5efe2\)/, '정원: 띠 면은 종이');
  assert.match(extra, /\[data-lt-theme=garden\] \.resume-line strong \{ color: var\(--lt-ink,#433a34\)/, '정원: 트리 이름은 종이 위 잉크');
  assert.match(extra, /\[data-lt-theme=garden\] \.resume-go \{ color: var\(--lt-gold-ink,#8a6420\)/, '정원: 행동 글자는 종이 위 금빛');
  // 밤 규칙은 그대로다(정원에서만 고쳤다) — 밤 띠 면은 --lt-glass-strong.
  assert.match(extra, /\.resume-strip \{[^}]*background: var\(--lt-glass-strong\)/, '밤 띠는 무대 위 유리 카드');
});

// 261118 대표 지적 2차 1: 책이 선반에 앉는다 — 카드 아랫단이 레일 바닥(=선반 윗면)에 붙는다.
test('#서재 책은 선반에 앉고 옆 책 글자는 축소 없이 실제 크기로 렌더된다', () => {
  const extra = read('public/v41/views/shelf/shelf-extra.css');
  // 카드는 아랫단 기준으로 놓이고 배율은 아랫단을 축으로 한다(아랫단이 선반에 닿은 채 유지).
  assert.match(extra, /html\[data-v41-screen=shelf\] \.book-card\{top:auto;bottom:0;transform-origin:50% 100%;/);
  // 선반은 레일 바로 아래 흐름에 놓여 레일 바닥 = 선반 윗면이다.
  assert.match(extra, /html\[data-v41-screen=shelf\] \.shelf-base\{position:static;/);
  // 배율·깊이 이동으로 글자를 줄이지 않는다: 옆 책도 scale 1, z 0.
  const model = read('public/v41/views/shelf/shelf-model.mjs');
  assert.match(model, /scale: absolute === 0 \? 1\.06 : 1,/);
  assert.match(model, /z: 0,/);
  // 4번째 이후 책도 투명도 0.6으로 남는다.
  assert.match(model, /alpha: absolute === 0 \? 1 : absolute === 1 \? 0\.9 : absolute === 2 \? 0\.8 : 0\.6,/);
  // 표지 사진은 가운데를 보여 준다.
  assert.match(extra, /html\[data-v41-screen=shelf\] \.book-card \.book-cover-media\{object-position:50% 50%\}/);
});

// 261118 대표 지적 2차 2: 띠의 바깥 상자는 없고 테두리는 띠 자체의 한 겹이다.
test('#서재 이어 보기 띠는 바깥 상자 없이 한 겹 테두리로 위쪽에 붙는다', () => {
  const extra = read('public/v41/views/shelf/shelf-extra.css');
  assert.match(extra, /html\[data-v41-screen=shelf\] \.hero\.strip-mode \{ margin: 20px 0 0; padding: 0; min-height: 0; height: auto; border: 0; background: transparent; box-shadow: none; \}/);
  // 띠는 위쪽에 붙는다: 책장 세로 중앙 정렬을 풀고 띠 아래 책장이 남은 공간을 쓴다.
  assert.match(extra, /html\[data-v41-screen=shelf\] \.shelf-screen\{display:flex;flex-direction:column;justify-content:flex-start;/);
  assert.match(extra, /html\[data-v41-screen=shelf\] \.shelf-viewport\{margin-top:auto;margin-bottom:auto\}/);
});

// 261118 대표 지적 2차 5: 서재에서 마지막에 본 트리로 콕·보드·지도가 열린다.
test('#서재 가운데 책의 트리를 셸에 알려 탭 이동이 그 트리로 열린다', () => {
  const js = read('public/v41/views/shelf/shelf.js');
  const messages = read('public/v41/shell/messages.mjs');
  const shellMjs = read('public/v41/shell.mjs');
  assert.match(js, /type:'lt41-shelf-tree',treeId:centered\.id/, '서재는 가운데 책의 트리를 셸에 알린다');
  assert.match(messages, /lt41-shelf-tree/, '셸은 그 메시지를 받아 둔다');
  assert.match(messages, /export function lastShelfTreeId\(\)/);
  assert.match(shellMjs, /current==='track32-bookshelf\.html'&&b\.dataset\.view!=='track32-bookshelf\.html'\)\{const treeId=lastShelfTreeId\(\);/, '서재에서 탭 이동은 마지막에 본 트리로 고른 뒤 연다');
  assert.match(shellMjs, /current=b\.dataset\.view;choose\(treeId\);writeLocation\(\);/);
});

// 261118 대표 결정: 트리 0개 계정이 주소로 바로 들어와도 서재 빈 화면(#817)으로 시작한다.
test('#서재 트리 0개 주소 진입도 서재 빈 화면으로 시작한다', () => {
  const shellMjs = read('public/v41/shell.mjs');
  const choose = shellMjs.slice(shellMjs.indexOf('function choose(id,momentId)'), shellMjs.indexOf('function paintEmptyForScreen'));
  assert.match(choose, /paintEmptyForScreen\(current\)/, '빈 판은 지금 화면의 빈 상태 문구로 칠한다');
});
