// #315: 공유 감상(share)은 읽기 전용 — 쓰기·편집 버튼을 렌더하지 않고, 쓰기 메시지도 막는다.
// #952: 화면 연결을 고정하던 글자 검사 13개를 걷어냈다 — 그 동작은 실브라우저 시험이 이미 본다:
// 보드 도구 줄(v41-board-readonly-520-521: 공유·예시 390/1440에서 ＋ 순간 꽂기 없음), 책 손잡이와
// 마지막 장(v41-book-readonly-464, v41-share-guest-635: → 를 눌러도 쓰기 창·쓰기 메시지 0건),
// 공유 감상 안내 문구는 배지·안내 표시 시험이 확인한다. 글자 검사는 구현 모양만 고정했다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
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
