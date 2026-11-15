import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiHandler } from '../server/http.js';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { createModelAdminRoleStore } from '../server/testing/model-admin-role-store.js';
import { createAdminRoleService, ROLE_ADMIN, ROLE_AI_CUSTOMER, ROLE_TESTER } from '../server/admin-roles.js';
import { parseRoleArgs, emailList, mask } from '../tools/admin-role.mjs';
import { createAdminStatsService } from '../server/admin-stats.js';
import { createMemoryStatsRepo } from '../server/testing/memory-stats-repo.js';
import { createMemoryAccountRepo } from '../server/testing/memory-account-repo.js';
import { createMemoryShareRepo } from '../server/testing/memory-share-repo.js';
import { createMemoryTreeVisibilityRepo } from '../server/testing/memory-tree-visibility-repo.js';
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

function build({
  sessions = new Map(), roleStore = createModelAdminRoleStore(), withAdmin = true,
  shareRepo = null, visibilityRepo = null, statsNow = null
} = {}) {
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
  // #655 2차: 숫자 세기는 실제 저장 경로로 쌓은 메모리 저장소를 그대로 읽는다(숫자를 손으로 넣지 않는다).
  // 계정·새 계정은 로그인 표(memory-account-repo = lovetree_account_emails)의 createdAt(첫 로그인 시각)으로 센다.
  const accountRepo = createMemoryAccountRepo();
  const adminStats = shareRepo
    ? createAdminStatsService({
        repo: createMemoryStatsRepo({ workspaceRepo: repo, shareRepo, accountRepo, roleStore, visibilityRepo }),
        productId: PRODUCT,
        ...(statsNow ? { now: statsNow } : {})
      })
    : null;
  const service = createWorkspaceService({ repo, productId: PRODUCT });
  const handleFor = (statsService) => createApiHandler({ authenticate, service, productId: PRODUCT, admin, adminStats: statsService });
  const handle = handleFor(adminStats);
  const as = (sessionId) => ({ headers: { cookie: `lovetree_session=${sessionId}` } });
  // 숫자 시험용: 저장 경로(문서 쓰기)와 다른 집계 서비스를 끼운 핸들러.
  let writes = 0;
  const writeDoc = (subjectId, doc) => repo.commit({ productId: PRODUCT, subjectId, doc, expectedRevision: 0, clientKey: `stats-${subjectId}-${++writes}`, requestHash: 'a'.repeat(64) });
  return { handle, admin, roleStore, accountRepo, as, writeDoc, handleWithStats: handleFor };
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
  const shape = await made.handle({ method: 'GET', path: '/api/workspace', ...made.as('sess_admin') });
  assert.deepEqual(shape, { status: 200, body: shape.body }, '저장 경로의 응답 모양은 그대로(헤더는 붙인 자리만)');
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

  // #671: 시험 계정 표식 'tester' 도 같은 부여·회수 경로를 쓴다(이력 포함).
  const asTester = await admin.assign({ actorPrincipal: actor, targetSubjectId: MEMBER_SUBJECT, role: ROLE_TESTER, reason: '레인 시험 계정' });
  assert.equal(asTester.assignment.role, ROLE_TESTER);
  assert.equal(asTester.assignment.previousRole, ROLE_ADMIN);
  assert.equal(await admin.roleFor(target), ROLE_TESTER);
  assert.deepEqual((await admin.list()).filter((row) => row.subjectId === MEMBER_SUBJECT).map((row) => row.role), [ROLE_TESTER]);
  await admin.assign({ actorPrincipal: actor, targetSubjectId: MEMBER_SUBJECT, role: ROLE_ADMIN });

  const revoked = await admin.revoke({ actorPrincipal: actor, targetSubjectId: MEMBER_SUBJECT });
  assert.equal(revoked.revocation.previousRole, ROLE_ADMIN);
  assert.equal(await admin.roleFor(target), null);
  // #671 tester 왕복(부여·되돌림)이 더해져 이력은 5줄이다.
  assert.deepEqual((await admin.history({ limit: 5 })).map((row) => row.action), ['revoke', 'assign', 'assign', 'assign', 'assign']);

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

test('운영센터 전체 숫자(#655 2차): 계정·트리·순간·공개·둘러보기를 서버가 세고 실제 사용자와 AI 테스터를 나눈다', async () => {
  const ADMIN2 = `sub_${'a'.repeat(32)}`;
  const REAL_ONE = `sub_${'1'.repeat(32)}`;
  const REAL_TWO = `sub_${'2'.repeat(32)}`;
  const AI_ONE = `sub_${'3'.repeat(32)}`;
  // #671: 레인 시험 계정 표식 tester — '실제 사용자' 숫자에서 갈라 센다.
  const TESTER_ONE = `sub_${'6'.repeat(32)}`;
  const sessions = new Map([
    ['sess_admin', { productId: PRODUCT, subjectId: ADMIN2, state: 'active', expiresAt: FUTURE }],
    ['sess_member', { productId: PRODUCT, subjectId: REAL_ONE, state: 'active', expiresAt: FUTURE }]
  ]);
  const roleStore = createModelAdminRoleStore();
  await roleStore.assign({ productId: PRODUCT, subjectId: ADMIN2, role: ROLE_ADMIN, grantedBy: null });
  await roleStore.assign({ productId: PRODUCT, subjectId: AI_ONE, role: ROLE_AI_CUSTOMER, grantedBy: null });
  await roleStore.assign({ productId: PRODUCT, subjectId: TESTER_ONE, role: ROLE_TESTER, grantedBy: null });
  // 공유 행은 창(7일) 밖인 10-01 에, 고객 글은 창 안인 11-18 에 쌓인다 — '새 계정' 판정을 가른다.
  const shareRepo = createMemoryShareRepo({ now: Date.UTC(2026, 9, 1) });
  const visibilityRepo = createMemoryTreeVisibilityRepo();
  const made = build({ sessions, roleStore, shareRepo, visibilityRepo, statsNow: () => new Date('2026-11-20T00:00:00.000Z') });
  const repos = made;

  // createdAt 을 받아 문서 안 첫 기록 시각을 시험마다 다르게 둔다('새 계정' 판정 근거).
  const tree = (id, moments, createdAt = '2026-10-01T00:00:00.000Z') => ({
    id, subject: '윤슬', title: '나무 ' + id, coverMomentId: '', coverDesign: '', inbox: false,
    createdAt, updatedAt: createdAt,
    moments: moments.map((createdAt, index) => ({
      id: `${id}-m${index}`, parentId: null, links: [], title: '순간', note: '', emotion: '설렘',
      date: '2026-10-01', url: '', createdAt
    }))
  });
  const write = (subjectId, trees) => repos.writeDoc(subjectId, { version: 1, trees });

  // 로그인한 적 있는 계정 = 가입일(첫 로그인 시각)이 lovetree_account_emails.created_at 에 남는다.
  // 순간을 하나도 안 담은 NEW_EMPTY 도 로그인했으면 계정이고, 가입일이 창 안이라 '새 계정'이다.
  const NEW_EMPTY = `sub_${'5'.repeat(32)}`;
  const login = (subjectId, createdAt) => repos.accountRepo.upsertEmail({ productId: PRODUCT, subjectId, email: `${subjectId}@example.test`, at: createdAt });
  await login(ADMIN2, '2026-10-01T00:00:00.000Z');
  await login(REAL_ONE, '2026-10-01T00:00:00.000Z');
  await login(AI_ONE, '2026-10-04T00:00:00.000Z');
  await login(NEW_EMPTY, '2026-11-19T00:00:00.000Z');
  await login(`sub_${'4'.repeat(32)}`, '2026-10-05T00:00:00.000Z');

  // 실제 사용자 1: 트리 2(순간 3, 그중 1개가 창 안) + 자동 공개(순간 3) → 공개·둘러보기 1
  await write(REAL_ONE, [
    tree('ta', ['2026-11-18T10:00:00.000Z', '2026-10-01T00:00:00.000Z']),
    tree('tb', ['2026-10-02T00:00:00.000Z'])
  ]);
  await shareRepo.upsertAutoShare({ productId: PRODUCT, subjectId: REAL_ONE, shareId: 'auto-' + 'a'.repeat(20), treeId: 'ta', entryMomentId: 'ta-m0', momentCount: 3 });
  // 실제 사용자 2: 트리 1(순간 1), 공유 없음. 가입일이 창 안 → '새 계정'
  await login(REAL_TWO, '2026-11-18T00:00:00.000Z');
  await write(REAL_TWO, [tree('tc', ['2026-11-18T09:00:00.000Z'], '2026-11-18T09:00:00.000Z')]);
  // AI 테스터: 트리 1(순간 3) + 자동 공개 → 공개·둘러보기 1(AI 쪽 숫자도 따로 센다)
  await write(AI_ONE, [tree('td', ['2026-10-04T00:00:00.000Z', '2026-10-05T00:00:00.000Z', '2026-10-06T00:00:00.000Z'])]);
  await shareRepo.upsertAutoShare({ productId: PRODUCT, subjectId: AI_ONE, shareId: 'auto-' + 'b'.repeat(20), treeId: 'td', entryMomentId: 'td-m0', momentCount: 3 });
  // 시험 계정: 로그인(가입일 창 밖) + 트리 1(순간 2) → 계정·트리·순간에서 '시험 계정'으로 간다.
  await login(TESTER_ONE, '2026-10-03T00:00:00.000Z');
  await write(TESTER_ONE, [tree('tf', ['2026-10-09T00:00:00.000Z', '2026-10-10T00:00:00.000Z'])]);
  // 비공개 트리는 공개·둘러보기에서 빠진다(활성 공유 행이 있어도).
  await write(`sub_${'4'.repeat(32)}`, [tree('te', ['2026-10-06T00:00:00.000Z', '2026-10-07T00:00:00.000Z', '2026-10-08T00:00:00.000Z'])]);
  await shareRepo.upsertAutoShare({ productId: PRODUCT, subjectId: `sub_${'4'.repeat(32)}`, shareId: 'auto-' + 'c'.repeat(20), treeId: 'te', entryMomentId: 'te-m0', momentCount: 3 });
  await visibilityRepo.set({ productId: PRODUCT, subjectId: `sub_${'4'.repeat(32)}`, treeId: 'te', visibility: 'private' });

  const response = await made.handle({ method: 'GET', path: '/api/admin/stats', ...made.as('sess_admin') });
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  const stats = response.body.stats;
  // 계정 7(실제 5 · AI 1 · 시험 1) — 로그인한 적 있는 계정을 센다(문서를 하나도 안 쓴 NEW_EMPTY 포함).
  // 새 계정은 가입일(첫 로그인 시각)이 창(11-13 이후) 안인 실제 사용자 2(REAL_TWO·NEW_EMPTY).
  assert.deepEqual(stats.accounts, { total: 7, real: 5, aiTester: 1, tester: 1, new: { total: 2, real: 2, aiTester: 0, tester: 0 } });
  // 트리 6(실제 4 · AI 1 · 시험 1). 공개 2(실제 1 · AI 1) — 비공개 트리는 빠진다.
  // #743: 트리 계열 카드에 펼침 내역용 제목 목록(카드마다 최대 20)이 함께 온다 — 제목만 싣는다.
  const treeTitles = ['나무 ta', '나무 tb', '나무 tc', '나무 td', '나무 te', '나무 tf'];
  const publicTitles = ['나무 ta', '나무 td'];
  assert.deepEqual(stats.trees, {
    total: 6, real: 4, aiTester: 1, tester: 1, titles: treeTitles,
    public: { total: 2, real: 1, aiTester: 1, tester: 0, titles: publicTitles },
    featured: { total: 2, real: 1, aiTester: 1, tester: 0, titles: publicTitles }
  });
  // 순간 12(실제 7 · AI 3 · 시험 2), 그중 창 안은 실제 2개(사용자 1의 새 순간 + 사용자 2의 첫 순간).
  assert.deepEqual(stats.moments, { total: 12, real: 7, aiTester: 3, tester: 2, new: { total: 2, real: 2, aiTester: 0, tester: 0 } });
  assert.equal(stats.window.days, 7);
  assert.equal(stats.window.since, '2026-11-13T00:00:00.000Z');
  assert.equal(response.headers['cache-control'], 'private, no-store');

  // 개인정보는 싣지 않는다 — 개인정보 칸도, subject·이메일 글자도 응답에 없다.
  const text = JSON.stringify(response.body);
  // #743: 트리 제목 목록은 실리지만(운영자가 내역을 펼쳐 보는 자리) subject·이메일은 여전히 실리지 않는다.
  assert.ok(text.includes('나무 ta'), '트리 제목은 카드 펼침 내역에 쓰인다');
  for (const word of ['sub_', '@', 'email', 'name', 'subject', 'subjectId', 'tester_sub', 'role']) assert.ok(!text.includes(word), `응답에 ${word} 가 실렸다`);
  assert.ok(text.includes('"tester":1'), '시험 계정 숫자는 응답에 있다(운영센터 전용)');
  const keys = new Set(Object.keys(stats));
  assert.deepEqual([...keys].sort(), ['accounts', 'checkedAt', 'moments', 'trees', 'window']);

  // 관리자가 아니면 403, 로그인 확인이 없으면 401, GET 이 아니면 405.
  const refused = await made.handle({ method: 'GET', path: '/api/admin/stats', ...made.as('sess_member') });
  assert.equal(refused.status, 403);
  assert.equal(refused.body.error.code, 'admin_forbidden');
  const anonymous = await made.handle({ method: 'GET', path: '/api/admin/stats' });
  assert.equal(anonymous.status, 401);
  const wrongMethod = await made.handle({ method: 'POST', path: '/api/admin/stats', ...made.as('sess_admin') });
  assert.equal(wrongMethod.status, 405);
});

test('운영센터 전체 숫자: 집계 저장소가 망가지면 503으로 닫고 숫자를 지어내지 않는다', async () => {
  const sessions = new Map([['sess_admin', { productId: PRODUCT, subjectId: ADMIN_SUBJECT, state: 'active', expiresAt: FUTURE }]]);
  const roleStore = createModelAdminRoleStore();
  await roleStore.assign({ productId: PRODUCT, subjectId: ADMIN_SUBJECT, role: ROLE_ADMIN, grantedBy: null });
  const made = build({ sessions, roleStore, shareRepo: createMemoryShareRepo() });
  const broken = createAdminStatsService({ repo: { async aggregate() { throw new Error('집계 실패'); } }, productId: PRODUCT });
  await assert.rejects(() => broken.stats(), (error) => error.status === 503 && error.code === 'admin_stats_unavailable');

  // 핸들러에도 같은 서비스가 물려 있을 때 503 본문이 나간다.
  const handle = made.handleWithStats(broken);
  const response = await handle({ method: 'GET', path: '/api/admin/stats', ...made.as('sess_admin') });
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, 'admin_stats_unavailable');
});

test('시험 계정 부여 도구(#671): 이메일 목록을 다듬고, tester 만 받고, 이메일·subject 를 출력하지 않는다', () => {
  // 목록: 주석·빈 줄·중복(대소문자 무시)을 걷어낸다.
  assert.deepEqual(emailList(['# 레인 시험 계정', '', 'A@Example.test', 'a@example.test', '  b@example.test  '].join(String.fromCharCode(10))), ['A@Example.test', 'b@example.test']);
  // 기본 역할은 tester, --revoke 로 해제, 모르는 역할·인자·빈 목록은 거부.
  assert.equal(parseRoleArgs(['--emails', '/tmp/l.txt']).role, ROLE_TESTER);
  assert.equal(parseRoleArgs(['--email', 'a@b.test', '--revoke']).revoke, true);
  assert.equal(parseRoleArgs(['--email', 'a@b.test', '--role', ROLE_AI_CUSTOMER]).role, ROLE_AI_CUSTOMER);
  assert.throws(() => parseRoleArgs(['--email', 'a@b.test', '--role', 'OWNER']), /역할/);
  assert.throws(() => parseRoleArgs(['--emails']), /모르는 인자|이메일/);
  assert.throws(() => parseRoleArgs([]), /이메일/);
  assert.throws(() => parseRoleArgs(['--email', 'a@b.test', '--surprise']), /모르는 인자/);
  // 출력은 마스크뿐 — 이메일도 subject 도 그대로 나가지 않는다.
  const masked = mask('charlie@example.test');
  assert.match(masked, /^[0-9a-f]{8}$/);
  assert.ok(!masked.includes('charlie'));
  assert.notEqual(mask('a@b.test'), mask('b@b.test'));
});
