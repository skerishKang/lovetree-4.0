import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpsArgs, shouldSkip } from '../tools/ops-reply.mjs';

test('#596 후속: ops-reply 인자 검사', () => {
  const args = parseOpsArgs(['--id', '7', '--reply', '/tmp/r.txt', '--status', 'fixed', '--issue', '584']);
  assert.deepEqual(args, {id: '7', replyFile: '/tmp/r.txt', status: 'fixed', issue: '#584', envPath: '/opt/padiem/lovetree-api/.env'});
  assert.equal(parseOpsArgs(['--id', '3', '--reply', '/tmp/r.txt', '--status', 'closed', '--issue', '#547']).issue, '#547');
  assert.throws(() => parseOpsArgs(['--reply', '/tmp/r.txt', '--status', 'fixed', '--issue', '1']), /의견 번호/);
  assert.throws(() => parseOpsArgs(['--id', '7', '--status', 'fixed', '--issue', '1']), /답변 파일/);
  assert.throws(() => parseOpsArgs(['--id', '7', '--reply', '/tmp/r.txt', '--status', 'nope', '--issue', '1']), /상태/);
  assert.throws(() => parseOpsArgs(['--id', '7', '--reply', '/tmp/r.txt', '--status', 'fixed', '--issue', '!!']), /연결 이슈/);
  assert.throws(() => parseOpsArgs(['--id', '7', '--reply', '/tmp/r.txt', '--status', 'fixed', '--issue', '1', '--wat']), /모르는 인자/);
});

test('#596 후속: 이미 답글이 있으면 건너뛴다', () => {
  assert.equal(shouldSkip({replyCount: 0}), false);
  assert.equal(shouldSkip({replyCount: 2}), true);
  assert.equal(shouldSkip({}), false);
  assert.equal(shouldSkip(null), false);
});
