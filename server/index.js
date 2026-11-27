import { createPrivateMediaStore, createMediaHandler } from './private-media.js';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createPool, createWorkspaceRepo } from './db/postgres.js';
import { createShareRepo } from './db/shares-postgres.js';
import { createShareShowPendingRepo } from './db/share-show-pending-postgres.js';
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
import { createFeedbackOutboxRepo } from './db/feedback-outbox-postgres.js';
import { createFeedbackOutboxDispatcher } from './feedback-outbox-dispatcher.js';
import { createAdminCustomersRepo } from './db/admin-customers-postgres.js';
import { createAdminCustomersService, createAdminCustomersHandler } from './admin-customers.js';
import { createFeedbackService, createFeedbackHandler } from './feedback-service.js';
import { createOpsNotifier } from './ops-notify.js';
import { createYoutubeOembedHandler } from './youtube-oembed.js';
import { createSharedAccessAuth } from './padiem-access-auth.mjs';
import { ApiError } from './errors.js';
import { createAccountRepo } from './db/account-postgres.js';
import { createAccountDeleteRpcRepo } from './db/account-delete-rpc-postgres.js';
import { createAccountService } from './account-service.js';
import { createAccountEmailStore } from './account-email-store.js';
import { handlerForPath } from './route-handler.mjs';
import { verifyProxyProof, logProxyProofStartup, createProxyProofMismatchLogger, OPS_INGEST_PATH } from './proxy-proof.js';
import { createDeletedAccountGuard } from './account-guard.js';
import { createTrustedAccountDeleteHandler, createSharedAccountDeletionWorkflow } from './shared-account-deletion.js';
import { createVerifier } from './padiem-access-verify.mjs';

const {
  LOVETREE_DATABASE_URL = '',
  LOVETREE_PRODUCT_ID = '',
  LOVETREE_MAX_BODY_BYTES = '',
  LOVETREE_PROXY_SECRET = '',
  LOVETREE_PROXY_ENFORCE = '',
  LOVETREE_ACCOUNT_DELETE_RPC_SECRET = '',
  LOVETREE_IDENTITY_RPC_URL = '',
  LOVETREE_IDENTITY_RPC_SECRET = '',
 LOVETREE_FEEDBACK_OUTBOX_URL = '',
 LOVETREE_FEEDBACK_OUTBOX_SECRET = '',
 LOVETREE_FEEDBACK_OUTBOX_SEND_NAME = '',
  PORT = ''
} = process.env;

if (!LOVETREE_PRODUCT_ID) throw new Error('LOVETREE_PRODUCT_ID가 필요합니다. 인증 권위의 제품 ID와 같은 값을 씁니다.');
if (!LOVETREE_DATABASE_URL) throw new Error('LOVETREE_DATABASE_URL가 필요합니다. 없는 상태에서는 저장을 시작하지 않습니다.');

// #7944(대표 결정 11-24): 옛 로그인 경로(lovetree-auth-caller·lovetree-authority-caller)를 걷어 냈다.
// 로그인·세션은 공용 로그인(auth.padiem.net)과 Pages 콜백(functions/_lib/shared-auth.mjs)만 쓴다.
// 공용 접근 쿠키가 없는 요청은 옛 경로로 넘기지 않고 로그인 필요로 닫는다.
const noLegacySession = async () => { throw new ApiError(401, 'unauthenticated', '로그인이 필요해요.'); };
// 옛 /auth/* API 라우트는 닫혀 있다 — 로그인은 Pages(/auth/*)가 공용 로그인으로 처리한다.
const retiredLogin = () => ({ status: 410, body: { error: { code: 'auth_moved', message: '로그인은 공용 로그인으로 옮겼어요.' } } });

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
const rankingPolicy = { hasRealCustomers: hasRealCustomersFromEnv(process.env) };
const communityRepo = createMyNewsRepo(createMomentCommunityRepo(createCommunityRepo(pool, rankingPolicy), pool), pool);
const shareShowPending = createShareShowPendingRepo(pool);
const shareService = createShareService({
  shareRepo,
  communityRepo,
  stageIndex,
  workspaceRepo: repo,
  visibilityRepo,
  discoverRepo,
  pendingShowSync: shareShowPending,
  productId: LOVETREE_PRODUCT_ID,
  admin
});
const service = createWorkspaceService({
  repo,
  productId: LOVETREE_PRODUCT_ID,
  onCommit: ({ subjectId, changedTreeIds }) => shareService.afterSave(subjectId, changedTreeIds),
  onAccess: ({ subjectId }) => shareService.retryPendingVisibleSync(subjectId).catch(() => {})
});
const authenticate = createSharedAccessAuth({ enabled: true, legacy: noLegacySession });
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
// #1098 2·3단계 — 순간 단위 ♡·댓글과 내 소식. 반응·댓글·신고 저장소에 순간 메서드·내 소식 메서드를 덧붙인 한 벌을
// 세 서비스가 같이 쓰고, 내 소식 경로는 새 핸들러가, 순간 경로는 moment 핸들러가, 나머지 커뮤니티 경로는 기존
// 핸들러가 그대로 맡는다(fallback — 분기는 각 핸들러 안에서).
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
const feedbackRepo = createFeedbackRepo(pool);
const adminCustomersRepoForNames = createAdminCustomersRepo(pool);
const feedbackOutbox = createFeedbackOutboxRepo(pool);
const feedbackOutboxDispatcher = createFeedbackOutboxDispatcher({
  outbox: feedbackOutbox,
  receiverUrl: LOVETREE_FEEDBACK_OUTBOX_URL,
  secret: LOVETREE_FEEDBACK_OUTBOX_SECRET
});
const feedbackHandler = createFeedbackHandler({
 authenticate: guardedAuthenticate,
 service: createFeedbackService({
  feedbackRepo, productId: LOVETREE_PRODUCT_ID, admin, opsNotify, outbox: feedbackOutbox,
  // 받는 운영센터가 보낸 사람 닉네임 항목을 받을 수 있게 된 뒤에만 켠다(받는 쪽은 모르는 항목을 거절한다).
  nameOf: LOVETREE_FEEDBACK_OUTBOX_SEND_NAME === '1'
   ? (subjectId) => adminCustomersRepoForNames.displayNameOf({ productId: LOVETREE_PRODUCT_ID, subjectId })
   : null
 }),
 productId: LOVETREE_PRODUCT_ID
});
// 운영센터 고객 정보(261116 대표 결정) — 읽기만 한다. 자세히 판을 열 때 열람 기록을 남기고,
// 올린 사진은 관리자 인증으로만 내려받는다(mediaStore 를 같이 쓴다).
const adminCustomersHandler = createAdminCustomersHandler({
 authenticate: guardedAuthenticate,
 service: createAdminCustomersService({
  repo: createAdminCustomersRepo(pool),
  feedbackRepo,
  productId: LOVETREE_PRODUCT_ID,
  admin,
  mediaStore
 }),
 productId: LOVETREE_PRODUCT_ID
});
const youtubeOembedHandler = createYoutubeOembedHandler({ authenticate: guardedAuthenticate, productId: LOVETREE_PRODUCT_ID });
const mediaHandler = createMediaHandler({
 authenticate: guardedAuthenticate, productId: LOVETREE_PRODUCT_ID,
 store: mediaStore,
 publicOrigin: process.env.LOVETREE_PUBLIC_ORIGIN,
 additionalPublicOrigins: (process.env.LOVETREE_ADDITIONAL_PUBLIC_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean)
});

// 분기는 route-handler.mjs 한 곳에 둔다 — 프록시 허용 경로 표와 같은 함수로 검사한다(#1047).
const handlers = {
  trusted: (request) => request.path === '/internal/account/delete' ? trustedAccountDelete(request) : trustedAccountEmail(request),
  auth: () => retiredLogin(),
  media: (request) => mediaHandler(request),
  share: (request) => shareHandler(request),
  community: (request) => communityHandler(request),
  feedback: (request) => feedbackHandler(request),
  adminCustomers: (request) => adminCustomersHandler(request),
  youtube: (request) => youtubeOembedHandler(request),
  storage: (request) => storageHandler(request)
};
const proxyProofLog = entry => console.warn('[lovetree-proxy-proof]', JSON.stringify(entry));
const recordProxyProofMismatch = createProxyProofMismatchLogger({ log: proxyProofLog });
logProxyProofStartup({ secret: LOVETREE_PROXY_SECRET, enforce: LOVETREE_PROXY_ENFORCE === '1', log: proxyProofLog });

const requestHandler = async (request) => {
  const proof = verifyProxyProof(request, {
    secret: LOVETREE_PROXY_SECRET,
    enforce: LOVETREE_PROXY_ENFORCE === '1'
  });
  if (proof.reason === 'mismatch') recordProxyProofMismatch(request, LOVETREE_PROXY_SECRET);
  if (!proof.ok && request.path === OPS_INGEST_PATH) return {status:proof.reason==='unavailable'?503:401,body:{error:{code:'proxy_proof_required',message:'운영센터 요청을 확인할 수 없어요.'}}};
  if (!proof.ok) return { status: 403, body: { error: { code: 'proxy_proof_required', message: '요청 출처를 확인할 수 없어요.' } } };
  return handlers[handlerForPath(request.path)](request);
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { host, port } = resolveListen({ env: process.env });
  createServer(createNodeHandler(requestHandler, {
  maxBodyBytes,
  // #1190: 응답을 돌려준 뒤 남은 보낼 줄을 처리한다(새 데몬 없이 기존 요청 흐름 사용).
  afterResponse: () => feedbackOutboxDispatcher.drain()
})).listen(port, host, () => {
  // 서버를 다시 띄울 때도 남은 줄을 한 번 확인한다.
  void feedbackOutboxDispatcher.drain();
    console.log(`lovetree storage api ${host}:${port}`);
  });
}
