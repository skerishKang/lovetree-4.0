import test from 'node:test';
import assert from 'node:assert/strict';
import {createFeedbackHandler, createFeedbackService, maskPersonal} from '../server/feedback-service.js';
import {createMemoryFeedbackRepo} from '../server/testing/memory-feedback-repo.js';
import {createMemoryFeedbackOutbox} from '../server/testing/memory-feedback-outbox.js';
import {createFeedbackOutboxDispatcher, RETRY_DELAYS_MS} from '../server/feedback-outbox-dispatcher.js';
import {ApiError} from '../server/errors.js';

const PRODUCT = 'lovetree-test';
const principal = subjectId => ({productId: PRODUCT, subjectId});

function setup() {
  const feedbackRepo = createMemoryFeedbackRepo();
  const admin = {roleFor: async value => (value?.subjectId === 'admin' ? 'admin' : null)};
  let clock = 0;
  const service = createFeedbackService({feedbackRepo, productId: PRODUCT, admin, now: () => clock});
  // 인증: account 헤더가 있으면 로그인, 없으면 401(로그아웃).
  const authenticate = async request => {
    const subjectId = request.headers?.account;
    if (!subjectId) throw new ApiError(401, 'unauthenticated', 'login');
    return principal(subjectId);
  };
  const handle = createFeedbackHandler({authenticate, service, productId: PRODUCT});
  const call = (method, path, {body, account, ip, query} = {}) => handle({
    method,
    path,
    query: new URLSearchParams(query || ''),
    headers: {
      ...(account ? {account} : {}),
      ...(ip ? {'x-lovetree-client-ip': ip} : {}),
      ...(body ? {'content-type': 'application/json'} : {})
    },
    body: body ? JSON.stringify(body) : ''
  });
  return {feedbackRepo, service, handle, call, tick: ms => { clock += ms; }};
}

test('로그인은 의견을 저장하고 받은 id·상태를 돌려준다', async () => {
  const {call} = setup();
  const res = await call('POST', '/api/feedback', {
    account: 'alice',
    ip: '203.0.113.1',
    body: {category: 'bug', body: '책 넘김이 멈춰요', context: {screen: '책', viewport: '390x844', theme: 'night', version: '4.1', loggedIn: true}}
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'received');
  assert.ok(res.body.id > 0);
  assert.equal(res.body.createdAt, '2026-11-14T00:00:00.000Z');
});

test('로그아웃도 같은 창으로 보내고 subject를 비운다', async () => {
  const {call, feedbackRepo} = setup();
  const res = await call('POST', '/api/feedback', {
    ip: '198.51.100.7',
    body: {category: 'inconvenient', body: '로그아웃 상태에서 의견을 보내요', context: {screen: '첫 화면', loggedIn: false}}
  });
  assert.equal(res.status, 201);
  assert.equal(feedbackRepo.rows[0].subjectId, null);
  assert.equal(feedbackRepo.rows[0].context.loggedIn, false);
});

test('글·종류 검사에 실패하면 400', async () => {
  const {call} = setup();
  const empty = await call('POST', '/api/feedback', {account: 'alice', body: {category: 'bug', body: '   '}});
  assert.equal(empty.status, 400);
  assert.equal(empty.body.error.code, 'body_required');
  const badKind = await call('POST', '/api/feedback', {account: 'alice', body: {category: 'nope', body: '내용'}});
  assert.equal(badKind.status, 400);
  assert.equal(badKind.body.error.code, 'category_invalid');
  const badJson = await call('POST', '/api/feedback', {account: 'alice', body: null});
  assert.equal(badJson.status, 415);
});

test('개인 정보(이메일·전화번호)는 저장 전에 가려진다', async () => {
  const {call, feedbackRepo} = setup();
  assert.equal(maskPersonal('제 메일은 a.b@example.com 입니다'), '제 메일은 [이메일] 입니다');
  assert.equal(maskPersonal('연락처 010-1234-5678'), '연락처 [전화번호]');
  await call('POST', '/api/feedback', {
    account: 'alice',
    body: {category: 'other', body: '연락은 010-1234-5678 또는 kate@example.test로 주세요'}
  });
  const saved = feedbackRepo.rows[0].body;
  assert.equal(saved.includes('010-1234-5678'), false);
  assert.equal(saved.includes('kate@example.test'), false);
  assert.match(saved, /\[전화번호\]/);
  assert.match(saved, /\[이메일\]/);
});

test('로그아웃은 같은 곳에서 10분에 3번까지 — 4번째는 429', async () => {
  const {call, tick} = setup();
  for (let i = 0; i < 3; i += 1) {
    const ok = await call('POST', '/api/feedback', {ip: '203.0.113.9', body: {category: 'bug', body: '의견 ' + i}});
    assert.equal(ok.status, 201);
  }
  const blocked = await call('POST', '/api/feedback', {ip: '203.0.113.9', body: {category: 'bug', body: '네 번째'}});
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, 'rate_limited');
  // 다른 곳은 영향을 받지 않는다.
  const other = await call('POST', '/api/feedback', {ip: '203.0.113.10', body: {category: 'bug', body: '다른 곳'}});
  assert.equal(other.status, 201);
  // 10분이 지나면 다시 보낼 수 있다.
  tick(10 * 60 * 1000 + 1);
  const later = await call('POST', '/api/feedback', {ip: '203.0.113.9', body: {category: 'bug', body: '다음'}});
  assert.equal(later.status, 201);
});

test('목록은 관리자만 — 일반 회원은 403', async () => {
  const {call} = setup();
  await call('POST', '/api/feedback', {account: 'alice', body: {category: 'bug', body: '의견'}});
  const forbidden = await call('GET', '/api/admin/feedback', {account: 'alice'});
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error.code, 'admin_forbidden');
  const anonymous = await call('GET', '/api/admin/feedback');
  assert.equal(anonymous.status, 401);
  const allowed = await call('GET', '/api/admin/feedback', {account: 'admin'});
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.feedback.length, 1);
});

test('목록은 최신 순이고 종류·상태로 거른다', async () => {
  const {call} = setup();
  await call('POST', '/api/feedback', {account: 'admin', body: {category: 'bug', body: '첫째'}});
  await call('POST', '/api/feedback', {account: 'admin', body: {category: 'feature', body: '둘째'}});
  const all = await call('GET', '/api/admin/feedback', {account: 'admin'});
  assert.deepEqual(all.body.feedback.map(row => row.body), ['둘째', '첫째']);
  const features = await call('GET', '/api/admin/feedback', {account: 'admin', query: 'category=feature'});
  assert.deepEqual(features.body.feedback.map(row => row.body), ['둘째']);
});

test('상태·메모·이슈 번호는 관리자만 바꾼다', async () => {
  const {call} = setup();
  await call('POST', '/api/feedback', {account: 'alice', body: {category: 'bug', body: '고쳐 주세요'}});
  const list = await call('GET', '/api/admin/feedback', {account: 'admin'});
  const id = list.body.feedback[0].id;

  const forbidden = await call('PATCH', '/api/admin/feedback/' + id, {account: 'alice', body: {status: 'fixed'}});
  assert.equal(forbidden.status, 403);

  const badStatus = await call('PATCH', '/api/admin/feedback/' + id, {account: 'admin', body: {status: 'nope'}});
  assert.equal(badStatus.status, 400);
  assert.equal(badStatus.body.error.code, 'status_invalid');

  const badIssue = await call('PATCH', '/api/admin/feedback/' + id, {account: 'admin', body: {issueNumber: 'bad number!'}});
  assert.equal(badIssue.status, 400);
  assert.equal(badIssue.body.error.code, 'issue_number_invalid');

  const ok = await call('PATCH', '/api/admin/feedback/' + id, {account: 'admin', body: {status: 'reviewing', memo: '확인 중', issueNumber: '#541'}});
  assert.equal(ok.status, 200);
  assert.equal(ok.body.feedback.status, 'reviewing');
  assert.equal(ok.body.feedback.memo, '확인 중');
  assert.equal(ok.body.feedback.issueNumber, '#541');

  const missing = await call('PATCH', '/api/admin/feedback/999999', {account: 'admin', body: {status: 'fixed'}});
  assert.equal(missing.status, 404);
});

test("'닫음' 상태를 관리자가 저장하고 계약 목록에도 있다(#564 10)", async () => {
  const {call} = setup();
  // 서비스 계약: statuses 목록에 'closed'가 있다.
  const {service} = setup();
  assert.ok(service.statuses.includes('closed'));
  const res = await call('POST', '/api/feedback', {account: 'alice', body: {category: 'bug', body: '정리할 글'}});
  const id = res.body.id;

  const closed = await call('PATCH', '/api/admin/feedback/' + id, {account: 'admin', body: {status: 'closed'}});
  assert.equal(closed.status, 200);
  assert.equal(closed.body.feedback.status, 'closed');

  // 목록은 그대로 돌려 주고(숨김은 화면 몫), 상태별 거르기에서 closed가 읽힌다.
  const list = await call('GET', '/api/admin/feedback', {account: 'admin'});
  assert.equal(list.body.feedback[0].status, 'closed');
  const byClosed = await call('GET', '/api/admin/feedback', {account: 'admin', query: 'status=closed'});
  assert.equal(byClosed.body.feedback.length, 1);
});
test('#678 후속: 고객이 자기 덧붙임을 고친다 — 본인 것만, 빈 글 거절, 가림은 붙이기와 같다', async () => {
  const {call, feedbackRepo} = setup();
  const created = await call('POST', '/api/feedback', {account: 'alice', ip: '203.0.113.1', body: {category: 'bug', body: '고장', context: {}}});
  const postId = created.body.id;
  const appended = await call('POST', `/api/board/mine/${postId}/followup`, {account: 'alice', body: {body: '처음 덧붙임'}});
  assert.equal(appended.status, 201);
  const replyId = appended.body.followup.id;
  await call('PATCH', `/api/admin/feedback/${postId}`, {account: 'admin', body: {status: 'closed'}});

  const edited = await call('PATCH', `/api/board/mine/${postId}/followup/${replyId}`, {account: 'alice', body: {body: '고친 덧붙임 me@example.com'}});
  assert.equal(edited.status, 200);
  assert.equal(edited.body.followup.body, '고친 덧붙임 [이메일]', '붙이기와 같은 가림');
  assert.equal(edited.body.followup.edited, true);
  assert.equal(edited.body.followup.mine, true);
  assert.equal(edited.body.followup.canEdit, true);
  assert.equal(edited.body.followup.canDelete, true);
  assert.equal(edited.body.followup.status, 'reviewing', '붙이기와 같이 다시 열림');
  const row = feedbackRepo.replies.find(r => r.id === replyId);
  assert.equal(row.status, 'visible');
  assert.ok(row.editedAt, '고친 시각을 남긴다');

  const empty = await call('PATCH', `/api/board/mine/${postId}/followup/${replyId}`, {account: 'alice', body: {body: '   '}});
  assert.equal(empty.status, 400);
  assert.equal(empty.body.error.code, 'body_required');

  const missing = await call('PATCH', `/api/board/mine/${postId}/followup/999999`, {account: 'alice', body: {body: 'x'}});
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, 'followup_not_found');
});

test('#678 후속: 고객이 자기 덧붙임을 지운다 — 목록에서 빠지고, 운영 상세에는 지운 표시가 남는다', async () => {
  const {call} = setup();
  const created = await call('POST', '/api/feedback', {account: 'alice', body: {category: 'bug', body: '고장', context: {}}});
  const postId = created.body.id;
  const first = await call('POST', `/api/board/mine/${postId}/followup`, {account: 'alice', body: {body: '첫 덧붙임'}});
  const second = await call('POST', `/api/board/mine/${postId}/followup`, {account: 'alice', body: {body: '둘째 덧붙임'}});
  const f1 = first.body.followup.id, f2 = second.body.followup.id;
  const adminReply = await call('POST', `/api/admin/feedback/${postId}/reply`, {account: 'admin', body: {authorType: 'customer', body: '고객에게 보이는 답변'}});
  const opsReplyId = adminReply.body.reply.id;

  const deleted = await call('DELETE', `/api/board/mine/${postId}/followup/${f1}`, {account: 'alice'});
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.deleted, true);

  // 내 의견 목록: 지운 덧붙임은 빠지고 남은 덧붙임·운영 답변은 그대로다.
  const mine = await call('GET', '/api/board/mine', {account: 'alice'});
  const post = mine.body.posts.find(p => p.id === postId);
  const ids = post.replies.map(r => r.id);
  assert.ok(!ids.includes(f1), '지운 덧붙임은 목록에서 빠진다');
  assert.ok(ids.includes(f2));
  assert.ok(ids.includes(opsReplyId));

  // 운영센터 상세에는 지운 표시가 그대로 보인다(화면은 이 값을 '고객이 지움'으로 그린다).
  const detail = await call('GET', `/api/admin/feedback/${postId}`, {account: 'admin'});
  const deletedReply = detail.body.feedback.replies.find(r => r.id === f1);
  assert.equal(deletedReply.status, 'deleted');
  assert.ok(deletedReply.editedAt);

  // 지운 덧붙임은 다시 고치거나 지울 수 없다.
  const editDeleted = await call('PATCH', `/api/board/mine/${postId}/followup/${f1}`, {account: 'alice', body: {body: '다시 고침'}});
  assert.equal(editDeleted.status, 404);
  const deleteAgain = await call('DELETE', `/api/board/mine/${postId}/followup/${f1}`, {account: 'alice'});
  assert.equal(deleteAgain.status, 404);
});

test('#678 후속: 남의 덧붙임·운영센터 답변·로그아웃은 고치기·지우기가 모두 거절된다', async () => {
  const {call} = setup();
  const created = await call('POST', '/api/feedback', {account: 'alice', body: {category: 'bug', body: '고장', context: {}}});
  const postId = created.body.id;
  const appended = await call('POST', `/api/board/mine/${postId}/followup`, {account: 'alice', body: {body: 'alice의 덧붙임'}});
  const f1 = appended.body.followup.id;
  // 운영센터가 고객에게 보이는 답변(authorType=customer, 작성자는 관리자 계정)을 단다.
  const adminReply = await call('POST', `/api/admin/feedback/${postId}/reply`, {account: 'admin', body: {authorType: 'customer', body: '고객에게 보이는 답변'}});
  const opsReplyId = adminReply.body.reply.id;

  // author_type 'customer'는 '고객에게 보이는 답'이라는 뜻이라 운영센터 답변도 customer다 —
  // 그래서 덧붙임 작성 계정 = 요청 계정 = 글 작성 계정일 때만 허용한다.
  const editOpsReply = await call('PATCH', `/api/board/mine/${postId}/followup/${opsReplyId}`, {account: 'alice', body: {body: '운영 답변을 바꿔 본다'}});
  assert.equal(editOpsReply.status, 403);
  assert.equal(editOpsReply.body.error.code, 'followup_forbidden');
  const deleteOpsReply = await call('DELETE', `/api/board/mine/${postId}/followup/${opsReplyId}`, {account: 'alice'});
  assert.equal(deleteOpsReply.status, 403);
  assert.equal(deleteOpsReply.body.error.code, 'followup_forbidden');

  // 남의 글의 덧붙임은 없는 것과 같이 404(append와 같은 원칙).
  const editForeign = await call('PATCH', `/api/board/mine/${postId}/followup/${f1}`, {account: 'bob', body: {body: '남의 글'}});
  assert.equal(editForeign.status, 404);
  const deleteForeign = await call('DELETE', `/api/board/mine/${postId}/followup/${f1}`, {account: 'bob'});
  assert.equal(deleteForeign.status, 404);

  // 로그아웃은 401.
  const editLoggedOut = await call('PATCH', `/api/board/mine/${postId}/followup/${f1}`, {body: {body: 'x'}});
  assert.equal(editLoggedOut.status, 401);
  const deleteLoggedOut = await call('DELETE', `/api/board/mine/${postId}/followup/${f1}`);
  assert.equal(deleteLoggedOut.status, 401);

  // 내 의견 목록에서 운영 답변은 mine·canEdit·canDelete가 모두 아니다.
  const mine = await call('GET', '/api/board/mine', {account: 'alice'});
  const post = mine.body.posts.find(p => p.id === postId);
  assert.equal(post.replies.find(r => r.id === opsReplyId).canEdit, false);
  assert.equal(post.replies.find(r => r.id === opsReplyId).canDelete, false);
  assert.equal(post.replies.find(r => r.id === opsReplyId).mine, false);
  assert.equal(post.replies.find(r => r.id === f1).canEdit, true);
});

test('사용 일지의 journal_date는 한국 시각(Asia/Seoul) 기준 — 한국 새벽 기록이 하루 전으로 저장되지 않는다', async () => {
  const feedbackRepo = createMemoryFeedbackRepo();
  const created = [];
  const original = feedbackRepo.create.bind(feedbackRepo);
  feedbackRepo.create = async (input) => { created.push(input); return original(input); };
  const admin = {roleFor: async value => (value?.subjectId === 'tester' ? 'ai_customer' : null)};
  // 2026-11-14T19:28:00Z = 한국 시각 2026-11-15 04:28 — 서울 날짜(11-15)로 저장돼야 한다(UTC로 쓰면 11-14가 된다).
  const service = createFeedbackService({feedbackRepo, productId: PRODUCT, admin, now: () => Date.UTC(2026, 10, 14, 19, 28, 0)});
  await service.createJournal({principal: principal('tester'), title: '오늘 사용 일지', body: '내용', score: 4});
  assert.equal(created.length, 1);
  assert.equal(created[0].journalDate, '2026-11-15');
});

// ---- 운영센터 고객 정보(261116 대표 결정: 운영진은 고객 정보를 다 본다) ----
// 읽기만 한다(고치기·지우기 경로 없음), 이메일·이름은 전문, subject는 가린 id만,
// 자세히 판을 열 때마다 열람 기록 한 줄, 사진은 관리자 인증으로만 내려받는다.

import { createAdminCustomersHandler, createAdminCustomersService, maskSubjectId, treeVisibility, momentRow } from '../server/admin-customers.js';
import { createMemoryAdminCustomersRepo } from '../server/testing/memory-admin-customers-repo.js';

const SUB = (hex) => `sub_${hex.padEnd(16, '0')}`;

function customersSetup() {
  const customers = [
    { productId: PRODUCT, subjectId: SUB('a1'), email: 'yoonje@example.com', displayName: '윤제', role: null, joinedAt: '2026-11-01T09:00:00.000Z', lastLoginAt: '2026-11-15T09:00:00.000Z', lastActivityAt: '2026-11-15T10:00:00.000Z', treeCount: 2, momentCount: 12,
      doc: { version: 1, prefs: { displayName: '윤제' }, trees: [
        { id: 't1', title: '윤제, 나의 순간들', moments: [
          { id: 'm1', title: '첫 콘서트', date: '2026-11-02', createdAt: '2026-11-02T09:00:00.000Z', emotion: '설렘', keywords: ['콘서트', 'MMA2026'], url: 'https://youtu.be/abc', note: '혼자 다녀왔어요' },
          { id: 'm2', title: '응원 사진', date: '2026-11-03', createdAt: '2026-11-03T09:00:00.000Z', emotion: '기쁨', keywords: [], url: '/api/media/01234567-89ab-4cde-8f01-234567890abc.png', note: '' }
        ] },
        { id: 't2', title: '비공개 트리', moments: [ { id: 'm3', title: '혼자 본 영상', date: '2026-11-04', createdAt: '2026-11-04T09:00:00.000Z', emotion: '그리움', keywords: [], url: '', note: '비공개 메모' } ] }
      ] },
      markers: [
        { treeId: 't1', kind: 'share', value: 'active' },
        { treeId: 't2', kind: 'private', value: 'private' }
      ] },
    { productId: PRODUCT, subjectId: SUB('b2'), email: 'boram@example.com', displayName: '보람', role: 'ai_customer', joinedAt: '2026-11-02T09:00:00.000Z', lastLoginAt: '2026-11-16T08:00:00.000Z', lastActivityAt: '2026-11-16T08:30:00.000Z', treeCount: 1, momentCount: 3,
      doc: { version: 1, prefs: { displayName: '보람' }, trees: [ { id: 't3', title: '보람의 기록', moments: [ { id: 'm4', title: '안녕', date: '2026-11-05', createdAt: '2026-11-05T09:00:00.000Z', emotion: '평온', keywords: [], url: '', note: '' } ] } ] },
      markers: [ { treeId: 't3', kind: 'share', value: 'active' }, { treeId: 't3', kind: 'discover', value: 'true' } ] }
  ];
  const repo = createMemoryAdminCustomersRepo({ accounts: customers });
  const feedbackRepo = createMemoryFeedbackRepo();
  const admin = { roleFor: async value => (value?.subjectId === 'admin' ? 'admin' : null) };
  const mediaStore = {
    list: async () => ({ items: [{ id: '01234567-89ab-4cde-8f01-234567890abc', name: '01234567-89ab-4cde-8f01-234567890abc.png', mime: 'image/png', size: 1234, createdAt: '2026-11-03T09:00:00.000Z' }] }),
    get: async () => ({ mime: 'image/png', bytes: new Uint8Array([137, 80, 78, 71]) })
  };
  const service = createAdminCustomersService({ repo, feedbackRepo, productId: PRODUCT, admin, mediaStore });
  const authenticate = async request => {
    const subjectId = request.headers?.account;
    if (!subjectId) throw new ApiError(401, 'unauthenticated', 'login');
    return principal(subjectId);
  };
  const handle = createAdminCustomersHandler({ authenticate, service, productId: PRODUCT });
  const call = (method, path, { account } = {}) => handle({
    method, path, query: new URLSearchParams(),
    headers: account ? { account } : {},
    body: ''
  });
  return { repo, feedbackRepo, service, call, customers };
}

test('고객 목록은 이메일·이름을 전문으로 주고 subject는 가린 id만 준다', async () => {
  const { call } = customersSetup();
  const res = await call('GET', '/api/admin/customers', { account: 'admin' });
  assert.equal(res.status, 200);
  const rows = res.body.customers;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].email, 'boram@example.com'); // 마지막 활동 최신 순
  assert.equal(rows[0].displayName, '보람');
  assert.equal(rows[0].roleLabel, 'AI 명예회원');
  assert.ok(rows[0].subjectMasked.startsWith('sub_…'));
  assert.ok(!rows[0].subjectMasked.includes('b2'), '가린 id에 원문 조각을 남기지 않는다');
  // 줄 → 자세히 판 이동에 쓰는 내부 식별자(subjectId)는 응답에 있다. 화면 글자에는 가린 id만 그린다(admin.js의 목록·자세히 판).
  assert.equal(rows[0].subjectId, SUB('b2'));
  assert.equal(rows[1].subjectId, SUB('a1'));
});

test('고객 목록·자세히 판은 관리자가 아니면 403이다', async () => {
  const { call } = customersSetup();
  assert.equal((await call('GET', '/api/admin/customers', { account: SUB('a1') })).status, 403);
  assert.equal((await call('GET', '/api/admin/customers', { account: 'admin' })).status, 200);
  assert.equal((await call('GET', `/api/admin/customers/${SUB('a1')}`, { account: SUB('a1') })).status, 403);
  assert.equal((await call('GET', '/api/admin/customers')).status, 401);
});

test('자세히 판은 트리별 순간 전체(공개·비공개 모두)와 트리 공개 상표를 준다', async () => {
  const { call } = customersSetup();
  const res = await call('GET', `/api/admin/customers/${SUB('a1')}`, { account: 'admin' });
  assert.equal(res.status, 200);
  const c = res.body.customer;
  assert.equal(c.email, 'yoonje@example.com');
  assert.equal(c.displayName, '윤제');
  assert.equal(c.trees.length, 2);
  assert.equal(c.trees[0].visibility, '링크 공유');
  assert.equal(c.trees[1].visibility, '나만');
  assert.equal(c.trees[0].moments.length, 2);
  const photo = c.trees[0].moments.find(m => m.id === 'm2');
  assert.equal(photo.uploaded, true, '올린 파일 순간은 uploaded로 표시한다');
  assert.equal(c.trees[0].moments[0].keywords.join(','), '콘서트,MMA2026', '꼬리표를 함께 준다');
  assert.equal(c.trees[0].moments[0].note, '혼자 다녀왔어요', '메모 전문');
  assert.equal(c.ageVerifiedAt, null, '공용 로그인이 아직 나이 확인 시각을 주지 않는다');
});

test('둘러보기 소개가 켜진 공유 트리는 둘러보기 소개로 표시한다', async () => {
  const { call } = customersSetup();
  const c = (await call('GET', `/api/admin/customers/${SUB('b2')}`, { account: 'admin' })).body.customer;
  assert.equal(c.trees[0].visibility, '둘러보기 소개');
});

test('자세히 판을 열 때마다 열람 기록이 한 줄씩 쌓이고 목록은 최근 순이다', async () => {
  const { call, repo } = customersSetup();
  await call('GET', `/api/admin/customers/${SUB('a1')}`, { account: 'admin' });
  await call('GET', `/api/admin/customers/${SUB('b2')}`, { account: 'admin' });
  await call('GET', `/api/admin/customers/${SUB('a1')}`, { account: 'admin' });
  assert.equal(repo.views.length, 3);
  const res = await call('GET', '/api/admin/customers/views', { account: 'admin' });
  const views = res.body.views;
  assert.equal(views.length, 3);
  assert.equal(views[0].customerMasked, maskSubjectId(SUB('a1')));
  assert.equal(views[0].adminMasked, '', 'subject 모양 밖의 시험 관리자는 빈 값(운영 관리자는 sub_ 꼴이라 가린 id가 된다)');
  assert.equal(views[0].customerEmail, 'yoonje@example.com');
});

test('고객 순간을 고치거나 지우는 경로는 없다(읽기만)', async () => {
  const { call } = customersSetup();
  assert.equal((await call('PUT', `/api/admin/customers/${SUB('a1')}`, { account: 'admin' })).status, 405);
  assert.equal((await call('DELETE', `/api/admin/customers/${SUB('a1')}`, { account: 'admin' })).status, 405);
  assert.equal((await call('PATCH', `/api/admin/customers/${SUB('a1')}`, { account: 'admin' })).status, 405);
});

test('올린 사진은 관리자 인증으로만 내려받는다', async () => {
  const { call } = customersSetup();
  const res = await call('GET', `/api/admin/customers/${SUB('a1')}/media/01234567-89ab-4cde-8f01-234567890abc.png`, { account: 'admin' });
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'image/png');
  const denied = await call('GET', `/api/admin/customers/${SUB('a1')}/media/01234567-89ab-4cde-8f01-234567890abc.png`, { account: SUB('b2') });
  assert.equal(denied.status, 403);
});

test('가린 id는 앞의 sub_와 마지막 넉 자만 남긴다', () => {
  assert.equal(maskSubjectId(SUB('1234567890abcdef')), 'sub_…cdef');
  assert.equal(maskSubjectId('not-a-subject'), '');
  assert.equal(maskSubjectId(null), '');
});

test('트리 공개 상표: 나만·링크 공유·둘러보기 소개', () => {
  assert.equal(treeVisibility([{ treeId: 't', kind: 'private', value: 'private' }], 't'), '나만');
  assert.equal(treeVisibility([{ treeId: 't', kind: 'share', value: 'active' }], 't'), '링크 공유');
  assert.equal(treeVisibility([{ treeId: 't', kind: 'share', value: 'active' }, { treeId: 't', kind: 'discover', value: 'true' }], 't'), '둘러보기 소개');
  assert.equal(treeVisibility([], 't'), '나만', '상표가 없으면 기본인 나만이다');
});

test('순간 줄은 제목·날짜·감정·꼬리표·주소·메모를 전부 담고 올린 파일을 표시한다', () => {
  const row = momentRow({ id: 'm1', title: '제목', date: '2026-11-02', createdAt: '2026-11-02T09:00:00.000Z', emotion: '설렘', keywords: ['a'], url: '/api/media/01234567-89ab-4cde-8f01-234567890abc.png', note: '메모' });
  assert.equal(row.uploaded, true);
  assert.equal(row.keywords.join(','), 'a');
  assert.equal(momentRow(null), null);
});

test('#1211: 수신 답글과 상태는 한 번만 반영하고 고객에게 보이며 다시 보내지 않는다', async () => {
  const feedbackRepo=createMemoryFeedbackRepo(),outbox=createMemoryFeedbackOutbox();
  const service=createFeedbackService({feedbackRepo,productId:PRODUCT,outbox});
  const saved=await service.submit({principal:principal('alice'),request:{headers:{}},category:'bug',body:'의견'});
  const handle=createFeedbackHandler({authenticate:async()=>principal('alice'),service,productId:PRODUCT});
  const event={eventKey:'ops_reply_1234567',feedbackId:saved.id,kind:'reply',replyId:'reply-123',body:'확인했습니다.',createdAt:'2026-11-23T00:00:00.000Z'};
  const call=body=>handle({method:'POST',path:'/api/ops-feedback/ingest',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  for(const bad of [{eventKey:'short'},{feedbackId:String(saved.id)},{kind:'reply_edit'},{replyId:12},{body:'가'.repeat(2001)},{createdAt:'yesterday'},{createdAt:'2026-02-30T00:00:00Z'},{createdAt:'0000-01-01T00:00:00Z'},{kind:'status',status:'unknown'}]){
    assert.equal((await call({...event,...bad})).status,400);
  }
  assert.equal((await handle({method:'POST',path:'/api/ops-feedback/ingest',headers:{},body:'{bad'})).status,400);
  assert.equal((await handle({method:'POST',path:'/api/ops-feedback/ingest',headers:{},body:'x'.repeat(8193)})).status,400);
  assert.equal((await call({...event,feedbackId:99999})).status,404);
  const other=await feedbackRepo.create({productId:'other',category:'bug',body:'다른 제품'});
  assert.equal((await call({...event,feedbackId:other.id})).status,404);
  const journal=await feedbackRepo.create({productId:PRODUCT,kind:'journal',category:'other',body:'일지'});
  assert.equal((await call({...event,feedbackId:journal.id})).status,404);
  const first=await call(event);
  assert.equal(first.status,200);
  assert.deepEqual(first.body,{ok:true});
  assert.deepEqual((await call(event)).body,{ok:true,duplicate:true});
  const status={eventKey:'ops_status_123456',feedbackId:saved.id,kind:'status',status:'fixed'};
  assert.deepEqual((await call(status)).body,{ok:true});
  assert.deepEqual((await call(status)).body,{ok:true,duplicate:true});
  for(const [i,value] of ['received','reviewing','later','closed','fixed'].entries()){
    assert.deepEqual((await call({...status,eventKey:`ops_status_next_${i}`,status:value})).body,{ok:true});
    assert.equal((await feedbackRepo.get({productId:PRODUCT,id:saved.id})).status,value);
  }
  assert.equal((await outbox.list()).length,1);
  const mine=await handle({method:'GET',path:'/api/board/mine',headers:{}});
  assert.equal(mine.status,200);
  const post=mine.body.posts.find(p=>p.id===saved.id);
  assert.equal(post.status,'fixed');
  assert.equal(post.replies.length,1);
  assert.deepEqual(post.replies.map(r=>[r.body,r.authorName,r.createdAt,r.mine,r.canEdit,r.canDelete]),[[event.body,'운영센터',event.createdAt,false,false,false]]);
  assert.equal(feedbackRepo.replies[0].opsReplyId,event.replyId);
  assert.equal(post.replies[0].opsReplyId,undefined);
});

test('1190: 새 의견을 저장하면 보낼 줄이 생기고 이메일·소개는 담지 않는다', async () => {
  const feedbackRepo=createMemoryFeedbackRepo();
  const outbox=createMemoryFeedbackOutbox({now:()=>1000});
  const admin={roleFor:async value=>value?.subjectId==='ai'?'ai_customer':null};
  const service=createFeedbackService({feedbackRepo,productId:PRODUCT,admin,outbox,now:()=>1000});
  const saved=await service.submit({principal:principal('ai'),request:{headers:{}},category:'bug',body:'새 의견',context:{}});
  const rows=await outbox.list();
  assert.equal(rows.length,1);
  assert.equal(rows[0].kind,'new');
  assert.equal(rows[0].feedbackId,saved.id);
  assert.equal(rows[0].payload.event,'new');
  assert.equal(rows[0].payload.body,'새 의견');
  assert.equal(rows[0].payload.status,'received');
  assert.equal(rows[0].payload.isAiCustomer,true);
  assert.equal(rows[0].payload.accountSubjectId,'ai');
  assert.equal(rows[0].payload.email,undefined);
  assert.equal(rows[0].payload.intro,undefined);
});

test('1190: 같은 의견 id와 일 키는 한 줄만 만든다', async () => {
  const outbox=createMemoryFeedbackOutbox({now:()=>1000});
  const event={productId:PRODUCT,feedbackId:7,eventKey:'new',kind:'new',payload:{event:'new',body:'같은 의견'}};
  assert.ok(await outbox.enqueue(event));
  assert.equal(await outbox.enqueue(event),null);
  assert.equal((await outbox.list()).length,1);
});

test('1190: 받는 쪽이 받으면 보냄이 되고 시각·사이트·서명을 함께 보낸다', async () => {
  const outbox=createMemoryFeedbackOutbox({now:()=>1000});
  await outbox.enqueue({productId:PRODUCT,feedbackId:7,eventKey:'new',kind:'new',payload:{event:'new',body:'보낼 내용'}});
  let clock=1000;
  const calls=[];
  const dispatcher=createFeedbackOutboxDispatcher({
    outbox,receiverUrl:'https://ops.example.test/inbox',secret:'fake-secret',now:()=>clock,
    fetchImpl:async(url,init)=>{calls.push({url,init});return {status:200};}
  });
  assert.equal(await dispatcher.drain(),1);
  assert.equal((await outbox.list())[0].status,'sent');
  assert.equal(calls.length,1);
  assert.equal(calls[0].init.headers['x-lt-site'],'lovetree');
  assert.match(calls[0].init.headers['x-lt-signature'],/^sha256=[a-f0-9]{64}$/);
});

test('1190: 실패하면 다음 시각을 정하고 다섯 번 실패하면 실패로 남는다', async () => {
  let clock=1000;
  const outbox=createMemoryFeedbackOutbox({now:()=>clock});
  await outbox.enqueue({productId:PRODUCT,feedbackId:8,eventKey:'new',kind:'new',payload:{event:'new',body:'다시 보내기'}});
  const dispatcher=createFeedbackOutboxDispatcher({
    outbox,receiverUrl:'https://ops.example.test/inbox',secret:'fake-secret',now:()=>clock,
    fetchImpl:async()=>({status:500})
  });
  for(let i=0;i<RETRY_DELAYS_MS.length;i+=1){
    await dispatcher.drain();
    const row=(await outbox.list())[0];
    assert.equal(row.attempts,i+1);
    if(i<RETRY_DELAYS_MS.length-1){
      assert.equal(row.status,'pending');
      assert.equal(Date.parse(row.nextAttemptAt),clock+RETRY_DELAYS_MS[i]);
      clock=Date.parse(row.nextAttemptAt);
    }else{
      assert.equal(row.status,'failed');
    }
  }
});

test('1190: 받는 주소나 비밀이 없으면 줄에만 쌓고 보내지 않는다', async () => {
  const outbox=createMemoryFeedbackOutbox({now:()=>1000});
  await outbox.enqueue({productId:PRODUCT,feedbackId:9,eventKey:'new',kind:'new',payload:{event:'new',body:'대기'}});
  let called=false;
  const dispatcher=createFeedbackOutboxDispatcher({outbox,receiverUrl:'',secret:'fake-secret',now:()=>1000,fetchImpl:async()=>{called=true;return {status:200};}});
  assert.equal(await dispatcher.drain(),0);
  assert.equal(called,false);
  assert.equal((await outbox.list())[0].status,'pending');
});
