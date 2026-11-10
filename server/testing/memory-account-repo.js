/** 계정 탈퇴 저장소 계약을 그대로 닮은 테스트 전용 메모리 모형. */

export function createMemoryAccountRepo({ rows = null, failOn = null } = {}) {
  // rows: Map<table, Array<{productId, subjects: string[]}>> — 사용자 키가 여러 개인 표도 subjects로 표현한다.
  const tables = rows ?? new Map();
  const deletions = new Set();
  // 이메일은 계정 하나당 한 값. 중복 없이 마지막 로그인 값이 남는다.
  const emails = new Map();
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
      return emails.has(productId + '\u0000' + subjectId) ? emails.get(productId + '\u0000' + subjectId) : null;
    },
    async upsertEmail({ productId, subjectId, email }) {
      if (typeof productId !== 'string' || !productId || typeof subjectId !== 'string' || !subjectId
        || typeof email !== 'string' || !email.trim() || email.trim().length > 320) return null;
      emails.set(productId + '\u0000' + subjectId, email.trim());
      return email.trim();
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
