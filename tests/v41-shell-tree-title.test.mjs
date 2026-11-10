import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {displayTreeTitle, AUTO_TITLE_SUFFIX} from '../public/v41/tree-name.mjs';
// 2026-11-09: 헤더가 트리 이름을 줄여 보여 주는지는 소스 글자가 아니라 함수를 직접 불러 확인한다.
import { createHeader } from '../public/v41/shell/header.mjs';

function fakeEl(extra = {}) {
  return {
    hidden: false, title: '', textContent: '', dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    querySelectorAll: () => [], querySelector: () => null, attrs: {},
    setAttribute(n, v) { this.attrs[n] = String(v); },
    removeAttribute(n) { delete this.attrs[n]; },
    getAttribute(n) { return this.attrs[n] ?? null; },
    focus() {},
    ...extra
  };
}

function headerHarness(tree) {
  const els = {
    'tree-views': fakeEl(), 'record-menu': fakeEl(), 'source-label': fakeEl(), 'write-menu': fakeEl(),
    'share-menu': fakeEl(), 'account-entry': fakeEl(), 'account-avatar': fakeEl({hidden: true}),
    'account-email': fakeEl(), 'account-popover': fakeEl({hidden: true})
  };
  const saved = {document: globalThis.document, sessionStorage: globalThis.sessionStorage};
  globalThis.sessionStorage = {getItem: () => null, setItem() {}, removeItem() {}};
  globalThis.document = {querySelectorAll: () => []};
  globalThis.window = globalThis;
  globalThis.LT41 = tree ? {tree} : null;
  const header = createHeader({
    $: id => els[id] ?? null,
    navBar: null,
    getMember: () => ({snapshot: () => ({owned: true, writable: true, dirty: false, subject: 's1'})}),
    getModel: () => ({trees: [{id: 't1'}]}),
    getSource: () => 'example',
    getCurrent: () => 'src064-orbit.html',
    accountApi: {account: async () => ({ok: false})},
    delegate: {syncTreeTips() {}}
  });
  header.flowNavigation();
  const restore = () => {
    globalThis.document = saved.document;
    globalThis.sessionStorage = saved.sessionStorage;
    if (saved.sessionStorage === undefined) delete globalThis.sessionStorage;
    delete globalThis.LT41;
  };
  return {els, restore};
}

const header = readFileSync(new URL('../public/v41/shell/header.mjs', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../public/v41/shell.mjs', import.meta.url), 'utf8');
// #231 1-B③-2: 패널·책 정보 코드는 shell/panels.mjs로 옮겼다. 글자 시험은 그 파일에서 본다.
const panels = readFileSync(new URL('../public/v41/shell/panels.mjs', import.meta.url), 'utf8');
const messages = readFileSync(new URL('../public/v41/shell/messages.mjs', import.meta.url), 'utf8');
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
  // 트리 드롭다운: 표시 이름은 displayTreeTitle을 거친다.
  assert.match(shell, /escHTML\(displayTreeTitle\(tree\.title\|\|tree\.subject\|\|'트리'\)\)/);
  // 공유 미리보기 요약
  assert.match(messages, /displayTreeTitle\(answer\.preview\.tree\.title\)/);
  // 삭제 확인 문구
  assert.match(panels, /confirm\(`“\$\{displayTreeTitle\(tree\.title\)\}”과/);
  // 원본 이름을 그대로 써야 하는 곳(책 정보 편집 입력)은 건드리지 않는다
  assert.match(panels, /form\.elements\.title\.value = tree\.title;/, '편집 입력은 저장값 그대로');
});

test('3-1. 헤더가 실제로 줄인 이름을 보여 준다(함수 직접 호출)', () => {
  const {els, restore} = headerHarness({title: '리센느, 나의 순간들'});
  try {
    assert.match(els['source-label'].textContent, /리센느/);
    assert.doesNotMatch(els['source-label'].textContent, /나의 순간들/, '자동 꼬리말은 헤더에 보이지 않는다');
    assert.equal(els['tree-views'].getAttribute('aria-label'), '리센느 보기');
  } finally { restore(); }
});

test('3-2. 직접 쓴 이름은 헤더에서도 그대로다', () => {
  const {els, restore} = headerHarness({title: '리센느의 기록'});
  try {
    assert.equal(els['source-label'].textContent.includes('리센느의 기록'), true);
    assert.equal(els['tree-views'].getAttribute('aria-label'), '리센느의 기록 보기');
  } finally { restore(); }
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
