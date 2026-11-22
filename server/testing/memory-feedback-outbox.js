// #1190: 보낼 줄(outbox) 시험용 메모리 저장소. PostgreSQL 저장소와 같은 계약만 구현한다.
export function createMemoryFeedbackOutbox({ now = () => Date.now() } = {}) {
  const rows = [];
  let nextId = 1;
  const copy = row => ({...row, payload: {...row.payload}});
  return {
    rows,
    async enqueue({ productId, feedbackId, eventKey, kind, payload }) {
      const existing = rows.find(row => row.productId === productId && row.feedbackId === Number(feedbackId)
        && row.kind === kind && row.eventKey === String(eventKey));
      if (existing) return null;
      const row = {
        id: nextId++, productId, feedbackId: Number(feedbackId), eventKey: String(eventKey), kind,
        payload: {...(payload || {})}, attempts: 0, nextAttemptAt: new Date(now()).toISOString(), status: 'pending'
      };
      rows.push(row);
      return copy(row);
    },
    async due({ limit = 20 } = {}) {
      const at = now();
      return rows.filter(row => row.status === 'pending' && Date.parse(row.nextAttemptAt) <= at)
        .slice(0, Math.max(1, Math.min(100, Number(limit) || 20))).map(copy);
    },
    async markSent({ id }) {
      const row = rows.find(item => item.id === Number(id));
      if (!row || row.status !== 'pending') return false;
      row.status = 'sent';
      return true;
    },
    async markAttempt({ id, attempts, nextAttemptAt, failed }) {
      const row = rows.find(item => item.id === Number(id));
      if (!row || row.status !== 'pending') return false;
      row.attempts = Number(attempts);
      row.nextAttemptAt = new Date(nextAttemptAt).toISOString();
      row.status = failed ? 'failed' : 'pending';
      return true;
    },
    async list({ productId } = {}) {
      return rows.filter(row => !productId || row.productId === productId).map(copy);
    }
  };
}

