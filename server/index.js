import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createPool, createWorkspaceRepo } from './db/postgres.js';
import { createAdminRoleRepo } from './db/admin-roles-postgres.js';
import { createAdminRoleService } from './admin-roles.js';
import { resolveListen } from './listen-config.js';
import { createApiHandler, createNodeHandler } from './http.js';
import { createWorkspaceService } from './workspace-service.js';
import { createPadiemAuthorityAuth } from './padiem-authority-auth.js';
import { createSharedAccessAuth } from './padiem-access-auth.mjs';
import { createAuthorityRelayClient } from './authority-relay-transport.js';
import { createAuthorityWriter } from './authority-writer.js';
import { createLoginService } from './login-service.js';
import { fromBearer, fromCookie } from './session-credential.js';
import { unconfiguredAuth } from './auth.js';
import { createMemoryLoginStateStore, createPostgresLoginStateStore } from './login-state-store.js';
import { createHandoffMintClient } from './handoff-mint-client.js';
import { ApiError } from './errors.js';

const {
  LOVETREE_SHARED_AUTH_ENABLED = '',
  LOVETREE_DATABASE_URL = '',
  LOVETREE_PRODUCT_ID = '',
  LOVETREE_MAX_BODY_BYTES = '',
  LOVETREE_AUTHORITY_TRANSPORT = '',
  LOVETREE_AUTHORITY_RELAY_URL = '',
  LOVETREE_CALLER_SECRET = '',
  LOVETREE_CREDENTIAL_MODULE = '',
  LOVETREE_SESSION_SECRET = '',
  LOVETREE_SESSION_MAX_AGE_SECONDS = '',
  LOVETREE_COOKIE_SECURE = '',
  LOVETREE_AUTHORITY_WRITE_TRANSPORT = '',
  LOVETREE_STATE_STORE = '',
  LOVETREE_MINT_URL = '',
  LOVETREE_LOGIN_PROVIDER_MODULE = '',
  LOVETREE_SESSION_SOURCE = '',
  LOVETREE_SESSION_COOKIE = '',
  LOVETREE_AUTHORITY_TIMEOUT_MS = '',
  PORT = ''
} = process.env;

if (!LOVETREE_PRODUCT_ID) throw new Error('LOVETREE_PRODUCT_ID가 필요합니다. 인증 권위의 제품 ID와 같은 값을 씁니다.');
if (!LOVETREE_DATABASE_URL) throw new Error('LOVETREE_DATABASE_URL가 필요합니다. 없는 상태에서는 저장을 시작하지 않습니다.');

function readSessionIdFromConfig() {
  if (LOVETREE_SESSION_SOURCE === 'cookie') return fromCookie(LOVETREE_SESSION_COOKIE);
  if (LOVETREE_SESSION_SOURCE === 'bearer') return fromBearer();
  throw new Error('LOVETREE_SESSION_SOURCE는 cookie 또는 bearer로 명시해야 합니다.');
}

// 배포가 준비한 모듈만 불러온다(./ 상대 경로 또는 file:// URL). URL·경로를 여기서 지어내지 않는다.
async function loadModule(specifier, label) {
  if (!(specifier.startsWith('./') || specifier.startsWith('file://'))) {
    throw new Error(`${label}는 ./ 상대 경로 또는 file:// URL만 쓸 수 있습니다.`);
  }
  const url = specifier.startsWith('file://') ? specifier : new URL(specifier, import.meta.url).href;
  return import(url);
}

// 2단계 확인 경로: #5965 읽기 전용 중계의 HTTP 계약 하나.
// 1단계 자격 증명 검증자: 러브트리 발급자가 심은 서명 자격 증명(#49 이후 실제 모듈).
async function buildAuthenticate() {
  if (LOVETREE_AUTHORITY_TRANSPORT !== 'relay' || !LOVETREE_AUTHORITY_RELAY_URL || !LOVETREE_CALLER_SECRET || !LOVETREE_CREDENTIAL_MODULE) {
    console.warn('[lovetree-storage] 확인 경로 또는 자격 증명 검증자 미설정 — 모든 저장 요청을 거부합니다.');
    return unconfiguredAuth;
  }
  const module = await loadModule(LOVETREE_CREDENTIAL_MODULE, 'LOVETREE_CREDENTIAL_MODULE');
  const credential = module.createCredentialVerifier?.({ env: process.env, present: readSessionIdFromConfig() });
  if (!credential || typeof credential.verify !== 'function') {
    throw new Error('credential 모듈이 createCredentialVerifier({ env, present }) → { verify }를 내보내야 합니다.');
  }
  return createPadiemAuthorityAuth({
    credential,
    authority: createAuthorityRelayClient({ url: LOVETREE_AUTHORITY_RELAY_URL, callerSecret: LOVETREE_CALLER_SECRET, timeoutMs: Number(LOVETREE_AUTHORITY_TIMEOUT_MS || 0) || undefined }),
    productId: LOVETREE_PRODUCT_ID
  });
}

// 발급·폐기는 기존 인증 경계에서 한다. handoff 표를 받는 mint 경로(#5977)와 상태 저장소가
// 하나라도 없으면 로그인 라우트는 열지 않고 거부만 돌려준다. URL을 여기서 지어내지 않는다.
async function buildLogin(pool) {
  if (!LOVETREE_AUTHORITY_WRITE_TRANSPORT || !LOVETREE_LOGIN_PROVIDER_MODULE || !LOVETREE_SESSION_SECRET || !LOVETREE_STATE_STORE) {
    console.warn('[lovetree-storage] 발급 경로·로그인 공급자·자격 증명 비밀·상태 저장소 미설정 — /auth/* 는 거부만 합니다.');
    return null;
  }
  if (LOVETREE_STATE_STORE !== 'memory' && LOVETREE_STATE_STORE !== 'postgres') {
    throw new Error('LOVETREE_STATE_STORE는 memory(dev) 또는 postgres만 씁니다.');
  }
  if (LOVETREE_STATE_STORE === 'memory') console.warn('[lovetree-storage] 상태 저장소가 memory입니다 — 재시작·다중 인스턴스 검증에는 쓰지 마세요.');
  const stateStore = LOVETREE_STATE_STORE === 'postgres' ? createPostgresLoginStateStore(pool) : createMemoryLoginStateStore();

  const writeModule = await loadModule(LOVETREE_AUTHORITY_WRITE_TRANSPORT, 'LOVETREE_AUTHORITY_WRITE_TRANSPORT');
  const providerModule = await loadModule(LOVETREE_LOGIN_PROVIDER_MODULE, 'LOVETREE_LOGIN_PROVIDER_MODULE');
  const call = writeModule.createAuthorityWriteCall?.(process.env);
  const provider = providerModule.createLoginProvider?.({ env: process.env, productId: LOVETREE_PRODUCT_ID });
  if (typeof call !== 'function') throw new Error('write transport가 createAuthorityWriteCall(env) → call(method, payload)를 내보내야 합니다.');
  if (!provider || typeof provider.authorizationUrl !== 'function' || typeof provider.exchangeCode !== 'function') {
    throw new Error('login provider가 authorizationUrl·exchangeCode를 내보내야 합니다.');
  }
  const mint = LOVETREE_MINT_URL
    ? createHandoffMintClient({ url: LOVETREE_MINT_URL, callerSecret: LOVETREE_CALLER_SECRET, productId: LOVETREE_PRODUCT_ID, timeoutMs: Number(LOVETREE_AUTHORITY_TIMEOUT_MS || 0) || undefined })
    : undefined;
  return createLoginService({
    productId: LOVETREE_PRODUCT_ID,
    writer: createAuthorityWriter({ call, productId: LOVETREE_PRODUCT_ID, mint }),
    provider,
    credentialSecret: LOVETREE_SESSION_SECRET,
    stateStore,
    sessionMaxAgeSeconds: Number(LOVETREE_SESSION_MAX_AGE_SECONDS || 0) || undefined,
    cookieSecure: LOVETREE_COOKIE_SECURE !== 'false'
  });
}

const refusedLogin = () => ({ status: 503, body: { error: { code: 'auth_unavailable', message: '로그인 연결이 아직 준비되지 않았어요.' } } });

async function loginRoute(login, request) {
  if (!login) return refusedLogin();
  try { return await login.route(request); }
  catch (error) {
    if (error instanceof ApiError) return { status: error.status, body: { error: { code: error.code, message: error.message, ...(error.details ?? {}) } } };
    console.error('[lovetree-storage] 로그인 요청 처리 실패', { path: request.path, method: request.method });
    return { status: 500, body: { error: { code: 'internal_error', message: '서버에서 처리하지 못했어요.' } } };
  }
}

const maxBodyBytes = Number(LOVETREE_MAX_BODY_BYTES || 0) || undefined;
const pool = await createPool(LOVETREE_DATABASE_URL);
const repo = createWorkspaceRepo(pool);
const service = createWorkspaceService({ repo, productId: LOVETREE_PRODUCT_ID });
const legacyAuthenticate = await buildAuthenticate();
const authenticate = createSharedAccessAuth({ enabled: LOVETREE_SHARED_AUTH_ENABLED === 'true', legacy: legacyAuthenticate });
// #67 제품 역할. 표가 아직 없거나 저장이 망가진 자리에서는 역할 없음으로 닫힌다(fail-closed).
const admin = createAdminRoleService({ store: createAdminRoleRepo(pool), productId: LOVETREE_PRODUCT_ID });
const storageHandler = createApiHandler({ authenticate, service, productId: LOVETREE_PRODUCT_ID, maxBodyBytes, admin });
const login = await buildLogin(pool);

const requestHandler = async (request) => {
  if (String(request.path ?? '').startsWith('/auth/')) return loginRoute(login, request);
  return storageHandler(request);
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { host, port } = resolveListen({ env: process.env });
  createServer(createNodeHandler(requestHandler, { maxBodyBytes })).listen(port, host, () => {
    console.log(`lovetree storage api ${host}:${port}`);
  });
}
