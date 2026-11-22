import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPool } from '../server/db/postgres.js';
import { assertIsolatedTestDatabase } from '../server/testing/isolated-test-database.js';
import { createAccountRepo } from '../server/db/account-postgres.js';
import { createShareShowPendingRepo } from '../server/db/share-show-pending-postgres.js';

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

    // ③-2 #1098 2단계: 반응·댓글 표의 대상 칸(덧붙이기만) — 기존 방식 INSERT는 'tree'로 채워지고,
    // 순간 행은 대상 조합이 PK/유일 제약으로 하나만 남는다(같은 요청 두 번 막기). 신고 표에는
    // 순간 댓글 신고가 어떤 댓글인지 comment_id 칸으로 남는다.
    const targetColumns = await pool.query(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_name IN ('lovetree_community_reactions','lovetree_community_comments')
          AND column_name IN ('target_kind','moment_id')
        ORDER BY table_name, column_name`
    );
    assert.equal(targetColumns.rows.length, 4, '반응·댓글 표에 대상 칸(target_kind·moment_id)이 있어야 한다');
    const reportColumn = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'lovetree_community_reports' AND column_name = 'comment_id'`
    );
    assert.equal(reportColumn.rows.length, 1, '신고 표에 comment_id 칸이 있어야 한다(순간 댓글 신고용)');
    const momentPrimaryKey = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'lovetree_community_reactions_pkey'`
    );
    assert.match(String(momentPrimaryKey.rows[0]?.def), /moment_id/, '반응 PK는 moment_id를 포함해야 한다');
    const seededTreeRow = await pool.query(
      `INSERT INTO lovetree_community_reactions(product_id, share_id, subject_id, kind)
       VALUES ($1, $2, 'reader', 'heart') RETURNING target_kind, moment_id`,
      [productId, shareId]
    );
    assert.equal(seededTreeRow.rows[0].target_kind, 'tree', '기존 방식 INSERT(대상 칸 없음)는 tree로 채워진다');
    assert.equal(seededTreeRow.rows[0].moment_id, '');
    await pool.query(
      `INSERT INTO lovetree_community_reactions(product_id, share_id, subject_id, kind, target_kind, moment_id)
       VALUES ($1, $2, 'reader', 'heart', 'moment', 'm1')`,
      [productId, shareId]
    );
    const momentReplay = await pool.query(
      `INSERT INTO lovetree_community_reactions(product_id, share_id, subject_id, kind, target_kind, moment_id)
       VALUES ($1, $2, 'reader', 'heart', 'moment', 'm1') ON CONFLICT DO NOTHING`,
      [productId, shareId]
    );
    assert.equal(momentReplay.rowCount, 0, '같은 대상의 반응 재삽입은 무시되어야 한다(한 칸)');
    await assert.rejects(
      pool.query(
        `INSERT INTO lovetree_community_reactions(product_id, share_id, subject_id, kind, target_kind, moment_id)
         VALUES ($1, $2, 'reader', 'heart', 'moment', '')`,
        [productId, shareId]
      ),
      /check|violates/i,
      '순간 행에 빈 moment_id는 받지 않는다'
    );
    const commentInsert = `INSERT INTO lovetree_community_comments(product_id, comment_id, share_id, subject_id, body, client_key, target_kind, moment_id)
      VALUES ($1, $2, $3, 'reader', $4, $5, $6, $7)`;
    await pool.query(commentInsert, [productId, 'c-tree', shareId, '트리 댓글', 'dup-key', 'tree', '']);
    await pool.query(commentInsert, [productId, 'c-moment', shareId, '순간 댓글', 'dup-key', 'moment', 'm1']);
    await assert.rejects(
      pool.query(commentInsert, [productId, 'c-moment-2', shareId, '같은 순간 같은 키', 'dup-key', 'moment', 'm1']),
      /duplicate|unique/i,
      '같은 대상·같은 키의 댓글은 한 행만 허용된다'
    );
    // ③-3 옛 3칸 유일 제약(UNIQUE (product_id, subject_id, client_key))은 남아 있으면 안 된다.
    //    새로 깐 DB에서는 애초에 없어 이 단정이 자명하지만, 기존 표를 업그레이드하는 경로(아래 옛 모양 시험)가
    //    진짜 검증이다. 여기서는 재적용 안전성까지 함께 단정한다.
    const legacyUnique = await pool.query(
      `SELECT conname FROM pg_constraint
        WHERE conrelid = 'lovetree_community_comments'::regclass AND contype = 'u'
          AND pg_get_constraintdef(oid) ~ '^UNIQUE \\(product_id, subject_id, client_key\\)$'`
    );
    assert.equal(legacyUnique.rows.length, 0, '옛 3칸 유일 제약은 지워져야 한다(남으면 같은 키의 트리·순간 댓글이 충돌한다)');

    // ③-4 #1098 3단계: 내 소식 읽음 시각 표(새 표 — 덧붙이기만). 계정당 한 줄이고 기존 표는 한 칸도 바뀌지 않는다.
    const readColumns = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'lovetree_community_my_news_reads'
        ORDER BY ordinal_position`
    );
    assert.deepEqual(readColumns.rows.map((row) => row.column_name),
      ['product_id', 'subject_id', 'last_read_at', 'updated_at'], '내 소식 읽음 표의 칸이 있어야 한다');
    const readUpsert = `INSERT INTO lovetree_community_my_news_reads(product_id, subject_id, last_read_at)
      VALUES ($1, $2, $3::timestamptz)
      ON CONFLICT (product_id, subject_id) DO UPDATE
        SET last_read_at = GREATEST(lovetree_community_my_news_reads.last_read_at, EXCLUDED.last_read_at), updated_at = now()
      RETURNING last_read_at`;
    await pool.query(readUpsert, [productId, 'news-subject', '2026-11-21T00:00:00Z']);
    const replayedRead = await pool.query(readUpsert, [productId, 'news-subject', '2026-11-21T09:00:00Z']);
    assert.equal(replayedRead.rows[0].last_read_at.toISOString(), '2026-11-21T09:00:00.000Z', '같은 계정의 다시 읽음은 시각을 앞으로 옮긴다');
    const readRows = await pool.query(
      'SELECT count(*)::int AS n FROM lovetree_community_my_news_reads WHERE product_id = $1 AND subject_id = $2',
      [productId, 'news-subject']
    );
    assert.equal(readRows.rows[0].n, 1, '계정별 마지막 읽은 시각은 한 줄만 저장된다');

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

    // ⑤-1 역할 CHECK 가 시험 계정 표식 'tester' 를 받는다(#671). 그 밖의 값은 거부한다.
    await pool.query(
      `INSERT INTO lovetree_product_roles(product_id, subject_id, role) VALUES ($1, 'sub_tester', 'tester')`,
      [productId]
    );
    await assert.rejects(
      pool.query(`INSERT INTO lovetree_product_roles(product_id, subject_id, role) VALUES ($1, 'sub_bad', 'tester_x')`, [productId]),
      /check|violates/i
    );
    await pool.query('DELETE FROM lovetree_product_roles WHERE product_id = $1', [productId]);

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
      [productId, ('s' + tag + 'x'.repeat(24)).slice(0, 24), shareSubject]
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

// 2026-11-16 대표 결정: 둘러보기 소개 기본 꺼짐. 지금 둘러보기에 나오던 트리(active + moment_count>=3
// + auto/discoverable + 비공개 아님 + 숨김 없음)만 켜짐으로 채운다 — 재실행 안전, 고객 데이터 불변.
const DISCOVER_MIGRATION = 'tree-discover-optin-261116.sql';

test('둘러보기 소개 백필: 나오던 트리만 켜짐으로 채우고 재실행에도 같다', { skip }, async () => {
  assertIsolatedTestDatabase(DATABASE_URL);
  const pool = await createPool(DATABASE_URL, { max: 1 });
  try {
    await pool.query(await readFile(SCHEMA_PATH, 'utf8'));
    const pending = fileURLToPath(new URL(`../server/db/migrations/${DISCOVER_MIGRATION}`, import.meta.url));
    for (const file of await listMigrationFiles()) {
      if (file !== pending) await pool.query(await readFile(file, 'utf8'));
    }
    const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
    const productId = ('lt-' + tag).slice(0, 32);
    const sid = (p) => (p + tag).padEnd(24, 'x').slice(0, 24);
    const share = (p, subjectId, treeId, momentCount, origin = 'auto') => pool.query(
      `INSERT INTO lovetree_shares(product_id,share_id,subject_id,tree_id,entry_moment_id,initial_view,origin,moment_count)
       VALUES($1,$2,$3,$4,$5,'book',$6,$7)`,
      [productId, sid(p), subjectId, treeId, treeId + '-m0', origin, momentCount]
    );
    // 옛 규칙에서 나오던 트리: auto 3개 / 옛 스위치 행 3개 / auto 3개(공개) — 셋 다 켜짐으로 채운다.
    // 나오지 않던 트리: 2개(tree-c)·비공개(tree-e) — 채우지 않는다. (옛 규칙에는 트리별 '꺼짐'이 없었다.)
    await share('sa', 'own-a', 'tree-a', 3);
    await share('sb', 'own-b', 'tree-b', 3, 'owner');
    await pool.query(`UPDATE lovetree_shares SET discoverable=true WHERE product_id=$1 AND share_id=$2`, [productId, sid('sb')]);
    await share('sc', 'own-c', 'tree-c', 2);
    await share('sd', 'own-d', 'tree-d', 3);
    await share('se', 'own-e', 'tree-e', 3);
    await pool.query(`INSERT INTO lovetree_tree_visibility(product_id,subject_id,tree_id,visibility) VALUES($1,'own-e','tree-e','private')`, [productId]);
    const discoverRows = async () => new Map((await pool.query(
      'SELECT subject_id, tree_id FROM lovetree_tree_discover WHERE product_id=$1 AND discover=true', [productId]
    )).rows.map((row) => [row.subject_id + '/' + row.tree_id, true]));

    await pool.query(await readFile(pending, 'utf8'));
    let filled = await discoverRows();
    assert.deepEqual([...filled.keys()].sort(), ['own-a/tree-a', 'own-b/tree-b', 'own-d/tree-d'], '나오던 트리만 켜짐으로 채운다(2개·비공개는 그대로)');
    // 재실행 안전: 다시 돌려도 같은 상태(중복 행 없음).
    await pool.query(await readFile(pending, 'utf8'));
    filled = await discoverRows();
    assert.deepEqual([...filled.keys()].sort(), ['own-a/tree-a', 'own-b/tree-b', 'own-d/tree-d'], '재실행해도 같은 상태다');
  } finally {
    await pool.end();
  }
});

for (const install of ['schema.sql', 'stage-schema-261119.sql']) {
  test(`무대 저장 구조 — ${install} 설치·재실행과 키 제약`, { skip }, async (t) => {
    assertIsolatedTestDatabase(DATABASE_URL);
    const pool = await createPool(DATABASE_URL, { max: 1 });
    const client = await pool.connect();
    const dbSchema = 'stage_test_' + randomUUID().replaceAll('-', '');
    t.after(async () => {
      try { await client.query(`DROP SCHEMA IF EXISTS ${dbSchema} CASCADE`); }
      finally { client.release(); await pool.end(); }
    });
    await client.query(`CREATE SCHEMA ${dbSchema}`);
    await client.query(`SET search_path TO ${dbSchema}`);
    const migration = await readFile(new URL('../server/db/migrations/stage-schema-261119.sql', import.meta.url), 'utf8');
    const schemaSql = await readFile(SCHEMA_PATH, 'utf8');
    if (install === 'schema.sql') {
      await client.query(schemaSql);
    } else {
      // 기존 두 표만 둔다. 신규 표·함수는 이 migration 자체가 만들어야 한다.
      await client.query(`
        CREATE TABLE lovetree_workspaces (product_id text, subject_id text, doc jsonb NOT NULL,
          revision bigint NOT NULL DEFAULT 1, PRIMARY KEY (product_id, subject_id));
        CREATE TABLE lovetree_community_votes (product_id text, target_kind text, target_id text,
          subject_id text, voted_at timestamptz NOT NULL, PRIMARY KEY (product_id, target_kind, target_id, subject_id))`);
    }
    const video = 'AbC123xyZ_0';
    const originalTime = '2026-11-15T14:59:59.123Z';
    await client.query(`INSERT INTO lovetree_workspaces(product_id, subject_id, doc)
      VALUES ('p','owner',$1)`, [{ trees: [{ id: 'tree', moments: [{ id: 'm', url: 'https://youtu.be/' + video }] }] }]);
    await client.query(`INSERT INTO lovetree_community_votes(product_id,target_kind,target_id,subject_id,voted_at)
      VALUES ('p','tree','tree','reader',$1)`, [originalTime]);
    if (install !== 'schema.sql') await client.query(migration);
    for (const table of ['lovetree_stages', 'lovetree_stage_assignments', 'lovetree_stage_moments', 'lovetree_stage_saves']) {
      assert.equal((await client.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 0, table);
    }

    const addAnchor = (kind, start, end) => client.query(`INSERT INTO lovetree_stages
      (product_id,platform,video_id,kind,start_seconds,end_seconds) VALUES ('p','youtube',$1,$2,$3,$4)
      RETURNING stage_id, registration_order`, [video, kind, start, end]);
    const assign = (id, kind, start, end, { product = 'p', videoId = video, version = 1, platform = 'youtube' } = {}) => client.query(`INSERT INTO lovetree_stage_assignments
      (product_id,key_version,platform,video_id,kind,start_seconds,end_seconds,stage_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [product, version, platform, videoId, kind, start, end, id]);
    let previousOrder = 0;
    for (const [kind, start, end] of [['whole', null, null], ['bookmark', 0, null], ['range', 0, 43200]]) {
      const anchor = (await addAnchor(kind, start, end)).rows[0];
      assert.ok(anchor.stage_id && anchor.registration_order > previousOrder);
      previousOrder = anchor.registration_order;
      await assign(anchor.stage_id, kind, start, end);
      await assert.rejects(addAnchor(kind, start, end), { code: '23505' });
      await assert.rejects(assign(anchor.stage_id, kind, start, end), { code: '23505' });
    }

    const range = (await addAnchor('range', 10, 22)).rows[0];
    await assign(range.stage_id, 'range', 14, 26);
    for (const mismatch of [{ product: 'elsewhere' }, { videoId: video.toLowerCase() }, { version: 2 }, { platform: 'other' }]) {
      await assert.rejects(assign(range.stage_id, 'range', 14, 26, mismatch), { code: '23503' });
    }
    await assert.rejects(assign(range.stage_id, 'bookmark', 10, null), { code: '23503' });
    for (const [kind, start, end] of [['whole', 0, null], ['bookmark', null, null], ['bookmark', -1, null],
      ['range', null, 5], ['range', 1, null], ['range', 5, 5], ['range', 0, 43201]]) {
      await assert.rejects(addAnchor(kind, start, end), { code: '23514' });
      await assert.rejects(assign(range.stage_id, kind, start, end), { code: '23514' });
    }

    const addMoment = (owner, revision, stageId = range.stage_id) => client.query(`INSERT INTO lovetree_stage_moments
      (product_id,subject_id,tree_id,moment_id,stage_id,source_revision)
      VALUES ('p',$1,'tree','m',$2,$3)`, [owner, stageId, revision]);
    const save = (stageId = range.stage_id) => client.query(`INSERT INTO lovetree_stage_saves(product_id,stage_id,subject_id)
      VALUES ('p',$1,'reader')`, [stageId]);
    await assert.rejects(save('missing'), { code: '23503' });
    await assert.rejects(addMoment('owner', 1, 'missing'), { code: '23503' });
    await assert.rejects(addMoment('other', 1), { code: '23503' });
    await assert.rejects(addMoment('owner', 0), { code: '23514' });
    await addMoment('owner', 1);
    await assert.rejects(addMoment('owner', 1), { code: '23505' });
    await save();
    await assert.rejects(save(), { code: '23505' });

    await client.query(install === 'schema.sql' ? schemaSql : migration);
    for (const table of ['lovetree_stages', 'lovetree_stage_assignments']) {
      await assert.rejects(client.query(`UPDATE ${table} SET video_id=$1 WHERE stage_id=$2`, [video.toLowerCase(), range.stage_id]), { code: '55000' });
      await assert.rejects(client.query(`DELETE FROM ${table} WHERE stage_id=$1`, [range.stage_id]), { code: '55000' });
    }
    const preserved = await client.query(`SELECT s.stage_id,s.registration_order FROM lovetree_stages s
      JOIN lovetree_stage_assignments a USING (product_id,stage_id)
      JOIN lovetree_stage_moments m USING (product_id,stage_id)
      JOIN lovetree_stage_saves f USING (product_id,stage_id)
      WHERE a.start_seconds=14 AND a.end_seconds=26 AND m.source_revision=1`);
    assert.deepEqual(preserved.rows, [range]);
    const votes = await client.query('SELECT target_kind, target_id, voted_at FROM lovetree_community_votes');
    assert.deepEqual(votes.rows, [{ target_kind: 'tree', target_id: 'tree', voted_at: new Date(originalTime) }]);
  });
}

// #1098 2단계 뒷수습 — 운영에서 발견된 것의 재현 시험.
// 옛 모양(자동 이름 유일 제약 — PostgreSQL이 63자로 잘라 '…_client_ke…'가 됨)의 댓글 표에
// 마이그레이션 전체를 적용하면 옛 제약이 정의로 지워지는지 단정한다.
// 이름을 추측해 지우던 첫 판은 이 경로에서 'does not exist, skipping'으로 넘어가 남았다.
// 이 파일은 CI 전용 잡(빈 DB, --test-concurrency=1)에서 혼자 도니까 표를 다시 만들어도 안전하다.
test('옛 모양 댓글 표에 마이그레이션을 적용하면 잘린 이름의 옛 유일 제약도 정의로 지워진다', { skip }, async () => {
  assertIsolatedTestDatabase(DATABASE_URL);
  const pool = await createPool(DATABASE_URL, { max: 1 });
  try {
    await pool.query('DROP TABLE IF EXISTS lovetree_community_comments');
    await pool.query(`CREATE TABLE lovetree_community_comments (
      product_id text NOT NULL,
      comment_id text NOT NULL,
      share_id text NOT NULL,
      subject_id text NOT NULL,
      body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
      client_key text NOT NULL,
      status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','deleted','hidden')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      edited_at timestamptz,
      PRIMARY KEY (product_id, comment_id),
      UNIQUE (product_id, subject_id, client_key)
    )`);
    const legacyDef = `SELECT conname FROM pg_constraint
      WHERE conrelid = 'lovetree_community_comments'::regclass AND contype = 'u'
        AND pg_get_constraintdef(oid) ~ '^UNIQUE \\(product_id, subject_id, client_key\\)$'`;
    const before = await pool.query(legacyDef);
    assert.equal(before.rows.length, 1, '옛 모양 표에는 3칸 유일 제약이 하나 있다');
    assert.ok(before.rows[0].conname.startsWith('lovetree_community_comments_product_id_subject_id_client_'),
      '자동 이름은 63자에 잘려 문서와 달라진다 — 이름이 아니라 정의로 찾아야 한다');

    // 운영과 같은 순서: schema.sql(표가 있으니 CREATE는 건너뛰고 업그레이드 블록이 돈다) → migrations 전부.
    const schemaSql = await readFile(SCHEMA_PATH, 'utf8');
    await pool.query(schemaSql);
    await applyAllMigrations(pool);

    // 단정: 3칸 유일 제약 0개, 새 대상 제약 존재.
    const after = await pool.query(legacyDef);
    assert.equal(after.rows.length, 0, '옛 3칸 유일 제약은 정의로 지워져야 한다');
    const target = await pool.query(`SELECT 1 FROM pg_constraint
      WHERE conrelid = 'lovetree_community_comments'::regclass AND conname = 'lovetree_community_comments_client_target_key'`);
    assert.equal(target.rows.length, 1, '대상 5칸 유일 제약이 있어야 한다');

    // 같은 client_key로 트리·순간에 각각 쓰면 둘 다 저장된다(옛 제약이 남으면 두 번째가 유일 위반으로 실패한다).
    const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
    const productId = ('lt-' + tag).slice(0, 32);
    const shareId = ('s' + tag).padEnd(24, 'x').slice(0, 24);
    const both = `INSERT INTO lovetree_community_comments
      (product_id, comment_id, share_id, subject_id, body, client_key, target_kind, moment_id)
      VALUES ($1, $2, $3, 'reader', $4, 'same-key', $5, $6)`;
    await pool.query(both, [productId, 'legacy-fix-tree', shareId, '트리 댓글', 'tree', '']);
    await pool.query(both, [productId, 'legacy-fix-moment', shareId, '순간 댓글', 'moment', 'm1']);
    const saved = await pool.query(
      `SELECT count(*)::int AS n FROM lovetree_community_comments
        WHERE product_id=$1 AND subject_id='reader' AND client_key='same-key'`,
      [productId]
    );
    assert.equal(saved.rows[0].n, 2, '같은 키라도 대상이 다르면 둘 다 저장된다');

    // 뒷정리: 표준 모양으로 되돌려 놓는다(같은 DB를 이어 쓰는 실행 보호).
    await pool.query('DROP TABLE lovetree_community_comments');
    await pool.query(schemaSql);
    await applyAllMigrations(pool);
  } finally {
    await pool.end();
  }
});

// #1098 3단계 — 내 소식 읽음 시각 표: 재실행 안전과 되돌리기 SQL 실행까지 확인한다.
// 되돌리기는 이 마이그레이션이 만든 표 하나만 삭제한다(잘린 자동 이름을 추측할 일이 없다 — #1146 교훈).
test('내 소식 읽음 표 — 마이그레이션 재실행에도 같고, 되돌리기 SQL이 실행된 뒤 다시 적용된다', { skip }, async () => {
  assertIsolatedTestDatabase(DATABASE_URL);
  const pool = await createPool(DATABASE_URL, { max: 1 });
  try {
    const migrationPath = fileURLToPath(new URL('../server/db/migrations/community-my-news-reads-261122.sql', import.meta.url));
    const rollbackPath = fileURLToPath(new URL('../server/db/rollbacks/community-my-news-reads-261122-rollback.sql', import.meta.url));
    const migration = await readFile(migrationPath, 'utf8');
    const rollback = await readFile(rollbackPath, 'utf8');

    await pool.query(await readFile(SCHEMA_PATH, 'utf8'));
    await pool.query(migration);
    await pool.query(migration); // 재실행 안전 — 두 번 적용해도 같은 상태다.

    const columns = await pool.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'lovetree_community_my_news_reads'
        ORDER BY ordinal_position`
    );
    assert.deepEqual(
      columns.rows.map((row) => ({ column: row.column_name, type: row.data_type, nullable: row.is_nullable })),
      [
        { column: 'product_id', type: 'text', nullable: 'NO' },
        { column: 'subject_id', type: 'text', nullable: 'NO' },
        { column: 'last_read_at', type: 'timestamp with time zone', nullable: 'NO' },
        { column: 'updated_at', type: 'timestamp with time zone', nullable: 'NO' }
      ],
      '내 소식 읽음 표의 칸이 마이그레이션대로다'
    );
    const primaryKey = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'lovetree_community_my_news_reads'::regclass AND contype = 'p'`
    );
    assert.match(String(primaryKey.rows[0]?.def), /PRIMARY KEY \(product_id, subject_id\)/, '계정당 한 줄이다');

    // 읽음 표시의 실제 쓰기 — 계정당 한 줄, 시각은 뒤로 가지 않는다(서비스의 GREATEST 업서트).
    const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
    const productId = ('lt-' + tag).slice(0, 32);
    const upsert = `INSERT INTO lovetree_community_my_news_reads(product_id, subject_id, last_read_at)
      VALUES ($1, $2, $3::timestamptz)
      ON CONFLICT (product_id, subject_id) DO UPDATE
        SET last_read_at = GREATEST(lovetree_community_my_news_reads.last_read_at, EXCLUDED.last_read_at),
            updated_at = now()
      RETURNING last_read_at`;
    await pool.query(upsert, [productId, 'news-owner', '2026-11-22T00:00:00Z']);
    const later = await pool.query(upsert, [productId, 'news-owner', '2026-11-22T09:00:00Z']);
    const earlier = await pool.query(upsert, [productId, 'news-owner', '2026-11-22T01:00:00Z']);
    assert.equal(later.rows[0].last_read_at.toISOString(), '2026-11-22T09:00:00.000Z');
    assert.equal(earlier.rows[0].last_read_at.toISOString(), '2026-11-22T09:00:00.000Z', '읽음 시각은 뒤로 가지 않는다');
    await pool.query(upsert, [productId, 'news-other', '2026-11-22T00:00:00Z']);
    const both = await pool.query('SELECT count(*)::int AS n FROM lovetree_community_my_news_reads WHERE product_id = $1', [productId]);
    assert.equal(both.rows[0].n, 2, '계정끼리는 줄이 따로다');

    // 되돌리기: 표가 사라지고, 마이그레이션을 다시 적용하면 같은 모양으로 돌아온다.
    await pool.query(rollback);
    const gone = await pool.query(`SELECT to_regclass('public.lovetree_community_my_news_reads') AS t`);
    assert.equal(gone.rows[0].t, null, '되돌리기 뒤에는 표가 없다');
    await pool.query(migration);
    const back = await pool.query(`SELECT to_regclass('public.lovetree_community_my_news_reads') AS t`);
    assert.ok(back.rows[0].t, '다시 적용하면 표가 돌아온다');
  } finally {
    await pool.end();
  }
});

// #1163(#1068 2단계) — 보임 동기화 실패 표식 표: 재실행 안전과 되돌리기 SQL 실행까지 확인한다.
// 되돌리기는 이 마이그레이션이 만든 표 하나만 삭제한다(잘린 자동 이름을 추측할 일이 없다 — #1146 교훈).
test('보임 동기화 표식 표 — 마이그레이션 재실행에도 같고, 되돌리기 SQL이 실행된 뒤 다시 적용된다', { skip }, async () => {
  assertIsolatedTestDatabase(DATABASE_URL);
  const pool = await createPool(DATABASE_URL, { max: 1 });
  try {
    const migrationPath = fileURLToPath(new URL('../server/db/migrations/share-show-pending-261122.sql', import.meta.url));
    const rollbackPath = fileURLToPath(new URL('../server/db/rollbacks/share-show-pending-261122-rollback.sql', import.meta.url));
    const migration = await readFile(migrationPath, 'utf8');
    const rollback = await readFile(rollbackPath, 'utf8');

    await pool.query(await readFile(SCHEMA_PATH, 'utf8'));
    await pool.query(migration);
    await pool.query(migration); // 재실행 안전 — 두 번 적용해도 같은 상태다.

    const columns = await pool.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'lovetree_share_show_pending'
        ORDER BY ordinal_position`
    );
    assert.deepEqual(
      columns.rows.map((row) => ({ column: row.column_name, type: row.data_type, nullable: row.is_nullable })),
      [
        { column: 'product_id', type: 'text', nullable: 'NO' },
        { column: 'subject_id', type: 'text', nullable: 'NO' },
        { column: 'created_at', type: 'timestamp with time zone', nullable: 'NO' }
      ],
      '보임 동기화 표식 표의 칸이 마이그레이션대로다'
    );

    // 표식 저장소의 실제 쓰기 — 계정당 한 줄, 재표식은 무시, 해제 뒤 다시 남길 수 있다.
    const pending = createShareShowPendingRepo(pool);
    const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
    const productId = 'lt-' + tag;
    await pending.mark({ productId, subjectId: 'sync-owner' });
    await pending.mark({ productId, subjectId: 'sync-owner' });
    assert.equal(await pending.has({ productId, subjectId: 'sync-owner' }), true);
    await pending.clear({ productId, subjectId: 'sync-owner' });
    assert.equal(await pending.has({ productId, subjectId: 'sync-owner' }), false, '성공하면 표식을 해제한다');
    await pending.mark({ productId, subjectId: 'sync-owner' });
    assert.equal(await pending.has({ productId, subjectId: 'sync-owner' }), true, '해제 뒤 다시 남길 수 있다');
    await pending.mark({ productId, subjectId: 'sync-other' });
    assert.equal(await pending.has({ productId, subjectId: 'sync-other' }), true, '계정끼리는 줄이 따로다');

    // 되돌리기: 표가 사라지고, 마이그레이션을 다시 적용하면 같은 모양으로 돌아온다.
    await pool.query(rollback);
    const gone = await pool.query(`SELECT to_regclass('public.lovetree_share_show_pending') AS t`);
    assert.equal(gone.rows[0].t, null, '되돌리기 뒤에는 표가 없다');
    await pool.query(migration);
    const back = await pool.query(`SELECT to_regclass('public.lovetree_share_show_pending') AS t`);
    assert.ok(back.rows[0].t, '다시 적용하면 표가 돌아온다');
  } finally {
    await pool.end();
  }
});
