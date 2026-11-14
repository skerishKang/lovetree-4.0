import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  headerState, headerParts, headerPartsFor,
  FIRST_TREE_TIPS, TIPS_KEY, readTipsSeen, writeTipsSeen, tipsWanted
} from '../public/v41/header-state.mjs';

const header = readFileSync(new URL('../public/v41/shell/header.mjs', import.meta.url), 'utf8');
// #231 1-B 후속: 말풍선 Esc·포커스 되돌림은 shell/dialogs.mjs가 맡는다.
const shell = readFileSync(new URL('../public/v41/shell.mjs', import.meta.url), 'utf8')
  + readFileSync(new URL('../public/v41/shell/dialogs.mjs', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/v41/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/v41/shell.css', import.meta.url), 'utf8');

test('1. 상태는 로그아웃·로그인(트리 없음)·트리 있음·공유 감상 넷으로만 나뉜다', () => {
  assert.equal(headerState({owned: false}), 'out');
  assert.equal(headerState({owned: false, treeCount: 3}), 'out');
  assert.equal(headerState({owned: true}), 'in-empty');
  assert.equal(headerState({owned: true, treeCount: 0}), 'in-empty');
  assert.equal(headerState({owned: true, treeCount: 1}), 'in-trees');
  assert.equal(headerState({owned: true, treeCount: 2}), 'in-trees');
  assert.equal(headerState({owned: true, treeCount: 2, publicReading: true}), 'share');
  assert.equal(headerState({}), 'out', '아무것도 모를 때는 로그아웃으로 본다');
});

test('2. 로그아웃: 첫 화면·내 책장·둘러보기 + 로그인만 남고 트리 관련은 숨는다', () => {
  const parts = headerPartsFor({owned: false, treeCount: 0});
  assert.deepEqual(
    {account: parts.account, browse: parts.browse, treePicker: parts.treePicker, treeViews: parts.treeViews, write: parts.write, share: parts.share},
    {account: 'login', browse: true, treePicker: false, treeViews: false, write: false, share: false}
  );
});

test('3. 로그인·트리 없음: 계정 동그라미 + 새 트리 만들기, 트리 탭·트리 선택·공유는 숨김', () => {
  const parts = headerPartsFor({owned: true, treeCount: 0});
  assert.equal(parts.account, 'avatar');
  assert.equal(parts.write, true, '가운데·헤더의 "새 트리 만들기"는 남는다');
  assert.equal(parts.treePicker, false, '트리 선택은 숨긴다');
  assert.equal(parts.treeViews, false);
  assert.equal(parts.share, false);
});

test('4. 트리 1개 이상: 트리 선택·기억책·보드·관계 지도·순간 남기기·공유가 모두 보인다', () => {
  const parts = headerPartsFor({owned: true, treeCount: 1});
  assert.deepEqual(
    {account: parts.account, browse: parts.browse, treePicker: parts.treePicker, treeViews: parts.treeViews, write: parts.write, share: parts.share},
    {account: 'avatar', browse: true, treePicker: true, treeViews: true, write: true, share: true}
  );
});

test('5. 모르는 상태는 로그아웃으로 떨어진다(빈 화면을 만들지 않는다)', () => {
  assert.equal(headerParts('nope').state, 'out');
  assert.equal(headerParts(undefined).state, 'out');
});

// 6번(셸이 숨김/표시로 정리하는지 소스 글자로 보던 시험)은 2026-11-09에
// tests/v41-header-flow.test.mjs의 상태 4 × 화면 5 표(함수 직접 호출)로 옮겼다.

test('7. 첫 트리 말풍선: 이름 바꾸기·보기 전환을 알려 준다(#571 — 첫 항목을 이름 바꾸기 안내로)', () => {
  assert.ok(FIRST_TREE_TIPS.length >= 2 && FIRST_TREE_TIPS.length <= 3, `말풍선 ${FIRST_TREE_TIPS.length}개`);
  const titles = FIRST_TREE_TIPS.map((tip) => tip.title).join(' ');
  assert.match(titles, /트리 이름은 지금 바꿀 수 있어요/);
  assert.match(titles, /책·보드·지도/);
  for (const tip of FIRST_TREE_TIPS) {
    assert.ok(tip.anchor === 'tree-manager' || tip.anchor === 'tree-views', tip.anchor);
    assert.ok(tip.body.length > 10 && tip.body.length < 120, `${tip.id} 설명 길이`);
  }
});

test('8. 말풍선은 한 번만 — 닫으면 저장하고, 저장소가 막히면 다시 보여 준다', () => {
  const store = new Map();
  const storage = {getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v))};
  assert.equal(readTipsSeen(storage), false);
  assert.equal(writeTipsSeen(storage), true);
  assert.equal(store.get(TIPS_KEY), '1');
  assert.equal(readTipsSeen(storage), true);

  const broken = {getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }};
  assert.doesNotThrow(() => readTipsSeen(broken));
  assert.equal(readTipsSeen(broken), false);
  assert.equal(writeTipsSeen(broken), false);

  assert.equal(tipsWanted({owned: true, treeCount: 1, seen: false}), true);
  assert.equal(tipsWanted({owned: true, treeCount: 1, seen: true}), false, '두 번째부터는 안 나온다');
  assert.equal(tipsWanted({owned: false, treeCount: 1, seen: false}), false);
  assert.equal(tipsWanted({owned: true, treeCount: 0, seen: false}), false);
  // 이슈 457 2번: pauseMember()가 로그인한 member를 dispose만 하고 null로 안 돌려 owned가 예시 모드에서도
  // true로 남는다 — source로 한 번 더 막아 예시·공유(읽기 전용)를 "내 첫 트리"로 보지 않게 한다.
  assert.equal(tipsWanted({owned: true, treeCount: 1, seen: false, source: 'example'}), false, '예시 둘러보기는 안 뜬다');
  assert.equal(tipsWanted({owned: true, treeCount: 1, seen: false, source: 'share'}), false, '공유(읽기 전용)는 안 뜬다');
  assert.equal(tipsWanted({owned: true, treeCount: 1, seen: false, source: 'server'}), true, '실제 내 트리는 그대로 뜬다');
  // shell.mjs가 현재 source를 넘긴다(예시·공유를 가리키지 않게).
  assert.match(shell, /tipsWanted\(\{owned:!!member\?\.snapshot\(\)\.owned,treeCount:model\?\.trees\?\.length\|\|0,seen:readTipsSeen\(localStorage\),source\}\)/);
});

test('이슈 571: 첫 항목은 자동 이름("모아둔 순간")을 말해 주고 이름 바꾸기로 안내한다', () => {
  const body = FIRST_TREE_TIPS.find((tip) => tip.anchor === 'tree-manager').body;
  assert.match(body, /모아둔 순간/);
  assert.match(body, /바꿔 보세요/);
  assert.doesNotMatch(FIRST_TREE_TIPS.map((tip) => tip.title).join(' '), /＋ 순간 추가/, '＋ 순간 추가는 머리에 늘 보이므로 안내 항목에서 뺐다');
});

test('9. 말풍선 마크업·스타일: Esc·포커스 되돌림, 밤·정원 공통 토큰, 390·360 넘침 없음', () => {
  assert.match(html, /<div id="tree-tips" class="tree-tips" role="dialog" aria-labelledby="tree-tips-title" hidden>/);
  assert.match(html, /<button type="button" id="tree-tips-close">알겠어요<\/button>/);
  // Esc·포커스 되돌림은 글자가 아니라 함수로 확인한다(tests/v41-shell-dialogs.test.mjs).
  const block = css.slice(css.indexOf('.tree-tips{'));
  assert.ok(block.length > 100, '.tree-tips 스타일이 있다');
  assert.match(block, /border:1px solid var\(--lt-gold-line\)/, '금테');
  assert.match(block, /background:var\(--lt-glass-strong\)/, '유리 배경');
  assert.match(block, /@media\(max-width:780px\)\{\.tree-tips\{top:88px;left:12px;right:12px;width:auto/);
  assert.doesNotMatch(block, /#(?!000)[0-9a-fA-F]{3,6}\b/, '색은 --lt-* 토큰만 쓴다');
});
