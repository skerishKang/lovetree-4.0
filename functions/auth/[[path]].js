import { createProxy } from '../_lib/proxy.js';
import { createSharedPagesAuth } from '../_lib/shared-auth.mjs';

const legacy = createProxy();
const shared = createSharedPagesAuth();
export async function onRequest(context) {
  // Draft-only trial: scope the opt-in to this exact Pages branch hostname.
  // Remove this trial exception before merging the PR.
  const preview = 'https://ai-astra4-preview-auth-callb.lovetree-4-0.pages.dev';
  if (context.env?.LOVETREE_SHARED_AUTH_ENABLED !== 'true' && new URL(context.request.url).origin !== preview) return legacy(context);
  const path = new URL(context.request.url).pathname;
  const cookie = context.request.headers.get('cookie') || '';
  if (path === '/auth/callback' && !/(?:^|;\s*)lovetree_auth_state=/.test(cookie)) return legacy(context);
  if (path === '/auth/logout' && !/(?:^|;\s*)lovetree_refresh=/.test(cookie)) return legacy(context);
  return shared(context.request, context.env);
}
