import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createWorkspaceRepoFromUrl } from './db/postgres.js';
import { createApiHandler, createNodeHandler } from './http.js';
import { createWorkspaceService } from './workspace-service.js';
import { createPadiemAuthorityAuth } from './padiem-authority-auth.js';
import { createAuthorityClient } from './authority-relay-transport.js';
import { fromBearer, fromCookie } from './session-credential.js';
import { unconfiguredAuth } from './auth.js';

const {
  LOVETREE_DATABASE_URL = '',
  LOVETREE_PRODUCT_ID = '',
  LOVETREE_MAX_BODY_BYTES = '',
  LOVETREE_AUTHORITY_TRANSPORT = '',
  LOVETREE_AUTHORITY_RELAY_URL = '',
  LOVETREE_CALLER_SECRET = '',
  LOVETREE_CREDENTIAL_MODULE = '',
  LOVETREE_SESSION_SOURCE = '',
  LOVETREE_SESSION_COOKIE = '',
  LOVETREE_AUTHORITY_TIMEOUT_MS = '',
  PORT = '8788'
} = process.env;

if (!LOVETREE_PRODUCT_ID) throw new Error('LOVETREE_PRODUCT_ID가 필요합니다. 인증 권위의 제품 ID와 같은 값을 씁니다.');
if (!LOVETREE_DATABASE_URL) throw new Error('LOVETREE_DATABASE_URL가 필요합니다. 없는 상태에서는 저장을 시작하지 않습니다.');

function readSessionIdFromConfig() {
  if (LOVETREE_SESSION_SOURCE === 'cookie') return fromCookie(LOVETREE_SESSION_COOKIE);
  if (LOVETREE_SESSION_SOURCE === 'bearer') return fromBearer();
  throw new Error('LOVETREE_SESSION_SOURCE는 cookie 또는 bearer로 명시해야 합니다.');
}

// 2단계(세션 확인)는 ai-revenue-lab#5965 중계의 HTTP 계약으로 붙는다.
// 1단계(자격 증명 진위)는 러브트리 발급 경로가 정해지지 않아 배포 주입으로 남긴다.
// 둘 중 하나라도 없으면 거부한다 — 세션 id를 읽는 것만으로 로그인을 열지 않는다.
async function buildAuthenticate() {
  const transportChosen = LOVETREE_AUTHORITY_TRANSPORT === 'relay';
  if (!transportChosen || !LOVETREE_AUTHORITY_RELAY_URL || !LOVETREE_CALLER_SECRET || !LOVETREE_CREDENTIAL_MODULE) {
    console.warn('[lovetree-storage] 확인 경로 또는 자격 증명 검증자 미설정 — 모든 저장 요청을 거부합니다.');
    return unconfiguredAuth;
  }
  if (!(LOVETREE_CREDENTIAL_MODULE.startsWith('./') || LOVETREE_CREDENTIAL_MODULE.startsWith('file://'))) {
    throw new Error('LOVETREE_CREDENTIAL_MODULE는 ./ 상대 경로 또는 file:// URL만 쓸 수 있습니다.');
  }
  const url = LOVETREE_CREDENTIAL_MODULE.startsWith('file://')
    ? LOVETREE_CREDENTIAL_MODULE
    : new URL(LOVETREE_CREDENTIAL_MODULE, import.meta.url).href;
  const module = await import(url);
  const credential = module.createCredentialVerifier?.({ env: process.env, present: readSessionIdFromConfig() });
  if (!credential || typeof credential.verify !== 'function') {
    throw new Error('credential 모듈이 createCredentialVerifier({ env, present }) → { verify }를 내보내야 합니다.');
  }
  return createPadiemAuthorityAuth({
    credential,
    authority: createAuthorityClient({ env: process.env }),
    productId: LOVETREE_PRODUCT_ID
  });
}

const maxBodyBytes = Number(LOVETREE_MAX_BODY_BYTES || 0) || undefined;
const repo = await createWorkspaceRepoFromUrl(LOVETREE_DATABASE_URL);
const service = createWorkspaceService({ repo, productId: LOVETREE_PRODUCT_ID });
const authenticate = await buildAuthenticate();
const requestHandler = createApiHandler({ authenticate, service, productId: LOVETREE_PRODUCT_ID, maxBodyBytes });

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  createServer(createNodeHandler(requestHandler, { maxBodyBytes })).listen(Number(PORT), () => {
    console.log(`lovetree storage api :${PORT}`);
  });
}
