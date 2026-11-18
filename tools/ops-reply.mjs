#!/usr/bin/env node
// #596 후속(2026-11-14) — 운영센터 답변 처리 보조(컴2 WSL 안에서 root 실행).
//
// 운영센터 API 가 쓰는 같은 서버 함수(createFeedbackService.reply·update)로 처리한다 —
// SQL 을 직접 쓰지 않고, 검사·개인정보 가림·감사 기록까지 운영센터와 동일하게 적용된다.
// 접속 설정은 API 서비스와 같은 .env 에서만 읽고, 이메일·subject·접속 문자열은 출력하지 않는다.
//
// 입력: --id <의견 번호> [--reply <답변 파일>] --status <received|reviewing|fixed|later|closed> [--issue <연결 이슈>] [--status-only] [--issue-clear] [--env <경로>]
// 규칙: 대상 의견에 이미 답글이 있으면 아무 것도 하지 않고 끝난다(종료 코드 3 — 건너뜀).
//       --status-only(#611 5번)면 답변 파일 없이 상태만 바꾼다(답글이 이미 있어도 처리).
//       --issue는 어느 모드에서든 생략할 수 있다(#689 후속 — 생략하면 이슈 값은 그대로 둔다. #678이 --status-only에서 먼저 연 규칙을 답변 모드까지 맞춘 것).
//       --issue는 숫자만 받고(#636), 이슈 값을 비우려면 --issue-clear를 쓴다(#678 — 'none' 같은 값은 받지 않는다. 답변 모드에서도 같다).
//       --issue와 --issue-clear를 함께 쓰면 거절한다.
//       답변을 달 때(--reply)는 상태를 함께 바꾸고 연결 이슈는 --issue/--issue-clear를 준 만큼만 바꾼다(답변은 고객에게 보이는 답변 authorType=customer).
//       사용 일지(#846 후속)는 고객 답변을 남길 수 없다(서버 규칙 journal_internal_only) — --status-only로 상태·연결 이슈만 바꾸거나, --reply면 고객에게 보이지 않는 내부 메모(authorType=internal)로 남긴다.
//
// 실행: node /opt/padiem/lovetree-api/tools/ops-reply.mjs --id 7 --reply /tmp/reply.txt --status fixed --issue 584

import { readFile } from 'node:fs/promises';
import { parseEnvFile } from './export-ai-customer-db.mjs';

const STATUSES = ['received', 'reviewing', 'fixed', 'later', 'closed'];

/** 인자 검사(순수) — 잘못된 값은 한 줄 이유로 거부한다. */
export function parseOpsArgs(argv) {
  const args = {id: null, replyFile: null, status: null, issue: null, issueClear: false, statusOnly: false, envPath: '/opt/padiem/lovetree-api/.env'};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--status-only') args.statusOnly = true;
    else if (key === '--issue-clear') args.issueClear = true;
    else if (key === '--id') args.id = argv[++i] ?? '';
    else if (key === '--reply') args.replyFile = argv[++i] ?? '';
    else if (key === '--status') args.status = argv[++i] ?? '';
    else if (key === '--issue') args.issue = argv[++i] ?? '';
    else if (key === '--env') args.envPath = argv[++i] ?? '';
    else throw new Error(`모르는 인자: ${key}`);
  }
  if (!/^\d{1,20}$/.test(String(args.id ?? ''))) throw new Error('의견 번호(--id)가 필요합니다.');
  if (!args.statusOnly && !args.replyFile) throw new Error('답변 파일(--reply)이 필요합니다. --status-only면 생략할 수 있어요.');
  if (!STATUSES.includes(args.status)) throw new Error(`상태(--status)는 ${STATUSES.join('|')} 중 하나여야 합니다.`);
  if (args.issueClear && args.issue !== null) throw new Error('--issue-clear는 --issue와 함께 쓰지 않는다. 이슈 값을 비우는 것이 --issue-clear다.');
  if (args.issue !== null) {
    // #636: 저장은 숫자만 한다. '#'은 화면 표시일 뿐인데 그대로 넣어 두어 운영센터가 그 글을 '연결 이슈'로 읽지 못했다.
    // #678: 'none' 같은 숫자가 아닌 값도 받지 않는다(운영센터 화면이 이슈 연결 없음으로 보이길 바라면 --issue-clear를 쓴다).
    const digits = String(args.issue).replace(/^#/, '');
    if (!/^\d{1,20}$/.test(digits)) throw new Error('연결 이슈 번호(--issue)는 숫자만 받습니다. 이슈 값을 비우려면 --issue-clear를 쓰세요.');
    args.issue = digits;
  }
  // #689 후속: --issue를 생략할 수 있다(#678이 --status-only에서 연 규칙을 답변 모드까지) — 이슈 값은 그대로 둔다.
  if (!args.envPath) throw new Error('환경 파일 경로(--env)가 비어 있습니다.');
  return args;
}

/** 상태·연결 이슈 patch(순수) — 이슈를 생략하면 patch에 넣지 않아(서비스 update가 기존 값을 유지)
 *  --issue-clear는 운영센터가 이슈를 지울 때 보내는 빈 값('')을 그대로 넣는다. */
export function buildPatch(args) {
  const patch = {status: args.status};
  if (args.issueClear) patch.issueNumber = '';
  else if (args.issue !== null) patch.issueNumber = args.issue;
  return patch;
}

/** 이미 답글이 있으면 건너뛴다(아무 것도 바꾸지 않는다). */
export const shouldSkip = row => Boolean(row && (row.replyCount ?? 0) > 0);

/** 답변 모드(순수) — 의견은 고객 답변, 사용 일지는 내부 메모만(서버 규칙). 상태만 바꿀 때는 null. */
export function replyMode(current, args) {
  if (current.kind === 'journal') return args.statusOnly ? null : 'internal';
  if (current.kind !== 'opinion') return 'unknown-kind';
  return args.statusOnly ? null : 'customer';
}

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
  const replyText = args.statusOnly ? '' : String(await readFile(args.replyFile, 'utf8')).trim();
  if (!args.statusOnly && !replyText) fail('답변 파일이 비어 있습니다.', 2);

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
    const mode = replyMode(current, args);
    if (mode === 'unknown-kind') fail('글 종류를 확인해 주세요.', 4);
    if (shouldSkip(current) && !args.statusOnly) {
      console.log(`skipped id=${current.id} status=${current.status} replies=${current.replyCount}`);
      return;
    }
    // 서버가 확인한 관리자 역할 계정으로 운영센터와 같은 흐름을 돌린다(감사·답글 작성자에 그대로 남는다).
    const adminSubject = (await pool.query(
      `SELECT subject_id FROM lovetree_product_roles WHERE product_id = $1 AND role = 'admin' ORDER BY updated_at DESC LIMIT 1`,
      [productId])).rows[0]?.subject_id;
    if (!adminSubject) fail('관리자 역할 계정을 찾을 수 없습니다.', 4);
    const principal = { productId, subjectId: adminSubject };

    const reply = mode ? await service.reply(principal, String(args.id), {authorType: mode, body: replyText}) : null;
    // 이슈를 생략하면 patch에 넣지 않아 운영센터와 같은 update가 기존 값을 그대로 둔다(#678·#689 후속).
    // --issue-clear는 운영센터가 이슈를 지울 때 보내는 빈 값('')을 그대로 서비스에 넘긴다(DB 직접 쓰기 없음).
    const patch = buildPatch(args);
    const updated = await service.update(principal, String(args.id), patch);
    if (args.statusOnly) console.log(`updated id=${updated.id} status=${updated.status} issue=${updated.issueNumber || ''} replies=${updated.replyCount}`);
    else console.log(`replied id=${updated.id} replyId=${reply.id} authorType=${mode} status=${updated.status} issue=${updated.issueNumber || ''} replies=${updated.replyCount}`);
  } finally {
    await pool.end().catch(() => {});
  }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('ops-reply.mjs')) {
  main().catch(error => { console.error('실패: ' + String(error?.message || error).slice(0, 200)); process.exit(1); });
}
