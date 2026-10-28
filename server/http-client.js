import { ApiError } from './errors.js';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** 배포가 준 URL만 받는다: 운영은 https, plain http는 loopback 테스트 주소로 한정. */
export function assertServiceUrl(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}이 필요합니다. 없는 상태로 확인 경로를 열지 않습니다.`);
  let parsed;
  try { parsed = new URL(value); }
  catch { throw new Error(`${label}은 완전한 URL이어야 합니다.`); }
  if (parsed.protocol === 'https:') return parsed;
  if (parsed.protocol === 'http:' && LOOPBACK.has(parsed.hostname)) return parsed;
  throw new Error(`${label}은 https를 요구합니다(테스트는 loopback http만 예외).`);
}

/**
 * 중계 Worker와의 POST JSON 왕복. 기한은 헤더·본문 읽기·파싱 전체에 걸리고
 * AbortController로 요청을 실제로 취소한다. 응답 본문에도 크기 상한을 둔다.
 * caller 비밀은 요청 헤더에만 들어가고 반환·오류·로그에 남지 않는다.
 */
export async function postJson({ url, body, callerSecret, timeoutMs, maxResponseBytes, fetchImpl, label }) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(new Error(`${label} timeout`)), timeoutMs);
  let response;
  let envelope = null;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${callerSecret}` },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    envelope = JSON.parse(await readBounded(response, maxResponseBytes, controller.signal));
  } catch (error) {
    const reason = controller.signal.aborted ? 'cancelled' : String(error?.message ?? '').includes('too_large') ? 'too_large' : 'unreachable';
    return { failed: true, reason, status: response?.status ?? null };
  } finally {
    clearTimeout(deadline);
  }
  return { failed: false, status: response.status, envelope };
}

async function readBounded(response, maxResponseBytes, signal) {
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
    if (signal.aborted || total > maxResponseBytes) {
      try { await reader.cancel(); } catch { /* 이미 닫힌 리더는 정리 대상이 아니다 */ }
    }
    try { reader.releaseLock(); } catch { /* 취소된 스트림의 잠금은 해제되지 않을 수 있다 */ }
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(await new Blob(chunks).arrayBuffer());
}

export const unauthenticated = () => new ApiError(401, 'unauthenticated', '로그인 확인을 하지 못했어요.');
export const unavailable = () => new ApiError(503, 'auth_unavailable', '로그인 확인을 하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
