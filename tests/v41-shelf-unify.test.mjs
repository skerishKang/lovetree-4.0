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

test('#212 "한 권의 책" 강조는 장미색이 아니라 흐린 진주색이다', () => {
  const block = cssBlock(css, `${NIGHT} .hero h1 em`);
  assert.ok(block, '강조 규칙이 있다');
  assert.match(block, /color:var\(--lt-muted\)/);
  assert.ok(!block.includes('rose'));
});

// 2. 책 카드 정보 줄.
test('#212 사진 표지에는 이름을 올리지 않고 아래 두 줄에 이름·날짜를 둔다(261124 정리)', () => {
  assert.match(shelf, /book\.coverMedia\?'':/, '사진 표지에는 제목을 겹치지 않는다');
  assert.ok(shelf.includes('book-card-meta-title') && shelf.includes('book-card-meta-date'), '이름·날짜는 표지 아래 두 줄이다');
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
  assert.match(shelf, /LTTreeName\.displayTreeTitle/);
});

// 4. 예시 그림 자리 → 이어 보기 띠(261118 대표 지적 4). 트리가 있으면 소개 문 대신 띠 한 줄.
test('#서재 이어 보기 띠는 문구·이동·썸네일을 shelf-model 한 벌에서 온다', () => {
  assert.ok(!/<span>순간 0[1-4]<\/span>/.test(shelf), '가짜 예시 4권을 두지 않는다');
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
});

// 261118 대표 지적 4: 책장 어댑터(view-navigation.js)는 트리 0개 소개 문의 보조 문·단추 말만 덮는다 —
// 이어 보기 띠 문구는 shelf.js·shelf-model이 정한다.
test('#256-1 책장 마크업 태그 균형(div·section·button)', () => {
  const markup = shelf.match(/<body[\s\S]*?<\/body>/i)?.[0] || '';
  assert.ok(markup,'책장 본문이 있어야 태그 균형을 검사한다');
  for (const tag of ['div', 'section', 'button', 'span']) {
    const open = (markup.match(new RegExp('<' + tag + '(\\s|>)', 'g')) || []).length;
    const close = (markup.match(new RegExp('</' + tag + '>', 'g')) || []).length;
    assert.equal(open, close, '<' + tag + '> 열림/닫힘이 같아야 한다');
  }
});

// 261117 대표 확정: '내 트리' 화면 이름을 '서재'로 — 화면 글자와 aria-label만(코드 이름은 그대로).
test('#서재에서 새 트리를 만드는 입구는 오른쪽 단추 하나다', () => {
  const html = read('public/v41/views/track32-bookshelf.html');
  const buttons = [...html.matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)];
  const entries = buttons.filter(([, attributes, label]) =>
    attributes.includes('aria-label="새 트리 만들기"') || /^\s*[＋+]\s*새 트리\s*$/.test(label)
  );
  assert.equal(entries.length, 1, '새 트리 만들기 단추 한 개가 있다');
  assert.match(entries[0][2], /새 트리/);
  // 실제 클릭이 순간 추가 대신 첫 트리 만들기를 여는지는 v41-shelf-new-tree에서 검사한다.
});

// 261118 대표 지적 4: 이어 보기 띠가 테마를 따른다 — 정원에서도 검은 밤 카드로 남지 않는다.
test('#서재 트리 0개 주소 진입도 서재 빈 화면으로 시작한다', () => {
  const workspace = read('public/v41/shell/workspace-runtime.mjs');
  const choose = workspace.match(/function\s+choose\s*\(\s*id\s*,\s*momentId\s*,\s*skipShow\s*=\s*false\s*\)([\s\S]*?)function\s+paintEmptyForScreen/);
  assert.ok(choose, 'choose 함수가 빈 화면 처리 앞에 있다');
  assert.match(choose[1], /paintEmptyForScreen\s*\(\s*ctx\.current\s*\)/, '빈 판은 지금 화면의 빈 상태 문구로 칠한다');
});
