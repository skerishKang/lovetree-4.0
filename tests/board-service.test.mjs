import test from 'node:test';
import assert from 'node:assert/strict';
import {createFeedbackHandler, createFeedbackService} from '../server/feedback-service.js';
import {createMemoryFeedbackRepo} from '../server/testing/memory-feedback-repo.js';
import {ApiError} from '../server/errors.js';

const PRODUCT = 'lovetree-test';
const principal = subjectId => ({productId: PRODUCT, subjectId});
const ADMIN = 'admin', AI = 'yuje', USER = 'm01';

function setup() {
  const feedbackRepo = createMemoryFeedbackRepo();
  const admin = {roleFor: async value => value?.subjectId === ADMIN ? 'admin' : value?.subjectId === AI ? 'ai_customer' : null};
  const service = createFeedbackService({feedbackRepo, productId: PRODUCT, admin, now: () => Date.UTC(2026, 10, 14, 12, 0, 0)});
  const authenticate = async request => {
    const subjectId = request.headers?.account;
    if (!subjectId) throw new ApiError(401, 'unauthenticated', 'login');
    return principal(subjectId);
  };
  const handle = createFeedbackHandler({authenticate, service, productId: PRODUCT});
  const call = (method, fullPath, {body, account} = {}) => {
    const [path, qs] = String(fullPath).split('?');
    return handle({
      method, path, query: new URLSearchParams(qs || ''),
      headers: {...(account ? {account} : {}), ...(body ? {'content-type': 'application/json'} : {})},
      body: body ? JSON.stringify(body) : ''
    });
  };
  return {feedbackRepo, service, handle, call};
}

test('AI 고객만 사용 일지를 쓸 수 있다', async () => {
  const {call} = setup();
  const denied = await call('POST', '/api/board', {account: USER, body: {title: '오늘', body: '사용 함'}});
  assert.equal(denied.status, 403);
  const anon = await call('POST', '/api/board', {body: {title: '오늘', body: '사용 함'}});
  assert.equal(anon.status, 401);
  const ok = await call('POST', '/api/board', {account: AI, body: {title: '오늘 사용', body: '기록을 남겼다', score: 4}});
  assert.equal(ok.status, 201);
  assert.equal(ok.body.updated, false);
});

test('같은 날 다시 쓰면 고친다(하루 한 건)', async () => {
  const {call, feedbackRepo} = setup();
  await call('POST', '/api/board', {account: AI, body: {title: '첫째', body: '내용1', score: 3}});
  const again = await call('POST', '/api/board', {account: AI, body: {title: '고침', body: '내용2', score: 5}});
  assert.equal(again.body.updated, true);
  assert.equal(feedbackRepo.rows.filter(r => r.kind === 'journal').length, 1);
  const mine = await call('GET', '/api/board/mine', {account: AI});
  assert.equal(mine.body.posts[0].title, '고침');
  assert.equal(mine.body.posts[0].score, 5);
});

test('사용 일지 제목·본문·점수 검사', async () => {
  const {call} = setup();
  const noTitle = await call('POST', '/api/board', {account: AI, body: {title: '', body: '내용'}});
  assert.equal(noTitle.status, 400);
  const badScore = await call('POST', '/api/board', {account: AI, body: {title: 't', body: 'b', score: 9}});
  assert.equal(badScore.status, 400);
});

test('관리자 목록은 의견·일지를 최신 순으로, 종류로 거른다', async () => {
  const {call} = setup();
  await call('POST', '/api/board', {account: AI, body: {title: '일지', body: 'j', score: 4}});
  await call('POST', '/api/feedback', {account: USER, body: {category: 'bug', body: '의견'}});
  const all = await call('GET', '/api/admin/feedback', {account: ADMIN});
  assert.deepEqual(all.body.feedback.map(r => r.kind).sort(), ['journal', 'opinion']);
  const journals = await call('GET', '/api/admin/feedback', {account: ADMIN});
  assert.ok(journals.body.feedback.every(r => r.kind === 'journal' || r.kind === 'opinion'));
  const onlyJournal = await call('GET', '/api/admin/feedback?kind=journal', {account: ADMIN});
  assert.ok(onlyJournal.body.feedback.every(r => r.kind === 'journal'));
});

test('관리자만 목록을 본다', async () => {
  const {call} = setup();
  const denied = await call('GET', '/api/admin/feedback', {account: AI});
  assert.equal(denied.status, 403);
});

test('답글은 고객 답변·내부 메모 두 가지, 일지는 내부 메모만', async () => {
  const {call} = setup();
  const post = await call('POST', '/api/feedback', {account: USER, body: {category: 'bug', body: '의견'}});
  const id = post.body.id;
  const customerReply = await call('POST', `/api/admin/feedback/${id}/reply`, {account: ADMIN, body: {authorType: 'customer', body: '확인했어요'}});
  assert.equal(customerReply.status, 201);
  const detail = await call('GET', `/api/admin/feedback/${id}`, {account: ADMIN});
  assert.equal(detail.body.feedback.replies.length, 1);
  // 일지에는 고객 답변 불가
  const j = await call('POST', '/api/board', {account: AI, body: {title: '일지', body: 'j'}});
  const jid = j.body.id;
  const bad = await call('POST', `/api/admin/feedback/${jid}/reply`, {account: ADMIN, body: {authorType: 'customer', body: '답변'}});
  assert.equal(bad.status, 400);
});

test('내 글에서 고객 답변만 보인다(내부 메모 숨김)', async () => {
  const {call} = setup();
  const post = await call('POST', '/api/feedback', {account: USER, body: {category: 'bug', body: '의견'}});
  const id = post.body.id;
  await call('POST', `/api/admin/feedback/${id}/reply`, {account: ADMIN, body: {authorType: 'customer', body: '보이는 답변'}});
  await call('POST', `/api/admin/feedback/${id}/reply`, {account: ADMIN, body: {authorType: 'internal', body: '내부 메모'}});
  const mine = await call('GET', '/api/board/mine', {account: USER});
  const found = mine.body.posts.find(p => p.id === id);
  assert.deepEqual(found.replies.map(r => r.body), ['보이는 답변']);
});

test('상태를 고침으로 바꾸면 연결 이슈 번호가 내 글에 보인다', async () => {
  const {call} = setup();
  const post = await call('POST', '/api/feedback', {account: USER, body: {category: 'bug', body: '의견'}});
  const id = post.body.id;
  const upd = await call('PATCH', `/api/admin/feedback/${id}`, {account: ADMIN, body: {status: 'fixed', issueNumber: '#600'}});
  assert.equal(upd.status, 200);
  const mine = await call('GET', '/api/board/mine', {account: USER});
  const found = mine.body.posts.find(p => p.id === id);
  assert.equal(found.status, 'fixed');
  assert.equal(found.issueNumber, '#600');
});

test('페르소나 소개는 관리자가 쓰고 고친다', async () => {
  const {call} = setup();
  const saved = await call('PUT', `/api/admin/persona/${AI}`, {account: ADMIN, body: {name: '윤제', intro: {who: '팬', why: '기록', how: '매일', habits: '매일 쓰는 곳: 유튜브·네이버 카페', satisfied: '좋음', disappointed: '없음', now: '쓰는 중'}}});
  assert.equal(saved.status, 200);
  assert.equal(saved.body.persona.name, '윤제');
  const got = await call('GET', `/api/admin/persona/${AI}`, {account: ADMIN});
  assert.equal(got.body.persona.intro.who, '팬');
  // #590: intro 는 jsonb 통과 — 서버가 키를 거르지 않아 새 칸(habits)도 저장·불러오기 된다.
  assert.equal(got.body.persona.intro.habits, '매일 쓰는 곳: 유튜브·네이버 카페');
  const denied = await call('PUT', `/api/admin/persona/${AI}`, {account: USER, body: {name: 'x', intro: {}}});
  assert.equal(denied.status, 403);
});