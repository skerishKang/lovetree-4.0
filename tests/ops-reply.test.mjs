import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpsArgs, shouldSkip, buildPatch, replyMode } from '../tools/ops-reply.mjs';

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

test('#689 후속: 답변 모드에서도 --issue를 생략할 수 있고 --issue-clear로 비운다(--status-only와 같은 규칙)', () => {
  // 답변 모드 + --issue 생략 — parse가 받아들이고(issue null) patch에 이슈를 넣지 않아 기존 값이 그대로 남는다.
  const noIssue = parseOpsArgs(['--id', '21', '--reply', '/tmp/r.txt', '--status', 'reviewing']);
  assert.deepEqual(noIssue, {id: '21', replyFile: '/tmp/r.txt', status: 'reviewing', issue: null, issueClear: false, statusOnly: false, envPath: '/opt/padiem/lovetree-api/.env'});
  assert.deepEqual(buildPatch(noIssue), {status: 'reviewing'});
  // 답변 모드 + --issue-clear — patch에 빈 값('')을 넣어 이슈를 비운다(운영센터가 이슈를 지울 때와 같은 값).
  const cleared = parseOpsArgs(['--id', '21', '--reply', '/tmp/r.txt', '--status', 'reviewing', '--issue-clear']);
  assert.deepEqual(cleared, {id: '21', replyFile: '/tmp/r.txt', status: 'reviewing', issue: null, issueClear: true, statusOnly: false, envPath: '/opt/padiem/lovetree-api/.env'});
  assert.deepEqual(buildPatch(cleared), {status: 'reviewing', issueNumber: ''});
  // 둘을 함께 쓰면 거절한다.
  assert.throws(() => parseOpsArgs(['--id', '21', '--reply', '/tmp/r.txt', '--status', 'reviewing', '--issue', '7', '--issue-clear']), /--issue-clear/);
  // 숫자가 아닌 값도 거절한다.
  assert.throws(() => parseOpsArgs(['--id', '21', '--reply', '/tmp/r.txt', '--status', 'reviewing', '--issue', 'none']), /연결 이슈/);
  // 생략한 답변 모드에 --issue를 주면 이전과 같이 그 값으로 바꾼다.
  assert.equal(parseOpsArgs(['--id', '21', '--reply', '/tmp/r.txt', '--status', 'fixed', '--issue', '#584']).issue, '584');
});

test('#596 후속: 이미 답글이 있으면 건너뛴다', () => {
  assert.equal(shouldSkip({replyCount: 0}), false);
  assert.equal(shouldSkip({replyCount: 2}), true);
  assert.equal(shouldSkip({}), false);
  assert.equal(shouldSkip(null), false);
});

test('#846 후속: 사용 일지는 내부 메모·상태 갱신만 하고 고객 답변은 남기지 않는다', () => {
  const replyArgs = {statusOnly: false};
  const statusOnlyArgs = {statusOnly: true};
  assert.equal(replyMode({kind: 'journal'}, replyArgs), 'internal');
  assert.equal(replyMode({kind: 'journal'}, statusOnlyArgs), null);
  assert.equal(replyMode({kind: 'opinion'}, replyArgs), 'customer');
  assert.equal(replyMode({kind: 'opinion'}, statusOnlyArgs), null);
  assert.equal(replyMode({kind: 'other'}, replyArgs), 'unknown-kind');
});
