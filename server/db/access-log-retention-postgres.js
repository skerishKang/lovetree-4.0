export const ACCESS_LOG_RETENTION_DAYS = 90;

// 2026-11-16 대표 결정(해외 서비스 예정 — 해외 기준·GDPR 보관 최소화, 공용 처리방침 러브트리 절):
// ① 로그인 없이 보낸 의견(lovetree_feedback, subject_id 없음)은 받은 날부터 6개월(183일) 뒤 자동 삭제.
//    그 의견에 달린 답글(lovetree_feedback_replies)도 함께 지운다. 로그인 의견(subject_id 있음)은
//    대상이 아니다 — 이미 계정 탈퇴 때 ACCOUNT_USER_TABLES로 함께 지워진다.
// ② 탈퇴 처리 기록(lovetree_account_deletions — subject_hash·deleted_at)은 탈퇴 후 90일 뒤 자동 삭제.
//    이전에는 '탈퇴 증거는 일부러 뺐다'(무기한 보관, 365일 prune)였지만 이번 결정으로 보관 기간이
//    정해졌다. 90일이 안전한 근거: 이 기록이 막는 것은 탈퇴한 계정의 옛 세션이고, 러브트리 세션
//    자격 증명은 최대 1시간(SESSION_MAX_AGE_SECONDS = 60*60, server/credentials/lovetree-session.js),
//    로그인 왕복 상태는 10분(STATE_MAX_AGE_SECONDS)이라 기록보다 짧게 끝난다. 기록이 지워진 뒤 같은
//    subject로 다시 로그인하면 새 세션이며, 계정 데이터는 탈퇴 때 이미 전부 지워져 되살릴 것이 없다.
export const GUEST_FEEDBACK_RETENTION_DAYS = 183;
export const ACCOUNT_DELETION_RETENTION_DAYS = 90;

// This allow-list contains operational request/audit metadata only. Content,
// payment records are deliberately excluded. Account-deletion evidence used to be
// excluded for good as well; since 2026-11-16 it has its own bounded retention
// (ACCOUNT_DELETION_RETENTION_DAYS) in deleteExpiredAccountDeletionRecords below.
export const ACCESS_LOG_RETENTION_TARGETS = Object.freeze([
  Object.freeze({
    table: 'lovetree_request_claims',
    timestamp: 'claimed_at',
    key: Object.freeze(['product_id', 'subject_id', 'client_key']),
    order: 'claimed_at, product_id, subject_id, client_key'
  }),
  Object.freeze({
    table: 'lovetree_product_role_audit',
    timestamp: 'changed_at',
    key: Object.freeze(['id']),
    order: 'changed_at, id'
  }),
  Object.freeze({
    table: 'lovetree_community_moderation_audit',
    timestamp: 'changed_at',
    key: Object.freeze(['id']),
    order: 'changed_at, id'
  }),
  // 운영센터 고객 열람 기록(261116 대표 결정) — 누가·언제·어느 고객을 열었는지의 감사 줄.
  // 내용(순간·의견 본문)은 여기에 두지 않고 각자의 원래 표에 있다.
  Object.freeze({
    table: 'lovetree_admin_customer_views',
    timestamp: 'viewed_at',
    key: Object.freeze(['id']),
    order: 'viewed_at, id'
  })
]);

function boundedInteger(value, name, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function buildDeleteQuery({ table, timestamp, key, order }) {
  const join = key.map((column) => `target.${column} = expired.${column}`).join(' AND ');
  return `WITH expired AS (
    SELECT ${key.join(', ')} FROM ${table}
    WHERE ${timestamp} <= $1
    ORDER BY ${order}
    LIMIT $2
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM ${table} AS target USING expired
  WHERE ${join}
  RETURNING 1`;
}

export async function deleteExpiredAccessLogs(pool, {
  now = new Date(),
  batchSize = 500,
  maxBatchesPerTable = 4
} = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('PostgreSQL query pool is required');
  const current = now instanceof Date ? new Date(now) : new Date(now);
  if (!Number.isFinite(current.getTime())) throw new RangeError('now must be a valid date');
  boundedInteger(batchSize, 'batchSize', 1, 5000);
  boundedInteger(maxBatchesPerTable, 'maxBatchesPerTable', 1, 20);

  const cutoff = new Date(current.getTime() - ACCESS_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const cutoffIso = cutoff.toISOString();
  const deleted = {};

  for (const target of ACCESS_LOG_RETENTION_TARGETS) {
    let count = 0;
    const sql = buildDeleteQuery(target);
    for (let batch = 0; batch < maxBatchesPerTable; batch += 1) {
      const result = await pool.query(sql, [cutoffIso, batchSize]);
      const removed = Number(result.rowCount ?? 0);
      if (!Number.isSafeInteger(removed) || removed < 0 || removed > batchSize) {
        throw new Error('access log cleanup returned an invalid batch count');
      }
      count += removed;
      if (removed < batchSize) break;
    }
    deleted[target.table] = count;
  }

  return { cutoff: cutoffIso, deleted };
}

function purgeCutoffIso(now, days) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

// 로그인 없이 보낸 의견 6개월(183일) 보관 — 답글을 먼저 지우고 본문을 배치로 지운다.
// 로그인 의견(subject_id 있음)은 어디서도 지우지 않는다(탈퇴 때 이미 지워진다). 반환값은 건수뿐이다
// (제목·본문·subject는 저널·반환값 어디에도 남기지 않는다).
export async function deleteExpiredGuestFeedback(pool, {
  now = new Date(),
  batchSize = 500,
  maxBatches = 4
} = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('PostgreSQL query pool is required');
  const current = now instanceof Date ? new Date(now) : new Date(now);
  if (!Number.isFinite(current.getTime())) throw new RangeError('now must be a valid date');
  boundedInteger(batchSize, 'batchSize', 1, 5000);
  boundedInteger(maxBatches, 'maxBatches', 1, 20);

  const cutoff = purgeCutoffIso(current, GUEST_FEEDBACK_RETENTION_DAYS);
  const expiredGuestPosts = `SELECT id FROM lovetree_feedback WHERE subject_id IS NULL AND created_at <= $1`;
  let deletedReplies = 0;
  {
    const sql = `WITH expired AS (
      SELECT id FROM lovetree_feedback_replies
      WHERE post_id IN (${expiredGuestPosts})
      ORDER BY id
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM lovetree_feedback_replies AS target USING expired
    WHERE target.id = expired.id
    RETURNING 1`;
    for (let batch = 0; batch < maxBatches; batch += 1) {
      const result = await pool.query(sql, [cutoff, batchSize]);
      const removed = Number(result.rowCount ?? 0);
      if (!Number.isSafeInteger(removed) || removed < 0 || removed > batchSize) throw new Error('guest feedback cleanup returned an invalid batch count');
      deletedReplies += removed;
      if (removed < batchSize) break;
    }
  }
  let deletedPosts = 0;
  {
    const sql = `WITH expired AS (
      SELECT id FROM lovetree_feedback
      WHERE subject_id IS NULL AND created_at <= $1
      ORDER BY id
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM lovetree_feedback AS target USING expired
    WHERE target.id = expired.id
    RETURNING 1`;
    for (let batch = 0; batch < maxBatches; batch += 1) {
      const result = await pool.query(sql, [cutoff, batchSize]);
      const removed = Number(result.rowCount ?? 0);
      if (!Number.isSafeInteger(removed) || removed < 0 || removed > batchSize) throw new Error('guest feedback cleanup returned an invalid batch count');
      deletedPosts += removed;
      if (removed < batchSize) break;
    }
  }
  return { table: 'lovetree_feedback', cutoff, deletedReplies, deletedPosts };
}

// 탈퇴 처리 기록 90일 보관(2026-11-16 대표 결정). 안전 근거는 파일 위쪽 상수 주석 참고.
// 기록을 지워도 되살릴 계정 데이터는 없다 — 탈퇴 때 ACCOUNT_USER_TABLES를 이미 전부 지웠다.
export async function deleteExpiredAccountDeletionRecords(pool, { now = new Date() } = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('PostgreSQL query pool is required');
  const current = now instanceof Date ? new Date(now) : new Date(now);
  if (!Number.isFinite(current.getTime())) throw new RangeError('now must be a valid date');
  const cutoff = purgeCutoffIso(current, ACCOUNT_DELETION_RETENTION_DAYS);
  const result = await pool.query(
    'DELETE FROM lovetree_account_deletions WHERE deleted_at <= $1',
    [cutoff]
  );
  return { table: 'lovetree_account_deletions', cutoff, deleted: Number(result.rowCount ?? 0) };
}
