// 서버 요청 출처 확인(#B15 지정). 프런트 프록시만 아는 공유 머리말을 받아 확인한다.
// 첫 배포는 기록만 한다 — 어긋난 요청도 통과시키고 상태만 남긴다.
// LOVETREE_PROXY_ENFORCE=1일 때만 거부한다. 내부 경로는 자체 서명이 있으므로 이 검사를 건너뛴다.
import { timingSafeEqual } from 'node:crypto';

export const PROXY_PROOF_HEADER = 'x-lovetree-proxy-proof';

function headerValue(headers, name) {
  const raw = headers?.[name];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && raw.length === 1 && typeof raw[0] === 'string') return raw[0];
  return '';
}

export function verifyProxyProof(request, { secret = '', enforce = false, log = () => {} } = {}) {
  const path = String(request?.path || '');
  if (path.startsWith('/internal/')) return { ok: true, reason: 'internal' };
  const expected = typeof secret === 'string' ? secret.trim() : '';
  const got = headerValue(request?.headers, PROXY_PROOF_HEADER);
  if (!expected || expected.length < 32) {
    log({ result: 'unavailable' });
    return { ok: true, reason: 'unavailable' };
  }
  const a = Buffer.from(got), b = Buffer.from(expected);
  const matched = a.length === b.length && timingSafeEqual(a, b);
  if (matched) return { ok: true, reason: 'valid' };
  log({ result: 'mismatch' });
  return { ok: !enforce, reason: 'mismatch' };
}
