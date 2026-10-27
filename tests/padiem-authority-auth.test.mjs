import test from 'node:test';
import assert from 'node:assert/strict';
import { createTree } from '../src/domain.js';
import { createApiHandler } from '../server/http.js';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { createPadiemAuthorityAuth, OTHER_REVIEWED_PRODUCTS } from '../server/padiem-authority-auth.js';
import { fromBearer, fromCookie } from '../server/session-credential.js';

const PRODUCT = 'lovetree-4-0';
const NOW = new Date('2026-10-27T06:00:00.000Z');
const FUTURE = '2026-10-27T08:00:00.000Z';
const PAST = '2026-10-27T05:00:00.000Z';
const VALID = 'sess_0123456789abcdef0123456789abcdef';

function sessionRow(overrides = {}) {
  return {
    session_id: VALID,
    product_id: PRODUCT,
    subject: { subject_type: 'user', subject_id: 'sub_9f2c1a' },
    issued_at: '2026-10-27T05:00:00.000Z',
    expires_at: FUTURE,
    state: 'active',
    revision: 3,
    ...overrides
  };
}

function makeAuthority({ session, links, behaviour } = {}) {
  const calls = [];
  const call = async (method, payload) => {
    calls.push({ method, payload });
    if (behaviour === 'throw') throw new Error('권위 연결 실패');
    if (behaviour === 'garbage') return 'not-an-envelope';
    if (behaviour === 'hang') return new Promise(() => {});
    if (method === 'resolve_auth_session') {
      return session === null ? { ok: false, error: { code: 'canonical_auth_session_not_found' } } : { ok: true, session };
    }
    if (method === 'resolve_product_user_for_subject') {
      return links === null ? { ok: false, error: { code: 'canonical_product_identity_link_not_active' } } : { ok: true, product_user_id: links ?? 'usr_abc123' };
    }
    return { ok: false, error: { code: 'unknown_method' } };
  };
  return { call, calls };
}

// 모형 자격 증명 검증자: 제시된 값이 "발행자가 서명했다" 표시를 갖지 않으면 null을 돌려준다.
// 세션 id가 살아 있어도 이 단계를 통과하지 못하면 권위는 아예 불리지 않는다(B64 순서와 동일).
function signedCredential({ nonce = 'sig.' } = {}) {
  return {
    async verify(request) {
      const presented = fromBearer()(request) ?? fromCookie('lovetree_session')(request);
      if (typeof presented !== 'string') return null;
      if (!presented.startsWith(nonce)) return null;
      const sessionId = presented.slice(nonce.length);
      return { sessionId };
    }
  };
}

function brokenCredential(behaviour = 'null') {
  return {
    async verify() {
      if (behaviour === 'throw') throw new Error('검증자 연결 장애');
      return behaviour === 'shape' ? { sessionId: 'sess_!bad' } : null;
    }
  };
}

function build({ productId = PRODUCT, timeoutMs, credential = signedCredential(), ...authority } = {}) {
  const made = makeAuthority(authority);
  const authenticate = createPadiemAuthorityAuth({
    credential, call: made.call, productId, now: () => NOW, timeoutMs
  });
  const repo = createMemoryWorkspaceRepo();
  const handle = createApiHandler({ authenticate, service: createWorkspaceService({ repo, productId }), productId });
  return { handle, repo, calls: made.calls };
}

const statePayload = { version: 1, trees: [createTree({ subject: '윤슬', title: '첫 목소리', note: '기억', emotion: '설렘', date: '2026-10-27', url: '' })] };

const request = (credential, extra = {}) => ({
  method: 'PUT',
  path: '/api/workspace',
  headers: {
    'content-type': 'application/json',
    ...(credential ? { authorization: `Bearer ${credential}` } : {}),
    ...(extra.headers ?? {})
  },
  body: JSON.stringify({ state: statePayload, expectedRevision: 0, clientKey: 'ck-1' })
});

const PRESENTED = `sig.${VALID}`;

test('verified LoveTree credential plus a live session reaches the storage API', async () => {
  const { handle, repo, calls } = build({ session: sessionRow() });
  const saved = await handle(request(PRESENTED));
  assert.equal(saved.status, 200);
  assert.equal(saved.body.revision, 1);
  assert.deepEqual(calls.map(c => c.method), ['resolve_auth_session', 'resolve_product_user_for_subject']);
  assert.deepEqual(calls[0].payload, { session_id: VALID });
  assert.deepEqual(calls[1].payload, { product_id: PRODUCT, canonical_subject_id: 'sub_9f2c1a' });
  assert.equal((await repo.load({ productId: PRODUCT, subjectId: 'sub_9f2c1a' })).revision, 1);
});

test('a tampered credential is refused even when it carries a live session id, and the authority is never asked', async () => {
  const { handle, repo, calls } = build({ session: sessionRow() });
  const forged = await handle(request(`forged.${VALID}`));
  assert.equal(forged.status, 401);
  assert.equal(forged.body.error.code, 'unauthenticated');
  assert.deepEqual(calls, []);
  assert.equal(await repo.load({ productId: PRODUCT, subjectId: 'sub_9f2c1a' }), null);

  const replayed = await handle({
    method: 'GET', path: '/api/workspace',
    headers: { cookie: `lovetree_session=forged.${VALID}` }
  });
  assert.equal(replayed.status, 401);
  assert.deepEqual(calls, []);
});

test('a credential that presents a live session id through the cookie path still needs the issuer check', async () => {
  const { handle, calls } = build({ session: sessionRow() });
  const ok = await handle({ method: 'GET', path: '/api/workspace', headers: { cookie: `x=1; lovetree_session=${PRESENTED}` } });
  assert.equal(ok.status, 200);
  assert.equal(calls.length, 2);
});

for (const [name, behaviour, expected] of [
  ['a verifier that denies', 'null', 401],
  ['a verifier that returns a malformed session id', 'shape', 401],
  ['a verifier that fails to run', 'throw', 503]
]) {
  test(`storage refuses on ${name} without contacting the authority`, async () => {
    const { handle, calls } = build({ session: sessionRow(), credential: brokenCredential(behaviour) });
    const result = await handle(request(PRESENTED));
    assert.equal(result.status, expected);
    assert.deepEqual(calls, []);
  });
}

test('the credential can be a first-party cookie when that is the chosen transport', async () => {
  const { handle } = build({ session: sessionRow() });
  const read = await handle({ method: 'GET', path: '/api/workspace', headers: { cookie: `other=1; lovetree_session=${PRESENTED}` } });
  assert.equal(read.status, 200);
  assert.equal(read.body.revision, 0);
});

for (const [name, session] of [
  ['forged unknown session', null],
  ['revoked session', sessionRow({ state: 'revoked' })],
  ['expired state', sessionRow({ state: 'expired' })],
  ['state active but clock-past', sessionRow({ expires_at: PAST })],
  ['another product session', sessionRow({ product_id: 'b62' })],
  ['claw product session', sessionRow({ product_id: 'b54-padiem-claw' })],
  ['anonymous subject', sessionRow({ subject: { subject_type: 'anonymous', subject_id: 'sub_9f2c1a' } })],
  ['account subject', sessionRow({ subject: { subject_type: 'account', subject_id: 'sub_9f2c1a' } })],
  ['authority returned a different session id', sessionRow({ session_id: 'sess_other' })]
]) {
  test(`storage refuses a ${name}`, async () => {
    const { handle, repo } = build({ session });
    const result = await handle(request(PRESENTED));
    assert.equal(result.status, 401);
    assert.equal(result.body.error.code, 'unauthenticated');
    assert.equal(await repo.load({ productId: PRODUCT, subjectId: 'sub_9f2c1a' }), null);
  });
}

test('storage refuses when the product link is missing even though the session is live', async () => {
  const { handle, repo } = build({ session: sessionRow(), links: null });
  assert.equal((await handle(request(PRESENTED))).status, 401);
  assert.equal(await repo.load({ productId: PRODUCT, subjectId: 'sub_9f2c1a' }), null);
});

for (const [name, presented] of [['absent credential', null], ['malformed session id', 'sig.sess_!bad'], ['over-long session id', `sig.s${'x'.repeat(200)}`]]) {
  test(`storage refuses ${name}`, async () => {
    const { handle, calls } = build({ session: sessionRow() });
    assert.equal((await handle(request(presented))).status, 401);
    assert.deepEqual(calls, []);
  });
}

for (const [name, behaviour] of [['authority throwing', 'throw'], ['authority reply without the ok envelope', 'garbage'], ['authority never answering', 'hang']]) {
  test(`storage refuses when the authority fails: ${name}`, async () => {
    const { handle, repo } = build({ session: sessionRow(), behaviour, timeoutMs: 25 });
    const result = await handle(request(PRESENTED));
    assert.equal(result.status, 503);
    assert.equal(result.body.error.code, 'auth_unavailable');
    assert.equal(await repo.load({ productId: PRODUCT, subjectId: 'sub_9f2c1a' }), null);
  });
}

test('identity is never taken from the request or from an email claim', async () => {
  const { handle, calls } = build({ session: sessionRow() });
  const result = await handle(request(PRESENTED, {
    headers: { 'x-user-id': 'usr_attacker', 'x-email': 'someone@example.test' }
  }));
  assert.equal(result.status, 200);
  const sent = JSON.stringify(calls);
  assert.doesNotMatch(sent, /usr_attacker|someone@example\.test|x-email/);
});

test('a transport that was never configured keeps refusing', async () => {
  const { unconfiguredAuth } = await import('../server/auth.js');
  const handle = createApiHandler({ authenticate: unconfiguredAuth, service: createWorkspaceService({ repo: createMemoryWorkspaceRepo(), productId: PRODUCT }), productId: PRODUCT });
  assert.equal((await handle(request(PRESENTED))).status, 503);
});

test('the adapter will not open on presentation alone or on another product id', () => {
  assert.throws(() => createPadiemAuthorityAuth({ call: async () => ({}), productId: PRODUCT }), /canonical session id만으로는/);
  assert.throws(() => createPadiemAuthorityAuth({ credential: signedCredential(), productId: PRODUCT }), /transport/);
  assert.throws(() => createPadiemAuthorityAuth({ credential: signedCredential(), call: async () => ({}), readSessionId: fromBearer() }), /LOVETREE_PRODUCT_ID/);
  for (const borrowed of OTHER_REVIEWED_PRODUCTS) {
    assert.throws(() => createPadiemAuthorityAuth({ credential: signedCredential(), call: async () => ({}), productId: borrowed }), /다른 제품의 세션 ID/);
  }
  assert.deepEqual([...OTHER_REVIEWED_PRODUCTS], ['b62', 'b54-padiem-claw']);
  assert.throws(() => fromCookie(''), /쿠키 이름/);
});
