import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  parseRelinkArgs,
  mask,
  resolvePersona,
  checkRelink,
  backupName,
  buildBackup,
  beforeLine,
  afterLine,
  runRelink
} from '../tools/relink-opinion-author.mjs';

const PRODUCT = 'lt-relink-test';
const GUEST = 'guest-subject-raw';
const TARGET = 'sub_1111111111111111';
const PERSONA = { subject_id: TARGET, name: '하은' };
const AT = new Date('2026-11-18T05:40:00.000Z');

function rawPost(subjectId = GUEST, kind = 'opinion') {
  return {
    id: 20,
    product_id: PRODUCT,
    subject_id: subjectId,
    kind,
    category: 'inconvenient',
    title: null,
    body: '게스트 시점에 남긴 의견 본문',
    status: 'received',
    memo: null,
    issue_number: null,
    created_at: '2026-11-16T05:51:00.000Z',
    updated_at: '2026-11-16T05:51:00.000Z'
  };
}

function fakePool({ post = rawPost(), personas = [PERSONA], currentPersona = null, onUpdate = null } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.startsWith('UPDATE lovetree_feedback')) {
        if (onUpdate) await onUpdate();
        return { rows: [{ ...post, subject_id: params[2] }] };
      }
      if (sql.includes('lower(name) = lower($2)')) return { rows: personas };
      if (sql.includes('FROM lovetree_ai_personas WHERE product_id = $1 AND subject_id = $2')) {
        return { rows: currentPersona ? [{ name: currentPersona }] : [] };
      }
      return { rows: post ? [post] : [] };
    }
  };
}

function tempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'lt-relink-test-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('인자 검사: 기본 dry-run, 필수값과 모르는 인자 거부', () => {
  const args = parseRelinkArgs(['--opinion', '20', '--persona', '하은']);
  assert.equal(args.apply, false);
  assert.equal(args.opinion, 20);
  assert.equal(args.persona, '하은');
  const applied = parseRelinkArgs(['--opinion', '20', '--persona', '하은', '--apply', '--backup-dir', '/tmp/bk']);
  assert.equal(applied.apply, true);
  assert.equal(applied.backupDir, '/tmp/bk');
  assert.throws(() => parseRelinkArgs([]), /의견 번호/);
  assert.throws(() => parseRelinkArgs(['--opinion', '0', '--persona', '하은']), /양의 정수/);
  assert.throws(() => parseRelinkArgs(['--opinion', '20', '--persona', '  ']), /페르소나/);
  assert.throws(() => parseRelinkArgs(['--opinion', '20', '--persona', '하은', '--wat']), /모르는 인자/);
  assert.equal(parseRelinkArgs(['--help']).help, true);
});

test('dry-run은 아무 것도 쓰지 않고 전/후만 출력한다', async () => {
  const { dir, cleanup } = tempDir();
  try {
    const pool = fakePool();
    const result = await runRelink({ pool, productId: PRODUCT, opinionId: 20, personaHandle: '하은', apply: false, backupDir: dir, now: AT });
    assert.equal(result.applied, false);
    assert.equal(result.backupPath, null);
    assert.equal(pool.calls.some(call => call.sql.startsWith('UPDATE lovetree_feedback')), false);
    assert.deepEqual(readdirSync(dir), []);
    assert.equal(result.before.includes(GUEST), false);
    assert.equal(result.after.includes(TARGET), false);
    assert.match(result.before, /^before id=20 subject#[0-9a-f]{8} persona=\(없음\)$/);
    assert.match(result.after, /^after id=20 subject#[0-9a-f]{8} persona=하은$/);
  } finally {
    cleanup();
  }
});

test('apply는 백업을 먼저 만들고 작성 주체를 바꾼다', async () => {
  const { dir, cleanup } = tempDir();
  try {
    let backupExistedWhenUpdated = false;
    const pool = fakePool({ onUpdate: () => { backupExistedWhenUpdated = readdirSync(dir).length === 1; } });
    const result = await runRelink({ pool, productId: PRODUCT, opinionId: 20, personaHandle: '하은', apply: true, backupDir: dir, now: AT });
    assert.equal(result.applied, true);
    assert.equal(backupExistedWhenUpdated, true);
    assert.equal(result.backupPath, path.join(dir, backupName(20, AT)));
    const update = pool.calls.find(call => call.sql.startsWith('UPDATE lovetree_feedback'));
    assert.deepEqual(update.params, [PRODUCT, 20, TARGET, GUEST]);
    const backup = JSON.parse(readFileSync(result.backupPath, 'utf8'));
    assert.equal(backup.kind, 'lovetree-opinion-relink-backup');
    assert.equal(backup.opinionId, 20);
    assert.equal(backup.before.subjectId, GUEST);
    assert.equal(backup.after.subjectId, TARGET);
    assert.equal(JSON.stringify(result).includes(GUEST), false);
    assert.equal(JSON.stringify(result).includes(TARGET), false);
  } finally {
    cleanup();
  }
});

test('잘못된 입력과 중복 연결을 거부하고 백업을 만들지 않는다', async () => {
  assert.throws(() => resolvePersona([]), /페르소나를 찾을 수 없습니다/);
  assert.throws(() => resolvePersona([PERSONA, { subject_id: 'sub_2222222222222222', name: '하은2' }]), /여러 페르소나/);
  assert.deepEqual(resolvePersona([PERSONA]), { subjectId: TARGET, name: '하은' });
  const resolved = { subjectId: TARGET, name: '하은' };
  const mapped = (subjectId = GUEST, kind = 'opinion') => ({ id: 20, subjectId, kind });
  assert.equal(checkRelink({ post: mapped(), persona: resolved, currentPersonaName: null }), true);
  assert.equal(mask(GUEST).length, 8);
  assert.throws(() => checkRelink({ post: mapped(TARGET), persona: resolved, currentPersonaName: '하은' }), /이미 그 페르소나/);
  assert.throws(() => checkRelink({ post: mapped(), persona: resolved, currentPersonaName: '윤제' }), /다른 페르소나/);
  assert.throws(() => checkRelink({ post: mapped(GUEST, 'journal'), persona: resolved, currentPersonaName: null }), /사용 일지/);
  const record = buildBackup({ productId: PRODUCT, post: rawPost(), persona: PERSONA, at: AT, actor: 'operator:ops-relink-author' });
  assert.equal(record.createdAt, AT.toISOString());
  assert.equal(record.actor, 'operator:ops-relink-author');
  assert.match(beforeLine(rawPost(), null), /subject#[0-9a-f]{8}/);
  assert.match(afterLine(20, PERSONA), /subject#[0-9a-f]{8}/);
  const { dir, cleanup } = tempDir();
  try {
    const pool = fakePool({ personas: [] });
    await assert.rejects(
      runRelink({ pool, productId: PRODUCT, opinionId: 20, personaHandle: '없는이름', apply: true, backupDir: dir, now: AT }),
      /페르소나를 찾을 수 없습니다/
    );
    assert.deepEqual(readdirSync(dir), []);
    assert.equal(pool.calls.some(call => call.sql.startsWith('UPDATE lovetree_feedback')), false);
  } finally {
    cleanup();
  }
});
