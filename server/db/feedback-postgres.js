const iso = value => (value instanceof Date ? value.toISOString() : value ? String(value) : null);
const feedbackRow = value => value && ({
  id: Number(value.id),
  subjectId: value.subject_id || null,
  category: value.category,
  body: value.body,
  context: value.context && typeof value.context === 'object' ? value.context : {},
  status: value.status,
  memo: value.memo || null,
  issueNumber: value.issue_number || null,
  createdAt: iso(value.created_at),
  updatedAt: iso(value.updated_at)
});

export function createFeedbackRepo(pool) {
  if (!pool || typeof pool.query !== 'function') throw new Error('PostgreSQL pool이 필요합니다.');
  return {
    async create({ productId, subjectId = null, category, body, context = {} }) {
      const { rows } = await pool.query(
        `INSERT INTO lovetree_feedback (product_id, subject_id, category, body, context)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING *`,
        [productId, subjectId, category, body, JSON.stringify(context || {})]
      );
      return feedbackRow(rows[0]);
    },

    async list({ productId, status = '', category = '', limit = 100 }) {
      const where = ['product_id = $1'];
      const params = [productId];
      if (status) { params.push(status); where.push(`status = $${params.length}`); }
      if (category) { params.push(category); where.push(`category = $${params.length}`); }
      const size = Math.max(1, Math.min(200, Number(limit) || 100));
      params.push(size);
      const { rows } = await pool.query(
        `SELECT * FROM lovetree_feedback WHERE ${where.join(' AND ')}
         ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
        params
      );
      return rows.map(feedbackRow);
    },

    async get({ productId, id }) {
      const numeric = Number(id);
      if (!Number.isSafeInteger(numeric) || numeric <= 0) return null;
      const { rows } = await pool.query(
        'SELECT * FROM lovetree_feedback WHERE product_id = $1 AND id = $2',
        [productId, numeric]
      );
      return feedbackRow(rows[0]);
    },

    async update({ productId, id, status, memo, issueNumber }) {
      const numeric = Number(id);
      if (!Number.isSafeInteger(numeric) || numeric <= 0) return null;
      const { rows } = await pool.query(
        `UPDATE lovetree_feedback
            SET status = COALESCE($3, status),
                memo = COALESCE($4, memo),
                issue_number = COALESCE($5, issue_number),
                updated_at = now()
          WHERE product_id = $1 AND id = $2
          RETURNING *`,
        [productId, numeric, status ?? null, memo ?? null, issueNumber ?? null]
      );
      return feedbackRow(rows[0]);
    }
  };
}