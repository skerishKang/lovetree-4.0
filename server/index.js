import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createWorkspaceRepoFromUrl } from './db/postgres.js';
import { createApiHandler, createNodeHandler } from './http.js';
import { createWorkspaceService } from './workspace-service.js';
import { createPadiemAuthorityAuth } from './padiem-authority-auth.js';
import { fromBearer, fromCookie } from './session-credential.js';
import { unconfiguredAuth } from './auth.js';

const {
  LOVETREE_DATABASE_URL = '',
  LOVETREE_PRODUCT_ID = '',
  LOVETREE_MAX_BODY_BYTES = '',
  LOVETREE_AUTHORITY_TRANSPORT = '',
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

// 인증 권위(padiem-control-plane-identity)는 private service binding 전용이고 공개 fetch가 없다.
// 따라서 호출 경로를 이 저장소가 지어내지 않고, 배포 측이 준비한 transport 모듈만 불러온다.
// 지정자는 상대 경로 또는 file:// URL만 허용해 임의 패키지를 끌어쓰지 않는다.
async function buildAuthenticate() {
  if (!LOVETREE_AUTHORITY_TRANSPORT) {
    console.warn('[lovetree-storage] 인증 transport 미설정 — 모든 저장 요청을 거부합니다.');
    return unconfiguredAuth;
  }
  if (!(LOVETREE_AUTHORITY_TRANSPORT.startsWith('./') || LOVETREE_AUTHORITY_TRANSPORT.startsWith('file://'))) {
    throw new Error('LOVETREE_AUTHORITY_TRANSPORT는 ./ 상대 경로 또는 file:// URL만 쓸 수 있습니다.');
  }
  const specifier = LOVETREE_AUTHORITY_TRANSPORT.startsWith('file://')
    ? LOVETREE_AUTHORITY_TRANSPORT
    : new URL(LOVETREE_AUTHORITY_TRANSPORT, import.meta.url).href;
  const module = await import(specifier);
  const call = module.createAuthorityCall?.(process.env);
  if (typeof call !== 'function') throw new Error('transport 모듈이 createAuthorityCall(env) → call(method, payload)를 내보내야 합니다.');
  return createPadiemAuthorityAuth({
    call,
    productId: LOVETREE_PRODUCT_ID,
    readSessionId: readSessionIdFromConfig(),
    timeoutMs: Number(LOVETREE_AUTHORITY_TIMEOUT_MS || 0) || undefined
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
