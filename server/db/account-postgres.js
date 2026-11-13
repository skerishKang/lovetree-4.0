/**
 * 계정 탈퇴 저장소. CASCADE 선언에 기대지 않고 사용자 키가 있는 표를 자식→부모 순서로 명시 삭제한다.
 * 한 트랜잭션 안에서 전부 지우고, 마지막에 탈퇴 기록(해시·시각) 1행을 넣는다.
 * 어느 문장이든 실패하면 ROLLBACK으로 전부 되돌린다.
 */
export const ACCOUNT_USER_TABLES = Object.freeze([
  { table: 'lovetree_community_favorites', where: 'subject_id = $2' },
  { table: 'lovetree_community_reactions', where: 'subject_id = $2' },
  { table: 'lovetree_community_comments', where: 'subject_id = $2' },
  { table: 'lovetree_community_reports', where: 'reporter_subject_id = $2' },
  { table: 'lovetree_community_blocks', where: 'blocker_subject_id = $2 OR blocked_subject_id = $2' },
  {
    table: 'lovetree_community_hidden_shares',
    where: 'hidden_by = $2 OR share_id IN (SELECT share_id FROM lovetree_shares WHERE product_id = $1 AND subject_id = $2)'
  },
  { table: 'lovetree_community_moderation_audit', where: 'actor_subject_id = $2' },
  { table: 'lovetree_feedback_replies', where: 'author_subject_id = $2 OR post_id IN (SELECT id FROM lovetree_feedback WHERE product_id = $1 AND subject_id = $2)' },
  { table: 'lovetree_shares', where: 'subject_id = $2' },
  { table: 'lovetree_request_claims', where: 'subject_id = $2' },
  { table: 'lovetree_account_emails', where: 'subject_id = $2' },
  { table: 'lovetree_workspaces', where: 'subject_id = $2' },
  { table: 'lovetree_feedback', where: 'subject_id = $2' },
  { table: 'lovetree_ai_personas', where: 'subject_id = $2' },
  { table: 'lovetree_product_roles', where: 'subject_id = $2' },
  { table: 'lovetree_product_role_audit', where: 'subject_id = $2 OR actor_subject_id = $2' }
]);

// 사용자 키가 없어 탈퇴 경로가 지우지 않는 표. schema.sql의 사용자 키 검사에서 제외하는 근거다.
// lovetree_login_states: state 해시와 만료 시각만 있고 계정과 연결되지 않는다(로그인 1회용).
export const ACCOUNT_PRESERVED_TABLES = Object.freeze(['lovetree_login_states', 'lovetree_account_deletions', 'lovetree_account_delete_rpc_requests']);

export function createAccountRepo(pool) {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') throw new Error('PostgreSQL pool이 필요합니다.');

  async function emailFor({ productId, subjectId }) {
    if (typeof productId !== 'string' || !productId || typeof subjectId !== 'string' || !subjectId) return null;
    const result = await pool.query(
      'SELECT email FROM lovetree_account_emails WHERE product_id = $1 AND subject_id = $2',
      [productId, subjectId]
    );
    return result.rowCount > 0 ? result.rows[0].email : null;
  }

  async function upsertEmail({ productId, subjectId, email }) {
    if (typeof productId !== 'string' || !productId || typeof subjectId !== 'string' || !subjectId
        || typeof email !== 'string' || !email.trim() || email.trim().length > 320) return;
    await pool.query(
      `INSERT INTO lovetree_account_emails (product_id, subject_id, email, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (product_id, subject_id) DO UPDATE SET email = EXCLUDED.email, updated_at = now()`,
      [productId, subjectId, email.trim()]
    );
  }

  async function isDeleted({ productId, subjectHash }) {
    const result = await pool.query(
      'SELECT 1 FROM lovetree_account_deletions WHERE product_id = $1 AND subject_hash = $2',
      [productId, subjectHash]
    );
    return result.rowCount > 0;
  }

  return {
    isDeleted,
    emailFor,
    upsertEmail,
    async deleteAll({ productId, subjectId, subjectHash, at = null }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tables = {};
        for (const entry of ACCOUNT_USER_TABLES) {
          const result = await client.query(
            `DELETE FROM ${entry.table} WHERE product_id = $1 AND (${entry.where})`,
            [productId, subjectId]
          );
          tables[entry.table] = result.rowCount;
        }
        await client.query(
          `INSERT INTO lovetree_account_deletions (product_id, subject_hash, deleted_at)
           VALUES ($1, $2, COALESCE($3::timestamptz, now()))
           ON CONFLICT (product_id, subject_hash) DO UPDATE SET deleted_at = EXCLUDED.deleted_at`,
          [productId, subjectHash, at]
        );
        await client.query('COMMIT');
        return { deleted: true, deletedAt: at, tables };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }
  };
}
