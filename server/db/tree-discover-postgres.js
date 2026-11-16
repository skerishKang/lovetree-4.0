// 트리 둘러보기 소개 표시 저장소(2026-11-16 대표 결정 — 기본 꺼짐, 고객이 켠다. 무료).
// 스파스 운용: 켠 트리의 행만 쌓인다. 행이 없으면 꺼짐이다 — 기존에 둘러보기에 나오던 트리는
// migration(tree-discover-optin-261116.sql)이 켜짐으로 채운다. 고객 데이터(문서)는 바꾸지 않는다.
const iso = value => value instanceof Date ? value.toISOString() : value ? String(value) : null;

export function createTreeDiscoverRepo(pool) {
  return {
    async get({ productId, subjectId, treeId }) {
      const result = await pool.query(
        'SELECT discover, updated_at FROM lovetree_tree_discover WHERE product_id=$1 AND subject_id=$2 AND tree_id=$3',
        [productId, subjectId, treeId]
      );
      const row = result.rows[0];
      return { discover: row ? row.discover === true : false, updatedAt: row ? iso(row.updated_at) : null };
    },
    async set({ productId, subjectId, treeId, discover }) {
      if (discover) {
        await pool.query(
          `INSERT INTO lovetree_tree_discover (product_id, subject_id, tree_id, discover)
           VALUES ($1,$2,$3,true)
           ON CONFLICT (product_id, subject_id, tree_id) DO UPDATE SET discover=true, updated_at=now()`,
          [productId, subjectId, treeId]
        );
      } else {
        // 꺼짐은 기본값이므로 행을 지운다(스파스 운용 — 비공개 표와 같은 모양).
        await pool.query(
          'DELETE FROM lovetree_tree_discover WHERE product_id=$1 AND subject_id=$2 AND tree_id=$3',
          [productId, subjectId, treeId]
        );
      }
      return true;
    },
    // 둘러보기 SQL은 같은 표를 EXISTS로 직접 걷고, 메모리 모형 대응 판정은 이 한 줄을 쓴다.
    async isOn(productId, subjectId, treeId) {
      const result = await pool.query(
        'SELECT 1 FROM lovetree_tree_discover WHERE product_id=$1 AND subject_id=$2 AND tree_id=$3 AND discover=true',
        [productId, subjectId, treeId]
      );
      return result.rows.length > 0;
    },
    // 문서에서 사라진 트리의 소개 행은 남기지 않는다(스파스 운용 — 지워진 트리의 행은 쓰이지 않는다).
    async deleteNotIn({ productId, subjectId, treeIds }) {
      const result = await pool.query(
        'DELETE FROM lovetree_tree_discover WHERE product_id=$1 AND subject_id=$2 AND NOT (tree_id = ANY($3))',
        [productId, subjectId, treeIds]
      );
      return result.rowCount;
    }
  };
}
