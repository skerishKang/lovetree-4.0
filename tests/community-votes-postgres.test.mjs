// #824 투표 기록 표(lovetree_community_votes) — 실제 PostgreSQL에서만 도는 시험.
// 1인 1표 영구(append-only)·대상 종류 둘(tree·stage)·주간 집계·마이그레이션 백필(기존 즐겨찾기 → 트리 표).
// LOVETREE_TEST_DATABASE_URL이 없으면 스킵한다(CI의 migration job은 skip을 실패로 다룬다).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { applySchema, createPool } from '../server/db/postgres.js';
import { createCommunityRepo } from '../server/db/community-postgres.js';
import { assertIsolatedTestDatabase } from '../server/testing/isolated-test-database.js';

const DATABASE_URL = process.env.LOVETREE_TEST_DATABASE_URL ?? '';
const skip = DATABASE_URL ? false : '격리된 PostgreSQL 테스트 DB가 없습니다(LOVETREE_TEST_DATABASE_URL 설정 필요). 이 파일의 검증은 미수행입니다.';
const MIGRATION_PATH = fileURLToPath(new URL('../server/db/migrations/community-votes-261118.sql', import.meta.url));
const suffix = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

test('투표 표: 1인 1표 영구 — 재기록·해제·재담기에도 표는 하나다', { skip }, async () => {
  assertIsolatedTestDatabase(DATABASE_URL);
  const pool = await createPool(DATABASE_URL, { max: 2 });
  try {
    await applySchema(pool);
    const repo = createCommunityRepo(pool), tag = suffix(), productId = 'lt-' + tag;
    const first = await repo.recordVote({ productId, targetKind: 'tree', targetId: 'share-a', subjectId: 'reader' });
    assert.deepEqual(first, { recorded: true }, '첫 표는 새로 기록된다');
    const again = await repo.recordVote({ productId, targetKind: 'tree', targetId: 'share-a', subjectId: 'reader' });
    assert.deepEqual(again, { recorded: false }, '같은 대상 재기록은 새 표가 아니다(1인 1표 영구)');
    assert.equal(await repo.hasVoted({ productId, targetKind: 'tree', targetId: 'share-a', subjectId: 'reader' }), true);
    assert.equal(await repo.hasVoted({ productId, targetKind: 'tree', targetId: 'share-b', subjectId: 'reader' }), false);
    // 즐겨찾기 해제(행 DELETE)와 무관하게 표가 남는다 — 주간 집계가 지워지지 않는 근거
    await pool.query(`INSERT INTO lovetree_community_favorites(product_id,share_id,subject_id) VALUES($1,'share-a','reader') ON CONFLICT DO NOTHING`, [productId]);
    await pool.query(`DELETE FROM lovetree_community_favorites WHERE product_id=$1 AND share_id='share-a' AND subject_id='reader'`, [productId]);
    assert.equal(await repo.hasVoted({ productId, targetKind: 'tree', targetId: 'share-a', subjectId: 'reader' }), true, '즐겨찾기 해제 뒤에도 표는 남는다');
    // 대상 종류가 다르면 각각 한 표다(트리와 무대는 별개 대상)
    const stage = await repo.recordVote({ productId, targetKind: 'stage', targetId: 'share-a', subjectId: 'reader' });
    assert.deepEqual(stage, { recorded: true }, '같은 값이라도 종류가 다르면 별개 대상이다');
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM lovetree_community_votes WHERE product_id=$1`, [productId]);
    assert.equal(rows[0].n, 2, '트리 1표 + 무대 1표');
  } finally { await pool.end(); }
});

test('투표 표: 주간 집계는 since 이후만 세고 대상별로 묶는다', { skip }, async () => {
  assertIsolatedTestDatabase(DATABASE_URL);
  const pool = await createPool(DATABASE_URL, { max: 2 });
  try {
    await applySchema(pool);
    const repo = createCommunityRepo(pool), tag = suffix(), productId = 'lt-' + tag;
    const old = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const now = new Date();
    await pool.query(`INSERT INTO lovetree_community_votes(product_id,target_kind,target_id,subject_id,voted_at) VALUES
      ($1,'tree','share-a','r1',$2),($1,'tree','share-a','r2',$3),($1,'tree','share-b','r3',$3),($1,'stage','share-a','r1',$3)`,
      [productId, old, now]);
    const counts = await repo.weeklyVoteCounts({ productId, targetKind: 'tree', since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) });
    assert.deepEqual(counts, { 'share-a': 1, 'share-b': 1 }, '지난주 표는 이번 주 집계에서 빠진다');
    const all = await repo.weeklyVoteCounts({ productId, targetKind: 'tree', since: new Date(0) });
    assert.deepEqual(all, { 'share-a': 2, 'share-b': 1 }, 'since를 넓히면 온 표가 섞인다');
    const stage = await repo.weeklyVoteCounts({ productId, targetKind: 'stage', since: new Date(0) });
    assert.deepEqual(stage, { 'share-a': 1 }, '종류별로 따로 센다');
  } finally { await pool.end(); }
});

test('마이그레이션: 기존 즐겨찾기를 트리 표로 옮겨 적고 재실행에도 같다', { skip }, async () => {
  assertIsolatedTestDatabase(DATABASE_URL);
  const pool = await createPool(DATABASE_URL, { max: 2 });
  try {
    await applySchema(pool);
    const tag = suffix(), productId = 'lt-' + tag;
    const created = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await pool.query(`INSERT INTO lovetree_community_favorites(product_id,share_id,subject_id,created_at) VALUES($1,'share-x','r1',$2),($1,'share-x','r2',$2),($1,'share-y','r3',$2)`, [productId, created]);
    const sql = await readFile(MIGRATION_PATH, 'utf8');
    await pool.query(sql);
    const { rows } = await pool.query(
      `SELECT target_kind, target_id, subject_id, voted_at FROM lovetree_community_votes WHERE product_id=$1 ORDER BY target_id, subject_id`,
      [productId]
    );
    assert.deepEqual(rows.map((r) => ({ kind: r.target_kind, target: r.target_id, subject: r.subject_id })), [
      { kind: 'tree', target: 'share-x', subject: 'r1' },
      { kind: 'tree', target: 'share-x', subject: 'r2' },
      { kind: 'tree', target: 'share-y', subject: 'r3' }
    ], '즐겨찾기 행이 트리 표로 옮겨 적힌다');
    for (const row of rows) assert.equal(Math.abs(new Date(row.voted_at) - created) < 2000, true, 'voted_at은 즐겨찾기 created_at을 따른다');
    await pool.query(sql); // 재실행 안전
    const { rows: after } = await pool.query(`SELECT count(*)::int AS n FROM lovetree_community_votes WHERE product_id=$1`, [productId]);
    assert.equal(after[0].n, 3, '재실행해도 행이 늘지 않는다');
  } finally { await pool.end(); }
});

test('목록 집계: 이번 주 표 수는 공개·소개 중인 트리만 세고 sort=popular로 정렬된다', { skip }, async () => {
  assertIsolatedTestDatabase(DATABASE_URL);
  const pool = await createPool(DATABASE_URL, { max: 2 });
  try {
    await applySchema(pool);
    const repo = createCommunityRepo(pool), tag = suffix(), productId = 'lt-' + tag;
    const mk = (ch) => ch.repeat(24);
    // 공개·소개 켠 트리 2개(sX·sY) + 소개 꺼진 트리 1개(sZ)
    for (const [ch, owner] of [['a', 'own-x'], ['b', 'own-y'], ['c', 'own-z']]) {
      await pool.query(
        `INSERT INTO lovetree_shares(product_id,share_id,subject_id,tree_id,entry_moment_id,initial_view,discoverable,moment_count)
         VALUES ($1,$2,$3,$4,'moment','book',true,3)`,
        [productId, mk(ch), owner, 'tree-' + ch]
      );
      if (ch !== 'c') {
        await pool.query(
          `INSERT INTO lovetree_tree_discover(product_id,subject_id,tree_id,discover) VALUES($1,$2,$3,true)`,
          [productId, owner, 'tree-' + ch]
        );
      }
    }
    const now = new Date(), weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), old = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    // sX: 이번 주 2표 / sY: 이번 주 1표 + 지난 주 1표 / sZ(소개 꺼짐): 이번 주 5표 — 목록 집계에서 빠져야 한다
    const vote = (target, subject, at) => pool.query(
      `INSERT INTO lovetree_community_votes(product_id,target_kind,target_id,subject_id,voted_at) VALUES($1,'tree',$2,$3,$4) ON CONFLICT DO NOTHING`,
      [productId, mk(target), subject, at]
    );
    await vote('a', 'r1', now); await vote('a', 'r2', now);
    await vote('b', 'r3', now); await vote('b', 'r4', old);
    for (let i = 0; i < 5; i++) await vote('c', 'z' + i, now);
    const popular = await repo.listDiscoverableSummaries({ productId, sort: 'popular', weekSince: weekAgo });
    assert.deepEqual(popular.map((r) => r.share.shareId), [mk('a'), mk('b')], '소개 꺼진 트리는 목록 자체에 없고, 많이 담긴 순으로 정렬된다');
    assert.deepEqual(popular.map((r) => r.stats.weeklyFavorites), [2, 1], '지난 주 표는 이번 주 집계에서 빠진다');
    const latest = await repo.listDiscoverableSummaries({ productId, weekSince: weekAgo });
    assert.deepEqual(latest.map((r) => r.stats.weeklyFavorites), [2, 1], '기본 정렬에서도 주간 수는 응답에 있다');
  } finally { await pool.end(); }
});
