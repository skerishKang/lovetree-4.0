import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPool } from '../server/db/postgres.js';
import { assertIsolatedTestDatabase } from '../server/testing/isolated-test-database.js';

/**
 * 실제 PostgreSQL에서만 도는 migration 실행 시험.
 * 빈 DB에 schema.sql + migrations/*.sql 을 순서대로 적용하고,
 * 한 번 더 적용(재실행 안전성)해도 같은 결과가 되는지 확인한다.
 * LOVETREE_TEST_DATABASE_URL이 없으면 스킵한다 —
 * CI의 migration job은 skip을 실패로 다루므로 여기 테스트가 건너뛴 채 통과하지 못한다.
 */
const DATABASE_URL = process.env.LOVETREE_TEST_DATABASE_URL ?? '';
const skip = DATABASE_URL ? false : '격리된 PostgreSQL 테스트 DB가 없습니다(LOVETREE_TEST_DATABASE_URL 설정 필요). 이 파일의 검증은 미수행입니다.';

const MIGRATIONS_DIR = fileURLToPath(new URL('../server/db/migrations/', import.meta.url));
const SCHEMA_PATH = fileURLToPath(new URL('../server/db/schema.sql', import.meta.url));

async function listMigrationFiles() {
  const names = await readdir(MIGRATIONS_DIR);
  return names
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => fileURLToPath(new URL(`../server/db/migrations/${name}`, import.meta.url)));
}

async function applyAllMigrations(pool) {
  for (const file of await listMigrationFiles()) {
    const sql = await readFile(file, 'utf8');
    await pool.query(sql);
  }
}

test('migrations apply cleanly to empty DB and are re-runnable', { skip }, async () => {
  assertIsolatedTestDatabase(DATABASE_URL);
  const pool = await createPool(DATABASE_URL, { max: 1 });
  try {
    // 빈 DB에 migrations 전체를 순서대로 적용 (schema.sql 선행 — migrations는 기존 테이블을 가정한다)
    const schemaSql = await readFile(SCHEMA_PATH, 'utf8');
    await pool.query(schemaSql);
    await applyAllMigrations(pool);

    // 재실행 안전성: 두 번째 적용도 실패 없이 같은 상태여야 한다
    await pool.query(schemaSql);
    await applyAllMigrations(pool);

    // 운영 DB 상태와 동등한 결과 확인:
    // ① 반응 CHECK: heart/like/love/laugh/wow/sad/angry 7종
    const check = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def
         FROM pg_constraint
        WHERE conname = 'lovetree_community_reactions_kind_check'`
    );
    assert.equal(check.rows.length, 1, '반응 kind CHECK가 존재해야 한다');
    const def = String(check.rows[0].def);
    for (const kind of ['heart', 'like', 'love', 'laugh', 'wow', 'sad', 'angry']) {
      assert.match(def, new RegExp(kind), `CHECK에 ${kind}가 포함돼야 한다: ${def}`);
    }

    // ② 댓글 edited_at 칸 존재
    const col = await pool.query(
      `SELECT data_type
         FROM information_schema.columns
        WHERE table_name = 'lovetree_community_comments' AND column_name = 'edited_at'`
    );
    assert.equal(col.rows.length, 1, 'lovetree_community_comments.edited_at 칸이 있어야 한다');
    assert.equal(col.rows[0].data_type, 'timestamp with time zone');

    // ③ 신규 kind 삽입이 허용되고, 허용 외 kind는 거부される (CHECK가 실제로 동작)
    const productId = 'lt-mig-' + Date.now().toString(36);
    const shareId = 's-mig-' + Date.now().toString(36);
    await pool.query(
      `INSERT INTO lovetree_shares(product_id, share_id, subject_id, tree_id, entry_moment_id, initial_view, discoverable)
       VALUES ($1, $2, 'owner', 'tree', 'moment', 'book', true)`,
      [productId, shareId]
    );
    await pool.query(
      `INSERT INTO lovetree_community_reactions(product_id, share_id, subject_id, kind)
       VALUES ($1, $2, 'reader', 'wow')`,
      [productId, shareId]
    );
    await assert.rejects(
      pool.query(
        `INSERT INTO lovetree_community_reactions(product_id, share_id, subject_id, kind)
         VALUES ($1, $2, 'reader', 'not-allowed')`,
        [productId, shareId]
      ),
      /check|violates/i
    );
  } finally {
    await pool.end();
  }
});
