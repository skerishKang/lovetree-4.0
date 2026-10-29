import { createProxy } from '../_lib/proxy.js';

const proxy = createProxy();
const preview = 'https://ai-astra4-preview-auth-callb.lovetree-4-0.pages.dev';
export function onRequest(context) {
  const url = new URL(context.request.url);
  // Trial branch only: read the existing workspace, never write to it.
  // Remove this exception before merging the PR.
  if (url.origin === preview && url.pathname === '/api/workspace') {
    if (context.request.method !== 'GET') return new Response(null, { status: 405 });
    return proxy({ ...context, env: { ...context.env, LOVETREE_API_ORIGIN: context.env?.LOVETREE_TRIAL_API_ORIGIN } });
  }
  return proxy(context);
}
