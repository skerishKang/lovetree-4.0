import { createHash, timingSafeEqual } from 'node:crypto';
import { ApiError } from './errors.js';
import { parsePrincipal } from './principal.js';

export const MAX_CONFIRM_LENGTH = 320;

export function subjectHash(subjectId) {
  return createHash('sha256').update(String(subjectId), 'utf8').digest('hex');
}

const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length
  && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * 계정 탈퇴 서비스.
 *
 * 확인 문자열은 공통 로그인이 이 제품에 넘겨 준 이메일이 있으면 이메일, 없으면 이 계정의
 * canonical subject다. 러브트리는 이메일을 저장하지 않고(PADIEM Chat의 users.email 같은 표가 없다)
 * 공유 access 토큰도 sub/account_id/sid만 싣는다. 그래서 화면에는 실제로 확인 가능한 값을
 * 그대로 보여 주고, 그 값을 다시 입력해야 실행한다. 되돌릴 수 없는 작업의 1회 확인 게이트다.
 *
 * 삭제는 저장소의 한 트랜잭션이 전부 처리한다. 관리자 계정은 실행 전에 거부한다.
 * 공통 로그인 계정(Control Plane identity)은 지우지 않는다 — 제품 데이터만 지운다.
 */
export function createAccountService({ repo, productId, admin = null, mediaStore = null, now = () => new Date() }) {
  if (!repo || typeof repo.deleteAll !== 'function' || typeof repo.isDeleted !== 'function') throw new Error('account repo가 필요합니다.');

  function principalOf(verified) {
    const base = parsePrincipal(verified, productId);
    const email = typeof verified?.email === 'string' ? verified.email.trim() : '';
    return Object.freeze({ ...base, email });
  }

  function confirmation(principal) {
    return principal.email ? { kind: 'email', value: principal.email } : { kind: 'subject', value: principal.subjectId };
  }

  return {
    principalOf,

    async describe(verified) {
      const principal = principalOf(verified);
      const expected = confirmation(principal);
      return { subject: principal.subjectId, confirmKind: expected.kind, email: principal.email || null, deleted: await repo.isDeleted({ productId, subjectHash: subjectHash(principal.subjectId) }) };
    },

    async isDeleted(verified) {
      const principal = principalOf(verified);
      return repo.isDeleted({ productId, subjectHash: subjectHash(principal.subjectId) });
    },

    async deleteAccount(verified, { confirm } = {}) {
      const principal = principalOf(verified);
      const expected = confirmation(principal);
      if (typeof confirm !== 'string' || !confirm || confirm.length > MAX_CONFIRM_LENGTH || !same(confirm, expected.value)) {
        throw new ApiError(400, 'account_delete_confirm_mismatch', expected.kind === 'email'
          ? '입력한 이메일이 계정 이메일과 일치하지 않습니다. 아무것도 지워지지 않았습니다.'
          : '입력한 계정 확인 값이 일치하지 않습니다. 아무것도 지워지지 않았습니다.');
      }
      if (admin && await admin.roleFor(principal) === 'admin') {
        throw new ApiError(403, 'account_delete_admin_blocked', '관리자 권한이 있는 계정은 이 화면에서 탈퇴할 수 없습니다.');
      }
      const hash = subjectHash(principal.subjectId);
      if (await repo.isDeleted({ productId, subjectHash: hash })) {
        throw new ApiError(409, 'account_already_deleted', '이미 탈퇴한 계정입니다.');
      }
      let outcome;
      try {
        outcome = await repo.deleteAll({ productId, subjectId: principal.subjectId, subjectHash: hash, at: now().toISOString() });
      } catch {
        throw new ApiError(503, 'account_delete_failed', '탈퇴를 처리하지 못했습니다. 저장된 기록은 그대로입니다. 다시 시도해 주세요.');
      }
      // 데이터가 사라진 뒤에만 파일을 정리한다. 같은 호출을 다시 하면 남은 파일만 지우므로 멱등이다.
      let mediaCleaned = null;
      if (mediaStore && typeof mediaStore.removeAccount === 'function') {
        try { await mediaStore.removeAccount(principal); mediaCleaned = true; } catch { mediaCleaned = false; }
      }
      return { deleted: true, deletedAt: outcome.deletedAt, tables: outcome.tables, mediaCleaned };
    }
  };
}
