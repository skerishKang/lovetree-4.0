// 트리 공개 상태 저장소 (#538 공개가 기본).
// 스파스 운용: 비공개 행만 쌓이고, 행이 없으면 공개다.
// 비공개는 Plus 전용이며, 판단은 서비스층(plusEntitled)이 한다 — 이 저장소는 값만 유지한다.
const iso = value => value instanceof Date ? value.toISOString() : value ? String(value) : null;

export function createTreeVisibilityRepo(pool) {
  return {
    async get({ productId, subjectId, treeId }) {
      const result = await pool.query(
        'SELECT visibility, updated_at FROM lovetree_tree_visibility WHERE product_id=$1 AND subject_id=$2 AND tree_id=$3',
        [productId, subjectId, treeId]
      );
      const row = result.rows[0];
      return row ? { visibility: row.visibility, updatedAt: iso(row.updated_at) } : { visibility: 'public', updatedAt: null };
    },
    async set({ productId, subjectId, treeId, visibility }) {
      if (visibility === 'private') {
        await pool.query(
          `INSERT INTO lovetree_tree_visibility (product_id, subject_id, tree_id, visibility)
           VALUES ($1,$2,$3,'private')
           ON CONFLICT (product_id, subject_id, tree_id) DO UPDATE SET visibility='private', updated_at=now()`,
          [productId, subjectId, treeId]
        );
      } else {
        // 공개는 기본값이므로 행을 지운다.
        await pool.query(
          'DELETE FROM lovetree_tree_visibility WHERE product_id=$1 AND subject_id=$2 AND tree_id=$3',
          [productId, subjectId, treeId]
        );
      }
      return visibility;
    }
  };
}
