import { ApiError } from './errors.js';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function parsePrincipal(value, expectedProductId) {
  if (!value || typeof value !== 'object') throw new ApiError(401, 'unauthenticated', '로그인이 필요해요.');
  const { productId, subjectId } = value;
  if (typeof productId !== 'string' || !IDENTIFIER.test(productId)) throw new ApiError(401, 'invalid_principal', '신원 확인에 문제를 만났어요.');
  if (typeof subjectId !== 'string' || !IDENTIFIER.test(subjectId)) throw new ApiError(401, 'invalid_principal', '신원 확인에 문제를 만났어요.');
  // 리모네·LoveBud의 제품 격리와 같은 방화벽: 다른 제품의 세션으로 이 제품 기록을 읽지 못하게 한다.
  if (productId !== expectedProductId) throw new ApiError(403, 'product_mismatch', '이 앱을 위한 로그인이 아니에요.');
  return Object.freeze({ productId, subjectId });
}
