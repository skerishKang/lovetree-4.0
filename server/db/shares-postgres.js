const iso = value => value instanceof Date ? value.toISOString() : value ? String(value) : null;
const row = value => value && ({
  shareId: value.share_id, subjectId: value.subject_id, treeId: value.tree_id,
  entryMomentId: value.entry_moment_id, view: value.initial_view, status: value.status,
  createdAt: iso(value.created_at), revokedAt: iso(value.revoked_at),
  discoverable: value.discoverable === true, discoverableAt: iso(value.discoverable_at),
  origin: value.origin || 'owner', momentCount: Number(value.moment_count ?? 0)
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
    async setDiscoverable({productId,subjectId,shareId,discoverable}) {
      const result = await pool.query(
        `UPDATE lovetree_shares SET discoverable=$4, discoverable_at=CASE WHEN $4 THEN COALESCE(discoverable_at,now()) ELSE NULL END, updated_at=now()
         WHERE product_id=$1 AND subject_id=$2 AND share_id=$3 AND status='active' RETURNING *`,
        [productId,subjectId,shareId,discoverable]
      );
      return row(result.rows[0]);
    },
    async revoke({productId,subjectId,shareId}) {
      const result = await pool.query(
        `UPDATE lovetree_shares SET status='revoked', revoked_at=COALESCE(revoked_at,now()), updated_at=now()
         WHERE product_id=$1 AND subject_id=$2 AND share_id=$3 RETURNING *`,
        [productId,subjectId,shareId]
      );
      return row(result.rows[0]);
    },
    // #538: 저장 성공 뒤 같은 훅에서 순간 수를 갱신한다(주인이 만든 행도 함께).
    async updateMomentCount({productId,subjectId,treeId,momentCount}) {
      const result = await pool.query(
        `UPDATE lovetree_shares SET moment_count=$4, updated_at=now()
         WHERE product_id=$1 AND subject_id=$2 AND tree_id=$3 AND status='active'`,
        [productId,subjectId,treeId,momentCount]
      );
      return result.rowCount;
    },
    // #538: 자동 공개 행이 없으면 만들고, 취소돼 있으면 되살린다(트리 하나에 자동 행 하나).
    async upsertAutoShare({productId,subjectId,shareId,treeId,entryMomentId,momentCount}) {
      const result = await pool.query(
        `INSERT INTO lovetree_shares (product_id,share_id,subject_id,tree_id,entry_moment_id,initial_view,origin,moment_count)
         VALUES ($1,$2,$3,$4,$5,'book','auto',$6)
         ON CONFLICT (product_id,subject_id,tree_id) WHERE origin='auto' DO UPDATE
           SET status='active', revoked_at=NULL, entry_moment_id=EXCLUDED.entry_moment_id,
               moment_count=EXCLUDED.moment_count, updated_at=now()
         RETURNING *`,
        [productId,shareId,subjectId,treeId,entryMomentId,momentCount]
      );
      return row(result.rows[0]);
    },
    // #538: 문서에서 사라진 트리의 자동 공개 행은 즉시 내린다(주인이 지우면 바로 내려감).
    async revokeAutoSharesNotIn({productId,subjectId,treeIds}) {
      const result = await pool.query(
        `UPDATE lovetree_shares SET status='revoked', revoked_at=COALESCE(revoked_at,now()), updated_at=now()
         WHERE product_id=$1 AND subject_id=$2 AND origin='auto' AND status='active' AND NOT (tree_id = ANY($3))`,
        [productId,subjectId,treeIds]
      );
      return result.rowCount;
    }
  };
}
