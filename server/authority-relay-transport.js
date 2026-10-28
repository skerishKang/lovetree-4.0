import { ApiError } from './errors.js';

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024;

const UNAVAILABLE = () => new ApiError(503, 'auth_unavailable', '로그인 확인을 하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
const UNAUTHENTICATED = () => new ApiError(401, 'unauthenticated', '로그인 확인을 하지 못했어요.');

/**
 * 운영 중계 URL은 https를 요구한다. plain http는 테스트용 loopback 호스트만 허용해
 * 로컬 검증 코드가 실연결 주소로 새지 못하게 한다.
 */
export function assertRelayUrl(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('LOVETREE_AUTHORITY_RELAY_URL이 필요합니다. 없는 상태로 확인 경로를 열지 않습니다.');
  let parsed;
  try { parsed = new URL(value); }
  catch { throw new Error('LOVETREE_AUTHORITY_RELAY_URL은 완전한 URL이어야 합니다.'); }
  if (parsed.protocol === 'https:') return parsed;
  if (parsed.protocol === 'http:') {
    if (LOOPBACK.has(parsed.hostname)) return parsed;
    throw new Error('plain http 중계는 loopback 테스트 주소만 허용합니다. 운영은 https를 쓰세요.');
  }
  throw new Error('LOVETREE_AUTHORITY_RELAY_URL은 https(또는 loopback http)만 쓸 수 있습니다.');
}

/** 헤더뿐 아니라 본문 읽기·파싱까지 같은 기한으로 취소한다. */
async function readBoundedText(response, maxResponseBytes, signal) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxResponseBytes) throw new Error('relay_response_too_large');
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  }
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      if (signal.aborted) throw new Error('relay_cancelled');
      const { done, value } = await reader.read();
      if (done) break;
      total += value?.byteLength ?? 0;
      if (total > maxResponseBytes) throw new Error('relay_response_too_large');
      chunks.push(value);
    }
  } finally {
    if (total > maxResponseBytes || signal.aborted) {
      try { await reader.cancel(); } catch { /* 이미 닫힌 리더는 정리 대상이 아니다 */ }
    }
    try { reader.releaseLock(); } catch { /* 취소된 스트림의 잠금은 해제되지 않을 수 있다 */ }
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(await new Blob(chunks).arrayBuffer());
}

/**
 * 러브트리 저장 API가 `LOVETREE_AUTHORITY_TRANSPORT=relay`에서 쓰는 실제 transport.
 * 대상은 `skerishKang/ai-revenue-lab#5965`의 HTTP 계약 하나뿐이다.
 *
 *   POST <relay>/resolve-session
 *   authorization: Bearer <서버 간 호출 비밀>
 *   body { session_id }
 *   → 200 { ok: true, identity: { session_id, product_id, subject_id, expires_at } }
 *   → 400 invalid_request · 401 unauthenticated(세션) · 401 unauthorized(caller) ·
 *      502 too large · 503 *unavailable*
 *
 * 중계가 보지 못한 원본 RPC 응답은 여기서 만들지 않는다.
 * 기한은 요청·본문 읽기·파싱 전체에 걸리고 AbortController로 실제로 취소한다.
 * 응답 본문에도 크기 상한을 둔다. 호출 비밀은 응답·오류·로그에 실리지 않는다.
 */
export function createAuthorityRelayClient({ url, callerSecret, timeoutMs = 2_500, maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES, fetchImpl = globalThis.fetch, onUnavailable = () => {} }) {
  const relayUrl = assertRelayUrl(url);
  if (typeof callerSecret !== 'string' || !callerSecret) throw new Error('LOVETREE_CALLER_SECRET이 필요합니다. 없는 상태로 확인 경로를 열지 않습니다.');
  if (typeof fetchImpl !== 'function') throw new Error('fetch 구현이 필요합니다.');
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) throw new Error('응답 크기 상한이 올바르지 않습니다.');

  return {
    async resolveIdentity({ sessionId }) {
      if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) throw UNAUTHENTICATED();
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(new Error('relay timeout')), timeoutMs);
      let response;
      let envelope = null;
      try {
        response = await fetchImpl(relayUrl.href, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${callerSecret}` },
          body: JSON.stringify({ session_id: sessionId }),
          signal: controller.signal
        });
        const text = await readBoundedText(response, maxResponseBytes, controller.signal);
        envelope = JSON.parse(text);
      } catch (error) {
        // 취소·연결 실패·본문 정지·크기 초과·파싱 실패는 모두 닫힌다. 비밀과 본문은 남기지 않는다.
        const message = String(error?.message ?? '');
        onUnavailable({
          code: controller.signal.aborted ? 'relay_cancelled'
            : message.includes('too_large') ? 'relay_response_too_large'
            : 'relay_unreachable'
        });
        throw UNAVAILABLE();
      } finally {
        clearTimeout(deadline);
      }

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
        return { sessionId: identity.session_id, productId: identity.product_id, subjectId: identity.subject_id, expiresAt: identity.expires_at };
      }

      // 중계가 세션을 거부한 것만 사용자에게 알린다. 설정·중계 문제는 항상 같은 503으로 닫는다.
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
    maxResponseBytes: Number(env.LOVETREE_AUTHORITY_MAX_RESPONSE_BYTES || 0) || undefined,
    fetchImpl,
    onUnavailable
  });
}
