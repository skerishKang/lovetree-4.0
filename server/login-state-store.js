import { createHash } from 'node:crypto';

/**
 * 로그인 상태의 단일 사용 기록. 프로세스 안 Set으로는 재시작과 다중 인스턴스를 통과하지 못한다.
 * 값은 해시만 보관하고(원본은 DB에 남기지 않음), 소비는 조건부 한 문장으로 원자적으로 한다 —
 * 두 인스턴스가 같은 값을 동시에 잡아도 하나만 이긴다.
 */
const hash = (value) => createHash('sha256').update(String(value), 'utf8').digest('hex');

export function createMemoryLoginStateStore({ rows = new Map(), now = () => Date.now() } = {}) {
  return {
    async save({ value, ttlMs = 600_000 }) {
      rows.set(hash(value), now() + ttlMs);
    },
    async consume({ value }) {
      const expiry = rows.get(hash(value));
      if (expiry === undefined) return false;
      rows.delete(hash(value));
      return expiry > now();
    },
    async purge() {
      const cutoff = now();
      let removed = 0;
      for (const [key, expiry] of rows) {
        if (expiry <= cutoff) { rows.delete(key); removed += 1; }
      }
      return removed;
    }
  };
}

export function createPostgresLoginStateStore(pool) {
  if (!pool) throw new Error('PostgreSQL 풀이 필요합니다.');
  return {
    async save({ value, ttlMs = 600_000 }) {
      await pool.query(
        `INSERT INTO lovetree_login_states (state_hash, expires_at)
         VALUES ($1, now() + ($2 || ' milliseconds')::interval)
         ON CONFLICT (state_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
        [hash(value), Math.floor(ttlMs)]
      );
    },

    /** 조건부 삭제 한 문장: 같은 값을 두 인스턴스가 잡으면 하나만 true를 받는다. */
    async consume({ value }) {
      const { rowCount } = await pool.query(
        `DELETE FROM lovetree_login_states WHERE state_hash = $1 AND expires_at > now() RETURNING state_hash`,
        [hash(value)]
      );
      return rowCount === 1;
    },

    async purge() {
      const { rowCount } = await pool.query(`DELETE FROM lovetree_login_states WHERE expires_at <= now()`);
      return rowCount;
    }
  };
}
