// B-05: 브라우저를 쓰는 시험이 CI 워크플로에 한 번도 안 나오면 실패한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { browserTestFiles, workflowReferencedTestFiles, missingBrowserTests } from '../tools/ci/test-coverage.mjs';

test('브라우저 시험은 모두 워크플로의 어느 단계에서든 실행된다(누락 0)', () => {
  const missing = missingBrowserTests();
  console.log('COVERAGE', JSON.stringify({ browserFiles: browserTestFiles().length, workflowRefs: workflowReferencedTestFiles().length, missing }));
  assert.deepEqual(missing, [], 'CI에서 한 번도 돌지 않는 브라우저 시험: ' + missing.join(', '));
});

test('누락 검사는 실제 브라우저 시험을 알아보고 워크플로 경로를 읽는다', () => {
  const browsers = browserTestFiles();
  assert.ok(browsers.includes('tests/v41-screen-audit.test.mjs'), '알려진 화면 시험 인식');
  assert.ok(browsers.includes('tests/v41-book-fullscreen-833.test.mjs'), 'REQUIRE 없는 브라우저 시험도 인식');
  assert.ok(!browsers.includes('tests/ci-screen-changes.test.mjs'), '순수 단위 시험은 제외');
  const refs = workflowReferencedTestFiles();
  assert.ok(refs.includes('tests/v41-screen-audit.test.mjs'), '워크플로에서 경로를 읽는다');
});
