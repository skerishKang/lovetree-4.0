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
