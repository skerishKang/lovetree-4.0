import { ApiError } from './errors.js';

export const SHARE_LIST_PAGE_SIZE = 50;
const INVALID_CURSOR = () => new ApiError(400, 'invalid_share_cursor', '목록을 이어 불러오지 못했어요. 처음부터 다시 열어 주세요.');
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/;
const SHARE_ID = /^[A-Za-z0-9_-]{20,64}$/;

// 커서는 사용자 신원이나 권한이 아니라 마지막으로 본 행의 정렬 키만 담는다.
// 계정·제품 범위는 모든 조회에서 서버가 확인한 주체로 다시 제한한다.
export function decodeShareListCursor(cursor) {
  if (cursor === null || cursor === undefined) return null;
  if (typeof cursor !== 'string' || !/^[A-Za-z0-9_-]{12,512}$/.test(cursor)) throw INVALID_CURSOR();
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    if (Buffer.from(raw, 'utf8').toString('base64url') !== cursor) throw INVALID_CURSOR();
    const parts = JSON.parse(raw);
    if (!Array.isArray(parts) || parts.length !== 2) throw INVALID_CURSOR();
    const [createdAt, shareId] = parts;
    if (typeof createdAt !== 'string' || !STAMP.test(createdAt) || Number.isNaN(Date.parse(createdAt)) ||
        typeof shareId !== 'string' || !SHARE_ID.test(shareId)) throw INVALID_CURSOR();
    return { createdAt, shareId };
  } catch { throw INVALID_CURSOR(); }
}

export function encodeShareListCursor({ createdAt, shareId }) {
  return Buffer.from(JSON.stringify([createdAt, shareId]), 'utf8').toString('base64url');
}
