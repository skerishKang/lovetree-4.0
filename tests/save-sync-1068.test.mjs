import test from 'node:test';
import assert from 'node:assert/strict';
// #1068 B-12: 저장 응답이 공유 동기화·무대 색인을 기다리지 않게 한다 — 1단계(바뀐 트리만 갱신).
// 동기화는 바뀐 트리에만 갱신 질의를 내야 한다: 질의 수가 바뀐 트리 수에 비례한다(질의 수 단정).
// '숨겨야 하는' 변경(트리를 빼는 저장)은 저장 응답 시점에 이미 반영돼야 한다 — 응답 뒤의
// 다음 공개 조회에서 바로 막힌다. 회수·소개 정리·무대 색인 재조정은 좁히지 않고 응답 전에 끝낸다.
import { createTree, addMoment } from '../src/domain.js';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { createMemoryShareRepo } from '../server/testing/memory-share-repo.js';
import { createShareService } from '../server/share-service.js';
import { createMemoryShareSyncPendingRepo } from '../server/testing/memory-share-sync-pending-repo.js';
import { createMemoryTreeDiscoverRepo } from '../server/testing/memory-tree-discover-repo.js';
import { ApiError } from '../server/errors.js';

const PRODUCT = 'lovetree-test', CLOCK = '2026-11-01T00:00:00.000Z';
const principal = subjectId => ({ productId: PRODUCT, subjectId });

function treeWithMoments(count) {
  let tree = createTree({ subject: '윤슬', title: '첫 장면', note: '기록', emotion: '설렘', date: '2026-11-01', url: '' }, CLOCK);
  for (let i = 1; i < count; i += 1) {
    tree = addMoment(tree, { subject: '윤슬', title: `순간 ${i + 1}`, note: '기록', emotion: '위로', date: '2026-11-02', url: '' }, tree.moments[0].id, CLOCK);
  }
  return tree;
}

// 실제 메모리 저장소를 그대로 쓰고 갱신 질의만 센다 — 질의 수 단정은 이 카운터로 한다.
const QUERY_NAMES = ['create', 'load', 'allForProduct', 'list', 'setDiscoverable', 'revoke', 'updateMomentCount', 'upsertAutoShare', 'revokeSharesNotIn'];
function countingShareRepo() {
  const inner = createMemoryShareRepo();
  const queries = {};
  const repo = {};
  for (const name of QUERY_NAMES) {
    repo[name] = async input => {
      queries[name] = (queries[name] ?? 0) + 1;
      return inner[name](input);
    };
  }
  const forgetQueries = () => { for (const name of QUERY_NAMES) queries[name] = 0; };
  return { repo, queries, forgetQueries };
}

async function setup() {
  const workspaceRepo = createMemoryWorkspaceRepo();
  const { repo: shareRepo, queries, forgetQueries } = countingShareRepo();
  let n = 0;
  const shareService = createShareService({
    shareRepo, workspaceRepo, productId: PRODUCT,
    makeId: () => String(++n).padStart(24, 'a')
  });
  const workspace = createWorkspaceService({
    repo: workspaceRepo, productId: PRODUCT,
    onCommit: ({ subjectId, changedTreeIds }) => shareService.syncSharesAfterSave(subjectId, changedTreeIds)
  });
  return { workspace, shareRepo, queries, forgetQueries, shareService };
}

test('트리 50개 문서의 첫 저장은 트리 수만큼 질의하고, 1개만 바꿔 다시 저장하면 갱신 질의가 1개 트리 분량이다(#1068 판정)', async () => {
  const h = await setup();
  const trees = Array.from({ length: 50 }, () => treeWithMoments(3));
  await h.workspace.write(principal('alice'), { state: { version: 1, trees }, expectedRevision: 0, clientKey: 'seed-50' });
  // 첫 저장은 모든 트리가 새 트리 — 질의 수가 트리 수에 비례한다.
  assert.equal(h.queries.updateMomentCount, 50, '첫 저장: 트리 50개 갱신 질의 50회');
  assert.equal(h.queries.upsertAutoShare, 50, '첫 저장: 자동 공개 행 50개 만들기');

  h.forgetQueries();
  // 1개 트리만 바꿔 다시 저장 — 갱신 질의는 바뀐 트리 1개 분량이다.
  const edited = addMoment(trees[7], { subject: '윤슬', title: '새 순간', note: '기록', emotion: '위로', date: '2026-11-03', url: '' }, trees[7].moments[0].id, CLOCK);
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: trees.map((tree, index) => index === 7 ? edited : tree) }, expectedRevision: 1, clientKey: 'edit-one' });
  assert.deepEqual(h.queries, { create: 0, load: 0, allForProduct: 0, list: 1, setDiscoverable: 0, revoke: 0, updateMomentCount: 1, upsertAutoShare: 0, revokeSharesNotIn: 1 },
    '갱신 질의는 바뀐 트리 1개 분량(수 갱신 1·자동 행 0), 전체 대조는 상수(목록 1·회수 1)');
  // 바뀐 트리의 순간 수만 갱신된다 — 나머지 49개 트리의 행 값은 이미 맞게 남아 있다.
  const rows = await h.shareRepo.list({ productId: PRODUCT, subjectId: 'alice' });
  assert.equal(rows.find(row => row.treeId === edited.id).momentCount, 4, '바뀐 트리의 순간 수가 갱신된다');
  assert.equal(rows.filter(row => row.status === 'active').length, 50, '나머지 트리의 자동 공개 행은 그대로다');
});

test('트리를 빼고 저장하면 응답 시점에 이미 공개가 막힌다 — 숨김은 저장 응답 전에 끝난다(#1068 판정)', async () => {
  const h = await setup();
  const trees = Array.from({ length: 50 }, () => treeWithMoments(3));
  await h.workspace.write(principal('alice'), { state: { version: 1, trees }, expectedRevision: 0, clientKey: 'seed-50' });
  const gone = (await h.shareRepo.list({ productId: PRODUCT, subjectId: 'alice' })).find(row => row.treeId === trees[3].id);
  assert.equal(gone.status, 'active');

  // 트리 1개를 빼고 저장 — 응답이 돌아온 시점에 이미 회수돼 있어야 한다.
  h.forgetQueries();
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: trees.filter((tree, index) => index !== 3) }, expectedRevision: 1, clientKey: 'remove-one' });
  assert.deepEqual(h.queries, { create: 0, load: 0, allForProduct: 0, list: 1, setDiscoverable: 0, revoke: 0, updateMomentCount: 0, upsertAutoShare: 0, revokeSharesNotIn: 1 },
    '빠진 트리는 갱신 대상이 아니고 남은 49개 트리는 질의 없이, 회수 대조 1회로 내려간다');
  const after = await h.shareRepo.load({ productId: PRODUCT, shareId: gone.shareId });
  assert.equal(after.status, 'revoked', '응답 시점에 공유 행이 이미 회수돼 있다');
  // 응답 뒤의 다음 공개 조회에서 바로 막힌다.
  await assert.rejects(
    () => h.shareService.read(gone.shareId),
    error => error instanceof ApiError && error.status === 410
  );
});


// #1163(#1068 2단계): 숨김은 응답 전, 보임은 응답 뒤. 응답 뒤 일은 요청 문맥의 afterResponse 에 담긴다.
async function setupDeferred({ failVisible = 0, delayVisible = 0 } = {}) {
  const workspaceRepo = createMemoryWorkspaceRepo();
  const inner = createMemoryShareRepo();
  const discoverRepo = createMemoryTreeDiscoverRepo();
  const pendingRepo = createMemoryShareSyncPendingRepo();
  let left = failVisible;
  const shareRepo = { ...inner, async updateMomentCount(input) {
    if (left > 0) { left -= 1; throw new Error('보임 동기화 일부러 실패'); }
    return inner.updateMomentCount(input);
  } };
  let n = 0;
  const shareService = createShareService({
    shareRepo, workspaceRepo, discoverRepo, pendingRepo, productId: PRODUCT,
    makeId: () => String(++n).padStart(24, 'a')
  });
  const workspace = createWorkspaceService({
    repo: workspaceRepo, productId: PRODUCT,
    onCommit: ({ subjectId, changedTreeIds }) => shareService.syncSharesBeforeResponse(subjectId, changedTreeIds),
    onAfterResponse: async ({ subjectId, changedTreeIds, retry }) => {
      if (delayVisible) await new Promise((resolve) => setTimeout(resolve, delayVisible));
      if (retry) return shareService.retrySharesAfterResponse(subjectId);
      return shareService.syncSharesAfterResponse(subjectId, changedTreeIds);
    }
  });
  return { workspace, shareRepo, discoverRepo, pendingRepo, shareService };
}

test('보임 동기화가 실패해도 저장 응답은 200이고, 다음 요청에서 다시 해서 반영된다(#1163 판정 1)', async () => {
  const h = await setupDeferred({ failVisible: 1 });
  const tree = treeWithMoments(2);
  const first = { afterResponse: [] };
  const saved = await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 0, clientKey: 'after-1' }, first);
  assert.equal(saved.revision, 1, '보임 동기화 전에 저장 응답이 나갔다');
  assert.equal(first.afterResponse.length, 1, '보임 일이 응답 뒤로 넘어갔다');
  await first.afterResponse[0]();
  assert.equal(await h.pendingRepo.has({ productId: PRODUCT, subjectId: 'alice' }), true, '실패하면 계정 표식이 남는다');
  assert.deepEqual(await h.shareRepo.list({ productId: PRODUCT, subjectId: 'alice' }), [], '아직 보임이 반영되지 않았다');

  const second = { afterResponse: [] };
  await h.workspace.read(principal('alice'), second);
  assert.equal(second.afterResponse.length, 1, '표식이 있는 계정은 다음 조회에서 다시 시도한다');
  await second.afterResponse[0]();
  const rows = await h.shareRepo.list({ productId: PRODUCT, subjectId: 'alice' });
  assert.equal(rows.length, 1, '다음 요청에서 자동 공개 행이 만들어졌다');
  assert.equal(rows[0].momentCount, 2, '순간 수가 반영됐다');
  assert.equal(await h.pendingRepo.has({ productId: PRODUCT, subjectId: 'alice' }), false, '성공하면 표식이 해제된다');
});

test('숨김 3가지는 응답 시점에 이미 반영돼 있다(#1163 판정 2)', async () => {
  const h = await setupDeferred();
  const a = treeWithMoments(2), b = treeWithMoments(3);
  const context = { afterResponse: [] };
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [a, b] }, expectedRevision: 0, clientKey: 'after-2' }, context);
  await context.afterResponse[0]();
  await h.discoverRepo.set({ productId: PRODUCT, subjectId: 'alice', treeId: b.id, discover: true });
  const removed = (await h.shareRepo.list({ productId: PRODUCT, subjectId: 'alice' })).find(row => row.treeId === b.id);
  assert.equal(removed.status, 'active');

  const next = { afterResponse: [] };
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [a] }, expectedRevision: 1, clientKey: 'after-2-remove' }, next);
  // 응답 뒤 일을 돌리기 전에 이미 숨김은 끝나 있다.
  assert.equal((await h.shareRepo.load({ productId: PRODUCT, shareId: removed.shareId })).status, 'revoked', '공유 회수가 응답 전에 끝났다');
  assert.equal((await h.discoverRepo.get({ productId: PRODUCT, subjectId: 'alice', treeId: b.id })).discover, false, '소개 정리가 응답 전에 끝났다');
  assert.equal(next.afterResponse.length, 1, '보임 일만 응답 뒤에 남았다');
});

test('보임 동기화에 가짜 지연을 넣어도 저장 응답 시간은 늘지 않는다(#1163 판정 3)', async () => {
  const h = await setupDeferred({ delayVisible: 300 });
  const tree = treeWithMoments(2);
  const context = { afterResponse: [] };
  const started = Date.now();
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 0, clientKey: 'after-3' }, context);
  const saveMs = Date.now() - started;
  assert.ok(saveMs < 200, `저장 응답이 지연을 기다리지 않았다(${saveMs}ms)`);
  const later = Date.now();
  await context.afterResponse[0]();
  assert.ok(Date.now() - later >= 280, '응답 뒤 일은 실제로 지연된다');
});
