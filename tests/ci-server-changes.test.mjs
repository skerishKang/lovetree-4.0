import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../tools/ci/server-changes.mjs';

const changed = files => classify(files).changed;

test('서버 코드·배포 스크립트·의존성이 바뀌면 서버 바뀜이다', () => {
  assert.equal(changed(['server/index.js']), true);
  assert.equal(changed(['deploy/host-com2/lovetree-api/install.sh']), true);
  assert.equal(changed(['package.json']), true);
  assert.equal(changed(['package-lock.json']), true);
});

test('서버 관련 시험이 바뀌면 서버 바뀜이다', () => {
  assert.equal(changed(['tests/login-state-postgres.test.mjs']), true);
  assert.equal(changed(['tests/migrations-postgres.test.mjs']), true);
  assert.equal(changed(['tests/install-preflight.test.mjs']), true);
});

test('판정 도구·다른 워크플로·화면 파일은 서버 바뀜이 아니다', () => {
  assert.equal(changed(['tools/ci/server-changes.mjs']), false);
  assert.equal(changed(['.github/workflows/ci.yml']), false);
  assert.equal(changed(['public/v41/shell.css']), false);
  assert.equal(changed(['tests/ci-server-changes.test.mjs']), false);
});
