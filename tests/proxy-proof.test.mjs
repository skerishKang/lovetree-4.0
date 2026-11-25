import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyProxyProof, logProxyProofStartup, proxyProofLogPath, proxyProofMismatchEntry, createProxyProofMismatchLogger, PROXY_PROOF_HEADER } from '../server/proxy-proof.js';

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

test('서버 요청 출처 확인: 기록 경로는 첫 두 마디까지만 남긴다', () => {
  assert.equal(proxyProofLogPath('/api/workspace'), '/api/workspace');
  assert.equal(proxyProofLogPath('/api/youtube/oembed?x=1'), '/api/youtube');
  assert.equal(proxyProofLogPath('/api/admin/customers/sub_123/media/a.png'), '/api/admin');
  assert.equal(proxyProofLogPath('/'), '/');
});

test('서버 요청 출처 확인: 어긋남 기록에는 경로와 머리말 유무·길이 비교만 남는다', () => {
  assert.deepEqual(proxyProofMismatchEntry(req({}, '/api/youtube/oembed?x=1'), SECRET), {
    result: 'mismatch', 경로: '/api/youtube', 머리말: '없음'
  });
  assert.deepEqual(proxyProofMismatchEntry(req({ [PROXY_PROOF_HEADER]: 'x'.repeat(16) }, '/api/workspace'), SECRET), {
    result: 'mismatch', 경로: '/api/workspace', 머리말: '있음', 길이: '다름'
  });
  assert.deepEqual(proxyProofMismatchEntry(req({ [PROXY_PROOF_HEADER]: 'x'.repeat(SECRET.length) }, '/api/workspace'), SECRET), {
    result: 'mismatch', 경로: '/api/workspace', 머리말: '있음', 길이: '같음'
  });
});

test('서버 요청 출처 확인: 비밀값과 머리말 값·길이 숫자는 기록에 들어가지 않는다', () => {
  const wrong = 'y'.repeat(SECRET.length);
  const text = JSON.stringify(proxyProofMismatchEntry(req({ [PROXY_PROOF_HEADER]: wrong }, '/api/workspace'), SECRET));
  assert.equal(text.includes(SECRET), false);
  assert.equal(text.includes(wrong), false);
  assert.equal(text.includes(String(SECRET.length)), false);
});

test('서버 요청 출처 확인: 같은 내용은 1분 안에 한 번만 남기고 횟수를 센다', () => {
  const logs = [];
  let clock = 1000;
  const record = createProxyProofMismatchLogger({ log: e => logs.push(e), now: () => clock });
  const request = req({}, '/api/workspace');
  for (let i = 0; i < 3; i += 1) record(request, SECRET);
  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0], { result: 'mismatch', 경로: '/api/workspace', 머리말: '없음', 횟수: 1 });

  clock += 59_000;
  record(request, SECRET);
  assert.equal(logs.length, 1, '1분이 지나기 전에는 계속 묶인다');

  clock += 1_000;
  record(request, SECRET);
  assert.equal(logs.length, 3, '지난 묶음의 횟수와 새 묶음을 각각 남긴다');
  assert.deepEqual(logs[1], { result: 'mismatch', 경로: '/api/workspace', 머리말: '없음', 횟수: 4 });
  assert.deepEqual(logs[2], { result: 'mismatch', 경로: '/api/workspace', 머리말: '없음', 횟수: 1 });
});

test('서버 요청 출처 확인: 내용이 다르면 따로 남는다', () => {
  const logs = [];
  const record = createProxyProofMismatchLogger({ log: e => logs.push(e) });
  record(req({}, '/api/workspace'), SECRET);
  record(req({}, '/api/youtube'), SECRET);
  assert.equal(logs.length, 2);
  assert.deepEqual(logs.map(e => e.경로), ['/api/workspace', '/api/youtube']);
});

test('어긋남 기록 묶음 수는 상한을 넘지 않는다', () => {
  const logs = [];
  const record = createProxyProofMismatchLogger({ log: e => logs.push(e), maxKeys: 3, now: () => 0 });
  for (let i = 0; i < 10; i++) record({ path: `/api/p${i}`, headers: {} }, 'x'.repeat(40));
  record({ path: '/api/p0', headers: {} }, 'x'.repeat(40));
  assert.equal(logs.filter(e => e.경로 === '/api/p0').length, 2);
});
