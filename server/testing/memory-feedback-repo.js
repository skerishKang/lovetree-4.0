// #540 고객 의견 + 2차 게시판 — 시험용 메모리 저장소. createFeedbackRepo와 같은 계약만 구현한다.
const clone = row => ({...row, context: {...(row.context || {})}});

export function createMemoryFeedbackRepo() {
  const rows = [];
  const replies = [];
  const personas = new Map();
  let nextId = 1, nextReplyId = 1;

  function replyCount(postId) { return replies.filter(r => r.postId === Number(postId)).length; }
  function authorName(subjectId) { return subjectId ? (personas.get(subjectId)?.name || null) : null; }

  return {
    rows,
    replies,
    async create({productId, subjectId = null, kind = 'opinion', category, title = null, body, score = null, context = {}, journalDate = null}) {
      const row = {
        id: nextId++, productId, subjectId, kind, category, title, body,
        score: score ?? null, journalDate, context: {...context},
        status: 'received', memo: null, issueNumber: null,
        createdAt: '2026-11-14T00:00:00.000Z', updatedAt: '2026-11-14T00:00:00.000Z'
      };
      rows.push(row);
      return clone(row);
    },
    async list({productId, kind = '', status = '', category = '', limit = 100}) {
      return rows
        .filter(row => row.productId === productId)
        .filter(row => !kind || row.kind === kind)
        .filter(row => !status || row.status === status)
        .filter(row => !category || row.category === category)
        .sort((a, b) => b.id - a.id)
        .slice(0, Math.max(1, Math.min(200, Number(limit) || 100)))
        .map(row => ({...clone(row), replyCount: replyCount(row.id), authorName: authorName(row.subjectId)}));
    },
    async listBySubject({productId, subjectId, kind = ''}) {
      return rows
        .filter(row => row.productId === productId && row.subjectId === subjectId)
        .filter(row => !kind || row.kind === kind)
        .sort((a, b) => b.id - a.id)
        .slice(0, 200)
        .map(row => ({...clone(row), replyCount: replyCount(row.id), authorName: authorName(row.subjectId)}));
    },
    async listJournals({productId, limit = 300}) {
      return rows
        .filter(row => row.productId === productId && row.kind === 'journal')
        .sort((a, b) => String(b.journalDate || '').localeCompare(String(a.journalDate || '')) || b.id - a.id)
        .slice(0, Math.max(1, Math.min(500, Number(limit) || 300)))
        .map(row => ({...clone(row), replyCount: replyCount(row.id), authorName: authorName(row.subjectId)}));
    },
    async get({productId, id}) {
      const row = rows.find(item => item.productId === productId && item.id === Number(id));
      return row ? {...clone(row), replyCount: replyCount(row.id), authorName: authorName(row.subjectId)} : null;
    },
    async todayJournal({productId, subjectId}) {
      const row = rows.filter(item => item.productId === productId && item.subjectId === subjectId && item.kind === 'journal').sort((a, b) => b.id - a.id)[0];
      return row ? clone(row) : null;
    },
    async update({productId, id, status, memo, issueNumber, title, body, score}) {
      const row = rows.find(item => item.productId === productId && item.id === Number(id));
      if (!row) return null;
      if (status) row.status = status;
      if (memo !== undefined && memo !== null) row.memo = memo;
      if (issueNumber !== undefined && issueNumber !== null) row.issueNumber = issueNumber;
      if (title) row.title = title;
      if (body) row.body = body;
      if (score !== undefined && score !== null) row.score = score;
      row.updatedAt = '2026-11-14T00:01:00.000Z';
      return {...clone(row), replyCount: replyCount(row.id), authorName: authorName(row.subjectId)};
    },
    async addReply({productId, postId, authorType, authorSubjectId = null, body}) {
      const reply = {id: nextReplyId++, productId, postId: Number(postId), authorType, authorSubjectId, body, createdAt: '2026-11-14T00:02:00.000Z'};
      replies.push(reply);
      return {...reply};
    },
    async listReplies({productId, postId}) {
      return replies.filter(r => r.productId === productId && r.postId === Number(postId)).sort((a, b) => a.id - b.id).map(r => ({...r}));
    },
    async getPersona({productId, subjectId}) {
      const p = personas.get(subjectId);
      return p ? {productId, subjectId, name: p.name, intro: {...p.intro}, updatedAt: p.updatedAt} : null;
    },
    async upsertPersona({productId, subjectId, name, intro = {}}) {
      const p = {name, intro: {...intro}, updatedAt: '2026-11-14T00:03:00.000Z'};
      personas.set(subjectId, p);
      return {productId, subjectId, name, intro: {...intro}, updatedAt: p.updatedAt};
    }
  };
}