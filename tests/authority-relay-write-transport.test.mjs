import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthorityWriteCall } from '../server/authority-relay-write-transport.js';

const ENV = {
  LOVETREE_MINT_URL: 'https://lovetree-auth-caller.example.workers.dev/mint-session',
  LOVETREE_CALLER_SECRET: 'test-secret-value'
};

function fetchAnswer(body, status = 200) {
  return async () => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });
}

test('폐기 요청을 /revoke-session으로 넘기고 writer 계약 형상으로 맞춘다', async () => {
  const calls = [];
  const call = createAuthorityWriteCall(ENV, {
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, revoked: { session_id: 'sess-1', product_id: 'lovetree-4-0', state: 'revoked' } }) };
    }
  });
  const answer = await call('revoke_auth_session', { session_id: 'sess-1' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://lovetree-auth-caller.example.workers.dev/revoke-session');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.authorization, 'Bearer test-secret-value');
  assert.deepEqual(JSON.parse(calls[0].init.body), { session_id: 'sess-1' });
  assert.deepEqual(answer, { ok: true, session: { session_id: 'sess-1', product_id: 'lovetree-4-0', state: 'revoked' } });
});

test('발급 RPC는 닫는다 — 이 transport가 발급을 대신하지 않는다', async () => {
  const call = createAuthorityWriteCall(ENV, { fetchImpl: async () => { throw new Error('호출되면 안 된다'); } });
  await assert.rejects(() => call('resolve_or_create_product_link', {}), /revoke_auth_session만 중계/);
  await assert.rejects(() => call('establish_auth_session', {}), /revoke_auth_session만 중계/);
});

test('중계가 폐기를 확인하지 못하면 예외로 닫는다(writer가 503로 만든다)', async () => {
  const call = createAuthorityWriteCall(ENV, { fetchImpl: fetchAnswer({ ok: false, error: { code: 'session_not_revoked' } }, 401) });
  await assert.rejects(() => call('revoke_auth_session', { session_id: 'sess-1' }), /폐기하지 못했|폐기하지 않았/);
  const bad = createAuthorityWriteCall(ENV, { fetchImpl: fetchAnswer({ ok: true, revoked: { session_id: 'other', product_id: 'lovetree-4-0', state: 'revoked' } }) });
  await assert.rejects(() => bad('revoke_auth_session', { session_id: 'sess-1' }), /폐기하지 않았/);
});

test('시크릿·주소가 없으면 만들지 않는다', () => {
  assert.throws(() => createAuthorityWriteCall({ LOVETREE_MINT_URL: ENV.LOVETREE_MINT_URL }), /LOVETREE_CALLER_SECRET/);
  assert.throws(() => createAuthorityWriteCall({ LOVETREE_CALLER_SECRET: 'x' }), /LOVETREE_MINT_URL/);
  assert.throws(() => createAuthorityWriteCall({ LOVETREE_MINT_URL: 'http://10.0.0.9/mint-session', LOVETREE_CALLER_SECRET: 'x' }), /LOVETREE_MINT_URL/);
});
