import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPool } from '../server/db/postgres.js';
import { assertIsolatedTestDatabase } from '../server/testing/isolated-test-database.js';
import { createAccountRepo } from '../server/db/account-postgres.js';

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
    const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
    const productId = ('lt-' + tag).slice(0, 32);
    const shareId = ('s' + tag).padEnd(24, 'x').slice(0, 24);
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

    // ④ 계정 이메일: 표가 스키마에 있고, 같은 계정에 다시 쓰면 덮어쓴다(업서트).
    const emailColumns = await pool.query(
      `SELECT column_name, is_nullable, data_type
         FROM information_schema.columns
        WHERE table_name = 'lovetree_account_emails'
        ORDER BY ordinal_position`
    );
    assert.deepEqual(
      emailColumns.rows.map((row) => ({ column: row.column_name, nullable: row.is_nullable, type: row.data_type })),
      [
        { column: 'product_id', nullable: 'NO', type: 'text' },
        { column: 'subject_id', nullable: 'NO', type: 'text' },
        { column: 'email', nullable: 'NO', type: 'text' },
        { column: 'updated_at', nullable: 'NO', type: 'timestamp with time zone' },
        // 2026-11-15 (#655 2차): created_at = 러브트리 첫 로그인 시각(가입일)
        { column: 'created_at', nullable: 'NO', type: 'timestamp with time zone' }
      ],
      'lovetree_account_emails 컬럼이 스키마대로다'
    );
    await pool.query(
      `INSERT INTO lovetree_account_emails (product_id, subject_id, email) VALUES ($1, $2, $3)
       ON CONFLICT (product_id, subject_id) DO UPDATE SET email = EXCLUDED.email`,
      [productId, 'sub_owner', 'First@Example.test']
    );
    await pool.query(
      `INSERT INTO lovetree_account_emails (product_id, subject_id, email) VALUES ($1, $2, $3)
       ON CONFLICT (product_id, subject_id) DO UPDATE SET email = EXCLUDED.email`,
      [productId, 'sub_owner', 'second@example.test']
    );
    const emailRow = await pool.query(
      'SELECT email FROM lovetree_account_emails WHERE product_id = $1 AND subject_id = $2',
      [productId, 'sub_owner']
    );
    assert.equal(emailRow.rows[0].email, 'second@example.test');

    // ⑤ 첫 로그인 시각은 한 번만 찍힌다 (#655 2차). 두 번째 로그인은 updated_at 만 바꾼다.
    const accountRepo = createAccountRepo(pool);
    const loginSubject = 'sub_login';
    await accountRepo.upsertEmail({ productId, subjectId: loginSubject, email: 'first@example.test' });
    const first = (await pool.query(
      'SELECT email, created_at, updated_at FROM lovetree_account_emails WHERE product_id = $1 AND subject_id = $2',
      [productId, loginSubject]
    )).rows[0];
    await new Promise((resolve) => setTimeout(resolve, 20));
    await accountRepo.upsertEmail({ productId, subjectId: loginSubject, email: 'second@example.test' });
    const second = (await pool.query(
      'SELECT email, created_at, updated_at FROM lovetree_account_emails WHERE product_id = $1 AND subject_id = $2',
      [productId, loginSubject]
    )).rows[0];
    assert.equal(second.email, 'second@example.test');
    assert.equal(second.created_at.getTime(), first.created_at.getTime(), 'created_at(가입일)은 그대로여야 한다');
    assert.ok(second.updated_at.getTime() > first.updated_at.getTime(), 'updated_at 은 두 번째 로그인 시각으로 바뀐다');
  } finally {
    await pool.end();
  }
});

// 기존 행 채우기: created_at 칸이 생기기 전에 있던 계정은 그 계정의 가장 이른 흔적으로 한 번 채운다.
// 흔적(문서 안 트리·순간 createdAt, 공유 행 시각, 고객 글 시각)이 하나도 없으면 updated_at 을 쓴다.
const CREATED_AT_MIGRATION = 'account-emails-created-at-261115.sql';

test('계정 가입일 채우기: 기존 행은 가장 이른 흔적으로, 근거가 없으면 updated_at 으로 채운다', { skip }, async () => {
  assertIsolatedTestDatabase(DATABASE_URL);
  const pool = await createPool(DATABASE_URL, { max: 1 });
  try {
    await pool.query(await readFile(SCHEMA_PATH, 'utf8'));
    // 이 migration 만 빼고 적용한 뒤, 칸이 생기기 전 상태를 만든다.
    const pending = fileURLToPath(new URL(`../server/db/migrations/${CREATED_AT_MIGRATION}`, import.meta.url));
    for (const file of await listMigrationFiles()) {
      if (file !== pending) await pool.query(await readFile(file, 'utf8'));
    }
    await pool.query('ALTER TABLE lovetree_account_emails DROP COLUMN IF EXISTS created_at');
    await pool.query('ALTER TABLE lovetree_shares DROP CONSTRAINT IF EXISTS lovetree_shares_product_id_share_id_key');

    const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
    const productId = ('lt-' + tag).slice(0, 32);
    const docSubject = 'sub_doc', shareSubject = 'sub_share', feedbackSubject = 'sub_feedback', emptySubject = 'sub_empty';
    const doc = {
      version: 1,
      trees: [{
        id: 't1', createdAt: '2026-03-02T00:00:00.000Z', title: '나무', moments: [
          { id: 't1-m0', createdAt: '2026-03-09T00:00:00.000Z' },
          { id: 't1-m1', createdAt: '2026-03-05T00:00:00.000Z' }
        ]
      }]
    };
    await pool.query('INSERT INTO lovetree_workspaces(product_id,subject_id,doc) VALUES($1,$2,$3::jsonb)', [productId, docSubject, JSON.stringify(doc)]);
    await pool.query(
      `INSERT INTO lovetree_shares(product_id,share_id,subject_id,tree_id,entry_moment_id,initial_view,created_at)
       VALUES($1,$2,$3,'t2','t2-m0','book','2026-06-01T00:00:00.000Z')`,
      [productId, ('s' + tag).padEnd(24, 'x').slice(0, 24), shareSubject]
    );
    await pool.query(
      `INSERT INTO lovetree_feedback(product_id,subject_id,kind,category,body,created_at)
       VALUES($1,$2,'opinion','bug','글','2026-04-04T00:00:00.000Z')`,
      [productId, feedbackSubject]
    );
    for (const [subjectId, updatedAt] of [[docSubject, '2026-09-09T00:00:00.000Z'], [shareSubject, '2026-09-09T00:00:00.000Z'], [feedbackSubject, '2026-09-09T00:00:00.000Z'], [emptySubject, '2026-07-07T00:00:00.000Z']]) {
      await pool.query(
        `INSERT INTO lovetree_account_emails(product_id,subject_id,email,updated_at) VALUES($1,$2,$3,$4)`,
        [productId, subjectId, subjectId + '@example.test', updatedAt]
      );
    }

    await pool.query(await readFile(pending, 'utf8'));
    const rows = new Map((await pool.query(
      'SELECT subject_id, created_at, updated_at FROM lovetree_account_emails WHERE product_id = $1',
      [productId]
    )).rows.map((row) => [row.subject_id, row]));
    // 문서 안 트리(03-02)·순간(03-05) 중 가장 이른 03-02 이 updated_at(09-09)보다 이르다.
    assert.equal(rows.get(docSubject).created_at.toISOString(), '2026-03-02T00:00:00.000Z');
    assert.equal(rows.get(shareSubject).created_at.toISOString(), '2026-06-01T00:00:00.000Z');
    assert.equal(rows.get(feedbackSubject).created_at.toISOString(), '2026-04-04T00:00:00.000Z');
    // 흔적이 하나도 없으면 지금 updated_at 을 쓴다(근거 없이 더 이른 시각을 지어내지 않는다).
    assert.equal(rows.get(emptySubject).created_at.toISOString(), '2026-07-07T00:00:00.000Z');
    assert.equal(rows.get(emptySubject).updated_at.toISOString(), '2026-07-07T00:00:00.000Z');
  } finally {
    await pool.end();
  }
});
