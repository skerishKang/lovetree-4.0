// 서버 요청 출처 확인(#B15 지정). 프런트 프록시만 아는 공유 머리말을 받아 확인한다.
// 첫 배포는 기록만 한다 — 어긋난 요청도 통과시키고 상태만 남긴다.
// LOVETREE_PROXY_ENFORCE=1일 때만 거부한다. 내부 경로는 자체 서명이 있으므로 이 검사를 건너뛴다.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const PROXY_PROOF_HEADER = 'x-lovetree-proxy-proof';
export const OPS_INGEST_PATH = '/api/ops-feedback/ingest';

function headerValue(headers, name) {
  const raw = headers?.[name];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && raw.length === 1 && typeof raw[0] === 'string') return raw[0];
  return '';
}

export function logProxyProofStartup({ secret = '', enforce = false, log = () => {} } = {}) {
  const expected = typeof secret === 'string' ? secret.trim() : '';
  if (expected && expected.length >= 32) return true;
  log({ result: 'unavailable' });
  return false;
}

export function verifyProxyProof(request, { secret = '', enforce = false } = {}) {
  const path = String(request?.path || '');
  const ingest = path === OPS_INGEST_PATH;
  if (path.startsWith('/internal/')) return { ok: true, reason: 'internal' };
  const expected = typeof secret === 'string' ? secret.trim() : '';
  const got = headerValue(request?.headers, PROXY_PROOF_HEADER);
  if (!expected || expected.length < 32) {
    // 요청마다 기록하지 않는다 — 서버 시작 때 logProxyProofStartup이 한 번 남긴다.
    return { ok: !enforce && !ingest, reason: 'unavailable' };
  }
  const a = Buffer.from(got), b = Buffer.from(expected);
  const matched = a.length === b.length && timingSafeEqual(a, b);
  if (matched) {
    if (ingest) {
      const marker = headerValue(request?.headers, 'x-lovetree-ops-ingest-proof');
      const body = request.rawBody ?? Buffer.from(request.body || '', 'utf8');
      const expectedMarker = createHmac('sha256',expected).update('lovetree:ops-feedback-ingest\n').update(body).digest();
      if (!/^[0-9a-f]{64}$/.test(marker) || !timingSafeEqual(Buffer.from(marker,'hex'), expectedMarker)) return {ok:false,reason:'mismatch'};
    }
    return { ok: true, reason: 'valid' };
  }
  // mismatch 기록은 서버가 reason을 보고 한 번 남긴다(요청마다 여기서 남기지 않는다).
  return { ok: !enforce && !ingest, reason: 'mismatch' };
}
