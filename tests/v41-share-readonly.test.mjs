// #315: 공유 감상(share)은 읽기 전용 — 쓰기·편집 버튼을 렌더하지 않고, 쓰기 메시지도 막는다.
// 판정은 runtime.js가 LT41.source에서 한 곳으로 내린다(LTDEMO.readOnly). 화면 연결은 글자 검사로 확인한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

const bookExtra = read('public/v41/views/book/book-extra.js');
const book = read('public/v41/views/book/book.js');
const boardExtras = read('public/v41/views/board/board-extras.js');
const network = read('public/v41/views/network/network.js');
const messages = read('public/v41/shell/messages.mjs');
const shell = read('public/v41/shell.mjs');
const runtime = read('public/v41/runtime.js');

// ── 판정: runtime.js가 LT41.source에서 readOnly를 한 곳에서 내린다 ──
// #464(2026-11-13): 예시(example)도 읽기 전용이다 — 고칠 수 없는 화면인데 '고치기'·마음 안내가 떴다.
test('LTDEMO.readOnly는 공유(share)와 예시(example)에서 참이다', async () => {
  const vm = await import('node:vm');
  for (const [source, expected] of [['share', true], ['server', false], ['example', true], ['file', false]]) {
    const document = {
      querySelectorAll: () => [],
      getElementById: () => null,
      addEventListener: () => {}
    };
    const listeners = [];
    const scope = {
      window: {},
      document,
      parent: { LT41: { source, tree: { id: 't1', title: '트리', moments: [], edges: [] } } },
      addEventListener: (type, fn) => listeners.push([type, fn]),
      setTimeout, clearTimeout
    };
    scope.window = scope;
    vm.runInNewContext(runtime, scope);
    assert.equal(typeof scope.window.LTDEMO.readOnly, 'boolean', source + ': readOnly는 참/거짓을 낸다');
    assert.equal(scope.window.LTDEMO.readOnly, expected, source + ': 기대한 판정');
  }
});

test('#464 예시 트리(demoData)는 source와 무관하게 읽기 전용이다', async () => {
  // 셸이 예시를 띄울 때 트리에 demoData를 붙인다 — 그 자체가 '고칠 수 없다'는 표시다.
  const vm = await import('node:vm');
  for (const source of ['server', 'example']) {
    const scope = {
      window: {},
      document: { querySelectorAll: () => [], getElementById: () => null, addEventListener: () => {} },
      parent: { LT41: { source, tree: { id: 'e', title: '예시', moments: [], edges: [], demoData: { moments: [], edges: [] } } } },
      addEventListener: () => {},
      setTimeout, clearTimeout
    };
    scope.window = scope;
    vm.runInNewContext(runtime, scope);
    assert.equal(scope.window.LTDEMO.readOnly, true, source + ': demoData가 있으면 읽기 전용');
    assert.equal(scope.window.LTDEMO.example, true, source + ': 예시 표시는 그대로');
  }
});

// ── 기억책(track59) 연결: 버튼을 렌더하지 않고, 남아도 메시지를 보내지 않는다 ──
test('기억책: 공유에서 제목 고치기·다음 순간 남기기·링크 순간 버튼을 렌더하지 않는다', () => {
  assert.match(bookExtra, /editAffordances\(\{readOnly:!!LTDEMO\.readOnly,synthetic:!!m\.synthetic/, '편집 손잡이는 공유·예시에서 렌더하지 않는다(editAffordances)');
  assert.equal((bookExtra.match(/LTDEMO\.readOnly\?''/g) || []).length, 2, '다음 순간 남기기 버튼(책 끝·모바일)도 공유에서 렌더하지 않는다');
  assert.match(book, /if\(LTDEMO\.readOnly\)\{\$\('#addLinkBtn'\)\.hidden=true\}/, '+ 링크 순간 버튼은 공유에서 숨긴다');
});

test('기억책: 쓰기 클릭·요청은 공유에서 메시지를 보내지 않는다(이중)', () => {
  assert.match(bookExtra, /function requestNextMoment\(parentId\)\{[\s\S]*?if\(LTDEMO\.readOnly\)return;/, '순간 추가 요청은 공유에서 조용히 끝난다');
  assert.match(bookExtra, /if\(next\)\{if\(LTDEMO\.readOnly\)return;/, '다음 순간 남기기 클릭 가드');
  assert.match(bookExtra, /if\(edit\)\{if\(LTDEMO\.readOnly\)return;/, '제목 고치기 클릭 가드');
  assert.match(book, /function openLinkModal\(\)\{if\(LTDEMO\.readOnly\)return;/, '링크 순간 창은 공유에서 열지 않는다');
});

// ── 기억판(track58) 연결: 순간 꽂기·되돌리기·편집 도구를 숨기고 동작도 막는다 ──
test('기억판: 공유에서 쓰기·편집 도구를 숨기고 편집·저장도 막는다', () => {
  assert.match(boardExtras, /if\(LTDEMO\.readOnly\)\{if\(editBtn\)editBtn\.hidden=true;for\(const id of \['addBtn','undoBtn'\]\)/, '편집·순간 꽂기·되돌리기 버튼을 숨긴다');
  assert.match(boardExtras, /function openEdit\(\)\{if\(LTDEMO\.readOnly\)return;/, '편집 창을 열지 않는다');
  assert.match(boardExtras, /function saveEdit\(\)\{if\(LTDEMO\.readOnly\)return;/, '편집 저장을 하지 않는다');
  assert.match(boardExtras, /\$\('#addBtn'\)\.onclick=\(\)=>\{if\(LTDEMO\.readOnly\)return;openAdd\(\)\}/, '순간 꽂기 창을 열지 않는다');
  assert.match(boardExtras, /\$\('#confirmAdd'\)\.onclick=\(\)=>\{if\(LTDEMO\.readOnly\)return;confirmAdd\(\)\}/, '순간 꽂기를 하지 않는다');
});

// ── 지도(track56): 쓰기 UI가 원래 없다 — 회귀 감시 ──
test('지도: 쓰기 메시지를 보내는 코드가 없다', () => {
  assert.ok(!/lt41-write/.test(network), '지도는 lt41-write를 쓰지 않는다');
});

// ── 셸 이중 가드: share 모드에서 쓰기 메시지는 무시된다 ──
test('셸: share 모드의 lt41-write·lt41-journey-save 메시지를 무시한다', () => {
  assert.match(messages, /data\?\.type === 'lt41-write' && getSource\(\) === 'share'\) return;/, '쓰기 메시지 이중 가드');
  assert.match(messages, /lt41-journey-save'\) \{ if \(getSource\(\) === 'share'\) return;/, '첫 여정 저장 메시지도 공유에서 막는다');
});

// ── #425 2번: 올린 사진은 공개 화면에서 주소가 빠지고, 내 화면에서는 그대로 보인다 ──
test('공유 렌더: 공개 응답을 runtime에 넘기면 올린 사진 주소가 0건, 내 화면에는 그대로', async () => {
  const vm = await import('node:vm');
  const { createTree } = await import('../src/domain.js');
  const { projectSharedTree } = await import('../server/share-service.js');
  const photo = 'https://front.test/api/media/123e4567-e89b-42d3-a456-426614174000.jpg';
  const tree = createTree({ subject: '윤슬', title: '사진 순간', note: '첫 장면', emotion: '설렘', date: '2026-11-01', url: photo }, '2026-11-01T00:00:00.000Z');
  const run = (sourceTree, source) => {
    const document = { querySelectorAll: () => [], getElementById: () => null, addEventListener: () => {} };
    const scope = {
      window: {}, document,
      parent: { LT41: { source, tree: { ...sourceTree, edges: [] } } },
      addEventListener: () => {}, setTimeout, clearTimeout
    };
    scope.window = scope;
    vm.runInNewContext(runtime, scope);
    return scope.window.LTDEMO;
  };
  const shared = run(projectSharedTree({ version: 1, trees: [tree] }, tree.id).tree, 'share');
  assert.equal(JSON.stringify(shared).includes('/api/media/'), false, '공개 화면 렌더에 올린 사진 주소가 없다');
  assert.equal(shared.moments.length, 1, '순간 개수는 그대로');
  assert.equal(shared.moments[0].title, tree.moments[0].title, '순간 제목은 그대로');
  assert.equal(shared.moments[0].emotion, tree.moments[0].emotion, '감정은 그대로');
  assert.equal(shared.moments[0].date, tree.moments[0].date, '날짜는 그대로');
  assert.equal(shared.moments[0].externalUrl, '', '공개에서는 주소만 빠진다');
  const mine = run(tree, 'server');
  assert.equal(mine.moments[0].externalUrl, photo, '내 화면에서는 올린 사진 주소를 그대로 쓴다');
});

test('공유 감상 안내(#425 2번): 올린 사진 N장은 나만 볼 수 있어요', () => {
  assert.match(shell, /answer\.omittedPrivateMedia\?' 올린 사진 '\+answer\.omittedPrivateMedia\+'장은 나만 볼 수 있어요\.'/, '공유 감상 화면 안내 문구');
});
