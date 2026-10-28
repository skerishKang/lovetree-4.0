import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveListen } from '../server/listen-config.js';

test('기본은 루프백과 8790 — 파일 레인이 잡은 8788과 부딪히지 않는다', () => {
  assert.deepEqual(resolveListen({ env: {} }), { host: '127.0.0.1', port: 8790 });
  assert.deepEqual(resolveListen({ env: { PORT: '9001' } }), { host: '127.0.0.1', port: 9001 });
  assert.deepEqual(resolveListen({ env: { LOVETREE_HOST: '::1' } }), { host: '::1', port: 8790 });
});

test('공개 바인딩과 잘못된 번호는 시작을 막는다', () => {
  for (const host of ['0.0.0.0', '::', '10.0.0.5', 'api.example.com']) {
    assert.throws(() => resolveListen({ env: { LOVETREE_HOST: host } }), /공개 바인딩|루프백/);
  }
  for (const port of ['abc', '0', '70000', '1.5', '-1']) {
    assert.throws(() => resolveListen({ env: { PORT: port } }), /PORT/);
  }
});
