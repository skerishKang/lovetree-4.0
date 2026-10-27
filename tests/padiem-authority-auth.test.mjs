import test from 'node:test';
import assert from 'node:assert/strict';
import { createTree } from '../src/domain.js';
import { createApiHandler } from '../server/http.js';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { createPadiemAuthorityAuth } from '../server/padiem-authority-auth.js';
import { fromBearer, fromCookie } from '../server/session-credential.js';

const PRODUCT = 'lovetree-4-0';
const NOW = new Date('2026-10-27T06:00:00.000Z');
const FUTURE = '2026-10-27T08:00:00.000Z';
const PAST = '2026-10-27T05:00:00.000Z';

function sessionRow(overrides = {}) {
  return {
    session_id: 'sess_0123456789abcdef0123456789abcdef',
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
      return session === null ? { ok: false, code: 'auth_session_not_found' } : { ok: true, session };
    }
    if (method === 'resolve_product_user_for_subject') {
      return links === null ? { ok: false, code: 'product_link_missing' } : { ok: true, product_user_id: links ?? 'usr_abc123' };
    }
    return { ok: false, code: 'unknown_method' };
  };
  return { call, calls };
}

function build({ productId = PRODUCT, timeoutMs, read = fromBearer(), ...authority } = {}) {
  const made = makeAuthority(authority);
  const authenticate = createPadiemAuthorityAuth({
    call: made.call, productId, readSessionId: read, now: () => NOW, timeoutMs
  });
  const repo = createMemoryWorkspaceRepo();
  const handle = createApiHandler({ authenticate, service: createWorkspaceService({ repo, productId }), productId });
  return { handle, repo, calls: made.calls };
}

const request = (credential, extra = {}) => ({
  method: 'PUT',
  path: '/api/workspace',
  headers: {
    'content-type': 'application/json',
    ...(credential ? { authorization: `Bearer ${credential}` } : {}),
    ...(extra.headers ?? {})
  },
  body: JSON.stringify({ state: { version: 1, trees: [createTree({ subject: '윤슬', title: '첫 목소리', note: '기억', emotion: '설렘', date: '2026-10-27', url: '' })] }, expectedRevision: 0, clientKey: 'ck-1' })
});

const VALID = 'sess_0123456789abcdef0123456789abcdef';

test('verified LoveTree session reaches the storage API with the authority subject', async () => {
  const { handle, repo, calls } = build({ session: sessionRow() });
  const saved = await handle(request(VALID));
  assert.equal(saved.status, 200);
  assert.equal(saved.body.revision, 1);
  assert.deepEqual(calls.map(c => c.method), ['resolve_auth_session', 'resolve_product_user_for_subject']);
  assert.deepEqual(calls[0].payload, { session_id: VALID });
  assert.deepEqual(calls[1].payload, { product_id: PRODUCT, canonical_subject_id: 'sub_9f2c1a' });
  const stored = await repo.load({ productId: PRODUCT, subjectId: 'sub_9f2c1a' });
  assert.equal(stored.revision, 1);
});

test('the credential can be a first-party cookie when that is the chosen transport', async () => {
  const { handle } = build({ session: sessionRow(), read: fromCookie('lovetree_session') });
  const saved = await handle({
    method: 'GET', path: '/api/workspace',
    headers: { cookie: 'other=1; lovetree_session=sess_0123456789abcdef0123456789abcdef' }
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.revision, 0);
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
    const result = await handle(request(VALID));
    assert.equal(result.status, 401);
    assert.equal(result.body.error.code, 'unauthenticated');
    assert.equal(await repo.load({ productId: PRODUCT, subjectId: 'sub_9f2c1a' }), null);
  });
}

test('storage refuses when the product link is missing even though the session is live', async () => {
  const { handle, repo } = build({ session: sessionRow(), links: null });
  assert.equal((await handle(request(VALID))).status, 401);
  assert.equal(await repo.load({ productId: PRODUCT, subjectId: 'sub_9f2c1a' }), null);
});

for (const [name, credential] of [['absent credential', null], ['malformed session id', 'sess_!bad'], ['over-long session id', `s${'x'.repeat(200)}`]]) {
  test(`storage refuses ${name}`, async () => {
    const { handle, calls } = build({ session: sessionRow() });
    assert.equal((await handle(request(credential))).status, 401);
    assert.deepEqual(calls, []);
  });
}

for (const [name, behaviour] of [['authority throwing', 'throw'], ['authority reply without the ok envelope', 'garbage'], ['authority never answering', 'hang']]) {
  test(`storage refuses when the authority fails: ${name}`, async () => {
    const { handle, repo } = build({ session: sessionRow(), behaviour, timeoutMs: 25 });
    const result = await handle(request(VALID));
    assert.equal(result.status, 503);
    assert.equal(result.body.error.code, 'auth_unavailable');
    assert.equal(await repo.load({ productId: PRODUCT, subjectId: 'sub_9f2c1a' }), null);
  });
}

test('identity is never taken from the request or from an email claim', async () => {
  const { handle, calls } = build({ session: sessionRow() });
  const result = await handle(request(VALID, {
    headers: { 'x-user-id': 'usr_attacker', 'x-email': 'someone@example.test' }
  }));
  assert.equal(result.status, 200);
  const bodies = JSON.stringify(calls);
  assert.doesNotMatch(bodies, /usr_attacker|someone@example\.test|x-email/);
});

test('a transport that was never configured keeps refusing', async () => {
  const { unconfiguredAuth } = await import('../server/auth.js');
  const handle = createApiHandler({ authenticate: unconfiguredAuth, service: createWorkspaceService({ repo: createMemoryWorkspaceRepo(), productId: PRODUCT }), productId: PRODUCT });
  assert.equal((await handle(request(VALID))).status, 503);
});

test('the adapter is built without an authority transport', () => {
  assert.throws(() => createPadiemAuthorityAuth({ productId: PRODUCT, readSessionId: fromBearer() }), /transport/);
  assert.throws(() => createPadiemAuthorityAuth({ call: async () => ({}), readSessionId: fromBearer() }), /LOVETREE_PRODUCT_ID/);
  assert.throws(() => createPadiemAuthorityAuth({ call: async () => ({}), productId: PRODUCT }), /세션 자격 증명/);
  assert.throws(() => fromCookie(''), /쿠키 이름/);
});
