/**
 * 개발·검증 전용 체인 런너. 운영 진입점이 아니다.
 *
 * 로컬 loopback에 로그인 사슬을 통째로 세운다 — 채팅 하네스(기존 라우트·기존 SQL, Google
 * token/userinfo만 스텁), 발급·읽기 중계 Worker(실제 모듈), 러브트리 저장 API(실제 모듈 +
 * in-memory 저장소)와 실제 프런트 화면 번들. 브라우저로 로그인을 판정하기 위한 조립이고,
 * 운영 배포 구성(server/index.js + PostgreSQL)을 대체하지 않는다.
 *
 * 저장소는 메모리 모형이다(이 기계에 PostgreSQL이 없다). 따라서 이 런너로 확인하는 것은
 * 세션·쿠키·권한·격리·재사용 거부이고, PostgreSQL 위 기록 재생은 CI job이 대신한다.
 *
 * 실행: LOVETREE_CHAT_CHECKOUT=<ai-revenue-lab 체크아웃> LOVETREE_CHAT_PYTHON=<python> \
 *        node scripts/dev-auth-chain.mjs
 * 비밀값은 찍지 않는다. 런너가 런타임에 무작위로 만든다.
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { createApiHandler, createNodeHandler } from '../server/http.js';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { createPadiemAuthorityAuth } from '../server/padiem-authority-auth.js';
import { createAuthorityRelayClient } from '../server/authority-relay-transport.js';
import { createAuthorityWriter } from '../server/authority-writer.js';
import { createHandoffMintClient } from '../server/handoff-mint-client.js';
import { createLoginProvider } from '../server/padiem-login-provider.js';
import { createProxy } from '../functions/_lib/proxy.js';
import { createLoginService } from '../server/login-service.js';
import { createMemoryLoginStateStore } from '../server/login-state-store.js';
import { createModelControlPlane } from '../server/testing/model-control-plane.js';
import { createCredentialVerifier } from '../server/credentials/lovetree-credential-module.js';
import { fromCookie } from '../server/session-credential.js';
import { SESSION_COOKIE } from '../server/credentials/lovetree-session.js';

const CHAT = process.env.LOVETREE_CHAT_CHECKOUT;
const PYTHON = process.env.LOVETREE_CHAT_PYTHON ?? 'python';
if (!CHAT) throw new Error('LOVETREE_CHAT_CHECKOUT이 필요합니다.');

const PRODUCT = 'lovetree-4-0';
const CALLER_SECRET = randomBytes(24).toString('base64url');
const SESSION_SECRET = randomBytes(32).toString('base64url');
const HARNESS_SECRET = randomBytes(32).toString('base64url');

const APP_PORT = Number(process.env.LOVETREE_DEV_APP_PORT || 8791);
// Pages 프런트(COM2 API 앞원진)를 흉내 낼 포트. 0이면 지금처럼 단일 원진으로 돈다.
const FRONT_PORT = Number(process.env.LOVETREE_DEV_FRONT_PORT || 0);
// 브라우저가 보는 주소. 앞원진을 세우면 공개 origin도 거기로 맞춘다(COM2는 자기 Host로 URL을 만들지 않는다).
const PUBLIC_ORIGIN = FRONT_PORT ? `http://127.0.0.1:${FRONT_PORT}` : `http://127.0.0.1:${APP_PORT}`;
const STUB_PORT = Number(process.env.LOVETREE_DEV_STUB_PORT || 8820);
const HARNESS_GOOGLE_PORT = Number(process.env.LOVETREE_DEV_HARNESS_PORT || 8821);
const HARNESS_PASSWORD_PORT = Number(process.env.LOVETREE_DEV_HARNESS_PORT2 || 8822);
const MINT_PORT = Number(process.env.LOVETREE_DEV_MINT_PORT || 8823);
const READ_PORT = Number(process.env.LOVETREE_DEV_READ_PORT || 8824);

const dir = await mkdtemp(join(tmpdir(), 'lovetree-dev-chain-'));
const sqlitePath = join(dir, 'chain.sqlite3');
const database = new DatabaseSync(sqlitePath);
database.exec('PRAGMA busy_timeout=5000;');
const plane = createModelControlPlane();

const sha = async (cwd) => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  return (await promisify(execFile)('git', ['rev-parse', 'HEAD'], { cwd })).stdout.trim();
};

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server.address().port));
  });
}

function httpBridge(handler) {
  return createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      const url = `http://127.0.0.1:${res.socket.localPort}${req.url}`;
      const answer = await handler(new Request(url, {
        method: req.method,
        headers: {
          'content-type': req.headers['content-type'] ?? 'application/json',
          ...(req.headers.authorization ? { authorization: req.headers.authorization } : {})
        },
        body: req.method === 'POST' ? Buffer.concat(chunks).toString('utf8') : undefined
      }));
      const body = await answer.text();
      res.writeHead(answer.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(body);
    });
  });
}

function sqliteD1(db) {
  return {
    prepare(sql) {
      let params = [];
      const statement = {
        bind(...values) { params = values; return statement; },
        async first() { return db.prepare(sql).get(...params) ?? null; }
      };
      return statement;
    }
  };
}

const workers = {};
async function startRelays() {
  const mintWorker = await import(pathToFileURL(join(CHAT, 'apps/lovetree-auth-caller/worker.mjs')).href);
  const readWorker = await import(pathToFileURL(join(CHAT, 'apps/lovetree-authority-caller/worker.mjs')).href);
  const mintServer = httpBridge((request) => mintWorker.handleRequest(request, {
    LOVETREE_CALLER_SECRET: CALLER_SECRET,
    LOVETREE_LOGIN_DB: sqliteD1(database),
    IDENTITY_AUTHORITY: plane
  }));
  const readServer = httpBridge((request) => readWorker.handleRequest(request, {
    LOVETREE_CALLER_SECRET: CALLER_SECRET,
    IDENTITY_AUTHORITY: plane,
    LOVETREE_PRODUCT_ID: PRODUCT
  }));
  await listen(mintServer, MINT_PORT);
  await listen(readServer, READ_PORT);
  workers.mint = mintServer;
  workers.read = readServer;
}

function startHarness(port, authMode, extra = {}) {
  const child = spawn(PYTHON, ['-m', 'uvicorn', 'tests.lovetree_chain_harness:app', '--host', '127.0.0.1', '--port', String(port), '--log-level', 'warning'], {
    cwd: join(CHAT, 'apps', 'padiem-chat'),
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      CHAIN_SQLITE_PATH: sqlitePath,
      CHAIN_SESSION_SECRET: HARNESS_SECRET,
      CHAIN_GOOGLE_SUBJECT: 'dev-chain-subject',
      CHAIN_GOOGLE_EMAIL: 'chain-identity@example.test',
      CHAIN_PASSWORD: 'dev-chain-password-1234',
      CHAIN_PASSWORD_EMAIL: 'chain-identity@example.test',
      CHAIN_PROFILE_ID: 'usr_dev_chain_profile',
      CHAIN_AUTH_MODE: authMode,
      CHAIN_PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
      ...extra
    }
  });
  child.stderr.on('data', (chunk) => process.stderr.write(`[harness:${port}] ${chunk}`));
  workers[`harness${port}`] = child;
  return child;
}

// 스텁 Google 화면: 실제 브라우저가 계정을 고르는 자리만 대체한다. state·redirect_uri는 그대로 보낸다.
const stubPage = (query) => {
  const state = query.get('state') ?? '';
  const redirect = query.get('redirect_uri') ?? '';
  const accounts = [['member-a', '회원 A'], ['member-b', '회원 B']];
  return `<!doctype html><meta charset="utf-8"><title>스텁 로그인</title>
  <p>이 화면은 실제 브라우저 판정을 위한 국소 스텁입니다(운영 Google 화면이 아닙니다).</p>
  <ul>${accounts.map(([code, label]) => `<li><a id="pick-${code}" href="${redirect}?code=${code}&state=${state}">${label}</a></li>`).join('')}</ul>`;
};

const stubServer = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(url.pathname.startsWith('/stub/authorize') ? stubPage(url.searchParams) : '<pre>dev chain stub</pre>');
});

const DIST = join(process.cwd(), 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const assetType = (path) => MIME[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream';
async function serveStatic(path, res) {
  const wanted = path === '/' ? '/index.html' : path;
  const file = resolve(DIST, wanted.replace(/^\/+/, ''));
  // 이 러너는 로컬 전용이지만 경로 밖으로 나가는 요청은 파일 존재 확인도 하지 않는다.
  if (file !== DIST && !file.startsWith(DIST + sep)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end('not found');
    return true;
  }
  if (existsSync(file) && !file.endsWith('.html')) {
    res.writeHead(200, { 'content-type': assetType(file), 'cache-control': 'no-store' });
    res.end(await readFile(file));
    return true;
  }
  const index = join(DIST, 'index.html');
  if (!existsSync(index)) return false;
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(await readFile(index));
  return true;
}

async function startApp() {
  const provider = createLoginProvider({
    env: {
      LOVETREE_PADIEM_HANDOFF_START_URL: `http://127.0.0.1:${HARNESS_GOOGLE_PORT}/auth/lovetree/start`,
      LOVETREE_PUBLIC_ORIGIN: PUBLIC_ORIGIN
    },
    productId: PRODUCT
  });
  const writer = createAuthorityWriter({
    call: async (method, payload) => {
      if (method !== 'revoke_auth_session') throw new Error(`링크·발급 RPC는 중계를 통해서만 부른다: ${method}`);
      return plane[method](payload);
    },
    productId: PRODUCT,
    mint: createHandoffMintClient({ url: `http://127.0.0.1:${MINT_PORT}/mint-session`, callerSecret: CALLER_SECRET, productId: PRODUCT })
  });
  const login = createLoginService({
    productId: PRODUCT, writer, provider, credentialSecret: SESSION_SECRET,
    stateStore: createMemoryLoginStateStore(), cookieSecure: false
  });
  const authenticate = createPadiemAuthorityAuth({
    productId: PRODUCT,
    credential: createCredentialVerifier({ env: { LOVETREE_SESSION_SECRET: SESSION_SECRET }, present: fromCookie(SESSION_COOKIE) }),
    authority: createAuthorityRelayClient({ url: `http://127.0.0.1:${READ_PORT}/resolve-session`, callerSecret: CALLER_SECRET })
  });
  const storage = createApiHandler({
    authenticate,
    service: createWorkspaceService({ repo: createMemoryWorkspaceRepo(), productId: PRODUCT }),
    productId: PRODUCT
  });

  const api = createNodeHandler(async (request) => {
    const { method = 'GET', path = '', headers = {}, body, query } = request;
    if (path.startsWith('/auth/')) {
      try {
        return await login.route({ method, path, query, headers, origin: PUBLIC_ORIGIN });
      } catch (error) {
        return { status: error.status ?? 500, headers: {}, body: { error: { code: error.code ?? 'internal_error', message: error.message } } };
      }
    }
    return storage({ method, path, headers, body });
  });
  // 실제 프런트 번들을 화면 경로로 돌려준다(화면 자체는 아직 서버 저장 미연결 — #36 영역).
  const app = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0];
    if (req.method === 'GET' && !path.startsWith('/api/') && !path.startsWith('/auth/')) {
      serveStatic(path, res).then((handled) => { if (!handled) { res.writeHead(500); res.end('npm run build 가 먼저 필요합니다'); } },
        () => { res.writeHead(500); res.end('no build'); });
      return;
    }
    api(req, res);
  });
  await listen(app, APP_PORT);
  workers.app = app;
}

// Pages 프런트와 같은 모양: 화면은 이 origin에서 받고 /api·/auth만 COM2로 넘긴다.
async function startFront() {
  const proxy = createProxy();
  const upstream = { LOVETREE_API_ORIGIN: `http://127.0.0.1:${APP_PORT}` };
  const front = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0];
    if (!path.startsWith('/api/') && !path.startsWith('/auth/')) {
      serveStatic(path, res).then((handled) => { if (!handled) { res.writeHead(500); res.end('npm run build 가 먼저 필요합니다'); } },
        () => { res.writeHead(500); res.end('no build'); });
      return;
    }
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      const method = req.method ?? 'GET';
      const hasBody = chunks.length > 0 && method !== 'GET' && method !== 'HEAD';
      const headers = {};
      for (const [name, value] of Object.entries(req.headers)) {
        if (name.startsWith(':')) continue;
        if (!hasBody && (name === 'content-length' || name === 'transfer-encoding')) continue;
        headers[name] = Array.isArray(value) ? value.join(', ') : value;
      }
      const answer = await proxy({
        request: new Request(`http://127.0.0.1:${FRONT_PORT}${req.url}`, { method, headers, ...(hasBody ? { body: Buffer.concat(chunks) } : {}) }),
        env: upstream
      });
      const out = {};
      for (const [name, value] of answer.headers.entries()) out[name] = value;
      const cookies = typeof answer.headers.getSetCookie === 'function' ? answer.headers.getSetCookie() : [];
      delete out['set-cookie'];
      if (cookies.length) out['set-cookie'] = cookies;
      res.writeHead(answer.status, out);
      res.end(Buffer.from(await answer.arrayBuffer()));
    });
  });
  await listen(front, FRONT_PORT);
  workers.front = front;
}

await startRelays();
startHarness(HARNESS_GOOGLE_PORT, 'hybrid', { CHAIN_GOOGLE_AUTHORIZE_PREFIX: `http://127.0.0.1:${STUB_PORT}/stub/authorize` });
startHarness(HARNESS_PASSWORD_PORT, 'password');
await listen(stubServer, STUB_PORT);
await startApp();
if (FRONT_PORT) await startFront();

console.log(JSON.stringify({
  role: 'dev-only browser chain runner (memory storage repo, stub Google, model authority)',
  app: `http://127.0.0.1:${APP_PORT}`,
  front: FRONT_PORT ? `http://127.0.0.1:${FRONT_PORT}` : null,
  stub: `http://127.0.0.1:${STUB_PORT}/stub/authorize`,
  harnessGoogle: HARNESS_GOOGLE_PORT,
  harnessPassword: HARNESS_PASSWORD_PORT,
  mint: MINT_PORT,
  read: READ_PORT,
  sqlite: sqlitePath,
  shas: { lovetree40: await sha(process.cwd()), aiRevenueLab: await sha(CHAT) }
}, null, 2));

const shutdown = async () => {
  for (const worker of Object.values(workers)) {
    if (worker && typeof worker.kill === 'function') worker.kill('SIGTERM');
    else if (worker) await new Promise((resolve) => worker.close(resolve));
  }
  database.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
