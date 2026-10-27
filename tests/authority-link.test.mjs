import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createTree } from '../src/domain.js';
import { createApiHandler } from '../server/http.js';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { createPadiemAuthorityAuth } from '../server/padiem-authority-auth.js';
import { createAuthorityRelayClient } from '../server/authority-relay-transport.js';
import { fromBearer, fromCookie } from '../server/session-credential.js';

/**
 * 실제 연결 흐름 검증: 러브트리 저장 API → HTTP transport → 중계 Worker 모듈 → 모형 Control Plane.
 * 중계 Worker는 `skerishKang/ai-revenue-lab#5965`의 그 파일 자체를 경로를 지정해 불러온다
 * (이 저장소에 사본을 두지 않는다). 경로를 주지 않으면 스킵하고, 스킵된 상태에서
 * "연결 완료"라고 쓰지 않는다. 모형 Control Plane은 확인된 RPC 두 개
 * (`resolve_auth_session`, `resolve_product_user_for_subject`)만 제공한다.
 */
const RELAY_WORKER = process.env.LOVETREE_RELAY_WORKER ?? '';
const skip = RELAY_WORKER ? false : '중계 Worker 경로(LOVETREE_RELAY_WORKER)가 지정되지 않았습니다. 이 파일의 연결 검증은 미수행입니다.';

const PRODUCT = 'lovetree-4-0';
const SECRET = 'caller-secret-value';
const SID = 'sess_0123456789abcdef0123456789abcdef';
const SUBJECT = 'sub_9f2c1a';
const FUTURE = '2999-01-01T00:00:00.000Z';
const PAST = '2000-01-01T00:00:00.000Z';

function modelControlPlane(rows = {}) {
  return {
    async resolve_auth_session({ session_id }) {
      if (rows.unreachable) throw new Error('권위 장애');
      return { ok: true, session: rows.session ?? {
        session_id, product_id: PRODUCT, subject: { subject_type: 'user', subject_id: SUBJECT }, state: 'active', expires_at: FUTURE
      } };
    },
    async resolve_product_user_for_subject() {
      return rows.linkMissing ? { ok: false, error: { code: 'canonical_product_identity_link_not_active' } } : { ok: true, product_user_id: 'usr_abc' };
    }
  };
}

async function start({ rows = {}, callerSecret = SECRET, delay = 0 } = {}) {
  const worker = await import(pathToFileURL(RELAY_WORKER).href);
  let requests = 0;
  const relay = createServer((req, res) => {
    requests += 1;
    const body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', async () => {
      const reply = await worker.handleRequest(new Request(`http://127.0.0.1${req.url}`, {
        method: req.method, headers: { 'content-type': req.headers['content-type'] ?? '', ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) },
        body: req.method === 'POST' ? Buffer.concat(body).toString('utf8') : undefined
      }), { LOVETREE_CALLER_SECRET: callerSecret, IDENTITY_AUTHORITY: modelControlPlane(rows) });
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      res.writeHead(reply.status, { 'content-type': 'application/json' });
      res.end(await reply.text());
    });
  });
  await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve));
  const port = relay.address().port;
  return {
    port,
    requests: () => requests,
    close: () => new Promise(resolve => relay.close(resolve))
  };
}

function signedCredential({ nonce = 'sig.' } = {}) {
  return {
    async verify(request) {
      const presented = fromBearer()(request) ?? fromCookie('lovetree_session')(request);
      if (typeof presented !== 'string' || !presented.startsWith(nonce)) return null;
      return { sessionId: presented.slice(nonce.length) };
    }
  };
}

async function storage({ port, callerSecret = SECRET, timeoutMs }) {
  const authority = createAuthorityRelayClient({ url: `http://127.0.0.1:${port}/resolve-session`, callerSecret, timeoutMs });
  const productId = PRODUCT;
  const authenticate = createPadiemAuthorityAuth({ credential: signedCredential(), authority, productId });
  const repo = createMemoryWorkspaceRepo();
  return { handle: createApiHandler({ authenticate, service: createWorkspaceService({ repo, productId }), productId }), repo };
}

const statePayload = { version: 1, trees: [createTree({ subject: '윤슬', title: '첫 목소리', note: '기억', emotion: '설렘', date: '2026-10-27', url: '' })] };

const save = (handle, credential) => handle({
  method: 'PUT', path: '/api/workspace',
  headers: { 'content-type': 'application/json', ...(credential ? { authorization: `Bearer ${credential}` } : {}) },
  body: JSON.stringify({ state: statePayload, expectedRevision: 0, clientKey: 'ck-1' })
});

test('one flow: storage API over HTTP through the real relay worker to a model Control Plane', { skip }, async () => {
  const relay = await start();
  try {
    const { handle, repo } = await storage({ port: relay.port });
    const saved = await save(handle, `sig.${SID}`);
    assert.equal(saved.status, 200);
    assert.equal(saved.body.revision, 1);
    assert.equal(relay.requests(), 1);
    const stored = await repo.load({ productId: PRODUCT, subjectId: SUBJECT });
    assert.equal(stored.revision, 1);
    assert.deepEqual(stored.doc.trees[0].moments.map(m => m.id), statePayload.trees[0].moments.map(m => m.id));
  } finally { await relay.close(); }
});

test('a tampered credential never reaches the relay', { skip }, async () => {
  const relay = await start();
  try {
    const { handle, repo } = await storage({ port: relay.port });
    const forged = await save(handle, `forged.${SID}`);
    assert.equal(forged.status, 401);
    assert.equal(forged.body.error.code, 'unauthenticated');
    assert.equal(relay.requests(), 0);
    assert.equal(await repo.load({ productId: PRODUCT, subjectId: SUBJECT }), null);
  } finally { await relay.close(); }
});

for (const [name, rows, expected] of [
  ['a b62 session', { session: { session_id: SID, product_id: 'b62', subject: { subject_type: 'user', subject_id: SUBJECT }, state: 'active', expires_at: FUTURE } }, 401],
  ['an expired session', { session: { session_id: SID, product_id: PRODUCT, subject: { subject_type: 'user', subject_id: SUBJECT }, state: 'active', expires_at: PAST } }, 401],
  ['a revoked session', { session: { session_id: SID, product_id: PRODUCT, subject: { subject_type: 'user', subject_id: SUBJECT }, state: 'revoked', expires_at: FUTURE } }, 401],
  ['an anonymous subject', { session: { session_id: SID, product_id: PRODUCT, subject: { subject_type: 'anonymous', subject_id: SUBJECT }, state: 'active', expires_at: FUTURE } }, 401],
  ['a missing product link', { linkMissing: true }, 401],
  ['an unreachable authority', { unreachable: true }, 503]
]) {
  test(`the connected chain refuses ${name}`, { skip }, async () => {
    const relay = await start({ rows });
    try {
      const { handle, repo } = await storage({ port: relay.port });
      const result = await save(handle, `sig.${SID}`);
      assert.equal(result.status, expected);
      assert.equal(await repo.load({ productId: PRODUCT, subjectId: SUBJECT }), null);
      if (expected === 401) assert.equal(result.body.error.code, 'unauthenticated');
      else assert.equal(result.body.error.code, 'auth_unavailable');
    } finally { await relay.close(); }
  });
}

test('a wrong caller secret refuses storage and never surfaces the secret', { skip }, async () => {
  const relay = await start();
  try {
    const { handle } = await storage({ port: relay.port, callerSecret: 'wrong-secret' });
    const result = await save(handle, `sig.${SID}`);
    assert.equal(result.status, 503);
    assert.equal(result.body.error.code, 'auth_unavailable');
    assert.equal(JSON.stringify(result.body).includes('wrong-secret'), false);
    assert.equal(JSON.stringify(result.body).includes(SECRET), false);
    assert.equal(relay.requests(), 1);
  } finally { await relay.close(); }
});

test('a slow relay is cancelled at the deadline and refuses storage', { skip }, async () => {
  const relay = await start({ delay: 300 });
  try {
    const { handle, repo } = await storage({ port: relay.port, timeoutMs: 40 });
    const result = await save(handle, `sig.${SID}`);
    assert.equal(result.status, 503);
    assert.equal(result.body.error.code, 'auth_unavailable');
    assert.equal(await repo.load({ productId: PRODUCT, subjectId: SUBJECT }), null);
  } finally { await relay.close(); }
});

test('the relay is not opened for an unset credential either', { skip }, async () => {
  const relay = await start();
  try {
    const { handle } = await storage({ port: relay.port });
    assert.equal((await save(handle, null)).status, 401);
    assert.equal(relay.requests(), 0);
  } finally { await relay.close(); }
});
