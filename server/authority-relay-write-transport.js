import { assertServiceUrl } from './http-client.js';

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_RESPONSE_BYTES = 64 * 1024;

/**
 * 폐기 전용 write transport — `LOVETREE_AUTHORITY_WRITE_TRANSPORT`의 실제 구현.
 *
 * 계약(`server/index.js` buildLogin): createAuthorityWriteCall(env) → call(method, payload).
 * 권위 writer(`authority-writer.js`)는 세 메서드를 부르지만, 운영 구성(mint 있음)에서
 * 발급은 1회용 handoff 표 경로(#5984, `LOVETREE_MINT_URL`)만 쓴다. 이 중계는 폐기 한 가지를
 * lovetree-auth-caller의 `/revoke-session`으로 넘긴다 — 제품 ID는 중계가 고정해 두었으므로
 * 호출자가 제품이나 주체를 주장할 자리가 없다(#5977·#5984 계약).
 *
 * mint 없는 구성의 `resolve_or_create_product_link`·`establish_auth_session`은 중계 경로가
 * 없다. 이 transport가 그 두 메서드를 열어 두면 검증되지 않은 근거로 발급이 열리는 셈이므로
 * 닫아 둔다 — 폐기만 중계하는 것이 이 파일의 경계다.
 *
 * 주소는 `LOVETREE_MINT_URL` 하나에서만 얻는다(발급·폐기가 같은 중계 Worker다). 이 파일은
 * URL을 지어내지 않는다. 실패는 예외로 돌려 writer의 unavailable()이 503 JSON이 되게 하고,
 * 세션 ID는 다시 검사해 이상한 값이 중계로 나가지 않게 한다.
 */
export function createAuthorityWriteCall(env = process.env, { fetchImpl = (...args) => globalThis.fetch(...args) } = {}) {
  const base = assertServiceUrl(env.LOVETREE_MINT_URL, 'LOVETREE_MINT_URL');
  const secret = env.LOVETREE_CALLER_SECRET ?? '';
  if (typeof secret !== 'string' || !secret) {
    throw new Error('LOVETREE_CALLER_SECRET이 필요합니다. 없는 상태로 폐기 경로를 열지 않습니다.');
  }
  const timeoutMs = Number(env.LOVETREE_AUTHORITY_TIMEOUT_MS || 0) || 2500;

  return async function call(method, payload) {
    if (method !== 'revoke_auth_session') {
      // 발급은 mint 경로만 쓴다. 이 transport가 발급 RPC를 대신하지 않는다.
      throw new Error(`write transport는 revoke_auth_session만 중계합니다. 받은 method: ${method}`);
    }
    const sessionId = payload?.session_id;
    if (!SESSION_ID.test(sessionId ?? '')) {
      throw new Error('폐기할 canonical session id가 올바르지 않습니다.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(0, timeoutMs));
    try {
      const upstream = await fetchImpl(`${base.origin}/revoke-session`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secret}`,
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify({ session_id: sessionId }),
        signal: controller.signal
      });
      const text = await upstream.text();
      if (text.length > MAX_RESPONSE_BYTES) throw new Error('중계 응답이 너무 큽니다.');
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch { throw new Error('중계 응답이 JSON이 아닙니다.'); }
      if (!upstream.ok || body?.ok !== true || body?.revoked?.session_id !== sessionId || body?.revoked?.state !== 'revoked') {
        throw new Error('중계가 세션을 폐기하지 않았어요.');
      }
      // writer 계약(revoke): revoked.session.{session_id, state} 형상으로 맞춰 준다.
      return {
        ok: true,
        session: { session_id: body.revoked.session_id, product_id: body.revoked.product_id, state: body.revoked.state }
      };
    } finally {
      clearTimeout(timer);
    }
  };
}
