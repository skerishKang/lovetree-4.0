import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyProxyProof, PROXY_PROOF_HEADER } from '../server/proxy-proof.js';

const SECRET = 's'.repeat(48);
const req = (headers = {}, path = '/api/workspace') => ({ path, headers });

test('서버 요청 출처 확인: 맞는 머리말은 통과하고, 없거나 틀린 머리말은 기록만 남긴다', () => {
  const logs = [];
  const opts = { secret: SECRET, log: e => logs.push(e) };
  assert.deepEqual(verifyProxyProof(req({ [PROXY_PROOF_HEADER]: SECRET }), opts), { ok: true, reason: 'valid' });
  assert.deepEqual(verifyProxyProof(req(), opts), { ok: true, reason: 'mismatch' });
  assert.deepEqual(verifyProxyProof(req({ [PROXY_PROOF_HEADER]: 'x'.repeat(48) }), opts), { ok: true, reason: 'mismatch' });
  assert.equal(logs.length, 2);
  assert.ok(logs.every(e => e.result === 'mismatch'));
  assert.ok(!JSON.stringify(logs).includes(SECRET), '기록에 비밀 값이 없다');
});

test('서버 요청 출처 확인: 단속 설정일 때만 어긋난 요청을 막는다', () => {
  const opts = { secret: SECRET, enforce: true, log: () => {} };
  assert.equal(verifyProxyProof(req({ [PROXY_PROOF_HEADER]: SECRET }), opts).ok, true);
  assert.equal(verifyProxyProof(req(), opts).ok, false);
  assert.equal(verifyProxyProof(req({ [PROXY_PROOF_HEADER]: 'bad' }), opts).ok, false);
});

test('서버 요청 출처 확인: 비밀 값이 없으면 기록만 하고 통과, 내부 경로는 자체 검사를 쓴다', () => {
  const logs = [];
  assert.deepEqual(verifyProxyProof(req(), { secret: '', log: e => logs.push(e) }), { ok: true, reason: 'unavailable' });
  assert.deepEqual(verifyProxyProof(req({}, '/internal/account/email'), { secret: SECRET, enforce: true, log: () => {} }), { ok: true, reason: 'internal' });
  assert.equal(logs[0].result, 'unavailable');
});
