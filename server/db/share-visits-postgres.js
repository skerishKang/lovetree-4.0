// 공유별 잠금으로 중복 판정과 누적 증가를 같은 트랜잭션에 묶는다.
export function createShareVisitsRepo(pool) {
  return {
    async record({ productId, shareId, hashes, now, expiresAt }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const share = await client.query(
          `SELECT 1 FROM lovetree_shares s WHERE s.product_id=$1 AND s.share_id=$2
            AND s.status='active'
            AND NOT EXISTS (SELECT 1 FROM lovetree_tree_visibility v WHERE v.product_id=s.product_id AND v.subject_id=s.subject_id AND v.tree_id=s.tree_id AND v.visibility='private')
            AND NOT EXISTS (SELECT 1 FROM lovetree_shares h JOIN lovetree_community_hidden_shares x ON x.product_id=h.product_id AND x.share_id=h.share_id WHERE h.product_id=s.product_id AND h.subject_id=s.subject_id AND h.tree_id=s.tree_id)
            FOR UPDATE OF s`, [productId, shareId]);
        if (!share.rowCount) { await client.query('COMMIT'); return 0; }
        const duplicate = await client.query(
          'SELECT 1 FROM lovetree_share_visit_dedup WHERE product_id=$1 AND share_id=$2 AND visitor_hash=ANY($3::text[]) AND expires_at>$4 LIMIT 1',
          [productId, shareId, hashes, now]);
        if (!duplicate.rowCount) {
          await client.query(`INSERT INTO lovetree_share_visit_dedup (product_id,share_id,visitor_hash,expires_at)
            VALUES ($1,$2,$3,$4) ON CONFLICT (product_id,share_id,visitor_hash) DO UPDATE SET expires_at=EXCLUDED.expires_at`, [productId,shareId,hashes[0],expiresAt]);
          await client.query(`INSERT INTO lovetree_share_visits (product_id,share_id,visits) VALUES ($1,$2,1)
            ON CONFLICT (product_id,share_id) DO UPDATE SET visits=lovetree_share_visits.visits+1`, [productId,shareId]);
        }
        const result = await client.query('SELECT visits FROM lovetree_share_visits WHERE product_id=$1 AND share_id=$2',[productId,shareId]);
        await client.query('COMMIT');
        return Number(result.rows[0]?.visits || 0);
      } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
      finally { client.release(); }
    },
    async count({productId,shareId}) {
      const result=await pool.query('SELECT visits FROM lovetree_share_visits WHERE product_id=$1 AND share_id=$2',[productId,shareId]);
      return Number(result.rows[0]?.visits || 0);
    },
    async prune(now = new Date()) {
      return (await pool.query('DELETE FROM lovetree_share_visit_dedup WHERE expires_at <= $1',[now])).rowCount;
    }
  };
}
