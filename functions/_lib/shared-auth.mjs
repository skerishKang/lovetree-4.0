import { createVerifier } from './padiem-access-verify.mjs';
import { upstreamOrigin } from './proxy.js';
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
// 토큰 교환 응답의 사용자 정보(profile.email)를 러브트리 서버 DB에 담는 서버-간 내부 경로.
// 브라우저가 임의로 자기 이메일을 써 놓을 수 없게, 로그인 콜백 처리에서 받은 access 토큰과
// 토큰 서명에 실린 sub만 보내고 COM2는 같은 토큰을 JWKS로 검증한 뒤 sub가 일치해야 저장한다.
const ACCOUNT_EMAIL_PATH = '/internal/account/email';
// 프로필 클레임이 켜져 있으면 콜백에서 이메일을 모아 두고, 검증된 토큰이 인증한 계정에 한 번만
// 적어 둔다. 로그인 흐름을 막지 않도록 최선 노력(best effort)으로 보내고 실패는 삼킨다.
export async function recordAccountEmail(env, fetcher, tokens, verified) {
  try {
    const email = emailFromExchange(tokens);
    const accountId = verified?.accountId ?? verified?.subject;
    const origin = upstreamOrigin(env);
    if (!email || !accountId || !origin) return false;
    const signal = typeof AbortSignal === 'function' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(4000)
      : undefined;
    const response = await fetcher(`${origin}${ACCOUNT_EMAIL_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokens.access_token}` },
      body: JSON.stringify({ email, canonical_subject_id: accountId }),
      redirect: 'manual',
      ...(signal ? { signal } : {})
    });
    return response?.ok === true;
  } catch {
    return false;
  }
}
// 토큰 교환 응답의 사용자 정보에서 이메일만 꺼낸다. 사용자 정보가 없거나(공통 로그인 쪽
// 설정이 꺼져 있을 때) 이메일이 비어 있으면 ''를 돌려주고 로그인 자체는 실패하지 않는다.
function emailFromExchange(body) {
  return body?.profile && typeof body.profile.email === 'string' && body.profile.email.trim() ? body.profile.email.trim() : '';
}
// 로그인 뒤 돌아갈 자리. 기본값은 사이트 루트가 아니라 4.1 첫 화면이다.
const NEXT_DEFAULT = '/v41/';
const NEXT_ORIGIN = 'https://lovetree-4-0.pages.dev';
// 첫 화면이 되돌려 보내는 의도는 둘뿐이다(#215).
const NEXT_INTENTS = ['new-tree', 'shelf'];
// 경로는 영문·숫자·_ . - 로 된 조각만 허용한다('/v41/', '/v41/views/x.html' 등).
const NEXT_PATH = /^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]*$/;
// 정규식 하나로 통째로 판정하지 않고 URL로 풀어 경로·쿼리 키를 허용 목록과 맞춘다.
// `//evil.com`·`/\\evil`·`https://evil`·`#해시`·인코딩 우회·모르는 쿼리는 모두 기본값으로 떨어진다.
export function validNext(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) return NEXT_DEFAULT;
  if (!value.startsWith('/') || value.startsWith('//') || /[\\#]/.test(value) || /(?:^|\/)\.\.?(?:\/|$)/.test(value)) return NEXT_DEFAULT;
  let target;
  try { target = new URL(value, NEXT_ORIGIN); } catch { return NEXT_DEFAULT; }
  if (target.origin !== NEXT_ORIGIN || target.hash || target.username || target.password) return NEXT_DEFAULT;
  const keys = [...target.searchParams.keys()];
  if (keys.some(key => key !== 'intent')) return NEXT_DEFAULT;
  const intents = target.searchParams.getAll('intent');
  if (intents.length > 1) return NEXT_DEFAULT;
  if (intents.length === 1 && !NEXT_INTENTS.includes(intents[0])) return NEXT_DEFAULT;
  if (!NEXT_PATH.test(target.pathname)) return NEXT_DEFAULT;
  return intents.length === 1 ? `${target.pathname}?intent=${intents[0]}` : target.pathname;
}
// 공용 로그인은 night|garden만 받는다. 그 외 값·없음·중복은 붙이지 않고 공용 쪽 기본(night)을 따른다.
const LOGIN_THEMES = ['night', 'garden'];
const validTheme = values => values.length === 1 && LOGIN_THEMES.includes(values[0]) ? values[0] : '';
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
        const theme = validTheme(url.searchParams.getAll('lt_theme'));
        if (theme) target.searchParams.set('lt_theme', theme);
        const sealed = await seal(env, { state, verifier, next, callback, exp: current + 600 });
        return new Response(null, { status: 302, headers: { location: target.href, 'cache-control': 'no-store', 'set-cookie': `lovetree_auth_state=${sealed}; Path=/auth; Max-Age=600; ${attrs}` } });
      }
      if (path === '/auth/callback' && request.method === 'GET') {
        const state = await unseal(env, jar.lovetree_auth_state);
        if (state.callback !== callbackFor(request, env) || state.exp <= current || !state.state || state.state !== url.searchParams.get('state') || !url.searchParams.get('code') || validNext(state.next) !== state.next) return json(401, 'invalid_state');
        const tokens = await exchange(env, { grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: callbackFor(request, env), code_verifier: state.verifier }, fetcher, current);
        const verified = await verify(tokens.access_token);
        if (typeof tokens.refresh_token !== 'string') throw new Error('missing refresh');
        await recordAccountEmail(env, fetcher, tokens, verified);
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
