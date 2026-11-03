import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ApiError } from '../server/errors.js';
import { createApiHandler } from '../server/http.js';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { createMemoryAccountRepo } from '../server/testing/memory-account-repo.js';
import { createAccountService, subjectHash } from '../server/account-service.js';
import { createDeletedAccountGuard } from '../server/account-guard.js';
import { ACCOUNT_USER_TABLES, ACCOUNT_PRESERVED_TABLES } from '../server/db/account-postgres.js';
import { createTree, addMoment } from '../src/domain.js';

const PRODUCT = 'lovetree-4-0';
const PRODUCT_MISMATCH = 'other-product';
const ORIGIN = 'https://lovetree.test';
const USER = 'sub_tester0001';
const OTHER = 'sub_other00002';
const ADMIN = 'sub_admin00003';
const CLOCK = '2026-11-03T10:00:00.000Z';

const base = { subject: '윤슬', note: '남기고 싶은 마음', emotion: '설렘', date: '2026-11-03', url: '' };

function seedAll(repo) {
  for (const entry of ACCOUNT_USER_TABLES) {
    repo.seed(entry.table, { productId: PRODUCT, subjects: [USER], note: 'user' });
    repo.seed(entry.table, { productId: PRODUCT, subjects: [OTHER], note: 'other' });
  }
}

function build({ verified = { productId: PRODUCT, subjectId: USER }, repo = createMemoryAccountRepo(), workspaceRepo = createMemoryWorkspaceRepo(), admin = null, mediaStore = null, allowedOrigins = [ORIGIN] } = {}) {
  const service = createWorkspaceService({ repo: workspaceRepo, productId: PRODUCT });
  const account = createAccountService({ repo, productId: PRODUCT, admin, mediaStore, now: () => new Date(CLOCK) });
  const authenticate = async () => verified;
  const handle = createApiHandler({ authenticate, service, productId: PRODUCT, admin, account, allowedOrigins });
  return { handle, account, repo, workspaceRepo, service };
}

const post = (handle, body, headers = {}) => handle({
  method: 'POST', path: '/api/account/delete',
  headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers },
  body: JSON.stringify(body)
});
const getAccount = (handle) => handle({ method: 'GET', path: '/api/account', headers: {} });

function sampleState(title = '첫 목소리') {
  const tree = createTree({ ...base, title }, CLOCK);
  const grown = addMoment(tree, { ...base, title: '이어진 순간', relation: '기억나서' }, tree.moments[0].id, CLOCK);
  return { version: 1, trees: [grown] };
}

test('정상 탈퇴: 사용자 키가 있는 모든 표에서 그 사용자 행만 0이 되고 다른 사용자는 그대로다', async () => {
  const repo = createMemoryAccountRepo();
  seedAll(repo);
  const media = { calls: 0, async removeAccount() { this.calls += 1; } };
  const { handle, account } = build({ repo, mediaStore: media });

  const response = await post(handle, { confirm: USER });
  assert.equal(response.status, 200);
  assert.equal(response.body.deleted, true);
  assert.equal(media.calls, 1, '데이터 삭제 뒤 파일 정리를 한 번 호출한다');

  for (const entry of ACCOUNT_USER_TABLES) {
    assert.equal(repo.rowCount(entry.table, USER), 0, entry.table + ' 에 탈퇴자 행이 남았다');
    assert.equal(repo.rowCount(entry.table, OTHER), 1, entry.table + ' 의 다른 사용자 행이 지워졌다');
  }
  assert.equal(await account.isDeleted({ productId: PRODUCT, subjectId: USER }), true);
  const hash = subjectHash(USER);
  assert.equal(hash.length, 64);
  assert.equal(await repo.isDeleted({ productId: PRODUCT, subjectHash: hash }), true);
});

test('확인 값 불일치는 400이고 아무것도 지워지지 않는다', async () => {
  const repo = createMemoryAccountRepo();
  seedAll(repo);
  const media = { calls: 0, async removeAccount() { this.calls += 1; } };
  const { handle } = build({ repo, mediaStore: media });
  const before = JSON.stringify([...repo.snapshot().tables]);

  const response = await post(handle, { confirm: 'not-my-account@example.test' });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'account_delete_confirm_mismatch');
  assert.equal(JSON.stringify([...repo.snapshot().tables]), before);
  assert.equal(media.calls, 0);
});

test('로그인 없음은 401, 다른 출처는 403이며 아무것도 지워지지 않는다', async () => {
  const repo = createMemoryAccountRepo();
  seedAll(repo);
  const anonymous = build({ repo });
  anonymous.handle = createApiHandler({
    authenticate: async () => null,
    service: anonymous.service,
    productId: PRODUCT,
    account: anonymous.account,
    allowedOrigins: [ORIGIN]
  });
  const unauth = await post(anonymous.handle, { confirm: USER });
  assert.equal(unauth.status, 401);

  const { handle } = build({ repo });
  const before = JSON.stringify([...repo.snapshot().tables]);
  const wrongOrigin = await post(handle, { confirm: USER }, { origin: 'https://evil.test' });
  assert.equal(wrongOrigin.status, 403);
  assert.equal(wrongOrigin.body.error.code, 'account_origin');
  assert.equal(JSON.stringify([...repo.snapshot().tables]), before);
  assert.equal(await repo.isDeleted({ productId: PRODUCT, subjectHash: subjectHash(USER) }), false);
});

test('중간 실패는 503이고 전부 되돌아간다', async () => {
  const repo = createMemoryAccountRepo();
  seedAll(repo);
  const before = JSON.stringify([...repo.snapshot().tables]);
  repo.failNext('delete failed halfway');
  const media = { calls: 0, async removeAccount() { this.calls += 1; } };
  const { handle } = build({ repo, mediaStore: media });

  const response = await post(handle, { confirm: USER });
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, 'account_delete_failed');
  assert.equal(JSON.stringify([...repo.snapshot().tables]), before, '실패한 삭제가 일부 표에만 적용됐다');
  assert.equal(await repo.isDeleted({ productId: PRODUCT, subjectHash: subjectHash(USER) }), false);
  assert.equal(media.calls, 0, 'DB 삭제가 실패하면 파일도 지우지 않는다');
});

test('탈퇴한 계정의 옛 세션은 인증 경계에서 거부된다', async () => {
  const repo = createMemoryAccountRepo();
  seedAll(repo);
  const account = createAccountService({ repo, productId: PRODUCT });
  const guard = createDeletedAccountGuard({ authenticate: async () => ({ productId: PRODUCT, subjectId: USER }), account, productId: PRODUCT });
  assert.equal((await guard({})).subjectId, USER);

  await post(build({ repo }).handle, { confirm: USER });

  await assert.rejects(() => guard({}), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 401);
    assert.equal(error.code, 'account_deleted');
    return true;
  });
});

test('관리자 계정은 403으로 거부되고 아무것도 지워지지 않는다', async () => {
  const repo = createMemoryAccountRepo();
  seedAll(repo);
  const before = JSON.stringify([...repo.snapshot().tables]);
  const admin = { roleFor: async (principal) => (principal.subjectId === ADMIN ? 'admin' : null) };
  const { handle } = build({ repo, admin, verified: { productId: PRODUCT, subjectId: ADMIN } });

  const response = await post(handle, { confirm: ADMIN });
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'account_delete_admin_blocked');
  assert.equal(JSON.stringify([...repo.snapshot().tables]), before);
});

test('이메일을 아는 배포에서는 이메일이 확인 값이 되고 subject 입력은 거부된다', async () => {
  const repo = createMemoryAccountRepo();
  seedAll(repo);
  const { handle } = build({ repo, verified: { productId: PRODUCT, subjectId: USER, email: 'owner@example.test' } });

  const bySubject = await post(handle, { confirm: USER });
  assert.equal(bySubject.status, 400);

  const described = await getAccount(handle);
  assert.equal(described.body.confirmKind, 'email');
  assert.equal(described.body.email, 'owner@example.test');

  const byEmail = await post(handle, { confirm: 'owner@example.test' });
  assert.equal(byEmail.status, 200);
});

test('사용자 키가 있는 표를 빠짐없이 지운다 (스키마 누락 검사)', () => {
  const schema = readFileSync(new URL('../server/db/schema.sql', import.meta.url), 'utf8');
  const declared = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\n\);/g)]
    .map((match) => ({ table: match[1], body: match[2] }));
  const keys = /(?:^|\s)(subject_id|reporter_subject_id|blocker_subject_id|blocked_subject_id|actor_subject_id|hidden_by)\s+text/;
  const userKeyed = declared.filter((entry) => keys.test(entry.body)).map((entry) => entry.table);
  const covered = new Set([...ACCOUNT_USER_TABLES.map((entry) => entry.table), ...ACCOUNT_PRESERVED_TABLES]);
  const missing = userKeyed.filter((table) => !covered.has(table));
  assert.deepEqual(missing, [], '탈퇴 경로가 지우지 않는 사용자 키 표가 있다: ' + missing.join(', '));
  const listed = new Set(ACCOUNT_USER_TABLES.map((entry) => entry.table));
  for (const table of listed) assert.ok(declared.some((entry) => entry.table === table), '경로에만 있고 스키마에 없는 표: ' + table);
});

test('작업공간 문서 개별 삭제: 내 문서만 지우고 남의 문서는 거부한다', async () => {
  const workspaceRepo = createMemoryWorkspaceRepo();
  const alice = build({ workspaceRepo, verified: { productId: PRODUCT, subjectId: USER } });
  const bob = build({ workspaceRepo, verified: { productId: PRODUCT, subjectId: OTHER } });

  const saved = await alice.handle({ method: 'PUT', path: '/api/workspace', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: sampleState(), expectedRevision: 0, clientKey: 'k-1' }) });
  assert.equal(saved.status, 200);
  const treeId = saved.body.revision && (await alice.handle({ method: 'GET', path: '/api/workspace', headers: {} })).body.state.trees[0].id;

  await bob.handle({ method: 'PUT', path: '/api/workspace', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: sampleState('남의 트리'), expectedRevision: 0, clientKey: 'k-b' }) });

  const foreign = await bob.handle({ method: 'DELETE', path: '/api/workspace/trees/' + treeId, headers: {} });
  assert.equal(foreign.status, 404);
  assert.equal(foreign.body.error.code, 'tree_not_found');

  const aliceAfterForeign = await alice.handle({ method: 'GET', path: '/api/workspace', headers: {} });
  assert.equal(aliceAfterForeign.body.state.trees.length, 1, '남의 삭제 시도로 내 문서가 바뀌었다');

  const own = await alice.handle({ method: 'DELETE', path: '/api/workspace/trees/' + treeId, headers: {} });
  assert.equal(own.status, 200);
  assert.equal(own.body.deleted, true);
  const aliceAfter = await alice.handle({ method: 'GET', path: '/api/workspace', headers: {} });
  assert.equal(aliceAfter.body.state.trees.length, 0);
  const bobAfter = await bob.handle({ method: 'GET', path: '/api/workspace', headers: {} });
  assert.equal(bobAfter.body.state.trees.length, 1, '다른 사용자의 문서가 지워졌다');
});
