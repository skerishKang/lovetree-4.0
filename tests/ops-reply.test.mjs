import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpsArgs, shouldSkip } from '../tools/ops-reply.mjs';

test('#596 후속: ops-reply 인자 검사', () => {
  const args = parseOpsArgs(['--id', '7', '--reply', '/tmp/r.txt', '--status', 'fixed', '--issue', '584']);
  assert.deepEqual(args, {id: '7', replyFile: '/tmp/r.txt', status: 'fixed', issue: '584', issueClear: false, statusOnly: false, envPath: '/opt/padiem/lovetree-api/.env'});
  assert.equal(parseOpsArgs(['--id', '3', '--reply', '/tmp/r.txt', '--status', 'closed', '--issue', '#547']).issue, '547');
  // #636: 앞의 '#'은 떼고 숫자만 저장한다 — 예전에는 '#'이 붙은 값 그대로 넣어 운영센터가 이슈를 못 읽었다.
  assert.equal(parseOpsArgs(['--id', '3', '--reply', '/tmp/r.txt', '--status', 'closed', '--issue', '#547']).issue, '547');
  assert.equal(parseOpsArgs(['--id', '4', '--reply', '/tmp/r.txt', '--status', 'fixed', '--issue', '547']).issue, '547');
  assert.throws(() => parseOpsArgs(['--reply', '/tmp/r.txt', '--status', 'fixed', '--issue', '1']), /의견 번호/);
  assert.throws(() => parseOpsArgs(['--id', '7', '--status', 'fixed', '--issue', '1']), /답변 파일/);
  assert.throws(() => parseOpsArgs(['--id', '7', '--reply', '/tmp/r.txt', '--status', 'nope', '--issue', '1']), /상태/);
  assert.throws(() => parseOpsArgs(['--id', '7', '--reply', '/tmp/r.txt', '--status', 'fixed', '--issue', '!!']), /연결 이슈/);
  assert.throws(() => parseOpsArgs(['--id', '7', '--reply', '/tmp/r.txt', '--status', 'fixed', '--issue', '1', '--wat']), /모르는 인자/);
});

test('#611 5번: --status-only 는 답글 없이 상태·연결 이슈만 바꾼다', () => {
  const args = parseOpsArgs(['--id', '9', '--status', 'fixed', '--issue', '611', '--status-only']);
  assert.deepEqual(args, {id: '9', replyFile: null, status: 'fixed', issue: '611', issueClear: false, statusOnly: true, envPath: '/opt/padiem/lovetree-api/.env'});
  assert.throws(() => parseOpsArgs(['--id', '9', '--status', 'fixed', '--issue', '1']), /답변 파일/);
  assert.throws(() => parseOpsArgs(['--id', '9', '--status-only']), /상태/);
});

test('#678: --status-only는 --issue를 생략할 수 있고, 이슈 값은 숫자만 받는다', () => {
  // --issue를 안 주면 issue가 null — 도구가 이슈 값을 덮어쓰지 않는다(기존 값 그대로 둔다).
  const noIssue = parseOpsArgs(['--id', '16', '--status', 'closed', '--status-only']);
  assert.deepEqual(noIssue, {id: '16', replyFile: null, status: 'closed', issue: null, issueClear: false, statusOnly: true, envPath: '/opt/padiem/lovetree-api/.env'});
  // 'none' 같은 숫자가 아닌 값은 받지 않고 오류로 끝난다(#678 — 어제 'none'을 저장한 일이 있었다).
  assert.throws(() => parseOpsArgs(['--id', '16', '--status', 'closed', '--issue', 'none', '--status-only']), /연결 이슈/);
  assert.throws(() => parseOpsArgs(['--id', '16', '--status', 'closed', '--issue', '', '--status-only']), /연결 이슈/);
  // 이슈 값을 비우는 길은 --issue-clear 뿐이다. --issue와 함께 쓰면 거절한다.
  const cleared = parseOpsArgs(['--id', '16', '--status', 'closed', '--issue-clear', '--status-only']);
  assert.equal(cleared.issueClear, true);
  assert.equal(cleared.issue, null);
  assert.throws(() => parseOpsArgs(['--id', '16', '--status', 'closed', '--issue', '1', '--issue-clear', '--status-only']), /--issue-clear/);
});

test('#596 후속: 이미 답글이 있으면 건너뛴다', () => {
  assert.equal(shouldSkip({replyCount: 0}), false);
  assert.equal(shouldSkip({replyCount: 2}), true);
  assert.equal(shouldSkip({}), false);
  assert.equal(shouldSkip(null), false);
});
