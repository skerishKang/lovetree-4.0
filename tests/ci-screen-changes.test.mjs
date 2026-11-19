// 이슈 947 뒤 사줄: 화면 바뀜 판정(tools/ci/screen-changes.mjs)의 작은 시험.
// 시험만 바뀐 PR(#958 계열 — 화면 잡이 실행하지 않는 API·소스 시험)에서는 판정이 거짓이고,
// 화면 시험 파일을 건드린 PR에서는 참이어야 한다. 화면 시험 목록은 워크플로에서 자동으로 뽑는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { screenTestFiles, helperFiles, classify } from '../tools/ci/screen-changes.mjs';

const tests = screenTestFiles();
const helpers = new Set(helperFiles(tests));
const screen = new Set(tests);

test('화면 시험 목록은 워크플로의 화면 잡 구간에서 뽑는다', () => {
  assert.ok(tests.includes('tests/v41-screen-audit.test.mjs'), '화면 공통 검사기가 목록에 있다');
  assert.ok(!tests.includes('tests/v41-share-api.test.mjs'), '화면 잡이 실행하지 않는 API 시험은 목록에 없다');
  assert.ok(helpers.has('tests/helpers/screen-audit.mjs'), '화면 시험 파일이 import하는 helpers도 목록에 있다');
});

test('시험만 바뀐 PR(#958 계열)은 판정 거짓 — 화면 잡을 건너뛴다', () => {
  const r = classify(
    ['tests/shared-auth-pages.test.mjs', 'tests/v41-community.test.mjs', 'tests/v41-share-api.test.mjs', 'tests/v41-share-readonly.test.mjs'],
    screen, helpers,
  );
  assert.equal(r.changed, false, `판정: ${JSON.stringify(r.reasons)}`);
});

test('화면 시험 파일·helpers를 건드린 PR은 판정 참 — 화면 잡이 돈다', () => {
  for (const f of ['tests/v41-screen-audit.test.mjs', 'tests/helpers/screen-audit.mjs', 'tests/v41-map-theme-flow.test.mjs']) {
    const r = classify([f], screen, helpers);
    assert.equal(r.changed, true, `${f}: ${JSON.stringify(r.reasons)}`);
  }
});

test('나머지 규칙은 그대로다 — 화면·화면 밖·애미', () => {
  assert.equal(classify(['public/v41/shell.css'], screen, helpers).changed, true, 'public은 화면');
  assert.equal(classify(['src/views/orbit/orbit.js'], screen, helpers).changed, true, 'src/views는 화면');
  assert.equal(classify(['.github/workflows/preview-check.yml'], screen, helpers).changed, true, '워크플로 자체는 화면');
  assert.equal(classify(['docs/HANDOFF.md'], screen, helpers).changed, false, '문서는 화면 밖');
  assert.equal(classify(['src/server/community-service.js'], screen, helpers).changed, false, '서버는 화면 밖');
  assert.equal(classify(['src/new-thing.js'], screen, helpers).changed, true, '애매하면 바뀜');
});
