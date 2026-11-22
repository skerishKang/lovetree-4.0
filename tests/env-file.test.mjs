import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnvFile } from '../tools/env-file.mjs';

// #1073 B-18: AI 고객 내보내기 도구 정리 때 tests/export-ai-customer.test.mjs에서 옮겨 왔다 —
// parseEnvFile은 남는 운영 도구(admin-role·ops-reply·relink-opinion-author)가 계속 쓴다.
test('parseEnvFile 은 키·값을 읽고 주석·따옴표를 처리한다(값은 출력하지 않는다)', () => {
  const text = [
    '# 주석',
    'LOVETREE_DATABASE_URL="postgres://example:fake@127.0.0.1:5432/lovetree"',
    "LOVETREE_PRODUCT_ID='lovetree'",
    'LOVETREE_SESSION_SECRET=plain-value',
    '',
    'BROKEN_LINE_NO_EQUALS'
  ].join('\n');
  const parsed = parseEnvFile(text);
  assert.equal(parsed.LOVETREE_PRODUCT_ID, 'lovetree');
  assert.equal(parsed.LOVETREE_SESSION_SECRET, 'plain-value');
  assert.match(parsed.LOVETREE_DATABASE_URL, /127\.0\.0\.1:5432\/lovetree$/);
  assert.equal(Object.keys(parseEnvFile('')).length, 0);
});
