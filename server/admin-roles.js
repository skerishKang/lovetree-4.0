import { ApiError } from './errors.js';

/**
 * 러브트리 제품 역할 경계 (#67 관리자 기반).
 *
 * 재사용한 것은 PADIEM 정본의 모양이다 — `apps/padiem-chat/app/platform_admin_roles.py`와
 * `platform_admin_authority.py`, `migrations/052_platform_admin_roles.sql`:
 *   · 역할은 **서버가 확인한 신원**에만 붙이고(브라우저가 보낸 이메일·헤더·localStorage는 근거가 아니다),
 *   · 역할 판정은 읽을 때마다 신원에 견주어 재확인한다(행이 나중에 고쳐지면 그 행은 더 이상 역할을 주지 않는다),
 *   · 저장이 망가지면 역할 없음으로 닫는다(열린 방향으로 실패하지 않는다),
 *   · 부여·회수는 이전값/새값 이력으로 남긴다(감사 행은 FK 없이 스스로 선다).
 * 여기서 새 것으로 둔 것은 키가 `users.id`가 아니라 **이 제품의 canonical subject**라는 점이다.
 * 공통 신원과 제품 권한은 분리되고, 다른 제품의 역할은 자동으로 전파되지 않는다.
 *
 * 첫 범위는 판정만이다. 회원을 읽거나 지우거나 다른 계정으로 들어가는 자리는 여기 없다.
 */

export const ROLE_ADMIN = 'admin';
export const ROLES = Object.freeze([ROLE_ADMIN]);

// 권위가 만드는 canonical subject 모양. 이 밖의 값은 역할 자리에 받지 않는다.
const SUBJECT = /^sub_[0-9a-f]{16,80}$/;
const ACTOR = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function requireSubject(value) {
  if (typeof value !== 'string' || !SUBJECT.test(value)) throw new ApiError(400, 'invalid_admin_subject', '확인된 신원 식별자 모양이 아닙니다.');
  return value;
}

export function createAdminRoleService({ store, productId, clock = () => new Date() } = {}) {
  if (!productId || typeof productId !== 'string') throw new Error('제품 ID가 필요합니다.');
  if (!store || typeof store.roleFor !== 'function') throw new Error('역할 저장소가 필요합니다.');

  const at = () => {
    const value = clock();
    return value instanceof Date ? value.toISOString() : String(value);
  };

  // 저장이 망가진 자리에서는 역할을 주지 않는다. PADIEM과 같은 닫는 방향.
  async function readRole(subjectId) {
    try {
      const row = await store.roleFor({ productId, subjectId });
      if (!row || row.subjectId !== subjectId || row.productId !== productId) return null;
      return ROLES.includes(row.role) ? row.role : null;
    } catch {
      return null;
    }
  }

  return {
    productId,
    roles: ROLES,

    /** 지금 세션의 주체가 이 제품에서 어떤 역할인지 다시 확인한다. */
    async roleFor(principal) {
      if (!principal || typeof principal.subjectId !== 'string') return null;
      if (principal.productId !== productId) return null;
      try {
        return await readRole(requireSubject(principal.subjectId));
      } catch {
        return null;
      }
    },

    async assign({ actorPrincipal, targetSubjectId, role = ROLE_ADMIN, reason = null }) {
      const granted = await this.roleFor(actorPrincipal);
      if (!granted) throw new ApiError(403, 'admin_forbidden', '역할을 바꿀 권한이 없어요.');
      if (!ROLES.includes(role)) throw new ApiError(400, 'invalid_role', '알 수 없는 역할이에요.');
      const subjectId = requireSubject(targetSubjectId);
      const previous = await readRole(subjectId);
      const row = await store.assign({ productId, subjectId, role, grantedBy: actorPrincipal.subjectId, reason, at: at() });
      return { assignment: { subjectId, role, previousRole: previous, updatedAt: row?.updatedAt ?? at() }, audit: true };
    },

    async revoke({ actorPrincipal, targetSubjectId }) {
      const granted = await this.roleFor(actorPrincipal);
      if (!granted) throw new ApiError(403, 'admin_forbidden', '역할을 바꿀 권한이 없어요.');
      const subjectId = requireSubject(targetSubjectId);
      const previous = await readRole(subjectId);
      const row = await store.revoke({ productId, subjectId, revokedBy: actorPrincipal.subjectId, at: at() });
      return { revocation: { subjectId, revoked: previous !== null, previousRole: previous, updatedAt: row?.updatedAt ?? at() } };
    },

    async list() {
      try {
        const rows = await store.list({ productId });
        return (rows ?? []).filter((row) => row && row.productId === productId && SUBJECT.test(row.subjectId) && ROLES.includes(row.role))
          .map((row) => ({ subjectId: row.subjectId, role: row.role, grantedBy: typeof row.grantedBy === 'string' && ACTOR.test(row.grantedBy) ? row.grantedBy : null, updatedAt: row.updatedAt ?? null }));
      } catch {
        return [];
      }
    },

    async history({ limit = 20 } = {}) {
      const size = Number.isSafeInteger(limit) && limit > 0 && limit <= 100 ? limit : 20;
      try {
        const rows = await store.history({ productId, limit: size });
        return (rows ?? []).filter((row) => row && row.productId === productId)
          .map((row) => ({ action: row.action, subjectId: row.subjectId, previousRole: row.previousRole ?? null, role: row.role ?? null, actorSubjectId: row.actorSubjectId ?? null, changedAt: row.changedAt ?? null }));
      } catch {
        return [];
      }
    }
  };
}
