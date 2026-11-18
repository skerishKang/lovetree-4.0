#!/usr/bin/env node
// #671 (2026-11-15) — 레인 시험 계정에 'tester' 역할을 붙이는 1회용 운영 도구(컴2 WSL 안에서 root 실행).
//
// 운영센터와 **같은 서버 함수 경로**를 쓴다: `createAdminRoleRepo(pool).assign/revoke`.
// SQL 을 직접 쓰지 않으므로 역할 행과 감사 행(`lovetree_product_role_audit`)이 한 호출로 남는다
// — 누가 언제 왜 붙였는지 근거가 남는다. 서버가 확인한 canonical subject 모양 검사를 그대로 지난다.
//
// 계정은 **이메일로 지정**하고, subject 는 운영 DB 의 로그인 표(`lovetree_account_emails`)에서 찾는다.
// 이메일·subject 는 출력하지 않고(마스크만), 저장소에도 적지 않는다(공개 저장소 규칙).
//
// 입력: --emails <파일> (한 줄에 이메일 하나, '#' 주석·빈 줄 무시) 또는 --email <주소> 여러 번
//       [--role tester] [--revoke] [--reason <글>] [--env <경로>]
// 실행: node /opt/padiem/lovetree-api/tools/admin-role.mjs --emails /tmp/test-emails.txt
//       node /opt/padiem/lovetree-api/tools/admin-role.mjs --emails /tmp/test-emails.txt --revoke
// 종료 코드: 0 전부 처리, 2 설정 문제, 3 일부 이메일을 계정에서 못 찾음(찾은 것은 처리).

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseEnvFile } from './export-ai-customer-db.mjs';
import { createPool } from '../server/db/postgres.js';
import { createAdminRoleRepo } from '../server/db/admin-roles-postgres.js';
import { createStageIndexRepo } from '../server/db/stage-index-postgres.js';
import { ROLE_TESTER, ROLES } from '../server/admin-roles.js';

const DEFAULT_ENV = '/opt/padiem/lovetree-api/.env';
const DEFAULT_REASON = '레인 시험 계정 표식 (#671)';

/** 인자 검사(순수) — 잘못된 값은 한 줄 이유로 거부한다. */
export function parseRoleArgs(argv) {
  const args = { emails: [], emailsFile: null, role: ROLE_TESTER, revoke: false, reason: DEFAULT_REASON, envPath: DEFAULT_ENV };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--revoke') args.revoke = true;
    else if (key === '--email') args.emails.push(argv[++i] ?? '');
    else if (key === '--emails') args.emailsFile = argv[++i] ?? '';
    else if (key === '--role') args.role = argv[++i] ?? '';
    else if (key === '--reason') args.reason = argv[++i] ?? '';
    else if (key === '--env') args.envPath = argv[++i] ?? '';
    else throw new Error(`모르는 인자: ${key}`);
  }
  if (!args.emailsFile && args.emails.length === 0) throw new Error('이메일이 필요합니다(--emails <파일> 또는 --email <주소>).');
  if (!ROLES.includes(args.role)) throw new Error(`역할(--role)은 ${ROLES.join('|')} 중 하나여야 합니다.`);
  if (!args.envPath) throw new Error('환경 파일 경로(--env)가 비어 있습니다.');
  return args;
}

/** 이메일 목록 글 → 정리된 주소 배열(주석·빈 줄 제외, 중복 제거, 소문자 비교 키). */
export function emailList(text) {
  const seen = new Set();
  const out = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

/** 출력용 마스크 — 이메일·subject 를 로그에 남기지 않는다. */
export const mask = (value) => createHash('sha256').update(String(value ?? '')).digest('hex').slice(0, 8);

function fail(message, code) {
  console.error(message);
  process.exit(code);
}

async function main() {
  const args = parseRoleArgs(process.argv.slice(2));
  const parsed = parseEnvFile(await readFile(args.envPath, 'utf8'));
  const databaseUrl = parsed.LOVETREE_DATABASE_URL || '';
  const productId = parsed.LOVETREE_PRODUCT_ID || '';
  if (!databaseUrl) fail('DB 연결 설정이 비어 있습니다.', 2);
  if (!productId) fail('제품 설정이 비어 있습니다.', 2);

  const fromFile = args.emailsFile ? emailList(await readFile(args.emailsFile, 'utf8')) : [];
  const emails = [...new Set([...fromFile, ...emailList(args.emails.join('\n'))])];
  if (emails.length === 0) fail('이메일 목록이 비어 있습니다.', 2);

  const pool = await createPool(databaseUrl, { max: 2 });
  const roles = createAdminRoleRepo(pool, { stageIndex: createStageIndexRepo(pool) });
  const actor = 'operator:ops-admin-role';
  let found = 0;
  let missing = 0;
  try {
    for (const email of emails) {
      const row = await pool.query(
        'SELECT subject_id FROM lovetree_account_emails WHERE product_id = $1 AND lower(email) = lower($2)',
        [productId, email]
      );
      const subjectId = row.rows[0]?.subject_id ?? null;
      if (!subjectId) {
        missing += 1;
        console.log(`- email#${mask(email)}: 계정에 없음(건너뜀)`);
        continue;
      }
      found += 1;
      if (args.revoke) {
        const previous = await roles.roleFor({ productId, subjectId });
        await roles.revoke({ productId, subjectId, revokedBy: actor, at: new Date().toISOString() });
        console.log(`- subject#${mask(subjectId)}: 해제 (이전 역할 ${previous?.role ?? '없음'})`);
      } else {
        const previous = await roles.roleFor({ productId, subjectId });
        await roles.assign({ productId, subjectId, role: args.role, grantedBy: actor, reason: args.reason, at: new Date().toISOString() });
        console.log(`- subject#${mask(subjectId)}: ${args.role} 부여 (이전 역할 ${previous?.role ?? '없음'})`);
      }
    }
  } finally {
    await pool.end().catch(() => {});
  }
  console.log(`처리 ${found}건 · 못 찾음 ${missing}건 · 역할 ${args.revoke ? '해제' : args.role}`);
  if (missing > 0) process.exit(3);
}

if (import.meta.url === `file://${process.argv[1]?.split(String.fromCharCode(92)).join('/')}` || process.argv[1]?.endsWith('admin-role.mjs')) {
  main().catch((error) => fail(`실패: ${String(error?.message ?? error).slice(0, 200)}`, 2));
}
