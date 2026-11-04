import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ACCESS_LOG_RETENTION_DAYS,
  ACCESS_LOG_RETENTION_TARGETS,
  deleteExpiredAccessLogs
} from '../server/db/access-log-retention-postgres.js';

const now = new Date('2026-11-03T12:00:00.000Z');
const cutoff = new Date(now.getTime() - ACCESS_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);

function makePool(seed = {}) {
  const tables = Object.fromEntries(Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
  const calls = [];
  return {
    tables,
    calls,
    async query(sql, params) {
      const table = sql.match(/SELECT [\s\S]+? FROM (lovetree_[a-z_]+)/)?.[1];
      assert.ok(table, 'cleanup SQL must name an allow-listed operational table');
      assert.ok(ACCESS_LOG_RETENTION_TARGETS.some((target) => target.table === table));
      assert.match(sql, /WHERE (claimed_at|changed_at) <= \$1/);
      assert.match(sql, /LIMIT \$2[\s\S]+FOR UPDATE SKIP LOCKED/);
      calls.push({ table, cutoff: params[0], limit: params[1] });

      const target = ACCESS_LOG_RETENTION_TARGETS.find((entry) => entry.table === table);
      const rows = tables[table] ?? [];
      const expired = rows
        .filter((row) => Date.parse(row[target.timestamp]) <= Date.parse(params[0]))
        .sort((a, b) => Date.parse(a[target.timestamp]) - Date.parse(b[target.timestamp]) || String(a.id ?? a.client_key).localeCompare(String(b.id ?? b.client_key)))
        .slice(0, params[1]);
      tables[table] = rows.filter((row) => !expired.includes(row));
      return { rowCount: expired.length };
    }
  };
}

test('90-day cutoff deletes before and exactly at the boundary, retaining newer rows and protected tables', async () => {
  const at = cutoff.toISOString();
  const before = new Date(cutoff.getTime() - 1).toISOString();
  const after = new Date(cutoff.getTime() + 1).toISOString();
  const pool = makePool({
    lovetree_request_claims: [
      { product_id: 'p', subject_id: 's', client_key: 'before', claimed_at: before },
      { product_id: 'p', subject_id: 's', client_key: 'at', claimed_at: at },
      { product_id: 'p', subject_id: 's', client_key: 'after', claimed_at: after }
    ],
    lovetree_product_role_audit: [
      { id: '1', changed_at: before }, { id: '2', changed_at: at }, { id: '3', changed_at: after }
    ],
    lovetree_community_moderation_audit: [
      { id: '4', changed_at: before }, { id: '5', changed_at: at }, { id: '6', changed_at: after }
    ],
    lovetree_workspaces: [{ id: 'content', saved_at: before }],
    lovetree_account_deletions: [{ id: 'deletion-evidence', deleted_at: before }],
    lovetree_payment_records: [{ id: 'payment', created_at: before }]
  });

  const result = await deleteExpiredAccessLogs(pool, { now, batchSize: 10, maxBatchesPerTable: 2 });

  assert.equal(result.cutoff, cutoff.toISOString());
  assert.deepEqual(result.deleted, {
    lovetree_request_claims: 2,
    lovetree_product_role_audit: 2,
    lovetree_community_moderation_audit: 2
  });
  assert.deepEqual(pool.tables.lovetree_request_claims.map((row) => row.client_key), ['after']);
  assert.deepEqual(pool.tables.lovetree_product_role_audit.map((row) => row.id), ['3']);
  assert.deepEqual(pool.tables.lovetree_community_moderation_audit.map((row) => row.id), ['6']);
  assert.deepEqual(pool.tables.lovetree_workspaces, [{ id: 'content', saved_at: before }]);
  assert.deepEqual(pool.tables.lovetree_account_deletions, [{ id: 'deletion-evidence', deleted_at: before }]);
  assert.deepEqual(pool.tables.lovetree_payment_records, [{ id: 'payment', created_at: before }]);
  assert.deepEqual(new Set(pool.calls.map((call) => call.table)), new Set(ACCESS_LOG_RETENTION_TARGETS.map((target) => target.table)));
});

test('cleanup enforces a per-table batch count and row limit', async () => {
  const old = new Date(cutoff.getTime() - 1000).toISOString();
  const claims = Array.from({ length: 750 }, (_, index) => ({
    product_id: 'p', subject_id: 's', client_key: String(index).padStart(4, '0'), claimed_at: old
  }));
  const pool = makePool({ lovetree_request_claims: claims });

  const result = await deleteExpiredAccessLogs(pool, { now, batchSize: 50, maxBatchesPerTable: 2 });

  assert.equal(result.deleted.lovetree_request_claims, 100);
  assert.equal(pool.tables.lovetree_request_claims.length, 650);
  assert.deepEqual(pool.calls.filter((call) => call.table === 'lovetree_request_claims').map((call) => call.limit), [50, 50]);
  assert.ok(pool.calls.every((call) => call.limit <= 50));
});

test('보관 문서의 일정은 타이머 유닛과 일치한다', async () => {
  const timer = await readFile(new URL('../deploy/host-com2/lovetree-api/lovetree-log-retention.timer', import.meta.url), 'utf8');
  const doc = await readFile(new URL('../docs/ACCESS_LOG_RETENTION_20261103.md', import.meta.url), 'utf8');
  const onCalendar = timer.match(/^OnCalendar=(.+)$/m)?.[1]?.trim();
  const randomizedDelay = timer.match(/^RandomizedDelaySec=(\S+)$/m)?.[1];
  assert.ok(onCalendar, '타이머에 OnCalendar가 있어야 한다');
  assert.ok(randomizedDelay, '타이머에 RandomizedDelaySec가 있어야 한다');
  assert.match(timer, /^Persistent=true$/m);
  // 문서는 타이머의 실제 시각을 적어야 하며, 다른 시각을 주장하면 안 된다.
  const clockTime = onCalendar.split(/\s+/).pop();
  assert.ok(doc.includes(clockTime), `문서가 타이머 시각 ${clockTime}를 담아야 한다`);
  assert.ok(doc.includes(`RandomizedDelaySec=${randomizedDelay}`), '문서가 타이머 무작위 지연을 담아야 한다');
  assert.ok(doc.includes('Persistent=true'), '문서가 Persistent=true를 담아야 한다');
});
