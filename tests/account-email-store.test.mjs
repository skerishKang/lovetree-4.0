import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountEmailStore } from '../server/account-email-store.js';
import { createMemoryAccountRepo } from '../server/testing/memory-account-repo.js';

const PRODUCT = 'lovetree-4-0';
const PATH = '/internal/account/email';

function build({ repo = createMemoryAccountRepo(), verify = async () => ({ accountId: 'sub_a' }) } = {}) {
  const handler = createAccountEmailStore({ repo, productId: PRODUCT, verify });
  const post = (body, authorization) => handler({
    method: 'POST',
    path: PATH,
    headers: authorization ? { authorization } : {},
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
  return { handler, repo, post };
}

test('a bearer token writes email for its own account and next sign-in overwrites', async () => {
  const { post, repo } = build();
  const first = await post({ email: 'Owner@Example.test', canonical_subject_id: 'sub_a' }, 'Bearer tok');
  assert.equal(first.status, 200);
  assert.equal(await repo.emailFor({ productId: PRODUCT, subjectId: 'sub_a' }), 'Owner@Example.test');

  const second = await post({ email: 'new@Example.test' }, 'Bearer tok');
  assert.equal(second.status, 200);
  assert.equal(await repo.emailFor({ productId: PRODUCT, subjectId: 'sub_a' }), 'new@Example.test');
  assert.equal(await repo.emailFor({ productId: PRODUCT, subjectId: 'sub_other' }), null);
});

test('a token cannot write a subject it did not authenticate; naming the body subject is optional', async () => {
  const rows = [];
  const { post } = build({
    repo: { upsertEmail: async (row) => rows.push(row) },
    verify: async () => ({ subject: 'sub_a' })
  });

  const wrongName = await post({ email: 'a@b.test', canonical_subject_id: 'sub_b' }, 'Bearer tok');
  assert.equal(wrongName.status, 400);
  assert.equal(wrongName.body.error.code, 'subject_mismatch');

  const ok = await post({ email: 'a@b.test' }, 'Bearer tok');
  assert.equal(ok.status, 200);
  assert.equal(rows.length, 1);
  const { at, ...fields } = rows[0];
  assert.deepEqual(fields, { productId: PRODUCT, subjectId: 'sub_a', email: 'a@b.test' });
  assert.ok(at);
});

test('bearer problems yield 401, key lookup trouble yields 503', async () => {
  const { post } = build({ verify: async () => { throw new Error('invalid_signature'); } });
  assert.equal((await post({ email: 'a@b.test' })).status, 401);
  assert.equal((await post({ email: 'a@b.test' }, 'Bearer tok')).status, 401);

  const { handler } = build({ verify: async () => { throw new Error('jwks_unavailable'); } });
  const res = await handler({ method: 'POST', path: PATH, headers: { authorization: 'Bearer tok' }, body: '{"email":"a@b.test"}' });
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'authentication_unavailable');

  const empty = build({
    verify: async (token) => {
      if (typeof token !== 'string' || token.trim() === '') throw new Error('invalid_token');
      return { accountId: 'sub_a' };
    }
  });
  assert.equal((await empty.post({ email: 'a@b.test' }, 'Bearer   ')).status, 401);
});

test('body and route problems are answered before anything is written', async () => {
  const rows = [];
  const { handler, post } = build({ repo: { upsertEmail: async (row) => rows.push(row) } });

  assert.equal((await post('{oops')).status, 400);
  assert.equal((await post([])).status, 400);
  assert.equal((await post({ email: '', canonical_subject_id: 'sub_a' }, 'Bearer tok')).status, 400);
  assert.equal((await post({ email: 'x'.repeat(321), canonical_subject_id: 'sub_a' }, 'Bearer tok')).status, 400);
  assert.equal((await post({ email: 'a\nb@c.test', canonical_subject_id: 'sub_a' }, 'Bearer tok')).status, 400);
  assert.equal((await post({ email: 'a@b.test' }, 'Basic abc')).status, 401);
  assert.equal((await handler({ method: 'PUT', path: PATH, headers: { authorization: 'Bearer tok' }, body: '{}' })).status, 405);
  assert.equal((await handler({ method: 'POST', path: `${PATH}/extra`, headers: { authorization: 'Bearer tok' }, body: '{}' })).status, 404);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(rows, []);
});

test('a repository failure is 503', async () => {
  const { post } = build({ repo: { upsertEmail: async () => { throw new Error('db down'); } } });
  const res = await post({ email: 'a@b.test' }, 'Bearer tok');
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'account_email_unavailable');
});

test('memory account repo keeps the first sign-in time as created_at and only moves updated_at afterwards', async () => {
  const repo = createMemoryAccountRepo();
  assert.deepEqual(await repo.accounts({ productId: PRODUCT }), []);
  await repo.upsertEmail({ productId: PRODUCT, subjectId: 'sub_a', email: 'First@Example.test' });
  const [first] = await repo.accounts({ productId: PRODUCT });
  assert.equal(first.subjectId, 'sub_a');
  assert.ok(first.createdAt && first.updatedAt, '첫 로그인에서 createdAt·updatedAt 이 찍힌다');

  await repo.upsertEmail({ productId: PRODUCT, subjectId: 'sub_a', email: 'second@example.test' });
  const [second] = await repo.accounts({ productId: PRODUCT });
  assert.equal(await repo.emailFor({ productId: PRODUCT, subjectId: 'sub_a' }), 'second@example.test');
  assert.equal(second.createdAt, first.createdAt, 'createdAt(가입일)은 두 번째 로그인에서도 그대로다');
  assert.ok(second.updatedAt > first.updatedAt, 'updatedAt 은 두 번째 로그인 시각으로 바뀐다');
  assert.equal(await repo.accountCreatedAt({ productId: PRODUCT, subjectId: 'sub_a' }), first.createdAt);
  // 다른 제품의 계정은 섞이지 않는다.
  await repo.upsertEmail({ productId: 'other-product', subjectId: 'sub_b', email: 'b@example.test' });
  assert.deepEqual((await repo.accounts({ productId: PRODUCT })).map((row) => row.subjectId), ['sub_a']);
});
