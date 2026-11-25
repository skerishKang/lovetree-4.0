import test from 'node:test';
import assert from 'node:assert/strict';
import { osChanged } from '../tools/ci/os-changes.mjs';

test('화면 코드·문서만 바뀌면 PR에서 Windows 시험을 건너뛴다', () => {
  assert.equal(osChanged(['public/v41/shell.css', 'public/v41/views/board/board.js', 'src/views/orbit.js', 'docs/a.md', 'README.md']).changed, false);
  assert.equal(osChanged(['.github/workflows/preview-check.yml']).changed, false);
});

test('도구·서버·시험·패키지·애매한 파일이 하나라도 있으면 Windows 시험을 돌린다', () => {
  for (const f of ['tools/ci/screen-changes.mjs', 'server/index.js', 'functions/_lib/proxy.js', 'tests/v41-shell-notice.test.mjs', 'package.json', 'vite.config.js', '.github/workflows/ci.yml', 'scripts/x.sh', 'unknown.txt']) {
    assert.equal(osChanged(['public/v41/shell.css', f]).changed, true, f);
  }
});

test('빈 목록은 바뀜이 아니다', () => {
  assert.equal(osChanged([]).changed, false);
});
