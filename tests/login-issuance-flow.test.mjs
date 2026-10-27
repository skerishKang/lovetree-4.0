import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createTree } from '../src/domain.js';
import { ApiError } from '../server/errors.js';
import { createApiHandler } from '../server/http.js';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { createPadiemAuthorityAuth } from '../server/padiem-authority-auth.js';
import { createAuthorityRelayClient } from '../server/authority-relay-transport.js';
import { fromCookie } from '../server/session-credential.js';
import { createModelControlPlane } from '../server/testing/model-control-plane.js';
import { createAuthorityWriter } from '../server/authority-writer.js';
import { createLoginService } from '../server/login-service.js';
import { createCredentialVerifier } from '../server/credentials/lovetree-credential-module.js';
import { SESSION_COOKIE, STATE_COOKIE, mintSessionToken, readSessionToken, readStateToken } from '../server/credentials/lovetree-session.js';

/**
 * 한 흐름 검증: 로그인 증거 확인 → 러브트리 전용 세션 발급 → 저장 → 조회 →
 * 로그아웃(브라우저 자격 증명 제거 + 서버 세션 폐기) → 같은 자격 증명 재사용 거부.
 *
 * 저장 API → HTTP transport → **실제 중계 Worker 모듈**(`skerishKang/ai-revenue-lab#5965` 파일) →
 * 모형 Control Plane. 발급은 같은 모형 권위에 직접 쓴다 — 운영 쓰기 경로는 아직 없고,
 * 읽기 전용 중계 #5965에 쓰기를 추가하지 않기 때문이다.
 * 중계 모듈 경로를 주지 않으면 스킵한다. 스킵 상태에서 연결 완료라고 쓰지 않는다.
 */
const RELAY_WORKER = process.env.LOVETREE_RELAY_WORKER ?? '';
const skip = RELAY_WORKER ? false : '중계 Worker 경로(LOVETREE_RELAY_WORKER)가 지정되지 않았습니다. 이 흐름 검증은 미수행입니다.';

const PRODUCT = 'lovetree-4-0';
const CREDENTIAL_SECRET = 'lovetree-session-secret-for-tests';
const CALLER_SECRET = 'caller-secret-for-tests';
const USER = 'usr_lovetree_1';
// 실제 시계를 기준으로 삼는다: 고정 시각을 쓰면 검증 시점에 세션이 이미 만료돼 이유가 흐려진다.
const AT = new Date();
const epoch = () => Math.floor(AT.getTime() / 1000);

// 저장 API와 달리 로그인 라우는 ApiError를 던진다. 응답 형태로 고르게 담아 비교한다.
async function settle(promise) {
  try { return await promise; }
  catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { status: error.status, body: { error: { code: error.code, message: error.message, ...(error.details ?? {}) } }, headers: undefined };
  }
}

function cookieValue(header, name) {
  for (const part of String(header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return null;
}

async function start({ plane = createModelControlPlane() } = {}) {
  const worker = await import(pathToFileURL(RELAY_WORKER).href);
  const relay = createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      const reply = await worker.handleRequest(new Request(`http://127.0.0.1${req.url}`, {
        method: req.method,
        headers: { 'content-type': req.headers['content-type'] ?? 'application/json', ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) },
        body: req.method === 'POST' ? Buffer.concat(chunks).toString('utf8') : undefined
      }), { LOVETREE_CALLER_SECRET: CALLER_SECRET, IDENTITY_AUTHORITY: plane });
      res.writeHead(reply.status, { 'content-type': 'application/json' });
      res.end(await reply.text());
    });
  });
  await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve));
  return { plane, origin: `http://127.0.0.1:${relay.address().port}`, close: () => new Promise(resolve => relay.close(resolve)) };
}

function wired({ plane, origin, callerSecret = CALLER_SECRET }) {
  const at = AT;
  const writer = createAuthorityWriter({ call: (method, payload) => plane[method](payload), productId: PRODUCT, now: () => at });
  const provider = {
    authorizationUrl: ({ state }) => `https://login.padiem.test/oauth/start?state=${state}`,
    exchangeCode: async ({ code }) => {
      if (code !== 'verified-code') throw new ApiError(401, 'invalid_login_evidence', '로그인 확인을 하지 못했어요.');
      return { productUserId: USER, authProvider: 'google', providerSubject: '10881234567890' };
    }
  };
  const login = createLoginService({ productId: PRODUCT, writer, provider, credentialSecret: CREDENTIAL_SECRET, now: () => at });
  const repo = createMemoryWorkspaceRepo();
  const authenticate = createPadiemAuthorityAuth({
    credential: createCredentialVerifier({ env: { LOVETREE_SESSION_SECRET: CREDENTIAL_SECRET }, present: fromCookie(SESSION_COOKIE), now: epoch }),
    productId: PRODUCT,
    authority: createAuthorityRelayClient({ url: `${origin}/resolve-session`, callerSecret, fetchImpl: globalThis.fetch })
  });
  const storage = createApiHandler({ authenticate, service: createWorkspaceService({ repo, productId: PRODUCT }), productId: PRODUCT });
  return { login, storage, repo };
}

const statePayload = { version: 1, trees: [createTree({ subject: '윤슬', title: '첫 목소리', note: '기억', emotion: '설렘', date: '2026-10-27', url: '' })] };

const save = (storage, sessionCookie, clientKey = 'ck-1') => storage({
  method: 'PUT', path: '/api/workspace',
  headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE}=${sessionCookie}` },
  body: JSON.stringify({ state: statePayload, expectedRevision: 0, clientKey })
});
const read = (storage, sessionCookie) => storage({ method: 'GET', path: '/api/workspace', headers: { cookie: `${SESSION_COOKIE}=${sessionCookie}` } });

async function begin(login, next = '/workspace') {
  const begun = await login.route({ method: 'GET', path: '/auth/login', query: new URLSearchParams({ next }), headers: {} });
  const stateCookie = cookieValue(begun.headers['set-cookie'][0], STATE_COOKIE);
  return { begun, stateCookie, state: readStateToken({ secret: CREDENTIAL_SECRET, token: stateCookie, now: epoch() }) };
}

async function loginOnce({ login }) {
  const { stateCookie, state } = await begin(login);
  const back = await login.route({
    method: 'GET', path: '/auth/callback',
    query: new URLSearchParams({ code: 'verified-code', state: state.state }),
    headers: { cookie: `${STATE_COOKIE}=${stateCookie}` }
  });
  const sessionCookie = cookieValue(back.headers['set-cookie'][0], SESSION_COOKIE);
  return { back, sessionCookie, sid: readSessionToken({ secret: CREDENTIAL_SECRET, token: sessionCookie, now: epoch() })?.canonicalSessionId };
}

test('issue → save → read → logout → reuse refused, through the real relay', { skip }, async () => {
  const launched = await start();
  try {
    const { login, storage } = wired({ plane: launched.plane, origin: launched.origin });
    const { back, sessionCookie, sid } = await loginOnce({ login });
    assert.equal(back.status, 302);
    assert.equal(back.headers.location, '/workspace');
    assert.match(sid ?? '', /^sess_/);
    assert.equal(back.headers['set-cookie'][1].startsWith(`${STATE_COOKIE}=;`), true);
    assert.match(back.headers['set-cookie'][0], /HttpOnly/);
    assert.match(back.headers['set-cookie'][0], /SameSite=lax/);

    assert.equal((await save(storage, sessionCookie)).status, 200);
    const readBack = await read(storage, sessionCookie);
    assert.equal(readBack.status, 200);
    assert.deepEqual(readBack.body.state.trees[0].moments.map(m => m.id), statePayload.trees[0].moments.map(m => m.id));

    const out = await login.route({ method: 'POST', path: '/auth/logout', headers: { cookie: `${SESSION_COOKIE}=${sessionCookie}` } });
    assert.equal(out.status, 200);
    assert.equal(cookieValue(out.headers['set-cookie'][0], SESSION_COOKIE), '');
    assert.equal(launched.plane.sessions.get(sid).state, 'revoked');

    const reused = await read(storage, sessionCookie);
    assert.equal(reused.status, 401);
    assert.equal(reused.body.error.code, 'unauthenticated');
  } finally { await launched.close(); }
});

test('a forged callback state issues nothing', { skip }, async () => {
  const launched = await start();
  try {
    const { login } = wired({ plane: launched.plane, origin: launched.origin });
    const { stateCookie } = await begin(login);
    const forged = await settle(login.route({
      method: 'GET', path: '/auth/callback',
      query: new URLSearchParams({ code: 'verified-code', state: 'attacker-state-000000000000' }),
      headers: { cookie: `${STATE_COOKIE}=${stateCookie}` }
    }));
    assert.equal(forged.status, 401);
    assert.equal(forged.body.error.code, 'invalid_login_state');
    assert.equal(forged.headers, undefined);
    assert.equal(launched.plane.sessions.size, 0);
  } finally { await launched.close(); }
});

test('a replayed callback is refused and an external destination is never followed', { skip }, async () => {
  const launched = await start();
  try {
    const { login } = wired({ plane: launched.plane, origin: launched.origin });
    const { stateCookie, state } = await begin(login, 'https://evil.example/steal');
    assert.equal(state.next, '/workspace');
    const request = { method: 'GET', path: '/auth/callback', query: new URLSearchParams({ code: 'verified-code', state: state.state }), headers: { cookie: `${STATE_COOKIE}=${stateCookie}` } };
    assert.equal((await login.route(request)).status, 302);
    const replay = await settle(login.route(request));
    assert.equal(replay.status, 401);
    assert.equal(replay.body.error.code, 'login_state_replayed');
  } finally { await launched.close(); }
});

test('an unverified login code issues nothing', { skip }, async () => {
  const launched = await start();
  try {
    const { login } = wired({ plane: launched.plane, origin: launched.origin });
    const { stateCookie, state } = await begin(login);
    const refused = await settle(login.route({ method: 'GET', path: '/auth/callback', query: new URLSearchParams({ code: 'not-verified', state: state.state }), headers: { cookie: `${STATE_COOKIE}=${stateCookie}` } }));
    assert.equal(refused.status, 401);
    assert.equal(refused.body.error.code, 'invalid_login_evidence');
    assert.equal(launched.plane.sessions.size, 0);
  } finally { await launched.close(); }
});

test('evidence that is only an email, or an unknown provider, never mints', { skip }, async () => {
  const launched = await start();
  try {
    const writer = createAuthorityWriter({ call: (method, payload) => launched.plane[method](payload), productId: PRODUCT });
    for (const evidence of [
      { productUserId: USER, authProvider: 'email', providerSubject: 'someone@example.test' },
      { productUserId: USER, authProvider: 'google' },
      { productUserId: 'attacker', authProvider: 'google', providerSubject: 'sub-1' },
      {}
    ]) {
      const refused = await settle(writer.issue({ evidence }));
      assert.equal(refused.status ?? 'thrown', 400);
    }
    assert.equal(launched.plane.sessions.size, 0);
  } finally { await launched.close(); }
});

test('a session minted for another product cannot open LoveTree storage', { skip }, async () => {
  const launched = await start();
  try {
    const { login, storage } = wired({ plane: launched.plane, origin: launched.origin });
    const { sid } = await loginOnce({ login });
    const link = await launched.plane.resolve_or_create_product_link({ product_id: 'b62', product_user_id: 'usr_chat', auth_provider: 'google', provider_subject: '10881234567890' });
    const stranger = await launched.plane.establish_auth_session({
      product_id: 'b62',
      subject: { subject_type: 'user', subject_id: link.link.canonical_subject_id },
      authenticated_at: AT.toISOString(),
      not_after: '2999-01-01T00:00:00.000Z'
    });
    assert.equal(stranger.ok, true);
    const borrowed = mintSessionToken({ secret: CREDENTIAL_SECRET, canonicalSessionId: stranger.session.session_id, now: epoch() });
    assert.equal((await read(storage, borrowed)).status, 401, '다른 제품 세션을 감춘 자격 증명은 저장을 열지 않는다');
    assert.equal((await read(storage, mintSessionToken({ secret: CREDENTIAL_SECRET, canonicalSessionId: sid, now: epoch() }))).status, 200);
  } finally { await launched.close(); }
});

test('logout that cannot revoke keeps the credential instead of pretending', { skip }, async () => {
  const launched = await start();
  try {
    const { login } = wired({ plane: launched.plane, origin: launched.origin });
    const { sessionCookie } = await loginOnce({ login });
    const failing = createLoginService({
      productId: PRODUCT,
      writer: createAuthorityWriter({ call: async () => { throw new Error('권위 장애'); }, productId: PRODUCT }),
      provider: { authorizationUrl: () => 'https://login.padiem.test/x', exchangeCode: async () => ({}) },
      credentialSecret: CREDENTIAL_SECRET, now: () => AT
    });
    const refused = await settle(failing.route({ method: 'POST', path: '/auth/logout', headers: { cookie: `${SESSION_COOKIE}=${sessionCookie}` } }));
    assert.equal(refused.status, 503);
    assert.equal(refused.headers, undefined);
    assert.equal(launched.plane.sessions.get(readSessionToken({ secret: CREDENTIAL_SECRET, token: sessionCookie, now: epoch() }).canonicalSessionId).state, 'active');

    const alreadyGone = await failing.route({ method: 'POST', path: '/auth/logout', headers: { cookie: `${SESSION_COOKIE}=forged-value` } });
    assert.equal(alreadyGone.status, 200);
    assert.equal(cookieValue(alreadyGone.headers['set-cookie'][0], SESSION_COOKIE), '');
  } finally { await launched.close(); }
});

test('an expired credential is refused before any relay call', { skip }, async () => {
  const launched = await start();
  try {
    const early = AT;
    const writer = createAuthorityWriter({ call: (method, payload) => launched.plane[method](payload), productId: PRODUCT, now: () => early });
    const login = createLoginService({
      productId: PRODUCT, writer,
      provider: { authorizationUrl: () => 'https://login.padiem.test/x', exchangeCode: async () => ({ productUserId: USER, authProvider: 'google', providerSubject: 'p-2' }) },
      credentialSecret: CREDENTIAL_SECRET, sessionMaxAgeSeconds: 60, now: () => early
    });
    const { sessionCookie } = await loginOnce({ login });
    const late = createPadiemAuthorityAuth({
      credential: createCredentialVerifier({ env: { LOVETREE_SESSION_SECRET: CREDENTIAL_SECRET }, present: fromCookie(SESSION_COOKIE), now: () => Math.floor(AT.getTime() / 1000) + 120 }),
      productId: PRODUCT,
      authority: createAuthorityRelayClient({ url: `${launched.origin}/resolve-session`, callerSecret: CALLER_SECRET })
    });
    const repo = createMemoryWorkspaceRepo();
    const storage = createApiHandler({ authenticate: late, service: createWorkspaceService({ repo, productId: PRODUCT }), productId: PRODUCT });
    assert.equal((await read(storage, sessionCookie)).status, 401);

    const stillValid = createPadiemAuthorityAuth({
      credential: createCredentialVerifier({ env: { LOVETREE_SESSION_SECRET: CREDENTIAL_SECRET }, present: fromCookie(SESSION_COOKIE), now: () => Math.floor(AT.getTime() / 1000) + 30 }),
      productId: PRODUCT,
      authority: createAuthorityRelayClient({ url: `${launched.origin}/resolve-session`, callerSecret: CALLER_SECRET })
    });
    const validStorage = createApiHandler({ authenticate: stillValid, service: createWorkspaceService({ repo, productId: PRODUCT }), productId: PRODUCT });
    assert.equal((await save(validStorage, sessionCookie)).status, 200);
    assert.equal((await read(validStorage, sessionCookie)).status, 200);
    const issued = launched.plane.sessions.get(readSessionToken({ secret: CREDENTIAL_SECRET, token: sessionCookie, now: epoch() }).canonicalSessionId);
    assert.equal((await repo.load({ productId: PRODUCT, subjectId: issued.subject_id })).revision, 1);
  } finally { await launched.close(); }
});
