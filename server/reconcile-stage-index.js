import { createPool } from './db/postgres.js';
import { createStageIndexRepo } from './db/stage-index-postgres.js';

const [mode = '--check', ...rest] = process.argv.slice(2);
const productId = process.env.LOVETREE_PRODUCT_ID;
const databaseUrl = process.env.LOVETREE_DATABASE_URL;

if (!['--check', '--apply'].includes(mode) || rest.length) {
  console.error('사용법: node server/reconcile-stage-index.js [--check|--apply]');
  process.exitCode = 1;
} else if (!productId || !databaseUrl) {
  console.error('LOVETREE_STAGE_INDEX=CONFIG_MISSING');
  process.exitCode = 1;
} else {
  const pool = await createPool(databaseUrl, { max: 1, connectionTimeoutMillis: 10_000 });
  try {
    const index = createStageIndexRepo(pool);
    const changes = mode === '--apply' ? await index.reconcile({ productId }) : undefined;
    const audit = await index.audit({ productId });
    console.log(JSON.stringify({ event: 'lovetree_stage_index', mode, changes, audit }));
    if (audit.missing || audit.extra || audit.invalidTrees) process.exitCode = 2;
  } catch {
    console.error('LOVETREE_STAGE_INDEX=FAILED');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
