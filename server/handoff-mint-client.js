import { ApiError } from './errors.js';
import { assertServiceUrl, postJson, unauthenticated, unavailable } from './http-client.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REJECTED = new Set(['invalid_handoff', 'handoff_consumed', 'handoff_expired', 'session_not_minted']);

const rejected = () => new ApiError(401, 'login_handoff_rejected', '로그인 확인을 다시 해야 해요. 처음부터 시도해 주세요.');

/**
 * #5977의 `/mint-session`을 부르는 클라이언트. **handoff 표 하나만** 보낸다 —
 * 브라우저·컴2가 준 provider_subject·이메일·제품 user id는 이 요청에 들어가지 않는다.
 * 근거 확인·제품 링크·세션 발급은 전부 PADIEM 인증 서버 쪽에서 일어나고,
 * 여기서 받는 것은 이미 검증된 결과뿐이다(`server/authority-writer.js`와 같은 계약).
 *
 * 표는 단일 사용이다. 표가 소비된 *뒤에* 발급이 실패하면 같은 표로 재시도할 수 없고
 * 로그인을 처음부터 다시 해야 한다 — 이것을 재시도 정책으로 명시한다.
 */
export function createHandoffMintClient({ url, callerSecret, productId, timeoutMs = 2_500, maxResponseBytes = 16 * 1024, fetchImpl = globalThis.fetch, now = () => new Date() }) {
  const mintUrl = assertServiceUrl(url, 'LOVETREE_MINT_URL');
  if (typeof callerSecret !== 'string' || !callerSecret) throw new Error('LOVETREE_CALLER_SECRET이 필요합니다.');
  if (typeof productId !== 'string' || !productId) throw new Error('LOVETREE_PRODUCT_ID가 필요합니다.');
  if (typeof fetchImpl !== 'function') throw new Error('fetch 구현이 필요합니다.');

  return {
    async redeem({ handoffTicket } = {}) {
      if (typeof handoffTicket !== 'string' || !ID.test(handoffTicket)) throw unauthenticated();
      const outcome = await postJson({
        url: mintUrl.href,
        body: { handoff_ticket: handoffTicket },
        callerSecret,
        timeoutMs,
        maxResponseBytes,
        fetchImpl,
        label: 'mint'
      });
      if (outcome.failed) throw unavailable();
      // 발급 정책이 정해지지 않은 경로는 여기서 열지 않는다.
      if (outcome.status === 501) throw unavailable();

      const envelope = outcome.envelope;
      const code = envelope?.error?.code;
      if (outcome.status === 401 && REJECTED.has(code)) throw rejected();
      if (outcome.status !== 200 || envelope?.ok !== true) throw unavailable();

      const minted = envelope.session;
      const expires = Date.parse(minted?.expires_at ?? '');
      // 중계는 발급 사실과 식별자만 돌려준다(#5977 후속 계약). 신원 값은 표 안에 남고 지나오지 않는다.
      const verified = minted
        && ID.test(minted.session_id ?? '')
        && minted.product_id === productId
        && ID.test(minted.subject_id ?? '')
        && Number.isFinite(expires) && expires > now().getTime();
      if (!verified) throw unavailable();

      return {
        canonicalSessionId: minted.session_id,
        subjectId: minted.subject_id,
        expiresAt: minted.expires_at
      };
    }
  };
}
