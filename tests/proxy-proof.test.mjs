import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyProxyProof, logProxyProofStartup, PROXY_PROOF_HEADER } from '../server/proxy-proof.js';

const SECRET = 's'.repeat(48);
const req = (headers = {}, path = '/api/workspace') => ({ path, headers });

test('#1211: 수신 경로는 기록 모드에서도 위조된 표시와 일반 프록시 증명을 거절한다', () => {
  const path='/api/ops-feedback/ingest';
  for(const headers of [{},{'x-lovetree-ops-ingest-proof':'verified'},{[PROXY_PROOF_HEADER]:SECRET},{[PROXY_PROOF_HEADER]:SECRET,'x-lovetree-ops-ingest-proof':'verified'}]){
    assert.equal(verifyProxyProof(req(headers,path),{secret:SECRET,enforce:false}).ok,false);
  }
  assert.equal(verifyProxyProof(req({},path),{secret:'',enforce:false}).ok,false);
});

test('서버 요청 출처 확인: 맞는 머리말은 통과하고, 없거나 틀린 머리말은 기록만 남긴다', () => {
  const logs = [];
  assert.deepEqual(verifyProxyProof(req({ [PROXY_PROOF_HEADER]: SECRET }), { secret: SECRET }), { ok: true, reason: 'valid' });
  assert.deepEqual(verifyProxyProof(req(), { secret: SECRET }), { ok: true, reason: 'mismatch' });
  assert.deepEqual(verifyProxyProof(req({ [PROXY_PROOF_HEADER]: 'x'.repeat(48) }), { secret: SECRET }), { ok: true, reason: 'mismatch' });
});

test('서버 요청 출처 확인: 단속 설정일 때만 어긋난 요청을 막는다', () => {
  assert.equal(verifyProxyProof(req({ [PROXY_PROOF_HEADER]: SECRET }), { secret: SECRET, enforce: true }).ok, true);
  assert.equal(verifyProxyProof(req(), { secret: SECRET, enforce: true }).ok, false);
  assert.equal(verifyProxyProof(req({ [PROXY_PROOF_HEADER]: 'bad' }), { secret: SECRET, enforce: true }).ok, false);
});

test('서버 요청 출처 확인: 단속 중 비밀이 없거나 짧으면 거부, 꺼져 있으면 통과', () => {
  for (const secret of ['', 'short', 'x'.repeat(31)]) {
    const blocked = verifyProxyProof(req({ [PROXY_PROOF_HEADER]: secret }), { secret, enforce: true });
    assert.deepEqual(blocked, { ok: false, reason: 'unavailable' }, `단속 중 비밀 길이 ${secret.length}`);
    const allowed = verifyProxyProof(req(), { secret, enforce: false });
    assert.deepEqual(allowed, { ok: true, reason: 'unavailable' }, `기록 모드 비밀 길이 ${secret.length}`);
  }
  assert.equal(verifyProxyProof(req({ [PROXY_PROOF_HEADER]: 'x'.repeat(32) }), { secret: 'x'.repeat(32), enforce: true }).ok, true, '32자부터 유효');
});

test('서버 요청 출처 확인: 비밀 없음 기록은 시작 때 한 번, 요청마다 남지 않는다', () => {
  const startupLogs = [];
  assert.equal(logProxyProofStartup({ secret: '', log: e => startupLogs.push(e) }), false);
  assert.equal(logProxyProofStartup({ secret: 'x'.repeat(31), log: e => startupLogs.push(e) }), false);
  assert.equal(logProxyProofStartup({ secret: SECRET, log: e => startupLogs.push(e) }), true);
  assert.equal(startupLogs.length, 2, '비밀이 없거나 짧은 경우에만 시작 기록');
  assert.ok(startupLogs.every(e => e.result === 'unavailable'));

  // 요청이 몇 번 와도 시작 기록은 그대로다 — 요청마다 기록하지 않는다.
  assert.deepEqual(verifyProxyProof(req(), { secret: '', enforce: false }), { ok: true, reason: 'unavailable' });
  assert.deepEqual(verifyProxyProof(req(), { secret: '', enforce: false }), { ok: true, reason: 'unavailable' });
  assert.equal(startupLogs.length, 2);
});

test('서버 요청 출처 확인: 내부 경로는 자체 서명 검사를 쓴다', () => {
  assert.deepEqual(verifyProxyProof(req({}, '/internal/account/email'), { secret: SECRET, enforce: true }), { ok: true, reason: 'internal' });
});
