import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * 러브트리 전용 자격 증명 발급자와 형식 — 하나로 정한다.
 *
 * 형식: `<b64url(json(payload))>.<b64url(HMAC-SHA256(HMAC-SHA256(secret, purpose), body))>`
 * pattern 출처는 PADIEM 로그인 권위의 세션 토큰(`apps/padiem-chat/app/auth.py:55-79`)이지만,
 * 비밀·purpose는 러브트리 자기 것만 쓴다(`lovetree-4-0/session/v1`).
 * Chat의 비밀키·purpose·제품 ID를 복사하지 않는다.
 *
 * payload의 `sid`는 Control Plane이 만든 canonical 세션 id다. 자격 증명은 그 세션의
 * *제시*일 뿐이고, 진위는 세션 확인(읽기 경계)에서 갈린다 — 그래서 서명이 맞아도
 * canonical 세션이 폐기·만료되면 저장이 열리지 않는다.
 */
export const SESSION_PURPOSE = 'lovetree-4-0/session/v1';
export const STATE_PURPOSE = 'lovetree-4-0/oauth-state/v1';
export const SESSION_COOKIE = 'lovetree_session';
export const STATE_COOKIE = 'lovetree_oauth_state';
export const SESSION_MAX_AGE_SECONDS = 60 * 60;
export const STATE_MAX_AGE_SECONDS = 10 * 60;

const CANONICAL_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const OPAQUE_STATE = /^[A-Za-z0-9_-]{16,64}$/;

const b64url = (value) => Buffer.from(value).toString('base64url');

function decodeJson(text) {
  try {
    const parsed = JSON.parse(Buffer.from(String(text), 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sign(secret, purpose, body) {
  const key = createHmac('sha256', secret).update(purpose).digest();
  return createHmac('sha256', key).update(body, 'ascii').digest();
}

function issue(secret, purpose, payload) {
  if (typeof secret !== 'string' || !secret) throw new Error('러브트리 자격 증명 비밀이 필요합니다. 다른 제품의 비밀을 쓰지 않습니다.');
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(secret, purpose, body).toString('base64url')}`;
}

function read(secret, purpose, token, now) {
  if (typeof token !== 'string') return null;
  const at = token.indexOf('.');
  if (at <= 0) return null;
  const body = token.slice(0, at);
  const given = Buffer.from(token.slice(at + 1), 'base64url');
  const expected = sign(secret, purpose, body);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const payload = decodeJson(body);
  if (!payload || payload.v !== 1) return null;
  const exp = payload.exp;
  if (typeof exp !== 'number' || exp <= now) return null;
  return payload;
}

export function mintSessionToken({ secret, canonicalSessionId, now = Math.floor(Date.now() / 1000), maxAgeSeconds = SESSION_MAX_AGE_SECONDS }) {
  if (!CANONICAL_SESSION_ID.test(canonicalSessionId ?? '')) throw new Error('canonical 세션 id가 필요합니다.');
  return issue(secret, SESSION_PURPOSE, { v: 1, sid: canonicalSessionId, exp: now + maxAgeSeconds });
}

export function readSessionToken({ secret, token, now = Math.floor(Date.now() / 1000) }) {
  const payload = read(secret, SESSION_PURPOSE, token, now);
  if (!payload || !CANONICAL_SESSION_ID.test(payload.sid ?? '')) return null;
  return { canonicalSessionId: payload.sid, expiresAt: payload.exp };
}

/** 로그인 왕복 상태. `next`는 서명된 값 안에 넣고 상대 경로로만 받아, 콜백이 임의 외부 주소로 데려가지 못하게 한다. */
export function mintStateToken({ secret, state, next, now = Math.floor(Date.now() / 1000), maxAgeSeconds = STATE_MAX_AGE_SECONDS }) {
  if (!OPAQUE_STATE.test(state ?? '')) throw new Error('로그인 상태 값이 너무 짧습니다.');
  if (!isSafeRelativePath(next)) throw new Error('로그인 뒤 이동할 경로는 같은 사이트의 상대 경로만 허용합니다.');
  return issue(secret, STATE_PURPOSE, { v: 1, state, next, exp: now + maxAgeSeconds });
}

export function readStateToken({ secret, token, now = Math.floor(Date.now() / 1000) }) {
  const payload = read(secret, STATE_PURPOSE, token, now);
  if (!payload || !OPAQUE_STATE.test(payload.state ?? '') || !isSafeRelativePath(payload.next)) return null;
  return { state: payload.state, next: payload.next };
}

export function isSafeRelativePath(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && /^\/[A-Za-z0-9\-_/]{0,120}$/.test(value);
}

/** Set-Cookie 속성. host-only(기본) + HttpOnly + SameSite=Lax, Secure는 배포가 정한다. */
export function cookieAttributes({ secure = true, maxAge = 0, httpOnly = true, sameSite = 'lax', path = '/' } = {}) {
  const parts = [`Path=${path}`, `Max-Age=${Math.max(0, Math.floor(maxAge))}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
