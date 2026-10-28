import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiHandler } from '../server/http.js';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { createModelAdminRoleStore } from '../server/testing/model-admin-role-store.js';
import { createAdminRoleService, ROLE_ADMIN } from '../server/admin-roles.js';
import { createPadiemAuthorityAuth } from '../server/padiem-authority-auth.js';
import { ApiError } from '../server/errors.js';

const PRODUCT = 'lovetree-4-0';
const ADMIN_SUBJECT = `sub_${'a'.repeat(32)}`;
const MEMBER_SUBJECT = `sub_${'b'.repeat(32)}`;
const FUTURE = '2999-01-01T00:00:00.000Z';

// 세션 토큰 → 확인된 신원. 만료·폐기는 권위가 닫는 방향으로만 답한다(중계 클라이언트와 같은 코드를 던진다).
function authorityStub(sessions) {
  return {
    async resolveIdentity({ sessionId }) {
      const row = sessions.get(sessionId);
      if (!row || row.state === 'revoked') throw new ApiError(401, 'unauthenticated', '로그인 확인을 하지 못했어요.');
      return { sessionId, productId: row.productId, subjectId: row.subjectId, expiresAt: row.expiresAt };
    }
  };
}

function build({ sessions = new Map(), roleStore = createModelAdminRoleStore(), withAdmin = true } = {}) {
  const credential = {
    async verify(request) {
      const cookie = String(request?.headers?.cookie ?? '');
      const match = /(?:^|;\s*)lovetree_session=([^;]+)/.exec(cookie);
      return match ? { sessionId: match[1] } : null;
    }
  };
  const authenticate = createPadiemAuthorityAuth({ credential, authority: authorityStub(sessions), productId: PRODUCT });
  const admin = withAdmin ? createAdminRoleService({ store: roleStore, productId: PRODUCT }) : null;
  const repo = createMemoryWorkspaceRepo();
  const handle = createApiHandler({ authenticate, service: createWorkspaceService({ repo, productId: PRODUCT }), productId: PRODUCT, admin });
  const as = (sessionId) => ({ headers: { cookie: `lovetree_session=${sessionId}` } });
  return { handle, admin, roleStore, as };
}

const ok = (response) => ({ status: response.status, body: response.body });

test('관리자 역할은 서버가 확인한 이 제품의 주체에만 붙고, 그 주체의 요청만 허용으로 읽힌다', async () => {
  const sessions = new Map([['sess_admin', { productId: PRODUCT, subjectId: ADMIN_SUBJECT, state: 'active', expiresAt: FUTURE }]]);
  const made = build({ sessions });
  await made.roleStore.assign({ productId: PRODUCT, subjectId: ADMIN_SUBJECT, role: ROLE_ADMIN, grantedBy: null });

  const session = ok(await made.handle({ method: 'GET', path: '/api/admin/session', ...made.as('sess_admin') }));
  assert.equal(session.status, 200);
  assert.deepEqual(session.body.admin, true);
  assert.equal(session.body.role, ROLE_ADMIN);
  assert.equal(session.body.capabilities.admin_entry, true);

  const registry = ok(await made.handle({ method: 'GET', path: '/api/admin/roles', ...made.as('sess_admin') }));
  assert.equal(registry.status, 200);
  assert.deepEqual(registry.body.registry.map((row) => row.subjectId), [ADMIN_SUBJECT]);
});

test('일반 사용자는 진입 화면에서는 역할 없음으로 읽고, 관리자 자리에서는 서버에서 거부된다', async () => {
  const sessions = new Map([['sess_member', { productId: PRODUCT, subjectId: MEMBER_SUBJECT, state: 'active', expiresAt: FUTURE }]]);
  const made = build({ sessions });

  const session = ok(await made.handle({ method: 'GET', path: '/api/admin/session', ...made.as('sess_member') }));
  assert.equal(session.status, 200);
  assert.equal(session.body.admin, false);
  assert.equal(session.body.role, null);
  assert.equal(session.body.capabilities.product_roles_read, false);

  const refused = ok(await made.handle({ method: 'GET', path: '/api/admin/roles', ...made.as('sess_member') }));
  assert.equal(refused.status, 403);
  assert.equal(refused.body.error.code, 'admin_forbidden');
});

test('미인증·만료·폐기 세션은 관리자 자리를 직접 호출할 수 없다', async () => {
  const sessions = new Map([
    ['sess_expired', { productId: PRODUCT, subjectId: ADMIN_SUBJECT, state: 'active', expiresAt: '2000-01-01T00:00:00.000Z' }],
    ['sess_revoked', { productId: PRODUCT, subjectId: ADMIN_SUBJECT, state: 'revoked', expiresAt: FUTURE }]
  ]);
  const made = build({ sessions });
  await made.roleStore.assign({ productId: PRODUCT, subjectId: ADMIN_SUBJECT, role: ROLE_ADMIN, grantedBy: null });

  for (const [label, headers] of [['미인증', { headers: {} }], ['만료', made.as('sess_expired')], ['폐기', made.as('sess_revoked')]]) {
    for (const path of ['/api/admin/session', '/api/admin/roles']) {
      const answer = ok(await made.handle({ method: 'GET', path, ...headers }));
      assert.equal(answer.status, 401, `${label} ${path}`);
      assert.equal(answer.body.error.code, 'unauthenticated', `${label} ${path}`);
    }
  }
});

test('역할 확인 경로가 없으면 관리자 자리는 닫히고 저장은 그대로 돈다', async () => {
  const sessions = new Map([['sess_admin', { productId: PRODUCT, subjectId: ADMIN_SUBJECT, state: 'active', expiresAt: FUTURE }]]);
  const made = build({ sessions, withAdmin: false });
  const closed = ok(await made.handle({ method: 'GET', path: '/api/admin/session', ...made.as('sess_admin') }));
  assert.equal(closed.status, 503);
  assert.equal(closed.body.error.code, 'admin_roles_unavailable');
  const storage = ok(await made.handle({ method: 'GET', path: '/api/workspace', ...made.as('sess_admin') }));
  assert.equal(storage.status, 200, '관리자 미설정이 저장을 막지 않는다');
});

test('다른 제품의 세션과 없는 경로는 관리자 자리에서도 닫힌다', async () => {
  const sessions = new Map([
    ['sess_other', { productId: 'b62', subjectId: ADMIN_SUBJECT, state: 'active', expiresAt: FUTURE }],
    ['sess_admin', { productId: PRODUCT, subjectId: ADMIN_SUBJECT, state: 'active', expiresAt: FUTURE }]
  ]);
  const made = build({ sessions });
  const cross = ok(await made.handle({ method: 'GET', path: '/api/admin/session', ...made.as('sess_other') }));
  assert.equal(cross.status, 401, '권위가 다른 제품 세션을 내보내도 1단계를 통과하지 못한다');
  const crossRoles = ok(await made.handle({ method: 'GET', path: '/api/admin/roles', ...made.as('sess_other') }));
  assert.equal(crossRoles.status, 401);

  const missing = ok(await made.handle({ method: 'GET', path: '/api/admin/unknown', ...made.as('sess_admin') }));
  assert.equal(missing.status, 404, '알 수 없는 경로는 정적 화면으로 흐르지 않는다');
  const wrongMethod = ok(await made.handle({ method: 'POST', path: '/api/admin/roles', ...made.as('sess_admin') }));
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.body.error.code, 'method_not_allowed');
});

test('부여·회수는 이력으로 남고, 행이 고쳐지거나 저장이 망가지면 역할은 사라진다', async () => {
  const store = createModelAdminRoleStore();
  const admin = createAdminRoleService({ store, productId: PRODUCT });
  const actor = { productId: PRODUCT, subjectId: ADMIN_SUBJECT };
  const target = { productId: PRODUCT, subjectId: MEMBER_SUBJECT };
  await store.assign({ productId: PRODUCT, subjectId: ADMIN_SUBJECT, role: ROLE_ADMIN });

  const assigned = await admin.assign({ actorPrincipal: actor, targetSubjectId: MEMBER_SUBJECT });
  assert.equal(assigned.assignment.role, ROLE_ADMIN);
  assert.equal(assigned.assignment.previousRole, null);
  assert.equal(await admin.roleFor(target), ROLE_ADMIN);

  const revoked = await admin.revoke({ actorPrincipal: actor, targetSubjectId: MEMBER_SUBJECT });
  assert.equal(revoked.revocation.previousRole, ROLE_ADMIN);
  assert.equal(await admin.roleFor(target), null);
  assert.deepEqual((await admin.history({ limit: 5 })).map((row) => row.action), ['revoke', 'assign', 'assign']);

  await store.assign({ productId: PRODUCT, subjectId: MEMBER_SUBJECT, role: ROLE_ADMIN });
  store.rows.set(`${PRODUCT}\u0000${MEMBER_SUBJECT}`, { productId: PRODUCT, subjectId: ADMIN_SUBJECT, role: ROLE_ADMIN });
  assert.equal(await admin.roleFor(target), null, '행이 다른 주체를 가리키면 그 행은 역할을 주지 않는다');

  const broken = createAdminRoleService({ store: { async roleFor() { throw new Error('저장 장애'); } }, productId: PRODUCT });
  assert.equal(await broken.roleFor(target), null, '저장이 망가진 자리에서는 역할 없음으로 닫는다');
  assert.deepEqual(await broken.list(), []);
  assert.deepEqual(await broken.history(), []);

  await assert.rejects(() => admin.assign({ actorPrincipal: target, targetSubjectId: MEMBER_SUBJECT }), (error) => error.status === 403 && error.code === 'admin_forbidden');
  await assert.rejects(() => admin.assign({ actorPrincipal: actor, targetSubjectId: 'usr_이메일주체' }), (error) => error.status === 400 && error.code === 'invalid_admin_subject');
  await assert.rejects(() => admin.assign({ actorPrincipal: actor, targetSubjectId: MEMBER_SUBJECT, role: 'OWNER' }), (error) => error.status === 400 && error.code === 'invalid_role');
});
