import { ApiError } from './errors.js';

/**
 * 인증 경계는 주입 가능한 한 함수다: `authenticate(request) -> { productId, subjectId } | null`.
 * PADIEM Control Plane 연결(러브트리 제품 ID로 여는 identity bridge)이 이 자리에 들어온다.
 * 요청 본문·query·임의 헤더는 신원의 근거가 아니다. 연결이 없을 때는 우회로를 두지 않고 거부한다.
 */
export async function unconfiguredAuth() {
  throw new ApiError(503, 'auth_unavailable', '로그인 연결이 아직 준비되지 않았어요.');
}
