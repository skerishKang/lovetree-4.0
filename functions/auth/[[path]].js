import { handleProxy } from '../../proxy/pages-api-proxy.js';

// /auth/login·/auth/callback·/auth/logout만 넘긴다. 302와 Set-Cookie는 재작성하지 않는다.
export function onRequest(context) {
  return handleProxy(context);
}
