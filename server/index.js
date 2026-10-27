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

// 인증 권위(padiem-control-plane-identity)는 private service binding 전용이고 공개 fetch가 없다.
// 따라서 호출 경로를 이 저장소가 지어내지 않고, 배포 측이 준비한 두 모듈만 불러온다.
// - credential 모듈: 제시된 자격 증명의 진위를 확인해 세션 id를 확정한다(서명 검증 또는 발급·검증·폐기 계약).
// - transport 모듈: 확인된 RPC를 권위에 전달한다(중계 Worker 등).
// 지정자는 상대 경로 또는 file:// URL만 허용해 임의 패키지를 끌어쓰지 않는다.
// 둘 중 하나라도 없으면 거부한다. 세션 id를 읽는 것만으로 로그인을 열지 않는다.
async function buildAuthenticate() {
  if (!LOVETREE_AUTHORITY_TRANSPORT || !LOVETREE_CREDENTIAL_MODULE) {
    console.warn('[lovetree-storage] 자격 증명 검증자 또는 인증 transport 미설정 — 모든 저장 요청을 거부합니다.');
    return unconfiguredAuth;
  }
  const load = async (specifier, label) => {
    if (!(specifier.startsWith('./') || specifier.startsWith('file://'))) {
      throw new Error(`${label}는 ./ 상대 경로 또는 file:// URL만 쓸 수 있습니다.`);
    }
    const url = specifier.startsWith('file://') ? specifier : new URL(specifier, import.meta.url).href;
    return import(url);
  };
  const credentialModule = await load(LOVETREE_CREDENTIAL_MODULE, 'LOVETREE_CREDENTIAL_MODULE');
  const transportModule = await load(LOVETREE_AUTHORITY_TRANSPORT, 'LOVETREE_AUTHORITY_TRANSPORT');
  const call = transportModule.createAuthorityCall?.(process.env);
  if (typeof call !== 'function') throw new Error('transport 모듈이 createAuthorityCall(env) → call(method, payload)를 내보내야 합니다.');
  const credential = credentialModule.createCredentialVerifier?.({ env: process.env, present: readSessionIdFromConfig() });
  if (!credential || typeof credential.verify !== 'function') {
    throw new Error('credential 모듈이 createCredentialVerifier({ env, present }) → { verify }를 내보내야 합니다.');
  }
  return createPadiemAuthorityAuth({
    credential,
    call,
    productId: LOVETREE_PRODUCT_ID,
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
