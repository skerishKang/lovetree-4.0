import { ApiError } from './errors.js';

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const UNAVAILABLE = () => new ApiError(503, 'auth_unavailable', '로그인 확인을 하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
const UNAUTHENTICATED = () => new ApiError(401, 'unauthenticated', '로그인 확인을 하지 못했어요.');

/**
 * 러브트리 저장 API가 `LOVETREE_AUTHORITY_TRANSPORT` 자리에 넣는 실제 transport.
 * 대상은 `skerishKang/ai-revenue-lab#5965`의 HTTP 계약 하나뿐이다.
 *
 *   POST <relay>/resolve-session
 *   content-type: application/json
 *   authorization: Bearer <서버 간 호출 비밀>
 *   body { session_id }
 *   → 200 { ok: true, identity: { session_id, product_id, subject_id, expires_at } }
 *   → 400 invalid_request · 401 unauthenticated(세션) · 401 unauthorized(caller) ·
 *      502 authority_response_too_large · 503 *unavailable*
 *
 * 중계가 확인하지 않은 필드(원본 RPC 응답 등)는 여기에서 만들어 넣지 않는다.
 * 시간 초과와 연결 실패는 AbortController로 요청을 실제로 취소하고 503으로 닫는다.
 * 호출 비밀은 응답·오류·로그에 실리지 않는다 — 브라우저에는 항상 같은 안내 문장만 나간다.
 */
export function createAuthorityRelayClient({ url, callerSecret, timeoutMs = 2_500, fetchImpl = globalThis.fetch, onUnavailable = () => {} }) {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) throw new Error('LOVETREE_AUTHORITY_RELAY_URL은 http/https URL이어야 합니다.');
  if (typeof callerSecret !== 'string' || !callerSecret) throw new Error('LOVETREE_CALLER_SECRET이 필요합니다. 없는 상태로 확인 경로를 열지 않습니다.');
  if (typeof fetchImpl !== 'function') throw new Error('fetch 구현이 필요합니다.');

  return {
    async resolveIdentity({ sessionId }) {
      if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) throw UNAUTHENTICATED();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${callerSecret}` },
          body: JSON.stringify({ session_id: sessionId }),
          signal: controller.signal
        });
      } catch {
        onUnavailable({ code: 'relay_unreachable' });
        throw UNAVAILABLE();
      } finally {
        clearTimeout(timer);
      }

      let envelope = null;
      try { envelope = await response.json(); } catch { envelope = null; }
      const code = envelope?.error?.code;

      if (response.status === 200 && envelope?.ok === true) {
        const identity = envelope.identity;
        if (!identity || typeof identity !== 'object'
          || typeof identity.session_id !== 'string'
          || typeof identity.product_id !== 'string'
          || typeof identity.subject_id !== 'string'
          || typeof identity.expires_at !== 'string') {
          onUnavailable({ code: 'relay_invalid_response' });
          throw UNAVAILABLE();
        }
        return {
          sessionId: identity.session_id,
          productId: identity.product_id,
          subjectId: identity.subject_id,
          expiresAt: identity.expires_at
        };
      }

      // 중계가 세션을 거부한 것만 사용자에게 알려 로그인 실패로 돌려보낸다.
      // 호출 비밀·경로·본문 설정 문제는 브라우저에 그 차이를 드러내지 않고 503으로 닫는다.
      if (response.status === 401 && code === 'unauthenticated') throw UNAUTHENTICATED();
      onUnavailable({ code: code ?? `relay_status_${response.status}` });
      throw UNAVAILABLE();
    }
  };
}

export function createAuthorityClient({ env = process.env, fetchImpl, onUnavailable } = {}) {
  return createAuthorityRelayClient({
    url: env.LOVETREE_AUTHORITY_RELAY_URL ?? '',
    callerSecret: env.LOVETREE_CALLER_SECRET ?? '',
    timeoutMs: Number(env.LOVETREE_AUTHORITY_TIMEOUT_MS || 0) || undefined,
    fetchImpl,
    onUnavailable
  });
}
