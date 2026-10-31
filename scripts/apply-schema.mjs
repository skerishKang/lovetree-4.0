/**
 * 운영 PostgreSQL에 표를 얹는 유일한 경로. `--apply` 없이는 대상만 알려주고 아무것도 실행하지 않는다.
 *
 * schema.sql은 모두 `IF NOT EXISTS`라서 두 번 실행해도 같은 자리에 있다 — 파일 레인이
 * 자기 루트를 확인하는 것처럼, 여기서는 현재 필수 표 전체가 실제로 있는지 조회로 답한다.
 * 접속 문자열은 출력하지 않는다. 호스트와 데이터베이스 이름만 보여준다.
 */
import { applySchema, createPool } from '../server/db/postgres.js';

const TABLES = [
  'lovetree_workspaces',
  'lovetree_request_claims',
  'lovetree_login_states',
  'lovetree_product_roles',
  'lovetree_product_role_audit',
  'lovetree_shares',
  'lovetree_community_favorites',
  'lovetree_community_reactions',
  'lovetree_community_comments',
  'lovetree_community_reports',
  'lovetree_community_blocks',
  'lovetree_community_hidden_shares',
  'lovetree_community_moderation_audit'
];

const url = String(process.env.LOVETREE_DATABASE_URL ?? '').trim();
if (!url) {
  console.error('LOVETREE_SCHEMA_APPLY=DATABASE_URL_MISSING');
  process.exitCode = 1;
} else {
  const target = (() => {
    try { const parsed = new URL(url); return `${parsed.host}${parsed.pathname}`; }
    catch { return 'unparsable'; }
  })();
  if (!process.argv.includes('--apply')) {
    console.log(`LOVETREE_SCHEMA_APPLY=DRY_RUN TARGET=${target}`);
  } else {
    const pool = await createPool(url);
    try {
      await applySchema(pool);
      const { rows } = await pool.query(
        'SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1)',
        [TABLES]
      );
      const present = new Set(rows.map(row => row.table_name));
      console.log(TABLES.map(name => `${name}=${present.has(name) ? 1 : 0}`).join(' '));
      console.log('LOVETREE_SCHEMA_APPLY=' + (TABLES.every(name => present.has(name)) ? 'PASS' : 'FAIL'));
      process.exitCode = TABLES.every(name => present.has(name)) ? 0 : 1;
    } finally {
      await pool.end();
    }
  }
}
