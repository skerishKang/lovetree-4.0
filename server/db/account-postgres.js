/**
 * 계정 탈퇴 저장소. CASCADE 선언에 기대지 않고 사용자 키가 있는 표를 자식→부모 순서로 명시 삭제한다.
 * 한 트랜잭션 안에서 전부 지우고, 마지막에 탈퇴 기록(해시·시각) 1행을 넣는다.
 * 어느 문장이든 실패하면 ROLLBACK으로 전부 되돌린다.
 */
export const ACCOUNT_USER_TABLES = Object.freeze([
  { table: 'lovetree_community_favorites', where: 'subject_id = $2' },
  { table: 'lovetree_stage_saves', where: 'subject_id = $2' },
  // 투표 기록(#824) — 대상 주인이 아니라 표를 던진 사람의 키다(#824 1인 1표). 탈퇴하면 표도 함께 사라진다.
  { table: 'lovetree_community_votes', where: 'subject_id = $2' },
  { table: 'lovetree_community_reactions', where: 'subject_id = $2' },
  { table: 'lovetree_community_comments', where: 'subject_id = $2' },
  { table: 'lovetree_community_reports', where: 'reporter_subject_id = $2' },
  { table: 'lovetree_community_blocks', where: 'blocker_subject_id = $2 OR blocked_subject_id = $2' },
  {
    table: 'lovetree_community_hidden_shares',
    where: 'hidden_by = $2 OR share_id IN (SELECT share_id FROM lovetree_shares WHERE product_id = $1 AND subject_id = $2)'
  },
  { table: 'lovetree_community_moderation_audit', where: 'actor_subject_id = $2' },
  // #1098 3단계: 내 소식 읽음 시각 — 계정 키가 있으므로 탈퇴 때 함께 지운다.
  { table: 'lovetree_community_my_news_reads', where: 'subject_id = $2' },
  { table: 'lovetree_feedback_replies', where: 'author_subject_id = $2 OR post_id IN (SELECT id FROM lovetree_feedback WHERE product_id = $1 AND subject_id = $2)' },
  // #1190: 보내기 줄에도 의견 id가 남으므로 탈퇴할 때 함께 정리한다.
  { table: 'lovetree_feedback_outbox', where: 'feedback_id IN (SELECT id FROM lovetree_feedback WHERE product_id = $1 AND subject_id = $2)' },
  { table: 'lovetree_stage_moments', where: 'subject_id = $2' },
  // 공유를 만들기 전 단계의 미리보기 토큰도 계정 기록이므로 탈퇴 때 함께 지운다.
  { table: 'lovetree_share_previews', where: 'subject_id = $2' },
  { table: 'lovetree_shares', where: 'subject_id = $2' },
  { table: 'lovetree_tree_visibility', where: 'subject_id = $2' },
  { table: 'lovetree_tree_discover', where: 'subject_id = $2' },
  // #1163(#1068 2단계): 보임 동기화 실패 표식 — 계정 표식이므로 탈퇴 때 함께 사라진다.
  { table: 'lovetree_share_show_pending', where: 'subject_id = $2' },
  { table: 'lovetree_request_claims', where: 'subject_id = $2' },
  { table: 'lovetree_account_emails', where: 'subject_id = $2' },
  { table: 'lovetree_workspaces', where: 'subject_id = $2' },
  { table: 'lovetree_feedback', where: 'subject_id = $2' },
  { table: 'lovetree_ai_personas', where: 'subject_id = $2' },
  { table: 'lovetree_product_roles', where: 'subject_id = $2' },
  { table: 'lovetree_product_role_audit', where: 'subject_id = $2 OR actor_subject_id = $2' },
  // #1063: 운영센터 고객 열람 기록도 탈퇴하는 고객의 행을 함께 없앤다(90일 보관 대상과 별개).
  { table: 'lovetree_admin_customer_views', where: 'customer_subject_id = $2' }
]);

// 사용자 키가 없어 탈퇴 경로가 지우지 않는 표. schema.sql의 사용자 키 검사에서 제외하는 근거다.
// lovetree_login_states: state 해시와 만료 시각만 있고 계정과 연결되지 않는다(로그인 1회용).
export const ACCOUNT_PRESERVED_TABLES = Object.freeze(['lovetree_login_states', 'lovetree_account_deletions', 'lovetree_account_delete_rpc_requests']);

// 탈퇴가 처리되는 동안 해당 계정의 진행 중인 무대 담기와 정리 순서를 맞춘다.
export async function lockStageVoterAccount(client, { productId, subjectId }, { exclusive = false } = {}) {
  const lock = exclusive ? 'pg_advisory_xact_lock' : 'pg_advisory_xact_lock_shared';
  await client.query(
    `SELECT ${lock}(hashtext('lovetree-stage-voter-account'), hashtext($1))`,
    [JSON.stringify([productId, subjectId])]
  );
}

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

  // 가입일(첫 로그인 시각, #655 2차). 투표 자격 판정(가입 7일, #824 대표 결정)에 쓴다.
  // 행이 없으면 null — 부르는 쪽이 어떻게 다룰지 정한다(서비스층은 보수적으로 '신규와 같이 막는다').
  async function createdAtFor({ productId, subjectId }) {
    if (typeof productId !== 'string' || !productId || typeof subjectId !== 'string' || !subjectId) return null;
    const result = await pool.query(
      'SELECT created_at FROM lovetree_account_emails WHERE product_id = $1 AND subject_id = $2',
      [productId, subjectId]
    );
    return result.rowCount > 0 ? result.rows[0].created_at : null;
  }

  // created_at 은 첫 로그인 시각(가입일, #655 2차)이다. INSERT 때만 찍히고 ON CONFLICT DO UPDATE 에서
  // 일부러 빠져 있다 — 로그인할 때마다 가입일이 밀리면 '새 계정'을 셀 수 없다.
  async function upsertEmail({ productId, subjectId, email }) {
    if (typeof productId !== 'string' || !productId || typeof subjectId !== 'string' || !subjectId
        || typeof email !== 'string' || !email.trim() || email.trim().length > 320) return;
    await pool.query(
      `INSERT INTO lovetree_account_emails (product_id, subject_id, email, updated_at, created_at)
       VALUES ($1, $2, $3, now(), now())
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
    createdAtFor,
    upsertEmail,
    async deleteAll({ productId, subjectId, subjectHash, at = null }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await lockStageVoterAccount(client, { productId, subjectId }, { exclusive: true });
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
