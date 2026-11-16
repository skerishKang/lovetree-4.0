import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ACCESS_LOG_RETENTION_DAYS,
  ACCESS_LOG_RETENTION_TARGETS,
  ACCOUNT_DELETION_RETENTION_DAYS,
  GUEST_FEEDBACK_RETENTION_DAYS,
  deleteExpiredAccessLogs,
  deleteExpiredAccountDeletionRecords,
  deleteExpiredGuestFeedback
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
      assert.match(sql, /WHERE (claimed_at|changed_at|viewed_at) <= \$1/);
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
    lovetree_admin_customer_views: [
      { id: '7', viewed_at: before }, { id: '8', viewed_at: at }, { id: '9', viewed_at: after }
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
    lovetree_community_moderation_audit: 2,
    lovetree_admin_customer_views: 2
  });
  assert.deepEqual(pool.tables.lovetree_request_claims.map((row) => row.client_key), ['after']);
  assert.deepEqual(pool.tables.lovetree_product_role_audit.map((row) => row.id), ['3']);
  assert.deepEqual(pool.tables.lovetree_community_moderation_audit.map((row) => row.id), ['6']);
  assert.deepEqual(pool.tables.lovetree_admin_customer_views.map((row) => row.id), ['9']);
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

// 2026-11-16 대표 결정(보관 최소화): 로그인 없이 보낸 의견 6개월(183일)·탈퇴 처리 기록 90일 자동 삭제.
test('183일이 지난 로그인 없이 보낸 의견과 그 답글을 지우고, 나머지는 남긴다', async () => {
  const guestCutoff = new Date(now.getTime() - GUEST_FEEDBACK_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const expired = new Date(guestCutoff.getTime() - 1).toISOString();
  const at = guestCutoff.toISOString();
  const recent = new Date(guestCutoff.getTime() + 1).toISOString();
  const pool = {
    calls: [],
    async query(sql, params) {
      assert.match(sql, /subject_id IS NULL AND created_at <= \$1/, '게스트 의견 판정은 subject_id 없음 + 기한으로만 한다');
      assert.deepEqual(params, [guestCutoff.toISOString(), 500], '매개변수는 기한·한도뿐이다(내용·subject를 묻지 않는다)');
      this.calls.push(sql);
      if (/lovetree_feedback_replies/.test(sql)) {
        // 답글: 만료된 게스트 의견(3번)에 달린 답글만.
        return { rowCount: 1, rows: [] };
      }
      // 본문: 만료된 게스트 의견 1건만(4번은 기한 안, 5·6번은 로그인 의견).
      if (this.postDeleted) return { rowCount: 0, rows: [] };
      this.postDeleted = true;
      return { rowCount: 1, rows: [] };
    }
  };

  const result = await deleteExpiredGuestFeedback(pool, { now });

  assert.equal(result.table, 'lovetree_feedback');
  assert.equal(result.cutoff, guestCutoff.toISOString());
  assert.equal(result.deletedReplies, 1);
  assert.equal(result.deletedPosts, 1);
  assert.equal(pool.calls.length, 2, '답글 먼저, 본문 다음(두 문장)');
  assert.ok(pool.calls[0].includes('lovetree_feedback_replies'), '답글을 먼저 지운다');
});

test('탈퇴 처리 기록 90일은 기록이 막는 세션(1시간)보다 길어 안전하다', async () => {
  // 2번 대조: 러브트리 세션 자격 증명 최대 1시간(SESSION_MAX_AGE_SECONDS = 60*60),
  // 로그인 왕복 상태 10분(STATE_MAX_AGE_SECONDS) — 둘 다 90일보다 짧다(숫자는 소스에서 읽는다).
  const sessionSource = await readFile(new URL('../server/credentials/lovetree-session.js', import.meta.url), 'utf8');
  const secondsOf = (text) => text.replace(/\s/g, '').split('*').reduce((a, b) => a * Number(b), 1);
  const sessionMaxAge = secondsOf(sessionSource.match(/export const SESSION_MAX_AGE_SECONDS = ([\d* ]+);/)?.[1] || '');
  const stateMaxAge = secondsOf(sessionSource.match(/export const STATE_MAX_AGE_SECONDS = ([\d* ]+);/)?.[1] || '');
  assert.equal(sessionMaxAge, 3600, '러브트리 세션 자격 증명은 1시간');
  assert.equal(stateMaxAge, 600, '로그인 왕복 상태는 10분');
  assert.ok(sessionMaxAge < ACCOUNT_DELETION_RETENTION_DAYS * 24 * 60 * 60, '세션 1시간 < 탈퇴 기록 90일 — 기록을 지워도 옛 세션은 이미 끝난다');
  assert.ok(stateMaxAge < ACCOUNT_DELETION_RETENTION_DAYS * 24 * 60 * 60, '상태 10분 < 탈퇴 기록 90일');

  const deletionCutoff = new Date(now.getTime() - ACCOUNT_DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const seen = [];
  const pool = {
    async query(sql, params) {
      assert.match(sql, /DELETE FROM lovetree_account_deletions WHERE deleted_at <= \$1/);
      assert.deepEqual(params, [deletionCutoff.toISOString()], '매개변수는 기한뿐이다(subject_hash 값을 묻지 않는다)');
      seen.push(params[0]);
      return { rowCount: seen.length === 1 ? 2 : 0, rows: [] };
    }
  };
  const result = await deleteExpiredAccountDeletionRecords(pool, { now });
  assert.equal(result.table, 'lovetree_account_deletions');
  assert.equal(result.cutoff, deletionCutoff.toISOString());
  assert.equal(result.deleted, 2);
});

test('182일 게스트 의견·로그인 의견은 게스트 삭제 대상이 아니다(가짜 풀로 행 유지까지)', async () => {
  const guestCutoff = new Date(now.getTime() - GUEST_FEEDBACK_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const recent = new Date(guestCutoff.getTime() + 60_000).toISOString();
  const expiredOld = new Date(guestCutoff.getTime() - 400 * 24 * 60 * 60 * 1000).toISOString();
  const rows = {
    lovetree_feedback: [
      { id: 1, subject_id: null, created_at: recent }, // 182일 — 남는다
      { id: 2, subject_id: 'sub_kept', created_at: expiredOld } // 로그인 의견 400일 — 남는다
    ],
    lovetree_feedback_replies: [{ id: 9, post_id: 2, created_at: expiredOld }] // 로그인 의견의 답글 — 남는다
  };
  const pool = {
    async query(sql, params) {
      assert.deepEqual(params, [guestCutoff.toISOString(), 500]);
      if (/lovetree_feedback_replies/.test(sql)) return { rowCount: 0, rows: [] };
      if (/FROM lovetree_feedback /.test(sql)) {
        // 만료 기한 이하이면서 subject_id가 없는 행만 고른다.
        const expired = rows.lovetree_feedback.filter((row) => row.subject_id === null && Date.parse(row.created_at) <= Date.parse(params[0]));
        rows.lovetree_feedback = rows.lovetree_feedback.filter((row) => !expired.includes(row));
        return { rowCount: expired.length, rows: [] };
      }
      throw new Error('예상 밖 SQL');
    }
  };
  const result = await deleteExpiredGuestFeedback(pool, { now });
  assert.equal(result.deletedPosts, 0, '182일 게스트 의견·로그인 의견은 지워지지 않는다');
  assert.equal(result.deletedReplies, 0, '로그인 의견의 답글도 지워지지 않는다');
  assert.deepEqual(rows.lovetree_feedback.map((row) => row.id), [1, 2], '두 의견 모두 남는다');
  assert.deepEqual(rows.lovetree_feedback_replies.map((row) => row.id), [9], '답글도 남는다');
});
