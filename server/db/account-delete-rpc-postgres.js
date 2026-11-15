import { ACCOUNT_DELETION_RETENTION_DAYS } from './access-log-retention-postgres.js';

export function createAccountDeleteRpcRepo(pool) {
  if (!pool || typeof pool.query !== 'function') throw new Error('PostgreSQL pool이 필요합니다.');

  return {
    async claimServiceRequest({ serviceId, expiresAt, now }) {
      await pool.query(
        'DELETE FROM lovetree_account_delete_rpc_requests WHERE expires_at <= to_timestamp($1)',
        [now]
      );
      const result = await pool.query(
        `INSERT INTO lovetree_account_delete_rpc_requests(service_id, expires_at)
         VALUES ($1, to_timestamp($2))
         ON CONFLICT (service_id) DO NOTHING
         RETURNING service_id`,
        [serviceId, expiresAt]
      );
      return result.rowCount === 1;
    },

    async pruneExpiredServiceRequests(now) {
      const result = await pool.query(
        'DELETE FROM lovetree_account_delete_rpc_requests WHERE expires_at <= to_timestamp($1)',
        [now]
      );
      return result.rowCount;
    },

    async pruneExpiredAccountDeletionAudits() {
      // 2026-11-16 대표 결정: 탈퇴 처리 기록은 90일 보관(기존 365일에서 단축 — GDPR 보관 최소화).
      // 기간은 access-log-retention-postgres.js의 ACCOUNT_DELETION_RETENTION_DAYS 한 벌을 쓰고,
      // 운영 purge 작업(purge-operational-logs.js)과 이 매일 타이머가 같은 기간으로 둘 다 돈다.
      const result = await pool.query(
        `DELETE FROM lovetree_account_deletions
         WHERE deleted_at <= now() - ($1 * interval '1 day')`,
        [ACCOUNT_DELETION_RETENTION_DAYS]
      );
      return result.rowCount;
    }
  };
}
