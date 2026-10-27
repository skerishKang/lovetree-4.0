import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { ApiError } from '../server/errors.js';
import { createApiHandler, createNodeHandler } from '../server/http.js';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { unconfiguredAuth } from '../server/auth.js';
import { createAuthorityWriter } from '../server/authority-writer.js';
import { createLoginService } from '../server/login-service.js';
import { createModelControlPlane } from '../server/testing/model-control-plane.js';
import { createCredentialVerifier } from '../server/credentials/lovetree-credential-module.js';
import {
  SESSION_COOKIE,
  SESSION_PURPOSE,
  cookieAttributes,
  isSafeRelativePath,
  mintSessionToken,
  mintStateToken,
  readSessionToken,
  readStateToken
} from '../server/credentials/lovetree-session.js';
import { fromCookie } from '../server/session-credential.js';

const SECRET = 'unit-test-secret';
const PRODUCT = 'lovetree-4-0';
const SID = 'sess_' + 'a'.repeat(32);
const NOW = 1_800_000_000;

const evidence = { productUserId: 'usr_1', authProvider: 'google', providerSubject: 'provider-subject-1' };

test('the credential format is LoveTree-owned and refuses tampering', () => {
  const token = mintSessionToken({ secret: SECRET, canonicalSessionId: SID, now: NOW });
  assert.equal(token.split('.').length, 2);
  assert.deepEqual(readSessionToken({ secret: SECRET, token, now: NOW }), { canonicalSessionId: SID, expiresAt: NOW + 3600 });
  assert.equal(readSessionToken({ secret: SECRET, token: token.slice(0, -2) + 'ab', now: NOW }), null);
  assert.equal(readSessionToken({ secret: 'other-secret', token, now: NOW }), null);
  assert.equal(readSessionToken({ secret: SECRET, token, now: NOW + 3600 }), null);
  assert.equal(readSessionToken({ secret: SECRET, token: 'no-dot', now: NOW }), null);
  assert.throws(() => mintSessionToken({ secret: '', canonicalSessionId: SID }), /비밀/);
  assert.throws(() => mintSessionToken({ secret: SECRET, canonicalSessionId: 'sess_!bad' }), /canonical/);
  assert.equal(SESSION_PURPOSE, 'lovetree-4-0/session/v1');
});

test('a login state only ever carries a same-site relative destination', () => {
  const token = mintStateToken({ secret: SECRET, state: 'a'.repeat(24), next: '/workspace', now: NOW });
  assert.deepEqual(readStateToken({ secret: SECRET, token, now: NOW }), { state: 'a'.repeat(24), next: '/workspace' });
  for (const bad of ['https://evil.example', '//evil.example', '/../../etc', 'workspace', '', null]) {
    assert.throws(() => mintStateToken({ secret: SECRET, state: 'a'.repeat(24), next: bad, now: NOW }), /상대 경로/);
    assert.equal(isSafeRelativePath(bad), false);
  }
  assert.equal(isSafeRelativePath('/workspace'), true);
  assert.equal(readStateToken({ secret: SECRET, token: token + 'x', now: NOW }), null);
  const attrs = cookieAttributes({ secure: true, maxAge: 10 });
  for (const part of ['Path=/', 'Max-Age=10', 'SameSite=lax', 'HttpOnly', 'Secure']) assert.ok(attrs.includes(part));
  assert.ok(!cookieAttributes({ secure: false, httpOnly: false, maxAge: 0 }).includes('Secure'));
});

test('the credential module reads only the presentation it is given', async () => {
  const token = mintSessionToken({ secret: SECRET, canonicalSessionId: SID, now: NOW });
  const verifier = createCredentialVerifier({ env: { LOVETREE_SESSION_SECRET: SECRET }, present: fromCookie(SESSION_COOKIE), now: () => NOW });
  assert.deepEqual(await verifier.verify({ headers: { cookie: `x=1; ${SESSION_COOKIE}=${token}` } }), { sessionId: SID });
  assert.equal(await verifier.verify({ headers: { cookie: `${SESSION_COOKIE}=${token}tampered` } }), null);
  assert.equal(await verifier.verify({ headers: {} }), null);
  assert.throws(() => createCredentialVerifier({ env: {}, present: fromCookie(SESSION_COOKIE) }), /LOVETREE_SESSION_SECRET/);
  assert.throws(() => createCredentialVerifier({ env: { LOVETREE_SESSION_SECRET: SECRET } }), /제시된 자격 증명/);
});

test('the writer refuses evidence that is not server-verified', async () => {
  const plane = createModelControlPlane();
  const writer = createAuthorityWriter({ call: (method, payload) => plane[method](payload), productId: PRODUCT, now: () => new Date(NOW * 1000) });
  for (const bad of [
    {}, null, { productUserId: 'usr_1', authProvider: 'email', providerSubject: 'a@b.test' },
    { productUserId: 'usr_1', authProvider: 'google', providerSubject: '' },
    { productUserId: 'someone-else', authProvider: 'google', providerSubject: 'p' }
  ]) {
    await assert.rejects(() => writer.issue({ evidence: bad }), error => error instanceof ApiError && error.status === 400);
  }
  assert.equal(plane.sessions.size, 0);
});

test('the writer accepts only a session it can tie to its own product and subject', async () => {
  const plane = createModelControlPlane();
  const honest = createAuthorityWriter({ call: (method, payload) => plane[method](payload), productId: PRODUCT, now: () => new Date(NOW * 1000) });
  const issued = await honest.issue({ evidence });
  assert.match(issued.canonicalSessionId, /^sess_/);
  assert.equal(plane.sessions.get(issued.canonicalSessionId).product_id, PRODUCT);
  assert.equal(plane.sessions.get(issued.canonicalSessionId).subject_id, issued.subjectId);

  const liar = createAuthorityWriter({
    call: async (method, payload) => (method === 'establish_auth_session'
      ? { ok: true, session: { session_id: SID, product_id: 'b62', subject: { subject_type: 'user', subject_id: 'sub_x' }, state: 'active', expires_at: new Date(NOW * 1000 + 3600_000).toISOString() } }
      : plane[method](payload)),
    productId: PRODUCT, now: () => new Date(NOW * 1000)
  });
  await assert.rejects(() => liar.issue({ evidence }), error => error.status === 503);

  const unreachable = createAuthorityWriter({ call: async () => { throw new Error('권위 장애'); }, productId: PRODUCT });
  await assert.rejects(() => unreachable.issue({ evidence }), error => error.status === 503);
  assert.throws(() => createAuthorityWriter({ productId: PRODUCT }), /write transport/);
  assert.throws(() => createAuthorityWriter({ call: async () => ({}), productId: 'b62' }), /다른 제품의 세션 ID/);
});

test('the login service refuses to start without its boundaries', () => {
  const plane = createModelControlPlane();
  const writer = createAuthorityWriter({ call: (m, p) => plane[m](p), productId: PRODUCT });
  const provider = { authorizationUrl: () => 'https://login.padiem.test/x', exchangeCode: async () => evidence };
  assert.throws(() => createLoginService({ writer, provider, credentialSecret: SECRET }), /LOVETREE_PRODUCT_ID/);
  assert.throws(() => createLoginService({ productId: PRODUCT, provider, credentialSecret: SECRET }), /발급·폐기 경계/);
  assert.throws(() => createLoginService({ productId: PRODUCT, writer, credentialSecret: SECRET }), /PADIEM 로그인 공급자/);
  assert.throws(() => createLoginService({ productId: PRODUCT, writer, provider, credentialSecret: '' }), /LOVETREE_SESSION_SECRET/);
});

test('login routes refuse a plain-http start address and unknown paths', async () => {  const plane = createModelControlPlane();
  const writer = createAuthorityWriter({ call: (m, p) => plane[m](p), productId: PRODUCT });
  const http = createLoginService({
    productId: PRODUCT, writer, credentialSecret: SECRET,
    provider: { authorizationUrl: () => 'http://login.example/x', exchangeCode: async () => evidence }
  });
  await assert.rejects(() => http.route({ method: 'GET', path: '/auth/login', query: new URLSearchParams(), headers: {} }), error => error.status === 503);

  const https = createLoginService({
    productId: PRODUCT, writer, credentialSecret: SECRET,
    provider: { authorizationUrl: ({ state }) => `https://login.padiem.test/x?state=${state}`, exchangeCode: async () => evidence }
  });
  const begun = await https.route({ method: 'GET', path: '/auth/login', query: new URLSearchParams(), headers: {} });
  assert.equal(begun.status, 302);
  assert.match(begun.headers.location, /^https:\/\/login\.padiem\.test\/x\?state=[A-Za-z0-9_-]{16,}$/);
  assert.equal(begun.headers['cache-control'], 'no-store');
  await assert.rejects(() => https.route({ method: 'GET', path: '/auth/nope', headers: {} }), error => error.status === 404);
  await assert.rejects(() => https.route({ method: 'POST', path: '/auth/login', headers: {} }), error => error.status === 405);
  await assert.rejects(() => https.route({ method: 'GET', path: '/auth/logout', headers: {} }), error => error.status === 405);
});

test('the node handler carries redirect and cookie headers out to the socket', async () => {
  const composed = async (request) => request.path.startsWith('/auth/')
    ? { status: 302, headers: { location: 'https://login.padiem.test/start', 'set-cookie': [`${SESSION_COOKIE}=x; Path=/; HttpOnly`] }, body: undefined }
    : await createApiHandler({
      authenticate: unconfiguredAuth,
      service: createWorkspaceService({ repo: createMemoryWorkspaceRepo(), productId: PRODUCT }),
      productId: PRODUCT
    })(request);

  const server = createServer(createNodeHandler(composed));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    // fetch는 302를 따라가므로 원시 요청으로 헤더를 읽는다.
    const raw = (path) => new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: server.address().port, path, method: 'GET' }, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      });
      req.on('error', reject);
      req.end();
    });

    const redirect = await raw('/auth/login?next=/workspace');
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.location, 'https://login.padiem.test/start');
    assert.match(String(redirect.headers['set-cookie']), /HttpOnly/);

    const refused = await raw('/api/workspace');
    assert.equal(refused.status, 503);
    assert.equal(JSON.parse(refused.body).error.code, 'auth_unavailable');
    assert.equal(refused.headers['cache-control'], 'no-store');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
