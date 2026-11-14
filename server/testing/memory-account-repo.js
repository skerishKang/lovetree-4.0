/** 계정 탈퇴 저장소 계약을 그대로 닮은 테스트 전용 메모리 모형. */

export function createMemoryAccountRepo({ rows = null, failOn = null } = {}) {
  // rows: Map<table, Array<{productId, subjects: string[]}>> — 사용자 키가 여러 개인 표도 subjects로 표현한다.
  const tables = rows ?? new Map();
  const deletions = new Set();
  // 이메일은 계정 하나당 한 값. 중복 없이 마지막 로그인 값이 남는다.
  // 2026-11-15 (#655 2차): createdAt = 첫 로그인 시각(가입일). 두 번째 로그인부터는 updatedAt 만 바뀐다.
  const emails = new Map();
  let tick = 0;
  const stamp = () => new Date(Date.UTC(2026, 10, 15) + (tick += 1) * 1000).toISOString();
  let fail = failOn;
  const clone = () => new Map([...tables].map(([name, list]) => [name, list.map((row) => ({ ...row, subjects: [...row.subjects] }))]));

  return {
    seed(table, entry) {
      if (!tables.has(table)) tables.set(table, []);
      tables.get(table).push({ subjects: [], ...entry });
    },
    failNext(value) { fail = value; },
    snapshot() { return { tables: clone(), deletions: new Set(deletions) }; },
    rowCount(table, subjectId) {
      return (tables.get(table) || []).filter((row) => row.subjects.includes(subjectId)).length;
    },
    async isDeleted({ productId, subjectHash }) {
      return deletions.has(productId + '\u0000' + subjectHash);
    },
    async emailFor({ productId, subjectId }) {
      if (typeof productId !== 'string' || !productId || typeof subjectId !== 'string' || !subjectId) return null;
      const row = emails.get(productId + '\u0000' + subjectId);
      return row ? row.email : null;
    },
    async upsertEmail({ productId, subjectId, email, at = null }) {
      if (typeof productId !== 'string' || !productId || typeof subjectId !== 'string' || !subjectId
        || typeof email !== 'string' || !email.trim() || email.trim().length > 320) return null;
      const key = productId + '\u0000' + subjectId;
      const now = at ? String(at) : stamp();
      const previous = emails.get(key);
      // 첫 로그인에서만 createdAt 이 찍힌다(PG 의 ON CONFLICT DO UPDATE 에서 created_at 이 빠진 것과 같다).
      emails.set(key, { email: email.trim(), createdAt: previous ? previous.createdAt : now, updatedAt: now });
      return email.trim();
    },
    /** 가입일 확인·집계용(#655 2차). 로그인한 적 있는 계정만 들어 있다. */
    async accounts({ productId }) {
      return [...emails.entries()]
        .filter(([key]) => key.startsWith(productId + '\u0000'))
        .map(([key, row]) => ({ subjectId: key.slice(productId.length + 1), createdAt: row.createdAt, updatedAt: row.updatedAt }))
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    },
    async accountCreatedAt({ productId, subjectId }) {
      const row = emails.get(productId + '\u0000' + subjectId);
      return row ? row.createdAt : null;
    },
    async deleteAll({ productId, subjectId, subjectHash, at }) {
      const before = clone();
      try {
        if (fail) throw new Error(fail);
        const counts = {};
        for (const [table, list] of tables) {
          const keep = list.filter((row) => !(row.productId === productId && row.subjects.includes(subjectId)));
          counts[table] = list.length - keep.length;
          tables.set(table, keep);
        }
        // 이메일도 사용자 키 표로 함께 지운다(ACCOUNT_USER_TABLES와 동일 계약).
        emails.delete(productId + '\u0000' + subjectId);
        deletions.add(productId + '\u0000' + subjectHash);
        return { deleted: true, deletedAt: at, tables: counts };
      } catch (error) {
        tables.clear();
        for (const [name, list] of before) tables.set(name, list);
        throw error;
      }
    }
  };
}
