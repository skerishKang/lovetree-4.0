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
  assert.equal(changed(['tests/admin-roles-postgres.test.mjs']), true);
  assert.equal(changed(['tests/migrations-postgres.test.mjs']), true);
  assert.equal(changed(['tests/install-preflight.test.mjs']), true);
});

test('판정 도구와 판정이 들어 있는 워크플로는 서버 바뀜이다', () => {
  assert.equal(changed(['tools/ci/server-changes.mjs']), true);
  assert.equal(changed(['.github/workflows/ci.yml']), true);
});

test('운영 설치 대상 파일 하나만 바뀌어도 서버 바뀜이다', () => {
  assert.equal(changed(['public/v41/youtube-id.mjs']), true);
  assert.equal(changed(['src/domain.js']), true);
  assert.equal(changed(['tools/export-ai-customer-db.mjs']), true);
  assert.equal(changed(['deploy/host-com2/lovetree-api/install.sh']), true);
});

test('확실히 서버와 무관한 것은 서버 바뀜이 아니다', () => {
  assert.equal(changed(['docs/HANDOFF.md']), false);
  assert.equal(changed(['public/v41/views/track58-pinboard.html']), false);
  assert.equal(changed(['public/v41/shell.css']), false);
  assert.equal(changed(['tests/v41-moment-list.test.mjs']), false);
});

test('모르는 경로와 src 새 파일은 애매하므로 서버 바뀜이다', () => {
  assert.equal(changed(['src/new-thing.js']), true);
  assert.equal(changed(['alpine/new-tool.sh']), true);
});
