import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
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
import { createTrustedAccountDeleteHandler, createSharedAccountDeletionWorkflow } from '../server/shared-account-deletion.js';

const PRODUCT = 'lovetree-4-0';
const PRODUCT_MISMATCH = 'other-product';
const ORIGIN = 'https://lovetree.test';
const USER = 'sub_tester0001';
const OTHER = 'sub_other00002';
const ADMIN = 'sub_admin00003';
const CLOCK = '2026-11-03T10:00:00.000Z';
const PHRASE = '탈퇴합니다';

const base = { subject: '윤슬', note: '남기고 싶은 마음', emotion: '설렘', date: '2026-11-03', url: '' };

function seedAll(repo) {
  for (const entry of ACCOUNT_USER_TABLES) {
    repo.seed(entry.table, { productId: PRODUCT, subjects: [USER], note: 'user' });
    repo.seed(entry.table, { productId: PRODUCT, subjects: [OTHER], note: 'other' });
  }
}

function build({ verified = { productId: PRODUCT, subjectId: USER }, repo = createMemoryAccountRepo(), workspaceRepo = createMemoryWorkspaceRepo(), admin = null, mediaStore = null, accountDeleteWorkflow = null, accountDeleteAuthenticate = null, allowedOrigins = [ORIGIN] } = {}) {
  const service = createWorkspaceService({ repo: workspaceRepo, productId: PRODUCT });
  const account = createAccountService({ repo, productId: PRODUCT, admin, mediaStore, now: () => new Date(CLOCK) });
  const authenticate = async () => verified;
  const handle = createApiHandler({ authenticate, accountDeleteAuthenticate, accountDeleteWorkflow, service, productId: PRODUCT, admin, account, allowedOrigins });
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

  const response = await post(handle, { confirm: PHRASE });
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
  const unauth = await post(anonymous.handle, { confirm: PHRASE });
  assert.equal(unauth.status, 401);

  const { handle } = build({ repo });
  const before = JSON.stringify([...repo.snapshot().tables]);
  const wrongOrigin = await post(handle, { confirm: PHRASE }, { origin: 'https://evil.test' });
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

  const response = await post(handle, { confirm: PHRASE });
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

  await post(build({ repo }).handle, { confirm: PHRASE });

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

  const response = await post(handle, { confirm: PHRASE });
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'account_delete_admin_blocked');
  assert.equal(JSON.stringify([...repo.snapshot().tables]), before);
});

test('이메일을 아는 배포에서는 이메일이 확인 값이 되고 고정 문구는 거부된다', async () => {
  const repo = createMemoryAccountRepo();
  seedAll(repo);
  const { handle } = build({ repo, verified: { productId: PRODUCT, subjectId: USER, email: 'Owner@Example.test' } });

  const byPhrase = await post(handle, { confirm: PHRASE });
  assert.equal(byPhrase.status, 400);

  const described = await getAccount(handle);
  assert.equal(described.body.confirmKind, 'email');
  assert.equal(described.body.email, 'Owner@Example.test');
  assert.equal('subject' in described.body, false);

  // 이메일은 대소문자와 앞뒤 공백 차이만 인정한다.
  const byEmail = await post(handle, { confirm: '  owner@example.test ' });
  assert.equal(byEmail.status, 200);
});

test('이메일 없는 토큰은 "탈퇴합니다"가 정확히 일치할 때만 탈퇴한다', async () => {
  const repo = createMemoryAccountRepo();
  seedAll(repo);
  const { handle } = build({ repo });

  const described = await getAccount(handle);
  assert.equal(described.body.confirmKind, 'phrase');
  assert.equal('email' in described.body, false);

  for (const wrong of ['탈퇴', '탈퇴합니다.', '탈퇴 합니다', USER, '']) {
    const refused = await post(handle, { confirm: wrong });
    assert.equal(refused.status, 400, JSON.stringify(wrong));
    assert.equal(refused.body.error.code, 'account_delete_confirm_mismatch');
  }
  assert.equal(await repo.isDeleted({ productId: PRODUCT, subjectHash: subjectHash(USER) }), false, '거부된 시도가 탈퇴 기록을 남겼다');
  assert.equal(repo.rowCount('lovetree_workspaces', USER), 1, '거부된 시도가 데이터를 지웠다');

  const ok = await post(handle, { confirm: PHRASE });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.deleted, true);
  assert.equal(repo.rowCount('lovetree_workspaces', USER), 0);
  assert.equal(repo.rowCount('lovetree_workspaces', OTHER), 1);
});

test('저장된 이메일이 확인 값이 되고, 삭제하면 함께 지워진다', async () => {
  const repo = createMemoryAccountRepo();
  seedAll(repo);
  await repo.upsertEmail({ productId: PRODUCT, subjectId: USER, email: 'Owner@Example.test' });
  const { handle } = build({ repo, verified: { productId: PRODUCT, subjectId: USER } });

  const described = await getAccount(handle);
  assert.equal(described.status, 200);
  assert.equal(described.body.confirmKind, 'email');
  assert.equal(described.body.email, 'Owner@Example.test');
  assert.equal('subject' in described.body, false);

  // 대소문자·앞뒤 공백 차이만 인정한다.
  const ok = await post(handle, { confirm: '  owner@example.TEST ' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.deleted, true);
  assert.equal(await repo.emailFor({ productId: PRODUCT, subjectId: USER }), null, '삭제 시 저장된 이메일도 지운다');
});

test('GET /api/account는 확인 방식만 알려 주고 사용자 식별자를 내보내지 않는다', async () => {
  const { handle } = build({});
  const described = await getAccount(handle);
  assert.equal(described.status, 200);
  assert.equal(described.body.confirmKind, 'phrase');
  assert.equal('subject' in described.body, false);
  assert.equal('email' in described.body, false);
  assert.equal(JSON.stringify(described.body).includes(USER), false, '응답에 subject 값이 실렸다');
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


const RPC_SECRET = 'lovetree-account-deletion-test-secret-value-32';
const IDENTITY_SECRET = 'control-plane-ingress-test-secret-value-32';
function signedIncomingDelete(
  subjectId = USER,
  productId = PRODUCT,
  serviceId = randomUUID(),
  at = Math.floor(Date.parse(CLOCK) / 1000)
) {
  const path = '/internal/account/delete';
  const body = Buffer.from(JSON.stringify({ canonical_subject_id: subjectId, product_id: productId }));
  const canonical = Buffer.concat([
    Buffer.from('v2'), Buffer.from([10]), Buffer.from('POST'), Buffer.from([10]),
    Buffer.from(path), Buffer.from([10]), Buffer.from(String(at)), Buffer.from([10]),
    Buffer.from(serviceId), Buffer.from([10]), body
  ]);
  const proof = 'v2=' + createHmac('sha256', RPC_SECRET).update(canonical).digest('hex');
  return {
    method: 'POST',
    path,
    headers: {
      'content-type': 'application/json',
      'x-padiem-service-at': String(at),
      'x-padiem-service-id': serviceId,
      'x-padiem-service-proof': proof
    },
    body: body.toString('utf8')
  };
}

test('signed internal delete removes only LoveTree data, is idempotent, and rejects replay', async () => {
  const repo = createMemoryAccountRepo();
  seedAll(repo);
  const account = createAccountService({ repo, productId: PRODUCT, now: () => new Date(CLOCK) });
  const claimed = new Set();
  const handler = createTrustedAccountDeleteHandler({
    account, productId: PRODUCT, secret: RPC_SECRET,
    claimServiceRequest: async ({ serviceId }) => {
      if (claimed.has(serviceId)) return false;
      claimed.add(serviceId);
      return true;
    },
    now: () => Math.floor(Date.parse(CLOCK) / 1000)
  });
  const request = signedIncomingDelete();
  const response = await handler(request);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true, deleted: true });
  assert.equal(repo.rowCount('lovetree_workspaces', USER), 0);
  assert.equal(repo.rowCount('lovetree_workspaces', OTHER), 1);
  assert.equal((await handler(request)).status, 409);
  assert.equal(claimed.size, 1);
});

test('signed internal delete refuses invalid or stale proof and LoveTree admins before touching data', async () => {
  const repo = createMemoryAccountRepo();
  seedAll(repo);
  const admin = { roleFor: async principal => principal.subjectId === USER ? 'admin' : null };
  const account = createAccountService({ repo, productId: PRODUCT, admin });
  let claims = 0;
  const handler = createTrustedAccountDeleteHandler({
    account, productId: PRODUCT, secret: RPC_SECRET,
    claimServiceRequest: async () => { claims++; return true; },
    now: () => Math.floor(Date.parse(CLOCK) / 1000)
  });
  const invalid = signedIncomingDelete();
  invalid.headers['x-padiem-service-proof'] = 'v2=' + '0'.repeat(64);
  assert.equal((await handler(invalid)).status, 401);
  const stale = signedIncomingDelete(USER, PRODUCT, randomUUID(), Math.floor(Date.parse(CLOCK) / 1000) - 301);
  assert.equal((await handler(stale)).status, 401);
  assert.equal(claims, 0, 'invalid signatures and stale timestamps must not claim replay IDs');
  assert.equal((await handler(signedIncomingDelete())).status, 403);
  assert.equal(claims, 1);
  assert.equal(repo.rowCount('lovetree_workspaces', USER), 1);
});

function verifyOutboundSignature(url, init, secret) {
  const path = new URL(url).pathname;
  const at = init.headers['x-padiem-service-at'];
  const serviceId = init.headers['x-padiem-service-id'];
  const body = Buffer.from(init.body);
  const canonical = Buffer.concat([
    Buffer.from('v2'), Buffer.from([10]), Buffer.from('POST'), Buffer.from([10]),
    Buffer.from(path), Buffer.from([10]), Buffer.from(at), Buffer.from([10]),
    Buffer.from(serviceId), Buffer.from([10]), body
  ]);
  assert.equal(init.headers['x-padiem-service-proof'], 'v2=' + createHmac('sha256', secret).update(canonical).digest('hex'));
  return JSON.parse(body.toString('utf8'));
}

test('service unlink keeps other links; last-link unlink revokes Auth first and only then removes the common link', async () => {
  const calls = [];
  const workflow = createSharedAccountDeletionWorkflow({
    productId: PRODUCT,
    identityRpcUrl: 'https://identity.example',
    identityRpcSecret: IDENTITY_SECRET,
    accountDeleteRpcSecret: RPC_SECRET,
    now: () => Math.floor(Date.parse(CLOCK) / 1000),
    fetcher: async (url, init) => {
      const path = new URL(url).pathname;
      const secret = path.startsWith('/internal/rpc/') ? IDENTITY_SECRET : RPC_SECRET;
      const payload = verifyOutboundSignature(url, init, secret);
      calls.push({ path, payload });
      if (path.endsWith('/list_active_product_links_for_subject')) {
        return Response.json({ ok: true, links: [
          { product_id: PRODUCT, product_user_id: 'usr_lovetree', state: 'active' },
          { product_id: 'b62', product_user_id: 'usr_chat', state: 'active' }
        ] });
      }
      if (path.endsWith('/remove_product_link')) {
        return Response.json({ ok: true, removed: true, remaining_links: 1, common_account_deleted: false, revoked_sessions: 2, already_deleted: false });
      }
      throw new Error('unexpected endpoint');
    }
  });
  const plan = await workflow.prepare({ subjectId: USER }, { alreadyDeleted: false });
  assert.equal(plan.lastLink, false);
  const result = await workflow.complete({ subjectId: USER }, plan);
  assert.deepEqual(result, { commonAccountDeleted: false });
  assert.deepEqual(calls.map(x => x.path), [
    '/internal/rpc/list_active_product_links_for_subject',
    '/internal/rpc/remove_product_link'
  ]);

  calls.length = 0;
  const lastLinkWorkflow = createSharedAccountDeletionWorkflow({
    productId: PRODUCT,
    identityRpcUrl: 'https://identity.example',
    identityRpcSecret: IDENTITY_SECRET,
    accountDeleteRpcSecret: RPC_SECRET,
    now: () => Math.floor(Date.parse(CLOCK) / 1000),
    fetcher: async (url, init) => {
      const path = new URL(url).pathname;
      const secret = path.startsWith('/internal/rpc/') ? IDENTITY_SECRET : RPC_SECRET;
      const payload = verifyOutboundSignature(url, init, secret);
      calls.push({ path, payload });
      if (path.endsWith('/list_active_product_links_for_subject')) {
        return Response.json({ ok: true, links: [{ product_id: PRODUCT, product_user_id: 'usr_lovetree', state: 'active' }] });
      }
      if (path === '/internal/account-delete/prepare') return Response.json({ ok: true, prepared: true, revoked_sessions: 4 });
      if (path.endsWith('/remove_product_link')) {
        return Response.json({ ok: true, removed: true, remaining_links: 0, common_account_deleted: true, revoked_sessions: 3, already_deleted: false });
      }
      if (path === '/internal/account-delete/complete') return Response.json({ ok: true, deleted: true });
      throw new Error('unexpected endpoint');
    }
  });
  const lastPlan = await lastLinkWorkflow.prepare({ subjectId: USER }, { alreadyDeleted: false });
  assert.equal(lastPlan.lastLink, true);
  assert.deepEqual(await lastLinkWorkflow.complete({ subjectId: USER }, lastPlan), { commonAccountDeleted: true });
  assert.deepEqual(calls.map(x => x.path), [
    '/internal/rpc/list_active_product_links_for_subject',
    '/internal/account-delete/prepare',
    '/internal/rpc/remove_product_link',
    '/internal/account-delete/complete'
  ]);
  assert.equal(calls[1].payload.account_id, USER);
  assert.match(calls[1].payload.operation_id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(calls[3].payload, calls[1].payload);
});

test('failed shared unlink leaves the common link untouched and a deleted product can retry', async () => {
  const repo = createMemoryAccountRepo();
  seedAll(repo);
  let completions = 0;
  const workflow = {
    async prepare(_verified, { alreadyDeleted }) { return { alreadyDeleted }; },
    async complete(_verified, plan) {
      completions++;
      if (completions === 1) throw new ApiError(503, 'shared_account_unavailable', 'retry');
      return { commonAccountDeleted: true };
    }
  };
  const verified = { productId: PRODUCT, subjectId: USER };
  const rawAuth = async () => verified;
  const guard = createDeletedAccountGuard({
    authenticate: rawAuth,
    account: createAccountService({ repo, productId: PRODUCT }),
    productId: PRODUCT
  });
  const service = createWorkspaceService({ repo: createMemoryWorkspaceRepo(), productId: PRODUCT });
  const account = createAccountService({ repo, productId: PRODUCT, now: () => new Date(CLOCK) });
  const handle = createApiHandler({
    authenticate: guard,
    accountDeleteAuthenticate: rawAuth,
    accountDeleteWorkflow: workflow,
    service, productId: PRODUCT, account, allowedOrigins: [ORIGIN]
  });
  const first = await post(handle, { confirm: PHRASE });
  assert.equal(first.status, 503);
  assert.equal(first.body.error.code, 'shared_account_unavailable');
  assert.equal(repo.rowCount('lovetree_workspaces', USER), 0);
  await assert.rejects(() => guard({}), error => error.code === 'account_deleted');

  const retry = await post(handle, { confirm: PHRASE });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.commonAccountDeleted, true);
  assert.equal(retry.body.alreadyDeleted, true);
  assert.equal(completions, 2);
});


test('failed last-link unlink aborts the Auth lock and keeps the common link retryable', async () => {
  const calls = [];
  const workflow = createSharedAccountDeletionWorkflow({
    productId: PRODUCT,
    identityRpcUrl: 'https://identity.example',
    identityRpcSecret: IDENTITY_SECRET,
    accountDeleteRpcSecret: RPC_SECRET,
    now: () => Math.floor(Date.parse(CLOCK) / 1000),
    fetcher: async (url, init) => {
      const path = new URL(url).pathname;
      const secret = path.startsWith('/internal/rpc/') ? IDENTITY_SECRET : RPC_SECRET;
      const payload = verifyOutboundSignature(url, init, secret);
      calls.push({ path, payload });
      if (path.endsWith('/list_active_product_links_for_subject')) {
        return Response.json({ ok: true, links: [{ product_id: PRODUCT, product_user_id: 'usr_lovetree', state: 'active' }] });
      }
      if (path === '/internal/account-delete/prepare') {
        return Response.json({ ok: true, prepared: true, revoked_sessions: 1 });
      }
      if (path.endsWith('/remove_product_link')) {
        return Response.json({ ok: false }, { status: 503 });
      }
      if (path === '/internal/account-delete/abort') {
        return Response.json({ ok: true, aborted: true });
      }
      throw new Error('unexpected endpoint');
    }
  });
  const plan = await workflow.prepare({ subjectId: USER }, { alreadyDeleted: false });
  await assert.rejects(() => workflow.complete({ subjectId: USER }, plan), { code: 'shared_account_unavailable' });
  assert.deepEqual(calls.map(x => x.path), [
    '/internal/rpc/list_active_product_links_for_subject',
    '/internal/account-delete/prepare',
    '/internal/rpc/remove_product_link',
    '/internal/account-delete/abort'
  ]);
  assert.deepEqual(calls[3].payload, calls[1].payload);
});
