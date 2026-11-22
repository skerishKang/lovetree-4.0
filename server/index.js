import { logServerError } from './error-log.js';
import { createPrivateMediaStore, createMediaHandler } from './private-media.js';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createPool, createWorkspaceRepo } from './db/postgres.js';
import { createShareRepo } from './db/shares-postgres.js';
import { createStageIndexRepo } from './db/stage-index-postgres.js';
import { createTreeVisibilityRepo } from './db/tree-visibility-postgres.js';
import { createTreeDiscoverRepo } from './db/tree-discover-postgres.js';
import { createCommunityRepo } from './db/community-postgres.js';
import { hasRealCustomersFromEnv } from './db/ranking-policy-sql.js';
import { createStageVoteRepo } from './db/stage-votes-postgres.js';
import { createAdminRoleRepo } from './db/admin-roles-postgres.js';
import { createAdminRoleService } from './admin-roles.js';
import { createAdminStatsService } from './admin-stats.js';
import { createStatsRepo } from './db/stats-postgres.js';
import { resolveListen } from './listen-config.js';
import { createApiHandler, createNodeHandler } from './http.js';
import { createWorkspaceService } from './workspace-service.js';
import { createShareService, createShareHandler } from './share-service.js';
import { createCommunityService, createCommunityHandler } from './community-service.js';
import { createMomentCommunityService, createMomentCommunityHandler } from './moment-community-service.js';
import { createMomentCommunityRepo } from './db/moment-community-postgres.js';
import { createMyNewsService, createMyNewsHandler } from './my-news-service.js';
import { createMyNewsRepo } from './db/my-news-postgres.js';
import { createFeedbackRepo } from './db/feedback-postgres.js';
import { createAdminCustomersRepo } from './db/admin-customers-postgres.js';
import { createAdminCustomersService, createAdminCustomersHandler } from './admin-customers.js';
import { createFeedbackService, createFeedbackHandler } from './feedback-service.js';
import { createOpsNotifier } from './ops-notify.js';
import { createYoutubeOembedHandler } from './youtube-oembed.js';
import { createPadiemAuthorityAuth } from './padiem-authority-auth.js';
import { createSharedAccessAuth, sharedAuthEnabled } from './padiem-access-auth.mjs';
import { createAuthorityRelayClient } from './authority-relay-transport.js';
import { createAuthorityWriter } from './authority-writer.js';
import { createLoginService } from './login-service.js';
import { fromBearer, fromCookie } from './session-credential.js';
import { unconfiguredAuth } from './auth.js';
import { createMemoryLoginStateStore, createPostgresLoginStateStore } from './login-state-store.js';
import { createHandoffMintClient } from './handoff-mint-client.js';
import { ApiError } from './errors.js';
import { createAccountRepo } from './db/account-postgres.js';
import { createAccountDeleteRpcRepo } from './db/account-delete-rpc-postgres.js';
import { createAccountService } from './account-service.js';
import { createAccountEmailStore } from './account-email-store.js';
import { handlerForPath } from './route-handler.mjs';
import { verifyProxyProof, logProxyProofStartup } from './proxy-proof.js';
import { createDeletedAccountGuard } from './account-guard.js';
import { createTrustedAccountDeleteHandler, createSharedAccountDeletionWorkflow } from './shared-account-deletion.js';
import { createVerifier } from './padiem-access-verify.mjs';

const {
  LOVETREE_SHARED_AUTH_ENABLED = '',
  LOVETREE_DATABASE_URL = '',
  LOVETREE_PRODUCT_ID = '',
  LOVETREE_MAX_BODY_BYTES = '',
  LOVETREE_PROXY_SECRET = '',
  LOVETREE_PROXY_ENFORCE = '',
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
  LOVETREE_ACCOUNT_DELETE_RPC_SECRET = '',
  LOVETREE_IDENTITY_RPC_URL = '',
  LOVETREE_IDENTITY_RPC_SECRET = '',
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
    logServerError(error, 'lovetree-login');
    return { status: 500, body: { error: { code: 'internal_error', message: '서버에서 처리하지 못했어요.' } } };
  }
}

const maxBodyBytes = Number(LOVETREE_MAX_BODY_BYTES || 0) || undefined;
const pool = await createPool(LOVETREE_DATABASE_URL);
const repo = createWorkspaceRepo(pool);
// #538 공개가 기본: 공유 행이 트리의 공개 핸들이다. 저장 성공 뒤 같은 훅에서 자동 공개 행과
// moment_count 를 동기화하고, 둘러보기 SQL 은 moment_count>=3 으로 거른다.
// 비공개는 누구나 무료로 바꿀 수 있다 — 본인 트리만 바꿀 수 있다(#830).
const shareRepo = createShareRepo(pool);
const stageIndex = createStageIndexRepo(pool);
const visibilityRepo = createTreeVisibilityRepo(pool);
// 둘러보기 소개 표시(2026-11-16 대표 결정 — 기본 꺼짐, 고객이 켠다. 무료). 켠 트리만 행이 쌓인다.
const discoverRepo = createTreeDiscoverRepo(pool);
// #67 제품 역할. 표가 아직 없거나 저장이 망가진 자리에서는 역할 없음으로 닫힌다(fail-closed).
const admin = createAdminRoleService({ store: createAdminRoleRepo(pool, { stageIndex }), productId: LOVETREE_PRODUCT_ID });
// #655 2차 운영센터 전체 숫자. 집계는 저장소 안에서 한 번에 끝내고(전체 행을 읽어 오지 않는다)
// 서비스는 숫자만 다듬는다. 이 자리는 운영센터 화면만 부르며 권한은 storageHandler 가 판정한다.
const adminStats = createAdminStatsService({ repo: createStatsRepo(pool), productId: LOVETREE_PRODUCT_ID });
const shareService = createShareService({
  shareRepo,
  stageIndex,
  workspaceRepo: repo,
  visibilityRepo,
  discoverRepo,
  productId: LOVETREE_PRODUCT_ID,
  admin
});
const service = createWorkspaceService({
  repo,
  productId: LOVETREE_PRODUCT_ID,
  onCommit: ({ subjectId, changedTreeIds }) => shareService.syncSharesAfterSave(subjectId, changedTreeIds)
});
const legacyAuthenticate = await buildAuthenticate();
const authenticate = createSharedAccessAuth({ enabled: sharedAuthEnabled(LOVETREE_SHARED_AUTH_ENABLED), legacy: legacyAuthenticate });
// 계정 탈퇴 (2026-11-03). 파일 저장소는 미디어 경로와 같은 인스턴스를 쓴다 — 삭제가 같은 폴더를 정리한다.
const mediaStore = process.env.LOVETREE_MEDIA_DIR ? createPrivateMediaStore({ directory: process.env.LOVETREE_MEDIA_DIR }) : null;
const accountRepo = createAccountRepo(pool);
const accountService = createAccountService({ repo: accountRepo, productId: LOVETREE_PRODUCT_ID, admin, mediaStore });
const accountDeleteRpcRepo = createAccountDeleteRpcRepo(pool);
const accountDeletionWorkflow = createSharedAccountDeletionWorkflow({
  productId: LOVETREE_PRODUCT_ID,
  identityRpcUrl: LOVETREE_IDENTITY_RPC_URL,
  identityRpcSecret: LOVETREE_IDENTITY_RPC_SECRET,
  accountDeleteRpcSecret: LOVETREE_ACCOUNT_DELETE_RPC_SECRET
});
const trustedAccountDelete = createTrustedAccountDeleteHandler({
  account: accountService,
  productId: LOVETREE_PRODUCT_ID,
  secret: LOVETREE_ACCOUNT_DELETE_RPC_SECRET,
  claimServiceRequest: (entry) => accountDeleteRpcRepo.claimServiceRequest(entry)
});
const trustedAccountEmail = createAccountEmailStore({
  repo: accountRepo,
  productId: LOVETREE_PRODUCT_ID,
  verify: createVerifier({ audience: LOVETREE_PRODUCT_ID })
});
void accountDeleteRpcRepo.pruneExpiredAccountDeletionAudits().catch(() => {});
const accountDeletionRetentionTimer = setInterval(() => {
  void accountDeleteRpcRepo.pruneExpiredAccountDeletionAudits().catch(() => {});
}, 24 * 60 * 60 * 1000);
accountDeletionRetentionTimer.unref?.();
// 탈퇴한 계정의 옛 자격 증명은 계정 탈퇴 외 모든 API 경계에서 거부한다.
const guardedAuthenticate = createDeletedAccountGuard({ authenticate, account: accountService, productId: LOVETREE_PRODUCT_ID });
const publicOrigins = [process.env.LOVETREE_PUBLIC_ORIGIN, ...(process.env.LOVETREE_ADDITIONAL_PUBLIC_ORIGINS || '').split(',')]
  .map((origin) => String(origin || '').trim()).filter(Boolean);
const storageHandler = createApiHandler({
  authenticate: guardedAuthenticate,
  accountDeleteAuthenticate: authenticate,
  accountDeleteWorkflow: accountDeletionWorkflow,
  service,
  productId: LOVETREE_PRODUCT_ID,
  maxBodyBytes,
  admin,
  adminStats,
  account: accountService,
  allowedOrigins: publicOrigins
});
const shareHandler = createShareHandler({
 authenticate: guardedAuthenticate,
 service: shareService,
 productId: LOVETREE_PRODUCT_ID
});
const rankingPolicy = { hasRealCustomers: hasRealCustomersFromEnv(process.env) };
// #1098 2·3단계 — 순간 단위 ♡·댓글과 내 소식. 반응·댓글·신고 저장소에 순간 메서드·내 소식 메서드를 덧붙인 한 벌을
// 세 서비스가 같이 쓰고, 내 소식 경로는 새 핸들러가, 순간 경로는 moment 핸들러가, 나머지 커뮤니티 경로는 기존
// 핸들러가 그대로 맡는다(fallback — 분기는 각 핸들러 안에서).
const communityRepo = createMyNewsRepo(createMomentCommunityRepo(createCommunityRepo(pool, rankingPolicy), pool), pool);
const communityHandler = createMyNewsHandler({
 authenticate: guardedAuthenticate,
 service: createMyNewsService({communityRepo, productId: LOVETREE_PRODUCT_ID}),
 productId: LOVETREE_PRODUCT_ID,
 fallback: createMomentCommunityHandler({
  authenticate: guardedAuthenticate,
  service: createMomentCommunityService({
   communityRepo,
   shareRepo, workspaceRepo: repo, visibilityRepo,
   productId: LOVETREE_PRODUCT_ID, admin
  }),
  productId: LOVETREE_PRODUCT_ID,
  fallback: createCommunityHandler({
   authenticate: guardedAuthenticate,
   service: createCommunityService({
    communityRepo, stageVoteRepo: createStageVoteRepo(pool, rankingPolicy),
    shareRepo, workspaceRepo: repo, visibilityRepo, stageIndex,
    productId: LOVETREE_PRODUCT_ID, admin,
    // 가입일(첫 로그인 시각) — 담기 투표의 7일 게이트(#824 대표 결정)가 쓴다.
    signupAtFor: ({productId: p, subjectId: s}) => accountRepo.createdAtFor({productId: p, subjectId: s})
   }),
   productId: LOVETREE_PRODUCT_ID
  })
 })
});
// 고객 의견 창구 (#540). 로그인·로그아웃 모두 받는다 — 그래서 인증 경계는 guardedAuthenticate를 그대로 쓰되,
// 핸들러가 401을 '로그아웃'으로 받아들인다.
const opsNotify = createOpsNotifier();
const feedbackHandler = createFeedbackHandler({
 authenticate: guardedAuthenticate,
 service: createFeedbackService({ feedbackRepo: createFeedbackRepo(pool), productId: LOVETREE_PRODUCT_ID, admin, opsNotify }),
 productId: LOVETREE_PRODUCT_ID
});
// 운영센터 고객 정보(261116 대표 결정) — 읽기만 한다. 자세히 판을 열 때 열람 기록을 남기고,
// 올린 사진은 관리자 인증으로만 내려받는다(mediaStore 를 같이 쓴다).
const adminCustomersHandler = createAdminCustomersHandler({
 authenticate: guardedAuthenticate,
 service: createAdminCustomersService({
  repo: createAdminCustomersRepo(pool),
  feedbackRepo: createFeedbackRepo(pool),
  productId: LOVETREE_PRODUCT_ID,
  admin,
  mediaStore
 }),
 productId: LOVETREE_PRODUCT_ID
});
const youtubeOembedHandler = createYoutubeOembedHandler({ authenticate: guardedAuthenticate, productId: LOVETREE_PRODUCT_ID });
const login = await buildLogin(pool);
const mediaHandler = createMediaHandler({
 authenticate: guardedAuthenticate, productId: LOVETREE_PRODUCT_ID,
 store: mediaStore,
 publicOrigin: process.env.LOVETREE_PUBLIC_ORIGIN,
 additionalPublicOrigins: (process.env.LOVETREE_ADDITIONAL_PUBLIC_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean)
});

// 분기는 route-handler.mjs 한 곳에 둔다 — 프록시 허용 경로 표와 같은 함수로 검사한다(#1047).
const handlers = {
  trusted: (request) => request.path === '/internal/account/delete' ? trustedAccountDelete(request) : trustedAccountEmail(request),
  auth: (request) => loginRoute(login, request),
  media: (request) => mediaHandler(request),
  share: (request) => shareHandler(request),
  community: (request) => communityHandler(request),
  feedback: (request) => feedbackHandler(request),
  adminCustomers: (request) => adminCustomersHandler(request),
  youtube: (request) => youtubeOembedHandler(request),
  storage: (request) => storageHandler(request)
};
const proxyProofLog = entry => console.warn('[lovetree-proxy-proof]', JSON.stringify(entry));
logProxyProofStartup({ secret: LOVETREE_PROXY_SECRET, enforce: LOVETREE_PROXY_ENFORCE === '1', log: proxyProofLog });

const requestHandler = async (request) => {
  const proof = verifyProxyProof(request, {
    secret: LOVETREE_PROXY_SECRET,
    enforce: LOVETREE_PROXY_ENFORCE === '1'
  });
  if (proof.reason === 'mismatch') proxyProofLog({ result: 'mismatch' });
  if (!proof.ok) return { status: 403, body: { error: { code: 'proxy_proof_required', message: '요청 출처를 확인할 수 없어요.' } } };
  return handlers[handlerForPath(request.path)](request);
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { host, port } = resolveListen({ env: process.env });
  createServer(createNodeHandler(requestHandler, { maxBodyBytes })).listen(port, host, () => {
    console.log(`lovetree storage api ${host}:${port}`);
  });
}
