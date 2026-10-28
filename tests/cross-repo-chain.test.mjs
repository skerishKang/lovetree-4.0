import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';

import { createTree } from '../src/domain.js';
import { createApiHandler, createNodeHandler } from '../server/http.js';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { createPadiemAuthorityAuth } from '../server/padiem-authority-auth.js';
import { createAuthorityRelayClient } from '../server/authority-relay-transport.js';
import { createAuthorityWriter } from '../server/authority-writer.js';
import { createHandoffMintClient } from '../server/handoff-mint-client.js';
import { createLoginProvider } from '../server/padiem-login-provider.js';
import { createLoginService } from '../server/login-service.js';
import { createMemoryLoginStateStore } from '../server/login-state-store.js';
import { createModelControlPlane } from '../server/testing/model-control-plane.js';
import { createCredentialVerifier } from '../server/credentials/lovetree-credential-module.js';
import { SESSION_COOKIE, readSessionToken } from '../server/credentials/lovetree-session.js';
import { fromCookie } from '../server/session-credential.js';

/**
 * 두 저장소를 가로지르는 연결 검증.
 *
 * 이 시험에서 실제로 돌아가는 것 — 러브트리: `server/login-service.js`,
 * `server/padiem-login-provider.js`, `server/handoff-mint-client.js`,
 * `server/authority-writer.js`, `server/padiem-authority-auth.js`, `server/http.js`,
 * `server/workspace-service.js` / ai-revenue-lab: `apps/lovetree-auth-caller/worker.mjs`(발급 중계),
 * `apps/lovetree-authority-caller/worker.mjs`(읽기 중계), `apps/padiem-chat/app/lovetree_auth_routes.py`,
 * `app/auth.py`의 handoff state, `app/auth_routes.py`의 `google_callback`·`password_login`,
 * `app/lovetree_auth_store.py`의 D1 SQL. handoff 행은 **같은 SQLite 파일**을 producers(Python)와
 * consumer(JS 중계)가 공유한다 — 양쪽 경계를 각각 성공 모형으로 대체하지 않는다.
 *
 * 대체된 두 가지: Google의 token/userinfo HTTP(채팅 하네스가 httpx MockTransport로만), 그리고
 * Control Plane 권위 자체(`server/testing/model-control-plane.js`의 확인된 RPC 형상).
 *
 * CI에는 두 저장소가 같이 놓이지 않으므로 이 파일은 환경이 주어질 때만 돈다. 스킵된 상태를
 * 연결 검증 완료로 쓰지 않는다 — 실행 명령과 두 SHA는 PR 본문에 남긴다.
 *
 *   LOVETREE_CHAT_CHECKOUT=<ai-revenue-lab 체크아웃> LOVETREE_CHAT_PYTHON=<python> npm test
 */
const CHAT = process.env.LOVETREE_CHAT_CHECKOUT ?? '';
const PYTHON = process.env.LOVETREE_CHAT_PYTHON ?? '';
const HERE = fileURLToPath(new URL('.', import.meta.url));
const LOVE_TREE_ROOT = join(HERE, '..');
const CHAT_APP = CHAT ? join(CHAT, 'apps', 'padiem-chat') : '';

const PRODUCT = 'lovetree-4-0';
const CALLER_SECRET = 'chain-caller-secret';
const SESSION_SECRET = 'chain-session-secret';
const HARNESS_SECRET = 'chain-harness-session-secret-long-enough-32chars';
const GOOGLE_SUBJECT = 'chain-verified-google-subject-1';
const PASSWORD = 'chain-password-1234';
const PASSWORD_EMAIL = 'chain-identity@example.test';
const PROFILE_ID = 'usr_chain_profile';

const run = promisify(execFile);
const skip = CHAT && PYTHON ? false : '두 저장소를 같이 붙이지 않았습니다(LOVETREE_CHAT_CHECKOUT·LOVETREE_CHAT_PYTHON 필요). 이 연결 검증은 미수행입니다.';

const git = async (cwd, args) => (await run('git', args, { cwd })).stdout.trim();

async function headState(cwd) {
  const sha = await git(cwd, ['rev-parse', 'HEAD']);
  const upstream = await git(cwd, ['rev-parse', '@{u}']).catch(() => '');
  const dirty = await git(cwd, ['status', '--porcelain']);
  return { sha, upstream, dirty };
}

function request(port, method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = createServerReq(method, port, path, headers, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        location: res.headers.location,
        body: text,
        json: () => JSON.parse(text || 'null'),
        cookie: (res.headers['set-cookie'] ?? []).map(String)
      }));
    });
    req.setTimeout(20_000, () => req.destroy(new Error(`chain hop timed out: ${method} ${path}`)));
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

// 302를 따라가지 않는 원시 요청(follow가 숨기는 헤더를 그대로 본다).
import { request as rawRequest } from 'node:http';
function createServerReq(method, port, path, headers, handler) {
  return rawRequest({ host: '127.0.0.1', port, path, method, headers }, handler);
}

const cookieValue = (cookies, name) => {
  for (const line of [].concat(cookies ?? [])) {
    const pair = String(line).split(';')[0];
    const at = pair.indexOf('=');
    if (at > 0 && pair.slice(0, at).trim() === name) return pair.slice(at + 1).trim();
  }
  return null;
};

const queryOf = (url) => new URL(url, 'http://127.0.0.1').searchParams;

async function waitForHealth(port, path = '/healthz', attempts = 120) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const answer = await request(port, 'GET', path);
      if (answer.status === 200) return;
    } catch { /* 아직 뜨는 중 */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`harness did not come up on :${port}`);
}

function sqliteD1(database) {
  return {
    prepare(sql) {
      let params = [];
      const statement = {
        bind(...values) { params = values; return statement; },
        async first() { return database.prepare(sql).get(...params) ?? null; }
      };
      return statement;
    }
  };
}

function httpBridge(handler) {
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      const url = `http://127.0.0.1:${server.address().port}${req.url}`;
      const answer = await handler(new Request(url, {
        method: req.method,
        headers: { 'content-type': req.headers['content-type'] ?? 'application/json', ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) },
        body: req.method === 'POST' ? Buffer.concat(chunks).toString('utf8') : undefined
      }));
      const body = await answer.text();
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(body);
    });
  });
  return {
    listen: async () => {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(serverPort(), '127.0.0.1', resolve);
      });
      return `http://127.0.0.1:${server.address().port}`;
    },
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

let nextRelayPort = 8891;
const serverPort = () => nextRelayPort++;

async function startHarness({ authMode, port, sqlitePath, label }) {
  const child = spawn(PYTHON, ['-m', 'uvicorn', 'tests.lovetree_chain_harness:app', '--host', '127.0.0.1', '--port', String(port), '--log-level', 'warning'], {
    cwd: CHAT_APP,
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      CHAIN_SQLITE_PATH: sqlitePath,
      CHAIN_SESSION_SECRET: HARNESS_SECRET,
      CHAIN_GOOGLE_SUBJECT: GOOGLE_SUBJECT,
      CHAIN_GOOGLE_EMAIL: PASSWORD_EMAIL,
      CHAIN_PASSWORD: PASSWORD,
      CHAIN_PASSWORD_EMAIL: PASSWORD_EMAIL,
      CHAIN_PROFILE_ID: PROFILE_ID,
      CHAIN_AUTH_MODE: authMode,
      CHAIN_PUBLIC_BASE_URL: `http://127.0.0.1:${port}`
    }
  });
  const noise = [];
  child.on('error', (error) => noise.push(`spawn error: ${error.message}`));
  child.stderr.on('data', (chunk) => noise.push(String(chunk)));
  child.stdout.on('data', (chunk) => noise.push(String(chunk)));
  try {
    await waitForHealth(port);
  } catch (error) {
    throw new Error(`${label} (:${port}) 기동 실패: ${noise.join('').slice(-1200)}`);
  }
  return {
    origin: `http://127.0.0.1:${port}`,
    peek: async (ticket) => (await request(port, 'GET', `/chain/peek?ticket=${ticket}`)).json().record,
    expire: async (ticket) => (await request(port, 'GET', `/chain/expire?ticket=${ticket}`)).json(),
    noise,
    close: async () => { child.kill(); await new Promise((resolve) => child.once('close', resolve)); }
  };
}

async function startLoveTree({ harnessOrigin, mintOrigin, readOrigin, plane }) {
  let built = null;
  const server = createServer((req, res) => {
    if (!built) { res.writeHead(503); res.end('{}'); return; }
    return built.node(req, res);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  const provider = createLoginProvider({
    env: {
      LOVETREE_PADIEM_HANDOFF_START_URL: `${harnessOrigin}/auth/lovetree/start`,
      LOVETREE_PUBLIC_ORIGIN: `http://127.0.0.1:${port}`
    },
    productId: PRODUCT
  });
  const writer = createAuthorityWriter({
    // handoff 경로에서 링크·발급 RPC를 직접 부르지 않는다 — 폐기만 권위에 간다.
    call: async (method, payload) => {
      if (method !== 'revoke_auth_session') throw new Error(`링크·발급 RPC는 중계를 통해서만 부른다: ${method}`);
      return plane[method](payload);
    },
    productId: PRODUCT,
    mint: createHandoffMintClient({ url: `${mintOrigin}/mint-session`, callerSecret: CALLER_SECRET, productId: PRODUCT })
  });
  const login = createLoginService({
    productId: PRODUCT, writer, provider, credentialSecret: SESSION_SECRET,
    stateStore: createMemoryLoginStateStore(), cookieSecure: false
  });
  const authenticate = createPadiemAuthorityAuth({
    productId: PRODUCT,
    credential: createCredentialVerifier({ env: { LOVETREE_SESSION_SECRET: SESSION_SECRET }, present: fromCookie(SESSION_COOKIE) }),
    authority: createAuthorityRelayClient({ url: `${readOrigin}/resolve-session`, callerSecret: CALLER_SECRET })
  });
  const service = createWorkspaceService({ repo: createMemoryWorkspaceRepo(), productId: PRODUCT });
  const storage = createApiHandler({ authenticate, service, productId: PRODUCT });
  const route = async (req) => {
    const { method = 'GET', path = '', query = new URLSearchParams(), headers = {}, body } = req;
    if (path.startsWith('/auth/')) {
      try { return await login.route({ method, path, query, headers, origin: `http://127.0.0.1:${port}` }); }
      catch (error) {
        return { status: error.status ?? 500, headers: {}, body: { error: { code: error.code ?? 'internal_error', message: error.message } } };
      }
    }
    return storage({ method, path, headers, body });
  };
  built = { node: createNodeHandler(route) };
  return { login, storage, port, close: () => new Promise((resolve) => server.close(resolve)) };
}

// 브라우저 한 번의 왕복: 러브트리 시작 → 하네스 start → Google stub → 하네스 callback.
async function googleJourney(harness, loveTreePort, { next = '/workspace', code = 'chain-google-code' } = {}) {
  const begun = await request(loveTreePort, 'GET', `/auth/login?next=${next}`);
  assert.equal(begun.status, 302, '로그인 시작은 리다이렉트');
  const stateCookie = cookieValue(begun.cookie, 'lovetree_oauth_state');
  assert.ok(stateCookie, '서명된 상태 쿠키가 함께 온다');
  const startUrl = new URL(begun.location);
  assert.equal(`${startUrl.pathname}`, '/auth/lovetree/start');

  const toGoogle = await request(Number(startUrl.port), 'GET', `${startUrl.pathname}${startUrl.search}`);
  assert.equal(toGoogle.status, 302);
  const authorize = new URL(toGoogle.location);
  assert.equal(authorize.host, 'accounts.google.com', '기존 Google 로그인 하나를 그대로 쓴다');
  const redirect = new URL(authorize.searchParams.get('redirect_uri'));
  assert.equal(`${redirect.pathname}`, '/auth/google/callback');

  const callbackQuery = new URLSearchParams({ code, state: authorize.searchParams.get("state") });
  const handed = await request(Number(redirect.port), 'GET', `/auth/google/callback?${callbackQuery}`);
  const back = new URL(handed.location);
  return {
    ticket: back.searchParams.get('code'),
    loginState: back.searchParams.get('state'),
    stateCookie,
    handedStatus: handed.status,
    location: handed.location,
    chatCookies: handed.cookie
  };
}

async function finishAtLoveTree(app, journey) {
  return request(app.port, 'GET', `/auth/callback?code=${journey.ticket}&state=${journey.loginState}`, {
    headers: { cookie: `lovetree_oauth_state=${journey.stateCookie}` }
  });
}

const doc = { version: 1, trees: [createTree({ subject: '윤슬', title: '체인 첫 순간', note: '연결', emotion: '설렘', date: '2026-10-28', url: '' })] };

test.describe('cross-repo login chain (PADIEM producer → handoff SQL → relays → LoveTree session)', { skip }, () => {
  const state = {};

  test.before(async () => {
    state.dir = await mkdtemp(join(tmpdir(), 'lovetree-chain-'));
    state.sqlitePath = join(state.dir, 'chain.sqlite3');
    state.loveTree = await headState(LOVE_TREE_ROOT);
    state.chat = await headState(CHAT);
    state.database = new DatabaseSync(state.sqlitePath);
    state.database.exec('PRAGMA busy_timeout=5000;');
    state.plane = createModelControlPlane();

    state.mintRelay = httpBridge(async (request_) => {
      const worker = await import(pathToFileURL(join(CHAT, 'apps/lovetree-auth-caller/worker.mjs')).href);
      return worker.handleRequest(request_, {
        LOVETREE_CALLER_SECRET: CALLER_SECRET,
        LOVETREE_LOGIN_DB: sqliteD1(state.database),
        IDENTITY_AUTHORITY: state.plane
      });
    });
    state.readRelay = httpBridge(async (request_) => {
      const worker = await import(pathToFileURL(join(CHAT, 'apps/lovetree-authority-caller/worker.mjs')).href);
      return worker.handleRequest(request_, {
        LOVETREE_CALLER_SECRET: CALLER_SECRET,
        IDENTITY_AUTHORITY: state.plane,
        LOVETREE_PRODUCT_ID: PRODUCT
      });
    });
    state.mintOrigin = await state.mintRelay.listen();
    state.readOrigin = await state.readRelay.listen();

    state.googleHarness = await startHarness({ authMode: 'hybrid', port: 8811, sqlitePath: state.sqlitePath, label: 'google harness' });
    state.passwordHarness = await startHarness({ authMode: 'password', port: 8812, sqlitePath: state.sqlitePath, label: 'password harness' });
    state.app = await startLoveTree({
      harnessOrigin: state.googleHarness.origin,
      mintOrigin: state.mintOrigin,
      readOrigin: state.readOrigin,
      plane: state.plane,
    });
  });

  test.after(async () => {
    await state.app?.close();
    await state.googleHarness?.close();
    await state.passwordHarness?.close();
    await state.mintRelay?.close();
    await state.readRelay?.close();
    state.database?.close();
    await rm(state.dir, { recursive: true, force: true });
  });

  test('the modules under test are the pushed commits themselves', () => {
    for (const [name, made] of [['lovetree-4.0', state.loveTree], ['ai-revenue-lab', state.chat]]) {
      assert.equal(made.dirty, '', `${name}에 커밋되지 않은 변경이 있습니다`);
      assert.equal(made.sha, made.upstream, `${name}의 HEAD가 push된 SHA와 다릅니다`);
    }
    console.log(`chain SHAs lovetree-4.0=${state.loveTree.sha} ai-revenue-lab=${state.chat.sha}`);
  });

  test('google login → handoff → mint → save → read → logout → reuse refused', async () => {
    const journey = await googleJourney(state.googleHarness, state.app.port);
    const chatCookies = journey.chatCookies.join(' ');
    assert.doesNotMatch(chatCookies, /padiem_session=/, 'handoff 브라우저에 채팅 세션을 심지 않는다');
    assert.match(journey.location, /^http:\/\/127\.0\.0\.1:\d+\/auth\/callback\?/, '러브트리 콜백으로만 돌아온다');

    const row = await state.googleHarness.peek(journey.ticket);
    assert.equal(row.status, 'ready');
    assert.equal(row.pending_user_id, PROFILE_ID);
    assert.equal(row.auth_provider, 'google');
    assert.equal(row.provider_subject, GOOGLE_SUBJECT, '권위에 가는 신원은 확인된 subject뿐이다');

    const done = await finishAtLoveTree(state.app, journey);
    assert.equal(done.status, 302);
    assert.equal(done.location, '/workspace');
    const credential = cookieValue(done.cookie, SESSION_COOKIE);
    assert.ok(credential, '러브트리 세션 쿠키');

    const sid = readSessionToken({ secret: SESSION_SECRET, token: credential, now: Math.floor(Date.now() / 1000) })?.canonicalSessionId;
    assert.ok(sid && state.plane.sessions.get(sid).state === 'active', '중계가 권위에 만든 세션이 실제로 살아 있다');

    const saved = await request(state.app.port, 'PUT', '/api/workspace', {
      headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE}=${credential}` },
      body: JSON.stringify({ state: doc, expectedRevision: 0, clientKey: 'chain-ck-1' })
    });
    assert.equal(saved.status, 200, saved.body);
    assert.equal(saved.json().revision, 1);

    const read = await request(state.app.port, 'GET', '/api/workspace', { headers: { cookie: `${SESSION_COOKIE}=${credential}` } });
    assert.deepEqual(read.json().state.trees[0].moments.map((m) => m.id), doc.trees[0].moments.map((m) => m.id));

    const out = await request(state.app.port, 'POST', '/auth/logout', { headers: { cookie: `${SESSION_COOKIE}=${credential}` } });
    assert.equal(out.status, 200);
    assert.equal(cookieValue(out.cookie, SESSION_COOKIE), '');
    assert.equal(state.plane.sessions.get(sid).state, 'revoked', '서버 세션이 실제로 폐기된다');

    const reuse = await request(state.app.port, 'GET', '/api/workspace', { headers: { cookie: `${SESSION_COOKIE}=${credential}` } });
    assert.equal(reuse.status, 401, '폐기된 세션의 재사용 거부');

    const after = await state.googleHarness.peek(journey.ticket);
    assert.equal(after.status, 'claimed', '표는 한 번만 소비된다');
  });

  test('tickets from two logins cannot be exchanged across the requests', async () => {
    const a = await googleJourney(state.googleHarness, state.app.port);
    const b = await googleJourney(state.googleHarness, state.app.port);
    assert.notEqual(a.ticket, b.ticket);
    assert.notEqual(a.loginState, b.loginState);

    // B의 콜백에 A의 표를 넣는다.
    const crossed = await request(state.app.port, 'GET', `/auth/callback?code=${a.ticket}&state=${b.loginState}`, {
      headers: { cookie: `lovetree_oauth_state=${b.stateCookie}` }
    });
    assert.equal(crossed.status, 401, '남의 요청으로는 발급하지 않는다');
    assert.equal(crossed.json().error.code, 'login_handoff_rejected');
    assert.equal((await state.googleHarness.peek(a.ticket)).status, 'ready', '거부는 표를 소모하지 않는다');

    // 시도한 쪽(B)의 로그인 상태는 이미 소비됐다. 교차 시도는 자기 요청만 태운다.
    const bRetry = await finishAtLoveTree(state.app, b);
    assert.equal(bRetry.status, 401);
    assert.equal(bRetry.json().error.code, 'login_state_replayed', '교차 시도는 자기 로그인 요청을 소모한다');
    assert.equal((await state.googleHarness.peek(b.ticket)).status, 'ready', 'B의 표도 소비되지 않았다');

    const own = await finishAtLoveTree(state.app, a);
    assert.equal(own.status, 302, '정당한 요청은 그대로 성공한다');
    assert.equal((await state.googleHarness.peek(a.ticket)).status, 'claimed');

    const fresh = await googleJourney(state.googleHarness, state.app.port);
    const third = await finishAtLoveTree(state.app, fresh);
    assert.equal(third.status, 302, '거부 뒤에도 새 로그인은 정상 발급');
    assert.ok(cookieValue(third.cookie, SESSION_COOKIE));
    assert.equal((await state.googleHarness.peek(fresh.ticket)).status, 'claimed');
  });

  test('concurrent consumption of one ticket mints once, expired and unbound tickets are refused', async () => {
    const journey = await googleJourney(state.googleHarness, state.app.port);
    const raced = await Promise.all([
      finishAtLoveTree(state.app, journey),
      finishAtLoveTree(state.app, journey),
      finishAtLoveTree(state.app, journey)
    ]);
    assert.equal(raced.filter((r) => r.status === 302).length, 1, '같은 표 동시 소비는 하나만 성공');
    assert.deepEqual(raced.filter((r) => r.status !== 302).map((r) => r.status), [401, 401]);

    const expired = await googleJourney(state.googleHarness, state.app.port);
    const aged = await state.googleHarness.expire(expired.ticket);
    assert.equal(aged.ok, true);
    const refused = await finishAtLoveTree(state.app, expired);
    assert.equal(refused.status, 401, '만료된 표는 발급되지 않는다');

    // 로그인 교환을 마치지 않아 신원이 없는 표도 발급되지 않는다(행은 소비되지 않는다).
    const begun = await request(state.app.port, 'GET', '/auth/login');
    const startUrl = new URL(begun.location);
    const toGoogle = await request(Number(startUrl.port), 'GET', `${startUrl.pathname}${startUrl.search}`);
    assert.equal(toGoogle.status, 302, 'Google로 보내는 것까지는 실제 경로');
    const orphan = state.database
      .prepare("SELECT ticket_id FROM lovetree_login_handoffs WHERE status='awaiting_login' ORDER BY created_at DESC LIMIT 1")
      .get();
    const unverified = await request(state.app.port, 'GET',
      `/auth/callback?code=${orphan.ticket_id}&state=${new URLSearchParams(startUrl.search).get('state')}`, {
        headers: { cookie: `lovetree_oauth_state=${cookieValue(begun.cookie, 'lovetree_oauth_state')}` }
      });
    assert.equal(unverified.status, 401, '미확인 로그인 표는 거부된다');
    assert.equal(state.database.prepare('SELECT status FROM lovetree_login_handoffs WHERE ticket_id=?').get(orphan.ticket_id).status, 'awaiting_login');
  });

  // 서로 다른 검증 신원은 서로 다른 소유자 문서로 이어진다. 권위 모형이 주체 id를 접두사만 이 건이 그 회귀를 막는다).
  test('two verified identities keep separate workspaces', async () => {
    const first = await googleJourney(state.googleHarness, state.app.port, { code: 'member-a' });
    const firstSession = await finishAtLoveTree(state.app, first);
    const credentialA = cookieValue(firstSession.cookie, SESSION_COOKIE);
    assert.ok(credentialA);
    const savedA = await request(state.app.port, 'PUT', '/api/workspace', {
      headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE}=${credentialA}` },
      body: JSON.stringify({ state: doc, expectedRevision: 0, clientKey: 'chain-isolation-a' })
    });
    assert.equal(savedA.status, 200, savedA.body);

    const second = await googleJourney(state.googleHarness, state.app.port, { code: 'member-b' });
    const secondSession = await finishAtLoveTree(state.app, second);
    const credentialB = cookieValue(secondSession.cookie, SESSION_COOKIE);
    assert.ok(credentialB);
    assert.notEqual(credentialB, credentialA, '서로 다른 신원은 서로 다른 세션이다');

    const seenByB = await request(state.app.port, 'GET', '/api/workspace', { headers: { cookie: `${SESSION_COOKIE}=${credentialB}` } });
    assert.equal(seenByB.json().revision, 0, 'B는 A의 문서를 보지 못한다');
    const savedB = await request(state.app.port, 'PUT', '/api/workspace', {
      headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE}=${credentialB}` },
      body: JSON.stringify({ state: doc, expectedRevision: 0, clientKey: 'chain-isolation-b' })
    });
    assert.equal(savedB.status, 200);
    assert.equal(savedB.json().revision, 1);

    const stillA = await request(state.app.port, 'GET', '/api/workspace', { headers: { cookie: `${SESSION_COOKIE}=${credentialA}` } });
    assert.equal(stillA.json().revision, 1, 'A의 문서는 B의 저장으로 옮지 않는다');
  });

  test('password login binds only after a verified credential', async () => {
    const begun = await request(state.app.port, 'GET', '/auth/login');
    const startUrl = new URL(begun.location);
    assert.equal(startUrl.pathname, '/auth/lovetree/start');

    // password 전용 배포는 기존 로그인 페이지로만 보낸다(화면·문구 그대로, hidden 값만 실린다).
    const dialog = await request(8812, 'GET', `${startUrl.pathname}${startUrl.search}`);
    assert.equal(dialog.status, 302);
    const landing = new URL(dialog.location);
    assert.equal(landing.pathname, '/');
    assert.equal(landing.port, '8812');
    const signed = landing.searchParams.get('handoff');
    assert.ok(signed, '서명된 handoff 값이 폼으로 전달된다');

    // 서명된 값은 자기가 만든 표를 정확히 가리킨다.
    const signedPayload = JSON.parse(Buffer.from(signed.split('.')[0], 'base64url').toString());
    const ticket = signedPayload.tid;
    const rowOf = (id) => state.database.prepare(
      'SELECT status, auth_provider, provider_subject, pending_user_id FROM lovetree_login_handoffs WHERE ticket_id=?'
    ).get(id);
    assert.equal(rowOf(ticket).status, 'awaiting_login');

    const failed = await request(8812, 'POST', '/api/auth/password/login', {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: PASSWORD_EMAIL, password: 'wrong', handoff: signed })
    });
    assert.equal(failed.status, 401);
    assert.equal(failed.json().handoff_return, undefined, '실패한 로그인에서는 결합·발급이 없다');
    assert.equal(rowOf(ticket).status, 'awaiting_login', '실패한 로그인은 행을 진행시키지 않는다');

    const ok = await request(8812, 'POST', '/api/auth/password/login', {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: PASSWORD_EMAIL, password: PASSWORD, handoff: signed })
    });
    assert.equal(ok.status, 200, ok.body);
    const hop = ok.json().handoff_return;
    assert.ok(hop && /^http:\/\/127\.0\.0\.1:\d+\/auth\/callback\?/.test(hop), hop);
    const bound = rowOf(ticket);
    assert.equal(bound.status, 'ready');
    assert.equal(bound.auth_provider, 'password');
    assert.equal(bound.provider_subject, PASSWORD_EMAIL);
    assert.equal(bound.pending_user_id, PROFILE_ID);

    const target = new URL(hop);
    const done = await request(state.app.port, 'GET', `${target.pathname}${target.search}`, {
      headers: { cookie: `lovetree_oauth_state=${cookieValue(begun.cookie, 'lovetree_oauth_state')}` }
    });
    assert.equal(done.status, 302);
    const credential = cookieValue(done.cookie, SESSION_COOKIE);
    assert.ok(credential, 'password 경로에서도 러브트리 세션이 발급된다');
    // 확인된 신원이 같으면(같은 제품 user id) 로그인 방법과 무관하게 같은 소유자 문서다.
    const clash = await request(state.app.port, 'PUT', '/api/workspace', {
      headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE}=${credential}` },
      body: JSON.stringify({ state: doc, expectedRevision: 0, clientKey: 'chain-ck-2' })
    });
    assert.equal(clash.status, 409, clash.body);
    assert.equal(clash.json().error.code, 'revision_conflict');

    const saved = await request(state.app.port, 'PUT', '/api/workspace', {
      headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE}=${credential}` },
      body: JSON.stringify({ state: doc, expectedRevision: 1, clientKey: 'chain-ck-3' })
    });
    assert.equal(saved.status, 200, saved.body);
    assert.equal(saved.json().revision, 2);
  });
});
