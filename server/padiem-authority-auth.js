import { ApiError } from './errors.js';

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SUBJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** 이 저장소가 자기 제품 ID로 쓸 수 없는, 다른 제품의 검토된 ID. */
export const OTHER_REVIEWED_PRODUCTS = Object.freeze(['b62', 'b54-padiem-claw']);

/**
 * PADIEM 공통 인증 어댑터 — 실제 계약 두 개를 붙인다.
 *
 * 1단계 자격 증명 진위: `credential.verify(request)`가 `{ sessionId }`를 돌려준다.
 *    B64가 머지한 경로(`apps/ai-reward-router/src/income-pipeline/authority-session-auth.ts:196-238`)는
 *    쿠키에서 sid를 HMAC 검증 없이 뽑은 뒤 **발행자 서명 확인을 먼저** 통과시키고(`:214`) 나서 권위를 묻는다.
 *    세션 id를 받는 것만으로 로그인이 열리지 않는 이유다(`:33-42`).
 *    null → 401(진위 확인 실패), 예외 → 503(확인을 못 했음). 두 경우 2단계는 호출되지 않는다.
 *
 * 2단계 canonical 세션 확인: `authority.resolveIdentity({ sessionId })`가 확인된 신원을 돌려준다.
 *    러브트리 저장 API가 실제로 붙는 표면은 `skerishKang/ai-revenue-lab#5965`의 HTTP 계약 하나다:
 *    `POST /resolve-session { session_id }` → `200 { ok: true, identity: { session_id, product_id, subject_id, expires_at } }`.
 *    권위의 원본 RPC 두 개(`resolve_auth_session`, `resolve_product_user_for_subject`
 *    — `identity_authority_worker.py:232-238,316-338`)는 중계 안에서 불리고, 중계가 보지 못한 응답을
 *    이쪽에서 지어내지 않는다.
 *
 * 확인하는 것: 응답의 `session_id`가 방금 요청한 값과 정확히 같고, `product_id`가 이 배포의 러브트리
 * 제품 ID이고, `subject_id` 형식이 올바르고, `expires_at`이 미래다. 권위·중계가 active·user·미만료를
 * 확인했다 해도 이 쪽에서 한 번 더 닫는다.
 *
 * 쓰지 않는 것: Chat의 서명 비밀·purpose, 다른 제품 ID(`b62`·`b54-padiem-claw`), 요청 본문·query·
 * 임의 헤더의 사용자 ID, 페이로드의 `uid` 주장, 이메일 일치.
 */
export function createPadiemAuthorityAuth({ credential, authority, productId, now = () => new Date() }) {
  if (!credential || typeof credential.verify !== 'function') {
    throw new Error('credential.verify가 필요합니다. canonical session id만으로는 로그인을 인정하지 않습니다.');
  }
  if (!authority || typeof authority.resolveIdentity !== 'function') {
    throw new Error('authority.resolveIdentity가 필요합니다. 확인 경로는 ai-revenue-lab#5965의 HTTP 계약입니다.');
  }
  if (typeof productId !== 'string' || !productId) throw new Error('LOVETREE_PRODUCT_ID가 필요합니다.');
  if (OTHER_REVIEWED_PRODUCTS.includes(productId)) {
    throw new Error(`${productId}는 다른 제품의 세션 ID입니다. 러브트리 자기 제품 ID를 쓰세요.`);
  }

  const unauthenticated = () => new ApiError(401, 'unauthenticated', '로그인 확인을 하지 못했어요.');
  const unavailable = () => new ApiError(503, 'auth_unavailable', '로그인 확인을 하지 못했어요. 잠시 뒤 다시 시도해 주세요.');

  return async function authenticate(request) {
    let proof;
    try { proof = await credential.verify(request ?? {}); }
    catch (error) { if (error instanceof ApiError) throw error; throw unavailable(); }
    const sessionId = proof?.sessionId;
    if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) throw unauthenticated();

    let identity;
    try { identity = await authority.resolveIdentity({ sessionId }); }
    catch (error) { if (error instanceof ApiError) throw error; throw unavailable(); }

    if (!identity || typeof identity !== 'object') throw unavailable();
    // 자기가 요청한 세션에 대한 답인지 먼저 확인한다.
    if (identity.sessionId !== sessionId) throw unavailable();
    if (identity.productId !== productId) throw unauthenticated();
    if (typeof identity.subjectId !== 'string' || !SUBJECT_ID.test(identity.subjectId)) throw unavailable();
    const expires = Date.parse(identity.expiresAt ?? '');
    if (!Number.isFinite(expires) || expires <= now().getTime()) throw unauthenticated();

    return Object.freeze({ productId, subjectId: identity.subjectId });
  };
}
