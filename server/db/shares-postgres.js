const iso = value => value instanceof Date ? value.toISOString() : value ? String(value) : null;
const row = value => value && ({
  shareId: value.share_id, subjectId: value.subject_id, treeId: value.tree_id,
  entryMomentId: value.entry_moment_id, view: value.initial_view, status: value.status,
  createdAt: iso(value.created_at), revokedAt: iso(value.revoked_at)
});
export function createShareRepo(pool) {
  return {
    async create(input) {
      const result = await pool.query(
        `INSERT INTO lovetree_shares (product_id, share_id, subject_id, tree_id, entry_moment_id, initial_view)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (product_id, share_id) DO NOTHING RETURNING *`,
        [input.productId,input.shareId,input.subjectId,input.treeId,input.entryMomentId,input.view]
      );
      return row(result.rows[0]);
    },
    async load({productId,shareId}) {
      const result = await pool.query('SELECT * FROM lovetree_shares WHERE product_id=$1 AND share_id=$2',[productId,shareId]);
      return row(result.rows[0]);
    },
    async list({productId,subjectId}) {
      const result = await pool.query('SELECT * FROM lovetree_shares WHERE product_id=$1 AND subject_id=$2 ORDER BY created_at DESC LIMIT 50',[productId,subjectId]);
      return result.rows.map(row);
    },
    async revoke({productId,subjectId,shareId}) {
      const result = await pool.query(
        `UPDATE lovetree_shares SET status='revoked', revoked_at=COALESCE(revoked_at,now()), updated_at=now()
         WHERE product_id=$1 AND subject_id=$2 AND share_id=$3 RETURNING *`,
        [productId,subjectId,shareId]
      );
      return row(result.rows[0]);
    }
  };
}
