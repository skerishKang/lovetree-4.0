export function createShareSyncPendingRepo(pool) {
  return {
    async mark({ productId, subjectId }) {
      await pool.query(
        `INSERT INTO lovetree_share_sync_pending (product_id, subject_id, marked_at)
         VALUES ($1, $2, now()) ON CONFLICT (product_id, subject_id) DO UPDATE SET marked_at = now()`,
        [productId, subjectId]
      );
      return true;
    },
    async clear({ productId, subjectId }) {
      const result = await pool.query('DELETE FROM lovetree_share_sync_pending WHERE product_id=$1 AND subject_id=$2', [productId, subjectId]);
      return result.rowCount > 0;
    },
    async has({ productId, subjectId }) {
      const { rows } = await pool.query('SELECT 1 FROM lovetree_share_sync_pending WHERE product_id=$1 AND subject_id=$2', [productId, subjectId]);
      return rows.length > 0;
    },
    async list({ productId }) {
      const { rows } = await pool.query('SELECT subject_id, marked_at FROM lovetree_share_sync_pending WHERE product_id=$1 ORDER BY marked_at', [productId]);
      return rows.map((row) => ({ subjectId: row.subject_id, markedAt: row.marked_at instanceof Date ? row.marked_at.toISOString() : String(row.marked_at) }));
    }
  };
}
