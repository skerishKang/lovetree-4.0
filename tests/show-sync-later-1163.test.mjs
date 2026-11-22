import test from 'node:test';
import assert from 'node:assert/strict';
// #1163(#1068 2단계): 보이게 하는 동기화를 저장 응답 뒤로 미루고, 실패하면 계정별 표식으로 다시 한다.
// 판정: ① 보임 동기화가 실패해도 저장 응답은 성공하고, 다음 요청에서 다시 해서 반영된다.
// ② 숨김(회수·소개 정리)은 보임 실패와 무관하게 저장 응답 시점에 이미 반영돼 있다.
// ③ 저장 응답은 보임 동기화를 기다리지 않는다(가짜 지연으로 확인).
import { createTree, addMoment } from '../src/domain.js';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { createMemoryShareRepo } from '../server/testing/memory-share-repo.js';
import { createMemoryTreeVisibilityRepo } from '../server/testing/memory-tree-visibility-repo.js';
import { createMemoryShareShowPendingRepo } from '../server/testing/memory-share-show-pending-repo.js';
import { createShareService } from '../server/share-service.js';
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

async function setup({ failFirstUpdate = false, updateDelayMs = 0 } = {}) {
  const workspaceRepo = createMemoryWorkspaceRepo();
  const inner = createMemoryShareRepo();
  const visibilityRepo = createMemoryTreeVisibilityRepo();
  let updateCalls = 0, listCalls = 0, failListCount = 0;
  const shareRepo = {
    create: i => inner.create(i), load: i => inner.load(i), allForProduct: i => inner.allForProduct(i),
    setDiscoverable: i => inner.setDiscoverable(i), revoke: i => inner.revoke(i),
    revokeSharesNotIn: i => inner.revokeSharesNotIn(i),
    async list(input) {
      listCalls += 1;
      if (failListCount) { failListCount -= 1; throw new Error('test failure'); }
      return inner.list(input);
    },
    async updateMomentCount(input) {
      updateCalls += 1;
      if (updateDelayMs) await new Promise(resolve => setTimeout(resolve, updateDelayMs));
      if (failFirstUpdate && updateCalls === 1) throw new Error('test failure');
      return inner.updateMomentCount(input);
    },
    async upsertAutoShare(input) { return inner.upsertAutoShare(input); }
  };
  const pendingShowSync = createMemoryShareShowPendingRepo();
  // 무대 색인 모형 — 재조정 시점의 공개 소속을 기록한다(비공개·회수는 빠진다). '응답 시점에 공개 목록에 없다' 단정용.
  const indexTrees = new Set();
  const stageIndex = {
    async reconcile({ productId, subjectId }) {
      const rows = await inner.list({ productId, subjectId });
      const kept = new Set();
      for (const row of rows) {
        if (row.status !== 'active') continue;
        if ((await visibilityRepo.get({ productId, subjectId, treeId: row.treeId })).visibility === 'private') continue;
        kept.add(row.treeId);
      }
      indexTrees.clear();
      for (const treeId of kept) indexTrees.add(treeId);
    }
  };
  let n = 0;
  const shareService = createShareService({
    shareRepo, workspaceRepo, pendingShowSync, visibilityRepo, productId: PRODUCT,
    stageIndex,
    makeId: () => String(++n).padStart(24, 'a')
  });
  const workspace = createWorkspaceService({
    repo: workspaceRepo, productId: PRODUCT,
    onCommit: ({ subjectId, changedTreeIds }) => shareService.afterSave(subjectId, changedTreeIds),
    onAccess: ({ subjectId }) => shareService.retryPendingVisibleSync(subjectId).catch(() => {})
  });
  return { workspace, shareRepo: inner, pendingShowSync, workspaceRepo, shareService, indexTrees, failNextList: () => { failListCount += 1; }, listCalls: () => listCalls };
}

test('보임 동기화가 실패해도 저장 응답은 성공하고, 다음 요청에서 다시 해서 반영된다(#1163 판정)', async () => {
  const h = await setup({ failFirstUpdate: true });
  const tree = treeWithMoments(3);
  const saved = await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 0, clientKey: 'seed-fail' });
  assert.equal(saved.revision, 1, '보임 동기화가 실패해도 저장 응답은 성공한다');
  await h.shareService.waitForShowSync();
  assert.equal(await h.pendingShowSync.has({ productId: PRODUCT, subjectId: 'alice' }), true, '실패 표식이 남는다');
  const rows = await h.shareRepo.list({ productId: PRODUCT, subjectId: 'alice' });
  assert.equal(rows.length, 0, '실패한 저장 뒤에는 자동 공개 행이 아직 없다');

  // 다음 요청(조회)에서 표식이 있는 계정의 보임 동기화를 다시 시도한다.
  await h.workspace.read(principal('alice'));
  await h.shareService.waitForShowSync();
  assert.equal(await h.pendingShowSync.has({ productId: PRODUCT, subjectId: 'alice' }), false, '다시 시도해 성공하면 표식을 해제한다');
  const again = await h.shareRepo.list({ productId: PRODUCT, subjectId: 'alice' });
  assert.equal(again.length, 1, '다시 시도해서 자동 공개 행이 생긴다');
  assert.equal(again[0].momentCount, 3);
  assert.equal(await h.workspace.read(principal('alice')).then(body => body.state.trees.length), 1, '저장된 기록은 그대로 읽힌다');
});

test('비공개·삭제 같은 숨김은 보임 실패와 무관하게 저장 응답 시점에 이미 반영된다(#1163 판정)', async () => {
  const h = await setup();
  const tree = treeWithMoments(3);
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 0, clientKey: 'seed-hide' });
  await h.shareService.waitForShowSync();
  assert.equal(await h.indexTrees.has(tree.id), true, '보임 반영 뒤 무대 색인에 소속이 있다');

  // 비공개로 바꾼다 — 응답이 돌아온 시점에 공개 목록에서 빠져 있어야 한다(저장 응답 전 색인 재조정).
  await h.shareService.setTreeVisibility('alice', tree.id, 'private');
  assert.equal(await h.indexTrees.has(tree.id), false, '비공개로 바꾼 트리의 장면은 응답 시점에 공개 목록에 없다');

  // 공개로 돌려 소속을 되찾고, 보임이 실패하도록 준비한 뒤 트리를 상태에서 빼고 저장한다.
  await h.shareService.setTreeVisibility('alice', tree.id, 'public');
  assert.equal(await h.indexTrees.has(tree.id), true, '공개로 돌리면 소속이 돌아온다');
  const made = await h.shareRepo.create({ productId: PRODUCT, subjectId: 'alice', shareId: 'owner-direct'.padEnd(24, 'x'), treeId: tree.id, entryMomentId: tree.moments[0].id, view: 'book', momentCount: 3 });
  assert.equal(made.status, 'active');
  h.failNextList(); // 이번 저장의 보임 동기화가 실패하도록 준비한다 — 숨김과는 무관하다.
  const saved = await h.workspace.write(principal('alice'), { state: { version: 1, trees: [] }, expectedRevision: 1, clientKey: 'tree-gone' });
  assert.equal(saved.revision, 2, '저장은 성공한다');
  const after = await h.shareRepo.load({ productId: PRODUCT, shareId: made.shareId });
  assert.equal(after.status, 'revoked', '응답 시점에 공유 행이 이미 회수돼 있다(보임 실패와 무관)');
  assert.equal(await h.indexTrees.has(tree.id), false, '삭제한 트리의 소속도 응답 시점에 빠져 있다');
  await h.shareService.waitForShowSync();
  assert.equal(await h.pendingShowSync.has({ productId: PRODUCT, subjectId: 'alice' }), true, '보임 동기화는 실패해 표식이 남는다');
});

test('저장 응답이 보임 동기화(수 갱신·자동 공개 행)를 기다리지 않는다(#1163 판정 — 가짜 지연)', async () => {
  const h = await setup({ updateDelayMs: 150 });
  const trees = [treeWithMoments(3), treeWithMoments(3)];
  const start = Date.now();
  await h.workspace.write(principal('alice'), { state: { version: 1, trees }, expectedRevision: 0, clientKey: 'seed-slow' });
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 150, `저장 응답이 보임 동기화 지연(수 갱신 2회 × 150ms)을 기다리지 않는다 — ${elapsed}ms`);
  const rows = await h.shareRepo.list({ productId: PRODUCT, subjectId: 'alice' });
  assert.equal(rows.length, 0, '응답 시점에는 보임 동기화가 아직 진행 중일 수 있다');
  await h.shareService.waitForShowSync();
  const done = await h.shareRepo.list({ productId: PRODUCT, subjectId: 'alice' });
  assert.equal(done.length, 2, '보임 동기화가 끝나면 자동 공개 행이 생긴다');
  assert.equal(await h.pendingShowSync.has({ productId: PRODUCT, subjectId: 'alice' }), false, '성공하면 표식이 남지 않는다');
});

test('같은 계정의 보임 동기화는 겹쳐 돌지 않는다 — 조회가 연달아 와도 최대 두 번(#1163 판정)', async () => {
  const h = await setup({ failFirstUpdate: true });
  const tree = treeWithMoments(3);
  await h.workspace.write(principal('alice'), { state: { version: 1, trees: [tree] }, expectedRevision: 0, clientKey: 'seed-busy' });
  await h.shareService.waitForShowSync();
  assert.equal(await h.pendingShowSync.has({ productId: PRODUCT, subjectId: 'alice' }), true, '표식이 남은 상태에서 본다');
  const before = h.listCalls();
  for (let i = 0; i < 5; i += 1) await h.workspace.read(principal('alice'));
  await h.shareService.waitForShowSync();
  const runs = h.listCalls() - before;
  assert.ok(runs <= 2, `같은 계정의 보임 동기화는 최대 두 번 돈다 — ${runs}번(list 호출 수)`);
});
