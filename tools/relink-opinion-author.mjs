#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseEnvFile } from './export-ai-customer-db.mjs';

const DEFAULT_ENV = '/opt/padiem/lovetree-api/.env';
const DEFAULT_BACKUP_DIR = '/opt/padiem/lovetree-api/backups';

export const PERSONA_QUERY = 'SELECT subject_id, name FROM lovetree_ai_personas WHERE product_id = $1 AND (subject_id = $2 OR lower(name) = lower($2))';

export function parseRelinkArgs(argv) {
  const args = { help: false, opinion: null, persona: null, apply: false, envPath: DEFAULT_ENV, backupDir: DEFAULT_BACKUP_DIR };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--help' || key === '-h') args.help = true;
    else if (key === '--apply') args.apply = true;
    else if (key === '--opinion') args.opinion = argv[++i] ?? '';
    else if (key === '--persona') args.persona = argv[++i] ?? '';
    else if (key === '--env') args.envPath = argv[++i] ?? '';
    else if (key === '--backup-dir') args.backupDir = argv[++i] ?? '';
    else throw new Error(`모르는 인자: ${key}`);
  }
  if (args.help) return args;
  if (!/^\d{1,20}$/.test(String(args.opinion ?? '')) || !Number.isSafeInteger(Number(args.opinion)) || Number(args.opinion) <= 0) {
    throw new Error('의견 번호(--opinion)는 양의 정수여야 합니다.');
  }
  args.opinion = Number(args.opinion);
  const handle = String(args.persona ?? '').trim();
  if (!handle || handle.length > 80) throw new Error('대상 페르소나(--persona) 이름 또는 subject를 주세요.');
  args.persona = handle;
  if (!args.envPath) throw new Error('환경 파일 경로(--env)가 비어 있습니다.');
  if (!args.backupDir) throw new Error('백업 폴더(--backup-dir)가 비어 있습니다.');
  return args;
}

export function mask(value) {
  return createHash('sha256').update(String(value ?? '')).digest('hex').slice(0, 8);
}

export function resolvePersona(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) throw new Error('페르소나를 찾을 수 없습니다(이름 또는 subject 확인).');
  if (list.length > 1) throw new Error('여러 페르소나가 일치합니다. 이름을 더 정확히 주세요.');
  return { subjectId: list[0].subject_id, name: String(list[0].name ?? '').trim() };
}

export function checkRelink({ post, persona, currentPersonaName }) {
  if (!post) throw new Error('의견을 찾을 수 없습니다(번호 확인).');
  if (post.kind !== 'opinion') throw new Error('사용 일지에는 작성 주체를 연결할 수 없습니다.');
  if (post.subjectId === persona.subjectId) throw new Error('이미 그 페르소나에 연결된 의견입니다.');
  if (currentPersonaName) throw new Error('이미 다른 페르소나에 연결된 의견입니다.');
  return true;
}

export function backupName(opinionId, at) {
  return `relink-${opinionId}-${(at instanceof Date ? at.toISOString() : String(at)).replace(/[-:.]/g, '')}.json`;
}

export function buildBackup({ productId, post, persona, at, actor }) {
  return {
    kind: 'lovetree-opinion-relink-backup',
    createdAt: at instanceof Date ? at.toISOString() : String(at),
    actor,
    productId,
    opinionId: post.id,
    before: { subjectId: post.subjectId, kind: post.kind, status: post.status },
    after: { subjectId: persona.subjectId, personaName: persona.name }
  };
}

export function beforeLine(post, currentPersonaName) {
  return `before id=${post.id} subject#${mask(post.subjectId)} persona=${currentPersonaName || '(없음)'}`;
}

export function afterLine(opinionId, persona) {
  return `after id=${opinionId} subject#${mask(persona.subjectId)} persona=${persona.name}`;
}

export async function runRelink({ pool, productId, opinionId, personaHandle, apply = false, backupDir = DEFAULT_BACKUP_DIR, now = new Date() }) {
  const { createFeedbackRepo } = await import('../server/db/feedback-postgres.js');
  const repo = createFeedbackRepo(pool);
  const post = await repo.get({ productId, id: opinionId });
  const personaRows = (await pool.query(PERSONA_QUERY, [productId, personaHandle])).rows;
  const persona = resolvePersona(personaRows);
  const current = post ? await repo.getPersona({ productId, subjectId: post.subjectId }) : null;
  checkRelink({ post, persona, currentPersonaName: current?.name || null });
  const before = beforeLine(post, current?.name || null);
  const after = afterLine(opinionId, persona);
  if (!apply) return { applied: false, opinionId, personaName: persona.name, before, after, backupPath: null };

  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  const backupPath = path.join(backupDir, backupName(opinionId, now));
  const record = buildBackup({ productId, post, persona, at: now, actor: 'operator:ops-relink-author' });
  await writeFile(backupPath, JSON.stringify(record, null, 2), { mode: 0o600, flag: 'wx' });
  const updated = await repo.relinkAuthor({ productId, id: opinionId, expectedSubjectId: post.subjectId, toSubjectId: persona.subjectId });
  if (!updated) throw new Error(`의견이 바뀌었습니다. 백업: ${backupPath}`);
  return { applied: true, opinionId, personaName: persona.name, before, after, backupPath };
}

export function usage() {
  return [
    '사용: node tools/relink-opinion-author.mjs --opinion <번호> --persona <이름|subject> [--apply]',
    '기본은 dry-run(변경 없음, 전/후만 출력). --apply일 때만 백업 파일을 만들고 연결한다.',
    '--env <경로>  API .env 경로(기본 /opt/padiem/lovetree-api/.env)',
    '--backup-dir <경로>  백업 폴더(기본 /opt/padiem/lovetree-api/backups)'
  ].join('\n');
}

async function main() {
  const args = parseRelinkArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const parsed = parseEnvFile(await readFile(args.envPath, 'utf8'));
  const productId = parsed.LOVETREE_PRODUCT_ID || '';
  const databaseUrl = parsed.LOVETREE_DATABASE_URL || '';
  if (!productId || !databaseUrl) throw new Error('API .env 설정이 비어 있습니다.');
  const pg = await import('pg');
  const pool = new (pg.default ?? pg).Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 8000 });
  let result;
  try {
    result = await runRelink({ pool, productId, opinionId: args.opinion, personaHandle: args.persona, apply: args.apply, backupDir: args.backupDir });
  } finally {
    await pool.end().catch(() => {});
  }
  console.log(args.apply ? 'APPLY' : 'DRY_RUN (변경 없음)');
  console.log(result.before);
  console.log(result.after);
  if (result.backupPath) console.log(`BACKUP=${result.backupPath}`);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('relink-opinion-author.mjs')) {
  main().catch(error => {
    console.error(`실패: ${String(error?.message ?? error).slice(0, 200)}`);
    process.exit(2);
  });
}
