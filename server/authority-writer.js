import { ApiError } from './errors.js';
import { OTHER_REVIEWED_PRODUCTS } from './padiem-authority-auth.js';

const CANONICAL_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PRODUCT_USER_ID = /^usr_[A-Za-z0-9_-]{1,80}$/;
const PROVIDERS = new Set(['google', 'password']);

/**
 * 발급·폐기는 기존 인증 경계(Control Plane identity authority)에서 한다.
 * RPC 이름과 닫힌 키셋은 확인된 것만 쓴다 — `identity_authority_worker.py:192-205`(link),
 * `:206-231`(establish), `:264-281`(revoke). #5965의 읽기 전용 중계에는 쓰기를 넣지 않는다.
 *
 * `call(method, payload)`은 주입받는다. 이 저장소는 새 URL을 지어내지 않는다.
 */
export function createAuthorityWriter({ call, productId, mint, now = () => new Date() }) {
  if (typeof call !== 'function') throw new Error('권위 write transport가 필요합니다. 없는 상태로 발급을 열지 않습니다.');
  if (typeof productId !== 'string' || !productId) throw new Error('LOVETREE_PRODUCT_ID가 필요합니다.');
  if (OTHER_REVIEWED_PRODUCTS.includes(productId)) {
    throw new Error(`${productId}는 다른 제품의 세션 ID입니다. 러브트리 자기 제품 ID로만 발급할 수 있습니다.`);
  }

  const unavailable = () => { throw new ApiError(503, 'auth_unavailable', '로그인 발급을 하지 못했어요. 잠시 뒤 다시 시도해 주세요.'); };
  const invalid = () => { throw new ApiError(400, 'invalid_login_evidence', '로그인 확인을 하지 못했어요.'); };

  async function rpc(method, payload) {
    let answer;
    try { answer = await call(method, payload); }
    catch { unavailable(); }
    if (!answer || typeof answer !== 'object' || answer.ok !== true) unavailable();
    return answer;
  }

  return {
    /**
     * 발급 근거는 1회용 handoff 표 하나다. 표 확인·제품 링크·세션 발급이 전부 PADIEM 인증 서버 쪽에서
     * 끝나고, 여기서는 그 결과만 받는다(#5977의 `/mint-session` 계약).
     * mint가 없는 구성에서는 서버가 검증한 증거 { productUserId, authProvider, providerSubject } 세 값으로
     * 링크·발급한다 — 이메일·provider_subject를 요청에서 그대로 받아 발급하는 경로는 없다.
     */
    async issue({ evidence, handoffTicket }) {
      // handoff 표 경로: 근거 확인·제품 링크·세션 발급을 PADIEM 인증 서버가 끝낸 뒤이다.
      // 같은 값으로 링크·발급을 되풀이하면 세션이 두 개가 되니 두 경로는 함께 쓰지 않는다.
      if (handoffTicket !== undefined) {
        if (!mint || typeof mint.redeem !== 'function') throw unavailable();
        const redeemed = await mint.redeem({ handoffTicket });
        return { canonicalSessionId: redeemed.canonicalSessionId, subjectId: redeemed.subjectId };
      }
      if (mint) throw invalid();
      const { productUserId, authProvider, providerSubject } = evidence ?? {};
      if (!PRODUCT_USER_ID.test(productUserId ?? '')) invalid();
      if (!PROVIDERS.has(authProvider)) invalid();
      if (typeof providerSubject !== 'string' || !providerSubject.trim() || providerSubject.length > 255) invalid();

      const linked = await rpc('resolve_or_create_product_link', {
        product_id: productId,
        product_user_id: productUserId,
        auth_provider: authProvider,
        provider_subject: providerSubject
      });
      const subjectId = linked?.link?.canonical_subject_id;
      const state = linked?.link?.state;
      if (typeof subjectId !== 'string' || !CANONICAL_SESSION_ID.test(subjectId) || state !== 'active') unavailable();

      const authenticatedAt = now();
      const notAfter = new Date(authenticatedAt.getTime() + 60 * 60 * 1000);
      const established = await rpc('establish_auth_session', {
        product_id: productId,
        subject: { subject_type: 'user', subject_id: subjectId },
        authenticated_at: authenticatedAt.toISOString(),
        not_after: notAfter.toISOString()
      });
      const session = established?.session;
      if (!session || !CANONICAL_SESSION_ID.test(session.session_id ?? '') || session.product_id !== productId) unavailable();
      if (session.subject?.subject_id !== subjectId || session.state !== 'active') unavailable();
      const expiresAt = Date.parse(session.expires_at ?? '');
      if (!Number.isFinite(expiresAt) || expiresAt <= authenticatedAt.getTime()) unavailable();

      return { canonicalSessionId: session.session_id, subjectId, expiresAt: session.expires_at };
    },

    /** 한 세션만 폐기한다. 세션이 속한 제품 확인은 권위가 한다. */
    async revoke({ canonicalSessionId }) {
      if (!CANONICAL_SESSION_ID.test(canonicalSessionId ?? '')) invalid();
      const revoked = await rpc('revoke_auth_session', { product_id: productId, session_id: canonicalSessionId });
      if (revoked?.session?.session_id !== canonicalSessionId || revoked?.session?.state !== 'revoked') unavailable();
      return { canonicalSessionId };
    }
  };
}
