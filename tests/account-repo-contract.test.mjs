import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountRepo } from '../server/db/account-postgres.js';
import { createAccountService } from '../server/account-service.js';
import { createAccountEmailStore } from '../server/account-email-store.js';

const PRODUCT = 'lovetree-4-0';
const PATH = '/internal/account/email';

function stubPool({ emailRows = [] } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('FROM lovetree_account_emails')) {
        return { rowCount: emailRows.length, rows: emailRows.map((email) => ({ email })) };
      }
      return { rowCount: 0, rows: [] };
    },
    async connect() {
      return {
        async query() { return { rowCount: 0, rows: [] }; },
        release() {}
      };
    }
  };
}

test('postgres account repo exposes every function account-service and account-email-store require', () => {
  const repo = createAccountRepo(stubPool());
  for (const name of ['isDeleted', 'deleteAll', 'emailFor', 'upsertEmail']) {
    assert.equal(typeof repo[name], 'function', `createAccountRepo 반환값에 ${name} 이 없다`);
  }
  // 서버는 부팅 때 이 둘을 만든다. 함수가 빠지면 배포 뒤가 아니라 여기서 먼저 실패해야 한다.
  assert.doesNotThrow(() => createAccountService({ repo, productId: PRODUCT }));
  assert.doesNotThrow(() => createAccountEmailStore({ repo, productId: PRODUCT, verify: async () => ({ accountId: 'sub_a' }) }));
});

test('postgres repo reads and upserts email through the pool', async () => {
  const empty = createAccountRepo(stubPool());
  assert.equal(await empty.emailFor({ productId: PRODUCT, subjectId: 'sub_a' }), null);

  const pool = stubPool({ emailRows: ['Owner@Example.test'] });
  const repo = createAccountRepo(pool);
  assert.equal(await repo.emailFor({ productId: PRODUCT, subjectId: 'sub_a' }), 'Owner@Example.test');
  assert.deepEqual(pool.calls.at(-1).params, [PRODUCT, 'sub_a']);

  const before = pool.calls.length;
  await repo.upsertEmail({ productId: PRODUCT, subjectId: 'sub_a', email: ' New@Example.test ' });
  assert.equal(pool.calls.length, before + 1);
  assert.match(pool.calls.at(-1).sql, /ON CONFLICT \(product_id, subject_id\) DO UPDATE/);
  assert.deepEqual(pool.calls.at(-1).params, [PRODUCT, 'sub_a', 'New@Example.test']);

  const skipped = pool.calls.length;
  await repo.upsertEmail({ productId: PRODUCT, subjectId: 'sub_a', email: '' });
  await repo.upsertEmail({ productId: '', subjectId: 'sub_a', email: 'a@b.test' });
  assert.equal(pool.calls.length, skipped, '잘못된 입력은 저장소까지 내려가지 않는다');
});

test('the internal email endpoint writes through the real postgres repo', async () => {
  const pool = stubPool();
  const handler = createAccountEmailStore({
    repo: createAccountRepo(pool),
    productId: PRODUCT,
    verify: async () => ({ accountId: 'sub_a' })
  });
  const response = await handler({
    method: 'POST',
    path: PATH,
    headers: { authorization: 'Bearer tok' },
    body: JSON.stringify({ email: 'Owner@Example.test', canonical_subject_id: 'sub_a' })
  });
  assert.equal(response.status, 200);
  const writes = pool.calls.filter((call) => call.sql.includes('INSERT INTO lovetree_account_emails'));
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].params, [PRODUCT, 'sub_a', 'Owner@Example.test']);
});
