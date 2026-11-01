import { createVerifier } from './padiem-access-verify.mjs';
const AUTH = 'https://auth.padiem.net';
const CLIENT = 'lovetree-4-0';
const CALLBACKS = ['https://lovetree-4-0.pages.dev/auth/callback', 'https://lovetree.padiem.net/auth/callback'];
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const un64 = s => Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), x => x.charCodeAt(0));
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
const j64 = x => b64(enc.encode(JSON.stringify(x)));
const cookies = request => Object.fromEntries((request.headers.get('cookie') || '').split(';').map(x => x.trim().split(/=(.*)/s).slice(0, 2)).filter(x => x.length === 2));
const attrs = 'Secure; HttpOnly; SameSite=Lax';
const json = (status, error) => new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const validNext = value => typeof value === 'string' && /^\/[A-Za-z0-9_./-]*$/.test(value) && !value.startsWith('//') ? value : '/';
function callbackFor(request, env) {
  const configured = env.LOVETREE_AUTH_CALLBACK_URI || CALLBACKS.find(value => new URL(value).origin === new URL(request.url).origin);
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.origin !== new URL(request.url).origin || url.pathname !== '/auth/callback' || url.search || url.hash || url.username || url.password) throw new Error('invalid callback');
  return url.href;
}
async function aesKey(env) {
  const bytes = un64(env.LOVETREE_AUTH_STATE_KEY || '');
  if (bytes.length !== 32) throw new Error('state key unavailable');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(env, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), enc.encode(JSON.stringify(value)));
  return `${b64(iv)}.${b64(cipher)}`;
}
async function unseal(env, token) {
  const parts = String(token || '').split('.'); if (parts.length !== 2) throw new Error('invalid state');
  const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: un64(parts[0]) }, await aesKey(env), un64(parts[1]));
  return JSON.parse(dec.decode(clear));
}
async function assertion(env, now) {
  const jwk = JSON.parse(env.LOVETREE_AUTH_CLIENT_PRIVATE_JWK || '{}');
  const kid = env.LOVETREE_AUTH_CLIENT_KID; if (!kid) throw new Error('client key unavailable');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const input = `${j64({ alg: 'ES256', kid })}.${j64({ iss: CLIENT, sub: CLIENT, aud: `${AUTH}/token`, iat: now, exp: now + 120, jti: random() })}`;
  return `${input}.${b64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(input)))}`;
}
class InvalidGrant extends Error {}
async function exchange(env, params, fetcher, now) {
  const body = new URLSearchParams({ client_id: CLIENT, client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: await assertion(env, now), ...params });
  const response = await fetcher(`${AUTH}/token`, { method: 'POST', body, redirect: 'manual' });
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    if (response.status === 400 && problem?.error === 'invalid_grant') throw new InvalidGrant();
    throw new Error('token exchange failed');
  }
  return response.json();
}
function issueCookies(tokens) {
  const h = new Headers({ 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
  h.append('set-cookie', `__Host-lovetree-access=${tokens.access_token}; Path=/; Max-Age=900; ${attrs}`);
  h.append('set-cookie', `lovetree_refresh=${tokens.refresh_token}; Path=/auth; Max-Age=2592000; ${attrs}`);
  // Non-secret marker lets the UI avoid changing the legacy 401 path.
  h.append('set-cookie', '__Host-lovetree-shared=1; Path=/; Max-Age=2592000; Secure; SameSite=Lax');
  h.append('set-cookie', `lovetree_auth_state=; Path=/auth; Max-Age=0; ${attrs}`);
  return h;
}
export function createSharedPagesAuth({ fetcher = fetch, now = () => Math.floor(Date.now()/1000), verify = createVerifier({ audience: CLIENT }) } = {}) {
  return async function shared(request, env) {
    const url = new URL(request.url), path = url.pathname, current = now(), jar = cookies(request);
    try {
      if (path === '/auth/login' && request.method === 'GET') {
        const state = random(), verifier = random(), next = validNext(url.searchParams.get('next'));
        const callback = callbackFor(request, env);
        const challenge = b64(await crypto.subtle.digest('SHA-256', enc.encode(verifier)));
        const target = new URL(`${AUTH}/login`);
        for (const [k,v] of Object.entries({ client_id: CLIENT, redirect_uri: callback, state, code_challenge: challenge, code_challenge_method: 'S256' })) target.searchParams.set(k,v);
        const sealed = await seal(env, { state, verifier, next, callback, exp: current + 600 });
        return new Response(null, { status: 302, headers: { location: target.href, 'cache-control': 'no-store', 'set-cookie': `lovetree_auth_state=${sealed}; Path=/auth; Max-Age=600; ${attrs}` } });
      }
      if (path === '/auth/callback' && request.method === 'GET') {
        const state = await unseal(env, jar.lovetree_auth_state);
        if (state.callback !== callbackFor(request, env) || state.exp <= current || !state.state || state.state !== url.searchParams.get('state') || !url.searchParams.get('code') || validNext(state.next) !== state.next) return json(401, 'invalid_state');
        const tokens = await exchange(env, { grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: callbackFor(request, env), code_verifier: state.verifier }, fetcher, current);
        await verify(tokens.access_token);
        if (typeof tokens.refresh_token !== 'string') throw new Error('missing refresh');
        const h = issueCookies(tokens); h.set('location', state.next); return new Response(null, { status: 302, headers: h });
      }
      if ((path === '/auth/refresh' || path === '/auth/logout') && request.method === 'POST') {
        if (request.headers.get('origin') !== url.origin) return json(403, 'invalid_origin');
        if (!jar.lovetree_refresh) return json(401, 'not_authenticated');
        if (path === '/auth/refresh') {
          const tokens = await exchange(env, { grant_type: 'refresh_token', refresh_token: jar.lovetree_refresh }, fetcher, current);
          await verify(tokens.access_token);
          if (typeof tokens.refresh_token !== 'string') throw new Error('missing refresh');
          return new Response(null, { status: 204, headers: issueCookies(tokens) });
        }
        const body = new URLSearchParams({ client_id: CLIENT, client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: await assertion(env, current), refresh_token: jar.lovetree_refresh });
        const response = await fetcher(`${AUTH}/logout`, { method: 'POST', body, redirect: 'manual' });
        if (!response.ok) throw new Error('logout failed');
        const h = new Headers({ 'cache-control': 'no-store' });
        h.append('set-cookie', `__Host-lovetree-access=; Path=/; Max-Age=0; ${attrs}`);
        h.append('set-cookie', `lovetree_refresh=; Path=/auth; Max-Age=0; ${attrs}`);
        h.append('set-cookie', '__Host-lovetree-shared=; Path=/; Max-Age=0; Secure; SameSite=Lax');
        return new Response(null, { status: 204, headers: h });
      }
      return json(404, 'not_found');
    } catch (error) {
      if (path === '/auth/refresh' && error instanceof InvalidGrant) {
        const response = json(401, 'not_authenticated');
        response.headers.append('set-cookie', `__Host-lovetree-access=; Path=/; Max-Age=0; ${attrs}`);
        response.headers.append('set-cookie', `lovetree_refresh=; Path=/auth; Max-Age=0; ${attrs}`);
        response.headers.append('set-cookie', '__Host-lovetree-shared=; Path=/; Max-Age=0; Secure; SameSite=Lax');
        return response;
      }
      return json(503, 'auth_unavailable');
    }
  };
}
