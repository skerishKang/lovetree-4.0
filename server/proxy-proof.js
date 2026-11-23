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

// 아래는 기록 내용만 다듬는다. 값·판정·막기는 위의 verifyProxyProof가 그대로 맡는다.

// 경로는 첫 두 마디까지만 남긴다. 나머지 마디와 쿼리는 자르고, 값이 붙는 자리는 기록하지 않는다.
export function proxyProofLogPath(path) {
  const plain = String(path || '').split('?')[0].split('#')[0];
  const parts = plain.split('/').filter(Boolean).slice(0, 2);
  return parts.length ? `/${parts.join('/')}` : '/';
}

// 어긋난 요청의 출처를 가릴 정보만 남긴다. 머리말 값과 길이 숫자는 절대 넣지 않는다.
export function proxyProofMismatchEntry(request, secret) {
  const expected = typeof secret === 'string' ? secret.trim() : '';
  const got = headerValue(request?.headers, PROXY_PROOF_HEADER);
  const entry = { result: 'mismatch', 경로: proxyProofLogPath(request?.path), 머리말: got ? '있음' : '없음' };
  if (got) entry.길이 = got.length === expected.length ? '같음' : '다름';
  return entry;
}

// 같은 내용이 한 주기 안에 되풀이되면 한 번만 남기고 횟수만 센다.
// 주기가 지나 같은 내용이 다시 오면, 지난 묶음의 마지막 횟수를 먼저 남기고 새 묶음을 시작한다.
export function createProxyProofMismatchLogger({ log = () => {}, windowMs = 60_000, now = () => Date.now(), maxKeys = 200 } = {}) {
  const state = new Map();
  return function record(request, secret) {
    const entry = proxyProofMismatchEntry(request, secret);
    const key = JSON.stringify(entry);
    const at = now();
    const prev = state.get(key);
    if (prev && at - prev.at < windowMs) { prev.count += 1; return; }
    if (prev) log({ ...prev.entry, 횟수: prev.count });
    // 아무 경로나 보내 기록 표를 키우지 못하게 묶음 수를 제한한다. 넘치면 가장 오래된 묶음부터 뺀다.
    if (!prev && state.size >= maxKeys) state.delete(state.keys().next().value);
    state.set(key, { at, count: 1, entry });
    log({ ...entry, 횟수: 1 });
    for (const [otherKey, other] of state) {
      if (otherKey !== key && at - other.at >= windowMs) state.delete(otherKey);
    }
  };
}
