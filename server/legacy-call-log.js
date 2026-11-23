// #7944(옛 로그인 경로 종료) 관찰용: 옛 경로(발급 중계·읽기 중계·쓰기 중계)를 부를 때마다 한 줄을 남긴다.
// 하루 단위로 이 줄 수를 세어 30일 연속 0이 되는지 본다. 세션·주체·토큰 값은 적지 않는다.
export const LEGACY_CALL_TAG = '[lovetree-legacy-call]';

export function logLegacyCall(kind, log = console.info) {
  if (!/^[a-z_:]{1,40}$/.test(kind)) kind = 'unknown';
  log(LEGACY_CALL_TAG, kind);
}

export function countAuthorityReads(authority, log) {
  if (!authority || typeof authority.resolveIdentity !== 'function') return authority;
  return {
    ...authority,
    async resolveIdentity(args) { logLegacyCall('authority_read', log); return authority.resolveIdentity(args); }
  };
}

export function countMint(mint, log) {
  if (!mint || typeof mint.redeem !== 'function') return mint;
  return { ...mint, async redeem(args) { logLegacyCall('mint', log); return mint.redeem(args); } };
}

export function countWriteCall(call, log) {
  if (typeof call !== 'function') return call;
  return async (method, payload) => {
    logLegacyCall(`authority_write:${String(method).replace(/[^a-z_]/g, '').slice(0, 24)}`, log);
    return call(method, payload);
  };
}
