import { ApiError } from '../errors.js';

export function createRateLimitRepo(pool, { productId } = {}) {
  if (!productId || typeof productId !== 'string') throw new Error('제품 ID가 필요합니다.');
  return {
    async rate({ key, limit, windowMs, message }) {
      if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1) {
        throw new ApiError(503, 'rate_limit_unavailable', '요청 수 확인을 잠시 할 수 없어요.');
      }
      const { rows } = await pool.query(
        `INSERT INTO lovetree_rate_limits (product_id, scope, window_start, count)
         VALUES ($1, $2, to_timestamp(floor(extract(epoch from clock_timestamp()) / ($3::numeric / 1000)) * ($3::numeric / 1000)), 1)
         ON CONFLICT (product_id, scope, window_start)
         DO UPDATE SET count = lovetree_rate_limits.count + 1
         RETURNING count,
           GREATEST(1, ceil(($3::numeric / 1000) - (extract(epoch from clock_timestamp()) - extract(epoch from window_start))))::int AS retry_after`,
        [productId, key, windowMs]
      );
      const row = rows[0];
      if (Number(row.count) > limit) {
        throw new ApiError(429, 'rate_limited', message, {retryAfterSeconds: Number(row.retry_after)});
      }
    },
    async prune() {
      await pool.query("DELETE FROM lovetree_rate_limits WHERE window_start < now() - interval '10 minutes'");
    }
  };
}
