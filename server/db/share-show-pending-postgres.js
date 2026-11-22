// #1163(#1068 2단계): 보임 쪽 공유 동기화 실패 표식. 계정당 한 줄 — 보임 동기화가 저장 응답 뒤에
// 실패하면 표식을 남기고, 표식이 있는 계정은 다음 저장·조회 요청에서 보임 동기화를 다시 시도해
// 성공하면 해제한다. 표 자체는 server/db/migrations/share-show-pending-261122.sql 이 만든다.
export function createShareShowPendingRepo(pool) {
  return {
    async mark({ productId, subjectId }) {
      await pool.query(
        'INSERT INTO lovetree_share_show_pending(product_id, subject_id) VALUES ($1,$2) ON CONFLICT (product_id, subject_id) DO NOTHING',
        [productId, subjectId]
      );
    },
    async clear({ productId, subjectId }) {
      await pool.query(
        'DELETE FROM lovetree_share_show_pending WHERE product_id=$1 AND subject_id=$2',
        [productId, subjectId]
      );
    },
    async has({ productId, subjectId }) {
      const result = await pool.query(
        'SELECT 1 FROM lovetree_share_show_pending WHERE product_id=$1 AND subject_id=$2 LIMIT 1',
        [productId, subjectId]
      );
      return result.rowCount > 0;
    }
  };
}
