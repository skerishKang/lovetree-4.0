import test from 'node:test';
import assert from 'node:assert/strict';
// #538 공개가 기본: 새 트리·기존 트리 모두 공개, 순간 3개 이상이면 둘러보기 자동 소개,
// 비공개는 Plus 전용(서버 판단). 저장 성공 뒤 같은 훅에서 자동 공유 행과 moment_count를 동기화한다.
import { createTree, addMoment, removeMoment } from '../src/domain.js';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { createMemoryShareRepo } from '../server/testing/memory-share-repo.js';
import { createMemoryTreeVisibilityRepo } from '../server/testing/memory-tree-visibility-repo.js';
import { createMemoryCommunityRepo } from '../server/testing/memory-community-repo.js';
import { createShareHandler, createShareService } from '../server/share-service.js';
import { createCommunityHandler, createCommunityService } from '../server/community-service.js';
import { ApiError } from '../server/errors.js';

const PRODUCT = 'lovetree-test', CLOCK = '2026-11-01T00:00:00.000Z';
const MEDIA = 'https://front.test/api/media/123e4567-e89b-42d3-a456-426614174000.jpg';
const principal = subjectId => ({ productId: PRODUCT, subjectId });

function treeWithMoments(count, { url = '' } = {}) {
  let tree = createTree({ subject: '윤슬', title: '첫 장면', note: '기록', emotion: '설렘', date: '2026-11-01', url }, CLOCK);
  for (let i = 1; i < count; i += 1) {
    tree = addMoment(tree, { subject: '윤슬', title: `순간 ${i + 1}`, note: '기록', emotion: '위로', date: '2026-11-02', url }, tree.moments[0].id, CLOCK);
  }
  return tree;
}

async function setup() {
  const workspaceRepo = createMemoryWorkspaceRepo();
  const shareRepo = createMemoryShareRepo();
  const visibilityRepo = createMemoryTreeVisibilityRepo();
  const communityRepo = createMemoryCommunityRepo({
    // #538: 메모리 모형도 비공개 트리를 둘러보기에서 뺀다(PostgreSQL SQL 은 NOT EXISTS 로 같은 조건).
    isPrivateTree: (productId, subjectId, treeId) => visibilityRepo.isPrivate(productId, subjectId, treeId)
  });
  let n = 0;
  const shareService = createShareService({
    shareRepo, workspaceRepo, visibilityRepo, productId: PRODUCT,
    plusEntitled: () => false, // 결제 미도입 — 비공개는 항상 거절
    makeId: () => String(++n).padStart(24, 'a')
  });
  const workspace = createWorkspaceService({
    repo: workspaceRepo, productId: PRODUCT,
    onCommit: ({ subjectId, doc }) => shareService.syncSharesAfterSave(subjectId, doc)
  });
  const communityService = createCommunityService({
    communityRepo, shareRepo, workspaceRepo, visibilityRepo, productId: PRODUCT,
    admin: { roleFor: async value => value.subjectId === 'admin' ? 'admin' : null },
    makeId: () => String(++n).padStart(24, 'c')
  });
  const authenticate = async request => {
    const account = request.headers?.account;
    if (!account) throw new ApiError(401, 'unauthenticated', 'login');
    return principal(account);
  };
  const shareHandle = createShareHandler({ authenticate, service: shareService, productId: PRODUCT });
  const communityHandle = createCommunityHandler({ authenticate, service: communityService, productId: PRODUCT });
  const request = (handle, method, path, body, account, key) => handle({
    method, path,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(account ? { account } : {}), ...(key ? { 'idempotency-key': key } : {}) },
    body: body ? JSON.stringify(body) : ''
  });
  // 둘러보기 목록: 메모리 모형은 공유 행 목록을 시드로 받으므로, 저장 훅 뒤의 실제 행을 그대로 먹인다.
  const browse = async (viewer = null) => {
    communityRepo.seedShares(await shareRepo.list({ productId: PRODUCT, subjectId: 'alice' }));
    const response = await request(communityHandle, 'GET', '/api/community/shares', null, viewer);
    return response.body;
  };
  return { workspace, workspaceRepo, shareRepo, visibilityRepo, shareService, shareHandle, communityHandle, request, browse };
}

test('새 트리는 공개가 기본이다 — 공유 링크 없이 저장만으로 자동 공개 행이 생긴다', async () => {
  const h = await setup();
  const tree = treeWithMoments(3, { url: 'https://i.ytimg.com/vi/abc/hqdefault.jpg' });
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 0, clientKey: 'seed-1' });
  const shares = await h.shareRepo.list({ productId: PRODUCT, subjectId: 'alice' });
  assert.equal(shares.length, 1);
  assert.equal(shares[0].origin, 'auto', '자동 공개 행');
  assert.equal(shares[0].treeId, tree.id);
  assert.equal(shares[0].momentCount, 3);
  assert.equal(shares[0].discoverable, false, 'discoverable 열은 보존만 한다(참조하지 않음)');
  const items = (await h.browse()).items;
  assert.equal(items.length, 1, '주인이 공유 링크를 만들지 않아도 둘러보기에 소개된다');
  assert.equal(items[0].momentCount, 3);
});

test('순간 2개면 둘러보기에 나오지 않고, 3개부터 나온다 — 직접 올린 사진만 있는 순간도 센다', async () => {
  const h = await setup();
  let tree = treeWithMoments(2, { url: MEDIA });
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 0, clientKey: 'seed-2' });
  assert.deepEqual((await h.browse()).items, [], '순간 2개는 소개 대상이 아니다');
  tree = addMoment(tree, { subject: '윤슬', title: '직접 찍은 순간', note: '사진만', emotion: '고마움', date: '2026-11-03', url: MEDIA }, tree.moments[0].id, CLOCK);
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 1, clientKey: 'add-3' });
  const items = (await h.browse()).items;
  assert.equal(items.length, 1, '직접 올린 사진만 있는 순간도 순간 수에 센다');
  assert.equal(items[0].momentCount, 3);
  assert.equal(items[0].cover.url, '', '공개 카드 대표 그림은 올린 사진을 쓰지 않는다(#427 전까지)');
});

test('비공개 시도는 서버가 Plus 전용으로 거절한다(화면 잠금만으로 막지 않는다)', async () => {
  const h = await setup();
  const tree = treeWithMoments(3);
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 0, clientKey: 'seed-3' });
  const denied = await h.request(h.shareHandle, 'PUT', `/api/trees/${tree.id}/visibility`, { visibility: 'private' }, 'alice');
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, 'plus_required_private');
  const state = await h.request(h.shareHandle, 'GET', `/api/trees/${tree.id}/visibility`, null, 'alice');
  assert.equal(state.body.visibility, 'public', '거절됐으므로 공개가 유지된다');
  assert.equal((await h.browse()).items.length, 1, '비공개로 바뀌지 않았으므로 둘러보기에 계속 나온다');
});

test('주인이 트리를 지우면 자동 공개도 즉시 내려간다', async () => {
  const h = await setup();
  const tree = treeWithMoments(3);
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 0, clientKey: 'seed-4' });
  const [auto] = await h.shareRepo.list({ productId: PRODUCT, subjectId: 'alice' });
  assert.equal((await h.browse()).items.length, 1);
  await h.workspace.deleteTree(principal('alice'), tree.id);
  const shares = await h.shareRepo.list({ productId: PRODUCT, subjectId: 'alice' });
  assert.equal(shares[0].status, 'revoked', '자동 공개 행이 함께 내려간다');
  assert.deepEqual((await h.browse()).items, []);
  const read = await h.request(h.shareHandle, 'GET', `/api/public/shares/${auto.shareId}`);
  assert.equal(read.status, 410, '공개 읽기도 즉시 막힌다');
});

test('moment_count는 저장 때마다 갱신된다 — 순간 추가·삭제·주인 만든 공유 행도 함께', async () => {
  const h = await setup();
  let tree = treeWithMoments(3);
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 0, clientKey: 'seed-5' });
  // 주인이 만든 공유 링크도 같은 훅에서 moment_count 를 갱신받는다.
  const preview = await h.request(h.shareHandle, 'POST', '/api/shares/preview', { treeId: tree.id, entryMomentId: tree.moments[0].id, view: 'book' }, 'alice');
  const made = await h.request(h.shareHandle, 'POST', '/api/shares', { treeId: tree.id, entryMomentId: tree.moments[0].id, view: 'book', previewToken: preview.body.preview.previewToken }, 'alice');
  assert.equal(made.status, 201);
  const ownerId = made.body.share.id;
  assert.equal((await h.shareRepo.load({ productId: PRODUCT, shareId: ownerId })).momentCount, 3);

  tree = removeMoment(tree, tree.moments.at(-1).id, CLOCK);
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 1, clientKey: 'remove-1' });
  assert.equal((await h.shareRepo.load({ productId: PRODUCT, shareId: ownerId })).momentCount, 2, '삭제 뒤 2로 갱신');
  assert.deepEqual((await h.browse()).items, [], '2개가 되면 둘러보기에서 내려간다');

  tree = addMoment(tree, { subject: '윤슬', title: '다시 추가', note: '기록', emotion: '벅참', date: '2026-11-04', url: '' }, tree.moments[0].id, CLOCK);
  tree = addMoment(tree, { subject: '윤슬', title: '또 추가', note: '기록', emotion: '즐거움', date: '2026-11-05', url: '' }, tree.moments[0].id, CLOCK);
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 2, clientKey: 'add-2' });
  assert.equal((await h.shareRepo.load({ productId: PRODUCT, shareId: ownerId })).momentCount, 4, '추가 뒤 4로 갱신');
  assert.equal((await h.browse()).items.length, 1, '다시 3개 이상이면 소개된다');
});

test('신고 숨김·차단은 공개 기본에서도 그대로 막는다', async () => {
  const h = await setup();
  const tree = treeWithMoments(3);
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 0, clientKey: 'seed-6' });
  const [auto] = await h.shareRepo.list({ productId: PRODUCT, subjectId: 'alice' });
  const report = await h.request(h.communityHandle, 'POST', `/api/community/shares/${auto.shareId}/report`, { reason: '확인이 필요해요' }, 'bob', 'report-key-1');
  assert.equal(report.status, 201);
  assert.deepEqual((await h.browse()).items.length, 1, '신고만으로는 자동 숨기지 않는다');
  assert.equal((await h.request(h.communityHandle, 'POST', `/api/community/shares/${auto.shareId}/block`, null, 'bob')).status, 200);
  assert.deepEqual((await h.browse('bob')).items, [], '차단한 사람에게는 안 보인다');
  assert.equal((await h.browse('carol')).items.length, 1, '다른 사람에게는 그대로 보인다');
});

test('공개 응답 어디에도 계정 이름·아이디·이메일이 없다', async () => {
  const h = await setup();
  const tree = treeWithMoments(3);
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 0, clientKey: 'seed-7' });
  const browseBody = await h.browse();
  assert.equal(JSON.stringify(browseBody).includes('alice'), false, '둘러보기 카드에 아이디가 없다');
  const [auto] = await h.shareRepo.list({ productId: PRODUCT, subjectId: 'alice' });
  const read = await h.request(h.shareHandle, 'GET', `/api/public/shares/${auto.shareId}`);
  assert.equal(JSON.stringify(read.body).includes('alice'), false, '공유 응답에 아이디가 없다');
  await h.request(h.communityHandle, 'POST', `/api/community/shares/${auto.shareId}/comments`, { body: '좋은 순간이에요' }, 'bob', 'comment-key-1');
  const comments = await h.request(h.communityHandle, 'GET', `/api/community/shares/${auto.shareId}/comments`);
  assert.equal(comments.body.comments[0].authorLabel, '기록한 사람', '댓글 글쓴이는 기록한 사람으로만 보인다');
  assert.equal(JSON.stringify(comments.body).includes('bob'), false);
  assert.equal(JSON.stringify({ ...browseBody, ...read.body, ...comments.body }).includes('@'), false, '이메일 꼴이 나가지 않는다');
});

test('자동 공개 행은 둘러보기 스위치로 바꿀 수 없다(소개 여부는 서버가 조건으로 판단)', async () => {
  const h = await setup();
  const tree = treeWithMoments(3);
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 0, clientKey: 'seed-8' });
  const [auto] = await h.shareRepo.list({ productId: PRODUCT, subjectId: 'alice' });
  const off = await h.request(h.shareHandle, 'DELETE', `/api/shares/${auto.shareId}/discovery`, null, 'alice');
  assert.equal(off.status, 409);
  assert.equal(off.body.error.code, 'share_auto_managed');
  assert.equal((await h.browse()).items.length, 1, '그래도 둘러보기에는 나온다');
});
