import { randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from './errors.js';
import {
  SESSION_COOKIE,
  STATE_COOKIE,
  cookieAttributes,
  isSafeRelativePath,
  mintSessionToken,
  mintStateToken,
  readSessionToken,
  readStateToken
} from './credentials/lovetree-session.js';

const DEFAULT_NEXT = '/workspace';

function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return out;
}

function sameValue(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const seconds = (date) => Math.floor(date.getTime() / 1000);

/**
 * 러브트리 로그인 발급·폐기 서비스.
 *
 * 증거는 `provider.exchangeCode`가 서버에서 확인해 돌려준 값만 쓴다(이메일로 계정을 합치지 않고,
 * 요청이 준 사용자 ID는 받지 않는다). 발급·폐기는 Control Plane 권위(writer)에서 하고,
 * 브라우저에는 러브트리 자기 자격 증명만 심는다(Chat 비밀·제품 ID 무관).
 *
 * 콜백 보호: 상태 값은 서명된 쿠키로만 받고 조회 값과 상수시간으로 비교하며 한 번만 쓴다.
 * 이동할 주소는 로그인 시작 시 서명된 상대 경로만 따라간다 — 쿼리가 주는 외부 주소는 무시한다.
 */
export function createLoginService({ productId, writer, provider, credentialSecret, sessionMaxAgeSeconds = 3600, cookieSecure = true, now = () => new Date(), usedStates = new Set() }) {
  if (typeof productId !== 'string' || !productId) throw new Error('LOVETREE_PRODUCT_ID가 필요합니다.');
  if (!writer || typeof writer.issue !== 'function' || typeof writer.revoke !== 'function') throw new Error('권위 발급·폐기 경계가 필요합니다.');
  if (!provider || typeof provider.authorizationUrl !== 'function' || typeof provider.exchangeCode !== 'function') throw new Error('기존 PADIEM 로그인 공급자가 필요합니다. 없는 상태로 발급을 열지 않습니다.');
  if (typeof credentialSecret !== 'string' || !credentialSecret) throw new Error('LOVETREE_SESSION_SECRET이 필요합니다.');

  const respond = (status, { location, cookies = [], body } = {}) => ({
    status,
    headers: {
      ...(location ? { location } : {}),
      ...(cookies.length ? { 'set-cookie': cookies } : {}),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    },
    body
  });

  const clear = (name) => `${name}=; ${cookieAttributes({ secure: cookieSecure, maxAge: 0 })}`;

  async function login(request) {
    const query = request.query ?? new URLSearchParams();
    const asked = query.get('next');
    const next = asked && isSafeRelativePath(asked) ? asked : DEFAULT_NEXT;
    const state = randomBytes(18).toString('base64url');
    const signed = mintStateToken({ secret: credentialSecret, state, next, now: seconds(now()) });
    const target = provider.authorizationUrl({ state });
    const url = new URL(target);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname))) {
      throw new ApiError(503, 'auth_unavailable', '로그인 시작 주소를 안전하게 정할 수 없어요.');
    }
    return respond(302, {
      location: target,
      cookies: [`${STATE_COOKIE}=${signed}; ${cookieAttributes({ secure: cookieSecure, maxAge: 600 })}`]
    });
  }

  async function callback(request) {
    const query = request.query ?? new URLSearchParams();
    const cookies = parseCookies(request.headers?.cookie);
    const presented = query.get('state');
    const code = query.get('code');

    const state = readStateToken({ secret: credentialSecret, token: cookies[STATE_COOKIE], now: seconds(now()) });
    if (!state || !presented || !sameValue(state.state, presented)) {
      throw new ApiError(401, 'invalid_login_state', '로그인 요청을 확인할 수 없었어요. 처음부터 다시 시도해 주세요.');
    }
    if (usedStates.has(state.state)) {
      throw new ApiError(401, 'login_state_replayed', '이미 사용된 로그인 응답이에요. 처음부터 다시 시도해 주세요.');
    }
    if (typeof code !== 'string' || !code || code.length > 1024) {
      throw new ApiError(400, 'invalid_login_evidence', '로그인 응답을 읽을 수 없어요.');
    }

    let evidence;
    try { evidence = await provider.exchangeCode({ code, state: state.state, origin: request.origin ?? '' }); }
    catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(503, 'auth_unavailable', '로그인 확인을 하지 못했어요.'); }

    const issued = await writer.issue({ evidence });
    const token = mintSessionToken({ secret: credentialSecret, canonicalSessionId: issued.canonicalSessionId, now: seconds(now()), maxAgeSeconds: sessionMaxAgeSeconds });

    // 상태는 발급에 성공한 뒤 한 번만 쓰이게 막는다(실패한 시도는 다시 시도할 수 있다).
    usedStates.add(state.state);
    return respond(302, {
      location: state.next,
      cookies: [`${SESSION_COOKIE}=${token}; ${cookieAttributes({ secure: cookieSecure, maxAge: sessionMaxAgeSeconds })}`, clear(STATE_COOKIE)]
    });
  }

  async function logout(request) {
    const cookies = parseCookies(request.headers?.cookie);
    const bearer = typeof request.headers?.authorization === 'string' && request.headers.authorization.toLowerCase().startsWith('bearer ')
      ? request.headers.authorization.slice(7).trim() : '';
    const presented = cookies[SESSION_COOKIE] ?? bearer ?? '';
    const payload = readSessionToken({ secret: credentialSecret, token: presented, now: seconds(now()) });
    if (!payload) return respond(200, { cookies: [clear(SESSION_COOKIE)], body: { loggedOut: true } });

    await writer.revoke({ canonicalSessionId: payload.canonicalSessionId });
    return respond(200, { cookies: [clear(SESSION_COOKIE)], body: { loggedOut: true } });
  }

  return {
    login,
    callback,
    logout,
    async route(request) {
      const { method = 'GET', path = '' } = request ?? {};
      if (path === '/auth/login') return method === 'GET' ? login(request) : fail(405);
      if (path === '/auth/callback') return method === 'GET' || method === 'POST' ? callback(request) : fail(405);
      if (path === '/auth/logout') return method === 'POST' ? logout(request) : fail(405);
      return fail(404);
    }
  };
}

function fail(status) {
  throw new ApiError(status, status === 404 ? 'not_found' : 'method_not_allowed', status === 404 ? '요청을 찾을 수 없어요.' : '이 요청은 지원하지 않아요.');
}
