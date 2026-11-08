import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {displayTreeTitle, AUTO_TITLE_SUFFIX} from '../public/v41/tree-name.mjs';

const shell = readFileSync(new URL('../public/v41/shell.mjs', import.meta.url), 'utf8');
const community = readFileSync(new URL('../public/v41/community-panel.mjs', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/v41/shell.css', import.meta.url), 'utf8');

test('1. 헤더·목록 이름: "리센느, 나의 순간들"은 "리센느"로 보인다', () => {
  assert.equal(AUTO_TITLE_SUFFIX, ', 나의 순간들');
  assert.equal(displayTreeTitle('리센느, 나의 순간들'), '리센느');
  assert.equal(displayTreeTitle('리센느의 기록, 나의 순간들'), '리센느의 기록');
});

test('2. 직접 쓴 이름은 그대로 둔다(정확히 일치할 때만 뗀다)', () => {
  assert.equal(displayTreeTitle('리센느'), '리센느');
  assert.equal(displayTreeTitle('리센느, 나의 순간들 2'), '리센느, 나의 순간들 2');
  assert.equal(displayTreeTitle('나의 순간들'), '나의 순간들');
  assert.equal(displayTreeTitle(', 나의 순간들'), ', 나의 순간들');
  assert.equal(displayTreeTitle(''), '');
  assert.equal(displayTreeTitle(undefined), '');
});

test('3. 셸이 트리 이름을 보여 주는 곳은 모두 displayTreeTitle을 거친다', () => {
  assert.match(shell, /import \{displayTreeTitle\} from '\.\/tree-name\.mjs';/);
  // 선택한 트리(화면 위 문맥 줄)
  assert.match(shell, /\$\('context-tree'\)\.textContent=displayTreeTitle\(c\.tree\.title\);/);
  // 헤더 "트리: <이름> ▾"
  assert.match(shell, /\$\('source-label'\)\.textContent=treePickerText\(\{owned,treeTitle:displayTreeTitle\(window\.LT41\?\.tree\.title\|\|''\),pendingDraft\}\);/);
  // 트리 선택 목록
  assert.match(shell, /o\.textContent=displayTreeTitle\(t\.title\);/);
  // 트리 보기 탭 묶음의 접근성 이름
  assert.match(shell, /\$\('tree-views'\)\.setAttribute\('aria-label',window\.LT41\?\.tree\.title\?displayTreeTitle\(window\.LT41\.tree\.title\)\+' 보기':'이 트리 보기'\);/);
  // 공유 미리보기 요약
  assert.match(shell, /displayTreeTitle\(answer\.preview\.tree\.title\)/);
  // 삭제 확인 문구
  assert.match(shell, /confirm\(`“\$\{displayTreeTitle\(tree\.title\)\}”과/);
  // 원본 이름을 그대로 써야 하는 곳(책 정보 편집 입력)은 건드리지 않는다
  assert.match(shell, /form\.elements\.title\.value=tree\.title;/, '편집 입력은 저장값 그대로');
});

test('4. 둘러보기(공개 목록)도 같은 이름 규칙을 쓴다', () => {
  assert.match(community, /import \{displayTreeTitle\} from '\.\/tree-name\.mjs';/);
  assert.match(community, /title=el\('h3','',displayTreeTitle\(item\.title\)\),subject=el\('p','community-preview-subject'/);
  assert.match(community, /title=el\('h3','',displayTreeTitle\(item\.title\)\),subject=el\('p','community-subject'/);
});

test('5. 긴 이름은 말줄임 — 헤더 트리 이름과 문맥 줄이 폭을 넘지 않는다', () => {
  assert.match(css, /nav #record-menu\{flex:0 0 auto;max-width:190px;/, '헤더 트리 선택 최대 폭');
  assert.match(css, /nav #record-menu #source-label\{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/);
  const context = css.slice(css.indexOf('#context-tree'));
  assert.ok(context.length > 0, '#context-tree 스타일이 있다');
});
