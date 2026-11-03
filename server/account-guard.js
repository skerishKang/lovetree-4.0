import { ApiError } from './errors.js';
import { parsePrincipal } from './principal.js';

/**
 * 탈퇴한 계정의 옛 자격 증명을 모든 API 경계에서 거부한다.
 * 공유 access 토큰은 서명·만료만으로 유효하고 폐기 목록이 없으므로, 탈퇴 기록(해시)을
 * 매 요청에서 대조해 세션을 실질적으로 무효화한다.
 */
export function createDeletedAccountGuard({ authenticate, account, productId }) {
  if (typeof authenticate !== 'function' || !account) throw new Error('authenticate와 account가 필요합니다.');
  return async (request) => {
    const verified = await authenticate(request);
    if (!verified) return verified;
    parsePrincipal(verified, productId);
    if (await account.isDeleted(verified)) {
      throw new ApiError(401, 'account_deleted', '탈퇴한 계정이라 이 서비스에 접근할 수 없어요.');
    }
    return verified;
  };
}
