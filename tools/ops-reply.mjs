#!/usr/bin/env node
// #596 후속(2026-11-14) — 운영센터 답변 처리 보조(컴2 WSL 안에서 root 실행).
//
// 운영센터 API 가 쓰는 같은 서버 함수(createFeedbackService.reply·update)로 처리한다 —
// SQL 을 직접 쓰지 않고, 검사·개인정보 가림·감사 기록까지 운영센터와 동일하게 적용된다.
// 접속 설정은 API 서비스와 같은 .env 에서만 읽고, 이메일·subject·접속 문자열은 출력하지 않는다.
//
// 입력: --id <의견 번호> --reply <답변 파일> --status <received|reviewing|fixed|later|closed> --issue <연결 이슈> [--env <경로>]
// 규칙: 대상 의견에 이미 답글이 있으면 아무 것도 하지 않고 끝난다(종료 코드 3 — 건너뜀).
//       답변은 고객에게 보이는 답변(authorType=customer)으로 남고, 상태·연결 이슈 번호를 함께 바꾼다.
//
// 실행: node /opt/padiem/lovetree-api/tools/ops-reply.mjs --id 7 --reply /tmp/reply.txt --status fixed --issue 584

import { readFile } from 'node:fs/promises';
import { parseEnvFile } from './export-ai-customer-db.mjs';

const STATUSES = ['received', 'reviewing', 'fixed', 'later', 'closed'];

/** 인자 검사(순수) — 잘못된 값은 한 줄 이유로 거부한다. */
export function parseOpsArgs(argv) {
  const args = {id: null, replyFile: null, status: null, issue: null, envPath: '/opt/padiem/lovetree-api/.env'};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--id') args.id = argv[++i] ?? '';
    else if (key === '--reply') args.replyFile = argv[++i] ?? '';
    else if (key === '--status') args.status = argv[++i] ?? '';
    else if (key === '--issue') args.issue = argv[++i] ?? '';
    else if (key === '--env') args.envPath = argv[++i] ?? '';
    else throw new Error(`모르는 인자: ${key}`);
  }
  if (!/^\d{1,20}$/.test(String(args.id ?? ''))) throw new Error('의견 번호(--id)가 필요합니다.');
  if (!args.replyFile) throw new Error('답변 파일(--reply)이 필요합니다.');
  if (!STATUSES.includes(args.status)) throw new Error(`상태(--status)는 ${STATUSES.join('|')} 중 하나여야 합니다.`);
  if (!/^#?[0-9A-Za-z._-]{1,20}$/.test(String(args.issue ?? ''))) throw new Error('연결 이슈 번호(--issue)가 필요합니다.');
  if (!args.issue.startsWith('#')) args.issue = '#' + args.issue;
  if (!args.envPath) throw new Error('환경 파일 경로(--env)가 비어 있습니다.');
  return args;
}

/** 이미 답글이 있으면 건너뛴다(아무 것도 바꾸지 않는다). */
export const shouldSkip = row => Boolean(row && (row.replyCount ?? 0) > 0);

function fail(message, code) {
  console.error(message);
  process.exit(code);
}

async function main() {
  const args = parseOpsArgs(process.argv.slice(2));
  const parsed = parseEnvFile(await readFile(args.envPath, 'utf8'));
  const databaseUrl = parsed.LOVETREE_DATABASE_URL || '';
  const productId = parsed.LOVETREE_PRODUCT_ID || '';
  if (!databaseUrl) fail('DB 연결 설정(LOVETREE_DATABASE_URL)이 비어 있습니다.', 2);
  if (!productId) fail('제품 설정(LOVETREE_PRODUCT_ID)이 비어 있습니다.', 2);
  const replyText = String(await readFile(args.replyFile, 'utf8')).trim();
  if (!replyText) fail('답변 파일이 비어 있습니다.', 2);

  const pg = await import('pg');
  const pool = new (pg.default ?? pg).Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 8000 });
  try {
    const { createFeedbackRepo } = await import('../server/db/feedback-postgres.js');
    const { createAdminRoleRepo } = await import('../server/db/admin-roles-postgres.js');
    const { createAdminRoleService } = await import('../server/admin-roles.js');
    const { createFeedbackService } = await import('../server/feedback-service.js');
    const repo = createFeedbackRepo(pool);
    const admin = createAdminRoleService({ store: createAdminRoleRepo(pool), productId });
    // 운영센터 API 와 같은 서비스 한 벌 — 검사·가림·감사가 동일하게 적용된다.
    const service = createFeedbackService({ feedbackRepo: repo, productId, admin });

    const current = await repo.get({ productId, id: Number(args.id) });
    if (!current) fail('의견을 찾을 수 없습니다(번호 확인).', 4);
    if (current.kind !== 'opinion') fail('사용 일지에는 고객 답변을 남길 수 없습니다.', 4);
    if (shouldSkip(current)) {
      console.log(`skipped id=${current.id} status=${current.status} replies=${current.replyCount}`);
      return;
    }
    // 서버가 확인한 관리자 역할 계정으로 운영센터와 같은 흐름을 돌린다(감사·답글 작성자에 그대로 남는다).
    const adminSubject = (await pool.query(
      `SELECT subject_id FROM lovetree_product_roles WHERE product_id = $1 AND role = 'admin' ORDER BY updated_at DESC LIMIT 1`,
      [productId])).rows[0]?.subject_id;
    if (!adminSubject) fail('관리자 역할 계정을 찾을 수 없습니다.', 4);
    const principal = { productId, subjectId: adminSubject };

    const reply = await service.reply(principal, String(args.id), {authorType: 'customer', body: replyText});
    const updated = await service.update(principal, String(args.id), {status: args.status, issueNumber: args.issue});
    console.log(`replied id=${updated.id} replyId=${reply.id} authorType=customer status=${updated.status} issue=${updated.issueNumber || ''} replies=${updated.replyCount}`);
  } finally {
    await pool.end().catch(() => {});
  }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('ops-reply.mjs')) {
  main().catch(error => { console.error('실패: ' + String(error?.message || error).slice(0, 200)); process.exit(1); });
}
