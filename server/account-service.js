import { createHash, timingSafeEqual } from 'node:crypto';
import { ApiError } from './errors.js';
import { parsePrincipal } from './principal.js';

export const MAX_CONFIRM_LENGTH = 320;
export const DELETE_CONFIRMATION_PHRASE = '탈퇴합니다';

export function subjectHash(subjectId) {
  return createHash('sha256').update(String(subjectId), 'utf8').digest('hex');
}

const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length
  && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// 이메일은 앞뒤 공백과 대소문자 차이만 인정한다. 고정 문구는 정확히 일치해야 한다.
function normalize(kind, value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return kind === 'email' ? text.toLowerCase() : text;
}

/**
 * 계정 탈퇴 서비스.
 *
 * 확인 문자열은 "지금 아는 이메일"이 있으면 그 이메일, 없으면 고정 문구 "탈퇴합니다"다.
 * canonical subject는 사용자가 알 수 없는 내부 값이라 확인 값으로 쓰지 않는다
 * (2026-11-03 CTO 판정). 이메일은 공통 로그인 콜백이 토큰 교환 응답의 사용자 정보에서 꺼내
 * 계정 테이블에 저장한 것이라, 계정 삭제 시 그 표도 함께 지워진다. 저장값이 없으면 고정 문구다.
 * 되돌릴 수 없는 작업의 1회 확인 게이트다.
 *
 * 제품 데이터는 저장소의 한 트랜잭션에서 삭제한다. 관리자 계정은 실행 전에 거부한다.
 * 서명된 완료 경로가 제품 연결을 해제하고 마지막 연결이면 공통 계정 삭제를 마무리한다.
 */
export function createAccountService({ repo, productId, admin = null, mediaStore = null, now = () => new Date() }) {
  if (!repo || typeof repo.deleteAll !== 'function' || typeof repo.isDeleted !== 'function') throw new Error('account repo가 필요합니다.');

  function principalOf(verified) {
    const base = parsePrincipal(verified, productId);
    const email = typeof verified?.email === 'string' ? verified.email.trim() : '';
    return { ...base, email };
  }

  // 확인 값은 "지금 아는 이메일"이다. 검증 페이로드에 이미 있으면 그것을 쓰고, 없으면 저장소에서
  // 찾는다. 저장소가 아직 준비되지 않았으면 빈 값(고정 문구 확인)으로도 흔들리지 않는다.
  async function principalEmail(verified) {
    const principal = principalOf(verified);
    if (principal.email) return Object.freeze(principal);
    if (typeof repo.emailFor !== 'function') return Object.freeze(principal);
    try {
      const stored = await repo.emailFor({ productId, subjectId: principal.subjectId });
      return Object.freeze(stored ? { ...principal, email: stored } : principal);
    } catch {
      return Object.freeze(principal);
    }
  }

  function confirmation(principal) {
    return principal.email
      ? { kind: 'email', value: normalize('email', principal.email) }
      : { kind: 'phrase', value: DELETE_CONFIRMATION_PHRASE };
  }

  async function deleteLocalData(principal) {
    const hash = subjectHash(principal.subjectId);
    let alreadyDeleted;
    try { alreadyDeleted = await repo.isDeleted({ productId, subjectHash: hash }); }
    catch { throw new ApiError(503, 'account_delete_failed', '탈퇴 상태를 확인하지 못했습니다. 다시 시도해 주세요.'); }
    let outcome = null;
    if (!alreadyDeleted) {
      try {
        outcome = await repo.deleteAll({ productId, subjectId: principal.subjectId, subjectHash: hash, at: now().toISOString() });
      } catch {
        throw new ApiError(503, 'account_delete_failed', '탈퇴를 처리하지 못했습니다. 저장된 기록은 그대로입니다. 다시 시도해 주세요.');
      }
    }
    let mediaCleaned = null;
    if (mediaStore && typeof mediaStore.removeAccount === 'function') {
      try { await mediaStore.removeAccount(principal); mediaCleaned = true; } catch { mediaCleaned = false; }
    }
    return {
      deleted: true,
      alreadyDeleted,
      deletedAt: outcome?.deletedAt ?? null,
      tables: outcome?.tables ?? {},
      mediaCleaned
    };
  }

  return {
    principalOf,

    async describe(verified) {
      const principal = await principalEmail(verified);
      const expected = confirmation(principal);
      const role = admin ? await admin.roleFor(principal) : null;
      // 확인 방식만 알려 준다. subject 같은 내부 식별자는 응답에 넣지 않는다.
      return {
        confirmKind: expected.kind,
        ...(expected.kind === 'email' ? { email: principal.email } : {}),
        aiCustomer: role === 'ai_customer',
        admin: role === 'admin',
        deleted: await repo.isDeleted({ productId, subjectHash: subjectHash(principal.subjectId) })
      };
    },

    async isDeleted(verified) {
      const principal = principalOf(verified);
      return repo.isDeleted({ productId, subjectHash: subjectHash(principal.subjectId) });
    },

    async deleteAccount(verified, { confirm } = {}) {
      const principal = await principalEmail(verified);
      const expected = confirmation(principal);
      const typed = normalize(expected.kind, confirm);
      if (!typed || (typeof confirm === 'string' && confirm.length > MAX_CONFIRM_LENGTH) || !same(typed, expected.value)) {
        throw new ApiError(400, 'account_delete_confirm_mismatch', expected.kind === 'email'
          ? '입력한 이메일이 계정 이메일과 일치하지 않습니다. 아무것도 지워지지 않았습니다.'
          : "확인을 위해 '탈퇴합니다'를 정확히 입력해야 합니다. 아무것도 지워지지 않았습니다.");
      }
      if (admin && await admin.roleFor(principal) === 'admin') {
        throw new ApiError(403, 'account_delete_admin_blocked', '관리자 권한이 있는 계정은 이 화면에서 탈퇴할 수 없습니다.');
      }
      return deleteLocalData(principal);
    },

    async deleteTrustedSubject({ canonicalSubjectId, requestedProductId }) {
      if (requestedProductId !== productId || !/^sub_[A-Za-z0-9_-]{1,128}$/.test(canonicalSubjectId ?? '')) {
        throw new ApiError(400, 'account_delete_subject_invalid', '요청한 계정을 확인할 수 없습니다.');
      }
      const principal = principalOf({ productId, subjectId: canonicalSubjectId });
      if (admin && await admin.roleFor(principal) === 'admin') {
        throw new ApiError(403, 'account_delete_admin_blocked', '관리자 권한이 있는 계정은 이 경로로 탈퇴할 수 없습니다.');
      }
      const result = await deleteLocalData(principal);
      if (result.mediaCleaned === false) {
        throw new ApiError(503, 'account_delete_media_failed', '미디어 파일 정리를 완료하지 못했습니다. 다시 시도해 주세요.');
      }
      return result;
    }
  };
}
