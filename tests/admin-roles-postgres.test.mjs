import test from 'node:test';
import assert from 'node:assert/strict';
import { applySchema } from '../server/db/postgres.js';
import { createAdminRoleRepo } from '../server/db/admin-roles-postgres.js';
import { createAdminRoleService, ROLE_ADMIN } from '../server/admin-roles.js';
import { assertIsolatedTestDatabase } from '../server/testing/isolated-test-database.js';

/**
 * 제품 역할의 실제 PostgreSQL 검증(#67). `server/testing/model-admin-role-store.js`로
 * 메모리 모형 시험을 통과시킨 것과 **다른 자리**다 — 이 파일이 스킵된 채로 CI가 통과하면
 * PostgreSQL 역할 검증은 수행되지 않은 것이다.
 */
const DATABASE_URL = process.env.LOVETREE_TEST_DATABASE_URL ?? '';
const skip = DATABASE_URL ? false : '격리된 PostgreSQL 테스트 DB가 없습니다(LOVETREE_TEST_DATABASE_URL 설정 필요). 이 파일의 검증은 미수행입니다.';

const suffix = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const ADMIN = `sub_${'a'.repeat(32)}`;
const MEMBER = `sub_${'b'.repeat(32)}`;

async function withRepo(run) {
  assertIsolatedTestDatabase(DATABASE_URL);
  const pg = await import('pg');
  const { Pool } = pg.default ?? pg;
  const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });
  try {
    await applySchema(pool);
    await run(pool);
  } finally {
    await pool.end();
  }
}

test('부여·조회·회수와 감사 이력이 실제 테이블에서 동작한다', { skip }, async () => {
  await withRepo(async (pool) => {
    const productId = `lovetree-admin-test-${suffix()}`;
    const admin = createAdminRoleService({ store: createAdminRoleRepo(pool), productId });
    const actor = { productId, subjectId: ADMIN };
    const target = { productId, subjectId: MEMBER };

    await pool.query('INSERT INTO lovetree_product_roles (product_id, subject_id, role) VALUES ($1, $2, $3)', [productId, ADMIN, ROLE_ADMIN]);
    assert.equal(await admin.roleFor(actor), ROLE_ADMIN);
    assert.equal(await admin.roleFor(target), null);

    const assigned = await admin.assign({ actorPrincipal: actor, targetSubjectId: MEMBER, reason: '운영 절차' });
    assert.equal(assigned.assignment.role, ROLE_ADMIN);
    assert.equal(assigned.assignment.previousRole, null);
    assert.equal(await admin.roleFor(target), ROLE_ADMIN);

    const again = await admin.assign({ actorPrincipal: actor, targetSubjectId: MEMBER });
    assert.equal(again.assignment.previousRole, ROLE_ADMIN, '재부여는 이전 값을 남긴다');

    const revoked = await admin.revoke({ actorPrincipal: actor, targetSubjectId: MEMBER });
    assert.equal(revoked.revocation.revoked, true);
    assert.equal(revoked.revocation.previousRole, ROLE_ADMIN);
    assert.equal(await admin.roleFor(target), null);

    const history = await admin.history({ limit: 10 });
    assert.deepEqual(history.map((row) => row.action), ['revoke', 'assign', 'assign', 'assign']);
    assert.deepEqual(history.map((row) => row.previousRole), ['admin', 'admin', null, null]);
    assert.equal(history[0].subjectId, MEMBER);
    assert.deepEqual(await admin.list(), [], '회수하면 등록부에서 사라진다');
  });
});

test('역할은 제품별로 갈리고, 행이 다른 주체를 가리키면 그 행은 역할을 주지 않는다', { skip }, async () => {
  await withRepo(async (pool) => {
    const productId = `lovetree-admin-test-${suffix()}`;
    const other = `lovetree-admin-test-${suffix()}`;
    await pool.query('INSERT INTO lovetree_product_roles (product_id, subject_id, role) VALUES ($1, $2, $3)', [productId, ADMIN, ROLE_ADMIN]);

    const here = createAdminRoleService({ store: createAdminRoleRepo(pool), productId });
    const there = createAdminRoleService({ store: createAdminRoleRepo(pool), productId: other });
    assert.equal(await here.roleFor({ productId, subjectId: ADMIN }), ROLE_ADMIN);
    assert.equal(await there.roleFor({ productId: other, subjectId: ADMIN }), null, '다른 제품에 같은 subject로 역할이 전파되지 않는다');
    assert.deepEqual(await there.list(), []);

    // 변조 1: 행을 다른 주체로 옮기면(승인 없는 직접 편집) 원래 주체는 역할을 잃고 새 주체가 얻는다.
    await pool.query('UPDATE lovetree_product_roles SET subject_id = $2 WHERE product_id = $1', [productId, MEMBER]);
    assert.equal(await here.roleFor({ productId, subjectId: ADMIN }), null);
    assert.equal(await here.roleFor({ productId, subjectId: MEMBER }), ROLE_ADMIN);

    // 변조 2: 저장소가 남의 행을 물어와도 서비스는 역할을 주지 않는다(읽을 때마다 재견).
    const lying = createAdminRoleService({
      store: { async roleFor() { return { productId, subjectId: MEMBER, role: ROLE_ADMIN }; } },
      productId
    });
    assert.equal(await lying.roleFor({ productId, subjectId: ADMIN }), null);
  });
});

test('저장 장애와 계약 밖 값은 열린 방향으로 새지 않는다', { skip }, async () => {
  await withRepo(async (pool) => {
    const productId = `lovetree-admin-test-${suffix()}`;
    const admin = createAdminRoleService({ store: createAdminRoleRepo(pool), productId });
    await assert.rejects(
      () => pool.query('INSERT INTO lovetree_product_roles (product_id, subject_id, role) VALUES ($1, $2, $3)', [productId, ADMIN, 'OWNER']),
      (error) => error.code === '23514',
      'role CHECK 밖의 값은 DB가 거둔다'
    );
    await assert.rejects(
      () => admin.assign({ actorPrincipal: { productId, subjectId: ADMIN }, targetSubjectId: 'usr_이메일주체' }),
      (error) => error.status === 400 && error.code === 'invalid_admin_subject'
    );
    const broken = createAdminRoleService({ store: { async roleFor() { throw new Error('접속 실패'); } }, productId });
    assert.equal(await broken.roleFor({ productId, subjectId: ADMIN }), null, '망가진 저장소에서는 역할 없음');
  });
});
