import { createPool } from './db/postgres.js';
import {
  deleteExpiredAccessLogs,
  deleteExpiredAccountDeletionRecords,
  deleteExpiredGuestFeedback
} from './db/access-log-retention-postgres.js';

const databaseUrl = process.env.LOVETREE_DATABASE_URL;
if (!databaseUrl) {
  console.error('LOVETREE_LOG_RETENTION=CONFIG_MISSING');
  process.exitCode = 1;
} else {
  const pool = await createPool(databaseUrl, { max: 1, connectionTimeoutMillis: 10_000 });
  try {
    const result = await deleteExpiredAccessLogs(pool);
    // 2026-11-16 대표 결정: 로그인 없이 보낸 의견 6개월(183일)·탈퇴 처리 기록 90일 — 보관 최소화(GDPR).
    const guestFeedback = await deleteExpiredGuestFeedback(pool);
    const accountDeletions = await deleteExpiredAccountDeletionRecords(pool);
    console.log(JSON.stringify({
      event: 'lovetree_operational_log_retention',
      cutoff: result.cutoff,
      deleted: result.deleted,
      // 건수만 남긴다 — 의견 내용·subject_hash 같은 값은 저널에 적지 않는다.
      guestFeedback: { replies: guestFeedback.deletedReplies, posts: guestFeedback.deletedPosts },
      accountDeletions: accountDeletions.deleted
    }));
  } catch {
    // Keep connection strings and driver details out of the journal.
    console.error('LOVETREE_LOG_RETENTION=FAILED');
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}
