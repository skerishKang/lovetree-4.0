// #540 고객 의견 + 2차 게시판 — 시험용 메모리 저장소. createFeedbackRepo와 같은 계약만 구현한다.
const clone = row => ({...row, context: {...(row.context || {})}});

export function createMemoryFeedbackRepo() {
  const rows = [];
  const replies = [];
  const personas = new Map();
  const ingestKeys = new Set();
  let transactionTail = Promise.resolve();
  let nextId = 1, nextReplyId = 1;

  function replyCount(postId) { return replies.filter(r => r.postId === Number(postId)).length; }
  function authorName(subjectId) { return subjectId ? (personas.get(subjectId)?.name || null) : null; }

  return {
    rows,
    replies,
    async transaction(fn) {
      const run=transactionTail.then(async()=>{
        const beforeRows=rows.map(clone),beforeReplies=replies.map(r=>({...r})),beforeKeys=new Set(ingestKeys);
        try{return await fn(this);}
        catch(error){rows.splice(0,rows.length,...beforeRows);replies.splice(0,replies.length,...beforeReplies);ingestKeys.clear();for(const key of beforeKeys)ingestKeys.add(key);throw error;}
      });
      transactionTail=run.catch(()=>{});
      return run;
    },
    async claimIngestEvent({productId,eventKey}) {
      const key=JSON.stringify([productId,eventKey]);
      if(ingestKeys.has(key))return false;
      ingestKeys.add(key);return true;
    },
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
        .map(row => ({...clone(row), replyCount: replyCount(row.id), authorName: authorName(row.subjectId), authorRole: row.subjectId && personas.has(row.subjectId) ? 'ai_customer' : null}));
    },
    async listBySubject({productId, subjectId, kind = ''}) {
      return rows
        .filter(row => row.productId === productId && row.subjectId === subjectId)
        .filter(row => !kind || row.kind === kind)
        .sort((a, b) => b.id - a.id)
        .slice(0, 200)
        .map(row => ({...clone(row), replyCount: replyCount(row.id), authorName: authorName(row.subjectId), authorRole: row.subjectId && personas.has(row.subjectId) ? 'ai_customer' : null}));
    },
    async listJournals({productId, limit = 300}) {
      return rows
        .filter(row => row.productId === productId && row.kind === 'journal')
        .sort((a, b) => String(b.journalDate || '').localeCompare(String(a.journalDate || '')) || b.id - a.id)
        .slice(0, Math.max(1, Math.min(500, Number(limit) || 300)))
        .map(row => ({...clone(row), replyCount: replyCount(row.id), authorName: authorName(row.subjectId), authorRole: row.subjectId && personas.has(row.subjectId) ? 'ai_customer' : null}));
    },
    async get({productId, id}) {
      const row = rows.find(item => item.productId === productId && item.id === Number(id));
      return row ? {...clone(row), replyCount: replyCount(row.id), authorName: authorName(row.subjectId), authorRole: row.subjectId && personas.has(row.subjectId) ? 'ai_customer' : null} : null;
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
      return {...clone(row), replyCount: replyCount(row.id), authorName: authorName(row.subjectId), authorRole: row.subjectId && personas.has(row.subjectId) ? 'ai_customer' : null};
    },
    async addReply({productId, postId, authorType, authorSubjectId = null, body, opsReplyId = null, createdAt = null}) {
      const reply = {id: nextReplyId++, productId, postId: Number(postId), authorType, authorSubjectId, body, status: 'visible', createdAt: createdAt??'2026-11-14T00:02:00.000Z', editedAt: null,...(opsReplyId?{opsReplyId,authorName:'운영센터'}:{})};
      replies.push(reply);
      return {...reply};
    },
    async listReplies({productId, postId}) {
      return replies.filter(r => r.productId === productId && r.postId === Number(postId)).sort((a, b) => a.id - b.id).map(r => ({...r}));
    },
    async getReply({productId, replyId}) {
      const row = replies.find(r => r.productId === productId && r.id === Number(replyId));
      return row ? {...row} : null;
    },
    // 고객이 자기 덧붙임을 고친다(커뮤니티 댓글 updateComment와 같은 방식 — visible이고 본인 것만).
    async updateReply({productId, replyId, subjectId, body}) {
      const row = replies.find(r => r.productId === productId && r.id === Number(replyId));
      if (!row || row.status !== 'visible' || row.authorSubjectId !== subjectId) return null;
      row.body = body;
      row.editedAt = '2026-11-14T00:04:00.000Z';
      return {...row};
    },
    // 지운 표시를 남기는 지우기(댓글 deleteComment와 같은 방식 — status='deleted', 행은 남는다).
    async deleteReply({productId, replyId, subjectId}) {
      const row = replies.find(r => r.productId === productId && r.id === Number(replyId));
      if (!row || row.status !== 'visible' || row.authorSubjectId !== subjectId) return null;
      row.status = 'deleted';
      row.editedAt = '2026-11-14T00:04:00.000Z';
      return {...row};
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
