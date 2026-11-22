// #1190: 공용 운영센터로 보낼 줄(outbox) 저장소. 표 이름은 마이그레이션·되돌리기와 같다.
export const FEEDBACK_OUTBOX_TABLE = 'lovetree_feedback_outbox';
export const OUTBOX_KINDS = Object.freeze(['new', 'append', 'status']);
export const OUTBOX_STATUSES = Object.freeze(['pending', 'sent', 'failed']);

const iso = value => (value instanceof Date ? value.toISOString() : value ? String(value) : null);
const outboxRow = value => value && ({
  id: Number(value.id),
  productId: value.product_id,
  feedbackId: Number(value.feedback_id),
  eventKey: value.event_key,
  kind: value.kind,
  payload: value.payload && typeof value.payload === 'object' ? value.payload : {},
  attempts: Number(value.attempts || 0),
  nextAttemptAt: iso(value.next_attempt_at),
  status: value.status,
  createdAt: iso(value.created_at),
  updatedAt: iso(value.updated_at)
});

export function createFeedbackOutboxRepo(pool, { now = () => Date.now() } = {}) {
  if (!pool || typeof pool.query !== 'function') throw new Error('PostgreSQL pool이 필요합니다.');
  const executor = client => client || pool;
  return {
    // 같은 의견 id·종류·일 키는 한 줄만 — 중복 요청도 한 번만 보낸다.
    async enqueue({ productId, feedbackId, eventKey, kind, payload }, client) {
      const id = Number(feedbackId);
      if (!productId || !Number.isSafeInteger(id) || id <= 0 || !OUTBOX_KINDS.includes(kind) || !eventKey) return null;
      const { rows } = await executor(client).query(
        `INSERT INTO ${FEEDBACK_OUTBOX_TABLE} (product_id, feedback_id, event_key, kind, payload, next_attempt_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, to_timestamp($6 / 1000.0))
         ON CONFLICT (product_id, feedback_id, kind, event_key) DO NOTHING
         RETURNING *`,
        [productId, id, String(eventKey), kind, JSON.stringify(payload || {}), now()]
      );
      return rows[0] ? outboxRow(rows[0]) : null;
    },

    async due({ limit = 20 } = {}) {
      const size = Math.max(1, Math.min(100, Number(limit) || 20));
      const { rows } = await pool.query(
        `SELECT * FROM ${FEEDBACK_OUTBOX_TABLE}
          WHERE status = 'pending' AND next_attempt_at <= to_timestamp($1 / 1000.0)
          ORDER BY next_attempt_at, id LIMIT $2`,
        [now(), size]
      );
      return rows.map(outboxRow);
    },

    async markSent({ id }, client) {
      const { rowCount } = await executor(client).query(
        `UPDATE ${FEEDBACK_OUTBOX_TABLE} SET status = 'sent', updated_at = now()
          WHERE id = $1 AND status = 'pending'`,
        [Number(id)]
      );
      return rowCount > 0;
    },

    async markAttempt({ id, attempts, nextAttemptAt, failed }, client) {
      const status = failed ? 'failed' : 'pending';
      const { rowCount } = await executor(client).query(
        `UPDATE ${FEEDBACK_OUTBOX_TABLE}
            SET attempts = $2, next_attempt_at = to_timestamp($3 / 1000.0), status = $4, updated_at = now()
          WHERE id = $1 AND status = 'pending'`,
        [Number(id), Number(attempts), Date.parse(nextAttemptAt), status]
      );
      return rowCount > 0;
    },

    async list({ productId, limit = 100 } = {}) {
      const size = Math.max(1, Math.min(500, Number(limit) || 100));
      if (!productId) return [];
      const { rows } = await pool.query(
        `SELECT * FROM ${FEEDBACK_OUTBOX_TABLE} WHERE product_id = $1 ORDER BY id DESC LIMIT $2`,
        [productId, size]
      );
      return rows.map(outboxRow);
    }
  };
}

