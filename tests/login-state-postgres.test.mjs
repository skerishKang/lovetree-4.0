import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { applySchema, createPool } from '../server/db/postgres.js';
import { createPostgresLoginStateStore } from '../server/login-state-store.js';
import { assertIsolatedTestDatabase } from '../server/testing/isolated-test-database.js';

/**
 * 로그인 상태의 단일 사용 소비를 실제 PostgreSQL에서만 검증한다.
 * LOVETREE_TEST_DATABASE_URL이 없으면 스킵한다 — 메모리 모형으로 이 검증을 대신 주장하지 않는다.
 * CI의 postgres job은 skip을 실패로 다룬다.
 */
const DATABASE_URL = process.env.LOVETREE_TEST_DATABASE_URL ?? '';
const skip = DATABASE_URL ? false : '격리된 PostgreSQL 테스트 DB가 없습니다(LOVETREE_TEST_DATABASE_URL 설정 필요). 이 파일의 검증은 미수행입니다.';

const digest = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const unique = (label) => `${label}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

async function countRows(pool, values) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM lovetree_login_states WHERE state_hash::text = ANY($1::text[])`,
    [values.map(digest)]
  );
  return rows[0].n;
}

test('two connections consuming the same state leave exactly one winner', { skip }, async () => {
  assertIsolatedTestDatabase(DATABASE_URL);
  const value = unique('race');
  const shared = await createPool(DATABASE_URL, { max: 4 });
  const first = await createPool(DATABASE_URL, { max: 1 });
  const second = await createPool(DATABASE_URL, { max: 1 });
  try {
    await applySchema(shared);
    await createPostgresLoginStateStore(shared).save({ value, ttlMs: 600_000 });

    const raced = await Promise.all([
      createPostgresLoginStateStore(first).consume({ value }),
      createPostgresLoginStateStore(second).consume({ value })
    ]);
    assert.equal(raced.filter(Boolean).length, 1, '동시 소비는 하나만 성공한다');
    assert.equal(await createPostgresLoginStateStore(second).consume({ value }), false, '세 번째 시도는 거부된다');
    assert.equal(await countRows(shared, [value]), 0);
  } finally {
    await Promise.all([shared.end(), first.end(), second.end()]);
  }
});

test('a restarted instance cannot reuse a consumed or expired state', { skip }, async () => {
  assertIsolatedTestDatabase(DATABASE_URL);
  const used = unique('restarted');
  const stale = unique('expired');

  const opened = await createPool(DATABASE_URL, { max: 2 });
  try {
    await applySchema(opened);
    const store = createPostgresLoginStateStore(opened);
    await store.save({ value: used, ttlMs: 600_000 });
    assert.equal(await store.consume({ value: used }), true);
    await store.save({ value: stale, ttlMs: -60_000 });
  } finally {
    await opened.end();
  }

  // 새 풀 = 재시작한 프로세스. 소비된 값도, 만료된 값도 다시 통과하지 못한다.
  const revived = await createPool(DATABASE_URL, { max: 2 });
  try {
    const store = createPostgresLoginStateStore(revived);
    assert.equal(await store.consume({ value: used }), false, '재시작 뒤 재사용 거부');
    assert.equal(await store.consume({ value: stale }), false, '재시작 뒤 만료 상태 거부');
    assert.equal(await store.consume({ value: unique('never-issued') }), false, '본 적 없는 상태 거부');
  } finally {
    await revived.end();
  }
});

test('only the digest is stored and purge clears expired rows', { skip }, async () => {
  assertIsolatedTestDatabase(DATABASE_URL);
  const live = unique('plain-state-value');
  const gone = unique('expired-state-value');
  const pool = await createPool(DATABASE_URL, { max: 2 });
  try {
    await applySchema(pool);
    const store = createPostgresLoginStateStore(pool);
    await store.save({ value: live, ttlMs: 600_000 });
    await store.save({ value: gone, ttlMs: -60_000 });

    const { rows } = await pool.query(`SELECT state_hash FROM lovetree_login_states`);
    for (const row of rows) assert.match(row.state_hash, /^[0-9a-f]{64}$/, '원본 값은 테이블에 남지 않는다');

    assert.equal(await store.consume({ value: live }), true);
    assert.equal(await countRows(pool, [live, gone]), 1, '만료된 행만 남는다');
    await store.purge();
    assert.equal(await countRows(pool, [live, gone]), 0);
  } finally {
    await pool.end();
  }
});
