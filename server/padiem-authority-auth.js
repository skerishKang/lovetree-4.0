import { ApiError } from './errors.js';

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PRODUCT_USER_ID = /^usr_[A-Za-z0-9_-]{1,80}$/;

/**
 * PADIEM 공통 인증 어댑터.
 *
 * 확인된 실제 계약(`skerishKang/ai-revenue-lab` main `19c280dd`):
 * - `packages/padiem-control-plane/identity_authority_worker.py:232-238` `resolve_auth_session({ session_id })`
 *   → `{ ok: true, session }`, session 모양은 `padiem_control_plane/auth_sessions.py:127-139`
 *   (`session_id`, `product_id`, `subject{subject_type,subject_id}`, `issued_at`, `expires_at`, `state`, `revision`).
 * - `identity_authority_worker.py:316-338` `resolve_product_user_for_subject({ product_id, canonical_subject_id })`
 *   → `{ ok: true, product_user_id }`.
 * - 이 권위는 private service binding 전용이다(`PUBLIC_FETCH=False`, `PRODUCTION_ROUTE_CONFIGURED=False`,
 *   `fetch`는 404). 따라서 transport `call(method, payload)`는 주입받고, 이 파일은 URL·포트·경로를 가지지 않는다.
 * - 검증 순서는 이미 머지된 제품 경로 `apps/ai-reward-router/src/income-pipeline/authority-session-auth.ts:14-27`을 따른다:
 *   세션 id는 128비트 베어러 값으로 그 자체이고, 서명 비밀을 제품 쪽이 갖지 않는다.
 *
 * 신뢰하지 않는 것: 요청 본문·query·임의 헤더의 사용자 ID, 쿠키 페이로드의 `uid` 주장, 이메일 일치.
 * 소유권 키는 권위가 돌려준 canonical subject id뿐이다.
 */
export function createPadiemAuthorityAuth({ call, productId, readSessionId, timeoutMs = 3_000, now = () => new Date() }) {
  if (typeof call !== 'function') throw new Error('authority transport call가 필요합니다. 없는 상태로 인증을 열지 않습니다.');
  if (typeof productId !== 'string' || !productId) throw new Error('LOVETREE_PRODUCT_ID가 필요합니다.');
  if (typeof readSessionId !== 'function') throw new Error('세션 자격 증명을 읽는 지점이 필요합니다.');

  const unauthenticated = () => new ApiError(401, 'unauthenticated', '로그인이 필요해요.');
  const unavailable = () => new ApiError(503, 'auth_unavailable', '로그인 확인을 하지 못했어요. 잠시 뒤 다시 시도해 주세요.');

  async function rpc(method, payload) {
    let timer;
    try {
      const answer = await Promise.race([
        Promise.resolve().then(() => call(method, payload)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('authority timeout')), timeoutMs); })
      ]);
      // 권위가 "아니오"라고 답한 것은 확인 실패(401)로, 답을 못 받은 것은 장애(503)로 가른다.
      if (answer?.ok === false) throw unauthenticated();
      if (!answer || typeof answer !== 'object' || answer.ok !== true) throw unavailable();
      return answer;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw unavailable();
    } finally {
      clearTimeout(timer);
    }
  }

  return async function authenticate(request) {
    const sessionId = readSessionId(request ?? {});
    if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) throw unauthenticated();

    const { session } = await rpc('resolve_auth_session', { session_id: sessionId });
    const subject = session?.subject;
    const expires = Date.parse(session?.expires_at ?? '');
    const verified = session
      && session.session_id === sessionId
      && session.product_id === productId
      && session.state === 'active'
      && subject?.subject_type === 'user'
      && typeof subject.subject_id === 'string' && SESSION_ID.test(subject.subject_id)
      && Number.isFinite(expires) && expires > now().getTime();
    if (!verified) throw unauthenticated();

    const linked = await rpc('resolve_product_user_for_subject', { product_id: productId, canonical_subject_id: subject.subject_id });
    if (!PRODUCT_USER_ID.test(linked?.product_user_id ?? '')) throw unauthenticated();

    return Object.freeze({ productId, subjectId: subject.subject_id });
  };
}
