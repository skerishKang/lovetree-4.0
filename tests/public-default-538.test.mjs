import test from 'node:test';
import assert from 'node:assert/strict';
// #538 공개가 기본: 비공개는 누구나 무료(본인 트리만, #830). 저장 성공 뒤 같은 훅에서 자동 공유 행과 moment_count를 동기화한다.
// 2026-11-16 대표 결정으로 '둘러보기 소개'는 기본 꼬짐이 됐다 — 고객이 켜야 둘러보기·다른 팬 보기에 나오고(무료),
// 마이그레이션은 지금 나오던 트리를 켜짐으로 채운다. 이 파일의 나열 시험은 그 결정을 따른다.
import { createTree, addMoment, removeMoment } from '../src/domain.js';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { createMemoryShareRepo } from '../server/testing/memory-share-repo.js';
import { createMemoryTreeVisibilityRepo } from '../server/testing/memory-tree-visibility-repo.js';
import { createMemoryTreeDiscoverRepo } from '../server/testing/memory-tree-discover-repo.js';
import { createMemoryCommunityRepo } from '../server/testing/memory-community-repo.js';
import { createShareHandler, createShareService } from '../server/share-service.js';
import { createCommunityHandler, createCommunityService } from '../server/community-service.js';
import { ROLE_TESTER } from '../server/admin-roles.js';
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

async function setup({ roles = {}, stageIndex = null } = {}) {
  const workspaceRepo = createMemoryWorkspaceRepo();
  const shareRepo = createMemoryShareRepo();
  const visibilityRepo = createMemoryTreeVisibilityRepo();
  const discoverRepo = createMemoryTreeDiscoverRepo();
  const communityRepo = createMemoryCommunityRepo({
    // #538: 메모리 모형도 비공개 트리를 둘러보기에서 뺀다(PostgreSQL SQL 은 NOT EXISTS 로 같은 조건).
    isPrivateTree: (productId, subjectId, treeId) => visibilityRepo.isPrivate(productId, subjectId, treeId),
    // 2026-11-16 대표 결정: 소개가 켜진 트리만 둘러보기·다른 팬 보기 후보다(PostgreSQL SQL 은 EXISTS 로 같은 조건).
    isDiscoverOn: (productId, subjectId, treeId) => discoverRepo.isOn(productId, subjectId, treeId)
  });
  let n = 0;
  const shareService = createShareService({
    shareRepo, workspaceRepo, visibilityRepo, discoverRepo, stageIndex, productId: PRODUCT,
    makeId: () => String(++n).padStart(24, 'a')
  });
  const workspace = createWorkspaceService({
    repo: workspaceRepo, productId: PRODUCT,
    onCommit: ({ subjectId, changedTreeIds }) => shareService.syncSharesAfterSave(subjectId, changedTreeIds)
  });
  const communityService = createCommunityService({
    communityRepo, shareRepo, workspaceRepo, visibilityRepo, stageIndex, productId: PRODUCT,
    admin: { roleFor: async value => roles[value.subjectId] ?? (value.subjectId === 'admin' ? 'admin' : null) },
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
  // 둘러보기 소개 켜기(2026-11-16 대표 결정 — 기본 꼬짐, 고객이 켠다). 실제 API 경로를 그대로 밟는다.
  const discoverOn = async (tree, who = 'alice') =>
    request(shareHandle, 'PUT', `/api/trees/${tree.id}/discover`, { discover: true }, who);
  return { workspace, workspaceRepo, shareRepo, visibilityRepo, discoverRepo, shareService, shareHandle, communityHandle, request, browse, discoverOn };
}

test('오래된 저장 요청을 재시도해도 현재 트리의 공유와 소개 동의가 유지된다', async () => {
  const h = await setup();
  const who = principal('alice'), oldTree = treeWithMoments(1), currentTree = treeWithMoments(3);
  const first = { state: { version: 1, trees: [oldTree] }, expectedRevision: 0, clientKey: 'old-seed' };
  await h.workspace.write(who, first);
  await h.workspace.write(who, { state: { version: 1, trees: [currentTree] }, expectedRevision: 1, clientKey: 'next-seed' });
  await h.discoverOn(currentTree);
  await h.workspace.write(who, first);
  const shares = await h.shareService.list('alice');
  assert.equal(shares.find(row => row.treeId === oldTree.id).status, 'revoked');
  assert.deepEqual(shares.filter(row => row.status === 'active').map(row => [row.treeId, row.discover]), [[currentTree.id, true]]);
});

test('무대 소속 갱신이 실패해도 저장·공개·회수·운영 숨김·복구·삭제 결과를 반환한다', async (t) => {
  const calls = [];
  const logger = t.mock.method(console, 'error', () => {});
  const h = await setup({ stageIndex: { async reconcile(input) { calls.push(input); throw new Error('test failure'); } } });
  const owner = principal('alice'), tree = treeWithMoments(3);
  await h.workspace.write(owner, { state: { version: 1, trees: [tree] }, expectedRevision: 0, clientKey: 'indexed-save' });
  assert.equal((await h.discoverOn(tree)).status, 200);
  assert.equal((await h.shareService.setTreeVisibility('alice', tree.id, 'public')).visibility, 'public');
  const input = { treeId: tree.id };
  const preview = await h.shareService.projection('alice', input);
  const made = await h.shareService.create('alice', { ...input, previewToken: preview.previewToken });
  assert.equal((await h.shareService.revoke('alice', made.share.id)).status, 'revoked');

  const [active] = (await h.shareService.list('alice')).filter(row => row.status === 'active');
  const report = await h.request(h.communityHandle, 'POST', `/api/community/shares/${active.id}/report`,
    { reason: '확인이 필요해요' }, 'bob', 'stage-report-1');
  assert.equal(report.status, 201);
  for (const [status, visibility] of [['resolved', 'hidden'], ['dismissed', 'visible']]) {
    const result = await h.request(h.communityHandle, 'PATCH', `/api/community/admin/reports/${report.body.report.id}`,
      { status, visibility }, 'admin');
    assert.equal(result.body.report.hidden, visibility === 'hidden');
  }
  await h.workspace.write(owner, { state: { version: 1, trees: [] }, expectedRevision: 1, clientKey: 'tree-gone' });
  assert.deepEqual(calls, Array(8).fill(owner));
  assert.equal(logger.mock.callCount(), calls.length);
  assert.ok(logger.mock.calls.every(call => call.arguments.length === 1 && !call.arguments[0].includes('test failure')));
});

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
  // 2026-11-16 대표 결정: 자동 공개 행이 생겨도 소개가 꺼져 있으면 둘러보기에 나오지 않는다.
  assert.deepEqual((await h.browse()).items, [], '소개가 꺼진 새 트리는 둘러보기에 나오지 않는다(기본 꺼짐)');
});

test('둘러보기 소개는 기본 꺼짐 — 켜면 나오고 끄면 빠진다(2026-11-16 대표 결정)', async () => {
  const h = await setup();
  const tree = treeWithMoments(3, { url: 'https://i.ytimg.com/vi/abc/hqdefault.jpg' });
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 0, clientKey: 'seed-1' });
  // 기본값 확인: GET 은 꺼짐을 돌려준다.
  const before = await h.request(h.shareHandle, 'GET', `/api/trees/${tree.id}/discover`, null, 'alice');
  assert.equal(before.status, 200);
  assert.deepEqual(before.body, { treeId: tree.id, discover: false }, '새 트리의 소개는 기본 꺼짐이다');
  assert.deepEqual((await h.browse()).items, [], '꺼져 있으면 둘러보기 목록에 없다');
  // 켜기: 응답에 지금 상태를 돌려준다.
  const on = await h.discoverOn(tree);
  assert.equal(on.status, 200);
  assert.deepEqual(on.body, { treeId: tree.id, discover: true }, '켜기 응답에 지금 상태가 있다');
  const items = (await h.browse()).items;
  assert.equal(items.length, 1, '켜면 둘러보기 목록에 나온다');
  assert.equal(items[0].momentCount, 3);
  // 끄기: 다시 빠진다.
  const off = await h.request(h.shareHandle, 'PUT', `/api/trees/${tree.id}/discover`, { discover: false }, 'alice');
  assert.deepEqual(off.body, { treeId: tree.id, discover: false }, '끄기 응답에 지금 상태가 있다');
  assert.deepEqual((await h.browse()).items, [], '끄면 둘러보기 목록에서 빠진다');
  // 공유 상태 응답에도 소개 여부가 들어간다 — 화면이 스위치 값을 여기서 본다.
  await h.discoverOn(tree);
  const shares = await h.request(h.shareHandle, 'GET', '/api/shares', null, 'alice');
  assert.equal(shares.body.shares[0].discover, true, '공유 상태 응답에 소개 여부가 있다');
  // 공개 상태 응답에도 소개 여부가 들어간다.
  const vis = await h.request(h.shareHandle, 'GET', `/api/trees/${tree.id}/visibility`, null, 'alice');
  assert.equal(vis.body.discover, true, '공개 상태 응답에도 소개 여부가 있다');
});

test('남의 트리 소개는 못 바꾼다 — 본인 트리만 켜고 끈다', async () => {
  const h = await setup();
  const tree = treeWithMoments(3);
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 0, clientKey: 'seed-other' });
  const other = await h.request(h.shareHandle, 'PUT', `/api/trees/${tree.id}/discover`, { discover: true }, 'bob');
  assert.equal(other.status, 404, '남의 트리는 내 트리 목록에 없는 것과 같다(상태 노출 금지)');
  assert.deepEqual((await h.browse()).items, [], '남의 요청으로 켜지지 않는다');
});

test('tester 트리는 소개를 켜도 둘러보기에 나오지 않는다(#678 후속 규칙 유지)', async () => {
  const h = await setup({ roles: { alice: ROLE_TESTER } });
  const tree = treeWithMoments(3);
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 0, clientKey: 'seed-tester' });
  const on = await h.discoverOn(tree);
  assert.equal(on.status, 200, '켜기 자체는 본인 트리라 허용된다');
  assert.deepEqual((await h.browse()).items, [], 'tester 트리는 켜도 목록에 나오지 않는다');
});

test('기존에 둘러보기에 나오던 트리는 migration(백필) 뒤에도 나온다 — 켜짐으로 채워진다', async () => {
  const h = await setup();
  const tree = treeWithMoments(3);
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 0, clientKey: 'seed-backfill' });
  // migration tree-discover-optin-261116.sql 의 백필과 같은 자리 — '지금 나오던 트리'를 켜짐으로 채운다.
  // (메모리 모형에서는 백필 결과를 저장소에 직접 심는 것으로 같은 상태를 만든다.)
  await h.discoverRepo.set({ productId: PRODUCT, subjectId: 'alice', treeId: tree.id, discover: true });
  const state = await h.request(h.shareHandle, 'GET', `/api/trees/${tree.id}/discover`, null, 'alice');
  assert.equal(state.body.discover, true, '백필된 트리는 켜짐으로 보인다');
  assert.equal((await h.browse()).items.length, 1, 'migration 뒤에도 기존 공개 트리는 목록에 나온다');
});

test('순간 2개면 둘러보기에 나오지 않고, 3개부터 나온다 — 직접 올린 사진만 있는 순간도 센다', async () => {
  const h = await setup();
  let tree = treeWithMoments(2, { url: MEDIA });
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 0, clientKey: 'seed-2' });
  await h.discoverOn(tree); // 이 시험은 나열 조건(3개 경계)을 보는 것 — 소개를 켠다
  assert.deepEqual((await h.browse()).items, [], '순간 2개는 소개 대상이 아니다');
  tree = addMoment(tree, { subject: '윤슬', title: '직접 찍은 순간', note: '사진만', emotion: '고마움', date: '2026-11-03', url: MEDIA }, tree.moments[0].id, CLOCK);
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 1, clientKey: 'add-3' });
  const items = (await h.browse()).items;
  assert.equal(items.length, 1, '직접 올린 사진만 있는 순간도 순간 수에 센다');
  assert.equal(items[0].momentCount, 3);
  assert.equal(items[0].cover.url, '', '공개 카드 대표 그림은 올린 사진을 쓰지 않는다(#427 전까지)');
});

test('비공개는 누구나 무료로 바꿀 수 있다 — 둘러보기·공유 링크에서는 빠지고 내 서재에는 남는다(#830)', async () => {
  const h = await setup();
  const tree = treeWithMoments(3);
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 0, clientKey: 'seed-3' });
  await h.discoverOn(tree); // 켠 뒤 비공개를 본다
  const [auto] = await h.shareRepo.list({ productId: PRODUCT, subjectId: 'alice' });
  assert.equal((await h.browse()).items.length, 1, '켜면 둘러보기에 나온다');
  const made = await h.request(h.shareHandle, 'PUT', `/api/trees/${tree.id}/visibility`, { visibility: 'private' }, 'alice');
  assert.equal(made.status, 200, '무료 계정도 비공개 지정이 성공한다');
  assert.equal(made.body.visibility, 'private');
  const state = await h.request(h.shareHandle, 'GET', `/api/trees/${tree.id}/visibility`, null, 'alice');
  assert.equal(state.body.visibility, 'private', '바꾼 상태가 유지된다');
  assert.deepEqual((await h.browse()).items, [], '비공개 트리는 공개 목록에 나오지 않는다');
  const read = await h.request(h.shareHandle, 'GET', `/api/public/shares/${auto.shareId}`);
  assert.equal(read.status, 403, '비공개 트리는 공유 링크로도 안 보인다');
  assert.equal(read.body.error.code, 'share_private');
  // 남의 트리는 여전히 바꿀 수 없다 — 내 목록에 없는 것과 같다.
  const other = await h.request(h.shareHandle, 'PUT', `/api/trees/${tree.id}/visibility`, { visibility: 'private' }, 'bob');
  assert.equal(other.status, 404, '남의 트리 비공개 지정은 거절된다');
  // 내 서재(내 기록)에는 그대로 보인다.
  const mine = await h.workspaceRepo.load({ productId: PRODUCT, subjectId: 'alice' });
  assert.equal(mine.doc.trees.some(t => t.id === tree.id), true, '비공개여도 내 기록에는 남는다');
});

test('주인이 트리를 지우면 자동 공개도 즉시 내려간다', async () => {
  const h = await setup();
  const tree = treeWithMoments(3);
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 0, clientKey: 'seed-4' });
  await h.discoverOn(tree);
  const [auto] = await h.shareRepo.list({ productId: PRODUCT, subjectId: 'alice' });
  assert.equal((await h.browse()).items.length, 1);
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [] }, expectedRevision: 1, clientKey: 'tree-gone' });
  const shares = await h.shareRepo.list({ productId: PRODUCT, subjectId: 'alice' });
  assert.equal(shares[0].status, 'revoked', '자동 공개 행이 함께 내려간다');
  assert.deepEqual((await h.browse()).items, []);
  const read = await h.request(h.shareHandle, 'GET', `/api/public/shares/${auto.shareId}`);
  assert.equal(read.status, 410, '공개 읽기도 즉시 막힌다');
});

test('주인이 지운 트리의 주인 만든 공유 행도 회수하고 소개 행도 지운다 — 유령 공유 행을 남기지 않는다', async () => {
  const h = await setup();
  const gone = treeWithMoments(3);
  const kept = treeWithMoments(3);
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [gone, kept] }, expectedRevision: 0, clientKey: 'seed-ghost' });
  // 두 트리 모두 소개를 켜고, 각각 주인이 만든 공유 링크를 하나씩 만든다.
  await h.discoverOn(gone);
  await h.discoverOn(kept);
  const ownerShare = async tree => {
    const preview = await h.request(h.shareHandle, 'POST', '/api/shares/preview', { treeId: tree.id, entryMomentId: tree.moments[0].id, view: 'book' }, 'alice');
    const made = await h.request(h.shareHandle, 'POST', '/api/shares', { treeId: tree.id, entryMomentId: tree.moments[0].id, view: 'book', previewToken: preview.body.preview.previewToken }, 'alice');
    assert.equal(made.status, 201);
    return made.body.share.id;
  };
  const goneShareId = await ownerShare(gone);
  const keptShareId = await ownerShare(kept);
  // 남은 트리의 자동 공개 행 id — 둘러보기는 트리당 한 행(auto 우선)을 뽑으므로 어느 쪽 행이 나와도
  // 남은 트리의 것인지만 보면 된다.
  const keptAutoId = (await h.shareRepo.list({ productId: PRODUCT, subjectId: 'alice' }))
    .find(rowValue => rowValue.treeId === kept.id && rowValue.origin === 'auto').shareId;
  assert.equal((await h.browse()).items.length, 2);
  assert.equal((await h.shareRepo.load({ productId: PRODUCT, shareId: goneShareId })).status, 'active');

  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [kept] }, expectedRevision: 1, clientKey: 'tree-gone' });

  // 지워진 트리: 주인 만든 공유 행도 revoked, 소개 행도 없다(유령이 남지 않는다).
  assert.equal((await h.shareRepo.load({ productId: PRODUCT, shareId: goneShareId })).status, 'revoked', '주인 만든 공유 행도 회수된다');
  assert.equal((await h.discoverRepo.get({ productId: PRODUCT, subjectId: 'alice', treeId: gone.id })).discover, false, '소개 행도 지워진다');
  // 남은 트리: 주인 만든 공유 행과 소개 행이 그대로 살아 있다.
  assert.equal((await h.shareRepo.load({ productId: PRODUCT, shareId: keptShareId })).status, 'active', '남은 트리의 공유 행은 그대로다');
  assert.equal((await h.discoverRepo.get({ productId: PRODUCT, subjectId: 'alice', treeId: kept.id })).discover, true, '남은 트리의 소개 행은 그대로다');
  const browse = await h.browse();
  assert.equal(browse.items.length, 1, '둘러보기에는 남은 트리만 나온다');
  assert.ok([keptAutoId, keptShareId].includes(browse.items[0].shareId), '남은 트리의 공유 행으로 나온다(지워진 트리의 행은 아니다)');
  const read = await h.request(h.shareHandle, 'GET', `/api/public/shares/${goneShareId}`);
  assert.equal(read.status, 410, '지워진 트리의 공유는 공개 읽기에서도 막힌다');
});

test('moment_count는 저장 때마다 갱신된다 — 순간 추가·삭제·주인 만든 공유 행도 함께', async () => {
  const h = await setup();
  let tree = treeWithMoments(3);
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 0, clientKey: 'seed-5' });
  await h.discoverOn(tree);
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
  await h.discoverOn(tree);
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
  await h.discoverOn(tree);
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
  await h.discoverOn(tree);
  const [auto] = await h.shareRepo.list({ productId: PRODUCT, subjectId: 'alice' });
  const off = await h.request(h.shareHandle, 'DELETE', `/api/shares/${auto.shareId}/discovery`, null, 'alice');
  assert.equal(off.status, 409);
  assert.equal(off.body.error.code, 'share_auto_managed');
  assert.equal((await h.browse()).items.length, 1, '그래도 둘러보기에는 나온다');
});

// #986 후속(CTO 결정): 격리된 트리는 자동 공유하지 않는다. 정상 트리는 지금처럼 자동 공유되고,
// 격리 트리에 이미 공유·소개 행이 있으면 해제하지 않는다 — 사용자가 트리를 고쳐 저장하면 살아난다.
function deviantTree() {
  const tree = createTree({ subject: '어긋남', title: '어긋난 옛 트리', note: '', emotion: '설렘', date: '2026-11-01', url: '' }, CLOCK);
  return { ...tree, moments: [...tree.moments, { ...tree.moments[0], id: 'moment-second-root', parentId: null }] };
}

test('격리 트리가 섞인 문서를 저장하면 격리 트리는 자동 공유되지 않고 정상 트리는 지금처럼 공유된다', async () => {
  const h = await setup();
  const good = treeWithMoments(2);
  const deviant = deviantTree();
  await h.workspaceRepo.commit({
    productId: PRODUCT, subjectId: 'alice',
    doc: { version: 1, trees: [good, deviant] },
    expectedRevision: 0, clientKey: 'seed-quarantined', requestHash: '0'.repeat(64)
  });
  // 이미 공유 행이 있던 격리 트리 — 해제하지 않는지 함께 본다.
  await h.shareRepo.create({ productId: PRODUCT, subjectId: 'alice', shareId: 'share-quarantined', treeId: deviant.id, entryMomentId: deviant.moments[0].id, view: 'book', momentCount: 2 });

  // 실제 저장 경로(onCommit → syncSharesAfterSave)를 밟는다.
  const grown = addMoment(good, { subject: '윤슬', title: '새 순간', note: '기록', emotion: '설렘', date: '2026-11-02', url: '' }, good.moments[0].id, CLOCK);
  const saved = await h.workspace.write(principal('alice'), { state: { version: 1, trees: [grown] }, expectedRevision: 1, clientKey: 'k-share' });
  assert.equal(saved.revision, 2);

  const rows = await h.shareRepo.list({ productId: PRODUCT, subjectId: 'alice' });
  const auto = rows.filter(row => row.origin === 'auto' && row.status === 'active');
  assert.deepEqual(auto.map(row => row.treeId), [grown.id], '자동 공유 행은 정상 트리에만 생긴다');
  assert.equal(auto.find(row => row.treeId === grown.id).momentCount, 3, '정상 트리의 순간 수는 지금처럼 갱신된다');
  const quarantined = rows.find(row => row.treeId === deviant.id);
  assert.equal(quarantined.status, 'active', '격리 트리의 기존 공유 행은 해제하지 않는다');
  assert.equal(quarantined.treeId, deviant.id);
});

test('#1046: 공유 취소 뒤 저장이 있어도 옛 자동 주소는 410으로 남고, 직접 다시 공유만 새 주소를 연다', async () => {
  const h = await setup();
  const tree = treeWithMoments(3);
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 0, clientKey: 'seed-revoke-1046' });
  const [auto] = await h.shareRepo.list({ productId: PRODUCT, subjectId: 'alice' });
  assert.equal(auto.status, 'active', '처음엔 자동 공개가 열려 있다');
  const oldId = auto.shareId;
  assert.equal((await h.request(h.shareHandle, 'GET', `/api/public/shares/${oldId}`)).status, 200);

  assert.equal((await h.shareService.revoke('alice', oldId)).status, 'revoked');
  assert.equal((await h.request(h.shareHandle, 'GET', `/api/public/shares/${oldId}`)).status, 410, '취소 직후 차단');

  // 아무 저장이나 한 번 — 저장 뒤 동기화가 같은 주소를 다시 켜지 않는다.
  const grown = addMoment(tree, { subject: '윤슬', title: '새 순간', note: '기록', emotion: '위로', date: '2026-11-02', url: '' }, tree.moments[0].id, CLOCK);
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [grown] }, expectedRevision: 1, clientKey: 'save-after-revoke-1046' });
  const still = await h.shareRepo.load({ productId: PRODUCT, shareId: oldId });
  assert.equal(still.status, 'revoked', '저장 뒤에도 자동 행이 되살아나지 않는다');
  assert.ok(still.revokedAt, '주인이 내림 표식이 남는다');
  assert.equal((await h.request(h.shareHandle, 'GET', `/api/public/shares/${oldId}`)).status, 410, '공개 읽기가 계속 410');

  // 다시 공유는 공유 창에서 직접 켤 때만 — 새 주소로 열리고 옛 주소는 그대로 막힌다.
  const input = { treeId: grown.id, entryMomentId: grown.moments[0].id, view: 'book' };
  const preview = await h.request(h.shareHandle, 'POST', '/api/shares/preview', input, 'alice');
  const made = await h.request(h.shareHandle, 'POST', '/api/shares', { ...input, previewToken: preview.body.preview.previewToken }, 'alice');
  assert.equal(made.status, 201);
  assert.notEqual(made.body.share.id, oldId, '직접 공유는 새 주소를 만든다');
  assert.equal((await h.request(h.shareHandle, 'GET', `/api/public/shares/${made.body.share.id}`)).status, 200, '새 주소는 열린다');
  assert.equal((await h.request(h.shareHandle, 'GET', `/api/public/shares/${oldId}`)).status, 410, '옛 주소는 여전히 410');
});
