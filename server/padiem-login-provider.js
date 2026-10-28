import { ApiError } from './errors.js';
import { assertServiceUrl } from './http-client.js';

// LoveTree가 자기가 만든 로그인 요청(state)의 모양. PADIEM 쪽도 같은 검사만 통과시킨다.
const LOGIN_REQUEST = /^[A-Za-z0-9_-]{16,64}$/;
// PADIEM 인증 서버가 만드는 1회용 handoff 표. 표 밖의 값은 발급 근거로 받지 않는다.
const TICKET = /^lovt_[A-Za-z0-9_-]{16,48}$/;

/**
 * 기존 PADIEM 로그인을 러브트리 로그인 공급자로 붙이는 모듈.
 *
 * 시작 주소는 배포가 준 값 두 개에서 만든다 — `/auth/lovetree/start` URL과 러브트리 자기
 * 공개 주소. 이 파일은 URL을 지어내지 않는다. 돌아오는 `code`는 **handoff 표 그 자체**이고,
 * 여기서는 표 모양만 확인한다. 사용자 ID·이메일·provider_subject는 이 경로를 지나지 않는다 —
 * 신원을 행에 쓰는 일도, 행에서 읽는 일도 PADIEM 인증 서버와 중계가 한다.
 */
export function createLoginProvider({ env = process.env, productId } = {}) {
  if (typeof productId !== 'string' || !productId) throw new Error('LOVETREE_PRODUCT_ID가 필요합니다.');
  const start = assertServiceUrl(env.LOVETREE_PADIEM_HANDOFF_START_URL, 'LOVETREE_PADIEM_HANDOFF_START_URL');
  const selfOrigin = assertServiceUrl(env.LOVETREE_PUBLIC_ORIGIN, 'LOVETREE_PUBLIC_ORIGIN');
  if (start.pathname === '' || start.pathname === '/') {
    throw new Error('LOVETREE_PADIEM_HANDOFF_START_URL은 handoff 시작 경로 전체를 적어야 합니다.');
  }
  const returnOrigin = selfOrigin.origin;

  return {
    productId,
    returnOrigin,
    authorizationUrl({ state } = {}) {
      if (typeof state !== 'string' || !LOGIN_REQUEST.test(state)) {
        throw new ApiError(500, 'internal_error', '로그인 요청을 만들지 못했어요.');
      }
      const url = new URL(start.href);
      url.search = '';
      url.searchParams.set('state', state);
      url.searchParams.set('return_origin', returnOrigin);
      return url.toString();
    },

    async exchangeCode({ code, state } = {}) {
      if (typeof code !== 'string' || !TICKET.test(code)) return null;
      if (typeof state !== 'string' || !LOGIN_REQUEST.test(state)) return null;
      // 표와 요청은 여기서 견착되지 않는다. 견착 확인은 표를 쓴 중계의 클레임에서 한 번만 한다.
      return { handoffTicket: code };
    }
  };
}
