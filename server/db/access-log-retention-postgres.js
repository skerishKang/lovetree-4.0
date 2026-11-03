export const ACCESS_LOG_RETENTION_DAYS = 90;

// This allow-list contains operational request/audit metadata only. Content,
// account-deletion evidence, and payment records are deliberately excluded.
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
