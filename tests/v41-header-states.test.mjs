import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  headerState, headerParts, headerPartsFor, treePickerText,
  FIRST_TREE_TIPS, TIPS_KEY, readTipsSeen, writeTipsSeen, tipsWanted,
  unsavedNoticeText, writeMenuLabel
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

test('2. 로그아웃: 서재·책·보드·지도 탐색을 유지하고 트리 선택·쓰기·공유만 숨긴다', () => {
  const parts = headerPartsFor({owned: false, treeCount: 0});
  assert.deepEqual(
    {account: parts.account, browse: parts.browse, treePicker: parts.treePicker, treeViews: parts.treeViews, write: parts.write, share: parts.share},
    {account: 'login', browse: true, treePicker: false, treeViews: true, write: false, share: false}
  );
});

test('3. 로그인·트리 없음: 계정 동그라미·새 트리 만들기·트리 선택·트리 탭이 모두 보인다', () => {
  const parts = headerPartsFor({owned: true, treeCount: 0});
  assert.equal(parts.account, 'avatar');
  assert.equal(parts.write, true, '가운데·헤더의 "새 트리 만들기"는 남는다');
  assert.equal(parts.treePicker, true, '트리 없음도 트리 선택을 보여 준다');
  assert.equal(parts.treeViews, true, '트리 0개에서도 서재·책·보드·지도 탭을 보여 준다');
  assert.equal(parts.share, false);
  assert.equal(treePickerText({owned: true, treeCount: 0}), '트리 없음');
  assert.equal(treePickerText({owned: true, treeCount: 1, treeTitle: '모아둔 순간'}), '트리: 모아둔 순간');
  assert.equal(treePickerText({owned: false, treeCount: 0}), '트리 고르기');
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
  // #619-5: '첫 트리를 막 만든 직후'만 — 트리 2 개이거나 순간이 2 개 이상이면 안 뜬다.
  assert.equal(tipsWanted({owned: true, treeCount: 1, seen: false, source: 'server', momentCount: 1}), true, '첫 트리·첫 순간은 뜬다');
  assert.equal(tipsWanted({owned: true, treeCount: 1, seen: false, source: 'server', momentCount: 2}), false, '순간이 2 개 이상이면 안 뜬다');
  assert.equal(tipsWanted({owned: true, treeCount: 2, seen: false, source: 'server', momentCount: 0}), false, '트리가 2 개 이상이면 안 뜬다');
  // 'shell.mjs가 현재 source를 넘긴다' 배선 글자 검사는 지웠다(이슈 952) — 예시·공유에서 말풍선이
// 뜨지 않는 결과는 위 tipsWanted 표(source 인수 포함)가 함수 입출력으로 확인한다.
});

test('이슈 571: 첫 항목은 자동 이름("모아둔 순간")을 말해 주고 이름 바꾸기로 안내한다', () => {
  const body = FIRST_TREE_TIPS.find((tip) => tip.anchor === 'tree-manager').body;
  assert.match(body, /모아둔 순간/);
  assert.match(body, /바꿔 보세요/);
  assert.doesNotMatch(FIRST_TREE_TIPS.map((tip) => tip.title).join(' '), /＋ 순간 추가/, '＋ 순간 추가는 머리에 늘 보이므로 안내 항목에서 뺐다');
});

// '말풍선 마크업·스타일' 글자 검사(마크업 2·CSS 블록 4)는 지웠다(이슈 952) — 말풍선의 실제 모양과
// Esc·포커스 되돌림은 tests/v41-tree-tips-549.test.mjs의 브라우저 시험이 화면에서 확인하고,
// 색 토큰 규칙은 디자인 시스템 감사가 맡는다.

// 이슈 644 3번: 머리줄 '저장 안 됨' 표시 — 누르면 같은 설명을 연다. 띠가 숨어 있는 동안(저장 중)에는
// 저장 중 설명을, 실패 띠가 이미 있을 때는 그 띠를 그대로 쓴다(셸 explainSaveState).
test('이슈 644: 저장 안 됨 표시의 설명 문구는 저장 중·실패를 가른다', () => {
  assert.equal(writeMenuLabel({owned: true, hasTree: true, dirty: true}), '저장 안 됨');
  assert.equal(unsavedNoticeText('syncing'), '바뀐 내용을 서버에 저장하고 있어요. 잠시 뒤 저절로 저장돼요.');
  assert.equal(unsavedNoticeText('offline'), '서버에 저장하지 못했어요. 저장 안내를 확인해 주세요.');
  assert.equal(unsavedNoticeText(), '서버에 저장하지 못했어요. 저장 안내를 확인해 주세요.');
});
