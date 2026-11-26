// #1437: 계정 정보 없이 직전 확정된 회원 제목 상태만 기억한다.
export const HOME_TITLE_HINT_KEY = 'lt41.homeTitleHasMoments.v1';
export function readHomeTitleHint(storage) {
  try { return storage?.getItem?.(HOME_TITLE_HINT_KEY) === '1'; } catch { return false; }
}
export function settleHomeTitleHint(owned, moments, storage) {
  try {
    if (owned && moments > 0) storage?.setItem?.(HOME_TITLE_HINT_KEY, '1');
    else storage?.removeItem?.(HOME_TITLE_HINT_KEY);
  } catch { /* 저장소 접근이 막힌 환경 */ }
}
export function homeTitleDecision({pending, hint, loggedIn, momentCount}) {
  if (pending) return hint ? 'member' : 'pending';
  return loggedIn && (momentCount === null || momentCount > 0) ? 'member' : 'guest';
}
