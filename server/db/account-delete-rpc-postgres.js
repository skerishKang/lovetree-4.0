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
      const result = await pool.query(
        `DELETE FROM lovetree_account_deletions
         WHERE deleted_at <= now() - interval '365 days'`
      );
      return result.rowCount;
    }
  };
}
