import { ApiError } from './errors.js';

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PRODUCT_USER_ID = /^usr_[A-Za-z0-9_-]{1,80}$/;

/** 이 저장소가 자기 제품 ID로 쓸 수 없는, 다른 제품의 검토된 ID. */
export const OTHER_REVIEWED_PRODUCTS = Object.freeze(['b62', 'b54-padiem-claw']);

/**
 * PADIEM 공통 인증 어댑터 — 확인된 실제 계약(`skerishKang/ai-revenue-lab` main `b8c3840d`):
 * - `packages/padiem-control-plane/identity_authority_worker.py:232-238` `resolve_auth_session({ session_id })` → `{ ok: true, session }`
 * - `packages/padiem-control-plane/padiem_control_plane/auth_sessions.py:127-139` session 공개 형상
 *   (`session_id`, `product_id`, `subject{subject_type,subject_id}`, `issued_at`, `expires_at`, `state`, `revision`)
 * - `identity_authority_worker.py:316-338` `resolve_product_user_for_subject({ product_id, canonical_subject_id })` → `{ ok: true, product_user_id }`
 * - 권위는 private service binding 전용(`PUBLIC_FETCH=False`, `PRODUCTION_ROUTE_CONFIGURED=False`, `fetch`는 404).
 *   transport `call(method, payload)`은 주입받고, 이 파일은 URL·경로를 가지지 않는다.
 *
 * 로그인은 두 단계가 맞물려야 성립한다. B64가 머지한 경로(`apps/ai-reward-router/src/income-pipeline/authority-session-auth.ts:196-238`)는
 * 1) 자격 증명 진위 확인 → 2) canonical 세션 조회 순서다. 그 파일에서 sid는 쿠키 페이로드에서 **HMAC 검증 없이** 뽑기만 하고(`:110-131`),
 * 발행자(chat)의 서명 확인(`signatureProbe`, `:214`)을 권위에 묻기 **전에** 통과시킨다. 합성 페이로드가 살아 있는 sid를 실어도
 * 신원이 되지 않게 하기 위해서다(`:33-42`의 security delta).
 *
 * 이 어댑터는 2단계(`credential` 주입 이후)와 1단계를 **분리**해 받는다. `credential.verify`는
 * - 서명된 자격 증명: 발행자가 검증한 뒤에 세션 id를 돌려준다. 러브트리 발급 경로가 그 발행자이며, Chat의 비밀키·purpose를 쓰지 않는다.
 * - opaque bearer: 발급·검증·폐기 계약이 있어야 한다. 그 계약이 없는 지금은 배포가 검증자를 주입하지 않으면 열리지 않는다.
 * `verify`가 null을 돌려주면 401(진위 확인 실패), 예외를 던지면 503(확인 자체를 못 했음)이고, 두 경우 모두 권위에는 요청을 보내지 않는다.
 *
 * 신원으로 쓰지 않는 것: 요청 본문·query·임의 헤더의 사용자 ID, 페이로드의 `uid` 주장, 이메일 일치.
 */
export function createPadiemAuthorityAuth({ credential, call, productId, timeoutMs = 3_000, now = () => new Date() }) {
  if (!credential || typeof credential.verify !== 'function') {
    throw new Error('credential.verify가 필요합니다. canonical session id만으로는 로그인을 인정하지 않습니다.');
  }
  if (typeof call !== 'function') throw new Error('authority transport call가 필요합니다. 없는 상태로 인증을 열지 않습니다.');
  if (typeof productId !== 'string' || !productId) throw new Error('LOVETREE_PRODUCT_ID가 필요합니다.');
  if (OTHER_REVIEWED_PRODUCTS.includes(productId)) {
    throw new Error(`${productId}는 다른 제품의 세션 ID입니다. 러브트리 자기 제품 ID를 쓰세요.`);
  }

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
    let proof;
    try { proof = await credential.verify(request ?? {}); }
    catch (error) { if (error instanceof ApiError) throw error; throw unavailable(); }
    const sessionId = proof?.sessionId;
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
