import { createProxy } from '../_lib/proxy.js';
import { createSharedPagesAuth } from '../_lib/shared-auth.mjs';

// #1175: 로그인 콜백이 거절되면 JSON을 브라우저에 그대로 보여 주지 않고 첫 화면으로 보낸다.
// 셸이 이 표지를 읽어 한 줄 안내와 다시 로그인 단추를 띄운다.
const LOGIN_FAILURE_NEXT = '/v41/?loginNotice=1';

function callbackFailureRedirect(response, path) {
  if (path !== '/auth/callback' || response.status < 400) return response;
  return new Response(null, { status: 302, headers: { location: LOGIN_FAILURE_NEXT, 'cache-control': 'no-store' } });
}

export function createAuthPagesHandler({ legacy = createProxy(), shared = createSharedPagesAuth() } = {}) {
  return async function onRequest(context) {
    const path = new URL(context.request.url).pathname;
    const run = async () => {
      if (context.env?.LOVETREE_SHARED_AUTH_ENABLED !== 'true') return legacy(context);
      const cookie = context.request.headers.get('cookie') || '';
      if (path === '/auth/callback' && !/(?:^|;\s*)lovetree_auth_state=/.test(cookie)) return legacy(context);
      if (path === '/auth/logout' && !/(?:^|;\s*)lovetree_refresh=/.test(cookie)) return legacy(context);
      return shared(context.request, context.env);
    };
    return callbackFailureRedirect(await run(), path);
  };
}

export const onRequest = createAuthPagesHandler();
