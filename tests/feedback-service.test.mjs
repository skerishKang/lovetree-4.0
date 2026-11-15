import test from 'node:test';
import assert from 'node:assert/strict';
import {createFeedbackHandler, createFeedbackService, maskPersonal} from '../server/feedback-service.js';
import {createMemoryFeedbackRepo} from '../server/testing/memory-feedback-repo.js';
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
    body: {category: 'other', body: '연락은 010-1234-5678 또는 kim@site.co.kr로 주세요'}
  });
  const saved = feedbackRepo.rows[0].body;
  assert.equal(saved.includes('010-1234-5678'), false);
  assert.equal(saved.includes('kim@site.co.kr'), false);
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
