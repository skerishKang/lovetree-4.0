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

test('일지 본문 한도 8000(#596) — 초과분은 한도까지 저장, 의견은 2000 유지', async () => {
  const {call, feedbackRepo} = setup();
  const ok = await call('POST', '/api/board', {account: AI, body: {title: '8000자', body: '가'.repeat(8000), score: 3}});
  assert.equal(ok.status, 201);
  const over = await call('POST', '/api/board', {account: AI, body: {title: '8001자', body: '가'.repeat(8001), score: 3}});
  assert.equal(over.status, 201);
  const mine = await call('GET', '/api/board/mine', {account: AI});
  assert.equal(mine.body.posts[0].body.length, 8000);
  const opinionOver = await call('POST', '/api/feedback', {account: AI, body: {category: 'other', body: '가'.repeat(2001)}});
  assert.equal(opinionOver.status, 201);
  const opinion = feedbackRepo.rows.find(row => row.kind === 'opinion');
  assert.equal(opinion.body.length, 2000);
});

test('#611 4번: 본인 의견에 짧게 덧붙인다 — 고침·닫음이면 다시 열림(reviewing)', async () => {
  const {call} = setup();
  const sent = await call('POST', '/api/feedback', {account: USER, body: {category: 'bug', body: '아픈 곳을 적는다'}});
  const id = sent.body.id;
  // 운영센터가 고침으로 처리한다.
  const fixed = await call('PATCH', `/api/admin/feedback/${id}`, {account: ADMIN, body: {status: 'fixed', issueNumber: '#608'}});
  assert.equal(fixed.status, 200);
  assert.equal(fixed.body.feedback.status, 'fixed');
  // 본인이 덧붙이면 답글이 남고 상태가 다시 열림으로 바뀐다.
  const appended = await call('POST', `/api/board/mine/${id}/followup`, {account: USER, body: {body: '아까 말한 곳은 아직도 그래요'}});
  assert.equal(appended.status, 201);
  assert.equal(appended.body.followup.status, 'reviewing');
  // 내 글 보기에는 덧붙임(mine)과 운영센터 답글이 구분되어 나온다.
  await call('POST', `/api/admin/feedback/${id}/reply`, {account: ADMIN, body: {authorType: 'customer', body: '살펴볼게요'}});
  const mine = await call('GET', '/api/board/mine', {account: USER});
  const post = mine.body.posts.find(p => p.id === id);
  assert.equal(post.status, 'reviewing');
  assert.equal(post.replies.length, 2);
  assert.deepEqual(post.replies.map(r => r.mine), [true, false]);
  assert.equal('authorSubjectId' in post.replies[0], false, '답변자 신원은 내리지 않는다');
  // 운영센터 상세에는 같은 줄로 붙어, 고객 덧붙임으로 알린다.
  const detail = await call('GET', `/api/admin/feedback/${id}`, {account: ADMIN});
  assert.deepEqual(detail.body.feedback.replies.map(r => r.fromCustomer), [true, false]);
});

test('#611 4번: 남의 글·일지에는 덧붙일 수 없고, 빈 말은 400', async () => {
  const {call} = setup();
  const sent = await call('POST', '/api/feedback', {account: USER, body: {category: 'other', body: '내 의견'}});
  const id = sent.body.id;
  const other = await call('POST', `/api/board/mine/${id}/followup`, {account: AI, body: {body: '엉뚱한 계정'}});
  assert.equal(other.status, 404, '남의 글은 없는 것과 같이');
  const empty = await call('POST', `/api/board/mine/${id}/followup`, {account: USER, body: {body: '  '}});
  assert.equal(empty.status, 400);
  const anon = await call('POST', `/api/board/mine/${id}/followup`, {body: {body: '로그아웃'}});
  assert.equal(anon.status, 401);
  // 일지에는 덧붙이지 않는다.
  const journal = await call('POST', '/api/board', {account: AI, body: {title: '일지', body: '내용', score: 3}});
  const denied = await call('POST', `/api/board/mine/${journal.body.id}/followup`, {account: AI, body: {body: '일지에 덧붙임'}});
  assert.equal(denied.status, 404);
});

test('#611 3번: 운영센터 글쓴이 이름 앞에 AI를 단다', async () => {
  const {call} = setup();
  await call('PUT', `/api/admin/persona/${AI}`, {account: ADMIN, body: {name: '윤제', intro: {}}});
  await call('POST', '/api/feedback', {account: AI, body: {category: 'bug', body: 'AI 의견'}});
  await call('POST', '/api/feedback', {account: USER, body: {category: 'bug', body: '사용자 의견'}});
  const list = await call('GET', '/api/admin/feedback', {account: ADMIN});
  assert.equal(list.body.feedback.find(r => r.authorName === '윤제')?.authorRole, 'ai_customer');
  assert.equal(list.body.feedback.find(r => r.authorName !== '윤제')?.authorRole, null);
});

test('관리자 일지 탭 읽기 API(#596): 일지만 날짜 내림차순, 관리자만', async () => {
  const {call} = setup();
  await call('PUT', `/api/admin/persona/${AI}`, {account: ADMIN, body: {name: '윤제', intro: {}}});
  await call('POST', '/api/board', {account: AI, body: {title: '오늘 일지', body: '내용', score: 3}});
  await call('POST', '/api/feedback', {account: USER, body: {category: 'bug', body: '의견입니다'}});
  const denied = await call('GET', '/api/admin/journals', {account: USER});
  assert.equal(denied.status, 403);
  const anon = await call('GET', '/api/admin/journals');
  assert.equal(anon.status, 401);
  const got = await call('GET', '/api/admin/journals', {account: ADMIN});
  assert.equal(got.status, 200);
  assert.equal(got.body.journals.length, 1);
  assert.equal(got.body.journals[0].kind, 'journal');
  assert.equal(got.body.journals[0].authorName, '윤제');
  assert.equal(got.body.journals[0].displayTitle, '오늘 일지');
});