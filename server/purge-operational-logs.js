import { createPool } from './db/postgres.js';
import { deleteExpiredAccessLogs } from './db/access-log-retention-postgres.js';

const databaseUrl = process.env.LOVETREE_DATABASE_URL;
if (!databaseUrl) {
  console.error('LOVETREE_LOG_RETENTION=CONFIG_MISSING');
  process.exitCode = 1;
} else {
  const pool = await createPool(databaseUrl, { max: 1, connectionTimeoutMillis: 10_000 });
  try {
    const result = await deleteExpiredAccessLogs(pool);
    console.log(JSON.stringify({
      event: 'lovetree_operational_log_retention',
      cutoff: result.cutoff,
      deleted: result.deleted
    }));
  } catch {
    // Keep connection strings and driver details out of the journal.
    console.error('LOVETREE_LOG_RETENTION=FAILED');
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}
