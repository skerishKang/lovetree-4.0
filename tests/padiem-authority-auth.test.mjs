import test from 'node:test';
import assert from 'node:assert/strict';
import { createTree } from '../src/domain.js';
import { ApiError } from '../server/errors.js';
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

function identityFor(sessionId = VALID, overrides = {}) {
  return { sessionId, productId: PRODUCT, subjectId: 'sub_9f2c1a', expiresAt: FUTURE, ...overrides };
}

function makeAuthority({ identity, behaviour } = {}) {
  const calls = [];
  const authority = {
    async resolveIdentity({ sessionId }) {
      calls.push({ sessionId });
      if (behaviour === 'throw') throw new Error('중계 연결 장애');
      if (behaviour === 'reject') throw new ApiError(401, 'unauthenticated', '로그인 확인을 하지 못했어요.');
      if (behaviour === 'echo') return identityFor('sess_somethingelse');
      if (behaviour === 'garbage') return 'not-an-identity';
      return identity ?? identityFor(sessionId);
    }
  };
  return { authority, calls };
}

// 모형 자격 증명 검증자: 발행자 확인을 통과한 제시만 세션 id로 바꾼다.
// B64 머지 경로의 순서(서명 확인 → 세션 확인)를 그대로 닮았다.
function signedCredential({ nonce = 'sig.' } = {}) {
  return {
    async verify(request) {
      const presented = fromBearer()(request) ?? fromCookie('lovetree_session')(request);
      if (typeof presented !== 'string' || !presented.startsWith(nonce)) return null;
      return { sessionId: presented.slice(nonce.length) };
    }
  };
}

function brokenCredential(behaviour = 'null') {
  return {
    async verify() {
      if (behaviour === 'throw') throw new Error('검증자 연결 장애');
      if (behaviour === 'shape') return { sessionId: 'sess_!bad' };
      return null;
    }
  };
}

function build({ productId = PRODUCT, credential = signedCredential(), ...authorityConfig } = {}) {
  const made = makeAuthority(authorityConfig);
  const authenticate = createPadiemAuthorityAuth({ credential, authority: made.authority, productId, now: () => NOW });
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

test('verified credential plus a confirmed identity reaches the storage API', async () => {
  const { handle, repo, calls } = build();
  const saved = await handle(request(PRESENTED));
  assert.equal(saved.status, 200);
  assert.equal(saved.body.revision, 1);
  assert.deepEqual(calls, [{ sessionId: VALID }]);
  assert.equal((await repo.load({ productId: PRODUCT, subjectId: 'sub_9f2c1a' })).revision, 1);
});

test('a tampered credential is refused even with a live session id, and the relay is never called', async () => {
  const { handle, repo, calls } = build();
  const forged = await handle(request(`forged.${VALID}`));
  assert.equal(forged.status, 401);
  assert.equal(forged.body.error.code, 'unauthenticated');
  assert.deepEqual(calls, []);
  assert.equal(await repo.load({ productId: PRODUCT, subjectId: 'sub_9f2c1a' }), null);

  const viaCookie = await handle({ method: 'GET', path: '/api/workspace', headers: { cookie: `lovetree_session=forged.${VALID}` } });
  assert.equal(viaCookie.status, 401);
  assert.deepEqual(calls, []);
});

test('the first-party cookie path also requires the issuer check before any relay call', async () => {
  const { handle, calls } = build();
  const ok = await handle({ method: 'GET', path: '/api/workspace', headers: { cookie: `x=1; lovetree_session=${PRESENTED}` } });
  assert.equal(ok.status, 200);
  assert.equal(calls.length, 1);
});

for (const [name, behaviour] of [['denies', 'null'], ['returns a malformed session id', 'shape'], ['fails to run', 'throw']]) {
  test(`storage refuses when the credential verifier ${name} without contacting the relay`, async () => {
    const { handle, calls } = build({ credential: brokenCredential(behaviour) });
    const result = await handle(request(PRESENTED));
    assert.equal(result.status, behaviour === 'throw' ? 503 : 401);
    assert.deepEqual(calls, []);
  });
}

test('an identity for another product is refused', async () => {
  const { handle, repo } = build({ identity: identityFor(VALID, { productId: 'b62' }) });
  const result = await handle(request(PRESENTED));
  assert.equal(result.status, 401);
  assert.equal(result.body.error.code, 'unauthenticated');
  assert.equal(await repo.load({ productId: PRODUCT, subjectId: 'sub_9f2c1a' }), null);
});

test('an answer about a different session than we asked is treated as a relay failure', async () => {
  const { handle, repo } = build({ behaviour: 'echo' });
  const result = await handle(request(PRESENTED));
  assert.equal(result.status, 503);
  assert.equal(result.body.error.code, 'auth_unavailable');
  assert.equal(await repo.load({ productId: PRODUCT, subjectId: 'sub_9f2c1a' }), null);
});

test('an expired identity is refused even when the relay answered', async () => {
  const { handle } = build({ identity: identityFor(VALID, { expiresAt: PAST }) });
  assert.equal((await handle(request(PRESENTED))).status, 401);
});

for (const [name, config, expected] of [
  ['revoked session', { behaviour: 'reject' }, 401],
  ['unknown session', { behaviour: 'reject' }, 401],
  ['missing product link', { behaviour: 'reject' }, 401],
  ['relay throwing', { behaviour: 'throw' }, 503],
  ['relay answer outside the contract', { behaviour: 'garbage' }, 503]
]) {
  test(`storage refuses the ${name} answer`, async () => {
    const { handle, repo } = build(config);
    const result = await handle(request(PRESENTED));
    assert.equal(result.status, expected);
    assert.equal(await repo.load({ productId: PRODUCT, subjectId: 'sub_9f2c1a' }), null);
  });
}

for (const [name, presented] of [['absent credential', null], ['malformed session id', 'sig.sess_!bad'], ['over-long session id', `sig.s${'x'.repeat(200)}`]]) {
  test(`storage refuses ${name}`, async () => {
    const { handle, calls } = build();
    assert.equal((await handle(request(presented))).status, 401);
    assert.deepEqual(calls, []);
  });
}

test('only the verified session id travels to the relay, never a client-asserted identity', async () => {
  const { handle, calls } = build();
  const result = await handle(request(PRESENTED, { headers: { 'x-user-id': 'usr_attacker', 'x-email': 'someone@example.test' } }));
  assert.equal(result.status, 200);
  assert.deepEqual(calls, [{ sessionId: VALID }]);
  assert.doesNotMatch(JSON.stringify(calls), /usr_attacker|someone@example\.test/);
});

test('a path that was never configured keeps refusing', async () => {
  const { unconfiguredAuth } = await import('../server/auth.js');
  const handle = createApiHandler({ authenticate: unconfiguredAuth, service: createWorkspaceService({ repo: createMemoryWorkspaceRepo(), productId: PRODUCT }), productId: PRODUCT });
  assert.equal((await handle(request(PRESENTED))).status, 503);
});

test('the adapter will not open on presentation alone or on another product id', () => {
  const made = makeAuthority();
  assert.throws(() => createPadiemAuthorityAuth({ authority: made.authority, productId: PRODUCT }), /canonical session id만으로는/);
  assert.throws(() => createPadiemAuthorityAuth({ credential: signedCredential(), productId: PRODUCT }), /resolveIdentity/);
  assert.throws(() => createPadiemAuthorityAuth({ credential: signedCredential(), authority: made.authority }), /LOVETREE_PRODUCT_ID/);
  for (const borrowed of OTHER_REVIEWED_PRODUCTS) {
    assert.throws(() => createPadiemAuthorityAuth({ credential: signedCredential(), authority: made.authority, productId: borrowed }), /다른 제품의 세션 ID/);
  }
  assert.deepEqual([...OTHER_REVIEWED_PRODUCTS], ['b62', 'b54-padiem-claw']);
  assert.throws(() => fromCookie(''), /쿠키 이름/);
});
