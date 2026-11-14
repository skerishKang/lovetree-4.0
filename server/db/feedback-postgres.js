const iso = value => (value instanceof Date ? value.toISOString() : value ? String(value) : null);
const feedbackRow = value => value && ({
  id: Number(value.id),
  subjectId: value.subject_id || null,
  kind: value.kind || 'opinion',
  category: value.category,
  title: value.title || null,
  body: value.body,
  score: value.score === null || value.score === undefined ? null : Number(value.score),
  journalDate: value.journal_date ? iso(value.journal_date).slice(0, 10) : null,
  context: value.context && typeof value.context === 'object' ? value.context : {},
  status: value.status,
  memo: value.memo || null,
  issueNumber: value.issue_number || null,
  authorName: value.author_name || null,
  // #611 3번: 운영센터에서는 AI 고객 이름을 'AI 윤제'처럼 알린다. 역할 한 칸만 읽는다.
  authorRole: value.author_role || null,
  replyCount: value.reply_count === undefined ? undefined : Number(value.reply_count || 0),
  createdAt: iso(value.created_at),
  updatedAt: iso(value.updated_at)
});
const replyRow = value => value && ({
  id: Number(value.id),
  postId: Number(value.post_id),
  authorType: value.author_type,
  authorSubjectId: value.author_subject_id || null,
  body: value.body,
  createdAt: iso(value.created_at)
});

export function createFeedbackRepo(pool) {
  if (!pool || typeof pool.query !== 'function') throw new Error('PostgreSQL pool이 필요합니다.');
  return {
    async create({ productId, subjectId = null, kind = 'opinion', category, title = null, body, score = null, context = {}, journalDate = null }) {
      const { rows } = await pool.query(
        `INSERT INTO lovetree_feedback (product_id, subject_id, kind, category, title, body, score, journal_date, context)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
         RETURNING *`,
        [productId, subjectId, kind, category, title, body, score, journalDate, JSON.stringify(context || {})]
      );
      return feedbackRow(rows[0]);
    },

    async list({ productId, kind = '', status = '', category = '', limit = 100 }) {
      const where = ['f.product_id = $1'];
      const params = [productId];
      if (kind) { params.push(kind); where.push(`f.kind = $${params.length}`); }
      if (status) { params.push(status); where.push(`f.status = $${params.length}`); }
      if (category) { params.push(category); where.push(`f.category = $${params.length}`); }
      const size = Math.max(1, Math.min(200, Number(limit) || 100));
      params.push(size);
      const { rows } = await pool.query(
        `SELECT f.*,
          (SELECT count(*)::int FROM lovetree_feedback_replies r WHERE r.product_id = f.product_id AND r.post_id = f.id) AS reply_count,
          (SELECT p.name FROM lovetree_ai_personas p WHERE p.product_id = f.product_id AND p.subject_id = f.subject_id) AS author_name,
          (SELECT r.role FROM lovetree_product_roles r WHERE r.product_id = f.product_id AND r.subject_id = f.subject_id) AS author_role
         FROM lovetree_feedback f
         WHERE ${where.join(' AND ')}
         ORDER BY f.created_at DESC, f.id DESC LIMIT $${params.length}`,
        params
      );
      return rows.map(feedbackRow);
    },

    async listBySubject({ productId, subjectId, kind = '' }) {
      const params = [productId, subjectId];
      let sql = `SELECT f.*,
          (SELECT count(*)::int FROM lovetree_feedback_replies r WHERE r.product_id = f.product_id AND r.post_id = f.id) AS reply_count
         FROM lovetree_feedback f WHERE f.product_id = $1 AND f.subject_id = $2`;
      if (kind) { params.push(kind); sql += ` AND f.kind = $${params.length}`; }
      sql += ' ORDER BY f.created_at DESC, f.id DESC LIMIT 200';
      const { rows } = await pool.query(sql, params);
      return rows.map(feedbackRow);
    },

    async listJournals({ productId, limit = 300 }) {
      const size = Math.max(1, Math.min(500, Number(limit) || 300));
      const { rows } = await pool.query(
        `SELECT f.*,
          (SELECT count(*)::int FROM lovetree_feedback_replies r WHERE r.product_id = f.product_id AND r.post_id = f.id) AS reply_count,
          (SELECT p.name FROM lovetree_ai_personas p WHERE p.product_id = f.product_id AND p.subject_id = f.subject_id) AS author_name,
          (SELECT r.role FROM lovetree_product_roles r WHERE r.product_id = f.product_id AND r.subject_id = f.subject_id) AS author_role
         FROM lovetree_feedback f
         WHERE f.product_id = $1 AND f.kind = 'journal'
         ORDER BY f.journal_date DESC, f.created_at DESC, f.id DESC
         LIMIT $2`,
        [productId, size]
      );
      return rows.map(feedbackRow);
    },

    async get({ productId, id }) {
      const numeric = Number(id);
      if (!Number.isSafeInteger(numeric) || numeric <= 0) return null;
      const { rows } = await pool.query(
        `SELECT f.*,
          (SELECT count(*)::int FROM lovetree_feedback_replies r WHERE r.product_id = f.product_id AND r.post_id = f.id) AS reply_count,
          (SELECT p.name FROM lovetree_ai_personas p WHERE p.product_id = f.product_id AND p.subject_id = f.subject_id) AS author_name,
          (SELECT r.role FROM lovetree_product_roles r WHERE r.product_id = f.product_id AND r.subject_id = f.subject_id) AS author_role
         FROM lovetree_feedback f WHERE f.product_id = $1 AND f.id = $2`,
        [productId, numeric]
      );
      return rows[0] ? feedbackRow(rows[0]) : null;
    },

    async todayJournal({ productId, subjectId }) {
      const { rows } = await pool.query(
        `SELECT * FROM lovetree_feedback
          WHERE product_id = $1 AND subject_id = $2 AND kind = 'journal'
            AND journal_date = (now() AT TIME ZONE 'Asia/Seoul')::date
          ORDER BY id DESC LIMIT 1`,
        [productId, subjectId]
      );
      return feedbackRow(rows[0]);
    },

    async update({ productId, id, status, memo, issueNumber, title, body, score }) {
      const numeric = Number(id);
      if (!Number.isSafeInteger(numeric) || numeric <= 0) return null;
      const { rows } = await pool.query(
        `UPDATE lovetree_feedback
            SET status = COALESCE($3, status),
                memo = COALESCE($4, memo),
                issue_number = COALESCE($5, issue_number),
                title = COALESCE($6, title),
                body = COALESCE($7, body),
                score = COALESCE($8, score),
                updated_at = now()
          WHERE product_id = $1 AND id = $2
          RETURNING *`,
        [productId, numeric, status ?? null, memo ?? null, issueNumber ?? null, title ?? null, body ?? null, score ?? null]
      );
      return rows[0] ? feedbackRow(rows[0]) : null;
    },

    async addReply({ productId, postId, authorType, authorSubjectId = null, body }) {
      const { rows } = await pool.query(
        `INSERT INTO lovetree_feedback_replies (product_id, post_id, author_type, author_subject_id, body)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [productId, Number(postId), authorType, authorSubjectId, body]
      );
      return replyRow(rows[0]);
    },

    async listReplies({ productId, postId }) {
      const { rows } = await pool.query(
        `SELECT * FROM lovetree_feedback_replies WHERE product_id = $1 AND post_id = $2 ORDER BY created_at ASC, id ASC`,
        [productId, Number(postId)]
      );
      return rows.map(replyRow);
    },

    async getPersona({ productId, subjectId }) {
      const { rows } = await pool.query(
        'SELECT * FROM lovetree_ai_personas WHERE product_id = $1 AND subject_id = $2',
        [productId, subjectId]
      );
      if (!rows[0]) return null;
      return { productId, subjectId, name: rows[0].name, intro: rows[0].intro && typeof rows[0].intro === 'object' ? rows[0].intro : {}, updatedAt: iso(rows[0].updated_at) };
    },

    async upsertPersona({ productId, subjectId, name, intro = {} }) {
      const { rows } = await pool.query(
        `INSERT INTO lovetree_ai_personas (product_id, subject_id, name, intro, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, now())
         ON CONFLICT (product_id, subject_id) DO UPDATE SET name = EXCLUDED.name, intro = EXCLUDED.intro, updated_at = now()
         RETURNING *`,
        [productId, subjectId, name, JSON.stringify(intro || {})]
      );
      return { productId, subjectId, name: rows[0].name, intro: rows[0].intro && typeof rows[0].intro === 'object' ? rows[0].intro : {}, updatedAt: iso(rows[0].updated_at) };
    }
  };
}