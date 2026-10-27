import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createTree } from '../src/domain.js';
import { ApiError } from '../server/errors.js';
import { createApiHandler } from '../server/http.js';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { createPadiemAuthorityAuth } from '../server/padiem-authority-auth.js';
import { createAuthorityRelayClient } from '../server/authority-relay-transport.js';
import { createHandoffMintClient } from '../server/handoff-mint-client.js';
import { createAuthorityWriter } from '../server/authority-writer.js';
import { createLoginService } from '../server/login-service.js';
import { createLoginProvider } from '../server/padiem-login-provider.js';
import { createMemoryLoginStateStore } from '../server/login-state-store.js';
import { createModelControlPlane } from '../server/testing/model-control-plane.js';
import { createCredentialVerifier } from '../server/credentials/lovetree-credential-module.js';
import { SESSION_COOKIE, STATE_COOKIE, readSessionToken, readStateToken } from '../server/credentials/lovetree-session.js';
import { fromCookie } from '../server/session-credential.js';

/**
 * 로그인 증거 → 1회용 handoff 표 → 러브트리 전용 세션 발급 → 저장 → 조회 → 로그아웃 → 재사용 거부.
 *
 * 확인(읽기) 경로는 `skerishKang/ai-revenue-lab#5965`의 실제 중계 Worker 모듈을 불러 붙인다.
 * 발급(mint) 경로는 #5977이 정한 HTTP 계약(`/mint-session`, 표 하나만 받는다)을 그대로 따르는
 * 로컬 서버이고, 그 서버는 **같은 모형 Control Plane**에 링크·세션을 남긴다 — 그래서 발급된
 * 세션이 읽기 경로에서 확인되고 로그아웃에서 실제로 폐기된다.
 * 중계 경로를 주지 않으면 스킵한다. 스킵된 상태에서 연결 완료라고 쓰지 않는다.
 */
const RELAY_WORKER = process.env.LOVETREE_RELAY_WORKER ?? '';
const skip = RELAY_WORKER ? false : '중계 Worker 경로(LOVETREE_RELAY_WORKER)가 지정되지 않았습니다. 이 흐름 검증은 미수행입니다.';

const PRODUCT = 'lovetree-4-0';
const CREDENTIAL_SECRET = 'lovetree-session-secret-for-tests';
const CALLER_SECRET = 'caller-secret-for-tests';
const USER = 'usr_lovetree_1';
const PROVIDER_SUBJECT = 'provider-subject-1';
const AT = new Date();
const epoch = () => Math.floor(AT.getTime() / 1000);
const TICKET = 'lovt_0123456789abcdefABCDEFGH';

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

const sidOf = (token) => readSessionToken({ secret: CREDENTIAL_SECRET, token, now: epoch() })?.canonicalSessionId;
const sha256Hex = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

/** PADIEM 인증 서버 쪽 발급: 표를 확인하고 같은 권위에 링크·세션을 남긴다. */
async function startMint({ plane, tickets = new Map(), behaviour = 'ok' } = {}) {
  const claimed = new Set();
  const seen = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      const reply = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (behaviour === 'throw') { res.destroy(); return; }
      if ((req.headers.authorization ?? '') !== `Bearer ${CALLER_SECRET}`) return reply(401, { ok: false, error: { code: 'unauthorized' } });
      if (req.url !== '/mint-session') return reply(404, { ok: false, error: { code: 'not_found' } });
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      seen.push(body);
      if (behaviour === 'closed') return reply(501, { ok: false, error: { code: 'mint_policy_undecided' } });
      const ticket = body.handoff_ticket;
      const digest = body.login_request_sha256;
      if (Object.keys(body).length !== 2 || typeof ticket !== 'string' || typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) {
        return reply(400, { ok: false, error: { code: 'invalid_request' } });
      }
      const bound = tickets.get(ticket);
      if (!bound) return reply(401, { ok: false, error: { code: 'invalid_handoff' } });
      // 자기를 만든 로그인 요청이 아니면 표를 소비하지 않는다(거부는 비소비).
      if (bound.loginState && digest !== sha256Hex(bound.loginState)) {
        return reply(401, { ok: false, error: { code: 'login_request_mismatch' } });
      }
      if (claimed.has(ticket)) return reply(401, { ok: false, error: { code: 'handoff_consumed' } });
      if (bound.productId && bound.productId !== PRODUCT) return reply(401, { ok: false, error: { code: 'invalid_handoff' } });
      if (bound.expired) return reply(401, { ok: false, error: { code: 'handoff_expired' } });

      const linked = await plane.resolve_or_create_product_link({
        product_id: PRODUCT,
        product_user_id: bound.productUserId ?? USER,
        auth_provider: bound.authProvider ?? 'google',
        provider_subject: bound.providerSubject ?? PROVIDER_SUBJECT
      });
      if (!linked.ok) return reply(401, { ok: false, error: { code: 'session_not_minted' } });
      const established = await plane.establish_auth_session({
        product_id: PRODUCT,
        subject: { subject_type: 'user', subject_id: linked.link.canonical_subject_id },
        authenticated_at: AT.toISOString(),
        not_after: new Date(AT.getTime() + 3600_000).toISOString()
      });
      if (!established.ok) return reply(401, { ok: false, error: { code: 'session_not_minted' } });
      claimed.add(ticket);
      // 'liar'는 발급 서버가 다른 제품의 세션을 돌려주는 경우다. 수신자 확인은 이 쪽에서 한다.
      const issuedProduct = behaviour === 'liar' ? 'b62' : PRODUCT;
      // 중계 응답은 발급 사실과 식별자만 담는다(#5977 후속 계약) — 표의 신원은 지나오지 않는다.
      return reply(200, {
        ok: true,
        session: {
          session_id: established.session.session_id,
          product_id: issuedProduct,
          subject_id: established.session.subject.subject_id,
          expires_at: established.session.expires_at
        }
      });
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, claimed, seen, tickets, url: `http://127.0.0.1:${server.address().port}/mint-session`, close: () => new Promise(resolve => server.close(resolve)) };
}

async function startRead({ plane } = {}) {
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
  return { origin: `http://127.0.0.1:${relay.address().port}`, close: () => new Promise(resolve => relay.close(resolve)) };
}

// 러브트리 서비스 인스턴스 하나. 발급은 표로, 폐기는 권위 RPC로 간다.
// 공급자는 배포가 실제로 물리는 `server/padiem-login-provider.js`를 기본으로 쓴다.
function realProvider() {
  return createLoginProvider({
    env: {
      LOVETREE_PADIEM_HANDOFF_START_URL: 'https://chat.example.test/auth/lovetree/start',
      LOVETREE_PUBLIC_ORIGIN: 'https://lovetree-4-0.pages.dev'
    },
    productId: PRODUCT
  });
}

async function instance({ plane, read, mint, stateStore = createMemoryLoginStateStore(), provider = realProvider() } = {}) {
  const writer = createAuthorityWriter({
    call: async (method, payload) => {
      if (method !== 'revoke_auth_session') throw new Error(`handoff 경로에서 링크·발급 RPC를 직접 부르지 않는다: ${method}`);
      return plane[method](payload);
    },
    productId: PRODUCT,
    mint: createHandoffMintClient({ url: mint.url, callerSecret: CALLER_SECRET, productId: PRODUCT, now: () => AT })
  });
  const login = createLoginService({ productId: PRODUCT, writer, provider, credentialSecret: CREDENTIAL_SECRET, stateStore, now: () => AT });
  const repo = createMemoryWorkspaceRepo();
  const authenticate = createPadiemAuthorityAuth({
    productId: PRODUCT,
    credential: createCredentialVerifier({ env: { LOVETREE_SESSION_SECRET: CREDENTIAL_SECRET }, present: fromCookie(SESSION_COOKIE), now: epoch }),
    authority: createAuthorityRelayClient({ url: `${read.origin}/resolve-session`, callerSecret: CALLER_SECRET, fetchImpl: globalThis.fetch })
  });
  const storage = createApiHandler({ authenticate, service: createWorkspaceService({ repo, productId: PRODUCT }), productId: PRODUCT });
  return { login, storage, repo, stateStore };
}

const statePayload = { version: 1, trees: [createTree({ subject: '윤슬', title: '첫 목소리', note: '기억', emotion: '설렘', date: '2026-10-27', url: '' })] };

const save = (storage, credential, clientKey = 'ck-1') => storage({
  method: 'PUT', path: '/api/workspace',
  headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE}=${credential}` },
  body: JSON.stringify({ state: statePayload, expectedRevision: 0, clientKey })
});
const readDoc = (storage, credential) => storage({ method: 'GET', path: '/api/workspace', headers: { cookie: `${SESSION_COOKIE}=${credential}` } });

async function begin(login, next) {
  const query = next === undefined ? new URLSearchParams() : new URLSearchParams({ next });
  const begun = await login.route({ method: 'GET', path: '/auth/login', query, headers: {} });
  const stateCookie = cookieValue(begun.headers['set-cookie'][0], STATE_COOKIE);
  return { stateCookie, state: readStateToken({ secret: CREDENTIAL_SECRET, token: stateCookie, now: epoch() }) };
}

const exchange = ({ login, stateCookie, state, code = TICKET }) => settle(login.route({
  method: 'GET', path: '/auth/callback',
  query: new URLSearchParams({ code, state: state.state }),
  headers: { cookie: `${STATE_COOKIE}=${stateCookie}` }
}));

async function withPaths(run) {
  const plane = createModelControlPlane();
  const read = await startRead({ plane });
  const mint = await startMint({ plane, tickets: new Map([[TICKET, {}]]) });
  try { return await run({ plane, read, mint }); }
  finally { await read.close(); await mint.close(); }
}

/** PADIEM 쪽 start Equivalent: 표를 지금 로그인 요청에 묶는다. */
const bindTo = (mint, state, overrides = {}) => mint.tickets.set(TICKET, { loginState: state.state, ...overrides });

test('verified login → handoff → LoveTree session → save → read → logout → reuse refused', { skip }, async () => {
  await withPaths(async ({ plane, read, mint }) => {
    const app = await instance({ plane, read, mint });
    const { stateCookie, state } = await begin(app.login);
    bindTo(mint, state);
    const back = await exchange({ login: app.login, stateCookie, state });
    assert.equal(back.status, 302);
    const credential = cookieValue(back.headers['set-cookie'][0], SESSION_COOKIE);
    assert.ok(credential);
    // 발급 경로로 지나는 것은 두 값뿐: 표, 그리고 자기를 부른 로그인 요청의 해시(원본 아님).
    assert.deepEqual(mint.seen, [{ handoff_ticket: TICKET, login_request_sha256: sha256Hex(state.state) }]);

    const sid = sidOf(credential);
    assert.ok(sid, '자격 증명은 canonical 세션 id를 담는다');
    assert.equal(plane.sessions.get(sid).product_id, PRODUCT);
    assert.equal(plane.sessions.get(sid).state, 'active');

    assert.equal((await save(app.storage, credential)).status, 200);
    const loaded = await readDoc(app.storage, credential);
    assert.deepEqual(loaded.body.state.trees[0].moments.map(m => m.id), statePayload.trees[0].moments.map(m => m.id));

    const out = await app.login.route({ method: 'POST', path: '/auth/logout', headers: { cookie: `${SESSION_COOKIE}=${credential}` } });
    assert.equal(out.status, 200);
    assert.equal(cookieValue(out.headers['set-cookie'][0], SESSION_COOKIE), '');
    assert.equal(plane.sessions.get(sid).state, 'revoked', '서버 세션이 실제로 폐기된다');
    assert.equal((await readDoc(app.storage, credential)).status, 401, '같은 자격 증명 재사용 거부');
  });
});

test('the same handoff ticket cannot mint twice, even concurrently', { skip }, async () => {
  await withPaths(async ({ plane, read, mint }) => {
    const app = await instance({ plane, read, mint });
    const { state } = await begin(app.login);
    bindTo(mint, state);

    // 표 경계만 본다: 같은 표 + 같은 로그인 요청을 두 발급자가 동시에 잡는다.
    const issuers = [0, 1, 2].map(() => createAuthorityWriter({
      call: async (method, payload) => plane[method](payload),
      productId: PRODUCT,
      mint: createHandoffMintClient({ url: mint.url, callerSecret: CALLER_SECRET, productId: PRODUCT, now: () => AT })
    }));
    const raced = await Promise.allSettled(issuers.map(writer => writer.issue({ handoffTicket: TICKET, loginState: state.state })));
    const ok = raced.filter(result => result.status === 'fulfilled');
    assert.equal(ok.length, 1, '동시 클레임은 하나만 성공');
    assert.equal(raced.filter(result => result.status === 'rejected').length, 2);
    assert.equal(ok[0].value.canonicalSessionId, [...plane.sessions.keys()][0]);
    assert.equal([...plane.sessions.values()].filter(s => s.state === 'active').length, 1);

    const late = await settle(issuers[0].issue({ handoffTicket: TICKET, loginState: state.state }));
    assert.equal(late.status, 401, '소진된 표는 뒤에도 실패');
  });
});

test('a ticket forged for another login request is refused without being consumed', { skip }, async () => {
  await withPaths(async ({ plane, read, mint }) => {
    const app = await instance({ plane, read, mint });
    const begunA = await begin(app.login, '/workspace');
    const begunB = await begin(app.login, '/workspace');
    bindTo(mint, begunA.state);

    // B 콜백에 A의 표를 넣으면 거부된다. B가 표를 소모하지 않으므로 A는 그대로 살아 있다.
    const crossed = await exchange({ login: app.login, ...begunB, code: TICKET });
    assert.equal(crossed.status, 401);
    assert.equal(crossed.body.error.code, 'login_handoff_rejected');
    assert.equal(crossed.headers, undefined, '거부된 교환에 쿠키는 없다');
    assert.equal(mint.seen.length, 1);
    assert.equal(mint.claimed.size, 0, '남의 요청으로는 표가 소비되지 않는다');
    assert.equal([...plane.sessions.values()].length, 0);

    const own = await exchange({ login: app.login, ...begunA, code: TICKET });
    assert.equal(own.status, 302, '거부된 시도는 정당한 요청을 방해하지 않는다');
    assert.equal(mint.seen.length, 2);
    assert.equal(mint.seen[1].login_request_sha256, sha256Hex(begunA.state.state));

    // A가 소비한 표를 남의 요청이 다시 들고 오면 거부된다(이번 요청의 상태는 이미 소진됐거나 표가 소진된다).
    const third = await begin(app.login);
    const reused = await exchange({ login: app.login, ...third, code: TICKET });
    assert.equal(reused.status, 401);
    assert.equal(reused.body.error.code, 'login_handoff_rejected');
    assert.equal(mint.claimed.size, 1, '발급은 한 번뿐');
    assert.equal([...plane.sessions.values()].filter(s => s.state === 'active').length, 1);
  });
});

test('a malformed ticket from the provider is refused before the mint path', { skip }, async () => {
  const bad = [`${TICKET}\n`, `${TICKET} injected`, `${TICKET}$`, `${TICKET}#`, 'x'.repeat(200), '', null];
  await withPaths(async ({ plane, read, mint }) => {
    for (const returned of bad) {
      // 공급자가 표 모양 밖의 값을 돌려주면 발급 경로에 닿기 전에 닫힌다.
      const lying = { authorizationUrl: () => 'https://chat.example.test/auth/lovetree/start', exchangeCode: async () => ({ handoffTicket: returned }) };
      const app = await instance({ plane, read, mint, provider: lying });
      const begun = await begin(app.login);
      const refused = await exchange({ login: app.login, ...begun });
      assert.equal(refused.status, 401, JSON.stringify(returned));
      assert.equal(refused.body.error.code, 'invalid_login_evidence', JSON.stringify(returned));
      assert.equal(refused.headers, undefined, JSON.stringify(returned));
    }
    assert.equal(mint.seen.length, 0, '형식 검사 실패는 발급에 닿지 않는다');
    assert.equal([...plane.sessions.values()].length, 0);
  });
});

test('the mint request carries no caller-supplied identity', { skip }, async () => {
  await withPaths(async ({ plane, read, mint }) => {
    const app = await instance({ plane, read, mint });
    const begun = await begin(app.login);
    bindTo(mint, begun.state);
    const writer = createAuthorityWriter({
      call: async (method, payload) => plane[method](payload),
      productId: PRODUCT,
      mint: createHandoffMintClient({ url: mint.url, callerSecret: CALLER_SECRET, productId: PRODUCT, now: () => AT })
    });
    // 호출자가 신원을 덧붙여도 요청 본문에 실리는 것은 두 값뿐이다.
    await writer.issue({
      handoffTicket: TICKET,
      loginState: begun.state.state,
      evidence: { productUserId: 'usr_injected', authProvider: 'google', providerSubject: 'subject-injected' }
    });
    assert.deepEqual(Object.keys(mint.seen[0]).sort(), ['handoff_ticket', 'login_request_sha256']);
    assert.equal(JSON.stringify(mint.seen).includes('usr_injected'), false);
    assert.equal(JSON.stringify(mint.seen).includes(begun.state.state), false, '로그인 요청 원본은 해시로만 나간다');
  });
});

test('a handoff bound to another product or already expired is refused', { skip }, async () => {
  const plane = createModelControlPlane();
  const read = await startRead({ plane });
  try {
    for (const [name, bound] of [['another product', { productId: 'b62' }], ['an expired ticket', { expired: true }]]) {
      const mint = await startMint({ plane, tickets: new Map([[TICKET, bound]]) });
      const app = await instance({ plane, read, mint });
      const { stateCookie, state } = await begin(app.login);
      const refused = await exchange({ login: app.login, stateCookie, state });
      assert.equal(refused.status, 401, name);
      assert.equal(refused.headers, undefined, `${name}: 실패한 로그인에 쿠키를 심지 않는다`);
      await mint.close();
    }
  } finally { await read.close(); }
});

test('a code that is not a handoff ticket never reaches the mint path', { skip }, async () => {
  await withPaths(async ({ plane, read, mint }) => {
    const app = await instance({ plane, read, mint });
    const { stateCookie, state } = await begin(app.login);
    const refused = await exchange({ login: app.login, stateCookie, state, code: 'google-code-not-a-ticket' });
    assert.equal(refused.status, 401);
    assert.equal(refused.body.error.code, 'invalid_login_evidence');
    assert.deepEqual(mint.seen, [], '표 없는 로그인은 발급에 닿지 않는다');
  });
});

test('a closed, failing, or other-product mint path refuses the login without a cookie', { skip }, async () => {
  const plane = createModelControlPlane();
  const read = await startRead({ plane });
  try {
    for (const behaviour of ['closed', 'throw', 'liar']) {
      const mint = await startMint({ plane, tickets: new Map([[TICKET, {}]]), behaviour });
      const app = await instance({ plane, read, mint });
      const { stateCookie, state } = await begin(app.login);
      const refused = await exchange({ login: app.login, stateCookie, state });
      assert.equal(refused.status, 503, behaviour);
      assert.equal(refused.headers, undefined, `${behaviour}: 실패한 발급 뒤에 쿠키를 심지 않는다`);
      const attempts = mint.seen.length;

      // 재시도 정책: 상태도 표도 이미 소비됐다. 같은 콜백을 다시 보내도 발급에 닿지 않고 거부만 한다.
      const retried = await exchange({ login: app.login, stateCookie, state });
      assert.equal(retried.status, 401, behaviour);
      assert.equal(retried.body.error.code, 'login_state_replayed', `${behaviour}: 실패 후 같은 상태로 재시도하지 않는다`);
      assert.equal(mint.seen.length, attempts, `${behaviour}: 발급 실패를 자동으로 재시도하지 않는다`);
      await mint.close();
    }
  } finally { await read.close(); }
});

test('login state is consumed once across two instances and survives a restart', { skip }, async () => {
  await withPaths(async ({ plane, read, mint }) => {
    const sharedRows = new Map();
    const sharedStore = () => createMemoryLoginStateStore({ rows: sharedRows, now: () => AT.getTime() });
    const first = await instance({ plane, read, mint, stateStore: sharedStore() });
    const second = await instance({ plane, read, mint, stateStore: sharedStore() });
    const { stateCookie, state } = await begin(first.login);
    const attempt = (login) => login.route({
      method: 'GET', path: '/auth/callback',
      query: new URLSearchParams({ code: TICKET, state: state.state }),
      headers: { cookie: `${STATE_COOKIE}=${stateCookie}` }
    });
    const raced = await Promise.all([settle(attempt(first.login)), settle(attempt(second.login))]);
    assert.equal(raced.filter(r => r.status === 302).length, 1, '같은 상태를 두 인스턴스가 잡아도 하나만 진행');

    const restarted = await instance({ plane, read, mint, stateStore: sharedStore() });
    const afterRestart = await settle(attempt(restarted.login));
    assert.equal(afterRestart.status, 401);
    assert.equal(afterRestart.body.error.code, 'login_state_replayed', '재시작 뒤에도 같은 상태는 쓰이지 않는다');
  });
});

test('the handoff path never falls back to caller-supplied evidence', { skip }, async () => {
  await withPaths(async ({ plane, read, mint }) => {
    const app = await instance({ plane, read, mint });
    const begun = await begin(app.login);
    const { stateCookie, state } = begun;
    const back = await exchange({ login: app.login, stateCookie, state });
    assert.equal(back.status, 302);
    // 발급 성공 경로에서 링크·발급 RPC는 mint 서버만 통과했다(권위에 세션 하나).
    assert.equal([...plane.sessions.values()].length, 1);
    assert.ok(sidOf(cookieValue(back.headers['set-cookie'][0], SESSION_COOKIE)));
  });
});
