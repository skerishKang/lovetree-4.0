import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createWorkspaceRepoFromUrl } from './db/postgres.js';
import { createApiHandler, createNodeHandler } from './http.js';
import { createWorkspaceService } from './workspace-service.js';
import { unconfiguredAuth } from './auth.js';

const {
  LOVETREE_DATABASE_URL = '',
  LOVETREE_PRODUCT_ID = '',
  LOVETREE_MAX_BODY_BYTES = '',
  PORT = '8788'
} = process.env;

if (!LOVETREE_PRODUCT_ID) throw new Error('LOVETREE_PRODUCT_ID가 필요합니다. 인증 권위의 제품 ID와 같은 값을 씁니다.');
if (!LOVETREE_DATABASE_URL) throw new Error('LOVETREE_DATABASE_URL가 필요합니다. 없는 상태에서는 저장을 시작하지 않습니다.');

const maxBodyBytes = Number(LOVETREE_MAX_BODY_BYTES || 0) || undefined;
const repo = await createWorkspaceRepoFromUrl(LOVETREE_DATABASE_URL);
const service = createWorkspaceService({ repo, productId: LOVETREE_PRODUCT_ID });

// PADIEM Control Plane 연결(러브트리 제품 ID로 여는 identity bridge)이 이 자리에 들어온다.
// 연결이 없는 지금은 우회로 없이 모든 요청을 거부한다.
const authenticate = unconfiguredAuth;
const requestHandler = createApiHandler({ authenticate, service, productId: LOVETREE_PRODUCT_ID, maxBodyBytes });

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  createServer(createNodeHandler(requestHandler, { maxBodyBytes })).listen(Number(PORT), () => {
    console.log(`lovetree storage api :${PORT}`);
  });
}
